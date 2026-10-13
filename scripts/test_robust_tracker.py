"""
Test script for Robust Crowd Tracker with Head-Body Fusion, Containment Suppression,
and Spatial-Velocity Association.
"""

import cv2
import numpy as np
from ultralytics import YOLO
import math

class RobustTrack:
    def __init__(self, track_id, bbox, conf, cls_id=0):
        self.track_id = track_id
        self.bbox = list(bbox)  # [x1, y1, x2, y2]
        self.conf = conf
        self.cls_id = cls_id
        self.vel = [0.0, 0.0]
        self.lost = 0
        self.hits = 1
        self.age = 1
        self.history = [self.center]
        
    @property
    def center(self):
        return [(self.bbox[0] + self.bbox[2]) / 2.0, (self.bbox[1] + self.bbox[3]) / 2.0]
        
    @property
    def size(self):
        return [self.bbox[2] - self.bbox[0], self.bbox[3] - self.bbox[1]]
        
    def predict(self):
        # Predict next position using smoothed velocity
        vx, vy = self.vel
        self.bbox[0] += vx
        self.bbox[1] += vy
        self.bbox[2] += vx
        self.bbox[3] += vy
        self.age += 1
        self.lost += 1
        
    def update(self, new_bbox, new_conf):
        cx_old, cy_old = self.center
        self.bbox = list(new_bbox)
        cx_new, cy_new = self.center
        
        # Smoothed velocity update
        vx = cx_new - cx_old
        vy = cy_new - cy_old
        self.vel[0] = 0.7 * vx + 0.3 * self.vel[0]
        self.vel[1] = 0.7 * vy + 0.3 * self.vel[1]
        
        self.conf = 0.8 * new_conf + 0.2 * self.conf
        self.lost = 0
        self.hits += 1
        self.history.append(self.center)
        if len(self.history) > 30:
            self.history.pop(0)

def compute_ios(box1, box2):
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
    return inter_area / min(area1, area2)

def compute_iou(box1, box2):
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

class RobustCrowdTracker:
    def __init__(self, max_lost=30, dist_thresh_factor=1.6):
        self.tracks = {}
        self.next_id = 1
        self.max_lost = max_lost
        self.dist_thresh_factor = dist_thresh_factor
        
    def fuse_and_filter(self, raw_boxes, raw_confs, raw_classes, frame_w, frame_h):
        peds = []
        heads = []
        for box, conf, cls_id in zip(raw_boxes, raw_confs, raw_classes):
            if conf < 0.12:
                continue
            if cls_id == 0:
                peds.append({"bbox": list(box), "conf": float(conf), "cls": 0})
            elif cls_id == 1:
                heads.append({"bbox": list(box), "conf": float(conf), "cls": 1})
                
        peds.sort(key=lambda x: x["conf"], reverse=True)
        
        # Containment suppression on pedestrians (remove sub-boxes / torso splits)
        filtered_peds = []
        for p in peds:
            box_p = p["bbox"]
            suppress = False
            for kept in filtered_peds:
                if compute_ios(box_p, kept["bbox"]) > 0.55:
                    suppress = True
                    break
            if not suppress:
                filtered_peds.append(p)
                
        # Match heads to pedestrians
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
                
        # Synthesize occluded bodies from heads in dense crowds
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
                min(float(frame_h), hy1 + ph)
            ]
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

    def update(self, detections, frame_w, frame_h):
        # 1. Predict track positions
        for t in self.tracks.values():
            t.predict()
            
        det_boxes = [d["bbox"] for d in detections]
        det_confs = [d["conf"] for d in detections]
        
        # 2. Match existing tracks to detections
        # Cost metric: combination of IoU and normalized centroid distance
        matched_track_ids = set()
        matched_det_indices = set()
        
        active_tracks = [t for t in self.tracks.values() if t.lost <= self.max_lost]
        
        if active_tracks and det_boxes:
            # Build cost matrix
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
                    
                    # Lower cost is better
                    # If high IoU, cost is very low
                    # If IoU is low (e.g. fast crowd or slight shift), centroid distance acts as robust fallback
                    cost = (1.0 - iou) * 0.6 + min(1.0, norm_dist) * 0.4
                    
                    # Hard gate: distance cannot exceed 2x diagonal
                    if norm_dist > self.dist_thresh_factor and iou < 0.10:
                        cost = 999.0
                    cost_matrix[i, j] = cost
                    
            # Fast pure numpy greedy bipartite matching
            unmatched_rows = set(range(len(active_tracks)))
            unmatched_cols = set(range(len(det_boxes)))
            
            # Sort all (row, col) pairs by cost ascending
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
                    
        # 3. Initialize new tracks for unmatched high-confidence detections
        for j, (dbox, conf) in enumerate(zip(det_boxes, det_confs)):
            if j not in matched_det_indices:
                if conf >= 0.18:
                    tid = self.next_id
                    self.next_id += 1
                    self.tracks[tid] = RobustTrack(tid, dbox, conf)
                    
        # 4. Remove tracks lost for too long or outside frame
        dead_ids = []
        for tid, trk in self.tracks.items():
            if trk.lost > self.max_lost:
                dead_ids.append(tid)
            else:
                # Remove if outside frame
                cx, cy = trk.center
                if cx < -50 or cx > frame_w + 50 or cy < -50 or cy > frame_h + 50:
                    dead_ids.append(tid)
                    
        for tid in dead_ids:
            del self.tracks[tid]
            
        # 5. Return active visible tracks
        results = []
        for trk in self.tracks.values():
            if trk.lost == 0 or (trk.hits >= 2 and trk.lost <= 4):
                results.append({
                    "id": trk.track_id,
                    "bbox": trk.bbox,
                    "conf": trk.conf,
                    "is_projected": trk.lost > 0,
                })
        return results

# Test on 100 frames of Concourse
cap = cv2.VideoCapture("frontend/public/concourse_crossing.webm")
model = YOLO("ml/detection/weights/best.pt")
tracker = RobustCrowdTracker(max_lost=25)

frame_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
frame_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

print("Testing RobustCrowdTracker on concourse_crossing.webm (first 100 frames)...")
counts = []
for f_idx in range(100):
    ret, frame = cap.read()
    if not ret:
        break
    res = model(frame, conf=0.12, iou=0.45, imgsz=960, classes=[0, 1], verbose=False)[0]
    raw_b = res.boxes.xyxy.cpu().numpy()
    raw_c = res.boxes.conf.cpu().numpy()
    raw_cls = res.boxes.cls.int().cpu().numpy()
    
    fused_dets = tracker.fuse_and_filter(raw_b, raw_c, raw_cls, frame_w, frame_h)
    active = tracker.update(fused_dets, frame_w, frame_h)
    counts.append(len(active))
    
    if f_idx % 20 == 0:
        print(f"Frame {f_idx:03d}: {len(active)} active tracks, total IDs created so far: {tracker.next_id - 1}")

cap.release()
print(f"Average active tracks: {np.mean(counts):.1f}")
print(f"Total unique IDs spawned across 100 frames: {tracker.next_id - 1}")
