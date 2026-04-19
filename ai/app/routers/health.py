from __future__ import annotations

import logging
import platform
from datetime import datetime, timezone

from fastapi import APIRouter, Request
from pydantic import BaseModel

from ai.app.core.config import settings

logger = logging.getLogger(__name__)
router = APIRouter(tags=["health"])


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------

class GPUInfo(BaseModel):
    available: bool
    name: str | None = None
    memory_total_mb: int | None = None
    memory_used_mb: int | None = None
    memory_free_mb: int | None = None
    utilization_pct: float | None = None


class ModelInfo(BaseModel):
    name: str
    status: str
    type: str


class HealthResponse(BaseModel):
    status: str
    version: str
    use_real_models: bool
    loaded_models: list[ModelInfo]
    gpu: GPUInfo
    host: str
    timestamp: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_gpu_info() -> GPUInfo:
    """Return detailed GPU information if torch + CUDA are available."""
    try:
        import torch

        if torch.cuda.is_available():
            props = torch.cuda.get_device_properties(0)
            mem_total = props.total_mem // (1024 * 1024)
            mem_allocated = torch.cuda.memory_allocated(0) // (1024 * 1024)
            mem_reserved = torch.cuda.memory_reserved(0) // (1024 * 1024)
            mem_free = mem_total - mem_reserved

            # Try to get utilization (requires pynvml, optional)
            utilization: float | None = None
            try:
                import pynvml

                pynvml.nvmlInit()
                handle = pynvml.nvmlDeviceGetHandleByIndex(0)
                util = pynvml.nvmlDeviceGetUtilizationRates(handle)
                utilization = float(util.gpu)
                pynvml.nvmlShutdown()
            except Exception:
                pass

            return GPUInfo(
                available=True,
                name=torch.cuda.get_device_name(0),
                memory_total_mb=mem_total,
                memory_used_mb=mem_allocated,
                memory_free_mb=mem_free,
                utilization_pct=utilization,
            )
    except ImportError:
        pass

    return GPUInfo(available=False)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/health", response_model=HealthResponse)
async def health_check(request: Request) -> HealthResponse:
    """Return service status, loaded models, GPU info, and config."""
    registry = request.app.state.model_registry
    models = registry.list_models()

    return HealthResponse(
        status="ok",
        version="0.2.0",
        use_real_models=settings.USE_REAL_MODELS,
        loaded_models=[
            ModelInfo(name=m["name"], status=m["status"], type=m["type"])
            for m in models
        ],
        gpu=_get_gpu_info(),
        host=platform.node(),
        timestamp=datetime.now(timezone.utc).isoformat(),
    )
