from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from crowdcooling_ai.evaluator import evaluate_model


def main() -> None:
    parser = argparse.ArgumentParser(description="Sweep confidence and NMS thresholds for count accuracy.")
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--data", type=Path, required=True)
    parser.add_argument("--split", default="val")
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--device", default="0")
    parser.add_argument("--project", type=Path, default=Path("train/threshold_sweeps"))
    parser.add_argument("--max-images", type=int)
    parser.add_argument("--conf-values", nargs="+", type=float, default=[0.05, 0.10, 0.15, 0.20, 0.25, 0.30])
    parser.add_argument("--iou-values", nargs="+", type=float, default=[0.45, 0.50, 0.60, 0.70])
    args = parser.parse_args()

    args.project.mkdir(parents=True, exist_ok=True)
    rows: list[dict[str, float | str | int]] = []
    best_row: dict[str, float | str | int] | None = None

    for conf in args.conf_values:
        for iou in args.iou_values:
            run_dir = args.project / f"conf_{conf:.2f}_iou_{iou:.2f}"
            _, summary = evaluate_model(
                model_path=args.model,
                data_yaml=args.data,
                split=args.split,
                conf=conf,
                iou=iou,
                imgsz=args.imgsz,
                device=args.device,
                output_dir=run_dir,
                max_images=args.max_images,
                run_detection_metrics=False,
            )
            row = {
                "model": str(args.model),
                "split": args.split,
                "imgsz": args.imgsz,
                "conf": conf,
                "iou": iou,
                "num_frames": summary["num_frames"],
                "accuracy_count": summary["count_metrics"]["accuracy_count"],
                "mae": summary["count_metrics"]["mae"],
                "rmse": summary["count_metrics"]["rmse"],
                "total_ms_mean": summary["latency_metrics"]["total_ms"]["mean"],
            }
            rows.append(row)
            if best_row is None or float(row["accuracy_count"]) > float(best_row["accuracy_count"]):
                best_row = row

    csv_path = args.project / "threshold_sweep.csv"
    with csv_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)

    if best_row is not None:
        (args.project / "best_thresholds.json").write_text(json.dumps(best_row, indent=2), encoding="utf-8")
        print(json.dumps(best_row, indent=2))


if __name__ == "__main__":
    main()
