"""Serve live RTSP camera feeds as HLS streams for browser playback."""

import logging
import os
import subprocess
import time
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, Response

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/live", tags=["live"])

NVR_BASE = "rtsp://admin:cpo%407890@103.240.220.164:554/Streaming/Channels"

CAMERAS = {
    "cctv_c": {"channel": "201", "name": "CCTV/C", "sub": "204"},
    "camera_01": {"channel": "401", "name": "Camera 01", "sub": "402"},
    "m_gate_01": {"channel": "501", "name": "M Gate 01", "sub": "502"},
    "parking": {"channel": "701", "name": "Parking", "sub": "702"},
    "camera_01b": {"channel": "801", "name": "Camera 01B", "sub": "802"},
    "main_barrier": {"channel": "901", "name": "Main Barrier", "sub": "904"},
    "gate_2": {"channel": "1401", "name": "Gate 2", "sub": "1404"},
    "out_gate_2": {"channel": "1501", "name": "Out Gate 2", "sub": "1504"},
    "sect_side": {"channel": "1601", "name": "Sect Side", "sub": "1604"},
}

HLS_DIR = "/tmp/hls"
_hls_processes: dict[str, subprocess.Popen] = {}


def _start_hls(cam_id: str, use_sub: bool = True) -> str:
    """Start ffmpeg HLS transcoding for a camera. Returns the m3u8 path."""
    if cam_id not in CAMERAS:
        raise HTTPException(404, f"Unknown camera: {cam_id}")

    cam = CAMERAS[cam_id]
    ch = cam["sub"] if use_sub else cam["channel"]
    rtsp_url = f"{NVR_BASE}/{ch}"
    out_dir = f"{HLS_DIR}/{cam_id}"
    os.makedirs(out_dir, exist_ok=True)
    m3u8 = f"{out_dir}/stream.m3u8"

    # Check if already running
    if cam_id in _hls_processes:
        proc = _hls_processes[cam_id]
        if proc.poll() is None:
            return m3u8  # still running

    # Start ffmpeg HLS
    cmd = [
        "ffmpeg", "-y",
        "-rtsp_transport", "tcp",
        "-stimeout", "10000000",
        "-i", rtsp_url,
        "-c:v", "libx264", "-preset", "ultrafast", "-tune", "zerolatency",
        "-crf", "28", "-g", "25",
        "-an",
        "-f", "hls",
        "-hls_time", "2",
        "-hls_list_size", "5",
        "-hls_flags", "delete_segments+append_list",
        "-hls_segment_filename", f"{out_dir}/seg_%03d.ts",
        m3u8,
    ]

    proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    _hls_processes[cam_id] = proc
    logger.info("Started HLS for %s (PID %d, channel %s)", cam_id, proc.pid, ch)

    # Wait for first segment
    for _ in range(30):
        if os.path.exists(m3u8):
            return m3u8
        time.sleep(0.5)

    return m3u8


@router.get("/cameras")
async def list_cameras():
    """List all available live cameras from the NVR."""
    return {
        "cameras": [
            {
                "id": cam_id,
                "name": cam["name"],
                "channel_main": cam["channel"],
                "channel_sub": cam["sub"],
                "hls_url": f"/api/live/stream/{cam_id}/stream.m3u8",
                "snapshot_url": f"/api/live/snapshot/{cam_id}",
            }
            for cam_id, cam in CAMERAS.items()
        ]
    }


@router.get("/stream/{cam_id}/{filename}")
async def get_hls_file(cam_id: str, filename: str):
    """Serve HLS m3u8 playlist or .ts segments."""
    # Start HLS if not running
    _start_hls(cam_id)

    file_path = Path(HLS_DIR) / cam_id / filename
    if not file_path.exists():
        # Wait a moment for file to appear
        time.sleep(1)
        if not file_path.exists():
            raise HTTPException(404, f"HLS file not ready: {filename}")

    media_type = "application/vnd.apple.mpegurl" if filename.endswith(".m3u8") else "video/mp2t"
    return FileResponse(
        str(file_path),
        media_type=media_type,
        headers={
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-cache, no-store",
        },
    )


_snapshot_cache: dict[str, tuple[bytes, float]] = {}


@router.get("/snapshot/{cam_id}")
async def get_snapshot(cam_id: str):
    """Get a JPEG snapshot — uses cached snapshot or recorded video frame."""
    if cam_id not in CAMERAS:
        raise HTTPException(404, f"Unknown camera: {cam_id}")

    # Check cache (valid for 30 seconds)
    if cam_id in _snapshot_cache:
        data, ts = _snapshot_cache[cam_id]
        if time.time() - ts < 30:
            return Response(content=data, media_type="image/jpeg",
                           headers={"Access-Control-Allow-Origin": "*"})

    cam = CAMERAS[cam_id]

    # Try to get frame from recorded video file first (instant)
    import glob
    import cv2
    for pattern in [f"/workspace/nvr_videos/*ch{cam['channel']}*", f"/workspace/nvr_videos/*{cam_id}*"]:
        files = glob.glob(pattern)
        if files:
            cap = cv2.VideoCapture(files[0])
            cap.set(cv2.CAP_PROP_POS_FRAMES, 25)  # Skip first second
            ret, frame = cap.read()
            cap.release()
            if ret:
                _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
                data = buf.tobytes()
                _snapshot_cache[cam_id] = (data, time.time())
                return Response(content=data, media_type="image/jpeg",
                               headers={"Access-Control-Allow-Origin": "*"})

    # Fallback: try RTSP (slow but works if no recording exists)
    rtsp_url = f"{NVR_BASE}/{cam['sub']}"
    cmd = [
        "ffmpeg", "-y", "-rtsp_transport", "tcp", "-stimeout", "5000000",
        "-i", rtsp_url, "-frames:v", "1", "-f", "image2", "-q:v", "3", "pipe:1",
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, timeout=8)
        if result.returncode == 0 and result.stdout:
            _snapshot_cache[cam_id] = (result.stdout, time.time())
            return Response(content=result.stdout, media_type="image/jpeg",
                           headers={"Access-Control-Allow-Origin": "*"})
    except subprocess.TimeoutExpired:
        pass

    # Return a 1x1 transparent pixel as fallback (don't 504)
    return Response(content=b'\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00\xff\xd9',
                    media_type="image/jpeg", headers={"Access-Control-Allow-Origin": "*"})


@router.post("/record/{cam_id}")
async def record_clip(cam_id: str, duration: int = 60):
    """Record a clip from a camera for the specified duration."""
    if cam_id not in CAMERAS:
        raise HTTPException(404, f"Unknown camera: {cam_id}")
    if duration > 300:
        raise HTTPException(400, "Max duration 300 seconds")

    cam = CAMERAS[cam_id]
    rtsp_url = f"{NVR_BASE}/{cam['channel']}"  # Use main stream for recording
    out_path = f"/workspace/nvr_videos/{cam_id}_{int(time.time())}.mp4"

    cmd = [
        "ffmpeg", "-y",
        "-rtsp_transport", "tcp",
        "-stimeout", "10000000",
        "-i", rtsp_url,
        "-t", str(duration),
        "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23",
        "-an", "-movflags", "+faststart",
        out_path,
    ]

    proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return {
        "status": "recording",
        "camera": cam_id,
        "duration": duration,
        "output": out_path,
        "pid": proc.pid,
    }
