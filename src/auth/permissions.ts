import type { UserRole } from '../firebase/types';

/**
 * Musha Empire Admin Portal Centralized Permission System
 * Defines all granular operational and administrative permissions.
 */

export type Permission =
  // Dashboard
  | 'dashboard.view'
  | 'analytics.view'

  // Bookings
  | 'bookings.view'
  | 'bookings.create'
  | 'bookings.update'
  | 'bookings.cancel'

  // Customers
  | 'customers.view'
  | 'customers.update'

  // Services
  | 'services.view'
  | 'services.create'
  | 'services.update'
  | 'services.delete'

  // Offers & Promotions
  | 'offers.view'
  | 'offers.create'
  | 'offers.update'
  | 'offers.delete'

  // Gallery
  | 'gallery.view'
  | 'gallery.create'
  | 'gallery.update'
  | 'gallery.delete'

  // Homepage CMS
  | 'homepage.view'
  | 'homepage.update'
  | 'homepage.publish'

  // Internal Staff
  | 'staff.view'
  | 'staff.create'
  | 'staff.update'
  | 'staff.delete'
  | 'staff.permissions'

  // Salon Settings
  | 'settings.view'
  | 'settings.update';

/**
 * All permissions available in the system
 */
export const ALL_PERMISSIONS: Permission[] = [
  'dashboard.view',
  'analytics.view',
  'bookings.view',
  'bookings.create',
  'bookings.update',
  'bookings.cancel',
  'customers.view',
  'customers.update',
  'services.view',
  'services.create',
  'services.update',
  'services.delete',
  'offers.view',
  'offers.create',
  'offers.update',
  'offers.delete',
  'gallery.view',
  'gallery.create',
  'gallery.update',
  'gallery.delete',
  'homepage.view',
  'homepage.update',
  'homepage.publish',
  'staff.view',
  'staff.create',
  'staff.update',
  'staff.delete',
  'staff.permissions',
  'settings.view',
  'settings.update',
];

/**
 * Default Role-Permission Matrix
 * Enforces least-privilege access across all staff tiers.
 */
export const ROLE_PERMISSIONS_MATRIX: Record<UserRole, Permission[]> = {
  // ADMIN: Full administrative access to all modules and configurations
  admin: [...ALL_PERMISSIONS],

  // MANAGER: Operational management access. Cannot delete master entities, publish CMS, or manage security permissions
  manager: [
    'dashboard.view',
    'analytics.view',
    'bookings.view',
    'bookings.create',
    'bookings.update',
    'bookings.cancel',
    'customers.view',
    'customers.update',
    'services.view',
    'services.create',
    'services.update',
    'offers.view',
    'offers.create',
    'offers.update',
    'gallery.view',
    'gallery.create',
    'gallery.update',
    'homepage.view',
    'homepage.update',
    'staff.view',
  ],

  // RECEPTIONIST: Booking and customer operations, read-only service/offer catalog
  receptionist: [
    'dashboard.view',
    'bookings.view',
    'bookings.create',
    'bookings.update',
    'bookings.cancel',
    'customers.view',
    'customers.update',
    'services.view',
    'offers.view',
  ],

  // STYLIST: Limited appointment & customer schedule visibility, read-only service catalog
  stylist: [
    'dashboard.view',
    'bookings.view',
    'customers.view',
    'services.view',
  ],

  // CASHIER: Booking and payment-related operational visibility, customer directory, services catalog
  cashier: [
    'dashboard.view',
    'bookings.view',
    'bookings.update',
    'customers.view',
    'services.view',
  ],

  // CUSTOMER: Strictly ZERO administrative permissions
  customer: [],
};

/**
 * Centralized Permission Check Function
 * Single source of truth for authorization decisions.
 */
export function hasPermission(
  role: UserRole | string | null | undefined,
  permission: Permission
): boolean {
  if (!role) return false;
  
  // Strict type check against allowed roles
  const validRole = role as UserRole;
  const permissions = ROLE_PERMISSIONS_MATRIX[validRole];
  
  if (!permissions) return false;
  return permissions.includes(permission);
}

/**
 * Checks if a role has ANY of the specified permissions
 */
export function hasAnyPermission(
  role: UserRole | string | null | undefined,
  permissions: Permission[]
): boolean {
  if (!role || permissions.length === 0) return false;
  return permissions.some((perm) => hasPermission(role, perm));
}

/**
 * Checks if a role has ALL of the specified permissions
 */
export function hasAllPermissions(
  role: UserRole | string | null | undefined,
  permissions: Permission[]
): boolean {
  if (!role || permissions.length === 0) return false;
  return permissions.every((perm) => hasPermission(role, perm));
}

/**
 * Maps admin routes to required viewing permissions
 */
export const ROUTE_PERMISSION_MAP: Record<string, Permission> = {
  '/admin': 'dashboard.view',
  '/admin/bookings': 'bookings.view',
  '/admin/customers': 'customers.view',
  '/admin/services': 'services.view',
  '/admin/offers': 'offers.view',
  '/admin/gallery': 'gallery.view',
  '/admin/homepage': 'homepage.view',
  '/admin/staff': 'staff.view',
  '/admin/settings': 'settings.view',
};
