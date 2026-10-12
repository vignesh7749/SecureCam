import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.core.model_manager import model_manager
from app.api.routes_health import router as health_router
from app.api.routes_video import router as video_router
from app.api.routes_detection import router as detection_router
from app.api.routes_zones import router as zones_router

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [%(name)s]: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
logger = logging.getLogger("securecam.main")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: preload YOLO model
    logger.info("Initializing SECURECAM Computer Vision Backend...")
    try:
        model_manager.load_model()
        logger.info("YOLO Model preloaded successfully.")
    except Exception as e:
        logger.error(f"Failed to preload model at startup: {str(e)}. Fallback to on-demand loading.")
    yield
    # Shutdown
    logger.info("SECURECAM Backend shutting down.")

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Real-time Computer Vision & Video Surveillance Intelligence Backend powered by FastAPI, PyTorch & Ultralytics YOLO",
    lifespan=lifespan
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Range", "Accept-Ranges", "Content-Length", "Content-Type", "ETag"],
)

# API Routers
app.include_router(health_router, prefix=settings.API_V1_PREFIX)
app.include_router(video_router, prefix=settings.API_V1_PREFIX)
app.include_router(detection_router, prefix=settings.API_V1_PREFIX)
app.include_router(zones_router, prefix=settings.API_V1_PREFIX)
# Also include detection_router at root so /ws/analysis/{id} matches the requested spec
app.include_router(detection_router)

@app.get("/")
def root():
    return {
        "platform": "SECURECAM",
        "version": settings.VERSION,
        "status": "ONLINE",
        "docs_url": "/docs"
    }
