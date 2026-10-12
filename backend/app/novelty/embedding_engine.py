import time
import logging
from abc import ABC, abstractmethod
from typing import Optional, List, Dict, Any, Union, Tuple
import numpy as np
import torch
import torchvision.models as tv_models
from app.core.device import get_compute_device

logger = logging.getLogger("securecam.embedding_engine")

class BaseEmbeddingModel(ABC):
    """Abstract interface for visual representation embedding models."""
    @abstractmethod
    def embed_tensor(self, tensor: torch.Tensor) -> np.ndarray:
        """Computes and returns unit L2-normalized embedding vector of shape (D,)."""
        pass

    @property
    @abstractmethod
    def embedding_dim(self) -> int:
        pass

    @property
    @abstractmethod
    def model_name(self) -> str:
        pass

class DinoV2EmbeddingModel(BaseEmbeddingModel):
    """Pretrained Meta DINOv2 ViT-S/14 visual representation model."""
    def __init__(self, device: torch.device):
        self.device = device
        self._name = "dinov2_vits14"
        logger.info(f"Initializing DINOv2 model ({self._name}) on {device}...")
        try:
            self.model = torch.hub.load('facebookresearch/dinov2', 'dinov2_vits14', pretrained=True)
            self.model.to(device)
            self.model.eval()
            self._dim = 384
            logger.info("DINOv2 ViT-S/14 initialized successfully (embedding_dim=384).")
        except Exception as e:
            logger.error(f"Failed to load DINOv2 from torch.hub: {e}", exc_info=True)
            raise e

    def embed_tensor(self, tensor: torch.Tensor) -> np.ndarray:
        tensor = tensor.to(self.device)
        with torch.no_grad():
            emb = self.model(tensor)
            # L2 normalize embedding vector
            emb = torch.nn.functional.normalize(emb, p=2, dim=-1)
            vec = emb[0].cpu().numpy()
        return vec.astype(np.float32)

    @property
    def embedding_dim(self) -> int:
        return self._dim

    @property
    def model_name(self) -> str:
        return self._name

class MobileNetV3EmbeddingModel(BaseEmbeddingModel):
    """Pretrained MobileNetV3-Small feature extractor for ultra-fast CPU inference."""
    def __init__(self, device: torch.device):
        self.device = device
        self._name = "mobilenet_v3_small"
        logger.info(f"Initializing MobileNetV3 model ({self._name}) on {device}...")
        try:
            full_model = tv_models.mobilenet_v3_small(weights=tv_models.MobileNet_V3_Small_Weights.DEFAULT)
            # Strip final classifier layer to output pooled 576-d feature vector
            full_model.classifier = torch.nn.Identity()
            self.model = full_model.to(device)
            self.model.eval()
            self._dim = 576
            logger.info("MobileNetV3 feature extractor initialized successfully (embedding_dim=576).")
        except Exception as e:
            logger.error(f"Failed to load MobileNetV3: {e}", exc_info=True)
            raise e

    def embed_tensor(self, tensor: torch.Tensor) -> np.ndarray:
        tensor = tensor.to(self.device)
        with torch.no_grad():
            emb = self.model(tensor)
            emb = torch.nn.functional.normalize(emb, p=2, dim=-1)
            vec = emb[0].cpu().numpy()
        return vec.astype(np.float32)

    @property
    def embedding_dim(self) -> int:
        return self._dim

    @property
    def model_name(self) -> str:
        return self._name

class NoveltyEmbeddingEngine:
    """
    High-level visual embedding engine providing model abstraction,
    inference latency measurement, and batch or single crop representation.
    """
    _cached_backends: Dict[str, BaseEmbeddingModel] = {}

    def __init__(
        self,
        model_name: str = "dinov2_vits14",
        device: Optional[torch.device] = None
    ):
        self.device = device or get_compute_device()
        self.model_name = model_name
        self._init_model()

    def _init_model(self):
        cache_key = f"{self.model_name}_{self.device}"
        if cache_key in self._cached_backends:
            self.backend = self._cached_backends[cache_key]
            logger.debug(f"Reusing cached visual embedding backend: {self.model_name}")
            return

        t0 = time.time()
        if self.model_name.lower().startswith("dinov2"):
            try:
                self.backend: BaseEmbeddingModel = DinoV2EmbeddingModel(self.device)
            except Exception as e:
                logger.warning(f"DINOv2 initialization fallback to MobileNetV3: {e}")
                self.backend = MobileNetV3EmbeddingModel(self.device)
                self.model_name = self.backend.model_name
        else:
            self.backend = MobileNetV3EmbeddingModel(self.device)

        self._cached_backends[cache_key] = self.backend
        init_ms = round((time.time() - t0) * 1000, 2)
        logger.info(f"Novelty embedding engine ready: {self.model_name} in {init_ms}ms")

    def embed(self, tensor: torch.Tensor) -> Tuple[np.ndarray, float]:
        """
        Embeds a single preprocessed crop tensor [1, 3, 224, 224].
        Returns:
            Tuple of (unit_normalized_vector, latency_ms)
        """
        t0 = time.time()
        vector = self.backend.embed_tensor(tensor)
        latency_ms = round((time.time() - t0) * 1000, 2)
        return vector, latency_ms

    @property
    def embedding_dim(self) -> int:
        return self.backend.embedding_dim

    def get_info(self) -> Dict[str, Any]:
        return {
            "model_name": self.backend.model_name,
            "embedding_dim": self.backend.embedding_dim,
            "device": str(self.device),
        }
