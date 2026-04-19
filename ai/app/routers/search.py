from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, File, UploadFile
from pydantic import BaseModel

from shared.schemas import BoundingBox, Detection, ObjectClass

router = APIRouter(prefix="/search", tags=["search"])


class TextSearchRequest(BaseModel):
    query: str
    """Open-vocabulary search query, e.g. 'person with knife'."""


@router.post("/text", response_model=list[Detection])
async def text_search(
    request: TextSearchRequest,
    image: UploadFile = File(...),
) -> list[Detection]:
    """DINO-X Pro open-vocabulary text-prompt detection.

    E.g. "find person with knife" returns detections matching the query.
    """
    _data = await image.read()

    # TODO: Replace with actual model inference
    return [
        Detection(
            track_id=0,
            object_class=ObjectClass.other,
            confidence=0.78,
            bbox=BoundingBox(x=200, y=100, w=80, h=200),
            camera_id="stub",
            timestamp=datetime.now(timezone.utc),
        ),
    ]
