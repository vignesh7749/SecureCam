import logging
import time
import base64
import json
from typing import Dict, Any, List, Optional
import cv2
import numpy as np
from pydantic import BaseModel, Field
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException, UploadFile, File, Query, status

from app.config import settings
from app.services.live_service import live_service, LiveFeedSession
from app.detection.schemas import (
    AnalysisInitResponse, 
    AnalysisProgressResponse,
    FrameDetections,
    Detection
)
from app.tracking.schemas import FrameTracks, BenchmarkResult
from app.tracking.tracker import ByteTrackManager
from app.video.processor import VideoStreamProcessor
from app.services.analysis_service import analysis_service
from app.detection.detector import detector, ObjectDetector
from app.core.device import get_compute_device
from app.novelty.schemas import UnknownObject, CalibrationResult
from app.novelty.reference_memory import KnownObjectReferenceMemory
from app.novelty.embedding_engine import NoveltyEmbeddingEngine
from app.novelty.calibration import calibrate_novelty_threshold

logger = logging.getLogger("securecam.routes_detection")

router = APIRouter(tags=["Object Detection & Multi-Object Tracking"])

class BenchmarkRequest(BaseModel):
    videoId: str = Field(..., description="Target video ID or sample identifier")
    modelName: str = Field(default="yolov8n.pt", description="YOLO model checkpoint name")
    imgSize: int = Field(default=640, description="Input inference resolution (640, 960, 1280)")
    confThreshold: float = Field(default=0.35, description="Confidence score threshold (0.10 to 0.90)")

class UpdateUnknownStatusRequest(BaseModel):
    status: str = Field(..., description="Investigation status: INVESTIGATE, FLAGGED, RESOLVED, DISMISSED")
    notes: Optional[str] = Field(default=None, description="Operator notes")
    analysisId: Optional[str] = Field(default=None, description="Optional analysis ID context")

class CalibrateRequest(BaseModel):
    threshold: float = Field(default=65.0, description="Novelty score threshold to evaluate")

@router.post("/analyze/{video_id}", response_model=AnalysisInitResponse)
async def start_video_analysis(
    video_id: str,
    profile: Optional[str] = Query(default="BALANCED", description="Detection profile: BALANCED, PRECISION, PERFORMANCE"),
    conf: Optional[float] = Query(default=None, description="Optional custom confidence threshold"),
    imgsz: Optional[int] = Query(default=None, description="Optional custom inference resolution"),
    force: Optional[bool] = Query(default=False, description="Force restart analysis even if already completed")
):
    """
    Spawns background video frame extraction, YOLO object detection,
    and ByteTrack multi-object tracking with persistent IDs and trajectories.
    """
    video_path = analysis_service.get_video_path(video_id)
    if not video_path or not video_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Video ID '{video_id}' not found. Please upload or register the video first."
        )

    try:
        # Check if completed or processing session already exists for this video
        if not force:
            existing = analysis_service.get_latest_session_for_video(video_id)
            if existing and existing.status in ("completed", "processing"):
                logger.info(f"Re-using existing analysis session {existing.analysis_id} (status: {existing.status}) for video: {video_id}")
                return AnalysisInitResponse(
                    analysisId=existing.analysis_id,
                    videoId=video_id,
                    status=existing.status,
                    message=f"Analysis session already {existing.status}. Results available."
                )
        else:
            cache_file = settings.OUTPUTS_DIR / f"{video_id}_session.json"
            if cache_file.exists():
                try:
                    cache_file.unlink(missing_ok=True)
                except Exception as e:
                    logger.warning(f"Could not unlink stale session cache: {e}")

        session = analysis_service.create_session(
            video_id=video_id,
            profile=profile,
            conf_threshold=conf,
            imgsz=imgsz
        )
        analysis_service.start_background_analysis(session.analysis_id)
        
        logger.info(f"Initialized background analysis session: {session.analysis_id} for video: {video_id} (Profile: {profile}, imgsz: {imgsz}, conf: {conf})")
        return AnalysisInitResponse(
            analysisId=session.analysis_id,
            videoId=video_id,
            status="queued",
            message="Analysis and ByteTrack pipeline initiated. Connect to WebSocket or poll status endpoint."
        )
    except Exception as e:
        logger.error(f"Failed to initiate analysis session: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to start video analysis pipeline: {str(e)}"
        )

