from __future__ import annotations

import base64
import logging
import time
from pathlib import Path

import cv2
import numpy as np
from fastapi import APIRouter, File, Form, UploadFile
from pydantic import BaseModel

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


# ---------------------------------------------------------------------------
# Face search across all indexed videos
# ---------------------------------------------------------------------------

class SearchRequest(BaseModel):
    embedding: list[float]
    top_k: int = 20


@router.post("/search")
async def search_face(req: SearchRequest):
    """Search for matching faces across all indexed video frames."""
    from ai.app.services.face_index import face_index

    if face_index.size == 0:
        return {"matches": [], "index_size": 0, "message": "Index empty — run /face/index/build first"}

    results = face_index.search(req.embedding, top_k=req.top_k)
    return {
        "matches": results,
        "index_size": face_index.size,
    }


@router.post("/search/by-image")
async def search_face_by_image(image: UploadFile = File(...), top_k: int = Form(20)):
    """Upload a face image to search across all indexed videos."""
    from ai.app.services.face_index import face_index

    contents = await image.read()
    arr = np.frombuffer(contents, dtype=np.uint8)
    frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if frame is None:
        return {"matches": [], "error": "Could not decode image"}

    app = get_face_app()
    if app == "unavailable" or app is None:
        return {"matches": [], "error": "Face detection unavailable"}

    faces = app.get(frame)
    if not faces:
        return {"matches": [], "error": "No face detected in image"}

    embedding = faces[0].embedding.tolist()
    results = face_index.search(embedding, top_k=top_k)
    return {
        "matches": results,
        "index_size": face_index.size,
        "query_face_bbox": {
            "x": round(faces[0].bbox[0], 1),
            "y": round(faces[0].bbox[1], 1),
            "w": round(faces[0].bbox[2] - faces[0].bbox[0], 1),
            "h": round(faces[0].bbox[3] - faces[0].bbox[1], 1),
        },
    }


# ---------------------------------------------------------------------------
# Index builder — processes all videos and extracts face embeddings
# ---------------------------------------------------------------------------

NVR_VIDEO_DIR = "/root/camera_feeds/mp4"

def _discover_videos() -> list[tuple[str, str]]:
    """Find NVR MP4 files only. Returns [(camera_id, full_path)]."""
    import glob, re
    videos = []
    for path in sorted(glob.glob(f"{NVR_VIDEO_DIR}/*.mp4")):
        fname = Path(path).name
        # Extract camera ID (D01, D03, etc.)
        match = re.match(r"(D\d+)_", fname)
        cam_id = match.group(1) if match else fname.replace(".mp4", "")
        videos.append((cam_id, path))
    return videos

# Legacy map for face index (still uses old camera UUIDs)
VIDEO_MAP = {
    "00000000-0000-4000-8000-000000000001": "clip_peshawar_streets.mp4",
    "00000000-0000-4000-8000-000000000002": "clip_peshawar_bazaar.mp4",
    "00000000-0000-4000-8000-000000000003": "clip_charsadda_drone.mp4",
    "00000000-0000-4000-8000-000000000004": "clip_peshawar_walking.mp4",
    "00000000-0000-4000-8000-000000000005": "clip_rawalpindi_streets.mp4",
}
VIDEO_DIR = "/workspace/safe-city/test-data/pakistani"


