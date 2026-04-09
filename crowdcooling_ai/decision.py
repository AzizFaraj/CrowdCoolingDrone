from __future__ import annotations

import time
from collections import Counter, deque
from dataclasses import dataclass
from typing import Iterable

import numpy as np

from .schemas import DecisionOutput, DetectedBox, LatencyBreakdown


@dataclass
class DecisionConfig:
    camera_role: str = "bottom"
    grid_size: int = 16
    ema_alpha: float = 0.4
    stable_window: int = 5
    stable_min_hits: int = 3
    mist_count_threshold: int = 5
    density_threshold: float = 0.18
    confidence_threshold: float = 0.35
    forward_block_count_threshold: int = 10
    forward_density_threshold: float = 0.12
    forward_confidence_threshold: float = 0.35


@dataclass
class HotspotEstimate:
    roi_u: float
    roi_v: float
    roi_confidence: float
    density_score: float
    cell_x: int
    cell_y: int


def _clamp_cell(value: float, size: int, grid_size: int) -> int:
    if size <= 0:
        return 0
    return min(max(int((value / size) * grid_size), 0), grid_size - 1)


def compute_hotspot(
    boxes: Iterable[DetectedBox],
    image_width: int,
    image_height: int,
    grid_size: int,
) -> HotspotEstimate:
    box_list = list(boxes)
    if not box_list:
        center_cell = grid_size // 2
        return HotspotEstimate(
            roi_u=image_width / 2.0,
            roi_v=image_height / 2.0,
            roi_confidence=0.0,
            density_score=0.0,
            cell_x=center_cell,
            cell_y=center_cell,
        )

    weighted_grid = np.zeros((grid_size, grid_size), dtype=np.float32)
    count_grid = np.zeros((grid_size, grid_size), dtype=np.int32)
    confidences_by_cell: dict[tuple[int, int], list[float]] = {}

    for box in box_list:
        cx, cy = box.center
        cell_x = _clamp_cell(cx, image_width, grid_size)
        cell_y = _clamp_cell(cy, image_height, grid_size)
        weighted_grid[cell_y, cell_x] += float(box.confidence)
        count_grid[cell_y, cell_x] += 1
        confidences_by_cell.setdefault((cell_x, cell_y), []).append(float(box.confidence))

    cell_y, cell_x = np.unravel_index(int(np.argmax(weighted_grid)), weighted_grid.shape)
    cell_confidences = confidences_by_cell[(cell_x, cell_y)]
    cell_count = int(count_grid[cell_y, cell_x])

    return HotspotEstimate(
        roi_u=((cell_x + 0.5) / grid_size) * image_width,
        roi_v=((cell_y + 0.5) / grid_size) * image_height,
        roi_confidence=float(sum(cell_confidences) / max(len(cell_confidences), 1)),
        density_score=float(cell_count / max(len(box_list), 1)),
        cell_x=int(cell_x),
        cell_y=int(cell_y),
    )


