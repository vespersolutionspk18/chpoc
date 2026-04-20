"""
Vehicle Index — stores CLIP embeddings of vehicle crops for reverse visual search.
Same pattern as face_index but uses CLIP ViT-B/32 instead of InsightFace embeddings.
"""
import json
import logging
import os

import numpy as np

logger = logging.getLogger(__name__)

INDEX_DIR = "/workspace/safe-city/vehicle_index"
EMBEDDINGS_FILE = os.path.join(INDEX_DIR, "embeddings.npy")
METADATA_FILE = os.path.join(INDEX_DIR, "metadata.json")


class VehicleIndex:
    def __init__(self):
        self.embeddings: np.ndarray | None = None  # (N, 512) CLIP embeddings
        self.metadata: list[dict] = []
        self._load()

    def _load(self):
        if os.path.exists(EMBEDDINGS_FILE) and os.path.exists(METADATA_FILE):
            try:
                self.embeddings = np.load(EMBEDDINGS_FILE)
                with open(METADATA_FILE, "r") as f:
                    self.metadata = json.load(f)
                logger.info("Vehicle index loaded: %d entries", len(self.metadata))
            except Exception as e:
                logger.warning("Failed to load vehicle index: %s", e)

    def save(self):
        os.makedirs(INDEX_DIR, exist_ok=True)
        if self.embeddings is not None and len(self.metadata) > 0:
            np.save(EMBEDDINGS_FILE, self.embeddings)
            with open(METADATA_FILE, "w") as f:
                json.dump(self.metadata, f)
            logger.info("Vehicle index saved: %d entries", len(self.metadata))

    def add(self, embedding: np.ndarray, meta: dict):
        emb = np.array(embedding, dtype=np.float32).reshape(1, -1)
        norm = np.linalg.norm(emb)
        if norm > 0:
            emb = emb / norm
        if self.embeddings is None:
            self.embeddings = emb
        else:
            self.embeddings = np.vstack([self.embeddings, emb])
        self.metadata.append(meta)

    def search(self, query_embedding: list[float], top_k: int = 20,
               filter_type: str | None = None, filter_color: str | None = None) -> list[dict]:
        if self.embeddings is None or len(self.metadata) == 0:
            return []

        query = np.array(query_embedding, dtype=np.float32).reshape(1, -1)
        norm = np.linalg.norm(query)
        if norm > 0:
            query = query / norm

        sims = (self.embeddings @ query.T).flatten()
        top_indices = np.argsort(-sims)[:top_k * 3]  # get extra for filtering

        results = []
        for idx in top_indices:
            if len(results) >= top_k:
                break
            sim = float(sims[idx])
            if sim < 0.5:
                continue
            meta = self.metadata[idx]
            # Apply filters
            if filter_type and meta.get("vehicle_class", "").lower() != filter_type.lower():
                continue
            if filter_color and filter_color.lower() not in meta.get("dominant_color", "").lower():
                continue
            result = meta.copy()
            result["similarity"] = round(sim, 4)
            results.append(result)
        return results

    @property
    def size(self) -> int:
        return len(self.metadata)


vehicle_index = VehicleIndex()
