"""
Generates visual comparison snapshots from the newly generated telemetry files
on the exact frames from the user's screenshots, demonstrating:
1. The middle void in Concourse is completely filled with detected pedestrians.
2. The corridor duplicate stacked boxes are eliminated.
3. The zone polygon covers the entire pedestrian corridor and counts accurately.
"""

import cv2
import json
import numpy as np

# 1. Concourse Frame at 13.92s (Frame 348)
cap_con = cv2.VideoCapture("frontend/public/concourse_crossing.webm")
cap_con.set(cv2.CAP_PROP_POS_FRAMES, 348)
ret, frame_con = cap_con.read()
cap_con.release()

if ret:
    h, w = frame_con.shape[:2]
    with open("frontend/public/telemetry_concourse.json") as f:
        data_con = json.load(f)
        
    # Find keyframe closest to 13.92s
    kf = min(data_con["timeline"], key=lambda k: abs(k["time"] - 13.92))
    print(f"Concourse matched keyframe at time {kf['time']}s with {len(kf['boxes'])} boxes")
    
    out_con = frame_con.copy()
    for b in kf["boxes"]:
        x1 = int((b["x"] / 100.0) * w)
        y1 = int((b["y"] / 100.0) * h)
        bw = int((b["w"] / 100.0) * w)
        bh = int((b["h"] / 100.0) * h)
        x2 = x1 + bw
        y2 = y1 + bh
        
        cv2.rectangle(out_con, (x1, y1), (x2, y2), (0, 255, 128), 1)
        label = f"{b['label']} {b['conf']}%"
        cv2.putText(out_con, label, (x1, max(10, y1 - 2)), cv2.FONT_HERSHEY_SIMPLEX, 0.28, (0, 255, 128), 1)
        
    # Draw zone polygon [(4, 10), (96, 10), (96, 96), (4, 96)]
    pts = np.array([
        [int(0.04 * w), int(0.10 * h)],
        [int(0.96 * w), int(0.10 * h)],
        [int(0.96 * w), int(0.96 * h)],
        [int(0.04 * w), int(0.96 * h)]
    ], np.int32)
    cv2.polylines(out_con, [pts], isClosed=True, color=(255, 100, 255), thickness=2)
    
    header = f"SAFECROWD DUAL-ANCHOR AI: {len(kf['boxes'])} PAX DETECTED & TRACKED"
    cv2.putText(out_con, header, (20, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (0, 255, 255), 2)
    cv2.imwrite("backend/snapshots/concourse_verified_f348.jpg", out_con)
    print("Saved backend/snapshots/concourse_verified_f348.jpg")

# 2. Corridor Frame at 6.25s (Frame 150)
cap_cor = cv2.VideoCapture("frontend/public/corridor_chokepoint.webm")
cap_cor.set(cv2.CAP_PROP_POS_FRAMES, 150)
ret_c, frame_cor = cap_cor.read()
cap_cor.release()

if ret_c:
    hc, wc = frame_cor.shape[:2]
    with open("frontend/public/telemetry_corridor.json") as f:
        data_cor = json.load(f)
        
    kf_c = min(data_cor["timeline"], key=lambda k: abs(k["time"] - 6.25))
    print(f"Corridor matched keyframe at time {kf_c['time']}s with {len(kf_c['boxes'])} boxes")
    
    out_cor = frame_cor.copy()
    for b in kf_c["boxes"]:
        x1 = int((b["x"] / 100.0) * wc)
        y1 = int((b["y"] / 100.0) * hc)
        bw = int((b["w"] / 100.0) * wc)
        bh = int((b["h"] / 100.0) * hc)
        x2 = x1 + bw
        y2 = y1 + bh
        
        cv2.rectangle(out_cor, (x1, y1), (x2, y2), (0, 255, 128), 2)
        label = f"{b['label']} {b['conf']}%"
        cv2.putText(out_cor, label, (x1, max(12, y1 - 4)), cv2.FONT_HERSHEY_SIMPLEX, 0.38, (0, 255, 128), 1)
        
    # Draw zone polygon [(4, 15), (96, 15), (96, 96), (4, 96)]
    pts_c = np.array([
        [int(0.04 * wc), int(0.15 * hc)],
        [int(0.96 * wc), int(0.15 * hc)],
        [int(0.96 * wc), int(0.96 * hc)],
        [int(0.04 * wc), int(0.96 * hc)]
    ], np.int32)
    cv2.polylines(out_cor, [pts_c], isClosed=True, color=(255, 180, 0), thickness=2)
    
    header_c = f"SAFECROWD CHOKEPOINT AI: {len(kf_c['boxes'])} PAX (CONTAINMENT SUPPRESSED)"
    cv2.putText(out_cor, header_c, (20, 35), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (0, 255, 255), 2)
    cv2.imwrite("backend/snapshots/corridor_verified_f150.jpg", out_cor)
    print("Saved backend/snapshots/corridor_verified_f150.jpg")
