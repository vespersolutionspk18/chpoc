#!/usr/bin/env python3
"""
Safe City AI Model Downloader

Downloads all AI models required for the Safe City POC.
Run this script on the vast.ai instance (B200 GPU) before starting the AI service.

Usage:
    python download_models.py              # Download all models
    python download_models.py --tier 1     # Download Tier 1 only (detect + track)
    python download_models.py --tier 2     # Download Tier 2 only (indexing)
    python download_models.py --tier 3     # Download Tier 3 only (alerts)
    python download_models.py --tier 4     # Download Tier 4 only (investigate)
    python download_models.py --model rt-detr  # Download a specific model
    python download_models.py --list       # List all models without downloading
    python download_models.py --poc        # Download POC stack (best accuracy, ignore license)
    python download_models.py --production # Download production stack (clean licenses only)
"""

import argparse
import logging
import os
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("model-downloader")

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

MODEL_DIR = Path(os.environ.get("MODEL_DIR", "/models"))


@dataclass
class ModelSpec:
    name: str
    tier: int
    task: str
    description: str
    license: str
    status: str  # CLEAN, LOW-RISK-GRAY, HIGHER-RISK-GRAY, POC-ONLY, CONTAMINATED
    download_type: str  # huggingface, git, pip, ngc, omz, manual
    source: str  # repo URL or HF model ID
    subdir: str  # subdirectory under MODEL_DIR
    size_mb: int  # approximate size in MB
    poc: bool = True  # include in POC stack
    production: bool = False  # include in production stack
    files: list[str] = field(default_factory=list)  # specific files to download
    branch: str = ""  # git branch
    pip_packages: list[str] = field(default_factory=list)  # pip packages to install
    post_commands: list[str] = field(default_factory=list)  # commands to run after download


# ---------------------------------------------------------------------------
# Model Registry — every model in the Safe City stack
# ---------------------------------------------------------------------------

