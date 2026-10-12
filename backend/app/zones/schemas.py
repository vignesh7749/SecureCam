import time
from typing import List, Optional, Dict, Any, Literal
from pydantic import BaseModel, Field, field_validator

class ZonePoint(BaseModel):
    x: float = Field(..., description="Normalized x coordinate percentage (0.0 to 100.0)")
    y: float = Field(..., description="Normalized y coordinate percentage (0.0 to 100.0)")

    @field_validator('x', 'y')
    @classmethod
    def validate_coord(cls, v: float) -> float:
        if v < 0.0 or v > 100.0:
            # Allow minor floating point tolerance
            if -0.5 <= v <= 100.5:
                return float(max(0.0, min(100.0, v)))
            raise ValueError(f"Coordinate must be in range [0.0, 100.0], got {v}")
        return float(v)

class ZoneAlertActions(BaseModel):
    visualAlert: bool = Field(default=True, description="Pulsing border and UI banner on violation")
    audibleAlarm: bool = Field(default=True, description="Sound siren / alarm on violation")
    eventLog: bool = Field(default=True, description="Record in persistent security events log")
    webhookNotification: bool = Field(default=False, description="Send outbound webhook trigger")

class SecurityZone(BaseModel):
    id: str = Field(..., description="Unique persistent zone identifier")
    name: str = Field(..., description="Human-readable zone label")
    type: str = Field(default="emergency", description="Zone type: emergency, caution, restricted, perimeter")
    shape: str = Field(default="rectangle", description="Geometry shape: rectangle or polygon")
    points: List[ZonePoint] = Field(..., description="Ordered perimeter vertices in normalized coordinates")
    alertLevel: str = Field(default="critical", description="Severity: low, medium, high, critical")
    stayThresholdSeconds: float = Field(default=10.0, description="Dwell stay threshold in seconds before violation")
    monitoredObjects: List[str] = Field(
        default_factory=lambda: ["person", "vehicle", "unknown"],
        description="Target classes monitored (e.g. person, vehicle, car, bicycle, unknown)"
    )
    alertActions: ZoneAlertActions = Field(default_factory=ZoneAlertActions)
    enabled: bool = Field(default=True, description="Whether zone monitoring is actively armed")
    color: Optional[str] = Field(default=None, description="Hex color for UI rendering")
    createdAt: str = Field(default_factory=lambda: time.strftime('%Y-%m-%d %H:%M:%S', time.localtime()))
    description: Optional[str] = Field(default=None, description="Zone description or purpose")

    @field_validator('shape')
    @classmethod
    def validate_shape(cls, v: str) -> str:
        v_clean = v.lower().strip()
        if v_clean not in ["rectangle", "polygon"]:
            raise ValueError(f"Shape must be 'rectangle' or 'polygon', got '{v}'")
        return v_clean

    @field_validator('points')
    @classmethod
    def validate_points(cls, v: List[ZonePoint]) -> List[ZonePoint]:
        if len(v) < 3:
            raise ValueError(f"A zone must have at least 3 vertices, got {len(v)}")
        return v

    @field_validator('stayThresholdSeconds')
    @classmethod
    def validate_threshold(cls, v: float) -> float:
        if v < 0.1 or v > 3600.0:
            raise ValueError(f"Dwell threshold must be between 0.1s and 3600s, got {v}")
        return float(v)

class ZoneCreateRequest(BaseModel):
    name: str = Field(..., description="Zone name")
    type: str = Field(default="emergency")
    shape: str = Field(default="rectangle")
    points: List[ZonePoint]
    alertLevel: str = Field(default="critical")
    stayThresholdSeconds: float = Field(default=5.0)
    monitoredObjects: List[str] = Field(default_factory=lambda: ["person", "unknown"])
    alertActions: Optional[ZoneAlertActions] = None
    enabled: bool = Field(default=True)
    color: Optional[str] = None
    description: Optional[str] = None

class ZoneUpdateRequest(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    shape: Optional[str] = None
    points: Optional[List[ZonePoint]] = None
    alertLevel: Optional[str] = None
    stayThresholdSeconds: Optional[float] = None
    monitoredObjects: Optional[List[str]] = None
    alertActions: Optional[ZoneAlertActions] = None
    enabled: Optional[bool] = None
    color: Optional[str] = None
    description: Optional[str] = None

class ZoneDwellEpisode(BaseModel):
    """Tracks a single continuous physical stay of an object inside a zone."""
    trackId: int
    zoneId: str
    entryTimestamp: float
    lastSeenTimestamp: float
    exitTimestamp: Optional[float] = None
    dwellTimeSeconds: float = 0.0
    state: str = "ENTERED"  # ENTERED -> INSIDE -> DWELLING -> VIOLATION -> EXITED
    violationTriggered: bool = False
    violationTimestamp: Optional[float] = None
    eventId: Optional[str] = None

class ZoneViolationRecord(BaseModel):
    id: str = Field(..., description="Unique violation record identifier")
    zoneId: str = Field(..., description="Zone identifier")
    zoneName: str = Field(..., description="Zone name")
    objectId: str = Field(..., description="Target object identifier, e.g. track_17")
    trackingId: int = Field(..., description="ByteTrack tracking integer ID")
    objectClass: str = Field(..., description="Detected or novel class name")
    enteredAt: str = Field(..., description="Time string when target entered zone")
    dwellTimeSeconds: float = Field(..., description="Elapsed dwell duration in seconds")
    thresholdSeconds: float = Field(..., description="Configured stay threshold in seconds")
    severity: str = Field(default="critical", description="Severity level: low, medium, high, critical")
    status: str = Field(default="ACTIVE", description="Violation status: ACTIVE, RESOLVED, ACKNOWLEDGED")
    timestamp: float = Field(default=0.0, description="Video timestamp in seconds when violation fired")
    snapshotUrl: Optional[str] = Field(default=None, description="Optional snapshot image URI")

class SecurityEventRecord(BaseModel):
    id: str = Field(..., description="Unique security event identifier")
    timestamp: str = Field(..., description="Formatted timestamp string, e.g. 14:32:08")
    type: str = Field(..., description="Event type: ZONE_ENTRY, ZONE_VIOLATION, ZONE_EXIT, etc.")
    severity: str = Field(default="INFO", description="INFO, WARNING, HIGH, CRITICAL")
    objectId: Optional[str] = None
    trackingId: Optional[int] = None
    objectClass: Optional[str] = None
    zoneId: Optional[str] = None
    zoneName: Optional[str] = None
    dwellTime: Optional[float] = None
    threshold: Optional[float] = None
    description: str = Field(..., description="Descriptive event log message")
    sourceCamera: str = Field(default="Surveillance Stream")
    acknowledged: bool = Field(default=False)
    metadata: Optional[Dict[str, Any]] = None

class ZoneStatusSummary(BaseModel):
    zoneId: str
    name: str
    status: str = "SAFE"  # SAFE, OCCUPIED, DWELLING, VIOLATION, DISABLED
    occupantCount: int = 0
    maxDwellSeconds: float = 0.0
    occupantTrackIds: List[int] = []
