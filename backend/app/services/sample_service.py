import os
import re
import json
import hashlib
import logging
from pathlib import Path
from typing import List, Optional, Set

from app.config import settings
from app.detection.schemas import SampleVideoItem
from app.video.metadata import extract_video_metadata

logger = logging.getLogger("securecam.sample_service")

SUPPORTED_EXTENSIONS: Set[str] = {".mp4", ".avi", ".mkv", ".webm", ".mov"}


def is_supported_video_file(file_path: Path) -> bool:
    """Returns True if the file has a supported video extension."""
    return file_path.suffix.lower() in SUPPORTED_EXTENSIONS


def is_safe_path(base_dir: Path, target_path: Path) -> bool:
    """Validates that target_path resolves strictly within base_dir to prevent path traversal."""
    try:
        resolved_base = base_dir.resolve()
        resolved_target = target_path.resolve()
        return resolved_target.is_relative_to(resolved_base)
    except Exception:
        return False


def generate_display_name(filename: str) -> str:
    """
    Generates a clean human-readable display name from a video filename.
    Example: 'Testing_1.mp4' -> 'Testing 1'
             'perimeter_west_gate.mp4' -> 'Perimeter West Gate'
    """
    stem = Path(filename).stem
    name = re.sub(r'[_]+', ' ', stem)
    name = re.sub(r'[-]+', ' ', name)
    name = re.sub(r'\s+', ' ', name).strip()
    if name.islower():
        name = name.title()
    return name if name else stem


def generate_stable_sample_id(file_path: Path, base_dir: Path) -> str:
    """
    Generates a stable, deterministic sample ID based on the filename/relative path.
    Example: 'Testing_1.mp4' -> 'sample_testing_1'
    Retains the exact same ID between application restarts.
    """
    try:
        rel_path = file_path.relative_to(base_dir).as_posix()
    except ValueError:
        rel_path = file_path.name

    stem = Path(rel_path).stem
    slug = re.sub(r'[^a-zA-Z0-9]+', '_', stem).strip('_').lower()
    if not slug:
        slug = hashlib.sha256(rel_path.lower().encode('utf-8')).hexdigest()[:8]
    return f"sample_{slug}"


