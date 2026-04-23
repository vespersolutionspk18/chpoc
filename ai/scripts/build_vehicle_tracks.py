"""
Vehicle Track Index Builder — tracks vehicles across frames using ByteTrack,
classifies each TRACK (not each frame) with Qwen2.5-VL-7B.

Each indexed entry represents one vehicle's journey through the camera:
- Best frame crop + CLIP embedding for similarity search
- VLM-classified type, color, make, model, attributes
- Start/end timestamps for video clip playback
- Direction of travel computed from bbox movement
- Path of bbox centers for trajectory visualization
"""
import time
import cv2
import numpy as np
import base64
import json
import re
import os
import sys
import torch
import clip
from PIL import Image
from pathlib import Path
from collections import defaultdict

VIDEO = sys.argv[1] if len(sys.argv) > 1 else "/root/camera_feeds/mp4/D01_20260420124029.mp4"
CAMERA_ID = Path(VIDEO).stem.split("_")[0] if "_" in Path(VIDEO).stem else "D01"
VIDEO_FILE = Path(VIDEO).name

COCO_VEHICLES = {2: "car", 3: "motorcycle", 5: "bus", 7: "truck"}

# VLM prompt — comprehensive Pakistani vehicle analysis
VLM_PROMPT = """You are analyzing a vehicle from a Pakistani street surveillance camera. Observe every detail carefully.

Reply ONLY with a JSON object:
{"type":"...","color":"...","make":"...","model":"...","description":"2-3 sentences describing everything you see","attributes":{}}

VEHICLE TYPE — choose exactly ONE:
- "sedan" = 4-door car with separate trunk (Toyota Corolla, Honda City, Honda Civic, Suzuki Liana, Toyota Yaris, Hyundai Elantra, Kia Spectra, Daihatsu Charade, Nissan Sunny, Mitsubishi Lancer)
- "hatchback" = small car with rear hatch door, no separate trunk (Suzuki Mehran, Suzuki Alto, Suzuki Cultus, Suzuki Swift, Toyota Vitz, Toyota Passo, Honda Fit, Daihatsu Mira, Daihatsu Cuore, FAW V2, Prince Pearl, United Bravo)
- "SUV" = large tall vehicle with high ground clearance (Toyota Fortuner, Toyota Land Cruiser, Toyota Prado, Honda CR-V, Honda BR-V, Hyundai Tucson, Kia Sportage, Mitsubishi Pajero, Suzuki Jimny)
- "van" = boxy rectangular vehicle with solid metal doors and glass windows (Suzuki Bolan, Suzuki Carry, Suzuki Every, Toyota HiAce, Daihatsu Hijet, FAW XPV, Changan Karvaan, Hyundai Shehzore)
- "minivan" = family MPV with 3 rows (Toyota Avanza, Suzuki APV, Honda Freed, Toyota Innova)
- "pickup" = vehicle with open cargo bed at rear (Toyota Hilux, Toyota Revo, Isuzu D-Max, Suzuki Ravi, Changan M9)
- "truck" = heavy commercial vehicle (Hino, Isuzu, Bedford, Master, JAC, Foton, Tata)
- "bus" = large passenger vehicle (Daewoo, Higer, Yutong, Hino bus, coaster, local painted bus)
- "motorcycle" = two-wheeled (Honda CD70, Honda CG125, Honda CB150, Yamaha YBR, Suzuki GS150, United, Road Prince, Super Power, Unique, Crown)
- "auto-rickshaw" = open-sided three-wheeled passenger vehicle with tubular frame, canvas/plastic covers, exposed mechanical parts, bench seat (Qingqi, Sazgar, Dingqi, Tez Raftaar)
- "loader" = three-wheeled cargo vehicle with open loading bed
- "wagon" = station wagon (Suzuki Cultus wagon, Toyota Fielder)
- "tractor" = agricultural tractor (Massey Ferguson, Fiat, Millat)

CRITICAL — AUTO-RICKSHAW vs VAN:
- Auto-rickshaw: open sides or canvas covers, visible tubular frame, compact rounded shape, exposed mechanical parts, passenger bench seat.
- Van: fully enclosed metal body, proper glass windows, solid doors, rectangular box shape.
- If it has proper glass windows and solid metal doors, it is a VAN, not a rickshaw.
- Suzuki Bolan, Suzuki Carry, Suzuki Every = ALWAYS "van".

FOR "attributes", include ONLY what you can clearly observe:
- passengers_visible: number of people visible inside or on the vehicle
- windows: "clear" / "tinted" / "dark tinted" / "rolled down" / "broken"
- windshield: stickers, cracks, tinting, sun strip, objects on dashboard
- dashboard_objects: anything visible (tissues, phone holder, decoration)
- headlights: "on" / "off" / "broken" / "missing" / "aftermarket"
- taillights: "intact" / "broken" / "missing"
- bumper_front: "intact" / "damaged" / "missing" / "aftermarket"
- bumper_rear: "intact" / "damaged" / "missing"
- body_damage: any dents, scratches, rust, accident damage, missing panels
- paint_condition: "original" / "repainted" / "faded" / "peeling" / "mismatched"
- modifications: aftermarket parts, spoilers, bull bars, roof racks, LED bars
- stickers_decals: stickers, company logos, route numbers, phone numbers
- roof: luggage, carrier, rack, AC unit, taxi sign
- license_plate_visible: "yes" / "no" / "partial" / "obscured"
- plate_text: actual text if readable
- cargo: any visible cargo or goods
- condition_overall: "new" / "good" / "used" / "old" / "damaged"
- special_markings: police, ambulance, military, government, taxi, delivery
- triple_sawari: "yes" if 3 or more people are on a motorcycle, otherwise omit
- no_helmet: "yes" if motorcycle rider has no helmet, otherwise omit
- overloaded: "yes" if vehicle is carrying excess passengers or cargo, otherwise omit"""


