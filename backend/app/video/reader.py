from pathlib import Path
from typing import Generator, Tuple, Optional
import cv2
import numpy as np
import logging

logger = logging.getLogger("securecam.video_reader")

class VideoReader:
    """
    Sequential video frame reader abstraction.
    Streams frames one by one without allocating excessive system memory.
    """
    def __init__(self, video_path: Path):
        self.video_path = video_path
        self.cap: Optional[cv2.VideoCapture] = None
        self.width: int = 0
        self.height: int = 0
        self.fps: float = 30.0
        self.total_frames: int = 0

    def __enter__(self) -> "VideoReader":
        self.open()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()

    def open(self):
        if not self.video_path.exists():
            raise FileNotFoundError(f"Video file does not exist: {self.video_path}")
            
        self.cap = cv2.VideoCapture(str(self.video_path))
        if not self.cap.isOpened():
            raise ValueError(f"Failed to open video capture stream: {self.video_path}")
            
        self.width = int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        self.height = int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        self.fps = float(self.cap.get(cv2.CAP_PROP_FPS)) or 30.0
        fc = int(self.cap.get(cv2.CAP_PROP_FRAME_COUNT))
        if fc > 0:
            self.total_frames = fc
        else:
            counted = 0
            while True:
                ret = self.cap.grab()
                if not ret:
                    break
                counted += 1
            self.total_frames = max(1, counted)
            self.cap.release()
            self.cap = cv2.VideoCapture(str(self.video_path))

    def close(self):
        if self.cap is not None:
            self.cap.release()
            self.cap = None

    def frames(self, step: int = 1) -> Generator[Tuple[int, float, np.ndarray], None, None]:
        """
        Yields (frame_index, timestamp_seconds, frame_bgr).
        Supports skipping frames using `step` to maintain real-time performance.
        """
        if self.cap is None:
            self.open()

        frame_idx = 0
        while self.cap.isOpened():
            ret, frame = self.cap.read()
            if not ret or frame is None:
                break
                
            if frame_idx % step == 0:
                timestamp = round(frame_idx / self.fps, 3)
                yield frame_idx, timestamp, frame
                
            frame_idx += 1
