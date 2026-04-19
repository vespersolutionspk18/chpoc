"""
MJPEG video stream router.

Serves real video frames with AI-detected bounding boxes.
Each frame is sent to the AI service for real object detection,
then detection boxes are drawn on the frame and streamed as MJPEG.
"""

import asyncio
import json
import logging
from pathlib import Path

import cv2
import httpx
import numpy as np
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from app.core.config import settings

logger = logging.getLogger(__name__)
router = APIRouter(tags=["video-stream"])

VIDEO_MAP = {
    "00000000-0000-4000-8000-000000000001": "clip_peshawar_streets.mp4",
    "00000000-0000-4000-8000-000000000002": "clip_peshawar_bazaar.mp4",
    "00000000-0000-4000-8000-000000000003": "clip_charsadda_drone.mp4",
    "00000000-0000-4000-8000-000000000004": "clip_peshawar_walking.mp4",
    "00000000-0000-4000-8000-000000000005": "clip_rawalpindi_streets.mp4",
}

DETECTION_COLORS = {
    "person": (0, 240, 255),
    "vehicle": (0, 255, 136),
    "bike": (0, 170, 255),
    "bag": (255, 45, 120),
}

STREAM_WIDTH = 640
STREAM_HEIGHT = 360


def draw_detections(frame: np.ndarray, detections: list[dict]) -> np.ndarray:
    """Draw bounding boxes on frame. Coordinates are relative to frame size."""
    h, w = frame.shape[:2]
    for det in detections:
        bbox = det.get("bbox", {})
        # YOLOv8 returns coordinates in the original image space
        # The frame sent was 640x360, same as our stream — no scaling needed
        x = int(float(bbox.get("x", 0)))
        y = int(float(bbox.get("y", 0)))
        bw = int(float(bbox.get("w", bbox.get("width", 50))))
        bh = int(float(bbox.get("h", bbox.get("height", 50))))

        # Clamp
        x = max(0, min(x, w - 1))
        y = max(0, min(y, h - 1))
        bw = min(bw, w - x)
        bh = min(bh, h - y)

        obj_type = str(det.get("object_class", det.get("object_type", "other")))
        color = DETECTION_COLORS.get(obj_type, (100, 100, 100))

        # Draw rectangle only — no labels, clean look
        cv2.rectangle(frame, (x, y), (x + bw, y + bh), color, 2)

    return frame


def make_placeholder_frame(camera_name: str) -> np.ndarray:
    frame = np.zeros((STREAM_HEIGHT, STREAM_WIDTH, 3), dtype=np.uint8)
    frame[:] = (12, 8, 3)
    for i in range(0, STREAM_WIDTH, 60):
        cv2.line(frame, (i, 0), (i, STREAM_HEIGHT), (20, 15, 5), 1)
    for i in range(0, STREAM_HEIGHT, 60):
        cv2.line(frame, (0, i), (STREAM_WIDTH, i), (20, 15, 5), 1)
    cv2.putText(frame, camera_name, (20, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 240, 255), 1)
    cv2.putText(frame, "NO VIDEO FEED", (STREAM_WIDTH // 2 - 80, STREAM_HEIGHT // 2),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (74, 106, 138), 1)
    return frame


async def detect_frame(client: httpx.AsyncClient, frame: np.ndarray, camera_id: str) -> list[dict]:
    """Send a frame to the AI service and get real detections back."""
    try:
        _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
        files = {"image": ("frame.jpg", buf.tobytes(), "image/jpeg")}
        data = {"camera_id": camera_id}
        resp = await client.post(f"{settings.AI_SERVICE_URL}/detect", files=files, data=data, timeout=5.0)
        if resp.status_code == 200:
            return resp.json()
    except Exception as e:
        logger.debug("AI detection failed for %s: %s", camera_id, e)
    return []


async def generate_mjpeg(camera_id: str, camera_name: str, request: Request):
    """Yield MJPEG frames with real AI detections."""
    video_file = VIDEO_MAP.get(camera_id)
    video_dir = Path(settings.VIDEO_DIR)

    cap = None
    if video_file:
        video_path = video_dir / video_file
        if video_path.exists():
            cap = cv2.VideoCapture(str(video_path))
            if not cap.isOpened():
                cap = None

    # AI detection client — reused across frames
    ai_client = httpx.AsyncClient()

    # Detection cache — we don't detect every frame (too slow over network)
    # Detect every 5th frame (~2 FPS detection on 10 FPS stream)
    cached_detections: list[dict] = []
    frame_counter = 0
    detect_every = 5

    try:
        while True:
            if await request.is_disconnected():
                break

            if cap is not None and cap.isOpened():
                ret, frame = cap.read()
                if not ret:
                    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    continue
                frame = cv2.resize(frame, (STREAM_WIDTH, STREAM_HEIGHT))
            else:
                frame = make_placeholder_frame(camera_name)

            # Run real AI detection every Nth frame
            frame_counter += 1
            if frame_counter % detect_every == 0:
                detections = await detect_frame(ai_client, frame, camera_id)
                if detections:
                    cached_detections = detections

            # Draw cached detections on every frame
            if cached_detections:
                frame = draw_detections(frame, cached_detections)

            _, jpeg = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 75])
            yield (
                b"--frame\r\n"
                b"Content-Type: image/jpeg\r\n\r\n" + jpeg.tobytes() + b"\r\n"
            )

            await asyncio.sleep(0.1)  # ~10 FPS stream
    finally:
        if cap is not None:
            cap.release()
        await ai_client.aclose()


@router.get("/api/stream/{camera_id}")
async def stream_camera(camera_id: str, request: Request):
    """Stream video with real AI detection overlays as MJPEG."""
    camera_name = f"Camera {camera_id[:8]}"
    return StreamingResponse(
        generate_mjpeg(camera_id, camera_name, request),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )
