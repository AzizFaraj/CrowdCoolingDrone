from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass(slots=True)
class LatencyBreakdown:
    capture_ms: float = 0.0
    preprocess_ms: float = 0.0
    inference_ms: float = 0.0
    postprocess_ms: float = 0.0
    decision_ms: float = 0.0
    total_ms: float = 0.0

    def to_dict(self) -> dict[str, float]:
        return asdict(self)


@dataclass(slots=True)
class DetectedBox:
    x1: float
    y1: float
    x2: float
    y2: float
    confidence: float
    class_id: int = 0

    @property
    def center(self) -> tuple[float, float]:
        return ((self.x1 + self.x2) / 2.0, (self.y1 + self.y2) / 2.0)


@dataclass(slots=True)
class DecisionOutput:
    timestamp_ms: int
    frame_id: str
    camera_role: str
    roi_u: float
    roi_v: float
    roi_confidence: float
    count_estimate: int
    density_score: float
    mist_flag: int
    proceed_flag: int | None = None
    decision_reason: str = ""
    dx_m: float | None = None
    dy_m: float | None = None
    smoothed_count: float = 0.0
    hotspot_cell_x: int = 0
    hotspot_cell_y: int = 0
    stable_hits: int = 0
    latency_ms: LatencyBreakdown = field(default_factory=LatencyBreakdown)

    def to_dict(self) -> dict[str, Any]:
        payload = asdict(self)
        payload["latency_ms"] = self.latency_ms.to_dict()
        return payload
