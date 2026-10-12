from pathlib import Path
from typing import Callable, Optional, List
import time
import logging

from app.config import settings
from app.video.reader import VideoReader
from app.detection.detector import ObjectDetector
from app.detection.schemas import FrameDetections, Detection
from app.tracking.tracker import ByteTrackManager
from app.tracking.schemas import FrameTracks
from app.novelty.novelty_engine import NoveltyEngine
from app.zones.dwell_engine import ZoneDwellEngine
from app.zones.zone_manager import zone_manager
from app.zones.schemas import SecurityZone

logger = logging.getLogger("securecam.video_processor")

class VideoStreamProcessor:
    """
    Coordinates sequential video frame reading with:
    1. YOLO object detection
    2. Detection quality control (validation & clamping)
    3. ByteTrack persistent multi-object tracking
    4. Trajectory and pixel velocity calculation
    5. Stage 4 Visual Embedding & Multi-Signal Novelty Intelligence
    6. Latency telemetry (detection, tracking, embedding, novelty, total) and throughput FPS
    """
    def __init__(
        self,
        video_path: Path,
        detector: Optional[ObjectDetector] = None,
        tracker: Optional[ByteTrackManager] = None,
        novelty_engine: Optional[NoveltyEngine] = None,
        zone_engine: Optional[ZoneDwellEngine] = None,
        zones: Optional[List[SecurityZone]] = None,
        process_every_n_frames: Optional[int] = None,
        enable_novelty: bool = True,
        enable_zones: bool = True
    ):
        self.video_path = video_path
        self.detector = detector or ObjectDetector()
        self.tracker = tracker or ByteTrackManager()
        self.novelty_engine = novelty_engine if novelty_engine is not None else (NoveltyEngine() if (settings.NOVELTY_ENABLED and enable_novelty) else None)
        self.zone_engine = zone_engine if zone_engine is not None else (ZoneDwellEngine() if enable_zones else None)
        self.zones = zones
        self.step = max(1, process_every_n_frames if process_every_n_frames is not None else settings.PROCESS_EVERY_N_FRAMES)

    def process(
        self,
        on_tracks_callback: Optional[Callable[[FrameTracks], None]] = None,
        on_frame_callback: Optional[Callable[[FrameDetections], None]] = None,
        on_progress_callback: Optional[Callable[[int, int, float, float], None]] = None,
        stop_check: Optional[Callable[[], bool]] = None
    ):
        with VideoReader(self.video_path) as reader:
            total_frames = reader.total_frames
            video_fps = reader.fps
            processed_count = 0
            start_wall_time = time.time()
            last_report_time = start_wall_time

            for frame_idx, timestamp, frame in reader.frames(step=self.step):
                if stop_check and stop_check():
                    logger.info(f"Processing cancelled by caller at frame {frame_idx}.")
                    break

                h, w = frame.shape[:2]

                # 1. YOLO Object Detection
                boxes, det_latency_ms, names = self.detector.predict_boxes(frame)
                raw_count = len(boxes) if boxes is not None else 0

                # 2. ByteTrack Multi-Object Tracking & Quality Control
                tracks, track_latency_ms = self.tracker.update(
                    boxes_input=boxes,
                    frame_width=w,
                    frame_height=h,
                    frame_index=frame_idx,
                    timestamp=timestamp,
                    class_names=names
                )

                # 3. Stage 4 Novelty Intelligence & Visual Embeddings
                emb_latency_sum = 0.0
                nov_latency_sum = 0.0
                active_unknowns = []

                if self.novelty_engine and settings.NOVELTY_ENABLED:
                    for track in tracks:
                        eval_res, e_lat, n_lat = self.novelty_engine.evaluate_track(
                            frame=frame,
                            track=track,
                            frame_index=frame_idx,
                            timestamp=timestamp
                        )
                        emb_latency_sum += e_lat
                        nov_latency_sum += n_lat
                        if eval_res:
                            track.noveltyScore = eval_res.noveltyScore
                            track.noveltyState = eval_res.noveltyState
                            # Rule 4: Novelty score is an attribute of the track.
                            # Only if an object was NEVER recognized as any known class from the start
                            # should it be classified as UNKNOWN.
                            is_known = (
                                track.className.lower() not in ["unknown", "unclassified"]
                                and not track.className.startswith("object_")
                            )
                            if not is_known and eval_res.noveltyState == "CONFIRMED_UNKNOWN":
                                track.isUnknown = True
                            else:
                                track.isUnknown = False

                    active_track_ids = [t.trackId for t in tracks]
                    self.novelty_engine.clean_dead_tracks(active_track_ids)
                    active_unknowns = self.novelty_engine.get_confirmed_unknowns()

                emb_latency_ms = round(emb_latency_sum, 2)
                nov_latency_ms = round(nov_latency_sum, 2)

                # 4. Stage 5 Emergency Zone & Dwell-Time Intelligence
                zone_latency_ms = 0.0
                active_violations = []
                zone_events = []
                alarm_triggered = False

                if self.zone_engine:
                    active_zones = self.zones if self.zones is not None else zone_manager.get_zones()
                    zone_res = self.zone_engine.process_frame(
                        tracks=tracks,
                        zones=active_zones,
                        timestamp=timestamp,
                        source_name=self.video_path.name
                    )
                    zone_latency_ms = zone_res.latency_ms
                    active_violations = [v.model_dump() for v in zone_res.active_violations]
                    zone_events = [e.model_dump() for e in zone_res.new_events]
                    alarm_triggered = zone_res.alarm_triggered

                    # Persist events and violations in zone_manager
                    for v in zone_res.new_violations:
                        zone_manager.record_violation(v)
                    for e in zone_res.new_events:
                        zone_manager.record_event(e)

                total_latency_ms = round(det_latency_ms + track_latency_ms + emb_latency_ms + nov_latency_ms + zone_latency_ms, 2)
                processed_count += 1

                now = time.time()
                pipeline_fps = round(processed_count / max(0.001, (now - start_wall_time)), 1)
                progress_pct = round(min(100.0, (frame_idx / max(1, total_frames)) * 100.0), 1)

                # Assemble structured tracking & novelty result
                frame_tracks = FrameTracks(
                    frameIndex=frame_idx,
                    timestamp=timestamp,
                    videoFps=video_fps,
                    detectionLatencyMs=det_latency_ms,
                    trackingLatencyMs=track_latency_ms,
                    embeddingLatencyMs=emb_latency_ms,
                    noveltyLatencyMs=nov_latency_ms,
                    zoneLatencyMs=zone_latency_ms,
                    totalLatencyMs=total_latency_ms,
                    pipelineFps=pipeline_fps,
                    tracks=tracks,
                    unknownObjects=active_unknowns,
                    activeViolations=active_violations,
                    zoneEvents=zone_events,
                    alarmTriggered=alarm_triggered,
                    rawDetectionsCount=raw_count
                )

                if on_tracks_callback:
                    on_tracks_callback(frame_tracks)

                # Legacy detections callback compatibility
                if on_frame_callback:
                    detections = [
                        Detection(
                            id=t.id,
                            classId=t.classId,
                            className=t.className,
                            confidence=t.confidence,
                            box=t.box,
                            timestamp=timestamp,
                            frameIndex=frame_idx
                        )
                        for t in tracks
                    ]
                    on_frame_callback(FrameDetections(
                        frameIndex=frame_idx,
                        timestamp=timestamp,
                        detections=detections,
                        fps=pipeline_fps,
                        inferenceLatencyMs=total_latency_ms
                    ))

                if on_progress_callback and (now - last_report_time > 0.2 or frame_idx >= total_frames - self.step):
                    on_progress_callback(frame_idx, total_frames, progress_pct, pipeline_fps)
                    last_report_time = now

                # Cooperative micro-yield to ensure HTTP range video streaming is never starved of CPU/GIL
                time.sleep(0.002)

            if self.zone_engine:
                last_ts = timestamp if 'timestamp' in locals() else 0.0
                final_events = self.zone_engine.finalize_all(last_ts)
                for e in final_events:
                    zone_manager.record_event(e)

            total_elapsed = round(time.time() - start_wall_time, 2)
            logger.info(
                f"Completed video processing: {processed_count} frames evaluated in {total_elapsed}s "
                f"(Avg FPS: {round(processed_count / max(0.001, total_elapsed), 1)}, Total tracks: {self.tracker.get_total_tracks_count()})."
            )
