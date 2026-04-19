from __future__ import annotations

import time
from datetime import datetime, timezone

from fastapi import APIRouter, File, UploadFile

from shared.schemas import BoundingBox, Detection, ObjectClass

router = APIRouter(prefix="/detect", tags=["detection"])


@router.post("", response_model=list[Detection])
async def detect_objects(image: UploadFile = File(...)) -> list[Detection]:
    """Run object detection on an uploaded image."""
    start = time.perf_counter()
    _data = await image.read()

    # TODO: Replace with actual model inference
    detections = [
        Detection(
            track_id=1,
            object_class=ObjectClass.person,
            confidence=0.92,
            bbox=BoundingBox(x=100, y=150, w=60, h=180),
            camera_id="stub",
            timestamp=datetime.now(timezone.utc),
            is_new_track=True,
        ),
        Detection(
            track_id=2,
            object_class=ObjectClass.vehicle,
            confidence=0.87,
            bbox=BoundingBox(x=300, y=200, w=200, h=120),
            camera_id="stub",
            timestamp=datetime.now(timezone.utc),
        ),
    ]

    elapsed_ms = (time.perf_counter() - start) * 1000
    _ = elapsed_ms  # will be used in real impl
    return detections


@router.post("/batch", response_model=list[list[Detection]])
async def detect_objects_batch(
    images: list[UploadFile] = File(...),
) -> list[list[Detection]]:
    """Run object detection on a batch of images."""
    results: list[list[Detection]] = []
    for img in images:
        _data = await img.read()

        # TODO: Replace with actual model inference
        results.append(
            [
                Detection(
                    track_id=1,
                    object_class=ObjectClass.person,
                    confidence=0.90,
                    bbox=BoundingBox(x=50, y=80, w=70, h=200),
                    camera_id="stub",
                    timestamp=datetime.now(timezone.utc),
                ),
            ]
        )
    return results
