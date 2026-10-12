import React from 'react';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  icon?: LucideIcon;
  variant?: 'cyan' | 'red' | 'amber' | 'emerald' | 'default';
  alert?: boolean;
  className?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  subtext,
  icon: Icon,
  variant = 'default',
  alert = false,
  className = '',
}) => {
  const accentColors = {
    default: 'text-slate-800 dark:text-surveillance-200 border-slate-200 dark:border-surveillance-700/80',
    cyan: 'text-blue-600 dark:text-tactical-cyan border-blue-200 dark:border-tactical-cyan/40 bg-blue-50/50 dark:bg-tactical-cyan/[0.02]',
    red: 'text-red-600 dark:text-tactical-red border-red-200 dark:border-tactical-red/40 bg-red-50/50 dark:bg-tactical-red/[0.03]',
    amber: 'text-amber-600 dark:text-tactical-amber border-amber-200 dark:border-tactical-amber/40 bg-amber-50/50 dark:bg-tactical-amber/[0.02]',
    emerald: 'text-emerald-600 dark:text-tactical-emerald border-emerald-200 dark:border-tactical-emerald/40 bg-emerald-50/50 dark:bg-tactical-emerald/[0.02]',
  };

  const iconColors = {
    default: 'text-slate-500 dark:text-surveillance-400',
    cyan: 'text-blue-600 dark:text-tactical-cyan',
    red: 'text-red-600 dark:text-tactical-red',
    amber: 'text-amber-600 dark:text-tactical-amber',
    emerald: 'text-emerald-600 dark:text-tactical-emerald',
  };

  return (
    <div
      className={`relative overflow-hidden bg-white dark:bg-surveillance-850 border rounded-sm p-3.5 transition-all duration-200 hover:border-slate-300 dark:hover:border-surveillance-600 ${accentColors[variant]} ${alert ? 'animate-pulse border-red-500 dark:border-tactical-red/60 shadow-[0_0_15px_rgba(239,68,68,0.15)]' : ''} ${className}`}
    >
      {/* Corner accents */}
      <div className="absolute top-0 left-0 w-1.5 h-1.5 border-t border-l border-current opacity-30 dark:opacity-40" />
      <div className="absolute top-0 right-0 w-1.5 h-1.5 border-t border-r border-current opacity-30 dark:opacity-40" />
      <div className="absolute bottom-0 left-0 w-1.5 h-1.5 border-b border-l border-current opacity-30 dark:opacity-40" />
      <div className="absolute bottom-0 right-0 w-1.5 h-1.5 border-b border-r border-current opacity-30 dark:opacity-40" />

      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="text-[10px] font-mono tracking-wider uppercase text-slate-500 dark:text-surveillance-400 font-semibold block">
            {label}
          </span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-mono font-bold tracking-tight text-slate-900 dark:text-surveillance-100">
              {value}
            </span>
          </div>
          {subtext && (
            <p className="mt-1 text-[11px] font-mono text-slate-500 dark:text-surveillance-400 flex items-center gap-1">
              {subtext}
            </p>
          )}
        </div>

        {Icon && (
          <div className={`p-2 rounded-sm bg-slate-100 dark:bg-surveillance-800/80 border border-slate-200 dark:border-surveillance-700/60 ${iconColors[variant]}`}>
            <Icon className="w-4 h-4" />
          </div>
        )}
      </div>
    </div>
  );
};
