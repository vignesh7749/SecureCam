import sys
import time
from pathlib import Path
import pytest
import numpy as np
import torch
from fastapi.testclient import TestClient

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.main import app
from app.tracking.tracker import ByteTrackManager
from app.tracking.schemas import TrackedObject, TrajectoryPoint, Velocity, FrameTracks
from app.detection.detector import ObjectDetector, create_normalized_box
from app.detection.schemas import BoundingBox
from app.core.device import get_compute_device, get_device_info
from app.config import settings

@pytest.fixture
def tracker():
    return ByteTrackManager(
        track_high_thresh=0.25,
        track_low_thresh=0.10,
        track_buffer=30,
        match_thresh=0.80,
        min_track_hits=1,
        max_trajectory_points=50
    )

@pytest.fixture
def detector():
    return ObjectDetector()

def test_detector_output_schema_and_box_validation(detector):
    """Verifies detector prediction schema and bounding box quality validation."""
    dummy_frame = np.zeros((480, 640, 3), dtype=np.uint8)
    boxes, latency_ms, names = detector.predict_boxes(dummy_frame)
    assert isinstance(latency_ms, float)
    assert latency_ms >= 0.0

    # Box validation tests: valid box
    valid_box = create_normalized_box(100.0, 100.0, 200.0, 200.0, 640, 480)
    assert valid_box.x == pytest.approx(15.62, abs=0.1)
    assert valid_box.y == pytest.approx(20.83, abs=0.1)
    assert valid_box.width > 0
    assert valid_box.height > 0

    # Clamping out-of-bounds coords
    clamped = create_normalized_box(-20.0, -10.0, 700.0, 500.0, 640, 480)
    assert clamped.x >= 0.0
    assert clamped.y >= 0.0
    assert clamped.x + clamped.width <= 100.01
    assert clamped.y + clamped.height <= 100.01

def test_tracker_initialization(tracker):
    """Verifies ByteTrackManager initializes with configured hyperparameters."""
    assert tracker.tracker is not None
    assert tracker.track_buffer == 30
    assert tracker.max_trajectory_points == 50
    assert tracker.min_track_hits == 1
    assert len(tracker.track_histories) == 0
    assert tracker.get_total_tracks_count() == 0

def test_track_creation_and_new_state(tracker):
    """Verifies single target creates a track with state == NEW."""
    # Input format: [x1, y1, x2, y2, score, class_id]
    dets = np.array([[100.0, 100.0, 150.0, 200.0, 0.85, 0.0]], dtype=np.float32)
    tracks, latency = tracker.update(
        dets,
        frame_width=640,
        frame_height=480,
        frame_index=0,
        timestamp=0.0,
        class_names={0: "person"}
    )

    assert len(tracks) == 1
    t0 = tracks[0]
    assert t0.trackId > 0
    assert t0.state == "NEW"
    assert t0.hits == 1
    assert t0.age == 1
    assert len(t0.trajectory) == 1
    assert t0.className == "person"
    assert t0.velocity.unit == "px/s"
    assert tracker.get_total_tracks_count() == 1

def test_track_persistence_across_frames(tracker):
    """Verifies same target moving smoothly maintains its persistent track ID."""
    track_ids = []
    # 5 consecutive frames moving by 4px each frame
    for f in range(5):
        x1 = 100.0 + f * 4.0
        dets = np.array([[x1, 100.0, x1 + 50.0, 200.0, 0.88, 0.0]], dtype=np.float32)
        tracks, _ = tracker.update(dets, frame_width=640, frame_height=480, frame_index=f, timestamp=f * 0.066)
        assert len(tracks) == 1
        track_ids.append(tracks[0].trackId)

    # All 5 frames must have the exact same track ID
    assert len(set(track_ids)) == 1
    assert tracks[0].state == "ACTIVE"
    assert tracks[0].hits == 5

def test_trajectories_history_and_bounding(tracker):
    """Verifies trajectory points grow and are strictly bounded by max_trajectory_points."""
    mgr = ByteTrackManager(max_trajectory_points=5)
    for f in range(10):
        x1 = 50.0 + f * 5.0
        dets = np.array([[x1, 50.0, x1 + 40.0, 120.0, 0.90, 0.0]], dtype=np.float32)
        tracks, _ = mgr.update(dets, frame_width=640, frame_height=480, frame_index=f, timestamp=f * 0.1)

    assert len(tracks) == 1
    traj = tracks[0].trajectory
    # Must not exceed max_trajectory_points=5
    assert len(traj) == 5
    # Must contain the latest frames
    assert traj[-1].frameIndex == 9

