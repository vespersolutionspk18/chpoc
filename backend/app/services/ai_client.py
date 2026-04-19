import logging
from typing import Any

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)


class AIClient:
    """HTTP client for the AI inference service running on vast.ai."""

    def __init__(self, base_url: str | None = None, timeout: float = 30.0):
        self.base_url = (base_url or settings.AI_SERVICE_URL).rstrip("/")
        self.timeout = timeout
        self._client: httpx.AsyncClient | None = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                timeout=self.timeout,
            )
        return self._client

    async def close(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    async def _post(self, path: str, **kwargs: Any) -> dict:
        client = await self._get_client()
        try:
            resp = await client.post(path, **kwargs)
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPStatusError as e:
            logger.error("AI service error %s: %s", e.response.status_code, e.response.text)
            raise
        except httpx.RequestError as e:
            logger.error("AI service request failed: %s", e)
            raise

    async def detect(self, frame: bytes, camera_id: str | None = None) -> list[dict]:
        """Run object detection on a video frame."""
        data = await self._post(
            "/detect",
            files={"frame": ("frame.jpg", frame, "image/jpeg")},
            data={"camera_id": camera_id or ""},
        )
        return data.get("detections", [])

    async def recognize_face(self, crop: bytes) -> dict:
        """Recognize a face from a cropped image."""
        return await self._post(
            "/recognize_face",
            files={"crop": ("face.jpg", crop, "image/jpeg")},
        )

    async def read_plate(self, crop: bytes) -> dict:
        """Read license plate text from a cropped image."""
        return await self._post(
            "/read_plate",
            files={"crop": ("plate.jpg", crop, "image/jpeg")},
        )

    async def extract_attributes(self, crop: bytes) -> dict:
        """Extract person/vehicle attributes from a cropped image."""
        return await self._post(
            "/extract_attributes",
            files={"crop": ("crop.jpg", crop, "image/jpeg")},
        )

    async def estimate_pose(self, crop: bytes) -> dict:
        """Estimate human pose from a cropped image."""
        return await self._post(
            "/estimate_pose",
            files={"crop": ("pose.jpg", crop, "image/jpeg")},
        )

    async def search_face(self, embedding: list[float], top_k: int = 10) -> list[dict]:
        """Search for matching faces by embedding vector."""
        data = await self._post(
            "/search_face",
            json={"embedding": embedding, "top_k": top_k},
        )
        return data.get("matches", [])

    async def search_face_by_image(self, image: bytes, top_k: int = 10) -> list[dict]:
        """Upload a face image, extract embedding, and search."""
        data = await self._post(
            "/search_face_by_image",
            files={"image": ("query.jpg", image, "image/jpeg")},
            data={"top_k": str(top_k)},
        )
        return data.get("matches", [])

    async def search_by_attributes(self, attributes: dict, top_k: int = 50) -> list[dict]:
        """Search tracks by attribute description."""
        data = await self._post(
            "/search_attributes",
            json={"attributes": attributes, "top_k": top_k},
        )
        return data.get("matches", [])


# Singleton instance
ai_client = AIClient()
