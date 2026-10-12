import sys
from pathlib import Path
import pytest
import cv2
import numpy as np
from fastapi.testclient import TestClient

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.main import app
from app.config import settings
from app.services.analysis_service import analysis_service
from app.tracking.tracker import ByteTrackManager
from app.detection.detector import ObjectDetector

def create_synthetic_surveillance_video(
    file_path: Path,
    width: int = 640,
    height: int = 480,
    fps: float = 30.0,
    duration_frames: int = 30,
    speed: str = "normal"
) -> Path:
    """
    Creates a synthetic surveillance video with moving targets simulating
    slow, normal, or fast speed.
    """
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    out = cv2.VideoWriter(str(file_path), fourcc, fps, (width, height))
    
    speed_factor = 2 if speed == "slow" else (8 if speed == "normal" else 20)
    
    for f_idx in range(duration_frames):
        frame = np.full((height, width, 3), 40, dtype=np.uint8)
        
        # Draw simulated object 1 moving across
        x1 = 50 + f_idx * speed_factor
        y1 = height // 2
        if x1 + 60 < width:
            cv2.rectangle(frame, (x1, y1), (x1 + 60, y1 + 100), (0, 200, 0), -1)
            cv2.putText(frame, "Target 1", (x1, y1 - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 255, 255), 1)
            
        # Draw simulated object 2 stationary
        x2 = width // 2
        y2 = height // 4
        cv2.rectangle(frame, (x2, y2), (x2 + 40, y2 + 80), (200, 0, 0), -1)
        
        out.write(frame)
        
    out.release()
    return file_path


def test_frame_processing_sequential_step(tmp_path):
    """
    Verifies that analysis processes all frames sequentially (step=1)
    and does not skip frames.
    """
    vid_path = tmp_path / "sequential_test.mp4"
    create_synthetic_surveillance_video(vid_path, width=640, height=480, duration_frames=20)
    
    detector = ObjectDetector(conf_threshold=0.35, imgsz=640)
    tracker = ByteTrackManager()
    
    analysis_service.register_video("seq_test", vid_path)
    session = analysis_service.create_session("seq_test", profile="BALANCED")
    
    import asyncio
    loop = asyncio.new_event_loop()
    analysis_service.run_analysis_sync(session.analysis_id, loop)
    
    assert session.status == "completed"
    assert session.processed_frames == 20
    assert len(session.frame_results) == 20
    # Ensure every single frame index 0..19 is present
    for i in range(20):
        assert i in session.frame_results


def test_profiles_balanced_and_precision(tmp_path):
    """
    Verifies BALANCED (640px) and PRECISION (960px) profiles.
    """
    vid_path = tmp_path / "profile_test.mp4"
    create_synthetic_surveillance_video(vid_path, width=960, height=540, duration_frames=10)
    
    analysis_service.register_video("prof_bal", vid_path)
    session_balanced = analysis_service.create_session("prof_bal", profile="BALANCED")
    assert session_balanced.profile == "BALANCED"
    assert session_balanced.imgsz == 640
    assert session_balanced.conf_threshold == 0.35
    
    analysis_service.register_video("prof_prec", vid_path)
    session_precision = analysis_service.create_session("prof_prec", profile="PRECISION")
    assert session_precision.profile == "PRECISION"
    assert session_precision.imgsz == 960
    assert session_precision.conf_threshold == 0.50


def test_multi_video_session_isolation(tmp_path):
    """
    Verifies that analyzing Video A and Video B maintains isolated sessions,
    separate track results, and can be retrieved independently via latest endpoints.
    """
    with TestClient(app) as client:
        # Video A: 640x480
        vid_a = tmp_path / "video_a.mp4"
        create_synthetic_surveillance_video(vid_a, width=640, height=480, duration_frames=15)
        
        # Video B: 1280x720
        vid_b = tmp_path / "video_b.mp4"
        create_synthetic_surveillance_video(vid_b, width=1280, height=720, duration_frames=15)
        
        # Upload Video A
        with open(vid_a, "rb") as f:
            res_a = client.post("/api/v1/video/upload", files={"file": ("video_a.mp4", f, "video/mp4")})
        assert res_a.status_code == 200
        meta_a = res_a.json()
        id_a = meta_a["videoId"]
        assert meta_a["width"] == 640
        assert meta_a["height"] == 480
        
        # Upload Video B
        with open(vid_b, "rb") as f:
            res_b = client.post("/api/v1/video/upload", files={"file": ("video_b.mp4", f, "video/mp4")})
        assert res_b.status_code == 200
        meta_b = res_b.json()
        id_b = meta_b["videoId"]
        assert meta_b["width"] == 1280
        assert meta_b["height"] == 720
        
        # Both must be distinct
        assert id_a != id_b
        
        # Verify GET /api/v1/video/uploads lists both
        uploads_res = client.get("/api/v1/video/uploads")
        assert uploads_res.status_code == 200
        uploads = uploads_res.json()
        uploaded_ids = {u["id"] for u in uploads}
        assert id_a in uploaded_ids
        assert id_b in uploaded_ids
        
        # Start analysis for Video A with BALANCED
        start_a = client.post(f"/api/v1/analyze/{id_a}?profile=BALANCED")
        assert start_a.status_code == 200
        analysis_id_a = start_a.json()["analysisId"]
        
        # Start analysis for Video B with PRECISION
        start_b = client.post(f"/api/v1/analyze/{id_b}?profile=PRECISION")
        assert start_b.status_code == 200
        analysis_id_b = start_b.json()["analysisId"]
        
        assert analysis_id_a != analysis_id_b
        
        # Query latest for Video A
        latest_a = client.get(f"/api/v1/analyze/video/{id_a}/latest")
        assert latest_a.status_code == 200
        assert latest_a.json()["analysisId"] == analysis_id_a
        assert latest_a.json()["videoId"] == id_a
        
        # Query latest for Video B
        latest_b = client.get(f"/api/v1/analyze/video/{id_b}/latest")
        assert latest_b.status_code == 200
        assert latest_b.json()["analysisId"] == analysis_id_b
        assert latest_b.json()["videoId"] == id_b
