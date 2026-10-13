"""
Find the exact frame from Image 2 in concourse_crossing.webm,
and inspect the raw model detections vs tracker outputs in the middle region.
"""

import cv2
import numpy as np
from ultralytics import YOLO

cap = cv2.VideoCapture("frontend/public/concourse_crossing.webm")
fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
print(f"Total frames: {total_frames}, FPS: {fps}")

# We will sample frames every 50 frames and check
model = YOLO("ml/detection/weights/best.pt")

# In Image 2, track IDs like #33056, #33085, #33207, #33070 are visible.
# Notice those track IDs are around 33000!
# Why are track IDs in the 30,000s?
# Because in telemetry_concourse.json, ByteTrack was creating dozens of new track IDs every frame!
# Let's inspect telemetry_concourse.json around where IDs are 33000!

import json
with open("frontend/public/telemetry_concourse.json") as f:
    data = json.load(f)

timeline = data["timeline"]
print(f"Timeline length: {len(timeline)} frames")

# Find keyframes where box IDs are around 33000 or track #33056 appears
found_time = None
for kf in timeline:
    for b in kf["boxes"]:
        if b["id"] == 33056 or b.get("label") == "#33056" or b["id"] == 33085:
            found_time = kf["time"]
            print(f"Found match at time: {found_time}s! Num boxes: {len(kf['boxes'])}")
            break
    if found_time:
        break

if found_time is not None:
    frame_no = int(round(found_time * fps))
    print(f"Corresponding frame number: {frame_no}")
    cap.set(cv2.CAP_PROP_POS_FRAMES, frame_no)
    ret, frame = cap.read()
    if ret:
        cv2.imwrite("backend/snapshots/image2_matched_frame.jpg", frame)
        print("Saved backend/snapshots/image2_matched_frame.jpg")
        
        # Now analyze this exact frame!
        h, w = frame.shape[:2]
        
        # 1. Raw detection with pedestrian only (classes=[0], conf=0.18)
        res_p = model(frame, conf=0.18, iou=0.60, imgsz=960, classes=[0], verbose=False)[0]
        print(f"Raw pedestrian-only detections: {len(res_p.boxes)}")
        
        # 2. Raw detection with lower conf (conf=0.10)
        res_p_low = model(frame, conf=0.10, iou=0.50, imgsz=960, classes=[0], verbose=False)[0]
        print(f"Raw pedestrian-only (conf=0.10): {len(res_p_low.boxes)}")
        
        # 3. Raw detection with classes=[0, 1] (both pedestrian and head, conf=0.12)
        res_both = model(frame, conf=0.12, iou=0.45, imgsz=960, classes=[0, 1], verbose=False)[0]
        c0 = sum(1 for c in res_both.boxes.cls.int().cpu().numpy() if c == 0)
        c1 = sum(1 for c in res_both.boxes.cls.int().cpu().numpy() if c == 1)
        print(f"Raw both classes (conf=0.12): Total {len(res_both.boxes)} -> {c0} pedestrians, {c1} heads")
        
        # Inspect the middle area (x between 30% and 55%, y between 40% and 75%)
        # Let's count how many detections fall in this middle area:
        mid_x1, mid_x2 = int(0.28 * w), int(0.55 * w)
        mid_y1, mid_y2 = int(0.38 * h), int(0.72 * h)
        
        # In baseline
        base_mid = 0
        for b in res_p.boxes.xyxy.cpu().numpy():
            cx = (b[0] + b[2]) / 2
            cy = (b[1] + b[3]) / 2
            if mid_x1 <= cx <= mid_x2 and mid_y1 <= cy <= mid_y2:
                base_mid += 1
        print(f"Middle zone detections (Baseline conf=0.18, classes=[0]): {base_mid}")
        
        # In dual-class
        both_mid_p = 0
        both_mid_h = 0
        for b, c in zip(res_both.boxes.xyxy.cpu().numpy(), res_both.boxes.cls.int().cpu().numpy()):
            cx = (b[0] + b[2]) / 2
            cy = (b[1] + b[3]) / 2
            if mid_x1 <= cx <= mid_x2 and mid_y1 <= cy <= mid_y2:
                if c == 0:
                    both_mid_p += 1
                else:
                    both_mid_h += 1
        print(f"Middle zone detections (Both classes conf=0.12): {both_mid_p} pedestrians, {both_mid_h} heads!")

cap.release()
