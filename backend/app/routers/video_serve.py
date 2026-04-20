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
        "face_image_b64": None,           # original quality face crop
        "face_image_enhanced_b64": None,   # enhanced/upscaled face crop
        "description": "",
        "attributes": {},
    }

    upscaled_person_bytes: bytes | None = None

    async with httpx.AsyncClient() as client:
        # 1. Person attributes FIRST (AI service does 8x upscale internally)
        try:
            resp = await client.post(
                f"{settings.AI_SERVICE_URL}/attributes/person",
                files={"image": ("crop.jpg", contents, "image/jpeg")},
                timeout=60.0,
            )
            if resp.status_code == 200:
                data = resp.json()
                upscaled_b64 = data.pop("upscaled_image_b64", None)
                if upscaled_b64:
                    results["person_image_b64"] = upscaled_b64
                    upscaled_person_bytes = base64.b64decode(upscaled_b64)
                # New format: {description, attributes} — pass through
                results["description"] = data.get("description", "")
                results["attributes"] = data.get("attributes", data)
            else:
                logger.warning("Person attributes returned %d: %s", resp.status_code, resp.text[:200])
        except Exception as e:
            logger.warning("Person attributes failed: %s", e)

        # 2. Face detection on UPSCALED image (not raw crop — raw is too small)
        face_image_for_detect = upscaled_person_bytes if upscaled_person_bytes else contents
        try:
            resp = await client.post(
                f"{settings.AI_SERVICE_URL}/face/detect",
                files={"image": ("crop.jpg", face_image_for_detect, "image/jpeg")},
                timeout=10.0,
            )
            if resp.status_code == 200:
                faces = resp.json()
                if faces:
                    # Only accept faces within the CENTER region of the image.
                    # The crop has ~20% padding above and ~5-10% sides, so reject
                    # faces in the outer padding zone (they belong to neighbors).
                    try:
                        img_for_size = Image.open(io.BytesIO(face_image_for_detect))
                        iw, ih = img_for_size.width, img_for_size.height
                        # Define the "real person" zone: center 70% width, skip top 15%
                        margin_x = iw * 0.15
                        margin_top = ih * 0.05  # small top margin (hat pad is above person)
                        margin_bot = ih * 0.05

                        valid_faces = []
                        for f in faces:
                            fb = f.get("face_bbox", {})
                            fcx = fb.get("x", 0) + fb.get("w", 0) / 2
                            fcy = fb.get("y", 0) + fb.get("h", 0) / 2
                            # Face center must be within the center zone
                            if margin_x < fcx < (iw - margin_x) and margin_top < fcy < (ih - margin_bot):
                                valid_faces.append(f)

                        if valid_faces:
                            # Pick the largest face in the valid zone (most likely the subject)
                            valid_faces.sort(key=lambda f: f.get("face_bbox", {}).get("w", 0) * f.get("face_bbox", {}).get("h", 0), reverse=True)
                            results["face"] = valid_faces[0]
                        else:
                            logger.info("All detected faces are in padding zone — skipping")
                    except Exception:
                        results["face"] = faces[0]
        except Exception as e:
            logger.warning("Face detection failed: %s", e)

        # 3. Crop face — BOTH original and enhanced versions
        if results["face"] and upscaled_person_bytes:
            try:
                face_bbox = results["face"].get("face_bbox", {})
                fx = float(face_bbox.get("x", 0))
                fy = float(face_bbox.get("y", 0))
                fw = float(face_bbox.get("w", 0))
                fh = float(face_bbox.get("h", 0))
                if fw > 0 and fh > 0:
                    upscaled_img = Image.open(io.BytesIO(upscaled_person_bytes))
                    # Face bbox is now relative to the upscaled image (since we detected on it)
                    ifx = max(0, int(fx))
                    ify = max(0, int(fy))
                    ifw = min(int(fw), upscaled_img.width - ifx)
                    ifh = min(int(fh), upscaled_img.height - ify)

                    if ifw > 0 and ifh > 0:
                        face_crop = upscaled_img.crop((ifx, ify, ifx + ifw, ify + ifh))

                        # ORIGINAL: the crop from the 4x Lanczos person image (as-is)
                        buf = io.BytesIO()
                        face_crop.save(buf, format="JPEG", quality=90)
                        results["face_image_b64"] = base64.b64encode(buf.getvalue()).decode("ascii")

                        # ENHANCED: further 4x Lanczos upscale on the face crop (16x total)
                        ew = face_crop.width * 4
                        eh = face_crop.height * 4
                        enhanced = face_crop.resize((ew, eh), Image.LANCZOS)
                        buf2 = io.BytesIO()
                        enhanced.save(buf2, format="JPEG", quality=90)
                        results["face_image_enhanced_b64"] = base64.b64encode(buf2.getvalue()).decode("ascii")
            except Exception as e:
                logger.warning("Face crop from upscaled failed: %s", e)

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
                data = resp.json()
                upscaled_b64 = data.pop("upscaled_image_b64", None)
                if upscaled_b64:
                    results["vehicle_image_b64"] = upscaled_b64
                results["description"] = data.get("description", "")
                results["attributes"] = data.get("attributes", data)
        except Exception as e:
            logger.warning("Vehicle attributes failed: %s", e)

    # Fallback: use raw image if no upscaled available
    if not results["vehicle_image_b64"]:
        results["vehicle_image_b64"] = base64.b64encode(contents).decode("ascii")

    return results


