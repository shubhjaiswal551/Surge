"""
SafeCrowd - High-Density Multi-Object Tracker Module
Combines dual-class YOLOv8s (pedestrian + head) with containment suppression,
head-to-body projection fusion for dense crowd occlusions, and
spatial-velocity track persistence.
"""

import logging
import math
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any
import numpy as np
import torch
from ultralytics import YOLO

logger = logging.getLogger("safecrowd.ml.tracking")

CONFIG = {
    "default_weights": "ml/detection/weights/best.pt",
    "conf_threshold": 0.14,
    "iou_threshold": 0.45,
    "imgsz": 960,
}

def compute_ios(box1: List[float], box2: List[float]) -> float:
    """Intersection over Smaller box area (containment metric)."""
    x1 = max(box1[0], box2[0])
    y1 = max(box1[1], box2[1])
    x2 = min(box1[2], box2[2])
    y2 = min(box1[3], box2[3])
    inter_w = max(0.0, x2 - x1)
    inter_h = max(0.0, y2 - y1)
    inter_area = inter_w * inter_h
    if inter_area <= 0:
        return 0.0
    area1 = max(1.0, (box1[2] - box1[0]) * (box1[3] - box1[1]))
    area2 = max(1.0, (box2[2] - box2[0]) * (box2[3] - box2[1]))
    return inter_area / min(area1, area2)

def compute_iou(box1: List[float], box2: List[float]) -> float:
    """Intersection over Union metric."""
    x1 = max(box1[0], box2[0])
    y1 = max(box1[1], box2[1])
    x2 = min(box1[2], box2[2])
    y2 = min(box1[3], box2[3])
    inter_w = max(0.0, x2 - x1)
    inter_h = max(0.0, y2 - y1)
    inter_area = inter_w * inter_h
    if inter_area <= 0:
        return 0.0
    area1 = (box1[2] - box1[0]) * (box1[3] - box1[1])
    area2 = (box2[2] - box2[0]) * (box2[3] - box2[1])
    union = area1 + area2 - inter_area
    return inter_area / union if union > 0 else 0.0

def fuse_detections(
    raw_boxes: np.ndarray,
    raw_confs: np.ndarray,
    raw_classes: np.ndarray,
    frame_w: int,
    frame_h: int,
    conf_thresh: float = 0.12,
    ios_thresh: float = 0.55,
) -> List[Dict[str, Any]]:
    """
    Dual-anchor fusion of Class 0 (pedestrian) and Class 1 (head):
    1. Separate full bodies and heads.
    2. Apply containment suppression on full bodies to eliminate duplicate stacked boxes.
    3. Match detected heads to bodies.
    4. For isolated heads (dense crowd occlusion where lower body is hidden), synthesize proxy body box.
    """
    peds = []
    heads = []

    for box, conf, cls_id in zip(raw_boxes, raw_confs, raw_classes):
        if conf < conf_thresh:
            continue
        c = int(cls_id)
        if c == 0:
            peds.append({"bbox": [float(v) for v in box], "conf": float(conf), "cls": 0})
        elif c == 1:
            heads.append({"bbox": [float(v) for v in box], "conf": float(conf), "cls": 1})

    # Sort pedestrians by confidence descending
    peds.sort(key=lambda x: x["conf"], reverse=True)

    # 1. Containment suppression on pedestrian detections to eliminate upper-body/duplicate splitting
    filtered_peds = []
    for p in peds:
        box_p = p["bbox"]
        suppress = False
        for kept in filtered_peds:
            if compute_ios(box_p, kept["bbox"]) > ios_thresh:
                suppress = True
                break
        if not suppress:
            filtered_peds.append(p)

    # 2. Check each head against filtered pedestrian boxes
    unmatched_heads = []
    for h in heads:
        h_box = h["bbox"]
        hcx = (h_box[0] + h_box[2]) / 2.0
        hcy = (h_box[1] + h_box[3]) / 2.0

        matched = False
        for p in filtered_peds:
            pbx = p["bbox"]
            if pbx[0] <= hcx <= pbx[2] and pbx[1] <= hcy <= (pbx[1] + (pbx[3] - pbx[1]) * 0.65):
                matched = True
                break
            if compute_ios(h_box, pbx) > 0.40:
                matched = True
                break
        if not matched:
            unmatched_heads.append(h)

    # 3. Synthesize proxy pedestrian boxes for occluded heads in dense crowds
    for h in unmatched_heads:
        hx1, hy1, hx2, hy2 = h["bbox"]
        hw = hx2 - hx1
        hh = hy2 - hy1
        hcx = (hx1 + hx2) / 2.0

        pw = hw * 1.6
        ph = hh * 3.4
        projected = [
            max(0.0, hcx - pw / 2.0),
            max(0.0, hy1),
            min(float(frame_w), hcx + pw / 2.0),
            min(float(frame_h), hy1 + ph),
        ]

        # Verify not overlapping an existing pedestrian
        suppress = False
        for kept in filtered_peds:
            if compute_ios(projected, kept["bbox"]) > 0.60:
                suppress = True
                break
        if not suppress:
            filtered_peds.append({
                "bbox": projected,
                "conf": float(h["conf"]),
                "cls": 0,
                "from_head": True,
            })

    return filtered_peds

