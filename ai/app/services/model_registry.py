from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


class ModelRegistry:
    """Manages loading / unloading of AI models on GPU.

    Supports ONNX, PyTorch (.pt/.pth), safetensors, and directory-based
    model formats.  When a model file does not exist on disk the registry
    stores a lightweight stub so that the rest of the service can still
    start and return simulated results.
    """

    def __init__(self, model_dir: str = "/models", device: str = "cuda") -> None:
        self._models: dict[str, dict[str, Any]] = {}
        self.model_dir = Path(model_dir)
        self.device = device

    # ------------------------------------------------------------------
    # Loading
    # ------------------------------------------------------------------

    async def load_model(self, name: str, path: str, model_class: str = "generic") -> None:
        """Load a model from *path* (relative to model_dir) and register it."""
        full_path = self.model_dir / path
        logger.info("Loading model %s from %s", name, full_path)

        if not full_path.exists():
            logger.warning("Model path %s does not exist -- registering as stub", full_path)
            self._models[name] = {
                "name": name,
                "path": str(full_path),
                "status": "stub",
                "type": "stub",
            }
            return

        try:
            suffix = full_path.suffix.lower()

            if suffix == ".onnx":
                import onnxruntime as ort

                providers = ["CUDAExecutionProvider", "CPUExecutionProvider"]
                session = ort.InferenceSession(str(full_path), providers=providers)
                self._models[name] = {
                    "name": name,
                    "session": session,
                    "type": "onnx",
                    "status": "loaded",
                    "path": str(full_path),
                }

            elif suffix in (".pth", ".pt"):
                import torch

                checkpoint = torch.load(
                    str(full_path),
                    map_location=self.device,
                    weights_only=False,
                )
                self._models[name] = {
                    "name": name,
                    "checkpoint": checkpoint,
                    "type": "pytorch",
                    "status": "loaded",
                    "path": str(full_path),
                }

            elif suffix == ".safetensors":
                from safetensors.torch import load_file

                state_dict = load_file(str(full_path))
                self._models[name] = {
                    "name": name,
                    "state_dict": state_dict,
                    "type": "safetensors",
                    "status": "loaded",
                    "path": str(full_path),
                }

            else:
                # Treat as a directory-based model (e.g. HuggingFace layout).
                self._models[name] = {
                    "name": name,
                    "path": str(full_path),
                    "type": "directory",
                    "status": "loaded",
                }

            logger.info(
                "Model %s loaded successfully (type=%s)",
                name,
                self._models[name]["type"],
            )

        except Exception as exc:
            logger.error("Failed to load model %s: %s", name, exc)
            self._models[name] = {
                "name": name,
                "path": str(full_path),
                "status": "error",
                "type": "unknown",
                "error": str(exc),
            }

    # ------------------------------------------------------------------
    # Access helpers
    # ------------------------------------------------------------------

    def get_model(self, name: str) -> dict[str, Any] | None:
        """Return the model record, or ``None`` if not registered."""
        return self._models.get(name)

    def is_loaded(self, name: str) -> bool:
        """Return ``True`` if the model is registered **and** its weights are
        actually loaded (i.e. not a stub / error)."""
        entry = self._models.get(name)
        return entry is not None and entry.get("status") == "loaded"

    def list_models(self) -> list[dict[str, str]]:
        """Return a summary list of all registered models."""
        return [
            {
                "name": info["name"],
                "status": info.get("status", "unknown"),
                "type": info.get("type", "unknown"),
            }
            for info in self._models.values()
        ]

    # ------------------------------------------------------------------
    # Unloading
    # ------------------------------------------------------------------

    async def unload_model(self, name: str) -> bool:
        """Unload a model by name.  Returns ``True`` if it was present."""
        if name not in self._models:
            return False

        logger.info("Unloading model %s", name)
        del self._models[name]

        # Best-effort GPU memory cleanup.
        try:
            import torch

            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        except ImportError:
            pass

        return True
