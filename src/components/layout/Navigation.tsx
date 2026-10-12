import React, { useState } from 'react';
import { 
  LayoutDashboard, 
  Video, 
  ShieldAlert, 
  AlertTriangle, 
  FileText, 
  Settings2,
  Tv,
  MoreHorizontal,
  X,
  BookOpen,
  ChevronRight
} from 'lucide-react';
import { useSurveillance } from '../../context/SurveillanceContext';

export type NavTabId = 
  | 'dashboard'
  | 'video-analysis' 
  | 'emergency-zones' 
  | 'events' 
  | 'reports' 
  | 'settings'
  | 'live-camera'
  // Backward compatibility aliases
  | 'command-center'
  | 'live-monitor'
  | 'object-intelligence'
  | 'analytics'
  | 'system';

interface NavigationProps {
  activeTab: NavTabId;
  onTabChange: (tab: NavTabId) => void;
  onOpenTutorial?: () => void;
}

interface NavItem {
  id: NavTabId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  badgeVariant?: 'critical' | 'warning' | 'neutral';
}

export const Navigation: React.FC<NavigationProps> = ({ 
  activeTab, 
  onTabChange,
  onOpenTutorial 
}) => {
  const { activeViolations, zones, events } = useSurveillance();
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  const unacknowledgedEvents = events.filter(e => !e.acknowledged).length;
  const activeViolationCount = activeViolations.filter(v => v.status === 'ACTIVE').length;

  const navItems: NavItem[] = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
      badge: activeViolationCount > 0 ? `${activeViolationCount}` : undefined,
      badgeVariant: 'critical',
    },
    {
      id: 'live-camera',
      label: 'Live Feed',
      icon: Tv,
    },
    {
      id: 'video-analysis',
      label: 'Video Analysis',
      icon: Video,
    },
    {
      id: 'emergency-zones',
      label: 'Emergency Zones',
      icon: ShieldAlert,
      badge: activeViolationCount > 0 ? `${activeViolationCount}` : (zones.length > 0 ? `${zones.length}` : undefined),
      badgeVariant: activeViolationCount > 0 ? 'critical' : 'neutral',
    },
    {
      id: 'events',
      label: 'Events',
      icon: AlertTriangle,
      badge: unacknowledgedEvents > 0 ? `${unacknowledgedEvents}` : undefined,
      badgeVariant: 'neutral',
    },
    {
      id: 'reports',
      label: 'Reports',
      icon: FileText,
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: Settings2,
    },
  ];

  // Resolve active tab aliases
  const resolvedTab: NavTabId = 
    activeTab === 'command-center' ? 'dashboard' :
    activeTab === 'live-monitor' ? 'live-camera' :
    activeTab === 'system' ? 'settings' :
    activeTab;

  const isMoreTabActive = 
    resolvedTab === 'emergency-zones' || 
    resolvedTab === 'reports' || 
    resolvedTab === 'settings';

  const handleMobileNavSelect = (tab: NavTabId) => {
    setIsMoreOpen(false);
    onTabChange(tab);
  };

  return (
    <>
      {/* ======================================================== */}
      {/* 1. DESKTOP NAVIGATION BAR (Desktop & Tablet Landscape) */}
      {/* ======================================================== */}
      <nav className="hidden md:block bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 select-none transition-colors duration-150">
        <div className="flex items-center space-x-1 py-1.5 overflow-x-auto scrollbar-none w-full max-w-7xl mx-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = resolvedTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-medium transition-colors shrink-0 cursor-pointer ${
                  isActive
                    ? 'bg-blue-50 text-blue-600 dark:bg-slate-800 dark:text-blue-400 font-semibold border border-blue-200 dark:border-slate-700'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60 border border-transparent'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'}`} />
                <span>{item.label}</span>

                {item.badge && (
                  <span
                    className={`px-1.5 py-0.2 text-[10px] font-semibold rounded ${
                      item.badgeVariant === 'critical'
                        ? 'bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* ======================================================== */}
      {/* 2. MOBILE BOTTOM NAVIGATION (Portrait & Mobile Phones)   */}
      {/* ======================================================== */}
      <div 
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 select-none shadow-lg transition-colors"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="grid grid-cols-5 h-14 items-center">
          {/* 1. Home */}
          <button
            onClick={() => handleMobileNavSelect('dashboard')}
            className={`flex flex-col items-center justify-center h-full w-full py-1 text-[10px] font-medium transition-colors ${
              resolvedTab === 'dashboard'
                ? 'text-blue-600 dark:text-blue-400 font-bold'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
            aria-label="Dashboard Home"
          >
            <LayoutDashboard className={`w-5 h-5 mb-0.5 ${resolvedTab === 'dashboard' ? 'stroke-[2.5]' : ''}`} />
            <span>Home</span>
          </button>

          {/* 2. Video Analysis */}
          <button
            onClick={() => handleMobileNavSelect('video-analysis')}
            className={`flex flex-col items-center justify-center h-full w-full py-1 text-[10px] font-medium transition-colors ${
              resolvedTab === 'video-analysis'
                ? 'text-blue-600 dark:text-blue-400 font-bold'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
            aria-label="Video Analysis"
          >
            <Video className={`w-5 h-5 mb-0.5 ${resolvedTab === 'video-analysis' ? 'stroke-[2.5]' : ''}`} />
            <span>Analysis</span>
          </button>

          {/* 3. Live Feed */}
          <button
            onClick={() => handleMobileNavSelect('live-camera')}
            className={`flex flex-col items-center justify-center h-full w-full py-1 text-[10px] font-medium transition-colors ${
              resolvedTab === 'live-camera'
                ? 'text-blue-600 dark:text-blue-400 font-bold'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
            aria-label="Live Camera Feed"
          >
            <div className="relative">
              <Tv className={`w-5 h-5 mb-0.5 ${resolvedTab === 'live-camera' ? 'stroke-[2.5]' : ''}`} />
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 absolute -top-0.5 -right-0.5 animate-pulse" />
            </div>
            <span>Live</span>
          </button>

          {/* 4. Alerts / Events */}
          <button
            onClick={() => handleMobileNavSelect('events')}
            className={`flex flex-col items-center justify-center h-full w-full py-1 text-[10px] font-medium transition-colors relative ${
              resolvedTab === 'events'
                ? 'text-blue-600 dark:text-blue-400 font-bold'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
            aria-label="Security Alerts and Events"
          >
            <div className="relative">
              <AlertTriangle className={`w-5 h-5 mb-0.5 ${resolvedTab === 'events' ? 'stroke-[2.5]' : ''}`} />
              {(activeViolationCount > 0 || unacknowledgedEvents > 0) && (
                <span className="absolute -top-1 -right-2 px-1 py-0.2 bg-red-600 text-white font-bold rounded-full text-[9px] min-w-[15px] text-center leading-tight">
                  {activeViolationCount > 0 ? activeViolationCount : unacknowledgedEvents}
                </span>
              )}
            </div>
            <span>Alerts</span>
          </button>

          {/* 5. More (Emergency Zones, Reports, Settings, Tutorial) */}
          <button
            onClick={() => setIsMoreOpen(true)}
            className={`flex flex-col items-center justify-center h-full w-full py-1 text-[10px] font-medium transition-colors relative ${
              isMoreTabActive
                ? 'text-blue-600 dark:text-blue-400 font-bold'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
            aria-label="More Features"
          >
            <div className="relative">
              <MoreHorizontal className={`w-5 h-5 mb-0.5 ${isMoreTabActive ? 'stroke-[2.5]' : ''}`} />
              {isMoreTabActive && (
                <span className="w-1.5 h-1.5 rounded-full bg-blue-600 dark:bg-blue-400 absolute -top-0.5 -right-0.5" />
              )}
            </div>
            <span>More</span>
          </button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 3. MOBILE "MORE" BOTTOM SHEET DRAWER                     */}
      {/* ======================================================== */}
      {isMoreOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end">
          {/* Backdrop */}
          <div 
            onClick={() => setIsMoreOpen(false)}
            className="fixed inset-0 bg-slate-950/70 dark:bg-black/80 backdrop-blur-xs transition-opacity"
          />

          {/* Bottom Drawer */}
          <div 
            className="relative bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 rounded-t-2xl shadow-2xl p-4 space-y-3 z-10 animate-in slide-in-from-bottom duration-150"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}
          >
            {/* Handle bar */}
            <div className="w-10 h-1 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto -mt-1 mb-2" />

            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">More Sections</h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Security zones, reports &amp; preferences</p>
              </div>
              <button
                onClick={() => setIsMoreOpen(false)}
                className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Close menu"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-2 pt-1">
              {/* Emergency Zones */}
              <button
                onClick={() => handleMobileNavSelect('emergency-zones')}
                className={`flex items-center justify-between p-3 rounded-lg border text-left transition-colors min-h-[48px] ${
                  resolvedTab === 'emergency-zones'
                    ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-300 dark:border-blue-800 text-blue-700 dark:text-blue-300 font-semibold'
                    : 'bg-slate-50 dark:bg-slate-850 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20 flex items-center justify-center">
                    <ShieldAlert className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-semibold block">Emergency Zones</span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block">Perimeter drawing &amp; dwell alarms</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {zones.length > 0 && (
                    <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                      {zones.length}
                    </span>
                  )}
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </div>
              </button>

              {/* Reports */}
              <button
                onClick={() => handleMobileNavSelect('reports')}
                className={`flex items-center justify-between p-3 rounded-lg border text-left transition-colors min-h-[48px] ${
                  resolvedTab === 'reports'
                    ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-300 dark:border-blue-800 text-blue-700 dark:text-blue-300 font-semibold'
                    : 'bg-slate-50 dark:bg-slate-850 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 flex items-center justify-center">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-semibold block">Reports</span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block">Export PDF, CSV &amp; JSON data</span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </button>

              {/* Settings */}
              <button
                onClick={() => handleMobileNavSelect('settings')}
                className={`flex items-center justify-between p-3 rounded-lg border text-left transition-colors min-h-[48px] ${
                  resolvedTab === 'settings'
                    ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-300 dark:border-blue-800 text-blue-700 dark:text-blue-300 font-semibold'
                    : 'bg-slate-50 dark:bg-slate-850 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 flex items-center justify-center">
                    <Settings2 className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-semibold block">Settings</span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block">Presets, theme &amp; thresholds</span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </button>

              {/* Tutorial Guide */}
              {onOpenTutorial && (
                <button
                  onClick={() => {
                    setIsMoreOpen(false);
                    onOpenTutorial();
                  }}
                  className="flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-850 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors min-h-[48px]"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center justify-center">
                      <BookOpen className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-xs font-semibold block">Tutorial Guide</span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 block">Re-open interactive walkthrough</span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
