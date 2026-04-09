from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from crowdcooling_ai.dataset import convert_coco_json_to_yolo


def main() -> None:
    parser = argparse.ArgumentParser(description="Convert a COCO-style dataset into YOLO labels.")
    parser.add_argument("--coco-json", type=Path, required=True)
    parser.add_argument("--images-root", type=Path, required=True)
    parser.add_argument("--output-root", type=Path, required=True)
    parser.add_argument("--split-name", required=True)
    parser.add_argument("--class-name", default="head")
    parser.add_argument("--category-id", type=int, action="append", dest="category_ids")
    parser.add_argument("--materialize-mode", choices=("hardlink", "copy", "none"), default="hardlink")
    args = parser.parse_args()

    manifest = convert_coco_json_to_yolo(
        coco_json=args.coco_json,
        images_root=args.images_root,
        output_root=args.output_root,
        split_name=args.split_name,
        class_name=args.class_name,
        category_ids=set(args.category_ids or []),
        materialize_mode=args.materialize_mode,
    )
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
