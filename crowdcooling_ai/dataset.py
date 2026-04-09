from __future__ import annotations

import csv
import json
import os
import shutil
from collections import defaultdict
from pathlib import Path
from typing import Iterable

from PIL import Image
import yaml


IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp"}


def parse_split_file(split_path: Path) -> list[str]:
    return [line.strip().replace("\\", "/") for line in split_path.read_text(encoding="utf-8").splitlines() if line.strip()]


def expand_mdc_split_item(raw_root: Path, item: str) -> list[tuple[str, str]]:
    images_root = raw_root / "images"
    if "/" in item:
        scene, clip = item.split("/", 1)
        return [(scene, clip)]

    scene_dir = images_root / item
    if not scene_dir.exists():
        raise FileNotFoundError(f"Scene folder not found: {scene_dir}")
    return sorted((item, clip_dir.name) for clip_dir in scene_dir.iterdir() if clip_dir.is_dir())


def image_path_to_label_path(image_path: Path) -> Path:
    parts = list(image_path.parts)
    for index, part in enumerate(parts):
        if part == "images":
            parts[index] = "labels"
            return Path(*parts).with_suffix(".txt")
    raise ValueError(f"Image path does not contain an 'images' segment: {image_path}")


def verify_disjoint_splits(split_to_items: dict[str, Iterable[str]]) -> dict[str, list[str]]:
    normalized = {name: set(items) for name, items in split_to_items.items()}
    overlap_report: dict[str, list[str]] = {}
    split_names = list(normalized)
    for index, left_name in enumerate(split_names):
        for right_name in split_names[index + 1 :]:
            overlap = sorted(normalized[left_name] & normalized[right_name])
            if overlap:
                overlap_report[f"{left_name}__{right_name}"] = overlap
    return overlap_report


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def convert_mdc_clip(raw_root: Path, scene: str, clip: str, overwrite: bool = False) -> int:
    ann_path = raw_root / "annotations" / scene / f"{clip}.csv"
    if not ann_path.exists():
        raise FileNotFoundError(f"Missing annotation CSV: {ann_path}")

    image_root = raw_root / "images" / scene / clip
    label_root = raw_root / "labels" / scene / clip
    label_root.mkdir(parents=True, exist_ok=True)

    grouped_rows: dict[int, list[tuple[float, float, float, float]]] = defaultdict(list)
    with ann_path.open("r", newline="", encoding="utf-8") as handle:
        reader = csv.reader(handle)
        for row in reader:
            if len(row) < 6:
                continue
            frame_idx = int(row[0])
            grouped_rows[frame_idx].append((float(row[2]), float(row[3]), float(row[4]), float(row[5])))

    converted_frames = 0
    for frame_idx, boxes in grouped_rows.items():
        image_path = image_root / f"{frame_idx + 1}.jpg"
        if not image_path.exists():
            continue

        label_path = label_root / f"{frame_idx + 1}.txt"
        if label_path.exists() and not overwrite:
            converted_frames += 1
            continue

        with Image.open(image_path) as image:
            image_width, image_height = image.size
        lines: list[str] = []
        for x, y, width, height in boxes:
            x = _clamp(x, 0.0, image_width - 1.0)
            y = _clamp(y, 0.0, image_height - 1.0)
            width = _clamp(width, 1.0, image_width)
            height = _clamp(height, 1.0, image_height)
            x_center = (x + width / 2.0) / image_width
            y_center = (y + height / 2.0) / image_height
            rel_width = width / image_width
            rel_height = height / image_height
            lines.append(f"0 {x_center:.6f} {y_center:.6f} {rel_width:.6f} {rel_height:.6f}")

        label_path.write_text("\n".join(lines), encoding="utf-8")
        converted_frames += 1
    return converted_frames


def _absolute_image_list_for_mdc(raw_root: Path, split_items: list[str]) -> list[str]:
    image_paths: list[str] = []
    for item in split_items:
        for scene, clip in expand_mdc_split_item(raw_root, item):
            clip_dir = raw_root / "images" / scene / clip
            images = sorted(
                (path for path in clip_dir.iterdir() if path.suffix.lower() in IMAGE_EXTENSIONS),
                key=lambda path: int(path.stem),
            )
            image_paths.extend(str(path.resolve()) for path in images)
    return image_paths


