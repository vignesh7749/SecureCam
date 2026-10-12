import sys
import tempfile
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.main import app
from app.tracking.schemas import TrackedObject, Point, Velocity
from app.detection.schemas import BoundingBox
from app.zones.schemas import (
    SecurityZone,
    ZonePoint,
    ZoneAlertActions,
    ZoneCreateRequest,
    ZoneUpdateRequest,
    ZoneViolationRecord,
    SecurityEventRecord
)
from app.zones.geometry import (
    compute_bottom_center_anchor,
    point_in_rectangle,
    point_in_polygon_ray_casting,
    is_object_in_zone,
    validate_zone_geometry
)
from app.zones.dwell_engine import ZoneDwellEngine
from app.zones.zone_manager import ZoneManager, zone_manager
from app.video.processor import VideoStreamProcessor


def create_dummy_track(
    track_id: int,
    class_name: str = "person",
    box_x: float = 30.0,
    box_y: float = 40.0,
    box_w: float = 10.0,
    box_h: float = 20.0,
    is_unknown: bool = False
) -> TrackedObject:
    """Helper to create a validated TrackedObject for spatial tests."""
    return TrackedObject(
        id=f"track_{track_id}",
        trackId=track_id,
        trackingId=track_id,
        classId=0 if class_name == "person" else 2,
        className=class_name,
        confidence=0.88,
        box=BoundingBox(
            x1=box_x * 19.2,
            y1=box_y * 10.8,
            x2=(box_x + box_w) * 19.2,
            y2=(box_y + box_h) * 10.8,
            x=box_x,
            y=box_y,
            width=box_w,
            height=box_h
        ),
        state="ACTIVE",
        firstSeen="00:00:01",
        lastSeen="00:00:01",
        durationSeconds=1.0,
        age=1,
        hits=1,
        velocity=Velocity(vx=0.0, vy=0.0, speed=0.0),
        currentPosition=Point(x=box_x + box_w / 2.0, y=box_y + box_h / 2.0),
        movementStatus="moving",
        isUnknown=is_unknown
    )


def create_test_zone(
    zone_id: str = "test-zone-01",
    shape: str = "rectangle",
    threshold: float = 5.0,
    monitored: list = None,
    enabled: bool = True
) -> SecurityZone:
    """Helper to create a test SecurityZone covering (20,20) to (50,70)."""
    if monitored is None:
        monitored = ["person", "vehicle", "unknown"]
    return SecurityZone(
        id=zone_id,
        name="Test Emergency Zone",
        type="emergency",
        shape=shape,
        points=[
            ZonePoint(x=20.0, y=20.0),
            ZonePoint(x=50.0, y=20.0),
            ZonePoint(x=50.0, y=70.0),
            ZonePoint(x=20.0, y=70.0)
        ],
        alertLevel="critical",
        stayThresholdSeconds=threshold,
        monitoredObjects=monitored,
        alertActions=ZoneAlertActions(
            visualAlert=True,
            audibleAlarm=True,
            eventLog=True,
            webhookNotification=False
        ),
        enabled=enabled,
        color="#EF4444",
        createdAt="2026-10-02 12:00:00"
    )


# =====================================================================
# 1. Geometry & Coordinate Tests
# =====================================================================

def test_bottom_center_anchor_computation():
    """Anchor point must be strictly the bottom-center of the bounding box."""
    box = BoundingBox(
        x1=200.0, y1=300.0, x2=300.0, y2=500.0,
        x=20.0, y=30.0, width=10.0, height=20.0
    )
    anchor_x, anchor_y = compute_bottom_center_anchor(box)
    assert anchor_x == 25.0  # 20 + 10/2
    assert anchor_y == 50.0  # 30 + 20


def test_point_in_rectangle_axis_aligned():
    """Points inside, outside, and on boundary of a rectangle."""
    rect = [
        ZonePoint(x=10.0, y=10.0),
        ZonePoint(x=40.0, y=10.0),
        ZonePoint(x=40.0, y=60.0),
        ZonePoint(x=10.0, y=60.0)
    ]
    # Inside
    assert point_in_rectangle(25.0, 35.0, rect) is True
    # Outside left
    assert point_in_rectangle(5.0, 35.0, rect) is False
    # Outside bottom
    assert point_in_rectangle(25.0, 75.0, rect) is False
    # Exactly on boundary
    assert point_in_rectangle(10.0, 35.0, rect) is True


def test_point_in_polygon_ray_casting():
    """Jordan curve ray-casting for arbitrary polygons."""
    poly = [
        ZonePoint(x=10.0, y=10.0),
        ZonePoint(x=50.0, y=10.0),
        ZonePoint(x=30.0, y=50.0)
    ]
    # Centroid inside triangle
    assert point_in_polygon_ray_casting(30.0, 20.0, poly) is True
    # Far outside
    assert point_in_polygon_ray_casting(70.0, 70.0, poly) is False
    assert point_in_polygon_ray_casting(5.0, 5.0, poly) is False


def test_polygon_l_shaped_concave():
    """L-shaped polygon with an interior notch."""
    poly = [
        ZonePoint(x=0.0, y=0.0),
        ZonePoint(x=50.0, y=0.0),
        ZonePoint(x=50.0, y=25.0),
        ZonePoint(x=25.0, y=25.0),
        ZonePoint(x=25.0, y=50.0),
        ZonePoint(x=0.0, y=50.0)
    ]
    # Inside the lower bar
    assert point_in_polygon_ray_casting(10.0, 35.0, poly) is True
    # Inside the upper right bar
    assert point_in_polygon_ray_casting(35.0, 10.0, poly) is True
    # In the cut-out notch (should be False)
    assert point_in_polygon_ray_casting(40.0, 40.0, poly) is False


def test_zone_geometry_validation():
    """Geometry validation rejects invalid points, few vertices, and near-zero area."""
    valid_points = [
        ZonePoint(x=10.0, y=10.0),
        ZonePoint(x=50.0, y=10.0),
        ZonePoint(x=50.0, y=50.0),
        ZonePoint(x=10.0, y=50.0)
    ]
    valid, msg = validate_zone_geometry(valid_points, "rectangle")
    assert valid is True

    # Fewer than 3 points
    valid, msg = validate_zone_geometry([ZonePoint(x=10.0, y=10.0), ZonePoint(x=20.0, y=20.0)], "polygon")
    assert valid is False
    assert "at least 3 vertices" in msg

    # Out of bounds (< 0.0 or > 100.0) rejected by ZonePoint validator
    with pytest.raises(Exception, match="Coordinate must be in range"):
        ZonePoint(x=-5.0, y=10.0)

    # Degenerate collinear points (near-zero area)
    valid, msg = validate_zone_geometry([
        ZonePoint(x=10.0, y=10.0),
        ZonePoint(x=20.0, y=20.0),
        ZonePoint(x=30.0, y=30.0)
    ], "polygon")
    assert valid is False
    assert "too small" in msg


def test_object_in_zone_foot_contact_precision():
    """
    Precision anchor test:
    If a target's head is inside the zone (y=15 to 35) but their feet contact is
    at y=35 (zone starts at y=40), is_object_in_zone must return False!
    """
    zone = create_test_zone()  # y is 20.0 to 70.0, x is 20.0 to 50.0

    # Case A: Object whose feet are at y=75 (outside bottom of zone)
    # box is x=25..35, y=50..75 -> bottom center anchor is (30, 75)
    box_outside_bottom = BoundingBox(
        x1=250.0, y1=500.0, x2=350.0, y2=750.0,
        x=25.0, y=50.0, width=10.0, height=25.0
    )
    assert is_object_in_zone(box_outside_bottom, zone) is False

    # Case B: Object whose feet are at y=60 (inside zone)
    # box is x=25..35, y=40..60 -> bottom center anchor is (30, 60)
    box_inside = BoundingBox(
        x1=250.0, y1=400.0, x2=350.0, y2=600.0,
        x=25.0, y=40.0, width=10.0, height=20.0
    )
    assert is_object_in_zone(box_inside, zone) is True


# =====================================================================
# 2. Zone Manager & CRUD Persistence
# =====================================================================

def test_zone_manager_crud():
    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as tf:
        temp_path = Path(tf.name)

    try:
        mgr = ZoneManager(storage_path=temp_path)
        # Default zones loaded
        assert len(mgr.get_zones()) >= 3

        # Add new zone
        create_req = ZoneCreateRequest(
            name="Temporary Perimeter",
            type="restricted",
            shape="rectangle",
            points=[
                ZonePoint(x=10.0, y=10.0),
                ZonePoint(x=30.0, y=10.0),
                ZonePoint(x=30.0, y=30.0),
                ZonePoint(x=10.0, y=30.0)
            ],
            alertLevel="high",
            stayThresholdSeconds=8.0,
            monitoredObjects=["person"],
            alertActions=ZoneAlertActions()
        )
        new_zone = mgr.add_zone(create_req)
        assert new_zone.id.startswith("zone-")
        assert mgr.get_zone(new_zone.id) is not None

        # Update zone
        update_req = ZoneUpdateRequest(name="Renamed Perimeter", stayThresholdSeconds=15.0)
        updated = mgr.update_zone(new_zone.id, update_req)
        assert updated.name == "Renamed Perimeter"
        assert updated.stayThresholdSeconds == 15.0

        # Toggle enable/disable
        disabled = mgr.toggle_zone(new_zone.id, enabled=False)
        assert disabled.enabled is False
        enabled = mgr.toggle_zone(new_zone.id, enabled=True)
        assert enabled.enabled is True

        # Delete zone
        deleted = mgr.delete_zone(new_zone.id)
        assert deleted is True
        assert mgr.get_zone(new_zone.id) is None
    finally:
        if temp_path.exists():
            temp_path.unlink()


def test_zone_manager_disk_persistence():
    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as tf:
        temp_path = Path(tf.name)

    try:
        mgr1 = ZoneManager(storage_path=temp_path)
        create_req = ZoneCreateRequest(
            name="Persistent Vault Area",
            type="emergency",
            shape="rectangle",
            points=[
                ZonePoint(x=1.0, y=1.0),
                ZonePoint(x=20.0, y=1.0),
                ZonePoint(x=20.0, y=20.0),
                ZonePoint(x=1.0, y=20.0)
            ],
            alertLevel="critical",
            stayThresholdSeconds=5.0,
            monitoredObjects=["unknown"]
        )
        z = mgr1.add_zone(create_req)
        z_id = z.id

        # Reload in fresh manager instance pointing to the same file
        mgr2 = ZoneManager(storage_path=temp_path)
        loaded = mgr2.get_zone(z_id)
        assert loaded is not None
        assert loaded.name == "Persistent Vault Area"
    finally:
        if temp_path.exists():
            temp_path.unlink()


# =====================================================================
# 3. Zone Dwell Engine: Real Timestamps & Lifecycle State Machine
# =====================================================================

def test_dwell_timer_entry_event():
    engine = ZoneDwellEngine()
    zone = create_test_zone(threshold=5.0)
    track = create_dummy_track(1, box_x=30.0, box_y=30.0)  # anchor at (35, 50) -> inside

    res = engine.process_frame([track], [zone], timestamp=10.0)

    # Must produce exactly 1 ZONE_ENTRY event
    assert len(res.new_events) == 1
    assert res.new_events[0].type == "ZONE_ENTRY"
    assert res.new_events[0].trackingId == 1
    assert track.currentZoneId == zone.id
    assert track.dwellTimeInZone == 0.0
    assert len(res.active_violations) == 0


