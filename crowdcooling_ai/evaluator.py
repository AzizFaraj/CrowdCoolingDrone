from __future__ import annotations

import csv
import json
import time
from dataclasses import asdict
from pathlib import Path
from typing import Any

import yaml
from ultralytics import YOLO

from .dataset import image_path_to_label_path
from .decision import DecisionConfig, TemporalDecisionEngine
from .metrics import compute_count_metrics, relative_count_error, summarize_latency
from .schemas import DetectedBox, LatencyBreakdown


def _load_dataset_split(data_yaml: Path, split: str) -> list[Path]:
    config = yaml.safe_load(data_yaml.read_text(encoding="utf-8"))
    split_source = Path(config[split])
    if split_source.suffix.lower() == ".txt":
        return [Path(line.strip()) for line in split_source.read_text(encoding="utf-8").splitlines() if line.strip()]
    return sorted(path for path in split_source.rglob("*") if path.suffix.lower() in {".jpg", ".jpeg", ".png"})


def _clip_id_for_image(image_path: Path) -> str:
    parts = list(image_path.parts)
    if "images" in parts:
        index = parts.index("images")
        remaining = parts[index + 1 :]
        if len(remaining) >= 3:
            return "/".join(remaining[:2])
    if len(parts) >= 3:
        return "/".join(parts[-3:-1])
    return image_path.parent.as_posix()


def _load_gt_count(image_path: Path) -> int:
    label_path = image_path_to_label_path(image_path)
    if not label_path.exists():
        return 0
    return sum(1 for line in label_path.read_text(encoding="utf-8").splitlines() if line.strip())


def _detected_boxes_from_result(result: Any) -> list[DetectedBox]:
    boxes = []
    if result.boxes is None:
        return boxes
    xyxy = result.boxes.xyxy.cpu().numpy()
    conf = result.boxes.conf.cpu().numpy() if result.boxes.conf is not None else []
    cls = result.boxes.cls.cpu().numpy() if result.boxes.cls is not None else []
    for index, xy in enumerate(xyxy):
        class_id = int(cls[index]) if len(cls) > index else 0
        confidence = float(conf[index]) if len(conf) > index else 0.0
        boxes.append(
            DetectedBox(
                x1=float(xy[0]),
                y1=float(xy[1]),
                x2=float(xy[2]),
                y2=float(xy[3]),
                confidence=confidence,
                class_id=class_id,
            )
        )
    return boxes


def _detection_metrics(model: YOLO, data_yaml: Path, split: str, conf: float, iou: float, imgsz: int, device: str) -> dict[str, float] | None:
    try:
        results = model.val(
            data=str(data_yaml),
            split=split,
            conf=conf,
            iou=iou,
            imgsz=imgsz,
            device=device,
            plots=False,
            save_json=False,
            verbose=False,
            project=str((data_yaml.parent / "ultralytics_val").resolve()),
            name=f"{split}_imgsz{imgsz}_conf{conf:.2f}_iou{iou:.2f}",
            exist_ok=True,
        )
    except Exception:
        return None

    box = getattr(results, "box", None)
    if box is None:
        return None
    return {
        "precision": float(getattr(box, "mp", 0.0)),
        "recall": float(getattr(box, "mr", 0.0)),
        "ap50": float(getattr(box, "map50", 0.0)),
        "map": float(getattr(box, "map", 0.0)),
    }


