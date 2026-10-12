export type EventType = 
  | 'OBJECT_DETECTED' 
  | 'OBJECT_ENTERED' 
  | 'OBJECT_LEFT' 
  | 'UNKNOWN_OBJECT' 
  | 'ZONE_ENTRY' 
  | 'ZONE_VIOLATION' 
  | 'ANOMALY' 
  | 'SYSTEM_EVENT';

export type EventSeverity = 'INFO' | 'WARNING' | 'HIGH' | 'CRITICAL';

export interface SecurityEvent {
  id: string;
  timestamp: string;
  type: EventType;
  severity: EventSeverity;
  objectId?: string;
  trackingId?: number;
  objectClass?: string;
  zoneId?: string;
  zoneName?: string;
  description: string;
  sourceCamera: string;
  acknowledged: boolean;
  metadata?: Record<string, any>;
}
