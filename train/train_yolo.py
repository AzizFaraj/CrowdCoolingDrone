from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from ultralytics import YOLO


def main() -> None:
    parser = argparse.ArgumentParser(description="Train a YOLO head detector.")
    parser.add_argument("--model", default="yolov8n.pt")
    parser.add_argument("--data", type=Path, required=True)
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--epochs", type=int, default=50)
    parser.add_argument("--batch", type=int, default=8)
    parser.add_argument("--device", default="0")
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--project", type=Path, default=Path("train/runs"))
    parser.add_argument("--name", default="yolov8n_mdc_head")
    parser.add_argument("--patience", type=int, default=10)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--exist-ok", action="store_true")
    args = parser.parse_args()

    model = YOLO(args.model)
    model.train(
        data=str(args.data),
        imgsz=args.imgsz,
        epochs=args.epochs,
        batch=args.batch,
        device=args.device,
        workers=args.workers,
        project=str(args.project),
        name=args.name,
        patience=args.patience,
        seed=args.seed,
        exist_ok=args.exist_ok,
    )


if __name__ == "__main__":
    main()
