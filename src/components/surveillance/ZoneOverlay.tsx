import React from 'react';
import { SecurityZone, ZoneStatus } from '../../types/zone';
import { TrackedObject } from '../../types/detection';
import { isObjectInZone } from '../../services/zoneService';
import { useSurveillance } from '../../context/SurveillanceContext';
import { AlertTriangle, ShieldAlert, ShieldCheck } from 'lucide-react';

interface ZoneOverlayProps {
  zones: SecurityZone[];
  objects: TrackedObject[];
  onSelectZone?: (zoneId: string) => void;
  selectedZoneId?: string | null;
}

export const ZoneOverlay: React.FC<ZoneOverlayProps> = ({
  zones,
  objects,
  onSelectZone,
  selectedZoneId,
}) => {
  const { overlays } = useSurveillance();

  if (!overlays.emergencyZones) return null;

  return (
    <div className="absolute inset-0 pointer-events-none z-20">
      <svg className="w-full h-full absolute inset-0">
        <defs>
          {/* Diagonal danger stripes pattern */}
          <pattern id="danger-stripes" width="20" height="20" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="20" stroke="rgba(239, 68, 68, 0.2)" strokeWidth="4" />
          </pattern>
          <pattern id="caution-stripes" width="20" height="20" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="20" stroke="rgba(245, 158, 11, 0.15)" strokeWidth="4" />
          </pattern>
        </defs>

        {zones.filter(z => z.enabled).map((zone) => {
          const isSelected = selectedZoneId === zone.id;
          
          // Determine occupants
          const occupants = objects.filter(obj => isObjectInZone(obj, zone));
          const maxDwell = occupants.reduce((max, obj) => Math.max(max, obj.dwellTimeInZone || 0), 0);
          
          let status: ZoneStatus = 'SAFE';
          if (occupants.length > 0) {
            status = maxDwell >= zone.stayThresholdSeconds ? 'VIOLATION' : 'OCCUPIED';
          }

          const isEmergency = zone.type === 'emergency';
          const isViolation = status === 'VIOLATION';
          const isOccupied = status === 'OCCUPIED';

          // Stroke and fill styling
          let strokeColor = isEmergency ? '#EF4444' : '#F59E0B';
          let fillColor = isEmergency ? 'rgba(239, 68, 68, 0.08)' : 'rgba(245, 158, 11, 0.06)';

          if (isViolation) {
            strokeColor = '#FF334B';
            fillColor = 'rgba(239, 68, 68, 0.25)';
          } else if (isOccupied) {
            strokeColor = '#F59E0B';
            fillColor = 'rgba(245, 158, 11, 0.15)';
          }

          // Convert points array to SVG polygon points string: "x%,y% x%,y%..."
          const pointsStr = zone.points.map(p => `${p.x}%,${p.y}%`).join(' ');

          // Center coordinate for label anchor
          const avgX = zone.points.reduce((acc, p) => acc + p.x, 0) / zone.points.length;
          const avgY = zone.points.reduce((acc, p) => acc + p.y, 0) / zone.points.length;

          return (
            <g key={zone.id} className="cursor-pointer pointer-events-auto" onClick={() => onSelectZone?.(zone.id)}>
              {/* Zone Area Fill & Outline */}
              <polygon
                points={pointsStr}
                fill={fillColor}
                stroke={strokeColor}
                strokeWidth={isViolation ? 3 : isSelected ? 2.5 : 1.5}
                strokeDasharray={isViolation ? 'none' : '6 4'}
              />

              {/* Tactical Corner Markers */}
              {zone.points.map((pt, idx) => (
                <circle
                  key={idx}
                  cx={`${pt.x}%`}
                  cy={`${pt.y}%`}
                  r={isSelected ? 4 : 2.5}
                  fill={strokeColor}
                  stroke="#0B0F17"
                  strokeWidth="1"
                />
              ))}

              {/* Central Zone HUD Tag */}
              <foreignObject
                x={`${Math.max(5, Math.min(80, avgX - 12))}%`}
                y={`${Math.max(5, Math.min(85, avgY - 6))}%`}
                width="240"
                height="90"
                className="overflow-visible pointer-events-none"
              >
                <div className={`p-1.5 rounded border shadow-md inline-block text-xs ${
                  isViolation
                    ? 'bg-red-950/90 border-red-500 text-red-200'
                    : isOccupied
                    ? 'bg-amber-950/90 border-amber-500 text-amber-200'
                    : 'bg-slate-900/90 border-slate-700 text-slate-300'
                }`}>
                  {/* Status Headline */}
                  <div className="flex items-center gap-1.5 text-[10px] font-bold tracking-wide uppercase">
                    {isViolation ? (
                      <>
                        <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                        <span className="text-red-400">ZONE VIOLATION</span>
                      </>
                    ) : isOccupied ? (
                      <>
                        <ShieldAlert className="w-3 h-3 text-amber-400" />
                        <span>OCCUPIED ({occupants.length})</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-3 h-3 text-emerald-400" />
                        <span>SAFE ZONE</span>
                      </>
                    )}
                  </div>

                  {/* Zone Name */}
                  <div className="text-[10px] font-medium text-slate-200 truncate max-w-[180px] mt-0.5">
                    {zone.name}
                  </div>

                  {/* Occupant details & dwell timer */}
                  {occupants.length > 0 && (
                    <div className="mt-1 pt-1 border-t border-current/20 flex flex-col gap-0.5 text-[9px] font-mono">
                      {occupants.slice(0, 2).map((occ) => {
                        const dwell = Math.round(occ.dwellTimeInZone || 0);
                        const isOver = dwell >= zone.stayThresholdSeconds;
                        return (
                          <div key={occ.id} className="flex items-center justify-between gap-2">
                            <span className="font-semibold uppercase">
                              {occ.className} #{String(occ.trackingId).padStart(2, '0')}
                            </span>
                            <span className={isOver ? 'text-white font-bold' : 'text-surveillance-400'}>
                              DWELL: {String(Math.floor(dwell / 60)).padStart(2, '0')}:{String(dwell % 60).padStart(2, '0')} / {zone.stayThresholdSeconds}s
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </foreignObject>
            </g>
          );
        })}
      </svg>
    </div>
  );
};
