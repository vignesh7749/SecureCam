import { SecurityZone, ZonePoint, ZoneStatus, ZoneViolation } from '../types/zone';
import { TrackedObject } from '../types/detection';

/**
 * Ray-casting algorithm for Point-in-Polygon testing.
 * Points and polygon vertices are expressed as percentages (0 to 100).
 */
export function isPointInPolygon(point: ZonePoint, polygon: ZonePoint[]): boolean {
  if (polygon.length < 3) return false;
  
  let inside = false;
  const { x, y } = point;
  
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    
    const intersect = ((yi > y) !== (yj > y)) &&
      (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi);
      
    if (intersect) inside = !inside;
  }
  
  return inside;
}

/**
 * Checks whether an object (using bottom center of its bounding box, representing foot contact)
 * is inside the specified security zone.
 */
export function isObjectInZone(obj: TrackedObject, zone: SecurityZone): boolean {
  if (!zone.enabled) return false;
  
  // Calculate bottom-center contact point
  const footPoint: ZonePoint = {
    x: obj.box.x + obj.box.width / 2,
    y: obj.box.y + obj.box.height * 0.9, // 90% down the box
  };
  
  if (zone.shape === 'rectangle' && zone.points.length >= 4) {
    const minX = Math.min(...zone.points.map(p => p.x));
    const maxX = Math.max(...zone.points.map(p => p.x));
    const minY = Math.min(...zone.points.map(p => p.y));
    const maxY = Math.max(...zone.points.map(p => p.y));
    
    return footPoint.x >= minX && footPoint.x <= maxX && footPoint.y >= minY && footPoint.y <= maxY;
  }
  
  return isPointInPolygon(footPoint, zone.points);
}

/**
 * Evaluates the status of all zones against currently tracked objects.
 * Returns updated zones and any triggered violations.
 */
export function evaluateZones(
  zones: SecurityZone[],
  objects: TrackedObject[]
): {
  zoneStatuses: Record<string, { status: ZoneStatus; occupyingObjectIds: string[]; maxDwell: number }>;
  newViolations: ZoneViolation[];
} {
  const zoneStatuses: Record<string, { status: ZoneStatus; occupyingObjectIds: string[]; maxDwell: number }> = {};
  const newViolations: ZoneViolation[] = [];
  
  for (const zone of zones) {
    if (!zone.enabled) {
      zoneStatuses[zone.id] = { status: 'SAFE', occupyingObjectIds: [], maxDwell: 0 };
      continue;
    }
    
    // Find all objects inside this zone that match monitored classes
    const occupants = objects.filter(obj => {
      const isMonitoredClass = zone.monitoredObjects.includes(obj.className as any);
      if (!isMonitoredClass) return false;
      return isObjectInZone(obj, zone);
    });
    
    if (occupants.length === 0) {
      zoneStatuses[zone.id] = { status: 'SAFE', occupyingObjectIds: [], maxDwell: 0 };
    } else {
      let isViolation = false;
      let maxDwell = 0;
      
      for (const occupant of occupants) {
        const dwell = occupant.dwellTimeInZone || 0;
        if (dwell > maxDwell) maxDwell = dwell;
        
        if (dwell >= zone.stayThresholdSeconds) {
          isViolation = true;
          newViolations.push({
            id: `viol-${zone.id}-${occupant.id}-${Date.now()}`,
            zoneId: zone.id,
            zoneName: zone.name,
            objectId: occupant.id,
            trackingId: occupant.trackingId,
            objectClass: occupant.className,
            enteredAt: occupant.firstSeen,
            dwellTimeSeconds: dwell,
            thresholdSeconds: zone.stayThresholdSeconds,
            severity: zone.alertLevel,
            status: 'ACTIVE',
          });
        }
      }
      
      zoneStatuses[zone.id] = {
        status: isViolation ? 'VIOLATION' : 'OCCUPIED',
        occupyingObjectIds: occupants.map(o => o.id),
        maxDwell,
      };
    }
  }
  
  return { zoneStatuses, newViolations };
}
