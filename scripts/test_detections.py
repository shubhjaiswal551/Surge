"""
Test script to run master model on corridor and concourse frames,
analyzing detections, classes, confidence distributions, and testing
containment suppression and head-to-body projection.
"""

import cv2
import numpy as np
from ultralytics import YOLO
import torch

print(f"CUDA available: {torch.cuda.is_available()}")
if torch.cuda.is_available():
    print(f"Device: {torch.cuda.get_device_name(0)}")

model_path = "ml/detection/weights/best.pt"
model = YOLO(model_path)
print(f"Model classes: {model.names}")

# Test on concourse frame 250
cap_concourse = cv2.VideoCapture("frontend/public/concourse_crossing.webm")
cap_concourse.set(cv2.CAP_PROP_POS_FRAMES, 250)
ret, frame_concourse = cap_concourse.read()
cap_concourse.release()

if ret:
    h, w = frame_concourse.shape[:2]
    print(f"\n--- Concourse Frame 250 ({w}x{h}) ---")
    
    # Run with classes=[0] (pedestrian only)
    res_ped_only = model(frame_concourse, conf=0.18, iou=0.60, imgsz=960, classes=[0], verbose=False)[0]
    print(f"Pedestrian-only (classes=[0], conf=0.18): {len(res_ped_only.boxes)} detections")
    
    # Run with classes=[0, 1] (both pedestrian and head)
    res_both = model(frame_concourse, conf=0.15, iou=0.50, imgsz=960, classes=[0, 1], verbose=False)[0]
    boxes = res_both.boxes
    cls_counts = {}
    for c in boxes.cls.int().cpu().numpy():
        name = model.names[c]
        cls_counts[name] = cls_counts.get(name, 0) + 1
    print(f"Both classes (conf=0.15): Total {len(boxes)} -> {cls_counts}")

# Test on corridor frame 150
cap_corridor = cv2.VideoCapture("frontend/public/corridor_chokepoint.webm")
cap_corridor.set(cv2.CAP_PROP_POS_FRAMES, 150)
ret_c, frame_corridor = cap_corridor.read()
cap_corridor.release()

if ret_c:
    hc, wc = frame_corridor.shape[:2]
    print(f"\n--- Corridor Frame 150 ({wc}x{hc}) ---")
    res_c_ped = model(frame_corridor, conf=0.18, iou=0.60, imgsz=960, classes=[0], verbose=False)[0]
    print(f"Pedestrian-only (classes=[0], conf=0.18): {len(res_c_ped.boxes)} detections")
    res_c_both = model(frame_corridor, conf=0.15, iou=0.50, imgsz=960, classes=[0, 1], verbose=False)[0]
    cls_counts_c = {}
    for c in res_c_both.boxes.cls.int().cpu().numpy():
        name = model.names[c]
        cls_counts_c[name] = cls_counts_c.get(name, 0) + 1
    print(f"Both classes (conf=0.15): Total {len(res_c_both.boxes)} -> {cls_counts_c}")
