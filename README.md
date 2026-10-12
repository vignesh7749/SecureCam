# SECURECAM // AI Surveillance Intelligence Platform

[![Vercel Deployment](https://img.shields.io/badge/Vercel-Live%20Demo-emerald?style=for-the-badge&logo=vercel)](https://secure-cam-kappa.vercel.app)
[![GitHub Repository](https://img.shields.io/badge/GitHub-Repository-blue?style=for-the-badge&logo=github)](https://github.com/vignesh7749/SecureCam)
[![Python FastAPI](https://img.shields.io/badge/Backend-FastAPI%200.115+-009688?style=for-the-badge&logo=fastapi)](backend/)
[![React TypeScript](https://img.shields.io/badge/Frontend-React%2018%20%2B%20Vite-61DAFB?style=for-the-badge&logo=react)](src/)
[![YOLOv8 ByteTrack](https://img.shields.io/badge/CV-YOLOv8%20%2B%20ByteTrack-orange?style=for-the-badge)](backend/app/)

**SECURECAM** is an intelligent video surveillance platform engineered for modern Security Operations Centers (SOC). It provides real-time and post-capture computer vision analytics: multi-object detection via **Ultralytics YOLOv8**, persistent multi-object tracking via **ByteTrack**, novelty and unfamiliar entity discovery via **DINOv2** visual embeddings, user-defined **Emergency Zones** with ray-casting point-in-polygon verification, and automated dwell-time intrusion alarms.

---

## 🌐 Live Web Demo

**Live Frontend URL:** [https://secure-cam-kappa.vercel.app](https://secure-cam-kappa.vercel.app)

The frontend is deployed as a static web application on Vercel. Because the Python/PyTorch computer vision backend is not hosted on cloud infrastructure at this stage, the web application runs in an honest, transparent **Demo Mode**.

### 🌟 What Works in Demo Mode (Static Vercel Deployment)
- **Authentic Precomputed Benchmark Replay:** Replays real, verified YOLOv8 + ByteTrack detections frame-by-frame on approved benchmark videos (`Testing_1.mp4`, `College_Testing_File.mp4`).
- **Zero Fake Detections:** The application never generates random synthetic boxes or claims in-browser inference. It displays raw video playback or authentic benchmark results.
- **HTML5 Surveillance Video Player:** Play, pause, step frame, seek, scrub timeline, and adjust playback speed (0.5x, 1x, 2x).
- **Interactive Emergency Zones Canvas:** Draw rectangular or polygonal security zones directly onto the video canvas and test dwell thresholds in-memory.
- **Trajectory Trails & Real-Time HUD:** Dynamic tracking IDs, velocity vectors, class tags, confidence scores, and bounding boxes.
- **Auditable Security Alerts & Events:** Real-time alarm siren chime, event popovers, and severity categorization.
- **Surveillance Reports & Metrics:** Target density charts, class breakdown, dwell analytics, and report export simulation.
- **Mobile-First Responsive Interface:** Full touch support, bottom navigation on mobile, safe-area insets, and dark/light theme switching.
- **First-Time Tutorial Walkthrough:** Built-in modal guide walking users through key SOC features.

### ⚙️ What Requires the Local FastAPI Backend
- **Live Camera Streaming:** Ingesting browser webcam or external USB camera frames via binary WebSockets with real-time inference.
- **Custom Video File Ingest:** Uploading new MP4/AVI/MKV files and running on-demand frame extraction.
- **Live YOLOv8 Inference:** Running live object detection models locally on CPU or CUDA GPU.
- **Live ByteTrack Association:** Calculating Kalman filter tracking and bounding box association in real time.
- **DINOv2 Novelty Analysis:** Extracting deep visual embeddings to detect unfamiliar or novel entities against a reference gallery.
- **Persistent Zone Storage:** Saving custom security zones permanently to `backend/app/zones/zones_store.json`.

---

## 🏗️ Architecture & Technology Stack

```
┌─────────────────────────────────────────────────────────────────┐
│                     SECURECAM ARCHITECTURE                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Frontend (React 18 + TypeScript + Vite + Tailwind CSS)        │
│   ├── Video Viewport & Tactical HUD Overlay                     │
│   ├── Zone Canvas (Ray-casting Point-in-Polygon Engine)        │
│   ├── Surveillance Context & Frame Sync Dispatcher              │
│   ├── WebSocket / REST API Client (ISurveillanceApi)            │
│   └── Mobile-Optimized Responsive Views & Audio Alarms          │
│                                │                                │
│                     HTTP / WebSocket (JSON & Binary)            │
│                                ▼                                │
│   Backend (Python 3.10+ / FastAPI / Uvicorn)                   │
│   ├── Video Processing Engine (OpenCV / PyAV)                   │
│   ├── Object Detection: Ultralytics YOLOv8                      │
│   ├── Object Tracking: ByteTrack (Persistent Kalman IDs)        │
│   ├── Novelty & Anomaly: DINOv2 Deep Visual Embeddings          │
│   ├── Emergency Zones Service & Loitering Dwell Evaluator       │
│   └── WebSocket Real-Time Ingest Pipeline (/ws/live-feed)       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Running SecureCam Locally

To experience the full capabilities of SecureCam—including live webcam streaming, custom video uploads, and real-time YOLOv8 + ByteTrack inference—run both the backend and frontend locally.

### Prerequisites
- **Node.js** 18+ and **npm**
- **Python** 3.10+ and **pip**
- (Optional) NVIDIA GPU with CUDA support for accelerated PyTorch inference

---

### Step 1: Start the FastAPI Backend

1. Navigate to the `backend/` directory:
   ```bash
   cd backend
   ```

2. Create and activate a Python virtual environment:
   ```bash
   # Windows (PowerShell):
   python -m venv venv
   .\venv\Scripts\Activate.ps1

   # Linux / macOS:
   python3 -m venv venv
   source venv/bin/activate
   ```

3. Install backend dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Run the automated backend test suite to verify the installation:
   ```bash
   python -m pytest tests/ -v
   ```

5. Start the backend server:
   ```bash
   python run_backend.py
   # Or using uvicorn directly:
   python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
   ```
   The backend API will be available at `http://localhost:8000`. Swagger documentation is accessible at `http://localhost:8000/docs`.

---

### Step 2: Start the React Frontend

1. In a separate terminal, navigate to the project root:
   ```bash
   cd ..
   ```

2. Install frontend dependencies:
   ```bash
   npm install
   ```

3. Create a local environment configuration file:
   ```bash
   # Create .env.local in the root directory:
   echo VITE_BACKEND_URL=http://localhost:8000 > .env.local
   ```

4. Run the production build check:
   ```bash
   npm run build
   ```

5. Start the Vite development server:
   ```bash
   npm run dev
   ```

6. Open your browser and navigate to:
   ```
   http://localhost:5173
   ```
   The header status indicator will turn green: **Backend: Connected**. All live inference, webcam streaming, and custom video upload capabilities are now active.

---

## 📹 Sample Videos & Benchmark Data

SecureCam includes authentic surveillance benchmark recordings in `public/samples/`:

| File | Size | Scenario | Detections & Tracks |
| :--- | :--- | :--- | :--- |
| `Testing_1.mp4` | 11.69 MB | Multi-target traffic & pedestrian corridor | 1,191 detections, 28 unique tracks |
| `College_Testing_File.mp4` | 4.72 MB | Campus security perimeter & walkway | 32 detections, 32 unique tracks |

Precomputed ground-truth session files (`sample_testing_1_session.json` and `sample_college_testing_file_session.json`) are bundled in `public/samples/` to enable immediate zero-latency replay in Demo Mode.

---

## 🛡️ Security & Privacy Notice
- SecureCam processes video frames locally on the operator's machine or on dedicated edge servers.
- No video feeds, biometric signatures, or surveillance data are transmitted to external third-party services.
- Web browser camera streaming utilizes standard HTML5 `getUserMedia` APIs restricted to secure contexts (`https://` or `localhost`).

---

## 📄 License
This project is developed for educational, academic, and research purposes.
