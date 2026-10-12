import os
import sys
import shutil
import tempfile
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.main import app
from app.services.sample_service import (
    SampleVideoService,
    generate_display_name,
    generate_stable_sample_id,
    is_supported_video_file,
    is_safe_path,
    sample_service,
)
from app.services.analysis_service import analysis_service


def test_display_name_generation():
    assert generate_display_name("Testing_1.mp4") == "Testing 1"
    assert generate_display_name("sample_street_surveillance.mp4") == "Sample Street Surveillance"
    assert generate_display_name("cctv_entrance_gate-01.avi") == "Cctv Entrance Gate 01"
    assert generate_display_name("Perimeter-Fence.mov") == "Perimeter Fence"


def test_stable_sample_ids():
    base = Path("/base/dir")
    p1 = base / "Testing_1.mp4"
    p2 = base / "Testing_1.mp4"
    id1 = generate_stable_sample_id(p1, base)
    id2 = generate_stable_sample_id(p2, base)
    assert id1 == id2
    assert id1 == "sample_testing_1"


def test_supported_and_unsupported_extensions():
    assert is_supported_video_file(Path("video.mp4")) is True
    assert is_supported_video_file(Path("video.avi")) is True
    assert is_supported_video_file(Path("video.mkv")) is True
    assert is_supported_video_file(Path("video.webm")) is True
    assert is_supported_video_file(Path("video.mov")) is True
    assert is_supported_video_file(Path("video.MP4")) is True

    assert is_supported_video_file(Path("notes.txt")) is False
    assert is_supported_video_file(Path("data.json")) is False
    assert is_supported_video_file(Path("frame.png")) is False
    assert is_supported_video_file(Path("script.py")) is False


def test_path_traversal_rejection():
    service = sample_service
    # Relative escapes
    assert service.resolve_sample_path("../../etc/passwd") is None
    assert service.resolve_sample_path("..\\windows\\system32") is None
    assert service.resolve_sample_path("../Testing_1.mp4") is None
    # Absolute paths
    assert service.resolve_sample_path("C:/Windows/System32/cmd.exe") is None
    assert service.resolve_sample_path("/etc/shadow") is None
    # Null bytes
    assert service.resolve_sample_path("Testing_1.mp4\0.txt") is None
    # Empty string
    assert service.resolve_sample_path("") is None


def test_missing_and_empty_directory_handling():
    with tempfile.TemporaryDirectory() as tmp_dir:
        non_existent = Path(tmp_dir) / "sub_samples"
        service = SampleVideoService(samples_dir=non_existent)
        
        # Missing directory should be created and return empty list
        samples = service.discover_samples()
        assert samples == []
        assert non_existent.exists()

        # Empty directory should return empty list
        samples_empty = service.discover_samples()
        assert samples_empty == []


def test_unsupported_files_in_directory_ignored():
    with tempfile.TemporaryDirectory() as tmp_dir:
        dir_path = Path(tmp_dir)
        # Create dummy unsupported files
        (dir_path / "readme.txt").write_text("surveillance notes")
        (dir_path / "config.json").write_text("{}")
        (dir_path / "dummy.tmp").write_bytes(b"\x00\x01\x02")

        service = SampleVideoService(samples_dir=dir_path)
        samples = service.discover_samples()
        assert len(samples) == 0


def test_invalid_sample_id_lookup():
    service = sample_service
    assert service.resolve_sample_path("non_existent_sample_xyz") is None
    assert service.resolve_sample_path("sample-999") is None


def test_actual_samples_discovery_and_metadata():
    # Tests against the real backend/samples/Testing_1.mp4
    samples = sample_service.discover_samples()
    assert len(samples) >= 1
    sample = next((s for s in samples if s.filename == "Testing_1.mp4"), samples[0])

    assert sample.filename == "Testing_1.mp4"
    assert sample.displayName == "Testing 1"
    assert sample.id == "sample_testing_1"
    assert sample.width == 1920
    assert sample.height == 1080
    assert sample.fps > 25.0
    assert sample.duration > 10.0
    assert sample.fileSize > 10_000_000
    assert sample.format == "mp4"
    assert sample.streamUrl == "/api/v1/video/sample_testing_1/stream"


def test_api_samples_endpoint_and_stream():
    with TestClient(app) as client:
        # 1. API GET /api/v1/video/samples
        res = client.get("/api/v1/video/samples")
        assert res.status_code == 200
        samples = res.json()
        assert len(samples) >= 1
        s = next((x for x in samples if x["filename"] == "Testing_1.mp4"), samples[0])
        assert s["id"] == "sample_testing_1"
        assert s["displayName"] == "Testing 1"
        assert s["filename"] == "Testing_1.mp4"
        assert s["streamUrl"] == "/api/v1/video/sample_testing_1/stream"
        assert s["width"] == 1920
        assert s["height"] == 1080
        assert s["duration"] > 10.0

        # 2. API GET /api/v1/video/{id}/metadata
        meta_res = client.get(f"/api/v1/video/{s['id']}/metadata")
        assert meta_res.status_code == 200
        meta = meta_res.json()
        assert meta["videoId"] == s["id"]
        assert meta["width"] == 1920

        # 3. API GET /api/v1/video/{id}/stream with Range request
        stream_res = client.get(
            f"/api/v1/video/{s['id']}/stream",
            headers={"Range": "bytes=0-1023"}
        )
        assert stream_res.status_code == 206
        assert len(stream_res.content) == 1024
        assert "bytes 0-1023/" in stream_res.headers.get("content-range", "")


def test_api_sample_lookup_by_filename_and_stem():
    with TestClient(app) as client:
        # Lookup by exact filename
        res_file = client.get("/api/v1/video/Testing_1.mp4/metadata")
        assert res_file.status_code == 200
        assert res_file.json()["width"] == 1920

        # Lookup by stem
        res_stem = client.get("/api/v1/video/Testing_1/metadata")
        assert res_stem.status_code == 200
        assert res_stem.json()["width"] == 1920


def test_api_invalid_sample_404():
    with TestClient(app) as client:
        res = client.get("/api/v1/video/unknown_video_id/metadata")
        assert res.status_code == 404

        stream_res = client.get("/api/v1/video/unknown_video_id/stream")
        assert stream_res.status_code == 404


def test_api_path_traversal_404_rejection():
    with TestClient(app) as client:
        res = client.get("/api/v1/video/..%2F..%2Fetc%2Fpasswd/metadata")
        assert res.status_code in [404, 422, 400]
