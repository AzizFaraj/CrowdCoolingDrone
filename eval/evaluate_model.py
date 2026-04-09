from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from crowdcooling_ai.evaluator import evaluate_model


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate a YOLO model with the project count metric.")
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--data", type=Path, required=True)
    parser.add_argument("--split", default="val")
    parser.add_argument("--conf", type=float, default=0.10)
    parser.add_argument("--iou", type=float, default=0.70)
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--device", default="0")
    parser.add_argument("--output-dir", type=Path, default=Path("eval/runs/default"))
    parser.add_argument("--max-images", type=int)
    parser.add_argument("--skip-detection-metrics", action="store_true")
    args = parser.parse_args()

    _, summary = evaluate_model(
        model_path=args.model,
        data_yaml=args.data,
        split=args.split,
        conf=args.conf,
        iou=args.iou,
        imgsz=args.imgsz,
        device=args.device,
        output_dir=args.output_dir,
        max_images=args.max_images,
        run_detection_metrics=not args.skip_detection_metrics,
    )
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
