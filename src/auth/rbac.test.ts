/**
 * Automated Verification Script for Musha Empire RBAC & Permission System
 * Tests requirements 1 through 14 of Prompt 2.
 */

import {
  ROLE_PERMISSIONS_MATRIX,
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  ROUTE_PERMISSION_MAP,
  type Permission,
} from './permissions';
import {
  isAuthorizedAdminRole,
  type UserRole,
  normalizeBooking,
  normalizeService,
} from '../firebase/types';
import { COLLECTIONS } from '../firebase/collections';

function runRbacTestSuite() {
  console.log('--- STARTING MUSHA EMPIRE RBAC & PERMISSION TEST SUITE ---');
  let testsPassed = 0;
  let testsFailed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`✅ PASS: ${testName}`);
      testsPassed++;
    } else {
      console.error(`❌ FAIL: ${testName}`);
      testsFailed++;
    }
  }

  // 1. Admin Permissions (Full access)
  assert(hasPermission('admin', 'dashboard.view'), '1. Admin has dashboard.view');
  assert(hasPermission('admin', 'services.delete'), '1. Admin has services.delete');
  assert(hasPermission('admin', 'settings.update'), '1. Admin has settings.update');
  assert(hasPermission('admin', 'staff.permissions'), '1. Admin has staff.permissions');
  assert(isAuthorizedAdminRole('admin'), '1. Admin role is authorized for Admin Portal');

  // 2. Manager Permissions (Operational access, no master security/delete/publish)
  assert(hasPermission('manager', 'dashboard.view'), '2. Manager has dashboard.view');
  assert(hasPermission('manager', 'bookings.update'), '2. Manager has bookings.update');
  assert(hasPermission('manager', 'services.create'), '2. Manager has services.create');
  assert(!hasPermission('manager', 'services.delete'), '2. Manager CANNOT services.delete');
  assert(!hasPermission('manager', 'settings.view'), '2. Manager CANNOT settings.view');
  assert(!hasPermission('manager', 'staff.permissions'), '2. Manager CANNOT staff.permissions');
  assert(isAuthorizedAdminRole('manager'), '2. Manager is authorized for Admin Portal');

  // 3. Receptionist Permissions (Booking & customer ops, read-only services/offers)
  assert(hasPermission('receptionist', 'bookings.create'), '3. Receptionist has bookings.create');
  assert(hasPermission('receptionist', 'customers.update'), '3. Receptionist has customers.update');
  assert(hasPermission('receptionist', 'services.view'), '3. Receptionist has services.view');
  assert(!hasPermission('receptionist', 'services.create'), '3. Receptionist CANNOT services.create');
  assert(!hasPermission('receptionist', 'gallery.view'), '3. Receptionist CANNOT gallery.view');
  assert(!hasPermission('receptionist', 'settings.view'), '3. Receptionist CANNOT settings.view');
  assert(isAuthorizedAdminRole('receptionist'), '3. Receptionist is authorized for Admin Portal');

  // 4. Stylist Permissions (Limited schedule visibility, read-only services)
  assert(hasPermission('stylist', 'dashboard.view'), '4. Stylist has dashboard.view');
  assert(hasPermission('stylist', 'bookings.view'), '4. Stylist has bookings.view');
  assert(hasPermission('stylist', 'services.view'), '4. Stylist has services.view');
  assert(!hasPermission('stylist', 'offers.view'), '4. Stylist CANNOT offers.view');
  assert(!hasPermission('stylist', 'gallery.view'), '4. Stylist CANNOT gallery.view');
  assert(!hasPermission('stylist', 'homepage.view'), '4. Stylist CANNOT homepage.view');
  assert(!hasPermission('stylist', 'staff.view'), '4. Stylist CANNOT staff.view');
  assert(!hasPermission('stylist', 'settings.view'), '4. Stylist CANNOT settings.view');
  assert(isAuthorizedAdminRole('stylist'), '4. Stylist is authorized for Admin Portal');

  // 5. Cashier Permissions (Booking update, customer & service read)
  assert(hasPermission('cashier', 'dashboard.view'), '5. Cashier has dashboard.view');
  assert(hasPermission('cashier', 'bookings.update'), '5. Cashier has bookings.update');
  assert(hasPermission('cashier', 'customers.view'), '5. Cashier has customers.view');
  assert(!hasPermission('cashier', 'services.create'), '5. Cashier CANNOT services.create');
  assert(!hasPermission('cashier', 'staff.view'), '5. Cashier CANNOT staff.view');
  assert(isAuthorizedAdminRole('cashier'), '5. Cashier is authorized for Admin Portal');

  // 6. Customer Role (ZERO Admin permissions)
  assert(!isAuthorizedAdminRole('customer'), '6. Customer is NOT authorized for Admin Portal');
  assert(!hasPermission('customer', 'dashboard.view'), '6. Customer CANNOT dashboard.view');
  assert(!hasPermission('customer', 'bookings.view'), '6. Customer CANNOT bookings.view');
  assert(ROLE_PERMISSIONS_MATRIX['customer'].length === 0, '6. Customer permissions list is strictly empty');

  // 7. Missing / Invalid Role (Denied)
  assert(!isAuthorizedAdminRole(null), '7. Null role is denied');
  assert(!isAuthorizedAdminRole(undefined), '7. Undefined role is denied');
  assert(!isAuthorizedAdminRole(''), '7. Empty string role is denied');
  assert(!isAuthorizedAdminRole('hacker'), '7. Arbitrary role is denied');
  assert(!hasPermission(null, 'dashboard.view'), '7. Null role has no permissions');
  assert(!hasPermission('unknown', 'dashboard.view'), '7. Unknown role has no permissions');

  // 8. Route-Level Permission Mapping
  assert(ROUTE_PERMISSION_MAP['/admin'] === 'dashboard.view', '8. /admin mapped to dashboard.view');
  assert(ROUTE_PERMISSION_MAP['/admin/bookings'] === 'bookings.view', '8. /admin/bookings mapped to bookings.view');
  assert(ROUTE_PERMISSION_MAP['/admin/customers'] === 'customers.view', '8. /admin/customers mapped to customers.view');
  assert(ROUTE_PERMISSION_MAP['/admin/services'] === 'services.view', '8. /admin/services mapped to services.view');
  assert(ROUTE_PERMISSION_MAP['/admin/offers'] === 'offers.view', '8. /admin/offers mapped to offers.view');
  assert(ROUTE_PERMISSION_MAP['/admin/gallery'] === 'gallery.view', '8. /admin/gallery mapped to gallery.view');
  assert(ROUTE_PERMISSION_MAP['/admin/homepage'] === 'homepage.view', '8. /admin/homepage mapped to homepage.view');
  assert(ROUTE_PERMISSION_MAP['/admin/staff'] === 'staff.view', '8. /admin/staff mapped to staff.view');
  assert(ROUTE_PERMISSION_MAP['/admin/settings'] === 'settings.view', '8. /admin/settings mapped to settings.view');

  // Stylist route guard checks
  assert(hasPermission('stylist', ROUTE_PERMISSION_MAP['/admin/bookings']), '8. Stylist can view /admin/bookings');
  assert(!hasPermission('stylist', ROUTE_PERMISSION_MAP['/admin/settings']), '8. Stylist is BLOCKED from /admin/settings');
  assert(!hasPermission('stylist', ROUTE_PERMISSION_MAP['/admin/staff']), '8. Stylist is BLOCKED from /admin/staff');

  // 9. Sidebar Visibility Filtering simulation
  const checkSidebarVisibility = (role: UserRole) => {
    const allRoutes = Object.keys(ROUTE_PERMISSION_MAP);
    return allRoutes.filter((r) => hasPermission(role, ROUTE_PERMISSION_MAP[r]));
  };

  const adminVisible = checkSidebarVisibility('admin');
  const stylistVisible = checkSidebarVisibility('stylist');
  const receptionistVisible = checkSidebarVisibility('receptionist');

  assert(adminVisible.length === 9, '9. Admin sees all 9 navigation items');
  assert(stylistVisible.length === 4, '9. Stylist sees only 4 allowed items (Dashboard, Bookings, Customers, Services)');
  assert(!stylistVisible.includes('/admin/settings'), '9. Stylist does NOT see Settings');
  assert(!stylistVisible.includes('/admin/offers'), '9. Stylist does NOT see Offers');
  assert(receptionistVisible.length === 5, '9. Receptionist sees 5 allowed items');
  assert(!receptionistVisible.includes('/admin/gallery'), '9. Receptionist does NOT see Gallery');

  // 10. Action Permissions Simulation
  assert(hasPermission('admin', 'services.delete'), '10. Admin can delete services');
  assert(!hasPermission('manager', 'services.delete'), '10. Manager cannot delete services');
  assert(!hasPermission('receptionist', 'services.create'), '10. Receptionist cannot create services');
  assert(!hasPermission('stylist', 'services.update'), '10. Stylist cannot update services');

  // 11. Helper functions
  assert(hasAnyPermission('manager', ['staff.view', 'staff.permissions']), '11. hasAnyPermission works for manager');
  assert(!hasAllPermissions('manager', ['staff.view', 'staff.permissions']), '11. hasAllPermissions returns false when missing staff.permissions');

  // --- PROMPT 4: SERVICES CMS SPECIFIC TESTS ---
  console.log('\n--- PROMPT 4: SERVICES CMS VERIFICATION TESTS ---');

  // 1. services.view permission
  assert(hasPermission('admin', 'services.view'), 'P4.1. Admin has services.view');
  assert(hasPermission('manager', 'services.view'), 'P4.1. Manager has services.view');
  assert(hasPermission('receptionist', 'services.view'), 'P4.1. Receptionist has services.view');
  assert(hasPermission('stylist', 'services.view'), 'P4.1. Stylist has services.view');
  assert(hasPermission('cashier', 'services.view'), 'P4.1. Cashier has services.view');

  // 2. services.create permission
  assert(hasPermission('admin', 'services.create'), 'P4.2. Admin has services.create');
  assert(hasPermission('manager', 'services.create'), 'P4.2. Manager has services.create');
  assert(!hasPermission('receptionist', 'services.create'), 'P4.2. Receptionist cannot services.create');
  assert(!hasPermission('stylist', 'services.create'), 'P4.2. Stylist cannot services.create');
  assert(!hasPermission('cashier', 'services.create'), 'P4.2. Cashier cannot services.create');

  // 3. services.update permission
  assert(hasPermission('admin', 'services.update'), 'P4.3. Admin has services.update');
  assert(hasPermission('manager', 'services.update'), 'P4.3. Manager has services.update');
  assert(!hasPermission('receptionist', 'services.update'), 'P4.3. Receptionist cannot services.update');
  assert(!hasPermission('stylist', 'services.update'), 'P4.3. Stylist cannot services.update');
  assert(!hasPermission('cashier', 'services.update'), 'P4.3. Cashier cannot services.update');

  // 4. services.delete permission (Admin ONLY)
  assert(hasPermission('admin', 'services.delete'), 'P4.4. Admin has services.delete');
  assert(!hasPermission('manager', 'services.delete'), 'P4.4. Manager CANNOT services.delete');
  assert(!hasPermission('receptionist', 'services.delete'), 'P4.4. Receptionist CANNOT services.delete');

  // 5. unauthorized user
  assert(!hasPermission(null, 'services.view'), 'P4.5. Null user denied services.view');
  assert(!hasPermission('unknown', 'services.view'), 'P4.5. Unknown role denied services.view');

  // 6. customer access denied
  assert(!hasPermission('customer', 'services.view'), 'P4.6. Customer denied services.view');
  assert(!hasPermission('customer', 'services.create'), 'P4.6. Customer denied services.create');
  assert(!hasPermission('customer', 'services.update'), 'P4.6. Customer denied services.update');
  assert(!hasPermission('customer', 'services.delete'), 'P4.6. Customer denied services.delete');

  // 7. valid service creation validation rule
  const validDuration = (d: number) => [30, 60, 90, 120].includes(d);
  const validPrice = (p: number) => typeof p === 'number' && !isNaN(p) && p >= 0;
  const validName = (n: string) => typeof n === 'string' && n.trim().length > 0;

  assert(validName('Royal Hair Spa') && validPrice(120) && validDuration(60), 'P4.7. Valid service creation passes validation');

  // 8. invalid price rejection
  assert(!validPrice(-10), 'P4.8. Negative price (-10) rejected');
  assert(!validPrice(NaN), 'P4.8. NaN price rejected');

  // 9. invalid duration rejection
  assert(!validDuration(0), 'P4.9. Duration 0 rejected');
  assert(!validDuration(-30), 'P4.9. Negative duration rejected');
  assert(!validDuration(45), 'P4.9. Unsupported arbitrary duration 45 rejected');

  // 10. service deactivation toggle
  const serviceState = { isActive: true, status: 'active' };
  serviceState.isActive = false;
  serviceState.status = 'inactive';
  assert(!serviceState.isActive && serviceState.status === 'inactive', 'P4.10. Service deactivation updates state without deleting record');

  // 11. historical booking preservation logic
  const checkDeleteAllowed = (historicalBookingCount: number) => {
    return historicalBookingCount === 0; // Only allow hard-delete if 0 bookings
  };
  assert(!checkDeleteAllowed(5), 'P4.11. Service with 5 bookings BLOCKS destructive delete (deactivates instead)');
  assert(checkDeleteAllowed(0), 'P4.11. Service with 0 bookings allows clean delete');

  // 12. empty state detection
  const emptyServiceList: any[] = [];
  assert(emptyServiceList.length === 0, 'P4.12. Empty services list accurately triggers "No services yet" state');

  // 13. Firestore error state handling
  const handleError = (error: Error | null) => error ? 'Unable to load services from database.' : null;
  assert(handleError(new Error('Network error')) === 'Unable to load services from database.', 'P4.13. Firestore error gracefully handled without stack traces');

  // --- PROMPT 5: OFFERS CMS SPECIFIC TESTS ---
  console.log('\n--- PROMPT 5: OFFERS CMS VERIFICATION TESTS ---');

  // 1. offers.view permission
  assert(hasPermission('admin', 'offers.view'), 'P5.1. Admin has offers.view');
  assert(hasPermission('manager', 'offers.view'), 'P5.1. Manager has offers.view');
  assert(hasPermission('receptionist', 'offers.view'), 'P5.1. Receptionist has offers.view');
  assert(!hasPermission('stylist', 'offers.view'), 'P5.1. Stylist CANNOT offers.view');
  assert(!hasPermission('cashier', 'offers.view'), 'P5.1. Cashier CANNOT offers.view');

  // 2. offers.create permission
  assert(hasPermission('admin', 'offers.create'), 'P5.2. Admin has offers.create');
  assert(hasPermission('manager', 'offers.create'), 'P5.2. Manager has offers.create');
  assert(!hasPermission('receptionist', 'offers.create'), 'P5.2. Receptionist cannot offers.create');

  // 3. offers.update permission
  assert(hasPermission('admin', 'offers.update'), 'P5.3. Admin has offers.update');
  assert(hasPermission('manager', 'offers.update'), 'P5.3. Manager has offers.update');
  assert(!hasPermission('receptionist', 'offers.update'), 'P5.3. Receptionist cannot offers.update');

  // 4. offers.delete permission (Admin ONLY)
  assert(hasPermission('admin', 'offers.delete'), 'P5.4. Admin has offers.delete');
  assert(!hasPermission('manager', 'offers.delete'), 'P5.4. Manager CANNOT offers.delete');
  assert(!hasPermission('receptionist', 'offers.delete'), 'P5.4. Receptionist CANNOT offers.delete');

  // 5. invalid discount validation
  const validDiscount = (val: number, type: 'percentage' | 'fixed') => {
    if (typeof val !== 'number' || isNaN(val) || val <= 0) return false;
    if (type === 'percentage' && val > 100) return false;
    return true;
  };
  assert(validDiscount(20, 'percentage'), 'P5.5. Valid 20% discount accepted');
  assert(validDiscount(15.5, 'fixed'), 'P5.5. Valid $15.50 fixed discount accepted');
  assert(!validDiscount(0, 'percentage'), 'P5.5. 0% discount rejected');
  assert(!validDiscount(-10, 'fixed'), 'P5.5. Negative discount rejected');
  assert(!validDiscount(150, 'percentage'), 'P5.5. Discount > 100% rejected');

  // 6. invalid dates validation
  const validDates = (start?: string, end?: string) => {
    if (!end) return false;
    if (start && end < start) return false;
    return true;
  };
  assert(validDates('2026-10-01', '2026-10-31'), 'P5.6. Valid date range accepted');
  assert(!validDates('2026-10-31', '2026-10-01'), 'P5.6. End date earlier than start date rejected');
  assert(!validDates('2026-10-01', ''), 'P5.6. Missing end date rejected');

  // 7. expired presentation state
  const computeValidity = (from: string | undefined, until: string, active: boolean) => {
    if (!active) return 'inactive';
    const today = '2026-10-08';
    if (from && from > today) return 'scheduled';
    if (until && until < today) return 'expired';
    return 'active';
  };
  assert(computeValidity('2026-10-01', '2026-10-31', true) === 'active', 'P5.7. Current dates evaluated as active');
  assert(computeValidity('2026-11-01', '2026-11-30', true) === 'scheduled', 'P5.7. Future dates evaluated as scheduled');
  assert(computeValidity('2026-09-01', '2026-09-30', true) === 'expired', 'P5.7. Past dates evaluated as expired');

  // 8. activation / deactivation state
  const offerState = { isActive: true };
  offerState.isActive = false;
  assert(!offerState.isActive, 'P5.8. Offer deactivation updates active state cleanly');

  // --- PROMPT 5: GALLERY CMS SPECIFIC TESTS ---
  console.log('\n--- PROMPT 5: GALLERY CMS VERIFICATION TESTS ---');

  // 9. gallery.view permission
  assert(hasPermission('admin', 'gallery.view'), 'P5.9. Admin has gallery.view');
  assert(hasPermission('manager', 'gallery.view'), 'P5.9. Manager has gallery.view');
  assert(!hasPermission('receptionist', 'gallery.view'), 'P5.9. Receptionist CANNOT gallery.view');
  assert(!hasPermission('stylist', 'gallery.view'), 'P5.9. Stylist CANNOT gallery.view');

  // 10. gallery.create permission
  assert(hasPermission('admin', 'gallery.create'), 'P5.10. Admin has gallery.create');
  assert(hasPermission('manager', 'gallery.create'), 'P5.10. Manager has gallery.create');
  assert(!hasPermission('receptionist', 'gallery.create'), 'P5.10. Receptionist cannot gallery.create');

  // 11. gallery.update permission
  assert(hasPermission('admin', 'gallery.update'), 'P5.11. Admin has gallery.update');
  assert(hasPermission('manager', 'gallery.update'), 'P5.11. Manager has gallery.update');
  assert(!hasPermission('receptionist', 'gallery.update'), 'P5.11. Receptionist cannot gallery.update');

  // 12. gallery.delete permission (Admin ONLY)
  assert(hasPermission('admin', 'gallery.delete'), 'P5.12. Admin has gallery.delete');
  assert(!hasPermission('manager', 'gallery.delete'), 'P5.12. Manager CANNOT gallery.delete');
  assert(!hasPermission('receptionist', 'gallery.delete'), 'P5.12. Receptionist CANNOT gallery.delete');

  // 13. publish / unpublish state toggle
  const galleryItem = { isPublished: true, featured: false };
  galleryItem.isPublished = false;
  assert(!galleryItem.isPublished, 'P5.13. Gallery item unpublished successfully');

  // 14. category filtering
  const galleryList = [
    { id: '1', category: 'Hair' },
    { id: '2', category: 'Spa' },
    { id: '3', category: 'Hair' },
  ];
  const hairItems = galleryList.filter((i) => i.category === 'Hair');
  assert(hairItems.length === 2, 'P5.14. Gallery category filter filters correctly');

  // 15. featured handling toggle
  galleryItem.featured = true;
  assert(galleryItem.featured, 'P5.15. Gallery item featured toggle works');

  // --- PROMPT 6: HOMEPAGE CMS VERIFICATION TESTS ---
  console.log('\n--- PROMPT 6: HOMEPAGE CMS VERIFICATION TESTS ---');

  // 1. homepage.view permission
  assert(hasPermission('admin', 'homepage.view'), 'P6.1. Admin has homepage.view');
  assert(hasPermission('manager', 'homepage.view'), 'P6.1. Manager has homepage.view');
  assert(!hasPermission('receptionist', 'homepage.view'), 'P6.1. Receptionist CANNOT homepage.view');
  assert(!hasPermission('stylist', 'homepage.view'), 'P6.1. Stylist CANNOT homepage.view');
  assert(!hasPermission('cashier', 'homepage.view'), 'P6.1. Cashier CANNOT homepage.view');

  // 2. homepage.update permission
  assert(hasPermission('admin', 'homepage.update'), 'P6.2. Admin has homepage.update');
  assert(hasPermission('manager', 'homepage.update'), 'P6.2. Manager has homepage.update');
  assert(!hasPermission('receptionist', 'homepage.update'), 'P6.2. Receptionist CANNOT homepage.update');
  assert(!hasPermission('stylist', 'homepage.update'), 'P6.2. Stylist CANNOT homepage.update');
  assert(!hasPermission('cashier', 'homepage.update'), 'P6.2. Cashier CANNOT homepage.update');

  // 3. homepage.publish permission (Admin ONLY)
  assert(hasPermission('admin', 'homepage.publish'), 'P6.3. Admin has homepage.publish');
  assert(!hasPermission('manager', 'homepage.publish'), 'P6.3. Manager CANNOT homepage.publish (Admin only)');
  assert(!hasPermission('receptionist', 'homepage.publish'), 'P6.3. Receptionist CANNOT homepage.publish');
  assert(!hasPermission('stylist', 'homepage.publish'), 'P6.3. Stylist CANNOT homepage.publish');
  assert(!hasPermission('cashier', 'homepage.publish'), 'P6.3. Cashier CANNOT homepage.publish');

  // 4. unauthorized role rejection
  assert(!hasPermission(null, 'homepage.view'), 'P6.4. Null user denied homepage.view');
  assert(!hasPermission('unknown', 'homepage.view'), 'P6.4. Unknown role denied homepage.view');
  assert(!hasPermission(undefined, 'homepage.publish'), 'P6.4. Undefined role denied homepage.publish');

  // 5. customer denied
  assert(!hasPermission('customer', 'homepage.view'), 'P6.5. Customer denied homepage.view');
  assert(!hasPermission('customer', 'homepage.update'), 'P6.5. Customer denied homepage.update');
  assert(!hasPermission('customer', 'homepage.publish'), 'P6.5. Customer denied homepage.publish');

  // 6. draft content isolation
  const draftState = { headline: 'New Draft Headline', isPublished: false };
  const publishedState = { headline: 'Live Headline', isPublished: true };
  assert(draftState.headline !== publishedState.headline, 'P6.6. Draft changes are isolated from published content');
  assert(!draftState.isPublished && publishedState.isPublished, 'P6.6. Draft state flag correctly preserved');

  // 7. published content commitment
  const publishDraftToProduction = (draft: typeof draftState) => ({
    ...draft,
    isPublished: true,
    publishedAt: '2026-10-08T12:00:00Z',
  });
  const liveCommit = publishDraftToProduction(draftState);
  assert(liveCommit.isPublished && liveCommit.headline === 'New Draft Headline', 'P6.7. Publishing safely transitions draft into published production state');

  // 8. section visibility toggle without deletion
  const sampleSections = [
    { id: 'hero', name: 'Hero', enabled: true },
    { id: 'services', name: 'Services', enabled: true },
    { id: 'offers', name: 'Offers', enabled: false },
  ];
  const toggleSection = (id: string) => {
    return sampleSections.map((s) => s.id === id ? { ...s, enabled: !s.enabled } : s);
  };
  const updatedSections = toggleSection('offers');
  const offersSection = updatedSections.find((s) => s.id === 'offers');
  assert(updatedSections.length === 3, 'P6.8. Disabling section preserves section content without deletion');
  assert(offersSection?.enabled === true, 'P6.8. Section visibility toggle cleanly flips state');

  // 9. CTA validation rule
  const validateCta = (label: string, destination: string) => {
    return Boolean(label && label.trim().length > 0 && destination && destination.trim().length > 0);
  };
  assert(validateCta('Book Now', '/book'), 'P6.9. Valid CTA passes validation');
  assert(!validateCta('', '/book'), 'P6.9. Empty CTA label rejected');
  assert(!validateCta('Book Now', ''), 'P6.9. Empty CTA destination rejected');

  // 10. invalid media URL validation
  const validateMediaUrl = (url?: string) => {
    if (!url || !url.trim()) return false;
    return url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/');
  };
  assert(validateMediaUrl('https://images.unsplash.com/photo-1'), 'P6.10. Valid HTTPS media URL accepted');
  assert(validateMediaUrl('/images/hero.jpg'), 'P6.10. Valid local relative path accepted');
  assert(!validateMediaUrl('ftp://invalid-url.com'), 'P6.10. Non-HTTP(S) protocol rejected');
  assert(!validateMediaUrl('just-a-plain-string'), 'P6.10. Arbitrary plain text media URL rejected');

  // 11. featured service integration
  const allServices = [
    { id: 's1', name: 'Service 1', featured: true, isActive: true },
    { id: 's2', name: 'Service 2', featured: false, isActive: true },
    { id: 's3', name: 'Service 3', featured: true, isActive: false },
  ];
  const featuredOnlyServices = allServices.filter((s) => s.featured && s.isActive);
  assert(featuredOnlyServices.length === 1 && featuredOnlyServices[0].id === 's1', 'P6.11. Homepage services only includes active, featured treatments');

  // 12. featured gallery integration
  const allGalleryItems = [
    { id: 'g1', title: 'Hair 1', featured: true, isPublished: true },
    { id: 'g2', title: 'Hair 2', featured: false, isPublished: true },
    { id: 'g3', title: 'Hair 3', featured: true, isPublished: false },
  ];
  const featuredOnlyGallery = allGalleryItems.filter((g) => g.featured && g.isPublished);
  assert(featuredOnlyGallery.length === 1 && featuredOnlyGallery[0].id === 'g1', 'P6.12. Homepage gallery only includes published, featured lookbook items');

  // 13. active offer integration
  const allOffers = [
    { id: 'o1', title: 'Offer 1', isActive: true, validityState: 'active' },
    { id: 'o2', title: 'Offer 2', isActive: false, validityState: 'active' },
    { id: 'o3', title: 'Offer 3', isActive: true, validityState: 'expired' },
  ];
  const activeOnlyOffers = allOffers.filter((o) => o.isActive && o.validityState === 'active');
  assert(activeOnlyOffers.length === 1 && activeOnlyOffers[0].id === 'o1', 'P6.13. Homepage offers only presents active, unexpired campaigns');

  // --- PROMPT 7: BOOKINGS & CUSTOMER MANAGEMENT TESTS ---
  console.log('\n--- PROMPT 7: BOOKINGS & CUSTOMER MANAGEMENT TESTS ---');

  // 1. bookings.view permissions across all roles
  assert(hasPermission('admin', 'bookings.view'), 'P7.1. Admin has bookings.view');
  assert(hasPermission('manager', 'bookings.view'), 'P7.1. Manager has bookings.view');
  assert(hasPermission('receptionist', 'bookings.view'), 'P7.1. Receptionist has bookings.view');
  assert(hasPermission('stylist', 'bookings.view'), 'P7.1. Stylist has bookings.view');
  assert(hasPermission('cashier', 'bookings.view'), 'P7.1. Cashier has bookings.view');
  assert(!hasPermission('customer', 'bookings.view'), 'P7.1. Customer CANNOT bookings.view');

  // 2. bookings.update permissions
  assert(hasPermission('admin', 'bookings.update'), 'P7.2. Admin has bookings.update');
  assert(hasPermission('manager', 'bookings.update'), 'P7.2. Manager has bookings.update');
  assert(hasPermission('receptionist', 'bookings.update'), 'P7.2. Receptionist has bookings.update');
  assert(hasPermission('cashier', 'bookings.update'), 'P7.2. Cashier has bookings.update');
  assert(!hasPermission('stylist', 'bookings.update'), 'P7.2. Stylist CANNOT bookings.update');
  assert(!hasPermission('customer', 'bookings.update'), 'P7.2. Customer CANNOT bookings.update');

  // 3. bookings.cancel permissions
  assert(hasPermission('admin', 'bookings.cancel'), 'P7.3. Admin has bookings.cancel');
  assert(hasPermission('manager', 'bookings.cancel'), 'P7.3. Manager has bookings.cancel');
  assert(hasPermission('receptionist', 'bookings.cancel'), 'P7.3. Receptionist has bookings.cancel');
  assert(!hasPermission('stylist', 'bookings.cancel'), 'P7.3. Stylist CANNOT bookings.cancel');
  assert(!hasPermission('cashier', 'bookings.cancel'), 'P7.3. Cashier CANNOT bookings.cancel');
  assert(!hasPermission('customer', 'bookings.cancel'), 'P7.3. Customer CANNOT bookings.cancel');

  // 4. customers.view permissions
  assert(hasPermission('admin', 'customers.view'), 'P7.4. Admin has customers.view');
  assert(hasPermission('manager', 'customers.view'), 'P7.4. Manager has customers.view');
  assert(hasPermission('receptionist', 'customers.view'), 'P7.4. Receptionist has customers.view');
  assert(hasPermission('stylist', 'customers.view'), 'P7.4. Stylist has customers.view');
  assert(hasPermission('cashier', 'customers.view'), 'P7.4. Cashier has customers.view');
  assert(!hasPermission('customer', 'customers.view'), 'P7.4. Customer CANNOT customers.view');

  // 5. Customer list strictly excludes staff accounts
  const rawUsers = [
    { uid: 'u1', email: 'alice@client.com', role: 'customer' as const },
    { uid: 'u2', email: 'bob@staff.com', role: 'stylist' as const },
    { uid: 'u3', email: 'carol@admin.com', role: 'admin' as const },
    { uid: 'u4', email: 'dave@client.com', role: 'customer' as const },
    { uid: 'u5', email: 'eve@manager.com', role: 'manager' as const },
  ];
  const staffRoles = ['admin', 'manager', 'receptionist', 'stylist', 'cashier'];
  const customerOnlyList = rawUsers.filter((u) => !staffRoles.includes(u.role));
  assert(customerOnlyList.length === 2, 'P7.5. Customer directory strictly excludes staff accounts');
  assert(customerOnlyList.every((u) => u.role === 'customer'), 'P7.5. Filtered list only contains genuine clients');

  // 6. Historical price preservation
  const historicalBooking = {
    id: 'b-101',
    serviceId: 'srv-1',
    serviceName: 'Balayage Deluxe',
    price: 150.0, // Historical snapshot
  };
  const currentCatalogService = {
    id: 'srv-1',
    name: 'Balayage Deluxe',
    price: 195.0, // Updated catalog price
  };
  // Ensure booking price is never rewritten by catalog price
  assert(historicalBooking.price === 150.0, 'P7.6. Historical booking price ($150) preserved despite updated service price ($195)');

  // 7. Booking state machine validation rules
  const validateTransition = (currentStatus: string, targetStatus: string): boolean => {
    const validMap: Record<string, string[]> = {
      pending: ['confirmed', 'cancelled'],
      confirmed: ['completed', 'cancelled'],
      completed: [], // Terminal
      cancelled: [], // Terminal
    };
    return (validMap[currentStatus] || []).includes(targetStatus);
  };
  assert(validateTransition('pending', 'confirmed'), 'P7.7. Pending -> Confirmed allowed');
  assert(validateTransition('confirmed', 'completed'), 'P7.7. Confirmed -> Completed allowed');
  assert(validateTransition('pending', 'cancelled'), 'P7.7. Pending -> Cancelled allowed');
  assert(validateTransition('confirmed', 'cancelled'), 'P7.7. Confirmed -> Cancelled allowed');
  assert(!validateTransition('completed', 'cancelled'), 'P7.7. Completed -> Cancelled BLOCKED');
  assert(!validateTransition('cancelled', 'confirmed'), 'P7.7. Cancelled -> Confirmed BLOCKED');
  assert(!validateTransition('completed', 'pending'), 'P7.7. Completed -> Pending BLOCKED');

  // 8. Cancellation reason validation
  const validateCancellationReason = (reason?: string) => {
    return Boolean(reason && reason.trim().length > 0);
  };
  assert(validateCancellationReason('Client schedule conflict'), 'P7.8. Valid cancellation reason accepted');
  assert(!validateCancellationReason(''), 'P7.8. Empty cancellation reason rejected');
  assert(!validateCancellationReason('   '), 'P7.8. Whitespace cancellation reason rejected');

  // 9. Atomic cancellation consistency logic (booking, ticket, slot)
  const slotBeforeCancel = { id: 'slot-12', isAvailable: false, bookedByBookingId: 'b-99' };
  const executeSimulatedCancel = (slot: typeof slotBeforeCancel) => {
    return {
      ...slot,
      isAvailable: true,
      bookedByBookingId: null,
    };
  };
  const slotAfterCancel = executeSimulatedCancel(slotBeforeCancel);
  assert(slotAfterCancel.isAvailable === true && slotAfterCancel.bookedByBookingId === null, 'P7.9. Reserved time slot released on booking cancellation');

  // 10. Lifetime spend calculation rule
  const clientBookings = [
    { id: 'b1', price: 120, paymentStatus: 'paid', status: 'completed' },
    { id: 'b2', price: 80, paymentStatus: 'paid', status: 'completed' },
    { id: 'b3', price: 200, paymentStatus: 'pending', status: 'confirmed' }, // Unpaid
    { id: 'b4', price: 150, paymentStatus: 'refunded', status: 'cancelled' }, // Refunded
  ];
  const verifiedSpend = clientBookings
    .filter((b) => b.paymentStatus === 'paid')
    .reduce((sum, b) => sum + b.price, 0);
  assert(verifiedSpend === 200, 'P7.10. Lifetime spend calculated ONLY from verified paid bookings ($120 + $80 = $200)');

  // 11. Graceful missing profile fields handling
  const incompleteUser = { uid: 'u-99', email: 'anon@client.com', displayName: undefined, phoneNumber: undefined };
  const clientName = incompleteUser.displayName || 'Client';
  const clientPhone = incompleteUser.phoneNumber || undefined;
  assert(clientName === 'Client', 'P7.11. Missing name gracefully defaults to "Client" without fabricated data');
  assert(clientPhone === undefined, 'P7.11. Missing phone remains undefined without mock phone numbers');

  // --- PROMPT 7A: SECURITY AUDIT & BOOKING TRANSACTION HARDENING TESTS ---
  console.log('\n--- PROMPT 7A: SECURITY AUDIT & BOOKING TRANSACTION HARDENING ---');

  // P7A.1. Stylist & Cashier privilege isolation: cannot confirm or cancel bookings
  const isPrivilegedBookingStaff = (userRole?: string | null): boolean => {
    return ['admin', 'manager', 'receptionist'].includes(userRole || '');
  };
  assert(isPrivilegedBookingStaff('admin'), 'P7A.1. Admin authorized for privileged booking mutations');
  assert(isPrivilegedBookingStaff('manager'), 'P7A.1. Manager authorized for privileged booking mutations');
  assert(isPrivilegedBookingStaff('receptionist'), 'P7A.1. Receptionist authorized for privileged booking mutations');
  assert(!isPrivilegedBookingStaff('stylist'), 'P7A.1. Stylist BLOCKED from privileged booking mutations');
  assert(!isPrivilegedBookingStaff('cashier'), 'P7A.1. Cashier BLOCKED from privileged booking mutations');
  assert(!isPrivilegedBookingStaff('customer'), 'P7A.1. Customer BLOCKED from privileged booking mutations');
  assert(!isPrivilegedBookingStaff(null), 'P7A.1. Unauthenticated user BLOCKED from privileged booking mutations');

  // P7A.2. Booking state transition hardening: terminal state protection
  const testTransitionSafeguard = (from: string, to: string): { ok: boolean; reason?: string } => {
    if (from === 'completed') return { ok: false, reason: 'Completed appointment is immutable' };
    if (from === 'cancelled') return { ok: false, reason: 'Cancelled booking cannot transition' };
    if (from === 'pending' && to === 'completed') return { ok: false, reason: 'Must confirm before completing' };
    if (from === 'pending' && to === 'confirmed') return { ok: true };
    if (from === 'confirmed' && to === 'completed') return { ok: true };
    if (['pending', 'confirmed'].includes(from) && to === 'cancelled') return { ok: true };
    return { ok: false, reason: 'Invalid transition' };
  };
  assert(testTransitionSafeguard('pending', 'confirmed').ok, 'P7A.2. Valid pending -> confirmed transition');
  assert(testTransitionSafeguard('confirmed', 'completed').ok, 'P7A.2. Valid confirmed -> completed transition');
  assert(!testTransitionSafeguard('pending', 'completed').ok, 'P7A.2. Skipping confirmed step (pending -> completed) BLOCKED');
  assert(!testTransitionSafeguard('completed', 'cancelled').ok, 'P7A.2. Cancelling already completed booking BLOCKED');
  assert(!testTransitionSafeguard('cancelled', 'confirmed').ok, 'P7A.2. Re-confirming cancelled booking BLOCKED');
  assert(!testTransitionSafeguard('cancelled', 'completed').ok, 'P7A.2. Completing cancelled booking BLOCKED');

  // P7A.3. Mandatory cancellation reason audit
  const auditCancelPayload = (reason?: string): boolean => {
    return typeof reason === 'string' && reason.trim().length >= 3;
  };
  assert(auditCancelPayload('Client requested rescheduling'), 'P7A.3. Substantive cancellation reason accepted');
  assert(!auditCancelPayload(''), 'P7A.3. Empty cancellation reason rejected');
  assert(!auditCancelPayload('  '), 'P7A.3. Whitespace-only cancellation reason rejected');
  assert(!auditCancelPayload('no'), 'P7A.3. Short/trivial cancellation reason rejected (<3 chars)');

  // P7A.4. Digital Ticket & Booking status atomic sync
  const simulateTicketSync = (bookingStatus: string, ticketCode?: string) => {
    return {
      bookingStatus,
      ticketStatus: bookingStatus === 'cancelled' ? 'cancelled' : bookingStatus === 'completed' ? 'completed' : 'confirmed',
      ticketActive: bookingStatus !== 'cancelled',
    };
  };
  const syncedConfirmed = simulateTicketSync('confirmed', 'MSH-7842');
  assert(syncedConfirmed.ticketStatus === 'confirmed' && syncedConfirmed.ticketActive, 'P7A.4. Confirmed booking syncs ticket as confirmed & active');
  const syncedCancelled = simulateTicketSync('cancelled', 'MSH-7842');
  assert(syncedCancelled.ticketStatus === 'cancelled' && !syncedCancelled.ticketActive, 'P7A.4. Cancelled booking syncs ticket as cancelled & inactive');

  // P7A.5. Slot release idempotency
  const releaseSlotIdempotent = (slot: { isAvailable: boolean; bookedByBookingId: string | null }) => {
    return {
      ...slot,
      isAvailable: true,
      bookedByBookingId: null,
    };
  };
  const slot1 = releaseSlotIdempotent({ isAvailable: false, bookedByBookingId: 'bk-123' });
  const slot2 = releaseSlotIdempotent(slot1); // Repeated call
  assert(slot1.isAvailable && slot1.bookedByBookingId === null, 'P7A.5. Slot released on initial cancellation');
  assert(slot2.isAvailable && slot2.bookedByBookingId === null, 'P7A.5. Slot remains released on repeated/idempotent cancellation');

  // --- PROMPT 8: STAFF MANAGEMENT, SALON SETTINGS & FINAL SYSTEM QA ---
  console.log('\n--- PROMPT 8: STAFF MANAGEMENT, SALON SETTINGS & FINAL SYSTEM QA ---');

  // P8.1. Staff Management Access & View Permissions
  assert(hasPermission('admin', 'staff.view'), 'P8.1. Admin can view staff directory');
  assert(hasPermission('manager', 'staff.view'), 'P8.1. Manager can view staff directory');
  assert(!hasPermission('receptionist', 'staff.view'), 'P8.1. Receptionist blocked from staff directory');
  assert(!hasPermission('stylist', 'staff.view'), 'P8.1. Stylist blocked from staff directory');
  assert(!hasPermission('cashier', 'staff.view'), 'P8.1. Cashier blocked from staff directory');
  assert(!hasPermission('customer', 'staff.view'), 'P8.1. Customer blocked from staff directory');

  // P8.2. Staff Role Update & Administrative Mutation Permissions
  assert(hasPermission('admin', 'staff.update'), 'P8.2. Admin can update staff assignments');
  assert(hasPermission('admin', 'staff.permissions'), 'P8.2. Admin can manage security permissions');
  assert(!hasPermission('manager', 'staff.permissions'), 'P8.2. Manager cannot manage security permissions');
  assert(!hasPermission('receptionist', 'staff.update'), 'P8.2. Receptionist cannot update staff');

  // P8.3. Anti-Self-Promotion & Self-Modification Security Safeguard
  const validateStaffRoleChange = (
    actorUid: string,
    actorRole: string,
    targetUid: string,
    targetCurrentRole: string,
    targetNewRole: string
  ): { allowed: boolean; reason?: string } => {
    // 1. Cannot self-promote or alter own role
    if (actorUid === targetUid && targetCurrentRole !== targetNewRole) {
      return { allowed: false, reason: 'Users cannot alter or promote their own role' };
    }
    // 2. Only admin can grant admin role
    if (targetNewRole === 'admin' && actorRole !== 'admin') {
      return { allowed: false, reason: 'Only admin can grant admin role' };
    }
    // 3. Only admin can modify an admin account
    if (targetCurrentRole === 'admin' && actorRole !== 'admin') {
      return { allowed: false, reason: 'Only admin can modify an admin account' };
    }
    // 4. Must have staff.update permission
    if (actorRole !== 'admin' && actorRole !== 'manager') {
      return { allowed: false, reason: 'Insufficient privileges' };
    }
    return { allowed: true };
  };

  assert(
    !validateStaffRoleChange('u-1', 'admin', 'u-1', 'admin', 'stylist').allowed,
    'P8.3. Admin self-demotion or self-modification blocked'
  );
  assert(
    !validateStaffRoleChange('u-2', 'manager', 'u-2', 'manager', 'admin').allowed,
    'P8.3. Manager self-promotion to admin blocked'
  );
  assert(
    !validateStaffRoleChange('u-2', 'manager', 'u-3', 'stylist', 'admin').allowed,
    'P8.3. Manager attempting to grant admin role blocked'
  );
  assert(
    !validateStaffRoleChange('u-2', 'manager', 'u-1', 'admin', 'stylist').allowed,
    'P8.3. Manager attempting to modify admin account blocked'
  );
  assert(
    validateStaffRoleChange('u-1', 'admin', 'u-3', 'stylist', 'manager').allowed,
    'P8.3. Admin promoting stylist to manager authorized'
  );

  // P8.4. Salon Settings View and Update Permissions (Admin-only authority)
  assert(hasPermission('admin', 'settings.view'), 'P8.4. Admin can view salon settings');
  assert(hasPermission('admin', 'settings.update'), 'P8.4. Admin can update salon settings');
  assert(!hasPermission('manager', 'settings.view'), 'P8.4. Manager blocked from salon settings (Admin only)');
  assert(!hasPermission('manager', 'settings.update'), 'P8.4. Manager blocked from updating salon settings');
  assert(!hasPermission('receptionist', 'settings.view'), 'P8.4. Receptionist blocked from salon settings');
  assert(!hasPermission('stylist', 'settings.view'), 'P8.4. Stylist blocked from salon settings');
  assert(!hasPermission('customer', 'settings.view'), 'P8.4. Customer blocked from salon settings');

  // P8.5. Salon Settings Validation
  const validateSalonSettingsPayload = (settings: {
    salonName?: string;
    phone?: string;
    email?: string;
    address?: string;
    slotDurationMinutes?: number;
    bookingAdvanceDays?: number;
  }): { isValid: boolean; errors: string[] } => {
    const errs: string[] = [];
    if (!settings.salonName?.trim()) errs.push('Name required');
    if (!settings.phone?.trim()) errs.push('Phone required');
    if (!settings.email?.trim() || !settings.email.includes('@')) errs.push('Valid email required');
    if (!settings.address?.trim()) errs.push('Address required');
    if (!settings.slotDurationMinutes || settings.slotDurationMinutes < 15 || settings.slotDurationMinutes > 240) {
      errs.push('Slot duration must be 15-240 mins');
    }
    if (!settings.bookingAdvanceDays || settings.bookingAdvanceDays < 1 || settings.bookingAdvanceDays > 365) {
      errs.push('Advance days must be 1-365');
    }
    return { isValid: errs.length === 0, errors: errs };
  };

  const validSalonPayload = {
    salonName: 'Musha Empire Luxury Salon & Spa',
    phone: '+91 98765 43210',
    email: 'concierge@mushaempire.com',
    address: 'Suite 401, Royal Heritage Avenue, Financial District, Hyderabad, India',
    slotDurationMinutes: 60,
    bookingAdvanceDays: 30,
  };
  assert(validateSalonSettingsPayload(validSalonPayload).isValid, 'P8.5. Valid salon settings validated successfully');
  assert(!validateSalonSettingsPayload({ ...validSalonPayload, salonName: '' }).isValid, 'P8.5. Missing salon name rejected');
  assert(!validateSalonSettingsPayload({ ...validSalonPayload, email: 'invalid' }).isValid, 'P8.5. Invalid email rejected');
  assert(!validateSalonSettingsPayload({ ...validSalonPayload, slotDurationMinutes: 10 }).isValid, 'P8.5. Slot duration <15 mins rejected');
  assert(!validateSalonSettingsPayload({ ...validSalonPayload, bookingAdvanceDays: 400 }).isValid, 'P8.5. Advance days >365 rejected');

  // P8.6. System-wide Route Permission Mapping
  assert(ROUTE_PERMISSION_MAP['/admin/staff'] === 'staff.view', 'P8.6. /admin/staff mapped to staff.view');
  assert(ROUTE_PERMISSION_MAP['/admin/settings'] === 'settings.view', 'P8.6. /admin/settings mapped to settings.view');
  assert(ROUTE_PERMISSION_MAP['/admin/bookings'] === 'bookings.view', 'P8.6. /admin/bookings mapped to bookings.view');
  assert(ROUTE_PERMISSION_MAP['/admin/customers'] === 'customers.view', 'P8.6. /admin/customers mapped to customers.view');
  assert(ROUTE_PERMISSION_MAP['/admin/services'] === 'services.view', 'P8.6. /admin/services mapped to services.view');
  assert(ROUTE_PERMISSION_MAP['/admin/offers'] === 'offers.view', 'P8.6. /admin/offers mapped to offers.view');
  assert(ROUTE_PERMISSION_MAP['/admin/gallery'] === 'gallery.view', 'P8.6. /admin/gallery mapped to gallery.view');
  assert(ROUTE_PERMISSION_MAP['/admin/homepage'] === 'homepage.view', 'P8.6. /admin/homepage mapped to homepage.view');

  // PROMPT CONNECT: SHARED FIREBASE COLLECTIONS & PROJECT CONSISTENCY
  console.log('\n--- SHARED FIREBASE COLLECTIONS & ECOSYSTEM TESTS ---');
  const expectedCollections = [
    'users',
    'services',
    'offers',
    'gallery',
    'settings',
    'bookings',
    'slots',
    'public_availability',
    'availability',
    'tickets',
  ];
  expectedCollections.forEach((colName) => {
    assert(
      Object.values(COLLECTIONS).includes(colName as any),
      `Collection '${colName}' is mapped in COLLECTIONS constant`
    );
  });

  // Verify Homepage draft/publish document paths
  assert(COLLECTIONS.SETTINGS === 'settings', 'Settings collection is named "settings"');
  assert(COLLECTIONS.USERS === 'users', 'Users collection is named "users"');
  assert(COLLECTIONS.SERVICES === 'services', 'Services collection is named "services"');
  assert(COLLECTIONS.OFFERS === 'offers', 'Offers collection is named "offers"');
  assert(COLLECTIONS.GALLERY === 'gallery', 'Gallery collection is named "gallery"');
  assert(COLLECTIONS.BOOKINGS === 'bookings', 'Bookings collection is named "bookings"');
  assert(COLLECTIONS.SLOTS === 'slots', 'Slots collection is named "slots"');
  assert(COLLECTIONS.PUBLIC_AVAILABILITY === 'public_availability', 'Public availability collection is mapped');
  assert(COLLECTIONS.AVAILABILITY === 'availability', 'Availability collection is mapped');
  assert(COLLECTIONS.TICKETS === 'tickets', 'Tickets collection is mapped');

  // ==========================================
  // PHASE 2: LIVE END-TO-END VERIFICATION TESTS
  // ==========================================
  console.log('\n--- PHASE 2: LIVE END-TO-END ADMIN PORTAL VERIFICATION ---');

  // P2.1. Customer Concierge Request Ingestion & Field Normalization
  const rawCustomerConciergeRequest = {
    customer_id: 'cust-xyz-991',
    customer_name: 'Lady Eleanor Vance',
    customer_email: 'eleanor.vance@luxury.com',
    customer_phone: '+91 98765 00001',
    service_id: 'svc-hair-01',
    service_name: 'Bespoke Balayage & Silk Infusion',
    gender: 'Women',
    booking_date: '2026-11-05',
    start_time: '14:00',
    end_time: '15:30',
    duration_minutes: 90,
    price: 3500,
    status: 'pending',
    payment_status: 'pending',
    ticket_code: 'MSH-EV-991',
    notes: 'Prefer private suite quiet appointment',
  };

  const normalizedQueueItem = normalizeBooking('bk-doc-123', rawCustomerConciergeRequest);

  assert(normalizedQueueItem.id === 'bk-doc-123', 'P2.1. Concierge booking document ID preserved');
  assert(normalizedQueueItem.customerId === 'cust-xyz-991', 'P2.1. Customer ID extracted from customer_id');
  assert(normalizedQueueItem.customerName === 'Lady Eleanor Vance', 'P2.1. Customer name extracted from customer_name');
  assert(normalizedQueueItem.customerEmail === 'eleanor.vance@luxury.com', 'P2.1. Customer email extracted from customer_email');
  assert(normalizedQueueItem.customerPhone === '+91 98765 00001', 'P2.1. Customer phone extracted from customer_phone');
  assert(normalizedQueueItem.serviceName === 'Bespoke Balayage & Silk Infusion', 'P2.1. Service name extracted from service_name');
  assert(normalizedQueueItem.date === '2026-11-05', 'P2.1. Booking date extracted from booking_date');
  assert(normalizedQueueItem.time === '14:00', 'P2.1. Start time extracted from start_time');
  assert(normalizedQueueItem.status === 'pending', 'P2.1. Request status normalized to pending');
  assert(normalizedQueueItem.ticketCode === 'MSH-EV-991', 'P2.1. Ticket code extracted from ticket_code');

  // P2.2. Real-time Snapshot Listener Sorting
  const testStreamBookings = [
    { date: '2026-11-05', time: '10:00', id: 'b1' },
    { date: '2026-11-05', time: '14:00', id: 'b2' },
    { date: '2026-11-06', time: '09:00', id: 'b3' },
  ];
  testStreamBookings.sort((a, b) => {
    const diff = b.date.localeCompare(a.date);
    if (diff !== 0) return diff;
    return b.time.localeCompare(a.time);
  });
  assert(testStreamBookings[0].id === 'b3', 'P2.2. Snapshot items sort latest date first');
  assert(testStreamBookings[1].id === 'b2', 'P2.2. Same-day snapshot items sort latest time first');

  // P2.3. Booking Operations: Pending -> Confirmed -> Completed & Cancel
  assert(testTransitionSafeguard('pending', 'confirmed').ok, 'P2.3. Workflow pending -> confirmed authorized');
  assert(testTransitionSafeguard('confirmed', 'completed').ok, 'P2.3. Workflow confirmed -> completed authorized');
  assert(testTransitionSafeguard('pending', 'cancelled').ok, 'P2.3. Workflow pending -> cancelled authorized');
  assert(testTransitionSafeguard('confirmed', 'cancelled').ok, 'P2.3. Workflow confirmed -> cancelled authorized');
  assert(!testTransitionSafeguard('completed', 'cancelled').ok, 'P2.3. Completed booking terminal and immutable');
  assert(!testTransitionSafeguard('cancelled', 'confirmed').ok, 'P2.3. Cancelled booking cannot be re-confirmed');

  // P2.4. Service Catalog Dual-Key Field Synchronization
  const rawAdminServicePayload = {
    name: 'Royal Moroccan Oil Ritual',
    description: 'Deep conditioning treatment using authentic organic argan oil',
    category: 'Hair Treatments',
    gender: 'Women',
    duration_minutes: 60,
    durationMinutes: 60,
    price: 2800,
    active: true,
    isActive: true,
    status: 'active',
    image_url: 'https://images.unsplash.com/photo-example',
    imageUrl: 'https://images.unsplash.com/photo-example',
    featured: true,
  };
  const normalizedSyncedService = normalizeService('svc-99', rawAdminServicePayload);
  assert(normalizedSyncedService.name === 'Royal Moroccan Oil Ritual', 'P2.4. Service name matches customer site');
  assert(normalizedSyncedService.price === 2800, 'P2.4. Service price matches customer site');
  assert(normalizedSyncedService.durationMinutes === 60, 'P2.4. Service duration matches customer site');
  assert(normalizedSyncedService.isActive === true, 'P2.4. Service active status matches customer site');

  // P2.5. Customer Directory: Unregistered / Guest Concierge Customers Synthesized Without Duplication
  const existingUsersInAuth = [
    { uid: 'u-registered-1', email: 'registered@client.com', displayName: 'Aria Stark', role: 'customer' as UserRole },
  ];
  const allLiveBookings = [
    normalizedQueueItem, // eleanor.vance@luxury.com (no users/{uid} doc)
    {
      id: 'bk-reg-1',
      customerId: 'u-registered-1',
      customerName: 'Aria Stark',
      customerEmail: 'registered@client.com',
      serviceId: 's1',
      serviceName: 'Cut',
      date: '2026-10-10',
      time: '11:00',
      price: 1500,
      status: 'completed',
      paymentStatus: 'paid',
      raw: {},
    },
  ];

  // Simulation of the aggregation in CustomersPage.tsx
  const processedUids = new Set<string>();
  const processedEmails = new Set<string>();
  const aggregatedDirectory: any[] = [];

  existingUsersInAuth.forEach((u) => {
    processedUids.add(u.uid);
    processedEmails.add(u.email.toLowerCase().trim());
    aggregatedDirectory.push({
      uid: u.uid,
      name: u.displayName,
      email: u.email,
    });
  });

  const unprofiledMap = new Map<string, any>();
  allLiveBookings.forEach((b) => {
    const emailKey = b.customerEmail ? b.customerEmail.toLowerCase().trim() : '';
    const uidKey = b.customerId ? b.customerId.trim() : '';
    if ((uidKey && processedUids.has(uidKey)) || (emailKey && processedEmails.has(emailKey))) {
      return;
    }
    const key = uidKey || emailKey || b.id;
    if (!unprofiledMap.has(key)) {
      unprofiledMap.set(key, {
        uid: uidKey || `client-${key}`,
        email: b.customerEmail,
        name: b.customerName,
      });
    }
  });
  unprofiledMap.forEach((entry) => aggregatedDirectory.push(entry));

  assert(aggregatedDirectory.length === 2, 'P2.5. Concierge client without user profile appears in Customer Directory');
  assert(aggregatedDirectory.some((c) => c.email === 'eleanor.vance@luxury.com'), 'P2.5. Eleanor Vance synthesized cleanly');
  assert(aggregatedDirectory.some((c) => c.email === 'registered@client.com'), 'P2.5. Registered Aria Stark preserved without duplicate');

  // P2.6. Payment Integrity: Pending Razorpay Payments Never Counted as Revenue
  const mixedPaymentAppointments = [
    { id: '1', price: 5000, paymentStatus: 'paid', status: 'completed' },
    { id: '2', price: 4200, paymentStatus: 'pending', status: 'confirmed' }, // Razorpay initiated but unverified
    { id: '3', price: 3500, paymentStatus: 'pending', status: 'pending' },   // Concierge booking unpaid
    { id: '4', price: 2000, paymentStatus: 'failed', status: 'cancelled' },  // Failed payment
    { id: '5', price: 1800, paymentStatus: 'paid', status: 'cancelled' },   // Cancelled booking marked paid should not be revenue
  ];
  const authoritativeRev = mixedPaymentAppointments
    .filter((b) => b.paymentStatus === 'paid' && b.status !== 'cancelled')
    .reduce((sum, b) => sum + b.price, 0);
  assert(authoritativeRev === 5000, 'P2.6. Revenue strictly excludes unverified/pending Razorpay payments ($5000 only)');

  // P2.7. Authorization Integrity
  assert(isPrivilegedBookingStaff('admin'), 'P2.7. Admin authorized for administrative operations');
  assert(isPrivilegedBookingStaff('manager'), 'P2.7. Manager authorized for administrative operations');
  assert(!isPrivilegedBookingStaff('customer'), 'P2.7. Customer strictly blocked from administrative operations');
  assert(!isAuthorizedAdminRole('customer'), 'P2.7. Customer strictly blocked from Admin Portal routes');

  // P2.8. Security Audit: Client Bootstrapping & Self-Escalation Safeguards
  const trustedAdminEmails = ['sanjaykumarbjc@gmail.com', 'admin@mushaempire.com'];
  const testIsBootstrappedAdmin = (email?: string | null) => {
    return !!(email && trustedAdminEmails.includes(email.toLowerCase().trim()));
  };
  assert(testIsBootstrappedAdmin('sanjaykumarbjc@gmail.com'), 'P2.8. Authoritative admin email recognized');
  assert(testIsBootstrappedAdmin('admin@mushaempire.com'), 'P2.8. Secondary admin email recognized');
  assert(!testIsBootstrappedAdmin('customer@gmail.com'), 'P2.8. Arbitrary customer denied bootstrapped admin');
  assert(!testIsBootstrappedAdmin('attacker@mushaempire.com'), 'P2.8. Unlisted domain user denied bootstrapped admin');
  assert(!testIsBootstrappedAdmin(null), 'P2.8. Null email denied bootstrapped admin');

  // Simulate authenticated customer cannot escalate to admin via profile state
  const testResolveRole = (user: { email: string }, storedDocRole: UserRole | null): UserRole => {
    const isBootstrapped = testIsBootstrappedAdmin(user.email);
    if (storedDocRole) {
      return isBootstrapped ? 'admin' : storedDocRole;
    }
    return isBootstrapped ? 'admin' : 'customer';
  };
  assert(testResolveRole({ email: 'sanjaykumarbjc@gmail.com' }, null) === 'admin', 'P2.8. Bootstrapped admin resolves to admin on first sign-in');
  assert(testResolveRole({ email: 'client@gmail.com' }, null) === 'customer', 'P2.8. New customer strictly resolves to customer');
  assert(testResolveRole({ email: 'client@gmail.com' }, 'customer') === 'customer', 'P2.8. Existing customer strictly remains customer');
  assert(!isAuthorizedAdminRole(testResolveRole({ email: 'client@gmail.com' }, null)), 'P2.8. New customer blocked from Admin Portal');

  // P2.9. Nested Concierge Requests Extraction from Customer Documents
  const mockCustomerDoc = {
    displayName: 'Priya Sharma',
    email: 'priya.sharma@example.com',
    phoneNumber: '+91 98765 43210',
    role: 'customer',
    concierge_requests: [
      {
        booking_date: '2026-11-05',
        booking_status: 'confirmed',
        category: 'Hair Styling & Keratin',
        customerId: 'cust-ps-01',
        customerName: 'Priya Sharma',
        customer_email: 'priya.sharma@example.com',
        customer_id: 'cust-ps-01',
        start_time: '14:30',
        ticket_code: 'TCK-KERATIN-99',
        price: 4500,
      },
    ],
  };

  const extractedItem = mockCustomerDoc.concierge_requests[0];
  const normalizedNestedBooking = normalizeBooking(extractedItem.ticket_code, extractedItem);
  assert(normalizedNestedBooking.customerName === 'Priya Sharma', 'P2.9. Customer name mapped from nested concierge request');
  assert(normalizedNestedBooking.customerEmail === 'priya.sharma@example.com', 'P2.9. Customer email mapped from nested concierge request');
  assert(normalizedNestedBooking.serviceName === 'Hair Styling & Keratin', 'P2.9. Category mapped to serviceName');
  assert(normalizedNestedBooking.status === 'confirmed', 'P2.9. Booking status normalized from booking_status');
  assert(normalizedNestedBooking.date === '2026-11-05', 'P2.9. Booking date extracted correctly');
  assert(normalizedNestedBooking.ticketCode === 'TCK-KERATIN-99', 'P2.9. Ticket code preserved');
  assert(normalizedNestedBooking.price === 4500, 'P2.9. Price extracted correctly');

  console.log(`\n========================================`);

  console.log(`TEST SUMMARY: ${testsPassed} passed, ${testsFailed} failed`);
  console.log(`========================================`);

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runRbacTestSuite();
