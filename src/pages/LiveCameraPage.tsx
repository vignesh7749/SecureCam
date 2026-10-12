import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useSurveillance } from '../context/SurveillanceContext';
import { WS_BASE_URL, BACKEND_URL } from '../services/realApi';
import { TrackedObject } from '../types/detection';
import { SecurityZone, ZoneViolation } from '../types/zone';
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
  Tv, 
  Layers, 
  Eye, 
  EyeOff, 
  Sliders, 
  Smartphone, 
  Info, 
  Wifi, 
  WifiOff, 
  Clock, 
  Cpu, 
  Users, 
  Target
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
    backendHealth,
    backendError,
  } = useSurveillance();

  // Media & Device State
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [permissionState, setPermissionState] = useState<'idle' | 'requesting' | 'granted' | 'denied' | 'insecure_context' | 'unavailable'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [availableDevices, setAvailableDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');

  // Live Telemetry from Real AI Pipeline
  const [liveTracks, setLiveTracks] = useState<TrackedObject[]>([]);
  const [rawDetectionsCount, setRawDetectionsCount] = useState<number>(0);
  const [activeTracksCount, setActiveTracksCount] = useState<number>(0);
  const [totalTracksCount, setTotalTracksCount] = useState<number>(0);
  const [activeViolations, setActiveViolations] = useState<ZoneViolation[]>([]);
  const [pipelineFps, setPipelineFps] = useState<number>(0);
  const [totalLatencyMs, setTotalLatencyMs] = useState<number>(0);
  const [detectionLatencyMs, setDetectionLatencyMs] = useState<number>(0);
  const [frameIndex, setFrameIndex] = useState<number>(0);
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

  // Responsive video dimension calculation (prevents bounding box misalignment)
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
      console.warn('Could not enumerate media devices:', e);
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
    setConnectionStatus('disconnected');
    setLiveTracks([]);
    setRawDetectionsCount(0);
    setActiveTracksCount(0);
    setActiveViolations([]);
  }, []);

  // Frame Capture and Lockstep Transmission Loop
  const startFrameLoop = useCallback(() => {
    const processLoop = () => {
      if (!isStreaming) return;

      const video = videoRef.current;
      const ws = wsRef.current;
      const canvas = canvasRef.current;

      // Lockstep backpressure guard: wait until previous frame response is processed
      const isSocketReady = ws && ws.readyState === WebSocket.OPEN;
      const isVideoReady = video && video.readyState >= 2 && video.videoWidth > 0 && !video.paused;
      const now = performance.now();
      const throttleElapsed = now - lastSendTimeRef.current >= 110; // ~9 FPS max target

      if (isSocketReady && isVideoReady && canvas && !inFlightRef.current && throttleElapsed) {
        // Match capture resolution: 640x360 or proportional
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
  const connectWebSocket = useCallback(() => {
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {}
    }

    if (!WS_BASE_URL) {
      setConnectionStatus('error');
      setErrorMessage(
        'Live Feed requires a configured backend. VITE_BACKEND_URL is missing in this production deployment. Please set VITE_BACKEND_URL in your hosting provider settings (e.g. Vercel) and redeploy.'
      );
      return;
    }

    setConnectionStatus('connecting');
    const wsUrl = `${WS_BASE_URL}/ws/live-feed`;
    let ws: WebSocket;

    try {
      ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';
    } catch (e: any) {
      console.error('Failed to create WebSocket:', e);
      setConnectionStatus('error');
      setErrorMessage(`Could not establish WebSocket connection to ${wsUrl}. Check if backend is running.`);
      return;
    }

    ws.onopen = () => {
      setConnectionStatus('connected');
      setErrorMessage(null);
      inFlightRef.current = false;
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'live_tracks') {
          // Release backpressure flag
          inFlightRef.current = false;

          // Update live AI telemetry
          setLiveTracks(data.tracks || []);
          setRawDetectionsCount(data.rawDetectionsCount ?? (data.tracks?.length || 0));
          setActiveTracksCount(data.activeTracksCount ?? (data.tracks?.length || 0));
          setTotalTracksCount(data.totalTracksCount ?? 0);
          setActiveViolations(data.activeViolations || []);
          setPipelineFps(data.pipelineFps || 0);
          setTotalLatencyMs(data.totalLatencyMs || 0);
          setDetectionLatencyMs(data.detectionLatencyMs || 0);
          setFrameIndex(data.frameIndex || 0);

          // Ingest events into local live event log
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

          // Forward to global SurveillanceContext for alarm chime & notification popups
          ingestLiveFeedResults({
            activeViolations: data.activeViolations,
            zoneEvents: data.zoneEvents,
            alarmTriggered: data.alarmTriggered
          });
        } else if (data.type === 'frame_error') {
          inFlightRef.current = false;
          console.warn('Backend frame processing error:', data.error);
        } else if (data.type === 'live_connected') {
          inFlightRef.current = false;
        }
      } catch (err) {
        inFlightRef.current = false;
        console.warn('Error parsing live feed response:', err);
      }
    };

    ws.onerror = (e) => {
      console.warn('Live feed WebSocket error:', e);
      setConnectionStatus('error');
      inFlightRef.current = false;
    };

    ws.onclose = () => {
      setConnectionStatus('disconnected');
      inFlightRef.current = false;
    };

    wsRef.current = ws;
  }, [ingestLiveFeedResults]);

  // Request User Media and Start Stream
  const startStream = useCallback(async () => {
    setErrorMessage(null);
    setPermissionState('requesting');

    // Secure context pre-check (crucial for mobile cross-device)
    if (typeof window !== 'undefined' && !window.isSecureContext && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      setPermissionState('insecure_context');
      setErrorMessage(
        'Camera access requires a Secure Context (HTTPS or localhost). Modern mobile browsers block camera access over plain HTTP when connected via LAN IP. Please run with HTTPS or test on localhost.'
      );
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setPermissionState('unavailable');
      setErrorMessage('MediaDevices API is not supported on this browser or platform.');
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
        // Fallback to basic video constraint if ideal constraints failed
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
          console.warn('AutoPlay note:', playErr);
        }
      }

      // Connect WebSocket & refresh camera hardware device list
      connectWebSocket();
      await refreshDevices();
    } catch (err: any) {
      console.error('Camera access failed:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setPermissionState('denied');
        setErrorMessage('Camera access was denied. Please allow camera permissions in your browser address bar.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setPermissionState('unavailable');
        setErrorMessage('No camera hardware detected on this device.');
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        setPermissionState('unavailable');
        setErrorMessage('Camera hardware is currently in use by another application.');
      } else {
        setPermissionState('unavailable');
        setErrorMessage(`Camera error: ${err.message || 'Unknown media error'}`);
      }
      setIsStreaming(false);
    }
  }, [facingMode, selectedDeviceId, connectWebSocket, refreshDevices]);

  // Flip camera between Front and Rear (User and Environment)
  const toggleFacingMode = useCallback(async () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);

    if (isStreaming) {
      stopStream();
      setTimeout(() => {
        // Restart with opposite facing mode
        setFacingMode(nextMode);
      }, 50);
    }
  }, [facingMode, isStreaming, stopStream]);

  // Handle device change from select dropdown
  const handleDeviceChange = (deviceId: string) => {
    setSelectedDeviceId(deviceId);
    if (isStreaming) {
      stopStream();
    }
  };

  // Launch frame loop when streaming begins
  useEffect(() => {
    if (isStreaming) {
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
  }, [isStreaming, startFrameLoop]);

  // Cleanup on component unmount
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
      console.warn('Fullscreen toggle:', err);
    }
  }, []);

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
              YOLOv8 + ByteTrack + Zones
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Real-time edge camera streaming with persistent identity tracking, DINOv2 novelty evaluation, and Emergency Zone intrusion monitoring.
          </p>
        </div>

        {/* Live Indicator Badge */}
        <div className="flex items-center gap-2">
          {isStreaming ? (
            <div className="flex items-center gap-2 px-3 py-1 rounded bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/80 text-emerald-700 dark:text-emerald-300 text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>LIVE ({pipelineFps.toFixed(1)} FPS)</span>
              <span className="text-[10px] text-emerald-600/70 dark:text-emerald-400/70 border-l border-emerald-300 dark:border-emerald-800/80 pl-1.5 ml-0.5 font-mono">
                {totalLatencyMs > 0 ? `${Math.round(totalLatencyMs)}ms` : 'Lockstep'}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 text-xs font-medium">
              <span className="w-2 h-2 rounded-full bg-slate-400" />
              <span>OFFLINE / STANDBY</span>
            </div>
          )}

          <button
            onClick={() => setShowMobileGuide(!showMobileGuide)}
            className="px-2.5 py-1 rounded text-xs border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1 transition-colors"
            title="Cross-Device Instructions"
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Mobile & Setup</span>
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
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-sm font-bold"
            >
              ✕
            </button>
          </div>
          <p className="leading-relaxed">
            SecureCam streams real camera video using HTML5 <code className="bg-blue-100 dark:bg-blue-900/60 px-1 rounded">getUserMedia</code> directly to the FastAPI computer vision backend over low-latency binary WebSockets.
          </p>
          <ul className="list-disc pl-5 space-y-1 text-slate-600 dark:text-slate-400">
            <li><strong>Laptops & Desktops:</strong> Supports built-in webcams and USB external security cameras.</li>
            <li><strong>Mobile Phones (Chrome / Safari):</strong> Tap <em>Start Camera</em> and allow permission when prompted. Use the <em>Flip Camera</em> button to switch between Front and Rear lens.</li>
            <li><strong>Remote Wi-Fi Access:</strong> In modern browsers, camera access on non-localhost IPs requires HTTPS or localhost. If opening from a mobile phone on LAN (e.g. <code>http://192.168.x.x:5173</code>), configure HTTPS or use port forwarding/tunneling.</li>
          </ul>
        </div>
      )}

      {/* Insecure Context or Error Alert Banner */}
      {errorMessage && (
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/60 rounded p-3 text-xs text-red-700 dark:text-red-300 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-semibold">Camera Streaming Notice:</span>
            <p>{errorMessage}</p>
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
              {showZones && (
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
                      const isViolation = activeViolations.some(v => v.zoneId === zone.id && v.status === 'ACTIVE');
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
                          {/* Zone Name Label */}
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
                              {zone.name.toUpperCase()} {isViolation ? '[VIOLATION]' : ''}
                            </text>
                          )}
                        </g>
                      );
                    })}
                  </svg>
                </div>
              )}

              {/* HUD Layer 2: Bounding Boxes & Persistent Track IDs */}
              {showBoundingBoxes && (
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

              {/* HUD Corner Watermark */}
              <div className="absolute top-3 left-3 z-30 pointer-events-none flex items-center gap-2">
                <span className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-black/60 backdrop-blur-sm border border-white/10 text-white text-[11px] font-mono">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                  <span className="font-bold text-red-400">LIVE</span>
                  <span className="text-white/60">|</span>
                  <span>{facingMode === 'environment' ? 'Rear Cam' : 'Front Cam'}</span>
                </span>
                {pipelineFps > 0 && (
                  <span className="px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-sm border border-white/10 text-emerald-400 text-[10px] font-mono">
                    {pipelineFps.toFixed(1)} FPS
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
                  Connect your device's built-in webcam, external security camera, or mobile phone to run live edge AI surveillance.
                </p>
              </div>

              <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2.5">
                <Button
                  variant="primary"
                  size="md"
                  onClick={startStream}
                  icon={<Camera className="w-4 h-4" />}
                  className="w-full sm:w-auto font-semibold px-5"
                >
                  Start Live Camera
                </Button>

                {availableDevices.length > 1 && (
                  <Button
                    variant="secondary"
                    size="md"
                    onClick={toggleFacingMode}
                    icon={<RefreshCw className="w-3.5 h-3.5" />}
                    className="w-full sm:w-auto text-xs"
                  >
                    Flip Camera
                  </Button>
                )}
              </div>

              <div className="text-[11px] text-slate-400 border-t border-slate-800 pt-3 flex items-center justify-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                <span>Backend status: {backendHealth ? 'Connected (PyTorch / YOLOv8)' : 'Connecting...'}</span>
              </div>
            </div>
          )}
        </div>

        {/* Floating Player Control Bar */}
        <div className="w-full bg-slate-900/90 backdrop-blur-md border-t border-white/10 px-3 py-2 flex flex-wrap items-center justify-between gap-2 z-30 text-white text-xs">
          {/* Left Action Controls */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {isStreaming ? (
              <Button
                variant="danger"
                size="sm"
                onClick={stopStream}
                icon={<CameraOff className="w-3.5 h-3.5" />}
              >
                Stop Camera
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                onClick={startStream}
                icon={<Camera className="w-3.5 h-3.5" />}
              >
                Start Camera
              </Button>
            )}

            {/* Flip Camera Button (Front / Rear) */}
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

            {/* Camera Select Dropdown (if multiple devices) */}
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

          {/* Center HUD Toggles */}
          <div className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={() => setShowBoundingBoxes(!showBoundingBoxes)}
              className={`px-2 py-1 rounded border text-[11px] transition-colors flex items-center gap-1 ${
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
              className={`px-2 py-1 rounded border text-[11px] transition-colors flex items-center gap-1 ${
                showLabels 
                  ? 'bg-blue-600/30 border-blue-500/50 text-blue-300' 
                  : 'border-white/10 text-slate-400 hover:bg-white/5'
              }`}
              title="Toggle Class Labels"
            >
              <Eye className="w-3 h-3" />
              <span className="hidden sm:inline">Labels</span>
            </button>

            <button
              onClick={() => setShowZones(!showZones)}
              className={`px-2 py-1 rounded border text-[11px] transition-colors flex items-center gap-1 ${
                showZones 
                  ? 'bg-amber-600/30 border-amber-500/50 text-amber-300' 
                  : 'border-white/10 text-slate-400 hover:bg-white/5'
              }`}
              title="Toggle Emergency Zones"
            >
              <ShieldAlert className="w-3 h-3" />
              <span className="hidden sm:inline">Zones ({activeZones.length})</span>
            </button>
          </div>

          {/* Right Action Controls: Fullscreen */}
          <div className="flex items-center gap-2">
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

      {/* Live AI Telemetry Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* Metric 1: Current Raw Detections */}
        <div className="bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded p-3">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs">
            <span>Detections (YOLO)</span>
            <Target className="w-3.5 h-3.5 text-blue-500" />
          </div>
          <div className="text-xl font-bold text-slate-900 dark:text-white mt-1">
            {rawDetectionsCount}
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5">Objects in active frame</p>
        </div>

        {/* Metric 2: Active Tracked Targets */}
        <div className="bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded p-3">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs">
            <span>Active Tracks</span>
            <Users className="w-3.5 h-3.5 text-cyan-500" />
          </div>
          <div className="text-xl font-bold text-blue-600 dark:text-cyan-400 mt-1">
            {activeTracksCount}
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5">ByteTrack persistent IDs</p>
        </div>

        {/* Metric 3: Cumulative Unique Targets */}
        <div className="bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded p-3">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs">
            <span>Total Targets</span>
            <Activity className="w-3.5 h-3.5 text-indigo-500" />
          </div>
          <div className="text-xl font-bold text-slate-900 dark:text-white mt-1">
            {totalTracksCount}
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5">Unique entities observed</p>
        </div>

        {/* Metric 4: Zone Violations */}
        <div className={`bg-white dark:bg-slate-850 border rounded p-3 transition-colors ${
          activeViolations.length > 0 
            ? 'border-red-500/80 bg-red-50/20 dark:bg-red-950/20 animate-pulse' 
            : 'border-slate-200 dark:border-slate-800'
        }`}>
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs">
            <span>Zone Breaches</span>
            <ShieldAlert className={`w-3.5 h-3.5 ${activeViolations.length > 0 ? 'text-red-500' : 'text-slate-400'}`} />
          </div>
          <div className={`text-xl font-bold mt-1 ${activeViolations.length > 0 ? 'text-red-600 dark:text-red-400 font-extrabold' : 'text-slate-900 dark:text-white'}`}>
            {activeViolations.length}
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5">Emergency Zone intrusions</p>
        </div>

        {/* Metric 5: Inference Latency */}
        <div className="bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded p-3 col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs">
            <span>Inference Latency</span>
            <Cpu className="w-3.5 h-3.5 text-emerald-500" />
          </div>
          <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1 font-mono">
            {totalLatencyMs > 0 ? `${Math.round(totalLatencyMs)}ms` : '0ms'}
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5">
            {detectionLatencyMs > 0 ? `YOLO: ${Math.round(detectionLatencyMs)}ms` : 'Lockstep loop'}
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
              className="text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
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
              <span className="flex items-center justify-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5" />
                No security violations detected in the live camera feed. Monitored zones are secure.
              </span>
            ) : (
              <span>Start the camera feed to monitor live objects and Emergency Zones.</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
