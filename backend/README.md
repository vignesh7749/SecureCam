# SECURECAM // Computer Vision & Deep Learning Backend (Stage 2)

The **SECURECAM Backend** is a high-performance computer-vision microservice built with **FastAPI**, **PyTorch**, **OpenCV**, and **Ultralytics YOLO**.

---

## 🏗️ Architecture

```
backend/
├── app/
│   ├── main.py                  # FastAPI app with lifespan, CORS, and routing
│   ├── config.py                # Environment configuration & thresholds
│   ├── api/
│   │   ├── routes_health.py     # GET /api/v1/health (runtime telemetry)
│   │   ├── routes_video.py      # POST /upload, GET /stream
│   │   └── routes_detection.py  # POST /analyze, GET /status, WS /ws/analysis/{id}
│   ├── core/
│   │   ├── model_manager.py     # Singleton YOLO caching & device detection
│   │   └── device.py            # CUDA vs CPU fallback engine
│   ├── video/
│   │   ├── reader.py            # Sequential frame generator (low memory)
│   │   ├── processor.py         # Step processor with FPS throughput telemetry
│   │   └── metadata.py          # OpenCV video container inspection
│   ├── detection/
│   │   ├── detector.py          # Ultralytics YOLO inference wrapper
│   │   ├── schemas.py           # Strongly typed Pydantic detection schemas
│   │   └── postprocess.py       # Box coordinate normalization (0-100%)
│   └── services/
│       └── analysis_service.py  # Background session manager & WebSocket broadcaster
│
├── tests/
│   ├── test_backend.py          # Core unit tests (device, model, reader, metadata)
│   └── test_api_endpoints.py    # TestClient integration tests (upload, analyze, status)
├── uploads/                     # Storage for uploaded surveillance video files
├── models/                      # Weights storage (yolov8n.pt, custom weights)
├── requirements.txt
└── README.md
```

---

## 🚀 Running the Backend

### 1. Install Dependencies
```bash
pip install -r requirements.txt
```

### 2. Start FastAPI Server
```bash
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
The interactive Swagger API documentation will be available at:
`http://localhost:8000/docs`

---

## 📡 API Endpoints

### 1. Health & System Telemetry
- `GET /api/v1/health`: Returns active model name, version, compute device (`cpu` / `cuda`), and memory usage.

### 2. Video Management
- `POST /api/v1/video/upload`: Accepts video upload, validates file type, assigns UUID storage ID, extracts real OpenCV metadata (`width`, `height`, `fps`, `duration`, `codec`), and returns metadata response.
- `GET /api/v1/video/{video_id}/stream`: Streams video file directly for HTML5 `<video>` playback.

### 3. Object Detection & Video Analysis
- `POST /api/v1/analyze/{video_id}`: Initiates asynchronous video processing. Returns `{ "analysisId": "...", "status": "queued" }`.
- `GET /api/v1/analyze/{analysis_id}`: Polls processing status, progress percentage, current frame, FPS, and detection counts.
- `GET /api/v1/analyze/{analysis_id}/results`: Returns evaluated frame detections.
- `POST /api/v1/analyze/{analysis_id}/cancel`: Cancels an active or queued background analysis.
- `POST /api/v1/detect/frame`: Executes single-frame YOLO inference on an uploaded image.

### 4. Real-time Streaming WebSocket
- `WS /ws/analysis/{analysis_id}`: Streams real-time progress and per-frame detections:
  ```json
  {
    "type": "detections",
    "frame": 18,
    "timestamp": 1.2,
    "fps": 58.4,
    "detections": [
      {
        "id": "det_18_0_1234",
        "className": "person",
        "confidence": 0.866,
        "box": { "x": 5.99, "y": 36.9, "width": 24.3, "height": 46.68 }
      }
    ]
  }
  ```

---

## 🧪 Running Automated Tests

```bash
python -m pytest tests/ -v -p no:cacheprovider
```
All 11 tests execute in ~6s verifying hardware detection, model loading, OpenCV metadata extraction, YOLO inference, and API routes.
