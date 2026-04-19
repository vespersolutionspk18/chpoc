from __future__ import annotations

from fastapi import APIRouter, File, UploadFile

from shared.schemas import BoundingBox, PlateOCRResult

router = APIRouter(prefix="/plate", tags=["plate"])


@router.post("/read", response_model=PlateOCRResult)
async def read_plate(image: UploadFile = File(...)) -> PlateOCRResult:
    """Detect and OCR a license plate from a vehicle crop."""
    _data = await image.read()

    # TODO: Replace with actual model inference
    return PlateOCRResult(
        plate_text="ABC-1234",
        confidence=0.88,
        plate_bbox=BoundingBox(x=10, y=40, w=100, h=30),
    )
