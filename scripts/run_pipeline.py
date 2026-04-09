from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def _run(command: list[str]) -> None:
    print(" ".join(command))
    subprocess.run(command, check=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="One-command driver for the crowd-cooling AI pipeline.")
    parser.add_argument("--raw-root", type=Path, default=Path("MovingDroneCrowd"))
    parser.add_argument("--processed-root", type=Path, default=Path("datasets/processed/mdc_head_yolo"))
    parser.add_argument("--model", default="yolov8n.pt")
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--device", default="0")
    parser.add_argument("--skip-train", action="store_true")
    parser.add_argument("--weights", type=Path, help="Use existing trained weights for evaluation instead of training.")
    parser.add_argument("--epochs", type=int, default=50)
    args = parser.parse_args()

    python = sys.executable
    _run([python, "datasets/prepare_mdc_dataset.py", "--raw-root", str(args.raw_root), "--output-root", str(args.processed_root)])
    data_yaml = args.processed_root / "mdc_head_yolo.yaml"

    weights = args.weights
    if not args.skip_train:
        run_name = f"{Path(args.model).stem}_mdc_head_{args.imgsz}"
        _run(
            [
                python,
                "train/train_yolo.py",
                "--model",
                args.model,
                "--data",
                str(data_yaml),
                "--imgsz",
                str(args.imgsz),
                "--epochs",
                str(args.epochs),
                "--device",
                args.device,
                "--name",
                run_name,
            ]
        )
        weights = Path("train/runs") / run_name / "weights" / "best.pt"

    if weights is None:
        raise ValueError("Either run training or provide --weights.")

    eval_dir = Path("eval/runs") / f"{weights.stem}_val"
    _run(
        [
            python,
            "eval/evaluate_model.py",
            "--model",
            str(weights),
            "--data",
            str(data_yaml),
            "--imgsz",
            str(args.imgsz),
            "--device",
            args.device,
            "--output-dir",
            str(eval_dir),
        ]
    )
    _run(
        [
            python,
            "eval/render_examples.py",
            "--per-frame-csv",
            str(eval_dir / "per_frame.csv"),
            "--model",
            str(weights),
        ]
    )
    _run(
        [
            python,
            "eval/generate_results.py",
            "--summary-json",
            str(eval_dir / "summary.json"),
        ]
    )


if __name__ == "__main__":
    main()
