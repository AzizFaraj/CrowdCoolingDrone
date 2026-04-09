from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from PIL import Image

from crowdcooling_ai.dataset import convert_coco_json_to_yolo, convert_mdc_clip, verify_disjoint_splits


class DatasetTests(unittest.TestCase):
    def test_verify_disjoint_splits_detects_overlap(self) -> None:
        overlaps = verify_disjoint_splits({"train": ["scene_1/1"], "val": ["scene_1/1"], "test": ["scene_2/1"]})
        self.assertIn("train__val", overlaps)

    def test_convert_mdc_clip_creates_yolo_labels(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            root = Path(tmp_dir)
            (root / "annotations" / "scene_1").mkdir(parents=True)
            (root / "images" / "scene_1" / "1").mkdir(parents=True)
            Image.new("RGB", (100, 100), "black").save(root / "images" / "scene_1" / "1" / "1.jpg")
            (root / "annotations" / "scene_1" / "1.csv").write_text("0,0,10,20,10,10,-1,-1,-1,-1\n", encoding="utf-8")

            converted = convert_mdc_clip(root, "scene_1", "1")
            label_text = (root / "labels" / "scene_1" / "1" / "1.txt").read_text(encoding="utf-8").strip()

            self.assertEqual(converted, 1)
            self.assertTrue(label_text.startswith("0 "))

    def test_convert_coco_json_to_yolo_materializes_labels(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            root = Path(tmp_dir)
            images_root = root / "source_images"
            images_root.mkdir(parents=True)
            Image.new("RGB", (200, 100), "black").save(images_root / "sample.jpg")
            coco_json = root / "instances.json"
            coco_json.write_text(
                json.dumps(
                    {
                        "images": [{"id": 1, "file_name": "sample.jpg", "width": 200, "height": 100}],
                        "annotations": [{"id": 1, "image_id": 1, "category_id": 1, "bbox": [10, 10, 40, 20]}],
                        "categories": [{"id": 1, "name": "head"}],
                    }
                ),
                encoding="utf-8",
            )
            output_root = root / "output"

            manifest = convert_coco_json_to_yolo(
                coco_json=coco_json,
                images_root=images_root,
                output_root=output_root,
                split_name="train",
            )

            label_path = output_root / "labels" / "train" / "sample.txt"
            self.assertEqual(manifest["num_images"], 1)
            self.assertTrue(label_path.exists())


if __name__ == "__main__":
    unittest.main()
