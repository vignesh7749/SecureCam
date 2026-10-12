import React, { useState } from 'react';
import { useSurveillance } from '../context/SurveillanceContext';
import { ObjectTable } from '../components/objects/ObjectTable';
import { UnknownObjectCard } from '../components/objects/UnknownObjectCard';
import { ObjectInspectorModal } from '../components/objects/ObjectInspectorModal';
import { TrackedObject } from '../types/detection';
import { StatCard } from '../components/common/StatCard';
import { Crosshair, AlertTriangle, ShieldCheck, Activity } from 'lucide-react';

export const ObjectIntelligencePage: React.FC = () => {
  const { apiMode, realDetections, trackedObjects, unknownObjects, updateUnknownStatus } = useSurveillance();
  const [inspectedObject, setInspectedObject] = useState<TrackedObject | null>(null);

  const displayTargetCount = apiMode === 'LIVE_AI' 
    ? (trackedObjects.length > 0 ? trackedObjects.length : realDetections.length) 
    : trackedObjects.length;
  const knownCount = apiMode === 'LIVE_AI' 
    ? (trackedObjects.length > 0 ? trackedObjects.filter(o => !o.isUnknown).length : realDetections.length) 
    : trackedObjects.filter(o => !o.isUnknown).length;
  const unknownCount = unknownObjects.length;
  const investigationsCount = unknownObjects.filter(u => u.investigationStatus === 'INVESTIGATE').length;

  return (
    <div className="space-y-4">
      {apiMode === 'LIVE_AI' && (
        <div className="bg-surveillance-850 border border-tactical-cyan/40 rounded-sm p-3 font-mono text-xs flex items-center justify-between text-surveillance-200">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-tactical-cyan animate-pulse" />
            <span className="font-bold text-tactical-cyan">STAGE 4 DINOv2 VISUAL NOVELTY + BYTETRACK PIPELINE ACTIVE:</span>
            <span>Pretrained visual embeddings, prototype cosine distance, multi-signal novelty scoring, and temporal confirmation.</span>
          </div>
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="ACTIVE DETECTED TARGETS"
          value={displayTargetCount}
          subtext={apiMode === 'LIVE_AI' ? "Real YOLOv8 Detections" : "ByteTrack IDs registered"}
          icon={Crosshair}
          variant="default"
        />
        <StatCard
          label="CONFIRMED KNOWN TARGETS"
          value={knownCount}
          subtext="High classification confidence"
          icon={ShieldCheck}
          variant="cyan"
        />
        <StatCard
          label="UNKNOWN NOVELTIES"
          value={unknownCount}
          subtext="Out-of-distribution targets"
          icon={AlertTriangle}
          variant="amber"
          alert={unknownCount > 0}
        />
        <StatCard
          label="ACTIVE INVESTIGATIONS"
          value={investigationsCount}
          subtext="Requires operator sign-off"
          icon={Activity}
          variant="default"
        />
      </div>

      {/* Dedicated Unknown Objects Section */}
      <div className="space-y-2">
        <div className="flex items-center justify-between font-mono">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-tactical-amber" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-surveillance-100">
              UNKNOWN NOVEL OBJECT INTELLIGENCE (ANOMALY EMBEDDINGS)
            </h3>
          </div>
          <span className="text-[10px] text-tactical-amber bg-tactical-amber/10 px-2 py-0.5 rounded-2xs border border-tactical-amber/30">
            DINOv2 EMBEDDING ENGINE ACTIVE
          </span>
        </div>

        {unknownObjects.length === 0 ? (
          <div className="bg-surveillance-850/80 border border-surveillance-750 rounded-sm p-6 text-center font-mono">
            <ShieldCheck className="w-8 h-8 text-tactical-emerald mx-auto mb-2 opacity-80" />
            <p className="text-sm font-bold text-surveillance-200 uppercase tracking-wider">NO CONFIRMED NOVEL OBJECTS</p>
            <p className="text-xs text-surveillance-400 mt-1 max-w-md mx-auto">
              DINOv2 visual embedding engine and temporal confirmation active. All tracked targets match known surveillance reference prototypes within calibrated cosine bounds.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {unknownObjects.map((u) => (
              <UnknownObjectCard
                key={u.id}
                object={u}
                onUpdateStatus={updateUnknownStatus}
                onInspect={(obj) => setInspectedObject(obj)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Complete Tracked Objects Table */}
      <ObjectTable
        onSelectObject={(id) => {
          const obj = trackedObjects.find(o => o.id === id);
          if (obj) setInspectedObject(obj);
        }}
      />

      {/* Detailed Modal Inspector */}
      <ObjectInspectorModal
        isOpen={!!inspectedObject}
        onClose={() => setInspectedObject(null)}
        object={inspectedObject}
      />
    </div>
  );
};
