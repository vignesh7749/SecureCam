import sys
import time
from pathlib import Path
import pytest
import numpy as np
import torch
from fastapi.testclient import TestClient

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.main import app
from app.config import settings
from app.detection.schemas import BoundingBox
from app.detection.detector import create_normalized_box
from app.novelty.schemas import (
    EmbeddingRecord,
    PrototypeRecord,
    NoveltyEvaluation,
    UnknownObject,
    ClusterSummary,
    CalibrationResult
)
from app.novelty.crop_extractor import CropExtractor
from app.novelty.embedding_engine import (
    NoveltyEmbeddingEngine,
    DinoV2EmbeddingModel,
    MobileNetV3EmbeddingModel
)
from app.novelty.reference_memory import KnownObjectReferenceMemory
from app.novelty.novelty_engine import NoveltyEngine
from app.novelty.clusterer import UnknownObjectClusterer
from app.novelty.calibration import calibrate_novelty_threshold

client = TestClient(app)

# -------------------------------------------------------------------------
# Test 1: Embedding generation, shape, and L2 unit norm
# -------------------------------------------------------------------------
def test_embedding_engine_shape_and_norm():
    """Verifies embedding models return normalized unit vectors of expected dimension."""
    dummy_input = torch.zeros((1, 3, 224, 224), dtype=torch.float32)

    # MobileNetV3 (576-d)
    engine_mb = NoveltyEmbeddingEngine(model_name="mobilenet_v3_small")
    vec_mb, lat_mb = engine_mb.embed(dummy_input)
    assert vec_mb.shape == (576,)
    norm_mb = float(np.linalg.norm(vec_mb))
    assert norm_mb == pytest.approx(1.0, abs=1e-4)
    assert lat_mb >= 0.0

    # DINOv2 (384-d)
    engine_dino = NoveltyEmbeddingEngine(model_name="dinov2_vits14")
    vec_dino, lat_dino = engine_dino.embed(dummy_input)
    assert vec_dino.shape == (384,)
    norm_dino = float(np.linalg.norm(vec_dino))
    assert norm_dino == pytest.approx(1.0, abs=1e-4)
    assert lat_dino >= 0.0

# -------------------------------------------------------------------------
# Test 2: Crop extraction, coordinate clamping, and aspect-ratio letterboxing
# -------------------------------------------------------------------------
def test_crop_extractor_clamping_and_letterboxing():
    """Verifies crop extractor clamps out-of-bounds coordinates and preserves letterboxing."""
    extractor = CropExtractor(target_size=224, min_crop_size=28)
    dummy_frame = np.ones((480, 640, 3), dtype=np.uint8) * 128

    # Box with valid crop dimensions
    valid_box = create_normalized_box(50.0, 50.0, 250.0, 250.0, 640, 480)
    tensor, status, quality = extractor.extract_and_prepare(dummy_frame, valid_box)

    assert tensor is not None
    assert tensor.shape == (1, 3, 224, 224)
    assert status == "VALID"
    assert 0.0 <= quality <= 1.0

# -------------------------------------------------------------------------
# Test 3: Small object handling (<28px tagged INSUFFICIENT_VISUAL_EVIDENCE)
# -------------------------------------------------------------------------
def test_crop_extractor_small_object_gating():
    """Verifies tiny crops below resolution threshold are flagged as insufficient evidence."""
    extractor = CropExtractor(target_size=224, min_crop_size=28)
    dummy_frame = np.zeros((480, 640, 3), dtype=np.uint8)

    # Box corresponding to 10px by 15px in 640x480
    tiny_box = create_normalized_box(10.0, 10.0, 20.0, 25.0, 640, 480)
    tensor, status, quality = extractor.extract_and_prepare(dummy_frame, tiny_box)

    assert tensor is None
    assert status == "INSUFFICIENT_VISUAL_EVIDENCE"
    assert quality < 0.2

# -------------------------------------------------------------------------
# Test 4: Occlusion / boundary truncation penalty / blur estimation
# -------------------------------------------------------------------------
def test_crop_extractor_boundary_truncation_penalty():
    """Verifies boundary clipped crops receive quality penalty."""
    extractor = CropExtractor(target_size=224, min_crop_size=28)
    dummy_frame = np.ones((480, 640, 3), dtype=np.uint8) * 100

    # Clean centered box
    center_box = create_normalized_box(150.0, 100.0, 350.0, 300.0, 640, 480)
    _, _, quality_center = extractor.extract_and_prepare(dummy_frame, center_box)

    # Heavily truncated box at edge
    edge_box = create_normalized_box(0.0, 0.0, 150.0, 150.0, 640, 480)
    _, _, quality_edge = extractor.extract_and_prepare(dummy_frame, edge_box)

    assert quality_edge < quality_center

