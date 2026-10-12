import { SecurityZone, ZoneViolation } from '../types/zone';
import { TrackedObject, UnknownObject } from '../types/detection';
import { SecurityEvent } from '../types/event';
import { SampleVideo, VideoMetadata, VideoSource, AnalysisSession } from '../types/video';
import { SurveillanceSummaryMetrics, TimeSeriesMetric, ClassDistribution, ZoneActivityMetric } from '../types/analytics';
import { SystemSettings, SystemModelConfig } from '../types/system';
import { 
  INITIAL_ZONES, 
  INITIAL_TRACKED_OBJECTS, 
  INITIAL_UNKNOWN_OBJECTS, 
  INITIAL_EVENTS, 
  INITIAL_ZONE_VIOLATIONS, 
  ANALYTICS_TIME_SERIES, 
  CLASS_DISTRIBUTION_DATA, 
  ZONE_ACTIVITY_DATA, 
  DEFAULT_SUMMARY_METRICS,
  DEFAULT_SYSTEM_SETTINGS,
  DEFAULT_MODEL_CONFIG,
  LIVE_CAMERAS
} from './mockData';
import { BACKEND_URL } from './apiConfig';

/**
 * Platform API interface.
 * When real FastAPI / PyTorch / YOLO backend is deployed, an implementation
 * of this interface calling REST / WebSocket endpoints will replace MockSurveillanceApi.
 */
export interface ISurveillanceApi {
  // Video & Sources
  getSampleVideos(): Promise<SampleVideo[]>;
  getUploadedVideos(): Promise<SampleVideo[]>;
  getVideoSources(): Promise<VideoSource[]>;
  uploadVideoFile(file: File): Promise<{ source: VideoSource; metadata: VideoMetadata }>;
  
  // Analysis Session
  startAnalysis(sourceId: string, profile?: string, conf?: number, imgsz?: number, force?: boolean): Promise<AnalysisSession>;
  pauseAnalysis(sessionId: string): Promise<AnalysisSession>;
  stopAnalysis(sessionId: string): Promise<AnalysisSession>;
  getLatestVideoAnalysis?(videoId: string): Promise<any>;
  getAnalysisStatus?(analysisId: string): Promise<any>;
  
  // Emergency Zones
  getZones(): Promise<SecurityZone[]>;
  saveZone(zone: SecurityZone): Promise<SecurityZone>;
  deleteZone(zoneId: string): Promise<boolean>;
  getViolations(): Promise<ZoneViolation[]>;
  acknowledgeViolation(violationId: string): Promise<boolean>;
  
  // Tracked Objects & Unknown Objects
  getTrackedObjects(): Promise<TrackedObject[]>;
  getUnknownObjects(): Promise<UnknownObject[]>;
  updateUnknownObjectStatus(objectId: string, status: UnknownObject['investigationStatus']): Promise<boolean>;
  
  // Security Events
  getEvents(): Promise<SecurityEvent[]>;
  acknowledgeEvent(eventId: string): Promise<boolean>;
  
  // Analytics & Metrics
  getSummaryMetrics(): Promise<SurveillanceSummaryMetrics>;
  getTimeSeriesMetrics(): Promise<TimeSeriesMetric[]>;
  getClassDistribution(): Promise<ClassDistribution[]>;
  getZoneActivity(): Promise<ZoneActivityMetric[]>;
  
  // System Configuration
  getSystemSettings(): Promise<SystemSettings>;
  updateSystemSettings(settings: Partial<SystemSettings>): Promise<SystemSettings>;
  getModelConfig(): Promise<SystemModelConfig>;
}

/**
 * Mock & Demo Provider implementing ISurveillanceApi.
 * All state mutations are maintained in-memory for realistic interactive UI testing.
 * Clearly marked as Demo Provider.
 */
class MockSurveillanceApi implements ISurveillanceApi {
  private zones: SecurityZone[] = [...INITIAL_ZONES];
  private trackedObjects: TrackedObject[] = [...INITIAL_TRACKED_OBJECTS];
  private unknownObjects: UnknownObject[] = [...INITIAL_UNKNOWN_OBJECTS];
  private events: SecurityEvent[] = [...INITIAL_EVENTS];
  private violations: ZoneViolation[] = [...INITIAL_ZONE_VIOLATIONS];
  private settings: SystemSettings = { ...DEFAULT_SYSTEM_SETTINGS };

