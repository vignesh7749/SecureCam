import React from 'react';
import { EventTimeline } from '../components/events/EventTimeline';
import { useSurveillance } from '../context/SurveillanceContext';
import { ShieldAlert, Bell, CheckCircle2 } from 'lucide-react';

export const EventsPage: React.FC = () => {
  const { events } = useSurveillance();

  const violationsCount = events.filter(e => e.type === 'ZONE_VIOLATION' || e.severity === 'CRITICAL').length;
  const acknowledgedCount = events.filter(e => e.acknowledged).length;

  return (
    <div className="space-y-5">
      {/* Page Title */}
      <div className="border-b border-slate-200 dark:border-slate-800 pb-3">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">Security Events</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Chronological log of perimeter breaches, detected targets, and security notices
        </p>
      </div>

      {/* 3 Simple Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded p-3.5 flex items-center gap-3">
          <div className="p-2.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
            <Bell className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 block font-medium">Total Events</span>
            <span className="text-lg font-bold text-slate-900 dark:text-white">{events.length}</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded p-3.5 flex items-center gap-3">
          <div className="p-2.5 rounded bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20">
            <ShieldAlert className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 block font-medium">Violations</span>
            <span className={`text-lg font-bold ${violationsCount > 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-white'}`}>
              {violationsCount}
            </span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded p-3.5 flex items-center gap-3">
          <div className="p-2.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 block font-medium">Acknowledged</span>
            <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
              {acknowledgedCount} / {events.length}
            </span>
          </div>
        </div>
      </div>

      {/* Main Events Table */}
      <EventTimeline showFilters={true} />
    </div>
  );
};
