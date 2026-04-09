from __future__ import annotations

import argparse
import csv
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from ultralytics import YOLO

from crowdcooling_ai.decision import DecisionConfig, TemporalDecisionEngine
from crowdcooling_ai.metrics import summarize_latency
from crowdcooling_ai.runtime import DEVICE_PROFILES, boxes_from_result, frame_iter, resolve_profile_imgsz
from crowdcooling_ai.schemas import LatencyBreakdown


def _pair_iter(bottom_source: str, side_source: str):
    for bottom_item, side_item in zip(frame_iter(bottom_source), frame_iter(side_source)):
        yield bottom_item, side_item


def _decision_to_row(decision) -> dict[str, object]:
    payload = decision.to_dict()
    return {
        "frame_id": payload["frame_id"],
        "camera_role": payload["camera_role"],
        "timestamp_ms": payload["timestamp_ms"],
        "roi_u": payload["roi_u"],
        "roi_v": payload["roi_v"],
        "roi_confidence": payload["roi_confidence"],
        "count_estimate": payload["count_estimate"],
        "density_score": payload["density_score"],
        "mist_flag": payload["mist_flag"],
        "proceed_flag": payload["proceed_flag"],
        "decision_reason": payload["decision_reason"],
        "total_ms": payload["latency_ms"]["total_ms"],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Run dual-camera inference for bottom cooling and side navigation.")
    parser.add_argument("--bottom-model", type=Path, required=True)
    parser.add_argument("--bottom-source", required=True)
    parser.add_argument("--side-model", type=Path)
    parser.add_argument("--side-source", required=True)
    parser.add_argument("--backend", choices=("pytorch", "onnx", "tensorrt"), default="pytorch")
    parser.add_argument("--profile", choices=tuple(DEVICE_PROFILES), default="orin_nano")
    parser.add_argument("--bottom-imgsz", type=int)
    parser.add_argument("--side-imgsz", type=int)
    parser.add_argument("--bottom-conf", type=float, default=0.10)
    parser.add_argument("--bottom-iou", type=float, default=0.70)
    parser.add_argument("--side-conf", type=float, default=0.25)
    parser.add_argument("--side-iou", type=float, default=0.50)
    parser.add_argument("--device", default="0")
    parser.add_argument("--max-frames", type=int)
    parser.add_argument("--warmup-frames", type=int, default=20)
    parser.add_argument("--output-dir", type=Path, default=Path("deploy/runs/dual_camera"))
    parser.add_argument("--altitude-m", type=float)
    parser.add_argument("--fx", type=float)
    parser.add_argument("--fy", type=float)
    parser.add_argument("--cx", type=float)
    parser.add_argument("--cy", type=float)
    parser.add_argument("--forward-block-count-threshold", type=int, default=10)
    parser.add_argument("--forward-density-threshold", type=float, default=0.12)
    parser.add_argument("--forward-confidence-threshold", type=float, default=0.35)
    args = parser.parse_args()

    bottom_imgsz = resolve_profile_imgsz(args.profile, args.bottom_imgsz)
    side_imgsz = resolve_profile_imgsz(args.profile, args.side_imgsz)

    args.output_dir.mkdir(parents=True, exist_ok=True)
    bottom_model = YOLO(str(args.bottom_model))
    side_model = YOLO(str(args.side_model or args.bottom_model))
    bottom_engine = TemporalDecisionEngine(DecisionConfig(camera_role="bottom"))
    side_engine = TemporalDecisionEngine(
        DecisionConfig(
            camera_role="side",
            forward_block_count_threshold=args.forward_block_count_threshold,
            forward_density_threshold=args.forward_density_threshold,
            forward_confidence_threshold=args.forward_confidence_threshold,
        )
    )

    csv_path = args.output_dir / "dual_camera_log.csv"
    csv_handle = csv_path.open("w", newline="", encoding="utf-8")
    csv_writer = csv.DictWriter(
        csv_handle,
        fieldnames=[
            "pair_index",
            "bottom_frame_id",
            "side_frame_id",
            "bottom_count_estimate",
            "bottom_mist_flag",
            "bottom_roi_u",
            "bottom_roi_v",
            "side_count_estimate",
            "side_proceed_flag",
            "side_roi_u",
            "side_roi_v",
            "fused_proceed_flag",
            "fused_reason",
            "bottom_total_ms",
            "side_total_ms",
        ],
    )
    csv_writer.writeheader()

    latency_records = {"bottom_total_ms": [], "side_total_ms": []}

    for pair_index, ((bottom_frame_id, bottom_frame, bottom_capture_ms), (side_frame_id, side_frame, side_capture_ms)) in enumerate(
        _pair_iter(args.bottom_source, args.side_source)
    ):
        if args.max_frames is not None and pair_index >= args.max_frames:
            break

        bottom_start = time.perf_counter()
        bottom_result = bottom_model.predict(
            bottom_frame,
            conf=args.bottom_conf,
            iou=args.bottom_iou,
            imgsz=bottom_imgsz,
            device=args.device,
            verbose=False,
        )[0]
        bottom_wall_ms = (time.perf_counter() - bottom_start) * 1000.0
        bottom_speed = getattr(bottom_result, "speed", {}) or {}
        bottom_latency = LatencyBreakdown(
            capture_ms=bottom_capture_ms,
            preprocess_ms=float(bottom_speed.get("preprocess", 0.0)),
            inference_ms=float(bottom_speed.get("inference", bottom_wall_ms)),
            postprocess_ms=float(bottom_speed.get("postprocess", 0.0)),
            total_ms=bottom_capture_ms + bottom_wall_ms,
        )
        bottom_decision = bottom_engine.update(
            frame_id=bottom_frame_id,
            timestamp_ms=int(time.time() * 1000),
            boxes=boxes_from_result(bottom_result),
            image_width=bottom_frame.shape[1],
            image_height=bottom_frame.shape[0],
            latency_ms=bottom_latency,
            altitude_m=args.altitude_m,
            fx=args.fx,
            fy=args.fy,
            cx=args.cx,
            cy=args.cy,
        )

        side_start = time.perf_counter()
        side_result = side_model.predict(
            side_frame,
            conf=args.side_conf,
            iou=args.side_iou,
            imgsz=side_imgsz,
            device=args.device,
            verbose=False,
        )[0]
        side_wall_ms = (time.perf_counter() - side_start) * 1000.0
        side_speed = getattr(side_result, "speed", {}) or {}
        side_latency = LatencyBreakdown(
            capture_ms=side_capture_ms,
            preprocess_ms=float(side_speed.get("preprocess", 0.0)),
            inference_ms=float(side_speed.get("inference", side_wall_ms)),
            postprocess_ms=float(side_speed.get("postprocess", 0.0)),
            total_ms=side_capture_ms + side_wall_ms,
        )
        side_decision = side_engine.update(
            frame_id=side_frame_id,
            timestamp_ms=int(time.time() * 1000),
            boxes=boxes_from_result(side_result),
            image_width=side_frame.shape[1],
            image_height=side_frame.shape[0],
            latency_ms=side_latency,
        )

        fused_proceed_flag = int((side_decision.proceed_flag or 0) == 1)
        fused_reason = (
            "side camera path clear; bottom camera handles cooling"
            if fused_proceed_flag
            else "side camera detected a crowd ahead; hold position or re-route"
        )

        if pair_index >= args.warmup_frames:
            csv_writer.writerow(
                {
                    "pair_index": pair_index,
                    "bottom_frame_id": bottom_decision.frame_id,
                    "side_frame_id": side_decision.frame_id,
                    "bottom_count_estimate": bottom_decision.count_estimate,
                    "bottom_mist_flag": bottom_decision.mist_flag,
                    "bottom_roi_u": bottom_decision.roi_u,
                    "bottom_roi_v": bottom_decision.roi_v,
                    "side_count_estimate": side_decision.count_estimate,
                    "side_proceed_flag": side_decision.proceed_flag,
                    "side_roi_u": side_decision.roi_u,
                    "side_roi_v": side_decision.roi_v,
                    "fused_proceed_flag": fused_proceed_flag,
                    "fused_reason": fused_reason,
                    "bottom_total_ms": bottom_decision.latency_ms.total_ms,
                    "side_total_ms": side_decision.latency_ms.total_ms,
                }
            )
            latency_records["bottom_total_ms"].append(bottom_decision.latency_ms.total_ms)
            latency_records["side_total_ms"].append(side_decision.latency_ms.total_ms)

    csv_handle.close()
    summary = {
        "bottom_total_ms": summarize_latency(latency_records["bottom_total_ms"]),
        "side_total_ms": summarize_latency(latency_records["side_total_ms"]),
        "bottom_model": str(args.bottom_model.resolve()),
        "side_model": str((args.side_model or args.bottom_model).resolve()),
        "profile": args.profile,
    }
    (args.output_dir / "dual_camera_summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
