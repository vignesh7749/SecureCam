import cv2
from app.detection.detector import ObjectDetector
from app.tracking.tracker import ByteTrackManager

detector = ObjectDetector(confidence_threshold=0.25, iou_threshold=0.45, imgsz=640)
tracker = ByteTrackManager()

cap = cv2.VideoCapture('backend/samples/Testing_1.mp4')
fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

print(f"Testing consecutive frames 0 to 60 on {w}x{h} video:")
for f_idx in range(60):
    ret, frame = cap.read()
    if not ret:
        break
    
    # 1. Detection
    boxes, det_lat, names = detector.predict_boxes(frame)
    num_boxes = len(boxes) if boxes is not None else 0
    
    # 2. Tracking
    tracks, track_lat = tracker.update(
        boxes_input=boxes,
        frame_width=w,
        frame_height=h,
        frame_index=f_idx,
        timestamp=f_idx / fps,
        class_names=names
    )
    
    if f_idx % 5 == 0 or f_idx < 10:
        track_info = [f"#{t.trackId} {t.className} ({t.confidence:.2f})" for t in tracks]
        print(f"Frame {f_idx:2d}: {num_boxes} raw detections -> {len(tracks)} active tracks: {track_info}")

cap.release()
