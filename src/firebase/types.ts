/**
 * Musha Empire Shared Schema and Role Type Definitions
 * Matches the existing Firebase project schema used by the customer app.
 */

export type UserRole =
  | 'admin'
  | 'manager'
  | 'receptionist'
  | 'stylist'
  | 'cashier'
  | 'customer';

export const ADMIN_AUTHORIZED_ROLES: UserRole[] = [
  'admin',
  'manager',
  'receptionist',
  'stylist',
  'cashier',
];

/**
 * Checks whether a given role is allowed to enter the Admin Portal.
 * Customers are strictly prohibited.
 */
export function isAuthorizedAdminRole(role?: string | null): boolean {
  if (!role) return false;
  return ADMIN_AUTHORIZED_ROLES.includes(role as UserRole);
}

/**
 * Checks whether a role has super-admin level privileges.
 */
export function isSuperAdmin(role?: string | null): boolean {
  return role === 'admin';
}

// User Document (users/{uid})
export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  phoneNumber?: string;
  role: UserRole;
  createdAt?: string | number | { seconds: number; nanoseconds: number };
  updatedAt?: string | number | { seconds: number; nanoseconds: number };
  status?: 'active' | 'suspended' | 'pending';
  notes?: string;
  avatarUrl?: string;
  lastSignInTime?: string | number | { seconds: number; nanoseconds: number };
  last_sign_in?: string | number | { seconds: number; nanoseconds: number };
  department?: string;
  specialization?: string[];
}

// Services Document (services/{id}) matching customer app and Cloud Functions
export interface ServiceItem {
  id: string;
  name: string;
  description: string;
  category: string;
  gender?: string;
  duration_minutes?: number;
  durationMinutes?: number;
  price: number;
  active?: boolean;
  isActive?: boolean;
  status?: string;
  image_url?: string;
  imageUrl?: string;
  featured?: boolean;
  created_at?: unknown;
  createdAt?: unknown;
  updated_at?: unknown;
  updatedAt?: unknown;
  [key: string]: unknown;
}

export interface NormalizedService {
  id: string;
  name: string;
  description: string;
  category: string;
  gender: string;
  durationMinutes: number;
  price: number;
  isActive: boolean;
  imageUrl?: string;
  featured: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
  raw: Record<string, unknown>;
}

export const VALID_DURATIONS = [30, 60, 90, 120] as const;
export type ValidDuration = (typeof VALID_DURATIONS)[number];

export const VALID_GENDERS = ['Women', 'Men', 'Other', 'All'] as const;
export type ValidGender = (typeof VALID_GENDERS)[number];

export function normalizeService(id: string, data: Record<string, any>): NormalizedService {
  const isActive =
    data.active !== undefined
      ? Boolean(data.active)
      : data.isActive !== undefined
      ? Boolean(data.isActive)
      : data.status !== undefined
      ? data.status === 'active'
      : true;

  const duration =
    data.duration_minutes != null
      ? Number(data.duration_minutes)
      : data.durationMinutes != null
      ? Number(data.durationMinutes)
      : 60;

  return {
    id,
    name: data.name || 'Untitled Service',
    description: data.description || '',
    category: data.category || 'General',
    gender: data.gender || 'Women',
    durationMinutes: Number(duration) || 60,
    price: Number(data.price ?? 0),
    isActive,
    imageUrl: data.image_url || data.imageUrl || data.mediaUrl || '',
    featured: Boolean(data.featured),
    createdAt: data.created_at || data.createdAt || null,
    updatedAt: data.updated_at || data.updatedAt || null,
    raw: data,
  };
}

// Offers Document (offers/{id}) matching customer app and Firestore
export interface OfferItem {
  id: string;
  title?: string;
  name?: string;
  description?: string;
  discount?: number;
  discount_percentage?: number;
  discountPercentage?: number;
  discount_amount?: number;
  discountAmount?: number;
  discount_type?: 'percentage' | 'fixed' | string;
  discountType?: 'percentage' | 'fixed' | string;
  promo_code?: string;
  promoCode?: string;
  code?: string;
  valid_from?: string;
  validFrom?: string;
  valid_until?: string;
  validUntil?: string;
  active?: boolean;
  isActive?: boolean;
  featured?: boolean;
  terms?: string;
  created_at?: unknown;
  createdAt?: unknown;
  updated_at?: unknown;
  updatedAt?: unknown;
  [key: string]: unknown;
}

