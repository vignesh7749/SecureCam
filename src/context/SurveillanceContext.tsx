import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { SecurityZone, ZonePoint, ZoneViolation } from '../types/zone';
import { TrackedObject, UnknownObject, Detection } from '../types/detection';
import { SecurityEvent } from '../types/event';
import { SampleVideo, VideoMetadata, VideoSource } from '../types/video';
import { SystemSettings, SystemModelConfig } from '../types/system';
import { 
  INITIAL_ZONES, 
  INITIAL_TRACKED_OBJECTS, 
  INITIAL_UNKNOWN_OBJECTS, 
  INITIAL_EVENTS, 
  INITIAL_ZONE_VIOLATIONS, 
  DEFAULT_SYSTEM_SETTINGS, 
  DEFAULT_MODEL_CONFIG,
  STATIC_SAMPLE_VIDEOS
} from '../services/mockData';
import { evaluateZones } from '../services/zoneService';
import { realSurveillanceApi, RealBackendHealth, BACKEND_URL } from '../services/realApi';
import { setApiMode as setGlobalApiMode } from '../services/api';
import { NavTabId } from '../components/layout/Navigation';
import { playCriticalAlertSound } from '../utils/audioAlert';

export type ApiMode = 'DEMO' | 'LIVE_AI';

interface SurveillanceContextType {
  // Navigation State
  activeTab: NavTabId;
  setActiveTab: (tab: NavTabId) => void;

  // Provider Mode (DEMO vs LIVE AI)
  apiMode: ApiMode;
  setApiMode: (mode: ApiMode) => void;
  backendHealth: RealBackendHealth | null;
  backendError: string | null;
  clearBackendError: () => void;
  realDetections: Detection[];
  analysisProgress: number;

  // Video Source & Playback
  sampleVideos: SampleVideo[];
  isLoadingSamples: boolean;
  sampleError: string | null;
  refreshSampleVideos: () => Promise<void>;
  uploadedVideos: SampleVideo[];
  isLoadingUploads: boolean;
  refreshUploadedVideos: () => Promise<void>;
  activeSource: VideoSource;
  activeSampleVideo: SampleVideo | null;
  uploadedMetadata: VideoMetadata | null;
  selectSampleVideo: (sample: SampleVideo) => void;
  selectUploadedVideo: (video: SampleVideo) => void;
  loadUploadedVideo: (source: VideoSource, metadata: VideoMetadata) => void;
  detectionProfile: 'BALANCED' | 'PRECISION' | 'PERFORMANCE';
  setDetectionProfile: (profile: 'BALANCED' | 'PRECISION' | 'PERFORMANCE') => void;
  isPlaying: boolean;
  playbackSpeed: number;
  currentTimeSeconds: number;
  totalDurationSeconds: number;
  currentFrame: number;
  fps: number;
  inferenceLatency: number;
  // Separated Telemetry (Stage 3 & 4 Requirement)
  videoFps: number;
  detectionLatency: number;
  trackingLatency: number;
  embeddingLatency: number;
  noveltyLatency: number;
  zoneLatency: number;
  totalLatency: number;
  pipelineFps: number;
  activeTracksCount: number;
  totalUniqueTracksCount: number;
  analysisStatus: 'IDLE' | 'ANALYZING' | 'PAUSED' | 'COMPLETED';
  isPrecomputedDemoReplay: boolean;
  startAnalysis: () => void;
  pauseAnalysis: () => void;
  stopAnalysis: () => void;
  replayAnalysis: () => void;
  togglePlay: () => void;
  seekTo: (seconds: number) => void;
  setSpeed: (speed: number) => void;

  // Video Element Native Binding Hooks
  registerVideoElement: (el: HTMLVideoElement | null) => void;
  onVideoTimeUpdate: (time: number, duration?: number) => void;
  onVideoDurationChange: (duration: number) => void;
  onVideoPlay: () => void;
  onVideoPause: () => void;
  onVideoEnded: () => void;

  // Zones & Violations
  zones: SecurityZone[];
  activeViolations: ZoneViolation[];
  selectedZoneId: string | null;
  setSelectedZoneId: (id: string | null) => void;
  addZone: (zone: Omit<SecurityZone, 'id' | 'createdAt'>) => SecurityZone;
  updateZone: (zone: SecurityZone) => void;
  deleteZone: (zoneId: string) => void;
  toggleZoneEnabled: (zoneId: string) => void;
  acknowledgeViolation: (violationId: string) => void;

  // Zone Creation / Edit Mode
  isZoneEditMode: boolean;
  setIsZoneEditMode: (active: boolean) => void;
  drawingShape: 'rectangle' | 'polygon';
  setDrawingShape: (shape: 'rectangle' | 'polygon') => void;
  draftPoints: ZonePoint[];
  setDraftPoints: React.Dispatch<React.SetStateAction<ZonePoint[]>>;
  finishDraftZone: (name: string, type: SecurityZone['type'], stayThresholdSeconds: number) => void;
  cancelDraftZone: () => void;

  // Objects & Unknowns
  trackedObjects: TrackedObject[];
  allSessionTargets: TrackedObject[];
  unknownObjects: UnknownObject[];
  selectedObjectId: string | null;
  setSelectedObjectId: (id: string | null) => void;
  updateUnknownStatus: (id: string, status: UnknownObject['investigationStatus']) => void;
  getVideoAnalysisStatus: (videoId: string) => 'COMPLETED' | 'ANALYZING' | 'PAUSED' | 'IDLE';

  // Events
  events: SecurityEvent[];
  acknowledgeEvent: (id: string) => void;
  acknowledgeAllEvents: () => void;
  clearAllEvents: () => void;
  ingestLiveFeedResults: (results: {
    activeViolations?: any[];
    zoneEvents?: any[];
    alarmTriggered?: boolean;
  }) => void;

  // Overlays & HUD Toggles
  overlays: SystemSettings['visualOverlaysEnabled'];
  toggleOverlay: (key: keyof SystemSettings['visualOverlaysEnabled']) => void;

  // System
  settings: SystemSettings;
  updateSettings: (newSettings: Partial<SystemSettings>) => void;
  modelConfig: SystemModelConfig;
}

export interface CachedVideoSession {
  analysisId?: string | null;
  status: 'IDLE' | 'ANALYZING' | 'PAUSED' | 'COMPLETED';
  progress: number;
  trackedObjects: TrackedObject[];
  allSessionTargets?: TrackedObject[];
  realDetections: Detection[];
  frameTracks: Map<number, TrackedObject[]>;
  frameDetections: Map<number, Detection[]>;
  unknownObjects: UnknownObject[];
  activeViolations: ZoneViolation[];
  totalUniqueTracksCount: number;
}

const SurveillanceContext = createContext<SurveillanceContextType | undefined>(undefined);

