import React from 'react';
import { UnknownObject } from '../../types/detection';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';
import { AlertTriangle, Fingerprint, Eye, Check, X, ShieldQuestion } from 'lucide-react';

interface UnknownObjectCardProps {
  object: UnknownObject;
  onUpdateStatus: (id: string, status: UnknownObject['investigationStatus']) => void;
  onInspect?: (object: UnknownObject) => void;
}

export const UnknownObjectCard: React.FC<UnknownObjectCardProps> = ({
  object,
  onUpdateStatus,
  onInspect,
}) => {
  const statusVariants: Record<UnknownObject['investigationStatus'], 'warning' | 'critical' | 'success' | 'neutral'> = {
    INVESTIGATE: 'critical',
    FLAGGED: 'warning',
    RESOLVED: 'success',
    DISMISSED: 'neutral',
  };

  return (
    <div className="bg-surveillance-800/90 border border-tactical-amber/50 rounded-sm p-4 backdrop-blur-sm shadow-[0_0_15px_rgba(245,158,11,0.08)] relative overflow-hidden transition-all duration-200 hover:border-tactical-amber">
      {/* Amber alert corner accents */}
      <div className="absolute top-0 right-0 w-8 h-8 pointer-events-none overflow-hidden">
        <div className="absolute top-0 right-0 w-12 h-2 bg-tactical-amber transform rotate-45 translate-x-3 -translate-y-1 shadow-sm" />
      </div>

      {/* Headline & ID */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xs bg-tactical-amber/15 border border-tactical-amber/40 text-tactical-amber">
            <ShieldQuestion className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-mono text-sm font-bold tracking-wider text-surveillance-100">
                NOVEL OBJECT #{String(object.trackId || object.trackingId).padStart(2, '0')}
              </h4>
              <Badge variant={statusVariants[object.investigationStatus]} size="xs" pulse={object.investigationStatus === 'INVESTIGATE'}>
                {object.investigationStatus}
              </Badge>
            </div>
            <p className="font-mono text-[11px] text-surveillance-400 mt-0.5">
              NEAREST: <span className="text-surveillance-200 uppercase">{object.topKnownClass || 'N/A'}</span> ({object.topKnownSimilarity !== undefined ? (object.topKnownSimilarity * 100).toFixed(1) : '0.0'}%) • DIST: {object.embeddingDistance !== undefined ? object.embeddingDistance.toFixed(3) : 'N/A'} • CLUSTER: {object.clusterId || 'UNCLUSTERED'}
            </p>
          </div>
        </div>

        {onInspect && (
          <Button size="sm" variant="outline" onClick={() => onInspect(object)} icon={<Eye className="w-3.5 h-3.5" />}>
            Inspect
          </Button>
        )}
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 py-3 border-y border-surveillance-700/80 my-3 font-mono">
        {/* Novelty Score */}
        <div className="p-2 rounded-xs bg-surveillance-850 border border-surveillance-700/60">
          <span className="text-[10px] text-surveillance-400 uppercase tracking-wider block">Novelty Score</span>
          <span className="text-base font-bold text-tactical-amber">{object.noveltyScore}%</span>
          <div className="w-full bg-surveillance-750 h-1 rounded-full mt-1 overflow-hidden">
            <div className="bg-tactical-amber h-full" style={{ width: `${object.noveltyScore}%` }} />
          </div>
        </div>

        {/* Confidence */}
        <div className="p-2 rounded-xs bg-surveillance-850 border border-surveillance-700/60">
          <span className="text-[10px] text-surveillance-400 uppercase tracking-wider block">Confidence</span>
          <span className="text-base font-bold text-surveillance-100">{(object.confidence * 100).toFixed(0)}%</span>
          <div className="w-full bg-surveillance-750 h-1 rounded-full mt-1 overflow-hidden">
            <div className="bg-tactical-cyan h-full" style={{ width: `${object.confidence * 100}%` }} />
          </div>
        </div>

        {/* Persistence */}
        <div className="p-2 rounded-xs bg-surveillance-850 border border-surveillance-700/60">
          <span className="text-[10px] text-surveillance-400 uppercase tracking-wider block">Persistence</span>
          <span className="text-base font-bold text-tactical-emerald">{object.persistenceScore}%</span>
          <div className="w-full bg-surveillance-750 h-1 rounded-full mt-1 overflow-hidden">
            <div className="bg-tactical-emerald h-full" style={{ width: `${object.persistenceScore}%` }} />
          </div>
        </div>

        {/* Frames Observed */}
        <div className="p-2 rounded-xs bg-surveillance-850 border border-surveillance-700/60">
          <span className="text-[10px] text-surveillance-400 uppercase tracking-wider block">Frames Observed</span>
          <span className="text-base font-bold text-surveillance-100">{object.framesObserved}</span>
          <span className="text-[9px] text-surveillance-400 block mt-0.5">~{Math.round(object.framesObserved / 30)}s tracking</span>
        </div>
      </div>

      {/* Observation timestamps & zone */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-surveillance-400">
        <div className="flex items-center gap-4">
          <span>FIRST SEEN: <strong className="text-surveillance-200">{object.firstSeen ? (object.firstSeen.includes(' ') ? object.firstSeen.split(' ')[1] : object.firstSeen) : '--:--:--'}</strong></span>
          <span>LAST SEEN: <strong className="text-surveillance-200">{object.lastSeen ? (object.lastSeen.includes(' ') ? object.lastSeen.split(' ')[1] : object.lastSeen) : '--:--:--'}</strong></span>
          {object.currentZoneName && (
            <span className="text-tactical-red font-semibold">ZONE: {object.currentZoneName}</span>
          )}
        </div>

        {/* Investigation Actions */}
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant={object.investigationStatus === 'FLAGGED' ? 'warning' : 'outline'}
            onClick={() => onUpdateStatus(object.id, 'FLAGGED')}
          >
            FLAG
          </Button>
          <Button
            size="sm"
            variant={object.investigationStatus === 'RESOLVED' ? 'primary' : 'outline'}
            onClick={() => onUpdateStatus(object.id, 'RESOLVED')}
            icon={<Check className="w-3 h-3" />}
          >
            RESOLVE
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onUpdateStatus(object.id, 'DISMISSED')}
          >
            DISMISS
          </Button>
        </div>
      </div>

      {object.notes && (
        <p className="mt-2 text-[11px] font-mono text-surveillance-300 bg-surveillance-850/80 p-2 rounded-xs border border-surveillance-700/50">
          <strong className="text-surveillance-400 uppercase">ANALYST NOTE:</strong> {object.notes}
        </p>
      )}
    </div>
  );
};