MODELS: list[ModelSpec] = [
    # ======================================================================
    # TIER 1: DETECT + TRACK (Always-on)
    # ======================================================================
    ModelSpec(
        name="rt-detr",
        tier=1,
        task="object-detection",
        description="RT-DETR-L COCO-only — primary always-on detector (53.1 AP)",
        license="Apache-2.0",
        status="CLEAN",
        download_type="git",
        source="https://github.com/lyuwenyu/RT-DETR.git",
        subdir="detection/rt-detr",
        size_mb=200,
        poc=True,
        production=True,
        post_commands=[
            "echo 'Download COCO-only checkpoint from GitHub releases'",
            "cd {model_dir}/detection/rt-detr && mkdir -p weights",
        ],
    ),
    ModelSpec(
        name="d-fine",
        tier=1,
        task="object-detection",
        description="D-FINE-X COCO-only — higher accuracy detector (55.8 AP)",
        license="Apache-2.0",
        status="CLEAN",
        download_type="git",
        source="https://github.com/Peterande/D-FINE.git",
        subdir="detection/d-fine",
        size_mb=300,
        poc=True,
        production=True,
    ),
    ModelSpec(
        name="co-detr",
        tier=1,
        task="object-detection",
        description="Co-DETR ViT-L — highest accuracy detector (66.0 AP) [POC only]",
        license="MIT",
        status="HIGHER-RISK-GRAY",
        download_type="huggingface",
        source="zongzhuofan/co-detr-vit-large-coco",
        subdir="detection/co-detr",
        size_mb=1200,
        poc=True,
        production=False,
    ),
    ModelSpec(
        name="boosttrack",
        tier=1,
        task="tracking",
        description="BoostTrack++ — SOTA multi-object tracker (HOTA 66.4)",
        license="MIT",
        status="CLEAN",
        download_type="git",
        source="https://github.com/vukasin-stanojevic/BoostTrack.git",
        subdir="tracking/boosttrack",
        size_mb=50,
        poc=True,
        production=True,
    ),

    # ======================================================================
    # TIER 2: INDEX (Per-track)
    # ======================================================================
    ModelSpec(
        name="auraface",
        tier=2,
        task="face-recognition",
        description="AuraFace v1 — only fully commercial face recognition (LFW 99.65%)",
        license="Apache-2.0",
        status="CLEAN",
        download_type="huggingface",
        source="fal/AuraFace-v1",
        subdir="face/auraface",
        size_mb=250,
        poc=True,
        production=True,
    ),
    ModelSpec(
        name="adaface",
        tier=2,
        task="face-recognition",
        description="AdaFace R101 — max accuracy face recognition (LFW 99.82%) [POC only]",
        license="MIT",
        status="POC-ONLY",
        download_type="git",
        source="https://github.com/mk-minchul/AdaFace.git",
        subdir="face/adaface",
        size_mb=500,
        poc=True,
        production=False,
    ),
    ModelSpec(
        name="vitpose-g",
        tier=2,
        task="pose-estimation",
        description="ViTPose-G — absolute SOTA pose (81.1 AP) [POC only, AI Challenger data]",
        license="Apache-2.0",
        status="HIGHER-RISK-GRAY",
        download_type="git",
        source="https://github.com/ViTAE-Transformer/ViTPose.git",
        subdir="pose/vitpose",
        size_mb=4000,
        poc=True,
        production=False,
    ),
    ModelSpec(
        name="vitpose-h",
        tier=2,
        task="pose-estimation",
        description="ViTPose-H COCO-only — production pose (79.1 AP, CLEAN)",
        license="Apache-2.0",
        status="CLEAN",
        download_type="git",
        source="https://github.com/ViTAE-Transformer/ViTPose.git",
        subdir="pose/vitpose",
        size_mb=2500,
        poc=True,
        production=True,
    ),
    ModelSpec(
        name="fast-alpr",
        tier=2,
        task="plate-recognition",
        description="fast-alpr — license plate detection + OCR pipeline",
        license="MIT",
        status="CLEAN",
        download_type="pip",
        source="fast-alpr",
        subdir="plate/fast-alpr",
        size_mb=100,
        poc=True,
        production=True,
        pip_packages=["fast-alpr", "fast-plate-ocr"],
    ),
    ModelSpec(
        name="paddleocr",
        tier=2,
        task="plate-recognition",
        description="PP-OCRv5 — industrial-grade OCR (100+ languages)",
        license="Apache-2.0",
        status="CLEAN",
        download_type="pip",
        source="paddleocr",
        subdir="plate/paddleocr",
        size_mb=150,
        poc=True,
        production=True,
        pip_packages=["paddlepaddle", "paddleocr"],
    ),
    ModelSpec(
        name="solider",
        tier=2,
        task="person-reid",
        description="SOLIDER Swin-B — best ReID accuracy (93.9% mAP) [POC only]",
        license="Apache-2.0",
        status="POC-ONLY",
        download_type="git",
        source="https://github.com/tinyvision/SOLIDER-REID.git",
        subdir="reid/solider",
        size_mb=350,
        poc=True,
        production=False,
    ),
    ModelSpec(
        name="fastreid",
        tier=2,
        task="person-reid",
        description="FastReID — production ReID framework (retrain on own data)",
        license="Apache-2.0",
        status="CLEAN",
        download_type="git",
        source="https://github.com/JDAI-CV/fast-reid.git",
        subdir="reid/fastreid",
        size_mb=200,
        poc=False,
        production=True,
    ),

    # ======================================================================
    # TIER 3: ALERT (Periodic + Triggered)
    # ======================================================================
    ModelSpec(
        name="anomalib",
        tier=3,
        task="anomaly-detection",
        description="Anomalib v2.2.0 — video anomaly detection framework",
        license="Apache-2.0",
        status="LOW-RISK-GRAY",
        download_type="pip",
        source="anomalib",
        subdir="anomaly/anomalib",
        size_mb=200,
        poc=True,
        production=True,
        pip_packages=["anomalib"],
    ),
    ModelSpec(
        name="anyanomaly",
        tier=3,
        task="anomaly-detection",
        description="AnyAnomaly — zero-shot text-prompt anomaly detection (WACV 2026)",
        license="MIT",
        status="CLEAN",
        download_type="git",
        source="https://github.com/SkiddieAhn/Paper-AnyAnomaly.git",
        subdir="anomaly/anyanomaly",
        size_mb=500,
        poc=True,
        production=True,
    ),

    # ======================================================================
    # TIER 4: INVESTIGATE (On-demand)
    # ======================================================================
    ModelSpec(
        name="internvideo2",
        tier=4,
        task="action-recognition",
        description="InternVideo2-6B — SOTA action recognition (92.1% K400) [CONTAMINATED]",
        license="MIT",
        status="CONTAMINATED",
        download_type="huggingface",
        source="OpenGVLab/InternVideo2-Stage2_6B",
        subdir="action/internvideo2",
        size_mb=15000,
        poc=True,
        production=False,
    ),
    ModelSpec(
        name="uniformerv2",
        tier=4,
        task="action-recognition",
        description="UniFormerV2 — efficient action recognition (90.0% K400)",
        license="MIT",
        status="LOW-RISK-GRAY",
        download_type="git",
        source="https://github.com/OpenGVLab/UniFormerV2.git",
        subdir="action/uniformerv2",
        size_mb=2000,
        poc=True,
        production=True,
    ),
    ModelSpec(
        name="dino-x",
        tier=4,
        task="open-vocab-detection",
        description="DINO-X Pro — open-vocabulary detection (56.0 AP zero-shot)",
        license="Apache-2.0",
        status="LOW-RISK-GRAY",
        download_type="git",
        source="https://github.com/IDEA-Research/DINO-X-API.git",
        subdir="openvocab/dino-x",
        size_mb=1000,
        poc=True,
        production=True,
    ),
    ModelSpec(
        name="grounding-dino",
        tier=4,
        task="open-vocab-detection",
        description="Grounding DINO — open-vocabulary detection (52.5 AP zero-shot)",
        license="Apache-2.0",
        status="LOW-RISK-GRAY",
        download_type="git",
        source="https://github.com/IDEA-Research/GroundingDINO.git",
        subdir="openvocab/grounding-dino",
        size_mb=800,
        poc=True,
        production=True,
    ),
    ModelSpec(
        name="sam3",
        tier=4,
        task="segmentation",
        description="SAM 3.1 — promptable segmentation (48.8 mask AP LVIS)",
        license="SAM-License",
        status="LOW-RISK-GRAY",
        download_type="git",
        source="https://github.com/facebookresearch/sam2.git",
        subdir="segmentation/sam3",
        size_mb=2000,
        poc=True,
        production=True,
    ),
    ModelSpec(
        name="clip-ebc",
        tier=4,
        task="crowd-counting",
        description="CLIP-EBC — CLIP-based crowd counting",
        license="MIT",
        status="LOW-RISK-GRAY",
        download_type="git",
        source="https://github.com/Yiming-M/CLIP-EBC.git",
        subdir="crowd/clip-ebc",
        size_mb=500,
        poc=True,
        production=True,
    ),

    # ======================================================================
    # NVIDIA NGC MODELS
    # ======================================================================
    ModelSpec(
        name="nvidia-peoplenet",
        tier=2,
        task="face-detection",
        description="NVIDIA PeopleNet — person+face+bag detection (proprietary data)",
        license="NVIDIA-Open",
        status="CLEAN",
        download_type="ngc",
        source="nvidia/tao/peoplenet:deployable_quantized_v2.5",
        subdir="nvidia/peoplenet",
        size_mb=100,
        poc=True,
        production=True,
    ),
    ModelSpec(
        name="nvidia-facenet",
        tier=2,
        task="face-detection",
        description="NVIDIA FaceDetect — face detection (83.85% mAP)",
        license="NVIDIA-EULA",
        status="CLEAN",
        download_type="ngc",
        source="nvidia/tao/facenet:pruned_quantized_v2.0",
        subdir="nvidia/facenet",
        size_mb=50,
        poc=True,
        production=True,
    ),
    ModelSpec(
        name="nvidia-bodyposenet",
        tier=2,
        task="pose-estimation",
        description="NVIDIA BodyPoseNet — pose (56.2 AP, OpenImages trained, CC BY 4.0)",
        license="CC-BY-4.0",
        status="CLEAN",
        download_type="ngc",
        source="nvidia/tao/bodyposenet:deployable_v1.0",
        subdir="nvidia/bodyposenet",
        size_mb=100,
        poc=True,
        production=True,
    ),

    # ======================================================================
    # INTEL OPENVINO MODELS
    # ======================================================================
    ModelSpec(
        name="intel-face-detection",
        tier=2,
        task="face-detection",
        description="Intel face-detection-retail-0005 (Apache 2.0)",
        license="Apache-2.0",
        status="CLEAN",
        download_type="omz",
        source="face-detection-retail-0005",
        subdir="intel/face-detection",
        size_mb=20,
        poc=True,
        production=True,
    ),
    ModelSpec(
        name="intel-person-reid",
        tier=2,
        task="person-reid",
        description="Intel person-reidentification-retail-0288 (Apache 2.0)",
        license="Apache-2.0",
        status="CLEAN",
        download_type="omz",
        source="person-reidentification-retail-0288",
        subdir="intel/person-reid",
        size_mb=50,
        poc=True,
        production=True,
    ),
    ModelSpec(
        name="intel-person-detection",
        tier=2,
        task="person-detection",
        description="Intel person-detection-retail-0013 (Apache 2.0)",
        license="Apache-2.0",
        status="CLEAN",
        download_type="omz",
        source="person-detection-retail-0013",
        subdir="intel/person-detection",
        size_mb=30,
        poc=True,
        production=True,
    ),
    ModelSpec(
        name="intel-pose",
        tier=2,
        task="pose-estimation",
        description="Intel human-pose-estimation-0007 (Apache 2.0)",
        license="Apache-2.0",
        status="CLEAN",
        download_type="omz",
        source="human-pose-estimation-0007",
        subdir="intel/pose",
        size_mb=40,
        poc=True,
        production=True,
    ),
]


