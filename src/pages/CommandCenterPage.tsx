import React, { useState } from 'react';
import { useSurveillance } from '../context/SurveillanceContext';
import { EventTimeline } from '../components/events/EventTimeline';
import { ObjectInspectorModal } from '../components/objects/ObjectInspectorModal';
import { TrackedObject } from '../types/detection';
import { Button } from '../components/common/Button';
import { 
  Users, 
  HelpCircle, 
  Target, 
  ShieldAlert, 
  Video, 
  ArrowRight,
  Server,
  Cpu,
  Layers,
  Activity,
  CheckCircle2,
  Clock,
  Sparkles
} from 'lucide-react';

export const CommandCenterPage: React.FC = () => {
  const {
    apiMode,
    realDetections,
    trackedObjects,
    unknownObjects,
    activeViolations,
    fps,
    totalLatency,
    inferenceLatency,
    detectionLatency,
    trackingLatency,
    modelConfig,
    activeSource,
    analysisStatus,
    zones,
    settings,
    backendHealth,
    setActiveTab,
  } = useSurveillance();

  const [inspectedObject, setInspectedObject] = useState<TrackedObject | null>(null);

  const totalObjectsCount = apiMode === 'LIVE_AI' 
    ? (trackedObjects.length > 0 ? trackedObjects.length : realDetections.length) 
    : trackedObjects.length;
  const unknownCount = unknownObjects.length;
  const violationsCount = activeViolations.filter(v => v.status === 'ACTIVE').length;
  const activeZonesCount = zones.filter(z => z.enabled).length;

  const hasVideoLoaded = Boolean(activeSource.id && activeSource.uri);

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">SECURECAM</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Video-based security monitoring and object detection
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="primary"
            onClick={() => setActiveTab('video-analysis')}
            icon={<Video className="w-3.5 h-3.5" />}
          >
            Video Analysis
          </Button>
        </div>
      </div>

      {/* 4 Core Summary Statistics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-3">
        <div className="bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded p-3 sm:p-3.5 flex items-center gap-2.5 sm:gap-3">
          <div className="p-2 sm:p-2.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 shrink-0">
            <Users className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-[11px] text-slate-500 dark:text-slate-400 block font-medium truncate">Objects Detected</span>
            <span className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">{totalObjectsCount}</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded p-3 sm:p-3.5 flex items-center gap-2.5 sm:gap-3">
          <div className="p-2 sm:p-2.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shrink-0">
            <Target className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-[11px] text-slate-500 dark:text-slate-400 block font-medium truncate">Tracked Objects</span>
            <span className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">{trackedObjects.length}</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded p-3 sm:p-3.5 flex items-center gap-2.5 sm:gap-3">
          <div className="p-2 sm:p-2.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 shrink-0">
            <HelpCircle className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-[11px] text-slate-500 dark:text-slate-400 block font-medium truncate">Unknown Objects</span>
            <span className={`text-lg sm:text-xl font-bold ${unknownCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-white'}`}>
              {unknownCount}
            </span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded p-3 sm:p-3.5 flex items-center gap-2.5 sm:gap-3">
          <div className="p-2 sm:p-2.5 rounded bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20 shrink-0">
            <ShieldAlert className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-[11px] text-slate-500 dark:text-slate-400 block font-medium truncate">Zone Violations</span>
            <span className={`text-lg sm:text-xl font-bold ${violationsCount > 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-white'}`}>
              {violationsCount}
            </span>
          </div>
        </div>
      </div>

      {/* Video Overview & Analysis CTA Card (Small preview only, NOT full player) */}
      <div className="bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded p-3.5 sm:p-4">
        {hasVideoLoaded ? (
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-3.5">
              {/* Compact static video thumbnail */}
              <div className="w-full sm:w-44 h-32 sm:h-24 bg-black rounded border border-slate-700/80 overflow-hidden relative shrink-0 flex items-center justify-center">
                <video
                  key={activeSource.id || activeSource.uri}
                  src={activeSource.uri}
                  muted
                  playsInline
                  preload="auto"
                  crossOrigin="anonymous"
                  onLoadedMetadata={(e) => {
                    if (e.currentTarget.currentTime === 0) e.currentTarget.currentTime = 0.001;
                  }}
                  className="w-full h-full object-cover pointer-events-none opacity-80"
                />
                <span className="absolute bottom-1 right-1 px-1.5 py-0.2 rounded bg-black/80 text-[10px] font-mono text-slate-300">
                  {activeSource.resolution || 'HD'}
                </span>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-slate-900 dark:text-white truncate max-w-[200px]">{activeSource.name}</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-semibold shrink-0 ${
                    analysisStatus === 'COMPLETED'
                      ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                      : analysisStatus === 'ANALYZING'
                      ? 'bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/30'
                      : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                  }`}>
                    {analysisStatus}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  Active video footage loaded and ready in the primary analysis workspace.
                </p>
                <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 font-mono">
                  <span>{activeSource.fps || 15} FPS</span>
                  <span>•</span>
                  <span>{activeSource.resolution}</span>
                  {activeSource.metadata?.durationSeconds && (
                    <>
                      <span>•</span>
                      <span>{Math.round(activeSource.metadata.durationSeconds)}s</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <Button
              size="md"
              variant="primary"
              onClick={() => setActiveTab('video-analysis')}
              icon={<ArrowRight className="w-4 h-4" />}
              className="w-full md:w-auto shrink-0 font-semibold"
            >
              VIEW ANALYSIS
            </Button>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 py-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">No Video Loaded</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Select a sample video from the library or upload an MP4 file to run detection and tracking.
              </p>
            </div>
            <Button
              size="sm"
              variant="primary"
              onClick={() => setActiveTab('video-analysis')}
              icon={<Video className="w-3.5 h-3.5" />}
            >
              Open Video Analysis
            </Button>
          </div>
        )}
      </div>

      {/* Main Overview Grid: Recent Events & System Status */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left: Recent Security Events */}
        <div className="lg:col-span-7 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Recent Events</h2>
            <button
              onClick={() => setActiveTab('events')}
              className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300 font-medium transition-colors"
            >
              View All Events &rarr;
            </button>
          </div>
          <EventTimeline limit={5} showFilters={false} />
        </div>

        {/* Right: System Status & Project Information */}
        <div className="lg:col-span-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">System Status</h2>
            <span className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Operational</span>
            </span>
          </div>

          <div className="bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded p-4 space-y-3.5 text-xs">
            {/* Backend Service */}
            <div className="flex items-start justify-between pb-2.5 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                <div>
                  <span className="font-semibold text-slate-800 dark:text-slate-200 block">FastAPI Backend</span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">REST API &amp; WebSocket Stream</span>
                </div>
              </div>
              <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                backendHealth
                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                  : 'bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30'
              }`}>
                {backendHealth ? 'Connected' : 'Offline'}
              </span>
            </div>

            {/* Object Detection Model */}
            <div className="flex items-start justify-between pb-2.5 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <div>
                  <span className="font-semibold text-slate-800 dark:text-slate-200 block">Object Detection</span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">{modelConfig.name} (Ultralytics)</span>
                </div>
              </div>
              <span className="text-[11px] font-mono text-slate-600 dark:text-slate-300">
                Thresh: {Math.round(settings.detectionConfidenceThreshold * 100)}%
              </span>
            </div>

            {/* Multi-Object Tracking */}
            <div className="flex items-start justify-between pb-2.5 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-cyan-600 dark:text-cyan-400 shrink-0" />
                <div>
                  <span className="font-semibold text-slate-800 dark:text-slate-200 block">Multi-Object Tracker</span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">ByteTrack (Persistent IDs)</span>
                </div>
              </div>
              <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400">Active</span>
            </div>

            {/* Novelty / Unknown Object Intelligence */}
            <div className="flex items-start justify-between pb-2.5 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <div>
                  <span className="font-semibold text-slate-800 dark:text-slate-200 block">Novelty Intelligence</span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">DINOv2 ViT-S/14 Embeddings</span>
                </div>
              </div>
              <span className="text-[11px] font-mono text-amber-600 dark:text-amber-300">Enabled</span>
            </div>

            {/* Emergency Zones Engine */}
            <div className="flex items-start justify-between pb-2.5 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
                <div>
                  <span className="font-semibold text-slate-800 dark:text-slate-200 block">Emergency Zones</span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">Ray-casting Point-in-Polygon</span>
                </div>
              </div>
              <span className="text-[11px] text-slate-700 dark:text-slate-300 font-medium">
                {activeZonesCount} / {zones.length} Active
              </span>
            </div>

            {/* Execution Hardware & Telemetry */}
            <div className="pt-1 grid grid-cols-3 gap-2 text-center bg-slate-50 dark:bg-slate-900 p-2.5 rounded border border-slate-200 dark:border-slate-800">
              <div>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 block uppercase">DEVICE</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200 text-xs font-mono">{modelConfig.backend}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 block uppercase">FPS</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400 text-xs font-mono">{fps || '—'}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 block uppercase">LATENCY</span>
                <span className="font-semibold text-blue-600 dark:text-blue-400 text-xs font-mono">{totalLatency || inferenceLatency || '—'}ms</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Object Inspector Modal */}
      <ObjectInspectorModal
        isOpen={!!inspectedObject}
        onClose={() => setInspectedObject(null)}
        object={inspectedObject}
      />
    </div>
  );
};
