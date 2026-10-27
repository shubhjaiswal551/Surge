"""
Surge - High-Density AI Telemetry Generator
Generates persistent, presentation-ready crowd tracking timelines for camera video feeds
using YOLOv8 + ByteTrack trajectory persistence with 16:9 viewport projection.
"""

import os
import sys
import json
from pathlib import Path
from typing import Dict, List, Any, Union

# Ensure project root is in sys.path
repo_root = Path(__file__).resolve().parent.parent
if str(repo_root) not in sys.path:
    sys.path.insert(0, str(repo_root))

import cv2
import numpy as np
from ml.tracking.tracker import ByteTrackPipeline

def process_video(
    video_path: Path,
    out_filenames: Union[str, List[str]],
    camera_id: str,
    weights_path: str,
    conf_threshold: float = 0.12,
    sample_interval: int = 2,
):
    if isinstance(out_filenames, str):
        out_filenames = [out_filenames]

    print(f"\n==================================================")
    print(f"Processing {video_path.name} -> {out_filenames}")
    print(f"Weights: {weights_path} | Conf: {conf_threshold}")
    print(f"==================================================")

    if not video_path.exists():
        print(f"Warning: {video_path} does not exist. Skipping.")
        return

    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        print(f"Error: Could not open {video_path}. Skipping.")
        return

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    frame_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    frame_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = round(total_frames / fps, 2)

    ar = frame_w / frame_h
    # Viewport 16:9 projection: if aspect ratio > 1.8 (e.g. 2320x1080 = 2.148),
    # object-cover in CSS trims horizontal borders. Calibrate coordinates to the 16:9 visible viewport!
    if ar > 1.8:
        target_w = frame_h * (16.0 / 9.0)
        crop_x = (frame_w - target_w) / 2.0
        print(f"Ultra-wide aspect {ar:.2f}: calibrated 16:9 projection active (cropX={crop_x:.1f}px, visibleWidth={target_w:.1f}px)")
    else:
        target_w = float(frame_w)
        crop_x = 0.0

    print(f"Video {frame_w}x{frame_h} @ {fps:.1f} FPS | Total frames: {total_frames} ({duration}s)")

    pipeline = ByteTrackPipeline(
        weights_path=weights_path,
        conf_threshold=conf_threshold,
        iou_threshold=0.45,
        imgsz=960,
    )

    timeline = []
    frame_idx = 0
    last_known_pos = {}
    track_remap = {}
    next_clean_id = 10000

    while frame_idx < total_frames:
        ret, frame = cap.read()
        if not ret:
            break

        timestamp = round(frame_idx / fps, 3)
        trajectories, _ = pipeline.track_frame(frame, frame_idx=frame_idx, timestamp=timestamp)

        active_boxes = []
        for t in trajectories:
            bx1, by1, bx2, by2 = t["bbox"]
            x_pct = round(((bx1 - crop_x) / target_w) * 100.0, 2)
            y_pct = round((by1 / frame_h) * 100.0, 2)
            w_pct = round(((bx2 - bx1) / target_w) * 100.0, 2)
            h_pct = round(((by2 - by1) / frame_h) * 100.0, 2)

            # Prune boxes completely cropped out by object-cover
            if (x_pct + w_pct) < -1.0 or x_pct > 101.0:
                continue

            raw_id = int(t["track_id"])
            curr_id = track_remap.get(raw_id, raw_id)
            cur_x = max(0.0, min(100.0, x_pct))
            cur_y = max(0.0, min(100.0, y_pct))

            # If track jumped across the screen by > 6.5%, assign fresh ID
            if curr_id in last_known_pos:
                px, py = last_known_pos[curr_id]
                jump = ((cur_x - px) ** 2 + (cur_y - py) ** 2) ** 0.5
                if jump > 6.5:
                    next_clean_id += 1
                    curr_id = next_clean_id
                    track_remap[raw_id] = curr_id
            last_known_pos[curr_id] = (cur_x, cur_y)

            active_boxes.append({
                "id": curr_id,
                "label": f"#{curr_id % 1000:02d}",
                "x": cur_x,
                "y": cur_y,
                "w": round(w_pct, 2),
                "h": round(h_pct, 2),
                "conf": int(round(float(t.get("confidence", 0.5)) * 100)),
                "cls": int(t.get("cls", 0)),
                "isAnomaly": False,
            })

        if frame_idx % sample_interval == 0:
            timeline.append({
                "time": round(frame_idx / fps, 2),
                "boxes": active_boxes,
            })

        if frame_idx % 50 == 0 or frame_idx == total_frames - 1:
            print(f"  Frame {frame_idx:04d}/{total_frames} ({frame_idx/fps:.1f}s): {len(active_boxes)} active tracks")

        frame_idx += 1

    cap.release()

    payload = {
        "cameraId": camera_id,
        "duration": duration,
        "timeline": timeline,
    }

    for fname in out_filenames:
        out_pub = Path("frontend/public") / fname
        out_dist = Path("frontend/dist") / fname

        out_pub.parent.mkdir(parents=True, exist_ok=True)
        with open(out_pub, "w", encoding="utf-8") as f:
            json.dump(payload, f, separators=(",", ":"))
        print(f"Saved {len(timeline)} keyframes to {out_pub}")

        if out_dist.parent.exists():
            with open(out_dist, "w", encoding="utf-8") as f:
                json.dump(payload, f, separators=(",", ":"))
            print(f"Synced to {out_dist}")

def main():
    best_demo_weights = "ml/detection/weights/best_demo.pt"
    if not os.path.exists(best_demo_weights):
        best_demo_weights = "ml/detection/weights/best.pt"

    # Process Camera 3: Main Terminal Gate (Dense Scramble)
    process_video(
        video_path=Path("frontend/public/12269404_2320_1080_30fps.mp4"),
        out_filenames=["telemetry_terminal.json", "telemetry_cam001.json"],
        camera_id="cam-003",
        weights_path=best_demo_weights,
        conf_threshold=0.12,
        sample_interval=2,
    )

    # Process Camera 4: Stadium Concourse Dispersal Hallway
    process_video(
        video_path=Path("frontend/public/stadium_hallway_dispersal.mp4"),
        out_filenames=["telemetry_plaza.json", "telemetry_stadium.json", "telemetry_cam002.json"],
        camera_id="cam-004",
        weights_path=best_demo_weights,
        conf_threshold=0.14,
        sample_interval=2,
    )

    print("\n[SUCCESS] Presentation-ready high-density telemetry generated for all feeds!")

if __name__ == "__main__":
    main()
