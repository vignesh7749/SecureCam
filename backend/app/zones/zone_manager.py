import json
import time
import logging
import threading
from pathlib import Path
from typing import Dict, List, Optional
from app.zones.schemas import (
    SecurityZone,
    ZonePoint,
    ZoneAlertActions,
    ZoneCreateRequest,
    ZoneUpdateRequest,
    ZoneViolationRecord,
    SecurityEventRecord
)
from app.zones.geometry import validate_zone_geometry

logger = logging.getLogger("securecam.zone_manager")

DEFAULT_ZONES_DATA = [
    {
        "id": "zone-01",
        "name": "Emergency Zone 01 (Substation)",
        "type": "emergency",
        "shape": "rectangle",
        "points": [
            {"x": 18.0, "y": 32.0},
            {"x": 52.0, "y": 32.0},
            {"x": 52.0, "y": 78.0},
            {"x": 18.0, "y": 78.0}
        ],
        "alertLevel": "critical",
        "stayThresholdSeconds": 10.0,
        "monitoredObjects": ["person", "vehicle", "unknown"],
        "alertActions": {
            "visualAlert": True,
            "audibleAlarm": True,
            "eventLog": True,
            "webhookNotification": True
        },
        "enabled": True,
        "color": "#EF4444",
        "createdAt": "2026-10-01 08:30:00",
        "description": "High voltage transformer perimeter. Zero loitering tolerance."
    },
    {
        "id": "zone-02",
        "name": "Loading Bay Caution Buffer",
        "type": "caution",
        "shape": "polygon",
        "points": [
            {"x": 62.0, "y": 22.0},
            {"x": 92.0, "y": 26.0},
            {"x": 88.0, "y": 84.0},
            {"x": 58.0, "y": 72.0}
        ],
        "alertLevel": "medium",
        "stayThresholdSeconds": 30.0,
        "monitoredObjects": ["person", "vehicle", "bicycle"],
        "alertActions": {
            "visualAlert": True,
            "audibleAlarm": False,
            "eventLog": True,
            "webhookNotification": False
        },
        "enabled": True,
        "color": "#F59E0B",
        "createdAt": "2026-10-01 09:15:00",
        "description": "Heavy machinery turnaround zone. Forklift and truck clearance."
    },
    {
        "id": "zone-03",
        "name": "North Gate Turnstile Corridor",
        "type": "restricted",
        "shape": "rectangle",
        "points": [
            {"x": 5.0, "y": 10.0},
            {"x": 30.0, "y": 10.0},
            {"x": 30.0, "y": 40.0},
            {"x": 5.0, "y": 40.0}
        ],
        "alertLevel": "high",
        "stayThresholdSeconds": 5.0,
        "monitoredObjects": ["person", "unknown"],
        "alertActions": {
            "visualAlert": True,
            "audibleAlarm": True,
            "eventLog": True,
            "webhookNotification": False
        },
        "enabled": True,
        "color": "#3B82F6",
        "createdAt": "2026-10-01 10:00:00",
        "description": "Turnstile queuing corridor. Enforces entry flow speed."
    }
]