@router.get("/analyze/video/{video_id}/latest")
async def get_latest_video_analysis(video_id: str):
    """
    Returns the latest analysis session and summary for a given video ID.
    Enables instant restoration of previously analyzed results when switching videos.
    """
    session = analysis_service.get_latest_session_for_video(video_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No analysis session found for video '{video_id}'."
        )
    return {
        "analysisId": session.analysis_id,
        "videoId": session.video_id,
        "status": session.status,
        "progress": session.progress,
        "totalFrames": session.total_frames,
        "processedFrames": session.processed_frames,
        "detectionsCount": session.detections_count,
        "uniqueTracksCount": session.unique_tracks_count,
        "unknownsCount": len(session.unknown_objects),
        "error": session.error
    }

@router.get("/analyze/{analysis_id}", response_model=AnalysisProgressResponse)
async def get_analysis_status(analysis_id: str):
    """
    Returns progress, current frame index, processing FPS, and total detections.
    """
    session = analysis_service.get_session(analysis_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Analysis session '{analysis_id}' was not found."
        )
    return session.to_progress_response()

@router.post("/analyze/{analysis_id}/cancel")
async def cancel_analysis(analysis_id: str):
    """
    Cancels an active or queued background analysis session.
    """
    success = analysis_service.cancel_session(analysis_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Active session '{analysis_id}' not found or already terminated."
        )
    return {"analysisId": analysis_id, "status": "cancelled"}

@router.get("/analyze/{analysis_id}/results", response_model=List[FrameDetections])
async def get_analysis_results(analysis_id: str):
    """
    Retrieves evaluated frame detections for an analysis session.
    """
    session = analysis_service.get_session(analysis_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Analysis session '{analysis_id}' was not found."
        )
    return [session.frame_results[idx] for idx in sorted(session.frame_results.keys())]

@router.get("/analyze/{analysis_id}/tracks", response_model=List[FrameTracks])
async def get_analysis_tracks(analysis_id: str):
    """
    Retrieves full ByteTrack tracked objects, trajectories, and latency telemetry for each frame.
    """
    session = analysis_service.get_session(analysis_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Analysis session '{analysis_id}' was not found."
        )
    return [session.track_results[idx] for idx in sorted(session.track_results.keys())]

@router.get("/analyze/{analysis_id}/unknowns", response_model=List[UnknownObject])
async def get_analysis_unknowns(analysis_id: str):
    """
    Retrieves confirmed or candidate unknown objects identified in this analysis session.
    """
    session = analysis_service.get_session(analysis_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Analysis session '{analysis_id}' was not found."
        )
    return analysis_service.get_session_unknowns(analysis_id)

@router.post("/unknowns/{unknown_id}/status", response_model=UnknownObject)
async def update_unknown_status(unknown_id: str, request: UpdateUnknownStatusRequest):
    """
    Updates the operator investigation status (INVESTIGATE, FLAGGED, RESOLVED, DISMISSED) and notes for an unknown object.
    """
    obj = analysis_service.update_unknown_status(
        unknown_id=unknown_id,
        new_status=request.status,
        notes=request.notes,
        analysis_id=request.analysisId
    )
    if not obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Unknown object '{unknown_id}' was not found in active sessions."
        )
    return obj

@router.post("/novelty/calibrate", response_model=CalibrationResult)
async def calibrate_novelty(request: CalibrateRequest):
    """
    Benchmarks reference gallery and calculates empirical false-positive / false-negative novelty rates.
    """
    try:
        ref_mem = KnownObjectReferenceMemory()
        engine = NoveltyEmbeddingEngine()
        
        # Test prototypes with intra-class perturbation
        known_embeddings = []
        for c_name, proto in ref_mem.prototypes.items():
            base_vec = np.array(proto.prototypeVector, dtype=np.float32)
            known_embeddings.append(base_vec)
            # Add slight intra-class variations
            for _ in range(5):
                noise = np.random.normal(0, proto.stdDistance * 0.5, size=base_vec.shape).astype(np.float32)
                perturbed = base_vec + noise
                perturbed /= (np.linalg.norm(perturbed) + 1e-8)
                known_embeddings.append(perturbed)
                
        # Generate synthetic out-of-distribution unit vectors
        synthetic_novel = []
        dim = len(next(iter(ref_mem.prototypes.values())).prototypeVector) if ref_mem.prototypes else 384
        for _ in range(15):
            rand_vec = np.random.randn(dim).astype(np.float32)
            rand_vec /= (np.linalg.norm(rand_vec) + 1e-8)
            synthetic_novel.append(rand_vec)
            
        result = calibrate_novelty_threshold(
            reference_memory=ref_mem,
            embedding_engine=engine,
            known_embeddings=known_embeddings,
            synthetic_novel_embeddings=synthetic_novel,
            threshold=request.threshold
        )
        return result
    except Exception as e:
        logger.error(f"Calibration failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Calibration error: {str(e)}"
        )

