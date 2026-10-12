import sys
from pathlib import Path
import pytest
import cv2
import numpy as np
from fastapi.testclient import TestClient

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.main import app

@pytest.fixture
def sample_mp4(tmp_path) -> Path:
    video_path = tmp_path / "stream_sample.mp4"
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    out = cv2.VideoWriter(str(video_path), fourcc, 15.0, (320, 240))
    for i in range(15):
        frame = np.zeros((240, 320, 3), dtype=np.uint8)
        # Draw a synthetic circle
        cv2.circle(frame, (160, 120), 40, (0, 255, 0), -1)
        out.write(frame)
    out.release()
    return video_path

def test_api_health():
    with TestClient(app) as client:
        res = client.get("/api/v1/health")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "ONLINE"
        assert data["model"]["loaded"] is True
        assert "classes_count" in data["model"]

def test_api_video_upload_and_analysis_lifecycle(sample_mp4):
    with TestClient(app) as client:
        # 1. Upload video
        with open(sample_mp4, "rb") as f:
            upload_res = client.post(
                "/api/v1/video/upload",
                files={"file": ("test_clip.mp4", f, "video/mp4")}
            )
        assert upload_res.status_code == 200
        meta = upload_res.json()
        assert "videoId" in meta
        assert meta["width"] == 320
        assert meta["height"] == 240
        assert meta["fps"] == 15.0
        video_id = meta["videoId"]

        # 2. Start analysis
        analyze_res = client.post(f"/api/v1/analyze/{video_id}")
        assert analyze_res.status_code == 200
        init_data = analyze_res.json()
        assert "analysisId" in init_data
        analysis_id = init_data["analysisId"]

        # 3. Poll status
        status_res = client.get(f"/api/v1/analyze/{analysis_id}")
        assert status_res.status_code == 200
        status_data = status_res.json()
        assert status_data["analysisId"] == analysis_id
        assert status_data["status"] in ["queued", "processing", "completed"]

        # 4. Verify GET /api/v1/video/uploads lists the uploaded file
        uploads_res = client.get("/api/v1/video/uploads")
        assert uploads_res.status_code == 200
        uploads_data = uploads_res.json()
        assert any(item["id"] == video_id or item.get("videoId") == video_id for item in uploads_data)

        # 5. Verify GET /api/v1/analyze/video/{video_id}/latest returns the session
        latest_res = client.get(f"/api/v1/analyze/video/{video_id}/latest")
        assert latest_res.status_code == 200
        assert latest_res.json()["analysisId"] == analysis_id

def test_api_invalid_file_upload(tmp_path):
    with TestClient(app) as client:
        bad_file = tmp_path / "bad.txt"
        bad_file.write_text("not a video")
        with open(bad_file, "rb") as f:
            res = client.post(
                "/api/v1/video/upload",
                files={"file": ("bad.txt", f, "text/plain")}
            )
        assert res.status_code == 400
        assert "Unsupported video extension" in res.json()["detail"]

def test_sample_video_streaming_and_range_requests():
    with TestClient(app) as client:
        # 1. Samples list
        res = client.get("/api/v1/video/samples")
        assert res.status_code == 200
        samples = res.json()
        assert len(samples) > 0
        sample = samples[0]
        sample_id = sample["id"]
        
        # 2. Sample metadata
        meta_res = client.get(f"/api/v1/video/{sample_id}/metadata")
        assert meta_res.status_code == 200
        meta = meta_res.json()
        assert meta["videoId"] == sample_id
        assert meta["fps"] > 0
        assert meta["width"] > 0
        assert meta["height"] > 0

        # 3. Stream full video
        stream_res = client.get(f"/api/v1/video/{sample_id}/stream")
        assert stream_res.status_code == 200
        assert "video/" in stream_res.headers.get("content-type", "")

        # 4. Stream range request (HTTP 206 Partial Content)
        range_res = client.get(
            f"/api/v1/video/{sample_id}/stream",
            headers={"Range": "bytes=0-1023"}
        )
        assert range_res.status_code == 206
        assert "bytes 0-1023/" in range_res.headers.get("content-range", "")
        assert len(range_res.content) == 1024

def test_sample_video_yolo_analysis():
    with TestClient(app) as client:
        # Dynamic sample lookup
        samples_res = client.get("/api/v1/video/samples")
        assert samples_res.status_code == 200
        samples = samples_res.json()
        assert len(samples) > 0
        sample_id = samples[0]["id"]

        # Start analysis on discovered sample
        res = client.post(f"/api/v1/analyze/{sample_id}")
        assert res.status_code == 200
        data = res.json()
        assert data["videoId"] == sample_id
        analysis_id = data["analysisId"]

        # Check status
        status_res = client.get(f"/api/v1/analyze/{analysis_id}")
        assert status_res.status_code == 200
        assert status_res.json()["status"] in ["queued", "processing", "completed"]

def test_upload_deduplication_single_stored_video(sample_mp4):
    """
    Regression test:
    Uploading the same physical video file multiple times must:
    1. Deduplicate by content hash
    2. Create exactly ONE stored upload
    3. Return exactly ONE unique item in GET /api/v1/video/uploads
    """
    with TestClient(app) as client:
        # First upload
        with open(sample_mp4, "rb") as f:
            res1 = client.post(
                "/api/v1/video/upload",
                files={"file": ("dedup_test_clip.mp4", f, "video/mp4")}
            )
        assert res1.status_code == 200
        video_id1 = res1.json()["videoId"]

        # Second upload of the exact same physical video file
        with open(sample_mp4, "rb") as f:
            res2 = client.post(
                "/api/v1/video/upload",
                files={"file": ("dedup_test_clip.mp4", f, "video/mp4")}
            )
        assert res2.status_code == 200
        video_id2 = res2.json()["videoId"]

        # Must return the identical video ID
        assert video_id1 == video_id2

        # Verify GET /api/v1/video/uploads lists exactly ONE entry for this video
        uploads_res = client.get("/api/v1/video/uploads")
        assert uploads_res.status_code == 200
        uploads = uploads_res.json()
        matching = [u for u in uploads if u["id"] == video_id1 or u.get("videoId") == video_id1]
        assert len(matching) == 1


