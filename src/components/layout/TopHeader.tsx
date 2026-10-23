import React from 'react';
import { Menu, ShieldCheck, Database, LogOut } from 'lucide-react';
import { useRouter } from '../../router/Router';
import { useAuth } from '../../context/AuthContext';
import { navItems } from './Sidebar';
import { connectionStatus } from '../../firebase/config';

interface TopHeaderProps {
  onOpenMobileMenu: () => void;
}

export const TopHeader: React.FC<TopHeaderProps> = ({ onOpenMobileMenu }) => {
  const { currentPath } = useRouter();
  const { role, userProfile, user, signInWithGoogle, logout, loading } = useAuth();

  const currentItem = navItems.find((item) => {
    if (item.path === '/admin') return currentPath === '/admin' || currentPath === '/admin/';
    return currentPath === item.path || currentPath.startsWith(`${item.path}/`);
  });

  const pageTitle = currentItem ? currentItem.name : 'Admin Portal';

  return (
    <header className="h-16 bg-white border-b border-[#E5E7EB] sticky top-0 z-30 flex items-center justify-between px-4 sm:px-6">
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenMobileMenu}
          className="lg:hidden p-2 rounded-lg text-[#6B7280] hover:text-[#171513] hover:bg-[#F3F4F6] cursor-pointer"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-[#6B7280] hidden sm:inline">
              Musha Empire Admin
            </span>
            <span className="text-xs text-[#9CA3AF] hidden sm:inline">/</span>
            <h1 className="text-base sm:text-lg font-bold text-[#171513] tracking-tight">
              {pageTitle}
            </h1>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 sm:gap-4">
        {/* Firebase Shared Project Indicator */}
        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#F7F8FA] border border-[#E5E7EB] text-xs font-medium text-[#4B5563]">
          <Database className="w-3.5 h-3.5 text-[#B7791F]" />
          <span className="text-[#6B7280]">Project:</span>
          <span className="font-semibold text-[#171513] truncate max-w-[120px]">
            {connectionStatus.projectId || 'Shared Backend'}
          </span>
        </div>

        {/* Auth Status & Action */}
        {loading ? (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#FAFBFD] border border-[#E5E7EB] text-xs text-[#6B7280]">
            <div className="w-3.5 h-3.5 border-2 border-[#B7791F] border-t-transparent rounded-full animate-spin"></div>
            <span className="hidden sm:inline">Authenticating...</span>
          </div>
        ) : !user ? (
          <button
            onClick={() => signInWithGoogle()}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#B7791F] hover:bg-[#975A16] active:scale-95 text-white text-xs font-semibold transition-all shadow-sm cursor-pointer whitespace-nowrap"
            title="Sign in with your authorized Google staff account"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Sign In with Staff Account</span>
          </button>
        ) : (
          <div className="flex items-center gap-2 pl-2 border-l border-[#E5E7EB]">
            <div className="hidden md:flex flex-col text-right">
              <span className="text-xs font-semibold text-[#171513] leading-tight truncate max-w-[150px]">
                {user.email || userProfile?.displayName || 'Admin'}
              </span>
              <span className="text-[11px] text-[#6B7280]">
                Role: <span className="font-semibold capitalize text-[#B7791F]">{role || 'admin'}</span>
              </span>
            </div>

            <div
              className="w-8 h-8 rounded-full bg-[#FEF9EE] border border-[#FCEEC8] flex items-center justify-center text-[#B7791F]"
              title={`Authorized Account: ${user.email} (${role})`}
            >
              <ShieldCheck className="w-4 h-4 text-[#B7791F]" />
            </div>

            <button
              onClick={() => logout()}
              className="p-1.5 rounded-lg text-[#6B7280] hover:text-[#DC2626] hover:bg-[#FEF2F2] transition-colors cursor-pointer"
              title="Sign Out"
              aria-label="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