@router.post("/benchmark/run", response_model=BenchmarkResult)
async def run_model_benchmark(request: BenchmarkRequest):
    """
    Executes a real precision & latency benchmark on a video dataset.
    Varies model, resolution (640, 960, 1280), and confidence threshold.
    Reports empirical average detection latency, tracking latency, total latency, and throughput FPS.
    """
    video_path = analysis_service.get_video_path(request.videoId)
    if not video_path or not video_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Benchmark video '{request.videoId}' was not found."
        )

    if request.imgSize not in settings.SUPPORTED_IMG_SIZES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported image size {request.imgSize}. Supported: {settings.SUPPORTED_IMG_SIZES}"
        )

    logger.info(
        f"Starting benchmark: video={request.videoId}, model={request.modelName}, "
        f"img_size={request.imgSize}, conf={request.confThreshold}"
    )

    bench_detector = ObjectDetector(
        confidence_threshold=request.confThreshold,
        img_size=request.imgSize
    )
    bench_tracker = ByteTrackManager()
    processor = VideoStreamProcessor(
        video_path=video_path,
        detector=bench_detector,
        tracker=bench_tracker,
        process_every_n_frames=1,
        enable_novelty=False,
        enable_zones=False
    )

    det_latencies: List[float] = []
    track_latencies: List[float] = []
    total_detections = 0
    total_frames = 0
    t_start = time.time()

    def on_frame(ft: FrameTracks):
        nonlocal total_detections, total_frames
        det_latencies.append(ft.detectionLatencyMs)
        track_latencies.append(ft.trackingLatencyMs)
        total_detections += ft.rawDetectionsCount
        total_frames += 1

    processor.process(on_tracks_callback=on_frame)
    elapsed = max(0.001, time.time() - t_start)
    pipeline_fps = round(total_frames / elapsed, 1)

    avg_det = round(float(np.mean(det_latencies)), 2) if det_latencies else 0.0
    avg_trk = round(float(np.mean(track_latencies)), 2) if track_latencies else 0.0
    avg_tot = round(avg_det + avg_trk, 2)

    device_info = str(get_compute_device(settings.DEVICE))

    return BenchmarkResult(
        model=request.modelName,
        imgSize=request.imgSize,
        confThreshold=request.confThreshold,
        device=device_info,
        avgDetectionLatencyMs=avg_det,
        avgTrackingLatencyMs=avg_trk,
        avgTotalLatencyMs=avg_tot,
        pipelineFps=pipeline_fps,
        totalFrames=total_frames,
        totalDetections=total_detections,
        totalTracks=bench_tracker.get_total_tracks_count()
    )

@router.post("/detect/frame", response_model=List[Detection])
async def detect_single_frame(file: UploadFile = File(...)):
    """
    Runs single-frame YOLO inference directly on an uploaded image file.
    """
    contents = await file.read()
    nparr = np.frombuffer(contents, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if img is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not decode image from provided payload."
        )

    detections, _ = detector.detect(frame=img, frame_index=0, timestamp=0.0)
    return detections

