import logging
import time
from typing import Dict, Any, Optional
from ultralytics import YOLO
import torch

from app.config import settings
from app.core.device import get_compute_device

logger = logging.getLogger("securecam.model_manager")

class ModelManager:
    """
    Singleton manager for loading, caching, and serving the YOLO detection model.
    Ensures model weights are loaded once in memory and reused across all requests.
    """
    _instance: Optional["ModelManager"] = None
    _model: Optional[YOLO] = None
    _device: Optional[torch.device] = None
    _loaded_at: Optional[float] = None
    _initialization_error: Optional[str] = None

    def __new__(cls) -> "ModelManager":
        if cls._instance is None:
            cls._instance = super(ModelManager, cls).__new__(cls)
        return cls._instance

    def load_model(self, model_name: Optional[str] = None, force_reload: bool = False) -> YOLO:
        target_model = model_name or settings.MODEL_NAME
        
        if self._model is not None and not force_reload:
            return self._model

        logger.info(f"Initializing YOLO model: {target_model}...")
        self._initialization_error = None
        start_time = time.time()
        
        try:
            self._device = get_compute_device(settings.DEVICE)
            # Load YOLO model (downloads pretrained weights if not present in cache/local dir)
            model = YOLO(target_model)
            
            # Transfer to target device if supported
            if self._device.type == "cuda":
                model.to(self._device)
                
            self._model = model
            self._loaded_at = time.time()
            elapsed = round(self._loaded_at - start_time, 2)
            logger.info(f"Model {target_model} successfully loaded onto {self._device} in {elapsed}s.")
            return self._model
            
        except Exception as e:
            error_msg = f"Failed to initialize YOLO model '{target_model}': {str(e)}"
            logger.error(error_msg, exc_info=True)
            self._initialization_error = error_msg
            self._model = None
            raise RuntimeError(error_msg) from e

    def get_model(self) -> YOLO:
        if self._model is None:
            return self.load_model()
        return self._model

    def is_loaded(self) -> bool:
        return self._model is not None

    def get_info(self) -> Dict[str, Any]:
        """Expose current model metadata and runtime telemetry."""
        if self._model is None:
            return {
                "loaded": False,
                "model_name": settings.MODEL_NAME,
                "device": str(self._device) if self._device else "uninitialized",
                "error": self._initialization_error,
            }
            
        names_dict = getattr(self._model, "names", {})
        classes_count = len(names_dict) if isinstance(names_dict, dict) else len(names_dict) if isinstance(names_dict, list) else 80

        return {
            "loaded": True,
            "model_name": settings.MODEL_NAME,
            "model_version": getattr(self._model, "task", "detect"),
            "device": str(self._device),
            "device_type": self._device.type if self._device else "unknown",
            "inference_mode": "FP16 CUDA" if self._device and self._device.type == "cuda" else "FP32 CPU",
            "classes_count": classes_count,
            "classes": names_dict if isinstance(names_dict, dict) else {i: name for i, name in enumerate(names_dict)},
            "loaded_at": self._loaded_at,
            "error": None,
        }

model_manager = ModelManager()