# ---------------------------------------------------------------------------
# Download functions
# ---------------------------------------------------------------------------

def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def run(cmd: str, cwd: str | None = None) -> bool:
    log.info("  $ %s", cmd)
    result = subprocess.run(cmd, shell=True, cwd=cwd, capture_output=True, text=True)
    if result.returncode != 0:
        log.error("  FAILED: %s", result.stderr.strip()[:500])
        return False
    return True


def download_huggingface(model: ModelSpec) -> bool:
    dest = MODEL_DIR / model.subdir
    ensure_dir(dest)
    log.info("Downloading from HuggingFace: %s", model.source)
    cmd = f"huggingface-cli download {model.source} --local-dir {dest}"
    return run(cmd)


def download_git(model: ModelSpec) -> bool:
    dest = MODEL_DIR / model.subdir
    if dest.exists() and any(dest.iterdir()):
        log.info("Already cloned: %s", dest)
        return True
    ensure_dir(dest.parent)
    log.info("Cloning from Git: %s", model.source)
    branch = f"--branch {model.branch}" if model.branch else ""
    cmd = f"git clone --depth 1 {branch} {model.source} {dest}"
    return run(cmd)


def download_pip(model: ModelSpec) -> bool:
    log.info("Installing pip packages: %s", model.pip_packages)
    packages = " ".join(model.pip_packages)
    return run(f"pip install {packages}")


