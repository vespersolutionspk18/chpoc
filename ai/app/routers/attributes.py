"""
attributes.py – Person & Vehicle attribute extraction using real AI models.

Person: PAR + DeepFace + MiVOLO + CLIP (gender ensemble)
Vehicle: Qwen2-VL-2B VLM for make/model/color/type (replaces inaccurate narrow classifiers)

All model loads are lazy (first use). If any model fails, we fall back gracefully.
"""
from __future__ import annotations

import base64
import json
import logging
import re
import time
import traceback

import clip
import cv2
import numpy as np
import torch
from fastapi import APIRouter, File, UploadFile
from PIL import Image

# Real-ESRGAN upscaling
from basicsr.archs.rrdbnet_arch import RRDBNet
from realesrgan import RealESRGANer

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/attributes", tags=["attributes"])

_device = "cuda" if torch.cuda.is_available() else "cpu"

# ============================================================================
# Lazy-loaded global singletons
# ============================================================================
_clip_model = None
_clip_preprocess = None
_upsampler = None
_par_model = None           # dsabarinathan ResNet-30
_mivolo_model = None        # MiVOLO v2
_mivolo_processor = None
_deepface_ok: bool | None = None  # None = not tried yet
_vlm_model = None           # Qwen2-VL-2B for vehicle analysis
_vlm_processor = None

# PAR label columns (40 attributes from dsabarinathan model)
_PAR_LABELS = [
    'Age-Young', 'Age-Adult', 'Age-Old', 'Gender-Female',
    'Hair-Length-Short', 'Hair-Length-Long', 'Hair-Length-Bald',
    'UpperBody-Length-Short', 'UpperBody-Color-Black',
    'UpperBody-Color-Blue', 'UpperBody-Color-Brown',
    'UpperBody-Color-Green', 'UpperBody-Color-Grey',
    'UpperBody-Color-Orange', 'UpperBody-Color-Pink',
    'UpperBody-Color-Purple', 'UpperBody-Color-Red',
    'UpperBody-Color-White', 'UpperBody-Color-Yellow',
    'UpperBody-Color-Other', 'LowerBody-Length-Short',
    'LowerBody-Color-Black', 'LowerBody-Color-Blue',
    'LowerBody-Color-Brown', 'LowerBody-Color-Green',
    'LowerBody-Color-Grey', 'LowerBody-Color-Orange',
    'LowerBody-Color-Pink', 'LowerBody-Color-Purple', 'LowerBody-Color-Red',
    'LowerBody-Color-White', 'LowerBody-Color-Yellow',
    'LowerBody-Color-Other', 'LowerBody-Type-Trousers&Shorts',
    'LowerBody-Type-Skirt&Dress', 'Accessory-Backpack', 'Accessory-Bag',
    'Accessory-Glasses-Normal', 'Accessory-Glasses-Sun', 'Accessory-Hat',
]

# Intel vehicle color/type labels
_INTEL_COLORS = ['white', 'gray', 'yellow', 'red', 'green', 'blue', 'black']
_INTEL_TYPES  = ['car', 'bus', 'truck', 'van']

# CLIP fallback prompts
_COLORS = ["red", "blue", "black", "white", "green", "grey", "brown",
           "yellow", "orange", "pink", "purple", "beige"]
_STYLE_PROMPTS = [
    "person in traditional Pakistani clothing",
    "person in Western clothing",
    "person in uniform",
    "person in casual clothing",
]
_STYLE_LABELS = ["traditional", "western", "uniform", "casual"]

_VEHICLE_DIRECTION_PROMPTS = [
    "vehicle approaching camera", "vehicle moving away",
    "vehicle parked", "vehicle turning",
]
_VEHICLE_DIRECTION_LABELS = ["approaching", "moving_away", "parked", "turning"]

_VEHICLE_CONDITION_PROMPTS = [
    "new car", "well maintained car", "old car", "damaged car", "rusty car",
]
_VEHICLE_CONDITION_LABELS = ["new", "good", "old", "damaged", "rusty"]

