import React from 'react';
import { TrackedObject } from '../../types/detection';
import { TacticalModal } from '../common/TacticalModal';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';
import { Crosshair, ShieldAlert, Navigation, Activity, Download } from 'lucide-react';

interface ObjectInspectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  object: TrackedObject | null;
}

export const ObjectInspectorModal: React.FC<ObjectInspectorModalProps> = ({
  isOpen,
  onClose,
  object,
}) => {
  if (!object) return null;

  const isUnknown = object.isUnknown;

  return (
    <TacticalModal
      isOpen={isOpen}
      onClose={onClose}
      title={`TARGET INTELLIGENCE // ${isUnknown ? 'UNKNOWN' : object.className.toUpperCase()} #${String(object.trackingId).padStart(2, '0')}`}
      subtitle={`DEEP VISION TELEMETRY & TRAJECTORY ANALYSIS`}
      maxWidth="xl"
    >
      <div className="space-y-4 font-mono text-xs">
        {/* Top Key Info Card */}
        <div className="p-3.5 rounded-sm bg-slate-100 dark:bg-surveillance-800/90 border border-slate-200 dark:border-surveillance-700 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xs border ${isUnknown ? 'bg-amber-500/15 text-amber-600 dark:text-tactical-amber border-amber-500/40' : 'bg-blue-500/15 text-blue-600 dark:text-tactical-cyan border-blue-500/40'}`}>
              <Crosshair className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-900 dark:text-surveillance-100 uppercase">
                  {object.className} #{String(object.trackingId).padStart(2, '0')}
                </span>
                <Badge variant={isUnknown ? 'warning' : 'cyan'} size="xs">
                  {(object.confidence * 100).toFixed(1)}% CONFIDENCE
                </Badge>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-surveillance-400 mt-0.5">
                TRACK DURATION: {object.durationSeconds}s • VELOCITY: {object.velocityPixelsPerSec || 0} px/s
              </p>
            </div>
          </div>

          <div className="text-right">
            <span className="text-[10px] text-slate-500 dark:text-surveillance-400 uppercase block">MOVEMENT STATE</span>
            <span className={`text-xs font-bold uppercase ${object.movementStatus === 'loitering' ? 'text-red-600 dark:text-tactical-red' : 'text-emerald-600 dark:text-tactical-emerald'}`}>
              {object.movementStatus}
            </span>
          </div>
        </div>

        {/* Spatial Bounding Box & Zone Association */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Spatial Coordinates */}
          <div className="p-3 rounded-sm bg-slate-50 dark:bg-surveillance-800/60 border border-slate-200 dark:border-surveillance-700/80">
            <h4 className="text-[11px] font-bold text-slate-700 dark:text-surveillance-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Navigation className="w-3.5 h-3.5 text-blue-600 dark:text-tactical-cyan" />
              <span>Bounding Coordinates</span>
            </h4>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="bg-white dark:bg-surveillance-850 p-2 rounded-2xs border border-slate-200 dark:border-surveillance-700/60">
                <span className="text-slate-500 dark:text-surveillance-400 block text-[10px]">POS X (NORM)</span>
                <span className="font-bold text-slate-900 dark:text-surveillance-100">{object.box.x.toFixed(2)}%</span>
              </div>
              <div className="bg-white dark:bg-surveillance-850 p-2 rounded-2xs border border-slate-200 dark:border-surveillance-700/60">
                <span className="text-slate-500 dark:text-surveillance-400 block text-[10px]">POS Y (NORM)</span>
                <span className="font-bold text-slate-900 dark:text-surveillance-100">{object.box.y.toFixed(2)}%</span>
              </div>
              <div className="bg-white dark:bg-surveillance-850 p-2 rounded-2xs border border-slate-200 dark:border-surveillance-700/60">
                <span className="text-slate-500 dark:text-surveillance-400 block text-[10px]">WIDTH</span>
                <span className="font-bold text-slate-900 dark:text-surveillance-100">{object.box.width.toFixed(2)}%</span>
              </div>
              <div className="bg-white dark:bg-surveillance-850 p-2 rounded-2xs border border-slate-200 dark:border-surveillance-700/60">
                <span className="text-slate-500 dark:text-surveillance-400 block text-[10px]">HEIGHT</span>
                <span className="font-bold text-slate-900 dark:text-surveillance-100">{object.box.height.toFixed(2)}%</span>
              </div>
            </div>
          </div>

          {/* Zone Occupancy */}
          <div className="p-3 rounded-sm bg-slate-50 dark:bg-surveillance-800/60 border border-slate-200 dark:border-surveillance-700/80">
            <h4 className="text-[11px] font-bold text-slate-700 dark:text-surveillance-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-600 dark:text-tactical-amber" />
              <span>Security Zone Association</span>
            </h4>
            {object.currentZoneName ? (
              <div className="space-y-2 text-[11px]">
                <div className="bg-amber-500/10 border border-amber-500/30 p-2 rounded-2xs text-amber-700 dark:text-tactical-amber">
                  <span className="text-[10px] block opacity-80 uppercase">INSIDE ZONE:</span>
                  <span className="font-bold">{object.currentZoneName}</span>
                </div>
                <div className="flex items-center justify-between bg-white dark:bg-surveillance-850 p-2 rounded-2xs border border-slate-200 dark:border-surveillance-700/60">
                  <span className="text-slate-500 dark:text-surveillance-400">DWELL TIME:</span>
                  <span className="font-bold text-red-600 dark:text-tactical-red">{Math.round(object.dwellTimeInZone || 0)} seconds</span>
                </div>
              </div>
            ) : (
              <div className="p-4 text-center text-slate-400 dark:text-surveillance-500 bg-white dark:bg-surveillance-850 rounded-2xs border border-slate-200 dark:border-surveillance-700/40">
                Target is currently in open zone (not inside any restricted perimeters).
              </div>
            )}
          </div>
        </div>

        {/* Novelty & Prototype Telemetry (Stage 4) */}
        {(object.noveltyScore !== undefined || isUnknown) && (
          <div className="p-3 rounded-sm bg-amber-500/5 border border-amber-500/30">
            <h4 className="text-[11px] font-bold text-amber-700 dark:text-tactical-amber uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <span>Novelty Intelligence (DINOv2 Feature Embeddings)</span>
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
              <div className="bg-white dark:bg-surveillance-850 p-2 rounded-2xs border border-slate-200 dark:border-surveillance-700/60">
                <span className="text-slate-500 dark:text-surveillance-400 block text-[10px]">NOVELTY SCORE</span>
                <span className="font-bold text-amber-600 dark:text-tactical-amber">{object.noveltyScore ?? 0}%</span>
              </div>
              <div className="bg-white dark:bg-surveillance-850 p-2 rounded-2xs border border-slate-200 dark:border-surveillance-700/60">
                <span className="text-slate-500 dark:text-surveillance-400 block text-[10px]">NOVELTY STATE</span>
                <span className="font-bold text-slate-900 dark:text-surveillance-100">{object.noveltyState || (isUnknown ? 'CONFIRMED_UNKNOWN' : 'NORMAL')}</span>
              </div>
              <div className="bg-white dark:bg-surveillance-850 p-2 rounded-2xs border border-slate-200 dark:border-surveillance-700/60">
                <span className="text-slate-500 dark:text-surveillance-400 block text-[10px]">NEAREST PROTOTYPE</span>
                <span className="font-bold text-slate-900 dark:text-surveillance-100 uppercase">{(object as any).topKnownClass || 'N/A'}</span>
              </div>
              <div className="bg-white dark:bg-surveillance-850 p-2 rounded-2xs border border-slate-200 dark:border-surveillance-700/60">
                <span className="text-slate-500 dark:text-surveillance-400 block text-[10px]">EMBEDDING DIST</span>
                <span className="font-bold text-slate-900 dark:text-surveillance-100">{(object as any).embeddingDistance !== undefined ? (object as any).embeddingDistance.toFixed(3) : 'N/A'}</span>
              </div>
            </div>
          </div>
        )}

        {/* Trajectory History */}
        <div className="p-3 rounded-sm bg-slate-50 dark:bg-surveillance-800/60 border border-slate-200 dark:border-surveillance-700/80">
          <h4 className="text-[11px] font-bold text-slate-700 dark:text-surveillance-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-emerald-600 dark:text-tactical-emerald" />
            <span>Trajectory Waypoints ({object.trajectory.length} recorded)</span>
          </h4>
          <div className="flex items-center gap-2 overflow-x-auto pb-1 text-[10px]">
            {object.trajectory.map((pt, idx) => (
              <div key={idx} className="px-2 py-1 bg-white dark:bg-surveillance-850 border border-slate-200 dark:border-surveillance-700 rounded-2xs whitespace-nowrap text-slate-800 dark:text-slate-200">
                <span className="text-slate-500 dark:text-surveillance-400">T+{pt.timestamp}s:</span> [{pt.x}%, {pt.y}%]
              </div>
            ))}
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-surveillance-700/80">
          <Button size="sm" variant="outline" onClick={onClose} icon={<Download className="w-3.5 h-3.5" />}>
            Export Target Telemetry
          </Button>
          <Button size="sm" variant="primary" onClick={onClose}>
            Close Inspector
          </Button>
        </div>
      </div>
    </TacticalModal>
  );
};
