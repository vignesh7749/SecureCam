import asyncio
import time
from app.services.analysis_service import analysis_service

session = analysis_service.create_session('sample_testing_1', profile='BALANCED')
print('Session created:', session.analysis_id)
loop = asyncio.new_event_loop()
t0 = time.time()
analysis_service.run_analysis_sync(session.analysis_id, loop)
elapsed = time.time() - t0

print(f'Analysis completed in {elapsed:.2f}s. Status: {session.status}')
print('Processed frames:', session.processed_frames)
print('Detections count:', session.detections_count)
print('Unique tracks count:', session.unique_tracks_count)
print('Track results count in memory:', len(session.track_results))

# Sample some frames
for f_idx in [10, 50, 83, 120, 167, 200, 251, 301]:
    tr = session.track_results.get(f_idx)
    if tr:
        tracks_summary = [f"{t.className} #{t.trackId} ({t.confidence:.2f})" for t in tr.tracks]
        print(f"Frame {f_idx:3d}: {len(tr.tracks)} tracks: {tracks_summary}")
    else:
        print(f"Frame {f_idx:3d}: No track result")
