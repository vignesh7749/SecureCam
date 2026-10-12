import time
import logging
from typing import Dict, List, Optional, Tuple, Set, Any
from app.tracking.schemas import TrackedObject
from app.zones.schemas import (
    SecurityZone,
    ZoneDwellEpisode,
    ZoneViolationRecord,
    SecurityEventRecord,
    ZoneStatusSummary
)
from app.zones.geometry import is_object_in_zone

logger = logging.getLogger("securecam.dwell_engine")

def format_timestamp(ts_seconds: float) -> str:
    """Formats float timestamp into HH:MM:SS string."""
    return time.strftime('%H:%M:%S', time.gmtime(max(0.0, ts_seconds)))

class ZoneFrameResult:
    """Encapsulates all spatial zone evaluation outputs for a single frame."""
    def __init__(self):
        self.active_violations: List[ZoneViolationRecord] = []
        self.new_violations: List[ZoneViolationRecord] = []
        self.new_events: List[SecurityEventRecord] = []
        self.alarm_triggered: bool = False
        self.zone_summaries: Dict[str, ZoneStatusSummary] = {}
        self.latency_ms: float = 0.0

class ZoneDwellEngine:
    """
    Real Emergency Zone & Dwell-Time Intelligence Engine.
    Operates on real ByteTrack tracked objects, real timestamps,
    and robust point-in-polygon containment.
    """
    def __init__(
        self,
        grace_period_seconds: float = 1.5,
        alarm_cooldown_seconds: float = 3.0
    ):
        self.grace_period_seconds = grace_period_seconds
        self.alarm_cooldown_seconds = alarm_cooldown_seconds
        
        # Active episodes: (track_id, zone_id) -> ZoneDwellEpisode
        self.active_episodes: Dict[Tuple[int, str], ZoneDwellEpisode] = {}
        
        # Active violations: (track_id, zone_id) -> ZoneViolationRecord
        self.active_violations: Dict[Tuple[int, str], ZoneViolationRecord] = {}
        
        # Historical / finalized episodes for analytics
        self.finalized_episodes: List[ZoneDwellEpisode] = []
        
        # Alarm cooldown tracking
        self.last_alarm_timestamp: float = -999.0
        
        # Track class cache for exit messages: track_id -> class_name
        self.track_class_cache: Dict[int, str] = {}

    def reset(self):
        """Resets all runtime tracking state, dwell timers, active violations, and alarms."""
        self.active_episodes.clear()
        self.active_violations.clear()
        self.finalized_episodes.clear()
        self.track_class_cache.clear()
        self.last_alarm_timestamp = -999.0
        logger.info("Zone dwell engine reset complete.")

    def _is_monitored(self, track: TrackedObject, zone: SecurityZone) -> bool:
        """Determines if a tracked target matches the zone's monitored classes."""
        c_name = track.className.lower().strip()
        monitored_lower = [m.lower().strip() for m in zone.monitoredObjects]
        
        # Direct class match
        if c_name in monitored_lower:
            return True
            
        # Vehicle category mapping
        if c_name in ["car", "truck", "bus", "motorcycle"] and "vehicle" in monitored_lower:
            return True
            
        # Stage 4 Unknown Object integration
        if getattr(track, 'isUnknown', False) and "unknown" in monitored_lower:
            return True
            
        return False

    def process_frame(
        self,
        tracks: List[TrackedObject],
        zones: List[SecurityZone],
        timestamp: float,
        source_name: str = "Surveillance Stream"
    ) -> ZoneFrameResult:
        """
        Processes a single frame of tracked objects against active security zones.
        
        - Updates tracked objects with zone association and dwell time
        - Starts and updates dwell timers using source video timestamps
        - Fires one violation event per dwell episode
        - Manages track-loss grace period to handle temporary occlusion
        """
        t0 = time.time()
        result = ZoneFrameResult()
        
        enabled_zones = [z for z in zones if z.enabled]
        zone_map = {z.id: z for z in enabled_zones}
        
        # Track presence lookup on this frame: (track_id, zone_id) -> bool
        current_occupancies: Set[Tuple[int, str]] = set()
        active_track_ids_on_frame: Set[int] = set()
        
        # 1. Update track cache and evaluate spatial containment
        for track in tracks:
            active_track_ids_on_frame.add(track.trackId)
            self.track_class_cache[track.trackId] = "unknown" if getattr(track, 'isUnknown', False) else track.className
            
            # Reset zone attributes on track for this frame
            track.currentZoneId = None
            track.currentZoneName = None
            track.dwellTimeInZone = 0.0
            
            for zone in enabled_zones:
                if not self._is_monitored(track, zone):
                    continue
                    
                is_inside = is_object_in_zone(track.box, zone)
                if is_inside:
                    key = (track.trackId, zone.id)
                    current_occupancies.add(key)
                    
                    # Primary zone association for track display
                    if track.currentZoneId is None or zone.type.lower() == "emergency":
                        track.currentZoneId = zone.id
                        track.currentZoneName = zone.name

        # 2. Process Entries and Dwell Increments
        for key in current_occupancies:
            track_id, zone_id = key
            zone = zone_map[zone_id]
            track_class = self.track_class_cache.get(track_id, "object")
            
            if key not in self.active_episodes:
                # ENTRY EVENT (Section 10 & 29)
                episode = ZoneDwellEpisode(
                    trackId=track_id,
                    zoneId=zone_id,
                    entryTimestamp=timestamp,
                    lastSeenTimestamp=timestamp,
                    dwellTimeSeconds=0.0,
                    state="ENTERED"
                )
                self.active_episodes[key] = episode
                
                entry_event = SecurityEventRecord(
                    id=f"evt-entry-{zone_id}-{track_id}-{int(timestamp * 1000)}",
                    timestamp=format_timestamp(timestamp),
                    type="ZONE_ENTRY",
                    severity="INFO",
                    objectId=f"track_{track_id}",
                    trackingId=track_id,
                    objectClass=track_class,
                    zoneId=zone_id,
                    zoneName=zone.name,
                    dwellTime=0.0,
                    threshold=zone.stayThresholdSeconds,
                    description=f"{track_class.capitalize()} #{track_id} entered {zone.name}",
                    sourceCamera=source_name,
                    acknowledged=False
                )
                episode.eventId = entry_event.id
                result.new_events.append(entry_event)
                episode.state = "INSIDE"
            else:
                # EXISTING EPISODE: Advance dwell timer (Section 11)
                episode = self.active_episodes[key]
                episode.lastSeenTimestamp = timestamp
                dwell = max(0.0, timestamp - episode.entryTimestamp)
                episode.dwellTimeSeconds = round(dwell, 2)
                
                if dwell > 0.1 and not episode.violationTriggered:
                    episode.state = "DWELLING"
                    
                # CHECK DWELL THRESHOLD & VIOLATION CONDITION (Section 14 & 15)
                if dwell >= zone.stayThresholdSeconds and not episode.violationTriggered:
                    episode.violationTriggered = True
                    episode.violationTimestamp = timestamp
                    episode.state = "VIOLATION"
                    
                    viol_id = f"viol-{zone_id}-{track_id}-{int(timestamp * 1000)}"
                    viol_severity = zone.alertLevel.lower()
                    
                    violation_record = ZoneViolationRecord(
                        id=viol_id,
                        zoneId=zone_id,
                        zoneName=zone.name,
                        objectId=f"track_{track_id}",
                        trackingId=track_id,
                        objectClass=track_class,
                        enteredAt=format_timestamp(episode.entryTimestamp),
                        dwellTimeSeconds=round(dwell, 1),
                        thresholdSeconds=zone.stayThresholdSeconds,
                        severity=viol_severity,
                        status="ACTIVE",
                        timestamp=timestamp
                    )
                    self.active_violations[key] = violation_record
                    result.new_violations.append(violation_record)
                    
                    # Security Event for Violation
                    viol_event = SecurityEventRecord(
                        id=f"evt-viol-{zone_id}-{track_id}-{int(timestamp * 1000)}",
                        timestamp=format_timestamp(timestamp),
                        type="ZONE_VIOLATION",
                        severity="CRITICAL" if viol_severity in ["critical", "high"] else "WARNING",
                        objectId=f"track_{track_id}",
                        trackingId=track_id,
                        objectClass=track_class,
                        zoneId=zone_id,
                        zoneName=zone.name,
                        dwellTime=round(dwell, 1),
                        threshold=zone.stayThresholdSeconds,
                        description=(
                            f"{track_class.capitalize()} #{track_id} exceeded dwell threshold "
                            f"({zone.stayThresholdSeconds}s) in {zone.name} ({round(dwell, 1)}s stay)"
                        ),
                        sourceCamera=source_name,
                        acknowledged=False
                    )
                    result.new_events.append(viol_event)
                    
                    # Audible Alarm Trigger with Cooldown (Section 21 & 23)
                    if zone.alertActions.audibleAlarm:
                        if (timestamp - self.last_alarm_timestamp) >= self.alarm_cooldown_seconds:
                            result.alarm_triggered = True
                            self.last_alarm_timestamp = timestamp
                            logger.info(f"ALARM TRIGGERED: Track #{track_id} in {zone.name}!")
                elif episode.violationTriggered and key in self.active_violations:
                    # Keep dwell time updated on active violation record
                    self.active_violations[key].dwellTimeSeconds = round(dwell, 1)

        # 3. Synchronize dwell times onto TrackedObject models
        for track in tracks:
            if track.currentZoneId:
                key = (track.trackId, track.currentZoneId)
                if key in self.active_episodes:
                    ep = self.active_episodes[key]
                    track.dwellTimeInZone = ep.dwellTimeSeconds
                    if ep.state == "VIOLATION":
                        track.movementStatus = "loitering"

        # 4. Handle Exits, Track Loss Grace Period, and Occlusion (Section 16, 18, 19)
        keys_to_remove: List[Tuple[int, str]] = []
        
        for key, episode in self.active_episodes.items():
            track_id, zone_id = key
            
            # If still inside on this frame, skip exit logic
            if key in current_occupancies:
                continue
                
            zone = zone_map.get(zone_id)
            zone_name = zone.name if zone else f"Zone {zone_id}"
            track_class = self.track_class_cache.get(track_id, "object")
            
            # Check if track is still on frame (meaning it moved OUT of the zone polygon)
            if track_id in active_track_ids_on_frame:
                # Immediate exit: contact point left the zone boundary
                episode.exitTimestamp = timestamp
                episode.state = "EXITED"
                keys_to_remove.append(key)
                
                exit_event = SecurityEventRecord(
                    id=f"evt-exit-{zone_id}-{track_id}-{int(timestamp * 1000)}",
                    timestamp=format_timestamp(timestamp),
                    type="ZONE_EXIT",
                    severity="INFO",
                    objectId=f"track_{track_id}",
                    trackingId=track_id,
                    objectClass=track_class,
                    zoneId=zone_id,
                    zoneName=zone_name,
                    dwellTime=round(episode.dwellTimeSeconds, 1),
                    threshold=zone.stayThresholdSeconds if zone else 10.0,
                    description=f"{track_class.capitalize()} #{track_id} exited {zone_name} (dwell: {round(episode.dwellTimeSeconds, 1)}s)",
                    sourceCamera=source_name,
                    acknowledged=False
                )
                result.new_events.append(exit_event)
            else:
                # Track disappeared from frame: apply track loss grace period (Section 18)
                time_since_last_seen = timestamp - episode.lastSeenTimestamp
                if time_since_last_seen > self.grace_period_seconds:
                    # Grace period expired: declare exit
                    episode.exitTimestamp = episode.lastSeenTimestamp
                    episode.state = "EXITED"
                    keys_to_remove.append(key)
                    
                    exit_event = SecurityEventRecord(
                        id=f"evt-exit-{zone_id}-{track_id}-{int(timestamp * 1000)}",
                        timestamp=format_timestamp(episode.lastSeenTimestamp),
                        type="ZONE_EXIT",
                        severity="INFO",
                        objectId=f"track_{track_id}",
                        trackingId=track_id,
                        objectClass=track_class,
                        zoneId=zone_id,
                        zoneName=zone_name,
                        dwellTime=round(episode.dwellTimeSeconds, 1),
                        threshold=zone.stayThresholdSeconds if zone else 10.0,
                        description=f"{track_class.capitalize()} #{track_id} track terminated; exited {zone_name}",
                        sourceCamera=source_name,
                        acknowledged=False
                    )
                    result.new_events.append(exit_event)

        # Finalize removed episodes
        for key in keys_to_remove:
            ep = self.active_episodes.pop(key, None)
            if ep:
                self.finalized_episodes.append(ep)
            if key in self.active_violations:
                self.active_violations[key].status = "RESOLVED"
                del self.active_violations[key]

        # 5. Populate Active Violations and Zone Status Summaries (Section 37 & 38)
        result.active_violations = list(self.active_violations.values())
        
        for zone in zones:
            if not zone.enabled:
                result.zone_summaries[zone.id] = ZoneStatusSummary(
                    zoneId=zone.id,
                    name=zone.name,
                    status="DISABLED",
                    occupantCount=0,
                    maxDwellSeconds=0.0,
                    occupantTrackIds=[]
                )
                continue
                
            occupants: List[int] = []
            max_dwell = 0.0
            has_violation = False
            has_dwelling = False
            
            for (tid, zid), ep in self.active_episodes.items():
                if zid == zone.id:
                    occupants.append(tid)
                    if ep.dwellTimeSeconds > max_dwell:
                        max_dwell = ep.dwellTimeSeconds
                    if ep.state == "VIOLATION":
                        has_violation = True
                    elif ep.dwellTimeSeconds > 0.5:
                        has_dwelling = True
                        
            if has_violation:
                z_status = "VIOLATION"
            elif has_dwelling:
                z_status = "DWELLING"
            elif occupants:
                z_status = "OCCUPIED"
            else:
                z_status = "SAFE"
                
            result.zone_summaries[zone.id] = ZoneStatusSummary(
                zoneId=zone.id,
                name=zone.name,
                status=z_status,
                occupantCount=len(occupants),
                maxDwellSeconds=round(max_dwell, 1),
                occupantTrackIds=occupants
            )

        result.latency_ms = round((time.time() - t0) * 1000, 2)
        return result

    def finalize_all(self, timestamp: float, source_name: str = "Surveillance Stream") -> List[SecurityEventRecord]:
        """
        Finalizes all active episodes at video completion or analysis stop.
        Prevents phantom dwelling, violations, or alarms after video ends (Section 43).
        """
        exit_events: List[SecurityEventRecord] = []
        for key, episode in list(self.active_episodes.items()):
            track_id, zone_id = key
            track_class = self.track_class_cache.get(track_id, "object")
            episode.exitTimestamp = timestamp
            episode.state = "EXITED"
            self.finalized_episodes.append(episode)
            
            ev = SecurityEventRecord(
                id=f"evt-exit-{zone_id}-{track_id}-{int(timestamp * 1000)}",
                timestamp=format_timestamp(timestamp),
                type="ZONE_EXIT",
                severity="INFO",
                objectId=f"track_{track_id}",
                trackingId=track_id,
                objectClass=track_class,
                zoneId=zone_id,
                zoneName=f"Zone {zone_id}",
                dwellTime=round(episode.dwellTimeSeconds, 1),
                threshold=10.0,
                description=f"{track_class.capitalize()} #{track_id} stream ended; finalized zone stay",
                sourceCamera=source_name,
                acknowledged=True
            )
            exit_events.append(ev)
            
        self.active_episodes.clear()
        self.active_violations.clear()
        return exit_events
