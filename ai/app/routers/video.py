from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Request
from pydantic import BaseModel

from ai.app.core.config import settings
from ai.app.services.video_processor import VideoProcessor

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/video", tags=["video"])

# In-memory map of active processors keyed by camera_id.
_active_processors: dict[str, VideoProcessor] = {}
_active_tasks: dict[str, asyncio.Task[None]] = {}


# ---------------------------------------------------------------------------
# Request / response schemas
# ---------------------------------------------------------------------------

class VideoStartRequest(BaseModel):
    video_path: str
    """Absolute path to the video file on the server (e.g. /data/videos/cam1.mp4)."""
    camera_id: str
    fps: int = 15


class VideoStatusEntry(BaseModel):
    camera_id: str
    status: str
    frame_count: int


class VideoStopRequest(BaseModel):
    camera_id: str


class VideoStopResponse(BaseModel):
    camera_id: str
    stopped: bool


# ---------------------------------------------------------------------------
# Detection callback (writes to log for now; later can push to Redis/WS)
# ---------------------------------------------------------------------------

async def _detection_callback(
    camera_id: str,
    frame_index: int,
    detections: list[dict[str, Any]],
) -> None:
    """Called for every processed frame.  Currently logs a summary.

    In production this would push detections into a Redis stream or
    WebSocket channel for the backend to consume.
    """
    if frame_index % 30 == 0:  # log every ~2 s at 15 fps
        logger.info(
            "video/%s frame %d: %d detections",
            camera_id,
            frame_index,
            len(detections),
        )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/start", response_model=VideoStatusEntry)
async def start_video(
    req: VideoStartRequest,
    request: Request,
    background_tasks: BackgroundTasks,
) -> VideoStatusEntry:
    """Start processing a video file as a simulated camera feed.

    The video loops until ``/video/stop`` is called.
    """
    if req.camera_id in _active_processors:
        proc = _active_processors[req.camera_id]
        return VideoStatusEntry(
            camera_id=req.camera_id,
            status=proc.status,
            frame_count=proc.current_frame,
        )

    registry = request.app.state.model_registry
    processor = VideoProcessor(
        model_registry=registry,
        fps=req.fps,
        use_real_models=settings.USE_REAL_MODELS,
    )
    _active_processors[req.camera_id] = processor

    # Launch in a background asyncio task so the endpoint returns immediately.
    async def _run() -> None:
        try:
            await processor.process_video(
                video_path=req.video_path,
                camera_id=req.camera_id,
                callback=_detection_callback,
            )
        except Exception:
            logger.exception("Video processor for %s crashed", req.camera_id)
        finally:
            _active_processors.pop(req.camera_id, None)
            _active_tasks.pop(req.camera_id, None)

    task = asyncio.create_task(_run())
    _active_tasks[req.camera_id] = task

    logger.info("Started video processing: %s -> %s", req.video_path, req.camera_id)
    return VideoStatusEntry(
        camera_id=req.camera_id,
        status="starting",
        frame_count=0,
    )


@router.post("/stop", response_model=VideoStopResponse)
async def stop_video(req: VideoStopRequest) -> VideoStopResponse:
    """Stop processing a video feed."""
    proc = _active_processors.get(req.camera_id)
    if proc is None:
        return VideoStopResponse(camera_id=req.camera_id, stopped=False)

    proc.stop()
    # Give it a moment to finish the current frame.
    task = _active_tasks.get(req.camera_id)
    if task is not None:
        try:
            await asyncio.wait_for(task, timeout=3.0)
        except asyncio.TimeoutError:
            task.cancel()

    _active_processors.pop(req.camera_id, None)
    _active_tasks.pop(req.camera_id, None)
    logger.info("Stopped video processing for %s", req.camera_id)
    return VideoStopResponse(camera_id=req.camera_id, stopped=True)


@router.get("/status", response_model=list[VideoStatusEntry])
async def video_status() -> list[VideoStatusEntry]:
    """List all active video processors."""
    return [
        VideoStatusEntry(
            camera_id=cid,
            status=proc.status,
            frame_count=proc.current_frame,
        )
        for cid, proc in _active_processors.items()
    ]
