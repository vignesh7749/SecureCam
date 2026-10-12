export type ObjectClass = 
  | 'person' 
  | 'vehicle' 
  | 'car'
  | 'truck'
  | 'bus'
  | 'motorcycle'
  | 'bicycle' 
  | 'backpack' 
  | 'handbag' 
  | 'suitcase' 
  | 'knife' 
  | 'unknown'
  | 'animal'
  | (string & {});

export interface BoundingBox {
  x: number;      // 0 to 100 percentage
  y: number;      // 0 to 100 percentage
  width: number;  // 0 to 100 percentage
  height: number; // 0 to 100 percentage
}

export interface TrajectoryPoint {
  x: number;
  y: number;
  frameIndex?: number;
  timestamp: number;
}

export interface Velocity {
  vx: number;
  vy: number;
  speed: number;
  unit: string; // 'px/s'
}

export interface Point {
  x: number;
  y: number;
}

export interface ObjectDetection {
  id: string;
  trackingId?: number;
  className: ObjectClass;
  confidence: number; // 0 to 1
  box: BoundingBox;
  isUnknown: boolean;
}

export type Detection = ObjectDetection;

export interface TrackedObject {
  id: string;
  trackId?: number;
  trackingId: number;
  classId?: number;
  className: ObjectClass;
  confidence: number;
  box: BoundingBox;
  state?: 'NEW' | 'ACTIVE' | 'LOST' | 'REIDENTIFIED' | 'REMOVED' | string;
  firstSeen: string;
  lastSeen: string;
  durationSeconds: number;
  age?: number;
  hits?: number;
  velocity?: Velocity;
  velocityPixelsPerSec?: number;
  trajectory: TrajectoryPoint[];
  currentPosition?: Point;
  movementStatus: 'stationary' | 'moving' | 'loitering' | 'running' | string;
  currentZoneId?: string;
  currentZoneName?: string;
  dwellTimeInZone?: number; // seconds
  isUnknown: boolean;
  notes?: string;
  noveltyScore?: number;
  noveltyState?: string;
}

export interface UnknownObject extends TrackedObject {
  noveltyScore: number;       // 0 to 100%
  persistenceScore: number;   // 0 to 100%
  framesObserved: number;
  investigationStatus: 'INVESTIGATE' | 'FLAGGED' | 'RESOLVED' | 'DISMISSED';
  clusterId?: string;
  featureSignature?: string;
  thumbnailUrl?: string;
  embeddingDistance?: number;
  topKnownClass?: string;
  topKnownSimilarity?: number;
  noveltyState?: string;
}

