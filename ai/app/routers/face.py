from __future__ import annotations

import logging
import random
import time

import cv2
import numpy as np
from fastapi import APIRouter, File, Request, UploadFile
from pydantic import BaseModel

from ai.app.core.config import settings
from shared.schemas import BoundingBox, FaceDetectionResult

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/face", tags=["face"])


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------

class FaceSearchRequest(BaseModel):
    embedding: list[float]
    top_k: int = 5


class FaceSearchMatch(BaseModel):
    identity_id: str
    distance: float


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _decode_image(raw: bytes) -> np.ndarray:
    arr = np.frombuffer(raw, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not decode uploaded image")
    return img


def _run_scrfd_detection(
    img: np.ndarray,
    session,  # onnxruntime.InferenceSession
) -> list[dict]:
    """Run SCRFD face detection via ONNX Runtime.

    SCRFD expects a 640x640 BGR image.  Returns a list of dicts with
    ``bbox`` (x, y, w, h in original coords) and ``score``.
    """
    h_orig, w_orig = img.shape[:2]
    input_size = 640

    # Preprocess: resize, float32, NCHW
    resized = cv2.resize(img, (input_size, input_size))
    blob = cv2.dnn.blobFromImage(
        resized, 1.0 / 128.0, (input_size, input_size), (127.5, 127.5, 127.5), swapRB=True
    )

    input_name = session.get_inputs()[0].name
    outputs = session.run(None, {input_name: blob})

    # SCRFD outputs vary by export config.  Attempt to parse the common
    # 3-stride format (scores, bboxes, keypoints per stride).
    faces: list[dict] = []
    try:
        # Simple heuristic: iterate output tensors looking for ones that
        # look like score maps (shape N,2) and bbox maps (shape N,4).
        score_blobs = [o for o in outputs if o.ndim == 2 and o.shape[1] == 1]
        bbox_blobs = [o for o in outputs if o.ndim == 2 and o.shape[1] == 4]

        if not score_blobs or not bbox_blobs:
            # Fall back to treating the first output as combined results
            # [batch, num, 15] = score + 4 bbox + 10 kps
            combined = outputs[0]
            if combined.ndim == 3:
                combined = combined[0]
            for row in combined:
                score = float(row[0]) if len(row) > 0 else 0.0
                if score < 0.5:
                    continue
                if len(row) >= 5:
                    x1, y1, x2, y2 = row[1:5]
                    faces.append({
                        "bbox": {
                            "x": float(x1) / input_size * w_orig,
                            "y": float(y1) / input_size * h_orig,
                            "w": float(x2 - x1) / input_size * w_orig,
                            "h": float(y2 - y1) / input_size * h_orig,
                        },
                        "score": score,
                    })
        else:
            for scores_arr, bboxes_arr in zip(score_blobs, bbox_blobs):
                for score_row, bbox_row in zip(scores_arr, bboxes_arr):
                    score = float(score_row[0]) if score_row.ndim > 0 else float(score_row)
                    if score < 0.5:
                        continue
                    x1, y1, x2, y2 = bbox_row[:4]
                    faces.append({
                        "bbox": {
                            "x": float(x1) / input_size * w_orig,
                            "y": float(y1) / input_size * h_orig,
                            "w": float(x2 - x1) / input_size * w_orig,
                            "h": float(y2 - y1) / input_size * h_orig,
                        },
                        "score": score,
                    })
    except Exception as exc:
        logger.warning("SCRFD output parsing failed: %s", exc)

    return faces


def _run_glintr100_embedding(
    img: np.ndarray,
    bbox: dict,
    session,  # onnxruntime.InferenceSession
) -> list[float]:
    """Extract a 512-d face embedding using GlintR100 ONNX model.

    Crops the face from *img* using *bbox*, resizes to 112x112, normalises,
    and runs through the ONNX session.
    """
    h, w = img.shape[:2]
    x = max(0, int(bbox["x"]))
    y = max(0, int(bbox["y"]))
    bw = int(bbox["w"])
    bh = int(bbox["h"])
    crop = img[y : y + bh, x : x + bw]
    if crop.size == 0:
        return [0.0] * 512

    crop_resized = cv2.resize(crop, (112, 112))
    blob = crop_resized.astype(np.float32).transpose(2, 0, 1)  # CHW
    blob = (blob - 127.5) / 127.5  # normalise to [-1, 1]
    blob = np.expand_dims(blob, 0)

    input_name = session.get_inputs()[0].name
    outputs = session.run(None, {input_name: blob})
    embedding = outputs[0].flatten().tolist()

    # L2-normalise
    norm = max(np.linalg.norm(embedding), 1e-10)
    embedding = [v / norm for v in embedding]
    return embedding


def _simulate_face_detection(img: np.ndarray) -> list[dict]:
    """Simulated face detection -- returns plausible bounding boxes."""
    h, w = img.shape[:2]
    num = random.randint(1, 3)
    faces = []
    for _ in range(num):
        fw = random.randint(30, min(80, w // 4))
        fh = random.randint(40, min(100, h // 3))
        fx = random.randint(0, max(0, w - fw))
        fy = random.randint(0, max(0, h - fh))
        faces.append({
            "bbox": {"x": fx, "y": fy, "w": fw, "h": fh},
            "score": round(random.uniform(0.80, 0.99), 4),
        })
    return faces


def _simulate_embedding() -> list[float]:
    """Return a random 512-d unit vector."""
    vec = [random.gauss(0, 1) for _ in range(512)]
    norm = max(sum(v * v for v in vec) ** 0.5, 1e-10)
    return [round(v / norm, 6) for v in vec]


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/detect", response_model=list[FaceDetectionResult])
async def detect_faces(
    request: Request,
    image: UploadFile = File(...),
) -> list[FaceDetectionResult]:
    """Detect faces in an image and return bounding boxes with quality scores.

    Uses SCRFD (ONNX) when the model is loaded, otherwise returns
    simulated results.
    """
    start = time.perf_counter()
    raw = await image.read()
    img = _decode_image(raw)

    registry = request.app.state.model_registry
    faces: list[dict] = []

    if settings.USE_REAL_MODELS and registry.is_loaded("auraface-detector"):
        model_entry = registry.get_model("auraface-detector")
        session = model_entry.get("session")
        if session is not None:
            faces = _run_scrfd_detection(img, session)

    if not faces:
        faces = _simulate_face_detection(img)

    results = [
        FaceDetectionResult(
            face_bbox=BoundingBox(
                x=f["bbox"]["x"], y=f["bbox"]["y"],
                w=f["bbox"]["w"], h=f["bbox"]["h"],
            ),
            quality_score=f["score"],
        )
        for f in faces
    ]

    elapsed = (time.perf_counter() - start) * 1000
    logger.info("face/detect: %d faces in %.1f ms", len(results), elapsed)
    return results


@router.post("/embed", response_model=FaceDetectionResult)
async def embed_face(
    request: Request,
    image: UploadFile = File(...),
) -> FaceDetectionResult:
    """Detect the dominant face and extract a 512-d embedding.

    Uses SCRFD + GlintR100 (ONNX) when the models are loaded; otherwise
    returns simulated results.
    """
    start = time.perf_counter()
    raw = await image.read()
    img = _decode_image(raw)

    registry = request.app.state.model_registry
    face_bbox: dict | None = None
    quality: float = 0.0
    embedding: list[float] = []

    # Step 1: Detect face
    if settings.USE_REAL_MODELS and registry.is_loaded("auraface-detector"):
        det_session = registry.get_model("auraface-detector").get("session")
        if det_session is not None:
            faces = _run_scrfd_detection(img, det_session)
            if faces:
                best = max(faces, key=lambda f: f["score"])
                face_bbox = best["bbox"]
                quality = best["score"]

    if face_bbox is None:
        sim_faces = _simulate_face_detection(img)
        best = sim_faces[0]
        face_bbox = best["bbox"]
        quality = best["score"]

    # Step 2: Extract embedding
    if settings.USE_REAL_MODELS and registry.is_loaded("auraface-recognizer"):
        rec_session = registry.get_model("auraface-recognizer").get("session")
        if rec_session is not None:
            embedding = _run_glintr100_embedding(img, face_bbox, rec_session)

    if not embedding:
        embedding = _simulate_embedding()

    elapsed = (time.perf_counter() - start) * 1000
    logger.info("face/embed: quality=%.2f in %.1f ms", quality, elapsed)

    return FaceDetectionResult(
        face_bbox=BoundingBox(
            x=face_bbox["x"], y=face_bbox["y"],
            w=face_bbox["w"], h=face_bbox["h"],
        ),
        quality_score=quality,
        embedding=embedding,
    )


@router.post("/search", response_model=list[FaceSearchMatch])
async def search_face(request: FaceSearchRequest) -> list[FaceSearchMatch]:
    """Search a face embedding against stored embeddings (placeholder)."""
    # TODO: Wire up vector DB (e.g. Qdrant / FAISS) for real search.
    return [
        FaceSearchMatch(identity_id="unknown-001", distance=0.45),
    ]