from fastapi import Request


@router.post("/search-face")
async def search_face(request: Request):
    """Proxy face embedding search to AI service."""
    body = await request.body()
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{settings.AI_SERVICE_URL}/face/search",
                content=body,
                headers={"Content-Type": "application/json"},
                timeout=10.0,
            )
            if resp.status_code == 200:
                return resp.json()
    except Exception as e:
        logger.warning("Face search proxy failed: %s", e)
    return {"matches": [], "index_size": 0}


@router.post("/build-face-index")
async def build_face_index():
    """Trigger face index building on AI service."""
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{settings.AI_SERVICE_URL}/face/index/build",
                data={"frame_skip": "5"},
                timeout=600.0,
            )
            if resp.status_code == 200:
                return resp.json()
    except Exception as e:
        logger.warning("Face index build failed: %s", e)
    return {"error": "Failed to build index"}


@router.post("/search-vehicle")
async def search_vehicle(request: Request):
    """Proxy vehicle search to AI service."""
    body = await request.body()
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{settings.AI_SERVICE_URL}/face/vehicle-search",
                content=body,
                headers={"Content-Type": "application/json"},
                timeout=10.0,
            )
            if resp.status_code == 200:
                return resp.json()
    except Exception as e:
        logger.warning("Vehicle search failed: %s", e)
    return {"matches": [], "index_size": 0}


@router.post("/search-vehicle-by-image")
async def search_vehicle_by_image(image: UploadFile = File(...)):
    """Upload a vehicle image to search across all indexed videos."""
    contents = await image.read()
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{settings.AI_SERVICE_URL}/face/vehicle-search/by-image",
                files={"image": ("crop.jpg", contents, "image/jpeg")},
                timeout=15.0,
            )
            if resp.status_code == 200:
                return resp.json()
    except Exception as e:
        logger.warning("Vehicle image search failed: %s", e)
    return {"matches": [], "index_size": 0}


@router.post("/clip-embed")
async def get_clip_embedding(image: UploadFile = File(...)):
    """Get CLIP embedding for a vehicle image (used by frontend for search)."""
    contents = await image.read()
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{settings.AI_SERVICE_URL}/face/vehicle-search/by-image",
                files={"image": ("crop.jpg", contents, "image/jpeg")},
                data={"top_k": "0"},
                timeout=10.0,
            )
            # We just need the embedding, but the endpoint returns matches
            # So let's use a dedicated clip embed approach
    except Exception:
        pass
    return {"embedding": []}


@router.post("/search-face-by-image")
async def search_face_by_image(image: UploadFile = File(...)):
    """Upload a face image to search across all indexed videos."""
    contents = await image.read()
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{settings.AI_SERVICE_URL}/face/search/by-image",
                files={"image": ("face.jpg", contents, "image/jpeg")},
                data={"top_k": "30"},
                timeout=15.0,
            )
            if resp.status_code == 200:
                return resp.json()
    except Exception as e:
        logger.warning("Face image search failed: %s", e)
    return {"matches": [], "index_size": 0}


@router.post("/build-vehicle-index")
async def build_vehicle_index():
    """Trigger vehicle index building on AI service."""
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{settings.AI_SERVICE_URL}/face/vehicle-index/build",
                data={"frame_skip": "10"},
                timeout=600.0,
            )
            if resp.status_code == 200:
                return resp.json()
    except Exception as e:
        logger.warning("Vehicle index build failed: %s", e)
    return {"error": "Failed to build vehicle index"}
