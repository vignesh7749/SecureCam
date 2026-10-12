import sys
import time
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.zones.schemas import SecurityZone, ZonePoint, ZoneAlertActions
from app.zones.dwell_engine import ZoneDwellEngine
from app.video.processor import VideoStreamProcessor
from app.tracking.tracker import ByteTrackManager
from app.novelty.novelty_engine import NoveltyEngine

def run_verification():
    sample_path = backend_dir / "samples" / "sample_emergency_zone.mp4"
    if not sample_path.exists():
        print(f"ERROR: Video {sample_path} not found.")
        sys.exit(1)

    print("======================================================================")
    print("SECURECAM STAGE 5 — REAL EMERGENCY ZONE & DWELL TIME VERIFICATION")
    print("======================================================================\n")

    # TEST A: Positive Loitering & Breach Test (Zone covering active corridor, low threshold)
    print("--- [TEST A] POSITIVE BREACH TEST (Zone in active corridor, threshold=1.0s) ---")
    active_zone = SecurityZone(
        id="zone-corridor-active",
        name="Active Main Corridor",
        type="emergency",
        shape="rectangle",
        points=[
            ZonePoint(x=10.0, y=10.0),
            ZonePoint(x=90.0, y=10.0),
            ZonePoint(x=90.0, y=90.0),
            ZonePoint(x=10.0, y=90.0)
        ],
        alertLevel="critical",
        stayThresholdSeconds=1.0,
        monitoredObjects=["person", "vehicle", "unknown"],
        alertActions=ZoneAlertActions(audibleAlarm=True)
    )

    dwell_engine_a = ZoneDwellEngine(alarm_cooldown_seconds=2.0)
    processor_a = VideoStreamProcessor(
        video_path=sample_path,
        zone_engine=dwell_engine_a,
        zones=[active_zone],
        process_every_n_frames=5
    )

    entries_a = []
    violations_a = []
    exits_a = []
    alarms_count_a = 0
    latencies_a = []

    def on_tracks_a(ft):
        nonlocal alarms_count_a
        latencies_a.append(ft.zoneLatencyMs)
        if ft.alarmTriggered:
            alarms_count_a += 1
        for ev in ft.zoneEvents:
            if ev["type"] == "ZONE_ENTRY":
                entries_a.append(ev)
            elif ev["type"] == "ZONE_VIOLATION":
                violations_a.append(ev)
            elif ev["type"] == "ZONE_EXIT":
                exits_a.append(ev)

    t0 = time.time()
    processor_a.process(on_tracks_callback=on_tracks_a)
    elapsed_a = time.time() - t0

    print(f"Processed in {elapsed_a:.2f}s")
    print(f"Mean Zone Spatial Latency: {sum(latencies_a)/max(1, len(latencies_a)):.3f} ms")
    print(f"Total ZONE_ENTRY events: {len(entries_a)}")
    print(f"Total ZONE_VIOLATION events: {len(violations_a)}")
    print(f"Total Audible Alarm Triggers: {alarms_count_a}")
    print(f"Active Episodes remaining: {len(dwell_engine_a.active_episodes)}")
    assert len(entries_a) > 0, "TEST A FAILED: No entries recorded in active zone!"
    assert len(violations_a) > 0, "TEST A FAILED: No violations recorded in active zone with 1.0s threshold!"
    print(">> TEST A PASSED: Real objects entered, dwell exceeded threshold, violations & alarms fired.\n")

    # TEST B: Negative Test (Zone placed far away in empty top-right corner)
    print("--- [TEST B] NEGATIVE TEST (Zone in empty periphery [88,0]-[99,15], threshold=1.0s) ---")
    corner_zone = SecurityZone(
        id="zone-empty-corner",
        name="Empty Corner Perimeter",
        type="emergency",
        shape="rectangle",
        points=[
            ZonePoint(x=88.0, y=0.0),
            ZonePoint(x=99.0, y=0.0),
            ZonePoint(x=99.0, y=15.0),
            ZonePoint(x=88.0, y=15.0)
        ],
        alertLevel="critical",
        stayThresholdSeconds=1.0,
        monitoredObjects=["person", "vehicle", "unknown"],
        alertActions=ZoneAlertActions(audibleAlarm=True)
    )

    dwell_engine_b = ZoneDwellEngine()
    processor_b = VideoStreamProcessor(
        video_path=sample_path,
        zone_engine=dwell_engine_b,
        zones=[corner_zone],
        process_every_n_frames=5
    )

    entries_b = []
    violations_b = []

    def on_tracks_b(ft):
        for ev in ft.zoneEvents:
            if ev["type"] == "ZONE_ENTRY":
                entries_b.append(ev)
            elif ev["type"] == "ZONE_VIOLATION":
                violations_b.append(ev)

    processor_b.process(on_tracks_callback=on_tracks_b)

    print(f"Total ZONE_ENTRY events in corner zone: {len(entries_b)}")
    print(f"Total ZONE_VIOLATION events in corner zone: {len(violations_b)}")
    assert len(entries_b) == 0, f"TEST B FAILED: False entries in empty corner ({len(entries_b)})!"
    assert len(violations_b) == 0, f"TEST B FAILED: False violations in empty corner ({len(violations_b)})!"
    print(">> TEST B PASSED: ZERO false entries or false violations in untouched zone.\n")

    # TEST C: Short-Stay / Benign Pass-Through Test (Zone in corridor, high threshold=60.0s)
    print("--- [TEST C] SHORT-STAY / TRANSIT TEST (Corridor zone, high threshold=60.0s) ---")
    transit_zone = SecurityZone(
        id="zone-transit",
        name="Transit Corridor",
        type="caution",
        shape="rectangle",
        points=[
            ZonePoint(x=10.0, y=10.0),
            ZonePoint(x=90.0, y=10.0),
            ZonePoint(x=90.0, y=90.0),
            ZonePoint(x=10.0, y=90.0)
        ],
        alertLevel="medium",
        stayThresholdSeconds=60.0,  # 60s threshold: objects will pass through without loitering violation
        monitoredObjects=["person", "vehicle"],
        alertActions=ZoneAlertActions(audibleAlarm=False)
    )

    dwell_engine_c = ZoneDwellEngine()
    processor_c = VideoStreamProcessor(
        video_path=sample_path,
        zone_engine=dwell_engine_c,
        zones=[transit_zone],
        process_every_n_frames=5
    )

    entries_c = []
    violations_c = []

    def on_tracks_c(ft):
        for ev in ft.zoneEvents:
            if ev["type"] == "ZONE_ENTRY":
                entries_c.append(ev)
            elif ev["type"] == "ZONE_VIOLATION":
                violations_c.append(ev)

    processor_c.process(on_tracks_callback=on_tracks_c)

    print(f"Total ZONE_ENTRY events: {len(entries_c)}")
    print(f"Total ZONE_VIOLATION events: {len(violations_c)}")
    assert len(entries_c) > 0, "TEST C FAILED: Expected entries during transit!"
    assert len(violations_c) == 0, f"TEST C FAILED: Short transit triggered false violation ({len(violations_c)})!"
    print(">> TEST C PASSED: Objects tracked through zone with dwelling timers, ZERO false violations.\n")

    print("======================================================================")
    print("ALL STAGE 5 REAL VIDEO BENCHMARKS PASSED SUCCESSFULLY (100% VERIFIED)")
    print("======================================================================")

if __name__ == "__main__":
    run_verification()
