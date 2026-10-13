"""
Visualizes and evaluates:
1. Baseline detection (pedestrian only, classes=[0], standard NMS)
2. Dual-anchor fusion (classes=[0, 1] + Head-to-Body projection + Containment Suppression)
Saves comparison snapshots for both Concourse and Corridor.
"""

import cv2
import numpy as np
from ultralytics import YOLO
import os

os.makedirs("backend/snapshots", exist_ok=True)
model = YOLO("ml/detection/weights/best.pt")

def compute_ios(box1, box2):
    """Intersection over Smaller box area"""
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

def fuse_detections(raw_boxes, raw_confs, raw_classes, frame_w, frame_h, ios_thresh=0.60, conf_thresh=0.15):
    """
    Fuses Class 0 (pedestrian) and Class 1 (head):
    1. Separate pedestrian boxes and head boxes.
    2. Containment suppression on pedestrian boxes to eliminate upper-body/duplicate splits.
    3. Match head boxes to pedestrian boxes.
    4. For unmatched head boxes (occluded bodies in dense crowds), project proxy pedestrian boxes.
    5. Final pass containment suppression.
    """
    peds = []
    heads = []
    
    for box, conf, cls_id in zip(raw_boxes, raw_confs, raw_classes):
        if conf < conf_thresh:
            continue
        if cls_id == 0:
            peds.append({"bbox": list(box), "conf": float(conf), "cls": 0})
        elif cls_id == 1:
            heads.append({"bbox": list(box), "conf": float(conf), "cls": 1})
            
    # Sort peds by confidence descending
    peds.sort(key=lambda x: x["conf"], reverse=True)
    
    # 1. Containment suppression on pedestrian boxes
    filtered_peds = []
    for p in peds:
        box_p = p["bbox"]
        suppress = False
        for kept in filtered_peds:
            ios = compute_ios(box_p, kept["bbox"])
            if ios > ios_thresh:
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
            # If head center is within the upper 60% of the pedestrian box
            if pbx[0] <= hcx <= pbx[2] and pbx[1] <= hcy <= (pbx[1] + (pbx[3] - pbx[1]) * 0.65):
                matched = True
                break
            # Or if IoS between head and pedestrian box is > 0.50
            if compute_ios(h_box, pbx) > 0.50:
                matched = True
                break
                
        if not matched:
            unmatched_heads.append(h)
            
    print(f"Total raw peds: {len(peds)} -> Filtered: {len(filtered_peds)} | Heads: {len(heads)} -> Unmatched: {len(unmatched_heads)}")
    
    # 3. Synthesize proxy pedestrian boxes for unmatched heads (dense crowd occlusion)
    projected_peds = []
    for h in unmatched_heads:
        hx1, hy1, hx2, hy2 = h["bbox"]
        hw = hx2 - hx1
        hh = hy2 - hy1
        hcx = (hx1 + hx2) / 2.0
        
        # In elevated crowd views, full body height is ~3.2x to 3.8x head height, width is ~1.6x head width
        pw = hw * 1.6
        ph = hh * 3.4
        
        px1 = max(0.0, hcx - pw / 2.0)
        px2 = min(float(frame_w), hcx + pw / 2.0)
        py1 = max(0.0, hy1)
        py2 = min(float(frame_h), hy1 + ph)
        
        projected_box = [px1, py1, px2, py2]
        
        # Check if projected box overlaps significantly with any already existing pedestrian
        suppress = False
        for kept in filtered_peds:
            if compute_ios(projected_box, kept["bbox"]) > 0.65:
                suppress = True
                break
        if not suppress:
            projected_peds.append({
                "bbox": projected_box,
                "conf": round(h["conf"] * 0.95, 3), # high confidence from head
                "cls": 0,
                "from_head": True,
            })
            
    final_boxes = filtered_peds + projected_peds
    print(f"Final fused pedestrian count: {len(final_boxes)} (original filtered: {len(filtered_peds)} + synthesized from occluded heads: {len(projected_peds)})")
    return final_boxes