class RobustTrack:
    """Represents a single pedestrian track with velocity-extrapolating state."""
    def __init__(self, track_id: int, bbox: List[float], conf: float, cls_id: int = 0):
        self.track_id = track_id
        self.bbox = list(bbox)
        self.conf = conf
        self.cls_id = cls_id
        self.vel = [0.0, 0.0]
        self.lost = 0
        self.hits = 1
        self.age = 1

    @property
    def center(self) -> Tuple[float, float]:
        return ((self.bbox[0] + self.bbox[2]) / 2.0, (self.bbox[1] + self.bbox[3]) / 2.0)

    @property
    def size(self) -> Tuple[float, float]:
        return (max(0.0, self.bbox[2] - self.bbox[0]), max(0.0, self.bbox[3] - self.bbox[1]))

    def predict(self):
        vx, vy = self.vel
        self.bbox[0] += vx
        self.bbox[1] += vy
        self.bbox[2] += vx
        self.bbox[3] += vy
        self.age += 1
        self.lost += 1

    def update(self, new_bbox: List[float], new_conf: float):
        cx_old, cy_old = self.center
        self.bbox = list(new_bbox)
        cx_new, cy_new = self.center

        vx = cx_new - cx_old
        vy = cy_new - cy_old
        self.vel[0] = 0.65 * vx + 0.35 * self.vel[0]
        self.vel[1] = 0.65 * vy + 0.35 * self.vel[1]
        self.conf = 0.75 * new_conf + 0.25 * self.conf
        self.lost = 0
        self.hits += 1

