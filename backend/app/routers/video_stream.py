"""
MJPEG video stream router.

Serves real video frames (from test clips) or a placeholder frame for each camera,
with detection bounding boxes drawn directly on the video using OpenCV.
The browser can display these with a simple <img src="..."> tag.
"""

import asyncio
import json
import logging
from pathlib import Path

import cv2
import numpy as np
import redis.asyncio as aioredis
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from app.core.config import settings

logger = logging.getLogger(__name__)
router = APIRouter(tags=["video-stream"])

# Map camera UUIDs (from seed.py) to test-data video filenames.
VIDEO_MAP = {
    "00000000-0000-4000-8000-000000000001": "clip_peshawar_streets.mp4",
    "00000000-0000-4000-8000-000000000002": "clip_peshawar_bazaar.mp4",
    "00000000-0000-4000-8000-000000000003": "clip_charsadda_drone.mp4",
    "00000000-0000-4000-8000-000000000004": "clip_peshawar_walking.mp4",
    "00000000-0000-4000-8000-000000000005": "clip_rawalpindi_streets.mp4",
}

# BGR colours for detection classes
DETECTION_COLORS = {
    "person": (0, 240, 255),     # cyan
    "vehicle": (0, 255, 136),    # green
    "bike": (0, 170, 255),       # amber
    "bag": (255, 45, 120),       # magenta
}

STREAM_WIDTH = 640
STREAM_HEIGHT = 360


# -----------------------------------------------------------------------
# Drawing helpers
# -----------------------------------------------------------------------

def draw_detections(frame: np.ndarray, detections: list[dict]) -> np.ndarray:
    """Draw bounding-box rectangles and labels on *frame* (modified in-place)."""
    h, w = frame.shape[:2]
    for det in detections:
        bbox = det.get("bbox", {})
        # Pipeline stores coordinates in the full 1920x1080 simulation space;
        # scale them down to the stream resolution.
        src_w = 1920
        src_h = 1080
        x = int(bbox.get("x", 0) * w / src_w)
        y = int(bbox.get("y", 0) * h / src_h)
        bw = int(bbox.get("w", bbox.get("width", 50)) * w / src_w)
        bh = int(bbox.get("h", bbox.get("height", 50)) * h / src_h)

        obj_type = det.get("object_class", det.get("object_type", "other"))
        color = DETECTION_COLORS.get(obj_type, (100, 100, 100))
        conf = det.get("confidence", 0)

        cv2.rectangle(frame, (x, y), (x + bw, y + bh), color, 2)

        label = f"{obj_type} {conf:.0%}"
        lbl_sz = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.4, 1)[0]
        cv2.rectangle(frame, (x, y - lbl_sz[1] - 6), (x + lbl_sz[0] + 4, y), color, -1)
        cv2.putText(frame, label, (x + 2, y - 4), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 0, 0), 1)

    return frame


def make_placeholder_frame(
    camera_name: str, width: int = STREAM_WIDTH, height: int = STREAM_HEIGHT
) -> np.ndarray:
    """Dark frame with a grid pattern and camera name text."""
    frame = np.zeros((height, width, 3), dtype=np.uint8)
    frame[:] = (12, 8, 3)
    for i in range(0, width, 60):
        cv2.line(frame, (i, 0), (i, height), (20, 15, 5), 1)
    for i in range(0, height, 60):
        cv2.line(frame, (0, i), (width, i), (20, 15, 5), 1)
    cv2.putText(frame, camera_name, (20, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 240, 255), 1)
    cv2.putText(
        frame,
        "NO VIDEO FEED",
        (width // 2 - 80, height // 2),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.6,
        (74, 106, 138),
        1,
    )
    return frame


# -----------------------------------------------------------------------
# MJPEG generator
# -----------------------------------------------------------------------

async def generate_mjpeg(camera_id: str, camera_name: str, request: Request):
    """Yield MJPEG frames forever (until client disconnects)."""
    video_file = VIDEO_MAP.get(camera_id)
    video_dir = Path(settings.VIDEO_DIR)

    # Try to open a Redis connection for detection overlay
    redis_client = None
    try:
        redis_client = aioredis.from_url(settings.REDIS_URL)
    except Exception:
        logger.debug("Could not connect to Redis for stream overlay")

    cap = None
    if video_file:
        video_path = video_dir / video_file
        if video_path.exists():
            cap = cv2.VideoCapture(str(video_path))
            if not cap.isOpened():
                cap = None

    try:
        while True:
            if await request.is_disconnected():
                break

            # Read frame
            if cap is not None and cap.isOpened():
                ret, frame = cap.read()
                if not ret:
                    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    continue
                frame = cv2.resize(frame, (STREAM_WIDTH, STREAM_HEIGHT))
            else:
                frame = make_placeholder_frame(camera_name)

            # Overlay detections stored by the pipeline in Redis
            if redis_client:
                try:
                    data = await redis_client.get(f"frame:{camera_id}")
                    if data:
                        raw = data.decode() if isinstance(data, bytes) else data
                        frame_data = json.loads(raw)
                        detections = frame_data.get("detections", [])
                        if detections:
                            frame = draw_detections(frame, detections)
                except Exception:
                    pass

            # Encode as JPEG
            _, jpeg = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
            yield (
                b"--frame\r\n"
                b"Content-Type: image/jpeg\r\n\r\n" + jpeg.tobytes() + b"\r\n"
            )

            await asyncio.sleep(0.1)  # ~10 FPS
    finally:
        if cap is not None:
            cap.release()
        if redis_client:
            await redis_client.aclose()


# -----------------------------------------------------------------------
# Route
# -----------------------------------------------------------------------

@router.get("/api/stream/{camera_id}")
async def stream_camera(camera_id: str, request: Request):
    """Stream video with detection overlays as MJPEG."""
    camera_name = f"Camera {camera_id[:8]}"
    return StreamingResponse(
        generate_mjpeg(camera_id, camera_name, request),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )
