import uuid
import shutil
import logging
import json
import time
import hashlib
from typing import List
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, HTTPException, Request, Response, status
from fastapi.responses import FileResponse, StreamingResponse

from app.config import settings
from app.detection.schemas import VideoMetadata, SampleVideoItem
from app.video.metadata import extract_video_metadata
from app.services.analysis_service import analysis_service
from app.services.sample_service import sample_service

logger = logging.getLogger("securecam.routes_video")

router = APIRouter(prefix="/video", tags=["Video Management"])

def range_stream_response(file_path: Path, request: Request = None) -> Response:
    """
    HTTP 206 Partial Content streaming supporting byte-range scrub/seek operations.
    Uses Starlette's high-performance native FileResponse with content_disposition_type='inline'
    to stream video inline directly to web browsers without attachment prompts,
    natively supporting HTTP 206 Partial Content byte ranges, scrubbing, and timeline seeks.
    """
    suffix = file_path.suffix.lower()
    media_type = "video/mp4"
    if suffix == ".webm":
        media_type = "video/webm"
    elif suffix == ".mkv":
        media_type = "video/x-matroska"
    elif suffix == ".mov":
        media_type = "video/quicktime"
    elif suffix == ".avi":
        media_type = "video/x-msvideo"

    headers = {
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=3600",
    }

    return FileResponse(
        path=file_path,
        media_type=media_type,
        content_disposition_type="inline",
        headers=headers
    )

@router.post("/upload", response_model=VideoMetadata)
async def upload_video(file: UploadFile = File(...)):
    """
    Accepts surveillance video footage, validates format, stores safely with UUID,
    and extracts ground-truth video stream metadata using OpenCV.
    Guarantees exactly ONE stored upload per physical video content.
    """
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file must have a valid filename."
        )

    orig_path = Path(file.filename)
    extension = orig_path.suffix.lower()

    if extension not in settings.ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported video extension '{extension}'. Supported extensions: {', '.join(sorted(settings.ALLOWED_EXTENSIONS))}"
        )

    temp_id = str(uuid.uuid4())
    temp_target_path = settings.UPLOADS_DIR / f"{temp_id}{extension}"

    logger.info(f"Upload request received | Filename: {file.filename}")

    try:
        # Stream file to disk while simultaneously computing SHA-256 digest
        hasher = hashlib.sha256()
        with open(temp_target_path, "wb") as buffer:
            while chunk := await file.read(1024 * 1024):
                hasher.update(chunk)
                buffer.write(chunk)

        file_hash = hasher.hexdigest()
        file_size = temp_target_path.stat().st_size

        # Check if an identical video file is already stored in UPLOADS_DIR
        existing_match = None
        for existing_file in settings.UPLOADS_DIR.iterdir():
            if existing_file == temp_target_path or not existing_file.is_file() or existing_file.name.endswith(".meta.json"):
                continue
            if existing_file.suffix.lower() in settings.ALLOWED_EXTENSIONS:
                try:
                    if existing_file.stat().st_size == file_size:
                        meta_file = settings.UPLOADS_DIR / f"{existing_file.stem}.meta.json"
                        existing_hash = None
                        if meta_file.exists():
                            try:
                                with open(meta_file, "r", encoding="utf-8") as mf:
                                    existing_hash = json.load(mf).get("sha256")
                            except Exception:
                                pass
                        if not existing_hash:
                            with open(existing_file, "rb") as ef:
                                existing_hash = hashlib.sha256(ef.read()).hexdigest()
                        if existing_hash == file_hash:
                            existing_match = existing_file
                            break
                except Exception:
                    continue

        if existing_match:
            # Identical video already stored: remove redundant duplicate and reuse existing ID
            temp_target_path.unlink(missing_ok=True)
            existing_id = existing_match.stem
            logger.info(
                f"Upload deduplicated: '{file.filename}' matches existing stored upload (ID: {existing_id}). "
                f"Reusing existing storage to prevent duplication."
            )
            analysis_service.register_video(existing_id, existing_match)
            return extract_video_metadata(
                video_path=existing_match,
                video_id=existing_id,
                original_filename=file.filename
            )

        video_id = temp_id
        target_path = temp_target_path

        metadata = extract_video_metadata(
            video_path=target_path,
            video_id=video_id,
            original_filename=file.filename
        )

        analysis_service.register_video(video_id, target_path)

        meta_file = settings.UPLOADS_DIR / f"{video_id}.meta.json"
        try:
            with open(meta_file, "w", encoding="utf-8") as mf:
                json.dump({
                    "videoId": video_id,
                    "originalFilename": file.filename,
                    "uploadTime": time.time(),
                    "size": file_size,
                    "sha256": file_hash
                }, mf)
        except Exception as err:
            logger.warning(f"Could not persist upload metadata JSON: {err}")

        logger.info(
            f"Successfully stored video '{file.filename}' | Upload ID: {video_id} | "
            f"Resolution: {metadata.width}x{metadata.height}, Duration: {metadata.duration}s, FPS: {metadata.fps}"
        )
        return metadata

    except ValueError as ve:
        if temp_target_path.exists():
            temp_target_path.unlink(missing_ok=True)
        logger.error(f"Video validation failed for {file.filename}: {str(ve)}")
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(ve)
        )
    except Exception as e:
        if target_path.exists():
            target_path.unlink(missing_ok=True)
        logger.error(f"Unexpected upload failure: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An internal server error occurred while processing the uploaded video."
        )

@router.get("/samples", response_model=List[SampleVideoItem])
async def list_sample_videos():
    """
    Lists all available benchmark sample videos dynamically discovered from backend/samples/
    with ground truth OpenCV metadata, stable IDs, and direct stream URLs.
    """
    return sample_service.discover_samples()

@router.get("/uploads", response_model=List[SampleVideoItem])
async def list_uploaded_videos():
    """
    Lists all uploaded videos dynamically discovered from backend/uploads/
    with ground truth OpenCV metadata, persistent IDs, and direct stream URLs.
    """
    return sample_service.discover_uploads()

@router.get("/{video_id}/metadata", response_model=VideoMetadata)
async def get_video_metadata(video_id: str):
    """
    Returns probed video metadata for any uploaded or registered sample video.
    """
    video_path = analysis_service.get_video_path(video_id)
    if not video_path or not video_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Video with ID '{video_id}' was not found."
        )
    return extract_video_metadata(video_path, video_id, video_path.name)

@router.get("/{video_id}/stream")
async def stream_video(video_id: str, request: Request):
    """
    Streams video file directly to client with HTTP 206 Partial Content (Range header support)
    for seamless browser playback and timeline seeking.
    """
    video_path = analysis_service.get_video_path(video_id)
    if not video_path or not video_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Video with ID '{video_id}' was not found."
        )

    return range_stream_response(video_path, request)
