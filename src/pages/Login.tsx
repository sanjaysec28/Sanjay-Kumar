import React, { useState } from 'react';
import { Crown, Lock, Mail, AlertCircle, ShieldAlert } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useRouter } from '../router/Router';
import { Button } from '../components/ui/Button';
import { connectionStatus } from '../firebase/config';

export const Login: React.FC = () => {
  const { signIn, loading, isAuthorized } = useAuth();
  const { navigate } = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // If already logged in and authorized, redirect to /admin
  React.useEffect(() => {
    if (isAuthorized && !loading) {
      navigate('/admin', true);
    }
  }, [isAuthorized, loading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (!email.trim() || !password) {
      setLocalError('Please enter both email and password.');
      return;
    }

    setIsSubmitting(true);
    const result = await signIn(email, password);
    setIsSubmitting(false);

    if (result.success) {
      navigate('/admin', true);
    } else {
      setLocalError(result.error || 'Login failed. Please check credentials.');
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F8FA] flex flex-col justify-center items-center p-4 sm:p-6 font-sans">
      <div className="w-full max-w-md">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#171513] text-[#D6A84F] shadow-md mb-3 border border-[#3E3A35]">
            <Crown className="w-7 h-7 text-[#D6A84F]" />
          </div>
          <h1 className="text-2xl font-bold text-[#171513] tracking-tight">
            MUSHA EMPIRE
          </h1>
          <p className="text-xs font-semibold text-[#B7791F] uppercase tracking-wider mt-1">
            Internal Staff & Admin Portal
          </p>
          <p className="text-xs text-[#6B7280] mt-1.5 max-w-xs mx-auto">
            Authorized administrative access for salon operations, scheduling, and management.
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] p-6 sm:p-8">
          <div className="mb-6">
            <h2 className="text-lg font-bold text-[#171513]">Administrator Sign In</h2>
            <p className="text-xs text-[#6B7280] mt-0.5">
              Enter your authorized staff credentials to continue
            </p>
          </div>

          {localError && (
            <div className="mb-5 p-3.5 rounded-xl bg-[#FEF2F2] border border-[#FEE2E2] flex items-start gap-3 text-xs text-[#DC2626]">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-[#DC2626]" />
              <div className="font-medium leading-relaxed">{localError}</div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#171513] mb-1.5">
                Staff Email Address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#9CA3AF]">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@mushaempire.com"
                  autoComplete="email"
                  required
                  className="w-full pl-10 pr-3.5 py-2.5 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-sm text-[#171513] placeholder-[#9CA3AF] focus:outline-hidden focus:ring-2 focus:ring-[#B7791F]/30 focus:border-[#B7791F] focus:bg-white transition-all font-normal"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#171513] mb-1.5">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#9CA3AF]">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  autoComplete="current-password"
                  required
                  className="w-full pl-10 pr-3.5 py-2.5 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-sm text-[#171513] placeholder-[#9CA3AF] focus:outline-hidden focus:ring-2 focus:ring-[#B7791F]/30 focus:border-[#B7791F] focus:bg-white transition-all font-normal"
                />
              </div>
            </div>

            <Button
              type="submit"
              variant="gold"
              size="lg"
              isLoading={isSubmitting}
              className="w-full mt-2 justify-center shadow-xs"
            >
              Sign In to Admin Portal
            </Button>
          </form>

          {/* Security notice */}
          <div className="mt-6 pt-5 border-t border-[#E5E7EB] flex items-center gap-2 text-[11px] text-[#6B7280]">
            <ShieldAlert className="w-4 h-4 text-[#B7791F] shrink-0" />
            <span>
              Restricted area. Customer accounts are not permitted and will be denied access.
            </span>
          </div>
        </div>

        {/* Backend Info Footer */}
        <div className="mt-6 text-center text-xs text-[#9CA3AF] space-y-1">
          <p>
            Shared Firebase Project:{' '}
            <span className="font-semibold text-[#6B7280]">
              {connectionStatus.projectId || 'Connecting via .env'}
            </span>
          </p>
          <p className="text-[11px]">
            Musha Empire Internal Salon Management Architecture
          </p>
        </div>
      </div>
    </div>
  );
};