def test_dwell_timer_progression():
    engine = ZoneDwellEngine()
    zone = create_test_zone(threshold=5.0)
    track = create_dummy_track(1, box_x=30.0, box_y=30.0)

    # Frame 1 at t=10.0s
    engine.process_frame([track], [zone], timestamp=10.0)
    # Frame 2 at t=12.5s -> dwell time must be exactly 2.5s
    res2 = engine.process_frame([track], [zone], timestamp=12.5)

    assert track.dwellTimeInZone == 2.5
    assert len(res2.active_violations) == 0


def test_dwell_threshold_violation_and_alarm():
    engine = ZoneDwellEngine(alarm_cooldown_seconds=3.0)
    zone = create_test_zone(threshold=5.0)
    track = create_dummy_track(1, box_x=30.0, box_y=30.0)

    engine.process_frame([track], [zone], timestamp=10.0)
    engine.process_frame([track], [zone], timestamp=13.0)
    
    # Frame at t=15.5s -> dwell is 5.5s > threshold (5.0s) -> VIOLATION
    res = engine.process_frame([track], [zone], timestamp=15.5)

    assert len(res.new_violations) == 1
    assert len(res.active_violations) == 1
    viol = res.active_violations[0]
    assert viol.trackingId == 1
    assert viol.zoneId == zone.id
    assert viol.dwellTimeSeconds == 5.5
    assert res.alarm_triggered is True

    # Corresponding ZONE_VIOLATION event
    viol_events = [e for e in res.new_events if e.type == "ZONE_VIOLATION"]
    assert len(viol_events) == 1


def test_single_violation_per_stay():
    """A continuous stay must only fire ONE violation event, not repeatedly every frame."""
    engine = ZoneDwellEngine()
    zone = create_test_zone(threshold=5.0)
    track = create_dummy_track(1, box_x=30.0, box_y=30.0)

    engine.process_frame([track], [zone], timestamp=10.0)
    res_viol = engine.process_frame([track], [zone], timestamp=16.0)
    assert len(res_viol.new_violations) == 1

    # Subsequent frames while still inside: violation is still active, but NO new violation event
    res_subseq1 = engine.process_frame([track], [zone], timestamp=17.0)
    assert len(res_subseq1.active_violations) == 1
    assert len(res_subseq1.new_violations) == 0

    res_subseq2 = engine.process_frame([track], [zone], timestamp=18.0)
    assert len(res_subseq2.active_violations) == 1
    assert len(res_subseq2.new_violations) == 0


def test_grace_period_temporary_occlusion():
    """
    Temporary track loss under grace period (1.5s) must NOT reset dwell timer
    or generate false exit event.
    """
    engine = ZoneDwellEngine(grace_period_seconds=1.5)
    zone = create_test_zone(threshold=5.0)
    track = create_dummy_track(1, box_x=30.0, box_y=30.0)

    # Entry at t=10.0
    engine.process_frame([track], [zone], timestamp=10.0)
    # Track visible at t=12.0
    engine.process_frame([track], [zone], timestamp=12.0)

    # Occlusion: track is absent from frame at t=12.8 (0.8s elapsed, < 1.5s grace period)
    res_occluded = engine.process_frame([], [zone], timestamp=12.8)
    # Must NOT produce exit event
    exit_events = [e for e in res_occluded.new_events if e.type == "ZONE_EXIT"]
    assert len(exit_events) == 0

    # Track returns at t=13.5 (1.5s since last seen at 12.0)
    res_returned = engine.process_frame([track], [zone], timestamp=13.5)
    # Dwell timer progressed from entry (13.5 - 10.0 = 3.5s)
    assert track.dwellTimeInZone == 3.5


def test_grace_period_expiry_exit_event():
    """
    When track is absent for longer than grace period, ZONE_EXIT event is emitted
    and the episode is terminated.
    """
    engine = ZoneDwellEngine(grace_period_seconds=1.5)
    zone = create_test_zone(threshold=5.0)
    track = create_dummy_track(1, box_x=30.0, box_y=30.0)

    engine.process_frame([track], [zone], timestamp=10.0)
    engine.process_frame([track], [zone], timestamp=12.0)

    # Absent until t=14.0 (2.0s elapsed > 1.5s grace period)
    res_exit = engine.process_frame([], [zone], timestamp=14.0)

    exit_events = [e for e in res_exit.new_events if e.type == "ZONE_EXIT"]
    assert len(exit_events) == 1
    assert exit_events[0].trackingId == 1


