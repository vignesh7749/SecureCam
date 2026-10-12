import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(backend_dir))

from app.services.analysis_service import analysis_service
from app.detection.detector import ObjectDetector
from app.tracking.tracker import ByteTrackManager
from app.video.processor import VideoStreamProcessor
from app.services.sample_service import sample_service

def run_benchmark():
    samples = sample_service.discover_samples()
    if not samples:
        print("No sample videos found in backend/samples/ for benchmark.")
        return
    video_id = samples[0].id
    video_path = analysis_service.get_video_path(video_id)
    print(f"=== EMPIRICAL SURVEILLANCE BENCHMARK EVALUATION ===")
    print(f"Video Source: {video_id} ({video_path.name})")

    configs = [
        {"model": "yolov8n.pt", "img_size": 640, "conf": 0.35},
        {"model": "yolov8n.pt", "img_size": 640, "conf": 0.25},
        {"model": "yolov8n.pt", "img_size": 960, "conf": 0.35},
    ]

    for cfg in configs:
        det = ObjectDetector(img_size=cfg["img_size"], confidence_threshold=cfg["conf"])
        trk = ByteTrackManager()
        results = []
        proc = VideoStreamProcessor(video_path, detector=det, tracker=trk)
        proc.process(on_tracks_callback=lambda ft: results.append(ft))

        n = len(results)
        avg_det = sum(r.detectionLatencyMs for r in results) / n
        avg_trk = sum(r.trackingLatencyMs for r in results) / n
        avg_tot = sum(r.totalLatencyMs for r in results) / n
        avg_fps = sum(r.pipelineFps for r in results) / n
        total_dets = sum(r.rawDetectionsCount for r in results)
        total_tracks = trk.get_total_tracks_count()

        print(
            f"Config [Size={cfg['img_size']}, Conf={cfg['conf']}]: "
            f"Frames={n} | Det={avg_det:.2f}ms | Trk={avg_trk:.2f}ms | "
            f"Total={avg_tot:.2f}ms | PipelineFPS={avg_fps:.2f} | "
            f"RawDetections={total_dets} | UniqueTracks={total_tracks}"
        )

if __name__ == "__main__":
    run_benchmark()
