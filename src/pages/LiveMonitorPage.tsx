import React from 'react';
import { MultiCameraMatrix } from '../components/liveMonitor/MultiCameraMatrix';
import { useSurveillance } from '../context/SurveillanceContext';
import { StatCard } from '../components/common/StatCard';
import { Radio, Tv, ShieldAlert, Cpu } from 'lucide-react';

export const LiveMonitorPage: React.FC = () => {
  const { activeViolations, unknownObjects, trackedObjects, fps } = useSurveillance();

  return (
    <div className="space-y-4">
      {/* Telemetry Header Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="ACTIVE LIVE FEEDS"
          value="4 / 4 ONLINE"
          subtext="RTSP / ONVIF protocol"
          icon={Tv}
          variant="cyan"
        />
        <StatCard
          label="TOTAL TARGETS TRACKED"
          value={trackedObjects.length}
          subtext="Combined multi-stream"
          icon={Radio}
          variant="default"
        />
        <StatCard
          label="UNKNOWN NOVELTIES"
          value={unknownObjects.length}
          subtext="Under investigation"
          icon={ShieldAlert}
          variant="amber"
          alert={unknownObjects.length > 0}
        />
        <StatCard
          label="AGGREGATE FPS"
          value={`${fps} FPS`}
          subtext="Hardware decoded (NVDEC)"
          icon={Cpu}
          variant="emerald"
        />
      </div>

      {/* Multi-Camera Matrix */}
      <MultiCameraMatrix />
    </div>
  );
};
