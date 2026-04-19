from __future__ import annotations

import logging
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# ---------------------------------------------------------------------------
# Make the project root importable so `shared.schemas` resolves correctly.
# ---------------------------------------------------------------------------
_project_root = str(Path(__file__).resolve().parents[2])
if _project_root not in sys.path:
    sys.path.insert(0, _project_root)

from ai.app.core.config import settings  # noqa: E402
from ai.app.routers import (  # noqa: E402
    action,
    anomaly,
    attributes,
    detect,
    face,
    health,
    plate,
    pose,
    search,
    segment,
    video,
)
from ai.app.services.model_registry import ModelRegistry  # noqa: E402

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Models to load at startup.
# Paths are relative to settings.MODEL_DIR (default "/models" on vast.ai).
# ---------------------------------------------------------------------------
MODELS_TO_LOAD: list[tuple[str, str]] = [
    # Tier 1 -- object detection
    ("co-detr", "detection/co-detr/pytorch_model.pth"),
    ("rt-detr", "detection/rt-detr/weights/rtdetr_r50vd_6x_coco.pth"),
    # Tier 1 -- face
    ("auraface-detector", "face/auraface/scrfd_10g_bnkps.onnx"),
    ("auraface-recognizer", "face/auraface/glintr100.onnx"),
    # Tier 1 -- open-vocabulary
    ("grounding-dino-swint", "openvocab/grounding-dino/weights/groundingdino_swint_ogc.pth"),
    # Tier 2 -- segmentation
    ("sam2", "segmentation/sam3/checkpoints/sam2.1_hiera_large.pt"),
    # Tier 2 -- pose
    ("vitpose", "pose/vitpose/weights/vitpose-base/model.safetensors"),
    # Tier 2 -- action recognition
    ("internvideo2", "action/internvideo2/InternVideo2-stage2_1b-224p-f4.pt"),
]


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Startup / shutdown lifecycle for the AI service."""
    registry = ModelRegistry(
        model_dir=settings.MODEL_DIR,
        device=settings.DEVICE,
    )

    logger.info("Model directory : %s", settings.MODEL_DIR)
    logger.info("Device          : %s", settings.DEVICE)
    logger.info("USE_REAL_MODELS : %s", settings.USE_REAL_MODELS)

    # Load every model -- missing files are registered as stubs so the
    # service always starts.
    for name, path in MODELS_TO_LOAD:
        await registry.load_model(name, path)

    app.state.model_registry = registry

    loaded = [m for m in registry.list_models() if m["status"] == "loaded"]
    stubs = [m for m in registry.list_models() if m["status"] == "stub"]
    errors = [m for m in registry.list_models() if m["status"] == "error"]

    logger.info(
        "AI service ready -- %d loaded, %d stubs, %d errors",
        len(loaded),
        len(stubs),
        len(errors),
    )
    logger.info("Listening on %s:%s", settings.HOST, settings.PORT)
    yield

    # Cleanup
    for model_info in registry.list_models():
        await registry.unload_model(model_info["name"])
    logger.info("AI service shut down, all models unloaded.")


app = FastAPI(
    title="Safe City AI Service",
    version="0.2.0",
    lifespan=lifespan,
)

# -- CORS -------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -- Routers ----------------------------------------------------------------
app.include_router(health.router)
app.include_router(detect.router)
app.include_router(face.router)
app.include_router(plate.router)
app.include_router(pose.router)
app.include_router(attributes.router)
app.include_router(action.router)
app.include_router(anomaly.router)
app.include_router(segment.router)
app.include_router(search.router)
app.include_router(video.router)

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "ai.app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=True,
    )
