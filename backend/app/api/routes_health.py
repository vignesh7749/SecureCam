from fastapi import APIRouter
from app.config import settings
from app.core.model_manager import model_manager
from app.core.device import get_device_info
from app.detection.schemas import SystemHealthResponse

router = APIRouter(prefix="", tags=["Health & System"])

@router.get("/health", response_model=SystemHealthResponse)
async def get_health():
    """
    Checks backend health, active deep-learning model status, and device acceleration.
    """
    return SystemHealthResponse(
        status="ONLINE",
        version=settings.VERSION,
        model=model_manager.get_info(),
        device=get_device_info()
    )
