"""
Generates real, browser-compatible H.264 (AVC) MP4 sample videos for SECURECAM.
Uses imageio_ffmpeg.write_frames to ensure full HTML5 <video> support across Chrome, Edge, Firefox, and Safari.
"""
from pathlib import Path
import cv2
import numpy as np
import imageio_ffmpeg
from ultralytics.utils import ASSETS

backend_dir = Path(__file__).resolve().parent
samples_dir = backend_dir / "samples"
samples_dir.mkdir(parents=True, exist_ok=True)

public_samples_dir = backend_dir.parent / "public" / "samples"
public_samples_dir.mkdir(parents=True, exist_ok=True)

uploads_dir = backend_dir / "uploads"
uploads_dir.mkdir(parents=True, exist_ok=True)

def encode_h264(output_path: Path, frames: list, fps: int = 15):
    if not frames:
        return
    h, w = frames[0].shape[:2]
    # Ensure dimensions are even
    w = w - (w % 2)
    h = h - (h % 2)
    
    writer = imageio_ffmpeg.write_frames(
        str(output_path),
        (w, h),
        fps=fps,
        codec="libx264",
        pix_fmt_in="bgr24",
        output_params=["-pix_fmt", "yuv420p", "-movflags", "+faststart"]
    )
    writer.send(None)
    for frame in frames:
        if frame.shape[:2] != (h, w):
            frame = cv2.resize(frame, (w, h))
        writer.send(frame)
    writer.close()
    print(f"Encoded H.264: {output_path.name} ({len(frames)} frames, {w}x{h} @ {fps}fps)")

def main():
    print("Generating H.264 sample videos...")
    bus_img = cv2.imread(str(ASSETS / "bus.jpg"))
    zidane_img = cv2.imread(str(ASSETS / "zidane.jpg"))

    # 1. Street Surveillance (Sample 01)
    frames_street = []
    for i in range(30):
        f = bus_img.copy()
        cv2.putText(f, f"CAM-01 [STREET SURVEILLANCE] 2026-10-02 12:41:{10 + i//15:02d}", (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 229, 255), 2)
        frames_street.append(f)
    encode_h264(samples_dir / "sample_street_surveillance.mp4", frames_street, fps=15)

    # 2. Parking Area (Sample 02)
    frames_parking = []
    h, w = bus_img.shape[:2]
    for i in range(30):
        f = bus_img.copy()
        shift = int((i / 30.0) * 30)
        M = np.float32([[1, 0, shift], [0, 1, 0]])
        f = cv2.warpAffine(f, M, (w, h))
        cv2.putText(f, f"CAM-02 [PARKING AREA] 2026-10-02 12:41:{10 + i//15:02d}", (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 229, 255), 2)
        frames_parking.append(f)
    encode_h264(samples_dir / "sample_parking_area.mp4", frames_parking, fps=15)

    # 3. Campus Walkway (Sample 03)
    frames_campus = []
    for i in range(30):
        f = zidane_img.copy()
        cv2.putText(f, f"CAM-03 [CAMPUS WALKWAY] 2026-10-02 12:41:{10 + i//15:02d}", (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 229, 255), 2)
        frames_campus.append(f)
    encode_h264(samples_dir / "sample_campus_walkway.mp4", frames_campus, fps=15)

    # 4. Crowd Monitoring (Sample 04)
    frames_crowd = []
    for i in range(30):
        f = zidane_img.copy()
        cv2.putText(f, f"CAM-04 [CROWD CONCOURSE] 2026-10-02 12:41:{10 + i//15:02d}", (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 229, 255), 2)
        frames_crowd.append(f)
    encode_h264(samples_dir / "sample_crowd_monitoring.mp4", frames_crowd, fps=15)

    # 5. Vehicle Monitoring (Sample 05)
    encode_h264(samples_dir / "sample_vehicle_monitoring.mp4", frames_parking, fps=15)

    # 6. Unknown Object Scenario (Sample 06)
    frames_unknown = []
    for i in range(30):
        f = bus_img.copy()
        cv2.putText(f, f"CAM-06 [UNKNOWN ANOMALY SCENARIO] 2026-10-02 12:41:{10 + i//15:02d}", (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (245, 158, 11), 2)
        frames_unknown.append(f)
    encode_h264(samples_dir / "sample_unknown_scenario.mp4", frames_unknown, fps=15)

    # 7. Emergency Zone Scenario (Sample 07)
    frames_emergency = []
    for i in range(30):
        f = bus_img.copy()
        cv2.putText(f, f"CAM-07 [EMERGENCY ZONE SCENARIO] 2026-10-02 12:41:{10 + i//15:02d}", (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (239, 68, 68), 2)
        frames_emergency.append(f)
    encode_h264(samples_dir / "sample_emergency_zone.mp4", frames_emergency, fps=15)

    # test_surveillance_objects.mp4
    encode_h264(samples_dir / "test_surveillance_objects.mp4", frames_street, fps=15)

    # Replicate into public/samples and backend/uploads
    for p in samples_dir.glob("*.mp4"):
        (public_samples_dir / p.name).write_bytes(p.read_bytes())
        (uploads_dir / p.name).write_bytes(p.read_bytes())

    print("Successfully generated and distributed all H.264 surveillance samples!")

if __name__ == "__main__":
    main()
