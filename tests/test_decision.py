from __future__ import annotations

import unittest

from crowdcooling_ai.decision import DecisionConfig, TemporalDecisionEngine, compute_hotspot
from crowdcooling_ai.schemas import DetectedBox


class DecisionTests(unittest.TestCase):
    def test_compute_hotspot_uses_confidence_weighted_grid(self) -> None:
        boxes = [
            DetectedBox(0, 0, 10, 10, 0.3),
            DetectedBox(80, 80, 90, 90, 0.9),
        ]
        hotspot = compute_hotspot(boxes, image_width=100, image_height=100, grid_size=10)
        self.assertGreater(hotspot.roi_u, 50)
        self.assertGreater(hotspot.roi_v, 50)
        self.assertAlmostEqual(hotspot.roi_confidence, 0.9)

    def test_temporal_engine_requires_stability_for_mist(self) -> None:
        engine = TemporalDecisionEngine(
            DecisionConfig(
                camera_role="bottom",
                grid_size=4,
                stable_window=3,
                stable_min_hits=2,
                mist_count_threshold=2,
                density_threshold=0.5,
                confidence_threshold=0.5,
            )
        )
        boxes = [
            DetectedBox(10, 10, 20, 20, 0.9),
            DetectedBox(12, 12, 22, 22, 0.8),
        ]
        first = engine.update("frame_1", 1, boxes, 100, 100)
        second = engine.update("frame_2", 2, boxes, 100, 100)
        self.assertEqual(first.mist_flag, 0)
        self.assertEqual(second.mist_flag, 1)

    def test_side_camera_blocks_forward_motion_when_crowd_is_stable(self) -> None:
        engine = TemporalDecisionEngine(
            DecisionConfig(
                camera_role="side",
                grid_size=4,
                stable_window=3,
                stable_min_hits=2,
                forward_block_count_threshold=2,
                forward_density_threshold=0.5,
                forward_confidence_threshold=0.5,
            )
        )
        boxes = [
            DetectedBox(10, 10, 20, 20, 0.9),
            DetectedBox(12, 12, 22, 22, 0.8),
        ]
        first = engine.update("frame_1", 1, boxes, 100, 100)
        second = engine.update("frame_2", 2, boxes, 100, 100)
        self.assertEqual(first.proceed_flag, 1)
        self.assertEqual(second.proceed_flag, 0)
        self.assertEqual(second.mist_flag, 0)


if __name__ == "__main__":
    unittest.main()
