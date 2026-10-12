import React, { useState } from 'react';
import { SecurityZone, ZoneStatus } from '../../types/zone';
import { useSurveillance } from '../../context/SurveillanceContext';
import { isObjectInZone } from '../../services/zoneService';
import { ZoneConfigModal } from './ZoneConfigModal';
import { Button } from '../common/Button';
import { 
  ShieldAlert, 
  Trash2, 
  PenTool, 
  Power, 
  Settings,
  AlertTriangle 
} from 'lucide-react';

export const ZoneList: React.FC = () => {
  const {
    zones,
    updateZone,
    deleteZone,
    toggleZoneEnabled,
    selectedZoneId,
    setSelectedZoneId,
    trackedObjects,
    isZoneEditMode,
    setIsZoneEditMode,
  } = useSurveillance();

  const [editingZone, setEditingZone] = useState<SecurityZone | null>(null);

  return (
    <div className="bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Configured Zones</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {zones.length} zone{zones.length === 1 ? '' : 's'} defined
          </p>
        </div>

        <Button
          size="sm"
          variant={isZoneEditMode ? 'danger' : 'outline'}
          onClick={() => setIsZoneEditMode(!isZoneEditMode)}
          icon={<PenTool className="w-3.5 h-3.5" />}
        >
          {isZoneEditMode ? 'Cancel' : 'Draw Zone'}
        </Button>
      </div>

      {/* Zones List */}
      <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
        {zones.length === 0 ? (
          <div className="p-6 text-center border border-dashed border-slate-300 dark:border-slate-800 rounded bg-slate-50 dark:bg-slate-900/40">
            <AlertTriangle className="w-5 h-5 text-slate-400 dark:text-slate-500 mx-auto mb-1.5" />
            <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">No zones configured</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-500 mt-0.5">
              Click &quot;Draw Zone&quot; to define a caution or emergency area on the video.
            </p>
          </div>
        ) : (
          zones.map((zone) => {
            const isSelected = selectedZoneId === zone.id;
            
            // Occupants & Status
            const occupants = trackedObjects.filter(obj => isObjectInZone(obj, zone));
            const maxDwell = occupants.reduce((max, obj) => Math.max(max, obj.dwellTimeInZone || 0), 0);
            
            let status: ZoneStatus = 'SAFE';
            if (occupants.length > 0) {
              status = maxDwell >= zone.stayThresholdSeconds ? 'VIOLATION' : 'OCCUPIED';
            }

            const isViolation = status === 'VIOLATION';

            return (
              <div
                key={zone.id}
                onClick={() => setSelectedZoneId(zone.id)}
                className={`p-3 rounded border transition-colors cursor-pointer bg-slate-50 dark:bg-slate-900 ${
                  isSelected
                    ? 'border-blue-500 ring-1 ring-blue-500/40'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                } ${isViolation ? 'border-red-500/60 bg-red-50 dark:bg-red-950/10' : ''}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                      isViolation ? 'bg-red-400' : status === 'OCCUPIED' ? 'bg-amber-400' : 'bg-emerald-400'
                    }`} />

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-900 dark:text-white">{zone.name}</span>
                        <span className={`px-1.5 py-0.2 rounded text-[10px] font-medium ${
                          isViolation 
                            ? 'bg-red-500/20 text-red-600 dark:text-red-400' 
                            : status === 'OCCUPIED'
                            ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
                            : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-400'
                        }`}>
                          {status}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {zone.type} • Limit: {zone.stayThresholdSeconds}s • {zone.shape}
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => toggleZoneEnabled(zone.id)}
                      className={`p-1 rounded text-xs border transition-colors ${
                        zone.enabled
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                          : 'bg-slate-200 text-slate-500 border-slate-300 dark:bg-slate-800 dark:text-slate-500 dark:border-slate-700'
                      }`}
                      title={zone.enabled ? 'Enabled' : 'Disabled'}
                    >
                      <Power className="w-3 h-3" />
                    </button>

                    <button
                      onClick={() => setEditingZone(zone)}
                      className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 dark:border-slate-700 transition-colors"
                      title="Edit Zone"
                    >
                      <Settings className="w-3 h-3" />
                    </button>

                    <button
                      onClick={() => deleteZone(zone.id)}
                      className="p-1 rounded bg-slate-100 hover:bg-red-50 text-slate-600 hover:text-red-600 border border-slate-300 dark:bg-slate-800 dark:hover:bg-red-950/30 dark:text-slate-400 dark:hover:text-red-400 dark:border-slate-700 transition-colors"
                      title="Delete Zone"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Occupants status row */}
                {occupants.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                    <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                      <ShieldAlert className="w-3 h-3" />
                      <span>{occupants.length} object inside</span>
                    </span>
                    <span className={isViolation ? 'text-red-600 dark:text-red-400 font-bold' : 'text-slate-500 dark:text-slate-400'}>
                      Dwell: {Math.round(maxDwell)}s / {zone.stayThresholdSeconds}s
                    </span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Zone Config Modal */}
      <ZoneConfigModal
        isOpen={!!editingZone}
        onClose={() => setEditingZone(null)}
        zone={editingZone}
        onSave={(updated) => updateZone(updated)}
      />
    </div>
  );
};
