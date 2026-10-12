import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldAlert, X, ArrowRight } from 'lucide-react';
import { useSurveillance } from '../../context/SurveillanceContext';
import { ZoneViolation } from '../../types/zone';
import { playCriticalAlertSound } from '../../utils/audioAlert';

export const CriticalZoneAlertPopup: React.FC = () => {
  const { 
    activeViolations, 
    zones, 
    settings, 
    acknowledgeViolation, 
    setActiveTab 
  } = useSurveillance();

  const [currentAlert, setCurrentAlert] = useState<ZoneViolation | null>(null);

  // Tracks episodes that have already triggered an alert modal/sound during continuous presence
  const alertedEpisodeKeysRef = useRef<Set<string>>(new Set());
  // Tracks episodes manually dismissed by user during this presence
  const dismissedEpisodeKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const activeList = activeViolations.filter(v => v.status === 'ACTIVE');
    const activeKeys = new Set(
      activeList.map(v => `${v.zoneId}-${v.trackingId || v.objectId}`)
    );

    // 1. Cleanup resolved episodes (when object leaves zone or violation clears)
    for (const key of Array.from(alertedEpisodeKeysRef.current)) {
      if (!activeKeys.has(key)) {
        alertedEpisodeKeysRef.current.delete(key);
        dismissedEpisodeKeysRef.current.delete(key);
      }
    }

    // 2. Identify new active violation episodes
    for (const viol of activeList) {
      const epKey = `${viol.zoneId}-${viol.trackingId || viol.objectId}`;
      
      // If already alerted or dismissed in this episode, do not trigger a new alert popup
      if (alertedEpisodeKeysRef.current.has(epKey)) continue;

      const zone = zones.find(z => z.id === viol.zoneId);
      // Check if visual alert is enabled for this zone (default true)
      const isVisualAlertEnabled = zone ? (zone.alertActions?.visualAlert !== false) : true;
      if (!isVisualAlertEnabled) continue;

      // Mark this episode as alerted
      alertedEpisodeKeysRef.current.add(epKey);

      // Play alert sound if audio is enabled on zone and globally
      const isAudibleAlarmEnabled = zone ? (zone.alertActions?.audibleAlarm === true) : (viol.severity === 'critical');
      if (isAudibleAlarmEnabled && settings.alarmAudioEnabled) {
        playCriticalAlertSound(true);
      }

      // Display the alert popup
      setCurrentAlert(viol);
      break; // Show one active alert popup at a time to prevent UI spam
    }

    // 3. Keep current alert's live dwell time updated or dismiss if object left
    if (currentAlert) {
      const currentKey = `${currentAlert.zoneId}-${currentAlert.trackingId || currentAlert.objectId}`;
      if (!activeKeys.has(currentKey) || dismissedEpisodeKeysRef.current.has(currentKey)) {
        setCurrentAlert(null);
      } else {
        const liveMatch = activeList.find(
          v => `${v.zoneId}-${v.trackingId || v.objectId}` === currentKey
        );
        if (liveMatch && liveMatch.dwellTimeSeconds !== currentAlert.dwellTimeSeconds) {
          setCurrentAlert(liveMatch);
        }
      }
    }
  }, [activeViolations, zones, settings.alarmAudioEnabled, currentAlert]);

  const handleDismiss = () => {
    if (!currentAlert) return;
    const epKey = `${currentAlert.zoneId}-${currentAlert.trackingId || currentAlert.objectId}`;
    dismissedEpisodeKeysRef.current.add(epKey);
    acknowledgeViolation(currentAlert.id);
    setCurrentAlert(null);
  };

  const handleViewEvent = () => {
    if (!currentAlert) return;
    const epKey = `${currentAlert.zoneId}-${currentAlert.trackingId || currentAlert.objectId}`;
    dismissedEpisodeKeysRef.current.add(epKey);
    acknowledgeViolation(currentAlert.id);
    setCurrentAlert(null);
    setActiveTab('events');
  };

  return (
    <AnimatePresence>
      {currentAlert && (
        <motion.div
          key={`alert-${currentAlert.id}-${currentAlert.zoneId}`}
          initial={{ opacity: 0, y: 30, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          transition={{ duration: 0.2 }}
          className="fixed bottom-20 sm:bottom-6 right-3 sm:right-6 left-3 sm:left-auto z-50 sm:w-[400px] max-w-[calc(100vw-24px)] bg-white dark:bg-slate-900 border-2 border-red-500 dark:border-red-500 rounded-lg shadow-2xl p-3.5 sm:p-4 select-none"
          role="alert"
          aria-live="assertive"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-2 border-b border-red-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <span className="flex h-2.5 w-2.5 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-600"></span>
              </span>
              <div className="flex items-center gap-1.5 text-red-600 dark:text-red-400 font-bold text-xs tracking-wider uppercase">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>CRITICAL ZONE ALERT</span>
              </div>
            </div>
            <button
              onClick={handleDismiss}
              className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="Dismiss Alert"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Details */}
          <div className="py-3 space-y-1.5">
            <p className="text-sm font-semibold text-slate-900 dark:text-white leading-snug">
              <span className="capitalize">{currentAlert.objectClass}</span> #{currentAlert.trackingId < 10 ? `0${currentAlert.trackingId}` : currentAlert.trackingId} detected inside {currentAlert.zoneName}
            </p>
            <div className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-400">
              <span>
                Dwell time:{' '}
                <strong className="text-red-600 dark:text-red-400 font-bold">
                  {currentAlert.dwellTimeSeconds.toFixed(1)} seconds
                </strong>
              </span>
              <span>•</span>
              <span className="uppercase text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-950/80 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-900">
                {currentAlert.severity}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={handleDismiss}
              className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors"
            >
              DISMISS
            </button>
            <button
              type="button"
              onClick={handleViewEvent}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-red-600 hover:bg-red-700 active:bg-red-800 text-white rounded transition-colors shadow-xs"
            >
              <span>VIEW EVENT</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
