export type FeatureStatus = 'ACTIVE' | 'COMING_SOON' | 'DEMO';

export interface SystemModelConfig {
  name: string;
  version: string;
  weights: string;
  inputResolution: string;
  backend: 'PyTorch / CUDA' | 'PyTorch / CPU' | 'ONNX Runtime' | 'TensorRT' | string;
  tracker: 'ByteTrack' | 'BoT-SORT' | 'DeepOCSORT' | 'NOT ACTIVE (STAGE 3)' | string;
  status: FeatureStatus;
}

export interface SystemSettings {
  detectionConfidenceThreshold: number; // e.g. 0.50
  unknownNoveltyThreshold: number; // e.g. 0.75
  iouThreshold: number; // e.g. 0.45
  trackBufferFrames: number; // e.g. 30
  emergencyZoneDefaultAlert: 'critical' | 'high' | 'medium';
  emergencyZoneDefaultDwellSeconds: number; // e.g. 10
  alarmAudioEnabled: boolean;
  visualOverlaysEnabled: {
    boundingBoxes: boolean;
    objectIds: boolean;
    labelsAndConfidence: boolean;
    trackingTrails: boolean;
    emergencyZones: boolean;
    unknownObjectHighlight: boolean;
    hudTelemetry: boolean;
  };
  hardwareAcceleration: 'CUDA GPU' | 'DirectML' | 'CPU';
}