def test_reentry_creates_fresh_episode():
    """Exiting and re-entering must trigger a fresh entry and reset dwell timer."""
    engine = ZoneDwellEngine(grace_period_seconds=1.0)
    zone = create_test_zone(threshold=5.0)
    track = create_dummy_track(1, box_x=30.0, box_y=30.0)

    # Episode 1
    engine.process_frame([track], [zone], timestamp=10.0)
    engine.process_frame([track], [zone], timestamp=12.0)

    # Exit at t=14.0
    engine.process_frame([], [zone], timestamp=14.0)

    # Re-entry at t=20.0
    res_reentry = engine.process_frame([track], [zone], timestamp=20.0)
    entry_events = [e for e in res_reentry.new_events if e.type == "ZONE_ENTRY"]
    assert len(entry_events) == 1
    assert track.dwellTimeInZone == 0.0


def test_alarm_cooldown_window():
    """Audible alarm must obey cooldown window (e.g. 3.0s) to prevent audio spam."""
    engine = ZoneDwellEngine(alarm_cooldown_seconds=3.0)
    zone1 = create_test_zone(zone_id="zone-A", threshold=2.0)
    zone2 = SecurityZone(
        id="zone-B",
        name="Zone B",
        type="emergency",
        shape="rectangle",
        points=[
            ZonePoint(x=60.0, y=20.0),
            ZonePoint(x=90.0, y=20.0),
            ZonePoint(x=90.0, y=70.0),
            ZonePoint(x=60.0, y=70.0)
        ],
        alertLevel="critical",
        stayThresholdSeconds=2.0,
        monitoredObjects=["person"],
        alertActions=ZoneAlertActions(audibleAlarm=True)
    )
    track1 = create_dummy_track(1, box_x=30.0, box_y=30.0)  # Inside zone1
    track2 = create_dummy_track(2, box_x=70.0, box_y=30.0)  # Inside zone2

    # Track 1 enters zone 1 at t=10.0
    engine.process_frame([track1], [zone1, zone2], timestamp=10.0)
    # Track 1 breaches zone 1 at t=12.5 (dwell = 2.5s > 2.0s) -> Alarm fires
    res1 = engine.process_frame([track1], [zone1, zone2], timestamp=12.5)
    assert res1.alarm_triggered is True

    # Track 2 enters zone 2 at t=12.0
    engine.process_frame([track1, track2], [zone1, zone2], timestamp=12.0)
    # Track 2 breaches zone 2 at t=14.5 (dwell = 2.5s > 2.0s)
    # Elapsed since last alarm = 14.5 - 12.5 = 2.0s (< 3.0s cooldown)
    res2 = engine.process_frame([track1, track2], [zone1, zone2], timestamp=14.5)
    # Exactly one violation is detected (track 2 in zone 2)
    assert len(res2.new_violations) == 1
    assert res2.new_violations[0].trackingId == 2
    # Audible alarm flag is suppressed by cooldown
    assert res2.alarm_triggered is False


def test_stage4_unknown_object_monitored():
    """Zone monitoring 'unknown' triggers when track has isUnknown=True."""
    engine = ZoneDwellEngine()
    zone = create_test_zone(monitored=["unknown"], threshold=3.0)
    
    # Regular person with isUnknown=False
    normal_track = create_dummy_track(1, class_name="person", is_unknown=False)
    res1 = engine.process_frame([normal_track], [zone], timestamp=10.0)
    assert len(res1.new_events) == 0

    # Confirmed unknown object
    unknown_track = create_dummy_track(2, class_name="unknown", is_unknown=True)
    res2 = engine.process_frame([unknown_track], [zone], timestamp=10.0)
    assert len(res2.new_events) == 1
    assert res2.new_events[0].type == "ZONE_ENTRY"


