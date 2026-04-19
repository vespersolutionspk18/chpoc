"""
Pipeline control endpoints.

Start/stop video processing, check status.
"""

import logging

from fastapi import APIRouter, HTTPException, Request

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/pipeline", tags=["pipeline"])


def _get_pipeline(request: Request):
    """Get the pipeline instance from app state."""
    pipeline = getattr(request.app.state, "pipeline", None)
    if pipeline is None:
        raise HTTPException(status_code=503, detail="Pipeline not initialized")
    return pipeline


@router.post("/start")
async def start_all(request: Request):
    """Start processing all configured cameras."""
    pipeline = _get_pipeline(request)
    result = await pipeline.start_all()
    return {"status": "started", **result}


@router.post("/stop")
async def stop_all(request: Request):
    """Stop all camera processors."""
    pipeline = _get_pipeline(request)
    await pipeline.stop_all()
    return {"status": "stopped"}


@router.get("/status")
async def pipeline_status(request: Request):
    """Get status of all pipeline processors."""
    pipeline = _get_pipeline(request)
    return {
        "simulation_mode": pipeline._simulation,
        "running": pipeline._running,
        "cameras": pipeline.get_status(),
    }


@router.post("/start/{camera_id}")
async def start_camera(camera_id: str, request: Request):
    """Start processing a single camera."""
    pipeline = _get_pipeline(request)
    await pipeline.start_camera(camera_id)
    return {"status": "started", "camera_id": camera_id}


@router.post("/stop/{camera_id}")
async def stop_camera(camera_id: str, request: Request):
    """Stop processing a single camera."""
    pipeline = _get_pipeline(request)
    await pipeline.stop_camera(camera_id)
    return {"status": "stopped", "camera_id": camera_id}
