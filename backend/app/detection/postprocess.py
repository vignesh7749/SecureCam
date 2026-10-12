from typing import Tuple
from app.detection.schemas import BoundingBox

def create_normalized_box(
    x1: float, 
    y1: float, 
    x2: float, 
    y2: float, 
    frame_width: int, 
    frame_height: int
) -> BoundingBox:
    """
    Clamps absolute box coordinates to frame boundaries and computes
    normalized percentage coordinates (0.0 to 100.0) for frontend rendering.
    """
    # Safe clamping
    clamped_x1 = max(0.0, min(float(x1), float(frame_width)))
    clamped_y1 = max(0.0, min(float(y1), float(frame_height)))
    clamped_x2 = max(0.0, min(float(x2), float(frame_width)))
    clamped_y2 = max(0.0, min(float(y2), float(frame_height)))
    
    # Ensure min < max
    if clamped_x2 < clamped_x1:
        clamped_x1, clamped_x2 = clamped_x2, clamped_x1
    if clamped_y2 < clamped_y1:
        clamped_y1, clamped_y2 = clamped_y2, clamped_y1
        
    abs_width = clamped_x2 - clamped_x1
    abs_height = clamped_y2 - clamped_y1
    
    # Normalize to 0-100 percentage
    norm_x = (clamped_x1 / frame_width) * 100.0 if frame_width > 0 else 0.0
    norm_y = (clamped_y1 / frame_height) * 100.0 if frame_height > 0 else 0.0
    norm_w = (abs_width / frame_width) * 100.0 if frame_width > 0 else 0.0
    norm_h = (abs_height / frame_height) * 100.0 if frame_height > 0 else 0.0
    
    return BoundingBox(
        x1=round(clamped_x1, 1),
        y1=round(clamped_y1, 1),
        x2=round(clamped_x2, 1),
        y2=round(clamped_y2, 1),
        x=round(norm_x, 2),
        y=round(norm_y, 2),
        width=round(norm_w, 2),
        height=round(norm_h, 2)
    )
