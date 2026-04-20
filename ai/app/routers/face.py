from __future__ import annotations

import logging
import time

import cv2
import numpy as np
from fastapi import APIRouter, File, Form, UploadFile

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/face", tags=["face"])

# Use insightface for face detection + recognition (AuraFace SCRFD + GlintR100)
_face_app = None

def get_face_app():
    global _face_app
    if _face_app is None:
        try:
            from insightface.app import FaceAnalysis
            _face_app = FaceAnalysis(
                name="buffalo_l",
                root="/models/face/auraface",
                providers=["CUDAExecutionProvider", "CPUExecutionProvider"],
            )
            _face_app.prepare(ctx_id=0, det_size=(640, 640))
            logger.info("InsightFace loaded with SCRFD + recognition")
        except Exception as e:
            logger.warning("InsightFace not available: %s — using ONNX fallback", e)
            _face_app = "unavailable"
    return _face_app


@router.post("/detect")
async def detect_faces(image: UploadFile = File(...)):
    """Detect faces in an image using SCRFD."""
    contents = await image.read()
    arr = np.frombuffer(contents, dtype=np.uint8)
    frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if frame is None:
        return []

    app = get_face_app()
    if app == "unavailable" or app is None:
        return []

    t0 = time.perf_counter()
    faces = app.get(frame)
    elapsed = (time.perf_counter() - t0) * 1000
    logger.info("Face detection: %d faces in %.0fms", len(faces), elapsed)

    results = []
    for face in faces:
        bbox = face.bbox.tolist()
        results.append({
            "face_bbox": {
                "x": round(bbox[0], 1),
                "y": round(bbox[1], 1),
                "w": round(bbox[2] - bbox[0], 1),
                "h": round(bbox[3] - bbox[1], 1),
            },
            "quality_score": round(float(face.det_score), 3),
            "embedding": face.embedding.tolist() if face.embedding is not None else None,
        })
    return results


@router.post("/embed")
async def embed_face(image: UploadFile = File(...)):
    """Extract face embedding from a face crop."""
    contents = await image.read()
    arr = np.frombuffer(contents, dtype=np.uint8)
    frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if frame is None:
        return {"face_bbox": None, "quality_score": 0, "embedding": None}

    app = get_face_app()
    if app == "unavailable" or app is None:
        return {"face_bbox": None, "quality_score": 0, "embedding": None}

    faces = app.get(frame)
    if not faces:
        return {"face_bbox": None, "quality_score": 0, "embedding": None}

    face = faces[0]
    bbox = face.bbox.tolist()
    return {
        "face_bbox": {
            "x": round(bbox[0], 1),
            "y": round(bbox[1], 1),
            "w": round(bbox[2] - bbox[0], 1),
            "h": round(bbox[3] - bbox[1], 1),
        },
        "quality_score": round(float(face.det_score), 3),
        "embedding": face.embedding.tolist() if face.embedding is not None else None,
    }


@router.post("/search")
async def search_face(image: UploadFile = File(...), top_k: int = Form(5)):
    """Search for similar faces (placeholder — needs vector DB)."""
    return []
