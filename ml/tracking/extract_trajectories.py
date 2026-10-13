"""
SafeCrowd - Phase 2: Multi-Object Trajectory Extraction
Extracts frame-by-frame trajectory state from YOLO + ByteTrack detections.
"""

from typing import Dict, List, Tuple, Any, Optional
import numpy as np

def extract_trajectories(
    results: Any,
    frame_idx: int,
    timestamp: float,
) -> List[Dict[str, Any]]:
    """
    Extracts structured trajectory data from Ultralytics track results.

    Returns a list of dicts:
    [
        {
            "track_id": int,
            "frame": int,
            "timestamp": float,
            "bbox": (x1, y1, x2, y2),
            "center": (cx, cy),
            "size": (width, height),
            "confidence": float
        },
        ...
    ]
    """
    trajectories = []
    if results is None or results.boxes is None:
        return trajectories

    boxes = results.boxes
    if boxes.id is None:
        return trajectories

    coords = boxes.xyxy.cpu().numpy()
    track_ids = boxes.id.int().cpu().numpy().tolist()
    confs = boxes.conf.cpu().numpy().tolist() if boxes.conf is not None else [1.0] * len(track_ids)
    classes = boxes.cls.int().cpu().numpy().tolist() if boxes.cls is not None else [0] * len(track_ids)

    for box, tid, conf, cls_id in zip(coords, track_ids, confs, classes):
        x1, y1, x2, y2 = [float(v) for v in box]
        cx = (x1 + x2) / 2.0
        cy = (y1 + y2) / 2.0
        w = max(0.0, x2 - x1)
        h = max(0.0, y2 - y1)

        trajectories.append({
            "track_id": int(tid),
            "frame": frame_idx,
            "timestamp": timestamp,
            "bbox": (x1, y1, x2, y2),
            "center": (cx, cy),
            "size": (w, h),
            "confidence": round(float(conf), 4),
            "cls": int(cls_id),
        })

    return trajectories
