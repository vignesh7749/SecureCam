import { ISurveillanceApi } from './api';
import { VideoSource, VideoMetadata, SampleVideo, AnalysisSession } from '../types/video';
import { SecurityZone, ZoneViolation } from '../types/zone';
import { TrackedObject, UnknownObject } from '../types/detection';
import { SecurityEvent } from '../types/event';
import { SurveillanceSummaryMetrics, TimeSeriesMetric, ClassDistribution, ZoneActivityMetric } from '../types/analytics';
import { SystemSettings, SystemModelConfig } from '../types/system';
import { 
  INITIAL_ZONES, 
  LIVE_CAMERAS, 
  DEFAULT_SYSTEM_SETTINGS, 
  DEFAULT_SUMMARY_METRICS 
} from './mockData';

export { BACKEND_URL, WS_BASE_URL, getWebSocketUrl } from './apiConfig';
import { BACKEND_URL, WS_BASE_URL, assertBackendConfigured } from './apiConfig';

export interface RealBackendHealth {
  status: string;
  version: string;
  model: {
    loaded: boolean;
    model_name: string;
    model_version: string;
    device: string;
    device_type: string;
    inference_mode: string;
    classes_count: number;
    classes?: Record<number, string>;
  };
  device: {
    cuda_available: boolean;
    device_type: string;
    gpu_name: string;
    torch_version: string;
  };
}

export class RealSurveillanceApi implements ISurveillanceApi {
  private zones: SecurityZone[] = [...INITIAL_ZONES];
  private violations: ZoneViolation[] = [];
  private events: SecurityEvent[] = [];
  private settings: SystemSettings = { ...DEFAULT_SYSTEM_SETTINGS };
  private activeSessions: Map<string, string> = new Map(); // videoId -> analysisId

  async getBackendHealth(): Promise<RealBackendHealth> {
    const res = await fetch(`${BACKEND_URL}/api/v1/health`);
    if (!res.ok) {
      throw new Error(`Backend health check failed: HTTP ${res.status}`);
    }
    return res.json();
  }

  async getSampleVideos(): Promise<SampleVideo[]> {
    const res = await fetch(`${BACKEND_URL}/api/v1/video/samples`);
    if (!res.ok) {
      throw new Error(`Failed to fetch sample videos from backend: HTTP ${res.status}`);
    }
    const data = await res.json();
    return data.map((item: any) => {
      const streamUrl = item.streamUrl?.startsWith('http')
        ? item.streamUrl
        : `${BACKEND_URL}${item.streamUrl?.startsWith('/') ? '' : '/'}${item.streamUrl || `api/v1/video/${item.id}/stream`}`;

      return {
        id: item.id,
        title: item.displayName || item.filename,
        category: 'Surveillance Video',
        duration: item.durationFormatted || `${Math.floor(item.duration / 60)}:${String(Math.floor(item.duration % 60)).padStart(2, '0')}`,
        durationSeconds: item.duration,
        resolution: item.resolution || `${item.width}x${item.height}`,
        description: `${item.filename} (${item.width}x${item.height} @ ${item.fps} FPS)`,
        difficulty: 'Standard',
        thumbnailUrl: '',
        sourceUrl: streamUrl,
        streamUrl: streamUrl,
        filename: item.filename,
        displayName: item.displayName,
        width: item.width,
        height: item.height,
        fps: item.fps,
        fileSize: item.fileSize,
        format: item.format,
        codec: item.codec,
        frameCount: item.frameCount,
        defaultObjectsCount: 0,
        hasUnknowns: false,
        hasEmergencyZone: false,
      };
    });
  }

  async getUploadedVideos(): Promise<SampleVideo[]> {
    const res = await fetch(`${BACKEND_URL}/api/v1/video/uploads`);
    if (!res.ok) {
      throw new Error(`Failed to fetch uploaded videos from backend: HTTP ${res.status}`);
    }
    const data = await res.json();
    return data.map((item: any) => {
      const streamUrl = item.streamUrl?.startsWith('http')
        ? item.streamUrl
        : `${BACKEND_URL}${item.streamUrl?.startsWith('/') ? '' : '/'}${item.streamUrl || `api/v1/video/${item.id}/stream`}`;

      return {
        id: item.id,
        title: item.displayName || item.filename,
        category: 'Uploaded Video',
        duration: item.durationFormatted || `${Math.floor(item.duration / 60)}:${String(Math.floor(item.duration % 60)).padStart(2, '0')}`,
        durationSeconds: item.duration,
        resolution: item.resolution || `${item.width}x${item.height}`,
        description: `${item.filename} (${item.width}x${item.height} @ ${item.fps} FPS)`,
        difficulty: 'Standard',
        thumbnailUrl: '',
        sourceUrl: streamUrl,
        streamUrl: streamUrl,
        filename: item.filename,
        displayName: item.displayName,
        width: item.width,
        height: item.height,
        fps: item.fps,
        fileSize: item.fileSize,
        format: item.format,
        codec: item.codec,
        frameCount: item.frameCount,
        defaultObjectsCount: 0,
        hasUnknowns: false,
        hasEmergencyZone: false,
      };
    });
  }