export const SurveillanceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Navigation State
  const [activeTab, setActiveTab] = useState<NavTabId>('command-center');

  // Provider Mode (DEMO vs LIVE AI)
  const [apiMode, setApiModeState] = useState<ApiMode>(BACKEND_URL ? 'LIVE_AI' : 'DEMO');
  const [isPrecomputedDemoReplay, setIsPrecomputedDemoReplay] = useState<boolean>(false);
  const [backendHealth, setBackendHealth] = useState<RealBackendHealth | null>(null);
  const [backendError, setBackendError] = useState<string | null>(null);
  const [realDetections, setRealDetections] = useState<Detection[]>([]);
  const [analysisProgress, setAnalysisProgress] = useState<number>(0);
  const activeWsRef = useRef<WebSocket | null>(null);
  const activeSessionIdRef = useRef<string | null>(null);

  // Multi-Video Isolation & Session Cache
  const videoSessionsCacheRef = useRef<Map<string, CachedVideoSession>>(new Map());
  const currentVideoIdRef = useRef<string>('');

  // Detection Profile (BALANCED: 640px/0.35, PRECISION: 960px/0.50, PERFORMANCE: 640px/0.35)
  const [detectionProfile, setDetectionProfile] = useState<'BALANCED' | 'PRECISION' | 'PERFORMANCE'>('BALANCED');

  // Video Element Ref for direct playback control
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  const frameDetectionsMapRef = useRef<Map<number, Detection[]>>(new Map());
  const frameTracksMapRef = useRef<Map<number, TrackedObject[]>>(new Map());
  const currentFrameRef = useRef<number>(0);
  const maxFrameRef = useRef<number>(0);

  // Video Source state
  const [sampleVideos, setSampleVideos] = useState<SampleVideo[]>([]);
  const [isLoadingSamples, setIsLoadingSamples] = useState<boolean>(true);
  const [sampleError, setSampleError] = useState<string | null>(null);
  const [uploadedVideos, setUploadedVideos] = useState<SampleVideo[]>([]);
  const [isLoadingUploads, setIsLoadingUploads] = useState<boolean>(false);
  const [activeSampleVideo, setActiveSampleVideo] = useState<SampleVideo | null>(null);
  const [uploadedMetadata, setUploadedMetadata] = useState<VideoMetadata | null>(null);
  
  const [activeSource, setActiveSource] = useState<VideoSource>({
    id: '',
    name: 'No Video Selected',
    type: 'sample',
    uri: '',
    status: 'OFFLINE',
    location: 'Surveillance Hub',
    resolution: 'N/A',
    fps: 0,
  });
  const activeSourceRef = useRef<VideoSource>(activeSource);
  useEffect(() => {
    activeSourceRef.current = activeSource;
  }, [activeSource]);

  // Playback & Analysis Engine state
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [currentTimeSeconds, setCurrentTimeSeconds] = useState<number>(0);
  const [totalDurationSeconds, setTotalDurationSeconds] = useState<number>(0);
  const [currentFrame, setCurrentFrame] = useState<number>(0);
  const [fps, setFps] = useState<number>(15.0);
  const [inferenceLatency, setInferenceLatency] = useState<number>(18.5);

  // Separated Latency & Tracking Telemetry
  const [videoFps, setVideoFps] = useState<number>(15.0);
  const [detectionLatency, setDetectionLatency] = useState<number>(18.5);
  const [trackingLatency, setTrackingLatency] = useState<number>(1.2);
  const [embeddingLatency, setEmbeddingLatency] = useState<number>(0.0);
  const [noveltyLatency, setNoveltyLatency] = useState<number>(0.0);
  const [zoneLatency, setZoneLatency] = useState<number>(0.0);
  const [totalLatency, setTotalLatency] = useState<number>(19.7);
  const [pipelineFps, setPipelineFps] = useState<number>(15.0);
  const [activeTracksCount, setActiveTracksCount] = useState<number>(0);
  const [totalUniqueTracksCount, setTotalUniqueTracksCount] = useState<number>(0);

  // Settings & Overlays
  const [settings, setSettings] = useState<SystemSettings>(DEFAULT_SYSTEM_SETTINGS);
  const [overlays, setOverlays] = useState(DEFAULT_SYSTEM_SETTINGS.visualOverlaysEnabled);
  const [modelConfig, setModelConfig] = useState<SystemModelConfig>({
    ...DEFAULT_MODEL_CONFIG,
    tracker: 'ByteTrack',
  });
  const settingsRef = useRef<SystemSettings>(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  // Audio Alarm Synth with cooldown window and mute toggle
  const playAlarmSound = useCallback(() => {
    playCriticalAlertSound(settingsRef.current.alarmAudioEnabled);
  }, []);

  const [analysisStatus, setAnalysisStatus] = useState<'IDLE' | 'ANALYZING' | 'PAUSED' | 'COMPLETED'>('ANALYZING');

  // Zones & Violations
  const [zones, setZones] = useState<SecurityZone[]>(INITIAL_ZONES);
  const [activeViolations, setActiveViolations] = useState<ZoneViolation[]>([]);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);

  // Zone Drawing Mode
  const [isZoneEditMode, setIsZoneEditMode] = useState<boolean>(false);
  const [drawingShape, setDrawingShape] = useState<'rectangle' | 'polygon'>('rectangle');
  const [draftPoints, setDraftPoints] = useState<ZonePoint[]>([]);

  // Objects & Unknowns (In LIVE_AI mode, zero mock objects are shown)
  const [trackedObjects, setTrackedObjects] = useState<TrackedObject[]>([]);
  const [allSessionTargets, setAllSessionTargets] = useState<TrackedObject[]>([]);
  const [unknownObjects, setUnknownObjects] = useState<UnknownObject[]>([]);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [videoStatusMap, setVideoStatusMap] = useState<Record<string, 'COMPLETED' | 'ANALYZING' | 'PAUSED' | 'IDLE'>>({});

  // Events
  const [events, setEvents] = useState<SecurityEvent[]>(INITIAL_EVENTS);

  const clearBackendError = useCallback(() => {
    setBackendError(null);
  }, []);

  // Stable state synchronization refs to break infinite re-render callback cascades
  const apiModeRef = useRef<ApiMode>(apiMode);
  useEffect(() => {
    apiModeRef.current = apiMode;
  }, [apiMode]);

  const isPlayingRef = useRef<boolean>(isPlaying);
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  const analysisStatusRef = useRef<'IDLE' | 'ANALYZING' | 'PAUSED' | 'COMPLETED'>(analysisStatus);
  useEffect(() => {
    analysisStatusRef.current = analysisStatus;
  }, [analysisStatus]);

  useEffect(() => {
    if (activeSourceRef.current?.id) {
      setVideoStatusMap(prev => ({
        ...prev,
        [activeSourceRef.current.id]: analysisStatus
      }));
    }
  }, [analysisStatus]);

  const analysisProgressRef = useRef<number>(analysisProgress);
  useEffect(() => {
    analysisProgressRef.current = analysisProgress;
  }, [analysisProgress]);

  const trackedObjectsRef = useRef<TrackedObject[]>(trackedObjects);
  useEffect(() => {
    trackedObjectsRef.current = trackedObjects;
  }, [trackedObjects]);

  const allSessionTargetsRef = useRef<TrackedObject[]>(allSessionTargets);
  useEffect(() => {
    allSessionTargetsRef.current = allSessionTargets;
  }, [allSessionTargets]);
  const allTargetsMapRef = useRef<Map<number, TrackedObject>>(new Map());

  const realDetectionsRef = useRef<Detection[]>(realDetections);
  useEffect(() => {
    realDetectionsRef.current = realDetections;
  }, [realDetections]);

  const unknownObjectsRef = useRef<UnknownObject[]>(unknownObjects);
  useEffect(() => {
    unknownObjectsRef.current = unknownObjects;
  }, [unknownObjects]);

  const activeViolationsRef = useRef<ZoneViolation[]>(activeViolations);
  useEffect(() => {
    activeViolationsRef.current = activeViolations;
  }, [activeViolations]);

  const totalUniqueTracksCountRef = useRef<number>(totalUniqueTracksCount);
  useEffect(() => {
    totalUniqueTracksCountRef.current = totalUniqueTracksCount;
  }, [totalUniqueTracksCount]);

  const detectionProfileRef = useRef<'BALANCED' | 'PRECISION' | 'PERFORMANCE'>(detectionProfile);
  useEffect(() => {
    detectionProfileRef.current = detectionProfile;
  }, [detectionProfile]);

  const lastProcessedFrameRef = useRef<number>(-1);

  // Background analysis pipeline runner
  const startVideoAnalysisPipeline = useCallback(async (
    videoId: string,
    profileOverride?: 'BALANCED' | 'PRECISION' | 'PERFORMANCE',
    force: boolean = false
  ) => {
    if (activeWsRef.current) {
      activeWsRef.current.close();
      activeWsRef.current = null;
    }
    const profile = profileOverride || detectionProfileRef.current;
    frameDetectionsMapRef.current.clear();
    frameTracksMapRef.current.clear();
    allTargetsMapRef.current.clear();
    maxFrameRef.current = 0;
    setRealDetections([]);
    setTrackedObjects([]);
    setAllSessionTargets([]);
    setUnknownObjects([]);
    setActiveViolations([]);
    setTotalUniqueTracksCount(0);
    setActiveTracksCount(0);
    setAnalysisProgress(0);
    setAnalysisStatus('ANALYZING');

    const loadSessionTracks = async (sessId: string) => {
      try {
        const frames = await realSurveillanceApi.getAnalysisTracks(sessId);
        if (Array.isArray(frames) && frames.length > 0) {
          const targetsMap = new Map<number, TrackedObject>();
          frames.forEach(f => {
            if (f.tracks) {
              frameTracksMapRef.current.set(f.frameIndex, f.tracks);
              if (f.frameIndex > maxFrameRef.current) {
                maxFrameRef.current = f.frameIndex;
              }
              const simpleDets = f.tracks.map((t: TrackedObject) => ({
                id: t.id,
                trackingId: t.trackingId,
                className: t.className,
                confidence: t.confidence,
                box: t.box,
                isUnknown: t.isUnknown,
              }));
              frameDetectionsMapRef.current.set(f.frameIndex, simpleDets);
              f.tracks.forEach((t: TrackedObject) => {
                const existing = targetsMap.get(t.trackingId);
                if (!existing) {
                  targetsMap.set(t.trackingId, { ...t });
                } else {
                  targetsMap.set(t.trackingId, {
                    ...existing,
                    ...t,
                    confidence: Math.max(existing.confidence, t.confidence),
                    className: (!existing.isUnknown && existing.className) ? existing.className : t.className,
                    isUnknown: existing.isUnknown && t.isUnknown,
                    lastSeen: t.lastSeen || existing.lastSeen,
                  });
                }
              });
            }
          });
          const aggregated = Array.from(targetsMap.values()).sort((a, b) => a.trackingId - b.trackingId);
          allTargetsMapRef.current = targetsMap;
          setAllSessionTargets(aggregated);
          if (aggregated.length > 0) {
            setTotalUniqueTracksCount(aggregated.length);
          }
          const cur = currentFrameRef.current;
          const curTracks = frameTracksMapRef.current.get(cur) || frameTracksMapRef.current.get(0);
          if (curTracks) {
            setTrackedObjects(curTracks);
            setRealDetections(frameDetectionsMapRef.current.get(cur) || frameDetectionsMapRef.current.get(0) || []);
          }
        }
      } catch (err) {
        console.warn('Failed to load session tracks:', err);
      }
    };

    try {
      const session = await realSurveillanceApi.startAnalysis(videoId, profile, undefined, undefined, force);
      activeSessionIdRef.current = session.id;

      if (session.status === 'COMPLETED' || (session.status as any) === 'completed') {
        setAnalysisProgress(100);
        setAnalysisStatus('COMPLETED');
        await loadSessionTracks(session.id);
      }

      // Robust background polling fallback: keeps tracks synchronized even if WebSocket has delay
      let pollCount = 0;
      const pollTimer = setInterval(async () => {
        pollCount++;
        if (activeSessionIdRef.current !== session.id || analysisStatusRef.current === 'COMPLETED' || pollCount > 100) {
          clearInterval(pollTimer);
          return;
        }
        try {
          const statusResp = await realSurveillanceApi.getAnalysisStatus(session.id);
          if (statusResp) {
            if (statusResp.progress !== undefined && statusResp.progress > 0) {
              setAnalysisProgress(statusResp.progress);
            }
            if (statusResp.fps) {
              setPipelineFps(statusResp.fps);
              setFps(statusResp.fps);
            }
            if (statusResp.status === 'completed') {
              clearInterval(pollTimer);
              setAnalysisProgress(100);
              setAnalysisStatus('COMPLETED');
              await loadSessionTracks(session.id);
            } else if (frameTracksMapRef.current.size === 0 && statusResp.processedFrames > 0) {
              await loadSessionTracks(session.id);
            }
          }
        } catch {
          // ignore transient poll error
        }
      }, 1000);

      const ws = realSurveillanceApi.connectAnalysisWebSocket(
        session.id,
        (message: any) => {
          if (message.type === 'status') {
            if (message.status === 'completed') {
              setAnalysisProgress(100);
              setAnalysisStatus('COMPLETED');
              loadSessionTracks(session.id);
            } else if (message.progress !== undefined) {
              setAnalysisProgress(message.progress);
            }
          } else if (message.type === 'progress') {
            setAnalysisProgress(message.progress);
            if (message.fps) {
              setPipelineFps(message.fps);
              setFps(message.fps);
            }
          } else if (message.type === 'tracks') {
            if (message.videoFps) setVideoFps(message.videoFps);
            if (message.detectionLatencyMs !== undefined) setDetectionLatency(message.detectionLatencyMs);
            if (message.trackingLatencyMs !== undefined) setTrackingLatency(message.trackingLatencyMs);
            if (message.embeddingLatencyMs !== undefined) setEmbeddingLatency(message.embeddingLatencyMs);
            if (message.noveltyLatencyMs !== undefined) setNoveltyLatency(message.noveltyLatencyMs);
            if (message.zoneLatencyMs !== undefined) setZoneLatency(message.zoneLatencyMs);
            if (message.totalLatencyMs) {
              setTotalLatency(message.totalLatencyMs);
              setInferenceLatency(message.totalLatencyMs);
            }
            if (message.pipelineFps) {
              setPipelineFps(message.pipelineFps);
              setFps(message.pipelineFps);
            }
            if (message.activeTracksCount !== undefined) setActiveTracksCount(message.activeTracksCount);
            if (message.totalTracksCount !== undefined) setTotalUniqueTracksCount(message.totalTracksCount);

            if (message.activeViolations && Array.isArray(message.activeViolations)) {
              if (apiModeRef.current === 'LIVE_AI') {
                setActiveViolations(message.activeViolations);
              }
            }

            if (message.zoneEvents && Array.isArray(message.zoneEvents) && message.zoneEvents.length > 0) {
              if (apiModeRef.current === 'LIVE_AI') {
                setEvents(prev => {
                  const existingIds = new Set(prev.map(e => e.id));
                  const newOnes = message.zoneEvents.filter((e: any) => !existingIds.has(e.id));
                  return [...newOnes, ...prev];
                });
              }
            }

            if (message.alarmTriggered) {
              playAlarmSound();
            }

            if (message.unknownObjects && Array.isArray(message.unknownObjects)) {
              if (apiModeRef.current === 'LIVE_AI') {
                setUnknownObjects(prev => {
                  const map = new Map<string, UnknownObject>();
                  prev.forEach(u => map.set(u.id, u));
                  message.unknownObjects.forEach((u: UnknownObject) => map.set(u.id, u));
                  return Array.from(map.values());
                });
              }
            }

            if (message.tracks && Array.isArray(message.tracks)) {
              frameTracksMapRef.current.set(message.frame, message.tracks);
              if (message.frame > maxFrameRef.current) {
                maxFrameRef.current = message.frame;
              }
              const simpleDets = message.tracks.map((t: TrackedObject) => ({
                id: t.id,
                trackingId: t.trackingId,
                className: t.className,
                confidence: t.confidence,
                box: t.box,
                isUnknown: t.isUnknown,
              }));
              frameDetectionsMapRef.current.set(message.frame, simpleDets);

              message.tracks.forEach((t: TrackedObject) => {
                const existing = allTargetsMapRef.current.get(t.trackingId);
                if (!existing) {
                  allTargetsMapRef.current.set(t.trackingId, { ...t });
                } else {
                  allTargetsMapRef.current.set(t.trackingId, {
                    ...existing,
                    ...t,
                    confidence: Math.max(existing.confidence, t.confidence),
                    className: (!existing.isUnknown && existing.className) ? existing.className : t.className,
                    isUnknown: existing.isUnknown && t.isUnknown,
                    lastSeen: t.lastSeen || existing.lastSeen,
                  });
                }
              });
              setAllSessionTargets(Array.from(allTargetsMapRef.current.values()).sort((a, b) => a.trackingId - b.trackingId));

              if (
                message.frame === currentFrameRef.current ||
                Math.abs(message.frame - currentFrameRef.current) <= 1 ||
                frameTracksMapRef.current.size === 1
              ) {
                setTrackedObjects(message.tracks);
                setRealDetections(simpleDets);
              }
            }
          } else if (message.type === 'zone_violation') {
            playAlarmSound();
            if (message.event && apiModeRef.current === 'LIVE_AI') {
              setEvents(prev => [message.event, ...prev.filter(e => e.id !== message.event.id)]);
            }
          } else if (message.type === 'alarm') {
            playAlarmSound();
          } else if (message.type === 'zone_entry' || message.type === 'zone_exit') {
            if (message.event && apiModeRef.current === 'LIVE_AI') {
              setEvents(prev => [message.event, ...prev.filter(e => e.id !== message.event.id)]);
            }
          } else if (message.type === 'detections') {
            if (message.fps) {
              setPipelineFps(message.fps);
              setFps(message.fps);
            }
            if (message.latencyMs) {
              setTotalLatency(message.latencyMs);
              setInferenceLatency(message.latencyMs);
            }

            if (message.detections && Array.isArray(message.detections)) {
              frameDetectionsMapRef.current.set(message.frame, message.detections);
              if (
                !frameTracksMapRef.current.has(message.frame) &&
                (message.frame === currentFrameRef.current ||
                 Math.abs(message.frame - currentFrameRef.current) <= 1 ||
                 frameDetectionsMapRef.current.size === 1)
              ) {
                setRealDetections(message.detections);
              }
            }
          } else if (message.type === 'completed') {
            setAnalysisProgress(100);
            setAnalysisStatus('COMPLETED');
            loadSessionTracks(session.id);

            realSurveillanceApi.getUnknownObjects(session.id)
              .then((unknowns: any[]) => {
                if (apiModeRef.current === 'LIVE_AI' && Array.isArray(unknowns)) {
                  setUnknownObjects(unknowns);
                }
              })
              .catch(() => {});

            realSurveillanceApi.getViolations()
              .then(viols => {
                if (apiModeRef.current === 'LIVE_AI' && Array.isArray(viols)) {
                  setActiveViolations(viols);
                }
              })
              .catch(() => {});

            realSurveillanceApi.getEvents()
              .then(evs => {
                if (apiModeRef.current === 'LIVE_AI' && Array.isArray(evs) && evs.length > 0) {
                  setEvents(evs);
                }
              })
              .catch(() => {});
          } else if (message.type === 'error') {
            setBackendError(`Analysis error: ${message.message}`);
            setAnalysisStatus('IDLE');
          }
        },
        (err: any) => {
          console.warn('WebSocket stream error:', err);
        }
      );
      activeWsRef.current = ws;
    } catch (err: any) {
      console.warn('Analysis pipeline startup notice:', err);
      if (apiModeRef.current === 'LIVE_AI') {
        setBackendError(`Analysis engine: ${err.message || err}`);
      }
      setAnalysisStatus('IDLE');
    }
  }, [playAlarmSound]);


  // Multi-Video Session Caching & Isolation
  const saveCurrentSession = useCallback(() => {
    const currentId = currentVideoIdRef.current;
    if (!currentId) return;
    videoSessionsCacheRef.current.set(currentId, {
      analysisId: activeSessionIdRef.current || undefined,
      status: analysisStatusRef.current,
      progress: analysisProgressRef.current,
      trackedObjects: [...trackedObjectsRef.current],
      allSessionTargets: [...allSessionTargetsRef.current],
      realDetections: [...realDetectionsRef.current],
      frameTracks: new Map(frameTracksMapRef.current),
      frameDetections: new Map(frameDetectionsMapRef.current),
      unknownObjects: [...unknownObjectsRef.current],
      activeViolations: [...activeViolationsRef.current],
      totalUniqueTracksCount: totalUniqueTracksCountRef.current,
    });
  }, []);

  const restoreSessionOrInit = useCallback(async (newVideoId: string) => {
    currentVideoIdRef.current = newVideoId;
    const cached = videoSessionsCacheRef.current.get(newVideoId);
    if (cached && (cached.frameTracks.size > 0 || cached.status === 'COMPLETED')) {
      activeSessionIdRef.current = cached.analysisId || null;
      frameTracksMapRef.current = new Map(cached.frameTracks);
      frameDetectionsMapRef.current = new Map(cached.frameDetections);
      setTrackedObjects(cached.trackedObjects);
      if (cached.allSessionTargets) {
        const tMap = new Map<number, TrackedObject>();
        cached.allSessionTargets.forEach(t => tMap.set(t.trackingId, t));
        allTargetsMapRef.current = tMap;
        setAllSessionTargets(cached.allSessionTargets);
      }
      setRealDetections(cached.realDetections);
      setUnknownObjects(cached.unknownObjects);
      setActiveViolations(cached.activeViolations);
      setTotalUniqueTracksCount(cached.totalUniqueTracksCount);
      setAnalysisProgress(cached.progress);
      setAnalysisStatus(cached.status);
      setIsPrecomputedDemoReplay(cached.frameTracks.size > 0);
      return;
    }

    // Check if live backend already processed this video session
    if (apiModeRef.current === 'LIVE_AI' && BACKEND_URL) {
      try {
        const latest = await realSurveillanceApi.getLatestVideoAnalysis(newVideoId);
        if (latest && (latest.status === 'completed' || latest.processedFrames > 0)) {
          activeSessionIdRef.current = latest.analysisId;
          setAnalysisProgress(latest.progress || 100);
          setAnalysisStatus(latest.status === 'completed' ? 'COMPLETED' : 'ANALYZING');
          if (latest.uniqueTracksCount) setTotalUniqueTracksCount(latest.uniqueTracksCount);

          const tracks = await realSurveillanceApi.getAnalysisTracks(latest.analysisId);
          const targetsMap = new Map<number, TrackedObject>();
          if (Array.isArray(tracks) && tracks.length > 0) {
            tracks.forEach((f: any) => {
              if (f.tracks) {
                frameTracksMapRef.current.set(f.frameIndex, f.tracks);
                if (f.frameIndex > maxFrameRef.current) {
                  maxFrameRef.current = f.frameIndex;
                }
                const simpleDets = f.tracks.map((t: TrackedObject) => ({
                  id: t.id,
                  trackingId: t.trackingId,
                  className: t.className,
                  confidence: t.confidence,
                  box: t.box,
                  isUnknown: t.isUnknown,
                }));
                frameDetectionsMapRef.current.set(f.frameIndex, simpleDets);
                f.tracks.forEach((t: TrackedObject) => {
                  const existing = targetsMap.get(t.trackingId);
                  if (!existing) {
                    targetsMap.set(t.trackingId, { ...t });
                  } else {
                    targetsMap.set(t.trackingId, {
                      ...existing,
                      ...t,
                      confidence: Math.max(existing.confidence, t.confidence),
                      className: (!existing.isUnknown && existing.className) ? existing.className : t.className,
                      isUnknown: existing.isUnknown && t.isUnknown,
                      lastSeen: t.lastSeen || existing.lastSeen,
                    });
                  }
                });
              }
            });
            const aggregated = Array.from(targetsMap.values()).sort((a, b) => a.trackingId - b.trackingId);
            allTargetsMapRef.current = targetsMap;
            setAllSessionTargets(aggregated);
            if (aggregated.length > 0) {
              setTotalUniqueTracksCount(aggregated.length);
            }
            const cur = currentFrameRef.current;
            const curTracks = frameTracksMapRef.current.get(cur) || frameTracksMapRef.current.get(0);
            if (curTracks) {
              setTrackedObjects(curTracks);
              setRealDetections(frameDetectionsMapRef.current.get(cur) || frameDetectionsMapRef.current.get(0) || []);
            }
          }

          const unknowns = await realSurveillanceApi.getUnknownObjects(latest.analysisId);
          if (Array.isArray(unknowns)) {
            setUnknownObjects(unknowns);
          }

          const aggregatedTargets = Array.from(targetsMap.values()).sort((a, b) => a.trackingId - b.trackingId);

          videoSessionsCacheRef.current.set(newVideoId, {
            analysisId: latest.analysisId,
            status: latest.status === 'completed' ? 'COMPLETED' : 'ANALYZING',
            progress: latest.progress || 100,
            trackedObjects: frameTracksMapRef.current.get(0) || [],
            allSessionTargets: aggregatedTargets,
            realDetections: frameDetectionsMapRef.current.get(0) || [],
            frameTracks: new Map(frameTracksMapRef.current),
            frameDetections: new Map(frameDetectionsMapRef.current),
            unknownObjects: Array.isArray(unknowns) ? unknowns : [],
            activeViolations: [],
            totalUniqueTracksCount: latest.uniqueTracksCount || aggregatedTargets.length || 0,
          });

          setIsPrecomputedDemoReplay(false);
          return;
        }
      } catch (err) {
        console.warn('Session restore check error:', err);
      }
    }

    // Demo Mode & Static Hosting: check for authentic precomputed benchmark session
    if (apiModeRef.current === 'DEMO' || !BACKEND_URL) {
      try {
        const precomputed = await realSurveillanceApi.loadPrecomputedSession(newVideoId);
        if (precomputed && Array.isArray(precomputed.tracks) && precomputed.tracks.length > 0) {
          activeSessionIdRef.current = precomputed.summary?.analysisId || `demo-${newVideoId}`;
          setAnalysisProgress(100);
          setAnalysisStatus('COMPLETED');
          setIsPrecomputedDemoReplay(true);

          frameTracksMapRef.current.clear();
          frameDetectionsMapRef.current.clear();
          allTargetsMapRef.current.clear();

          const targetsMap = new Map<number, TrackedObject>();
          let maxF = 0;

          precomputed.tracks.forEach((f: any) => {
            if (f.frameIndex !== undefined && f.tracks) {
              frameTracksMapRef.current.set(f.frameIndex, f.tracks);
              if (f.frameIndex > maxF) {
                maxF = f.frameIndex;
              }
              const simpleDets = f.tracks.map((t: TrackedObject) => ({
                id: t.id,
                trackingId: t.trackingId,
                className: t.className,
                confidence: t.confidence,
                box: t.box,
                isUnknown: t.isUnknown,
              }));
              frameDetectionsMapRef.current.set(f.frameIndex, simpleDets);

              f.tracks.forEach((t: TrackedObject) => {
                const existing = targetsMap.get(t.trackingId);
                if (!existing) {
                  targetsMap.set(t.trackingId, { ...t });
                } else {
                  targetsMap.set(t.trackingId, {
                    ...existing,
                    ...t,
                    confidence: Math.max(existing.confidence, t.confidence),
                    className: (!existing.isUnknown && existing.className) ? existing.className : t.className,
                    isUnknown: existing.isUnknown && t.isUnknown,
                    lastSeen: t.lastSeen || existing.lastSeen,
                  });
                }
              });
            }
          });

          maxFrameRef.current = maxF;
          const aggregatedTargets = Array.from(targetsMap.values()).sort((a, b) => a.trackingId - b.trackingId);
          allTargetsMapRef.current = targetsMap;
          setAllSessionTargets(aggregatedTargets);
          setTotalUniqueTracksCount(precomputed.summary?.uniqueTracksCount || aggregatedTargets.length);

          const initialTracks = frameTracksMapRef.current.get(0) || frameTracksMapRef.current.get(5) || [];
          setTrackedObjects(initialTracks);
          setRealDetections(frameDetectionsMapRef.current.get(0) || frameDetectionsMapRef.current.get(5) || []);

          setModelConfig({
            name: "YOLOv8n (Precomputed Benchmark)",
            version: "8.0.0",
            weights: "yolov8n.pt (Ultralytics)",
            inputResolution: "1920x1080 (RGB)",
            backend: "Precomputed Benchmark Dataset",
            tracker: "ByteTrack",
            status: "ACTIVE",
          });

          videoSessionsCacheRef.current.set(newVideoId, {
            analysisId: activeSessionIdRef.current,
            status: 'COMPLETED',
            progress: 100,
            trackedObjects: initialTracks,
            allSessionTargets: aggregatedTargets,
            realDetections: frameDetectionsMapRef.current.get(0) || [],
            frameTracks: new Map(frameTracksMapRef.current),
            frameDetections: new Map(frameDetectionsMapRef.current),
            unknownObjects: [],
            activeViolations: [],
            totalUniqueTracksCount: precomputed.summary?.uniqueTracksCount || aggregatedTargets.length,
          });

          return;
        }
      } catch (err) {
        console.warn('Precomputed benchmark session load notice:', err);
      }
    }

    // Fresh session / Clean Raw Video Playback without precomputed data
    setIsPrecomputedDemoReplay(false);
    activeSessionIdRef.current = null;
    frameTracksMapRef.current.clear();
    frameDetectionsMapRef.current.clear();
    allTargetsMapRef.current.clear();
    maxFrameRef.current = 0;
    setTrackedObjects([]);
    setAllSessionTargets([]);
    setRealDetections([]);
    setUnknownObjects([]);
    setActiveViolations([]);
    setTotalUniqueTracksCount(0);
    setAnalysisProgress(0);
    setAnalysisStatus('IDLE');
  }, []);

  // Mode switcher
  const setApiMode = useCallback((mode: ApiMode) => {
    setApiModeState(mode);
    setGlobalApiMode(mode);
    setBackendError(null);
    if (mode === 'DEMO') {
      if (activeSourceRef.current?.id) {
        restoreSessionOrInit(activeSourceRef.current.id);
      } else {
        setRealDetections([]);
        setTrackedObjects([]);
        setUnknownObjects([]);
        setActiveViolations([]);
        setIsPrecomputedDemoReplay(false);
      }
    } else {
      // LIVE AI MODE: Clean state, zero mock leakage
      setRealDetections([]);
      setTrackedObjects([]);
      setUnknownObjects([]);
      setActiveViolations([]);
      setIsPrecomputedDemoReplay(false);
      setModelConfig(prev => ({ ...prev, tracker: 'ByteTrack' }));
      if (activeSource?.id && BACKEND_URL) {
        startVideoAnalysisPipeline(activeSource.id);
      }
    }
  }, [activeSource, restoreSessionOrInit, startVideoAnalysisPipeline]);

  // Check backend health periodically
  useEffect(() => {
    if (!BACKEND_URL) return; // In Demo Mode without backend URL, skip polling
    let isMounted = true;
    const checkHealth = async () => {
      try {
        const health = await realSurveillanceApi.getBackendHealth();
        if (isMounted) {
          setBackendHealth(health);
          setBackendError(null);
          if (health.model.loaded) {
            setModelConfig({
              name: health.model.model_name,
              version: health.model.model_version,
              weights: `${health.model.model_name} (Ultralytics)`,
              inputResolution: "640x640 (RGB)",
              backend: health.device.cuda_available ? "PyTorch / CUDA" : "PyTorch / CPU",
              tracker: "ByteTrack",
              status: "ACTIVE",
            });
          }
        }
      } catch (err: any) {
        if (isMounted) {
          setBackendHealth(null);
          if (apiMode === 'LIVE_AI') {
            setBackendError('Backend service unreachable. Run "python -m uvicorn app.main:app --port 8000" in backend/ or switch to DEMO MODE.');
          }
        }
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 10000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [apiMode]);

  // Clean up any existing WebSocket on unmount
  useEffect(() => {
    return () => {
      if (activeWsRef.current) {
        activeWsRef.current.close();
      }
    };
  }, []);

  // Select Sample Video
  const selectSampleVideo = useCallback(async (sample: SampleVideo) => {
    // If this video is already active and playing, don't blow away current tracks
    if (activeSourceRef.current?.id === sample.id && (frameTracksMapRef.current.size > 0 || isPlayingRef.current)) {
      setActiveSampleVideo(sample);
      return;
    }

    if (activeWsRef.current) {
      activeWsRef.current.close();
      activeWsRef.current = null;
    }
    saveCurrentSession();
    setActiveSampleVideo(sample);
    setUploadedMetadata(null);

    const streamUri = sample.streamUrl || `${BACKEND_URL}/api/v1/video/${sample.id}/stream`;
    setActiveSource({
      id: sample.id,
      name: sample.title || sample.displayName || sample.filename || 'Sample Video',
      type: 'sample',
      uri: streamUri,
      status: 'ONLINE',
      location: sample.category || 'Surveillance Hub',
      resolution: sample.resolution,
      fps: sample.fps || 15,
    });
    setTotalDurationSeconds(sample.durationSeconds || 0);
    setFps(sample.fps || 15.0);
    setVideoFps(sample.fps || 15.0);
    setCurrentTimeSeconds(0);
    setCurrentFrame(0);
    currentFrameRef.current = 0;
    maxFrameRef.current = 0;
    lastProcessedFrameRef.current = -1;

    // Cleanly reset current frame detections & tracks to avoid retaining stale data from previous video
    setTrackedObjects([]);
    setAllSessionTargets([]);
    allTargetsMapRef.current.clear();
    setRealDetections([]);
    setUnknownObjects([]);
    setActiveViolations([]);
    setTotalUniqueTracksCount(0);
    setActiveTracksCount(0);
    setAnalysisProgress(0);
    frameTracksMapRef.current.clear();
    frameDetectionsMapRef.current.clear();

    // 1. PLAYBACK: Start video playback immediately without waiting for AI analysis pipeline
    if (videoElementRef.current) {
      videoElementRef.current.muted = true;
      videoElementRef.current.defaultMuted = true;
      if (videoElementRef.current.src !== streamUri) {
        videoElementRef.current.src = streamUri;
        videoElementRef.current.load();
      }
      videoElementRef.current.currentTime = 0;
      const p = videoElementRef.current.play();
      if (p !== undefined) {
        p.then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
      }
    } else {
      setIsPlaying(true);
    }

    // 2. ASYNC ANALYSIS: Decoupled background analysis execution
    restoreSessionOrInit(sample.id).then(() => {
      if (apiModeRef.current === 'LIVE_AI' && BACKEND_URL) {
        const cached = videoSessionsCacheRef.current.get(sample.id);
        if (!cached || (cached.status !== 'COMPLETED' && cached.status !== 'ANALYZING')) {
          startVideoAnalysisPipeline(sample.id, detectionProfileRef.current);
        }
      }
    }).catch(err => {
      console.warn('Async session restore notice:', err);
    });
  }, [saveCurrentSession, restoreSessionOrInit, startVideoAnalysisPipeline]);

  // Select Uploaded Video from list
  const selectUploadedVideo = useCallback(async (video: SampleVideo) => {
    if (activeSourceRef.current?.id === video.id && (frameTracksMapRef.current.size > 0 || isPlayingRef.current)) {
      setActiveSampleVideo(null);
      return;
    }
    if (activeWsRef.current) {
      activeWsRef.current.close();
      activeWsRef.current = null;
    }
    saveCurrentSession();
    setActiveSampleVideo(null);
    setUploadedMetadata(null);

    const streamUri = video.streamUrl || `${BACKEND_URL}/api/v1/video/${video.id}/stream`;
    setActiveSource({
      id: video.id,
      name: video.title || video.displayName || video.filename || 'Uploaded Video',
      type: 'upload',
      uri: streamUri,
      status: 'ONLINE',
      location: 'Uploaded Footage',
      resolution: video.resolution || `${video.width}x${video.height}`,
      fps: video.fps || 15,
    });
    setTotalDurationSeconds(video.durationSeconds || 0);
    setFps(video.fps || 15.0);
    setVideoFps(video.fps || 15.0);
    setCurrentTimeSeconds(0);
    setCurrentFrame(0);
    currentFrameRef.current = 0;
    maxFrameRef.current = 0;
    lastProcessedFrameRef.current = -1;

    // Cleanly reset current frame detections & tracks
    setTrackedObjects([]);
    setAllSessionTargets([]);
    allTargetsMapRef.current.clear();
    setRealDetections([]);
    setUnknownObjects([]);
    setActiveViolations([]);
    setTotalUniqueTracksCount(0);
    setActiveTracksCount(0);
    setAnalysisProgress(0);
    frameTracksMapRef.current.clear();
    frameDetectionsMapRef.current.clear();

    // 1. PLAYBACK: Initialize video paused at frame 0 so video does not race ahead of analysis
    setIsPlaying(false);
    if (videoElementRef.current) {
      videoElementRef.current.muted = true;
      videoElementRef.current.defaultMuted = true;
      if (videoElementRef.current.src !== streamUri) {
        videoElementRef.current.src = streamUri;
        videoElementRef.current.load();
      }
      videoElementRef.current.pause();
      videoElementRef.current.currentTime = 0;
    }

    // 2. ASYNC ANALYSIS: Decoupled background analysis execution
    restoreSessionOrInit(video.id).then(() => {
      if (apiModeRef.current === 'LIVE_AI' && BACKEND_URL) {
        const cached = videoSessionsCacheRef.current.get(video.id);
        if (!cached || (cached.status !== 'COMPLETED' && cached.status !== 'ANALYZING')) {
          startVideoAnalysisPipeline(video.id, detectionProfileRef.current);
        }
      }
    }).catch(err => {
      console.warn('Async session restore notice:', err);
    });
  }, [saveCurrentSession, restoreSessionOrInit, startVideoAnalysisPipeline]);

  // Dynamic discovery of uploaded videos
  const isRefreshingUploadsRef = useRef<boolean>(false);
  const refreshUploadedVideos = useCallback(async () => {
    if (isRefreshingUploadsRef.current) return;
    isRefreshingUploadsRef.current = true;
    setIsLoadingUploads(true);
    try {
      const uploads = await realSurveillanceApi.getUploadedVideos();
      // Defensive deduplication layer using unique backend upload ID
      const uniqueUploads = Array.from(
        new Map((uploads || []).map(video => [video.id, video])).values()
      );
      setUploadedVideos(uniqueUploads);
      if (apiModeRef.current === 'LIVE_AI' && Array.isArray(uniqueUploads)) {
        uniqueUploads.forEach(v => {
          if (v.id) {
            realSurveillanceApi.getLatestVideoAnalysis(v.id).then(latest => {
              if (latest && (latest.status === 'completed' || latest.status === 'COMPLETED')) {
                setVideoStatusMap(prev => ({ ...prev, [v.id]: 'COMPLETED' }));
              }
            }).catch(() => {});
          }
        });
      }
    } catch (e) {
      console.warn('Failed to load uploaded videos:', e);
      setUploadedVideos([]);
    } finally {
      setIsLoadingUploads(false);
      isRefreshingUploadsRef.current = false;
    }
  }, []);

  // Dynamic discovery of backend sample videos
  const isRefreshingSamplesRef = useRef<boolean>(false);
  const refreshSampleVideos = useCallback(async () => {
    if (isRefreshingSamplesRef.current) return;
    isRefreshingSamplesRef.current = true;
    setIsLoadingSamples(true);
    setSampleError(null);
    try {
      const samples = await realSurveillanceApi.getSampleVideos();
      setSampleVideos(samples);
      if (apiModeRef.current === 'LIVE_AI' && Array.isArray(samples) && BACKEND_URL) {
        samples.forEach(s => {
          if (s.id) {
            realSurveillanceApi.getLatestVideoAnalysis(s.id).then(latest => {
              if (latest && (latest.status === 'completed' || latest.status === 'COMPLETED')) {
                setVideoStatusMap(prev => ({ ...prev, [s.id]: 'COMPLETED' }));
              }
            }).catch(() => {});
          }
        });
      }
      if (samples && samples.length > 0) {
        const currentId = activeSourceRef.current?.id;
        const currentStillValid = samples.find(s => s.id === currentId);
        const chosen = currentStillValid || samples[0];
        setActiveSampleVideo(chosen);
        if (!currentId || !currentStillValid) {
          selectSampleVideo(chosen);
        }
      } else {
        setActiveSampleVideo(null);
      }
    } catch (err: any) {
      console.warn('Sample video discovery fallback to static samples:', err);
      setSampleVideos(STATIC_SAMPLE_VIDEOS);
      if (STATIC_SAMPLE_VIDEOS.length > 0) {
        const chosen = STATIC_SAMPLE_VIDEOS[0];
        setActiveSampleVideo(chosen);
        selectSampleVideo(chosen);
      }
    } finally {
      setIsLoadingSamples(false);
      isRefreshingSamplesRef.current = false;
    }
  }, [selectSampleVideo]);

  // Initial load of sample and uploaded videos - strictly run once on mount
  const hasMountedRef = useRef<boolean>(false);
  useEffect(() => {
    if (hasMountedRef.current) return;
    hasMountedRef.current = true;
    refreshSampleVideos();
    refreshUploadedVideos();
  }, [refreshSampleVideos, refreshUploadedVideos]);

  // Load initial security zones from backend in LIVE_AI mode
  useEffect(() => {
    if (apiMode === 'LIVE_AI') {
      realSurveillanceApi.getZones().then(backendZones => {
        if (backendZones && backendZones.length > 0) {
          setZones(backendZones);
        }
      }).catch(err => console.warn('Failed to load initial backend zones:', err));
    }
  }, [apiMode]);

  // Load Uploaded Video
  const loadUploadedVideo = useCallback(async (source: VideoSource, metadata: VideoMetadata) => {
    if (activeWsRef.current) {
      activeWsRef.current.close();
      activeWsRef.current = null;
    }

    saveCurrentSession();
    setActiveSampleVideo(null);
    setUploadedMetadata(metadata);
    setActiveSource(source);
    setTotalDurationSeconds(metadata.durationSeconds);
    setCurrentTimeSeconds(0);
    setCurrentFrame(0);
    currentFrameRef.current = 0;
    maxFrameRef.current = 0;
    setIsPlaying(false);

    if (videoElementRef.current) {
      videoElementRef.current.pause();
      videoElementRef.current.currentTime = 0;
      if (videoElementRef.current.src !== source.uri) {
        videoElementRef.current.src = source.uri;
        videoElementRef.current.load();
      }
    }

    // Cleanly reset ALL session tracking, detection, target, event, violation state
    setTrackedObjects([]);
    setAllSessionTargets([]);
    allTargetsMapRef.current.clear();
    setRealDetections([]);
    setUnknownObjects([]);
    setActiveViolations([]);
    setTotalUniqueTracksCount(0);
    setActiveTracksCount(0);
    setAnalysisProgress(0);
    frameTracksMapRef.current.clear();
    frameDetectionsMapRef.current.clear();

    await refreshUploadedVideos();

    if (apiMode === 'LIVE_AI' && BACKEND_URL) {
      setModelConfig(prev => ({
        ...prev,
        tracker: 'ByteTrack',
      }));
      await startVideoAnalysisPipeline(source.id, detectionProfile, true);
    } else {
      setIsPrecomputedDemoReplay(false);
      setAnalysisStatus('IDLE');
    }
  }, [apiMode, saveCurrentSession, refreshUploadedVideos, startVideoAnalysisPipeline, detectionProfile]);

  // Note: Demo mode relies strictly on verified precomputed benchmark sessions when available.
  // When no precomputed session is loaded, the raw video plays cleanly without synthesizing fake boxes.

  // Recalculate zone evaluation in DEMO mode
  useEffect(() => {
    if (apiMode !== 'DEMO') return;
    const { newViolations } = evaluateZones(zones, trackedObjects);
    if (newViolations.length > 0) {
      setActiveViolations(prev => {
        const existingIds = new Set(prev.map(p => `${p.zoneId}-${p.objectId}`));
        const filteredNew = newViolations.filter(v => !existingIds.has(`${v.zoneId}-${v.objectId}`));
        return [...filteredNew, ...prev];
      });
    }
  }, [zones, trackedObjects, apiMode]);

  // Native Video element bindings
  const registerVideoElement = useCallback((el: HTMLVideoElement | null) => {
    videoElementRef.current = el;
    if (el) {
      el.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed]);

  const onVideoTimeUpdate = useCallback((time: number, duration?: number) => {
    setCurrentTimeSeconds(time);
    const dur = (duration && !isNaN(duration) && duration > 0)
      ? duration
      : (totalDurationSeconds > 0 ? totalDurationSeconds : 0);
    if (dur > 0 && totalDurationSeconds === 0) {
      setTotalDurationSeconds(dur);
    }

    let frame: number;
    if (dur > 0 && maxFrameRef.current > 0) {
      const ratio = Math.max(0, Math.min(1, time / dur));
      frame = Math.round(ratio * maxFrameRef.current);
    } else {
      const currentFps = activeSourceRef.current?.fps && activeSourceRef.current.fps > 0
        ? activeSourceRef.current.fps
        : (videoFps && videoFps > 0 ? videoFps : 24.0);
      frame = Math.round(time * currentFps);
    }

    // Prevent duplicate processing of the same frame index at 60Hz
    if (frame === lastProcessedFrameRef.current) {
      return;
    }
    lastProcessedFrameRef.current = frame;
    setCurrentFrame(frame);
    currentFrameRef.current = frame;

    if (frameTracksMapRef.current.size > 0) {
      let trks = frameTracksMapRef.current.get(frame);
      let dets = frameDetectionsMapRef.current.get(frame);

      if (!trks && frameTracksMapRef.current.size > 0) {
        // Fast tolerant nearest frame lookup within +/- 8 frames
        for (let offset = 1; offset <= 8; offset++) {
          if (frameTracksMapRef.current.has(frame - offset)) {
            trks = frameTracksMapRef.current.get(frame - offset);
            dets = frameDetectionsMapRef.current.get(frame - offset);
            break;
          }
          if (frameTracksMapRef.current.has(frame + offset)) {
            trks = frameTracksMapRef.current.get(frame + offset);
            dets = frameDetectionsMapRef.current.get(frame + offset);
            break;
          }
        }
      }

      if (trks) {
        setTrackedObjects(trks);
        setRealDetections(dets || []);
      } else if (frameTracksMapRef.current.size > 0) {
        setTrackedObjects([]);
        setRealDetections([]);
      }
    }
  }, [totalDurationSeconds, videoFps]);


  const onVideoDurationChange = useCallback((dur: number) => {
    if (dur && !isNaN(dur) && dur > 0) {
      setTotalDurationSeconds(dur);
    }
  }, []);

  const onVideoPlay = useCallback(() => {
    setIsPlaying(true);
    if (analysisStatus === 'PAUSED') {
      setAnalysisStatus('ANALYZING');
    }
  }, [analysisStatus]);

  const onVideoPause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const onVideoEnded = useCallback(() => {
    if (videoElementRef.current) {
      videoElementRef.current.currentTime = 0;
      videoElementRef.current.play().catch(() => {});
    }
  }, []);

  // Transport control actions
  const startAnalysis = useCallback(() => {
    if (videoElementRef.current) {
      videoElementRef.current.play().catch(e => console.warn('Play error:', e));
    }
    setIsPlaying(true);
    setAnalysisStatus('ANALYZING');
    if (apiMode === 'LIVE_AI' && activeSource?.id && BACKEND_URL) {
      startVideoAnalysisPipeline(activeSource.id, detectionProfile);
    }
  }, [apiMode, activeSource, detectionProfile, startVideoAnalysisPipeline]);

  const pauseAnalysis = useCallback(() => {
    if (videoElementRef.current) {
      videoElementRef.current.pause();
    }
    setIsPlaying(false);
    setAnalysisStatus('PAUSED');
  }, []);

  const stopAnalysis = useCallback(() => {
    if (videoElementRef.current) {
      videoElementRef.current.pause();
      videoElementRef.current.currentTime = 0;
    }
    setIsPlaying(false);
    setCurrentTimeSeconds(0);
    setCurrentFrame(0);
    currentFrameRef.current = 0;
    setRealDetections([]);
    setAnalysisStatus('IDLE');
    if (activeSessionIdRef.current && BACKEND_URL) {
      realSurveillanceApi.stopAnalysis(activeSessionIdRef.current);
    }
    if (activeWsRef.current) {
      activeWsRef.current.close();
      activeWsRef.current = null;
    }
  }, []);

  const replayAnalysis = useCallback(() => {
    if (videoElementRef.current) {
      videoElementRef.current.currentTime = 0;
      videoElementRef.current.play().catch(e => console.warn('Play error:', e));
    }
    setCurrentTimeSeconds(0);
    setCurrentFrame(0);
    currentFrameRef.current = 0;
    setIsPlaying(true);
    setAnalysisStatus('ANALYZING');
    if (activeSource?.id && apiMode === 'LIVE_AI' && BACKEND_URL) {
      startVideoAnalysisPipeline(activeSource.id, detectionProfile);
    }
  }, [activeSource, apiMode, detectionProfile, startVideoAnalysisPipeline]);

  const togglePlay = useCallback(() => {
    if (videoElementRef.current) {
      if (videoElementRef.current.paused) {
        const p = videoElementRef.current.play();
        if (p !== undefined) {
          p.then(() => {
            setIsPlaying(true);
            if (analysisStatus === 'PAUSED') setAnalysisStatus('ANALYZING');
          }).catch(e => {
            console.warn('Play error:', e);
            setIsPlaying(false);
          });
        }
      } else {
        videoElementRef.current.pause();
        setIsPlaying(false);
        setAnalysisStatus('PAUSED');
      }
    } else {
      setIsPlaying(prev => !prev);
    }
  }, [analysisStatus]);

  const seekTo = useCallback((seconds: number) => {
    if (videoElementRef.current) {
      videoElementRef.current.currentTime = seconds;
    }
    setCurrentTimeSeconds(seconds);
    const currentFps = activeSourceRef.current?.fps || videoFps || 15;
    const frame = Math.round(seconds * currentFps);
    setCurrentFrame(frame);
    currentFrameRef.current = frame;
    if (frameTracksMapRef.current.size > 0) {
      if (frameTracksMapRef.current.has(frame)) {
        const trks = frameTracksMapRef.current.get(frame)!;
        setTrackedObjects(trks);
        setRealDetections(frameDetectionsMapRef.current.get(frame) || []);
      } else {
        let closestFrame = -1;
        let minDiff = 7;
        for (const fIdx of frameTracksMapRef.current.keys()) {
          const diff = Math.abs(fIdx - frame);
          if (diff < minDiff) {
            minDiff = diff;
            closestFrame = fIdx;
          }
        }
        if (closestFrame !== -1) {
          const trks = frameTracksMapRef.current.get(closestFrame)!;
          setTrackedObjects(trks);
          setRealDetections(frameDetectionsMapRef.current.get(closestFrame) || []);
        } else if (frameTracksMapRef.current.size > 0) {
          setTrackedObjects([]);
          setRealDetections([]);
        }
      }
    }
  }, [videoFps]);

  const setSpeed = useCallback((speed: number) => {
    setPlaybackSpeed(speed);
    if (videoElementRef.current) {
      videoElementRef.current.playbackRate = speed;
    }
  }, []);

  // Zone operations
  const addZone = useCallback((zoneData: Omit<SecurityZone, 'id' | 'createdAt'>): SecurityZone => {
    const newZone: SecurityZone = {
      ...zoneData,
      id: `zone-${Date.now()}`,
      createdAt: new Date().toISOString().replace('T', ' ').substring(0, 19),
    };
    setZones(prev => [...prev, newZone]);
    if (apiMode === 'LIVE_AI') {
      realSurveillanceApi.saveZone(newZone).catch(e => console.warn('Failed to save zone to backend:', e));
    }
    return newZone;
  }, [apiMode]);

  const updateZone = useCallback((updated: SecurityZone) => {
    setZones(prev => prev.map(z => z.id === updated.id ? updated : z));
    if (apiMode === 'LIVE_AI') {
      realSurveillanceApi.saveZone(updated).catch(e => console.warn('Failed to update zone on backend:', e));
    }
  }, [apiMode]);

  const deleteZone = useCallback((zoneId: string) => {
    setZones(prev => prev.filter(z => z.id !== zoneId));
    setActiveViolations(prev => prev.filter(v => v.zoneId !== zoneId));
    if (selectedZoneId === zoneId) setSelectedZoneId(null);
    if (apiMode === 'LIVE_AI') {
      realSurveillanceApi.deleteZone(zoneId).catch(e => console.warn('Failed to delete zone on backend:', e));
    }
  }, [selectedZoneId, apiMode]);

  const toggleZoneEnabled = useCallback((zoneId: string) => {
    let nextState = true;
    setZones(prev => prev.map(z => {
      if (z.id === zoneId) {
        nextState = !z.enabled;
        return { ...z, enabled: nextState };
      }
      return z;
    }));
    if (apiMode === 'LIVE_AI') {
      realSurveillanceApi.toggleZoneEnabled(zoneId, nextState).catch(e => console.warn('Failed to toggle zone on backend:', e));
    }
  }, [apiMode]);

  const acknowledgeViolation = useCallback((violationId: string) => {
    setActiveViolations(prev => prev.map(v => v.id === violationId ? { ...v, status: 'ACKNOWLEDGED' } : v));
    if (apiMode === 'LIVE_AI') {
      realSurveillanceApi.acknowledgeViolation(violationId).catch(e => console.warn('Failed to acknowledge violation on backend:', e));
    }
  }, [apiMode]);

  // Zone Draft Operations
  const finishDraftZone = useCallback((name: string, type: SecurityZone['type'], stayThresholdSeconds: number) => {
    if (draftPoints.length < 3) return;

    const newZone: SecurityZone = {
      id: `zone-${Date.now()}`,
      name: name || `Custom ${type.toUpperCase()} Zone`,
      type,
      shape: drawingShape,
      points: draftPoints,
      alertLevel: type === 'emergency' ? 'critical' : 'medium',
      stayThresholdSeconds: stayThresholdSeconds || 10,
      monitoredObjects: ['person', 'vehicle', 'unknown'],
      alertActions: {
        visualAlert: true,
        audibleAlarm: type === 'emergency',
        eventLog: true,
        webhookNotification: true,
      },
      enabled: true,
      color: type === 'emergency' ? '#EF4444' : '#F59E0B',
      createdAt: new Date().toISOString().replace('T', ' ').substring(0, 19),
    };

    setZones(prev => [...prev, newZone]);
    setDraftPoints([]);
    setIsZoneEditMode(false);

    if (apiMode === 'LIVE_AI') {
      realSurveillanceApi.saveZone(newZone).catch(e => console.warn('Failed to save draft zone to backend:', e));
    }

    const event: SecurityEvent = {
      id: `evt-${Date.now()}`,
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
      type: 'SYSTEM_EVENT',
      severity: 'INFO',
      zoneId: newZone.id,
      zoneName: newZone.name,
      description: `Security zone defined: ${newZone.name} (${newZone.points.length} vertices)`,
      sourceCamera: activeSource.name,
      acknowledged: true,
    };
    setEvents(prev => [event, ...prev]);
  }, [draftPoints, drawingShape, activeSource.name, apiMode]);

  const cancelDraftZone = useCallback(() => {
    setDraftPoints([]);
    setIsZoneEditMode(false);
  }, []);

  // Unknown Objects operations
  const updateUnknownStatus = useCallback(async (id: string, status: UnknownObject['investigationStatus']) => {
    setUnknownObjects(prev => prev.map(u => u.id === id ? { ...u, investigationStatus: status } : u));
    if (apiMode === 'LIVE_AI') {
      await realSurveillanceApi.updateUnknownObjectStatus(id, status);
    }
  }, [apiMode]);

  // Event operations
  const acknowledgeEvent = useCallback((id: string) => {
    setEvents(prev => prev.map(e => e.id === id ? { ...e, acknowledged: true } : e));
    if (apiMode === 'LIVE_AI') {
      realSurveillanceApi.acknowledgeEvent(id).catch(e => console.warn('Failed to acknowledge event on backend:', e));
    }
  }, [apiMode]);

  const acknowledgeAllEvents = useCallback(() => {
    setEvents(prev => prev.map(e => ({ ...e, acknowledged: true })));
    setActiveViolations(prev => prev.map(v => ({ ...v, status: 'ACKNOWLEDGED' })));
  }, []);

  const clearAllEvents = useCallback(() => {
    setEvents([]);
    setActiveViolations([]);
  }, []);

  const ingestLiveFeedResults = useCallback((results: {
    activeViolations?: any[];
    zoneEvents?: any[];
    alarmTriggered?: boolean;
  }) => {
    if (results.activeViolations && Array.isArray(results.activeViolations)) {
      setActiveViolations(results.activeViolations);
    }
    if (results.zoneEvents && Array.isArray(results.zoneEvents) && results.zoneEvents.length > 0) {
      setEvents(prev => {
        const existingIds = new Set(prev.map(e => e.id));
        const newOnes = results.zoneEvents!.filter((e: any) => !existingIds.has(e.id));
        return [...newOnes, ...prev];
      });
    }
    if (results.alarmTriggered) {
      playAlarmSound();
    }
  }, [playAlarmSound]);

  // Overlays
  const toggleOverlay = useCallback((key: keyof SystemSettings['visualOverlaysEnabled']) => {
    setOverlays(prev => ({
      ...prev,
      [key]: !prev[key],
    }));
  }, []);

  // System settings
  const updateSettings = useCallback((newSettings: Partial<SystemSettings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
  }, []);

  const getVideoAnalysisStatus = useCallback((videoId: string): 'COMPLETED' | 'ANALYZING' | 'PAUSED' | 'IDLE' => {
    if (activeSourceRef.current?.id === videoId) {
      return analysisStatusRef.current;
    }
    if (videoStatusMap[videoId]) {
      return videoStatusMap[videoId];
    }
    const cached = videoSessionsCacheRef.current.get(videoId);
    if (cached) {
      return cached.status;
    }
    return 'IDLE';
  }, [videoStatusMap]);

  const value = useMemo(() => ({
    activeTab,
    setActiveTab,
    apiMode,
    setApiMode,
    backendHealth,
    backendError,
    clearBackendError,
    realDetections,
    analysisProgress,
    sampleVideos,
    isLoadingSamples,
    sampleError,
    refreshSampleVideos,
    uploadedVideos,
    isLoadingUploads,
    refreshUploadedVideos,
    activeSource,
    activeSampleVideo,
    uploadedMetadata,
    selectSampleVideo,
    selectUploadedVideo,
    loadUploadedVideo,
    detectionProfile,
    setDetectionProfile,
    isPlaying,
    playbackSpeed,
    currentTimeSeconds,
    totalDurationSeconds,
    currentFrame,
    fps,
    inferenceLatency,
    videoFps,
    detectionLatency,
    trackingLatency,
    embeddingLatency,
    noveltyLatency,
    zoneLatency,
    totalLatency,
    pipelineFps,
    activeTracksCount,
    totalUniqueTracksCount,
    analysisStatus,
    isPrecomputedDemoReplay,
    startAnalysis,
    pauseAnalysis,
    stopAnalysis,
    replayAnalysis,
    togglePlay,
    seekTo,
    setSpeed,
    registerVideoElement,
    onVideoTimeUpdate,
    onVideoDurationChange,
    onVideoPlay,
    onVideoPause,
    onVideoEnded,
    zones,
    activeViolations,
    selectedZoneId,
    setSelectedZoneId,
    addZone,
    updateZone,
    deleteZone,
    toggleZoneEnabled,
    acknowledgeViolation,
    isZoneEditMode,
    setIsZoneEditMode,
    drawingShape,
    setDrawingShape,
    draftPoints,
    setDraftPoints,
    finishDraftZone,
    cancelDraftZone,
    trackedObjects,
    allSessionTargets,
    unknownObjects,
    selectedObjectId,
    setSelectedObjectId,
    updateUnknownStatus,
    getVideoAnalysisStatus,
    events,
    acknowledgeEvent,
    acknowledgeAllEvents,
    clearAllEvents,
    ingestLiveFeedResults,
    overlays,
    toggleOverlay,
    settings,
    updateSettings,
    modelConfig,
  }), [
    activeTab,
    setActiveTab,
    apiMode,
    setApiMode,
    backendHealth,
    backendError,
    clearBackendError,
    realDetections,
    analysisProgress,
    sampleVideos,
    isLoadingSamples,
    sampleError,
    refreshSampleVideos,
    uploadedVideos,
    isLoadingUploads,
    refreshUploadedVideos,
    activeSource,
    activeSampleVideo,
    uploadedMetadata,
    selectSampleVideo,
    selectUploadedVideo,
    loadUploadedVideo,
    detectionProfile,
    setDetectionProfile,
    isPlaying,
    playbackSpeed,
    currentTimeSeconds,
    totalDurationSeconds,
    currentFrame,
    fps,
    inferenceLatency,
    videoFps,
    detectionLatency,
    trackingLatency,
    embeddingLatency,
    noveltyLatency,
    zoneLatency,
    totalLatency,
    pipelineFps,
    activeTracksCount,
    totalUniqueTracksCount,
    analysisStatus,
    isPrecomputedDemoReplay,
    startAnalysis,
    pauseAnalysis,
    stopAnalysis,
    replayAnalysis,
    togglePlay,
    seekTo,
    setSpeed,
    registerVideoElement,
    onVideoTimeUpdate,
    onVideoDurationChange,
    onVideoPlay,
    onVideoPause,
    onVideoEnded,
    zones,
    activeViolations,
    selectedZoneId,
    addZone,
    updateZone,
    deleteZone,
    toggleZoneEnabled,
    acknowledgeViolation,
    isZoneEditMode,
    drawingShape,
    draftPoints,
    finishDraftZone,
    cancelDraftZone,
    trackedObjects,
    allSessionTargets,
    unknownObjects,
    selectedObjectId,
    updateUnknownStatus,
    getVideoAnalysisStatus,
    events,
    acknowledgeEvent,
    acknowledgeAllEvents,
    clearAllEvents,
    overlays,
    toggleOverlay,
    settings,
    updateSettings,
    modelConfig,
  ]);

  return (
    <SurveillanceContext.Provider value={value}>
      {children}
    </SurveillanceContext.Provider>
  );
};

export const useSurveillance = () => {
  const context = useContext(SurveillanceContext);
  if (!context) {
    throw new Error('useSurveillance must be used within a SurveillanceProvider');
  }
  return context;
};