_VEHICLE_CLASS_PROMPTS = [
    "private car", "taxi", "commercial vehicle",
    "police vehicle", "ambulance", "military vehicle",
]
_VEHICLE_CLASS_LABELS = ["private", "taxi", "commercial", "police", "ambulance", "military"]


# ============================================================================
# Lazy loaders
# ============================================================================

def _get_clip():
    global _clip_model, _clip_preprocess
    if _clip_model is None:
        _clip_model, _clip_preprocess = clip.load("ViT-B/32", device=_device)
        logger.info("CLIP ViT-B/32 loaded on %s", _device)
    return _clip_model, _clip_preprocess


def _get_upsampler():
    global _upsampler
    if _upsampler is None:
        model = RRDBNet(
            num_in_ch=3, num_out_ch=3, num_feat=64,
            num_block=23, num_grow_ch=32, scale=4,
        )
        _upsampler = RealESRGANer(
            scale=4,
            model_path="/models/realesrgan/RealESRGAN_x4plus.pth",
            model=model, half=True, device="cuda",
        )
        logger.info("Real-ESRGAN 4x loaded (will upscale with outscale=8)")
    return _upsampler


def _get_par_model():
    """Load dsabarinathan ResNet-30 PAR model."""
    global _par_model
    if _par_model is None:
        try:
            _par_model = torch.load(
                "/models/par/swin_par.pth",
                map_location=_device,
                weights_only=False,
            )
            _par_model.eval()
            if _device == "cuda":
                _par_model = _par_model.cuda()
            logger.info("dsabarinathan PAR ResNet-30 loaded on %s", _device)
        except Exception as e:
            logger.warning("Failed to load PAR model: %s", e)
            _par_model = "FAILED"
    return _par_model if _par_model != "FAILED" else None


def _get_mivolo():
    """Load MiVOLO v2 for precise age + gender."""
    global _mivolo_model, _mivolo_processor
    if _mivolo_model is None:
        try:
            from transformers import AutoModelForImageClassification, AutoImageProcessor
            _mivolo_model = AutoModelForImageClassification.from_pretrained(
                "/models/mivolo", trust_remote_code=True,
            )
            _mivolo_model.eval()
            if _device == "cuda":
                _mivolo_model = _mivolo_model.to(_device)
            _mivolo_processor = AutoImageProcessor.from_pretrained(
                "/models/mivolo", trust_remote_code=True,
            )
            logger.info("MiVOLO v2 loaded on %s", _device)
        except Exception as e:
            logger.warning("Failed to load MiVOLO: %s", e)
            _mivolo_model = "FAILED"
    return (_mivolo_model, _mivolo_processor) if _mivolo_model != "FAILED" else (None, None)


def _check_deepface():
    """Check if DeepFace is importable."""
    global _deepface_ok
    if _deepface_ok is None:
        try:
            from deepface import DeepFace as _df  # noqa: F401
            _deepface_ok = True
            logger.info("DeepFace available")
        except Exception as e:
            logger.warning("DeepFace not available: %s", e)
            _deepface_ok = False
    return _deepface_ok


def _get_vlm():
    """Load Qwen2-VL-2B-Instruct for vehicle attribute extraction."""
    global _vlm_model, _vlm_processor
    if _vlm_model is None:
        try:
            from transformers import Qwen2VLForConditionalGeneration, AutoProcessor
            _vlm_model = Qwen2VLForConditionalGeneration.from_pretrained(
                "Qwen/Qwen2-VL-2B-Instruct",
                torch_dtype=torch.float16,
                device_map="auto",
            )
            _vlm_processor = AutoProcessor.from_pretrained("Qwen/Qwen2-VL-2B-Instruct")
            logger.info("Qwen2-VL-2B-Instruct loaded for vehicle analysis")
        except Exception as e:
            logger.warning("Qwen2-VL-2B failed: %s — will fall back to CLIP", e)
            _vlm_model = "FAILED"
    return (_vlm_model, _vlm_processor) if _vlm_model != "FAILED" else (None, None)


# ============================================================================
# Helpers
# ============================================================================

