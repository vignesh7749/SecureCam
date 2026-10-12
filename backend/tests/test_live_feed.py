import io
import time
import base64
import sys
from pathlib import Path
import pytest
import numpy as np
import cv2

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def create_synthetic_jpeg(width: int = 640, height: int = 480, draw_rect: bool = True) -> bytes:
    """Generates an in-memory JPEG image with an artificial object pattern."""
    img = np.zeros((height, width, 3), dtype=np.uint8)
    # Background gradient
    img[:, :, 0] = np.linspace(30, 80, width, dtype=np.uint8)
    img[:, :, 1] = np.linspace(40, 90, height, dtype=np.uint8)[:, None]
    img[:, :, 2] = 50

    if draw_rect:
        # Draw high-contrast shapes simulating objects
        cv2.rectangle(img, (150, 150), (350, 400), (200, 200, 200), -1)
        cv2.circle(img, (250, 200), 40, (255, 255, 255), -1)

    _, encoded = cv2.imencode('.jpg', img, [cv2.IMWRITE_JPEG_QUALITY, 85])
    return encoded.tobytes()

def test_live_feed_websocket_connection_and_ping():
    """Validates WebSocket connection handshake and ping/pong."""
    with client.websocket_connect("/ws/live-feed") as ws:
        init_msg = ws.receive_json()
        assert init_msg["type"] == "live_connected"
        assert "sessionId" in init_msg

        # Test text ping
        ws.send_text("ping")
        resp = ws.receive_text()
        assert resp == "pong"

        # Test JSON ping
        ws.send_json({"type": "ping"})
        json_resp = ws.receive_json()
        assert json_resp["type"] == "pong"

def test_live_feed_binary_frame_inference():
    """Validates streaming binary JPEG frames through YOLO and ByteTrack."""
    frame_bytes = create_synthetic_jpeg(640, 480)

    with client.websocket_connect("/ws/live-feed") as ws:
        init_msg = ws.receive_json()
        assert init_msg["type"] == "live_connected"

        # Send binary frame
        ws.send_bytes(frame_bytes)
        result = ws.receive_json()

        assert result["type"] == "live_tracks"
        assert result["frameIndex"] == 1
        assert "detectionLatencyMs" in result
        assert "trackingLatencyMs" in result
        assert "totalLatencyMs" in result
        assert "pipelineFps" in result
        assert isinstance(result["tracks"], list)
        assert isinstance(result["activeViolations"], list)
        assert isinstance(result["zoneEvents"], list)
        assert isinstance(result["alarmTriggered"], bool)

def test_live_feed_base64_json_frame():
    """Validates streaming base64-encoded JPEG inside JSON payload."""
    frame_bytes = create_synthetic_jpeg(640, 480)
    b64_str = f"data:image/jpeg;base64,{base64.b64encode(frame_bytes).decode('utf-8')}"

    with client.websocket_connect("/ws/live-feed") as ws:
        init_msg = ws.receive_json()
        assert init_msg["type"] == "live_connected"

        ws.send_json({
            "type": "frame",
            "image": b64_str,
            "timestamp": 1.25
        })
        result = ws.receive_json()

        assert result["type"] == "live_tracks"
        assert result["frameIndex"] == 1
        assert result["timestamp"] == 1.25
        assert "tracks" in result

def test_live_feed_track_continuity():
    """
    Validates persistent tracking continuity across sequential frames:
    frame index must increment monotonically and tracker must maintain internal state.
    """
    frame_1 = create_synthetic_jpeg(640, 480)
    frame_2 = create_synthetic_jpeg(640, 480)

    with client.websocket_connect("/ws/live-feed") as ws:
        ws.receive_json()  # init

        ws.send_bytes(frame_1)
        res_1 = ws.receive_json()
        assert res_1["frameIndex"] == 1

        ws.send_bytes(frame_2)
        res_2 = ws.receive_json()
        assert res_2["frameIndex"] == 2
        assert res_2["totalTracksCount"] >= res_1["totalTracksCount"]

def test_live_feed_malformed_frame_handling():
    """Validates graceful error reporting on invalid image bytes without server crash."""
    with client.websocket_connect("/ws/live-feed") as ws:
        ws.receive_json()  # init

        # Send corrupted garbage bytes
        ws.send_bytes(b"not-a-valid-jpeg-image-stream")
        err_msg = ws.receive_json()
        assert err_msg["type"] == "frame_error"
        assert "error" in err_msg

def test_live_feed_http_endpoint():
    """Validates HTTP single-frame inference endpoint."""
    frame_bytes = create_synthetic_jpeg(640, 480)
    response = client.post(
        "/api/v1/live/frame",
        files={"file": ("frame.jpg", io.BytesIO(frame_bytes), "image/jpeg")}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["type"] == "live_tracks"
    assert "tracks" in data
    assert "detectionLatencyMs" in data
