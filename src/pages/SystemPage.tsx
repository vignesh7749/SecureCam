import React from 'react';
import { SystemSettingsPanel } from '../components/system/SystemSettingsPanel';

export const SystemPage: React.FC = () => {
  return (
    <div className="space-y-4">
      <SystemSettingsPanel />
    </div>
  );
};