  async getSampleVideos(): Promise<SampleVideo[]> {
    if (!BACKEND_URL) return [];
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/video/samples`);
      if (res.ok) {
        const data = await res.json();
        return data.map((item: any) => ({
          id: item.id,
          title: item.displayName || item.filename,
          category: 'Surveillance Video',
          duration: item.durationFormatted || '00:00',
          durationSeconds: item.duration || 0,
          resolution: item.resolution || `${item.width}x${item.height}`,
          description: `${item.filename}`,
          difficulty: 'Standard',
          thumbnailUrl: '',
          sourceUrl: `${BACKEND_URL}/api/v1/video/${item.id}/stream`,
          streamUrl: `${BACKEND_URL}/api/v1/video/${item.id}/stream`,
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
        }));
      }
    } catch {
      // Backend offline
    }
    return [];
  }

  async getUploadedVideos(): Promise<SampleVideo[]> {
    if (!BACKEND_URL) return [];
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/video/uploads`);
      if (res.ok) {
        const data = await res.json();
        return data.map((item: any) => ({
          id: item.id,
          title: item.displayName || item.filename,
          category: 'Uploaded Video',
          duration: item.durationFormatted || '00:00',
          durationSeconds: item.duration || 0,
          resolution: item.resolution || `${item.width}x${item.height}`,
          description: `${item.filename}`,
          difficulty: 'Standard',
          thumbnailUrl: '',
          sourceUrl: `${BACKEND_URL}/api/v1/video/${item.id}/stream`,
          streamUrl: `${BACKEND_URL}/api/v1/video/${item.id}/stream`,
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
        }));
      }
    } catch {
      // Backend offline
    }
    return [];
  }

  async getVideoSources(): Promise<VideoSource[]> {
    return [...LIVE_CAMERAS];
  }

  async uploadVideoFile(file: File): Promise<{ source: VideoSource; metadata: VideoMetadata }> {
    // Realistic simulation of uploaded video metadata extraction
    const mockMetadata: VideoMetadata = {
      filename: file.name,
      durationSeconds: 180,
      width: 1920,
      height: 1080,
      fps: 30,
      codec: 'H.264 / AVC',
      filesizeBytes: file.size,
      bitrateKbps: Math.round((file.size * 8) / (180 * 1024)),
    };

    const newSource: VideoSource = {
      id: `upload-${Date.now()}`,
      name: file.name,
      type: 'upload',
      uri: URL.createObjectURL(file),
      status: 'ONLINE',
      location: 'Local Upload Workspace',
      resolution: `${mockMetadata.width}x${mockMetadata.height}`,
      fps: mockMetadata.fps,
      metadata: mockMetadata,
    };

    return { source: newSource, metadata: mockMetadata };
  }

  async startAnalysis(sourceId: string, profile?: string, conf?: number, imgsz?: number, force?: boolean): Promise<AnalysisSession> {
    return {
      id: `session-${Date.now()}`,
      sourceId,
      sourceName: sourceId,
      status: 'ANALYZING',
      startTime: new Date().toISOString(),
      currentFrame: 148,
      totalFrames: 9000,
      fps: 59.4,
      inferenceLatencyMs: 14.8,
      model: `YOLOv8 (${profile || 'BALANCED'})`,
      objectsDetectedCount: 5,
      violationsCount: 2,
      unknownsCount: 2,
    };
  }

  async getLatestVideoAnalysis(videoId: string): Promise<any> {
    if (!BACKEND_URL) return null;
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/analyze/video/${videoId}/latest`);
      if (res.ok) return res.json();
    } catch {}
    return null;
  }

  async getAnalysisStatus(_sessionId: string): Promise<any> {
    return {
      status: 'completed',
      progress: 100,
      fps: 30,
      processedFrames: 100,
      totalFrames: 100,
    };
  }

  async pauseAnalysis(sessionId: string): Promise<AnalysisSession> {
    return {
      id: sessionId,
      sourceId: 'src-current',
      sourceName: 'Current Source',
      status: 'PAUSED',
      startTime: new Date().toISOString(),
      currentFrame: 148,
      totalFrames: 9000,
      fps: 0,
      inferenceLatencyMs: 0,
      model: 'YOLOv11x-Custom-Surveillance',
      objectsDetectedCount: 5,
      violationsCount: 2,
      unknownsCount: 2,
    };
  }

  async stopAnalysis(sessionId: string): Promise<AnalysisSession> {
    return {
      id: sessionId,
      sourceId: 'src-current',
      sourceName: 'Current Source',
      status: 'COMPLETED',
      startTime: new Date().toISOString(),
      currentFrame: 9000,
      totalFrames: 9000,
      fps: 0,
      inferenceLatencyMs: 0,
      model: 'YOLOv11x-Custom-Surveillance',
      objectsDetectedCount: 5,
      violationsCount: 2,
      unknownsCount: 2,
    };
  }

  async getZones(): Promise<SecurityZone[]> {
    return [...this.zones];
  }

  async saveZone(zone: SecurityZone): Promise<SecurityZone> {
    const index = this.zones.findIndex(z => z.id === zone.id);
    if (index >= 0) {
      this.zones[index] = zone;
    } else {
      this.zones.push(zone);
    }
    return zone;
  }

  async deleteZone(zoneId: string): Promise<boolean> {
    this.zones = this.zones.filter(z => z.id !== zoneId);
    return true;
  }

  async getViolations(): Promise<ZoneViolation[]> {
    return [...this.violations];
  }

  async acknowledgeViolation(violationId: string): Promise<boolean> {
    const v = this.violations.find(viol => viol.id === violationId);
    if (v) v.status = 'ACKNOWLEDGED';
    return true;
  }

  async getTrackedObjects(): Promise<TrackedObject[]> {
    return [...this.trackedObjects];
  }

  async getUnknownObjects(): Promise<UnknownObject[]> {
    return [...this.unknownObjects];
  }

  async updateUnknownObjectStatus(objectId: string, status: UnknownObject['investigationStatus']): Promise<boolean> {
    const obj = this.unknownObjects.find(u => u.id === objectId);
    if (obj) {
      obj.investigationStatus = status;
      return true;
    }
    return false;
  }

  async getEvents(): Promise<SecurityEvent[]> {
    return [...this.events];
  }

  async acknowledgeEvent(eventId: string): Promise<boolean> {
    const ev = this.events.find(e => e.id === eventId);
    if (ev) {
      ev.acknowledged = true;
      return true;
    }
    return false;
  }

  async getSummaryMetrics(): Promise<SurveillanceSummaryMetrics> {
    return {
      ...DEFAULT_SUMMARY_METRICS,
      activeZonesCount: this.zones.filter(z => z.enabled).length,
      zoneViolationsCount: this.violations.filter(v => v.status === 'ACTIVE').length,
    };
  }

  async getTimeSeriesMetrics(): Promise<TimeSeriesMetric[]> {
    return [...ANALYTICS_TIME_SERIES];
  }

  async getClassDistribution(): Promise<ClassDistribution[]> {
    return [...CLASS_DISTRIBUTION_DATA];
  }

  async getZoneActivity(): Promise<ZoneActivityMetric[]> {
    return [...ZONE_ACTIVITY_DATA];
  }

  async getSystemSettings(): Promise<SystemSettings> {
    return { ...this.settings };
  }

  async updateSystemSettings(settings: Partial<SystemSettings>): Promise<SystemSettings> {
    this.settings = { ...this.settings, ...settings };
    return { ...this.settings };
  }

  async getModelConfig(): Promise<SystemModelConfig> {
    return { ...DEFAULT_MODEL_CONFIG };
  }
}

export const mockSurveillanceApi = new MockSurveillanceApi();

import { RealSurveillanceApi } from './realApi';
export const realSurveillanceApi = new RealSurveillanceApi();

export type ApiMode = 'DEMO' | 'LIVE_AI';

let currentMode: ApiMode = 'LIVE_AI';

export const getApiMode = (): ApiMode => currentMode;
export const setApiMode = (mode: ApiMode) => {
  currentMode = mode;
};

// Delegating proxy that directs calls to currentMode provider
export const surveillanceApi: ISurveillanceApi = new Proxy({} as ISurveillanceApi, {
  get(_target, prop) {
    const activeProvider = currentMode === 'LIVE_AI' ? realSurveillanceApi : mockSurveillanceApi;
    const value = (activeProvider as any)[prop];
    if (typeof value === 'function') {
      return value.bind(activeProvider);
    }
    return value;
  }
});
