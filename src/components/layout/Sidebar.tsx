import React from 'react';
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  Sparkles,
  Tag,
  Images,
  LayoutTemplate,
  ShieldCheck,
  Settings,
  LogOut,
  LogIn,
  X,
  Crown,
  BarChart3,
} from 'lucide-react';
import { useRouter } from '../../router/Router';
import { useAuth } from '../../context/AuthContext';
import { Badge } from '../ui/Badge';
import { hasPermission, type Permission } from '../../auth/permissions';

export interface NavItem {
  name: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  requiredPermission: Permission;
}

export const navItems: NavItem[] = [
  {
    name: 'Dashboard',
    path: '/admin',
    icon: LayoutDashboard,
    requiredPermission: 'dashboard.view',
  },
  {
    name: 'Cash Analytics',
    path: '/admin/analytics',
    icon: BarChart3,
    requiredPermission: 'analytics.view',
  },
  {
    name: 'Bookings',
    path: '/admin/bookings',
    icon: CalendarDays,
    requiredPermission: 'bookings.view',
  },
  {
    name: 'Customers',
    path: '/admin/customers',
    icon: Users,
    requiredPermission: 'customers.view',
  },
  {
    name: 'Services',
    path: '/admin/services',
    icon: Sparkles,
    requiredPermission: 'services.view',
  },
  {
    name: 'Offers',
    path: '/admin/offers',
    icon: Tag,
    requiredPermission: 'offers.view',
  },
  {
    name: 'Gallery',
    path: '/admin/gallery',
    icon: Images,
    requiredPermission: 'gallery.view',
  },
  {
    name: 'Homepage',
    path: '/admin/homepage',
    icon: LayoutTemplate,
    requiredPermission: 'homepage.view',
  },
  {
    name: 'Staff',
    path: '/admin/staff',
    icon: ShieldCheck,
    requiredPermission: 'staff.view',
  },
  {
    name: 'Settings',
    path: '/admin/settings',
    icon: Settings,
    requiredPermission: 'settings.view',
  },
];

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const { currentPath, navigate } = useRouter();
  const { userProfile, role, logout, user, signInWithGoogle } = useAuth();

  const handleNavClick = (path: string) => {
    navigate(path);
    if (window.innerWidth < 1024) {
      onClose();
    }
  };

  const isActive = (path: string) => {
    if (path === '/admin') {
      return currentPath === '/admin' || currentPath === '/admin/';
    }
    return currentPath === path || currentPath.startsWith(`${path}/`);
  };

  // Strictly filter items based on granular role permissions (hidden, not disabled)
  const visibleNavItems = navItems.filter((item) =>
    hasPermission(role, item.requiredPermission)
  );

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-[#171513]/40 z-40 lg:hidden backdrop-blur-xs transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-64 bg-white border-r border-[#E5E7EB] flex flex-col justify-between transition-transform duration-200 ease-in-out lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Top Brand Header */}
        <div>
          <div className="h-16 px-6 border-b border-[#E5E7EB] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#171513] text-[#D6A84F] flex items-center justify-center font-bold shadow-xs">
                <Crown className="w-4 h-4 text-[#D6A84F]" />
              </div>
              <div>
                <span className="font-bold text-[#171513] text-sm tracking-wide block leading-tight">
                  MUSHA EMPIRE
                </span>
                <span className="text-[10px] uppercase tracking-wider text-[#B7791F] font-semibold block">
                  Admin Portal
                </span>
              </div>
            </div>

            <button
              onClick={onClose}
              className="lg:hidden p-1.5 rounded-lg text-[#6B7280] hover:text-[#171513] hover:bg-[#F3F4F6] cursor-pointer"
              aria-label="Close menu"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="p-3 space-y-1">
            <div className="px-3 py-2 text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-wider">
              Navigation ({role || 'Restricted'})
            </div>
            {visibleNavItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.path);

              return (
                <button
                  key={item.path}
                  onClick={() => handleNavClick(item.path)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors duration-150 cursor-pointer ${
                    active
                      ? 'bg-[#FEF9EE] text-[#B7791F] border border-[#FCEEC8] shadow-xs'
                      : 'text-[#4B5563] hover:text-[#171513] hover:bg-[#F9FAFB] border border-transparent'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 transition-colors ${
                      active ? 'text-[#B7791F]' : 'text-[#6B7280]'
                    }`}
                  />
                  <span className="truncate">{item.name}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom User Area */}
        <div className="p-3 border-t border-[#E5E7EB] bg-[#FAFBFD] shrink-0">
          <div className="p-2.5 rounded-lg bg-white border border-[#E5E7EB] flex items-center justify-between mb-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-[#171513] text-[#D6A84F] font-semibold text-xs flex items-center justify-center shrink-0">
                {user ? (user.displayName || user.email || 'A').charAt(0).toUpperCase() : 'G'}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[#171513] truncate leading-tight">
                  {user ? (user.displayName || user.email?.split('@')[0] || 'Staff User') : 'Guest Admin'}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <Badge variant={user ? 'gold' : 'neutral'} className="text-[10px] px-1.5 py-0 capitalize">
                    {user ? (role || 'Staff') : 'Signed Out'}
                  </Badge>
                  {user?.email && (
                    <span className="text-[10px] text-[#9CA3AF] truncate max-w-[80px]">
                      {user.email}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {user ? (
            <button
              onClick={() => logout()}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-[#DC2626] hover:bg-[#FEF2F2] rounded-lg transition-colors cursor-pointer border border-transparent hover:border-[#FEE2E2]"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          ) : (
            <button
              onClick={() => signInWithGoogle()}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-xs font-semibold text-white bg-[#B7791F] hover:bg-[#975A16] active:scale-98 rounded-lg transition-all cursor-pointer shadow-sm"
              title="Sign in with your authorized Google staff account"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Sign In with Staff Account</span>
            </button>
          )}
        </div>
      </aside>
    </>
  );
};

