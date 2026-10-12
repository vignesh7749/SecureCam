import os
from pathlib import Path

class Settings:
    PROJECT_NAME: str = "SECURECAM Computer Vision Backend"
    VERSION: str = "2.0.0"
    API_V1_PREFIX: str = "/api/v1"
    
    # Paths
    BASE_DIR: Path = Path(__file__).resolve().parent.parent
    UPLOADS_DIR: Path = BASE_DIR / "uploads"
    SAMPLES_DIR: Path = BASE_DIR / "samples"
    OUTPUTS_DIR: Path = BASE_DIR / "outputs"
    MODELS_DIR: Path = BASE_DIR / "models"
    
    # Model configuration
    MODEL_NAME: str = os.getenv("MODEL_NAME", "yolov8n.pt")
    CONFIDENCE_THRESHOLD: float = float(os.getenv("CONFIDENCE_THRESHOLD", "0.28"))
    IOU_THRESHOLD: float = float(os.getenv("IOU_THRESHOLD", "0.45"))
    DEVICE: str = os.getenv("DEVICE", "auto") # auto, cuda, cpu
    IMG_SIZE: int = int(os.getenv("IMG_SIZE", "768"))
    MAX_DETECTIONS: int = int(os.getenv("MAX_DETECTIONS", "300"))
    
    # Surveillance classes: None detects all standard object categories (persons, vehicles, animals, luggage)
    SURVEILLANCE_CLASSES = None
    
    # Tracking configuration (ByteTrack)
    TRACKER_TYPE: str = os.getenv("TRACKER_TYPE", "bytetrack")
    TRACK_HIGH_THRESH: float = float(os.getenv("TRACK_HIGH_THRESH", "0.25"))
    TRACK_LOW_THRESH: float = float(os.getenv("TRACK_LOW_THRESH", "0.10"))
    NEW_TRACK_THRESH: float = float(os.getenv("NEW_TRACK_THRESH", "0.25"))
    TRACK_BUFFER: int = int(os.getenv("TRACK_BUFFER", "60"))
    MATCH_THRESH: float = float(os.getenv("MATCH_THRESH", "0.80"))
    MIN_TRACK_HITS: int = int(os.getenv("MIN_TRACK_HITS", "1"))
    MAX_TRAJECTORY_POINTS: int = int(os.getenv("MAX_TRAJECTORY_POINTS", "50"))

    # Benchmark configuration
    SUPPORTED_IMG_SIZES: list = [640, 960, 1280]
    SUPPORTED_MODELS: list = ["yolov8n.pt", "yolov8s.pt", "yolov8m.pt"]

    # Novelty & Unknown Object Intelligence configuration (Stage 4)
    NOVELTY_ENABLED: bool = os.getenv("NOVELTY_ENABLED", "true").lower() == "true"
    NOVELTY_MODEL: str = os.getenv("NOVELTY_MODEL", "dinov2_vits14")
    NOVELTY_THRESHOLD: float = float(os.getenv("NOVELTY_THRESHOLD", "65.0"))
    UNKNOWN_CONFIRMATION_FRAMES: int = int(os.getenv("UNKNOWN_CONFIRMATION_FRAMES", "5"))
    EMBEDDING_INTERVAL_FRAMES: int = int(os.getenv("EMBEDDING_INTERVAL_FRAMES", "3"))
    MIN_CROP_SIZE: int = int(os.getenv("MIN_CROP_SIZE", "28"))
    MAX_EMBEDDING_HISTORY: int = int(os.getenv("MAX_EMBEDDING_HISTORY", "30"))
    WEIGHT_VISUAL: float = float(os.getenv("WEIGHT_VISUAL", "0.65"))
    WEIGHT_DETECTOR: float = float(os.getenv("WEIGHT_DETECTOR", "0.35"))
    
    # Video processing
    PROCESS_EVERY_N_FRAMES: int = int(os.getenv("PROCESS_EVERY_N_FRAMES", "1"))
    MAX_UPLOAD_SIZE_BYTES: int = 500 * 1024 * 1024 # 500MB
    ALLOWED_EXTENSIONS: set = {".mp4", ".avi", ".mov", ".mkv", ".webm"}

    # Detection Profiles configuration
    PROFILE_CONFIGS: dict = {
        "BALANCED": {"imgsz": 640, "conf": 0.35, "iou": 0.45},
        "PRECISION": {"imgsz": 960, "conf": 0.50, "iou": 0.45},
        "PERFORMANCE": {"imgsz": 640, "conf": 0.25, "iou": 0.45},
    }
    
    # CORS
    CORS_ORIGINS: list = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "*"
    ]

settings = Settings()

# Ensure directories exist
settings.UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
settings.SAMPLES_DIR.mkdir(parents=True, exist_ok=True)
settings.OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)
settings.MODELS_DIR.mkdir(parents=True, exist_ok=True)
