import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
}

export const Card: React.FC<CardProps> = ({ children, className = '', ...props }) => {
  return (
    <div
      className={`bg-white rounded-xl border border-[#E5E7EB] shadow-[0_1px_3px_0_rgba(0,0,0,0.04)] transition-all ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

export const CardHeader: React.FC<{
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}> = ({ title, subtitle, action, children, className = '' }) => {
  if (children) {
    return (
      <div className={`p-6 border-b border-[#E5E7EB] ${className}`}>
        {children}
      </div>
    );
  }

  return (
    <div className={`p-6 border-b border-[#E5E7EB] flex items-center justify-between ${className}`}>
      <div>
        {title && <h3 className="text-base font-semibold text-[#171513] tracking-tight">{title}</h3>}
        {subtitle && <p className="text-sm text-[#6B7280] font-normal mt-0.5">{subtitle}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
};

export const CardContent: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = '' }) => {
  return <div className={`p-6 ${className}`}>{children}</div>;
};
