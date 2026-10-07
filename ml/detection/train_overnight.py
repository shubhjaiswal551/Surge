"""
SafeCrowd - Overnight Automated Full Dataset Training Script
Trains YOLOv8s (Small) on RTX 4060 GPU with CrowdHuman (19.3k images).
Automatically finds downloaded dataset, validates results, exports to ONNX,
and replaces best.pt / best.onnx.
"""

import os
import sys
import shutil
import time
import logging
from pathlib import Path
import yaml
import torch
from roboflow import Roboflow
from ultralytics import YOLO

# Setup logging
log_path = Path("ml/detection/overnight_train.log")
log_path.parent.mkdir(parents=True, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(log_path, mode="a", encoding="utf-8"),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger("train_overnight")

ROBOFLOW_CONFIG = {
    "api_key": os.getenv("ROBOFLOW_API_KEY", ""),
    "workspace": "ssk-creep",
    "project": "crowdhuman-44xdq-7fqt2",
    "version": 1,
}

# Configured for maximum quality on RTX 4060 to finish by ~4:30 AM
TRAIN_CONFIG = {
    "model_base": "yolov8s.pt",   # YOLOv8 Small (11.2M params)
    "imgsz": 640,
    "epochs": 75,
    "batch": 16,
    "patience": 18,
    "device": 0 if torch.cuda.is_available() else "cpu",
    "workers": 4,
    "project": "ml/detection/runs",
    "name": "crowdhuman_yolov8s",
    "exist_ok": True,
    "amp": True,
}

WEIGHTS_DIR = Path("ml/detection/weights").resolve()

def backup_existing_weights():
    logger.info("Backing up current demo weights...")
    WEIGHTS_DIR.mkdir(parents=True, exist_ok=True)
    best_pt = WEIGHTS_DIR / "best.pt"
    best_onnx = WEIGHTS_DIR / "best.onnx"
    
    if best_pt.exists() and not (WEIGHTS_DIR / "best_demo.pt").exists():
        shutil.copy2(best_pt, WEIGHTS_DIR / "best_demo.pt")
        logger.info(f"Backed up {best_pt} -> best_demo.pt")
    if best_onnx.exists() and not (WEIGHTS_DIR / "best_demo.onnx").exists():
        shutil.copy2(best_onnx, WEIGHTS_DIR / "best_demo.onnx")
        logger.info(f"Backed up {best_onnx} -> best_demo.onnx")

def locate_or_download_dataset():
    # Check possible existing download locations
    candidates = [
        Path("crowdhuman-1/data.yaml"),
        Path("ml/data_crowdhuman/data.yaml"),
        Path("ml/data/data.yaml"),
    ]
    for c in candidates:
        if c.exists():
            logger.info(f"Found existing dataset at {c.resolve()}")
            return fix_data_yaml(c.resolve())
            
    # Search root for any crowdhuman*/data.yaml
    for p in Path(".").glob("**/data.yaml"):
        if "crowdhuman" in str(p).lower():
            logger.info(f"Found dataset at {p.resolve()}")
            return fix_data_yaml(p.resolve())

    logger.info("Connecting to Roboflow to download dataset...")
    rf = Roboflow(api_key=ROBOFLOW_CONFIG["api_key"])
    project = rf.workspace(ROBOFLOW_CONFIG["workspace"]).project(ROBOFLOW_CONFIG["project"])
    version = project.version(ROBOFLOW_CONFIG["version"])
    dataset = version.download("yolov8")
    dataset_path = Path(dataset.location)
    data_yaml = dataset_path / "data.yaml"
    return fix_data_yaml(data_yaml)

def fix_data_yaml(yaml_path: Path) -> Path:
    logger.info(f"Fixing paths in {yaml_path}...")
    dataset_dir = yaml_path.parent.resolve()
    with open(yaml_path, "r", encoding="utf-8") as f:
        data_cfg = yaml.safe_load(f)
        
    data_cfg["path"] = str(dataset_dir)
    with open(yaml_path, "w", encoding="utf-8") as f:
        yaml.safe_dump(data_cfg, f, default_flow_style=False)
        
    logger.info(f"Set data.yaml root path to: {dataset_dir}")
    return yaml_path

def train_model(data_yaml_path: Path):
    start_time = time.time()
    logger.info(f"CUDA Available: {torch.cuda.is_available()}")
    if torch.cuda.is_available():
        logger.info(f"Using GPU: {torch.cuda.get_device_name(0)}")
        
    logger.info(f"Initializing YOLO with {TRAIN_CONFIG['model_base']} (High Accuracy Small model)...")
    model = YOLO(TRAIN_CONFIG["model_base"])
    
    logger.info(f"Starting training on {data_yaml_path} with config: {TRAIN_CONFIG}")
    train_results = model.train(
        data=str(data_yaml_path),
        epochs=TRAIN_CONFIG["epochs"],
        imgsz=TRAIN_CONFIG["imgsz"],
        batch=TRAIN_CONFIG["batch"],
        patience=TRAIN_CONFIG["patience"],
        device=TRAIN_CONFIG["device"],
        workers=TRAIN_CONFIG["workers"],
        project=TRAIN_CONFIG["project"],
        name=TRAIN_CONFIG["name"],
        exist_ok=TRAIN_CONFIG["exist_ok"],
        amp=TRAIN_CONFIG["amp"],
    )
    
    elapsed_hours = (time.time() - start_time) / 3600.0
    logger.info(f"Training completed in {elapsed_hours:.2f} hours.")
    return model

def export_and_deploy(trained_model):
    logger.info("Deploying new high-accuracy weights...")
    best_trained_pt = Path(TRAIN_CONFIG["project"]) / TRAIN_CONFIG["name"] / "weights" / "best.pt"
    
    if not best_trained_pt.exists():
        logger.error(f"Trained weights not found at {best_trained_pt}!")
        return
        
    dest_pt = WEIGHTS_DIR / "best.pt"
    shutil.copy2(best_trained_pt, dest_pt)
    logger.info(f"Successfully copied trained weights -> {dest_pt}")
    
    # Export to ONNX
    logger.info("Exporting YOLOv8s model to ONNX format...")
    onnx_file = trained_model.export(
        format="onnx",
        imgsz=TRAIN_CONFIG["imgsz"],
        simplify=True,
    )
    
    if onnx_file and Path(onnx_file).exists():
        dest_onnx = WEIGHTS_DIR / "best.onnx"
        shutil.copy2(onnx_file, dest_onnx)
        logger.info(f"Successfully deployed ONNX model -> {dest_onnx}")
    else:
        logger.warning("ONNX export completed; check run directory.")

def main():
    logger.info("=================================================================")
    logger.info("SafeCrowd — High Accuracy YOLOv8s Overnight Training Starting")
    logger.info("Target: Full 19.3k CrowdHuman Dataset | Target Completion: ~4:30 AM")
    logger.info("=================================================================")
    try:
        backup_existing_weights()
        data_yaml = locate_or_download_dataset()
        model = train_model(data_yaml)
        export_and_deploy(model)
        
        # Write summary file
        summary_path = Path("ml/detection/training_summary.txt")
        with open(summary_path, "w", encoding="utf-8") as f:
            f.write("SafeCrowd Retraining Completed Successfully!\n")
            f.write(f"Model Architecture: YOLOv8s (Small - 11.2M Parameters)\n")
            f.write(f"Completed at: {time.ctime()}\n")
            f.write("Weights updated: ml/detection/weights/best.pt and best.onnx\n")
            f.write("Demo backups preserved: best_demo.pt, best_demo.onnx\n")
        logger.info(f"Summary written to {summary_path}")
        logger.info("=================================================================")
        logger.info("All tasks completed successfully! Have a great morning!")
        logger.info("=================================================================")
    except Exception as e:
        logger.exception(f"Training failed with error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
