from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)


class ModelRegistry:
    """Manages loading / unloading of AI models.

    For the POC this is a lightweight stub.  When deployed to vast.ai the
    methods will be wired up to actually load ONNX / TorchScript weights
    into GPU memory.
    """

    def __init__(self) -> None:
        self._models: dict[str, Any] = {}

    async def load_model(self, name: str, path: str) -> None:
        """Load a model from *path* and register it under *name*.

        # TODO: Replace with actual model loading (ONNX / TorchScript)
        """
        logger.info("Loading model %s from %s (stub)", name, path)
        self._models[name] = {"name": name, "path": path, "status": "loaded"}

    def get_model(self, name: str) -> Any | None:
        """Return the loaded model object, or ``None`` if not loaded."""
        return self._models.get(name)

    def list_models(self) -> list[str]:
        """Return names of all currently loaded models."""
        return list(self._models.keys())

    async def unload_model(self, name: str) -> bool:
        """Unload a model by name.  Returns ``True`` if it was present."""
        if name in self._models:
            logger.info("Unloading model %s (stub)", name)
            del self._models[name]
            return True
        return False
