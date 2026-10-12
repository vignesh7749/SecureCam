import json
import logging
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any
import numpy as np
import torch
from app.novelty.schemas import PrototypeRecord

logger = logging.getLogger("securecam.reference_memory")

class KnownObjectReferenceMemory:
    """
    Maintains empirical reference prototype representations for known object classes.
    Prototypes are calculated from genuine surveillance crops and visual embeddings.
    """
    def __init__(self, storage_path: Optional[Path] = None):
        self.storage_path = storage_path or Path(__file__).resolve().parent / "reference_gallery.json"
        self.prototypes: Dict[str, PrototypeRecord] = {}
        self.prototype_matrix: Optional[np.ndarray] = None
        self.class_index_map: List[str] = []
        self.load_or_initialize()

    def load_or_initialize(self):
        """Loads cached reference prototypes from storage if available."""
        if self.storage_path.exists():
            try:
                with open(self.storage_path, "r") as f:
                    data = json.load(f)
                for c_name, record_dict in data.items():
                    self.prototypes[c_name] = PrototypeRecord(**record_dict)
                self._update_matrix()
                logger.info(f"Loaded {len(self.prototypes)} known class prototypes from {self.storage_path.name}")
                return
            except Exception as e:
                logger.warning(f"Could not load reference gallery from {self.storage_path}: {e}")

        logger.info("Reference gallery not found or empty. Ready for calibration initialization.")

    def _update_matrix(self):
        """Builds a stacked numpy matrix (C, D) of unit prototype vectors for fast vectorized cosine similarity."""
        if not self.prototypes:
            self.prototype_matrix = None
            self.class_index_map = []
            return

        self.class_index_map = list(self.prototypes.keys())
        vectors = [self.prototypes[c].prototypeVector for c in self.class_index_map]
        matrix = np.array(vectors, dtype=np.float32)
        # Ensure rows are unit normalized
        norms = np.linalg.norm(matrix, axis=1, keepdims=True)
        norms[norms == 0] = 1.0
        self.prototype_matrix = matrix / norms

    def add_class_samples(self, class_name: str, embeddings: List[np.ndarray]):
        """
        Calculates and registers a verified prototype embedding from empirical visual vectors.
        """
        if not embeddings:
            return

        embs = np.array(embeddings, dtype=np.float32)
        # Normalize each sample
        norms = np.linalg.norm(embs, axis=1, keepdims=True)
        norms[norms == 0] = 1.0
        embs_norm = embs / norms

        # Mean vector
        prototype = np.mean(embs_norm, axis=0)
        proto_norm = np.linalg.norm(prototype)
        if proto_norm > 0:
            prototype = prototype / proto_norm

        # Empirical intra-class cosine distance distribution
        # distance = 1.0 - cosine_similarity
        sims = np.dot(embs_norm, prototype)
        dists = 1.0 - np.clip(sims, -1.0, 1.0)
        mean_dist = float(np.mean(dists))
        std_dist = float(np.std(dists)) if len(dists) > 1 else 0.05

        record = PrototypeRecord(
            className=class_name.lower(),
            prototypeVector=prototype.tolist(),
            sampleCount=len(embeddings),
            meanDistance=round(mean_dist, 4),
            stdDistance=round(std_dist, 4)
        )
        self.prototypes[class_name.lower()] = record
        self._update_matrix()

    def compare_embedding(self, embedding: np.ndarray) -> Tuple[str, float, float]:
        """
        Compares an unknown observation embedding against all known class prototypes.
        
        Returns:
            Tuple of:
                - top_class_name: closest known object class
                - top_similarity: cosine similarity in [0.0, 1.0]
                - embedding_distance: cosine distance = 1.0 - top_similarity
        """
        if self.prototype_matrix is None or len(self.class_index_map) == 0:
            # Fallback when gallery is not yet populated
            return "unknown", 0.0, 1.0

        emb = embedding.astype(np.float32)
        norm = np.linalg.norm(emb)
        if norm > 0:
            emb = emb / norm

        # Vectorized inner products
        sims = np.dot(self.prototype_matrix, emb)
        best_idx = int(np.argmax(sims))
        best_sim = float(np.clip(sims[best_idx], 0.0, 1.0))
        top_class = self.class_index_map[best_idx]
        distance = round(1.0 - best_sim, 4)

        return top_class, round(best_sim, 4), distance

    def save_to_disk(self):
        """Persists current reference gallery to disk."""
        try:
            self.storage_path.parent.mkdir(parents=True, exist_ok=True)
            data = {c: p.model_dump() for c, p in self.prototypes.items()}
            with open(self.storage_path, "w") as f:
                json.dump(data, f, indent=2)
            logger.info(f"Saved {len(self.prototypes)} prototypes to {self.storage_path}")
        except Exception as e:
            logger.error(f"Failed to persist reference gallery: {e}", exc_info=True)

    def get_gallery_summary(self) -> Dict[str, Any]:
        return {
            "classesCount": len(self.prototypes),
            "classes": [
                {
                    "name": p.className,
                    "samples": p.sampleCount,
                    "meanDistance": p.meanDistance,
                    "stdDistance": p.stdDistance,
                    "embeddingDim": len(p.prototypeVector)
                }
                for p in self.prototypes.values()
            ]
        }
