from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from crowdcooling_ai.dataset import prepare_mdc_dataset


def main() -> None:
    parser = argparse.ArgumentParser(description="Prepare MovingDroneCrowd head detection data for YOLO.")
    parser.add_argument("--raw-root", type=Path, default=Path("MovingDroneCrowd"))
    parser.add_argument("--output-root", type=Path, default=Path("datasets/processed/mdc_head_yolo"))
    parser.add_argument("--overwrite-labels", action="store_true")
    args = parser.parse_args()

    manifest = prepare_mdc_dataset(args.raw_root, args.output_root, overwrite_labels=args.overwrite_labels)
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
