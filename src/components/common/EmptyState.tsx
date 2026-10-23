import React from 'react';
import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  compact?: boolean;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title = 'No data yet',
  description = 'Records from the shared database will appear here once created.',
  icon,
  action,
  compact = false,
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center rounded-xl border border-dashed border-[#E5E7EB] bg-white ${
        compact ? 'py-6 px-4' : 'py-12 px-6'
      }`}
    >
      <div className="w-10 h-10 rounded-full bg-[#F7F8FA] flex items-center justify-center text-[#6B7280] mb-3 border border-[#E5E7EB]">
        {icon || <Inbox className="w-5 h-5 text-[#6B7280]" />}
      </div>
      <h4 className="text-sm font-semibold text-[#171513] tracking-tight">{title}</h4>
      {description && (
        <p className="text-xs text-[#6B7280] font-normal max-w-sm mt-1 mb-3">
          {description}
        </p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
};