export interface NormalizedOffer {
  id: string;
  title: string;
  description: string;
  discount: number;
  discountType: 'percentage' | 'fixed';
  promoCode?: string;
  validFrom?: string;
  validUntil: string;
  isActive: boolean;
  featured: boolean;
  terms?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  validityState: 'active' | 'scheduled' | 'expired' | 'inactive';
  raw: Record<string, unknown>;
}

export function computeOfferValidity(
  validFrom: string | undefined,
  validUntil: string | undefined,
  isActive: boolean
): 'active' | 'scheduled' | 'expired' | 'inactive' {
  if (!isActive) return 'inactive';
  const today = new Date().toISOString().split('T')[0];
  if (validFrom && validFrom > today) {
    return 'scheduled';
  }
  if (validUntil && validUntil < today) {
    return 'expired';
  }
  return 'active';
}

export function normalizeOffer(id: string, data: Record<string, any>): NormalizedOffer {
  const title = data.title || data.name || 'Special Offer';
  const description = data.description || '';
  const promoCode = data.promo_code || data.promoCode || data.code || undefined;
  const validFrom = data.valid_from || data.validFrom || undefined;
  const validUntil = data.valid_until || data.validUntil || '';

  const isActive =
    data.active !== undefined
      ? Boolean(data.active)
      : data.isActive !== undefined
      ? Boolean(data.isActive)
      : true;

  const discountType: 'percentage' | 'fixed' =
    data.discount_type === 'fixed' || data.discountType === 'fixed' || data.discountAmount != null
      ? 'fixed'
      : 'percentage';

  const discount =
    data.discount != null
      ? Number(data.discount)
      : data.discount_percentage != null
      ? Number(data.discount_percentage)
      : data.discountPercentage != null
      ? Number(data.discountPercentage)
      : data.discount_amount != null
      ? Number(data.discount_amount)
      : data.discountAmount != null
      ? Number(data.discountAmount)
      : 0;

  const featured = Boolean(data.featured);
  const validityState = computeOfferValidity(validFrom, validUntil, isActive);

  return {
    id,
    title,
    description,
    discount,
    discountType,
    promoCode,
    validFrom,
    validUntil,
    isActive,
    featured,
    terms: data.terms || '',
    createdAt: data.created_at || data.createdAt || null,
    updatedAt: data.updated_at || data.updatedAt || null,
    validityState,
    raw: data,
  };
}

// Gallery Document (gallery/{id}) matching customer lookbook and media
export interface GalleryItem {
  id: string;
  title?: string;
  name?: string;
  caption?: string;
  category?: string;
  image_url?: string;
  imageUrl?: string;
  alt_text?: string;
  altText?: string;
  active?: boolean;
  published?: boolean;
  isPublished?: boolean;
  featured?: boolean;
  sort_order?: number;
  order?: number;
  created_at?: unknown;
  createdAt?: unknown;
  updated_at?: unknown;
  updatedAt?: unknown;
  [key: string]: unknown;
}

export interface NormalizedGalleryItem {
  id: string;
  title: string;
  caption: string;
  category: string;
  imageUrl: string;
  altText?: string;
  isPublished: boolean;
  featured: boolean;
  order: number;
  createdAt?: unknown;
  updatedAt?: unknown;
  raw: Record<string, unknown>;
}

export function normalizeGalleryItem(id: string, data: Record<string, any>): NormalizedGalleryItem {
  const isPublished =
    data.published !== undefined
      ? Boolean(data.published)
      : data.isPublished !== undefined
      ? Boolean(data.isPublished)
      : data.active !== undefined
      ? Boolean(data.active)
      : true;

  const order =
    data.sort_order != null
      ? Number(data.sort_order)
      : data.order != null
      ? Number(data.order)
      : 0;

  return {
    id,
    title: data.title || data.name || 'Untitled Showcase',
    caption: data.caption || data.description || '',
    category: data.category || 'Portfolio',
    imageUrl: data.image_url || data.imageUrl || '',
    altText: data.alt_text || data.altText || data.title || '',
    isPublished,
    featured: Boolean(data.featured),
    order,
    createdAt: data.created_at || data.createdAt || null,
    updatedAt: data.updated_at || data.updatedAt || null,
    raw: data,
  };
}

