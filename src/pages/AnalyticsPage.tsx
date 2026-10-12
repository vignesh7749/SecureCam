import React from 'react';
import { SurveillanceCharts } from '../components/analytics/SurveillanceCharts';
import { StatCard } from '../components/common/StatCard';
import { useSurveillance } from '../context/SurveillanceContext';
import { BarChart3, TrendingUp, ShieldAlert, Cpu } from 'lucide-react';

export const AnalyticsPage: React.FC = () => {
  const { trackedObjects, fps, inferenceLatency } = useSurveillance();

  return (
    <div className="space-y-4">
      {/* Top Stat Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="AGGREGATE OBJECT COUNT"
          value="87 DETECTED"
          subtext="Session cumulative tally"
          icon={TrendingUp}
          variant="default"
        />
        <StatCard
          label="MEAN PIPELINE FPS"
          value="59.4 FPS"
          subtext="Stability deviation < 1.2%"
          icon={Cpu}
          variant="emerald"
        />
        <StatCard
          label="MEAN INFERENCE LATENCY"
          value={`${inferenceLatency} ms`}
          subtext="Zero frame drop rate"
          icon={BarChart3}
          variant="cyan"
        />
        <StatCard
          label="ZONE VIOLATION RATE"
          value="5.7%"
          subtext="Entries exceeding stay limit"
          icon={ShieldAlert}
          variant="red"
        />
      </div>

      {/* Main Charts Component */}
      <SurveillanceCharts />
    </div>
  );
};
