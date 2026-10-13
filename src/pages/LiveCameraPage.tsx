import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useSurveillance } from '../context/SurveillanceContext';
import { 
  getCustomBackendUrl, 
  setCustomBackendUrl, 
  getActiveBackendUrl,
  getWebSocketUrl
} from '../services/realApi';
import { TrackedObject } from '../types/detection';
import { ZoneViolation } from '../types/zone';
import { ZoneEditorCanvas } from '../components/surveillance/ZoneEditorCanvas';
import { Button } from '../components/common/Button';
import { 
  Camera, 
  CameraOff, 
  RefreshCw, 
  ShieldAlert, 
  AlertTriangle, 
  CheckCircle2, 
  Activity, 
  Maximize2, 
  Minimize2, 
  Sliders, 
  Smartphone, 
  Info, 
  Users, 
  Target,
  X,
  Check,
  Square,
  Eye,
  Cpu
} from 'lucide-react';

interface LiveEventItem {
  id: string;
  type: string;
  message: string;
  timestamp: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  trackingId?: number;
  zoneName?: string;
}

export const LiveCameraPage: React.FC = () => {
  const { 
    zones, 
    ingestLiveFeedResults,
    isZoneEditMode,
    setIsZoneEditMode,
    drawingShape,
    setDrawingShape,
    draftPoints,
    setDraftPoints,
    finishDraftZone,
    cancelDraftZone
  } = useSurveillance();

  // Media & Device State
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [permissionState, setPermissionState] = useState<'idle' | 'requesting' | 'granted' | 'denied' | 'insecure_context' | 'unavailable'>('idle');
  const [cameraErrorMessage, setCameraErrorMessage] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [availableDevices, setAvailableDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');

  // Dual-Mode Backend Connection State
  const [backendStatus, setBackendStatus] = useState<'connected' | 'connecting' | 'disconnected' | 'error'>('disconnected');
  const [backendUrlInput, setBackendUrlInput] = useState<string>(() => {
    return getCustomBackendUrl() || getActiveBackendUrl() || 'http://localhost:8000';
  });
  const [activeConnectedUrl, setActiveConnectedUrl] = useState<string>(() => getActiveBackendUrl());
  const [backendErrorDetails, setBackendErrorDetails] = useState<string | null>(null);
  const [showBackendModal, setShowBackendModal] = useState<boolean>(false);
  const [isTestingConnection, setIsTestingConnection] = useState<boolean>(false);
  const [backendModelInfo, setBackendModelInfo] = useState<{ loaded: boolean; modelName: string; device: string } | null>(null);

  // Live Telemetry from Real AI Pipeline
  const [liveTracks, setLiveTracks] = useState<TrackedObject[]>([]);
  const [rawDetectionsCount, setRawDetectionsCount] = useState<number>(0);
  const [activeTracksCount, setActiveTracksCount] = useState<number>(0);
  const [totalTracksCount, setTotalTracksCount] = useState<number>(0);
  const [activeViolations, setActiveViolations] = useState<ZoneViolation[]>([]);
  const [pipelineFps, setPipelineFps] = useState<number>(0);
  const [totalLatencyMs, setTotalLatencyMs] = useState<number>(0);
  const [detectionLatencyMs, setDetectionLatencyMs] = useState<number>(0);
  const [liveEvents, setLiveEvents] = useState<LiveEventItem[]>([]);

  // HUD & Display Options
  const [showBoundingBoxes, setShowBoundingBoxes] = useState<boolean>(true);
  const [showLabels, setShowLabels] = useState<boolean>(true);
  const [showZones, setShowZones] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [showMobileGuide, setShowMobileGuide] = useState<boolean>(false);

  // DOM & Execution Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const inFlightRef = useRef<boolean>(false);
  const frameLoopTimerRef = useRef<number | null>(null);
  const lastSendTimeRef = useRef<number>(0);

  // Dimension tracking for 1:1 overlay alignment
  const [renderedDimensions, setRenderedDimensions] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  // Responsive video dimension calculation (prevents overlay misalignment)
  const updateDimensions = useCallback(() => {
    const vp = viewportRef.current;
    if (!vp) return;

    const vpWidth = vp.clientWidth;
    const vpHeight = vp.clientHeight;
    if (vpWidth <= 0 || vpHeight <= 0) return;

    const v = videoRef.current;
    const naturalW = v?.videoWidth && v.videoWidth > 0 ? v.videoWidth : 1280;
    const naturalH = v?.videoHeight && v.videoHeight > 0 ? v.videoHeight : 720;
    const videoAspect = naturalW / naturalH;
    const vpAspect = vpWidth / vpHeight;

    let targetW: number;
    let targetH: number;

    if (vpAspect > videoAspect) {
      targetH = vpHeight;
      targetW = Math.round(vpHeight * videoAspect);
    } else {
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
      observer = new ResizeObserver(() => updateDimensions());
      observer.observe(vp);
    }

    window.addEventListener('resize', updateDimensions);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updateDimensions);
    };
  }, [updateDimensions]);

  // Fullscreen event listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      const fs = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      );
      setIsFullscreen(fs);
      setTimeout(updateDimensions, 100);
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
  }, [updateDimensions]);

  // Enumerate camera devices
  const refreshDevices = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return;
    try {
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = allDevices.filter(d => d.kind === 'videoinput');
      setAvailableDevices(videoInputs);
    } catch (e) {
      console.warn('[SecureCam] Could not enumerate media devices:', e);
    }
  }, []);

  // Cleanup media stream and WebSocket
  const stopStream = useCallback(() => {
    if (frameLoopTimerRef.current !== null) {
      cancelAnimationFrame(frameLoopTimerRef.current);
      frameLoopTimerRef.current = null;
    }
    inFlightRef.current = false;

    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {}
      wsRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        try {
          track.stop();
        } catch {}
      });
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setIsStreaming(false);
    setLiveTracks([]);
    setRawDetectionsCount(0);
    setActiveTracksCount(0);
    setActiveViolations([]);
    setPipelineFps(0);
    setTotalLatencyMs(0);
    setDetectionLatencyMs(0);
  }, []);

  // Frame Capture and Lockstep Transmission Loop
  const startFrameLoop = useCallback(() => {
    const processLoop = () => {
      if (!isStreaming) return;

      const video = videoRef.current;
      const ws = wsRef.current;
      const canvas = canvasRef.current;

      const isSocketReady = ws && ws.readyState === WebSocket.OPEN;
      const isVideoReady = video && video.readyState >= 2 && video.videoWidth > 0 && !video.paused;
      const now = performance.now();
      const throttleElapsed = now - lastSendTimeRef.current >= 110; // ~9 FPS max target

      if (isSocketReady && isVideoReady && canvas && !inFlightRef.current && throttleElapsed) {
        const vW = video.videoWidth;
        const vH = video.videoHeight;
        const targetW = 640;
        const targetH = Math.round((targetW * vH) / vW) || 360;

        if (canvas.width !== targetW || canvas.height !== targetH) {
          canvas.width = targetW;
          canvas.height = targetH;
        }

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, targetW, targetH);
          inFlightRef.current = true;
          lastSendTimeRef.current = now;

          canvas.toBlob((blob) => {
            if (blob && ws && ws.readyState === WebSocket.OPEN) {
              blob.arrayBuffer().then((buf) => {
                try {
                  ws.send(buf);
                } catch {
                  inFlightRef.current = false;
                }
              }).catch(() => {
                inFlightRef.current = false;
              });
            } else {
              inFlightRef.current = false;
            }
          }, 'image/jpeg', 0.75);
        }
      }

      frameLoopTimerRef.current = requestAnimationFrame(processLoop);
    };

    frameLoopTimerRef.current = requestAnimationFrame(processLoop);
  }, [isStreaming]);

  // Connect WebSocket to Live Feed Endpoint
  const connectWebSocket = useCallback((targetUrl?: string) => {
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {}
      wsRef.current = null;
    }

    const effectiveBackendUrl = targetUrl || getActiveBackendUrl();
    if (!effectiveBackendUrl) {
      setBackendStatus('disconnected');
      return;
    }

    const wsUrl = `${getWebSocketUrl(effectiveBackendUrl)}/ws/live-feed`;
    setBackendStatus('connecting');

    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';
    } catch (e: any) {
      console.warn('[SecureCam] WebSocket creation error:', e);
      setBackendStatus('error');
      setBackendErrorDetails(`Could not establish WebSocket connection to ${wsUrl}.`);
      return;
    }

    ws.onopen = () => {
      setBackendStatus('connected');
      setBackendErrorDetails(null);
      inFlightRef.current = false;
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'live_tracks') {
          inFlightRef.current = false;

          setLiveTracks(data.tracks || []);
          setRawDetectionsCount(data.rawDetectionsCount ?? (data.tracks?.length || 0));
          setActiveTracksCount(data.activeTracksCount ?? (data.tracks?.length || 0));
          setTotalTracksCount(data.totalTracksCount ?? 0);
          setActiveViolations(data.activeViolations || []);
          setPipelineFps(data.pipelineFps || 0);
          setTotalLatencyMs(data.totalLatencyMs || 0);
          setDetectionLatencyMs(data.detectionLatencyMs || 0);

          if (data.zoneEvents && data.zoneEvents.length > 0) {
            setLiveEvents(prev => {
              const newItems: LiveEventItem[] = data.zoneEvents.map((ev: any) => ({
                id: ev.id || `live-ev-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                type: ev.type || 'ZONE_VIOLATION',
                message: ev.description || `Violation detected in ${ev.zoneName || 'Security Zone'}`,
                timestamp: new Date().toLocaleTimeString(),
                severity: ev.severity || 'high',
                trackingId: ev.trackingId,
                zoneName: ev.zoneName
              }));
              return [...newItems, ...prev].slice(0, 25);
            });
          }

          ingestLiveFeedResults({
            activeViolations: data.activeViolations,
            zoneEvents: data.zoneEvents,
            alarmTriggered: data.alarmTriggered
          });
        } else if (data.type === 'frame_error') {
          inFlightRef.current = false;
          console.warn('[SecureCam] Backend frame error:', data.error);
        } else if (data.type === 'live_connected') {
          inFlightRef.current = false;
        }
      } catch (err) {
        inFlightRef.current = false;
        console.warn('[SecureCam] Error parsing live feed response:', err);
      }
    };

    ws.onerror = (e) => {
      console.warn('[SecureCam] Live feed WebSocket connection failed:', e);
      setBackendStatus('error');
      setBackendErrorDetails(`WebSocket connection to ${wsUrl} failed or was closed by server.`);
      inFlightRef.current = false;
    };

    ws.onclose = () => {
      setBackendStatus('disconnected');
      inFlightRef.current = false;
    };

    wsRef.current = ws;
  }, [ingestLiveFeedResults]);

  // Probe Backend Connectivity on Mount or when URL changes
  useEffect(() => {
    const activeUrl = getActiveBackendUrl();
    if (!activeUrl) return;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);

    fetch(`${activeUrl}/api/v1/health`, { signal: controller.signal })
      .then(res => {
        clearTimeout(timer);
        if (res.ok) return res.json();
        throw new Error(`HTTP ${res.status}`);
      })
      .then(data => {
        setBackendStatus('connected');
        setBackendModelInfo({
          loaded: data.model?.loaded ?? true,
          modelName: data.model?.model_name || 'YOLOv8',
          device: data.device?.device_type || 'CPU',
        });
      })
      .catch(() => {
        setBackendStatus('disconnected');
      });

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, []);

  // Request User Media and Start Stream
  const startStream = useCallback(async () => {
    setCameraErrorMessage(null);
    setPermissionState('requesting');

    // Secure context pre-check (protects mobile LAN access)
    if (typeof window !== 'undefined' && !window.isSecureContext && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      setPermissionState('insecure_context');
      setCameraErrorMessage(
        'Camera access requires a Secure Context (HTTPS or localhost). Modern mobile browsers block camera access over plain HTTP when connected via LAN IP. Please run with HTTPS or test on localhost.'
      );
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setPermissionState('unavailable');
      setCameraErrorMessage('MediaDevices API is not supported on this browser or platform.');
      return;
    }

    try {
      const constraints: MediaStreamConstraints = {
        video: selectedDeviceId 
          ? { deviceId: { exact: selectedDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
          : { 
              facingMode: facingMode,
              width: { ideal: 1280 }, 
              height: { ideal: 720 } 
            },
        audio: false
      };

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err: any) {
        if (err.name === 'OverconstrainedError' || err.name === 'ConstraintNotSatisfiedError') {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        } else {
          throw err;
        }
      }

      streamRef.current = stream;
      setPermissionState('granted');
      setIsStreaming(true);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
        } catch (playErr) {
          console.warn('[SecureCam] AutoPlay note:', playErr);
        }
      }

      await refreshDevices();

      // If a backend URL is configured, connect WebSocket; otherwise stay peacefully in Demo Mode
      const activeUrl = getActiveBackendUrl();
      if (activeUrl) {
        connectWebSocket(activeUrl);
      } else {
        setBackendStatus('disconnected');
      }
    } catch (err: any) {
      console.warn('[SecureCam] Camera access notice:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setPermissionState('denied');
        setCameraErrorMessage('Camera access was denied. Please allow camera permissions in your browser address bar.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setPermissionState('unavailable');
        setCameraErrorMessage('No camera hardware detected on this device.');
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        setPermissionState('unavailable');
        setCameraErrorMessage('Camera hardware is currently in use by another application.');
      } else {
        setPermissionState('unavailable');
        setCameraErrorMessage(`Camera error: ${err.message || 'Unknown media error'}`);
      }
      setIsStreaming(false);
    }
  }, [facingMode, selectedDeviceId, connectWebSocket, refreshDevices]);

  // Flip camera between Front and Rear
  const toggleFacingMode = useCallback(async () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);

    if (isStreaming) {
      stopStream();
      setTimeout(() => {
        setFacingMode(nextMode);
      }, 50);
    }
  }, [facingMode, isStreaming, stopStream]);

  // Handle device change
  const handleDeviceChange = (deviceId: string) => {
    setSelectedDeviceId(deviceId);
    if (isStreaming) {
      stopStream();
    }
  };

  // Launch frame loop when streaming begins
  useEffect(() => {
    if (isStreaming && backendStatus === 'connected') {
      startFrameLoop();
    } else {
      if (frameLoopTimerRef.current !== null) {
        cancelAnimationFrame(frameLoopTimerRef.current);
        frameLoopTimerRef.current = null;
      }
    }

    return () => {
      if (frameLoopTimerRef.current !== null) {
        cancelAnimationFrame(frameLoopTimerRef.current);
        frameLoopTimerRef.current = null;
      }
    };
  }, [isStreaming, backendStatus, startFrameLoop]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopStream();
    };
  }, [stopStream]);

  // True Fullscreen Toggle
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
        }
        setIsFullscreen(true);
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if ((document as any).webkitExitFullscreen) {
          await (document as any).webkitExitFullscreen();
        }
        setIsFullscreen(false);
      }
    } catch (err) {
      console.warn('[SecureCam] Fullscreen toggle:', err);
    }
  }, []);

  // Handle Testing & Connecting to Backend URL
  const handleTestAndConnect = async () => {
    const target = (backendUrlInput || '').trim().replace(/\/+$/, '');
    if (!target) {
      setBackendErrorDetails('Please provide a valid backend URL (e.g. http://localhost:8000).');
      return;
    }

    setIsTestingConnection(true);
    setBackendErrorDetails(null);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3500);

      const res = await fetch(`${target}/api/v1/health`, { signal: controller.signal });
      clearTimeout(timeout);

      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }

      const data = await res.json();
      setBackendModelInfo({
        loaded: data.model?.loaded ?? true,
        modelName: data.model?.model_name || 'YOLOv8',
        device: data.device?.device_type || 'CPU',
      });

      // Save custom backend URL
      setCustomBackendUrl(target);
      setActiveConnectedUrl(target);
      setBackendStatus('connected');
      setShowBackendModal(false);

      // Reconnect WebSocket if camera is currently streaming
      if (isStreaming) {
        connectWebSocket(target);
      }
    } catch (err: any) {
      setBackendStatus('error');
      if (err.name === 'AbortError') {
        setBackendErrorDetails(`Connection timed out after 3.5s connecting to ${target}/api/v1/health.`);
      } else {
        setBackendErrorDetails(
          `Could not connect to ${target}. Ensure the FastAPI server is running with CORS enabled (e.g. python run_backend.py).`
        );
      }
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleDisconnectBackend = () => {
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {}
      wsRef.current = null;
    }
    setCustomBackendUrl('');
    setActiveConnectedUrl('');
    setBackendStatus('disconnected');
    setBackendModelInfo(null);
    setLiveTracks([]);
    setRawDetectionsCount(0);
    setActiveTracksCount(0);
    setPipelineFps(0);
    setShowBackendModal(false);
  };

  const activeZones = zones.filter(z => z.enabled);

  return (
    <div className="space-y-4 max-w-7xl mx-auto pb-8">
      {/* Offscreen Canvas for Frame Capture */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Page Title & Status Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">Live Camera Feed</h1>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
              Edge Streaming & Zones
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Real-time edge camera streaming with interactive Emergency Zone perimeters and optional local YOLOv8 AI inference.
          </p>
        </div>

        {/* Dual-Mode Badges: Separate Camera & Backend Status */}
        <div className="flex flex-wrap items-center gap-2">
          {/* 1. Camera Hardware Badge */}
          {isStreaming ? (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>CAMERA ACTIVE</span>
              <span className="text-[10px] text-emerald-600/70 dark:text-emerald-400/70 border-l border-emerald-500/30 pl-1.5 font-mono">
                {facingMode === 'environment' ? 'Rear' : 'Front'}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 text-xs font-medium">
              <span className="w-2 h-2 rounded-full bg-slate-400" />
              <span>CAMERA STANDBY</span>
            </div>
          )}

          {/* 2. AI Backend Connection Badge */}
          {backendStatus === 'connected' ? (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-blue-500/10 border border-blue-500/30 text-blue-700 dark:text-blue-300 text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              <span>AI CONNECTED ({pipelineFps > 0 ? `${pipelineFps.toFixed(1)} FPS` : 'Ready'})</span>
            </div>
          ) : backendStatus === 'connecting' ? (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs font-semibold">
              <RefreshCw className="w-3 h-3 animate-spin text-amber-500" />
              <span>CONNECTING AI...</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 text-xs font-medium">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <span>AI OFFLINE (DEMO MODE)</span>
            </div>
          )}

          {/* Backend Connection Modal Button */}
          <button
            onClick={() => setShowBackendModal(true)}
            className="px-2.5 py-1 rounded text-xs border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Configure Local Backend URL"
          >
            <Sliders className="w-3.5 h-3.5 text-blue-500" />
            <span>Backend Settings</span>
          </button>

          {/* Mobile & Setup Guide Button */}
          <button
            onClick={() => setShowMobileGuide(!showMobileGuide)}
            className="p-1 rounded text-xs border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            title="Cross-Device Guide"
          >
            <Smartphone className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Cross-Device / Mobile Instructions Accordion */}
      {showMobileGuide && (
        <div className="bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/60 rounded p-4 text-xs text-slate-700 dark:text-slate-300 space-y-2">
          <div className="flex items-center justify-between font-semibold text-blue-900 dark:text-blue-300">
            <span className="flex items-center gap-1.5">
              <Info className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              Cross-Device & Mobile Camera Instructions
            </span>
            <button 
              onClick={() => setShowMobileGuide(false)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-sm font-bold cursor-pointer"
            >
              ✕
            </button>
          </div>
          <p className="leading-relaxed">
            SecureCam captures real hardware camera video directly inside your browser. You can test Emergency Zone perimeters locally, or connect your local Python backend for live YOLOv8 multi-object tracking.
          </p>
          <ul className="list-disc pl-5 space-y-1 text-slate-600 dark:text-slate-400">
            <li><strong>Laptops & Desktops:</strong> Supports built-in webcams and USB external video capture cards.</li>
            <li><strong>Mobile Devices (Chrome / Safari):</strong> Tap <em>Start Camera</em> and grant permission. Use <em>Flip Camera</em> to switch between Front and Rear lens.</li>
            <li><strong>Local AI Connection:</strong> Start <code className="bg-blue-100 dark:bg-blue-900/60 px-1 py-0.5 rounded font-mono">python run_backend.py</code> on your computer, then click <em>Backend Settings</em> to connect.</li>
          </ul>
        </div>
      )}

      {/* Camera Permission or Insecure Context Error Alert Banner */}
      {cameraErrorMessage && (
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/60 rounded p-3 text-xs text-red-700 dark:text-red-300 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-semibold">Camera Access Notice:</span>
            <p>{cameraErrorMessage}</p>
          </div>
        </div>
      )}

      {/* Main Video Viewport & Tactical HUD Container */}
      <div 
        ref={containerRef}
        className={`relative bg-black rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col items-center justify-center select-none shadow-sm ${
          isFullscreen ? 'fixed inset-0 z-50 rounded-none border-none' : 'min-h-[380px] sm:min-h-[460px] md:min-h-[520px]'
        }`}
      >
        <div 
          ref={viewportRef}
          className="relative w-full h-full flex-1 flex items-center justify-center overflow-hidden"
          style={{ minHeight: isFullscreen ? '100vh' : '420px' }}
        >
          {/* Active Camera Video Frame */}
          {isStreaming ? (
            <div 
              className="relative overflow-hidden flex items-center justify-center"
              style={
                renderedDimensions.width > 0 && renderedDimensions.height > 0
                  ? { width: `${renderedDimensions.width}px`, height: `${renderedDimensions.height}px` }
                  : { width: '100%', height: '100%', aspectRatio: '16 / 9' }
              }
            >
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                onLoadedMetadata={updateDimensions}
                onLoadedData={updateDimensions}
                className="w-full h-full object-contain block select-none bg-black"
              />

              {/* HUD Layer 1: Emergency Zones Overlay */}
              {showZones && !isZoneEditMode && (
                <div className="absolute inset-0 pointer-events-none z-10">
                  <svg className="w-full h-full absolute inset-0">
                    <defs>
                      <pattern id="live-danger-stripes" width="20" height="20" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                        <line x1="0" y1="0" x2="0" y2="20" stroke="rgba(239, 68, 68, 0.25)" strokeWidth="4" />
                      </pattern>
                      <pattern id="live-caution-stripes" width="20" height="20" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                        <line x1="0" y1="0" x2="0" y2="20" stroke="rgba(245, 158, 11, 0.2)" strokeWidth="4" />
                      </pattern>
                    </defs>

                    {activeZones.map(zone => {
                      const isViolation = backendStatus === 'connected' && activeViolations.some(v => v.zoneId === zone.id && v.status === 'ACTIVE');
                      const strokeColor = isViolation ? '#EF4444' : (zone.type === 'emergency' ? '#EF4444' : '#F59E0B');
                      const fillColor = isViolation ? 'rgba(239, 68, 68, 0.25)' : (zone.type === 'emergency' ? 'rgba(239, 68, 68, 0.08)' : 'rgba(245, 158, 11, 0.06)');

                      let pointsString = '';
                      if (zone.shape === 'rectangle' && zone.points.length >= 4) {
                        const xs = zone.points.map(p => p.x);
                        const ys = zone.points.map(p => p.y);
                        const minX = Math.min(...xs);
                        const maxX = Math.max(...xs);
                        const minY = Math.min(...ys);
                        const maxY = Math.max(...ys);
                        pointsString = `${minX}%,${minY}% ${maxX}%,${minY}% ${maxX}%,${maxY}% ${minX}%,${maxY}%`;
                      } else {
                        pointsString = zone.points.map(p => `${p.x}%,${p.y}%`).join(' ');
                      }

                      return (
                        <g key={`zone-${zone.id}`}>
                          <polygon
                            points={pointsString}
                            fill={fillColor}
                            stroke={strokeColor}
                            strokeWidth="2"
                            strokeDasharray={isViolation ? 'none' : '4 3'}
                          />
                          {zone.points.length > 0 && (
                            <text
                              x={`${zone.points[0].x + 1}%`}
                              y={`${zone.points[0].y + 4}%`}
                              fill={strokeColor}
                              fontSize="11"
                              fontWeight="bold"
                              fontFamily="monospace"
                              className="select-none filter drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
                            >
                              {zone.name.toUpperCase()} {isViolation ? '[VIOLATION]' : (backendStatus !== 'connected' ? '[GEOMETRY]' : '')}
                            </text>
                          )}
                        </g>
                      );
                    })}
                  </svg>
                </div>
              )}

              {/* HUD Layer 2: Interactive Zone Drawing Canvas */}
              {isZoneEditMode && (
                <div className="absolute inset-0 z-40 pointer-events-auto">
                  <ZoneEditorCanvas
                    isDrawing={isZoneEditMode}
                    drawingShape={drawingShape}
                    setDrawingShape={setDrawingShape}
                    draftPoints={draftPoints}
                    setDraftPoints={setDraftPoints}
                    onFinishZone={(name, type, threshold) => {
                      finishDraftZone(name, type, threshold);
                    }}
                    onCancel={() => {
                      cancelDraftZone();
                    }}
                  />
                </div>
              )}

              {/* HUD Layer 3: Genuine YOLOv8 Detections & ByteTrack IDs (Active only with backend) */}
              {showBoundingBoxes && backendStatus === 'connected' && (
                <div className="absolute inset-0 pointer-events-none z-20">
                  {liveTracks.map(track => {
                    const trackIdNum = track.trackId ?? track.trackingId;
                    const trackIdStr = trackIdNum !== undefined ? `#${String(trackIdNum).padStart(2, '0')}` : '';
                    const isKnown = !!track.className && track.className.toLowerCase() !== 'unknown' && !track.className.startsWith('object_');
                    const displayClass = isKnown ? track.className.toUpperCase() : 'UNKNOWN';
                    const isViolating = (track.dwellTimeInZone || 0) >= 10 || activeViolations.some(v => v.trackingId === trackIdNum);
                    const isUnknown = track.isUnknown || !isKnown;

                    let borderColor = 'border-blue-500';
                    let badgeBg = 'bg-blue-600 text-white';

                    if (isViolating) {
                      borderColor = 'border-red-500 animate-pulse';
                      badgeBg = 'bg-red-600 text-white font-bold';
                    } else if (isUnknown) {
                      borderColor = 'border-amber-500';
                      badgeBg = 'bg-amber-600 text-white font-semibold';
                    }

                    const boxX = track.box?.x ?? 0;
                    const boxY = track.box?.y ?? 0;
                    const boxW = track.box?.width ?? 0;
                    const boxH = track.box?.height ?? 0;
                    const conf = Math.round((track.confidence || 0) * 100);

                    return (
                      <div
                        key={`track-${track.id || trackIdNum}`}
                        style={{
                          left: `${boxX}%`,
                          top: `${boxY}%`,
                          width: `${boxW}%`,
                          height: `${boxH}%`,
                        }}
                        className={`absolute border-2 ${borderColor} transition-all duration-75`}
                      >
                        {showLabels && (
                          <div
                            className={`absolute ${boxY < 5 ? 'top-0' : '-top-5'} left-0 px-1.5 py-0.5 text-[9px] sm:text-[10px] font-mono whitespace-nowrap shadow-sm ${badgeBg} rounded-t-sm`}
                          >
                            <span>{displayClass} {trackIdStr} {conf}%</span>
                            {isViolating && <span className="ml-1 text-[8px] underline">VIOLATION</span>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* HUD Corner Watermarks */}
              <div className="absolute top-3 left-3 z-30 pointer-events-none flex items-center gap-2">
                <span className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-black/70 backdrop-blur-sm border border-white/10 text-white text-[11px] font-mono">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                  <span className="font-bold text-red-400">CAMERA ACTIVE</span>
                  <span className="text-white/60">|</span>
                  <span>{facingMode === 'environment' ? 'Rear Lens' : 'Front Lens'}</span>
                </span>
                {backendStatus === 'connected' && pipelineFps > 0 && (
                  <span className="px-1.5 py-0.5 rounded bg-black/70 backdrop-blur-sm border border-white/10 text-emerald-400 text-[10px] font-mono">
                    {pipelineFps.toFixed(1)} FPS
                  </span>
                )}
              </div>

              {/* HUD Center Mode Pill */}
              <div className="absolute top-3 right-3 z-30 pointer-events-none">
                {backendStatus === 'connected' ? (
                  <span className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-blue-950/80 backdrop-blur-sm border border-blue-500/50 text-blue-300 text-[10px] font-bold">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                    [LIVE AI: YOLOv8 + ByteTrack]
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber-950/80 backdrop-blur-sm border border-amber-500/50 text-amber-300 text-[10px] font-bold">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                    [CAMERA ACTIVE • AI BACKEND OFFLINE (DEMO MODE)]
                  </span>
                )}
              </div>
            </div>
          ) : (
            /* Standby / Initial State Card */
            <div className="text-center p-6 sm:p-8 max-w-md mx-auto space-y-4 text-slate-300">
              <div className="w-16 h-16 mx-auto rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400">
                <Camera className="w-8 h-8 text-blue-500" />
              </div>

              <div>
                <h3 className="text-base font-semibold text-white tracking-tight">Camera Feed Standby</h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  Start your device's camera to monitor the live feed, test interactive Emergency Zones, or connect to your local YOLOv8 AI pipeline.
                </p>
                {permissionState === 'requesting' && (
                  <div className="mt-2.5 text-xs text-amber-400 flex items-center justify-center gap-1.5 animate-pulse">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Prompting for camera permission in browser...</span>
                  </div>
                )}
                {permissionState === 'denied' && (
                  <div className="mt-2.5 text-xs text-red-400 flex items-center justify-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Camera permission was denied. Please allow camera access in your browser settings.</span>
                  </div>
                )}
                {permissionState === 'insecure_context' && (
                  <div className="mt-2.5 text-xs text-amber-400 flex items-center justify-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Insecure Context: HTTPS or localhost required for camera access.</span>
                  </div>
                )}
              </div>

              <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2.5">
                <Button
                  variant="primary"
                  size="md"
                  onClick={startStream}
                  icon={<Camera className="w-4 h-4" />}
                  className="w-full sm:w-auto font-semibold px-5 cursor-pointer"
                >
                  Start Live Camera
                </Button>

                {availableDevices.length > 1 && (
                  <Button
                    variant="secondary"
                    size="md"
                    onClick={toggleFacingMode}
                    icon={<RefreshCw className="w-3.5 h-3.5" />}
                    className="w-full sm:w-auto text-xs cursor-pointer"
                  >
                    Flip Camera
                  </Button>
                )}
              </div>

              <div className="text-[11px] text-slate-400 border-t border-slate-800 pt-3 flex items-center justify-center gap-1.5">
                {backendStatus === 'connected' ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    <span>AI Backend Connected ({backendModelInfo?.modelName || 'YOLOv8'} on {backendModelInfo?.device || 'CPU'})</span>
                  </>
                ) : (
                  <>
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    <span>Demo Mode (Camera-only streaming. Connect local backend for live inference.)</span>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Floating Tactical Control Bar */}
        <div className="w-full bg-slate-900/90 backdrop-blur-md border-t border-white/10 px-3 py-2 flex flex-wrap items-center justify-between gap-2 z-30 text-white text-xs">
          {/* Left Controls: Start/Stop & Camera Flip */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {isStreaming ? (
              <Button
                variant="danger"
                size="sm"
                onClick={stopStream}
                icon={<CameraOff className="w-3.5 h-3.5" />}
                className="cursor-pointer"
              >
                Stop Camera
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                onClick={startStream}
                icon={<Camera className="w-3.5 h-3.5" />}
                className="cursor-pointer"
              >
                Start Camera
              </Button>
            )}

            <button
              onClick={toggleFacingMode}
              disabled={!isStreaming}
              className={`p-1.5 rounded border border-white/10 transition-colors flex items-center gap-1 text-[11px] ${
                isStreaming 
                  ? 'hover:bg-white/10 text-slate-200 cursor-pointer' 
                  : 'opacity-40 text-slate-400 cursor-not-allowed'
              }`}
              title="Flip Camera (Front / Rear)"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Flip</span>
            </button>

            {availableDevices.length > 1 && (
              <select
                value={selectedDeviceId}
                onChange={(e) => handleDeviceChange(e.target.value)}
                className="bg-slate-800 text-slate-200 border border-white/10 rounded px-2 py-1 text-[11px] focus:outline-none"
              >
                <option value="">Default Camera</option>
                {availableDevices.map((dev, idx) => (
                  <option key={dev.deviceId || idx} value={dev.deviceId}>
                    {dev.label || `Camera ${idx + 1}`}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Center HUD & Zone Sandbox Controls */}
          <div className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={() => {
                if (isZoneEditMode) {
                  cancelDraftZone();
                } else {
                  setIsZoneEditMode(true);
                }
              }}
              className={`px-2.5 py-1 rounded border text-[11px] transition-colors flex items-center gap-1 cursor-pointer ${
                isZoneEditMode
                  ? 'bg-red-600/40 border-red-500 text-red-200 font-bold'
                  : 'bg-emerald-600/20 border-emerald-500/40 text-emerald-300 hover:bg-emerald-600/30'
              }`}
              title="Draw new Emergency Zone directly over camera stream"
            >
              {isZoneEditMode ? <X className="w-3 h-3" /> : <Square className="w-3 h-3" />}
              <span>{isZoneEditMode ? 'Cancel Zone' : '+ Draw Zone'}</span>
            </button>

            <button
              onClick={() => setShowZones(!showZones)}
              className={`px-2 py-1 rounded border text-[11px] transition-colors flex items-center gap-1 cursor-pointer ${
                showZones 
                  ? 'bg-amber-600/30 border-amber-500/50 text-amber-300' 
                  : 'border-white/10 text-slate-400 hover:bg-white/5'
              }`}
              title="Toggle Zones"
            >
              <ShieldAlert className="w-3 h-3" />
              <span className="hidden sm:inline">Zones ({activeZones.length})</span>
            </button>

            {backendStatus === 'connected' && (
              <>
                <button
                  onClick={() => setShowBoundingBoxes(!showBoundingBoxes)}
                  className={`px-2 py-1 rounded border text-[11px] transition-colors flex items-center gap-1 cursor-pointer ${
                    showBoundingBoxes 
                      ? 'bg-blue-600/30 border-blue-500/50 text-blue-300' 
                      : 'border-white/10 text-slate-400 hover:bg-white/5'
                  }`}
                  title="Toggle Bounding Boxes"
                >
                  <Target className="w-3 h-3" />
                  <span className="hidden sm:inline">Boxes</span>
                </button>

                <button
                  onClick={() => setShowLabels(!showLabels)}
                  className={`px-2 py-1 rounded border text-[11px] transition-colors flex items-center gap-1 cursor-pointer ${
                    showLabels 
                      ? 'bg-blue-600/30 border-blue-500/50 text-blue-300' 
                      : 'border-white/10 text-slate-400 hover:bg-white/5'
                  }`}
                  title="Toggle Class Labels"
                >
                  <Eye className="w-3 h-3" />
                  <span className="hidden sm:inline">Labels</span>
                </button>
              </>
            )}
          </div>

          {/* Right Action Controls: Backend Settings & Fullscreen */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              onClick={() => setShowBackendModal(true)}
              className="p-1.5 rounded hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer"
              title="Backend Connection Settings"
            >
              <Sliders className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={toggleFullscreen}
              className="p-1.5 rounded hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer"
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Backend Connection Modal / Dialog */}
      {showBackendModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded-lg p-5 max-w-lg w-full space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-blue-500" />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">AI Backend Connection</h3>
              </div>
              <button
                onClick={() => setShowBackendModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-600 dark:text-slate-300">
              <p>
                To enable live YOLOv8 object detection, ByteTrack tracking, and DINOv2 novelty evaluation over your live camera, connect to a running SecureCam FastAPI backend.
              </p>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Backend API Base URL:
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={backendUrlInput}
                    onChange={(e) => setBackendUrlInput(e.target.value)}
                    placeholder="http://localhost:8000"
                    className="flex-1 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-3 py-1.5 font-mono text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={isTestingConnection}
                    onClick={handleTestAndConnect}
                    icon={isTestingConnection ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                    className="cursor-pointer shrink-0"
                  >
                    {isTestingConnection ? 'Testing...' : 'Test & Connect'}
                  </Button>
                </div>
              </div>

              {/* Quick Preset Buttons */}
              <div className="flex items-center gap-2 text-[11px]">
                <span className="text-slate-400">Presets:</span>
                <button
                  type="button"
                  onClick={() => setBackendUrlInput('http://localhost:8000')}
                  className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer"
                >
                  http://localhost:8000
                </button>
                <button
                  type="button"
                  onClick={() => setBackendUrlInput('http://127.0.0.1:8000')}
                  className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer"
                >
                  http://127.0.0.1:8000
                </button>
              </div>

              {backendErrorDetails && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded text-red-600 dark:text-red-400 text-xs">
                  {backendErrorDetails}
                </div>
              )}

              {backendStatus === 'connected' && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded text-emerald-700 dark:text-emerald-300 text-xs flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    <span>Connected to {activeConnectedUrl}</span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleDisconnectBackend}
                    className="text-[11px] h-7 cursor-pointer"
                  >
                    Disconnect
                  </Button>
                </div>
              )}

              <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded p-3 text-[11px] text-slate-500 dark:text-slate-400 space-y-1.5">
                <div className="font-semibold text-slate-700 dark:text-slate-200">How Connection Works:</div>
                <p>
                  • <strong>Localhost:</strong> Points to the machine running your browser. If you run <code className="bg-slate-200 dark:bg-slate-800 px-1 py-0.5 rounded font-mono">python run_backend.py</code> on your computer, use <code className="font-mono">http://localhost:8000</code>.
                </p>
                <p>
                  • <strong>Mobile / Remote:</strong> When accessing from a smartphone, localhost refers to the phone itself. To connect to your PC's backend, use a secure tunnel (e.g. ngrok or cloudflared) with an HTTPS / WSS endpoint.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowBackendModal(false)}
                className="cursor-pointer"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Telemetry Stats Grid: Honest & Separated */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* Metric 1: Current Raw Detections */}
        <div className="bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded p-3">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs">
            <span>Detections (YOLO)</span>
            <Target className="w-3.5 h-3.5 text-blue-500" />
          </div>
          <div className="text-xl font-bold text-slate-900 dark:text-white mt-1">
            {backendStatus === 'connected' ? rawDetectionsCount : '—'}
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5">
            {backendStatus === 'connected' ? 'Objects in active frame' : 'Offline in Demo Mode'}
          </p>
        </div>

        {/* Metric 2: Active Tracked Targets */}
        <div className="bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded p-3">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs">
            <span>Active Tracks</span>
            <Users className="w-3.5 h-3.5 text-cyan-500" />
          </div>
          <div className="text-xl font-bold text-blue-600 dark:text-cyan-400 mt-1">
            {backendStatus === 'connected' ? activeTracksCount : '—'}
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5">
            {backendStatus === 'connected' ? 'ByteTrack persistent IDs' : 'Requires local backend'}
          </p>
        </div>

        {/* Metric 3: Cumulative Unique Targets */}
        <div className="bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded p-3">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs">
            <span>Total Targets</span>
            <Activity className="w-3.5 h-3.5 text-indigo-500" />
          </div>
          <div className="text-xl font-bold text-slate-900 dark:text-white mt-1">
            {backendStatus === 'connected' ? totalTracksCount : '—'}
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5">
            {backendStatus === 'connected' ? 'Unique entities observed' : 'Requires local backend'}
          </p>
        </div>

        {/* Metric 4: Zone Violations */}
        <div className={`bg-white dark:bg-slate-850 border rounded p-3 transition-colors ${
          activeViolations.length > 0 && backendStatus === 'connected'
            ? 'border-red-500/80 bg-red-50/20 dark:bg-red-950/20 animate-pulse' 
            : 'border-slate-200 dark:border-slate-800'
        }`}>
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs">
            <span>Zone Breaches</span>
            <ShieldAlert className={`w-3.5 h-3.5 ${activeViolations.length > 0 && backendStatus === 'connected' ? 'text-red-500' : 'text-slate-400'}`} />
          </div>
          <div className={`text-xl font-bold mt-1 ${activeViolations.length > 0 && backendStatus === 'connected' ? 'text-red-600 dark:text-red-400 font-extrabold' : 'text-slate-900 dark:text-white'}`}>
            {backendStatus === 'connected' ? activeViolations.length : 0}
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5">
            {backendStatus === 'connected' ? 'Emergency Zone intrusions' : `${activeZones.length} zones active`}
          </p>
        </div>

        {/* Metric 5: Inference Latency */}
        <div className="bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded p-3 col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs">
            <span>Inference Latency</span>
            <Cpu className="w-3.5 h-3.5 text-emerald-500" />
          </div>
          <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1 font-mono">
            {backendStatus === 'connected' && totalLatencyMs > 0 ? `${Math.round(totalLatencyMs)}ms` : '0ms'}
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5">
            {backendStatus === 'connected' ? `Pipeline: ${Math.round(detectionLatencyMs)}ms` : 'Hardware stream (0ms)'}
          </p>
        </div>
      </div>

      {/* Live Alerts & Violations Feed */}
      <div className="bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
            Live Security Events & Violations Stream
          </h2>
          {liveEvents.length > 0 && (
            <button
              onClick={() => setLiveEvents([])}
              className="text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
            >
              Clear Log
            </button>
          )}
        </div>

        {liveEvents.length > 0 ? (
          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
            {liveEvents.map(ev => (
              <div 
                key={ev.id}
                className="flex items-start justify-between gap-3 p-2.5 rounded bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs"
              >
                <div className="flex items-start gap-2">
                  <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                    ev.severity === 'critical' ? 'bg-red-500' : 'bg-amber-500'
                  }`} />
                  <div>
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {ev.zoneName ? `[${ev.zoneName}] ` : ''}
                      {ev.message}
                    </span>
                    {ev.trackingId !== undefined && (
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 ml-2">
                        Track ID #{ev.trackingId}
                      </span>
                    )}
                  </div>
                </div>
                <span className="text-[10px] text-slate-400 font-mono whitespace-nowrap">
                  {ev.timestamp}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-4 text-center text-xs text-slate-400 bg-slate-50/50 dark:bg-slate-900/40 rounded border border-dashed border-slate-200 dark:border-slate-800">
            {isStreaming ? (
              backendStatus === 'connected' ? (
                <span className="flex items-center justify-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  No security violations detected in the live camera feed. Monitored zones are secure.
                </span>
              ) : (
                <span className="flex items-center justify-center gap-1.5 text-amber-600 dark:text-amber-400">
                  <Info className="w-3.5 h-3.5" />
                  Camera streaming locally in Demo Mode. Connect local backend for live intrusion alarms.
                </span>
              )
            ) : (
              <span>Start the camera feed to monitor live video and Emergency Zones.</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
