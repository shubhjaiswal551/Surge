"""
Generate High-Density AI Telemetry for concourse_crossing.webm
- Uses fine-tuned YOLOv8s crowd weights + crowd-tuned ByteTrack
- Optimized for dense crossing crowds:
  1. imgsz=960 (2.25x pixel resolution for distant midground pedestrians)
  2. conf=0.18 (captures occluded pedestrians in dense pack)
  3. iou=0.65 (soft NMS preserves overlapping human bodies in tight groups)
  4. min_hits=4 (keeps pedestrians visible between occlusions)
  5. Clean genuine detections only - zero phantom sliding boxes
"""

import os
import json
from pathlib import Path
import cv2
import numpy as np
from ultralytics import YOLO

def main():
    video_path = Path("frontend/public/concourse_crossing.webm")
    weights_path = Path("ml/detection/weights/best.pt")
    tracker_cfg = Path("ml/tracking/crowd_bytetrack.yaml")
    output_public = Path("frontend/public/telemetry_concourse.json")
    output_dist = Path("frontend/dist/telemetry_concourse.json")

    print(f"Loading YOLOv8 crowd model from {weights_path}...")
    model = YOLO(str(weights_path))

    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise FileNotFoundError(f"Could not open video at {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    frame_w = cap.get(cv2.CAP_PROP_FRAME_WIDTH)
    frame_h = cap.get(cv2.CAP_PROP_FRAME_HEIGHT)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    target_duration = round(total_frames / fps, 2)

    print(f"Video {frame_w}x{frame_h} @ {fps} FPS. Total frames: {total_frames} ({target_duration}s)")
    print(f"High-Density Inference: imgsz=960, conf=0.18, iou=0.65 with {tracker_cfg}...")

    raw_frame_detections = []
    track_hit_counts = {}
    track_first_seen = {}

    frame_idx = 0
    while frame_idx < total_frames:
        ret, frame = cap.read()
        if not ret:
            break

        # High-resolution crowd inference
        results = model.track(
            source=frame,
            conf=0.18,
            iou=0.65,
            imgsz=960,
            persist=True,
            tracker=str(tracker_cfg),
            device=0,
            verbose=False,
        )[0]

        frame_boxes = []
        if results.boxes is not None and len(results.boxes) > 0 and results.boxes.id is not None:
            boxes_xyxy = results.boxes.xyxy.cpu().numpy()
            track_ids = results.boxes.id.int().cpu().numpy().tolist()
            confs = results.boxes.conf.cpu().numpy().tolist()

            for box, tid, conf in zip(boxes_xyxy, track_ids, confs):
                x1, y1, x2, y2 = [float(v) for v in box]
                raw_id = int(tid)
                frame_boxes.append({
                    "raw_id": raw_id,
                    "x1": x1,
                    "y1": y1,
                    "x2": x2,
                    "y2": y2,
                    "conf": int(round(float(conf) * 100)),
                })
                track_hit_counts[raw_id] = track_hit_counts.get(raw_id, 0) + 1
                if raw_id not in track_first_seen:
                    track_first_seen[raw_id] = frame_idx

        raw_frame_detections.append(frame_boxes)
        if frame_idx % 100 == 0:
            print(f"Tracking frame {frame_idx}/{total_frames} ({round(frame_idx/fps, 1)}s) - {len(frame_boxes)} people detected")
        frame_idx += 1

    cap.release()

    # Retain tracks with at least 4 hits (preserves occluded pedestrians while discarding single-frame blips)
    min_hits = 4
    valid_ids = {tid for tid, count in track_hit_counts.items() if count >= min_hits}
    print(f"Total raw tracks: {len(track_hit_counts)} -> Retained valid crowd members (hits >= {min_hits}): {len(valid_ids)}")

    # Clean sequential IDs by appearance order
    sorted_ids = sorted(list(valid_ids), key=lambda tid: track_first_seen[tid])
    clean_id_map = {tid: idx for idx, tid in enumerate(sorted_ids, start=1)}

    sample_interval = 4
    timeline = []

    for f_idx in range(0, total_frames, sample_interval):
        current_time = round(f_idx / fps, 2)
        frame_boxes = []

        if f_idx < len(raw_frame_detections):
            for b in raw_frame_detections[f_idx]:
                raw_id = b["raw_id"]
                if raw_id not in clean_id_map:
                    continue

                clean_id = clean_id_map[raw_id]
                x1, y1, x2, y2 = b["x1"], b["y1"], b["x2"], b["y2"]

                bx = float(round((x1 / frame_w) * 100, 2))
                by = float(round((y1 / frame_h) * 100, 2))
                bw = float(round(((x2 - x1) / frame_w) * 100, 2))
                bh = float(round(((y2 - y1) / frame_h) * 100, 2))

                frame_boxes.append({
                    "id": clean_id,
                    "label": f"#{clean_id:02d}",
                    "x": bx,
                    "y": by,
                    "w": bw,
                    "h": bh,
                    "conf": b["conf"],
                    "isAnomaly": False,
                })

        timeline.append({
            "time": current_time,
            "boxes": frame_boxes,
        })

    telemetry_payload = {
        "cameraId": "cam-002",
        "duration": target_duration,
        "timeline": timeline,
    }

    print(f"Writing {len(timeline)} keyframes to {output_public}...")
    output_public.parent.mkdir(parents=True, exist_ok=True)
    with open(output_public, "w", encoding="utf-8") as f:
        json.dump(telemetry_payload, f, separators=(",", ":"))

    if output_dist.parent.exists():
        print(f"Syncing to {output_dist}...")
        with open(output_dist, "w", encoding="utf-8") as f:
            json.dump(telemetry_payload, f, separators=(",", ":"))

    print("High-density crowd telemetry generated successfully!")

if __name__ == "__main__":
    main()
