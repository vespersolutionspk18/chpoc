from __future__ import annotations

import base64
import logging
import time

import cv2
import numpy as np
import torch
from fastapi import APIRouter, File, UploadFile

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/plate", tags=["plate"])

_plate_detector = None
_parseq = None
_parseq_transform = None
_upsampler = None
_fast_plate_ocr = None


# ---------------------------------------------------------------------------
# Lazy model loaders
# ---------------------------------------------------------------------------

def get_plate_detector():
    global _plate_detector
    if _plate_detector is None:
        from ultralytics import YOLO
        _plate_detector = YOLO("/models/plate/best.pt")
        logger.info("YOLO plate detector loaded")
    return _plate_detector


def get_parseq():
    global _parseq, _parseq_transform
    if _parseq is None:
        _parseq = torch.hub.load(
            "baudm/parseq", "parseq", pretrained=True, trust_repo=True
        ).eval().cuda()
        import torchvision.transforms as T
        _parseq_transform = T.Compose([
            T.ToPILImage(),
            T.Resize((32, 128)),
            T.ToTensor(),
            T.Normalize(0.5, 0.5),
        ])
        logger.info("PARSeq loaded for plate OCR")
    return _parseq, _parseq_transform


def get_fast_plate_ocr():
    global _fast_plate_ocr
    if _fast_plate_ocr is None:
        from fast_plate_ocr import LicensePlateRecognizer
        _fast_plate_ocr = LicensePlateRecognizer("global-plates-mobile-vit-v2-model")
        logger.info("fast-plate-ocr (global-plates-mobile-vit-v2) loaded")
    return _fast_plate_ocr


def get_upsampler():
    global _upsampler
    if _upsampler is None:
        try:
            from basicsr.archs.rrdbnet_arch import RRDBNet
            from realesrgan import RealESRGANer
            model = RRDBNet(
                num_in_ch=3, num_out_ch=3, num_feat=64,
                num_block=23, num_grow_ch=32, scale=4,
            )
            _upsampler = RealESRGANer(
                scale=4,
                model_path="/models/realesrgan/RealESRGAN_x4plus.pth",
                model=model, half=True, device="cuda",
            )
            logger.info("Real-ESRGAN 4x loaded")
        except Exception as e:
            logger.warning("Real-ESRGAN unavailable: %s", e)
            _upsampler = "unavailable"
    return _upsampler


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def upscale(img: np.ndarray) -> np.ndarray:
    """8x upscale using Real-ESRGAN (4x model run at outscale=8)."""
    up = get_upsampler()
    if up == "unavailable" or up is None:
        h, w = img.shape[:2]
        return cv2.resize(img, (w * 8, h * 8), interpolation=cv2.INTER_CUBIC)
    try:
        out, _ = up.enhance(img, outscale=8)
        return out
    except Exception:
        h, w = img.shape[:2]
        return cv2.resize(img, (w * 8, h * 8), interpolation=cv2.INTER_CUBIC)


def ocr_parseq(img_bgr: np.ndarray) -> tuple[str, float]:
    """Run PARSeq OCR on a BGR plate image. Returns (text, confidence)."""
    model, transform = get_parseq()
    rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    tensor = transform(rgb).unsqueeze(0).cuda()
    with torch.no_grad():
        logits = model(tensor)
        probs = logits.softmax(-1)
        preds, probs_out = model.tokenizer.decode(probs)
    text = preds[0].strip()
    conf = float(probs_out[0].mean()) if len(probs_out) > 0 else 0.0
    return text, conf


def ocr_fast_plate(img_bgr: np.ndarray) -> tuple[str, float]:
    """Run fast-plate-ocr on a BGR plate image. Returns (text, confidence)."""
    recognizer = get_fast_plate_ocr()
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    result = recognizer.run_one(gray, return_confidence=True)
    text = result.plate.strip()
    if result.char_probs is not None and len(result.char_probs) > 0:
        conf = float(np.mean(result.char_probs))
    else:
        conf = 0.0
    return text, conf


