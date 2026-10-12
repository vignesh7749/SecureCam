import React from 'react';
import { useSurveillance } from '../../context/SurveillanceContext';
import { ShieldAlert, Check } from 'lucide-react';
import { Button } from '../common/Button';

export const ZoneViolationBanner: React.FC = () => {
  const { activeViolations, acknowledgeViolation } = useSurveillance();

  const unacknowledged = activeViolations.filter(v => v.status === 'ACTIVE');

  if (unacknowledged.length === 0) return null;

  const current = unacknowledged[0];

  return (
    <div className="bg-red-50 dark:bg-red-950/90 border-b border-red-200 dark:border-red-500/40 px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-xs text-red-900 dark:text-red-200 transition-colors">
      <div className="flex flex-wrap items-center gap-2">
        <ShieldAlert className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />

        <span className="px-2 py-0.5 bg-red-600 text-white text-[11px] font-semibold rounded">
          Zone Violation
        </span>

        <span className="text-slate-800 dark:text-slate-300 font-medium">
          {current.objectClass} #{current.trackingId}
        </span>

        <span className="text-slate-400 dark:text-slate-500">•</span>

        <span className="text-amber-800 dark:text-amber-300 font-semibold">
          {current.zoneName}
        </span>

        <span className="text-slate-400 dark:text-slate-500">•</span>

        <span className="text-red-700 dark:text-red-200 font-medium">
          Dwell time: {current.dwellTimeSeconds.toFixed(1)}s
        </span>

        {unacknowledged.length > 1 && (
          <span className="text-slate-600 dark:text-slate-400 text-[11px]">
            (+{unacknowledged.length - 1} more)
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => acknowledgeViolation(current.id)}
          icon={<Check className="w-3.5 h-3.5" />}
        >
          Acknowledge
        </Button>
      </div>
    </div>
  );
};
