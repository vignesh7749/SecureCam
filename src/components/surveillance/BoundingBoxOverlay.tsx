import React from 'react';
import { TrackedObject } from '../../types/detection';
import { useSurveillance } from '../../context/SurveillanceContext';

interface BoundingBoxOverlayProps {
  objects: TrackedObject[];
  onSelectObject: (id: string) => void;
  selectedObjectId: string | null;
}

export const BoundingBoxOverlay: React.FC<BoundingBoxOverlayProps> = ({
  objects,
  onSelectObject,
  selectedObjectId,
}) => {
  const { overlays, apiMode, realDetections } = useSurveillance();

  if (!overlays.boundingBoxes) return null;

  // Resolve display objects based on apiMode and available data
  const displayObjects: TrackedObject[] = React.useMemo(() => {
    if (apiMode === 'LIVE_AI') {
      if (objects && objects.length > 0) {
        return objects;
      }
      if (realDetections && realDetections.length > 0) {
        return realDetections.map((det, idx) => ({
          id: det.id || `det-${idx}`,
          trackId: det.trackingId,
          trackingId: det.trackingId || (idx + 1),
          className: det.className,
          confidence: det.confidence,
          box: det.box,
          trajectory: [],
          firstSeen: '',
          lastSeen: '',
          durationSeconds: 0,
          movementStatus: 'moving',
          isUnknown: det.isUnknown || false,
        }));
      }
      return [];
    }
    return objects || [];
  }, [apiMode, objects, realDetections]);

  if (displayObjects.length === 0) {
    return null;
  }

  return (
    <div className="absolute inset-0 pointer-events-none z-10">
      {/* Tracking Trails Layer (Subtle, clean path line) */}
      {overlays.trackingTrails && (
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none z-0"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          {displayObjects.map((obj) => {
            if (!obj.trajectory || obj.trajectory.length < 2) return null;
            const strokeColor = obj.isUnknown ? '#F59E0B' : '#3B82F6';

            return (
              <polyline
                key={`traj-${obj.id}`}
                points={obj.trajectory.map((p) => `${p.x},${p.y}`).join(' ')}
                fill="none"
                stroke={strokeColor}
                strokeWidth="0.3"
                opacity="0.75"
              />
            );
          })}
        </svg>
      )}

      {/* Target Bounding Boxes */}
      {displayObjects.map((obj) => {
        const isSelected = selectedObjectId === obj.id;
        const isKnownClass = !!obj.className && obj.className.toLowerCase() !== 'unknown' && !obj.className.startsWith('object_');
        const displayClass = isKnownClass ? obj.className.toUpperCase() : 'UNKNOWN';
        const isNovelAnomaly = !isKnownClass || obj.isUnknown;
        const isViolating = (obj.dwellTimeInZone || 0) >= 10 && !!obj.currentZoneId;

        // Visual theme based on target status
        let borderColor = 'border-blue-500';
        let bgTagColor = 'bg-blue-600 text-white';

        if (isViolating) {
          borderColor = 'border-red-500';
          bgTagColor = 'bg-red-600 text-white font-bold';
        } else if (isNovelAnomaly) {
          borderColor = 'border-amber-500';
          bgTagColor = 'bg-amber-600 text-white font-semibold';
        }

        const confidencePercent = Math.round(obj.confidence * 100);
        const trackIdNum = obj.trackId ?? obj.trackingId;
        const trackIdStr = trackIdNum !== undefined ? `#${String(trackIdNum).padStart(2, '0')}` : '';
        const labelText = `${displayClass} ${trackIdStr} ${confidencePercent}%`;

        // Defensively normalize coordinates if unit scale (0..1) instead of percentage (0..100)
        const rawX = obj.box?.x ?? 0;
        const rawY = obj.box?.y ?? 0;
        const rawW = obj.box?.width ?? 0;
        const rawH = obj.box?.height ?? 0;
        // If x or y > 1.0, the coordinates are already in percentage space (0..100)
        const isUnitScale = rawX <= 1.0 && rawY <= 1.0 && rawW <= 1.0 && rawH <= 1.0 && (rawX + rawW <= 1.05) && (rawY + rawH <= 1.05) && (rawW > 0.05 || rawH > 0.05);
        const boxX = isUnitScale ? rawX * 100 : rawX;
        const boxY = isUnitScale ? rawY * 100 : rawY;
        const boxW = isUnitScale ? rawW * 100 : rawW;
        const boxH = isUnitScale ? rawH * 100 : rawH;

        return (
          <div
            key={obj.id}
            onClick={(e) => {
              e.stopPropagation();
              onSelectObject(obj.id);
            }}
            style={{
              left: `${boxX}%`,
              top: `${boxY}%`,
              width: `${boxW}%`,
              height: `${boxH}%`,
            }}
            className={`absolute pointer-events-auto cursor-pointer border-2 ${borderColor} ${
              isSelected ? 'ring-2 ring-white ring-offset-1' : ''
            }`}
          >
            {/* Top Label Tag */}
            {overlays.labelsAndConfidence && (
              <div
                className={`absolute ${boxY < 4 ? 'top-0' : '-top-5'} left-0 px-1.5 py-0.5 text-[9px] sm:text-[10px] font-mono leading-none rounded-t-sm whitespace-nowrap shadow-sm ${bgTagColor}`}
              >
                {labelText}
                {isViolating && <span className="ml-1 text-[8px] sm:text-[9px] underline">VIOLATION</span>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
