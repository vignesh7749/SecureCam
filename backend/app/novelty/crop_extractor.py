import logging
from typing import Tuple, Optional
import cv2
import numpy as np
import torch
from app.detection.schemas import BoundingBox

logger = logging.getLogger("securecam.crop_extractor")

class CropExtractor:
    """
    Extracts, validates, and prepares target crops for visual embedding inference.
    Enforces quality checks for small objects, boundary truncation, and blur.
    """
    def __init__(
        self,
        target_size: int = 224,
        min_crop_size: int = 28,
        min_area: int = 784,
        blur_laplacian_thresh: float = 30.0
    ):
        self.target_size = target_size
        self.min_crop_size = min_crop_size
        self.min_area = min_area
        self.blur_laplacian_thresh = blur_laplacian_thresh

        # Standard ImageNet normalization parameters
        self.mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
        self.std = np.array([0.229, 0.224, 0.225], dtype=np.float32)

    def extract_and_prepare(
        self,
        frame: np.ndarray,
        box: BoundingBox
    ) -> Tuple[Optional[torch.Tensor], str, float]:
        """
        Extracts bounding box crop from frame, evaluates quality, and pre-processes tensor.

        Returns:
            Tuple of (preprocessed_tensor_or_None, quality_status, quality_score)
            quality_status:
                - 'VALID'
                - 'INSUFFICIENT_VISUAL_EVIDENCE' (too small for reliable embedding)
                - 'LOW_VISUAL_QUALITY' (truncated, severely blurred, or occluded)
                - 'INVALID_BOX'
        """
        if frame is None or frame.size == 0:
            return None, "INVALID_BOX", 0.0

        h, w = frame.shape[:2]

        # Convert normalized percentage coordinates to integer pixel coordinates
        x1 = max(0, min(w - 1, int(round((box.x / 100.0) * w))))
        y1 = max(0, min(h - 1, int(round((box.y / 100.0) * h))))
        x2 = max(0, min(w, int(round(((box.x + box.width) / 100.0) * w))))
        y2 = max(0, min(h, int(round(((box.y + box.height) / 100.0) * h))))

        crop_w = x2 - x1
        crop_h = y2 - y1
        area = crop_w * crop_h

        # Degenerate or negative dimension check
        if crop_w <= 0 or crop_h <= 0 or area <= 0:
            return None, "INVALID_BOX", 0.0

        # Small Object Handling (Section 25)
        # Small objects must NOT be misclassified as novel; flagged as INSUFFICIENT_VISUAL_EVIDENCE
        if crop_w < self.min_crop_size or crop_h < self.min_crop_size or area < self.min_area:
            resolution_score = round(min(1.0, area / float(self.min_area)), 3)
            return None, "INSUFFICIENT_VISUAL_EVIDENCE", resolution_score

        crop = frame[y1:y2, x1:x2]
        if crop.size == 0:
            return None, "INVALID_BOX", 0.0

        # Occlusion / Boundary Truncation Check (Section 26)
        # Bounding boxes clipping image borders are frequently partially occluded by frame boundary
        touches_border = (x1 == 0 or y1 == 0 or x2 >= w - 1 or y2 >= h - 1)
        border_penalty = 0.25 if touches_border else 0.0

        # Blur Sharpness Metric (Laplacian variance)
        try:
            gray_crop = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
            lap_var = float(cv2.Laplacian(gray_crop, cv2.CV_64F).var())
            blur_factor = min(1.0, lap_var / max(1.0, self.blur_laplacian_thresh * 2.0))
        except Exception:
            blur_factor = 0.5

        # Resolution scale factor
        res_factor = min(1.0, (crop_w * crop_h) / (128.0 * 128.0))

        # Overall quality score
        quality_score = max(0.05, min(1.0, (0.5 * res_factor + 0.5 * blur_factor) - border_penalty))
        quality_score = round(quality_score, 3)

        if touches_border and quality_score < 0.35:
            return None, "LOW_VISUAL_QUALITY", quality_score

        # Aspect-Ratio Preserving Resize with Symmetric Letterbox Padding
        target = self.target_size
        scale = min(target / crop_w, target / crop_h)
        new_w = max(1, int(round(crop_w * scale)))
        new_h = max(1, int(round(crop_h * scale)))

        resized = cv2.resize(crop, (new_w, new_h), interpolation=cv2.INTER_LINEAR)

        # Pad into square target canvas with neutral 114 gray border
        canvas = np.full((target, target, 3), 114, dtype=np.uint8)
        pad_x = (target - new_w) // 2
        pad_y = (target - new_h) // 2
        canvas[pad_y:pad_y + new_h, pad_x:pad_x + new_w] = resized

        # Convert BGR -> RGB and normalize for deep vision models
        rgb = cv2.cvtColor(canvas, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
        normalized = (rgb - self.mean) / self.std

        # Shape: [1, 3, target_size, target_size]
        tensor = torch.from_numpy(normalized).permute(2, 0, 1).unsqueeze(0).float()
        return tensor, "VALID", quality_score
