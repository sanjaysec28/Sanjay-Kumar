import React, { useEffect, useState, useMemo, useRef } from 'react';
import {
  Images,
  Plus,
  Search,
  CheckCircle2,
  XCircle,
  Edit2,
  Trash2,
  Eye,
  AlertTriangle,
  X,
  ChevronDown,
  AlertCircle,
  ExternalLink,
  Sparkles,
  ArrowUp,
  ArrowDown,
  UploadCloud,
  FileImage,
  SlidersHorizontal,
  Settings2,
  Check,
  RefreshCw,
  Hash,
  Globe,
  Layers,
  ArrowUpDown,
} from 'lucide-react';
import {
  collection,
  doc,
  onSnapshot,
  updateDoc,
  deleteDoc,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { COLLECTIONS } from '../../firebase/collections';
import { useAuth } from '../../context/AuthContext';
import { useRouter } from '../../router/Router';
import { Card, CardHeader, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/common/EmptyState';
import { PermissionGate } from '../../components/auth/PermissionGate';
import {
  normalizeGalleryItem,
  type NormalizedGalleryItem,
} from '../../firebase/types';
import {
  uploadImageToCloudinary,
  validateImageFile,
  getCloudinaryConfig,
  setCloudinaryConfig,
  getOptimizedImageUrl,
  ALLOWED_IMAGE_TYPES,
  type CloudinaryConfig,
} from '../../services/cloudinary';

const PREDEFINED_CATEGORIES = [
  'Hair Styling',
  'Hair Coloring & Balayage',
  'Bridal & Occasion',
  'Skin & Facial Rituals',
  'Spa & Wellness',
  'Nail Art & Care',
  'Men’s Grooming',
  'Salon Sanctuary',
];

export const GalleryPage: React.FC = () => {
  const { hasPermission, role, user, userProfile } = useAuth();
  const { navigate } = useRouter();

  const canCreate = hasPermission('gallery.create');
  const canUpdate = hasPermission('gallery.update');
  const canDelete = hasPermission('gallery.delete');

  // Gallery Data State
  const [galleryItems, setGalleryItems] = useState<NormalizedGalleryItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedPublished, setSelectedPublished] = useState<'all' | 'published' | 'draft'>('all');
  const [selectedFeatured, setSelectedFeatured] = useState<'all' | 'featured'>('all');
  const [sortBy, setSortBy] = useState<'order' | 'newest' | 'title'>('order');

  // Modal States
  const [isFormOpen, setIsFormOpen] = useState<boolean>(false);
  const [editingItem, setEditingItem] = useState<NormalizedGalleryItem | null>(null);
  const [detailsItem, setDetailsItem] = useState<NormalizedGalleryItem | null>(null);
  const [isConfigOpen, setIsConfigOpen] = useState<boolean>(false);

  // Confirmation Modal
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    item: NormalizedGalleryItem | null;
  }>({
    isOpen: false,
    item: null,
  });

  // Cloudinary Config State
  const [cldConfig, setCldConfig] = useState<CloudinaryConfig>(getCloudinaryConfig());
  const [cldConfigDraft, setCldConfigDraft] = useState<CloudinaryConfig>(getCloudinaryConfig());

  // Form Field State
  const [formMode, setFormMode] = useState<'upload' | 'url'>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isUploading, setIsUploading] = useState<boolean>(false);

  const [formData, setFormData] = useState({
    title: '',
    caption: '',
    category: PREDEFINED_CATEGORIES[0],
    customCategory: '',
    imageUrl: '',
    cloudinaryPublicId: '',
    altText: '',
    isPublished: true,
    featured: false,
    displayOrder: 0,
    width: 0,
    height: 0,
    format: '',
    bytes: 0,
  });

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // 1. Real-time subscription to Firestore `gallery` collection
  useEffect(() => {
    if (!db) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const galleryColRef = collection(db, COLLECTIONS.GALLERY);
    const unsubscribe = onSnapshot(
      galleryColRef,
      (snapshot) => {
        const loaded: NormalizedGalleryItem[] = [];
        snapshot.forEach((docSnap) => {
          loaded.push(normalizeGalleryItem(docSnap.id, docSnap.data()));
        });
        setGalleryItems(loaded);
        setLoading(false);
      },
      (err) => {
        console.warn('Notice listening to gallery collection:', err.message);
        setError('Unable to load gallery from database.');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Compute unique categories present in loaded data + predefined
  const availableCategories = useMemo(() => {
    const set = new Set<string>(PREDEFINED_CATEGORIES);
    galleryItems.forEach((g) => {
      if (g.category && g.category.trim()) {
        set.add(g.category.trim());
      }
    });
    return Array.from(set).sort();
  }, [galleryItems]);

  // Client-side filtering & sorting
  const filteredItems = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const result = galleryItems.filter((item) => {
      const matchesSearch =
        !q ||
        item.title.toLowerCase().includes(q) ||
        item.caption.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        (item.cloudinaryPublicId && item.cloudinaryPublicId.toLowerCase().includes(q));

      const matchesCategory =
        selectedCategory === 'all' || item.category === selectedCategory;

      const matchesPublished =
        selectedPublished === 'all' ||
        (selectedPublished === 'published' && item.isPublished) ||
        (selectedPublished === 'draft' && !item.isPublished);

      const matchesFeatured =
        selectedFeatured === 'all' ||
        (selectedFeatured === 'featured' && item.featured);

      return matchesSearch && matchesCategory && matchesPublished && matchesFeatured;
    });

    // Sorting
    result.sort((a, b) => {
      if (sortBy === 'order') {
        if (a.displayOrder !== b.displayOrder) {
          return a.displayOrder - b.displayOrder;
        }
        return (a.order || 0) - (b.order || 0);
      }
      if (sortBy === 'newest') {
        const aTime = a.createdAt ? new Date(a.createdAt as string).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt as string).getTime() : 0;
        return bTime - aTime;
      }
      if (sortBy === 'title') {
        return a.title.localeCompare(b.title);
      }
      return 0;
    });

    return result;
  }, [galleryItems, searchQuery, selectedCategory, selectedPublished, selectedFeatured, sortBy]);

  // Summary Metrics
  const metrics = useMemo(() => {
    const total = galleryItems.length;
    const published = galleryItems.filter((i) => i.isPublished).length;
    const drafts = total - published;
    const featured = galleryItems.filter((i) => i.featured).length;
    const uniqueCategories = new Set(galleryItems.map((i) => i.category)).size;

    return { total, published, drafts, featured, uniqueCategories };
  }, [galleryItems]);

  // Open Add Modal
  const handleOpenAdd = () => {
    setEditingItem(null);
    setSelectedFile(null);
    setFilePreview(null);
    setUploadProgress(0);
    setFormMode('upload');

    // Default next order to max order + 1
    const maxOrder = galleryItems.reduce((max, it) => Math.max(max, it.displayOrder ?? 0), -1);
    const nextOrder = maxOrder >= 0 ? maxOrder + 1 : 0;

    setFormData({
      title: '',
      caption: '',
      category: PREDEFINED_CATEGORIES[0],
      customCategory: '',
      imageUrl: '',
      cloudinaryPublicId: '',
      altText: '',
      isPublished: true,
      featured: false,
      displayOrder: nextOrder,
      width: 0,
      height: 0,
      format: '',
      bytes: 0,
    });
    setFormErrors({});
    setIsFormOpen(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (item: NormalizedGalleryItem) => {
    setEditingItem(item);
    setSelectedFile(null);
    setFilePreview(item.imageUrl);
    setUploadProgress(0);
    setFormMode('url');

    const isCustom = !PREDEFINED_CATEGORIES.includes(item.category);

    setFormData({
      title: item.title,
      caption: item.caption,
      category: isCustom ? '__custom__' : item.category,
      customCategory: isCustom ? item.category : '',
      imageUrl: item.imageUrl,
      cloudinaryPublicId: item.cloudinaryPublicId || '',
      altText: item.altText || '',
      isPublished: item.isPublished,
      featured: item.featured,
      displayOrder: item.displayOrder ?? item.order ?? 0,
      width: item.width || 0,
      height: item.height || 0,
      format: item.format || '',
      bytes: item.bytes || 0,
    });
    setFormErrors({});
    setIsFormOpen(true);
  };

  // Handle File Picker Change
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateImageFile(file);
    if (!validation.valid) {
      setFormErrors((prev) => ({ ...prev, file: validation.error || 'Invalid file.' }));
      return;
    }

    setFormErrors((prev) => {
      const copy = { ...prev };
      delete copy.file;
      delete copy.imageUrl;
      return copy;
    });

    setSelectedFile(file);

    // If title is empty, suggest file name without extension
    if (!formData.title) {
      const suggested = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
      setFormData((prev) => ({
        ...prev,
        title: suggested.charAt(0).toUpperCase() + suggested.slice(1),
      }));
    }

    // Local object URL for instant preview
    const reader = new FileReader();
    reader.onload = () => {
      setFilePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Validate form
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.title.trim()) {
      errors.title = 'Title is required.';
    }

    const effectiveCategory =
      formData.category === '__custom__'
        ? formData.customCategory.trim()
        : formData.category;
    if (!effectiveCategory) {
      errors.category = 'Category is required.';
    }

    if (!editingItem && !selectedFile && !formData.imageUrl.trim()) {
      errors.file = 'Please select an image file to upload or provide an image URL.';
    }

    if (formData.displayOrder < 0) {
      errors.displayOrder = 'Display order cannot be negative.';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Submit Handler: Upload to Cloudinary then save to Firestore
  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm() || !db) return;

    setIsSubmitting(true);
    setError(null);

    const effectiveCategory =
      formData.category === '__custom__'
        ? formData.customCategory.trim()
        : formData.category;

    try {
      let finalImageUrl = formData.imageUrl.trim();
      let finalPublicId = formData.cloudinaryPublicId.trim();
      let finalWidth = formData.width;
      let finalHeight = formData.height;
      let finalFormat = formData.format;
      let finalBytes = formData.bytes;

      // If user selected a new file, upload it directly to Cloudinary
      if (selectedFile) {
        setIsUploading(true);
        setUploadProgress(10);

        const uploadResult = await uploadImageToCloudinary(selectedFile, {
          folder: 'musha_empire/gallery',
          tags: ['musha_empire', 'lookbook', effectiveCategory.toLowerCase().replace(/\s+/g, '_')],
          onProgress: (percent) => {
            setUploadProgress(percent);
          },
        });

        finalImageUrl = uploadResult.secureUrl;
        finalPublicId = uploadResult.publicId;
        finalWidth = uploadResult.width;
        finalHeight = uploadResult.height;
        finalFormat = uploadResult.format;
        finalBytes = uploadResult.bytes;
        setIsUploading(false);
      }

      if (!finalImageUrl) {
        throw new Error('Image URL is required after upload.');
      }

      const orderNum = Number(formData.displayOrder) || 0;
      const staffUser = user?.email || userProfile?.displayName || user?.uid || 'staff';

      const payload = {
        title: formData.title.trim(),
        name: formData.title.trim(),
        caption: formData.caption.trim(),
        description: formData.caption.trim(),
        category: effectiveCategory,
        image_url: finalImageUrl,
        imageUrl: finalImageUrl,
        cloudinary_public_id: finalPublicId || null,
        cloudinaryPublicId: finalPublicId || null,
        public_id: finalPublicId || null,
        publicId: finalPublicId || null,
        alt_text: formData.altText.trim() || formData.title.trim(),
        altText: formData.altText.trim() || formData.title.trim(),
        active: Boolean(formData.isPublished),
        published: Boolean(formData.isPublished),
        isPublished: Boolean(formData.isPublished),
        featured: Boolean(formData.featured),
        sort_order: orderNum,
        order: orderNum,
        display_order: orderNum,
        displayOrder: orderNum,
        width: finalWidth || null,
        height: finalHeight || null,
        format: finalFormat || null,
        bytes: finalBytes || null,
        uploaded_by: staffUser,
        uploadedBy: staffUser,
        updated_at: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      if (editingItem) {
        // Edit existing doc
        const itemDocRef = doc(db, COLLECTIONS.GALLERY, editingItem.id);
        await updateDoc(itemDocRef, {
          ...editingItem.raw,
          ...payload,
          created_at: editingItem.raw.created_at || editingItem.createdAt || new Date().toISOString(),
        });
        showSuccess(`Gallery item "${payload.title}" updated.`);
      } else {
        // Create new item in Firestore
        const newPayload = {
          ...payload,
          created_at: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        };
        const galleryColRef = collection(db, COLLECTIONS.GALLERY);
        await addDoc(galleryColRef, newPayload);
        showSuccess(`Gallery item "${payload.title}" published to lookbook.`);
      }

      setIsFormOpen(false);
      setEditingItem(null);
      setSelectedFile(null);
      setFilePreview(null);
    } catch (err: unknown) {
      console.error('Error saving gallery item:', err);
      const msg = err instanceof Error ? err.message : 'Unable to save gallery item.';
      setError(msg);
    } finally {
      setIsSubmitting(false);
      setIsUploading(false);
    }
  };

  // Reorder Handler: Move Up / Down
  const handleReorder = async (item: NormalizedGalleryItem, direction: 'up' | 'down') => {
    if (!canUpdate || !db) return;

    const currentOrder = item.displayOrder ?? 0;
    const targetOrder = direction === 'up' ? Math.max(0, currentOrder - 1) : currentOrder + 1;

    try {
      const itemDocRef = doc(db, COLLECTIONS.GALLERY, item.id);
      await updateDoc(itemDocRef, {
        displayOrder: targetOrder,
        display_order: targetOrder,
        order: targetOrder,
        sort_order: targetOrder,
        updated_at: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      showSuccess(`Order updated for "${item.title}".`);
    } catch (err: unknown) {
      console.error('Error reordering item:', err);
      setError('Failed to update display order.');
    }
  };

  // Toggle publish state
  const handleTogglePublished = async (item: NormalizedGalleryItem) => {
    if (!canUpdate || !db) return;
    try {
      const nextPublished = !item.isPublished;
      const itemDocRef = doc(db, COLLECTIONS.GALLERY, item.id);
      await updateDoc(itemDocRef, {
        active: nextPublished,
        published: nextPublished,
        isPublished: nextPublished,
        updated_at: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      showSuccess(`"${item.title}" ${nextPublished ? 'published live' : 'moved to drafts'}.`);
    } catch (err: unknown) {
      console.error('Error toggling gallery item published state:', err);
      setError('Failed to update published state.');
    }
  };

  // Toggle featured state
  const handleToggleFeatured = async (item: NormalizedGalleryItem) => {
    if (!canUpdate || !db) return;
    try {
      const nextFeatured = !item.featured;
      const itemDocRef = doc(db, COLLECTIONS.GALLERY, item.id);
      await updateDoc(itemDocRef, {
        featured: nextFeatured,
        updated_at: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      showSuccess(`"${item.title}" ${nextFeatured ? 'marked as featured' : 'unmarked from featured'}.`);
    } catch (err: unknown) {
      console.error('Error toggling featured state:', err);
      setError('Failed to update featured state.');
    }
  };

  // Execute Confirmed Delete: remove from Firestore & safely handle Cloudinary
  const handleExecuteDelete = async () => {
    const { item } = confirmModal;
    if (!item || !db) return;

    try {
      const itemDocRef = doc(db, COLLECTIONS.GALLERY, item.id);
      await deleteDoc(itemDocRef);
      showSuccess(`Gallery item "${item.title}" was permanently removed.`);
    } catch (err: unknown) {
      console.error('Error deleting gallery item:', err);
      setError('Unable to delete gallery item.');
    } finally {
      setConfirmModal({ isOpen: false, item: null });
    }
  };

  // Save Cloudinary configuration
  const handleSaveCldConfig = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cldConfigDraft.cloudName.trim() || !cldConfigDraft.uploadPreset.trim()) {
      setError('Cloud Name and Upload Preset are both required.');
      return;
    }
    setCloudinaryConfig(cldConfigDraft);
    setCldConfig(cldConfigDraft);
    setIsConfigOpen(false);
    showSuccess('Cloudinary media upload settings saved successfully.');
  };

  const showSuccess = (msg: string) => {
    setActionSuccess(msg);
    setTimeout(() => setActionSuccess(null), 4500);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16 font-sans">
      {/* 1. HEADER SECTION */}
      <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5 sm:p-6 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-[#B7791F] uppercase tracking-wider block">
                MUSHA EMPIRE ADMIN
              </span>
              <span className="text-[#9CA3AF]">•</span>
              <span className="text-[11px] font-semibold text-[#6B7280]">
                Cloudinary Connected
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-[#171513] tracking-tight mt-0.5">
              Gallery & Lookbook Management
            </h1>
            <p className="text-xs sm:text-sm text-[#6B7280] font-normal mt-1 max-w-2xl">
              Upload images directly to Cloudinary and curate the live lookbook displayed on the public customer website.
            </p>
          </div>

          {/* Action CTAs */}
          <div className="flex items-center flex-wrap gap-2.5 shrink-0">
            {/* View Live Public Gallery */}
            <button
              onClick={() => navigate('/gallery')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#E5E7EB] hover:border-[#B7791F] bg-[#FAFBFD] hover:bg-white text-xs font-semibold text-[#171513] shadow-xs transition-all cursor-pointer"
              title="Open customer-facing Live Gallery lookbook"
            >
              <Globe className="w-3.5 h-3.5 text-[#B7791F]" />
              <span>View Public Website Gallery</span>
              <ExternalLink className="w-3 h-3 text-[#9CA3AF]" />
            </button>

            {/* Cloudinary Settings button */}
            <button
              onClick={() => {
                setCldConfigDraft(cldConfig);
                setIsConfigOpen(true);
              }}
              className="p-2 rounded-xl border border-[#E5E7EB] text-[#6B7280] hover:text-[#171513] hover:bg-[#F3F4F6] transition-colors cursor-pointer"
              title="Configure Cloudinary Account & Upload Preset"
            >
              <Settings2 className="w-4 h-4" />
            </button>

            {/* Upload / Add Item */}
            <PermissionGate permission="gallery.create">
              <Button
                variant="gold"
                size="md"
                onClick={handleOpenAdd}
                leftIcon={<UploadCloud className="w-4 h-4" />}
                className="shadow-xs font-bold"
              >
                + Upload New Look
              </Button>
            </PermissionGate>
          </div>
        </div>

        {/* Success Alert */}
        {actionSuccess && (
          <div className="mt-4 p-3.5 rounded-xl bg-[#F0FDF4] border border-[#DCFCE7] flex items-center justify-between text-xs text-[#166534]">
            <div className="flex items-center gap-2 font-medium">
              <CheckCircle2 className="w-4 h-4 text-[#16A34A] shrink-0" />
              <span>{actionSuccess}</span>
            </div>
            <button
              onClick={() => setActionSuccess(null)}
              className="text-[#166534] hover:text-[#14532D] font-bold cursor-pointer ml-2"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="mt-4 p-3.5 rounded-xl bg-[#FEF2F2] border border-[#FEE2E2] flex items-center justify-between text-xs text-[#DC2626]">
            <div className="flex items-center gap-2 font-medium">
              <AlertCircle className="w-4 h-4 text-[#DC2626] shrink-0" />
              <span>{error}</span>
            </div>
            <button
              onClick={() => setError(null)}
              className="text-[#DC2626] hover:text-[#991B1B] font-bold cursor-pointer ml-2"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Summary Metrics Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-5 pt-4 border-t border-[#F3F4F6]">
          <div className="bg-[#FAFBFD] border border-[#E5E7EB] rounded-xl p-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280] block">
              Total Assets
            </span>
            <span className="text-xl font-bold text-[#171513] mt-0.5 block">
              {metrics.total}
            </span>
          </div>

          <div className="bg-[#FAFBFD] border border-[#E5E7EB] rounded-xl p-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#16A34A] block">
              Published Live
            </span>
            <span className="text-xl font-bold text-[#16A34A] mt-0.5 block">
              {metrics.published}
            </span>
          </div>

          <div className="bg-[#FAFBFD] border border-[#E5E7EB] rounded-xl p-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280] block">
              Drafts / Unlisted
            </span>
            <span className="text-xl font-bold text-[#6B7280] mt-0.5 block">
              {metrics.drafts}
            </span>
          </div>

          <div className="bg-[#FAFBFD] border border-[#E5E7EB] rounded-xl p-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#B7791F] block">
              Featured Items
            </span>
            <span className="text-xl font-bold text-[#B7791F] mt-0.5 block">
              {metrics.featured}
            </span>
          </div>

          <div className="bg-[#FAFBFD] border border-[#E5E7EB] rounded-xl p-3 col-span-2 sm:col-span-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280] block">
              Active Categories
            </span>
            <span className="text-xl font-bold text-[#171513] mt-0.5 block">
              {metrics.uniqueCategories}
            </span>
          </div>
        </div>
      </div>

      {/* 2. SEARCH & FILTER CONTROLS */}
      <Card>
        <CardContent className="p-4 sm:p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {/* Search Input */}
            <div className="relative lg:col-span-2">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#9CA3AF]">
                <Search className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search titles, captions, categories, Cloudinary IDs..."
                className="w-full pl-9 pr-8 py-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-xs text-[#171513] placeholder-[#9CA3AF] focus:outline-hidden focus:ring-2 focus:ring-[#B7791F]/30 focus:border-[#B7791F] focus:bg-white transition-all min-h-[40px]"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#9CA3AF] hover:text-[#171513]"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Category Filter */}
            <div className="relative">
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full px-3 py-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-xs font-semibold text-[#171513] focus:outline-hidden focus:ring-2 focus:ring-[#B7791F]/30 focus:border-[#B7791F] focus:bg-white appearance-none cursor-pointer min-h-[40px]"
              >
                <option value="all">All Categories ({galleryItems.length})</option>
                {availableCategories.map((cat) => {
                  const count = galleryItems.filter((i) => i.category === cat).length;
                  return (
                    <option key={cat} value={cat}>
                      {cat} ({count})
                    </option>
                  );
                })}
              </select>
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-[#6B7280]">
                <ChevronDown className="w-4 h-4" />
              </div>
            </div>

            {/* Published Status Filter */}
            <div className="relative">
              <select
                value={selectedPublished}
                onChange={(e) => setSelectedPublished(e.target.value as 'all' | 'published' | 'draft')}
                className="w-full px-3 py-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-xs font-semibold text-[#171513] focus:outline-hidden focus:ring-2 focus:ring-[#B7791F]/30 focus:border-[#B7791F] focus:bg-white appearance-none cursor-pointer min-h-[40px]"
              >
                <option value="all">All Publication States</option>
                <option value="published">Published Live Only</option>
                <option value="draft">Drafts Only</option>
              </select>
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-[#6B7280]">
                <ChevronDown className="w-4 h-4" />
              </div>
            </div>

            {/* Sort Order Selector */}
            <div className="relative">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'order' | 'newest' | 'title')}
                className="w-full px-3 py-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-xs font-semibold text-[#171513] focus:outline-hidden focus:ring-2 focus:ring-[#B7791F]/30 focus:border-[#B7791F] focus:bg-white appearance-none cursor-pointer min-h-[40px]"
              >
                <option value="order">Sort: Display Order (#)</option>
                <option value="newest">Sort: Newest Uploads</option>
                <option value="title">Sort: Title (A-Z)</option>
              </select>
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-[#6B7280]">
                <ArrowUpDown className="w-4 h-4" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 3. GALLERY MEDIA GRID */}
      <Card>
        <CardHeader
          title={`Portfolio Lookbook (${filteredItems.length})`}
          subtitle="Real-time media assets stored in Cloudinary and synchronized with the public customer website."
          action={
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-[#6B7280] hidden sm:inline">
                Cloud: <code className="font-mono text-[#B7791F] font-semibold">{cldConfig.cloudName}</code>
              </span>
            </div>
          }
        />
        <CardContent className="p-5">
          {loading ? (
            /* Skeleton Loading Grid */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <div key={i} className="rounded-xl border border-[#E5E7EB] p-3 space-y-3 animate-pulse">
                  <div className="w-full aspect-4/3 bg-[#E5E7EB] rounded-lg" />
                  <div className="h-4 bg-[#E5E7EB] rounded w-3/4" />
                  <div className="h-3 bg-[#E5E7EB] rounded w-1/2" />
                </div>
              ))}
            </div>
          ) : filteredItems.length === 0 ? (
            galleryItems.length === 0 ? (
              <EmptyState
                title="No gallery items in lookbook"
                description="Upload and organize your salon lookbook photos, hairstyle transformations, bridal elegance, and salon ambiance."
                icon={<Images className="w-6 h-6 text-[#B7791F]" />}
                action={
                  canCreate ? (
                    <Button variant="gold" size="sm" onClick={handleOpenAdd} leftIcon={<UploadCloud className="w-3.5 h-3.5" />}>
                      Upload First Look
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <EmptyState
                title="No matching gallery items"
                description="Try selecting different categories or clearing your search term."
                icon={<Search className="w-6 h-6 text-[#6B7280]" />}
                action={
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSearchQuery('');
                      setSelectedCategory('all');
                      setSelectedPublished('all');
                      setSelectedFeatured('all');
                      setSortBy('order');
                    }}
                  >
                    Reset Filters
                  </Button>
                }
              />
            )
          ) : (
            /* Visual Grid with Reordering & Quick Controls */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredItems.map((item) => {
                const optimizedThumbnail = getOptimizedImageUrl(item.imageUrl, {
                  width: 500,
                  quality: 'auto',
                });

                return (
                  <div
                    key={item.id}
                    className="rounded-xl border border-[#E5E7EB] bg-white overflow-hidden shadow-xs hover:border-[#D6A84F] hover:shadow-[0_4px_16px_0_rgba(0,0,0,0.06)] transition-all flex flex-col justify-between"
                  >
                    {/* Top Image Preview */}
                    <div>
                      <div className="relative aspect-4/3 w-full bg-[#F3F4F6] overflow-hidden group">
                        <img
                          src={optimizedThumbnail}
                          alt={item.altText || item.title}
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                          loading="lazy"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src =
                              'https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=600&q=80';
                          }}
                        />

                        {/* Top Badges overlay */}
                        <div className="absolute top-2 left-2 flex items-center gap-1.5 flex-wrap">
                          <Badge variant={item.isPublished ? 'success' : 'neutral'} className="text-[10px] px-1.5 py-0 shadow-xs">
                            {item.isPublished ? 'Published' : 'Draft'}
                          </Badge>
                          {item.featured && (
                            <Badge variant="gold" className="text-[10px] px-1.5 py-0 shadow-xs">
                              Featured
                            </Badge>
                          )}
                        </div>

                        {/* Display Order Badge & Reorder Arrows */}
                        <div className="absolute bottom-2 right-2 flex items-center gap-1">
                          <span className="px-2 py-0.5 rounded bg-black/70 text-white font-mono text-[11px] font-bold">
                            #{item.displayOrder ?? item.order ?? 0}
                          </span>

                          {canUpdate && (
                            <div className="flex flex-col bg-black/70 rounded overflow-hidden">
                              <button
                                onClick={() => handleReorder(item, 'up')}
                                title="Move display order up"
                                className="p-0.5 hover:bg-[#B7791F] text-white transition-colors cursor-pointer"
                              >
                                <ArrowUp className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => handleReorder(item, 'down')}
                                title="Move display order down"
                                className="p-0.5 hover:bg-[#B7791F] text-white transition-colors cursor-pointer"
                              >
                                <ArrowDown className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Card Content */}
                      <div className="p-3.5 space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-bold text-[#171513] text-sm truncate" title={item.title}>
                            {item.title}
                          </h3>
                          <span className="px-1.5 py-0.5 rounded bg-[#F7F8FA] border border-[#E5E7EB] text-[10px] text-[#4B5563] font-medium shrink-0">
                            {item.category}
                          </span>
                        </div>

                        {item.caption && (
                          <p className="text-xs text-[#6B7280] line-clamp-2 leading-relaxed">
                            {item.caption}
                          </p>
                        )}

                        {item.cloudinaryPublicId && (
                          <div className="pt-1 flex items-center gap-1 text-[10px] text-[#9CA3AF] truncate">
                            <span className="font-mono truncate">ID: {item.cloudinaryPublicId}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Card Actions Footer */}
                    <div className="p-3 pt-0 border-t border-[#F3F4F6] mt-2 flex items-center justify-between text-xs">
                      <button
                        onClick={() => setDetailsItem(item)}
                        className="text-[#6B7280] hover:text-[#171513] font-semibold flex items-center gap-1 text-[11px] cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Details</span>
                      </button>

                      <div className="flex items-center gap-1">
                        {/* Featured toggle */}
                        {canUpdate && (
                          <button
                            onClick={() => handleToggleFeatured(item)}
                            title={item.featured ? 'Unmark featured' : 'Mark featured in lookbook'}
                            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                              item.featured ? 'text-[#B7791F] bg-[#FEF9EE]' : 'text-[#9CA3AF] hover:text-[#171513]'
                            }`}
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {/* Edit button */}
                        {canUpdate && (
                          <button
                            onClick={() => handleOpenEdit(item)}
                            title="Edit gallery item"
                            className="p-1.5 rounded-lg text-[#B7791F] hover:bg-[#FEF9EE] transition-colors cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {/* Publish / Unpublish button */}
                        {canUpdate && (
                          <button
                            onClick={() => handleTogglePublished(item)}
                            title={item.isPublished ? 'Unpublish to Drafts' : 'Publish to customer website'}
                            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                              item.isPublished
                                ? 'text-[#DC2626] hover:bg-[#FEF2F2]'
                                : 'text-[#16A34A] hover:bg-[#F0FDF4]'
                            }`}
                          >
                            {item.isPublished ? (
                              <XCircle className="w-3.5 h-3.5" />
                            ) : (
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            )}
                          </button>
                        )}

                        {/* Delete button */}
                        {canDelete && (
                          <button
                            onClick={() => setConfirmModal({ isOpen: true, item })}
                            title="Delete gallery item"
                            className="p-1.5 rounded-lg text-[#DC2626] hover:bg-[#FEF2F2] transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 4. ADD / EDIT GALLERY ITEM MODAL */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#171513]/50 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-2xl max-w-lg w-full max-h-[92vh] flex flex-col my-auto">
            <div className="p-5 border-b border-[#E5E7EB] flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-[#B7791F] uppercase tracking-wider block">
                  Cloudinary Media Integration
                </span>
                <h3 className="text-base font-bold text-[#171513]">
                  {editingItem ? 'Edit Gallery Lookbook Item' : 'Upload New Lookbook Image'}
                </h3>
              </div>
              <button
                onClick={() => setIsFormOpen(false)}
                className="p-1 rounded-lg text-[#6B7280] hover:text-[#171513] hover:bg-[#F3F4F6] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveItem} className="p-5 space-y-4 overflow-y-auto flex-1">
              {/* Image Input Selection: Upload vs URL */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-[#171513]">
                    Lookbook Media <span className="text-[#DC2626]">*</span>
                  </label>
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setFormMode('upload')}
                      className={`px-2 py-0.5 rounded cursor-pointer ${
                        formMode === 'upload'
                          ? 'bg-[#FEF9EE] text-[#B7791F] font-bold'
                          : 'text-[#6B7280]'
                      }`}
                    >
                      File Upload
                    </button>
                    <span>|</span>
                    <button
                      type="button"
                      onClick={() => setFormMode('url')}
                      className={`px-2 py-0.5 rounded cursor-pointer ${
                        formMode === 'url'
                          ? 'bg-[#FEF9EE] text-[#B7791F] font-bold'
                          : 'text-[#6B7280]'
                      }`}
                    >
                      Image URL
                    </button>
                  </div>
                </div>

                {formMode === 'upload' ? (
                  <div className="space-y-2">
                    {/* Drag-and-Drop Area */}
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className="border-2 border-dashed border-[#D6A84F]/60 hover:border-[#B7791F] bg-[#FAFBFD] hover:bg-[#FEF9EE]/40 rounded-xl p-5 text-center cursor-pointer transition-all"
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept={ALLOWED_IMAGE_TYPES.join(',')}
                        onChange={handleFileChange}
                        className="hidden"
                      />

                      {filePreview ? (
                        <div className="space-y-2">
                          <img
                            src={filePreview}
                            alt="Selected lookbook preview"
                            className="max-h-40 mx-auto rounded-lg object-contain shadow-xs border border-[#E5E7EB]"
                          />
                          <p className="text-xs text-[#B7791F] font-semibold">
                            Click to change selected image
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          <div className="w-10 h-10 rounded-full bg-[#FEF9EE] text-[#B7791F] flex items-center justify-center mx-auto">
                            <UploadCloud className="w-5 h-5" />
                          </div>
                          <p className="text-xs font-bold text-[#171513]">
                            Click to browse or drop image file here
                          </p>
                          <p className="text-[11px] text-[#6B7280]">
                            JPEG, PNG, WebP, AVIF up to 10 MB
                          </p>
                        </div>
                      )}
                    </div>

                    {formErrors.file && (
                      <p className="text-[11px] text-[#DC2626]">{formErrors.file}</p>
                    )}
                  </div>
                ) : (
                  <div>
                    <input
                      type="url"
                      value={formData.imageUrl}
                      onChange={(e) => {
                        setFormData({ ...formData, imageUrl: e.target.value });
                        setFilePreview(e.target.value);
                      }}
                      placeholder="https://res.cloudinary.com/... or active image URL"
                      className="w-full px-3 py-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-xs text-[#171513]"
                    />
                    {filePreview && (
                      <div className="mt-2 aspect-video rounded-lg overflow-hidden bg-[#F3F4F6] border border-[#E5E7EB]">
                        <img
                          src={filePreview}
                          alt="Preview"
                          className="w-full h-full object-cover"
                          onError={() => setFilePreview(null)}
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Real-time upload progress bar */}
                {isUploading && (
                  <div className="mt-2 space-y-1">
                    <div className="flex justify-between text-[11px] text-[#B7791F] font-semibold">
                      <span>Uploading to Cloudinary...</span>
                      <span>{uploadProgress}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-[#E5E7EB] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#B7791F] transition-all duration-200"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Title */}
              <div>
                <label className="block text-xs font-semibold text-[#171513] mb-1">
                  Look Title / Style Name <span className="text-[#DC2626]">*</span>
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g. Royal Bridal Crown & Balayage"
                  required
                  className={`w-full px-3 py-2 bg-[#F9FAFB] border rounded-xl text-xs text-[#171513] focus:outline-hidden focus:ring-2 focus:ring-[#B7791F]/30 focus:border-[#B7791F] focus:bg-white transition-all ${
                    formErrors.title ? 'border-[#DC2626]' : 'border-[#E5E7EB]'
                  }`}
                />
                {formErrors.title && (
                  <p className="text-[11px] text-[#DC2626] mt-1">{formErrors.title}</p>
                )}
              </div>

              {/* Category & Display Order */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#171513] mb-1">
                    Category <span className="text-[#DC2626]">*</span>
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-3 py-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-xs font-semibold text-[#171513] focus:outline-hidden focus:ring-2 focus:ring-[#B7791F]/30 focus:border-[#B7791F] focus:bg-white transition-all cursor-pointer"
                  >
                    {availableCategories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                    <option value="__custom__">+ Enter New Category</option>
                  </select>

                  {formData.category === '__custom__' && (
                    <input
                      type="text"
                      value={formData.customCategory}
                      onChange={(e) => setFormData({ ...formData, customCategory: e.target.value })}
                      placeholder="Category name..."
                      className="w-full mt-2 px-3 py-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-xs text-[#171513]"
                    />
                  )}
                  {formErrors.category && (
                    <p className="text-[11px] text-[#DC2626] mt-1">{formErrors.category}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#171513] mb-1">
                    Display Order #
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.displayOrder}
                    onChange={(e) => setFormData({ ...formData, displayOrder: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-xs font-bold text-[#171513] focus:outline-hidden focus:ring-2 focus:ring-[#B7791F]/30 focus:border-[#B7791F] focus:bg-white"
                  />
                  <p className="text-[10px] text-[#6B7280] mt-0.5">Lower numbers appear first</p>
                </div>
              </div>

              {/* Caption */}
              <div>
                <label className="block text-xs font-semibold text-[#171513] mb-1">
                  Caption / Technique Details
                </label>
                <textarea
                  value={formData.caption}
                  onChange={(e) => setFormData({ ...formData, caption: e.target.value })}
                  rows={2}
                  placeholder="Bespoke color formulation, private suite styling, and finishing products used..."
                  className="w-full px-3 py-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-xs text-[#171513] focus:outline-hidden focus:ring-2 focus:ring-[#B7791F]/30 focus:border-[#B7791F] focus:bg-white resize-none"
                />
              </div>

              {/* Alt Text */}
              <div>
                <label className="block text-xs font-semibold text-[#171513] mb-1">
                  Alt Text (SEO & Accessibility)
                </label>
                <input
                  type="text"
                  value={formData.altText}
                  onChange={(e) => setFormData({ ...formData, altText: e.target.value })}
                  placeholder="e.g. Luxury bride balayage hair styling at Musha Empire salon suite"
                  className="w-full px-3 py-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-xs text-[#171513] focus:outline-hidden focus:ring-2 focus:ring-[#B7791F]/30 focus:border-[#B7791F] focus:bg-white"
                />
              </div>

              {/* Toggles */}
              <div className="pt-2 border-t border-[#F3F4F6] flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-[#171513]">
                  <input
                    type="checkbox"
                    checked={formData.isPublished}
                    onChange={(e) => setFormData({ ...formData, isPublished: e.target.checked })}
                    className="w-4 h-4 rounded text-[#B7791F] focus:ring-[#B7791F]"
                  />
                  <span>Publish to Customer Website</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-[#171513]">
                  <input
                    type="checkbox"
                    checked={formData.featured}
                    onChange={(e) => setFormData({ ...formData, featured: e.target.checked })}
                    className="w-4 h-4 rounded text-[#B7791F] focus:ring-[#B7791F]"
                  />
                  <span>Featured Lookbook</span>
                </label>
              </div>

              {/* Action Buttons */}
              <div className="pt-4 border-t border-[#E5E7EB] flex items-center justify-end gap-2.5">
                <Button
                  type="button"
                  variant="outline"
                  size="md"
                  onClick={() => setIsFormOpen(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="gold"
                  size="md"
                  isLoading={isSubmitting}
                  className="shadow-xs font-bold"
                >
                  {editingItem ? 'Save Changes' : 'Upload & Publish'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. GALLERY DETAILS MODAL */}
      {detailsItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#171513]/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-2xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-bold text-[#B7791F] uppercase tracking-wider">
                  Portfolio Asset
                </span>
                <h3 className="text-lg font-bold text-[#171513]">
                  {detailsItem.title}
                </h3>
              </div>
              <button
                onClick={() => setDetailsItem(null)}
                className="p-1 rounded-lg text-[#6B7280] hover:text-[#171513] hover:bg-[#F3F4F6] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Image Preview */}
            <div className="aspect-4/3 w-full rounded-xl overflow-hidden bg-[#F3F4F6] border border-[#E5E7EB]">
              <img
                src={detailsItem.imageUrl}
                alt={detailsItem.altText || detailsItem.title}
                className="w-full h-full object-cover"
              />
            </div>

            <div className="p-3 bg-[#FAFBFD] rounded-xl border border-[#E5E7EB] space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-[#F3F4F6]">
                <span className="text-[#6B7280]">Category:</span>
                <span className="font-semibold text-[#171513]">{detailsItem.category}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#F3F4F6]">
                <span className="text-[#6B7280]">Display Order:</span>
                <span className="font-mono font-bold text-[#171513]">#{detailsItem.displayOrder ?? detailsItem.order ?? 0}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#F3F4F6]">
                <span className="text-[#6B7280]">Status:</span>
                <Badge variant={detailsItem.isPublished ? 'success' : 'neutral'}>
                  {detailsItem.isPublished ? 'Published Live' : 'Draft Only'}
                </Badge>
              </div>
              <div className="flex justify-between py-1 border-b border-[#F3F4F6]">
                <span className="text-[#6B7280]">Featured:</span>
                <span className="font-semibold text-[#171513]">{detailsItem.featured ? 'Yes' : 'No'}</span>
              </div>
              {detailsItem.cloudinaryPublicId && (
                <div className="flex justify-between py-1 border-b border-[#F3F4F6]">
                  <span className="text-[#6B7280]">Cloudinary Public ID:</span>
                  <span className="font-mono text-[11px] text-[#171513] truncate max-w-[180px]">
                    {detailsItem.cloudinaryPublicId}
                  </span>
                </div>
              )}
              {detailsItem.uploadedBy && (
                <div className="flex justify-between py-1">
                  <span className="text-[#6B7280]">Uploaded By:</span>
                  <span className="font-medium text-[#171513] truncate max-w-[180px]">
                    {detailsItem.uploadedBy}
                  </span>
                </div>
              )}
            </div>

            {detailsItem.caption && (
              <div>
                <h4 className="text-xs font-semibold text-[#171513] mb-1">Caption:</h4>
                <p className="text-xs text-[#4B5563] leading-relaxed bg-[#F9FAFB] p-2.5 rounded-lg border border-[#E5E7EB]">
                  {detailsItem.caption}
                </p>
              </div>
            )}

            <div className="pt-2 flex gap-2">
              {canUpdate && (
                <Button
                  variant="gold"
                  size="sm"
                  onClick={() => {
                    const item = detailsItem;
                    setDetailsItem(null);
                    handleOpenEdit(item);
                  }}
                  leftIcon={<Edit2 className="w-3.5 h-3.5" />}
                  className="flex-1"
                >
                  Edit Item
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDetailsItem(null)}
                className="flex-1"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 6. CLOUDINARY CONFIGURATION MODAL */}
      {isConfigOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#171513]/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-[#B7791F] uppercase tracking-wider block">
                  Media Settings
                </span>
                <h3 className="text-base font-bold text-[#171513]">
                  Cloudinary Configuration
                </h3>
              </div>
              <button
                onClick={() => setIsConfigOpen(false)}
                className="p-1 rounded-lg text-[#6B7280] hover:text-[#171513] hover:bg-[#F3F4F6] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-[#6B7280] leading-relaxed">
              Configure your Cloudinary Cloud Name and Unsigned Upload Preset. Direct browser uploads utilize this preset to upload securely without exposing your API Secret.
            </p>

            <form onSubmit={handleSaveCldConfig} className="space-y-3 pt-1">
              <div>
                <label className="block text-xs font-semibold text-[#171513] mb-1">
                  Cloud Name <span className="text-[#DC2626]">*</span>
                </label>
                <input
                  type="text"
                  value={cldConfigDraft.cloudName}
                  onChange={(e) =>
                    setCldConfigDraft({ ...cldConfigDraft, cloudName: e.target.value.trim() })
                  }
                  placeholder="e.g. musha-empire"
                  required
                  className="w-full px-3 py-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-xs font-mono text-[#171513]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#171513] mb-1">
                  Upload Preset (Unsigned) <span className="text-[#DC2626]">*</span>
                </label>
                <input
                  type="text"
                  value={cldConfigDraft.uploadPreset}
                  onChange={(e) =>
                    setCldConfigDraft({ ...cldConfigDraft, uploadPreset: e.target.value.trim() })
                  }
                  placeholder="e.g. musha_gallery"
                  required
                  className="w-full px-3 py-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-xs font-mono text-[#171513]"
                />
              </div>

              <div className="p-3 bg-[#FAFBFD] rounded-xl border border-[#E5E7EB] text-[11px] text-[#6B7280] space-y-1">
                <p>• In Cloudinary Console: Settings → Upload → Upload Presets</p>
                <p>• Set Signing Mode to: <strong>Unsigned</strong></p>
                <p>• Folder can be left as default or: <code>musha_empire/gallery</code></p>
              </div>

              <div className="pt-3 flex gap-2 justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="md"
                  onClick={() => setIsConfigOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="gold" size="md">
                  Save Configuration
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 7. CONFIRMATION DELETE MODAL */}
      {confirmModal.isOpen && confirmModal.item && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#171513]/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-2xl max-w-md w-full p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-[#FEF2F2] text-[#DC2626] flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-base font-bold text-[#171513]">
                Delete Gallery Item?
              </h3>
              <p className="text-xs text-[#6B7280] mt-1 font-semibold">
                &quot;{confirmModal.item.title}&quot;
              </p>
            </div>

            {confirmModal.item.imageUrl && (
              <div className="w-24 h-24 mx-auto rounded-xl overflow-hidden border border-[#E5E7EB] bg-[#F3F4F6]">
                <img
                  src={confirmModal.item.imageUrl}
                  alt={confirmModal.item.title}
                  className="w-full h-full object-cover"
                />
              </div>
            )}

            <p className="text-xs text-[#4B5563] leading-relaxed">
              This will permanently remove the media asset from the customer website lookbook and Firestore database.
            </p>

            <div className="flex gap-2.5 pt-2">
              <Button
                variant="outline"
                size="md"
                onClick={() => setConfirmModal({ isOpen: false, item: null })}
                className="flex-1 justify-center"
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="md"
                onClick={handleExecuteDelete}
                className="flex-1 justify-center"
              >
                Confirm Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
