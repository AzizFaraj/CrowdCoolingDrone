from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import cv2
from ultralytics import YOLO

from crowdcooling_ai.dataset import image_path_to_label_path
from crowdcooling_ai.metrics import is_count_frame_correct


def _load_rows(csv_path: Path) -> list[dict[str, str]]:
    with csv_path.open("r", newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def _label_boxes(image_path: Path) -> list[tuple[int, int, int, int]]:
    label_path = image_path_to_label_path(image_path)
    if not label_path.exists():
        return []
    image = cv2.imread(str(image_path))
    height, width = image.shape[:2]
    boxes = []
    for line in label_path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        _, x_center, y_center, rel_width, rel_height = map(float, line.split())
        box_width = rel_width * width
        box_height = rel_height * height
        x1 = int((x_center * width) - box_width / 2.0)
        y1 = int((y_center * height) - box_height / 2.0)
        x2 = int(x1 + box_width)
        y2 = int(y1 + box_height)
        boxes.append((x1, y1, x2, y2))
    return boxes


def _select_examples(rows: list[dict[str, str]], keep_pass: int, keep_fail: int) -> tuple[list[dict[str, str]], list[dict[str, str]]]:
    passed = [row for row in rows if row["pass_20"] == "1"]
    failed = [row for row in rows if row["pass_20"] == "0"]
    passed.sort(key=lambda row: (float(row["abs_error"]), row["image_path"]))
    failed.sort(key=lambda row: (-float(row["abs_error"]), row["image_path"]))
    return passed[:keep_pass], failed[:keep_fail]


def _render_single(model: YOLO, row: dict[str, str], output_path: Path, conf: float, iou: float, imgsz: int, device: str) -> None:
    image_path = Path(row["image_path"])
    image = cv2.imread(str(image_path))
    gt_boxes = _label_boxes(image_path)
    result = model.predict(str(image_path), conf=conf, iou=iou, imgsz=imgsz, device=device, verbose=False)[0]

    for x1, y1, x2, y2 in gt_boxes:
        cv2.rectangle(image, (x1, y1), (x2, y2), (255, 128, 0), 1)

    if result.boxes is not None:
        for xyxy in result.boxes.xyxy.cpu().numpy():
            x1, y1, x2, y2 = [int(value) for value in xyxy]
            cv2.rectangle(image, (x1, y1), (x2, y2), (0, 220, 0), 2)

    roi_u = int(float(row["roi_u"]))
    roi_v = int(float(row["roi_v"]))
    cv2.drawMarker(image, (roi_u, roi_v), (0, 0, 255), markerType=cv2.MARKER_CROSS, markerSize=20, thickness=2)

    gt_count = int(row["gt_count"])
    pred_count = int(row["pred_count"])
    passed = is_count_frame_correct(gt_count, pred_count)
    overlay = [
        f"GT={gt_count} Pred={pred_count} {'PASS' if passed else 'FAIL'}",
        f"ROI=({roi_u}, {roi_v}) Mist={row['mist_flag']}",
        f"Density={float(row['density_score']):.2f} Conf={float(row['roi_confidence']):.2f}",
    ]
    for index, text in enumerate(overlay):
        cv2.putText(image, text, (12, 28 + index * 28), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (255, 255, 255), 2)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(output_path), image)


def main() -> None:
    parser = argparse.ArgumentParser(description="Render slide-ready success and failure overlays.")
    parser.add_argument("--per-frame-csv", type=Path, required=True)
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, default=Path("docs/figures"))
    parser.add_argument("--keep-pass", type=int, default=5)
    parser.add_argument("--keep-fail", type=int, default=3)
    parser.add_argument("--conf", type=float, default=0.10)
    parser.add_argument("--iou", type=float, default=0.70)
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--device", default="0")
    args = parser.parse_args()

    rows = _load_rows(args.per_frame_csv)
    keep_pass, keep_fail = _select_examples(rows, args.keep_pass, args.keep_fail)
    model = YOLO(str(args.model))

    for index, row in enumerate(keep_pass, start=1):
        _render_single(
            model,
            row,
            args.output_dir / "success_cases" / f"success_{index:02d}.jpg",
            args.conf,
            args.iou,
            args.imgsz,
            args.device,
        )
    for index, row in enumerate(keep_fail, start=1):
        _render_single(
            model,
            row,
            args.output_dir / "failure_cases" / f"failure_{index:02d}.jpg",
            args.conf,
            args.iou,
            args.imgsz,
            args.device,
        )

    print(f"Saved overlays to {args.output_dir.resolve()}")


if __name__ == "__main__":
    main()
