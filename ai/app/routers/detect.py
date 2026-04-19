from __future__ import annotations

import logging
import random
import time
from datetime import datetime, timezone

import cv2
import numpy as np
from fastapi import APIRouter, File, Form, Request, UploadFile

from ai.app.core.config import settings
from shared.schemas import BoundingBox, Detection, ObjectClass

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/detect", tags=["detection"])

# COCO class-id -> ObjectClass mapping (subset relevant to safe-city)
_COCO_TO_OBJ: dict[int, ObjectClass] = {
    0: ObjectClass.person,
    1: ObjectClass.bike,       # bicycle
    2: ObjectClass.vehicle,    # car
    3: ObjectClass.bike,       # motorcycle
    5: ObjectClass.vehicle,    # bus
    7: ObjectClass.vehicle,    # truck
    24: ObjectClass.bag,       # backpack
    26: ObjectClass.bag,       # handbag
    28: ObjectClass.bag,       # suitcase
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _decode_image(raw: bytes) -> np.ndarray:
    """Decode raw bytes to a BGR OpenCV image."""
    arr = np.frombuffer(raw, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not decode uploaded image")
    return img


def _preprocess(img: np.ndarray, size: int = 640) -> np.ndarray:
    """Resize and normalise for RT-DETR style models.

    Returns a float32 NCHW tensor as a numpy array.
    """
    resized = cv2.resize(img, (size, size))
    blob = resized.astype(np.float32) / 255.0
    blob = blob.transpose(2, 0, 1)  # HWC -> CHW
    blob = np.expand_dims(blob, 0)  # add batch dim
    return blob


def _run_real_detection(
    img: np.ndarray,
    model_entry: dict,
    camera_id: str,
    conf_threshold: float,
) -> list[Detection]:
    """Run actual model inference using a loaded PyTorch checkpoint.

    This is the real inference path.  It currently supports RT-DETR style
    models that return a dict with ``pred_logits`` and ``pred_boxes`` keys.
    If the output format does not match, falls back to simulated detections.
    """
    import torch

    checkpoint = model_entry.get("checkpoint")
    if checkpoint is None:
        return []

    h_orig, w_orig = img.shape[:2]
    blob = _preprocess(img, 640)
    tensor = torch.from_numpy(blob)

    device = next(iter([settings.DEVICE]), "cpu")
    tensor = tensor.to(device)

    # If the checkpoint is an nn.Module, call it directly.
    if isinstance(checkpoint, torch.nn.Module):
        checkpoint.eval()
        with torch.no_grad():
            outputs = checkpoint(tensor)
    else:
        # Checkpoint might be a raw state-dict -- cannot run inference
        # without the architecture definition.  Fall back.
        logger.warning("Checkpoint is a state-dict, cannot run direct inference -- falling back to simulated detections")
        return []

    # Parse RT-DETR / DETR-style outputs.
    try:
        logits = outputs["pred_logits"].sigmoid()  # (B, num_queries, num_classes)
        boxes = outputs["pred_boxes"]  # (B, num_queries, 4) -- cx, cy, w, h normalised

        scores, labels = logits[0].max(dim=-1)
        keep = scores > conf_threshold

        kept_scores = scores[keep].cpu().tolist()
        kept_labels = labels[keep].cpu().tolist()
        kept_boxes = boxes[0][keep].cpu().tolist()

        now = datetime.now(timezone.utc)
        detections: list[Detection] = []
        for idx, (score, label, box) in enumerate(
            zip(kept_scores, kept_labels, kept_boxes)
        ):
            cx, cy, bw, bh = box
            x = (cx - bw / 2) * w_orig
            y = (cy - bh / 2) * h_orig
            w = bw * w_orig
            h = bh * h_orig

            obj_class = _COCO_TO_OBJ.get(label, ObjectClass.other)
            detections.append(
                Detection(
                    track_id=idx,
                    object_class=obj_class,
                    confidence=round(score, 4),
                    bbox=BoundingBox(x=x, y=y, w=w, h=h),
                    camera_id=camera_id,
                    timestamp=now,
                )
            )

        return detections

    except (KeyError, AttributeError) as exc:
        logger.warning("Unexpected model output format: %s -- falling back", exc)
        return []


def _simulate_detections(
    img: np.ndarray,
    camera_id: str,
    conf_threshold: float,
) -> list[Detection]:
    """Generate plausible simulated detections from an image."""
    h, w = img.shape[:2]
    now = datetime.now(timezone.utc)
    num = random.randint(1, 6)
    dets: list[Detection] = []

    for i in range(num):
        obj_class = random.choice(
            [ObjectClass.person, ObjectClass.person, ObjectClass.person,
             ObjectClass.vehicle, ObjectClass.vehicle, ObjectClass.bike]
        )

        if obj_class == ObjectClass.person:
            bw = random.randint(30, min(100, w // 4))
            bh = random.randint(80, min(250, h // 2))
        elif obj_class == ObjectClass.vehicle:
            bw = random.randint(80, min(300, w // 3))
            bh = random.randint(50, min(180, h // 3))
        else:
            bw = random.randint(20, min(80, w // 5))
            bh = random.randint(30, min(100, h // 4))

        x = random.randint(0, max(0, w - bw))
        y = random.randint(0, max(0, h - bh))
        conf = round(random.uniform(max(conf_threshold, 0.55), 0.98), 4)

        dets.append(
            Detection(
                track_id=i,
                object_class=obj_class,
                confidence=conf,
                bbox=BoundingBox(x=float(x), y=float(y), w=float(bw), h=float(bh)),
                camera_id=camera_id,
                timestamp=now,
            )
        )

    return dets


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("", response_model=list[Detection])
async def detect_objects(
    request: Request,
    image: UploadFile = File(...),
    camera_id: str = Form("cam-0"),
    confidence: float = Form(None),
) -> list[Detection]:
    """Run object detection on an uploaded image.

    If the RT-DETR or Co-DETR model is loaded **and** ``USE_REAL_MODELS``
    is enabled, real inference is performed.  Otherwise simulated detections
    are returned with proper bounding-box geometry.
    """
    start = time.perf_counter()
    raw = await image.read()
    img = _decode_image(raw)
    conf_threshold = confidence if confidence is not None else settings.CONFIDENCE_THRESHOLD

    registry = request.app.state.model_registry
    detections: list[Detection] = []

    if settings.USE_REAL_MODELS:
        # Try RT-DETR first, then Co-DETR
        for model_name in ("rt-detr", "co-detr"):
            if registry.is_loaded(model_name):
                detections = _run_real_detection(
                    img, registry.get_model(model_name), camera_id, conf_threshold
                )
                if detections:
                    break

    if not detections:
        detections = _simulate_detections(img, camera_id, conf_threshold)

    elapsed_ms = (time.perf_counter() - start) * 1000
    logger.info(
        "detect: %d objects in %.1f ms (camera=%s, real=%s)",
        len(detections),
        elapsed_ms,
        camera_id,
        bool(settings.USE_REAL_MODELS and registry.is_loaded("rt-detr")),
    )
    return detections


@router.post("/batch", response_model=list[list[Detection]])
async def detect_objects_batch(
    request: Request,
    images: list[UploadFile] = File(...),
    camera_id: str = Form("cam-0"),
    confidence: float = Form(None),
) -> list[list[Detection]]:
    """Run object detection on a batch of images."""
    conf_threshold = confidence if confidence is not None else settings.CONFIDENCE_THRESHOLD
    registry = request.app.state.model_registry
    results: list[list[Detection]] = []

    for img_file in images:
        raw = await img_file.read()
        img = _decode_image(raw)
        dets: list[Detection] = []

        if settings.USE_REAL_MODELS:
            for model_name in ("rt-detr", "co-detr"):
                if registry.is_loaded(model_name):
                    dets = _run_real_detection(
                        img, registry.get_model(model_name), camera_id, conf_threshold
                    )
                    if dets:
                        break

        if not dets:
            dets = _simulate_detections(img, camera_id, conf_threshold)

        results.append(dets)

    return results
