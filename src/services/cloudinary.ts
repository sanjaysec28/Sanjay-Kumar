/**
 * Musha Empire — Cloudinary Media Upload & Optimization Service
 * Secure client-side uploads using Cloudinary's unsigned upload API.
 * Never exposes Cloudinary API secret in client code.
 */

export interface CloudinaryConfig {
  cloudName: string;
  uploadPreset: string;
}

export interface CloudinaryUploadResult {
  secureUrl: string;
  publicId: string;
  width: number;
  height: number;
  format: string;
  bytes: number;
  createdAt: string;
}

// Local storage key for runtime Cloudinary configuration overrides
const CONFIG_STORAGE_KEY = 'musha_cloudinary_config';

/**
 * Get active Cloudinary configuration.
 * Priority: localStorage override > VITE_CLOUDINARY_* env vars > default fallbacks.
 */
export function getCloudinaryConfig(): CloudinaryConfig {
  const env =
    typeof import.meta !== 'undefined' && import.meta.env
      ? import.meta.env
      : ((process.env as Record<string, string | undefined>) || {});

  let stored: Partial<CloudinaryConfig> = {};
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (raw) {
      stored = JSON.parse(raw);
    }
  } catch {
    // ignore localStorage errors
  }

  const cloudName =
    stored.cloudName ||
    env.VITE_CLOUDINARY_CLOUD_NAME ||
    'musha-empire';

  const uploadPreset =
    stored.uploadPreset ||
    env.VITE_CLOUDINARY_UPLOAD_PRESET ||
    'musha_gallery';

  return { cloudName, uploadPreset };
}

/**
 * Save runtime Cloudinary configuration overrides.
 */
export function setCloudinaryConfig(config: CloudinaryConfig): void {
  try {
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch (err) {
    console.warn('Failed to persist Cloudinary config to localStorage:', err);
  }
}

/**
 * Validate image file type and size.
 * Allowed: JPEG, PNG, WebP, GIF, AVIF.
 * Max size: 10MB.
 */
export const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
];

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

export function validateImageFile(file: File): { valid: boolean; error?: string } {
  if (!file) {
    return { valid: false, error: 'No file provided.' };
  }

  if (!ALLOWED_IMAGE_TYPES.includes(file.type.toLowerCase())) {
    return {
      valid: false,
      error: 'Invalid file type. Supported formats: JPEG, PNG, WebP, GIF, AVIF.',
    };
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    const mbSize = (file.size / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `File size (${mbSize} MB) exceeds maximum allowed limit of 10 MB.`,
    };
  }

  return { valid: true };
}

/**
 * Upload an image file directly to Cloudinary using an unsigned upload preset.
 * Reports real-time upload progress (0-100%).
 */
export function uploadImageToCloudinary(
  file: File,
  options?: {
    folder?: string;
    tags?: string[];
    onProgress?: (percent: number) => void;
  }
): Promise<CloudinaryUploadResult> {
  return new Promise((resolve, reject) => {
    const validation = validateImageFile(file);
    if (!validation.valid) {
      return reject(new Error(validation.error));
    }

    const { cloudName, uploadPreset } = getCloudinaryConfig();

    if (!cloudName || !uploadPreset) {
      return reject(
        new Error(
          'Cloudinary configuration is incomplete. Please set Cloud Name and Upload Preset.'
        )
      );
    }

    const url = `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/upload`;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', uploadPreset);

    if (options?.folder) {
      formData.append('folder', options.folder);
    } else {
      formData.append('folder', 'musha_empire/gallery');
    }

    if (options?.tags && options.tags.length > 0) {
      formData.append('tags', options.tags.join(','));
    }

    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);

    if (xhr.upload && options?.onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          options.onProgress?.(percent);
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const res = JSON.parse(xhr.responseText);
          resolve({
            secureUrl: res.secure_url || res.url,
            publicId: res.public_id,
            width: res.width || 0,
            height: res.height || 0,
            format: res.format || '',
            bytes: res.bytes || 0,
            createdAt: res.created_at || new Date().toISOString(),
          });
        } catch {
          reject(new Error('Failed to parse Cloudinary response.'));
        }
      } else {
        try {
          const errorRes = JSON.parse(xhr.responseText);
          const errorMsg =
            errorRes?.error?.message ||
            `Cloudinary upload failed with HTTP status ${xhr.status}`;
          reject(new Error(errorMsg));
        } catch {
          reject(
            new Error(
              `Cloudinary upload failed with HTTP status ${xhr.status}: ${xhr.statusText}`
            )
          );
        }
      }
    };

    xhr.onerror = () => {
      reject(
        new Error(
          'Network error occurred while uploading to Cloudinary. Please check your internet connection.'
        )
      );
    };

    xhr.send(formData);
  });
}

/**
 * Generate an optimized Cloudinary delivery URL with automatic format and quality.
 */
export function getOptimizedImageUrl(
  url: string,
  options?: {
    width?: number;
    height?: number;
    crop?: 'fill' | 'fit' | 'thumb' | 'limit';
    quality?: 'auto' | number;
  }
): string {
  if (!url || !url.includes('res.cloudinary.com')) {
    return url;
  }

  const parts = url.split('/upload/');
  if (parts.length !== 2) {
    return url;
  }

  const transforms: string[] = ['f_auto'];
  transforms.push(options?.quality ? `q_${options.quality}` : 'q_auto');

  if (options?.width) {
    transforms.push(`w_${options.width}`);
  }
  if (options?.height) {
    transforms.push(`h_${options.height}`);
  }
  if (options?.crop) {
    transforms.push(`c_${options.crop}`);
  }

  return `${parts[0]}/upload/${transforms.join(',')}/${parts[1]}`;
}
