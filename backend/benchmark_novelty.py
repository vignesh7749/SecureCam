import sys
import time
from pathlib import Path
import numpy as np
import torch

backend_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(backend_dir))

from app.config import settings
from app.detection.detector import ObjectDetector
from app.tracking.tracker import ByteTrackManager
from app.tracking.schemas import FrameTracks
from app.novelty.novelty_engine import NoveltyEngine
from app.video.processor import VideoStreamProcessor
from app.novelty.embedding_engine import NoveltyEmbeddingEngine
from app.novelty.reference_memory import KnownObjectReferenceMemory, PrototypeRecord

def benchmark_pipeline(video_path: Path, novelty_engine=None, label="Pipeline"):
    detector = ObjectDetector(confidence_threshold=0.35, img_size=640)
    tracker = ByteTrackManager()
    processor = VideoStreamProcessor(
        video_path=video_path,
        detector=detector,
        tracker=tracker,
        novelty_engine=novelty_engine,
        process_every_n_frames=1
    )

    det_lats, trk_lats, emb_lats, nov_lats, tot_lats = [], [], [], [], []
    total_frames = 0
    t0 = time.time()

    def on_frame(ft: FrameTracks):
        nonlocal total_frames
        det_lats.append(ft.detectionLatencyMs)
        trk_lats.append(ft.trackingLatencyMs)
        emb_lats.append(ft.embeddingLatencyMs)
        nov_lats.append(ft.noveltyLatencyMs)
        tot_lats.append(ft.totalLatencyMs)
        total_frames += 1

    processor.process(on_tracks_callback=on_frame)
    wall_elapsed = max(0.001, time.time() - t0)
    fps = round(total_frames / wall_elapsed, 1)

    print(f"\n=======================================================")
    print(f" BENCHMARK: {label}")
    print(f"=======================================================")
    print(f" Frames Processed: {total_frames}")
    print(f" Wall Clock Time:  {wall_elapsed:.2f} s")
    print(f" Pipeline Throughput: {fps} FPS")
    print(f" Avg Detection Latency: {np.mean(det_lats):.2f} ms")
    print(f" Avg Tracking Latency:  {np.mean(trk_lats):.2f} ms")
    if novelty_engine:
        print(f" Avg Embedding Latency: {np.mean(emb_lats):.2f} ms")
        print(f" Avg Novelty Latency:   {np.mean(nov_lats):.2f} ms")
    print(f" Avg Total Latency:     {np.mean(tot_lats):.2f} ms")
    print(f"=======================================================\n")
    return {
        "label": label,
        "fps": fps,
        "avg_det": round(float(np.mean(det_lats)), 2),
        "avg_trk": round(float(np.mean(trk_lats)), 2),
        "avg_emb": round(float(np.mean(emb_lats)), 2) if novelty_engine else 0.0,
        "avg_nov": round(float(np.mean(nov_lats)), 2) if novelty_engine else 0.0,
        "avg_tot": round(float(np.mean(tot_lats)), 2),
    }

def benchmark_raw_embeddings():
    dummy = torch.randn(1, 3, 224, 224, dtype=torch.float32)
    
    # DINOv2
    dino = NoveltyEmbeddingEngine(model_name="dinov2_vits14")
    # Warmup
    dino.embed(dummy)
    dino_lats = []
    for _ in range(10):
        _, lat = dino.embed(dummy)
        dino_lats.append(lat)
        
    # MobileNetV3
    mb = NoveltyEmbeddingEngine(model_name="mobilenet_v3_small")
    mb.embed(dummy)
    mb_lats = []
    for _ in range(10):
        _, lat = mb.embed(dummy)
        mb_lats.append(lat)

    print("\n-------------------------------------------------------")
    print(" RAW VISUAL EMBEDDING BENCHMARK (10 iterations on CPU):")
    print(f" DINOv2 ViT-S/14 (384-d):     Avg {np.mean(dino_lats):.2f} ms / crop")
    print(f" MobileNetV3 Small (576-d):   Avg {np.mean(mb_lats):.2f} ms / crop")
    print("-------------------------------------------------------\n")

if __name__ == "__main__":
    sample_video = backend_dir / "samples" / "sample_street_surveillance.mp4"
    if not sample_video.exists():
        print(f"Video not found: {sample_video}")
        sys.exit(1)

    print("Running Comparative Benchmark on sample_street_surveillance.mp4...")
    
    # 1. Stage 3 Baseline: YOLOv8 + ByteTrack (No Novelty Engine)
    res_stage3 = benchmark_pipeline(sample_video, novelty_engine=None, label="Stage 3: YOLOv8n + ByteTrack Baseline")

    # 2. Stage 4: YOLOv8 + ByteTrack + DINOv2 ViT-S/14 Novelty Engine
    dino_engine = NoveltyEmbeddingEngine(model_name="dinov2_vits14")
    nov_dino = NoveltyEngine(embedding_engine=dino_engine, embedding_interval_frames=3)
    res_stage4_dino = benchmark_pipeline(sample_video, novelty_engine=nov_dino, label="Stage 4: YOLOv8n + ByteTrack + DINOv2 ViT-S/14")

    # 3. Raw Embedding Latency Profiling
    benchmark_raw_embeddings()
