"""Serve video files and handle frame analysis."""
import base64
import io
import logging

import httpx
from pathlib import Path
from fastapi import APIRouter, HTTPException, Form, UploadFile, File
from fastapi.responses import FileResponse
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
    """Full person analysis: face detection, embedding, attributes, with 8x upscaled images."""
    contents = await image.read()

    results: dict = {
        "type": "person",
        "person_image_b64": None,
        "face": None,
        "face_image_b64": None,
        "attributes": {},
    }

    upscaled_person_bytes: bytes | None = None

    async with httpx.AsyncClient() as client:
        # 1. Face detection + embedding
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
        except Exception as e:
            logger.warning("Face detection failed: %s", e)

        # 2. Person attributes (AI service does 8x upscale internally)
        try:
            resp = await client.post(
                f"{settings.AI_SERVICE_URL}/attributes/person",
                files={"image": ("crop.jpg", contents, "image/jpeg")},
                timeout=60.0,
            )
            if resp.status_code == 200:
                attrs = resp.json()
                # Extract the 8x upscaled image from AI response
                upscaled_b64 = attrs.pop("upscaled_image_b64", None)
                if upscaled_b64:
                    results["person_image_b64"] = upscaled_b64
                    upscaled_person_bytes = base64.b64decode(upscaled_b64)
                results["attributes"] = attrs
        except Exception as e:
            logger.warning("Person attributes failed: %s", e)

        # 3. Crop face from UPSCALED image (not raw) for high-res display
        if results["face"] and upscaled_person_bytes:
            try:
                face_bbox = results["face"].get("face_bbox", {})
                fx = float(face_bbox.get("x", 0))
                fy = float(face_bbox.get("y", 0))
                fw = float(face_bbox.get("w", 0))
                fh = float(face_bbox.get("h", 0))
                if fw > 0 and fh > 0:
                    raw_img = Image.open(io.BytesIO(contents))
                    upscaled_img = Image.open(io.BytesIO(upscaled_person_bytes))

                    # Face bbox is relative to raw image — scale to upscaled dims
                    scale_x = upscaled_img.width / raw_img.width
                    scale_y = upscaled_img.height / raw_img.height

                    ufx = int(fx * scale_x)
                    ufy = int(fy * scale_y)
                    ufw = int(fw * scale_x)
                    ufh = int(fh * scale_y)

                    # Clamp to image bounds
                    ufx = max(0, ufx)
                    ufy = max(0, ufy)
                    ufw = min(ufw, upscaled_img.width - ufx)
                    ufh = min(ufh, upscaled_img.height - ufy)

                    if ufw > 0 and ufh > 0:
                        face_crop = upscaled_img.crop((ufx, ufy, ufx + ufw, ufy + ufh))
                        buf = io.BytesIO()
                        face_crop.save(buf, format="JPEG", quality=90)
                        results["face_image_b64"] = base64.b64encode(buf.getvalue()).decode("ascii")
            except Exception as e:
                logger.warning("Face crop from upscaled failed: %s", e)

        # Fallback: crop face from raw image if upscaled crop failed
        if results["face"] and not results["face_image_b64"]:
            try:
                face_bbox = results["face"].get("face_bbox", {})
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
            except Exception as e:
                logger.warning("Face crop fallback failed: %s", e)

    # Fallback: use raw image if no upscaled available
    if not results["person_image_b64"]:
        results["person_image_b64"] = base64.b64encode(contents).decode("ascii")

    return results


@router.post("/analyze-vehicle")
async def analyze_vehicle(
    image: UploadFile = File(...),
):
    """Full vehicle analysis: plate OCR, attributes, with 8x upscaled images."""
    contents = await image.read()

    results: dict = {
        "type": "vehicle",
        "vehicle_image_b64": None,
        "plate": None,
        "attributes": {},
    }

    async with httpx.AsyncClient() as client:
        # 1. Plate OCR — AI service returns upscaled plate_image_b64
        try:
            resp = await client.post(
                f"{settings.AI_SERVICE_URL}/plate/read",
                files={"image": ("crop.jpg", contents, "image/jpeg")},
                timeout=30.0,
            )
            if resp.status_code == 200:
                plate_data = resp.json()
                # plate_data already has plate_image_b64 (upscaled) from AI service
                # DO NOT overwrite with a raw crop!
                results["plate"] = plate_data
        except Exception as e:
            logger.warning("Plate read failed: %s", e)

        # 2. Vehicle attributes (AI service does 8x upscale internally)
        try:
            resp = await client.post(
                f"{settings.AI_SERVICE_URL}/attributes/vehicle",
                files={"image": ("crop.jpg", contents, "image/jpeg")},
                timeout=60.0,
            )
            if resp.status_code == 200:
                attrs = resp.json()
                # Extract the 8x upscaled image from AI response
                upscaled_b64 = attrs.pop("upscaled_image_b64", None)
                if upscaled_b64:
                    results["vehicle_image_b64"] = upscaled_b64
                results["attributes"] = attrs
        except Exception as e:
            logger.warning("Vehicle attributes failed: %s", e)

    # Fallback: use raw image if no upscaled available
    if not results["vehicle_image_b64"]:
        results["vehicle_image_b64"] = base64.b64encode(contents).decode("ascii")

    return results
