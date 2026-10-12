import time
import math
import logging
from typing import List, Dict, Tuple, Optional
from collections import deque
from types import SimpleNamespace
import numpy as np
import torch
from ultralytics.engine.results import Boxes
from ultralytics.trackers.byte_tracker import BYTETracker
from ultralytics.trackers.basetrack import BaseTrack

from app.config import settings
from app.detection.schemas import BoundingBox
from app.detection.postprocess import create_normalized_box
from app.tracking.schemas import TrackedObject, TrajectoryPoint, Velocity, Point

logger = logging.getLogger("securecam.tracker")

def _calculate_box_iou(boxA: BoundingBox, boxB: BoundingBox) -> float:
    """Calculates Intersection over Union between two normalized bounding boxes."""
    xA = max(boxA.x, boxB.x)
    yA = max(boxA.y, boxB.y)
    xB = min(boxA.x + boxA.width, boxB.x + boxB.width)
    yB = min(boxA.y + boxA.height, boxB.y + boxB.height)
    interArea = max(0.0, xB - xA) * max(0.0, yB - yA)
    boxAArea = boxA.width * boxA.height
    boxBArea = boxB.width * boxB.height
    unionArea = boxAArea + boxBArea - interArea
    if unionArea <= 0.0:
        return 0.0
    return interArea / unionArea

def _box_center_dist(boxA: BoundingBox, boxB: BoundingBox) -> float:
    """Euclidean distance between box centers in percentage space."""
    cA_x = boxA.x + boxA.width / 2.0
    cA_y = boxA.y + boxA.height / 2.0
    cB_x = boxB.x + boxB.width / 2.0
    cB_y = boxB.y + boxB.height / 2.0
    return math.sqrt((cA_x - cB_x) ** 2 + (cA_y - cB_y) ** 2)

