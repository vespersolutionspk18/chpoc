from __future__ import annotations

from fastapi import APIRouter, File, UploadFile

from shared.schemas import ActionClassification

router = APIRouter(prefix="/action", tags=["action"])


@router.post("/classify", response_model=ActionClassification)
async def classify_action(video: UploadFile = File(...)) -> ActionClassification:
    """Classify an action from a short video clip."""
    _data = await video.read()

    # TODO: Replace with actual model inference
    return ActionClassification(
        action="walking",
        confidence=0.85,
    )
