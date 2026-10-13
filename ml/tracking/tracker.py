"""
SafeCrowd - ByteTrack Multi-Object Tracker Module
Wraps Ultralytics YOLO with ByteTrack cross-frame identity linking.
"""

import logging
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any
import numpy as np
import torch
from ultralytics import YOLO

from .extract_trajectories import extract_trajectories

logger = logging.getLogger("safecrowd.ml.tracking")

CONFIG = {
    "default_weights": "ml/detection/weights/best.pt",
    "conf_threshold": 0.18,
    "iou_threshold": 0.60,
    "imgsz": 960,
    "tracker_config": str(Path(__file__).resolve().parent / "crowd_bytetrack.yaml"),
}

class PersistentTrackBuffer:
    """
    Maintains continuous track persistence across brief dropouts (1-20 frames)
    using velocity extrapolation to prevent boxes from flickering or disappearing.
    """
    def __init__(self, max_lost: int = 5):
        self.tracks: Dict[int, Dict[str, Any]] = {}
        self.max_lost = max_lost

    def update(
        self,
        raw_trajectories: List[Dict[str, Any]],
        frame_idx: int,
        timestamp: float,
    ) -> List[Dict[str, Any]]:
        current_ids = set()

        for t in raw_trajectories:
            tid = t["track_id"]
            current_ids.add(tid)
            bbox = list(t["bbox"]) # [x1, y1, x2, y2]

            if tid in self.tracks:
                old_box = self.tracks[tid]["bbox"]
                old_vel = self.tracks[tid]["vel"]
                vx = bbox[0] - old_box[0]
                vy = bbox[1] - old_box[1]
                smoothed_vx = 0.65 * vx + 0.35 * old_vel[0]
                smoothed_vy = 0.65 * vy + 0.35 * old_vel[1]

                self.tracks[tid] = {
                    "bbox": bbox,
                    "vel": (smoothed_vx, smoothed_vy),
                    "confidence": t["confidence"],
                    "cls": t.get("cls", 0),
                    "lost": 0,
                    "center": t["center"],
                    "size": t["size"],
                }
            else:
                self.tracks[tid] = {
                    "bbox": bbox,
                    "vel": (0.0, 0.0),
                    "confidence": t["confidence"],
                    "cls": t.get("cls", 0),
                    "lost": 0,
                    "center": t["center"],
                    "size": t["size"],
                }

        # Extrapolate momentarily occluded / lost tracks
        for tid in list(self.tracks.keys()):
            if tid not in current_ids:
                self.tracks[tid]["lost"] += 1
                if self.tracks[tid]["lost"] > self.max_lost:
                    del self.tracks[tid]
                else:
                    box = self.tracks[tid]["bbox"]
                    vx, vy = self.tracks[tid]["vel"]
                    # Smoothly propagate forward
                    box[0] += vx * 0.8
                    box[1] += vy * 0.8
                    box[2] += vx * 0.8
                    box[3] += vy * 0.8
                    cx = (box[0] + box[2]) / 2.0
                    cy = (box[1] + box[3]) / 2.0
                    self.tracks[tid]["center"] = (cx, cy)

        # Assemble unified persistent trajectory list
        results = []
        for tid, data in self.tracks.items():
            results.append({
                "track_id": tid,
                "frame": frame_idx,
                "timestamp": timestamp,
                "bbox": tuple(data["bbox"]),
                "center": data["center"],
                "size": data["size"],
                "confidence": data["confidence"],
                "cls": data["cls"],
                "is_projected": data["lost"] > 0,
            })
        return results

class ByteTrackPipeline:
    def __init__(
        self,
        weights_path: Optional[str] = None,
        conf_threshold: Optional[float] = None,
        iou_threshold: Optional[float] = None,
        imgsz: Optional[int] = None,
        device: Optional[str] = None,
    ):
        path = weights_path or CONFIG["default_weights"]
        self.weights_path = path
        self.conf = conf_threshold or CONFIG["conf_threshold"]
        self.iou = iou_threshold or CONFIG["iou_threshold"]
        self.imgsz = imgsz or CONFIG["imgsz"]
        self.device = device or ("0" if torch.cuda.is_available() else "cpu")
        self.persistence = PersistentTrackBuffer(max_lost=5)

        logger.info(f"Initializing ByteTrackPipeline with weights={path} on device={self.device}")
        self.model = YOLO(path)

    def track_frame(
        self,
        frame: np.ndarray,
        frame_idx: int = 0,
        timestamp: float = 0.0,
    ) -> Tuple[List[Dict[str, Any]], Any]:
        """
        Runs YOLO + ByteTrack on a single frame and returns structured trajectories + YOLO plot.
        """
        results = self.model.track(
            source=frame,
            conf=self.conf,
            iou=self.iou,
            imgsz=self.imgsz,
            max_det=1000,
            classes=[0],
            persist=True,
            tracker=CONFIG["tracker_config"],
            device=self.device,
            verbose=False,
        )[0]

        raw_trajectories = extract_trajectories(results, frame_idx=frame_idx, timestamp=timestamp)
        trajectories = self.persistence.update(raw_trajectories, frame_idx=frame_idx, timestamp=timestamp)
        return trajectories, results
