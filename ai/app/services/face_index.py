"""
Face Index — stores face embeddings from all video frames for reverse search.
Uses numpy cosine similarity (no FAISS needed at POC scale).
"""
import json
import logging
import os
import time
from pathlib import Path

import cv2
import numpy as np

logger = logging.getLogger(__name__)

INDEX_DIR = "/workspace/safe-city/face_index"
EMBEDDINGS_FILE = os.path.join(INDEX_DIR, "embeddings.npy")
METADATA_FILE = os.path.join(INDEX_DIR, "metadata.json")


class FaceIndex:
    def __init__(self):
        self.embeddings: np.ndarray | None = None  # (N, 512)
        self.metadata: list[dict] = []  # [{camera_id, timestamp, frame_num, bbox, thumbnail_b64}]
        self._load()

    def _load(self):
        """Load existing index from disk."""
        if os.path.exists(EMBEDDINGS_FILE) and os.path.exists(METADATA_FILE):
            try:
                self.embeddings = np.load(EMBEDDINGS_FILE)
                with open(METADATA_FILE, "r") as f:
                    self.metadata = json.load(f)
                logger.info("Face index loaded: %d entries", len(self.metadata))
            except Exception as e:
                logger.warning("Failed to load face index: %s", e)
                self.embeddings = None
                self.metadata = []
        else:
            logger.info("No face index found — run /face/index/build to create one")

    def save(self):
        """Save index to disk."""
        os.makedirs(INDEX_DIR, exist_ok=True)
        if self.embeddings is not None and len(self.metadata) > 0:
            np.save(EMBEDDINGS_FILE, self.embeddings)
            with open(METADATA_FILE, "w") as f:
                json.dump(self.metadata, f)
            logger.info("Face index saved: %d entries", len(self.metadata))

    def add(self, embedding: np.ndarray, meta: dict):
        """Add a single embedding + metadata to the index."""
        emb = np.array(embedding, dtype=np.float32).reshape(1, -1)
        # L2-normalize
        norm = np.linalg.norm(emb)
        if norm > 0:
            emb = emb / norm

        if self.embeddings is None:
            self.embeddings = emb
        else:
            self.embeddings = np.vstack([self.embeddings, emb])
        self.metadata.append(meta)

    def search(self, query_embedding: list[float], top_k: int = 20) -> list[dict]:
        """Search for similar faces by cosine similarity."""
        if self.embeddings is None or len(self.metadata) == 0:
            return []

        query = np.array(query_embedding, dtype=np.float32).reshape(1, -1)
        norm = np.linalg.norm(query)
        if norm > 0:
            query = query / norm

        # Cosine similarity = dot product (both L2-normalized)
        sims = (self.embeddings @ query.T).flatten()

        # Top-k indices
        top_indices = np.argsort(-sims)[:top_k]

        results = []
        for idx in top_indices:
            sim = float(sims[idx])
            if sim < 0.3:  # threshold — below this is not a match
                continue
            meta = self.metadata[idx].copy()
            meta["similarity"] = round(sim, 4)
            results.append(meta)
        return results

    @property
    def size(self) -> int:
        return len(self.metadata)


# Global singleton
face_index = FaceIndex()
