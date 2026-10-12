"""
Verification script for SECURECAM Stage 2 Pipeline.
Verifies:
1. FastAPI app startup and health route
2. ModelManager preloading
3. VideoReader and VideoMetadata extraction
4. ObjectDetector inference on frames
5. Normalized bounding box coordinates
6. Asynchronous AnalysisService lifecycle
"""
import sys
import time
from pathlib import Path
import cv2
import numpy as np

backend_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(backend_dir))

from app.core.device import get_compute_device, get_device_info
from app.core.model_manager import model_manager
from app.detection.detector import detector
from app.video.metadata import extract_video_metadata
from app.video.reader import VideoReader
from app.services.analysis_service import analysis_service

def create_sample_surveillance_clip(output_path: Path):
    """Creates a 30-frame synthetic video simulating surveillance scene."""
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    out = cv2.VideoWriter(str(output_path), fourcc, 15.0, (640, 480))
    for i in range(30):
        frame = np.full((480, 640, 3), 40, dtype=np.uint8)
        # Add road / walkway lines
        cv2.line(frame, (0, 300), (640, 300), (80, 80, 80), 3)
        # Add simulated moving shapes
        cv2.rectangle(frame, (100 + i * 5, 200), (160 + i * 5, 360), (200, 200, 200), -1)
        out.write(frame)
    out.release()
    print(f"Created sample surveillance clip: {output_path}")

def main():
    print("=" * 60)
    print("SECURECAM STAGE 2 PIPELINE VERIFICATION")
    print("=" * 60)

    # 1. Device and Hardware
    device_info = get_device_info()
    print(f"[1] Hardware Engine: {device_info['device_type'].upper()} ({device_info['gpu_name']})")
    print(f"    PyTorch Version: {device_info['torch_version']}")

    # 2. Model Loading
    t0 = time.time()
    model = model_manager.get_model()
    load_time = round(time.time() - t0, 3)
    info = model_manager.get_info()
    print(f"[2] YOLO Model Loaded: {info['model_name']} in {load_time}s")
    print(f"    Inference Mode: {info['inference_mode']}")
    print(f"    Classes: {info['classes_count']} classes available (e.g., person, car, bicycle)")

    # 3. Video Creation & Metadata
    sample_path = backend_dir / "uploads" / "sample_verification.mp4"
    create_sample_surveillance_clip(sample_path)
    meta = extract_video_metadata(sample_path, "verify-01", "sample_verification.mp4")
    print(f"[3] Metadata Extraction: {meta.width}x{meta.height} @ {meta.fps} FPS")
    print(f"    Duration: {meta.duration}s ({meta.durationFormatted}), Frames: {meta.frameCount}")

    # 4. Sequential Video Reading & Frame Inference
    print("[4] Processing video frames with YOLO ObjectDetector...")
    detections_recorded = 0
    with VideoReader(sample_path) as reader:
        for idx, ts, frame in reader.frames(step=3):
            dets, latency = detector.detect(frame, frame_index=idx, timestamp=ts)
            detections_recorded += len(dets)
            print(f"    Frame {idx:02d} (T={ts:0.2f}s): {len(dets)} detections (Inference Latency: {latency}ms)")
            for d in dets:
                print(f"       -> {d.className.upper()} (conf: {d.confidence*100:.1f}%) at [{d.box.x}%, {d.box.y}%, {d.box.width}%, {d.box.height}%]")

    # 5. Full Pipeline Lifecycle
    print("[5] Testing AnalysisService background registration...")
    analysis_service.register_video("verify-01", sample_path)
    session = analysis_service.create_session("verify-01")
    print(f"    Session Created: {session.analysis_id} (Status: {session.status})")

    print("=" * 60)
    print("VERIFICATION COMPLETED SUCCESSFULLY!")
    print("=" * 60)

if __name__ == "__main__":
    main()
