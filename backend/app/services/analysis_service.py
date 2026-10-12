import asyncio
import uuid
import time
import json
import logging
from typing import Dict, List, Optional, Set
from pathlib import Path
from fastapi import WebSocket

from app.config import settings
from app.detection.schemas import (
    AnalysisProgressResponse, 
    FrameDetections, 
    Detection
)
from app.detection.detector import ObjectDetector
from app.tracking.schemas import FrameTracks, TrackedObject
from app.tracking.tracker import ByteTrackManager
from app.video.processor import VideoStreamProcessor
from app.video.metadata import extract_video_metadata
from app.novelty.schemas import UnknownObject
from app.novelty.novelty_engine import NoveltyEngine
from app.zones.dwell_engine import ZoneDwellEngine
from app.zones.zone_manager import zone_manager
from app.services.sample_service import sample_service

logger = logging.getLogger("securecam.analysis_service")

class AnalysisSession:
    def __init__(
        self, 
        analysis_id: str, 
        video_id: str, 
        video_path: Path,
        profile: str = "BALANCED",
        conf_threshold: Optional[float] = None,
        imgsz: Optional[int] = None
    ):
        self.analysis_id = analysis_id
        self.video_id = video_id
        self.video_path = video_path
        self.profile = profile
        self.conf_threshold = conf_threshold
        self.imgsz = imgsz
        self.status = "queued"  # queued, processing, completed, failed, cancelled
        self.progress = 0.0
        self.current_frame = 0
        self.total_frames = 0
        self.fps = 0.0
        self.processed_frames = 0
        self.detections_count = 0
        self.unique_tracks_count = 0
        self.active_tracks_count = 0
        self.duration_seconds = 0.0
        self.error: Optional[str] = None
        self.is_cancelled = False
        
        # Results stores
        self.frame_results: Dict[int, FrameDetections] = {}
        self.track_results: Dict[int, FrameTracks] = {}
        self.unknown_objects: Dict[str, UnknownObject] = {}
        
        # Active connected WebSockets
        self.active_websockets: Set[WebSocket] = set()
        
    def to_progress_response(self) -> AnalysisProgressResponse:
        return AnalysisProgressResponse(
            analysisId=self.analysis_id,
            videoId=self.video_id,
            status=self.status,
            progress=self.progress,
            currentFrame=self.current_frame,
            totalFrames=self.total_frames,
            fps=self.fps,
            processedFrames=self.processed_frames,
            detectionsCount=self.detections_count,
            durationSeconds=self.duration_seconds,
            error=self.error
        )

