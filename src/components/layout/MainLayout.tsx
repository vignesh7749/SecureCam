import React from 'react';
import { Header } from './Header';
import { Navigation, NavTabId } from './Navigation';
import { ZoneViolationBanner } from '../zones/ZoneViolationBanner';
import { CriticalZoneAlertPopup } from '../zones/CriticalZoneAlertPopup';
import { motion, AnimatePresence } from 'framer-motion';

interface MainLayoutProps {
  activeTab: NavTabId;
  onTabChange: (tab: NavTabId) => void;
  onOpenTutorial?: () => void;
  children: React.ReactNode;
}

export const MainLayout: React.FC<MainLayoutProps> = ({
  activeTab,
  onTabChange,
  onOpenTutorial,
  children,
}) => {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 flex flex-col font-sans transition-colors duration-150">
      {/* Header */}
      <Header 
        onOpenViolations={() => onTabChange('events')} 
        onOpenTutorial={onOpenTutorial}
      />

      {/* Real-time Emergency Zone Breach Alert Banner */}
      <ZoneViolationBanner />

      {/* Critical Zone Alert Floating Popup Modal */}
      <CriticalZoneAlertPopup />

      {/* Primary Navigation (Dual Desktop Top Bar & Mobile Bottom Bar) */}
      <Navigation 
        activeTab={activeTab} 
        onTabChange={onTabChange} 
        onOpenTutorial={onOpenTutorial}
      />

      {/* Main Content Area (With bottom padding clearance for mobile bottom nav) */}
      <main className="flex-1 p-3 sm:p-4 md:p-6 pb-20 md:pb-6 max-w-7xl w-full mx-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Simple Clean Footer (Desktop only to maximize mobile viewport) */}
      <footer className="hidden md:flex bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 px-4 py-2.5 flex-wrap items-center justify-between gap-3 text-xs text-slate-500 transition-colors">
        <div>
          <span className="font-semibold text-slate-700 dark:text-slate-300">SecureCam</span> — Video-based Security Monitoring &amp; Object Detection
        </div>

        <div>
          Computer Vision Project
        </div>
      </footer>
    </div>
  );
};
