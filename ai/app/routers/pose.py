from __future__ import annotations

from fastapi import APIRouter, File, UploadFile

from shared.schemas import PoseKeypoints

router = APIRouter(prefix="/pose", tags=["pose"])


@router.post("/estimate", response_model=PoseKeypoints)
async def estimate_pose(image: UploadFile = File(...)) -> PoseKeypoints:
    """Estimate pose keypoints from a person crop."""
    _data = await image.read()

    # TODO: Replace with actual model inference
    # 17 COCO keypoints: [x, y, confidence]
    stub_keypoints = [[0.0, 0.0, 0.0]] * 17
    return PoseKeypoints(
        keypoints=stub_keypoints,
        num_keypoints=17,
    )
