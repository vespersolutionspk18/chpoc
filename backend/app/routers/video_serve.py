"""Serve video files and handle frame analysis."""
import base64
import io
import logging

import httpx
from pathlib import Path
from fastapi import APIRouter, HTTPException, Form, UploadFile, File
from fastapi.responses import FileResponse, Response
from starlette.responses import StreamingResponse as StarletteStreamingResponse
from PIL import Image

from app.core.config import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/video", tags=["video"])

VIDEO_MAP = {
    "00000000-0000-4000-8000-000000000001": "clip_peshawar_streets.mp4",
    "00000000-0000-4000-8000-000000000002": "clip_peshawar_bazaar.mp4",
    "00000000-0000-4000-8000-000000000003": "clip_charsadda_drone.mp4",
    "00000000-0000-4000-8000-000000000004": "clip_peshawar_walking.mp4",
    "00000000-0000-4000-8000-000000000005": "clip_rawalpindi_streets.mp4",
}


@router.get("/file/{camera_id}")
async def get_video_file(camera_id: str):
    """Serve the video file directly for HTML5 video playback."""
    video_name = VIDEO_MAP.get(camera_id)
    if not video_name:
        raise HTTPException(404, "No video for this camera")
    video_path = Path(settings.VIDEO_DIR) / video_name
    if not video_path.exists():
        raise HTTPException(404, f"Video file not found: {video_name}")
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


@router.post("/detect-frame")
async def detect_frame(
    image: UploadFile = File(...),
    camera_id: str = Form("unknown"),
):
    """Send a frame to AI service for detection. Returns detection boxes."""
    contents = await image.read()
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{settings.AI_SERVICE_URL}/detect",
                files={"image": ("frame.jpg", contents, "image/jpeg")},
                data={"camera_id": camera_id, "confidence": "0.3"},
                timeout=10.0,
            )
            if resp.status_code == 200:
                return resp.json()
    except Exception as e:
        logger.warning("detect-frame failed: %s", e)
    return []


@router.post("/analyze-person")
async def analyze_person(
    image: UploadFile = File(...),
):
    """Full person analysis: face detection, embedding, attributes, with images."""
    contents = await image.read()

    # Encode full person crop as base64
    person_image_b64 = base64.b64encode(contents).decode("ascii")

    results: dict = {
        "type": "person",
        "person_image_b64": person_image_b64,
        "face": None,
        "face_image_b64": None,
        "attributes": {},
    }

    async with httpx.AsyncClient() as client:
        # Face detection + embedding
        try:
            resp = await client.post(
                f"{settings.AI_SERVICE_URL}/face/detect",
                files={"image": ("crop.jpg", contents, "image/jpeg")},
                timeout=10.0,
            )
            if resp.status_code == 200:
                faces = resp.json()
                if faces:
                    results["face"] = faces[0]
                    # Crop the face from the person image and encode as base64
                    try:
                        face_bbox = faces[0].get("face_bbox", {})
                        fx = int(face_bbox.get("x", 0))
                        fy = int(face_bbox.get("y", 0))
                        fw = int(face_bbox.get("w", 0))
                        fh = int(face_bbox.get("h", 0))
                        if fw > 0 and fh > 0:
                            pil_img = Image.open(io.BytesIO(contents))
                            face_crop = pil_img.crop((fx, fy, fx + fw, fy + fh))
                            buf = io.BytesIO()
                            face_crop.save(buf, format="JPEG", quality=85)
                            results["face_image_b64"] = base64.b64encode(buf.getvalue()).decode("ascii")
                    except Exception as crop_err:
                        logger.warning("Face crop failed: %s", crop_err)
        except Exception:
            pass

        # Person attributes
        try:
            resp = await client.post(
                f"{settings.AI_SERVICE_URL}/attributes/person",
                files={"image": ("crop.jpg", contents, "image/jpeg")},
                timeout=30.0,
            )
            if resp.status_code == 200:
                results["attributes"] = resp.json()
        except Exception:
            pass

    return results


@router.post("/analyze-vehicle")
async def analyze_vehicle(
    image: UploadFile = File(...),
):
    """Full vehicle analysis: plate OCR, attributes, with images."""
    contents = await image.read()

    # Encode full vehicle crop as base64
    vehicle_image_b64 = base64.b64encode(contents).decode("ascii")

    results: dict = {
        "type": "vehicle",
        "vehicle_image_b64": vehicle_image_b64,
        "plate": None,
        "attributes": {},
    }

    async with httpx.AsyncClient() as client:
        # Plate OCR
        try:
            resp = await client.post(
                f"{settings.AI_SERVICE_URL}/plate/read",
                files={"image": ("crop.jpg", contents, "image/jpeg")},
                timeout=15.0,
            )
            if resp.status_code == 200:
                plate_data = resp.json()
                # If plate was detected, crop and encode the plate region as base64
                plate_image_b64 = None
                if plate_data.get("plate_text"):
                    try:
                        pbbox = plate_data.get("plate_bbox", {})
                        px = int(pbbox.get("x", 0))
                        py = int(pbbox.get("y", 0))
                        pw = int(pbbox.get("w", 0))
                        ph = int(pbbox.get("h", 0))
                        if pw > 0 and ph > 0:
                            pil_img = Image.open(io.BytesIO(contents))
                            plate_crop = pil_img.crop((px, py, px + pw, py + ph))
                            buf = io.BytesIO()
                            plate_crop.save(buf, format="JPEG", quality=90)
                            plate_image_b64 = base64.b64encode(buf.getvalue()).decode("ascii")
                    except Exception as crop_err:
                        logger.warning("Plate crop failed: %s", crop_err)

                plate_data["plate_image_b64"] = plate_image_b64
                results["plate"] = plate_data
        except Exception:
            pass

        # Vehicle attributes
        try:
            resp = await client.post(
                f"{settings.AI_SERVICE_URL}/attributes/vehicle",
                files={"image": ("crop.jpg", contents, "image/jpeg")},
                timeout=30.0,
            )
            if resp.status_code == 200:
                results["attributes"] = resp.json()
        except Exception:
            pass

    return results
