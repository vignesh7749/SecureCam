export interface TimeSeriesMetric {
  time: string;
  totalObjects: number;
  knownObjects: number;
  unknownObjects: number;
  zoneViolations: number;
  fps: number;
  inferenceLatency: number;
}

export interface ClassDistribution {
  className: string;
  count: number;
  percentage: number;
  color: string;
}

export interface ZoneActivityMetric {
  zoneName: string;
  entries: number;
  violations: number;
  avgDwellTimeSeconds: number;
  maxDwellTimeSeconds: number;
}

export interface SurveillanceSummaryMetrics {
  totalObjectsTracked: number;
  knownObjectsCount: number;
  unknownObjectsCount: number;
  activeEventsCount: number;
  zoneViolationsCount: number;
  averageFps: number;
  averageLatencyMs: number;
  activeZonesCount: number;
  onlineCamerasCount: number;
}