def compute_direction(path: list[tuple[float, float]]) -> str:
    """Compute direction from a path of (cx, cy) centers."""
    if len(path) < 3:
        return "unknown"
    x_start = np.mean([p[0] for p in path[:3]])
    x_end = np.mean([p[0] for p in path[-3:]])
    y_start = np.mean([p[1] for p in path[:3]])
    y_end = np.mean([p[1] for p in path[-3:]])

    dx = x_end - x_start
    dy = y_end - y_start

    if abs(dx) < 20 and abs(dy) < 20:
        return "stationary"
    if abs(dx) > abs(dy):
        return "moving right" if dx > 0 else "moving left"
    return "moving down" if dy > 0 else "moving up"


def main():
    from ultralytics import YOLO

    print("Loading YOLO + CLIP + Qwen2.5-VL...", flush=True)
    yolo = YOLO("yolov8x.pt")
    model_c, preprocess_c = clip.load("ViT-B/32", device="cuda")

    from transformers import Qwen2_5_VLForConditionalGeneration, AutoProcessor
    vlm = Qwen2_5_VLForConditionalGeneration.from_pretrained(
        "Qwen/Qwen2.5-VL-7B-Instruct", torch_dtype=torch.bfloat16, device_map="auto")
    vlm_proc = AutoProcessor.from_pretrained("Qwen/Qwen2.5-VL-7B-Instruct")
    print("All models loaded.", flush=True)

    cap = cv2.VideoCapture(VIDEO)
    fps = cap.get(cv2.CAP_PROP_FPS) or 25
    fc = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    print(f"Video: {VIDEO_FILE}, {fc} frames, {fps:.0f} fps", flush=True)

    # Track storage: track_id -> {frames, bboxes, confidences, classes, best_frame, best_conf, path}
    tracks: dict[int, dict] = defaultdict(lambda: {
        "frames": [], "bboxes": [], "confidences": [], "classes": [],
        "best_frame_num": 0, "best_conf": 0, "best_crop": None,
        "path": [],  # [(cx, cy), ...]
    })

    # Phase 1: Run YOLO tracking across all frames
    print("Phase 1: Tracking vehicles...", flush=True)
    t0 = time.time()
    fn = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            break

        # Track every 3rd frame for speed (still enough for tracking)
        if fn % 3 != 0:
            fn += 1
            continue

        results = yolo.track(frame, conf=0.3, persist=True, verbose=False,
                             tracker="bytetrack.yaml")

        for r in results:
            if r.boxes is None or r.boxes.id is None:
                continue
            for i in range(len(r.boxes)):
                cls = int(r.boxes.cls[i].item())
                if cls not in COCO_VEHICLES:
                    continue

                track_id = int(r.boxes.id[i].item())
                conf = float(r.boxes.conf[i].item())
                x1, y1, x2, y2 = [int(v) for v in r.boxes.xyxy[i].tolist()]
                cx, cy = (x1 + x2) / 2, (y1 + y2) / 2

                t = tracks[track_id]
                t["frames"].append(fn)
                t["bboxes"].append((x1, y1, x2, y2))
                t["confidences"].append(conf)
                t["classes"].append(cls)
                t["path"].append((cx, cy))

                # Track best frame (highest confidence)
                if conf > t["best_conf"]:
                    t["best_conf"] = conf
                    t["best_frame_num"] = fn
                    # Pad and crop
                    h_, w_ = frame.shape[:2]
                    bw, bh = x2 - x1, y2 - y1
                    pad = int(max(bw, bh) * 0.15)
                    px1 = max(0, x1 - pad)
                    py1 = max(0, y1 - pad)
                    px2 = min(w_, x2 + pad)
                    py2 = min(h_, y2 + pad)
                    t["best_crop"] = frame[py1:py2, px1:px2].copy()

        fn += 1
        if fn % 300 == 0:
            print(f"  frame {fn}/{fc}, {len(tracks)} tracks so far...", flush=True)

    cap.release()
    tracking_time = time.time() - t0
    print(f"Phase 1 done: {len(tracks)} tracks in {tracking_time:.0f}s", flush=True)

    # Filter short tracks (< 5 frames = noise)
    valid_tracks = {tid: t for tid, t in tracks.items()
                    if len(t["frames"]) >= 5 and t["best_crop"] is not None}
    print(f"Valid tracks (5+ frames): {len(valid_tracks)}", flush=True)

    # Phase 2: Classify each track with VLM + CLIP
    print("Phase 2: Classifying with Qwen2.5-VL...", flush=True)
    t1 = time.time()
    embeddings = []
    metadata = []

    for idx, (tid, t) in enumerate(valid_tracks.items()):
        crop = t["best_crop"]
        if crop.size == 0:
            continue

        # CLIP embedding
        pil = Image.fromarray(cv2.cvtColor(crop, cv2.COLOR_BGR2RGB))
        inp = preprocess_c(pil).unsqueeze(0).cuda()
        with torch.no_grad():
            imgf = model_c.encode_image(inp)
            imgf = imgf / imgf.norm(dim=-1, keepdim=True)
            emb = imgf[0].cpu().numpy()

        # VLM classification
        msgs = [{"role": "user", "content": [
            {"type": "image", "image": pil},
            {"type": "text", "text": VLM_PROMPT},
        ]}]
        text = vlm_proc.apply_chat_template(msgs, tokenize=False, add_generation_prompt=True)
        inputs = vlm_proc(text=[text], images=[pil], return_tensors="pt").to(vlm.device)
        with torch.no_grad():
            out = vlm.generate(**inputs, max_new_tokens=400, do_sample=False)
        decoded = vlm_proc.batch_decode(out[:, inputs["input_ids"].shape[1]:],
                                         skip_special_tokens=True)[0].strip()

        # Parse VLM response
        vtype = vcolor = vmake = vmodel = description = "unknown"
        vlm_attrs = {}
        match = re.search(r'\{.*\}', decoded, re.DOTALL)
        if match:
            try:
                # Strip markdown fences
                cleaned = re.sub(r'```json\s*', '', decoded)
                cleaned = re.sub(r'```\s*$', '', cleaned).strip()
                m2 = re.search(r'\{.*\}', cleaned, re.DOTALL)
                if m2:
                    d = json.loads(m2.group())
                    vtype = d.get("type", "unknown")
                    vcolor = d.get("color", "unknown")
                    vmake = d.get("make", "unknown")
                    vmodel = d.get("model", "unknown")
                    description = d.get("description", "")
                    vlm_attrs = d.get("attributes", {})
            except json.JSONDecodeError:
                pass

        # Direction from tracking path
        direction = compute_direction(t["path"])

        # Duration
        start_sec = round(t["frames"][0] / fps, 2)
        end_sec = round(t["frames"][-1] / fps, 2)
        duration = round(end_sec - start_sec, 2)

        # Most common YOLO class
        from collections import Counter
        yolo_class = COCO_VEHICLES.get(Counter(t["classes"]).most_common(1)[0][0], "car")

        # Thumbnail 400px, quality 90
        th, tw = crop.shape[:2]
        if tw > 400:
            s = 400 / tw
            thumb = cv2.resize(crop, (400, int(th * s)))
        else:
            thumb = crop
        _, buf = cv2.imencode(".jpg", thumb, [cv2.IMWRITE_JPEG_QUALITY, 90])
        tb64 = base64.b64encode(buf.tobytes()).decode()

        embeddings.append(emb)
        meta = {
            "track_id": tid,
            "camera_id": CAMERA_ID,
            "video_file": VIDEO_FILE,
            "start_sec": start_sec,
            "end_sec": end_sec,
            "duration_sec": duration,
            "best_frame_num": t["best_frame_num"],
            "timestamp_sec": round(t["best_frame_num"] / fps, 2),
            "num_frames": len(t["frames"]),
            "direction": direction,
            "vehicle_class": vtype.lower() if vtype else "unknown",
            "dominant_color": vcolor.lower() if vcolor else "unknown",
            "yolo_class": yolo_class,
            "bbox": {"x": t["bboxes"][-1][0], "y": t["bboxes"][-1][1],
                      "w": t["bboxes"][-1][2] - t["bboxes"][-1][0],
                      "h": t["bboxes"][-1][3] - t["bboxes"][-1][1]},
            "thumbnail_b64": tb64,
            "description": description,
        }
        if vmake and vmake != "unknown":
            meta["make"] = vmake
        if vmodel and vmodel != "unknown":
            meta["model"] = vmodel
        if vlm_attrs:
            meta["attributes"] = vlm_attrs

        metadata.append(meta)

        if (idx + 1) % 10 == 0:
            print(f"  {idx+1}/{len(valid_tracks)} — {vtype} {vcolor} {vmake} {vmodel} [{direction}] ({duration}s)",
                  flush=True)

    classify_time = time.time() - t1

    # Save
    os.makedirs("/workspace/safe-city/vehicle_index", exist_ok=True)
    np.save("/workspace/safe-city/vehicle_index/embeddings.npy",
            np.array(embeddings, dtype=np.float32))
    with open("/workspace/safe-city/vehicle_index/metadata.json", "w") as f:
        json.dump(metadata, f)

    total_time = time.time() - t0
    print(f"\nDONE: {len(metadata)} vehicle tracks", flush=True)
    print(f"  Tracking: {tracking_time:.0f}s, Classification: {classify_time:.0f}s, Total: {total_time:.0f}s", flush=True)

    tc = Counter(m["vehicle_class"] for m in metadata)
    cc = Counter(m["dominant_color"] for m in metadata)
    dc = Counter(m["direction"] for m in metadata)
    print(f"Types: {dict(tc.most_common(10))}")
    print(f"Colors: {dict(cc.most_common(10))}")
    print(f"Directions: {dict(dc.most_common(5))}")
    print(f"Avg duration: {np.mean([m['duration_sec'] for m in metadata]):.1f}s")


if __name__ == "__main__":
    main()
