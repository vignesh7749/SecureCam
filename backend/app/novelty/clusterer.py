import logging
import time
from typing import List, Dict, Optional, Tuple, Any
import numpy as np
from sklearn.cluster import DBSCAN

from app.novelty.schemas import ClusterSummary, EmbeddingRecord

logger = logging.getLogger("securecam.clusterer")

class UnknownObjectClusterer:
    """
    Lightweight DBSCAN clustering engine for grouping recurring unknown object embeddings.
    Clusters are assigned identifiers (e.g. NOVEL_CLUSTER_01).
    """
    def __init__(
        self,
        eps: float = 0.35,  # Maximum cosine distance for two embeddings to be considered neighbors
        min_samples: int = 2
    ):
        self.eps = eps
        self.min_samples = min_samples
        self.clusters: Dict[str, ClusterSummary] = {}

    def fit(self, vectors: List[np.ndarray]) -> List[int]:
        """Runs DBSCAN directly on list of embedding vectors and returns cluster labels."""
        if not vectors:
            return []
        vecs = np.array(vectors, dtype=np.float32)
        norms = np.linalg.norm(vecs, axis=1, keepdims=True)
        norms[norms == 0] = 1.0
        vecs_norm = vecs / norms
        db = DBSCAN(eps=self.eps, min_samples=self.min_samples, metric="cosine")
        return list(db.fit_predict(vecs_norm))

    def cluster_embeddings(
        self,
        records: List[Tuple[int, EmbeddingRecord]]  # List of (track_id, record)
    ) -> Dict[str, ClusterSummary]:
        """
        Runs DBSCAN clustering across provided unit-normalized embedding vectors.
        Returns:
            Dict mapping cluster_id -> ClusterSummary
        """
        if not records or len(records) < self.min_samples:
            return {}

        vectors = np.array([r[1].vector for r in records], dtype=np.float32)
        # Ensure unit normalization for cosine metric
        norms = np.linalg.norm(vectors, axis=1, keepdims=True)
        norms[norms == 0] = 1.0
        vectors_norm = vectors / norms

        try:
            # DBSCAN using cosine metric
            db = DBSCAN(eps=self.eps, min_samples=self.min_samples, metric="cosine")
            labels = db.fit_predict(vectors_norm)
        except Exception as e:
            logger.error(f"DBSCAN clustering failed: {e}", exc_info=True)
            return {}

        cluster_map: Dict[str, ClusterSummary] = {}
        unique_labels = set(labels)

        for label in unique_labels:
            if label == -1:
                # Noise points
                continue

            cluster_id = f"NOVEL_CLUSTER_{label + 1:02d}"
            member_indices = [i for i, l in enumerate(labels) if l == label]
            member_vectors = vectors_norm[member_indices]
            member_tracks = {records[i][0] for i in member_indices}
            
            # Compute cluster centroid
            centroid = np.mean(member_vectors, axis=0)
            c_norm = np.linalg.norm(centroid)
            if c_norm > 0:
                centroid = centroid / c_norm

            timestamps = [records[i][1].timestamp for i in member_indices]
            t_min = min(timestamps) if timestamps else 0.0
            t_max = max(timestamps) if timestamps else 0.0

            first_str = time.strftime('%H:%M:%S', time.gmtime(t_min))
            last_str = time.strftime('%H:%M:%S', time.gmtime(t_max))

            summary = ClusterSummary(
                clusterId=cluster_id,
                observationCount=len(member_indices),
                uniqueTrackCount=len(member_tracks),
                centroidEmbedding=centroid.tolist(),
                meanNoveltyScore=75.0,
                firstSeen=first_str,
                lastSeen=last_str
            )
            cluster_map[cluster_id] = summary

        self.clusters = cluster_map
        logger.info(f"DBSCAN generated {len(cluster_map)} unknown object clusters across {len(records)} observations.")
        return cluster_map
