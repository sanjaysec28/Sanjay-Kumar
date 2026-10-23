import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { hasPermission, hasAnyPermission, hasAllPermissions, type Permission } from '../../auth/permissions';

interface PermissionGateProps {
  permission?: Permission;
  anyOf?: Permission[];
  allOf?: Permission[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * Declarative component to conditionally render UI actions and sections
 * based on the authenticated staff member's authoritative role permissions.
 */
export const PermissionGate: React.FC<PermissionGateProps> = ({
  permission,
  anyOf,
  allOf,
  children,
  fallback = null,
}) => {
  const { role } = useAuth();

  let isAllowed = false;

  if (permission) {
    isAllowed = hasPermission(role, permission);
  } else if (anyOf && anyOf.length > 0) {
    isAllowed = hasAnyPermission(role, anyOf);
  } else if (allOf && allOf.length > 0) {
    isAllowed = hasAllPermissions(role, allOf);
  }

  if (!isAllowed) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
};

/**
 * Custom hook to evaluate permissions programmatically within components.
 */
export function useHasPermission(permission: Permission): boolean {
  const { role } = useAuth();
  return hasPermission(role, permission);
}

/**
 * Custom hook to evaluate whether the user has ANY of the specified permissions.
 */
export function useHasAnyPermission(permissions: Permission[]): boolean {
  const { role } = useAuth();
  return hasAnyPermission(role, permissions);
}