def prepare_mdc_dataset(raw_root: Path, processed_root: Path, overwrite_labels: bool = False) -> dict[str, object]:
    raw_root = raw_root.resolve()
    processed_root = processed_root.resolve()
    processed_root.mkdir(parents=True, exist_ok=True)
    lists_dir = processed_root / "lists"
    lists_dir.mkdir(parents=True, exist_ok=True)

    split_items = {
        split_name: parse_split_file(raw_root / f"{split_name}.txt") for split_name in ("train", "val", "test")
    }

    expanded_clips = {
        split_name: [f"{scene}/{clip}" for item in items for scene, clip in expand_mdc_split_item(raw_root, item)]
        for split_name, items in split_items.items()
    }
    overlaps = verify_disjoint_splits(expanded_clips)
    if overlaps:
        raise ValueError(f"Split leakage detected: {overlaps}")

    for clips in expanded_clips.values():
        for clip_id in clips:
            scene, clip = clip_id.split("/", 1)
            convert_mdc_clip(raw_root, scene, clip, overwrite=overwrite_labels)

    split_counts: dict[str, int] = {}
    for split_name, items in split_items.items():
        image_paths = _absolute_image_list_for_mdc(raw_root, items)
        split_counts[split_name] = len(image_paths)
        (lists_dir / f"{split_name}.txt").write_text("\n".join(image_paths), encoding="utf-8")

    data_yaml = processed_root / "mdc_head_yolo.yaml"
    data_yaml.write_text(
        yaml.safe_dump(
            {
                "train": str((lists_dir / "train.txt").resolve()),
                "val": str((lists_dir / "val.txt").resolve()),
                "test": str((lists_dir / "test.txt").resolve()),
                "names": {0: "head"},
            },
            sort_keys=False,
        ),
        encoding="utf-8",
    )

    manifest = {
        "name": "MovingDroneCrowd head YOLO",
        "raw_root": str(raw_root),
        "processed_root": str(processed_root),
        "annotation_format": "csv_yolo",
        "label_semantics": "head",
        "split_policy": "scene_or_video",
        "splits": split_counts,
        "data_yaml": str(data_yaml.resolve()),
    }
    (processed_root / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    (processed_root / "split_report.json").write_text(
        json.dumps({"expanded_clip_ids": expanded_clips, "overlaps": overlaps}, indent=2),
        encoding="utf-8",
    )
    return manifest


def _materialize_image(source: Path, destination: Path, mode: str) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        return
    if mode == "hardlink":
        os.link(source, destination)
    elif mode == "copy":
        shutil.copy2(source, destination)
    elif mode == "none":
        return
    else:
        raise ValueError(f"Unsupported materialization mode: {mode}")


def convert_coco_json_to_yolo(
    coco_json: Path,
    images_root: Path,
    output_root: Path,
    split_name: str,
    class_name: str = "head",
    category_ids: set[int] | None = None,
    materialize_mode: str = "hardlink",
) -> dict[str, object]:
    payload = json.loads(coco_json.read_text(encoding="utf-8"))
    category_ids = set(category_ids or [category["id"] for category in payload.get("categories", [])])

    labels_root = output_root / "labels" / split_name
    images_out_root = output_root / "images" / split_name
    labels_root.mkdir(parents=True, exist_ok=True)
    if materialize_mode != "none":
        images_out_root.mkdir(parents=True, exist_ok=True)

    annotations_by_image: dict[int, list[dict[str, object]]] = defaultdict(list)
    for annotation in payload.get("annotations", []):
        if int(annotation["category_id"]) in category_ids:
            annotations_by_image[int(annotation["image_id"])].append(annotation)

    image_paths: list[str] = []
    for image_info in payload.get("images", []):
        image_id = int(image_info["id"])
        file_name = str(image_info["file_name"])
        source_image = (images_root / file_name).resolve()
        if not source_image.exists():
            continue

        if materialize_mode == "none":
            destination_image = source_image
            label_target = labels_root / Path(file_name).with_suffix(".txt")
        else:
            destination_image = (images_out_root / file_name).resolve()
            _materialize_image(source_image, destination_image, materialize_mode)
            label_target = image_path_to_label_path(destination_image)

        width = float(image_info["width"])
        height = float(image_info["height"])
        label_target.parent.mkdir(parents=True, exist_ok=True)

        lines: list[str] = []
        for annotation in annotations_by_image.get(image_id, []):
            x, y, box_width, box_height = annotation["bbox"]
            x_center = (float(x) + float(box_width) / 2.0) / width
            y_center = (float(y) + float(box_height) / 2.0) / height
            rel_width = float(box_width) / width
            rel_height = float(box_height) / height
            lines.append(f"0 {x_center:.6f} {y_center:.6f} {rel_width:.6f} {rel_height:.6f}")
        label_target.write_text("\n".join(lines), encoding="utf-8")
        image_paths.append(str(destination_image))

    manifest = {
        "name": f"{coco_json.stem}_{split_name}",
        "source_json": str(coco_json.resolve()),
        "images_root": str(images_root.resolve()),
        "output_root": str(output_root.resolve()),
        "label_semantics": class_name,
        "annotation_format": "coco_json",
        "materialize_mode": materialize_mode,
        "num_images": len(image_paths),
    }
    (output_root / f"{split_name}_manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return manifest