def test_monitored_vehicle_category_mapping():
    """Zone monitoring 'vehicle' accepts 'car', 'truck', 'bus', 'motorcycle'."""
    engine = ZoneDwellEngine()
    zone = create_test_zone(monitored=["vehicle"], threshold=5.0)

    car_track = create_dummy_track(1, class_name="car")
    res = engine.process_frame([car_track], [zone], timestamp=10.0)
    assert len(res.new_events) == 1


def test_disabled_zone_ignored():
    """Disabled zone does not process tracks or trigger events."""
    engine = ZoneDwellEngine()
    zone = create_test_zone(enabled=False)
    track = create_dummy_track(1, box_x=30.0, box_y=30.0)

    res = engine.process_frame([track], [zone], timestamp=10.0)
    assert len(res.new_events) == 0
    assert track.currentZoneId is None


def test_multiple_tracks_in_same_zone():
    """Multiple tracks in same zone maintain isolated timers."""
    engine = ZoneDwellEngine()
    zone = create_test_zone(threshold=5.0)
    track1 = create_dummy_track(1, box_x=25.0, box_y=30.0)
    track2 = create_dummy_track(2, box_x=35.0, box_y=30.0)

    # Track 1 enters at t=10.0
    engine.process_frame([track1], [zone], timestamp=10.0)
    # Track 2 enters at t=13.0
    engine.process_frame([track1, track2], [zone], timestamp=13.0)

    # At t=15.5: Track 1 dwell = 5.5s (breached), Track 2 dwell = 2.5s (not breached)
    res = engine.process_frame([track1, track2], [zone], timestamp=15.5)
    assert len(res.new_violations) == 1
    assert res.new_violations[0].trackingId == 1


def test_finalize_all_on_video_end():
    """finalize_all emits exits for all active stays at video conclusion."""
    engine = ZoneDwellEngine()
    zone = create_test_zone()
    track = create_dummy_track(1, box_x=30.0, box_y=30.0)

    engine.process_frame([track], [zone], timestamp=10.0)
    final_events = engine.finalize_all(timestamp=25.0)

    assert len(final_events) == 1
    assert final_events[0].type == "ZONE_EXIT"
    assert len(engine.active_episodes) == 0


def test_dwell_engine_reset():
    engine = ZoneDwellEngine()
    zone = create_test_zone()
    track = create_dummy_track(1, box_x=30.0, box_y=30.0)

    engine.process_frame([track], [zone], timestamp=10.0)
    assert len(engine.active_episodes) == 1

    engine.reset()
    assert len(engine.active_episodes) == 0
    assert len(engine.active_violations) == 0


# =====================================================================
# 4. REST API Endpoint Tests via TestClient
# =====================================================================

client = TestClient(app)

def test_api_list_zones():
    res = client.get("/api/v1/zones")
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)
    assert len(data) >= 1


def test_api_create_and_delete_zone():
    payload = {
        "name": "Integration Test Substation",
        "type": "emergency",
        "shape": "rectangle",
        "points": [
            {"x": 10.0, "y": 10.0},
            {"x": 40.0, "y": 10.0},
            {"x": 40.0, "y": 40.0},
            {"x": 10.0, "y": 40.0}
        ],
        "alertLevel": "critical",
        "stayThresholdSeconds": 6.0,
        "monitoredObjects": ["person", "unknown"]
    }
    create_res = client.post("/api/v1/zones", json=payload)
    assert create_res.status_code == 201
    zone = create_res.json()
    zone_id = zone["id"]
    assert zone["name"] == "Integration Test Substation"

    # Get single zone
    get_res = client.get(f"/api/v1/zones/{zone_id}")
    assert get_res.status_code == 200

    # Delete zone
    del_res = client.delete(f"/api/v1/zones/{zone_id}")
    assert del_res.status_code == 200
    assert del_res.json()["deleted"] is True