class SampleVideoService:
    """
    Single source of truth service for discovering, validating, and resolving
    built-in sample surveillance videos from `backend/samples/`.
    """

    def __init__(self, samples_dir: Optional[Path] = None):
        self._samples_dir = samples_dir or settings.SAMPLES_DIR
        self._meta_cache: Dict[str, Any] = {}

    @property
    def samples_dir(self) -> Path:
        return self._samples_dir

    def discover_samples(self) -> List[SampleVideoItem]:
        """
        Dynamically scans the sample directory, probes ground-truth OpenCV metadata,
        and returns all valid discovered video assets. Ignores missing or unreadable files.
        """
        if not self._samples_dir.exists():
            logger.warning(f"Samples directory '{self._samples_dir}' does not exist. Creating...")
            self._samples_dir.mkdir(parents=True, exist_ok=True)
            return []

        results: List[SampleVideoItem] = []

        try:
            entries = sorted(
                [p for p in self._samples_dir.iterdir() if p.is_file()],
                key=lambda p: p.name.lower()
            )
        except Exception as e:
            logger.error(f"Error reading samples directory {self._samples_dir}: {e}")
            return []

        for entry in entries:
            # 1. Check supported extensions
            if not is_supported_video_file(entry):
                logger.debug(f"Skipping unsupported file in samples: {entry.name}")
                continue

            # 2. Check path safety
            if not is_safe_path(self._samples_dir, entry):
                logger.warning(f"Skipping unsafe path in samples: {entry}")
                continue

            # 3. Check non-zero size
            try:
                size_bytes = entry.stat().st_size
                if size_bytes == 0:
                    logger.warning(f"Skipping empty video file: {entry.name}")
                    continue
            except Exception as e:
                logger.warning(f"Failed to stat video file {entry.name}: {e}")
                continue

            # 4. Generate stable ID and display name
            sample_id = generate_stable_sample_id(entry, self._samples_dir)
            display_name = generate_display_name(entry.name)

            # 5. Extract metadata via OpenCV (cached by mtime)
            mtime = entry.stat().st_mtime
            cache_key = f"{entry}_{mtime}"
            if cache_key in self._meta_cache:
                meta = self._meta_cache[cache_key]
            else:
                try:
                    meta = extract_video_metadata(entry, sample_id, entry.name)
                    self._meta_cache[cache_key] = meta
                except Exception as e:
                    logger.error(f"Failed to probe video metadata for '{entry.name}': {e}. Skipping sample.")
                    continue

            # 6. Verify valid spatial resolution & duration
            if meta.width <= 0 or meta.height <= 0 or meta.duration <= 0:
                logger.error(f"Invalid video parameters for '{entry.name}': {meta.width}x{meta.height}, duration {meta.duration}s. Skipping.")
                continue

            stream_url = f"/api/v1/video/{sample_id}/stream"
            format_ext = entry.suffix.lstrip(".").lower()

            item = SampleVideoItem(
                id=sample_id,
                filename=entry.name,
                displayName=display_name,
                sourceUrl=stream_url,
                streamUrl=stream_url,
                duration=meta.duration,
                durationFormatted=meta.durationFormatted,
                fps=meta.fps,
                width=meta.width,
                height=meta.height,
                resolution=f"{meta.width}x{meta.height}",
                fileSize=size_bytes,
                format=format_ext,
                codec=meta.codec,
                frameCount=meta.frameCount,
                videoId=sample_id,
                size=size_bytes
            )
            results.append(item)

        logger.info(f"Dynamically discovered {len(results)} sample video(s) in {self._samples_dir}")
        return results

    def discover_uploads(self) -> List[SampleVideoItem]:
        """
        Dynamically scans settings.UPLOADS_DIR, probes ground-truth OpenCV metadata,
        and returns all valid discovered uploaded video assets with persistent video IDs.
        """
        uploads_dir = settings.UPLOADS_DIR
        if not uploads_dir.exists():
            return []

        results: List[SampleVideoItem] = []
        try:
            entries = sorted(
                [p for p in uploads_dir.iterdir() if p.is_file() and not p.name.endswith(".meta.json")],
                key=lambda p: p.stat().st_mtime,
                reverse=True
            )
        except Exception as e:
            logger.error(f"Error reading uploads directory {uploads_dir}: {e}")
            return []

        # Local import to prevent circular dependency
        from app.services.analysis_service import analysis_service

        seen_ids: Set[str] = set()
        seen_hashes: Set[str] = set()

        for entry in entries:
            if not is_supported_video_file(entry):
                continue
            if not is_safe_path(uploads_dir, entry):
                continue
            try:
                size_bytes = entry.stat().st_size
                if size_bytes == 0:
                    continue
            except Exception:
                continue

            video_id = entry.stem
            if video_id in seen_ids:
                continue

            display_name = generate_display_name(entry.name)

            # Check for companion metadata json
            meta_json = uploads_dir / f"{entry.stem}.meta.json"
            file_hash = None
            if meta_json.exists():
                try:
                    with open(meta_json, "r", encoding="utf-8") as mf:
                        m_data = json.load(mf)
                        orig = m_data.get("originalFilename")
                        file_hash = m_data.get("sha256")
                        if orig:
                            display_name = orig
                except Exception:
                    pass

            if not file_hash:
                try:
                    with open(entry, "rb") as ef:
                        file_hash = hashlib.sha256(ef.read(1024 * 1024)).hexdigest()
                except Exception:
                    pass

            if file_hash:
                if file_hash in seen_hashes:
                    logger.debug(f"Skipping duplicate upload representation for hash {file_hash[:8]}: {entry.name}")
                    continue
                seen_hashes.add(file_hash)

            seen_ids.add(video_id)

            mtime = entry.stat().st_mtime
            cache_key = f"{entry}_{mtime}"
            if cache_key in self._meta_cache:
                meta = self._meta_cache[cache_key]
            else:
                try:
                    meta = extract_video_metadata(entry, video_id, display_name)
                    self._meta_cache[cache_key] = meta
                except Exception as e:
                    logger.error(f"Failed to probe metadata for uploaded video '{entry.name}': {e}. Skipping.")
                    continue

            if meta.width <= 0 or meta.height <= 0 or meta.duration <= 0:
                continue

            analysis_service.register_video(video_id, entry)

            stream_url = f"/api/v1/video/{video_id}/stream"
            format_ext = entry.suffix.lstrip(".").lower()

            item = SampleVideoItem(
                id=video_id,
                filename=entry.name,
                displayName=display_name,
                sourceUrl=stream_url,
                streamUrl=stream_url,
                duration=meta.duration,
                durationFormatted=meta.durationFormatted,
                fps=meta.fps,
                width=meta.width,
                height=meta.height,
                resolution=f"{meta.width}x{meta.height}",
                fileSize=size_bytes,
                format=format_ext,
                codec=meta.codec,
                frameCount=meta.frameCount,
                videoId=video_id,
                size=size_bytes
            )
            results.append(item)

        logger.info(f"Dynamically discovered {len(results)} uploaded video(s) in {uploads_dir}")
        return results

    def resolve_sample_path(self, identifier: str) -> Optional[Path]:
        """
        Safely resolves a sample video path from a sample ID, filename, or stem.
        Guarantees path traversal rejection (e.g. '../', absolute paths, unknown filenames).
        """
        if not identifier or not isinstance(identifier, str):
            return None

        clean_id = identifier.strip()

        # Reject path traversal tokens
        if ".." in clean_id or "/" in clean_id or "\\" in clean_id or "\0" in clean_id:
            logger.warning(f"Path traversal attempt rejected for identifier: '{clean_id}'")
            return None

        # Reject absolute paths (e.g. C:\ or /)
        if Path(clean_id).is_absolute() or ":" in clean_id:
            logger.warning(f"Absolute path rejected for sample lookup: '{clean_id}'")
            return None

        if not self._samples_dir.exists():
            return None

        # 1. Check exact filename match in SAMPLES_DIR
        candidate = self._samples_dir / clean_id
        if candidate.is_file() and is_supported_video_file(candidate) and is_safe_path(self._samples_dir, candidate):
            return candidate

        # 2. Check matching stable ID across all files
        for f in self._samples_dir.iterdir():
            if not f.is_file() or not is_supported_video_file(f):
                continue
            stable_id = generate_stable_sample_id(f, self._samples_dir)
            if stable_id == clean_id:
                if is_safe_path(self._samples_dir, f):
                    return f

        # 3. Check stem match (e.g. 'Testing_1' matching 'Testing_1.mp4')
        for ext in SUPPORTED_EXTENSIONS:
            candidate = self._samples_dir / f"{clean_id}{ext}"
            if candidate.is_file() and is_safe_path(self._samples_dir, candidate):
                return candidate

        # 4. Check if identifier has 'sample_' prefix stripped
        if clean_id.startswith("sample_"):
            stripped = clean_id[len("sample_"):]
            for ext in SUPPORTED_EXTENSIONS:
                candidate = self._samples_dir / f"{stripped}{ext}"
                if candidate.is_file() and is_safe_path(self._samples_dir, candidate):
                    return candidate

        return None


# Global singleton
sample_service = SampleVideoService()