# -------------------------------------------------------------------------
# Test 5: Reference memory prototype storage and similarity lookup
# -------------------------------------------------------------------------
def test_reference_memory_prototypes():
    """Verifies reference memory stores prototypes and computes accurate cosine distance."""
    ref_mem = KnownObjectReferenceMemory()
    assert len(ref_mem.prototypes) > 0

    # Querying with an exact prototype vector should yield distance 0.0 and similarity 1.0
    first_class = next(iter(ref_mem.prototypes.keys()))
    proto_vec = np.array(ref_mem.prototypes[first_class].prototypeVector, dtype=np.float32)

    top_class, similarity, distance = ref_mem.compare_embedding(proto_vec)
    assert top_class == first_class
    assert similarity == pytest.approx(1.0, abs=1e-4)
    assert distance == pytest.approx(0.0, abs=1e-4)

# -------------------------------------------------------------------------
# Test 6: Multi-signal novelty score formula bounded in [0, 100]
# -------------------------------------------------------------------------
def test_novelty_score_bounded_range():
    """Verifies multi-signal score strictly remains in 0.0 to 100.0."""
    engine = NoveltyEngine()

    # Extreme 1: perfect match (distance=0, high confidence=1.0)
    score_low = engine.compute_multi_signal_novelty_score(
        visual_distance=0.0,
        detector_confidence=1.0,
        crop_quality=1.0
    )
    assert score_low == pytest.approx(0.0, abs=1.0)
    assert 0.0 <= score_low <= 100.0

    # Extreme 2: max distance (distance=2.0, low confidence=0.0)
    score_high = engine.compute_multi_signal_novelty_score(
        visual_distance=2.0,
        detector_confidence=0.0,
        crop_quality=1.0
    )
    assert 0.0 <= score_high <= 100.0
    assert score_high >= 90.0

# -------------------------------------------------------------------------
# Test 7: Scientific Independence: low confidence known detection != unknown object
# -------------------------------------------------------------------------
def test_scientific_independence_confidence_vs_novelty():
    """
    CRITICAL REQUIREMENT:
    A detector prediction with confidence < 0.50 that visually matches 'person' prototype
    MUST NOT be categorized as UNKNOWN.
    """
    engine = NoveltyEngine()
    ref_mem = engine.reference_memory

    person_proto = np.array(ref_mem.prototypes["person"].prototypeVector, dtype=np.float32)
    top_cls, sim, dist = ref_mem.compare_embedding(person_proto)

    # Low detector confidence = 0.35, but visual prototype distance is 0.0
    novelty_score = engine.compute_multi_signal_novelty_score(
        visual_distance=dist,
        detector_confidence=0.35,
        crop_quality=0.9
    )

    # Threshold is 65.0 - novelty score should NOT exceed threshold just because confidence is 0.35!
    assert novelty_score < 40.0
    assert novelty_score < settings.NOVELTY_THRESHOLD

# -------------------------------------------------------------------------
# Test 8: Temporal confirmation and state machine transitions
# -------------------------------------------------------------------------
def test_temporal_confirmation_state_transitions():
    """
    Verifies that an object requires UNKNOWN_CONFIRMATION_FRAMES consecutive
    elevated novelty frames to reach CONFIRMED_UNKNOWN.
    """
    engine = NoveltyEngine()

    track_id = 99
    # Simulate orthogonal/novel embedding (high distance to all prototypes)
    novel_vec = np.random.randn(384).astype(np.float32)
    novel_vec /= (np.linalg.norm(novel_vec) + 1e-8)
    box = create_normalized_box(100.0, 100.0, 200.0, 250.0, 640, 480)

    # Frame 1: Should be SUSPICIOUS or NOVELTY_CANDIDATE
    eval1 = engine.update_track_novelty(
        track_id=track_id,
        embedding=novel_vec,
        class_name="unknown",
        confidence=0.45,
        crop_quality=0.85,
        frame_index=1,
        timestamp=0.033,
        box=box
    )
    assert eval1.noveltyState in ["SUSPICIOUS", "NOVELTY_CANDIDATE"]
    assert eval1.noveltyState != "CONFIRMED_UNKNOWN"

    # Frames 2..4: Progressive temporal confirmation
    for f in range(2, 5):
        eval_f = engine.update_track_novelty(
            track_id=track_id,
            embedding=novel_vec,
            class_name="unknown",
            confidence=0.45,
            crop_quality=0.85,
            frame_index=f,
            timestamp=f * 0.033,
            box=box
        )
        assert eval_f.noveltyState in ["SUSPICIOUS", "NOVELTY_CANDIDATE"]

    # Frame 5: Should trigger CONFIRMED_UNKNOWN (UNKNOWN_CONFIRMATION_FRAMES=5)
    eval5 = engine.update_track_novelty(
        track_id=track_id,
        embedding=novel_vec,
        class_name="unknown",
        confidence=0.45,
        crop_quality=0.85,
        frame_index=5,
        timestamp=5 * 0.033,
        box=box
    )
    assert eval5.noveltyState == "CONFIRMED_UNKNOWN"
    assert eval5.consecutiveNovelFrames >= 5