def _sanitize(obj):
    """Convert numpy types to Python native types for JSON serialization."""
    if isinstance(obj, dict):
        return {k: _sanitize(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return type(obj)(_sanitize(v) for v in obj)
    if isinstance(obj, (np.floating, np.float16, np.float32, np.float64)):
        return float(obj)
    if isinstance(obj, (np.integer, np.int8, np.int16, np.int32, np.int64)):
        return int(obj)
    if isinstance(obj, np.bool_):
        return bool(obj)
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    return obj


def _upscale_and_encode(cv2_bgr: np.ndarray) -> tuple[np.ndarray, str]:
    """Upscale a BGR image 8x with Real-ESRGAN and return (upscaled_bgr, base64_jpeg)."""
    upsampler = _get_upsampler()
    upscaled, _ = upsampler.enhance(cv2_bgr, outscale=8)
    _, buf = cv2.imencode(".jpg", upscaled, [cv2.IMWRITE_JPEG_QUALITY, 85])
    b64 = base64.b64encode(buf.tobytes()).decode("ascii")
    return upscaled, b64


def _classify_zero_shot(pil_img: Image.Image, prompts: list[str]) -> list[float]:
    """CLIP zero-shot classification. Returns softmax probabilities."""
    model, preprocess = _get_clip()
    image_input = preprocess(pil_img).unsqueeze(0).to(_device)
    text_tokens = clip.tokenize(prompts).to(_device)
    with torch.no_grad():
        img_f = model.encode_image(image_input)
        txt_f = model.encode_text(text_tokens)
        img_f = img_f / img_f.norm(dim=-1, keepdim=True)
        txt_f = txt_f / txt_f.norm(dim=-1, keepdim=True)
        sim = (100.0 * img_f @ txt_f.T).softmax(dim=-1)
    return sim[0].cpu().tolist()


def _pick_best(labels: list[str], probs: list[float]) -> tuple[str, float]:
    idx = int(np.argmax(probs))
    return labels[idx], round(probs[idx], 4)


def _sigmoid(x: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-x))


def _par_preprocess(rgb_np: np.ndarray) -> torch.Tensor:
    """Preprocess RGB numpy image for PAR model (224x224, ImageNet norm)."""
    img = cv2.resize(rgb_np, (224, 224))
    mean = np.array([0.485, 0.456, 0.406])
    std = np.array([0.229, 0.224, 0.225])
    img = (img.astype(np.float32) / 255.0 - mean) / std
    return torch.from_numpy(img).permute(2, 0, 1).float().unsqueeze(0)


def _run_par_model(rgb_np: np.ndarray) -> dict | None:
    """Run dsabarinathan PAR model. Returns parsed attribute dict or None."""
    model = _get_par_model()
    if model is None:
        return None
    try:
        inp = _par_preprocess(rgb_np).to(_device)
        with torch.no_grad():
            out = model(inp)
        probs = _sigmoid(out.cpu().numpy()[0])

        result = {}

        # Gender: index 3 = Female. prob > 0.5 => female
        female_prob = float(probs[3])
        result["gender"] = "female" if female_prob > 0.5 else "male"
        result["gender_confidence"] = round(female_prob if female_prob > 0.5 else 1.0 - female_prob, 4)

        # Age group: indices 0=Young, 1=Adult, 2=Old
        age_probs = probs[:3]
        age_labels = ["young_adult", "adult", "elderly"]
        best_age = int(np.argmax(age_probs))
        result["age_group"] = age_labels[best_age]

        # Hair: indices 4=Short, 5=Long, 6=Bald
        hair_probs = probs[4:7]
        hair_labels = ["short", "long", "bald"]
        best_hair = int(np.argmax(hair_probs))
        result["hair"] = hair_labels[best_hair]

        # Upper clothing length: index 7 = Short
        result["sleeve_length"] = "short" if probs[7] > 0.5 else "long"

        # Upper color: indices 8-19 (12 colors)
        upper_colors = ["black", "blue", "brown", "green", "grey", "orange",
                        "pink", "purple", "red", "white", "yellow", "other"]
        uc_probs = probs[8:20]
        best_uc = int(np.argmax(uc_probs))
        result["upper_color"] = upper_colors[best_uc]

        result["upper_clothing"] = "short_sleeve" if probs[7] > 0.5 else "long_sleeve"

        # Lower clothing length: index 20 = Short
        result["lower_length"] = "short" if probs[20] > 0.5 else "long"

        # Lower color: indices 21-32 (12 colors)
        lower_colors = ["black", "blue", "brown", "green", "grey", "orange",
                        "pink", "purple", "red", "white", "yellow", "other"]
        lc_probs = probs[21:33]
        best_lc = int(np.argmax(lc_probs))
        result["lower_color"] = lower_colors[best_lc]

        # Lower type: index 33 = Trousers&Shorts, 34 = Skirt&Dress
        if probs[33] > probs[34]:
            result["lower_clothing"] = "trousers" if probs[20] < 0.5 else "shorts"
        else:
            result["lower_clothing"] = "skirt" if probs[20] < 0.5 else "dress"

        # Accessories
        result["backpack"] = bool(probs[35] > 0.5)
        result["bag"] = bool(probs[36] > 0.5)
        result["glasses"] = bool(probs[37] > 0.5 or probs[38] > 0.5)
        result["hat"] = bool(probs[39] > 0.5)

        return result
    except Exception as e:
        logger.warning("PAR model inference failed: %s", e)
        return None


def _run_clip_person_fallback(pil_img: Image.Image) -> dict:
    """CLIP-based fallback for person attributes (used if PAR fails)."""
    result = {}
    try:
        gp = _classify_zero_shot(pil_img, ["a photo of a man", "a photo of a woman"])
        result["gender"] = "male" if gp[0] > gp[1] else "female"
        result["gender_confidence"] = round(max(gp), 4)

        ap = _classify_zero_shot(pil_img, ["a young person", "an adult", "an elderly person"])
        age_labels = ["young_adult", "adult", "elderly"]
        result["age_group"] = age_labels[int(np.argmax(ap))]

        hp = _classify_zero_shot(pil_img, ["person with short hair", "person with long hair", "bald person"])
        result["hair"] = ["short", "long", "bald"][int(np.argmax(hp))]

        result["sleeve_length"] = "short" if _classify_zero_shot(
            pil_img, ["person wearing short sleeves", "person wearing long sleeves"]
        )[0] > 0.5 else "long"
        result["upper_clothing"] = "short_sleeve" if result["sleeve_length"] == "short" else "long_sleeve"

        uc_probs = _classify_zero_shot(pil_img, [f"person wearing {c} top" for c in _COLORS])
        result["upper_color"] = _COLORS[int(np.argmax(uc_probs))]

        lp = _classify_zero_shot(pil_img, [
            "person wearing trousers", "person wearing shorts",
            "person wearing skirt", "person wearing jeans",
        ])
        result["lower_clothing"] = ["trousers", "shorts", "skirt", "jeans"][int(np.argmax(lp))]

        lc_probs = _classify_zero_shot(pil_img, [f"person wearing {c} pants" for c in _COLORS])
        result["lower_color"] = _COLORS[int(np.argmax(lc_probs))]

        result["lower_length"] = "short" if result["lower_clothing"] == "shorts" else "long"

        bp = _classify_zero_shot(pil_img, ["person with backpack", "person without backpack"])
        result["backpack"] = bp[0] > bp[1]
        bg = _classify_zero_shot(pil_img, ["person carrying bag", "person not carrying bag"])
        result["bag"] = bg[0] > bg[1]
        gl = _classify_zero_shot(pil_img, ["person wearing glasses", "person without glasses"])
        result["glasses"] = gl[0] > gl[1]
        ht = _classify_zero_shot(pil_img, ["person wearing hat", "person without hat"])
        result["hat"] = ht[0] > ht[1]
    except Exception as e:
        logger.warning("CLIP person fallback failed: %s", e)
    return result


def _run_deepface(rgb_np: np.ndarray) -> dict | None:
    """Run DeepFace analysis for age, GENDER, emotion, ethnicity."""
    if not _check_deepface():
        return None
    try:
        import tensorflow as tf
        try:
            tf.config.set_visible_devices([], "GPU")
        except RuntimeError:
            pass
        from deepface import DeepFace
        bgr = cv2.cvtColor(rgb_np, cv2.COLOR_RGB2BGR)
        results = DeepFace.analyze(
            bgr,
            actions=["age", "gender", "emotion", "race"],
            enforce_detection=False,
            silent=True,
        )
        if isinstance(results, list):
            results = results[0]

        # Extract gender with confidence
        gender_data = results.get("gender", {})
        if isinstance(gender_data, dict):
            man_conf = gender_data.get("Man", 0)
            woman_conf = gender_data.get("Woman", 0)
            df_gender = "male" if man_conf >= woman_conf else "female"
            df_gender_conf = round(max(man_conf, woman_conf) / 100.0, 4)
        else:
            df_gender = "male" if str(gender_data).lower() == "man" else "female"
            df_gender_conf = 0.5

        return {
            "precise_age": int(results.get("age", 0)),
            "deepface_gender": df_gender,
            "deepface_gender_confidence": df_gender_conf,
            "emotion": results.get("dominant_emotion", "unknown"),
            "ethnicity": results.get("dominant_race", "unknown"),
        }
    except Exception as e:
        logger.warning("DeepFace analysis failed: %s", e)
        return None


def _run_mivolo(rgb_np: np.ndarray) -> dict | None:
    """Run MiVOLO v2 for precise age + gender."""
    model, processor = _get_mivolo()
    if model is None:
        return None
    try:
        pil = Image.fromarray(rgb_np).resize((384, 384))
        import torchvision.transforms as T
        transform = T.Compose([
            T.Resize((384, 384)),
            T.ToTensor(),
            T.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
        ])
        tensor = transform(pil).unsqueeze(0).to(_device)
        concat = torch.cat([tensor, tensor], dim=1)

        with torch.no_grad():
            outputs = model(concat_input=concat.to(model.dtype))

        result = {}
        if hasattr(outputs, 'age_output') and outputs.age_output is not None:
            result["mivolo_age"] = round(float(outputs.age_output[0].mean()), 1)
        if hasattr(outputs, 'gender_class_idx') and outputs.gender_class_idx is not None:
            gender_idx = int(outputs.gender_class_idx[0])
            result["mivolo_gender"] = "male" if gender_idx == 0 else "female"
            if hasattr(outputs, 'gender_probs') and outputs.gender_probs is not None:
                result["mivolo_gender_confidence"] = round(float(outputs.gender_probs[0]), 4)
        return result if result else None
    except Exception as e:
        logger.warning("MiVOLO inference failed: %s\n%s", e, traceback.format_exc())
        return None


def _run_vlm_vehicle(pil_img: Image.Image) -> dict | None:
    """Run Qwen2-VL-2B to identify vehicle make, model, color, type."""
    model, processor = _get_vlm()
    if model is None:
        return None
    try:
        prompt_text = (
            "Identify this vehicle precisely. Respond ONLY in JSON format:\n"
            '{"make":"...","model":"...","color":"...","type":"...","condition":"...","damage":"no/yes"}\n'
            "For type use: sedan, SUV, hatchback, truck, van, bus, motorcycle, rickshaw, chingchi, pickup, wagon.\n"
            "For Pakistani vehicles: Suzuki Mehran/Alto/Cultus/Bolan/WagonR, Toyota Corolla/Vitz/Yaris, Honda City/Civic.\n"
            "Be precise about the color you see."
        )

        messages = [{"role": "user", "content": [
            {"type": "image", "image": pil_img},
            {"type": "text", "text": prompt_text},
        ]}]

        text = processor.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
        inputs = processor(text=[text], images=[pil_img], return_tensors="pt").to(model.device)

        with torch.no_grad():
            output = model.generate(**inputs, max_new_tokens=200, do_sample=False)

        decoded = processor.batch_decode(output[:, inputs["input_ids"].shape[1]:],
                                         skip_special_tokens=True)[0].strip()
        logger.info("VLM raw output: %s", decoded)

        # Parse JSON from response (handle markdown fences)
        json_match = re.search(r'\{[^}]+\}', decoded)
        if json_match:
            data = json.loads(json_match.group())
            return {
                "make_model": f"{data.get('make', 'unknown')} {data.get('model', '')}".strip(),
                "make_model_confidence": 0.85,
                "color": data.get("color", "unknown").lower(),
                "color_confidence": 0.85,
                "vehicle_type": data.get("type", "unknown").lower(),
                "vehicle_type_confidence": 0.85,
                "condition": data.get("condition", "unknown").lower(),
                "damage_visible": str(data.get("damage", "no")).lower() in ("yes", "true"),
            }
    except Exception as e:
        logger.warning("VLM vehicle analysis failed: %s\n%s", e, traceback.format_exc())
    return None


def _run_clip_vehicle_fallback(pil_img: Image.Image) -> dict:
    """CLIP fallback for vehicle attributes when VLM is unavailable."""
    result = {}
    try:
        color_probs = _classify_zero_shot(pil_img, [f"a {c} vehicle" for c in _COLORS])
        color, color_conf = _pick_best(_COLORS, color_probs)
        result["color"] = color
        result["color_confidence"] = float(color_conf)

        type_prompts = ["sedan car", "SUV", "truck", "van", "motorcycle",
                        "bus", "pickup truck", "hatchback car", "three-wheeled auto-rickshaw"]
        type_labels = ["sedan", "SUV", "truck", "van", "motorcycle",
                       "bus", "pickup", "hatchback", "rickshaw"]
        tp = _classify_zero_shot(pil_img, type_prompts)
        vtype, vtype_conf = _pick_best(type_labels, tp)
        result["vehicle_type"] = vtype
        result["vehicle_type_confidence"] = float(vtype_conf)

        result["make_model"] = "unknown"
        result["make_model_confidence"] = 0.0
        result["condition"] = "unknown"
        result["damage_visible"] = False
    except Exception as e:
        logger.warning("CLIP vehicle fallback failed: %s", e)
    return result


def _ensemble_gender(
    par_result: dict | None,
    df_result: dict | None,
    mivolo_result: dict | None,
) -> tuple[str, float]:
    """Ensemble gender from PAR + DeepFace + MiVOLO using weighted voting."""
    male_score = 0.0
    female_score = 0.0
    total_weight = 0.0

    # PAR model (weight 1.0 — trained on full body)
    if par_result and par_result.get("gender"):
        par_g = par_result["gender"]
        par_c = par_result.get("gender_confidence", 0.5)
        if par_g == "male":
            male_score += par_c
        else:
            female_score += par_c
        total_weight += 1.0

    # DeepFace (weight 1.2 — face-based, very reliable for gender)
    if df_result and df_result.get("deepface_gender"):
        df_g = df_result["deepface_gender"]
        df_c = df_result.get("deepface_gender_confidence", 0.5)
        w = 1.2
        if df_g == "male":
            male_score += df_c * w
        else:
            female_score += df_c * w
        total_weight += w

    # MiVOLO (weight 1.5 — specialized age+gender model, highest accuracy)
    if mivolo_result and mivolo_result.get("mivolo_gender"):
        mv_g = mivolo_result["mivolo_gender"]
        mv_c = mivolo_result.get("mivolo_gender_confidence", 0.5)
        w = 1.5
        if mv_g == "male":
            male_score += mv_c * w
        else:
            female_score += mv_c * w
        total_weight += w

    if total_weight == 0:
        return "unknown", 0.0

    gender = "male" if male_score >= female_score else "female"
    confidence = round(max(male_score, female_score) / (male_score + female_score + 1e-10), 4)

    logger.info(
        "Gender ensemble: male=%.2f female=%.2f -> %s (%.0f%%) [PAR=%s, DeepFace=%s, MiVOLO=%s]",
        male_score, female_score, gender, confidence * 100,
        par_result.get("gender", "N/A") if par_result else "N/A",
        df_result.get("deepface_gender", "N/A") if df_result else "N/A",
        mivolo_result.get("mivolo_gender", "N/A") if mivolo_result else "N/A",
    )
    return gender, confidence


# ============================================================================
# Person attributes endpoint
# ============================================================================
@router.post("/person")
async def extract_person_attributes(image: UploadFile = File(...)):
    """
    Extract person attributes using:
      1. 8x Real-ESRGAN upscale
      2. dsabarinathan PAR model (gender, age_group, hair, clothing, accessories)
      3. DeepFace (precise_age, GENDER, emotion, ethnicity)
      4. MiVOLO v2 (precise age + gender cross-check)
      5. CLIP fallback for clothing_style + any PAR failures
      6. Gender ensemble: weighted vote from PAR + DeepFace + MiVOLO
    """
    t0 = time.perf_counter()
    try:
        raw = await image.read()
        arr = np.frombuffer(raw, dtype=np.uint8)
        cv2_img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if cv2_img is None:
            return {"error": "Could not decode uploaded image"}

        # 1) 8x upscale
        try:
            upscaled_bgr, upscaled_b64 = _upscale_and_encode(cv2_img)
        except Exception as e:
            logger.warning("Upscale failed, using original: %s", e)
            upscaled_bgr = cv2_img
            _, buf = cv2.imencode(".jpg", cv2_img, [cv2.IMWRITE_JPEG_QUALITY, 85])
            upscaled_b64 = base64.b64encode(buf.tobytes()).decode("ascii")

        upscaled_rgb = cv2.cvtColor(upscaled_bgr, cv2.COLOR_BGR2RGB)
        pil_img = Image.fromarray(upscaled_rgb)

        # 2) dsabarinathan PAR model
        par_result = _run_par_model(upscaled_rgb)
        if par_result is None:
            logger.info("PAR model unavailable, using CLIP fallback for person attributes")
            par_result = _run_clip_person_fallback(pil_img)

        # 3) DeepFace for face-level attributes (NOW includes gender!)
        df_result = _run_deepface(upscaled_rgb)

        # 4) MiVOLO for precise age + gender
        mivolo_result = _run_mivolo(upscaled_rgb)

        # 5) CLIP for clothing style + face covered detection
        try:
            style_probs = _classify_zero_shot(pil_img, _STYLE_PROMPTS)
            clothing_style, _ = _pick_best(_STYLE_LABELS, style_probs)
        except Exception:
            clothing_style = "unknown"

        # Face covered: mask, scarf, niqab, veil
        try:
            fc_probs = _classify_zero_shot(pil_img, [
                "person with face covered by mask or scarf or veil or niqab",
                "person with uncovered visible face",
            ])
            face_covered = bool(fc_probs[0] > fc_probs[1])
        except Exception:
            face_covered = False

        # --- Merge results with GENDER ENSEMBLE ---

        # Gender: weighted ensemble of PAR + DeepFace + MiVOLO
        gender, gender_confidence = _ensemble_gender(par_result, df_result, mivolo_result)

        # Precise age: prefer MiVOLO (most accurate), then DeepFace
        precise_age = None
        if mivolo_result and mivolo_result.get("mivolo_age"):
            precise_age = int(mivolo_result["mivolo_age"])
        elif df_result and df_result.get("precise_age"):
            precise_age = df_result["precise_age"]

        # Emotion and ethnicity from DeepFace
        emotion = df_result.get("emotion", "unknown") if df_result else "unknown"
        ethnicity = df_result.get("ethnicity", "unknown") if df_result else "unknown"

        elapsed = (time.perf_counter() - t0) * 1000
        logger.info("attributes/person: %.0f ms (PAR + DeepFace + MiVOLO + CLIP)", elapsed)

        return _sanitize({
            "upscaled_image_b64": upscaled_b64,
            "gender": gender,
            "gender_confidence": gender_confidence,
            "age_group": par_result.get("age_group", "unknown"),
            "precise_age": precise_age,
            "emotion": emotion,
            "ethnicity": ethnicity,
            "hair": par_result.get("hair", "unknown"),
            "upper_clothing": par_result.get("upper_clothing", "unknown"),
            "upper_color": par_result.get("upper_color", "unknown"),
            "lower_clothing": par_result.get("lower_clothing", "unknown"),
            "lower_color": par_result.get("lower_color", "unknown"),
            "hat": par_result.get("hat", False),
            "glasses": par_result.get("glasses", False),
            "backpack": par_result.get("backpack", False),
            "bag": par_result.get("bag", False),
            "sleeve_length": par_result.get("sleeve_length", "unknown"),
            "clothing_style": clothing_style,
            "face_covered": face_covered,
        })
    except Exception as e:
        logger.error("attributes/person unexpected error: %s\n%s", e, traceback.format_exc())
        return {"error": str(e)}


# ============================================================================
# Vehicle attributes endpoint
# ============================================================================
@router.post("/vehicle")
async def extract_vehicle_attributes(image: UploadFile = File(...)):
    """
    Extract vehicle attributes using:
      1. 8x Real-ESRGAN upscale
      2. Qwen2-VL-2B VLM for make, model, color, type, condition, damage
      3. CLIP fallback if VLM unavailable
    """
    t0 = time.perf_counter()
    try:
        raw = await image.read()
        arr = np.frombuffer(raw, dtype=np.uint8)
        cv2_img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if cv2_img is None:
            return {"error": "Could not decode uploaded image"}

        # 1) 8x upscale
        try:
            upscaled_bgr, upscaled_b64 = _upscale_and_encode(cv2_img)
        except Exception as e:
            logger.warning("Upscale failed, using original: %s", e)
            upscaled_bgr = cv2_img
            _, buf = cv2.imencode(".jpg", cv2_img, [cv2.IMWRITE_JPEG_QUALITY, 85])
            upscaled_b64 = base64.b64encode(buf.tobytes()).decode("ascii")

        upscaled_rgb = cv2.cvtColor(upscaled_bgr, cv2.COLOR_BGR2RGB)
        pil_img = Image.fromarray(upscaled_rgb)

        # 2) Qwen2-VL-2B for ALL vehicle attributes in one pass
        vlm_result = _run_vlm_vehicle(pil_img)

        if vlm_result:
            make_model = vlm_result.get("make_model", "unknown")
            make_model_conf = vlm_result.get("make_model_confidence", 0.85)
            color = vlm_result.get("color", "unknown")
            color_conf = vlm_result.get("color_confidence", 0.85)
            vehicle_type = vlm_result.get("vehicle_type", "unknown")
            vehicle_type_conf = vlm_result.get("vehicle_type_confidence", 0.85)
            condition = vlm_result.get("condition", "unknown")
            damage_visible = vlm_result.get("damage_visible", False)
        else:
            # CLIP fallback
            logger.info("VLM unavailable, using CLIP fallback for vehicle")
            fb = _run_clip_vehicle_fallback(pil_img)
            make_model = fb.get("make_model", "unknown")
            make_model_conf = fb.get("make_model_confidence", 0.0)
            color = fb.get("color", "unknown")
            color_conf = fb.get("color_confidence", 0.0)
            vehicle_type = fb.get("vehicle_type", "unknown")
            vehicle_type_conf = fb.get("vehicle_type_confidence", 0.0)
            condition = fb.get("condition", "unknown")
            damage_visible = fb.get("damage_visible", False)

        # Direction and vehicle class via CLIP (VLM doesn't handle these well)
        try:
            dir_probs = _classify_zero_shot(pil_img, _VEHICLE_DIRECTION_PROMPTS)
            direction, _ = _pick_best(_VEHICLE_DIRECTION_LABELS, dir_probs)
        except Exception:
            direction = "unknown"

        try:
            cls_probs = _classify_zero_shot(pil_img, _VEHICLE_CLASS_PROMPTS)
            vehicle_class, _ = _pick_best(_VEHICLE_CLASS_LABELS, cls_probs)
        except Exception:
            vehicle_class = "private"

        elapsed = (time.perf_counter() - t0) * 1000
        logger.info("attributes/vehicle: %.0f ms (VLM + CLIP)", elapsed)

        return _sanitize({
            "upscaled_image_b64": upscaled_b64,
            "make_model": make_model,
            "make_model_confidence": make_model_conf,
            "color": color,
            "color_confidence": color_conf,
            "vehicle_type": vehicle_type,
            "vehicle_type_confidence": vehicle_type_conf,
            "direction": direction,
            "condition": condition,
            "damage_visible": damage_visible,
            "vehicle_class": vehicle_class,
        })
    except Exception as e:
        logger.error("attributes/vehicle unexpected error: %s\n%s", e, traceback.format_exc())
        return {"error": str(e)}
