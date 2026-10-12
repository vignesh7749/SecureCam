import sys
from pathlib import Path
import pytest
import numpy as np
import cv2

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.core.device import get_compute_device, get_device_info
from app.core.model_manager import model_manager
from app.detection.detector import ObjectDetector
from app.detection.postprocess import create_normalized_box
from app.video.metadata import extract_video_metadata
from app.video.reader import VideoReader
from app.services.analysis_service import analysis_service
from app.config import settings

@pytest.fixture
def sample_test_video(tmp_path) -> Path:
    """Generates a small valid test video with synthetic frames."""
    video_path = tmp_path / "test_surveillance.mp4"
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    out = cv2.VideoWriter(str(video_path), fourcc, 10.0, (320, 240))
    
    # Write 20 synthetic frames (2 seconds duration)
    for i in range(20):
        # Draw a synthetic rectangle/circle to simulate visual features
        frame = np.zeros((240, 320, 3), dtype=np.uint8)
        cv2.circle(frame, (100 + i * 2, 100), 30, (255, 255, 255), -1)
        out.write(frame)
        
    out.release()
    return video_path

def test_device_selection_and_cpu_fallback():
    """Verify compute device resolves and CPU fallback works gracefully."""
    dev = get_compute_device("cpu")
    assert dev.type == "cpu"
    info = get_device_info()
    assert "device_type" in info
    assert "torch_version" in info

def test_coordinate_normalization():
    """Verify bounding box normalization clamps to 0-100% properly."""
    box = create_normalized_box(
        x1=160, y1=120, x2=320, y2=240,
        frame_width=320, frame_height=240
    )
    assert box.x == 50.0
    assert box.y == 50.0
    assert box.width == 50.0
    assert box.height == 50.0

def test_model_manager_loading():
    """Verify YOLO model loads and metadata is exposed correctly."""
    model = model_manager.get_model()
    assert model is not None
    info = model_manager.get_info()
    assert info["loaded"] is True
    assert "classes_count" in info
    assert info["classes_count"] > 0

def test_single_frame_inference():
    """Verify ObjectDetector runs on an image and returns typed detections."""
    detector = ObjectDetector(confidence_threshold=0.1)
    # Synthetic frame
    frame = np.zeros((640, 640, 3), dtype=np.uint8)
    detections, latency = detector.detect(frame, frame_index=0, timestamp=0.0)
    assert isinstance(detections, list)
    assert latency >= 0.0

def test_video_metadata_extraction(sample_test_video):
    """Verify OpenCV metadata extraction on a real video file."""
    meta = extract_video_metadata(sample_test_video, "vid-123", "test_surveillance.mp4")
    assert meta.videoId == "vid-123"
    assert meta.width == 320
    assert meta.height == 240
    assert meta.fps == 10.0
    assert meta.frameCount == 20
    assert meta.duration == 2.0

def test_invalid_video_handling(tmp_path):
    """Verify invalid / corrupted video files raise descriptive errors."""
    corrupt_file = tmp_path / "corrupt.mp4"
    corrupt_file.write_bytes(b"not a video content")
    with pytest.raises(ValueError):
        extract_video_metadata(corrupt_file, "vid-err", "corrupt.mp4")

def test_video_reader_sequential_frames(sample_test_video):
    """Verify VideoReader sequential frame generator."""
    with VideoReader(sample_test_video) as reader:
        frames_list = list(reader.frames(step=2))
        # Total frames 20, step 2 -> 10 frames
        assert len(frames_list) == 10
        idx, ts, frame = frames_list[0]
        assert idx == 0
        assert ts == 0.0
        assert frame.shape == (240, 320, 3)

def test_analysis_service_session_lifecycle(sample_test_video):
    """Verify analysis session creation, registration, and status."""
    analysis_service.register_video("test-vid", sample_test_video)
    session = analysis_service.create_session("test-vid")
    assert session.status == "queued"
    assert session.analysis_id is not None
    
    retrieved = analysis_service.get_session(session.analysis_id)
    assert retrieved is not None
    assert retrieved.video_id == "test-vid"
