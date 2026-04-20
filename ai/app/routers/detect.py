from __future__ import annotations

import logging
import time
from datetime import datetime, timezone

import cv2
import numpy as np
from fastapi import APIRouter, File, Form, Request, UploadFile

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/detect", tags=["detection"])

# Global YOLO model — loaded once
_yolo_model = None

def get_yolo():
    global _yolo_model
    if _yolo_model is None:
        from ultralytics import YOLO
        _yolo_model = YOLO("yolov8x.pt")
        logger.info("YOLOv8x loaded for detection")
    return _yolo_model

# COCO class names to our types
# Rickshaws/chingchis may be detected as car, motorcycle, or truck by YOLO
COCO_MAP = {
    0: "person",
    1: "bike",      # bicycle
    2: "vehicle",   # car (also catches rickshaws/chingchis)
    3: "vehicle",   # motorcycle — map to vehicle so rickshaws on 3-wheels get caught
    4: "vehicle",   # airplane — unlikely but safe
    5: "vehicle",   # bus
    6: "vehicle",   # train
    7: "vehicle",   # truck
    8: "vehicle",   # boat
    24: "bag",      # backpack
    26: "bag",      # handbag
    28: "bag",      # suitcase
}

@router.post("")
async def detect_objects(
    image: UploadFile = File(...),
    camera_id: str = Form("unknown"),
    confidence: float = Form(0.3),
):
    """Run YOLOv8x detection on an uploaded image."""
    t0 = time.perf_counter()

    contents = await image.read()
    arr = np.frombuffer(contents, dtype=np.uint8)
    frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if frame is None:
        return []

    model = get_yolo()
    results = model(frame, conf=confidence, verbose=False)

    detections = []
    for r in results:
        boxes = r.boxes
        if boxes is None:
            continue
        for i in range(len(boxes)):
            cls_id = int(boxes.cls[i].item())
            obj_class = COCO_MAP.get(cls_id)
            if obj_class is None:
                continue

            x1, y1, x2, y2 = boxes.xyxy[i].tolist()
            conf = float(boxes.conf[i].item())

            detections.append({
                "track_id": i,
                "object_class": obj_class,
                "confidence": round(conf, 4),
                "bbox": {
                    "x": round(x1, 1),
                    "y": round(y1, 1),
                    "w": round(x2 - x1, 1),
                    "h": round(y2 - y1, 1),
                },
                "camera_id": camera_id,
                "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ"),
                "is_new_track": False,
            })

    elapsed = (time.perf_counter() - t0) * 1000
    logger.info("Detection: %d objects in %.0fms (camera=%s)", len(detections), elapsed, camera_id)
    return detections


@router.post("/batch")
async def detect_objects_batch(
    images: list[UploadFile] = File(...),
    camera_id: str = Form("unknown"),
    confidence: float = Form(0.3),
):
    """Batch detection on multiple images."""
    all_results = []
    for img in images:
        contents = await img.read()
        arr = np.frombuffer(contents, dtype=np.uint8)
        frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if frame is None:
            all_results.append([])
            continue

        model = get_yolo()
        results = model(frame, conf=confidence, verbose=False)

        dets = []
        for r in results:
            if r.boxes is None:
                continue
            for i in range(len(r.boxes)):
                cls_id = int(r.boxes.cls[i].item())
                obj_class = COCO_MAP.get(cls_id)
                if obj_class is None:
                    continue
                x1, y1, x2, y2 = r.boxes.xyxy[i].tolist()
                conf_val = float(r.boxes.conf[i].item())
                dets.append({
                    "track_id": i,
                    "object_class": obj_class,
                    "confidence": round(conf_val, 4),
                    "bbox": {"x": round(x1,1), "y": round(y1,1), "w": round(x2-x1,1), "h": round(y2-y1,1)},
                    "camera_id": camera_id,
                    "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ"),
                    "is_new_track": False,
                })
        all_results.append(dets)
    return all_results