def draw_boxes(img, boxes, title=""):
    out = img.copy()
    for b in boxes:
        x1, y1, x2, y2 = [int(v) for v in b["bbox"]]
        is_synth = b.get("from_head", False)
        color = (0, 165, 255) if is_synth else (0, 255, 128) # orange for synthesized from occluded head, bright green for detected body
        cv2.rectangle(out, (x1, y1), (x2, y2), color, 2)
        label = f"{int(b['conf']*100)}%"
        cv2.putText(out, label, (x1, max(12, y1 - 4)), cv2.FONT_HERSHEY_SIMPLEX, 0.35, color, 1)
        
    cv2.putText(out, f"{title}: {len(boxes)} PAX", (20, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)
    return out

# Process Concourse Frame 250
cap = cv2.VideoCapture("frontend/public/concourse_crossing.webm")
cap.set(cv2.CAP_PROP_POS_FRAMES, 250)
ret, frame_concourse = cap.read()
cap.release()

if ret:
    h, w = frame_concourse.shape[:2]
    # Baseline
    res_base = model(frame_concourse, conf=0.18, iou=0.60, imgsz=960, classes=[0], verbose=False)[0]
    base_boxes = [{"bbox": list(b), "conf": float(c), "cls": 0} for b, c in zip(res_base.boxes.xyxy.cpu().numpy(), res_base.boxes.conf.cpu().numpy())]
    img_concourse_base = draw_boxes(frame_concourse, base_boxes, "Baseline Pedestrian-Only (classes=[0])")
    cv2.imwrite("backend/snapshots/concourse_baseline.jpg", img_concourse_base)
    
    # Fused
    res_dual = model(frame_concourse, conf=0.14, iou=0.45, imgsz=960, classes=[0, 1], verbose=False)[0]
    fused_concourse = fuse_detections(
        res_dual.boxes.xyxy.cpu().numpy(),
        res_dual.boxes.conf.cpu().numpy(),
        res_dual.boxes.cls.int().cpu().numpy(),
        w, h, ios_thresh=0.60, conf_thresh=0.14
    )
    img_concourse_fused = draw_boxes(frame_concourse, fused_concourse, "Dual-Anchor Fused (Pedestrian + Head Proxy)")
    cv2.imwrite("backend/snapshots/concourse_fused.jpg", img_concourse_fused)

# Process Corridor Frame 150
cap_c = cv2.VideoCapture("frontend/public/corridor_chokepoint.webm")
cap_c.set(cv2.CAP_PROP_POS_FRAMES, 150)
ret_c, frame_corridor = cap_c.read()
cap_c.release()

if ret_c:
    hc, wc = frame_corridor.shape[:2]
    # Baseline
    res_c_base = model(frame_corridor, conf=0.18, iou=0.60, imgsz=960, classes=[0], verbose=False)[0]
    base_c_boxes = [{"bbox": list(b), "conf": float(c), "cls": 0} for b, c in zip(res_c_base.boxes.xyxy.cpu().numpy(), res_c_base.boxes.conf.cpu().numpy())]
    img_corridor_base = draw_boxes(frame_corridor, base_c_boxes, "Baseline Corridor (classes=[0])")
    cv2.imwrite("backend/snapshots/corridor_baseline.jpg", img_corridor_base)
    
    # Fused
    res_c_dual = model(frame_corridor, conf=0.16, iou=0.45, imgsz=960, classes=[0, 1], verbose=False)[0]
    fused_corridor = fuse_detections(
        res_c_dual.boxes.xyxy.cpu().numpy(),
        res_c_dual.boxes.conf.cpu().numpy(),
        res_c_dual.boxes.cls.int().cpu().numpy(),
        wc, hc, ios_thresh=0.55, conf_thresh=0.16
    )
    img_corridor_fused = draw_boxes(frame_corridor, fused_corridor, "Containment Suppressed + Fused Corridor")
    cv2.imwrite("backend/snapshots/corridor_fused.jpg", img_corridor_fused)
    
print("\nSnapshots saved to backend/snapshots/")
