from __future__ import annotations

import asyncio
import logging
import random
from typing import Any, Callable, Awaitable

import cv2

from ai.app.services.model_registry import ModelRegistry

logger = logging.getLogger(__name__)


class VideoProcessor:
    """Processes a video file frame-by-frame, simulating a live camera feed.

    For each analysed frame the processor either runs real model inference
    (when the detection model is loaded) or generates plausible simulated
    detections so the full pipeline can be exercised end-to-end.
    """

    def __init__(
        self,
        model_registry: ModelRegistry,
        fps: int = 15,
        use_real_models: bool = True,
    ) -> None:
        self.registry = model_registry
        self.target_fps = fps
        self.use_real_models = use_real_models
        self._running = False
        self._status: str = "idle"
        self._frame_count: int = 0
        self._camera_id: str | None = None

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    @property
    def status(self) -> str:
        return self._status

    @property
    def current_frame(self) -> int:
        return self._frame_count

    async def process_video(
        self,
        video_path: str,
        camera_id: str,
        callback: Callable[[str, int, list[dict[str, Any]]], Awaitable[None]] | None = None,
    ) -> None:
        """Process *video_path* as if it were camera *camera_id*.

        The video loops indefinitely until :meth:`stop` is called.
        """
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            logger.error("Cannot open video: %s", video_path)
            self._status = "error"
            return

        source_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        frame_skip = max(1, int(source_fps / self.target_fps))
        self._frame_count = 0
        self._running = True
        self._status = "running"
        self._camera_id = camera_id

        logger.info(
            "Processing %s as camera %s at %d FPS (skip every %d frames)",
            video_path,
            camera_id,
            self.target_fps,
            frame_skip,
        )

        try:
            while self._running:
                ret, frame = cap.read()
                if not ret:
                    # Loop the video.
                    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    continue

                self._frame_count += 1
                if self._frame_count % frame_skip != 0:
                    continue

                detections = await self._detect_frame(frame, camera_id, self._frame_count)

                if callback is not None:
                    await callback(camera_id, self._frame_count, detections)

                # Simulate real-time playback.
                await asyncio.sleep(1.0 / self.target_fps)
        finally:
            cap.release()
            self._status = "stopped"
            logger.info("Video processing stopped for camera %s", camera_id)

    def stop(self) -> None:
        self._running = False

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    async def _detect_frame(
        self,
        frame: Any,
        camera_id: str,
        frame_index: int,
    ) -> list[dict[str, Any]]:
        """Run detection on a single frame.

        Falls back to simulated detections when the model is not loaded.
        """
        # TODO: wire up real RT-DETR / Co-DETR inference here when
        #       USE_REAL_MODELS=true and the model is loaded.

        return self._simulate_detections(frame, camera_id, frame_index)

    @staticmethod
    def _simulate_detections(
        frame: Any,
        camera_id: str,
        frame_index: int,
    ) -> list[dict[str, Any]]:
        h, w = frame.shape[:2]
        detections: list[dict[str, Any]] = []
        num_dets = random.randint(2, 8)

        for i in range(num_dets):
            obj_type = random.choice(
                ["person", "person", "person", "vehicle", "vehicle", "bike"]
            )
            bw = random.randint(40, min(150, w // 3))
            bh = random.randint(60, min(200, h // 3))
            x = random.randint(0, max(0, w - bw))
            y = random.randint(0, max(0, h - bh))
            conf = round(random.uniform(0.60, 0.98), 2)

            detections.append(
                {
                    "id": f"det-{camera_id}-{frame_index}-{i}",
                    "object_type": obj_type,
                    "confidence": conf,
                    "bbox": {"x": x, "y": y, "width": bw, "height": bh},
                    "track_id": f"trk-{camera_id}-{i}",
                    "attributes": None,
                }
            )

        return detections
