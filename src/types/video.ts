export interface VideoMetadata {
  filename: string;
  durationSeconds: number;
  width: number;
  height: number;
  fps: number;
  codec: string;
  filesizeBytes: number;
  bitrateKbps: number;
}

export type VideoSourceType = 'upload' | 'sample' | 'rtsp' | 'ip_camera' | 'webcam' | 'cctv';

export interface VideoSource {
  id: string;
  name: string;
  type: VideoSourceType;
  uri: string;
  status: 'ONLINE' | 'OFFLINE' | 'CONNECTING' | 'ERROR';
  location: string;
  resolution: string;
  fps: number;
  metadata?: VideoMetadata;
}

export interface SampleVideo {
  id: string;
  title: string;
  category: string;
  duration: string;
  durationSeconds: number;
  resolution: string;
  description: string;
  difficulty?: 'Standard' | 'Medium' | 'High Density' | 'Complex' | string;
  thumbnailUrl?: string;
  sourceUrl: string;
  streamUrl?: string;
  filename?: string;
  displayName?: string;
  width?: number;
  height?: number;
  fps?: number;
  fileSize?: number;
  format?: string;
  codec?: string;
  frameCount?: number;
  defaultObjectsCount?: number;
  hasUnknowns?: boolean;
  hasEmergencyZone?: boolean;
}

export interface AnalysisSession {
  id: string;
  sourceId: string;
  sourceName: string;
  status: 'IDLE' | 'ANALYZING' | 'PAUSED' | 'COMPLETED' | 'ERROR';
  startTime: string;
  currentFrame: number;
  totalFrames: number;
  fps: number;
  inferenceLatencyMs: number;
  model: string;
  objectsDetectedCount: number;
  violationsCount: number;
  unknownsCount: number;
}