// Salon Settings Document (settings/salon or settings/{id})
export interface DayWorkingHours {
  open: string;
  close: string;
  isOpen: boolean;
}

export interface SalonSettings {
  id?: string;
  salonName?: string;
  name?: string;
  status?: string;
  operatingState?: string;
  phone?: string;
  email?: string;
  address?: string;
  timezone?: string;
  workingHours?: {
    [dayOfWeek: string]: DayWorkingHours;
  };
  slotDurationMinutes?: number;
  currency?: string;
  bookingAdvanceDays?: number;
  cancellationNoticeHours?: number;
  taxRatePercent?: number;
  updatedAt?: unknown;
  updatedBy?: string;
}

export const DAYS_OF_WEEK = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

export type DayOfWeek = (typeof DAYS_OF_WEEK)[number];

export const DEFAULT_SALON_SETTINGS: SalonSettings = {
  salonName: 'Musha Empire Luxury Salon & Spa',
  phone: '+91 98765 43210',
  email: 'concierge@mushaempire.com',
  address: 'Suite 401, Royal Heritage Avenue, Financial District, Hyderabad, India',
  timezone: 'Asia/Kolkata',
  currency: 'INR (₹)',
  slotDurationMinutes: 60,
  bookingAdvanceDays: 30,
  cancellationNoticeHours: 24,
  taxRatePercent: 18,
  status: 'active',
  operatingState: 'open',
  workingHours: {
    monday: { open: '09:00', close: '20:00', isOpen: true },
    tuesday: { open: '09:00', close: '20:00', isOpen: true },
    wednesday: { open: '09:00', close: '20:00', isOpen: true },
    thursday: { open: '09:00', close: '20:00', isOpen: true },
    friday: { open: '09:00', close: '21:00', isOpen: true },
    saturday: { open: '09:00', close: '21:00', isOpen: true },
    sunday: { open: '10:00', close: '18:00', isOpen: true },
  },
};

// Bookings Document (bookings/{id}) matching existing customer app schema
export interface BookingItem {
  id: string;
  customer_id?: string;
  customerId?: string;
  customer_name?: string;
  customerName?: string;
  customer_email?: string;
  customerEmail?: string;
  customer_phone?: string;
  customerPhone?: string;
  service_id?: string;
  serviceId?: string;
  service_name?: string;
  serviceName?: string;
  gender?: string;
  booking_date?: string;
  date?: string; // YYYY-MM-DD
  start_time?: string;
  end_time?: string;
  time?: string; // HH:MM
  duration_minutes?: number;
  durationMinutes?: number;
  price?: number;
  totalPrice?: number;
  status?: string;
  payment_status?: string;
  paymentStatus?: string;
  ticket_code?: string;
  bookingCode?: string;
  notes?: string;
  created_at?: unknown;
  createdAt?: unknown;
  updated_at?: unknown;
  updatedAt?: unknown;
}

export interface NormalizedBooking {
  id: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  serviceId: string;
  serviceName: string;
  gender?: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  endTime?: string;
  durationMinutes?: number;
  price: number;
  status: string; // 'confirmed' | 'pending' | 'completed' | 'cancelled'
  paymentStatus: string; // 'paid' | 'pending' | 'refunded'
  ticketCode?: string;
  notes?: string;
  cancellationReason?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  raw: Record<string, unknown>;
}

export interface CustomerSummary {
  uid: string;
  email: string;
  name: string;
  phone?: string;
  createdAt?: unknown;
  bookingCount: number;
  completedVisits: number;
  cancelledVisits: number;
  lifetimeSpend: number;
  lastBookingDate?: string;
}

