"""
SafeCrowd - High-Density AI Telemetry Generator
Generates persistent, presentation-ready crowd tracking timelines for camera video feeds
using the fine-tuned master elevated YOLOv8s model + velocity-extrapolating ByteTrack.
"""

import os
import json
from pathlib import Path
from typing import Dict, List, Any
import cv2
import numpy as np
from ultralytics import YOLO

class PersistentTrackBuffer:
    def __init__(self, max_lost: int = 25):
        self.tracks: Dict[int, Dict[str, Any]] = {}
        self.max_lost = max_lost

    def update(self, detected_boxes: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        current_ids = set()
        for d in detected_boxes:
            tid = d["id"]
            current_ids.add(tid)
            bx, by, bw, bh = d["x"], d["y"], d["w"], d["h"]

            if tid in self.tracks:
                old_box = self.tracks[tid]["box"]
                old_vel = self.tracks[tid]["vel"]
                vx = bx - old_box[0]
                vy = by - old_box[1]
                smoothed_vx = 0.65 * vx + 0.35 * old_vel[0]
                smoothed_vy = 0.65 * vy + 0.35 * old_vel[1]
                self.tracks[tid] = {
                    "box": [bx, by, bw, bh],
                    "vel": (smoothed_vx, smoothed_vy),
                    "conf": d["conf"],
                    "cls": d.get("cls", 0),
                    "lost": 0,
                }
            else:
                self.tracks[tid] = {
                    "box": [bx, by, bw, bh],
                    "vel": (0.0, 0.0),
                    "conf": d["conf"],
                    "cls": d.get("cls", 0),
                    "lost": 0,
                }

        for tid in list(self.tracks.keys()):
            if tid not in current_ids:
                self.tracks[tid]["lost"] += 1
                if self.tracks[tid]["lost"] > self.max_lost:
                    del self.tracks[tid]
                else:
                    b = self.tracks[tid]["box"]
                    vx, vy = self.tracks[tid]["vel"]
                    b[0] += vx * 0.8
                    b[1] += vy * 0.8

        active = []
        for tid, data in self.tracks.items():
            active.append({
                "id": tid,
                "label": f"#{tid:02d}",
                "x": round(data["box"][0], 2),
                "y": round(data["box"][1], 2),
                "w": round(data["box"][2], 2),
                "h": round(data["box"][3], 2),
                "conf": data["conf"],
                "cls": data["cls"],
                "isAnomaly": False,
            })
        return active

def process_video(
    video_path: Path,
    out_filename: str,
    camera_id: str,
    model: YOLO,
    tracker_cfg: Path,
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
    frame_w = cap.get(cv2.CAP_PROP_FRAME_WIDTH)
    frame_h = cap.get(cv2.CAP_PROP_FRAME_HEIGHT)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = round(total_frames / fps, 2)

    print(f"Video {frame_w}x{frame_h} @ {fps:.1f} FPS | Total frames: {total_frames} ({duration}s)")

    buffer = PersistentTrackBuffer(max_lost=5)
    timeline = []
    sample_interval = 2 # 12.5 FPS keyframes for silky smooth canvas rendering

    frame_idx = 0
    while frame_idx < total_frames:
        ret, frame = cap.read()
        if not ret:
            break

        # Run model tracking with master model on pedestrians
        results = model.track(
            source=frame,
            conf=0.18,
            iou=0.60,
            imgsz=960,
            max_det=1000,
            classes=[0],
            persist=True,
            tracker=str(tracker_cfg),
            device=0,
            verbose=False,
        )[0]

        detected_boxes = []
        if results.boxes is not None and results.boxes.id is not None and len(results.boxes) > 0:
            coords = results.boxes.xyxy.cpu().numpy()
            tids = results.boxes.id.int().cpu().numpy().tolist()
            confs = results.boxes.conf.cpu().numpy().tolist()
            classes = results.boxes.cls.int().cpu().numpy().tolist() if results.boxes.cls is not None else [0] * len(tids)

            for box, tid, conf, cls_id in zip(coords, tids, confs, classes):
                x1, y1, x2, y2 = [float(v) for v in box]
                bx = (x1 / frame_w) * 100.0
                by = (y1 / frame_h) * 100.0
                bw = ((x2 - x1) / frame_w) * 100.0
                bh = ((y2 - y1) / frame_h) * 100.0

                detected_boxes.append({
                    "id": int(tid),
                    "x": bx,
                    "y": by,
                    "w": bw,
                    "h": bh,
                    "conf": int(round(float(conf) * 100)),
                    "cls": int(cls_id),
                })

        # Update persistent track buffer
        active_boxes = buffer.update(detected_boxes)

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
    weights_path = Path("ml/detection/weights/best.pt")
    tracker_cfg = Path("ml/tracking/crowd_bytetrack.yaml")

    print(f"Loading master YOLOv8s crowd model from {weights_path}...")
    model = YOLO(str(weights_path))

    # Process Concourse Crossing
    process_video(
        video_path=Path("frontend/public/concourse_crossing.webm"),
        out_filename="telemetry_concourse.json",
        camera_id="cam-002",
        model=model,
        tracker_cfg=tracker_cfg,
    )

    # Process Corridor Chokepoint
    process_video(
        video_path=Path("frontend/public/corridor_chokepoint.webm"),
        out_filename="telemetry_corridor.json",
        camera_id="cam-001",
        model=model,
        tracker_cfg=tracker_cfg,
    )

    print("\n[SUCCESS] Presentation-ready high-density telemetry generated for all feeds!")

if __name__ == "__main__":
    main()
