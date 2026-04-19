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


@router.get("")
async def get_all_frames(r: aioredis.Redis = Depends(get_redis)):
    """Get latest detection data for all active cameras."""
    # Scan for frame:* keys in Redis
    camera_ids: list[str] = []
    try:
        cursor = 0
        while True:
            cursor, keys = await r.scan(cursor, match="frame:*", count=100)
            for k in keys:
                key_str = k.decode() if isinstance(k, bytes) else k
                cam_id = key_str.replace("frame:", "")
                camera_ids.append(cam_id)
            if cursor == 0:
                break
    except Exception:
        return {}

    frames: dict = {}
    for cam_id in camera_ids:
        try:
            data = await r.get(f"frame:{cam_id}")
            if data:
                raw = data.decode() if isinstance(data, bytes) else data
                frames[cam_id] = json.loads(raw)
        except Exception:
            continue

    return frames


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

    raw = data.decode() if isinstance(data, bytes) else data
    return json.loads(raw)
