import React, { useState, useEffect } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import { SurveillanceProvider, useSurveillance } from './context/SurveillanceContext';
import { MainLayout } from './components/layout/MainLayout';
import { NavTabId } from './components/layout/Navigation';
import { CommandCenterPage } from './pages/CommandCenterPage';
import { VideoAnalysisPage } from './pages/VideoAnalysisPage';
import { LiveCameraPage } from './pages/LiveCameraPage';
import { EmergencyZonesPage } from './pages/EmergencyZonesPage';
import { EventsPage } from './pages/EventsPage';
import { ReportsPage } from './pages/ReportsPage';
import { SystemPage } from './pages/SystemPage';
import { TutorialModal } from './components/common/TutorialModal';

export const AppContent: React.FC = () => {
  const { activeTab, setActiveTab } = useSurveillance();
  const [isTutorialOpen, setIsTutorialOpen] = useState(false);

  useEffect(() => {
    try {
      const completed = localStorage.getItem('securecam_tutorial_completed');
      if (completed !== 'true') {
        setIsTutorialOpen(true);
      }
    } catch {}
  }, []);

  const renderActivePage = () => {
    switch (activeTab) {
      case 'dashboard':
      case 'command-center':
        return <CommandCenterPage />;
      case 'video-analysis':
        return <VideoAnalysisPage />;
      case 'live-camera':
      case 'live-monitor':
        return <LiveCameraPage />;
      case 'emergency-zones':
        return <EmergencyZonesPage />;
      case 'events':
        return <EventsPage />;
      case 'reports':
        return <ReportsPage />;
      case 'settings':
      case 'system':
        return <SystemPage />;
      default:
        return <CommandCenterPage />;
    }
  };

  return (
    <>
      <MainLayout 
        activeTab={activeTab} 
        onTabChange={setActiveTab}
        onOpenTutorial={() => setIsTutorialOpen(true)}
      >
        {renderActivePage()}
      </MainLayout>

      <TutorialModal
        isOpen={isTutorialOpen}
        onClose={() => setIsTutorialOpen(false)}
        onNavigateTab={(tab) => setActiveTab(tab)}
      />
    </>
  );
};

export default function App() {
  return (
    <ThemeProvider>
      <SurveillanceProvider>
        <AppContent />
      </SurveillanceProvider>
    </ThemeProvider>
  );
}

