from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field

class BoundingBox(BaseModel):
    # Absolute pixel coordinates
    x1: float = Field(..., description="Top-left x in pixels")
    y1: float = Field(..., description="Top-left y in pixels")
    x2: float = Field(..., description="Bottom-right x in pixels")
    y2: float = Field(..., description="Bottom-right y in pixels")
    # Normalized percentage coordinates (0.0 to 100.0) for responsive frontend overlays
    x: float = Field(..., description="Normalized top-left x (0-100%)")
    y: float = Field(..., description="Normalized top-left y (0-100%)")
    width: float = Field(..., description="Normalized width (0-100%)")
    height: float = Field(..., description="Normalized height (0-100%)")

class Detection(BaseModel):
    id: str = Field(..., description="Unique temporary detection ID")
    classId: int = Field(..., description="COCO integer class index")
    className: str = Field(..., description="Detected class label, e.g. person, car")
    confidence: float = Field(..., description="Detection confidence score (0.0 - 1.0)")
    box: BoundingBox = Field(..., description="Bounding box coordinates")
    timestamp: float = Field(..., description="Video timestamp in seconds")
    frameIndex: int = Field(..., description="Video frame sequence index")

class FrameDetections(BaseModel):
    frameIndex: int
    timestamp: float
    detections: List[Detection] = []
    fps: float
    inferenceLatencyMs: float

class AnalysisInitResponse(BaseModel):
    analysisId: str
    videoId: str
    status: str
    message: str

class AnalysisProgressResponse(BaseModel):
    analysisId: str
    videoId: str
    status: str  # queued, processing, completed, failed, cancelled
    progress: float  # 0.0 to 100.0
    currentFrame: int
    totalFrames: int
    fps: float
    processedFrames: int
    detectionsCount: int
    durationSeconds: float
    error: Optional[str] = None

class VideoMetadata(BaseModel):
    videoId: str
    filename: str
    size: int
    duration: float
    durationFormatted: str
    width: int
    height: int
    fps: float
    codec: str
    frameCount: int

class SampleVideoItem(BaseModel):
    id: str
    filename: str
    displayName: str
    sourceUrl: str
    streamUrl: str
    duration: float
    durationFormatted: str
    fps: float
    width: int
    height: int
    resolution: str
    fileSize: int
    format: str
    codec: str
    frameCount: int
    # Compatibility aliases
    videoId: Optional[str] = None
    size: Optional[int] = None

class SingleFrameDetectionRequest(BaseModel):
    confidenceThreshold: Optional[float] = None
    iouThreshold: Optional[float] = None

class SystemHealthResponse(BaseModel):
    status: str
    version: str
    model: Dict[str, Any]
    device: Dict[str, Any]
