from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from app.detection.schemas import BoundingBox, Detection

class TrajectoryPoint(BaseModel):
    x: float = Field(..., description="Normalized center x coordinate (0.0 to 100.0%)")
    y: float = Field(..., description="Normalized center y coordinate (0.0 to 100.0%)")
    frameIndex: int = Field(..., description="Frame index where point was recorded")
    timestamp: float = Field(..., description="Video timestamp in seconds")

class Velocity(BaseModel):
    vx: float = Field(..., description="Horizontal pixel velocity dx/dt in px/s")
    vy: float = Field(..., description="Vertical pixel velocity dy/dt in px/s")
    speed: float = Field(..., description="Scalar displacement speed in px/s")
    unit: str = Field(default="px/s", description="Velocity metric unit (pixel velocity / relative motion)")

class Point(BaseModel):
    x: float = Field(..., description="Normalized x coordinate (0.0 to 100.0%)")
    y: float = Field(..., description="Normalized y coordinate (0.0 to 100.0%)")

class TrackedObject(BaseModel):
    id: str = Field(..., description="Formatted string track identifier, e.g. track_1 or #01")
    trackId: int = Field(..., description="Persistent ByteTrack integer ID")
    trackingId: int = Field(..., description="ByteTrack integer ID alias for frontend compatibility")
    classId: int = Field(..., description="COCO integer class index")
    className: str = Field(..., description="Detected class name, e.g. person, car, bus")
    confidence: float = Field(..., description="Detection confidence score (0.0 to 1.0)")
    box: BoundingBox = Field(..., description="Validated normalized and pixel bounding box")
    state: str = Field(..., description="Track lifecycle state: NEW, ACTIVE, LOST, REIDENTIFIED, REMOVED")
    firstSeen: str = Field(..., description="Timestamp or time string when track was first detected")
    lastSeen: str = Field(..., description="Timestamp or time string of most recent detection")
    durationSeconds: float = Field(default=0.0, description="Elapsed seconds since track initialization")
    age: int = Field(default=1, description="Total elapsed frames since track initialization")
    hits: int = Field(default=1, description="Total positive detection hits across frames")
    velocity: Velocity = Field(..., description="Estimated pixel velocity")
    velocityPixelsPerSec: Optional[float] = Field(default=None, description="Displacement speed in px/s for frontend")
    trajectory: List[TrajectoryPoint] = Field(default_factory=list, description="Bounded center point history")
    currentPosition: Point = Field(..., description="Normalized center point coordinates")
    movementStatus: str = Field(default="moving", description="Movement classification: moving, stationary, loitering")
    currentZoneId: Optional[str] = Field(default=None, description="Security zone ID if inside a zone")
    currentZoneName: Optional[str] = Field(default=None, description="Security zone name if inside a zone")
    dwellTimeInZone: Optional[float] = Field(default=0.0, description="Dwell time in zone in seconds")
    isUnknown: bool = Field(default=False, description="Whether object is unknown anomaly (Stage 4/5)")
    noveltyScore: Optional[float] = Field(default=None, description="Measured visual novelty score (0-100)")
    noveltyState: Optional[str] = Field(default=None, description="State: NORMAL, SUSPICIOUS, NOVELTY_CANDIDATE, CONFIRMED_UNKNOWN")
    notes: Optional[str] = Field(default=None, description="Operator notes or automated annotations")

class FrameTracks(BaseModel):
    frameIndex: int = Field(..., description="Video frame index")
    timestamp: float = Field(..., description="Timestamp in seconds")
    videoFps: float = Field(..., description="Source video frame rate")
    detectionLatencyMs: float = Field(..., description="YOLO detection latency in milliseconds")
    trackingLatencyMs: float = Field(..., description="ByteTrack association latency in milliseconds")
    embeddingLatencyMs: float = Field(default=0.0, description="Visual embedding inference latency in milliseconds")
    noveltyLatencyMs: float = Field(default=0.0, description="Novelty scoring and state machine latency in milliseconds")
    totalLatencyMs: float = Field(..., description="Total combined pipeline latency in ms")
    pipelineFps: float = Field(..., description="Real pipeline throughput FPS")
    zoneLatencyMs: float = Field(default=0.0, description="Zone geometry and dwell engine evaluation latency in ms")
    activeViolations: List[Any] = Field(default_factory=list, description="Currently active zone violations on this frame")
    zoneEvents: List[Any] = Field(default_factory=list, description="Discrete zone events triggered on this frame (entry, violation, exit)")
    alarmTriggered: bool = Field(default=False, description="Whether an audible/visual security alarm fired on this frame")
    tracks: List[TrackedObject] = Field(default_factory=list, description="Active confirmed tracks on this frame")
    unknownObjects: List[Any] = Field(default_factory=list, description="Active confirmed unknown objects")
    rawDetectionsCount: int = Field(default=0, description="Total raw detections before tracking association")

class BenchmarkResult(BaseModel):
    model: str = Field(..., description="YOLO model checkpoint name")
    imgSize: int = Field(..., description="Inference input image resolution")
    confThreshold: float = Field(..., description="Confidence threshold used")
    device: str = Field(..., description="Execution compute device")
    avgDetectionLatencyMs: float = Field(..., description="Mean YOLO detection latency in ms")
    avgTrackingLatencyMs: float = Field(..., description="Mean ByteTrack latency in ms")
    avgZoneLatencyMs: Optional[float] = Field(default=0.0, description="Mean zone spatial analysis latency in ms")
    avgTotalLatencyMs: float = Field(..., description="Mean total pipeline latency in ms")
    pipelineFps: float = Field(..., description="Average processing throughput FPS")
    totalFrames: int = Field(..., description="Total evaluated frames")
    totalDetections: int = Field(..., description="Total bounding boxes detected")
    totalTracks: int = Field(..., description="Total unique track IDs registered")
