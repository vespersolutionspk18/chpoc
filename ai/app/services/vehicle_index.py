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

    def search(self, query_embedding: list[float] | None = None, top_k: int = 20,
               filter_type: str | None = None, filter_color: str | None = None) -> list[dict]:
        if self.embeddings is None or len(self.metadata) == 0:
            return []

        # Filter-only mode (no embedding — just browse by type/color)
        has_query = query_embedding is not None and any(v != 0 for v in query_embedding[:10])

        if has_query:
            query = np.array(query_embedding, dtype=np.float32).reshape(1, -1)
            norm = np.linalg.norm(query)
            if norm > 0:
                query = query / norm
            sims = (self.embeddings @ query.T).flatten()
            indices = np.argsort(-sims)[:top_k * 3]
        else:
            # No embedding — return all, sorted by index (most recent first)
            sims = np.ones(len(self.metadata))
            indices = list(range(len(self.metadata)))

        results = []
        for idx in indices:
            if len(results) >= top_k:
                break
            meta = self.metadata[idx]
            # Apply filters with type mapping
            if filter_type:
                ft = filter_type.lower().replace("-", "_").replace(" ", "_")
                vc = meta.get("vehicle_class", "").lower().replace("-", "_").replace(" ", "_")

                # Map search types to what might be in the index
                # YOLO classes: car, truck, bus, motorcycle
                # CLIP classes: sedan, SUV, hatchback, pickup, van, bus, truck, motorcycle, auto_rickshaw
                _TYPE_GROUPS = {
                    "car": ["car", "sedan", "suv", "hatchback", "wagon", "minivan"],
                    "sedan": ["sedan", "car"],
                    "suv": ["suv", "car"],
                    "hatchback": ["hatchback", "car"],
                    "truck": ["truck", "pickup"],
                    "pickup": ["pickup", "truck"],
                    "van": ["van", "minivan", "car"],
                    "minivan": ["minivan", "van"],
                    "bus": ["bus"],
                    "motorcycle": ["motorcycle"],
                    "auto_rickshaw": ["auto_rickshaw", "rickshaw", "motorcycle"],
                    "rickshaw": ["auto_rickshaw", "rickshaw", "motorcycle"],
                    "chingchi": ["auto_rickshaw", "rickshaw", "chingchi"],
                    "wagon": ["wagon", "car"],
                }
                allowed = _TYPE_GROUPS.get(ft, [ft])
                if vc not in allowed:
                    continue

            if filter_color:
                fc = filter_color.lower()
                dc = meta.get("dominant_color", "").lower()
                # Allow silver=grey match
                _COLOR_ALIASES = {"silver": "grey", "grey": "silver"}
                if fc != dc and fc not in dc and dc not in fc:
                    alias = _COLOR_ALIASES.get(fc)
                    if not alias or (alias != dc and alias not in dc):
                        continue
            sim = float(sims[idx])
            if has_query and sim < 0.3:
                continue
            result = meta.copy()
            result["similarity"] = round(sim, 4) if has_query else 1.0
            results.append(result)
        return results

    @property
    def size(self) -> int:
        return len(self.metadata)


vehicle_index = VehicleIndex()