@router.post("/index/build")
async def build_face_index(frame_skip: int = Form(5)):
    """
    Process ALL video files, extract faces every Nth frame, build searchable index.
    This takes a few minutes on first run.
    """
    from ai.app.services.face_index import face_index

    app = get_face_app()
    if app == "unavailable" or app is None:
        return {"error": "InsightFace not available"}

    t0 = time.perf_counter()
    total_faces = 0
    total_frames = 0
    processed_videos = []

    for camera_id, filename in VIDEO_MAP.items():
        video_path = Path(VIDEO_DIR) / filename
        if not video_path.exists():
            logger.warning("Video not found: %s", video_path)
            continue

        cap = cv2.VideoCapture(str(video_path))
        fps = cap.get(cv2.CAP_PROP_FPS) or 25
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        video_faces = 0
        frame_num = 0

        logger.info("Indexing %s (%d frames, %.0f fps)...", filename, frame_count, fps)

        while True:
            ret, frame = cap.read()
            if not ret:
                break

            if frame_num % frame_skip != 0:
                frame_num += 1
                continue

            total_frames += 1
            faces = app.get(frame)

            for face in faces:
                if face.embedding is None:
                    continue
                if face.det_score < 0.5:
                    continue

                # Create a small face thumbnail (base64)
                bbox = face.bbox.astype(int)
                x1, y1, x2, y2 = max(0, bbox[0]), max(0, bbox[1]), min(frame.shape[1], bbox[2]), min(frame.shape[0], bbox[3])
                if x2 <= x1 or y2 <= y1:
                    continue
                face_crop = frame[y1:y2, x1:x2]
                face_resized = cv2.resize(face_crop, (80, 80))
                _, thumb_buf = cv2.imencode(".jpg", face_resized, [cv2.IMWRITE_JPEG_QUALITY, 70])
                thumb_b64 = base64.b64encode(thumb_buf.tobytes()).decode("ascii")

                timestamp = round(frame_num / fps, 2)

                face_index.add(
                    embedding=face.embedding.tolist(),
                    meta={
                        "camera_id": camera_id,
                        "video_file": filename,
                        "frame_num": frame_num,
                        "timestamp_sec": timestamp,
                        "face_bbox": {"x": int(x1), "y": int(y1), "w": int(x2-x1), "h": int(y2-y1)},
                        "quality_score": round(float(face.det_score), 3),
                        "thumbnail_b64": thumb_b64,
                    },
                )
                total_faces += 1
                video_faces += 1

            frame_num += 1

        cap.release()
        processed_videos.append({
            "video": filename,
            "camera_id": camera_id,
            "frames_processed": frame_count // frame_skip,
            "faces_found": video_faces,
        })
        logger.info("  %s: %d faces from %d frames", filename, video_faces, frame_count // frame_skip)

    face_index.save()
    elapsed = time.perf_counter() - t0

    return {
        "status": "ok",
        "total_faces_indexed": total_faces,
        "total_frames_processed": total_frames,
        "elapsed_seconds": round(elapsed, 1),
        "videos": processed_videos,
        "index_size": face_index.size,
    }


@router.get("/index/status")
async def index_status():
    """Check face + vehicle index status."""
    from ai.app.services.face_index import face_index
    from ai.app.services.vehicle_index import vehicle_index
    return {
        "face_index_size": face_index.size,
        "vehicle_index_size": vehicle_index.size,
        "has_face_index": face_index.embeddings is not None,
        "has_vehicle_index": vehicle_index.embeddings is not None,
    }


# ---------------------------------------------------------------------------
# Vehicle reverse search — CLIP embeddings
# ---------------------------------------------------------------------------

_clip_model = None
_clip_preprocess = None

def _get_clip():
    global _clip_model, _clip_preprocess
    if _clip_model is None:
        import clip as clip_module
        import torch
        device = "cuda" if torch.cuda.is_available() else "cpu"
        _clip_model, _clip_preprocess = clip_module.load("ViT-B/32", device=device)
        logger.info("CLIP ViT-B/32 loaded for vehicle indexing")
    return _clip_model, _clip_preprocess


def _clip_embed_image(img_bgr: np.ndarray) -> list[float]:
    """Extract CLIP embedding from a BGR image."""
    import torch
    from PIL import Image as PILImage
    model, preprocess = _get_clip()
    device = next(model.parameters()).device
    pil = PILImage.fromarray(cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB))
    inp = preprocess(pil).unsqueeze(0).to(device)
    with torch.no_grad():
        feat = model.encode_image(inp)
        feat = feat / feat.norm(dim=-1, keepdim=True)
    return feat[0].cpu().tolist()


def _dominant_color(img_bgr: np.ndarray) -> str:
    """Get dominant color from CENTER of vehicle crop (ignores background/road).
    Uses K-means on center 50% pixels for accurate body color."""
    h_img, w_img = img_bgr.shape[:2]
    # Take center 50% to avoid road/background at edges
    y1 = h_img // 4
    y2 = h_img * 3 // 4
    x1 = w_img // 4
    x2 = w_img * 3 // 4
    center = img_bgr[y1:y2, x1:x2]
    if center.size == 0:
        center = img_bgr

    # Convert to HSV for better color analysis
    hsv = cv2.cvtColor(center, cv2.COLOR_BGR2HSV)
    pixels = hsv.reshape(-1, 3).astype(np.float32)

    # K-means to find dominant color cluster
    criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 10, 1.0)
    _, labels, centers = cv2.kmeans(pixels, 3, None, criteria, 3, cv2.KMEANS_PP_CENTERS)

    # Pick largest cluster
    counts = np.bincount(labels.flatten())
    dominant = centers[np.argmax(counts)]
    h, s, v = dominant

    # Map HSV to color name
    if s < 35:
        if v < 60: return "black"
        if v > 170: return "white"
        return "silver"
    if s < 60 and v > 100:
        return "silver"
    if h < 8 or h > 170: return "red"
    if h < 20: return "orange"
    if h < 33: return "yellow"
    if h < 78: return "green"
    if h < 130: return "blue"
    if h < 160: return "purple"
    return "red"


