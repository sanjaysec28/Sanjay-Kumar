import React from 'react';

export type BadgeVariant = 'gold' | 'blue' | 'success' | 'warning' | 'danger' | 'neutral';

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'neutral',
  className = '',
}) => {
  const variantStyles: Record<BadgeVariant, string> = {
    gold: 'bg-[#FEF9EE] text-[#B7791F] border-[#FCEEC8]',
    blue: 'bg-[#EFF6FF] text-[#2563EB] border-[#DBEAFE]',
    success: 'bg-[#F0FDF4] text-[#16A34A] border-[#DCFCE7]',
    warning: 'bg-[#FFFBEB] text-[#D97706] border-[#FEF3C7]',
    danger: 'bg-[#FEF2F2] text-[#DC2626] border-[#FEE2E2]',
    neutral: 'bg-[#F9FAFB] text-[#4B5563] border-[#E5E7EB]',
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${variantStyles[variant]} ${className}`}
    >
      {children}
    </span>
  );
};
