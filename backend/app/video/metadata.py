import os
from pathlib import Path
import cv2
import logging
from app.detection.schemas import VideoMetadata

logger = logging.getLogger("securecam.video_metadata")

def extract_video_metadata(video_path: Path, video_id: str, original_filename: str) -> VideoMetadata:
    """
    Inspects video file using OpenCV and extracts structural video telemetry.
    Validates that the file has readable streams and valid frame dimensions.
    """
    if not video_path.exists():
        raise FileNotFoundError(f"Video file not found at path: {video_path}")
        
    file_size = os.path.getsize(video_path)
    cap = cv2.VideoCapture(str(video_path))
    
    if not cap.isOpened():
        raise ValueError(f"Unable to open video stream from file '{original_filename}'. The file may be corrupt or encoded in an unsupported codec.")
        
    try:
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        fps = float(cap.get(cv2.CAP_PROP_FPS))
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        fourcc_int = int(cap.get(cv2.CAP_PROP_FOURCC))
        
        # Decode fourcc codec string
        codec_chars = "".join([chr((fourcc_int >> 8 * i) & 0xFF) for i in range(4)])
        codec = codec_chars.strip() if codec_chars.isalnum() else "H.264/AVC"
        
        # Handle zero or negative values
        if fps <= 0 or fps > 240:
            logger.warning(f"Invalid FPS ({fps}) detected for {original_filename}, falling back to 30.0.")
            fps = 30.0
            
        if frame_count <= 0:
            # Fallback: Count frames dynamically if video header is missing total frames
            logger.warning(f"Frame count missing in video header for {original_filename}. Counting frames dynamically...")
            counted = 0
            while True:
                ret = cap.grab()
                if not ret:
                    break
                counted += 1
            frame_count = max(1, counted)
            
        duration = round(frame_count / fps, 2)
        mins = int(duration // 60)
        secs = int(duration % 60)
        duration_formatted = f"{mins:02d}:{secs:02d}"
        
        if width <= 0 or height <= 0:
            raise ValueError(f"Invalid video spatial resolution: {width}x{height}")
            
        return VideoMetadata(
            videoId=video_id,
            filename=original_filename,
            size=file_size,
            duration=duration,
            durationFormatted=duration_formatted,
            width=width,
            height=height,
            fps=round(fps, 2),
            codec=codec,
            frameCount=frame_count
        )
    finally:
        cap.release()
