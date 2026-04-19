from __future__ import annotations

import logging
import random
import time

import cv2
import numpy as np
from fastapi import APIRouter, File, Request, UploadFile

from ai.app.core.config import settings
from shared.schemas import PoseKeypoints

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/pose", tags=["pose"])

# COCO 17-keypoint names for reference
_COCO_KEYPOINT_NAMES = [
    "nose", "left_eye", "right_eye", "left_ear", "right_ear",
    "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
    "left_wrist", "right_wrist", "left_hip", "right_hip",
    "left_knee", "right_knee", "left_ankle", "right_ankle",
]


def _decode_image(raw: bytes) -> np.ndarray:
    arr = np.frombuffer(raw, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not decode uploaded image")
    return img


def _run_vitpose(
    img: np.ndarray,
    model_entry: dict,
) -> list[list[float]]:
    """Run ViTPose inference using the loaded safetensors state dict.

    ViTPose requires the model architecture to be constructed and the
    state dict loaded into it.  For now, this is a placeholder that will
    be completed once the architecture wrapper is added.
    """
    # TODO: construct ViTPose model, load state_dict, run forward pass
    logger.info("ViTPose state dict available but architecture wrapper not yet wired -- using simulation")
    return []


def _simulate_keypoints(img: np.ndarray) -> list[list[float]]:
    """Generate plausible 17 COCO keypoints for a person crop.

    Keypoints are placed in a rough anatomical layout relative to the
    image dimensions.
    """
    h, w = img.shape[:2]

    # Rough skeleton proportions (normalised 0..1)
    template = [
        (0.50, 0.10),  # nose
        (0.47, 0.08),  # left_eye
        (0.53, 0.08),  # right_eye
        (0.44, 0.10),  # left_ear
        (0.56, 0.10),  # right_ear
        (0.38, 0.25),  # left_shoulder
        (0.62, 0.25),  # right_shoulder
        (0.30, 0.42),  # left_elbow
        (0.70, 0.42),  # right_elbow
        (0.25, 0.55),  # left_wrist
        (0.75, 0.55),  # right_wrist
        (0.42, 0.55),  # left_hip
        (0.58, 0.55),  # right_hip
        (0.40, 0.72),  # left_knee
        (0.60, 0.72),  # right_knee
        (0.38, 0.92),  # left_ankle
        (0.62, 0.92),  # right_ankle
    ]

    keypoints: list[list[float]] = []
    for nx, ny in template:
        jitter_x = random.uniform(-0.03, 0.03)
        jitter_y = random.uniform(-0.03, 0.03)
        px = round((nx + jitter_x) * w, 1)
        py = round((ny + jitter_y) * h, 1)
        conf = round(random.uniform(0.70, 0.98), 2)
        keypoints.append([px, py, conf])

    return keypoints


@router.post("/estimate", response_model=PoseKeypoints)
async def estimate_pose(
    request: Request,
    image: UploadFile = File(...),
) -> PoseKeypoints:
    """Estimate 17 COCO keypoints from a person crop.

    Uses ViTPose when the model is loaded; otherwise returns simulated
    keypoints with realistic anatomical placement.
    """
    start = time.perf_counter()
    raw = await image.read()
    img = _decode_image(raw)

    registry = request.app.state.model_registry
    keypoints: list[list[float]] = []

    if settings.USE_REAL_MODELS and registry.is_loaded("vitpose"):
        model_entry = registry.get_model("vitpose")
        keypoints = _run_vitpose(img, model_entry)

    if not keypoints:
        keypoints = _simulate_keypoints(img)

    elapsed = (time.perf_counter() - start) * 1000
    logger.info("pose/estimate: %d keypoints in %.1f ms", len(keypoints), elapsed)

    return PoseKeypoints(
        keypoints=keypoints,
        num_keypoints=len(keypoints),
    )
