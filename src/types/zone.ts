export type ZoneType = 'emergency' | 'caution' | 'restricted' | 'perimeter';

export type AlertLevel = 'low' | 'medium' | 'high' | 'critical';

export type ZoneStatus = 'SAFE' | 'OCCUPIED' | 'VIOLATION';

export interface ZonePoint {
  x: number; // 0 to 100 percentage
  y: number; // 0 to 100 percentage
}

export interface SecurityZone {
  id: string;
  name: string;
  type: ZoneType;
  shape: 'rectangle' | 'polygon';
  points: ZonePoint[]; // 4 points for rectangle or N points for polygon
  alertLevel: AlertLevel;
  stayThresholdSeconds: number; // loitering threshold in seconds
  monitoredObjects: ('person' | 'vehicle' | 'unknown' | 'animal' | 'bicycle')[];
  alertActions: {
    visualAlert: boolean;
    audibleAlarm: boolean;
    eventLog: boolean;
    webhookNotification: boolean;
  };
  enabled: boolean;
  color?: string; // custom outline/fill color
  createdAt: string;
  description?: string;
}

export interface ZoneViolation {
  id: string;
  zoneId: string;
  zoneName: string;
  objectId: string;
  trackingId: number;
  objectClass: string;
  enteredAt: string;
  dwellTimeSeconds: number;
  thresholdSeconds: number;
  severity: AlertLevel;
  status: 'ACTIVE' | 'RESOLVED' | 'ACKNOWLEDGED';
  snapshotUrl?: string;
}
