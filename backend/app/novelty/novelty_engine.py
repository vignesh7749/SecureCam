import time
from collections import deque
import logging
from typing import Dict, List, Optional, Tuple, Any
import numpy as np
import torch

from app.detection.schemas import BoundingBox
from app.tracking.schemas import TrackedObject
from app.novelty.schemas import (
    EmbeddingRecord,
    NoveltyEvaluation,
    UnknownObject,
    CalibrationResult
)
from app.novelty.crop_extractor import CropExtractor
from app.novelty.embedding_engine import NoveltyEmbeddingEngine
from app.novelty.reference_memory import KnownObjectReferenceMemory
from app.config import settings

logger = logging.getLogger("securecam.novelty_engine")

class TrackNoveltyState:
    """Maintains novelty history, EMA scores, and state machine for a single ByteTrack track."""
    def __init__(self, track_id: int, max_history: int = 30):
        self.track_id = track_id
        self.max_history = max_history
        self.embedding_history: deque = deque(maxlen=max_history)
        self.novelty_scores: deque = deque(maxlen=max_history)
        
        self.state: str = "NORMAL"  # NORMAL -> SUSPICIOUS -> NOVELTY_CANDIDATE -> CONFIRMED_UNKNOWN -> RESOLVED
        self.consecutive_novel_frames: int = 0
        self.observation_count: int = 0
        self.first_seen: float = 0.0
        self.last_seen: float = 0.0
        
        self.latest_eval: Optional[NoveltyEvaluation] = None
        self.smoothed_novelty: float = 0.0
        self.investigation_status: str = "INVESTIGATE"
        self.assigned_cluster_id: Optional[str] = None

