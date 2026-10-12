import React, { useState } from 'react';
import type { EventSeverity, EventType } from '../../types/event';
import { useSurveillance } from '../../context/SurveillanceContext';
import { Button } from '../common/Button';
import { 
  AlertTriangle, 
  ShieldAlert, 
  Info, 
  CheckCircle2, 
  Clock 
} from 'lucide-react';

interface EventTimelineProps {
  limit?: number;
  showFilters?: boolean;
}

export type TimelineFilter = 'ALL' | 'VIOLATIONS' | 'WARNINGS';

export const EventTimeline: React.FC<EventTimelineProps> = ({
  limit,
  showFilters = true,
}) => {
  const { events, acknowledgeEvent } = useSurveillance();
  const [filter, setFilter] = useState<TimelineFilter>('ALL');

  const filtered = events.filter((ev) => {
    if (filter === 'VIOLATIONS') {
      return ev.type === 'ZONE_VIOLATION' || ev.severity === 'CRITICAL';
    }
    if (filter === 'WARNINGS') {
      return ev.severity === 'WARNING' || ev.severity === 'HIGH' || ev.type === 'UNKNOWN_OBJECT';
    }
    return true;
  });

  const displayList = limit ? filtered.slice(0, limit) : filtered;

  const formatEventName = (type: EventType) => {
    switch (type) {
      case 'ZONE_VIOLATION': return 'Zone Violation';
      case 'ZONE_ENTRY': return 'Zone Entry';
      case 'UNKNOWN_OBJECT': return 'Unknown Object';
      case 'OBJECT_DETECTED': return 'Object Detected';
      case 'OBJECT_ENTERED': return 'Target Entered';
      case 'OBJECT_LEFT': return 'Target Exited';
      default: return 'Security Notice';
    }
  };

  return (
    <div className="bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded p-4 space-y-4">
      {/* Header & Simple Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Security Events</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Log of perimeter breaches, detected targets, and warnings
          </p>
        </div>

        {showFilters && (
          <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-900 p-1 rounded border border-slate-200 dark:border-slate-800 text-xs">
            {(['ALL', 'VIOLATIONS', 'WARNINGS'] as TimelineFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                  filter === f
                    ? 'bg-blue-600 text-white font-semibold shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Events Table (Desktop: md+) / Cards (Mobile: <md) */}
      {displayList.length === 0 ? (
        <div className="py-8 text-center text-xs text-slate-500">
          No security events recorded.
        </div>
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-[11px]">
                  <th className="pb-2 font-medium">Time</th>
                  <th className="pb-2 font-medium">Event</th>
                  <th className="pb-2 font-medium">Object</th>
                  <th className="pb-2 font-medium">Zone</th>
                  <th className="pb-2 font-medium text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {displayList.map((ev) => {
                  const isViolation = ev.type === 'ZONE_VIOLATION' || ev.severity === 'CRITICAL';
                  const isWarning = ev.type === 'UNKNOWN_OBJECT' || ev.severity === 'HIGH' || ev.severity === 'WARNING';

                  return (
                    <tr key={ev.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-2.5 font-mono text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {ev.timestamp.split('T')[1]?.slice(0, 8) || ev.timestamp}
                      </td>

                      <td className="py-2.5 font-medium">
                        <span className={`inline-flex items-center gap-1.5 ${
                          isViolation ? 'text-red-600 dark:text-red-400 font-semibold' : isWarning ? 'text-amber-600 dark:text-amber-400 font-medium' : 'text-slate-800 dark:text-slate-200'
                        }`}>
                          {isViolation ? <ShieldAlert className="w-3.5 h-3.5" /> : isWarning ? <AlertTriangle className="w-3.5 h-3.5" /> : <Info className="w-3.5 h-3.5 text-slate-400" />}
                          <span>{formatEventName(ev.type)}</span>
                        </span>
                      </td>

                      <td className="py-2.5 text-slate-700 dark:text-slate-300">
                        {ev.objectClass ? (
                          <span>
                            {ev.objectClass} {ev.trackingId ? `#${ev.trackingId}` : ''}
                          </span>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-500">—</span>
                        )}
                      </td>

                      <td className="py-2.5 text-slate-700 dark:text-slate-300">
                        {ev.zoneName || <span className="text-slate-400 dark:text-slate-500">—</span>}
                      </td>

                      <td className="py-2.5 text-right whitespace-nowrap">
                        {ev.acknowledged ? (
                          <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Acknowledged</span>
                          </span>
                        ) : (
                          <button
                            onClick={() => acknowledgeEvent(ev.id)}
                            className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 dark:border-slate-700 transition-colors cursor-pointer"
                          >
                            Acknowledge
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View (< md) */}
          <div className="md:hidden space-y-2.5">
            {displayList.map((ev) => {
              const isViolation = ev.type === 'ZONE_VIOLATION' || ev.severity === 'CRITICAL';
              const isWarning = ev.type === 'UNKNOWN_OBJECT' || ev.severity === 'HIGH' || ev.severity === 'WARNING';
              const timeDisplay = ev.timestamp.split('T')[1]?.slice(0, 8) || ev.timestamp;

              return (
                <div
                  key={ev.id}
                  className={`p-3 rounded border transition-colors ${
                    isViolation
                      ? 'bg-red-50/50 dark:bg-red-950/20 border-red-200 dark:border-red-900/50'
                      : isWarning
                      ? 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/50'
                      : 'bg-slate-50/80 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800'
                  }`}
                >
                  {/* Top row: Event Type and Action */}
                  <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200/60 dark:border-slate-800/60">
                    <span className={`inline-flex items-center gap-1.5 text-xs ${
                      isViolation
                        ? 'text-red-600 dark:text-red-400 font-bold'
                        : isWarning
                        ? 'text-amber-600 dark:text-amber-400 font-semibold'
                        : 'text-slate-800 dark:text-slate-200 font-medium'
                    }`}>
                      {isViolation ? <ShieldAlert className="w-3.5 h-3.5 shrink-0" /> : isWarning ? <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> : <Info className="w-3.5 h-3.5 shrink-0 text-slate-400" />}
                      <span>{formatEventName(ev.type)}</span>
                    </span>

                    {ev.acknowledged ? (
                      <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium inline-flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Acknowledged</span>
                      </span>
                    ) : (
                      <button
                        onClick={() => acknowledgeEvent(ev.id)}
                        className="px-2.5 py-1 min-h-[30px] rounded text-[11px] font-medium bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 dark:border-slate-700 transition-colors shadow-2xs cursor-pointer"
                      >
                        Acknowledge
                      </button>
                    )}
                  </div>

                  {/* Bottom row: Object, Zone, and Timestamp */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 text-[11px] text-slate-600 dark:text-slate-400">
                    <div className="flex items-center gap-2">
                      {ev.objectClass && (
                        <span className="px-1.5 py-0.5 rounded bg-slate-200/70 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium">
                          {ev.objectClass} {ev.trackingId ? `#${ev.trackingId}` : ''}
                        </span>
                      )}
                      {ev.zoneName && (
                        <span className="text-slate-500 dark:text-slate-400">
                          Zone: <strong className="text-slate-700 dark:text-slate-300">{ev.zoneName}</strong>
                        </span>
                      )}
                    </div>

                    <span className="font-mono text-slate-500 dark:text-slate-400 flex items-center gap-1 ml-auto">
                      <Clock className="w-3 h-3" />
                      {timeDisplay}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};