export function normalizeBooking(id: string, data: Record<string, any>): NormalizedBooking {
  const serviceName =
    data.service_name ||
    data.serviceName ||
    data.category ||
    data.service ||
    'Concierge Service';

  const rawStatus =
    data.booking_status ||
    data.bookingStatus ||
    data.status ||
    'pending';

  return {
    id: id || data.id || data.bookingId || data.ticket_code || data.ticketCode || `req-${Math.random().toString(36).substring(2, 9)}`,
    customerId: data.customerId || data.customer_id || data.uid || data.userId || '',
    customerName: data.customerName || data.customer_name || data.name || data.clientName || 'Client',
    customerEmail: data.customer_email || data.customerEmail || data.email || '',
    customerPhone: data.customer_phone || data.customerPhone || data.phone || undefined,
    serviceId: data.service_id || data.serviceId || data.category || 'concierge',
    serviceName,
    gender: data.gender || undefined,
    date: data.booking_date || data.bookingDate || data.date || '',
    time: data.start_time || data.startTime || data.time || data.preferred_time || '',
    endTime: data.end_time || data.endTime || undefined,
    durationMinutes:
      data.duration_minutes != null
        ? Number(data.duration_minutes)
        : data.durationMinutes != null
        ? Number(data.durationMinutes)
        : undefined,
    price: Number(data.price ?? data.totalPrice ?? data.cost ?? 0),
    status: String(rawStatus).toLowerCase(),
    paymentStatus: (data.payment_status || data.paymentStatus || 'pending').toLowerCase(),
    ticketCode: data.ticket_code || data.ticketCode || data.bookingCode || data.code || '',
    notes: data.notes || data.special_requests || data.remarks || undefined,
    cancellationReason: data.cancellation_reason || data.cancellationReason || undefined,
    createdAt: data.created_at || data.createdAt,
    updatedAt: data.updated_at || data.updatedAt,
    raw: data,
  };
}

// Slots Document (slots/{id})
export interface TimeSlot {
  id: string;
  date: string;
  time: string;
  isAvailable: boolean;
  bookedByBookingId?: string;
}

// Tickets / Support / Internal Notes (tickets/{id})
export interface SupportTicket {
  id: string;
  bookingId?: string;
  customerId?: string;
  subject: string;
  message: string;
  status: 'open' | 'in-review' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high';
  createdAt?: unknown;
}

// ==========================================
// HOMEPAGE CMS SCHEMA DEFINITIONS
// ==========================================

export type HomepageSectionId =
  | 'hero'
  | 'trust'
  | 'services'
  | 'why_us'
  | 'gallery'
  | 'offers'
  | 'team'
  | 'membership'
  | 'testimonials'
  | 'faq'
  | 'booking_cta';

export interface HomepageSectionMeta {
  id: HomepageSectionId;
  name: string;
  enabled: boolean;
  order: number;
  description: string;
}

export interface HeroSectionConfig {
  eyebrow: string;
  headline: string;
  supportingText: string;
  primaryCtaLabel: string;
  primaryCtaDestination: string;
  secondaryCtaLabel?: string;
  secondaryCtaDestination?: string;
  desktopMedia: string;
  mobileMedia?: string;
  overlayOpacity?: number;
  enabled: boolean;
}

export interface TrustIndicatorItem {
  id: string;
  title: string;
  description: string;
}

export interface TrustSectionConfig {
  enabled: boolean;
  title: string;
  items: TrustIndicatorItem[];
}

export interface WhyUsItem {
  id: string;
  title: string;
  description: string;
}

export interface WhyUsSectionConfig {
  enabled: boolean;
  title: string;
  subtitle?: string;
  items: WhyUsItem[];
}

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
  active: boolean;
  order: number;
}

export interface FaqSectionConfig {
  enabled: boolean;
  title: string;
  items: FaqItem[];
}

export interface BookingCtaSectionConfig {
  enabled: boolean;
  eyebrow: string;
  headline: string;
  supportingText: string;
  ctaLabel: string;
  ctaDestination: string;
}

export interface BasicSectionConfig {
  enabled: boolean;
  title: string;
  subtitle?: string;
}

