"""
Frame data endpoints.

Serves latest detection data per camera from Redis for frontend polling.
"""

import json
import logging

from fastapi import APIRouter, Depends, HTTPException
import redis.asyncio as aioredis

from app.core.redis import get_redis

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/frames", tags=["frames"])


@router.get("/")
async def get_all_frames(r: aioredis.Redis = Depends(get_redis)):
    """Get latest detection data for all active cameras."""
    try:
        # Get set of active cameras
        active_cameras = await r.smembers("active_cameras")
    except Exception:
        active_cameras = set()

    if not active_cameras:
        # Fallback: scan for frame:* keys
        try:
            cursor = 0
            active_cameras = set()
            while True:
                cursor, keys = await r.scan(cursor, match="frame:*", count=100)
                for k in keys:
                    cam_id = k.replace("frame:", "")
                    active_cameras.add(cam_id)
                if cursor == 0:
                    break
        except Exception:
            return {"cameras": {}, "count": 0}

    frames = {}
    for cam_id in active_cameras:
        try:
            data = await r.get(f"frame:{cam_id}")
            if data:
                frames[cam_id] = json.loads(data)
        except Exception:
            continue

    return {"cameras": frames, "count": len(frames)}


@router.get("/stats")
async def get_pipeline_stats(r: aioredis.Redis = Depends(get_redis)):
    """Get aggregate pipeline statistics from Redis."""
    stats = {}
    try:
        stats["current_people"] = await r.hgetall("stats:current_people")
        stats["current_vehicles"] = await r.hgetall("stats:current_vehicles")
        stats["total_people"] = await r.hgetall("stats:total_people")
        stats["total_vehicles"] = await r.hgetall("stats:total_vehicles")
        stats["frames_processed"] = await r.hgetall("stats:frames_processed")
    except Exception as e:
        logger.warning("Failed to fetch pipeline stats: %s", e)

    # Compute totals
    total_people = sum(int(v) for v in (stats.get("current_people") or {}).values())
    total_vehicles = sum(int(v) for v in (stats.get("current_vehicles") or {}).values())
    total_frames = sum(int(v) for v in (stats.get("frames_processed") or {}).values())

    return {
        "per_camera": stats,
        "totals": {
            "current_people": total_people,
            "current_vehicles": total_vehicles,
            "total_frames_processed": total_frames,
        },
    }


@router.get("/{camera_id}")
async def get_camera_frame(camera_id: str, r: aioredis.Redis = Depends(get_redis)):
    """Get latest detection data for a specific camera."""
    try:
        data = await r.get(f"frame:{camera_id}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Redis error: {e}")

    if not data:
        raise HTTPException(status_code=404, detail=f"No frame data for camera {camera_id}")

    return json.loads(data)
