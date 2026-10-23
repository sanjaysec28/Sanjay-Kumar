import React from 'react';
import { ShieldAlert, LogOut, ArrowLeft, LayoutDashboard, Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useRouter } from '../router/Router';
import { Button } from '../components/ui/Button';
import type { Permission } from '../auth/permissions';

interface UnauthorizedProps {
  missingPermission?: Permission | string;
  attemptedPath?: string;
}

export const Unauthorized: React.FC<UnauthorizedProps> = ({
  missingPermission,
  attemptedPath,
}) => {
  const { userProfile, role, logout } = useAuth();
  const { navigate } = useRouter();

  const handleSignOut = async () => {
    await logout();
    navigate('/admin', true);
  };

  const isCustomer = role === 'customer' || !role;

  return (
    <div className="min-h-screen bg-[#F7F8FA] flex flex-col justify-center items-center p-4 sm:p-6 font-sans">
      <div className="w-full max-w-md bg-white rounded-2xl border border-[#E5E7EB] shadow-md p-6 sm:p-8 text-center">
        <div className="w-14 h-14 rounded-2xl bg-[#FEF2F2] border border-[#FEE2E2] text-[#DC2626] flex items-center justify-center mx-auto mb-4">
          {isCustomer ? (
            <ShieldAlert className="w-7 h-7 text-[#DC2626]" />
          ) : (
            <Lock className="w-7 h-7 text-[#D97706]" />
          )}
        </div>

        <h1 className="text-xl font-bold text-[#171513] tracking-tight">
          {isCustomer ? 'Access Denied' : 'Restricted Module'}
        </h1>
        <p
          className={`text-xs font-semibold uppercase tracking-wider mt-1 ${
            isCustomer ? 'text-[#DC2626]' : 'text-[#D97706]'
          }`}
        >
          {isCustomer ? 'Customer Account Detected' : 'Insufficient Staff Permissions'}
        </p>

        {isCustomer ? (
          <p className="text-sm text-[#4B5563] mt-3 leading-relaxed">
            This account is registered as a{' '}
            <strong className="text-[#171513] font-semibold underline">Customer</strong>.
            The Musha Empire Admin Portal is restricted strictly to authorized salon staff,
            receptionists, stylists, and managers.
          </p>
        ) : (
          <p className="text-sm text-[#4B5563] mt-3 leading-relaxed">
            Your staff account role (
            <strong className="text-[#171513] font-semibold capitalize">{role}</strong>) does
            not possess the necessary operational permissions to access{' '}
            <code className="bg-[#F3F4F6] px-1.5 py-0.5 rounded text-xs font-mono text-[#171513]">
              {attemptedPath || 'this area'}
            </code>
            .
          </p>
        )}

        <div className="mt-5 p-3.5 bg-[#F9FAFB] rounded-xl border border-[#E5E7EB] text-left text-xs space-y-1.5">
          <div className="flex justify-between items-center">
            <span className="text-[#6B7280]">Staff Account:</span>
            <span className="font-semibold text-[#171513] truncate max-w-[200px]">
              {userProfile?.email || userProfile?.displayName || 'Active Session'}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[#6B7280]">Current Role:</span>
            <span
              className={`font-semibold capitalize ${
                isCustomer ? 'text-[#DC2626]' : 'text-[#B7791F]'
              }`}
            >
              {role || 'None'}
            </span>
          </div>
          {missingPermission && (
            <div className="flex justify-between items-center pt-1 border-t border-[#E5E7EB]">
              <span className="text-[#6B7280]">Required Permission:</span>
              <code className="text-[#DC2626] font-mono font-semibold text-[11px]">
                {missingPermission}
              </code>
            </div>
          )}
        </div>

        <div className="mt-6 flex flex-col sm:flex-row gap-3">
          {!isCustomer ? (
            <>
              <Button
                variant="gold"
                size="md"
                onClick={() => navigate('/admin')}
                leftIcon={<LayoutDashboard className="w-4 h-4" />}
                className="flex-1 justify-center"
              >
                Dashboard
              </Button>
              <Button
                variant="outline"
                size="md"
                onClick={handleSignOut}
                leftIcon={<LogOut className="w-4 h-4" />}
                className="flex-1 justify-center"
              >
                Sign Out
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="danger"
                size="md"
                onClick={handleSignOut}
                leftIcon={<LogOut className="w-4 h-4" />}
                className="flex-1 justify-center"
              >
                Sign Out
              </Button>
              <Button
                variant="outline"
                size="md"
                onClick={() => navigate('/admin')}
                leftIcon={<ArrowLeft className="w-4 h-4" />}
                className="flex-1 justify-center"
              >
                Dashboard
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