export interface HomepageConfig {
  version: number;
  isPublished: boolean;
  publishedAt?: string | null;
  updatedAt: string;
  updatedBy?: string;
  sections: HomepageSectionMeta[];
  hero: HeroSectionConfig;
  trustIndicators: TrustSectionConfig;
  whyUs: WhyUsSectionConfig;
  faq: FaqSectionConfig;
  bookingCta: BookingCtaSectionConfig;
  servicesSection: BasicSectionConfig;
  offersSection: BasicSectionConfig;
  gallerySection: BasicSectionConfig;
  teamSection: BasicSectionConfig;
  membershipSection: BasicSectionConfig;
  testimonialsSection: BasicSectionConfig;
}

export const DEFAULT_HOMEPAGE_SECTIONS: HomepageSectionMeta[] = [
  {
    id: 'hero',
    name: 'Hero Banner',
    enabled: true,
    order: 0,
    description: 'Main visual statement, brand headlines, and primary booking CTA.',
  },
  {
    id: 'trust',
    name: 'Brand & Trust Indicators',
    enabled: true,
    order: 1,
    description: 'Authentic salon standards, private suites, and hygiene positioning.',
  },
  {
    id: 'services',
    name: 'Featured Services',
    enabled: true,
    order: 2,
    description: 'Authoritative treatment catalog highlights pulled from Services CMS.',
  },
  {
    id: 'why_us',
    name: 'Why Choose Us',
    enabled: true,
    order: 3,
    description: 'Distinctive salon artistry and bespoke consultation pillars.',
  },
  {
    id: 'gallery',
    name: 'Lookbook & Portfolio',
    enabled: true,
    order: 4,
    description: 'Curated visual portfolio transformations from Gallery CMS.',
  },
  {
    id: 'offers',
    name: 'Exclusive Offers',
    enabled: true,
    order: 5,
    description: 'Active customer promotional campaigns and coupon codes.',
  },
  {
    id: 'team',
    name: 'Stylists & Artists',
    enabled: false,
    order: 6,
    description: 'Master stylists and beauty artists introduction (display only).',
  },
  {
    id: 'membership',
    name: 'Salon Membership',
    enabled: false,
    order: 7,
    description: 'Exclusive tier privileges and loyalty salon programs.',
  },
  {
    id: 'testimonials',
    name: 'Client Testimonials',
    enabled: false,
    order: 8,
    description: 'Real client feedback and reflections.',
  },
  {
    id: 'faq',
    name: 'Frequently Asked Questions',
    enabled: true,
    order: 9,
    description: 'Essential appointment policies, private suites, and client guidance.',
  },
  {
    id: 'booking_cta',
    name: 'Final Booking CTA',
    enabled: true,
    order: 10,
    description: 'High-conversion booking invitation leading to appointment scheduler.',
  },
];