  async getVideoSources(): Promise<VideoSource[]> {
    return [...LIVE_CAMERAS];
  }

  async uploadVideoFile(file: File): Promise<{ source: VideoSource; metadata: VideoMetadata }> {
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch(`${BACKEND_URL}/api/v1/video/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      let errorDetail = 'Upload failed';
      try {
        const errorJson = await res.json();
        errorDetail = errorJson.detail || errorDetail;
      } catch {
        errorDetail = `Server responded with HTTP ${res.status}`;
      }
      throw new Error(errorDetail);
    }

    const backendMeta = await res.json();

    const frontendMetadata: VideoMetadata = {
      filename: backendMeta.filename,
      durationSeconds: backendMeta.duration,
      width: backendMeta.width,
      height: backendMeta.height,
      fps: backendMeta.fps,
      codec: backendMeta.codec,
      filesizeBytes: backendMeta.size,
      bitrateKbps: Math.round((backendMeta.size * 8) / (backendMeta.duration * 1024 || 1)),
    };

    const source: VideoSource = {
      id: backendMeta.videoId,
      name: backendMeta.filename,
      type: 'upload',
      // Point directly to FastAPI streaming endpoint so browser can play the uploaded video
      uri: `${BACKEND_URL}/api/v1/video/${backendMeta.videoId}/stream`,
      status: 'ONLINE',
      location: 'FastAPI Ingest Workspace',
      resolution: `${backendMeta.width}x${backendMeta.height}`,
      fps: backendMeta.fps,
      metadata: frontendMetadata,
    };

    return { source, metadata: frontendMetadata };
  }

  async startAnalysis(
    videoId: string, 
    profile: string = 'BALANCED',
    conf?: number,
    imgsz?: number,
    force: boolean = false
  ): Promise<AnalysisSession> {
    const url = new URL(`${BACKEND_URL}/api/v1/analyze/${videoId}`);
    if (profile) {
      url.searchParams.set('profile', profile);
    }
    if (force) {
      url.searchParams.set('force', 'true');
    }
    if (conf !== undefined) {
      url.searchParams.set('conf', String(conf));
    }
    if (imgsz !== undefined) {
      url.searchParams.set('imgsz', String(imgsz));
    }

    const res = await fetch(url.toString(), {
      method: 'POST',
    });

    if (!res.ok) {
      let detail = 'Analysis request rejected';
      try {
        const err = await res.json();
        detail = err.detail || detail;
      } catch {}
      throw new Error(detail);
    }

    const data = await res.json();
    this.activeSessions.set(videoId, data.analysisId);

    const isCompleted = data.status === 'completed';

    return {
      id: data.analysisId,
      sourceId: videoId,
      sourceName: videoId,
      status: isCompleted ? 'COMPLETED' : 'ANALYZING',
      startTime: new Date().toISOString(),
      currentFrame: 0,
      totalFrames: 100,
      fps: 30.0,
      inferenceLatencyMs: 25.0,
      model: `Ultralytics YOLO (${profile})`,
      objectsDetectedCount: 0,
      violationsCount: 0,
      unknownsCount: 0,
    };
  }

  async getAnalysisStatus(analysisId: string): Promise<any> {
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/analyze/${analysisId}`);
      if (res.ok) {
        return res.json();
      }
    } catch (e) {
      console.warn(`Could not fetch analysis status for ${analysisId}:`, e);
    }
    return null;
  }

  async getLatestVideoAnalysis(videoId: string): Promise<any> {
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/analyze/video/${videoId}/latest`);
      if (res.ok) {
        return res.json();
      }
    } catch (e) {
      console.warn(`Could not fetch latest analysis for video ${videoId}:`, e);
    }
    return null;
  }

  async pauseAnalysis(sessionId: string): Promise<AnalysisSession> {
    // Current backend allows cancel / poll
    return {
      id: sessionId,
      sourceId: 'src',
      sourceName: 'Source',
      status: 'PAUSED',
      startTime: new Date().toISOString(),
      currentFrame: 0,
      totalFrames: 100,
      fps: 0,
      inferenceLatencyMs: 0,
      model: 'Ultralytics YOLO (Live Backend)',
      objectsDetectedCount: 0,
      violationsCount: 0,
      unknownsCount: 0,
    };
  }

  async stopAnalysis(sessionId: string): Promise<AnalysisSession> {
    await fetch(`${BACKEND_URL}/api/v1/analyze/${sessionId}/cancel`, {
      method: 'POST',
    }).catch(() => {});

    return {
      id: sessionId,
      sourceId: 'src',
      sourceName: 'Source',
      status: 'COMPLETED',
      startTime: new Date().toISOString(),
      currentFrame: 0,
      totalFrames: 100,
      fps: 0,
      inferenceLatencyMs: 0,
      model: 'Ultralytics YOLO (Live Backend)',
      objectsDetectedCount: 0,
      violationsCount: 0,
      unknownsCount: 0,
    };
  }

  connectAnalysisWebSocket(
    analysisId: string,
    onMessage: (data: any) => void,
    onError?: (error: any) => void,
    onClose?: () => void
  ): WebSocket {
    if (!WS_BASE_URL) {
      const err = new Error('Cannot connect analysis WebSocket: VITE_BACKEND_URL is not configured.');
      if (onError) onError(err);
      throw err;
    }
    const wsUrl = `${WS_BASE_URL}/ws/analysis/${analysisId}`;
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        onMessage(parsed);
      } catch (e) {
        console.error('Failed to parse analysis WebSocket message:', e);
      }
    };

    if (onError) ws.onerror = onError;
    if (onClose) ws.onclose = onClose;

    return ws;
  }

  async getAnalysisResults(analysisId: string): Promise<any[]> {
    const res = await fetch(`${BACKEND_URL}/api/v1/analyze/${analysisId}/results`);
    if (!res.ok) return [];
    return res.json();
  }

  async getAnalysisTracks(analysisId: string): Promise<any[]> {
    const res = await fetch(`${BACKEND_URL}/api/v1/analyze/${analysisId}/tracks`);
    if (!res.ok) return [];
    return res.json();
  }

  // Zones & Violations (backend REST synchronized)
  async getZones(): Promise<SecurityZone[]> {
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/zones`);
      if (res.ok) {
        const backendZones: SecurityZone[] = await res.json();
        this.zones = backendZones;
        return backendZones;
      }
    } catch (e) {
      console.warn('Failed to fetch zones from backend, using cached state:', e);
    }
    return [...this.zones];
  }

  async saveZone(zone: SecurityZone): Promise<SecurityZone> {
    try {
      const checkRes = await fetch(`${BACKEND_URL}/api/v1/zones/${zone.id}`);
      let res: Response;
      if (checkRes.ok) {
        res = await fetch(`${BACKEND_URL}/api/v1/zones/${zone.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(zone),
        });
      } else {
        res = await fetch(`${BACKEND_URL}/api/v1/zones`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(zone),
        });
      }
      if (res.ok) {
        const saved = await res.json();
        const idx = this.zones.findIndex(z => z.id === saved.id);
        if (idx >= 0) this.zones[idx] = saved;
        else this.zones.push(saved);
        return saved;
      }
    } catch (e) {
      console.warn('Failed to persist zone to backend, caching locally:', e);
    }
    const index = this.zones.findIndex(z => z.id === zone.id);
    if (index >= 0) {
      this.zones[index] = zone;
    } else {
      this.zones.push(zone);
    }
    return zone;
  }

  async deleteZone(zoneId: string): Promise<boolean> {
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/zones/${zoneId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        this.zones = this.zones.filter(z => z.id !== zoneId);
        return true;
      }
    } catch (e) {
      console.warn('Failed to delete zone on backend:', e);
    }
    this.zones = this.zones.filter(z => z.id !== zoneId);
    return true;
  }

  async toggleZoneEnabled(zoneId: string, enabled: boolean): Promise<SecurityZone | null> {
    const action = enabled ? 'enable' : 'disable';
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/zones/${zoneId}/${action}`, {
        method: 'POST',
      });
      if (res.ok) {
        const updated = await res.json();
        const idx = this.zones.findIndex(z => z.id === zoneId);
        if (idx >= 0) this.zones[idx] = updated;
        return updated;
      }
    } catch (e) {
      console.warn(`Failed to ${action} zone on backend:`, e);
    }
    const target = this.zones.find(z => z.id === zoneId);
    if (target) {
      target.enabled = enabled;
      return target;
    }
    return null;
  }

  async getViolations(): Promise<ZoneViolation[]> {
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/violations`);
      if (res.ok) {
        const backendViolations = await res.json();
        this.violations = backendViolations;
        return backendViolations;
      }
    } catch (e) {
      console.warn('Failed to fetch violations from backend:', e);
    }
    return [...this.violations];
  }

  async acknowledgeViolation(violationId: string): Promise<boolean> {
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/violations/${violationId}/acknowledge`, {
        method: 'POST',
      });
      if (res.ok) {
        const v = this.violations.find(viol => viol.id === violationId);
        if (v) v.status = 'ACKNOWLEDGED';
        return true;
      }
    } catch (e) {
      console.warn('Failed to acknowledge violation on backend:', e);
    }
    const v = this.violations.find(viol => viol.id === violationId);
    if (v) v.status = 'ACKNOWLEDGED';
    return true;
  }

  // Objects
  async getTrackedObjects(): Promise<TrackedObject[]> {
    return [];
  }

  async getUnknownObjects(analysisId?: string): Promise<UnknownObject[]> {
    const targetId = analysisId || Array.from(this.activeSessions.values())[0];
    if (targetId) {
      try {
        const res = await fetch(`${BACKEND_URL}/api/v1/analyze/${targetId}/unknowns`);
        if (res.ok) return await res.json();
      } catch (e) {
        console.warn('Failed to fetch unknowns from backend:', e);
      }
    }
    return [];
  }

  async updateUnknownObjectStatus(objectId: string, status: any, notes?: string): Promise<boolean> {
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/unknowns/${objectId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, notes }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  // Events
  async getEvents(): Promise<SecurityEvent[]> {
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/events`);
      if (res.ok) {
        const backendEvents: SecurityEvent[] = await res.json();
        this.events = backendEvents;
        return backendEvents;
      }
    } catch (e) {
      console.warn('Failed to fetch events from backend, using local cache:', e);
    }
    return [...this.events];
  }

  async acknowledgeEvent(eventId: string): Promise<boolean> {
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/events/${eventId}/acknowledge`, {
        method: 'POST',
      });
      if (res.ok) {
        const ev = this.events.find(e => e.id === eventId);
        if (ev) ev.acknowledged = true;
        return true;
      }
    } catch (e) {
      console.warn('Failed to acknowledge event on backend:', e);
    }
    const ev = this.events.find(e => e.id === eventId);
    if (ev) ev.acknowledged = true;
    return true;
  }

  // Analytics
  async getSummaryMetrics(): Promise<SurveillanceSummaryMetrics> {
    return {
      ...DEFAULT_SUMMARY_METRICS,
      activeZonesCount: this.zones.filter(z => z.enabled).length,
    };
  }

  async getTimeSeriesMetrics(): Promise<TimeSeriesMetric[]> {
    return [];
  }

  async getClassDistribution(): Promise<ClassDistribution[]> {
    return [];
  }

  async getZoneActivity(): Promise<ZoneActivityMetric[]> {
    return [];
  }

  // System
  async getSystemSettings(): Promise<SystemSettings> {
    return { ...this.settings };
  }

  async updateSystemSettings(settings: Partial<SystemSettings>): Promise<SystemSettings> {
    this.settings = { ...this.settings, ...settings };
    return { ...this.settings };
  }

  async getModelConfig(): Promise<SystemModelConfig> {
    try {
      const health = await this.getBackendHealth();
      return {
        name: health.model.model_name,
        version: health.model.model_version,
        weights: `${health.model.model_name} (PyTorch)`,
        inputResolution: "640x640 (RGB)",
        backend: health.device.cuda_available ? "PyTorch / CUDA" : "PyTorch / CPU",
        tracker: "ByteTrack",
        status: "ACTIVE",
      };
    } catch {
      return {
        name: "YOLOv8-Offline",
        version: "v8.3",
        weights: "yolov8n.pt",
        inputResolution: "640x640",
        backend: "PyTorch / CPU",
        tracker: "ByteTrack",
        status: "DEMO",
      };
    }
  }
}

export const realSurveillanceApi = new RealSurveillanceApi();
