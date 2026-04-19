from __future__ import annotations

from fastapi import APIRouter, File, UploadFile
from pydantic import BaseModel

router = APIRouter(prefix="/segment", tags=["segmentation"])


class SegmentPrompt(BaseModel):
    point: list[float] | None = None  # [x, y]
    box: list[float] | None = None  # [x1, y1, x2, y2]
    text: str | None = None


class SegmentResult(BaseModel):
    mask_rle: str
    """Run-length encoded segmentation mask."""
    score: float


@router.post("/prompt", response_model=SegmentResult)
async def promptable_segment(
    prompt: SegmentPrompt,
    image: UploadFile = File(...),
) -> SegmentResult:
    """SAM 3.1 promptable segmentation (point / box / text prompt)."""
    _data = await image.read()

    # TODO: Replace with actual model inference
    return SegmentResult(
        mask_rle="stub-rle-encoded-mask",
        score=0.95,
    )