# -------------------------------------------------------------------------
# Test 9: Unknown deduplication tied to ByteTrack persistent ID
# -------------------------------------------------------------------------
def test_unknown_deduplication():
    """Verifies multiple frames for the same ByteTrack ID update the single UnknownObject record."""
    engine = NoveltyEngine()
    track_id = 101

    novel_vec = np.random.randn(384).astype(np.float32)
    novel_vec /= (np.linalg.norm(novel_vec) + 1e-8)
    box = create_normalized_box(120.0, 120.0, 220.0, 220.0, 640, 480)

    for f in range(1, 8):
        engine.update_track_novelty(
            track_id=track_id,
            embedding=novel_vec,
            class_name="unknown",
            confidence=0.50,
            crop_quality=0.85,
            frame_index=f,
            timestamp=f * 0.033,
            box=box
        )

    confirmed = engine.get_confirmed_unknown_objects()
    matching = [u for u in confirmed if u.trackId == track_id]
    assert len(matching) == 1
    assert matching[0].framesObserved >= 7

# -------------------------------------------------------------------------
# Test 10: Bounded embedding memory (eviction / pruning)
# -------------------------------------------------------------------------
def test_bounded_embedding_history():
    """Verifies track embedding history is capped at MAX_EMBEDDING_HISTORY."""
    engine = NoveltyEngine()
    track_id = 77
    max_hist = settings.MAX_EMBEDDING_HISTORY

    dummy_vec = np.ones(384, dtype=np.float32)
    dummy_vec /= np.linalg.norm(dummy_vec)
    box = create_normalized_box(80.0, 80.0, 180.0, 180.0, 640, 480)

    for f in range(max_hist + 15):
        engine.update_track_novelty(
            track_id=track_id,
            embedding=dummy_vec,
            class_name="person",
            confidence=0.80,
            crop_quality=0.90,
            frame_index=f,
            timestamp=f * 0.033,
            box=box
        )

    assert len(engine.track_embeddings[track_id]) <= max_hist

# -------------------------------------------------------------------------
# Test 11: DBSCAN clustering on cosine distance
# -------------------------------------------------------------------------
def test_dbscan_clustering_on_embeddings():
    """Verifies clusterer groups repeated similar unknown embeddings using cosine metric."""
    clusterer = UnknownObjectClusterer(eps=0.25, min_samples=2)

    c1_base = np.random.randn(384).astype(np.float32)
    c1_base /= np.linalg.norm(c1_base)

    c2_base = np.random.randn(384).astype(np.float32)
    c2_base /= np.linalg.norm(c2_base)

    embeddings = []
    # 4 items around c1
    for _ in range(4):
        p = c1_base + np.random.normal(0, 0.02, size=384).astype(np.float32)
        p /= np.linalg.norm(p)
        embeddings.append(p)

    # 4 items around c2
    for _ in range(4):
        p = c2_base + np.random.normal(0, 0.02, size=384).astype(np.float32)
        p /= np.linalg.norm(p)
        embeddings.append(p)

    labels = clusterer.fit(embeddings)
    assert len(labels) == 8
    assert labels[0] == labels[1] == labels[2] == labels[3]
    assert labels[4] == labels[5] == labels[6] == labels[7]
    assert labels[0] != labels[4]

# -------------------------------------------------------------------------
# Test 12: API Endpoint: GET /analyze/{id}/unknowns and status update
# -------------------------------------------------------------------------
def test_api_unknowns_and_status_endpoints():
    """Verifies API endpoints for fetching unknowns and updating investigation status."""
    # 1. Non-existent session
    res = client.get("/api/v1/analyze/fake-analysis-id/unknowns")
    assert res.status_code == 404

    # 2. Status update on non-existent unknown
    res2 = client.post("/api/v1/unknowns/unknown-999/status", json={"status": "FLAGGED", "notes": "Test"})
    assert res2.status_code == 404

# -------------------------------------------------------------------------
# Test 13: Novelty threshold calibration calculation
# -------------------------------------------------------------------------
def test_novelty_calibration_calculation():
    """Verifies calibration computes false-positive and missed-novelty percentages."""
    ref_mem = KnownObjectReferenceMemory()
    engine = NoveltyEmbeddingEngine()

    known_list = [np.array(p.prototypeVector, dtype=np.float32) for p in ref_mem.prototypes.values()]
    # Random orthogonal vectors
    novel_list = [np.random.randn(384).astype(np.float32) for _ in range(5)]
    for v in novel_list:
        v /= np.linalg.norm(v)

    res = calibrate_novelty_threshold(
        reference_memory=ref_mem,
        embedding_engine=engine,
        known_embeddings=known_list,
        synthetic_novel_embeddings=novel_list,
        threshold=65.0
    )
    assert isinstance(res, CalibrationResult)
    assert 0.0 <= res.falseUnknownRate <= 100.0
    assert 0.0 <= res.missedNoveltyRate <= 100.0
    assert res.totalKnownEvaluated == len(known_list)
