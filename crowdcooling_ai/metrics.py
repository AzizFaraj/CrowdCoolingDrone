from __future__ import annotations

import math
from statistics import mean
from typing import Iterable, Sequence


def relative_count_error(true_count: int, predicted_count: int) -> float:
    return abs(predicted_count - true_count) / max(true_count, 1)


def is_count_frame_correct(true_count: int, predicted_count: int, tolerance: float = 0.20) -> bool:
    return relative_count_error(true_count, predicted_count) <= tolerance


def compute_count_metrics(
    ground_truth_counts: Sequence[int],
    predicted_counts: Sequence[int],
    tolerance: float = 0.20,
) -> dict[str, float | int]:
    if len(ground_truth_counts) != len(predicted_counts):
        raise ValueError("Ground-truth and prediction sequences must have the same length.")
    if not ground_truth_counts:
        raise ValueError("At least one frame is required to compute count metrics.")

    abs_errors = [abs(pred - true) for true, pred in zip(ground_truth_counts, predicted_counts)]
    squared_errors = [err * err for err in abs_errors]
    correct_frames = sum(
        1 for true, pred in zip(ground_truth_counts, predicted_counts) if is_count_frame_correct(true, pred, tolerance)
    )
    total_frames = len(ground_truth_counts)
    return {
        "accuracy_count": correct_frames / total_frames,
        "mae": mean(abs_errors),
        "rmse": math.sqrt(mean(squared_errors)),
        "correct_frames": correct_frames,
        "total_frames": total_frames,
        "tolerance": tolerance,
    }


def percentile(values: Sequence[float], q: float) -> float:
    if not values:
        return 0.0
    if q <= 0:
        return min(values)
    if q >= 100:
        return max(values)
    ordered = sorted(values)
    index = (len(ordered) - 1) * (q / 100.0)
    lower = math.floor(index)
    upper = math.ceil(index)
    if lower == upper:
        return float(ordered[lower])
    fraction = index - lower
    return float(ordered[lower] + (ordered[upper] - ordered[lower]) * fraction)


def summarize_latency(latencies_ms: Iterable[float]) -> dict[str, float]:
    series = [float(value) for value in latencies_ms]
    if not series:
        return {"mean": 0.0, "p50": 0.0, "p90": 0.0}
    return {
        "mean": mean(series),
        "p50": percentile(series, 50),
        "p90": percentile(series, 90),
    }
