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
)
from ai.app.services.model_registry import ModelRegistry  # noqa: E402

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Startup / shutdown lifecycle for the AI service."""
    registry = ModelRegistry()

    # TODO: Replace with actual model loading from settings.MODEL_DIR
    logger.info("Model directory: %s", settings.MODEL_DIR)
    logger.info("Device: %s", settings.DEVICE)

    app.state.model_registry = registry
    logger.info("AI service started on %s:%s", settings.HOST, settings.PORT)
    yield
    # Cleanup
    for name in list(registry.list_models()):
        await registry.unload_model(name)
    logger.info("AI service shut down, all models unloaded.")


app = FastAPI(
    title="Safe City AI Service",
    version="0.1.0",
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

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "ai.app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=True,
    )