class RobustCrowdTracker:
    """
    Multi-object tracker engineered specifically for dense crowd surveillance.
    Associates tracks using normalized centroid distance + IoU cost matrix,
    retaining identity persistence across occlusions without track ID churn.
    """
    def __init__(self, max_lost: int = 25, dist_thresh_factor: float = 1.6):
        self.tracks: Dict[int, RobustTrack] = {}
        self.next_id = 1
        self.max_lost = max_lost
        self.dist_thresh_factor = dist_thresh_factor

    def update(
        self,
        fused_detections: List[Dict[str, Any]],
        frame_w: int,
        frame_h: int,
    ) -> List[Dict[str, Any]]:
        # 1. Predict track forward positions
        for t in self.tracks.values():
            t.predict()

        det_boxes = [d["bbox"] for d in fused_detections]
        det_confs = [d["conf"] for d in fused_detections]

        matched_track_ids = set()
        matched_det_indices = set()
        active_tracks = [t for t in self.tracks.values() if t.lost <= self.max_lost]

        # 2. Bipartite association
        if active_tracks and det_boxes:
            cost_matrix = np.zeros((len(active_tracks), len(det_boxes)), dtype=np.float32)

            for i, trk in enumerate(active_tracks):
                tcx, tcy = trk.center
                tw, th = trk.size
                diag = math.hypot(tw, th) or 30.0

                for j, dbox in enumerate(det_boxes):
                    dcx = (dbox[0] + dbox[2]) / 2.0
                    dcy = (dbox[1] + dbox[3]) / 2.0
                    dist = math.hypot(dcx - tcx, dcy - tcy)

                    iou = compute_iou(trk.bbox, dbox)
                    norm_dist = dist / diag
                    cost = (1.0 - iou) * 0.55 + min(1.0, norm_dist) * 0.45

                    if norm_dist > self.dist_thresh_factor and iou < 0.10:
                        cost = 999.0
                    cost_matrix[i, j] = cost

            unmatched_rows = set(range(len(active_tracks)))
            unmatched_cols = set(range(len(det_boxes)))

            flat_indices = np.dstack(np.unravel_index(np.argsort(cost_matrix.ravel()), cost_matrix.shape))[0]
            for r, c in flat_indices:
                if cost_matrix[r, c] >= 0.85:
                    break
                if r in unmatched_rows and c in unmatched_cols:
                    trk = active_tracks[r]
                    trk.update(det_boxes[c], det_confs[c])
                    matched_track_ids.add(trk.track_id)
                    matched_det_indices.add(c)
                    unmatched_rows.remove(r)
                    unmatched_cols.remove(c)

        # 3. Initialize new tracks for unmatched confident detections
        for j, (dbox, conf) in enumerate(zip(det_boxes, det_confs)):
            if j not in matched_det_indices:
                if conf >= 0.18:
                    tid = self.next_id
                    self.next_id += 1
                    self.tracks[tid] = RobustTrack(tid, dbox, conf)

        # 4. Prune aged or out-of-frame tracks
        dead_ids = []
        for tid, trk in self.tracks.items():
            if trk.lost > self.max_lost:
                dead_ids.append(tid)
            else:
                cx, cy = trk.center
                if cx < -60 or cx > frame_w + 60 or cy < -60 or cy > frame_h + 60:
                    dead_ids.append(tid)

        for tid in dead_ids:
            del self.tracks[tid]

        # 5. Output active visible tracks (suppress unverified single-frame blips)
        results = []
        for trk in self.tracks.values():
            if trk.lost == 0 or (trk.hits >= 2 and trk.lost <= 5):
                results.append({
                    "track_id": trk.track_id,
                    "bbox": tuple(trk.bbox),
                    "center": trk.center,
                    "size": trk.size,
                    "confidence": round(float(trk.conf), 4),
                    "cls": trk.cls_id,
                    "is_projected": trk.lost > 0,
                })
        return results

class ByteTrackPipeline:
    """
    Drop-in production tracker pipeline wrapping Ultralytics master model
    with dual-class fusion and RobustCrowdTracker identity linking.
    """
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
        self.tracker = RobustCrowdTracker(max_lost=25)

        logger.info(f"Initializing ByteTrackPipeline with weights={path} on device={self.device}")
        self.model = YOLO(path)

    def track_frame(
        self,
        frame: np.ndarray,
        frame_idx: int = 0,
        timestamp: float = 0.0,
    ) -> Tuple[List[Dict[str, Any]], Any]:
        """
        Runs dual-class inference + containment suppression + head-body fusion
        and associates tracks with velocity persistence.
        """
        fh, fw = frame.shape[:2]

        results = self.model(
            source=frame,
            conf=self.conf,
            iou=self.iou,
            imgsz=self.imgsz,
            max_det=1000,
            classes=[0, 1], # Detect BOTH full bodies and heads
            device=self.device,
            verbose=False,
        )[0]

        if results.boxes is not None and len(results.boxes) > 0:
            coords = results.boxes.xyxy.cpu().numpy()
            confs = results.boxes.conf.cpu().numpy()
            classes = results.boxes.cls.int().cpu().numpy()
        else:
            coords = np.empty((0, 4))
            confs = np.empty((0,))
            classes = np.empty((0,), dtype=int)

        fused = fuse_detections(coords, confs, classes, fw, fh, conf_thresh=self.conf)
        trajectories = self.tracker.update(fused, fw, fh)

        # Inject frame index and timestamp into trajectories
        for t in trajectories:
            t["frame"] = frame_idx
            t["timestamp"] = timestamp

        return trajectories, results
