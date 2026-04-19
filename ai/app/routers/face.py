from __future__ import annotations

from fastapi import APIRouter, File, UploadFile
from pydantic import BaseModel

from shared.schemas import BoundingBox, FaceDetectionResult

router = APIRouter(prefix="/face", tags=["face"])


class FaceSearchRequest(BaseModel):
    embedding: list[float]
    top_k: int = 5


class FaceSearchMatch(BaseModel):
    identity_id: str
    distance: float


@router.post("/detect", response_model=list[FaceDetectionResult])
async def detect_faces(image: UploadFile = File(...)) -> list[FaceDetectionResult]:
    """Detect faces in an image and return bounding boxes with quality scores."""
    _data = await image.read()

    # TODO: Replace with actual model inference
    return [
        FaceDetectionResult(
            face_bbox=BoundingBox(x=120, y=80, w=50, h=60),
            quality_score=0.95,
        ),
    ]


@router.post("/embed", response_model=FaceDetectionResult)
async def embed_face(image: UploadFile = File(...)) -> FaceDetectionResult:
    """Extract a 512-d face embedding from a face crop."""
    _data = await image.read()

    # TODO: Replace with actual model inference
    stub_embedding = [0.0] * 512
    return FaceDetectionResult(
        face_bbox=BoundingBox(x=0, y=0, w=112, h=112),
        quality_score=0.93,
        embedding=stub_embedding,
    )


@router.post("/search", response_model=list[FaceSearchMatch])
async def search_face(request: FaceSearchRequest) -> list[FaceSearchMatch]:
    """Search a face embedding against stored embeddings (placeholder)."""
    # TODO: Replace with actual vector search against face DB
    return [
        FaceSearchMatch(identity_id="unknown-001", distance=0.45),
    ]