@router.websocket("/ws/analysis/{analysis_id}")
async def websocket_analysis_stream(websocket: WebSocket, analysis_id: str):
    """
    WebSocket endpoint streaming real-time progress, ByteTrack tracks, and frame detections to the frontend.
    """
    await websocket.accept()
    session = analysis_service.get_session(analysis_id)

    if not session:
        await websocket.send_json({
            "type": "error",
            "message": f"Session '{analysis_id}' not found."
        })
        await websocket.close()
        return

    session.active_websockets.add(websocket)
    logger.info(f"WebSocket client connected to session stream {analysis_id}.")

    try:
        # Send initial status
        await websocket.send_json({
            "type": "status",
            "status": session.status,
            "progress": session.progress,
            "currentFrame": session.current_frame,
            "totalFrames": session.total_frames,
            "activeTracksCount": session.active_tracks_count,
            "totalTracksCount": session.unique_tracks_count
        })

        # If already completed before this client connected, immediately send completion event
        if session.status == "completed":
            await websocket.send_json({
                "type": "completed",
                "status": "completed",
                "progress": 100.0,
                "totalFrames": session.total_frames,
                "processedFrames": session.processed_frames,
                "totalDetections": session.detections_count,
                "totalTracks": session.unique_tracks_count,
                "fps": session.fps
            })

        # Keep connection open and await any client pings
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        logger.info(f"WebSocket client disconnected from session {analysis_id}.")
    except Exception as e:
        logger.warning(f"WebSocket connection error on session {analysis_id}: {str(e)}")
    finally:
        session.active_websockets.discard(websocket)

@router.websocket("/ws/live-feed")
async def websocket_live_feed(
    websocket: WebSocket,
    session_id: Optional[str] = Query(default=None),
    conf: Optional[float] = Query(default=None),
    imgsz: Optional[int] = Query(default=None)
):
    """
    Real-time Live Camera Ingestion & Computer Vision Pipeline.
    Accepts continuous binary JPEG frames or JSON base64 payloads from user device camera.
    Executes YOLO detection, ByteTrack tracking, DINOv2 novelty evaluation, and Emergency Zone dwell monitoring.
    Immediately streams back structured detection, tracking, dwell times, and violation alerts.
    """
    await websocket.accept()
    session = live_service.create_session(session_id=session_id, conf_threshold=conf, imgsz=imgsz)
    logger.info(f"Live feed WebSocket client connected (Session ID: {session.session_id})")

    # Send initial connection confirmation
    await websocket.send_json({
        "type": "live_connected",
        "sessionId": session.session_id,
        "message": "Live feed pipeline active. Ready for camera frames."
    })

    try:
        while True:
            msg = await websocket.receive()
            if msg["type"] == "websocket.disconnect":
                break

            image_bytes = None
            client_ts = None

            if "bytes" in msg and msg["bytes"]:
                image_bytes = msg["bytes"]
            elif "text" in msg and msg["text"]:
                raw_text = msg["text"].strip()
                if raw_text == "ping":
                    await websocket.send_text("pong")
                    continue
                try:
                    payload = json.loads(raw_text)
                    if payload.get("type") == "ping":
                        await websocket.send_json({"type": "pong"})
                        continue
                    if "image" in payload:
                        img_str = payload["image"]
                        if "," in img_str:
                            img_str = img_str.split(",", 1)[1]
                        image_bytes = base64.b64decode(img_str)
                    client_ts = payload.get("timestamp")
                except Exception:
                    # Try direct base64 decode if not JSON
                    try:
                        if "," in raw_text:
                            raw_text = raw_text.split(",", 1)[1]
                        image_bytes = base64.b64decode(raw_text)
                    except Exception:
                        await websocket.send_json({"type": "error", "message": "Invalid frame encoding."})
                        continue

            if not image_bytes:
                continue

            try:
                result = session.process_frame(image_bytes=image_bytes, client_timestamp=client_ts)
                await websocket.send_json(result)
            except Exception as proc_err:
                logger.warning(f"Error processing live camera frame: {proc_err}")
                await websocket.send_json({
                    "type": "frame_error",
                    "error": str(proc_err)
                })

    except WebSocketDisconnect:
        logger.info(f"Live feed client disconnected (Session: {session.session_id})")
    except Exception as e:
        logger.warning(f"Live feed connection error: {e}")
    finally:
        live_service.close_session(session.session_id)

@router.post("/live/frame")
async def process_live_frame_http(
    file: UploadFile = File(...),
    session_id: Optional[str] = Query(default=None)
):
    """
    HTTP fallback endpoint for processing a single live camera frame.
    """
    contents = await file.read()
    sid = session_id or "http-single-frame"
    sess = live_service.get_session(sid)
    if not sess:
        sess = live_service.create_session(session_id=sid)
    result = sess.process_frame(contents)
    return result

