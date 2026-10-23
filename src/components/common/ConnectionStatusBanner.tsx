import React, { useState } from 'react';
import { Database, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Copy, Check } from 'lucide-react';
import { connectionStatus } from '../../firebase/config';

export const ConnectionStatusBanner: React.FC = () => {
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  const handleCopyExample = () => {
    const text = `VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=musha-empire.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=musha-empire
VITE_FIREBASE_STORAGE_BUCKET=musha-empire.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=1234567890
VITE_FIREBASE_APP_ID=1:1234567890:web:abcdef`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (connectionStatus.isConfigured) {
    return (
      <div className="bg-[#F0FDF4] border-b border-[#DCFCE7] px-4 py-2.5 text-xs text-[#166534] flex items-center justify-between">
        <div className="flex items-center gap-2 font-medium">
          <CheckCircle2 className="w-4 h-4 text-[#16A34A] shrink-0" />
          <span>
            Connected to Musha Empire Firebase project:{' '}
            <strong className="font-semibold text-[#14532D]">{connectionStatus.projectId}</strong>
          </span>
          <span className="hidden md:inline-block text-[#86EFAC]">•</span>
          <span className="hidden md:inline-block text-[#15803D]">
            Single source of truth with customer app
          </span>
        </div>
        <span className="bg-[#DCFCE7] text-[#166534] px-2 py-0.5 rounded font-semibold text-[11px]">
          Shared Backend Live
        </span>
      </div>
    );
  }

  return (
    <div className="bg-[#FFFBEB] border-b border-[#FEF3C7] px-4 py-3 text-xs text-[#92400E]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-[#D97706] shrink-0" />
          <div>
            <span className="font-semibold text-[#B45309]">
              Firebase Connection Notice:
            </span>{' '}
            <span className="font-normal text-[#92400E]">
              Using existing Firebase project credentials. Waiting for{' '}
              <span className="font-semibold underline">.env</span> variables.
            </span>
          </div>
        </div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-[#B45309] hover:text-[#78350F] flex items-center gap-1 font-semibold text-xs cursor-pointer ml-3 shrink-0"
        >
          {isExpanded ? 'Hide Details' : 'Setup Details'}
          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {isExpanded && (
        <div className="mt-3 pt-3 border-t border-[#FDE68A] space-y-2">
          <p className="text-[#92400E]">
            Both the <strong>Customer App</strong> and this <strong>Admin Portal</strong> must share the exact same Firebase project.
            Missing or placeholder keys:{' '}
            <code className="bg-[#FEF3C7] px-1 py-0.5 rounded font-mono text-[11px] text-[#B45309]">
              {connectionStatus.missingKeys.join(', ') || 'None'}
            </code>
          </p>
          <div className="bg-white p-3 rounded-lg border border-[#FDE68A] font-mono text-[11px] text-[#171513] relative">
            <button
              onClick={handleCopyExample}
              className="absolute top-2 right-2 text-[#6B7280] hover:text-[#171513] flex items-center gap-1 bg-[#F7F8FA] px-2 py-1 rounded border border-[#E5E7EB]"
            >
              {copied ? <Check className="w-3 h-3 text-[#16A34A]" /> : <Copy className="w-3 h-3" />}
              {copied ? 'Copied' : 'Copy format'}
            </button>
            <div className="space-y-0.5 text-[#374151]">
              <p># Add to .env or environment configuration</p>
              <p>VITE_FIREBASE_API_KEY=&quot;...&quot;</p>
              <p>VITE_FIREBASE_AUTH_DOMAIN=&quot;musha-empire.firebaseapp.com&quot;</p>
              <p>VITE_FIREBASE_PROJECT_ID=&quot;musha-empire&quot;</p>
              <p>VITE_FIREBASE_STORAGE_BUCKET=&quot;musha-empire.appspot.com&quot;</p>
              <p>VITE_FIREBASE_MESSAGING_SENDER_ID=&quot;...&quot;</p>
              <p>VITE_FIREBASE_APP_ID=&quot;...&quot;</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-[#92400E]">
            <Database className="w-3.5 h-3.5 text-[#B7791F]" />
            <span>Target collections: users, bookings, services, offers, gallery, settings, slots, tickets</span>
          </div>
        </div>
      )}
    </div>
  );
};