def evaluate_model(
    model_path: Path,
    data_yaml: Path,
    split: str,
    conf: float,
    iou: float,
    imgsz: int,
    device: str,
    output_dir: Path,
    max_images: int | None = None,
    warmup_frames: int = 1,
    run_detection_metrics: bool = True,
    decision_config: DecisionConfig | None = None,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    output_dir.mkdir(parents=True, exist_ok=True)
    model = YOLO(str(model_path))
    image_paths = _load_dataset_split(data_yaml, split)
    if max_images is not None:
        image_paths = image_paths[:max_images]
    if not image_paths:
        raise ValueError(f"No images found for split '{split}' in {data_yaml}.")

    warmup_image = image_paths[0]
    for _ in range(max(warmup_frames, 0)):
        model.predict(str(warmup_image), conf=conf, iou=iou, imgsz=imgsz, device=device, verbose=False)

    engine = TemporalDecisionEngine(decision_config)
    records: list[dict[str, Any]] = []
    ground_truth_counts: list[int] = []
    predicted_counts: list[int] = []
    previous_clip: str | None = None

    for frame_index, image_path in enumerate(image_paths):
        clip_id = _clip_id_for_image(image_path)
        if previous_clip != clip_id:
            engine.reset()
        previous_clip = clip_id

        inference_start = time.perf_counter()
        result = model.predict(str(image_path), conf=conf, iou=iou, imgsz=imgsz, device=device, verbose=False)[0]
        wall_ms = (time.perf_counter() - inference_start) * 1000.0
        speed = getattr(result, "speed", {}) or {}

        latency = LatencyBreakdown(
            capture_ms=0.0,
            preprocess_ms=float(speed.get("preprocess", 0.0)),
            inference_ms=float(speed.get("inference", wall_ms)),
            postprocess_ms=float(speed.get("postprocess", 0.0)),
            total_ms=wall_ms,
        )
        boxes = _detected_boxes_from_result(result)
        gt_count = _load_gt_count(image_path)
        decision = engine.update(
            frame_id=f"{clip_id}:{image_path.stem}",
            timestamp_ms=int(time.time() * 1000),
            boxes=boxes,
            image_width=int(result.orig_shape[1]),
            image_height=int(result.orig_shape[0]),
            latency_ms=latency,
        )
        decision.latency_ms.total_ms = max(
            wall_ms,
            decision.latency_ms.capture_ms
            + decision.latency_ms.preprocess_ms
            + decision.latency_ms.inference_ms
            + decision.latency_ms.postprocess_ms
            + decision.latency_ms.decision_ms,
        )

        predicted_count = decision.count_estimate
        record = {
            "frame_index": frame_index,
            "image_path": str(image_path),
            "clip_id": clip_id,
            "gt_count": gt_count,
            "pred_count": predicted_count,
            "pass_20": int(relative_count_error(gt_count, predicted_count) <= 0.20),
            "abs_error": abs(predicted_count - gt_count),
            "rel_error": relative_count_error(gt_count, predicted_count),
            **decision.to_dict(),
        }
        records.append(record)
        ground_truth_counts.append(gt_count)
        predicted_counts.append(predicted_count)

    count_metrics = compute_count_metrics(ground_truth_counts, predicted_counts)
    latency_metrics = {
        key: summarize_latency([record["latency_ms"][key] for record in records])
        for key in ("capture_ms", "preprocess_ms", "inference_ms", "postprocess_ms", "decision_ms", "total_ms")
    }
    summary = {
        "model_path": str(model_path.resolve()),
        "data_yaml": str(data_yaml.resolve()),
        "split": split,
        "conf": conf,
        "iou": iou,
        "imgsz": imgsz,
        "device": device,
        "num_frames": len(records),
        "count_metrics": count_metrics,
        "latency_metrics": latency_metrics,
        "detection_metrics": _detection_metrics(model, data_yaml, split, conf, iou, imgsz, device)
        if run_detection_metrics
        else None,
        "decision_config": asdict(decision_config or DecisionConfig()),
    }

    csv_path = output_dir / "per_frame.csv"
    with csv_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "frame_index",
                "image_path",
                "clip_id",
                "gt_count",
                "pred_count",
                "pass_20",
                "abs_error",
                "rel_error",
                "timestamp_ms",
                "frame_id",
                "camera_role",
                "roi_u",
                "roi_v",
                "roi_confidence",
                "count_estimate",
                "density_score",
                "mist_flag",
                "proceed_flag",
                "decision_reason",
                "dx_m",
                "dy_m",
                "smoothed_count",
                "hotspot_cell_x",
                "hotspot_cell_y",
                "stable_hits",
                "latency_ms",
            ],
        )
        writer.writeheader()
        writer.writerows(records)

    (output_dir / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    return records, summary
