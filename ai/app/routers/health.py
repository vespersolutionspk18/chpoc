from __future__ import annotations

from fastapi import APIRouter, Request
from pydantic import BaseModel

router = APIRouter(tags=["health"])


class GPUInfo(BaseModel):
    available: bool
    name: str | None = None
    memory_total_mb: int | None = None
    memory_used_mb: int | None = None


class HealthResponse(BaseModel):
    status: str
    loaded_models: list[str]
    gpu: GPUInfo


def _get_gpu_info() -> GPUInfo:
    """Return GPU info if torch + CUDA are available."""
    try:
        import torch

        if torch.cuda.is_available():
            props = torch.cuda.get_device_properties(0)
            mem_total = props.total_mem // (1024 * 1024)
            mem_used = torch.cuda.memory_allocated(0) // (1024 * 1024)
            return GPUInfo(
                available=True,
                name=props.name,
                memory_total_mb=mem_total,
                memory_used_mb=mem_used,
            )
    except ImportError:
        pass
    return GPUInfo(available=False)


@router.get("/health", response_model=HealthResponse)
async def health_check(request: Request) -> HealthResponse:
    """Return service status, loaded models, and GPU information."""
    registry = request.app.state.model_registry
    return HealthResponse(
        status="ok",
        loaded_models=registry.list_models(),
        gpu=_get_gpu_info(),
    )