class ZoneManager:
    """
    Thread-safe manager for Security Zones, Violations, and Security Events.
    Maintains persistent storage on disk and provides atomic CRUD operations.
    """
    def __init__(self, storage_path: Optional[Path] = None):
        self.lock = threading.RLock()
        self.storage_path = storage_path or (Path(__file__).parent / "zones_store.json")
        self.zones: Dict[str, SecurityZone] = {}
        self.violations: Dict[str, ZoneViolationRecord] = {}
        self.events: List[SecurityEventRecord] = []
        self._load_or_init()

    def _load_or_init(self):
        with self.lock:
            if self.storage_path.exists():
                try:
                    with open(self.storage_path, "r", encoding="utf-8") as f:
                        data = json.load(f)
                    for z_dict in data.get("zones", []):
                        zone = SecurityZone(**z_dict)
                        self.zones[zone.id] = zone
                    if len(self.zones) > 0:
                        logger.info(f"Loaded {len(self.zones)} security zones from {self.storage_path.name}")
                        return
                except Exception as e:
                    logger.warning(f"Failed to load zones store from {self.storage_path}: {e}")

            # Initialize with default zones if file didn't exist or was empty
            for d in DEFAULT_ZONES_DATA:
                zone = SecurityZone(**d)
                self.zones[zone.id] = zone
            self._save_to_disk()

    def _save_to_disk(self):
        try:
            payload = {
                "zones": [z.model_dump() for z in self.zones.values()]
            }
            with open(self.storage_path, "w", encoding="utf-8") as f:
                json.dump(payload, f, indent=2)
        except Exception as e:
            logger.error(f"Error persisting zones to disk: {e}")

    def get_zones(self) -> List[SecurityZone]:
        with self.lock:
            return list(self.zones.values())

    def get_zone(self, zone_id: str) -> Optional[SecurityZone]:
        with self.lock:
            return self.zones.get(zone_id)

    def add_zone(self, zone_data: ZoneCreateRequest) -> SecurityZone:
        with self.lock:
            valid, msg = validate_zone_geometry(zone_data.points, zone_data.shape)
            if not valid:
                raise ValueError(f"Invalid zone geometry: {msg}")

            zone_id = f"zone-{int(time.time() * 1000)}"
            created_at = time.strftime('%Y-%m-%d %H:%M:%S', time.localtime())
            actions = zone_data.alertActions or ZoneAlertActions(
                visualAlert=True,
                audibleAlarm=(zone_data.type.lower() == "emergency"),
                eventLog=True,
                webhookNotification=False
            )
            color = zone_data.color or ("#EF4444" if zone_data.type.lower() == "emergency" else "#F59E0B")

            zone = SecurityZone(
                id=zone_id,
                name=zone_data.name,
                type=zone_data.type.lower(),
                shape=zone_data.shape.lower(),
                points=zone_data.points,
                alertLevel=zone_data.alertLevel.lower(),
                stayThresholdSeconds=zone_data.stayThresholdSeconds,
                monitoredObjects=zone_data.monitoredObjects,
                alertActions=actions,
                enabled=zone_data.enabled,
                color=color,
                createdAt=created_at,
                description=zone_data.description
            )
            self.zones[zone.id] = zone
            self._save_to_disk()
            logger.info(f"Added new security zone '{zone.name}' ({zone.id})")
            return zone

    def update_zone(self, zone_id: str, updates: ZoneUpdateRequest) -> Optional[SecurityZone]:
        with self.lock:
            zone = self.zones.get(zone_id)
            if not zone:
                return None

            update_data = updates.model_dump(exclude_unset=True)
            if "points" in update_data and update_data["points"] is not None:
                shape = update_data.get("shape", zone.shape)
                valid, msg = validate_zone_geometry(update_data["points"], shape)
                if not valid:
                    raise ValueError(f"Invalid zone geometry update: {msg}")

            for k, v in update_data.items():
                if v is not None:
                    setattr(zone, k, v)

            self._save_to_disk()
            logger.info(f"Updated security zone {zone_id}")
            return zone

    def delete_zone(self, zone_id: str) -> bool:
        with self.lock:
            if zone_id in self.zones:
                del self.zones[zone_id]
                self._save_to_disk()
                logger.info(f"Deleted security zone {zone_id}")
                return True
            return False

    def toggle_zone(self, zone_id: str, enabled: bool) -> Optional[SecurityZone]:
        with self.lock:
            zone = self.zones.get(zone_id)
            if zone:
                zone.enabled = enabled
                self._save_to_disk()
                return zone
            return None

    def record_violation(self, violation: ZoneViolationRecord):
        with self.lock:
            self.violations[violation.id] = violation

    def get_violations(self, zone_id: Optional[str] = None) -> List[ZoneViolationRecord]:
        with self.lock:
            if zone_id:
                return [v for v in self.violations.values() if v.zoneId == zone_id]
            return list(self.violations.values())

    def acknowledge_violation(self, violation_id: str) -> bool:
        with self.lock:
            if violation_id in self.violations:
                self.violations[violation_id].status = "ACKNOWLEDGED"
                return True
            return False

    def record_event(self, event: SecurityEventRecord):
        with self.lock:
            self.events.insert(0, event)
            # Bound persistent events in memory
            if len(self.events) > 500:
                self.events = self.events[:500]

    def get_events(self, limit: int = 100) -> List[SecurityEventRecord]:
        with self.lock:
            return self.events[:limit]

    def acknowledge_event(self, event_id: str) -> bool:
        with self.lock:
            for ev in self.events:
                if ev.id == event_id:
                    ev.acknowledged = True
                    return True
            return False

zone_manager = ZoneManager()