class TemporalDecisionEngine:
    def __init__(self, config: DecisionConfig | None = None) -> None:
        self.config = config or DecisionConfig()
        self._recent_cells: deque[tuple[int, int]] = deque(maxlen=self.config.stable_window)
        self._roi_ema: tuple[float, float] | None = None
        self._count_ema: float | None = None

    def reset(self) -> None:
        self._recent_cells.clear()
        self._roi_ema = None
        self._count_ema = None

    def _stable_hits(self, current_cell: tuple[int, int]) -> int:
        if not self._recent_cells:
            return 0
        return sum(
            1
            for prev_x, prev_y in self._recent_cells
            if abs(prev_x - current_cell[0]) <= 1 and abs(prev_y - current_cell[1]) <= 1
        )

    def _stable_anchor(self) -> tuple[int, int] | None:
        if not self._recent_cells:
            return None
        return Counter(self._recent_cells).most_common(1)[0][0]

    def update(
        self,
        frame_id: str,
        timestamp_ms: int,
        boxes: Iterable[DetectedBox],
        image_width: int,
        image_height: int,
        latency_ms: LatencyBreakdown | None = None,
        altitude_m: float | None = None,
        fx: float | None = None,
        fy: float | None = None,
        cx: float | None = None,
        cy: float | None = None,
    ) -> DecisionOutput:
        local_latency = latency_ms or LatencyBreakdown()
        decision_start = time.perf_counter()

        box_list = list(boxes)
        hotspot = compute_hotspot(box_list, image_width, image_height, self.config.grid_size)
        current_cell = (hotspot.cell_x, hotspot.cell_y)
        self._recent_cells.append(current_cell)

        if self._roi_ema is None:
            self._roi_ema = (hotspot.roi_u, hotspot.roi_v)
        else:
            alpha = self.config.ema_alpha
            self._roi_ema = (
                alpha * hotspot.roi_u + (1.0 - alpha) * self._roi_ema[0],
                alpha * hotspot.roi_v + (1.0 - alpha) * self._roi_ema[1],
            )

        count_estimate = len(box_list)
        if self._count_ema is None:
            self._count_ema = float(count_estimate)
        else:
            alpha = self.config.ema_alpha
            self._count_ema = alpha * count_estimate + (1.0 - alpha) * self._count_ema

        stable_hits = self._stable_hits(current_cell)
        stable_anchor = self._stable_anchor()
        is_stable = (
            stable_anchor is not None
            and abs(stable_anchor[0] - current_cell[0]) <= 1
            and abs(stable_anchor[1] - current_cell[1]) <= 1
            and stable_hits >= self.config.stable_min_hits
        )
        mist_flag = 0
        proceed_flag: int | None = None
        decision_reason = "insufficient evidence"

        if self.config.camera_role == "bottom":
            mist_flag = int(
                count_estimate >= self.config.mist_count_threshold
                and hotspot.density_score >= self.config.density_threshold
                and hotspot.roi_confidence >= self.config.confidence_threshold
                and is_stable
            )
            decision_reason = "cooling hotspot stable" if mist_flag else "cooling hotspot not stable enough"
        elif self.config.camera_role == "side":
            side_blocked = (
                count_estimate >= self.config.forward_block_count_threshold
                and hotspot.density_score >= self.config.forward_density_threshold
                and hotspot.roi_confidence >= self.config.forward_confidence_threshold
                and is_stable
            )
            proceed_flag = 0 if side_blocked else 1
            decision_reason = "crowd ahead detected" if side_blocked else "path ahead is clear enough"
        else:
            raise ValueError(f"Unsupported camera role: {self.config.camera_role}")

        dx_m = None
        dy_m = None
        if None not in (altitude_m, fx, fy, cx, cy):
            dx_m = (self._roi_ema[0] - float(cx)) * float(altitude_m) / float(fx)
            dy_m = (self._roi_ema[1] - float(cy)) * float(altitude_m) / float(fy)

        local_latency.decision_ms = (time.perf_counter() - decision_start) * 1000.0
        if local_latency.total_ms <= 0.0:
            local_latency.total_ms = (
                local_latency.capture_ms
                + local_latency.preprocess_ms
                + local_latency.inference_ms
                + local_latency.postprocess_ms
                + local_latency.decision_ms
            )

        return DecisionOutput(
            timestamp_ms=timestamp_ms,
            frame_id=frame_id,
            camera_role=self.config.camera_role,
            roi_u=float(self._roi_ema[0]),
            roi_v=float(self._roi_ema[1]),
            roi_confidence=hotspot.roi_confidence,
            count_estimate=count_estimate,
            density_score=hotspot.density_score,
            mist_flag=mist_flag,
            proceed_flag=proceed_flag,
            decision_reason=decision_reason,
            dx_m=dx_m,
            dy_m=dy_m,
            smoothed_count=float(self._count_ema),
            hotspot_cell_x=hotspot.cell_x,
            hotspot_cell_y=hotspot.cell_y,
            stable_hits=stable_hits,
            latency_ms=local_latency,
        )
