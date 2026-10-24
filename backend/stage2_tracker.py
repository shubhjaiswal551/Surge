"""
Surge - Stage 2: Tracking & Analytics Pipeline
Integrates fine-tuned YOLO person detector (best.pt) with ByteTrack.
Computes:
  - Multi-person tracking across frames
  - Real-time headcount
  - Density classification (low, moderate, high, critical)
  - Dominant flow vector / direction (in degrees 0-360)
  - 5x5 zone spatial density heatmap
  - Surge & anomaly detection
"""

import math
from pathlib import Path
from typing import Dict, List, Tuple, Optional
import cv2
import numpy as np
import torch
from ultralytics import YOLO

class SurgeTracker:
    def __init__(
        self,
        weights_path: str = "backend/models/best.pt",
        conf_threshold: float = 0.25,
        iou_threshold: float = 0.5,
        imgsz: int = 640,
        device: Optional[str] = None
    ):
        self.device = device or ("0" if torch.cuda.is_available() else "cpu")
        print(f"[SurgeTracker] Initializing YOLO with weights: {weights_path} on {self.device}")
        self.model = YOLO(weights_path)
        self.conf = conf_threshold
        self.iou = iou_threshold
        self.imgsz = imgsz
        
        # Track history for flow and velocity calculation: track_id -> list of (x, y) centroids
        self.track_history: Dict[int, List[Tuple[float, float]]] = {}
        self.max_history_len = 15

    def process_frame(
        self,
        frame: np.ndarray,
        camera_id: str = "cam-01",
        zone_name: str = "Main Entrance Gate"
    ) -> Dict:
        """
        Runs YOLO + ByteTrack on a single frame and calculates crowd metrics.
        """
        h, w = frame.shape[:2]

        # Run YOLO with built-in ByteTrack tracker
        # tracker="bytetrack.yaml" is built-in with Ultralytics
        results = self.model.track(
            source=frame,
            conf=self.conf,
            iou=self.iou,
            imgsz=self.imgsz,
            persist=True,
            tracker="bytetrack.yaml",
            device=self.device,
            verbose=False
        )[0]

        headcount = 0
        boxes = []
        track_ids = []
        velocities = []

        if results.boxes is not None and results.boxes.id is not None:
            boxes = results.boxes.xyxy.cpu().numpy()
            track_ids = results.boxes.id.int().cpu().numpy().tolist()
            headcount = len(track_ids)

            # Update centroids & track history
            current_active_ids = set(track_ids)
            for box, track_id in zip(boxes, track_ids):
                x1, y1, x2, y2 = box
                cx = float((x1 + x2) / 2)
                cy = float((y1 + y2) / 2)

                if track_id not in self.track_history:
                    self.track_history[track_id] = []
                self.track_history[track_id].append((cx, cy))

                if len(self.track_history[track_id]) > self.max_history_len:
                    self.track_history[track_id].pop(0)

                # Compute motion vector if at least 2 points
                if len(self.track_history[track_id]) >= 2:
                    p_old = self.track_history[track_id][0]
                    p_new = self.track_history[track_id][-1]
                    dx = p_new[0] - p_old[0]
                    dy = p_new[1] - p_old[1]
                    velocities.append((dx, dy))

            # Prune inactive track IDs
            for tid in list(self.track_history.keys()):
                if tid not in current_active_ids:
                    # remove aged out tracks
                    if len(self.track_history[tid]) > 0:
                        self.track_history[tid].pop(0)
                        if len(self.track_history[tid]) == 0:
                            del self.track_history[tid]

        # Calculate dominant flow direction (angle in degrees 0-360)
        dominant_direction = 0.0
        avg_speed = 0.0
        if velocities:
            mean_dx = float(np.mean([v[0] for v in velocities]))
            mean_dy = float(np.mean([v[1] for v in velocities]))
            avg_speed = float(np.sqrt(mean_dx**2 + mean_dy**2))
            angle_rad = math.atan2(mean_dy, mean_dx)
            dominant_direction = round((math.degrees(angle_rad) + 360) % 360, 1)

        # Calculate 5x5 spatial heatmap
        heatmap_grid = self._compute_heatmap(boxes, w, h, grid_size=5)

        # Classify density level
        density_level = self._classify_density(headcount)

        # Anomaly / Surge decision rule (PRD compliant with velocity variance)
        anomaly, anomaly_type, severity = self._detect_anomaly(headcount, density_level, avg_speed, velocities=velocities)

        # Annotated visualization frame
        annotated_frame = results.plot()

        return {
            "cameraId": camera_id,
            "zoneName": zone_name,
            "headcount": headcount,
            "density": density_level,
            "flowDirection": dominant_direction,
            "avgSpeed": avg_speed,
            "heatmap": heatmap_grid,
            "anomaly": anomaly,
            "anomalyType": anomaly_type,
            "severity": severity,
            "annotated_frame": annotated_frame,
            "boxes_count": len(boxes)
        }

    def _compute_heatmap(self, boxes, width: int, height: int, grid_size: int = 5) -> List[List[float]]:
        """Computes normalized 5x5 density matrix from bounding box centroids."""
        grid = np.zeros((grid_size, grid_size), dtype=np.float32)
        if len(boxes) == 0:
            return grid.tolist()

        for box in boxes:
            cx = (box[0] + box[2]) / 2.0
            cy = (box[1] + box[3]) / 2.0

            col = int(min(grid_size - 1, max(0, (cx / width) * grid_size)))
            row = int(min(grid_size - 1, max(0, (cy / height) * grid_size)))
            grid[row, col] += 1.0

        max_val = np.max(grid)
        if max_val > 0:
            grid = grid / max_val  # Normalized [0.0 - 1.0]

        return np.round(grid, 2).tolist()

    def _classify_density(self, count: int) -> str:
        """Categorizes headcount into density levels."""
        if count < 15:
            return "low"
        elif count < 35:
            return "moderate"
        elif count < 75:
            return "high"
        else:
            return "critical"

    def _detect_anomaly(
        self, headcount: int, density: str, avg_speed: float, velocities: List[Tuple[float, float]] = None
    ) -> Tuple[bool, Optional[str], Optional[str]]:
        """
        PRD-compliant anomaly detection:
        High density ALONE (e.g. peaceful crowd/queue) is NOT an anomaly.
        Requires high velocity variance, rapid panic dispersal, or complete standstill bottleneck.
        """
        if not velocities or len(velocities) < 3:
            return False, None, None

        # Compute speed variance
        speeds = [math.sqrt(v[0]**2 + v[1]**2) for v in velocities]
        mean_speed = float(np.mean(speeds))
        variance = float(np.var(speeds))

        # 1. Panic Dispersal / Stampede Flight: Sudden high speed and high variance
        if mean_speed > 25.0 and variance > 5.0:
            return True, "Rapid Crowd Dispersal / Panic Flight", "critical"

        # 2. Crowd Surge / Violent Turbulence: High density with erratic chaotic movement
        if density == "critical" and variance > 6.0:
            return True, "Crowd Surge / Compression Wave", "critical"

        if density == "high" and variance > 8.0:
            return True, "Turbulent Crowd Flow / Surge", "high"

        # 3. Severe Bottleneck: Dense crowd brought to a complete crawl
        if density == "critical" and mean_speed < 0.4:
            return True, "Dangerous Bottleneck / Complete Stoppage", "warning"

        # Normal orderly crowd movement (no false alarms)
        return False, None, None


