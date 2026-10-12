import sys
import os
from pathlib import Path
import cv2
import numpy as np
import time

# Ensure backend directory is in sys.path
backend_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(backend_dir))

from app.config import settings
from app.core.model_manager import model_manager
from app.detection.detector import ObjectDetector
from app.tracking.tracker import ByteTrackManager

def diagnose():
    print("=" * 70)
    print("SECURECAM YOLO & DETECTION PIPELINE ROOT-CAUSE DIAGNOSIS")
    print("=" * 70)

    # 1. MODEL INSPECTION
    print("\n--- PART 3 & 4: MODEL INSPECTION ---")
    model = model_manager.get_model()
    model_info = model_manager.get_info()
    print(f"MODEL FILE: {settings.MODEL_NAME}")
    print(f"MODEL TYPE: {model_info.get('model_version')}")
    print(f"MODEL DEVICE: {model_info.get('device')}")
    print(f"MODEL PATH: {getattr(model, 'ckpt_path', 'unknown') or getattr(model, 'weights', 'unknown')}")
    print(f"NUMBER OF CLASSES: {model_info.get('classes_count')}")
    
    names = getattr(model, "names", {})
    print(f"TOTAL CLASS NAMES IN model.names: {len(names)}")
    # Print key vehicle and person classes
    print("\nRelevant classes in model.names:")
    for cid, cname in names.items():
        if cname in ["person", "bicycle", "car", "motorcycle", "airplane", "bus", "train", "truck", "boat", "traffic light", "cat", "dog"]:
            print(f"  ID {cid}: {cname}")

    print(f"\nsettings.SURVEILLANCE_CLASSES: {settings.SURVEILLANCE_CLASSES}")
    for cid in settings.SURVEILLANCE_CLASSES:
        print(f"  Surveillance class ID {cid} maps to: '{names.get(cid, 'UNKNOWN')}'")

    # 2. VIDEO FILE CHECK
    video_path = settings.SAMPLES_DIR / "Testing_1.mp4"
    print("\n--- PART 2: REAL VIDEO INSPECTION ---")
    print(f"Target video path: {video_path}")
    print(f"File exists: {video_path.exists()}")
    if not video_path.exists():
        print("ERROR: Video file does not exist!")
        return

    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        print("ERROR: Cannot open video file with OpenCV!")
        return

    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = cap.get(cv2.CAP_PROP_FPS)
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    print(f"Video Properties: {w}x{h} @ {fps:.2f} FPS, Total Frames: {total_frames}")

    # Test frames: beginning (10), ~25% (80), ~50% (160), ~75% (240), near end (300)
    test_indices = [
        10,
        int(total_frames * 0.25),
        int(total_frames * 0.50),
        int(total_frames * 0.75),
        min(total_frames - 5, int(total_frames * 0.90))
    ]

    debug_dir = backend_dir / "debug_detection"
    debug_dir.mkdir(parents=True, exist_ok=True)

    tracker = ByteTrackManager()
    detector = ObjectDetector(confidence_threshold=0.25, iou_threshold=0.45, imgsz=640)

    print("\n--- PART 2, 5, 6, 7, 8, 9: TESTING YOLO & BYTETRACK ON FRAMES ---")

    for f_idx in test_indices:
        cap.set(cv2.CAP_PROP_POS_FRAMES, f_idx)
        ret, frame = cap.read()
        if not ret or frame is None:
            print(f"Frame {f_idx}: Failed to read!")
            continue

        fh, fw = frame.shape[:2]
        print(f"\n{'='*50}")
        print(f"FRAME {f_idx} (dimensions: {fw}x{fh}, dtype: {frame.dtype}, min: {frame.min()}, max: {frame.max()})")

        # A. Raw YOLO predict directly (no class filter, conf=0.15)
        t0 = time.time()
        raw_res = model.predict(source=frame, conf=0.15, iou=0.45, imgsz=640, verbose=False)
        raw_lat = (time.time() - t0) * 1000
        
        raw_boxes = raw_res[0].boxes if raw_res and len(raw_res) > 0 else None
        raw_count = len(raw_boxes) if raw_boxes is not None else 0
        print(f"RAW YOLO (conf=0.15, no class filter, imgsz=640): {raw_count} detections in {raw_lat:.1f}ms")
        
        if raw_boxes is not None and len(raw_boxes) > 0:
            r_xyxy = raw_boxes.xyxy.cpu().numpy()
            r_conf = raw_boxes.conf.cpu().numpy()
            r_cls = raw_boxes.cls.cpu().numpy().astype(int)
            for j in range(min(10, len(r_xyxy))):
                cname = names.get(r_cls[j], f"class_{r_cls[j]}")
                print(f"  [RAW] {cname:<12} conf: {r_conf[j]:.3f} box: [{r_xyxy[j][0]:.1f}, {r_xyxy[j][1]:.1f}, {r_xyxy[j][2]:.1f}, {r_xyxy[j][3]:.1f}]")
            if len(r_xyxy) > 10:
                print(f"  ... and {len(r_xyxy) - 10} more raw detections")

        # B. Raw YOLO predict with 960px resolution
        t0_960 = time.time()
        raw_res_960 = model.predict(source=frame, conf=0.15, iou=0.45, imgsz=960, verbose=False)
        lat_960 = (time.time() - t0_960) * 1000
        boxes_960 = raw_res_960[0].boxes if raw_res_960 and len(raw_res_960) > 0 else None
        count_960 = len(boxes_960) if boxes_960 is not None else 0
        print(f"RAW YOLO (conf=0.15, imgsz=960): {count_960} detections in {lat_960:.1f}ms")

        # C. ObjectDetector (with SURVEILLANCE_CLASSES filter and conf threshold)
        det_boxes, det_lat, det_names = detector.predict_boxes(frame)
        det_count = len(det_boxes) if det_boxes is not None else 0
        print(f"ObjectDetector.predict_boxes (conf=0.25, filtered classes): {det_count} detections in {det_lat:.1f}ms")

        if det_boxes is not None and len(det_boxes) > 0:
            d_xyxy = det_boxes.xyxy.cpu().numpy()
            d_conf = det_boxes.conf.cpu().numpy()
            d_cls = det_boxes.cls.cpu().numpy().astype(int)
            for j in range(len(d_xyxy)):
                cname = det_names.get(d_cls[j], f"class_{d_cls[j]}")
                print(f"  [FILTERED] {cname:<10} conf: {d_conf[j]:.3f} box: [{d_xyxy[j][0]:.1f}, {d_xyxy[j][1]:.1f}, {d_xyxy[j][2]:.1f}, {d_xyxy[j][3]:.1f}]")

        # D. ByteTrack Update
        tracks, track_lat = tracker.update(
            boxes_input=det_boxes,
            frame_width=fw,
            frame_height=fh,
            frame_index=f_idx,
            timestamp=f_idx / fps,
            class_names=det_names
        )
        print(f"ByteTrack output: {len(tracks)} active tracks in {track_lat:.1f}ms")
        for t in tracks:
            print(f"  [TRACK] ID #{t.trackId} {t.className} conf: {t.confidence:.3f} box: x={t.box.x:.2f}%, y={t.box.y:.2f}%, w={t.box.width:.2f}%, h={t.box.height:.2f}%")

        # E. Save annotated debug frame
        annotated = frame.copy()
        if raw_boxes is not None and len(raw_boxes) > 0:
            r_xyxy = raw_boxes.xyxy.cpu().numpy()
            r_conf = raw_boxes.conf.cpu().numpy()
            r_cls = raw_boxes.cls.cpu().numpy().astype(int)
            for j in range(len(r_xyxy)):
                x1, y1, x2, y2 = map(int, r_xyxy[j])
                cname = names.get(r_cls[j], f"class_{r_cls[j]}")
                cconf = r_conf[j]
                color = (0, 255, 0) if cname == "car" else (255, 0, 0) if cname == "person" else (0, 165, 255)
                cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
                label = f"{cname} {cconf:.2f}"
                cv2.putText(annotated, label, (x1, max(20, y1 - 5)), cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)

        out_path = debug_dir / f"debug_frame_{f_idx}.jpg"
        cv2.imwrite(str(out_path), annotated)
        print(f"Saved annotated debug frame to: {out_path}")

    cap.release()
    print("\n" + "=" * 70)
    print("DIAGNOSIS COMPLETE.")
    print("=" * 70)

if __name__ == "__main__":
    diagnose()