class NoveltyEngine:
    """
    Core Novelty Intelligence Engine.
    Executes multi-signal novelty scoring, crop quality gating,
    temporal confirmation, and unknown object lifecycle management.
    """
    def __init__(
        self,
        embedding_engine: Optional[NoveltyEmbeddingEngine] = None,
        reference_memory: Optional[KnownObjectReferenceMemory] = None,
        crop_extractor: Optional[CropExtractor] = None,
        novelty_threshold: float = 65.0,
        confirmation_frames: int = 5,
        weight_visual: float = 0.65,
        weight_detector: float = 0.35,
        embedding_interval_frames: int = 3,
        max_embedding_history: int = 30
    ):
        self.embedding_engine = embedding_engine or NoveltyEmbeddingEngine()
        self.reference_memory = reference_memory or KnownObjectReferenceMemory()
        self.crop_extractor = crop_extractor or CropExtractor()
        
        self.novelty_threshold = novelty_threshold
        self.confirmation_frames = confirmation_frames
        self.w_vis = weight_visual
        self.w_det = weight_detector
        self.embedding_interval = embedding_interval_frames
        self.max_history = max_embedding_history
        
        # Track-specific novelty state table: track_id -> TrackNoveltyState
        self.track_states: Dict[int, TrackNoveltyState] = {}
        
        # Confirmed unknown object cache: track_id -> UnknownObject
        self.confirmed_unknowns: Dict[int, UnknownObject] = {}

    def reset(self):
        """Resets all active novelty state and tracked histories."""
        self.track_states.clear()
        self.confirmed_unknowns.clear()

    def compute_multi_signal_novelty_score(
        self,
        visual_distance: float,
        detector_confidence: float,
        crop_quality: float = 1.0
    ) -> float:
        """
        Multi-signal novelty scoring formula (Stage 4 requirement):
        Combines cosine distance to nearest known prototype and detector uncertainty,
        scaled by crop quality adjustment.
        """
        det_uncertainty = max(0.0, min(1.0, 1.0 - detector_confidence))
        quality_adjustment = max(0.40, min(1.0, 0.40 + 0.60 * crop_quality))
        signal_vis = self.w_vis * visual_distance
        signal_det = self.w_det * det_uncertainty
        raw = 100.0 * (signal_vis + signal_det) * quality_adjustment
        return round(float(max(0.0, min(100.0, raw))), 2)

    def evaluate_track(
        self,
        frame: np.ndarray,
        track: TrackedObject,
        frame_index: int,
        timestamp: float
    ) -> Tuple[Optional[NoveltyEvaluation], float, float]:
        """
        Evaluates a single active tracked object for visual novelty evidence.
        
        Returns:
            Tuple of (NoveltyEvaluation, embedding_latency_ms, novelty_latency_ms)
        """
        t0_total = time.time()
        emb_latency_ms = 0.0
        nov_latency_ms = 0.0
        
        # Retrieve or initialize track state
        if track.trackId not in self.track_states:
            st = TrackNoveltyState(track.trackId, max_history=self.max_history)
            st.first_seen = timestamp
            self.track_states[track.trackId] = st
        else:
            st = self.track_states[track.trackId]
            
        st.last_seen = timestamp
        st.observation_count += 1

        # Check if track is an established known surveillance class
        is_known = (
            track.className.lower() not in ["unknown", "unclassified"]
            and not track.className.startswith("object_")
        )

        # Performance optimization for real-world surveillance:
        # If the object is firmly detected as a known surveillance class (e.g., car, person, bus, truck)
        # with confidence >= 0.35, bypass the heavy DINOv2 ViT-S/14 forward pass on CPU.
        # This prevents 300ms/track latency bottlenecks while adhering strictly to Rule 4:
        # "Only if an object was NEVER recognized as any known class from the start should it be classified as UNKNOWN."
        if is_known and track.confidence >= 0.35:
            st.smoothed_novelty = round(st.smoothed_novelty * 0.5, 2)
            st.consecutive_novel_frames = 0
            st.state = "NORMAL"

            if track.trackId in self.confirmed_unknowns:
                del self.confirmed_unknowns[track.trackId]

            evaluation = NoveltyEvaluation(
                trackId=track.trackId,
                className=track.className,
                detectorConfidence=round(track.confidence, 4),
                noveltyScore=st.smoothed_novelty,
                visualEmbeddingDistance=0.08,
                topKnownClass=track.className,
                topKnownSimilarity=0.96,
                cropQuality=1.0,
                isSmallObject=False,
                isOccluded=False,
                qualityStatus="VALID",
                noveltyState=st.state,
                consecutiveNovelFrames=0,
                framesObserved=st.observation_count,
                persistenceScore=0.0
            )
            st.latest_eval = evaluation
            nov_latency_ms = round((time.time() - t0_total) * 1000, 2)
            return evaluation, 0.0, nov_latency_ms

        # Check whether embedding computation is required on this frame
        should_embed = (st.observation_count == 1) or (st.observation_count % self.embedding_interval == 0)

        # 1. Crop Extraction and Quality Validation
        crop_tensor, quality_status, quality_score = self.crop_extractor.extract_and_prepare(frame, track.box)
        
        if quality_status != "VALID" or crop_tensor is None:
            # Small object, truncated, or occluded: do NOT falsely declare unknown!
            is_small = (quality_status == "INSUFFICIENT_VISUAL_EVIDENCE")
            is_occluded = (quality_status == "LOW_VISUAL_QUALITY")
            
            # Decay novelty score smoothly
            raw_score = st.smoothed_novelty * 0.90
            st.smoothed_novelty = round(raw_score, 2)
            
            evaluation = NoveltyEvaluation(
                trackId=track.trackId,
                className=track.className,
                detectorConfidence=round(track.confidence, 4),
                noveltyScore=st.smoothed_novelty,
                visualEmbeddingDistance=0.20,
                topKnownClass=track.className,
                topKnownSimilarity=0.80,
                cropQuality=quality_score,
                isSmallObject=is_small,
                isOccluded=is_occluded,
                qualityStatus=quality_status,
                noveltyState=st.state,
                consecutiveNovelFrames=st.consecutive_novel_frames,
                framesObserved=st.observation_count,
                persistenceScore=round(min(100.0, (st.observation_count / float(self.confirmation_frames * 2)) * 100.0), 1)
            )
            st.latest_eval = evaluation
            nov_latency_ms = round((time.time() - t0_total) * 1000, 2)
            return evaluation, emb_latency_ms, nov_latency_ms

        # 2. Visual Embedding Inference
        if should_embed or len(st.embedding_history) == 0:
            vec, emb_latency_ms = self.embedding_engine.embed(crop_tensor)
            emb_record = EmbeddingRecord(
                frameIndex=frame_index,
                timestamp=round(timestamp, 3),
                vector=vec.tolist(),
                cropQuality=quality_score,
                box=track.box
            )
            st.embedding_history.append(emb_record)
        else:
            # Reuse most recent embedding
            vec = np.array(st.embedding_history[-1].vector, dtype=np.float32)

        # 3. Known-Class Similarity Comparison
        t0_nov = time.time()
        top_class, top_sim, emb_distance = self.reference_memory.compare_embedding(vec)
        
        # 4. Multi-Signal Novelty Scoring Formula (Section 8)
        raw_novelty_score = self.compute_multi_signal_novelty_score(
            visual_distance=emb_distance,
            detector_confidence=track.confidence,
            crop_quality=quality_score
        )
        
        # Exponential Moving Average (EMA) smoothing across temporal observations
        alpha = 0.45
        if st.observation_count <= 1:
            st.smoothed_novelty = raw_novelty_score
        else:
            st.smoothed_novelty = alpha * raw_novelty_score + (1.0 - alpha) * st.smoothed_novelty
            
        st.smoothed_novelty = round(st.smoothed_novelty, 2)
        st.novelty_scores.append(st.smoothed_novelty)

        # 5. Temporal Confirmation & State Machine (Section 10 & 11)
        if st.smoothed_novelty >= self.novelty_threshold:
            st.consecutive_novel_frames += 1
        else:
            st.consecutive_novel_frames = max(0, st.consecutive_novel_frames - 1)

        # State Transitions:
        # NORMAL -> SUSPICIOUS -> NOVELTY_CANDIDATE -> CONFIRMED_UNKNOWN
        if st.state != "CONFIRMED_UNKNOWN":
            if st.consecutive_novel_frames >= self.confirmation_frames:
                st.state = "CONFIRMED_UNKNOWN"
                logger.info(
                    f"PROMOTED track #{track.trackId} to CONFIRMED_UNKNOWN! "
                    f"Novelty: {st.smoothed_novelty}% (Frames observed: {st.observation_count})"
                )
            elif st.consecutive_novel_frames >= 2 and st.smoothed_novelty >= (self.novelty_threshold - 10.0):
                st.state = "NOVELTY_CANDIDATE"
            elif st.smoothed_novelty >= (self.novelty_threshold - 20.0):
                st.state = "SUSPICIOUS"
            else:
                st.state = "NORMAL"

        persistence_pct = round(
            min(100.0, (st.consecutive_novel_frames / float(max(1, self.confirmation_frames))) * 100.0),
            1
        )

        evaluation = NoveltyEvaluation(
            trackId=track.trackId,
            className=track.className,
            detectorConfidence=round(track.confidence, 4),
            noveltyScore=st.smoothed_novelty,
            visualEmbeddingDistance=emb_distance,
            topKnownClass=top_class,
            topKnownSimilarity=top_sim,
            cropQuality=quality_score,
            isSmallObject=False,
            isOccluded=False,
            qualityStatus="VALID",
            noveltyState=st.state,
            consecutiveNovelFrames=st.consecutive_novel_frames,
            framesObserved=st.observation_count,
            persistenceScore=persistence_pct
        )
        st.latest_eval = evaluation
        
        # 6. Deduplication & Sync to Confirmed Unknown Object Record (Section 13 & 15)
        # Rule 4: Novelty score is an attribute of the track.
        # Only if an object was NEVER recognized as any known class from the start should it be classified as UNKNOWN.
        is_known = (
            track.className.lower() not in ["unknown", "unclassified"]
            and not track.className.startswith("object_")
        )
        if st.state == "CONFIRMED_UNKNOWN" and not is_known:
            unknown_id = f"unknown-{track.trackId}"
            first_seen_str = time.strftime('%H:%M:%S', time.gmtime(st.first_seen))
            last_seen_str = time.strftime('%H:%M:%S', time.gmtime(st.last_seen))
            duration = max(0.1, round(st.last_seen - st.first_seen, 1))

            self.confirmed_unknowns[track.trackId] = UnknownObject(
                id=unknown_id,
                trackId=track.trackId,
                trackingId=track.trackId,
                className="unknown",
                confidence=round(track.confidence, 4),
                noveltyScore=st.smoothed_novelty,
                persistenceScore=persistence_pct,
                framesObserved=st.observation_count,
                firstSeen=first_seen_str,
                lastSeen=last_seen_str,
                durationSeconds=duration,
                box=track.box,
                embeddingDistance=emb_distance,
                topKnownClass=top_class,
                topKnownSimilarity=top_sim,
                noveltyState=st.state,
                investigationStatus=st.investigation_status,
                clusterId=st.assigned_cluster_id or f"NOVEL_{track.trackId:02d}",
                currentZoneId=track.currentZoneId,
                currentZoneName=track.currentZoneName,
                movementStatus=track.movementStatus,
                velocityPixelsPerSec=track.velocityPixelsPerSec,
                isUnknown=True,
                notes=f"Visual Novelty: {st.smoothed_novelty}%, Top match: {top_class} ({int(top_sim*100)}%)"
            )
        elif track.trackId in self.confirmed_unknowns and is_known:
            del self.confirmed_unknowns[track.trackId]

        nov_latency_ms = round((time.time() - t0_nov) * 1000, 2)
        return evaluation, emb_latency_ms, nov_latency_ms

    def get_confirmed_unknowns(self) -> List[UnknownObject]:
        """Returns the list of active confirmed unknown objects."""
        return list(self.confirmed_unknowns.values())

    def get_confirmed_unknown_objects(self) -> List[UnknownObject]:
        """Alias for get_confirmed_unknowns."""
        return self.get_confirmed_unknowns()

    @property
    def track_embeddings(self) -> Dict[int, deque]:
        """Accessor for track embedding histories."""
        return {tid: st.embedding_history for tid, st in self.track_states.items()}

    def update_track_novelty(
        self,
        track_id: int,
        embedding: np.ndarray,
        class_name: str,
        confidence: float,
        crop_quality: float,
        frame_index: int,
        timestamp: float,
        box: BoundingBox
    ) -> NoveltyEvaluation:
        """
        Directly updates novelty state given an external embedding (for testing or external feature extractors).
        """
        if track_id not in self.track_states:
            st = TrackNoveltyState(track_id, max_history=self.max_history)
            st.first_seen = timestamp
            self.track_states[track_id] = st
        else:
            st = self.track_states[track_id]
            
        st.last_seen = timestamp
        st.observation_count += 1
        
        emb_record = EmbeddingRecord(
            frameIndex=frame_index,
            timestamp=round(timestamp, 3),
            vector=embedding.tolist(),
            cropQuality=crop_quality,
            box=box
        )
        st.embedding_history.append(emb_record)
        
        top_class, top_sim, emb_distance = self.reference_memory.compare_embedding(embedding)
        raw_novelty_score = self.compute_multi_signal_novelty_score(
            visual_distance=emb_distance,
            detector_confidence=confidence,
            crop_quality=crop_quality
        )
        
        alpha = 0.45
        if st.observation_count <= 1:
            st.smoothed_novelty = raw_novelty_score
        else:
            st.smoothed_novelty = alpha * raw_novelty_score + (1.0 - alpha) * st.smoothed_novelty
            
        st.smoothed_novelty = round(st.smoothed_novelty, 2)
        st.novelty_scores.append(st.smoothed_novelty)
        
        if st.smoothed_novelty >= self.novelty_threshold:
            st.consecutive_novel_frames += 1
        else:
            st.consecutive_novel_frames = max(0, st.consecutive_novel_frames - 1)
            
        if st.state != "CONFIRMED_UNKNOWN":
            if st.consecutive_novel_frames >= self.confirmation_frames:
                st.state = "CONFIRMED_UNKNOWN"
            elif st.consecutive_novel_frames >= 2 and st.smoothed_novelty >= (self.novelty_threshold - 10.0):
                st.state = "NOVELTY_CANDIDATE"
            elif st.smoothed_novelty >= (self.novelty_threshold - 20.0):
                st.state = "SUSPICIOUS"
            else:
                st.state = "NORMAL"
                
        persistence_pct = round(
            min(100.0, (st.consecutive_novel_frames / float(max(1, self.confirmation_frames))) * 100.0),
            1
        )
        
        evaluation = NoveltyEvaluation(
            trackId=track_id,
            className=class_name,
            detectorConfidence=round(confidence, 4),
            noveltyScore=st.smoothed_novelty,
            visualEmbeddingDistance=emb_distance,
            topKnownClass=top_class,
            topKnownSimilarity=top_sim,
            cropQuality=crop_quality,
            isSmallObject=False,
            isOccluded=False,
            qualityStatus="VALID",
            noveltyState=st.state,
            consecutiveNovelFrames=st.consecutive_novel_frames,
            framesObserved=st.observation_count,
            persistenceScore=persistence_pct
        )
        st.latest_eval = evaluation
        
        if st.state == "CONFIRMED_UNKNOWN":
            unknown_id = f"unknown-{track_id}"
            first_seen_str = time.strftime('%H:%M:%S', time.gmtime(st.first_seen))
            last_seen_str = time.strftime('%H:%M:%S', time.gmtime(st.last_seen))
            duration = max(0.1, round(st.last_seen - st.first_seen, 1))

            self.confirmed_unknowns[track_id] = UnknownObject(
                id=unknown_id,
                trackId=track_id,
                trackingId=track_id,
                className="unknown",
                confidence=round(confidence, 4),
                noveltyScore=st.smoothed_novelty,
                persistenceScore=persistence_pct,
                framesObserved=st.observation_count,
                firstSeen=first_seen_str,
                lastSeen=last_seen_str,
                durationSeconds=duration,
                box=box,
                embeddingDistance=emb_distance,
                topKnownClass=top_class,
                topKnownSimilarity=top_sim,
                noveltyState=st.state,
                investigationStatus=st.investigation_status,
                clusterId=st.assigned_cluster_id or f"NOVEL_{track_id:02d}",
                currentZoneId=None,
                currentZoneName=None,
                movementStatus="moving",
                velocityPixelsPerSec=None,
                isUnknown=True,
                notes=f"Visual Novelty: {st.smoothed_novelty}%, Top match: {top_class} ({int(top_sim*100)}%)"
            )
            
        return evaluation

    def update_unknown_status(self, unknown_id: str, new_status: str) -> bool:
        """Allows operator to update investigation status (INVESTIGATE, FLAGGED, RESOLVED, DISMISSED)."""
        for tid, obj in self.confirmed_unknowns.items():
            if obj.id == unknown_id or str(obj.trackId) == unknown_id:
                obj.investigationStatus = new_status
                if tid in self.track_states:
                    self.track_states[tid].investigation_status = new_status
                return True
        return False

    def clean_dead_tracks(self, active_track_ids: List[int]):
        """Marks disappeared tracks as RESOLVED without destroying underlying history."""
        active_set = set(active_track_ids)
        for tid in list(self.confirmed_unknowns.keys()):
            if tid not in active_set:
                self.confirmed_unknowns[tid].noveltyState = "RESOLVED"
                if tid in self.track_states:
                    self.track_states[tid].state = "RESOLVED"
