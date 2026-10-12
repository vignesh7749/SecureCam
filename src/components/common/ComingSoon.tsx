import React from 'react';
import { Clock, ShieldAlert, Sparkles } from 'lucide-react';
import { Badge } from './Badge';

interface ComingSoonBadgeProps {
  label?: string;
  className?: string;
  size?: 'xs' | 'sm';
}

export const ComingSoonBadge: React.FC<ComingSoonBadgeProps> = ({
  label = 'COMING SOON',
  className = '',
  size = 'xs',
}) => {
  return (
    <Badge variant="coming_soon" size={size} className={className}>
      <Clock className="w-2.5 h-2.5 text-purple-400" />
      <span>{label}</span>
    </Badge>
  );
};

interface ComingSoonBannerProps {
  title: string;
  description: string;
  eta?: string;
  className?: string;
}

export const ComingSoonBanner: React.FC<ComingSoonBannerProps> = ({
  title,
  description,
  eta = 'PLANNED FOR NEXT RELEASE',
  className = '',
}) => {
  return (
    <div
      className={`p-4 rounded-sm border border-purple-500/30 bg-purple-950/20 flex items-start gap-3.5 font-mono ${className}`}
    >
      <div className="p-2 rounded-sm bg-purple-900/40 border border-purple-500/40 text-purple-300 shrink-0">
        <Sparkles className="w-4 h-4" />
      </div>
      <div className="flex-1 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h4 className="text-xs font-bold uppercase tracking-wider text-purple-200">
            {title}
          </h4>
          <ComingSoonBadge size="xs" />
        </div>
        <p className="text-[11px] text-surveillance-300 leading-relaxed">
          {description}
        </p>
        <div className="pt-1 text-[10px] text-purple-400 font-semibold tracking-wider">
          STATUS: {eta}
        </div>
      </div>
    </div>
  );
};
