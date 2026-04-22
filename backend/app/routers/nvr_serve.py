"""Serve NVR camera recording files — 720p transcoded versions for streaming."""

import re
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.core.config import settings

router = APIRouter(prefix="/video/nvr", tags=["nvr"])

NVR_CAMERA_NAMES = {
    "D01": "NVR Camera 1",
    "D03": "NVR Camera 3",
    "D04": "NVR Camera 4",
    "D08": "NVR Camera 8",
    "D10": "NVR Camera 10",
}


@router.get("/list")
async def list_nvr_files():
    """List all available NVR recording files grouped by camera."""
    # Check 720p dir first, fall back to original
    nvr_dir = Path(settings.NVR_VIDEO_DIR)
    if not nvr_dir.exists():
        nvr_dir = Path(settings.NVR_VIDEO_DIR_ORIGINAL)
    if not nvr_dir.exists():
        return {"cameras": {}, "files": []}

    files = sorted(nvr_dir.glob("*.mp4"))
    grouped: dict[str, list[dict]] = {}
    flat: list[dict] = []

    for f in files:
        match = re.match(r"(D\d+)_(\d{8})(\d{6})\.mp4", f.name)
        cam_id = match.group(1) if match else "unknown"
        cam_name = NVR_CAMERA_NAMES.get(cam_id, f"NVR {cam_id}")
        entry = {
            "filename": f.name,
            "camera_id": cam_id,
            "camera_name": cam_name,
            "size_mb": round(f.stat().st_size / (1024 * 1024), 1),
        }
        flat.append(entry)
        grouped.setdefault(cam_id, []).append(entry)

    return {"cameras": grouped, "files": flat}


@router.get("/file/{filename}")
async def get_nvr_file(filename: str):
    """Serve NVR video — 720p version for streaming, fallback to original."""
    if not re.match(r"^[\w\-\.]+$", filename):
        raise HTTPException(400, "Invalid filename")

    # Try 720p first (small, fast streaming)
    video_path = Path(settings.NVR_VIDEO_DIR) / filename
    if not video_path.exists():
        # Fall back to original 4K
        video_path = Path(settings.NVR_VIDEO_DIR_ORIGINAL) / filename
    if not video_path.exists():
        raise HTTPException(404, f"NVR file not found: {filename}")

    return FileResponse(
        str(video_path),
        media_type="video/mp4",
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "Range",
            "Access-Control-Expose-Headers": "Content-Range, Accept-Ranges, Content-Length",
        },
    )