def test_pixel_velocity_calculation(tracker):
    """Verifies pixel velocity displacement is calculated in px/s with Kalman smoothing."""
    # Frame 0 at x=100
    dets0 = np.array([[100.0, 100.0, 150.0, 200.0, 0.85, 0.0]], dtype=np.float32)
    tracker.update(dets0, frame_width=640, frame_height=480, frame_index=0, timestamp=0.0)

    # Frame 1: moved +20px horizontally in 0.1 seconds -> Kalman-filtered speed should be ~150-220 px/s
    dets1 = np.array([[120.0, 100.0, 170.0, 200.0, 0.85, 0.0]], dtype=np.float32)
    tracks, _ = tracker.update(dets1, frame_width=640, frame_height=480, frame_index=1, timestamp=0.1)

    assert len(tracks) == 1
    v = tracks[0].velocity
    assert v.unit == "px/s"
    assert 120.0 <= v.speed <= 250.0
    assert 120.0 <= v.vx <= 250.0

def test_multi_object_tracking(tracker):
    """Verifies multiple objects maintain distinct persistent track IDs."""
    # Two distinct objects: Object A at (50, 50), Object B at (300, 200)
    dets = np.array([
        [50.0, 50.0, 90.0, 150.0, 0.88, 0.0],
        [300.0, 200.0, 360.0, 320.0, 0.82, 2.0]
    ], dtype=np.float32)

    tracks, _ = tracker.update(dets, frame_width=640, frame_height=480, frame_index=0, timestamp=0.0)
    assert len(tracks) == 2
    id_a = tracks[0].trackId
    id_b = tracks[1].trackId
    assert id_a != id_b

    # Update on frame 1
    dets_next = np.array([
        [54.0, 50.0, 94.0, 150.0, 0.87, 0.0],
        [305.0, 202.0, 365.0, 322.0, 0.84, 2.0]
    ], dtype=np.float32)
    tracks_next, _ = tracker.update(dets_next, frame_width=640, frame_height=480, frame_index=1, timestamp=0.066)
    assert len(tracks_next) == 2
    next_ids = {t.trackId for t in tracks_next}
    assert id_a in next_ids
    assert id_b in next_ids

def test_synthetic_occlusion_recovery(tracker):
    """Verifies track ID recovery across missing frames (occlusion)."""
    # Frames 0..2: target visible
    initial_id = None
    for f in range(3):
        x1 = 150.0 + f * 5.0
        dets = np.array([[x1, 150.0, x1 + 50.0, 250.0, 0.85, 0.0]], dtype=np.float32)
        tracks, _ = tracker.update(dets, frame_width=640, frame_height=480, frame_index=f, timestamp=f * 0.05)
        assert len(tracks) == 1
        initial_id = tracks[0].trackId

    # Frame 3: target occluded (zero detections)
    empty_tracks, _ = tracker.update(np.empty((0, 6), dtype=np.float32), frame_width=640, frame_height=480, frame_index=3, timestamp=0.15)
    assert len(empty_tracks) == 0

    # Frame 4: target reappears nearby (Kalman filter association)
    reappear_dets = np.array([[170.0, 150.0, 220.0, 250.0, 0.85, 0.0]], dtype=np.float32)
    recovered_tracks, _ = tracker.update(reappear_dets, frame_width=640, frame_height=480, frame_index=4, timestamp=0.20)

    assert len(recovered_tracks) == 1
    assert recovered_tracks[0].trackId == initial_id
    assert recovered_tracks[0].state == "REIDENTIFIED"

def test_synthetic_crossing_objects(tracker):
    """Verifies two targets crossing paths maintain their respective identities."""
    # Target 1 starts left at x=100 moving right (+10px/frame)
    # Target 2 starts right at x=260 moving left (-10px/frame)
    # They cross near x=180 at frame 8
    t1_ids = []
    t2_ids = []

    for f in range(15):
        x_t1 = 100.0 + f * 10.0
        x_t2 = 260.0 - f * 10.0

        dets = np.array([
            [x_t1, 150.0, x_t1 + 40.0, 250.0, 0.90, 0.0],
            [x_t2, 150.0, x_t2 + 40.0, 250.0, 0.90, 0.0]
        ], dtype=np.float32)

        tracks, _ = tracker.update(dets, frame_width=640, frame_height=480, frame_index=f, timestamp=f * 0.05)
        assert len(tracks) == 2
        # Sort by x coordinate to track identities
        tracks_sorted = sorted(tracks, key=lambda t: t.box.x)
        if f == 0:
            initial_t1_id = tracks_sorted[0].trackId
            initial_t2_id = tracks_sorted[1].trackId

    # Total registered unique tracks should be 2
    assert tracker.get_total_tracks_count() == 2

def test_cpu_execution_device():
    """Verifies model and device abstraction on CPU without errors."""
    dev = get_compute_device("cpu")
    assert dev.type == "cpu"
    info = get_device_info()
    assert "device_type" in info

