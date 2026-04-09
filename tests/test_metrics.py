from __future__ import annotations

import unittest

from crowdcooling_ai.metrics import compute_count_metrics, is_count_frame_correct, relative_count_error


class CountMetricsTests(unittest.TestCase):
    def test_zero_ground_truth_only_passes_with_zero_prediction(self) -> None:
        self.assertTrue(is_count_frame_correct(0, 0))
        self.assertFalse(is_count_frame_correct(0, 1))

    def test_relative_error_matches_project_rubric(self) -> None:
        self.assertAlmostEqual(relative_count_error(10, 12), 0.2)
        self.assertAlmostEqual(relative_count_error(0, 3), 3.0)

    def test_count_metrics_summary(self) -> None:
        metrics = compute_count_metrics([10, 20, 0], [12, 18, 0])
        self.assertAlmostEqual(metrics["accuracy_count"], 1.0)
        self.assertAlmostEqual(metrics["mae"], (2 + 2 + 0) / 3)


if __name__ == "__main__":
    unittest.main()
