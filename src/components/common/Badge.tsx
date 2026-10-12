import React from 'react';

export type BadgeVariant = 
  | 'critical' 
  | 'high' 
  | 'warning' 
  | 'info' 
  | 'success' 
  | 'neutral' 
  | 'cyan' 
  | 'demo' 
  | 'coming_soon';

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: 'xs' | 'sm' | 'md';
  pulse?: boolean;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'neutral',
  size = 'sm',
  pulse = false,
  className = '',
}) => {
  const variantStyles: Record<BadgeVariant, string> = {
    critical: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30',
    high: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30',
    warning: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30',
    info: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30',
    success: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
    neutral: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700',
    cyan: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30',
    demo: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30',
    coming_soon: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30',
  };

  const sizeStyles = {
    xs: 'px-1.5 py-0.5 text-[10px]',
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-xs font-semibold',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-sans font-medium rounded border ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
    >
      {pulse && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-75"></span>
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-current"></span>
        </span>
      )}
      {children}
    </span>
  );
};