class ByteTrackManager:
    """
    Production-grade ByteTrack wrapper & multi-object tracking manager.
    Coordinates:
    - Ultralytics BYTETracker with Kalman Filter and two-stage low/high association
    - Persistent Track IDs across frames (monotonically assigned, never recycled)
    - Spatial-temporal track stitching for occlusion / scale change recovery
    - Temporal class stabilization with confidence-weighted voting and class locking (hysteresis)
    - Track lifecycle: NEW, ACTIVE, LOST, REIDENTIFIED, REMOVED
    - Center-point trajectories bounded by max_trajectory_points
    - Pixel velocity / relative motion estimation
    - Min-track-hits confirmation filter to eliminate one-frame false flickers
    - Strict bounding box validation and coordinate normalization
    """
    def __init__(
        self,
        track_high_thresh: Optional[float] = None,
        track_low_thresh: Optional[float] = None,
        new_track_thresh: Optional[float] = None,
        track_buffer: Optional[int] = None,
        match_thresh: Optional[float] = None,
        min_track_hits: Optional[int] = None,
        max_trajectory_points: Optional[int] = None,
    ):
        self.track_high_thresh = track_high_thresh or getattr(settings, 'TRACK_HIGH_THRESH', 0.25)
        self.track_low_thresh = track_low_thresh or getattr(settings, 'TRACK_LOW_THRESH', 0.10)
        self.new_track_thresh = new_track_thresh or getattr(settings, 'NEW_TRACK_THRESH', 0.25)
        self.track_buffer = track_buffer or getattr(settings, 'TRACK_BUFFER', 30)
        self.match_thresh = match_thresh or getattr(settings, 'MATCH_THRESH', 0.80)
        self.min_track_hits = min_track_hits if min_track_hits is not None else getattr(settings, 'MIN_TRACK_HITS', 1)
        self.max_trajectory_points = max_trajectory_points or getattr(settings, 'MAX_TRAJECTORY_POINTS', 50)

        self._init_tracker()
        # History store: trackId -> dict of metadata and trajectory deque
        self.track_histories: Dict[int, dict] = {}
        # Stitching map for persistent identity: raw_track_id -> persistent_track_id
        self.track_id_map: Dict[int, int] = {}

    def _init_tracker(self):
        args = SimpleNamespace(
            tracker_type="bytetrack",
            track_high_thresh=self.track_high_thresh,
            track_low_thresh=self.track_low_thresh,
            new_track_thresh=self.new_track_thresh,
            track_buffer=self.track_buffer,
            match_thresh=self.match_thresh,
            fuse_score=True,
            min_box_area=10,
            mot20=False
        )
        self.tracker = BYTETracker(args)

    def reset(self):
        """Resets the tracking state, resets monotonic ID counter, and clears all historical tracks."""
        try:
            BaseTrack._count = 0
        except Exception:
            pass
        self._init_tracker()
        self.track_histories.clear()
        self.track_id_map.clear()
        logger.info("ByteTrack manager state reset.")

    def update(
        self,
        boxes_input: any,
        frame_width: int,
        frame_height: int,
        frame_index: int = 0,
        timestamp: float = 0.0,
        class_names: Optional[Dict[int, str]] = None
    ) -> Tuple[List[TrackedObject], float]:
        """
        Updates the tracker with frame detections and returns active tracked objects.
        Returns:
            Tuple of (active_tracks_list, tracking_latency_ms)
        """
        names = class_names or {}
        t0 = time.time()

        # Format input boxes for BYTETracker
        boxes = None
        if isinstance(boxes_input, Boxes):
            boxes = boxes_input
        elif isinstance(boxes_input, torch.Tensor):
            boxes = Boxes(boxes_input, orig_shape=(frame_height, frame_width))
        elif isinstance(boxes_input, np.ndarray):
            t_boxes = torch.from_numpy(boxes_input).float()
            boxes = Boxes(t_boxes, orig_shape=(frame_height, frame_width))
        elif boxes_input is None or len(boxes_input) == 0:
            boxes = Boxes(torch.empty((0, 6), dtype=torch.float32), orig_shape=(frame_height, frame_width))
        else:
            try:
                t_boxes = torch.tensor(boxes_input, dtype=torch.float32)
                boxes = Boxes(t_boxes, orig_shape=(frame_height, frame_width))
            except Exception as e:
                logger.warning(f"Could not convert input to Boxes: {e}")
                boxes = Boxes(torch.empty((0, 6), dtype=torch.float32), orig_shape=(frame_height, frame_width))

        # Run ByteTrack association
        try:
            tracker_output = self.tracker.update(boxes)
        except Exception as e:
            logger.error(f"ByteTracker update error: {e}", exc_info=True)
            tracker_output = np.empty((0, 8))

        tracking_latency_ms = round((time.time() - t0) * 1000, 2)

        active_tracks: List[TrackedObject] = []
        if tracker_output is None or len(tracker_output) == 0:
            return active_tracks, tracking_latency_ms

        # Iterate over associated tracks
        for row in tracker_output:
            if len(row) < 7:
                continue

            x1, y1, x2, y2 = float(row[0]), float(row[1]), float(row[2]), float(row[3])
            raw_track_id = int(row[4])
            score = float(row[5])
            class_id = int(row[6])
            raw_class_name = names.get(class_id, f"object_{class_id}")

            # Detection Quality Control: reject invalid bounding boxes
            if x2 <= x1 or y2 <= y1:
                logger.warning(f"Rejecting invalid bounding box: ({x1}, {y1}) to ({x2}, {y2})")
                continue

            # Clamping to valid frame boundaries
            clamped_box = create_normalized_box(
                x1=x1,
                y1=y1,
                x2=x2,
                y2=y2,
                frame_width=frame_width,
                frame_height=frame_height
            )

            # Center point in percentage space
            center_x = round(clamped_box.x + clamped_box.width / 2.0, 2)
            center_y = round(clamped_box.y + clamped_box.height / 2.0, 2)

            curr_point = TrajectoryPoint(
                x=center_x,
                y=center_y,
                frameIndex=frame_index,
                timestamp=round(timestamp, 3)
            )

            # Rule 1, 2 & 5: Persistent Object Identity & Spatial Stitching
            if raw_track_id in self.track_id_map:
                effective_id = self.track_id_map[raw_track_id]
            else:
                effective_id = raw_track_id
                # If raw_track_id has not been seen before, check if it stitches to a recently lost track of same class
                if raw_track_id not in self.track_histories and len(self.track_histories) > 0:
                    best_cand_id = None
                    best_match_score = 0.0
                    for prev_id, prev_hist in self.track_histories.items():
                        if prev_id in self.track_id_map.values():
                            continue
                        if prev_hist.get("last_seen_frame", 0) == frame_index:
                            continue
                        frames_ago = frame_index - prev_hist["last_seen_frame"]
                        if 1 <= frames_ago <= 20 and prev_hist.get("hits", 0) >= 2:
                            prev_box = prev_hist.get("last_box")
                            if prev_box is not None:
                                iou = _calculate_box_iou(clamped_box, prev_box)
                                dist = _box_center_dist(clamped_box, prev_box)
                                prev_class = prev_hist.get("locked_class_name") or prev_hist.get("stable_class_name", "")
                                class_match = (
                                    not prev_class
                                    or prev_class.lower() == raw_class_name.lower()
                                    or raw_class_name.lower() in ["unknown", "unclassified"]
                                    or prev_class.lower() in ["unknown", "unclassified"]
                                )
                                if class_match and (iou >= 0.15 or dist <= 12.0):
                                    score_match = iou * 100.0 + max(0.0, 15.0 - dist)
                                    if score_match > best_match_score:
                                        best_match_score = score_match
                                        best_cand_id = prev_id
                    if best_cand_id is not None:
                        self.track_id_map[raw_track_id] = best_cand_id
                        effective_id = best_cand_id
                        logger.info(
                            f"Stitched raw track #{raw_track_id} to persistent Track #{effective_id} "
                            f"(class: '{raw_class_name}')"
                        )
                    else:
                        self.track_id_map[raw_track_id] = effective_id

            track_id = effective_id

            # Track lifecycle & trajectory management
            if track_id not in self.track_histories:
                state = "NEW"
                hits = 1
                history = {
                    "first_seen_ts": timestamp,
                    "last_seen_ts": timestamp,
                    "first_seen_frame": frame_index,
                    "last_seen_frame": frame_index,
                    "hits": hits,
                    "trajectory": deque(maxlen=self.max_trajectory_points),
                    "last_state": "NEW",
                    "class_history": deque(maxlen=30),
                    "locked_class_name": None,
                    "locked_class_id": None,
                    "candidate_class_name": None,
                    "candidate_class_id": None,
                    "candidate_count": 0,
                    "consecutive_alternative_count": 0,
                    "alternative_class_name": None,
                    "alternative_class_id": None,
                    "stable_class_name": raw_class_name,
                    "stable_class_id": class_id,
                    "last_box": clamped_box
                }
                history["trajectory"].append(curr_point)
                self.track_histories[track_id] = history
            else:
                history = self.track_histories[track_id]
                history["hits"] += 1
                hits = history["hits"]

                # Detect re-identification if missed consecutive frames
                frames_missed = frame_index - history["last_seen_frame"]
                if frames_missed > 1:
                    state = "REIDENTIFIED"
                else:
                    state = "ACTIVE"

                history["last_seen_ts"] = timestamp
                history["last_seen_frame"] = frame_index
                history["last_state"] = state
                history["trajectory"].append(curr_point)
                history["last_box"] = clamped_box

            traj_list = list(history["trajectory"])

            # Rule 3: Temporal Class Stabilization & Locking (Hysteresis)
            history["class_history"].append((raw_class_name, class_id, score))

            locked_name = history.get("locked_class_name")
            locked_id = history.get("locked_class_id")

            if locked_name is None:
                # Accumulate evidence: known class with confidence >= 0.35 for >= 2 frames locks the class
                is_known = (
                    raw_class_name.lower() not in ["unknown", "unclassified"]
                    and not raw_class_name.startswith("object_")
                )
                if is_known and score >= 0.35:
                    if history.get("candidate_class_name") == raw_class_name:
                        history["candidate_count"] = history.get("candidate_count", 0) + 1
                    else:
                        history["candidate_class_name"] = raw_class_name
                        history["candidate_class_id"] = class_id
                        history["candidate_count"] = 1

                    if history["candidate_count"] >= 2:
                        history["locked_class_name"] = raw_class_name
                        history["locked_class_id"] = class_id
                        locked_name = raw_class_name
                        locked_id = class_id
                        logger.info(f"Track #{track_id} class LOCKED to '{locked_name}' (conf: {score:.2f})")
            else:
                # Class IS locked: a temporary unknown, lower confidence, or flicker must NOT override locked class.
                # Only transition if an alternative known class appears with high confidence (>= 0.75) for >= 6 consecutive frames.
                if (
                    raw_class_name != locked_name
                    and raw_class_name.lower() not in ["unknown", "unclassified"]
                    and score >= 0.75
                ):
                    if history.get("alternative_class_name") == raw_class_name:
                        history["consecutive_alternative_count"] = history.get("consecutive_alternative_count", 0) + 1
                    else:
                        history["alternative_class_name"] = raw_class_name
                        history["alternative_class_id"] = class_id
                        history["consecutive_alternative_count"] = 1

                    if history["consecutive_alternative_count"] >= 6:
                        logger.info(
                            f"Track #{track_id} class transitioned from '{locked_name}' to '{raw_class_name}' "
                            f"after 6 consecutive high-confidence frames."
                        )
                        history["locked_class_name"] = raw_class_name
                        history["locked_class_id"] = class_id
                        locked_name = raw_class_name
                        locked_id = class_id
                        history["consecutive_alternative_count"] = 0
                        history["alternative_class_name"] = None
                else:
                    history["consecutive_alternative_count"] = 0
                    history["alternative_class_name"] = None

            # Resolve stable class: locked class has absolute priority
            if locked_name is not None:
                stable_class_name = locked_name
                stable_class_id = locked_id
            else:
                # Confidence-weighted majority voting over class history
                votes = {}
                id_map = {}
                for c_n, c_i, c_score in history["class_history"]:
                    w = c_score * (2.0 if c_n.lower() not in ["unknown", "unclassified"] else 0.5)
                    votes[c_n] = votes.get(c_n, 0.0) + w
                    id_map[c_n] = c_i
                best_cls = max(votes.keys(), key=lambda k: votes[k]) if votes else raw_class_name
                stable_class_name = best_cls
                stable_class_id = id_map.get(best_cls, class_id)

            history["stable_class_name"] = stable_class_name
            history["stable_class_id"] = stable_class_id

            # Pixel Velocity / Relative Motion Estimation
            if len(traj_list) >= 2:
                p_prev = traj_list[-2]
                p_curr = traj_list[-1]
                dx_px = (p_curr.x - p_prev.x) * frame_width / 100.0
                dy_px = (p_curr.y - p_prev.y) * frame_height / 100.0
                dt = max(0.001, p_curr.timestamp - p_prev.timestamp)
                vx = dx_px / dt
                vy = dy_px / dt
                speed = math.sqrt(vx**2 + vy**2)
                movement_status = "stationary" if speed < 8.0 else "moving"
            else:
                vx, vy, speed = 0.0, 0.0, 0.0
                movement_status = "moving"

            velocity = Velocity(
                vx=round(vx, 1),
                vy=round(vy, 1),
                speed=round(speed, 1),
                unit="px/s"
            )

            age = frame_index - history["first_seen_frame"] + 1
            duration = round(timestamp - history["first_seen_ts"], 2)

            # Minimum hits confirmation filter to reduce one-frame flickering tracks
            if hits < self.min_track_hits and self.min_track_hits > 1:
                continue

            formatted_id = f"#{track_id:02d}"
            track_obj = TrackedObject(
                id=formatted_id,
                trackId=track_id,
                trackingId=track_id,
                classId=stable_class_id,
                className=stable_class_name,
                confidence=round(score, 4),
                box=clamped_box,
                state=state,
                firstSeen=f"{history['first_seen_ts']:.2f}s",
                lastSeen=f"{timestamp:.2f}s",
                durationSeconds=duration,
                age=age,
                hits=hits,
                velocity=velocity,
                velocityPixelsPerSec=round(speed, 1),
                trajectory=traj_list,
                currentPosition=Point(x=center_x, y=center_y),
                movementStatus=movement_status,
                currentZoneId=None,
                currentZoneName=None,
                dwellTimeInZone=0.0,
                isUnknown=(stable_class_name.lower() in ["unknown", "unclassified"])
            )
            active_tracks.append(track_obj)

        return active_tracks, tracking_latency_ms

    def get_total_tracks_count(self) -> int:
        """Returns total unique track IDs registered during the session."""
        return len(self.track_histories)