def test_api_toggle_zone():
    res = client.get("/api/v1/zones")
    zone_id = res.json()[0]["id"]

    dis_res = client.post(f"/api/v1/zones/{zone_id}/disable")
    assert dis_res.status_code == 200
    assert dis_res.json()["enabled"] is False

    en_res = client.post(f"/api/v1/zones/{zone_id}/enable")
    assert en_res.status_code == 200
    assert en_res.json()["enabled"] is True


def test_api_violations_and_acknowledge():
    # Insert a dummy violation into zone_manager for testing
    viol = ZoneViolationRecord(
        id="viol-test-999",
        zoneId="zone-01",
        zoneName="Test Zone",
        objectId="track_99",
        trackingId=99,
        objectClass="person",
        enteredAt="12:00:10",
        dwellTimeSeconds=6.0,
        thresholdSeconds=5.0,
        status="ACTIVE",
        severity="CRITICAL"
    )
    zone_manager.record_violation(viol)

    get_res = client.get("/api/v1/violations")
    assert get_res.status_code == 200
    viols = get_res.json()
    assert any(v["id"] == "viol-test-999" for v in viols)

    ack_res = client.post("/api/v1/violations/viol-test-999/acknowledge")
    assert ack_res.status_code == 200
    assert ack_res.json()["acknowledged"] is True


def test_api_events_and_acknowledge():
    ev = SecurityEventRecord(
        id="evt-test-888",
        timestamp="12:00:00",
        type="ZONE_VIOLATION",
        severity="CRITICAL",
        objectId="track_88",
        trackingId=88,
        objectClass="person",
        zoneId="zone-01",
        zoneName="Emergency Zone 01",
        dwellTimeSeconds=11.2,
        thresholdSeconds=10.0,
        description="Loitering breach detected.",
        sourceCamera="Camera 01",
        acknowledged=False
    )
    zone_manager.record_event(ev)

    get_res = client.get("/api/v1/events?limit=50")
    assert get_res.status_code == 200
    events = get_res.json()
    assert any(e["id"] == "evt-test-888" for e in events)

    ack_res = client.post("/api/v1/events/evt-test-888/acknowledge")
    assert ack_res.status_code == 200
    assert ack_res.json()["acknowledged"] is True


def test_pipeline_integration_processor():
    """Validates real video stream processor integration with zones."""
    sample_path = Path(__file__).resolve().parent.parent / "samples" / "sample_emergency_zone.mp4"
    if not sample_path.exists():
        pytest.skip("sample_emergency_zone.mp4 not found")

    zone = SecurityZone(
        id="zone-integration-test",
        name="Integration Full Frame Zone",
        type="emergency",
        shape="rectangle",
        points=[
            ZonePoint(x=0.0, y=0.0),
            ZonePoint(x=100.0, y=0.0),
            ZonePoint(x=100.0, y=100.0),
            ZonePoint(x=0.0, y=100.0)
        ],
        alertLevel="critical",
        stayThresholdSeconds=1.0,
        monitoredObjects=["person", "vehicle", "unknown"],
        alertActions=ZoneAlertActions(audibleAlarm=True)
    )

    dwell_engine = ZoneDwellEngine()
    processor = VideoStreamProcessor(
        video_path=sample_path,
        zone_engine=dwell_engine,
        zones=[zone],
        process_every_n_frames=10
    )

    recorded_frames = []
    def on_tracks(frame_tracks):
        recorded_frames.append(frame_tracks)

    processor.process(on_tracks_callback=on_tracks)

    assert len(recorded_frames) > 0
    for ft in recorded_frames:
        assert hasattr(ft, "zoneLatencyMs")
        assert ft.zoneLatencyMs >= 0.0
        assert hasattr(ft, "activeViolations")
        assert hasattr(ft, "zoneEvents")
        assert hasattr(ft, "alarmTriggered")