# COCO classes for vehicles
_VEHICLE_COCO = {2: "car", 3: "motorcycle", 5: "bus", 7: "truck"}


@router.post("/vehicle-index/build")
async def build_vehicle_index(frame_skip: int = Form(15)):
    """Process ALL videos (test clips + NVR), CLIP-classify every vehicle."""
    from ai.app.services.vehicle_index import vehicle_index
    import clip as clip_module
    import torch
    from PIL import Image as PILImage
    from ultralytics import YOLO

    yolo = YOLO("yolov8x.pt")
    model_c, preprocess_c = _get_clip()
    device_c = next(model_c.parameters()).device

    # CLIP type classification — ONLY for YOLO "car" class (motorcycle/bus/truck are already accurate)
    # Prompts emphasize VISUAL DISTINGUISHING FEATURES, not just names
    car_subtype_labels = [
        "a sedan car with a separate trunk compartment extending behind the rear window",
        "a tall SUV or jeep with high ground clearance and large wheels",
        "a small compact hatchback car with a sloped rear and no separate trunk",
        "a pickup truck with an open cargo bed at the rear",
        "a boxy van or minivan with a tall roof and sliding doors",
        "a three-wheeled auto-rickshaw or tuk-tuk for passenger transport",
        "a station wagon or estate car with an extended roofline",
    ]
    car_subtype_names = ["sedan", "SUV", "hatchback", "pickup", "van",
                          "auto-rickshaw", "wagon"]
    car_subtype_tokens = clip_module.tokenize(car_subtype_labels).to(device_c)
    with torch.no_grad():
        car_subtype_features = model_c.encode_text(car_subtype_tokens)
        car_subtype_features = car_subtype_features / car_subtype_features.norm(dim=-1, keepdim=True)

    # Reset index
    vehicle_index.embeddings = None
    vehicle_index.metadata = []

    # Dedup tracking — skip vehicles we've already seen (same car across frames)
    seen_embeddings: list[np.ndarray] = []
    DEDUP_THRESHOLD = 0.92  # cosine sim > this = same vehicle, skip

    def _is_duplicate(emb: np.ndarray) -> bool:
        if not seen_embeddings:
            return False
        # Compare against recent vehicles only (last 200) for speed
        recent = seen_embeddings[-200:]
        stack = np.array(recent, dtype=np.float32)
        sims = (stack @ emb.reshape(-1, 1)).flatten()
        return float(sims.max()) > DEDUP_THRESHOLD

    t0 = time.perf_counter()
    total_vehicles = 0
    total_frames = 0
    total_skipped = 0

    all_videos = _discover_videos()
    logger.info("Found %d videos to index", len(all_videos))

    for cam_id, video_path in all_videos:
        cap = cv2.VideoCapture(video_path)
        fps = cap.get(cv2.CAP_PROP_FPS) or 25
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        frame_num = 0
        video_name = Path(video_path).name

        logger.info("Vehicle indexing %s (%d frames, skip=%d)...", video_name, frame_count, frame_skip)

        while True:
            ret, frame = cap.read()
            if not ret:
                break
            if frame_num % frame_skip != 0:
                frame_num += 1
                continue

            total_frames += 1
            results = yolo(frame, conf=0.3, verbose=False)

            for r in results:
                if r.boxes is None:
                    continue
                for i in range(len(r.boxes)):
                    cls_id = int(r.boxes.cls[i].item())
                    if cls_id not in _VEHICLE_COCO:
                        continue

                    x1, y1, x2, y2 = [int(v) for v in r.boxes.xyxy[i].tolist()]
                    h_frame, w_frame = frame.shape[:2]

                    # Pad 15% around bbox for full vehicle visibility
                    bw, bh = x2 - x1, y2 - y1
                    pad = int(max(bw, bh) * 0.15)
                    x1 = max(0, x1 - pad)
                    y1 = max(0, y1 - pad)
                    x2 = min(w_frame, x2 + pad)
                    y2 = min(h_frame, y2 + pad)

                    crop = frame[y1:y2, x1:x2]
                    if crop.size == 0:
                        continue

                    # CLIP embedding for similarity search
                    pil_crop = PILImage.fromarray(cv2.cvtColor(crop, cv2.COLOR_BGR2RGB))
                    img_input = preprocess_c(pil_crop).unsqueeze(0).to(device_c)
                    with torch.no_grad():
                        img_f = model_c.encode_image(img_input)
                        img_f = img_f / img_f.norm(dim=-1, keepdim=True)
                        emb_np = img_f[0].cpu().numpy()

                    # Dedup — skip if we've seen this exact vehicle recently
                    if _is_duplicate(emb_np):
                        total_skipped += 1
                        continue

                    seen_embeddings.append(emb_np)

                    # COLOR — pixel-based analysis on center of crop (NOT CLIP)
                    best_color = _dominant_color(crop)

                    # TYPE — use YOLO class for motorcycle/bus/truck (already accurate)
                    # Only sub-classify YOLO "car" using CLIP
                    yolo_class = _VEHICLE_COCO[cls_id]
                    if yolo_class == "car":
                        with torch.no_grad():
                            type_sims = (100.0 * img_f @ car_subtype_features.T).softmax(dim=-1)[0].cpu().tolist()
                            best_type_idx = type_sims.index(max(type_sims))
                            best_type = car_subtype_names[best_type_idx]
                            best_type_conf = type_sims[best_type_idx]
                    else:
                        best_type = yolo_class
                        best_type_conf = float(r.boxes.conf[i].item())

                    # Full quality thumbnail (max 400px wide, quality 90)
                    th, tw = crop.shape[:2]
                    if tw > 400:
                        scale = 400 / tw
                        thumb = cv2.resize(crop, (400, int(th * scale)), interpolation=cv2.INTER_AREA)
                    else:
                        thumb = crop
                    _, buf = cv2.imencode(".jpg", thumb, [cv2.IMWRITE_JPEG_QUALITY, 90])
                    thumb_b64 = base64.b64encode(buf.tobytes()).decode("ascii")

                    vehicle_index.add(
                        embedding=emb_np.tolist(),
                        meta={
                            "camera_id": cam_id,
                            "video_file": video_name,
                            "frame_num": frame_num,
                            "timestamp_sec": round(frame_num / fps, 2),
                            "vehicle_class": best_type,
                            "type_confidence": round(best_type_conf, 3),
                            "dominant_color": best_color,
                            "yolo_class": yolo_class,
                            "bbox": {"x": x1, "y": y1, "w": x2-x1, "h": y2-y1},
                            "thumbnail_b64": thumb_b64,
                        },
                    )
                    total_vehicles += 1

            frame_num += 1

        cap.release()
        logger.info("  %s: %d unique vehicles (skipped %d dupes)", video_name, total_vehicles, total_skipped)

    vehicle_index.save()
    elapsed = time.perf_counter() - t0
    logger.info("Vehicle index complete: %d unique, %d dupes skipped, %.0fs", total_vehicles, total_skipped, elapsed)
    return {
        "status": "ok",
        "total_vehicles_indexed": total_vehicles,
        "duplicates_skipped": total_skipped,
        "total_frames_processed": total_frames,
        "elapsed_seconds": round(elapsed, 1),
        "index_size": vehicle_index.size,
        "videos_processed": len(all_videos),
    }