def dual_ocr(img_bgr: np.ndarray) -> tuple[str, float]:
    """
    Run BOTH fast-plate-ocr AND PARSeq on the image.
    Return the result with the highest confidence.
    """
    results = []

    try:
        fp_text, fp_conf = ocr_fast_plate(img_bgr)
        fp_clean = "".join(c for c in fp_text if c.isalnum() or c == "-")
        if len(fp_clean) >= 2:
            results.append((fp_clean, fp_conf, "fast-plate-ocr"))
            logger.info("  fast-plate-ocr: '%s' (%.0f%%)", fp_clean, fp_conf * 100)
    except Exception as e:
        logger.warning("fast-plate-ocr failed: %s", e)

    try:
        ps_text, ps_conf = ocr_parseq(img_bgr)
        ps_clean = "".join(c for c in ps_text if c.isalnum() or c == "-")
        if len(ps_clean) >= 2:
            results.append((ps_clean, ps_conf, "parseq"))
            logger.info("  PARSeq: '%s' (%.0f%%)", ps_clean, ps_conf * 100)
    except Exception as e:
        logger.warning("PARSeq failed: %s", e)

    if not results:
        return "", 0.0

    best = max(results, key=lambda r: r[1])
    logger.info("  Winner: %s -> '%s' (%.0f%%)", best[2], best[0], best[1] * 100)
    return best[0], best[1]


def encode_plate_image(img_bgr: np.ndarray) -> str:
    """Encode a plate crop as base64 JPEG for frontend display."""
    h, w = img_bgr.shape[:2]
    if w > 400:
        scale = 400 / w
        img_bgr = cv2.resize(
            img_bgr, (400, int(h * scale)), interpolation=cv2.INTER_AREA
        )
    _, buf = cv2.imencode(".jpg", img_bgr, [cv2.IMWRITE_JPEG_QUALITY, 90])
    return base64.b64encode(buf.tobytes()).decode("ascii")


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

@router.post("/read")
async def read_plate(image: UploadFile = File(...)):
    """
    Plate recognition pipeline:
      1. Small image (<300px wide) -> treat as pre-cropped plate
      2. Large image -> YOLO plate detection to find bounding box
      3. 8x upscale with Real-ESRGAN
      4. Dual OCR: fast-plate-ocr AND PARSeq, return highest confidence
      5. Return plate text, confidence, bounding box, and base64 plate image
    """
    t0 = time.perf_counter()
    contents = await image.read()
    arr = np.frombuffer(contents, dtype=np.uint8)
    frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)

    empty_response = {
        "plate_text": "",
        "confidence": 0,
        "plate_bbox": {"x": 0, "y": 0, "w": 0, "h": 0},
        "plate_image_b64": "",
    }

    if frame is None:
        return empty_response

    h, w = frame.shape[:2]

    # ----- Path A: Small image = already a plate crop -----
    if w < 300:
        logger.info("Small image (%dx%d) — treating as plate crop", w, h)
        upscaled = upscale(frame)
        text, conf = dual_ocr(upscaled)
        elapsed = (time.perf_counter() - t0) * 1000
        logger.info(
            "Plate (direct crop): '%s' (%.0f%%) in %.0fms",
            text, conf * 100, elapsed,
        )
        if len(text) >= 2:
            return {
                "plate_text": text,
                "confidence": round(conf, 4),
                "plate_bbox": {"x": 0, "y": 0, "w": round(float(w), 1), "h": round(float(h), 1)},
                "plate_image_b64": encode_plate_image(upscaled),
            }
        return empty_response

    # ----- Path B: Full frame — detect plate with YOLO first -----
    detector = get_plate_detector()
    results = detector(frame, conf=0.2, verbose=False)

    best_text = ""
    best_conf = 0.0
    best_bbox = {"x": 0, "y": 0, "w": 0, "h": 0}
    best_plate_b64 = ""

    for r in results:
        if r.boxes is None:
            continue
        for i in range(len(r.boxes)):
            x1, y1, x2, y2 = r.boxes.xyxy[i].tolist()
            det_conf = float(r.boxes.conf[i])

            plate_crop = frame[int(y1):int(y2), int(x1):int(x2)]
            if plate_crop.size == 0:
                continue

            upscaled = upscale(plate_crop)
            text, ocr_conf = dual_ocr(upscaled)
            combined_conf = det_conf * ocr_conf

            if combined_conf > best_conf and len(text) >= 2:
                best_text = text
                best_conf = combined_conf
                best_bbox = {
                    "x": round(x1, 1),
                    "y": round(y1, 1),
                    "w": round(x2 - x1, 1),
                    "h": round(y2 - y1, 1),
                }
                best_plate_b64 = encode_plate_image(upscaled)

    elapsed = (time.perf_counter() - t0) * 1000
    logger.info(
        "Plate: '%s' (%.0f%%) in %.0fms [YOLO+ESRGAN+DualOCR]",
        best_text, best_conf * 100, elapsed,
    )

    return {
        "plate_text": best_text,
        "confidence": round(best_conf, 4),
        "plate_bbox": best_bbox,
        "plate_image_b64": best_plate_b64,
    }
