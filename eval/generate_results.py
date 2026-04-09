from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def _paths_in(directory: Path) -> list[str]:
    if not directory.exists():
        return []
    return [str(path.resolve()) for path in sorted(directory.iterdir()) if path.is_file()]


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate RESULTS.md from evaluation artifacts.")
    parser.add_argument("--summary-json", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=Path("docs/RESULTS.md"))
    parser.add_argument("--success-dir", type=Path, default=Path("docs/figures/success_cases"))
    parser.add_argument("--failure-dir", type=Path, default=Path("docs/figures/failure_cases"))
    args = parser.parse_args()

    summary = json.loads(args.summary_json.read_text(encoding="utf-8"))
    count_metrics = summary["count_metrics"]
    detection_metrics = summary.get("detection_metrics")
    latency_metrics = summary["latency_metrics"]

    accuracy_line = (
        f"Accuracy_count = {count_metrics['accuracy_count']:.4f} "
        f"({'meets' if count_metrics['accuracy_count'] >= 0.80 else 'does not meet'} the 0.80 target)"
    )
    content = f"""# RESULTS

## Dataset And Model
- Dataset YAML: `{summary['data_yaml']}`
- Model: `{summary['model_path']}`
- Split: `{summary['split']}`
- Confidence threshold: `{summary['conf']}`
- IoU threshold: `{summary['iou']}`
- Image size: `{summary['imgsz']}`
- Frames evaluated: `{summary['num_frames']}`

## Count Metrics
- {accuracy_line}
- MAE = {count_metrics['mae']:.4f}
- RMSE = {count_metrics['rmse']:.4f}
- Correct frames = {count_metrics['correct_frames']} / {count_metrics['total_frames']}

## Detection Metrics
"""
    if detection_metrics is None:
        content += "- Not computed in this run.\n"
    else:
        content += (
            f"- Precision = {detection_metrics.get('precision', 0.0):.4f}\n"
            f"- Recall = {detection_metrics.get('recall', 0.0):.4f}\n"
            f"- AP@0.5 = {detection_metrics.get('ap50', 0.0):.4f}\n"
        )

    content += f"""

## Latency
| Stage | Mean (ms) | P50 (ms) | P90 (ms) |
| --- | ---: | ---: | ---: |
| Capture | {latency_metrics['capture_ms']['mean']:.2f} | {latency_metrics['capture_ms']['p50']:.2f} | {latency_metrics['capture_ms']['p90']:.2f} |
| Preprocess | {latency_metrics['preprocess_ms']['mean']:.2f} | {latency_metrics['preprocess_ms']['p50']:.2f} | {latency_metrics['preprocess_ms']['p90']:.2f} |
| Inference | {latency_metrics['inference_ms']['mean']:.2f} | {latency_metrics['inference_ms']['p50']:.2f} | {latency_metrics['inference_ms']['p90']:.2f} |
| Postprocess | {latency_metrics['postprocess_ms']['mean']:.2f} | {latency_metrics['postprocess_ms']['p50']:.2f} | {latency_metrics['postprocess_ms']['p90']:.2f} |
| Decision | {latency_metrics['decision_ms']['mean']:.2f} | {latency_metrics['decision_ms']['p50']:.2f} | {latency_metrics['decision_ms']['p90']:.2f} |
| Total | {latency_metrics['total_ms']['mean']:.2f} | {latency_metrics['total_ms']['p50']:.2f} | {latency_metrics['total_ms']['p90']:.2f} |

## Presentation Artifacts
- Success overlays:
{chr(10).join(f"  - `{path}`" for path in _paths_in(args.success_dir)) or "  - none generated yet"}
- Failure overlays:
{chr(10).join(f"  - `{path}`" for path in _paths_in(args.failure_dir)) or "  - none generated yet"}

## Next Steps
- If Accuracy_count is below 0.80, rerun the threshold sweep and then compare `YOLOv8n` 960 against `YOLOv8s`.
- Collect official Jetson latency on-device with ONNX or TensorRT export.
"""
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(content, encoding="utf-8")
    print(f"Wrote {args.output.resolve()}")


if __name__ == "__main__":
    main()