class AnalysisService:
    """
    Manages video analysis lifecycles, background worker threads,
    in-memory frame results, and WebSocket subscriber broadcasting.
    """
    def __init__(self):
        self.sessions: Dict[str, AnalysisSession] = {}
        self.video_registry: Dict[str, Path] = {}
        self.video_latest_session: Dict[str, str] = {}

    def register_video(self, video_id: str, file_path: Path):
        self.video_registry[video_id] = file_path

    def get_video_path(self, video_id: str) -> Optional[Path]:
        if not video_id:
            return None

        # 1. Check in-memory registered path (e.g. uploaded video by UUID)
        path = self.video_registry.get(video_id)
        if path and path.exists():
            return path

        # 2. Dynamic sample resolution from SAMPLES_DIR via sample_service
        sample_path = sample_service.resolve_sample_path(video_id)
        if sample_path and sample_path.exists():
            self.register_video(video_id, sample_path)
            return sample_path

        # 3. Direct safe check in UPLOADS_DIR for user-uploaded videos
        if not (".." in video_id or "/" in video_id or "\\" in video_id):
            upload_candidate = settings.UPLOADS_DIR / video_id
            if upload_candidate.is_file() and upload_candidate.exists():
                try:
                    if upload_candidate.resolve().is_relative_to(settings.UPLOADS_DIR.resolve()):
                        self.register_video(video_id, upload_candidate)
                        return upload_candidate
                except Exception:
                    pass

            for ext in settings.ALLOWED_EXTENSIONS:
                upload_candidate_ext = settings.UPLOADS_DIR / f"{video_id}{ext}"
                if upload_candidate_ext.is_file() and upload_candidate_ext.exists():
                    try:
                        if upload_candidate_ext.resolve().is_relative_to(settings.UPLOADS_DIR.resolve()):
                            self.register_video(video_id, upload_candidate_ext)
                            return upload_candidate_ext
                    except Exception:
                        pass

        return None

    def create_session(
        self, 
        video_id: str,
        profile: Optional[str] = "BALANCED",
        conf_threshold: Optional[float] = None,
        imgsz: Optional[int] = None
    ) -> AnalysisSession:
        video_path = self.get_video_path(video_id)
        if not video_path or not video_path.exists():
            raise FileNotFoundError(f"Registered video '{video_id}' not found on disk.")

        analysis_id = str(uuid.uuid4())
        prof = (profile or "BALANCED").upper()
        p_cfg = settings.PROFILE_CONFIGS.get(prof, settings.PROFILE_CONFIGS["BALANCED"])
        final_conf = conf_threshold if conf_threshold is not None else p_cfg["conf"]
        final_imgsz = imgsz if imgsz is not None else p_cfg["imgsz"]

        session = AnalysisSession(
            analysis_id=analysis_id,
            video_id=video_id,
            video_path=video_path,
            profile=prof,
            conf_threshold=final_conf,
            imgsz=final_imgsz
        )
        self.sessions[analysis_id] = session
        self.video_latest_session[video_id] = analysis_id
        return session

    def _save_session_to_disk(self, session: AnalysisSession):
        """Persists completed analysis session and frame tracks to disk for instant subsequent restoration."""
        try:
            settings.OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)
            cache_file = settings.OUTPUTS_DIR / f"{session.video_id}_session.json"
            
            tracks_list = [
                session.track_results[idx].model_dump() 
                for idx in sorted(session.track_results.keys())
            ]
            unknowns_list = [
                u.model_dump() for u in session.unknown_objects.values()
            ]
            
            data = {
                "summary": {
                    "analysisId": session.analysis_id,
                    "videoId": session.video_id,
                    "status": session.status,
                    "progress": session.progress,
                    "totalFrames": session.total_frames,
                    "processedFrames": session.processed_frames,
                    "detectionsCount": session.detections_count,
                    "uniqueTracksCount": session.unique_tracks_count,
                    "durationSeconds": session.duration_seconds,
                    "fps": session.fps,
                    "error": session.error
                },
                "tracks": tracks_list,
                "unknowns": unknowns_list
            }
            with open(cache_file, "w", encoding="utf-8") as f:
                json.dump(data, f)
            logger.info(f"Persisted analysis session {session.analysis_id} to disk: {cache_file}")
        except Exception as e:
            logger.warning(f"Could not persist analysis session to disk: {e}")

    def _load_cached_session_from_disk(self, video_id: str) -> Optional[AnalysisSession]:
        """Loads a precomputed analysis session from disk if available."""
        try:
            cache_file = settings.OUTPUTS_DIR / f"{video_id}_session.json"
            if not cache_file.exists():
                return None

            video_path = self.get_video_path(video_id)
            if not video_path:
                return None

            with open(cache_file, "r", encoding="utf-8") as f:
                data = json.load(f)

            summary = data.get("summary", {})
            tracks_data = data.get("tracks", [])
            unknowns_data = data.get("unknowns", [])

            session = AnalysisSession(
                analysis_id=summary.get("analysisId", str(uuid.uuid4())),
                video_id=video_id,
                video_path=video_path,
                profile="BALANCED"
            )
            session.status = summary.get("status", "completed")
            session.progress = summary.get("progress", 100.0)
            session.total_frames = summary.get("totalFrames", len(tracks_data))
            session.processed_frames = summary.get("processedFrames", len(tracks_data))
            session.detections_count = summary.get("detectionsCount", 0)
            session.unique_tracks_count = summary.get("uniqueTracksCount", 0)
            session.duration_seconds = summary.get("durationSeconds", 0.0)
            session.fps = summary.get("fps", 29.97)

            for t_item in tracks_data:
                ft = FrameTracks.model_validate(t_item)
                session.track_results[ft.frameIndex] = ft
                session.frame_results[ft.frameIndex] = FrameDetections(
                    frameIndex=ft.frameIndex,
                    timestamp=ft.timestamp,
                    detections=[
                        Detection(
                            id=t.id,
                            classId=t.classId,
                            className=t.className,
                            confidence=t.confidence,
                            box=t.box,
                            timestamp=ft.timestamp,
                            frameIndex=ft.frameIndex
                        )
                        for t in ft.tracks
                    ],
                    fps=ft.pipelineFps,
                    inferenceLatencyMs=ft.totalLatencyMs
                )

            for u_item in unknowns_data:
                u_obj = UnknownObject.model_validate(u_item)
                session.unknown_objects[u_obj.id] = u_obj

            self.sessions[session.analysis_id] = session
            self.video_latest_session[video_id] = session.analysis_id
            logger.info(f"Loaded cached analysis session from disk for {video_id}: {session.analysis_id} ({len(session.track_results)} frames)")
            return session
        except Exception as e:
            logger.warning(f"Error loading cached analysis session for {video_id}: {e}")
            return None

    def get_session(self, analysis_id: str) -> Optional[AnalysisSession]:
        if analysis_id in self.sessions:
            return self.sessions[analysis_id]
        if settings.OUTPUTS_DIR.exists():
            for p in settings.OUTPUTS_DIR.glob("*_session.json"):
                vid = p.name.replace("_session.json", "")
                sess = self._load_cached_session_from_disk(vid)
                if sess and sess.analysis_id == analysis_id:
                    return sess
        return None

    def get_latest_session_for_video(self, video_id: str) -> Optional[AnalysisSession]:
        aid = self.video_latest_session.get(video_id)
        if aid and aid in self.sessions:
            return self.sessions[aid]
        for s in reversed(list(self.sessions.values())):
            if s.video_id == video_id:
                return s
        return self._load_cached_session_from_disk(video_id)

    def cancel_session(self, analysis_id: str) -> bool:
        session = self.get_session(analysis_id)
        if session and session.status in ["queued", "processing"]:
            session.is_cancelled = True
            session.status = "cancelled"
            logger.info(f"Analysis session {analysis_id} marked as cancelled.")
            return True
        return False

    async def broadcast(self, session: AnalysisSession, message: dict):
        """Dispatches event to all connected WebSockets for this session."""
        if not session.active_websockets:
            return

        dead_sockets = set()
        for ws in list(session.active_websockets):
            try:
                await ws.send_json(message)
            except Exception:
                dead_sockets.add(ws)

        for ws in dead_sockets:
            session.active_websockets.discard(ws)

    def run_analysis_sync(self, analysis_id: str, loop: asyncio.AbstractEventLoop):
        """Worker function running in background executor."""
        session = self.get_session(analysis_id)
        if not session:
            return

        session.status = "processing"
        t_start = time.time()
        logger.info(f"Starting background video analysis: {analysis_id} (Video: {session.video_id})")

        try:
            meta = extract_video_metadata(session.video_path, session.video_id, session.video_path.name)
            session.total_frames = meta.frameCount
            session.duration_seconds = meta.duration

            prof_name = (session.profile or "BALANCED").upper()
            prof_cfg = settings.PROFILE_CONFIGS.get(prof_name, settings.PROFILE_CONFIGS.get("BALANCED", {"imgsz": 640, "conf": 0.35, "iou": 0.45}))
            eff_imgsz = session.imgsz or prof_cfg.get("imgsz", 640)
            eff_conf = session.conf_threshold if session.conf_threshold is not None else prof_cfg.get("conf", 0.35)
            eff_iou = prof_cfg.get("iou", 0.45)

            logger.info(
                f"[DIAGNOSTIC] ANALYSIS START: id={analysis_id}, video={session.video_id}, file={session.video_path.name}, "
                f"res={meta.width}x{meta.height}, fps={meta.fps}, frames={meta.frameCount}, profile={prof_name}, conf={eff_conf}"
            )

            detector_mgr = ObjectDetector(
                confidence_threshold=eff_conf,
                iou_threshold=eff_iou,
                img_size=eff_imgsz
            )
            tracker_mgr = ByteTrackManager()
            novelty_mgr = NoveltyEngine() if settings.NOVELTY_ENABLED else None
            zone_mgr = ZoneDwellEngine()
            processor = VideoStreamProcessor(
                session.video_path,
                detector=detector_mgr,
                tracker=tracker_mgr,
                novelty_engine=novelty_mgr,
                zone_engine=zone_mgr,
                process_every_n_frames=1
            )

            def on_tracks(result: FrameTracks):
                session.current_frame = result.frameIndex
                session.fps = result.pipelineFps
                session.processed_frames += 1
                session.active_tracks_count = len(result.tracks)
                session.unique_tracks_count = tracker_mgr.get_total_tracks_count()
                session.detections_count = session.unique_tracks_count
                session.track_results[result.frameIndex] = result
                session.frame_results[result.frameIndex] = FrameDetections(
                    frameIndex=result.frameIndex,
                    timestamp=result.timestamp,
                    detections=[
                        Detection(
                            id=t.id,
                            classId=t.classId,
                            className=t.className,
                            confidence=t.confidence,
                            box=t.box,
                            timestamp=result.timestamp,
                            frameIndex=result.frameIndex
                        )
                        for t in result.tracks
                    ],
                    fps=result.pipelineFps,
                    inferenceLatencyMs=result.totalLatencyMs
                )

                for u in result.unknownObjects:
                    session.unknown_objects[u.id] = u

                # Dispatch tracks, novelty, and zone events over WebSocket
                if session.active_websockets:
                    unknowns_serialized = [
                        u.model_dump() if hasattr(u, "model_dump") else u
                        for u in result.unknownObjects
                    ]
                    payload = {
                        "type": "tracks",
                        "frame": result.frameIndex,
                        "timestamp": result.timestamp,
                        "videoFps": result.videoFps,
                        "detectionLatencyMs": result.detectionLatencyMs,
                        "trackingLatencyMs": result.trackingLatencyMs,
                        "embeddingLatencyMs": result.embeddingLatencyMs,
                        "noveltyLatencyMs": result.noveltyLatencyMs,
                        "zoneLatencyMs": result.zoneLatencyMs,
                        "totalLatencyMs": result.totalLatencyMs,
                        "pipelineFps": result.pipelineFps,
                        "tracks": [t.model_dump() for t in result.tracks],
                        "unknownObjects": unknowns_serialized,
                        "activeViolations": result.activeViolations,
                        "zoneEvents": result.zoneEvents,
                        "alarmTriggered": result.alarmTriggered,
                        "activeTracksCount": len(result.tracks),
                        "totalTracksCount": session.unique_tracks_count,
                        "rawDetectionsCount": result.rawDetectionsCount,
                    }
                    asyncio.run_coroutine_threadsafe(self.broadcast(session, payload), loop)

                    # Dispatch discrete zone events for responsive frontend handling
                    for ev in result.zoneEvents:
                        ev_type = str(ev.get("type", "")).lower()
                        discrete_payload = {
                            "type": ev_type,
                            "event": ev,
                            "timestamp": result.timestamp,
                            "frame": result.frameIndex
                        }
                        asyncio.run_coroutine_threadsafe(self.broadcast(session, discrete_payload), loop)

                    # Dispatch dedicated alarm event if triggered
                    if result.alarmTriggered:
                        alarm_payload = {
                            "type": "alarm",
                            "timestamp": result.timestamp,
                            "frame": result.frameIndex,
                            "activeViolations": result.activeViolations
                        }
                        asyncio.run_coroutine_threadsafe(self.broadcast(session, alarm_payload), loop)

                    # Also send backwards-compatible 'detections' event
                    legacy_payload = {
                        "type": "detections",
                        "frame": result.frameIndex,
                        "timestamp": result.timestamp,
                        "fps": result.pipelineFps,
                        "latencyMs": result.totalLatencyMs,
                        "detections": [
                            {
                                "id": t.id,
                                "classId": t.classId,
                                "className": t.className,
                                "confidence": t.confidence,
                                "box": t.box.model_dump(),
                                "timestamp": result.timestamp,
                                "frameIndex": result.frameIndex
                            }
                            for t in result.tracks
                        ]
                    }
                    asyncio.run_coroutine_threadsafe(self.broadcast(session, legacy_payload), loop)

            def on_progress(frame_idx: int, total: int, progress_pct: float, current_fps: float):
                session.progress = progress_pct
                session.fps = current_fps

                if frame_idx % 50 == 0 or frame_idx >= total - 1:
                    logger.info(
                        f"[DIAGNOSTIC] PROGRESS: id={analysis_id}, frame={frame_idx}/{total} ({progress_pct:.1f}%), "
                        f"fps={current_fps}, active={session.active_tracks_count}, unique={session.unique_tracks_count}"
                    )

                if session.active_websockets:
                    payload = {
                        "type": "progress",
                        "progress": progress_pct,
                        "frame": frame_idx,
                        "totalFrames": total,
                        "fps": current_fps,
                        "detectionsCount": session.active_tracks_count,
                        "tracksCount": session.unique_tracks_count,
                        "totalTracksCount": session.unique_tracks_count,
                        "activeTracksCount": session.active_tracks_count
                    }
                    asyncio.run_coroutine_threadsafe(self.broadcast(session, payload), loop)

            def stop_check() -> bool:
                return session.is_cancelled

            processor.process(
                on_tracks_callback=on_tracks,
                on_progress_callback=on_progress,
                stop_check=stop_check
            )

            if not session.is_cancelled:
                session.status = "completed"
                session.progress = 100.0
                session.unique_tracks_count = tracker_mgr.get_total_tracks_count()
                session.detections_count = session.unique_tracks_count
                self._save_session_to_disk(session)
                elapsed = round(time.time() - t_start, 2)
                logger.info(
                    f"[DIAGNOSTIC] ANALYSIS COMPLETE: id={analysis_id}, elapsed={elapsed}s, "
                    f"avg_fps={round(session.processed_frames / max(0.001, elapsed), 1)}, frames={session.processed_frames}/{session.total_frames}, "
                    f"unique_tracks={session.unique_tracks_count}, unknowns={len(session.unknown_objects)}"
                )
                
                completion_event = {
                    "type": "completed",
                    "status": "completed",
                    "progress": 100.0,
                    "totalFrames": session.total_frames,
                    "processedFrames": session.processed_frames,
                    "totalDetections": session.unique_tracks_count,
                    "totalTracks": session.unique_tracks_count,
                    "uniqueTracksCount": session.unique_tracks_count,
                    "fps": session.fps
                }
                asyncio.run_coroutine_threadsafe(self.broadcast(session, completion_event), loop)

        except Exception as e:
            error_msg = f"Video analysis failed: {str(e)}"
            logger.error(error_msg, exc_info=True)
            session.status = "failed"
            session.error = error_msg
            
            error_event = {
                "type": "error",
                "status": "failed",
                "message": error_msg
            }
            asyncio.run_coroutine_threadsafe(self.broadcast(session, error_event), loop)

    def start_background_analysis(self, analysis_id: str):
        """Schedules processing in the event loop's background thread pool."""
        loop = asyncio.get_event_loop()
        loop.run_in_executor(None, self.run_analysis_sync, analysis_id, loop)

    def get_session_unknowns(self, analysis_id: str) -> List[UnknownObject]:
        session = self.get_session(analysis_id)
        if not session:
            return []
        return list(session.unknown_objects.values())

    def update_unknown_status(
        self,
        unknown_id: str,
        new_status: str,
        notes: Optional[str] = None,
        analysis_id: Optional[str] = None
    ) -> Optional[UnknownObject]:
        target_sessions = [self.sessions[analysis_id]] if analysis_id and analysis_id in self.sessions else list(self.sessions.values())
        for sess in target_sessions:
            if unknown_id in sess.unknown_objects:
                obj = sess.unknown_objects[unknown_id]
                obj.investigationStatus = new_status
                if notes is not None:
                    obj.notes = notes
                return obj
        return None

analysis_service = AnalysisService()
