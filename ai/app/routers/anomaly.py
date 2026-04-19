from __future__ import annotations

from fastapi import APIRouter, File, UploadFile
from pydantic import BaseModel

from shared.schemas import AnomalyResult

router = APIRouter(prefix="/anomaly", tags=["anomaly"])


class TextPromptAnomalyRequest(BaseModel):
    prompt: str
    """Natural-language description of the anomaly to look for."""


@router.post("/detect", response_model=AnomalyResult)
async def detect_anomaly(image: UploadFile = File(...)) -> AnomalyResult:
    """Detect anomaly in a frame or clip."""
    _data = await image.read()

    # TODO: Replace with actual model inference
    return AnomalyResult(
        is_anomalous=False,
        anomaly_score=0.12,
        anomaly_type=None,
        description=None,
    )


@router.post("/text-prompt", response_model=AnomalyResult)
async def text_prompt_anomaly(
    request: TextPromptAnomalyRequest,
) -> AnomalyResult:
    """AnyAnomaly-style text-prompt anomaly detection.

    Accepts a natural-language description (e.g. "person climbing fence")
    and scores how well the current scene matches.
    """
    # TODO: Replace with actual model inference
    return AnomalyResult(
        is_anomalous=False,
        anomaly_score=0.05,
        anomaly_type=None,
        description=f"No anomaly matching '{request.prompt}' detected (stub).",
    )