class VehicleSearchRequest(BaseModel):
    embedding: list[float]
    top_k: int = 20
    filter_type: str | None = None
    filter_color: str | None = None


@router.post("/vehicle-search")
async def search_vehicle(req: VehicleSearchRequest):
    """Search for visually similar vehicles across all indexed video frames."""
    from ai.app.services.vehicle_index import vehicle_index
    if vehicle_index.size == 0:
        return {"matches": [], "index_size": 0, "message": "Run /face/vehicle-index/build first"}
    results = vehicle_index.search(req.embedding, top_k=req.top_k,
                                    filter_type=req.filter_type, filter_color=req.filter_color)
    return {"matches": results, "index_size": vehicle_index.size}


@router.post("/vehicle-search/by-image")
async def search_vehicle_by_image(image: UploadFile = File(...), top_k: int = Form(20)):
    """Upload a vehicle image to search across all indexed videos."""
    from ai.app.services.vehicle_index import vehicle_index
    contents = await image.read()
    arr = np.frombuffer(contents, dtype=np.uint8)
    frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if frame is None:
        return {"matches": [], "error": "Could not decode image"}

    emb = _clip_embed_image(frame)
    results = vehicle_index.search(emb, top_k=top_k)
    return {"matches": results, "index_size": vehicle_index.size}
