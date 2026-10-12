import React, { useState, useRef } from 'react';
import { useSurveillance } from '../context/SurveillanceContext';
import { SurveillanceViewer } from '../components/surveillance/SurveillanceViewer';
import { VideoUploader } from '../components/videoAnalysis/VideoUploader';
import { SampleVideoLibrary } from '../components/videoAnalysis/SampleVideoLibrary';
import { UploadedVideoList } from '../components/videoAnalysis/UploadedVideoList';
import { Button } from '../components/common/Button';
import { surveillanceApi } from '../services/api';
import { 
  Play, 
  Pause, 
  Square, 
  RotateCcw, 
  CheckCircle2, 
  FileText, 
  BellRing, 
  Film, 
  UploadCloud,
  FileVideo,
  ChevronDown,
  ChevronUp,
  Eye,
  Sliders,
  ShieldAlert,
  Loader2
} from 'lucide-react';

export const VideoAnalysisPage: React.FC = () => {
  const {
    analysisStatus,
    startAnalysis,
    pauseAnalysis,
    stopAnalysis,
    replayAnalysis,
    activeSource,
    analysisProgress,
    trackedObjects,
    allSessionTargets,
    realDetections,
    unknownObjects,
    activeViolations,
    totalUniqueTracksCount,
    events,
    zones,
    modelConfig,
    pipelineFps,
    detectionLatency,
    trackingLatency,
    totalLatency,
    currentFrame,
    totalDurationSeconds,
    fps,
    setActiveTab,
    uploadedVideos,
    detectionProfile,
    setDetectionProfile,
    sampleVideos,
    activeSampleVideo,
    selectSampleVideo,
    loadUploadedVideo,
  } = useSurveillance();

  const [sourceTab, setSourceTab] = useState<'sample' | 'uploaded' | 'upload'>('sample');
  const [showSourceSelector, setShowSourceSelector] = useState<boolean>(true);
  const [showTechDetails, setShowTechDetails] = useState<boolean>(false);
  const [isUploadingEmpty, setIsUploadingEmpty] = useState<boolean>(false);
  const emptyUploadInputRef = useRef<HTMLInputElement>(null);
  const isUploadingEmptyRef = useRef<boolean>(false);

  const handleEmptyFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isUploadingEmptyRef.current) return;
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      try {
        isUploadingEmptyRef.current = true;
        setIsUploadingEmpty(true);
        const { source, metadata } = await surveillanceApi.uploadVideoFile(file);
        await loadUploadedVideo(source, metadata);
        setSourceTab('uploaded');
        setShowSourceSelector(false);
      } catch (err: any) {
        console.error('Failed to upload video from empty workspace:', err);
      } finally {
        isUploadingEmptyRef.current = false;
        setIsUploadingEmpty(false);
        if (e.target) {
          e.target.value = '';
        }
      }
    }
  };

  const isSampleWorkspace = sourceTab === 'sample';
  const isUploadedWorkspace = sourceTab === 'uploaded';
  const isUploadWorkspace = sourceTab === 'upload';

  const hasSampleVideo = isSampleWorkspace && activeSource.type === 'sample' && Boolean(activeSource.id && activeSource.uri);
  const hasUploadedVideo = isUploadedWorkspace && activeSource.type === 'upload' && Boolean(activeSource.id && activeSource.uri);
  const hasActiveWorkspaceVideo = isSampleWorkspace ? hasSampleVideo : (isUploadedWorkspace ? hasUploadedVideo : false);

  const detectedCount = trackedObjects.length > 0 ? trackedObjects.length : realDetections.length;
  const uniqueTargetsCount = allSessionTargets.length > 0 
    ? allSessionTargets.length 
    : (totalUniqueTracksCount || detectedCount);
  const knownCount = allSessionTargets.filter(t => !t.isUnknown).length;
  const totalFrames = (totalDurationSeconds > 0 && fps > 0 ? Math.round(totalDurationSeconds * fps) : 0);
  const formattedDuration = `${String(Math.floor(totalDurationSeconds / 60)).padStart(2, '0')}:${String(Math.floor(totalDurationSeconds % 60)).padStart(2, '0')}`;

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">Video Analysis</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Primary video workspace for object detection, tracking, unknown classification, and emergency zones
          </p>
        </div>

        {hasActiveWorkspaceVideo && (
          <div className="text-xs text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-850 px-3 py-1 rounded border border-slate-200 dark:border-slate-800 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            <span>Active: <strong className="text-slate-900 dark:text-white font-medium">{activeSource.name}</strong></span>
            <span className="text-slate-400 dark:text-slate-500">|</span>
            <span className="text-slate-500 dark:text-slate-400 font-mono">{activeSource.resolution}</span>
          </div>
        )}
      </div>

      {/* 1. Video Source Selection (Toggle: Sample Videos / Uploaded Videos / Upload) */}
      <div className="bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded overflow-hidden">
        <div className="px-4 py-3 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 border-b border-slate-200 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                setSourceTab('sample');
                setShowSourceSelector(true);
                if (activeSource.type !== 'sample' && sampleVideos.length > 0) {
                  selectSampleVideo(activeSampleVideo || sampleVideos[0]);
                }
              }}
              className={`px-3 py-1.5 rounded text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                sourceTab === 'sample' && showSourceSelector
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:text-slate-900 border border-slate-200 dark:bg-slate-900 dark:text-slate-400 dark:hover:text-slate-200 dark:border-slate-800'
              }`}
            >
              <Film className="w-3.5 h-3.5" />
              <span>Sample Videos</span>
            </button>

            <button
              onClick={() => {
                setSourceTab('uploaded');
                setShowSourceSelector(true);
              }}
              className={`px-3 py-1.5 rounded text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                sourceTab === 'uploaded' && showSourceSelector
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:text-slate-900 border border-slate-200 dark:bg-slate-900 dark:text-slate-400 dark:hover:text-slate-200 dark:border-slate-800'
              }`}
            >
              <FileVideo className="w-3.5 h-3.5" />
              <span>Uploaded Videos ({uploadedVideos.length})</span>
            </button>

            <button
              onClick={() => { setSourceTab('upload'); setShowSourceSelector(true); }}
              className={`px-3 py-1.5 rounded text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                sourceTab === 'upload' && showSourceSelector
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:text-slate-900 border border-slate-200 dark:bg-slate-900 dark:text-slate-400 dark:hover:text-slate-200 dark:border-slate-800'
              }`}
            >
              <UploadCloud className="w-3.5 h-3.5" />
              <span>Upload Video</span>
            </button>
          </div>

          <button
            onClick={() => setShowSourceSelector(!showSourceSelector)}
            className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 flex items-center justify-center sm:justify-start gap-1 transition-colors px-2 py-1 cursor-pointer"
          >
            <span>{showSourceSelector ? 'Collapse Library' : 'Expand Library'}</span>
            {showSourceSelector ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        {showSourceSelector && (
          <div className="p-4 border-t border-slate-200 dark:border-slate-800/80 bg-slate-50 dark:bg-slate-900/50">
            {sourceTab === 'sample' ? (
              <SampleVideoLibrary onSelectSample={() => setShowSourceSelector(false)} />
            ) : sourceTab === 'uploaded' ? (
              <UploadedVideoList onSelectVideo={() => setShowSourceSelector(false)} />
            ) : (
              <VideoUploader onUploadComplete={() => { setSourceTab('uploaded'); setShowSourceSelector(true); }} />
            )}
          </div>
        )}
      </div>

      {/* Uploaded Video Clean Empty State */}
      {!hasActiveWorkspaceVideo && isUploadedWorkspace && (
        <div className="bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded p-12 text-center flex flex-col items-center justify-center space-y-4">
          <input
            ref={emptyUploadInputRef}
            type="file"
            accept="video/mp4,video/x-matroska,video/avi,video/webm"
            className="hidden"
            onChange={handleEmptyFileSelect}
          />
          <div className="w-14 h-14 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-400 dark:text-slate-500">
            {isUploadingEmpty ? (
              <Loader2 className="w-7 h-7 text-blue-500 animate-spin" />
            ) : (
              <UploadCloud className="w-7 h-7" />
            )}
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-slate-900 dark:text-white uppercase tracking-wide">
              NO VIDEO UPLOADED
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {isUploadingEmpty
                ? 'Uploading video file and initializing detection pipeline...'
                : 'Upload a video to begin analysis.'}
            </p>
          </div>
          <Button
            size="md"
            variant="primary"
            disabled={isUploadingEmpty}
            onClick={() => {
              emptyUploadInputRef.current?.click();
            }}
            icon={isUploadingEmpty ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
          >
            {isUploadingEmpty ? 'UPLOADING...' : 'UPLOAD VIDEO'}
          </Button>
        </div>
      )}

      {/* Active Video Workspace (Video Player, Execution Bar, Progress Card, Results) */}
      {hasActiveWorkspaceVideo && (
        <>
          {/* 2. Video Player Workspace (The ONLY primary video player) */}
          <div className="space-y-3">
            <SurveillanceViewer />
          </div>

          {/* 3. Analysis Execution Bar ([ START ANALYSIS ] / Pause / Stop / Replay + Profile Selector) */}
          <div className="bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded p-4 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                Ready to Analyze: {activeSource.name}
              </h2>
              <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-slate-500 dark:text-slate-400">
                <span>Status: <strong className="text-slate-800 dark:text-slate-200">{analysisStatus}</strong></span>
                <span className="text-slate-300 dark:text-slate-600">|</span>
                <span>Profile: <strong className="text-blue-600 dark:text-blue-400">{detectionProfile}</strong></span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              {/* Profile Selector */}
              <div className="flex items-center justify-center bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700/80 rounded p-0.5 text-xs">
                <button
                  onClick={() => setDetectionProfile('BALANCED')}
                  title="640px inference, conf 0.35 — balanced speed & accuracy"
                  className={`flex-1 sm:flex-initial px-2.5 py-1.5 min-h-[34px] sm:min-h-0 rounded text-xs font-medium transition-colors cursor-pointer ${
                    detectionProfile === 'BALANCED'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  Balanced (640px)
                </button>
                <button
                  onClick={() => setDetectionProfile('PRECISION')}
                  title="960px inference, conf 0.50 — high precision for 1080p footage & small objects"
                  className={`flex-1 sm:flex-initial px-2.5 py-1.5 min-h-[34px] sm:min-h-0 rounded text-xs font-medium transition-colors cursor-pointer ${
                    detectionProfile === 'PRECISION'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  Precision (960px)
                </button>
              </div>

              {/* Action Buttons: Responsive Grid on Mobile */}
              <div className="grid grid-cols-3 sm:flex items-center gap-2">
                {analysisStatus === 'ANALYZING' ? (
                  <Button size="md" variant="warning" onClick={pauseAnalysis} className="col-span-1 justify-center text-xs" icon={<Pause className="w-4 h-4" />}>
                    <span className="hidden sm:inline">PAUSE ANALYSIS</span>
                    <span className="sm:hidden">PAUSE</span>
                  </Button>
                ) : analysisStatus === 'PAUSED' ? (
                  <Button size="md" variant="primary" onClick={startAnalysis} className="col-span-1 justify-center text-xs" icon={<Play className="w-4 h-4 fill-current" />}>
                    <span className="hidden sm:inline">RESUME ANALYSIS</span>
                    <span className="sm:hidden">RESUME</span>
                  </Button>
                ) : (
                  <Button
                    size="md"
                    variant="primary"
                    onClick={startAnalysis}
                    disabled={!hasActiveWorkspaceVideo}
                    className="col-span-1 justify-center text-xs"
                    icon={<Play className="w-4 h-4 fill-current" />}
                  >
                    <span className="hidden sm:inline">START ANALYSIS</span>
                    <span className="sm:hidden">START</span>
                  </Button>
                )}

                <Button size="md" variant="secondary" onClick={stopAnalysis} className="col-span-1 justify-center text-xs" icon={<Square className="w-4 h-4" />}>
                  STOP
                </Button>

                <Button size="md" variant="outline" onClick={replayAnalysis} className="col-span-1 justify-center text-xs" icon={<RotateCcw className="w-4 h-4" />}>
                  REPLAY
                </Button>
              </div>
            </div>
          </div>

      {/* 4. During Analysis Progress Card */}
      {(analysisStatus === 'ANALYZING' || analysisStatus === 'PAUSED') && (
        <div className="bg-white dark:bg-slate-850 border border-blue-500/40 rounded p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              <span className="text-blue-600 dark:text-blue-400 font-bold uppercase tracking-wide">
                ANALYZING VIDEO
              </span>
              <span className="text-slate-400 dark:text-slate-500">|</span>
              <span className="text-slate-700 dark:text-slate-300 font-medium">
                Video: <strong className="text-slate-900 dark:text-white">{activeSource.name || 'Footage'}</strong>
              </span>
            </div>
            <div className="flex items-center gap-2 font-mono text-slate-600 dark:text-slate-300">
              <span>Frame {currentFrame} {totalFrames > 0 ? `/ ${totalFrames}` : ''}</span>
              <span className="px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-bold text-[11px]">
                {analysisProgress.toFixed(0)}%
              </span>
            </div>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-slate-200 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden">
            <div
              className="bg-blue-600 h-full transition-all duration-300 rounded-full"
              style={{ width: `${Math.max(5, analysisProgress)}%` }}
            />
          </div>

          {/* 4 Live stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1 text-xs">
            <div className="bg-slate-50 dark:bg-slate-900 p-2.5 rounded border border-slate-200 dark:border-slate-800">
              <span className="text-slate-500 dark:text-slate-400 block text-[11px]">Detected Objects</span>
              <span className="text-lg font-bold text-slate-900 dark:text-white mt-0.5 block">{detectedCount}</span>
              <span className="text-[10px] text-slate-400 dark:text-slate-500">Current Frame</span>
            </div>
            <div className="bg-slate-50 dark:bg-slate-900 p-2.5 rounded border border-slate-200 dark:border-slate-800">
              <span className="text-slate-500 dark:text-slate-400 block text-[11px]">Tracked Targets</span>
              <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-0.5 block">{uniqueTargetsCount}</span>
              <span className="text-[10px] text-slate-400 dark:text-slate-500">Unique Persistent</span>
            </div>
            <div className="bg-slate-50 dark:bg-slate-900 p-2.5 rounded border border-slate-200 dark:border-slate-800">
              <span className="text-slate-500 dark:text-slate-400 block text-[11px]">Unknown Objects</span>
              <span className="text-lg font-bold text-amber-600 dark:text-amber-400 mt-0.5 block">{unknownObjects.length}</span>
              <span className="text-[10px] text-slate-400 dark:text-slate-500">Visual Novelty</span>
            </div>
            <div className="bg-slate-50 dark:bg-slate-900 p-2.5 rounded border border-slate-200 dark:border-slate-800">
              <span className="text-slate-500 dark:text-slate-400 block text-[11px]">Zone Violations</span>
              <span className="text-lg font-bold text-red-600 dark:text-red-400 mt-0.5 block">{activeViolations.length}</span>
              <span className="text-[10px] text-slate-400 dark:text-slate-500">Active Episodes</span>
            </div>
          </div>
        </div>
      )}

      {/* 5. After Analysis Complete Card */}
      {analysisStatus === 'COMPLETED' && (
        <div className="bg-white dark:bg-slate-850 border border-emerald-500/40 rounded p-4 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="p-1 rounded bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">✓ ANALYSIS COMPLETE</h3>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                {uniqueTargetsCount} unique targets tracked | {knownCount} known objects | {unknownObjects.length} unknown objects | {activeViolations.length} zone violations
              </p>
            </div>

            {/* Action Buttons: VIEW RESULTS, VIEW EVENTS, DOWNLOAD REPORT */}
            <div className="grid grid-cols-1 sm:flex items-center gap-2 w-full sm:w-auto">
              <Button
                size="sm"
                variant="outline"
                className="justify-center"
                onClick={() => {
                  const el = document.getElementById('video-analysis-results');
                  if (el) el.scrollIntoView({ behavior: 'smooth' });
                }}
                icon={<Eye className="w-3.5 h-3.5" />}
              >
                VIEW RESULTS
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="justify-center"
                onClick={() => setActiveTab('events')}
                icon={<BellRing className="w-3.5 h-3.5" />}
              >
                VIEW EVENTS
              </Button>
              <Button
                size="sm"
                variant="primary"
                className="justify-center"
                onClick={() => setActiveTab('reports')}
                icon={<FileText className="w-3.5 h-3.5" />}
              >
                DOWNLOAD REPORT
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Simplified Video Analysis Results ("What did SecureCam find?") */}
      {(analysisStatus === 'COMPLETED' || allSessionTargets.length > 0) && (
        <div id="video-analysis-results" className="bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded p-5 space-y-6">
          {/* Section Header */}
          <div className="border-b border-slate-200 dark:border-slate-800 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                VIDEO ANALYSIS: {activeSource.name}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Consolidated surveillance intelligence and object tracking breakdown
              </p>
            </div>
            <span className="text-xs font-medium px-2 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 self-start sm:self-auto">
              {allSessionTargets.length} Unique Targets Verified
            </span>
          </div>

          {/* 1. SUMMARY */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              SUMMARY
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
              <div className="p-3 rounded bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <span className="text-slate-500 dark:text-slate-400 text-[11px] block">Total Unique Targets</span>
                <span className="text-base font-bold text-slate-900 dark:text-white mt-1 block">{uniqueTargetsCount}</span>
                <span className="text-[10px] text-slate-400 dark:text-slate-500">Physical Objects</span>
              </div>
              <div className="p-3 rounded bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <span className="text-slate-500 dark:text-slate-400 text-[11px] block">Known Targets</span>
                <span className="text-base font-bold text-blue-600 dark:text-blue-400 mt-1 block">{knownCount}</span>
                <span className="text-[10px] text-slate-400 dark:text-slate-500">Classified</span>
              </div>
              <div className="p-3 rounded bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <span className="text-slate-500 dark:text-slate-400 text-[11px] block">Unknown Objects</span>
                <span className="text-base font-bold text-amber-600 dark:text-amber-400 mt-1 block">{unknownObjects.length}</span>
                <span className="text-[10px] text-slate-400 dark:text-slate-500">Novel / Anomalous</span>
              </div>
              <div className="p-3 rounded bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <span className="text-slate-500 dark:text-slate-400 text-[11px] block">Zone Violations</span>
                <span className="text-base font-bold text-red-600 dark:text-red-400 mt-1 block">{activeViolations.length}</span>
                <span className="text-[10px] text-slate-400 dark:text-slate-500">Security Alerts</span>
              </div>
              <div className="p-3 rounded bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <span className="text-slate-500 dark:text-slate-400 text-[11px] block">Active Detections</span>
                <span className="text-base font-bold text-emerald-600 dark:text-emerald-400 mt-1 block">{detectedCount}</span>
                <span className="text-[10px] text-slate-400 dark:text-slate-500">Current Frame</span>
              </div>
              <div className="p-3 rounded bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <span className="text-slate-500 dark:text-slate-400 text-[11px] block">Video Duration</span>
                <span className="text-base font-bold text-slate-900 dark:text-white mt-1 block font-mono">{formattedDuration}</span>
                <span className="text-[10px] text-slate-400 dark:text-slate-500">MM:SS</span>
              </div>
            </div>
          </div>

          {/* 2. DETECTED OBJECTS */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              DETECTED OBJECTS ({allSessionTargets.length})
            </h3>
            {allSessionTargets.length === 0 ? (
              <div className="p-4 rounded bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 text-center">
                No persistent objects tracked yet.
              </div>
            ) : (
              <div className="border border-slate-200 dark:border-slate-800 rounded overflow-hidden">
                <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                  {allSessionTargets.map((target) => (
                    <div
                      key={target.trackingId}
                      className="px-3.5 py-2 flex items-center justify-between text-xs hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-mono font-bold text-slate-900 dark:text-white">
                          #{String(target.trackingId).padStart(2, '0')}
                        </span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {(target.className || 'OBJECT').toUpperCase()}
                        </span>
                      </div>

                      <div className="flex items-center gap-2.5">
                        <span className="font-mono text-slate-500 dark:text-slate-400 text-[11px]">
                          {(target.confidence * 100).toFixed(0)}%
                        </span>
                        {target.isUnknown ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                            Needs Review
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                            Tracked
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 3. SECURITY EVENTS */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              SECURITY EVENTS ({events.length})
            </h3>
            {events.length === 0 ? (
              <div className="p-4 rounded bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 text-center">
                No security violations detected in this video.
              </div>
            ) : (
              <div className="border border-slate-200 dark:border-slate-800 rounded overflow-hidden">
                <div className="max-h-52 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                  {events.map((evt) => (
                    <div
                      key={evt.id}
                      className="px-3.5 py-2.5 flex items-center justify-between text-xs hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="font-mono text-slate-500 dark:text-slate-400 text-[11px]">
                          {evt.timestamp ? (evt.timestamp.includes('T') ? evt.timestamp.split('T')[1].slice(0, 5) : evt.timestamp) : '00:00'}
                        </span>
                        <span className="text-slate-800 dark:text-slate-200 font-medium">
                          {evt.description || `${evt.objectClass || 'Target'} #${evt.trackingId || ''} ${evt.type}`}
                        </span>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-medium border ${
                        evt.severity === 'CRITICAL' 
                          ? 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30'
                          : 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30'
                      }`}>
                        {evt.severity}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 4. ZONE ACTIVITY */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              ZONE ACTIVITY
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {zones.map((zone) => {
                const zoneViolations = activeViolations.filter(v => v.zoneName === zone.name || v.id.includes(zone.id));
                const count = zoneViolations.length;
                return (
                  <div
                    key={zone.id}
                    className="p-3 rounded bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-white">{zone.name}</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 capitalize">{zone.type.replace('_', ' ')}</div>
                    </div>
                    <div className={`px-2 py-0.5 rounded text-[10px] font-medium border ${
                      count > 0 
                        ? 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30'
                        : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                    }`}>
                      {count > 0 ? `${count} violation${count > 1 ? 's' : ''}` : 'No violations'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 5. COLLAPSIBLE TECHNICAL TELEMETRY */}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
            <button
              onClick={() => setShowTechDetails(!showTechDetails)}
              className="w-full flex items-center justify-between py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
            >
              <span className="flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5" />
                <span>Technical Details</span>
              </span>
              {showTechDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {showTechDetails && (
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 pt-3 text-xs">
                <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block">Model</span>
                  <span className="font-semibold text-slate-900 dark:text-white mt-0.5 block truncate">{modelConfig.name}</span>
                </div>
                <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block">Tracker</span>
                  <span className="font-semibold text-slate-900 dark:text-white mt-0.5 block">{modelConfig.tracker}</span>
                </div>
                <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block">Resolution</span>
                  <span className="font-semibold text-slate-900 dark:text-white mt-0.5 block">{activeSource.resolution || '640x640'}</span>
                </div>
                <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block">Pipeline FPS</span>
                  <span className="font-semibold text-slate-900 dark:text-white mt-0.5 block">{pipelineFps.toFixed(1)} FPS</span>
                </div>
                <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block">Detection Latency</span>
                  <span className="font-semibold text-slate-900 dark:text-white mt-0.5 block">{detectionLatency.toFixed(1)}ms</span>
                </div>
                <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block">Tracking Latency</span>
                  <span className="font-semibold text-slate-900 dark:text-white mt-0.5 block">{trackingLatency.toFixed(1)}ms</span>
                </div>
                <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block">Total Latency</span>
                  <span className="font-semibold text-slate-900 dark:text-white mt-0.5 block">{totalLatency.toFixed(1)}ms</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
};
