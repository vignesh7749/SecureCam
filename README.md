# SECURECAM // Intelligent AI Surveillance & Threat Intelligence Platform

**SECURECAM** is an intelligent video surveillance platform engineered for modern Security Operations Centers (SOC). It detects and tracks objects in surveillance streams, identifies unfamiliar/novel objects using anomaly embeddings, monitors configurable emergency zones, detects prolonged dwell/loitering violations, raises critical alarms, records security events, and generates comprehensive surveillance analytics and intelligence briefs.

---

## 🚀 Stage 1: Premium Frontend & Architecture Foundation

This stage implements the professional commercial-grade user interface and scalable frontend architecture. 

### Key Highlights
- **Command Center Dashboard**: Live telemetry, active video source HUD, real-time metrics (Total Objects, Known Objects, Unknown Novelties, Active Events, Zone Violations), and recent events audit log.
- **Surveillance Viewer**: Central tactical viewer with HUD metrics (FPS, FRAME, TIMESTAMP, MODEL, SOURCE), technical bounding boxes (`PERSON #07 96.8%`, `CAR #03 94.1%`, `UNKNOWN #12 74.2%`), movement trails, and reticles.
- **Interactive Emergency Zone Drawing**: First-class security zone engine allowing operators to click `+ DRAW ZONE` and draw **rectangular** or **polygon** zones directly on the video canvas, set loitering dwell thresholds (e.g., 10 seconds), configure monitored classes, and trigger automated `🚨 ZONE VIOLATION` alerts.
- **Dedicated Unknown Objects Intelligence**: Anomaly panel displaying Novelty Score (e.g. 91%), Persistence (98%), Frames Observed (759), investigation status lifecycle (`INVESTIGATE`, `FLAGGED`, `RESOLVED`, `DISMISSED`), and feature signature embeddings.
- **Video Analysis Workspace**: Drag-and-drop video ingest with container probe metadata (resolution, frame rate, duration, file size, codec), analysis playback controls (Start, Pause, Stop, Replay), and benchmark sample video library across 7 surveillance scenarios.
- **Tactical Live Monitor**: Multi-camera grid (1x1, 2x2, 3x3) prepared for future RTSP / IP Camera / CCTV streams.
- **Surveillance Analytics**: Recharts visualizations for target temporal density, class distribution, perimeter breach frequency, and inference FPS/latency stability.
- **Reports & Export Generator**: Tactical intelligence briefs with export simulation for PDF Dossiers, JSON Telemetry, and CSV Audit Logs.
- **System Settings Panel**: Hyperparameter tuning for detection confidence, novelty thresholds, tracking association, and hardware acceleration options.

---

## 📁 Scalable Directory Architecture

```
src/
├── types/
│   ├── detection.ts        # ObjectDetection, TrackedObject, UnknownObject interfaces
│   ├── zone.ts             # SecurityZone, ZonePoint, ZoneViolation, ZoneStatus
│   ├── event.ts            # SecurityEvent, EventSeverity, EventType
│   ├── video.ts            # VideoSource, SampleVideo, AnalysisSession, VideoMetadata
│   ├── analytics.ts        # SurveillanceMetrics, TimeSeriesMetric, ClassDistribution
│   └── system.ts           # SystemSettings, SystemModelConfig
├── services/
│   ├── api.ts              # ISurveillanceApi contract + MockSurveillanceApi demo provider
│   ├── mockData.ts         # Realistic SOC datasets, sample video library, test scenarios
│   └── zoneService.ts      # Ray-casting point-in-polygon & loitering threshold algorithms
├── hooks/
│   └── useClock.ts         # High-precision UTC & Local SOC clock
├── context/
│   └── SurveillanceContext.tsx  # Global surveillance state, playback loop, zone engine
├── components/
│   ├── common/             # Badge, Button, StatCard, TacticalModal
│   ├── layout/             # Header, Navigation, MainLayout
│   ├── surveillance/       # SurveillanceViewer, BoundingBoxOverlay, ZoneOverlay, ZoneEditorCanvas, VideoControls
│   ├── zones/              # ZoneList, ZoneConfigModal, ZoneViolationBanner
│   ├── objects/            # ObjectTable, UnknownObjectCard, ObjectInspectorModal
│   ├── events/             # EventTimeline
│   ├── videoAnalysis/      # VideoUploader, SampleVideoLibrary, VideoMetadataCard
│   ├── liveMonitor/        # MultiCameraMatrix
│   ├── analytics/          # SurveillanceCharts (Recharts)
│   ├── reports/            # ReportGenerator
│   └── system/             # SystemSettingsPanel
├── pages/
│   ├── CommandCenterPage.tsx
│   ├── VideoAnalysisPage.tsx
│   ├── LiveMonitorPage.tsx
│   ├── ObjectIntelligencePage.tsx
│   ├── EventsPage.tsx
│   ├── AnalyticsPage.tsx
│   ├── ReportsPage.tsx
│   └── SystemPage.tsx
├── App.tsx
└── main.tsx
```

---

## 🔌 Stage 2 Integration Plan (FastAPI + YOLO + PyTorch)

The frontend is strictly decoupled via `ISurveillanceApi` in `src/services/api.ts`:
1. Implement `RealSurveillanceApi` extending `ISurveillanceApi`.
2. Connect to FastAPI backend endpoints:
   - `POST /api/v1/detect` (Ultralytics YOLO inference)
   - `WS /api/v1/stream` (Live WebSocket stream with ByteTrack bounding boxes & dwell times)
   - `POST /api/v1/zones` (Store and query polygon zone coordinates)
   - `POST /api/v1/unknowns` (Extract feature vectors for novelty scoring)
3. Zero frontend component rewrites required.
