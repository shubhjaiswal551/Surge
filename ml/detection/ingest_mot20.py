"""
SafeCrowd - MOT20 Precise Sequence Downloader & Annotator
Downloads official high-density CCTV training sequences (MOT20-01, 02, 03, 05) as compressed MP4s (~200MB total),
extracts keyframes, and maps official MOT20 ground-truth bounding boxes + synthesized top-down head annotations
directly into datasets/cctv_master.
"""

import sys
import zipfile
import urllib.request
from pathlib import Path
import cv2

BASE_DIR = Path(__file__).resolve().parent.parent
RAW_DIR = BASE_DIR / "datasets" / "raw"
DATASET_DIR = BASE_DIR / "datasets" / "cctv_master"
RAW_DIR.mkdir(parents=True, exist_ok=True)

SEQS = [
    {"name": "MOT20-01", "w": 1920, "h": 1080, "frames": 429, "step": 3},
    {"name": "MOT20-02", "w": 1920, "h": 1080, "frames": 2782, "step": 10},
    {"name": "MOT20-03", "w": 1173, "h": 880, "frames": 2405, "step": 10},
    {"name": "MOT20-05", "w": 1654, "h": 1080, "frames": 3315, "step": 12},
]

def download_file(url: str, dest_path: Path):
    if dest_path.exists() and dest_path.stat().st_size > 1000:
        print(f"[*] Already downloaded: {dest_path.name}")
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
    print("\n    Complete.")

def parse_gt_labels(zip_path: Path):
    print("[*] Parsing MOT20 Ground Truth bounding boxes from MOT20Labels.zip...")
    gt_by_seq = {}
    with zipfile.ZipFile(zip_path, 'r') as z:
        for seq_info in SEQS:
            seq_name = seq_info["name"]
            gt_file = f"MOT20Labels/train/{seq_name}/gt/gt.txt"
            if gt_file not in z.namelist():
                continue
            lines = z.read(gt_file).decode('utf-8').strip().splitlines()
            frame_boxes = {}
            for line in lines:
                parts = [p.strip() for p in line.split(',') if p.strip()]
                if len(parts) < 8:
                    continue
                # MOT format: <frame>, <id>, <bb_left>, <bb_top>, <bb_width>, <bb_height>, <conf>, <class>, <visibility>
                f_idx = int(parts[0])
                conf = float(parts[6])
                cls = int(parts[7])
                vis = float(parts[8]) if len(parts) > 8 else 1.0

                # class 1 = pedestrian, conf=1 indicates active ground-truth, vis > 0.15
                if cls != 1 or conf != 1 or vis < 0.15:
                    continue

                bx, by, bw, bh = float(parts[2]), float(parts[3]), float(parts[4]), float(parts[5])
                if bw < 3 or bh < 5:
                    continue

                if f_idx not in frame_boxes:
                    frame_boxes[f_idx] = []
                frame_boxes[f_idx].append((bx, by, bw, bh))

            gt_by_seq[seq_name] = frame_boxes
            print(f"    {seq_name}: parsed {len(frame_boxes)} annotated frames")
    return gt_by_seq

def process_mot20():
    labels_zip = RAW_DIR / "MOT20Labels.zip"
    if not labels_zip.exists():
        download_file("https://motchallenge.net/data/MOT20Labels.zip", labels_zip)

    gt_data = parse_gt_labels(labels_zip)

    out_train_img = DATASET_DIR / "images" / "train"
    out_train_lbl = DATASET_DIR / "labels" / "train"
    out_val_img = DATASET_DIR / "images" / "val"
    out_val_lbl = DATASET_DIR / "labels" / "val"

    total_added = 0

    for seq in SEQS:
        seq_name = seq["name"]
        video_url = f"https://motchallenge.net/sequenceVideos/{seq_name}-raw.mp4"
        video_dest = RAW_DIR / f"{seq_name}-raw.mp4"
        download_file(video_url, video_dest)

        cap = cv2.VideoCapture(str(video_dest))
        if not cap.isOpened():
            print(f"[!] Warning: Could not open {video_dest}")
            continue

        frame_dict = gt_data.get(seq_name, {})
        step = seq["step"]
        w_img, h_img = seq["w"], seq["h"]
        dw, dh = 1.0 / w_img, 1.0 / h_img

        f_count = 0
        added_seq = 0

        while True:
            ret, frame = cap.read()
            if not ret:
                break
            f_count += 1

            if f_count % step != 0 or f_count not in frame_dict:
                continue

            boxes = frame_dict[f_count]
            if not boxes:
                continue

            yolo_lines = []
            for (bx, by, bw, bh) in boxes:
                # Class 0: Pedestrian Full-body
                cx = (bx + bw / 2.0) * dw
                cy = (by + bh / 2.0) * dh
                nw = bw * dw
                nh = bh * dh
                yolo_lines.append(f"0 {cx:.6f} {cy:.6f} {nw:.6f} {nh:.6f}\n")

                # Class 1: Top-Down Head box (top 25% height, center 60% width)
                head_h = max(3.0, bh * 0.25)
                head_w = max(3.0, bw * 0.60)
                head_cx = (bx + bw / 2.0) * dw
                head_cy = (by + head_h / 2.0) * dh
                head_nw = head_w * dw
                head_nh = head_h * dh
                yolo_lines.append(f"1 {head_cx:.6f} {head_cy:.6f} {head_nw:.6f} {head_nh:.6f}\n")

            # 90% train, 10% validation split
            is_val = (added_seq % 10 == 0)
            target_img_dir = out_val_img if is_val else out_train_img
            target_lbl_dir = out_val_lbl if is_val else out_train_lbl

            base_name = f"mot20_{seq_name}_f{f_count:05d}"
            img_file = target_img_dir / f"{base_name}.jpg"
            lbl_file = target_lbl_dir / f"{base_name}.txt"

            if img_file.exists() and lbl_file.exists():
                added_seq += 1
                total_added += 1
                continue

            cv2.imwrite(str(img_file), frame)
            lbl_file.write_text("".join(yolo_lines), encoding="utf-8")

            added_seq += 1
            total_added += 1

        cap.release()
        print(f"    Extracted & labeled {added_seq} high-density frames from {seq_name}")

    print(f"[*] Ingested a total of {total_added} dense CCTV crowd frames from MOT20!")

if __name__ == "__main__":
    process_mot20()
