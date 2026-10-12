import time
import uuid
import logging
from typing import Dict, Optional, Any, List
import cv2
import numpy as np

from app.config import settings
from app.detection.detector import detector as shared_detector, ObjectDetector
from app.tracking.tracker import ByteTrackManager
from app.novelty.novelty_engine import NoveltyEngine
from app.zones.dwell_engine import ZoneDwellEngine
from app.zones.zone_manager import zone_manager

logger = logging.getLogger("securecam.live_service")

class LiveFeedSession:
    """
    Stateful live camera inference session.
    Maintains dedicated ByteTrack object tracker instance so that physical objects
    retain persistent tracking IDs (e.g. Person #01, Car #02) across continuous live frames.
    """
    def __init__(
        self,
        session_id: Optional[str] = None,
        conf_threshold: Optional[float] = None,
        imgsz: Optional[int] = None
    ):
        self.session_id = session_id or str(uuid.uuid4())
        conf = conf_threshold if conf_threshold is not None else settings.CONFIDENCE_THRESHOLD
        res = imgsz if imgsz is not None else settings.IMG_SIZE
        
        self.detector = ObjectDetector(confidence_threshold=conf, img_size=res)
        self.tracker = ByteTrackManager()
        self.novelty_engine = NoveltyEngine() if settings.NOVELTY_ENABLED else None
        self.zone_engine = ZoneDwellEngine()
        
        self.frame_index: int = 0
        self.start_time: float = time.time()
        self.last_frame_time: float = self.start_time
        self.total_processed: int = 0

    def process_frame(
        self,
        image_bytes: bytes,
        client_timestamp: Optional[float] = None
    ) -> Dict[str, Any]:
        """
        Decodes incoming JPEG frame bytes and runs the complete SecureCam intelligence pipeline:
        1. YOLO Object Detection
        2. ByteTrack Persistent Tracking
        3. DINOv2 / Visual Novelty Analysis (if enabled)
        4. Emergency Zone Dwell & Threshold Breach Detection
        5. Real-Time Telemetry and Alarm Signals
        """
        if not image_bytes:
            raise ValueError("Empty frame payload received.")

        nparr = np.frombuffer(image_bytes, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if frame is None:
            raise ValueError("Failed to decode frame as valid image.")

        h, w = frame.shape[:2]
        self.frame_index += 1
        self.total_processed += 1
        now = time.time()
        ts = client_timestamp if (client_timestamp and client_timestamp > 0) else round(now - self.start_time, 2)

        # 1. YOLO Object Detection
        boxes, det_latency_ms, names = self.detector.predict_boxes(frame)
        raw_count = len(boxes) if boxes is not None else 0

        # 2. ByteTrack Multi-Object Tracking & Class Stabilization
        tracks, track_latency_ms = self.tracker.update(
            boxes_input=boxes,
            frame_width=w,
            frame_height=h,
            frame_index=self.frame_index,
            timestamp=ts,
            class_names=names
        )

        # 3. Novelty Engine Evaluation
        emb_latency_sum = 0.0
        nov_latency_sum = 0.0
        active_unknowns = []

        if self.novelty_engine and settings.NOVELTY_ENABLED:
            for track in tracks:
                eval_res, e_lat, n_lat = self.novelty_engine.evaluate_track(
                    frame=frame,
                    track=track,
                    frame_index=self.frame_index,
                    timestamp=ts
                )
                emb_latency_sum += e_lat
                nov_latency_sum += n_lat
                if eval_res:
                    track.noveltyScore = eval_res.noveltyScore
                    track.noveltyState = eval_res.noveltyState
                    is_known = (
                        track.className.lower() not in ["unknown", "unclassified"]
                        and not track.className.startswith("object_")
                    )
                    track.isUnknown = (not is_known and eval_res.noveltyState == "CONFIRMED_UNKNOWN")

            active_track_ids = [t.trackId for t in tracks]
            self.novelty_engine.clean_dead_tracks(active_track_ids)
            active_unknowns = self.novelty_engine.get_confirmed_unknowns()

        emb_latency_ms = round(emb_latency_sum, 2)
        nov_latency_ms = round(nov_latency_sum, 2)

        # 4. Emergency Zone & Dwell-Time Intelligence
        zone_latency_ms = 0.0
        active_violations: List[Dict[str, Any]] = []
        zone_events: List[Dict[str, Any]] = []
        alarm_triggered = False

        if self.zone_engine:
            active_zones = zone_manager.get_zones()
            zone_res = self.zone_engine.process_frame(
                tracks=tracks,
                zones=active_zones,
                timestamp=ts,
                source_name="Live Camera Feed"
            )
            zone_latency_ms = zone_res.latency_ms
            active_violations = [v.model_dump() for v in zone_res.active_violations]
            zone_events = [e.model_dump() for e in zone_res.new_events]
            alarm_triggered = zone_res.alarm_triggered

            # Persist real security events and violations in backend state
            for v in zone_res.new_violations:
                zone_manager.record_violation(v)
            for e in zone_res.new_events:
                zone_manager.record_event(e)

        total_latency_ms = round(det_latency_ms + track_latency_ms + emb_latency_ms + nov_latency_ms + zone_latency_ms, 2)
        fps_instant = round(1000.0 / max(1.0, total_latency_ms), 1)

        return {
            "type": "live_tracks",
            "frameIndex": self.frame_index,
            "timestamp": ts,
            "detectionLatencyMs": det_latency_ms,
            "trackingLatencyMs": track_latency_ms,
            "embeddingLatencyMs": emb_latency_ms,
            "noveltyLatencyMs": nov_latency_ms,
            "zoneLatencyMs": zone_latency_ms,
            "totalLatencyMs": total_latency_ms,
            "pipelineFps": fps_instant,
            "tracks": [t.model_dump() for t in tracks],
            "unknownObjects": [u.model_dump() for u in active_unknowns],
            "rawDetectionsCount": raw_count,
            "activeTracksCount": len(tracks),
            "totalTracksCount": self.tracker.get_total_tracks_count(),
            "activeViolations": active_violations,
            "zoneEvents": zone_events,
            "alarmTriggered": alarm_triggered
        }

class LiveFeedService:
    """Manages active live sessions across concurrent WebSocket clients."""
    def __init__(self):
        self.sessions: Dict[str, LiveFeedSession] = {}

    def create_session(
        self,
        session_id: Optional[str] = None,
        conf_threshold: Optional[float] = None,
        imgsz: Optional[int] = None
    ) -> LiveFeedSession:
        sid = session_id or str(uuid.uuid4())
        session = LiveFeedSession(session_id=sid, conf_threshold=conf_threshold, imgsz=imgsz)
        self.sessions[sid] = session
        logger.info(f"Live feed session created: {sid}")
        return session

    def get_session(self, session_id: str) -> Optional[LiveFeedSession]:
        return self.sessions.get(session_id)

    def close_session(self, session_id: str):
        if session_id in self.sessions:
            del self.sessions[session_id]
            logger.info(f"Live feed session closed: {session_id}")

live_service = LiveFeedService()
