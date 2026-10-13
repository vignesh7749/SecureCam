import React, { useRef, useState, useCallback, useEffect } from 'react';
import { useSurveillance } from '../../context/SurveillanceContext';
import { BoundingBoxOverlay } from './BoundingBoxOverlay';
import { ZoneOverlay } from './ZoneOverlay';
import { ZoneEditorCanvas } from './ZoneEditorCanvas';
import { VideoControls } from './VideoControls';
import { AlertTriangle } from 'lucide-react';

interface SurveillanceViewerProps {
  onSelectObject?: (id: string) => void;
  onSelectZone?: (id: string) => void;
  className?: string;
}

export const SurveillanceViewer: React.FC<SurveillanceViewerProps> = ({
  onSelectObject,
  onSelectZone,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoadingVideo, setIsLoadingVideo] = useState(false);
  const [videoLoadError, setVideoLoadError] = useState<string | null>(null);
  const [renderedDimensions, setRenderedDimensions] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  const {
    apiMode,
    isPrecomputedDemoReplay,
    realDetections,
    registerVideoElement,
    onVideoTimeUpdate,
    onVideoDurationChange,
    onVideoPlay,
    onVideoPause,
    onVideoEnded,
    activeSource,
    isPlaying,
    playbackSpeed,
    zones,
    trackedObjects,
    selectedObjectId,
    setSelectedObjectId,
    selectedZoneId,
    setSelectedZoneId,
    isZoneEditMode,
    drawingShape,
    setDrawingShape,
    draftPoints,
    setDraftPoints,
    finishDraftZone,
    cancelDraftZone,
    activeViolations,
  } = useSurveillance();

  const handleVideoRef = useCallback((el: HTMLVideoElement | null) => {
    (videoRef as any).current = el;
    setVideoEl(el);
    registerVideoElement(el);
    if (el) {
      el.muted = true;
      el.defaultMuted = true;
      el.playbackRate = playbackSpeed;
    }
  }, [registerVideoElement, playbackSpeed]);

  const currentVideoSrc = activeSource.uri;

  // Responsive video scaling calculation: ensures bounding boxes and zones scale 1:1 with video pixels
  const updateDimensions = useCallback(() => {
    const vp = viewportRef.current;
    if (!vp) return;

    const vpWidth = vp.clientWidth;
    const vpHeight = vp.clientHeight;
    if (vpWidth <= 0 || vpHeight <= 0) return;

    const v = videoRef.current;
    const naturalW = v?.videoWidth && v.videoWidth > 0 ? v.videoWidth : 1920;
    const naturalH = v?.videoHeight && v.videoHeight > 0 ? v.videoHeight : 1080;
    const videoAspect = naturalW / naturalH;

    const vpAspect = vpWidth / vpHeight;

    let targetW: number;
    let targetH: number;

    if (vpAspect > videoAspect) {
      // Viewport is wider than video (pillarbox): constrained by height
      targetH = vpHeight;
      targetW = Math.round(vpHeight * videoAspect);
    } else {
      // Viewport is taller than video (letterbox): constrained by width
      targetW = vpWidth;
      targetH = Math.round(vpWidth / videoAspect);
    }

    setRenderedDimensions({ width: targetW, height: targetH });
  }, []);

  useEffect(() => {
    updateDimensions();

    const vp = viewportRef.current;
    if (!vp) return;

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => {
        updateDimensions();
      });
      observer.observe(vp);
    }

    window.addEventListener('resize', updateDimensions);

    return () => {
      if (observer) observer.disconnect();
      window.removeEventListener('resize', updateDimensions);
    };
  }, [updateDimensions, isFullscreen]);

  // Keep video source and playback speed synchronized on the stable video element
  useEffect(() => {
    const v = videoEl || videoRef.current;
    if (!v || !currentVideoSrc) return;
    v.muted = true;
    v.defaultMuted = true;
    if (!v.src.endsWith(currentVideoSrc) && v.src !== currentVideoSrc) {
      setIsLoadingVideo(true);
      v.src = currentVideoSrc;
      v.load();
    }
  }, [currentVideoSrc, videoEl]);

  useEffect(() => {
    const v = videoEl || videoRef.current;
    if (v) {
      v.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed, videoEl]);

  // High-precision per-frame bounding box synchronization loop
  useEffect(() => {
    const v = videoEl || videoRef.current;
    if (!v) return;

    let callbackId: number | null = null;
    let animId: number | null = null;
    let isRunning = false;
    let isDisposed = false;

    const cancelLoop = () => {
      isRunning = false;
      if (callbackId !== null && 'cancelVideoFrameCallback' in v) {
        (v as any).cancelVideoFrameCallback(callbackId);
        callbackId = null;
      }
      if (animId !== null) {
        cancelAnimationFrame(animId);
        animId = null;
      }
    };

    const scheduleFrame = () => {
      if (isDisposed || !isRunning) return;
      if ('requestVideoFrameCallback' in v) {
        callbackId = (v as any).requestVideoFrameCallback(onFrame);
      } else {
        animId = requestAnimationFrame(onFrame);
      }
    };

    const onFrame = () => {
      if (isDisposed || !isRunning) return;
      if (!v.paused && !v.ended) {
        onVideoTimeUpdate(v.currentTime, v.duration);
        scheduleFrame();
      } else {
        isRunning = false;
      }
    };

    const startLoop = () => {
      if (isDisposed) return;
      if (!isRunning) {
        isRunning = true;
        onVideoTimeUpdate(v.currentTime, v.duration);
        scheduleFrame();
      }
    };

    const handlePlayOrPlaying = () => {
      startLoop();
    };

    const handlePauseOrEnded = () => {
      cancelLoop();
    };

    const handleSeeked = () => {
      onVideoTimeUpdate(v.currentTime, v.duration);
    };

    v.addEventListener('play', handlePlayOrPlaying);
    v.addEventListener('playing', handlePlayOrPlaying);
    v.addEventListener('pause', handlePauseOrEnded);
    v.addEventListener('ended', handlePauseOrEnded);
    v.addEventListener('seeked', handleSeeked);

    if (isPlaying || (!v.paused && !v.ended)) {
      startLoop();
    } else {
      onVideoTimeUpdate(v.currentTime, v.duration);
    }

    return () => {
      isDisposed = true;
      cancelLoop();
      v.removeEventListener('play', handlePlayOrPlaying);
      v.removeEventListener('playing', handlePlayOrPlaying);
      v.removeEventListener('pause', handlePauseOrEnded);
      v.removeEventListener('ended', handlePauseOrEnded);
      v.removeEventListener('seeked', handleSeeked);
    };
  }, [currentVideoSrc, isPlaying, videoEl, onVideoTimeUpdate]);

  // Clear video stream error when active source URI changes
  useEffect(() => {
    setVideoLoadError(null);
  }, [currentVideoSrc]);

  const handleVideoError = (e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
    const video = e.currentTarget;
    const err = video.error;
    const msg = err ? `MediaError code ${err.code}: ${err.message}` : 'Video stream unavailable';
    console.warn(`Video stream error for ${activeSource.name} (${activeSource.uri}):`, msg);
    setIsLoadingVideo(false);
    setVideoLoadError(msg);
  };

  // Fullscreen event listener to synchronize state on fullscreenchange and ESC key
  useEffect(() => {
    const handleFullscreenChange = () => {
      const fsElement =
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement;
      const isFs = Boolean(
        fsElement &&
          containerRef.current &&
          (fsElement === containerRef.current || containerRef.current.contains(fsElement))
      );
      setIsFullscreen(isFs);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    };
  }, []);

  // True Fullscreen toggle operating strictly on containerRef (entire player)
  const toggleFullscreen = useCallback(async () => {
    const container = containerRef.current;
    if (!container) return;

    try {
      const fsElement =
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement;

      if (!fsElement) {
        if (container.requestFullscreen) {
          await container.requestFullscreen();
        } else if ((container as any).webkitRequestFullscreen) {
          await (container as any).webkitRequestFullscreen();
        } else if ((container as any).mozRequestFullScreen) {
          await (container as any).mozRequestFullScreen();
        } else if ((container as any).msRequestFullscreen) {
          await (container as any).msRequestFullscreen();
        }
        setIsFullscreen(true);
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if ((document as any).webkitExitFullscreen) {
          await (document as any).webkitExitFullscreen();
        } else if ((document as any).mozCancelFullScreen) {
          await (document as any).mozCancelFullScreen();
        } else if ((document as any).msExitFullscreen) {
          await (document as any).msExitFullscreen();
        }
        setIsFullscreen(false);
      }
    } catch (err) {
      console.warn('Fullscreen toggle notice:', err);
    }
  }, []);

  const handleObjectClick = (id: string) => {
    setSelectedObjectId(id);
    if (onSelectObject) onSelectObject(id);
  };

  const handleZoneClick = (id: string) => {
    setSelectedZoneId(id);
    if (onSelectZone) onSelectZone(id);
  };

  const activeViolationCount = activeViolations.filter(v => v.status === 'ACTIVE').length;

  return (
    <div
      ref={containerRef}
      className={`securecam-player-fullscreen relative flex flex-col bg-slate-950 border border-slate-800 rounded shadow-md overflow-hidden select-none transition-all duration-150 ${
        isFullscreen
          ? 'is-fullscreen fixed inset-0 z-50 w-screen h-screen max-w-[100vw] max-h-[100vh] bg-black border-none rounded-none'
          : className
      }`}
    >
      {/* 
        Video Screen Viewport:
        Holds the video element and all synchronized overlays (bounding boxes, trajectories, zones, drawing HUD).
        In fullscreen mode, fills remaining flex-1 space with controls docked at bottom.
        In standard mode, uses 16:9 aspect-video with max-h-[72vh].
      */}
      <div
        ref={viewportRef}
        className={`relative w-full bg-black overflow-hidden flex items-center justify-center mx-auto ${
          isFullscreen
            ? 'flex-1 min-h-0 h-full max-h-full'
            : 'aspect-video max-h-[72vh]'
        }`}
      >
        {currentVideoSrc ? (
          <div
            className="relative flex items-center justify-center max-w-full max-h-full"
            style={
              renderedDimensions.width > 0 && renderedDimensions.height > 0
                ? {
                    width: `${renderedDimensions.width}px`,
                    height: `${renderedDimensions.height}px`,
                  }
                : {
                    width: '100%',
                    height: '100%',
                    aspectRatio: '16 / 9',
                  }
            }
          >
            {/* Layer 1: Real Video Frame (Bottom, z-0) */}
            <video
              ref={handleVideoRef}
              src={currentVideoSrc}
              autoPlay
              loop
              muted
              playsInline
              preload="metadata"
              onLoadStart={() => setIsLoadingVideo(true)}
              onLoadedData={(e) => {
                setIsLoadingVideo(false);
                const v = e.currentTarget;
                onVideoTimeUpdate(v.currentTime, v.duration);
                updateDimensions();
              }}
              onWaiting={() => setIsLoadingVideo(true)}
              onPlaying={() => setIsLoadingVideo(false)}
              onPlay={onVideoPlay}
              onPause={onVideoPause}
              onSeeked={(e) => onVideoTimeUpdate(e.currentTarget.currentTime, e.currentTarget.duration)}
              onTimeUpdate={(e) => onVideoTimeUpdate(e.currentTarget.currentTime, e.currentTarget.duration)}
              onDurationChange={(e) => onVideoDurationChange(e.currentTarget.duration)}
              onLoadedMetadata={(e) => {
                const v = e.currentTarget;
                onVideoDurationChange(v.duration);
                setIsLoadingVideo(false);
                updateDimensions();
              }}
              onCanPlay={(e) => {
                const v = e.currentTarget;
                setIsLoadingVideo(false);
                updateDimensions();
                if (isPlaying && v.paused) {
                  const p = v.play();
                  if (p !== undefined) {
                    p.catch(() => {
                      onVideoPause();
                    });
                  }
                }
              }}
              onEnded={onVideoEnded}
              onError={handleVideoError}
              className="w-full h-full block object-contain select-none"
            />

            {/* Simple Loading Video UX */}
            {isLoadingVideo && !videoLoadError && (
              <div className="absolute inset-0 z-5 flex items-center justify-center bg-black/40 pointer-events-none">
                <span className="text-xs text-slate-300 font-medium">Loading video...</span>
              </div>
            )}

            {/* Video Load / Streaming Error Notice */}
            {videoLoadError && (
              <div className="absolute inset-0 z-35 flex flex-col items-center justify-center bg-slate-950/95 text-slate-300 p-6 text-center gap-3 select-none">
                <div className="p-3 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-500">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div className="max-w-md space-y-1.5">
                  <h4 className="text-sm font-semibold text-white">Sample Video Not Bundled in Static Vercel Demo</h4>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    This video is a large surveillance asset (&gt;80MB) stored in <code className="text-slate-300 bg-slate-800 px-1 py-0.5 rounded font-mono">backend/samples/</code> and excluded from Git/Vercel to comply with hosting limits.
                  </p>
                  <p className="text-[11px] text-amber-400/90 font-mono pt-1">
                    To stream locally: <code className="bg-slate-800 px-1 py-0.5 rounded">python run_backend.py</code><br />
                    To stream online: Configure <code className="bg-slate-800 px-1 py-0.5 rounded">VITE_SAMPLE_VIDEOS_STORAGE_URL</code> in Vercel.
                  </p>
                </div>
              </div>
            )}

            {/* Layer 2: Detection & Bounding Boxes Layer (z-10) */}
            <BoundingBoxOverlay
              objects={trackedObjects}
              onSelectObject={handleObjectClick}
              selectedObjectId={selectedObjectId}
            />

            {/* Layer 3: Security Zones Layer (z-20) */}
            <ZoneOverlay
              zones={zones}
              objects={trackedObjects}
              onSelectZone={handleZoneClick}
              selectedZoneId={selectedZoneId}
            />

            {/* Layer 4: Zone Drawing Interactive Canvas Overlay (z-30) */}
            <ZoneEditorCanvas
              isDrawing={isZoneEditMode}
              drawingShape={drawingShape}
              setDrawingShape={setDrawingShape}
              draftPoints={draftPoints}
              setDraftPoints={setDraftPoints}
              onFinishZone={finishDraftZone}
              onCancel={cancelDraftZone}
            />

            {/* Layer 5: Subtle Video HUD Overlay (z-40) */}
            <div className="absolute top-3 left-3 z-40 flex flex-wrap items-center gap-2 pointer-events-none">
              {activeSource.name && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-900/80 border border-slate-700/80 text-xs text-slate-200 backdrop-blur-sm">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  <span className="font-medium">{activeSource.name}</span>
                </div>
              )}

              {apiMode === 'LIVE_AI' ? (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-950/80 border border-emerald-500/50 text-xs text-emerald-300 font-semibold backdrop-blur-sm shadow-sm">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>[LIVE AI: Ultralytics YOLOv8]</span>
                </div>
              ) : isPrecomputedDemoReplay ? (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber-950/80 border border-amber-500/50 text-xs text-amber-300 font-semibold backdrop-blur-sm shadow-sm">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  <span>[DEMO MODE: PRECOMPUTED BENCHMARK REPLAY]</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-900/80 border border-slate-700/80 text-xs text-slate-300 font-medium backdrop-blur-sm shadow-sm">
                  <span className="w-2 h-2 rounded-full bg-slate-400" />
                  <span>[Raw Video Playback — Live AI requires local backend]</span>
                </div>
              )}

              {activeViolationCount > 0 && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-red-600/90 text-white text-xs font-semibold shadow">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>{activeViolationCount} Zone Violation{activeViolationCount > 1 ? 's' : ''}</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="w-full h-full bg-slate-900 flex flex-col items-center justify-center text-slate-500 gap-2 p-8 text-center">
            <span className="text-sm font-medium text-slate-400">No Video Loaded</span>
            <span className="text-xs text-slate-500">Select a sample video or upload an MP4 video file to begin analysis.</span>
          </div>
        )}
      </div>

      {/* Integrated Video Playback Controls Bar */}
      <div className="player-controls-bar shrink-0 z-30 w-full">
        <VideoControls
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
        />
      </div>
    </div>
  );
};
