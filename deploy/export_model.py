from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from ultralytics import YOLO


def main() -> None:
    parser = argparse.ArgumentParser(description="Export a YOLO model to ONNX or TensorRT.")
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--format", choices=("onnx", "engine"), required=True)
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--device", default="0")
    parser.add_argument("--half", action="store_true")
    parser.add_argument("--workspace", type=float, default=4.0, help="TensorRT workspace in GB.")
    args = parser.parse_args()

    model = YOLO(str(args.model))
    exported = model.export(
        format=args.format,
        imgsz=args.imgsz,
        device=args.device,
        half=args.half,
        workspace=args.workspace if args.format == "engine" else None,
    )
    print(exported)


if __name__ == "__main__":
    main()
