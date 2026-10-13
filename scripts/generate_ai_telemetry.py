"""
SafeCrowd - High-Density AI Telemetry Generator
Generates persistent, presentation-ready crowd tracking timelines for camera video feeds
using the master dual-class YOLOv8s model + head-body fusion + spatial-velocity persistence.
"""

import os
import sys
import json
from pathlib import Path
from typing import Dict, List, Any

# Ensure project root is in sys.path
repo_root = Path(__file__).resolve().parent.parent
if str(repo_root) not in sys.path:
    sys.path.insert(0, str(repo_root))

import cv2
import numpy as np
from ml.tracking.tracker import ByteTrackPipeline

def process_video(
    video_path: Path,
    out_filename: str,
    camera_id: str,
    weights_path: str,
):
    print(f"\n==================================================")
    print(f"Processing {video_path.name} -> {out_filename}")
    print(f"==================================================")

    if not video_path.exists():
        print(f"Warning: {video_path} does not exist. Skipping.")
        return

    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        print(f"Error: Could not open {video_path}. Skipping.")
        return

    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    frame_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    frame_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = round(total_frames / fps, 2)

    print(f"Video {frame_w}x{frame_h} @ {fps:.1f} FPS | Total frames: {total_frames} ({duration}s)")

    # Initialize tracker pipeline with dual-class fusion and spatial-velocity tracking
    pipeline = ByteTrackPipeline(
        weights_path=weights_path,
        conf_threshold=0.14,
        iou_threshold=0.45,
        imgsz=960,
    )

    timeline = []
    sample_interval = 2  # 12.5 FPS keyframes for silky smooth canvas rendering

    frame_idx = 0
    while frame_idx < total_frames:
        ret, frame = cap.read()
        if not ret:
            break

        timestamp = round(frame_idx / fps, 3)
        trajectories, _ = pipeline.track_frame(frame, frame_idx=frame_idx, timestamp=timestamp)

        active_boxes = []
        for t in trajectories:
            bx1, by1, bx2, by2 = t["bbox"]
            active_boxes.append({
                "id": int(t["track_id"]),
                "label": f"#{int(t['track_id']):02d}",
                "x": round((float(bx1) / frame_w) * 100.0, 2),
                "y": round((float(by1) / frame_h) * 100.0, 2),
                "w": round(((float(bx2) - float(bx1)) / frame_w) * 100.0, 2),
                "h": round(((float(by2) - float(by1)) / frame_h) * 100.0, 2),
                "conf": int(round(float(t.get("confidence", 0.5)) * 100)),
                "cls": int(t.get("cls", 0)),
                "isAnomaly": False,
            })

        if frame_idx % sample_interval == 0:
            timeline.append({
                "time": round(frame_idx / fps, 2),
                "boxes": active_boxes,
            })

        if frame_idx % 100 == 0:
            print(f"  Frame {frame_idx:04d}/{total_frames} ({frame_idx/fps:.1f}s): {len(active_boxes)} persistent active tracks")

        frame_idx += 1

    cap.release()

    payload = {
        "cameraId": camera_id,
        "duration": duration,
        "timeline": timeline,
    }

    out_pub = Path("frontend/public") / out_filename
    out_dist = Path("frontend/dist") / out_filename

    out_pub.parent.mkdir(parents=True, exist_ok=True)
    with open(out_pub, "w", encoding="utf-8") as f:
        json.dump(payload, f, separators=(",", ":"))
    print(f"Saved {len(timeline)} keyframes to {out_pub}")

    if out_dist.parent.exists():
        with open(out_dist, "w", encoding="utf-8") as f:
            json.dump(payload, f, separators=(",", ":"))
        print(f"Synced to {out_dist}")

def main():
    weights_path = "ml/detection/weights/best.pt"
    print(f"Using master YOLOv8s crowd model from {weights_path}...")

    # Process Concourse Crossing
    process_video(
        video_path=Path("frontend/public/concourse_crossing.webm"),
        out_filename="telemetry_concourse.json",
        camera_id="cam-002",
        weights_path=weights_path,
    )

    # Process Corridor Chokepoint
    process_video(
        video_path=Path("frontend/public/corridor_chokepoint.webm"),
        out_filename="telemetry_corridor.json",
        camera_id="cam-001",
        weights_path=weights_path,
    )

    print("\n[SUCCESS] Presentation-ready high-density telemetry generated for all feeds!")

if __name__ == "__main__":
    main()
