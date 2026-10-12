import React, { useEffect, useRef } from 'react';
import { 
  ShieldAlert, 
  AlertTriangle, 
  CheckCircle2, 
  Check, 
  Trash2, 
  ArrowRight,
  X,
  Clock
} from 'lucide-react';
import { useSurveillance } from '../../context/SurveillanceContext';

interface SecurityAlertsPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  onViewEvent: () => void;
}

export const SecurityAlertsPopover: React.FC<SecurityAlertsPopoverProps> = ({
  isOpen,
  onClose,
  onViewEvent,
}) => {
  const { 
    activeViolations, 
    events, 
    acknowledgeViolation, 
    acknowledgeEvent, 
    acknowledgeAllEvents, 
    clearAllEvents 
  } = useSurveillance();

  const popoverRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Filter ONLY meaningful security events (exclude standard detection logs like 'OBJECT_DETECTED')
  const securityEvents = events.filter(e => 
    e.type === 'ZONE_VIOLATION' || 
    e.severity === 'CRITICAL' || 
    e.severity === 'HIGH' || 
    e.type === 'ANOMALY' ||
    e.type === 'UNKNOWN_OBJECT'
  );

  const activeZoneViolations = activeViolations.filter(v => v.status === 'ACTIVE');
  const unreadEventsCount = securityEvents.filter(e => !e.acknowledged).length;
  const totalUnreadCount = activeZoneViolations.length + unreadEventsCount;

  return (
    <div 
      ref={popoverRef}
      className="absolute -right-2 sm:right-0 top-12 z-50 w-[calc(100vw-24px)] max-w-sm sm:w-96 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-2xl overflow-hidden select-none animate-in fade-in zoom-in-95 duration-100"
    >
      {/* Header */}
      <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-850 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-red-500/10 text-red-600 dark:text-red-400 flex items-center justify-center">
            <ShieldAlert className="w-3.5 h-3.5" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              Security Alerts
            </h4>
          </div>
          {totalUnreadCount > 0 ? (
            <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30">
              {totalUnreadCount} New
            </span>
          ) : (
            <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
              All Clear
            </span>
          )}
        </div>

        {/* Global Alert Actions */}
        <div className="flex items-center gap-1.5">
          {totalUnreadCount > 0 && (
            <button
              onClick={acknowledgeAllEvents}
              title="Mark all as read"
              className="text-[11px] font-medium text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 px-1.5 py-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
            >
              Mark Read
            </button>
          )}
          {(activeZoneViolations.length > 0 || securityEvents.length > 0) && (
            <button
              onClick={clearAllEvents}
              title="Clear all alerts"
              className="text-[11px] font-medium text-slate-600 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 px-1.5 py-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
            >
              Clear All
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded"
            title="Close"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Alerts Body */}
      <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
        {/* Active Zone Violations (Highest Priority) */}
        {activeZoneViolations.map((viol) => (
          <div 
            key={`active-${viol.id}`}
            className="p-3 bg-red-50/60 dark:bg-red-950/20 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2">
                <span className="flex h-2 w-2 relative mt-1 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-600"></span>
                </span>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-red-600 dark:text-red-400 text-[11px] uppercase tracking-wide">
                      Active Breach
                    </span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                      {viol.zoneName}
                    </span>
                  </div>
                  <p className="text-slate-800 dark:text-slate-200 font-medium text-xs mt-0.5">
                    <span className="capitalize">{viol.objectClass}</span> #{viol.trackingId} lingering in zone
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Dwell time: <span className="font-semibold text-red-600 dark:text-red-400">{viol.dwellTimeSeconds.toFixed(1)}s</span> (Limit: {viol.thresholdSeconds}s)
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-1 items-end shrink-0">
                <button
                  onClick={() => {
                    onClose();
                    onViewEvent();
                  }}
                  className="px-2 py-0.5 text-[10px] font-semibold bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
                >
                  VIEW EVENT
                </button>
                <button
                  onClick={() => acknowledgeViolation(viol.id)}
                  title="Dismiss violation"
                  className="text-[10px] text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        ))}

        {/* Meaningful Security Log Events */}
        {securityEvents.slice(0, 15).map((ev) => (
          <div 
            key={`event-${ev.id}`}
            className={`p-3 transition-colors ${
              !ev.acknowledged 
                ? 'bg-amber-50/40 dark:bg-amber-950/10 hover:bg-amber-50/70 dark:hover:bg-amber-950/20' 
                : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2">
                <div className="mt-0.5 shrink-0">
                  {ev.severity === 'CRITICAL' ? (
                    <ShieldAlert className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[10px] font-bold uppercase ${
                      ev.severity === 'CRITICAL' 
                        ? 'text-red-600 dark:text-red-400' 
                        : 'text-amber-600 dark:text-amber-400'
                    }`}>
                      {ev.type.replace('_', ' ')}
                    </span>
                    {!ev.acknowledged && (
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                    )}
                  </div>
                  <p className="text-slate-800 dark:text-slate-200 text-xs mt-0.5 leading-snug">
                    {ev.description}
                  </p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {ev.timestamp.split(' ')[1] || ev.timestamp}
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-1 items-end shrink-0">
                <button
                  onClick={() => {
                    onClose();
                    onViewEvent();
                  }}
                  className="px-2 py-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded border border-blue-200 dark:border-blue-800/60 transition-colors"
                >
                  VIEW EVENT
                </button>
                {!ev.acknowledged && (
                  <button
                    onClick={() => acknowledgeEvent(ev.id)}
                    title="Mark as read"
                    className="text-[10px] text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                  >
                    Mark read
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}

        {/* Clean Empty State */}
        {activeZoneViolations.length === 0 && securityEvents.length === 0 && (
          <div className="py-8 px-4 text-center">
            <CheckCircle2 className="w-7 h-7 text-emerald-500 mx-auto mb-2" />
            <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              No Active Security Alerts
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              All monitored emergency zones and perimeters are currently secure.
            </p>
          </div>
        )}
      </div>

      {/* Footer Deep Link */}
      <div className="p-2.5 bg-slate-50 dark:bg-slate-850 border-t border-slate-200 dark:border-slate-800 text-center">
        <button
          onClick={() => {
            onClose();
            onViewEvent();
          }}
          className="w-full flex items-center justify-center gap-1.5 py-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
        >
          <span>Open Full Events Log</span>
          <ArrowRight className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
};
