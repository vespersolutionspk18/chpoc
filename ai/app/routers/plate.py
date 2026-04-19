from __future__ import annotations

import logging
import random
import string
import time

import cv2
import numpy as np
from fastapi import APIRouter, File, Request, UploadFile

from ai.app.core.config import settings
from shared.schemas import BoundingBox, PlateOCRResult

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/plate", tags=["plate"])


def _decode_image(raw: bytes) -> np.ndarray:
    arr = np.frombuffer(raw, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not decode uploaded image")
    return img


def _simulate_plate_read(img: np.ndarray) -> PlateOCRResult:
    """Generate a plausible simulated license plate reading."""
    h, w = img.shape[:2]

    # Plate-like region in the lower-center of the vehicle crop
    pw = random.randint(60, min(140, w // 2))
    ph = random.randint(18, min(40, h // 4))
    px = random.randint(w // 4, max(w // 4 + 1, w - pw - w // 4))
    py = random.randint(h // 2, max(h // 2 + 1, h - ph))

    # Random plate text (US-style)
    letters = "".join(random.choices(string.ascii_uppercase, k=3))
    digits = "".join(random.choices(string.digits, k=4))
    plate_text = f"{letters}-{digits}"

    return PlateOCRResult(
        plate_text=plate_text,
        confidence=round(random.uniform(0.75, 0.97), 4),
        plate_bbox=BoundingBox(x=float(px), y=float(py), w=float(pw), h=float(ph)),
    )


@router.post("/read", response_model=PlateOCRResult)
async def read_plate(
    request: Request,
    image: UploadFile = File(...),
) -> PlateOCRResult:
    """Detect and OCR a license plate from a vehicle crop.

    Currently returns simulated results.  Will be wired to a dedicated
    plate-detection + OCR model in a future iteration.
    """
    start = time.perf_counter()
    raw = await image.read()
    img = _decode_image(raw)

    # TODO: wire up real plate detection + OCR model
    result = _simulate_plate_read(img)

    elapsed = (time.perf_counter() - start) * 1000
    logger.info("plate/read: '%s' (conf=%.2f) in %.1f ms", result.plate_text, result.confidence, elapsed)
    return result
