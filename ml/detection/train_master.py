"""
SafeCrowd - Master High-Angle CCTV & Head YOLOv8 Training Script
Trains YOLOv8s on the combined VisDrone + Top-Down Head + Dense Crowd dataset
Exports fine-tuned weights to PyTorch (best.pt) and optimized ONNX (best.onnx).
"""

import sys
import logging
from pathlib import Path
import torch
from ultralytics import YOLO

BASE_DIR = Path(__file__).resolve().parent.parent.parent
DATA_YAML = Path("ml/datasets/cctv_master/cctv_master.yaml").resolve()
RUNS_DIR = Path("ml/detection/runs").resolve()
WEIGHTS_DIR = Path("ml/detection/weights").resolve()
LOG_FILE = Path("ml/detection/master_train.log").resolve()

LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
RUNS_DIR.mkdir(parents=True, exist_ok=True)
WEIGHTS_DIR.mkdir(parents=True, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE, mode="a", encoding="utf-8"),
        logging.StreamHandler(sys.stdout),
    ]
)
logger = logging.getLogger("master_train")

def run_training():
    logger.info("=" * 65)
    logger.info("Starting SafeCrowd Master High-Angle CCTV & Head Training Run")
    logger.info("=" * 65)

    if not DATA_YAML.exists():
        logger.error(f"Dataset recipe {DATA_YAML} not found! Run build_master_dataset.py first.")
        sys.exit(1)

    device_id = 0 if torch.cuda.is_available() else "cpu"
    device_name = torch.cuda.get_device_name(0) if torch.cuda.is_available() else "CPU"
    logger.info(f"Target Compute Device: {device_name} (device={device_id})")

    # Start from current fine-tuned CrowdHuman weights for faster convergence
    base_weights = WEIGHTS_DIR / "best.pt"
    if not base_weights.exists():
        base_weights = "yolov8s.pt"
    else:
        base_weights = str(base_weights)

    logger.info(f"Loading base weights: {base_weights}")
    model = YOLO(base_weights)

    # High-Angle CCTV Master Training Configuration
    results = model.train(
        data=str(DATA_YAML),
        epochs=10,
        imgsz=640,
        batch=16,
        device=device_id,
        workers=4,
        project=str(RUNS_DIR),
        name="high_angle_master_mot20",
        exist_ok=True,
        amp=True,
        patience=5,
        optimizer="AdamW",
        lr0=0.001,
        lrf=0.01,
        save=True,
        plots=True,
        verbose=True,
    )

    logger.info("Training finished. Exporting best weights...")
    best_trained_pt = RUNS_DIR / "high_angle_master_mot20" / "weights" / "best.pt"
    if best_trained_pt.exists():
        # Export ONNX for high-speed inference runtime
        export_model = YOLO(str(best_trained_pt))
        export_model.export(format="onnx", simplify=True, dynamic=False, opset=12)

        # Update production weights in weights/
        prod_pt = WEIGHTS_DIR / "best.pt"
        prod_onnx = WEIGHTS_DIR / "best.onnx"
        
        # Backup old weights
        backup_pt = WEIGHTS_DIR / "best_prev.pt"
        backup_onnx = WEIGHTS_DIR / "best_prev.onnx"
        if prod_pt.exists():
            import shutil
            shutil.copy2(prod_pt, backup_pt)
        if prod_onnx.exists():
            import shutil
            shutil.copy2(prod_onnx, backup_onnx)

        import shutil
        shutil.copy2(best_trained_pt, prod_pt)
        trained_onnx = RUNS_DIR / "high_angle_master_mot20" / "weights" / "best.onnx"
        if trained_onnx.exists():
            shutil.copy2(trained_onnx, prod_onnx)

        logger.info(f"[SUCCESS] Updated production weights at {prod_pt} and {prod_onnx}")
    else:
        logger.warning("Could not find best.pt in runs directory.")

if __name__ == "__main__":
    run_training()
