/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { RouterProvider, useRouter } from './router/Router';
import { AdminLayout } from './components/layout/AdminLayout';
import { Unauthorized } from './pages/Unauthorized';
import { Dashboard } from './pages/Dashboard';
import { AnalyticsPage } from './pages/placeholders/AnalyticsPage';
import { BookingsPage } from './pages/placeholders/BookingsPage';
import { CustomersPage } from './pages/placeholders/CustomersPage';
import { ServicesPage } from './pages/placeholders/ServicesPage';
import { OffersPage } from './pages/placeholders/OffersPage';
import { GalleryPage } from './pages/placeholders/GalleryPage';
import { HomepagePage } from './pages/placeholders/HomepagePage';
import { StaffPage } from './pages/placeholders/StaffPage';
import { SettingsPage } from './pages/placeholders/SettingsPage';
import { ROUTE_PERMISSION_MAP, hasPermission } from './auth/permissions';

const AppRoutes: React.FC = () => {
  const { currentPath, navigate } = useRouter();
  const { role, isAuthorized, user, loading } = useAuth();

  // Redirect /admin/login to /admin dashboard
  if (currentPath === '/admin/login') {
    navigate('/admin', true);
    return null;
  }

  // Explicit Unauthorized route
  if (currentPath === '/admin/unauthorized') {
    return <Unauthorized />;
  }

  // If explicitly unauthorized (e.g. customer role detected) -> Access Denied
  if (user && !isAuthorized) {
    return <Unauthorized attemptedPath={currentPath} />;
  }

  // Route-Level Permission Guard
  const normalizedPath = currentPath.endsWith('/') && currentPath.length > 1
    ? currentPath.slice(0, -1)
    : currentPath;

  const requiredPermission = ROUTE_PERMISSION_MAP[normalizedPath];

  if (requiredPermission && !hasPermission(role, requiredPermission)) {
    return (
      <Unauthorized
        missingPermission={requiredPermission}
        attemptedPath={normalizedPath}
      />
    );
  }

  // Authorized Staff with sufficient route permissions -> Render in AdminLayout
  const renderAdminPage = () => {
    switch (normalizedPath) {
      case '/admin':
        return <Dashboard />;
      case '/admin/analytics':
        return <AnalyticsPage />;
      case '/admin/bookings':
        return <BookingsPage />;
      case '/admin/customers':
        return <CustomersPage />;
      case '/admin/services':
        return <ServicesPage />;
      case '/admin/offers':
        return <OffersPage />;
      case '/admin/gallery':
        return <GalleryPage />;
      case '/admin/homepage':
        return <HomepagePage />;
      case '/admin/staff':
        return <StaffPage />;
      case '/admin/settings':
        return <SettingsPage />;
      default:
        return <Dashboard />;
    }
  };

  return <AdminLayout>{renderAdminPage()}</AdminLayout>;
};

export default function App() {
  return (
    <AuthProvider>
      <RouterProvider>
        <AppRoutes />
      </RouterProvider>
    </AuthProvider>
  );
}
