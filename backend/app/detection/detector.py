import time
import logging
from typing import List, Tuple, Optional, Any, Dict
import numpy as np
import torch

from app.config import settings
from app.core.model_manager import model_manager
from app.detection.schemas import Detection
from app.detection.postprocess import create_normalized_box

logger = logging.getLogger("securecam.detector")

class ObjectDetector:
    """
    Core YOLO inference engine.
    Wraps Ultralytics YOLO model and applies strict detection quality control:
    - Configurable confidence, IoU, input image size (640, 960, 1280), device, max detections, and class filters
    - Coordinates are scaled back to original frame dimensions
    - Bounding box validation and boundary clamping
    - Raw box extraction for seamless ByteTrack feeding
    """
    def __init__(
        self,
        confidence_threshold: Optional[float] = None,
        iou_threshold: Optional[float] = None,
        img_size: Optional[int] = None,
        max_detections: Optional[int] = None,
        classes: Optional[List[int]] = None,
        conf_threshold: Optional[float] = None,
        imgsz: Optional[int] = None,
    ):
        conf = conf_threshold if conf_threshold is not None else confidence_threshold
        self.conf_threshold = conf if conf is not None else settings.CONFIDENCE_THRESHOLD
        self.iou_threshold = iou_threshold if iou_threshold is not None else settings.IOU_THRESHOLD
        self.img_size = imgsz or img_size or settings.IMG_SIZE
        self.max_detections = max_detections or settings.MAX_DETECTIONS
        self.classes = classes if classes is not None else getattr(settings, 'SURVEILLANCE_CLASSES', None)

    def predict_boxes(self, frame: np.ndarray) -> Tuple[Any, float, Dict[int, str]]:
        """
        Runs YOLO model prediction and returns (Boxes_object, latency_ms, class_names_dict).
        Used by the tracking pipeline for zero-overhead ByteTrack handoff.
        """
        model = model_manager.get_model()
        t0 = time.time()
        
        results = model.predict(
            source=frame,
            conf=self.conf_threshold,
            iou=self.iou_threshold,
            imgsz=self.img_size,
            max_det=self.max_detections,
            classes=self.classes,
            verbose=False
        )
        latency_ms = round((time.time() - t0) * 1000, 2)

        names = getattr(model, "names", {})
        if not results or len(results) == 0:
            return None, latency_ms, names

        return results[0].boxes, latency_ms, names

    def detect(
        self,
        frame: np.ndarray,
        frame_index: int = 0,
        timestamp: float = 0.0
    ) -> Tuple[List[Detection], float]:
        """
        Runs object detection and outputs validated Detection schemas.
        """
        boxes, latency_ms, names = self.predict_boxes(frame)
        h, w = frame.shape[:2]

        detections: List[Detection] = []
        if boxes is None or len(boxes) == 0:
            return detections, latency_ms

        xyxy = boxes.xyxy.cpu().numpy()
        confs = boxes.conf.cpu().numpy()
        cls_ids = boxes.cls.cpu().numpy().astype(int)

        for i in range(len(xyxy)):
            box_coords = xyxy[i]
            conf = float(confs[i])
            c_id = int(cls_ids[i])
            c_name = names.get(c_id, f"class_{c_id}")

            # Quality Control: discard degenerate inverted/zero-area boxes
            if box_coords[2] <= box_coords[0] or box_coords[3] <= box_coords[1]:
                continue

            # Safe boundary clamping to original dimensions
            norm_box = create_normalized_box(
                x1=box_coords[0],
                y1=box_coords[1],
                x2=box_coords[2],
                y2=box_coords[3],
                frame_width=w,
                frame_height=h
            )

            det_id = f"det_{frame_index}_{i}_{int(time.time() * 1000) % 10000}"
            detections.append(Detection(
                id=det_id,
                classId=c_id,
                className=c_name,
                confidence=round(conf, 4),
                box=norm_box,
                timestamp=round(timestamp, 3),
                frameIndex=frame_index
            ))

        return detections, latency_ms

    def get_model_info(self) -> dict:
        return model_manager.get_info()

detector = ObjectDetector()
