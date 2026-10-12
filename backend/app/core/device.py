import logging
from typing import Dict, Any
import torch

logger = logging.getLogger("securecam.device")

def get_compute_device(requested_device: str = "auto") -> torch.device:
    """
    Select compute device based on configuration and availability.
    1. CUDA if requested and available
    2. CPU fallback otherwise
    """
    if requested_device.lower() == "cuda":
        if torch.cuda.is_available():
            logger.info("CUDA requested and available. Using CUDA GPU.")
            return torch.device("cuda:0")
        else:
            logger.warning("CUDA requested but not available. Falling back to CPU.")
            return torch.device("cpu")
            
    if requested_device.lower() == "cpu":
        logger.info("CPU explicitly requested. Using CPU.")
        return torch.device("cpu")
        
    # Auto selection
    if torch.cuda.is_available():
        gpu_name = torch.cuda.get_device_name(0)
        logger.info(f"CUDA detected: {gpu_name}. Using CUDA GPU.")
        return torch.device("cuda:0")
    else:
        logger.info("No CUDA hardware detected. Using CPU for inference.")
        return torch.device("cpu")

def get_device_info() -> Dict[str, Any]:
    """Return runtime hardware device telemetry."""
    cuda_available = torch.cuda.is_available()
    info = {
        "cuda_available": cuda_available,
        "device_type": "cuda" if cuda_available else "cpu",
        "device_count": torch.cuda.device_count() if cuda_available else 0,
        "torch_version": torch.__version__,
    }
    
    if cuda_available:
        info["gpu_name"] = torch.cuda.get_device_name(0)
        info["memory_allocated_mb"] = round(torch.cuda.memory_allocated(0) / (1024 * 1024), 2)
        info["memory_reserved_mb"] = round(torch.cuda.memory_reserved(0) / (1024 * 1024), 2)
    else:
        info["gpu_name"] = "None (CPU Execution Engine)"
        
    return info