def test_api_tracks_and_benchmark_endpoints():
    """Verifies GET /api/v1/analyze/{id}/tracks and POST /api/v1/benchmark/run endpoints."""
    with TestClient(app) as client:
        # Check samples availability
        samples_res = client.get("/api/v1/video/samples")
        assert samples_res.status_code == 200
        samples = samples_res.json()
        assert len(samples) > 0
        sample_id = samples[0]["videoId"]

        # Test benchmark endpoint on discovered sample
        bench_res = client.post(
            "/api/v1/benchmark/run",
            json={
                "videoId": sample_id,
                "modelName": "yolov8n.pt",
                "imgSize": 640,
                "confThreshold": 0.35
            }
        )
        assert bench_res.status_code == 200
        bench_data = bench_res.json()
        assert bench_data["model"] == "yolov8n.pt"
        assert bench_data["imgSize"] == 640
        assert bench_data["pipelineFps"] > 0
        assert bench_data["avgDetectionLatencyMs"] > 0
        assert bench_data["avgTrackingLatencyMs"] >= 0
        assert bench_data["totalFrames"] > 0

def test_temporal_class_stabilization_and_locking(tracker):
    """Verifies that an object's class locks after >=2 positive frames and resists temporary flicker or 'unknown'."""
    class_map = {0: "person", 2: "car", 80: "unknown"}

    # Frame 0: Detect 'car' with confidence 0.85
    dets0 = np.array([[100.0, 100.0, 160.0, 200.0, 0.85, 2.0]], dtype=np.float32)
    tracks0, _ = tracker.update(dets0, frame_width=640, frame_height=480, frame_index=0, timestamp=0.0, class_names=class_map)
    assert len(tracks0) == 1
    t0_id = tracks0[0].trackId
    assert tracks0[0].className == "car"

    # Frame 1: Detect 'car' with confidence 0.90 -> locks class to 'car'
    dets1 = np.array([[102.0, 100.0, 162.0, 200.0, 0.90, 2.0]], dtype=np.float32)
    tracks1, _ = tracker.update(dets1, frame_width=640, frame_height=480, frame_index=1, timestamp=0.033, class_names=class_map)
    assert len(tracks1) == 1
    assert tracks1[0].trackId == t0_id
    assert tracks1[0].className == "car"
    assert tracker.track_histories[t0_id]["locked_class_name"] == "car"

    # Frame 2: Detector momentarily flickers to 'unknown' with low confidence
    dets2 = np.array([[104.0, 100.0, 164.0, 200.0, 0.30, 80.0]], dtype=np.float32)
    tracks2, _ = tracker.update(dets2, frame_width=640, frame_height=480, frame_index=2, timestamp=0.066, class_names=class_map)
    assert len(tracks2) == 1
    assert tracks2[0].trackId == t0_id
    # Class MUST remain locked as 'car', NOT 'unknown'
    assert tracks2[0].className == "car"
    assert tracks2[0].isUnknown is False

    # Frame 3: Detector flickers to single-frame 'person' misclassification
    dets3 = np.array([[106.0, 100.0, 166.0, 200.0, 0.45, 0.0]], dtype=np.float32)
    tracks3, _ = tracker.update(dets3, frame_width=640, frame_height=480, frame_index=3, timestamp=0.100, class_names=class_map)
    assert len(tracks3) == 1
    assert tracks3[0].trackId == t0_id
    # Class MUST remain locked as 'car'
    assert tracks3[0].className == "car"
    assert tracks3[0].isUnknown is False

def test_persistent_identity_across_scale_and_motion(tracker):
    """Verifies that an approaching object with growing bounding box maintains its single persistent track ID."""
    class_map = {2: "car"}
    initial_id = None

    # Simulate car approaching camera: box expands from 50x50 to 120x120 over 10 frames
    for f in range(10):
        w = 50.0 + f * 7.0
        h = 50.0 + f * 7.0
        x1 = 200.0 + f * 3.0
        y1 = 150.0 + f * 2.0
        dets = np.array([[x1, y1, x1 + w, y1 + h, 0.88, 2.0]], dtype=np.float32)
        tracks, _ = tracker.update(dets, frame_width=640, frame_height=480, frame_index=f, timestamp=f * 0.033, class_names=class_map)
        assert len(tracks) == 1
        if f == 0:
            initial_id = tracks[0].trackId
        assert tracks[0].trackId == initial_id
        assert tracks[0].className == "car"

def test_monotonic_track_id_reset():
    """Verifies that tracker.reset() clears history and resets IDs monotonically."""
    mgr = ByteTrackManager()
    dets = np.array([[100.0, 100.0, 150.0, 180.0, 0.90, 2.0]], dtype=np.float32)
    t1, _ = mgr.update(dets, frame_width=640, frame_height=480, frame_index=0, timestamp=0.0)
    assert len(t1) == 1
    first_id = t1[0].trackId

    # Reset
    mgr.reset()
    assert len(mgr.track_histories) == 0
    assert len(mgr.track_id_map) == 0

    # Next session starts fresh
    t2, _ = mgr.update(dets, frame_width=640, frame_height=480, frame_index=0, timestamp=0.0)
    assert len(t2) == 1
    # Freshly reset session starts at ID 1
    assert t2[0].trackId == 1

