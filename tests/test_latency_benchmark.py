"""
Surge - Latency Benchmark Test Suite
Measures end-to-end processing latency against the PRD 2-3s target (NFR):
  Stage 1: Frame Ingestion & Preprocessing
  Stage 2: YOLO Detection + ByteTrack Multi-Object Tracking
  Stage 3: Analytics Metrics (Density, Flow Vectors, Variance, Turbulence, Heatmap)
  Stage 4: Anomaly Decision Engine & Alert Packaging
"""

import sys
import os
import time
import math
import cv2
import numpy as np

# Ensure root is in sys.path
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from ml.tracking.tracker import ByteTrackPipeline
from ml.analytics.metrics import (
    compute_density,
    compute_flow_vector,
    compute_velocity_variance,
    compute_flow_turbulence,
    compute_spatial_heatmap,
)
from ml.analytics.anomaly import detect_anomaly

def run_latency_benchmark(num_frames: int = 50, video_path: str = "frontend/public/12269404_2320_1080_30fps.mp4"):
    print("=" * 65)
    print("🚀 Surge End-to-End Latency Benchmark (NFR Target: < 2000ms)")
    print("=" * 65)

    full_video_path = os.path.join(BASE_DIR, video_path)
    if not os.path.exists(full_video_path):
        print(f"Error: Video file not found at {full_video_path}")
        return False

    cap = cv2.VideoCapture(full_video_path)
    if not cap.isOpened():
        print(f"Error: Could not open video file {full_video_path}")
        return False

    print("Initializing ByteTrack + YOLO detector...")
    tracker = ByteTrackPipeline(weights_path="backend/models/best.pt", conf_threshold=0.25)

    latencies_stage1 = []  # Ingestion & resize
    latencies_stage2 = []  # Tracking & detection
    latencies_stage3 = []  # Spatial analytics & metrics
    latencies_stage4 = []  # Anomaly engine
    total_latencies = []

    track_history = {}
    frame_idx = 0

    print(f"Benchmarking across {num_frames} video frames...")

    while frame_idx < num_frames:
        t0 = time.perf_counter()
        
        # Stage 1: Grab and resize
        ret, frame = cap.read()
        if not ret:
            cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            ret, frame = cap.read()
            if not ret:
                break

        frame_resized = cv2.resize(frame, (960, 540))
        rh, rw = frame_resized.shape[:2]
        t1 = time.perf_counter()

        # Stage 2: Inference + ByteTrack
        trajectories, _ = tracker.track_frame(frame_resized, frame_idx=frame_idx, timestamp=time.time())
        t2 = time.perf_counter()

        # Stage 3: Analytics Metrics
        headcount = len(trajectories)
        bboxes = [t["bbox"] for t in trajectories]
        active_ids = {t["track_id"] for t in trajectories}
        velocities = []

        for t in trajectories:
            tid = t["track_id"]
            cx, cy = t["center"]
            if tid not in track_history:
                track_history[tid] = []
            track_history[tid].append((cx, cy))
            if len(track_history[tid]) > 10:
                track_history[tid].pop(0)
            if len(track_history[tid]) >= 2:
                p_old = track_history[tid][0]
                p_new = track_history[tid][-1]
                velocities.append((p_new[0] - p_old[0], p_new[1] - p_old[1]))

        # Prune dead tracks
        for tid in list(track_history.keys()):
            if tid not in active_ids:
                track_history[tid].pop(0)
                if not track_history[tid]:
                    del track_history[tid]

        density_val = compute_density(headcount, area_sq_m=50.0)
        flow_vec = compute_flow_vector(velocities)
        vel_variance = compute_velocity_variance(velocities)
        turbulence = compute_flow_turbulence(velocities)
        heatmap = compute_spatial_heatmap(bboxes, rw, rh, grid_size=5)

        speeds = [math.sqrt(v[0]**2 + v[1]**2) for v in velocities]
        avg_speed = round(float(np.mean(speeds)), 2) if speeds else 0.0
        t3 = time.perf_counter()

        # Stage 4: Anomaly Detection
        is_anomaly, event_type, severity = detect_anomaly(
            density=density_val,
            avg_speed=avg_speed,
            velocity_variance=vel_variance,
            turbulence=turbulence,
        )
        t4 = time.perf_counter()

        s1_ms = (t1 - t0) * 1000
        s2_ms = (t2 - t1) * 1000
        s3_ms = (t3 - t2) * 1000
        s4_ms = (t4 - t3) * 1000
        tot_ms = (t4 - t0) * 1000

        # Discard the very first frame warmup from stats
        if frame_idx > 0:
            latencies_stage1.append(s1_ms)
            latencies_stage2.append(s2_ms)
            latencies_stage3.append(s3_ms)
            latencies_stage4.append(s4_ms)
            total_latencies.append(tot_ms)

        frame_idx += 1

    cap.release()

    # Aggregate Statistics
    avg_s1 = np.mean(latencies_stage1)
    avg_s2 = np.mean(latencies_stage2)
    avg_s3 = np.mean(latencies_stage3)
    avg_s4 = np.mean(latencies_stage4)
    avg_tot = np.mean(total_latencies)
    p50_tot = np.percentile(total_latencies, 50)
    p95_tot = np.percentile(total_latencies, 95)
    max_tot = np.max(total_latencies)
    min_tot = np.min(total_latencies)

    print("\n" + "=" * 65)
    print("📊 BENCHMARK RESULTS SUMMARY")
    print("=" * 65)
    print(f"Frames Evaluated:           {len(total_latencies)}")
    print(f"Stage 1 (Decode & Resize):  {avg_s1:.2f} ms")
    print(f"Stage 2 (YOLO + ByteTrack): {avg_s2:.2f} ms")
    print(f"Stage 3 (Spatial Metrics):  {avg_s3:.2f} ms")
    print(f"Stage 4 (Anomaly Rules):    {avg_s4:.2f} ms")
    print("-" * 65)
    print(f"Total Average Latency:      {avg_tot:.2f} ms ({avg_tot/1000:.3f} s)")
    print(f"Median (P50) Latency:       {p50_tot:.2f} ms")
    print(f"95th Percentile (P95):      {p95_tot:.2f} ms")
    print(f"Min / Max Latency:          {min_tot:.2f} ms / {max_tot:.2f} ms")
    print(f"Throughput (FPS):           {1000 / avg_tot:.1f} FPS")
    print("-" * 65)

    nfr_target_ms = 2000.0  # 2.0 seconds target
    passed = p95_tot < nfr_target_ms

    if passed:
        print(f"✅ PASSED: P95 Latency ({p95_tot:.2f} ms) is WELL WITHIN the 2000ms SLA target!")
        margin = ((nfr_target_ms - p95_tot) / nfr_target_ms) * 100
        print(f"   Performance Margin: {margin:.1f}% headroom below threshold.")
    else:
        print(f"❌ FAILED: P95 Latency ({p95_tot:.2f} ms) exceeded 2000ms SLA target.")

    print("=" * 65)
    return passed

if __name__ == "__main__":
    success = run_latency_benchmark(num_frames=60)
    sys.exit(0 if success else 1)
