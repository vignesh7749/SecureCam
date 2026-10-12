import React, { useState } from 'react';
import { 
  Shield, 
  Bell, 
  Volume2, 
  VolumeX, 
  Video, 
  Clock, 
  AlertCircle,
  Sun,
  Moon,
  Tv,
  BookOpen
} from 'lucide-react';
import { useSurveillance } from '../../context/SurveillanceContext';
import { useTheme } from '../../context/ThemeContext';
import { useClock } from '../../hooks/useClock';
import { SecurityAlertsPopover } from '../common/SecurityAlertsPopover';

interface HeaderProps {
  onOpenViolations?: () => void;
  onOpenTutorial?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenViolations, onOpenTutorial }) => {
  const { 
    activeSource, 
    activeViolations, 
    events,
    settings, 
    updateSettings, 
    backendHealth,
    backendError,
    clearBackendError,
    setActiveTab,
  } = useSurveillance();
  const { theme, toggleTheme } = useTheme();
  const { formattedLocal } = useClock();

  const [isAlertsOpen, setIsAlertsOpen] = useState(false);

  const toggleSound = () => {
    updateSettings({ alarmAudioEnabled: !settings.alarmAudioEnabled });
  };

  // Only count meaningful security events (active violations + unread critical/high alerts)
  const activeViolationCount = activeViolations.filter(v => v.status === 'ACTIVE').length;
  const unacknowledgedSecurityEvents = events.filter(e => 
    !e.acknowledged && (
      e.type === 'ZONE_VIOLATION' || 
      e.severity === 'CRITICAL' || 
      e.severity === 'HIGH' || 
      e.type === 'ANOMALY'
    )
  ).length;
  const totalUnreadAlerts = activeViolationCount + unacknowledgedSecurityEvents;

  const isBackendHealthy = !!backendHealth && !backendError;

  return (
    <>
      <header className="h-14 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 flex items-center justify-between select-none sticky top-0 z-30 transition-colors duration-150">
        {/* Brand & Project Identity */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-blue-600/10 dark:bg-blue-600/20 border border-blue-500/20 dark:border-blue-500/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                  Secure<span className="text-blue-600 dark:text-blue-400">Cam</span>
                </span>
                <span className="text-[10px] text-slate-600 dark:text-slate-400 px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-medium">
                  CV Project
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:block">
                Video-based security monitoring and object detection
              </p>
            </div>
          </div>
        </div>

        {/* Center: Active Video Name (if selected) */}
        {activeSource.name && (
          <div className="hidden lg:flex items-center gap-2 px-3 py-1 bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 rounded text-xs">
            <Video className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
            <span className="text-slate-500 dark:text-slate-400">Video:</span>
            <span className="font-medium text-slate-800 dark:text-slate-200 max-w-[200px] truncate">
              {activeSource.name}
            </span>
          </div>
        )}

        {/* Right Navigation & Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2.5">
          {/* Live Feed Header Quick Link */}
          <button
            onClick={() => setActiveTab('live-camera')}
            title="Open Live Feed"
            className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium border text-blue-700 bg-blue-50 dark:bg-blue-950/40 dark:text-blue-300 border-blue-200 dark:border-blue-800/80 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors cursor-pointer"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <Tv className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>Live Feed</span>
          </button>

          {/* Tutorial Button */}
          <button
            onClick={onOpenTutorial}
            title="Open First-Time Tutorial Guide"
            className="flex items-center justify-center gap-1.5 px-2 sm:px-3 py-1.5 sm:py-1 rounded text-xs font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 dark:bg-slate-800 dark:text-blue-400 dark:border-slate-700 dark:hover:bg-slate-700/80 transition-colors cursor-pointer min-w-[34px] min-h-[34px]"
            aria-label="Tutorial Guide"
          >
            <BookOpen className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span className="hidden sm:inline">Tutorial</span>
          </button>

          {/* Backend / Demo Mode Status Dot / Pill */}
          <div 
            title={
              isBackendHealthy 
                ? 'Backend: Connected (Live FastAPI)' 
                : 'Demo Mode: Active with precomputed benchmark data. FastAPI backend is offline.'
            }
            className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 sm:py-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-xs min-h-[34px]"
          >
            <span className={`w-2 h-2 rounded-full ${isBackendHealthy ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            <span className="text-slate-600 dark:text-slate-300 hidden sm:inline">
              {isBackendHealthy ? 'Backend:' : 'Mode:'}
            </span>
            <span className={`font-medium ${isBackendHealthy ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
              {isBackendHealthy ? 'Connected' : 'Demo Mode'}
            </span>
          </div>

          {/* Theme Toggle (Dark / Light) */}
          <button
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            className="flex items-center justify-center p-1.5 sm:px-2.5 sm:py-1 rounded text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 dark:border-slate-700 transition-colors cursor-pointer min-w-[34px] min-h-[34px]"
            aria-label="Toggle Theme"
          >
            {theme === 'dark' ? (
              <>
                <Sun className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden sm:inline ml-1.5">Light</span>
              </>
            ) : (
              <>
                <Moon className="w-3.5 h-3.5 text-blue-600" />
                <span className="hidden sm:inline ml-1.5">Dark</span>
              </>
            )}
          </button>

          {/* Audio Siren Toggle */}
          <button
            onClick={toggleSound}
            title={settings.alarmAudioEnabled ? 'Alert Sound: ON (Click to mute)' : 'Alert Sound: OFF (Click to unmute)'}
            className={`p-1.5 rounded transition-colors cursor-pointer min-w-[34px] min-h-[34px] flex items-center justify-center ${
              settings.alarmAudioEnabled
                ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/50 hover:bg-blue-100 dark:hover:bg-blue-900/60'
                : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
            }`}
            aria-label="Toggle Alert Audio"
          >
            {settings.alarmAudioEnabled ? (
              <Volume2 className="w-4 h-4" />
            ) : (
              <VolumeX className="w-4 h-4 text-slate-400" />
            )}
          </button>

          {/* Active Security Alerts Bell with Popover */}
          <div className="relative">
            <button
              onClick={() => setIsAlertsOpen(prev => !prev)}
              title={totalUnreadAlerts > 0 ? `${totalUnreadAlerts} Security Alerts` : 'Security Alerts (All Clear)'}
              className={`relative p-1.5 rounded transition-colors cursor-pointer ${
                totalUnreadAlerts > 0
                  ? 'text-red-600 dark:text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 border border-transparent'
              }`}
              aria-label="Open Security Alerts"
            >
              <Bell className="w-4 h-4" />
              {totalUnreadAlerts > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] px-1 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white shadow-xs">
                  {totalUnreadAlerts}
                </span>
              )}
            </button>

            {/* Dedicated Security Alerts Dropdown Popover */}
            <SecurityAlertsPopover 
              isOpen={isAlertsOpen} 
              onClose={() => setIsAlertsOpen(false)}
              onViewEvent={() => {
                setIsAlertsOpen(false);
                onOpenViolations?.();
              }}
            />
          </div>

          {/* Clock (hidden on mobile) */}
          <div className="hidden xl:flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 border-l border-slate-200 dark:border-slate-800 pl-2.5">
            <Clock className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
            <span>{formattedLocal}</span>
          </div>
        </div>
      </header>

      {/* Backend Status / Error Banner */}
      {backendError && (
        <div className="bg-amber-500/10 border-b border-amber-500/30 px-4 py-2 flex items-center justify-between text-xs text-amber-900 dark:text-amber-300">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span>{backendError}</span>
          </div>
          <button
            onClick={clearBackendError}
            className="px-2 py-0.5 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 text-xs"
          >
            Dismiss
          </button>
        </div>
      )}
    </>
  );
};