def download_ngc(model: ModelSpec) -> bool:
    dest = MODEL_DIR / model.subdir
    ensure_dir(dest)
    log.info("Downloading from NGC: %s", model.source)
    cmd = f"ngc registry model download-version {model.source} --dest {dest}"
    if not run(cmd):
        log.warning("NGC CLI failed. Trying wget fallback...")
        log.warning("Install NGC CLI: pip install nvidia-pyindex ngc-cli && ngc config set")
        return False
    return True


def download_omz(model: ModelSpec) -> bool:
    dest = MODEL_DIR / model.subdir
    ensure_dir(dest)
    log.info("Downloading from OpenVINO Model Zoo: %s", model.source)
    cmd = f"omz_downloader --name {model.source} --output_dir {dest}"
    if not run(cmd):
        log.warning("omz_downloader failed. Install: pip install openvino-dev open_model_zoo_tools")
        return False
    return True


DOWNLOADERS = {
    "huggingface": download_huggingface,
    "git": download_git,
    "pip": download_pip,
    "ngc": download_ngc,
    "omz": download_omz,
}


def download_model(model: ModelSpec) -> bool:
    log.info("")
    log.info("=" * 70)
    log.info("MODEL: %s", model.name)
    log.info("  Task: %s | Tier: %d | Status: %s | License: %s", model.task, model.tier, model.status, model.license)
    log.info("  %s", model.description)
    log.info("  Size: ~%d MB", model.size_mb)
    log.info("=" * 70)

    downloader = DOWNLOADERS.get(model.download_type)
    if not downloader:
        log.error("Unknown download type: %s", model.download_type)
        return False

    success = downloader(model)

    # Run post-download commands
    if success and model.post_commands:
        for cmd in model.post_commands:
            cmd = cmd.replace("{model_dir}", str(MODEL_DIR))
            run(cmd)

    if success:
        log.info("  [OK] %s downloaded successfully", model.name)
    else:
        log.error("  [FAIL] %s download failed", model.name)

    return success


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Safe City AI Model Downloader",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("--tier", type=int, choices=[1, 2, 3, 4], help="Download only models for a specific tier")
    parser.add_argument("--model", type=str, help="Download a specific model by name")
    parser.add_argument("--list", action="store_true", help="List all models without downloading")
    parser.add_argument("--poc", action="store_true", help="Download POC stack (best accuracy)")
    parser.add_argument("--production", action="store_true", help="Download production stack (clean licenses)")
    parser.add_argument("--model-dir", type=str, default=None, help="Override model directory")
    args = parser.parse_args()

    global MODEL_DIR
    if args.model_dir:
        MODEL_DIR = Path(args.model_dir)

    # Filter models
    models = MODELS

    if args.model:
        models = [m for m in models if m.name == args.model]
        if not models:
            log.error("Model '%s' not found. Available: %s", args.model, ", ".join(m.name for m in MODELS))
            sys.exit(1)
    elif args.tier:
        models = [m for m in models if m.tier == args.tier]
    elif args.production:
        models = [m for m in models if m.production]
    elif args.poc:
        models = [m for m in models if m.poc]
    # else: download all

    # List mode
    if args.list:
        total_mb = 0
        print(f"\n{'Name':<25} {'Tier':<6} {'Task':<22} {'Status':<18} {'Size':<10} {'License':<15}")
        print("-" * 100)
        for m in sorted(models, key=lambda x: (x.tier, x.task)):
            print(f"{m.name:<25} {m.tier:<6} {m.task:<22} {m.status:<18} {m.size_mb:>6} MB  {m.license:<15}")
            total_mb += m.size_mb
        print("-" * 100)
        print(f"{'TOTAL':<55} {total_mb:>6} MB  ({total_mb / 1024:.1f} GB)")
        print(f"\nModels: {len(models)}")
        return

    # Download
    log.info("Safe City AI Model Downloader")
    log.info("Model directory: %s", MODEL_DIR)
    log.info("Models to download: %d", len(models))

    total_mb = sum(m.size_mb for m in models)
    log.info("Estimated total size: %.1f GB", total_mb / 1024)

    ensure_dir(MODEL_DIR)

    # Install prerequisites
    log.info("\nInstalling download prerequisites...")
    run("pip install huggingface-hub --quiet")

    successes = 0
    failures = 0

    for model in sorted(models, key=lambda x: (x.tier, x.task)):
        if download_model(model):
            successes += 1
        else:
            failures += 1

    # Summary
    log.info("")
    log.info("=" * 70)
    log.info("DOWNLOAD COMPLETE")
    log.info("  Successful: %d", successes)
    log.info("  Failed: %d", failures)
    log.info("  Model directory: %s", MODEL_DIR)
    log.info("=" * 70)

    if failures > 0:
        log.warning("Some models failed to download. Check logs above.")
        sys.exit(1)


if __name__ == "__main__":
    main()
