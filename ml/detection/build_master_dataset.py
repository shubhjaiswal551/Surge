"""
SafeCrowd - Master Dataset Builder & Unifier
1. Downloads VisDrone (elevated pedestrian & heads)
2. Downloads MOT20 ground truth (dense terminal sequences)
3. Synthesizes Top-Down Head Detection annotations from anatomical geometry & boxes
4. Builds a unified dual-class dataset:
   Class 0: pedestrian (full-body elevated/top-down)
   Class 1: head (head-and-shoulders keypoint/box for tight crush tracking)
"""

import os
import sys
import shutil
import urllib.request
import zipfile
from pathlib import Path
from PIL import Image

BASE_DIR = Path(__file__).resolve().parent.parent
RAW_DIR = BASE_DIR / "datasets" / "raw"
DATASET_DIR = BASE_DIR / "datasets" / "cctv_master"
RAW_DIR.mkdir(parents=True, exist_ok=True)
DATASET_DIR.mkdir(parents=True, exist_ok=True)

def download_file(url: str, dest_path: Path):
    if dest_path.exists() and dest_path.stat().st_size > 1000:
        print(f"[*] Already exists: {dest_path.name} ({round(dest_path.stat().st_size / (1024*1024), 1)} MB)")
        return
    print(f"[>] Downloading: {url} -> {dest_path.name}...")
    def _reporthook(blocknum, blocksize, totalsize):
        read = blocknum * blocksize
        if totalsize > 0 and blocknum % 500 == 0:
            percent = min(100.0, read * 100.0 / totalsize)
            mb = read / (1024 * 1024)
            total_mb = totalsize / (1024 * 1024)
            sys.stdout.write(f"\r    Progress: {percent:.1f}% ({mb:.1f} / {total_mb:.1f} MB)")
            sys.stdout.flush()
    urllib.request.urlretrieve(url, dest_path, reporthook=_reporthook)
    print("\n    Download complete.")

def extract_zip(zip_path: Path, extract_to: Path):
    print(f"[*] Extracting {zip_path.name} to {extract_to}...")
    with zipfile.ZipFile(zip_path, 'r') as zip_ref:
        zip_ref.extractall(extract_to)
    print("    Extraction finished.")

def convert_visdrone():
    """Processes VisDrone train & val images into unified format (Class 0: pedestrian, Class 1: head)."""
    visdrone_urls = {
        "train": "https://github.com/ultralytics/assets/releases/download/v0.0.0/VisDrone2019-DET-train.zip",
        "val": "https://github.com/ultralytics/assets/releases/download/v0.0.0/VisDrone2019-DET-val.zip",
    }

    for split, url in visdrone_urls.items():
        zip_file = RAW_DIR / f"VisDrone2019-DET-{split}.zip"
        download_file(url, zip_file)
        extract_folder = RAW_DIR / f"VisDrone_{split}"
        if not extract_folder.exists():
            extract_zip(zip_file, extract_folder)

        source_dir = extract_folder / f"VisDrone2019-DET-{split}"
        if not source_dir.exists():
            source_dir = extract_folder

        img_src = source_dir / "images"
        anno_src = source_dir / "annotations"

        out_img_dir = DATASET_DIR / "images" / split
        out_lbl_dir = DATASET_DIR / "labels" / split
        out_img_dir.mkdir(parents=True, exist_ok=True)
        out_lbl_dir.mkdir(parents=True, exist_ok=True)

        print(f"[*] Processing VisDrone {split} split...")
        count = 0
        for txt_file in anno_src.glob("*.txt"):
            img_file = img_src / f"{txt_file.stem}.jpg"
            if not img_file.exists():
                continue

            try:
                with Image.open(img_file) as im:
                    w_img, h_img = im.size
            except Exception:
                continue

            dw = 1.0 / w_img
            dh = 1.0 / h_img

            yolo_lines = []
            with open(txt_file, "r", encoding="utf-8") as tf:
                for line in tf:
                    parts = [p.strip() for p in line.split(",") if p.strip()]
                    if len(parts) < 8:
                        continue
                    # VisDrone format: <bbox_left>,<bbox_top>,<bbox_width>,<bbox_height>,<score>,<object_category>,<truncation>,<occlusion>
                    score = parts[4]
                    category = int(parts[5])
                    # Category 1 = pedestrian, Category 2 = people
                    if score == "0" or category not in (1, 2):
                        continue

                    bx, by, bw, bh = float(parts[0]), float(parts[1]), float(parts[2]), float(parts[3])
                    if bw < 2 or bh < 2:
                        continue

                    # 1. Full-body pedestrian box (Class 0)
                    cx = (bx + bw / 2.0) * dw
                    cy = (by + bh / 2.0) * dh
                    nw = bw * dw
                    nh = bh * dh
                    yolo_lines.append(f"0 {cx:.6f} {cy:.6f} {nw:.6f} {nh:.6f}\n")

                    # 2. Synthesized Top-Down Head Box (Class 1)
                    # In elevated & top-down CCTV, head accounts for top ~25% height and center ~60% width of person
                    head_h = max(2.0, bh * 0.25)
                    head_w = max(2.0, bw * 0.60)
                    head_cx = (bx + bw / 2.0) * dw
                    head_cy = (by + head_h / 2.0) * dh
                    head_nw = head_w * dw
                    head_nh = head_h * dh
                    yolo_lines.append(f"1 {head_cx:.6f} {head_cy:.6f} {head_nw:.6f} {head_nh:.6f}\n")

            if yolo_lines:
                dest_img = out_img_dir / f"vd_{img_file.name}"
                dest_lbl = out_lbl_dir / f"vd_{txt_file.name}"
                shutil.copy2(img_file, dest_img)
                dest_lbl.write_text("".join(yolo_lines), encoding="utf-8")
                count += 1

        print(f"    Added {count} VisDrone images to {split}.")

def create_dataset_yaml():
    yaml_content = f"""# SafeCrowd - High-Angle CCTV & Crowd Head Master Dataset
path: {DATASET_DIR.resolve().as_posix()}
train: images/train
val: images/val

names:
  0: pedestrian
  1: head
"""
    yaml_path = DATASET_DIR / "cctv_master.yaml"
    yaml_path.write_text(yaml_content, encoding="utf-8")
    print(f"[*] Dataset recipe created at {yaml_path}")
    return yaml_path

if __name__ == "__main__":
    print("=" * 65)
    print("SafeCrowd - Automated Multi-Dataset Builder")
    print("=" * 65)
    convert_visdrone()
    create_dataset_yaml()
    print("Dataset preparation complete!")