# Backward compatibility alias
SafeCrowdTracker = SurgeTracker


if __name__ == "__main__":
    import argparse
    import time

    parser = argparse.ArgumentParser(description="Run Surge Stage 2 ByteTrack on a video file")
    parser.add_argument("--source", type=str, default="public/12269404_2320_1080_30fps.mp4", help="Path to video or web camera index")
    parser.add_argument("--weights", type=str, default="backend/models/best.pt", help="Path to best.pt")
    parser.add_argument("--display", action="store_true", help="Display OpenCV window")
    args = parser.parse_args()

    cap = cv2.VideoCapture(args.source)
    if not cap.isOpened():
        print(f"Error: Could not open video source {args.source}")
        exit(1)

    tracker = SurgeTracker(weights_path=args.weights)
    fps_start = time.time()
    frame_count = 0

    print("Beginning tracking loop... Press 'q' in OpenCV window or Ctrl+C in terminal to stop.")
    while True:
        ret, frame = cap.read()
        if not ret:
            # loop video
            cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            continue

        frame_count += 1
        data = tracker.process_frame(frame)

        if frame_count % 15 == 0:
            elapsed = time.time() - fps_start
            fps = frame_count / elapsed
            print(f"[Frame {frame_count}] Headcount: {data['headcount']} | Density: {data['density']} | "
                  f"Flow Dir: {data['flowDirection']}° | FPS: {fps:.1f} | Anomaly: {data['anomaly']}")

        if args.display:
            cv2.imshow("Surge Stage 2 - ByteTrack", data["annotated_frame"])
            if cv2.waitKey(1) & 0xFF == ord('q'):
                break

    cap.release()
    cv2.destroyAllWindows()