export function createDefaultHomepageConfig(): HomepageConfig {
  return {
    version: 1,
    isPublished: true,
    publishedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    updatedBy: 'system',
    sections: DEFAULT_HOMEPAGE_SECTIONS,
    hero: {
      eyebrow: 'LUXURY SALON & WELLNESS',
      headline: 'Artistry in Every Detail, Luxury in Every Touch',
      supportingText:
        'Experience bespoke hair artistry, rejuvenating rituals, and private suites dedicated exclusively to your salon journey.',
      primaryCtaLabel: 'Book Appointment',
      primaryCtaDestination: '/book',
      secondaryCtaLabel: 'Explore Services',
      secondaryCtaDestination: '#services',
      desktopMedia:
        'https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=1600&q=80',
      mobileMedia:
        'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=800&q=80',
      overlayOpacity: 0.35,
      enabled: true,
    },
    trustIndicators: {
      enabled: true,
      title: 'The Musha Standard',
      items: [
        {
          id: 'trust-1',
          title: 'Private Suites',
          description:
            'Individual consultation and private styling suites dedicated to each patron.',
        },
        {
          id: 'trust-2',
          title: 'Master Practitioners',
          description:
            'Certified specialists utilizing world-class professional formulations.',
        },
        {
          id: 'trust-3',
          title: 'Hospital-Grade Hygiene',
          description:
            'Sterilized implements and pristine sanitized salon environment.',
        },
      ],
    },
    whyUs: {
      enabled: true,
      title: 'Why Choose Musha Empire',
      subtitle: 'Where master craftsmanship meets bespoke salon sanctuary',
      items: [
        {
          id: 'why-1',
          title: 'Bespoke Consultation',
          description:
            'Tailored hair, skin, and styling diagnosis before every service.',
        },
        {
          id: 'why-2',
          title: 'Premium Products',
          description:
            'Only internationally recognized luxury haircare and styling brands.',
        },
        {
          id: 'why-3',
          title: 'Punctual Appointments',
          description:
            'Dedicated time slots respecting your personal schedule.',
        },
      ],
    },
    faq: {
      enabled: true,
      title: 'Frequently Asked Questions',
      items: [
        {
          id: 'faq-1',
          question: 'How do I schedule an appointment?',
          answer:
            'Select your desired treatment, choose an available time slot, and confirm your client details. You will receive an immediate reservation ticket.',
          active: true,
          order: 0,
        },
        {
          id: 'faq-2',
          question: 'What is your cancellation policy?',
          answer:
            'We kindly request at least 24 hours advance notice to reschedule or cancel your reservation without inconvenience.',
          active: true,
          order: 1,
        },
        {
          id: 'faq-3',
          question: 'Do you offer private consultations?',
          answer:
            'Yes, every appointment includes an individual consultation in our private styling suites dedicated exclusively to you.',
          active: true,
          order: 2,
        },
      ],
    },
    bookingCta: {
      enabled: true,
      eyebrow: 'RESERVE YOUR VISIT',
      headline: 'Ready for Your Salon Transformation?',
      supportingText:
        'Secure your preferred private suite and treatment slot today.',
      ctaLabel: 'Book an Appointment Now',
      ctaDestination: '/book',
    },
    servicesSection: {
      enabled: true,
      title: 'Signature Treatments',
      subtitle: 'Crafted with precision, elevated with luxury',
    },
    offersSection: {
      enabled: true,
      title: 'Exclusive Offers',
      subtitle: 'Limited-time privileges for our distinguished patrons',
    },
    gallerySection: {
      enabled: true,
      title: 'The Lookbook & Showcase',
      subtitle: 'A glimpse into transformations created at Musha Empire',
    },
    teamSection: {
      enabled: false,
      title: 'Our Master Artists',
      subtitle: 'Passionate specialists dedicated to excellence',
    },
    membershipSection: {
      enabled: false,
      title: 'VIP Salon Membership',
      subtitle: 'Exclusive privileges for frequent patrons',
    },
    testimonialsSection: {
      enabled: false,
      title: 'Patron Reflections',
      subtitle: 'Experiences shared by our valued clients',
    },
  };
}

export function validateHomepageHero(hero: HeroSectionConfig): { isValid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  if (!hero.headline.trim()) {
    errors.headline = 'Hero headline is required.';
  }
  if (!hero.primaryCtaLabel.trim()) {
    errors.primaryCtaLabel = 'Primary CTA label is required.';
  }
  if (!hero.primaryCtaDestination.trim()) {
    errors.primaryCtaDestination = 'Primary CTA destination URL/path is required.';
  }
  if (!hero.desktopMedia.trim()) {
    errors.desktopMedia = 'Desktop hero media URL is required.';
  } else if (
    !hero.desktopMedia.startsWith('http://') &&
    !hero.desktopMedia.startsWith('https://') &&
    !hero.desktopMedia.startsWith('/')
  ) {
    errors.desktopMedia = 'Desktop hero media must be a valid URL (https://) or relative path.';
  }

  if (
    hero.mobileMedia &&
    hero.mobileMedia.trim() &&
    !hero.mobileMedia.startsWith('http://') &&
    !hero.mobileMedia.startsWith('https://') &&
    !hero.mobileMedia.startsWith('/')
  ) {
    errors.mobileMedia = 'Mobile hero media must be a valid URL (https://) or relative path.';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}
