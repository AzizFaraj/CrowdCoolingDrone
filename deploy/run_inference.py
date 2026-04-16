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

import cv2
from ultralytics import YOLO

from crowdcooling_ai.decision import DecisionConfig, TemporalDecisionEngine
from crowdcooling_ai.metrics import summarize_latency
from crowdcooling_ai.runtime import (
    DEVICE_PROFILES,
    boxes_from_result,
    build_mediamtx_stream_pipeline,
    draw_overlay,
    frame_iter,
    resolve_profile_imgsz,
)
from crowdcooling_ai.schemas import LatencyBreakdown


def main() -> None:
    parser = argparse.ArgumentParser(description="Run Jetson-ready inference for the crowd-cooling drone.")
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--source", required=True, help="Image directory, video file, camera index, or GStreamer pipeline.")
    parser.add_argument("--backend", choices=("pytorch", "onnx", "tensorrt"), default="pytorch")
    parser.add_argument("--profile", choices=tuple(DEVICE_PROFILES), default="orin_nano")
    parser.add_argument("--camera-role", choices=("bottom", "side"), default="bottom")
    parser.add_argument("--imgsz", type=int)
    parser.add_argument("--conf", type=float, default=0.10)
    parser.add_argument("--iou", type=float, default=0.70)
    parser.add_argument("--device", default="0")
    parser.add_argument("--max-frames", type=int)
    parser.add_argument("--warmup-frames", type=int, default=20)
    parser.add_argument("--output-dir", type=Path, default=Path("deploy/runs/default"))
    parser.add_argument("--save-video", action="store_true")
    parser.add_argument("--show", action="store_true", help="Display live overlay in an OpenCV window.")
    parser.add_argument("--stream-url", help="Publish the annotated overlay to a MediaMTX path such as rtsp://host:8554/drone-top.")
    parser.add_argument(
        "--stream-protocol",
        choices=("rtsp", "rtmp"),
        default="rtsp",
        help="Protocol used for the annotated output stream.",
    )
    parser.add_argument(
        "--stream-encoder",
        default="x264enc",
        help="GStreamer encoder for annotated streaming. Recommended: x264enc. Optional: nvv4l2h264enc.",
    )
    parser.add_argument("--stream-bitrate-kbps", type=int, default=2500)
    parser.add_argument("--stream-fps", type=float, default=15.0)
    parser.add_argument("--stream-width", type=int)
    parser.add_argument("--stream-height", type=int)
    parser.add_argument(
        "--stream-pipeline",
        help="Custom GStreamer VideoWriter pipeline for annotated streaming. Overrides the built-in MediaMTX pipeline builder.",
    )
    parser.add_argument("--altitude-m", type=float)
    parser.add_argument("--fx", type=float)
    parser.add_argument("--fy", type=float)
    parser.add_argument("--cx", type=float)
    parser.add_argument("--cy", type=float)
    parser.add_argument("--forward-block-count-threshold", type=int, default=10)
    parser.add_argument("--forward-density-threshold", type=float, default=0.12)
    parser.add_argument("--forward-confidence-threshold", type=float, default=0.35)
    args = parser.parse_args()

    imgsz = resolve_profile_imgsz(args.profile, args.imgsz)

    suffix_to_backend = {".pt": "pytorch", ".onnx": "onnx", ".engine": "tensorrt"}
    expected_backend = suffix_to_backend.get(args.model.suffix.lower())
    if expected_backend and expected_backend != args.backend:
        raise ValueError(f"Model suffix {args.model.suffix} does not match requested backend '{args.backend}'.")
    if bool(args.stream_width) ^ bool(args.stream_height):
        raise ValueError("--stream-width and --stream-height must be provided together.")

    args.output_dir.mkdir(parents=True, exist_ok=True)
    model = YOLO(str(args.model))
    decision_engine = TemporalDecisionEngine(
        DecisionConfig(
            camera_role=args.camera_role,
            forward_block_count_threshold=args.forward_block_count_threshold,
            forward_density_threshold=args.forward_density_threshold,
            forward_confidence_threshold=args.forward_confidence_threshold,
        )
    )

    writer = None
    stream_writer = None
    csv_path = args.output_dir / "decision_log.csv"
    jsonl_path = args.output_dir / "decision_log.jsonl"
    csv_handle = csv_path.open("w", newline="", encoding="utf-8")
    jsonl_handle = jsonl_path.open("w", encoding="utf-8")
    csv_writer = csv.DictWriter(
        csv_handle,
        fieldnames=[
            "frame_id",
            "timestamp_ms",
            "camera_role",
            "roi_u",
            "roi_v",
            "roi_confidence",
            "count_estimate",
            "density_score",
            "mist_flag",
            "proceed_flag",
            "decision_reason",
            "dx_m",
            "dy_m",
            "smoothed_count",
            "stable_hits",
            "capture_ms",
            "preprocess_ms",
            "inference_ms",
            "postprocess_ms",
            "decision_ms",
            "total_ms",
        ],
    )
    csv_writer.writeheader()

    latency_records = {key: [] for key in ("capture_ms", "preprocess_ms", "inference_ms", "postprocess_ms", "decision_ms", "total_ms")}
    total_frames_read = 0
    measured_frames = 0

    for frame_index, (frame_id, frame, capture_ms) in enumerate(frame_iter(args.source)):
        total_frames_read += 1
        if args.max_frames is not None and frame_index >= args.max_frames:
            break

        infer_start = time.perf_counter()
        result = model.predict(frame, conf=args.conf, iou=args.iou, imgsz=imgsz, device=args.device, verbose=False)[0]
        detected_boxes = boxes_from_result(result)
        wall_ms = (time.perf_counter() - infer_start) * 1000.0
        speed = getattr(result, "speed", {}) or {}
        latency = LatencyBreakdown(
            capture_ms=capture_ms,
            preprocess_ms=float(speed.get("preprocess", 0.0)),
            inference_ms=float(speed.get("inference", wall_ms)),
            postprocess_ms=float(speed.get("postprocess", 0.0)),
            total_ms=wall_ms + capture_ms,
        )
        decision = decision_engine.update(
            frame_id=frame_id,
            timestamp_ms=int(time.time() * 1000),
            boxes=detected_boxes,
            image_width=frame.shape[1],
            image_height=frame.shape[0],
            latency_ms=latency,
            altitude_m=args.altitude_m,
            fx=args.fx,
            fy=args.fy,
            cx=args.cx,
            cy=args.cy,
        )
        decision.latency_ms.total_ms = max(
            latency.capture_ms + latency.preprocess_ms + latency.inference_ms + latency.postprocess_ms + latency.decision_ms,
            latency.total_ms + latency.decision_ms,
        )

        if frame_index >= args.warmup_frames:
            measured_frames += 1
            payload = decision.to_dict()
            csv_writer.writerow(
                {
                    "frame_id": payload["frame_id"],
                    "timestamp_ms": payload["timestamp_ms"],
                    "camera_role": payload["camera_role"],
                    "roi_u": payload["roi_u"],
                    "roi_v": payload["roi_v"],
                    "roi_confidence": payload["roi_confidence"],
                    "count_estimate": payload["count_estimate"],
                    "density_score": payload["density_score"],
                    "mist_flag": payload["mist_flag"],
                    "proceed_flag": payload["proceed_flag"],
                    "decision_reason": payload["decision_reason"],
                    "dx_m": payload["dx_m"],
                    "dy_m": payload["dy_m"],
                    "smoothed_count": payload["smoothed_count"],
                    "stable_hits": payload["stable_hits"],
                    "capture_ms": payload["latency_ms"]["capture_ms"],
                    "preprocess_ms": payload["latency_ms"]["preprocess_ms"],
                    "inference_ms": payload["latency_ms"]["inference_ms"],
                    "postprocess_ms": payload["latency_ms"]["postprocess_ms"],
                    "decision_ms": payload["latency_ms"]["decision_ms"],
                    "total_ms": payload["latency_ms"]["total_ms"],
                }
            )
            jsonl_handle.write(json.dumps(payload) + "\n")
            for key in latency_records:
                latency_records[key].append(payload["latency_ms"][key])

        overlay_frame = None
        if args.save_video or args.show or args.stream_url or args.stream_pipeline:
            overlay_frame = frame.copy()
            draw_overlay(overlay_frame, decision, detected_boxes)

        if args.save_video and overlay_frame is not None:
            if writer is None:
                video_path = args.output_dir / "overlay.mp4"
                writer = cv2.VideoWriter(
                    str(video_path),
                    cv2.VideoWriter_fourcc(*"mp4v"),
                    20.0,
                    (frame.shape[1], frame.shape[0]),
                )
            writer.write(overlay_frame)

        if (args.stream_url or args.stream_pipeline) and overlay_frame is not None:
            stream_frame = overlay_frame
            if args.stream_width and args.stream_height:
                stream_frame = cv2.resize(
                    stream_frame,
                    (args.stream_width, args.stream_height),
                    interpolation=cv2.INTER_AREA,
                )

            if stream_writer is None:
                stream_size = (stream_frame.shape[1], stream_frame.shape[0])
                stream_pipeline = args.stream_pipeline or build_mediamtx_stream_pipeline(
                    url=args.stream_url,
                    protocol=args.stream_protocol,
                    fps=args.stream_fps,
                    width=stream_size[0],
                    height=stream_size[1],
                    encoder=args.stream_encoder,
                    bitrate_kbps=args.stream_bitrate_kbps,
                )
                stream_writer = cv2.VideoWriter(
                    stream_pipeline,
                    cv2.CAP_GSTREAMER,
                    0,
                    args.stream_fps,
                    stream_size,
                    True,
                )
                if not stream_writer.isOpened():
                    raise RuntimeError(
                        "Failed to open the annotated stream writer. "
                        "Check that OpenCV has GStreamer support and that the encoder/plugin is available. "
                        f"Pipeline: {stream_pipeline}"
                    )

            stream_writer.write(stream_frame)

        if args.show and overlay_frame is not None:
            cv2.imshow(f"CrowdCooling - {args.camera_role}", overlay_frame)
            key = cv2.waitKey(1) & 0xFF
            if key in (27, ord("q")):
                break

    csv_handle.close()
    jsonl_handle.close()
    if writer is not None:
        writer.release()
    if stream_writer is not None:
        stream_writer.release()
    if args.show:
        cv2.destroyAllWindows()

    if total_frames_read == 0:
        raise RuntimeError(
            "No frames were read from the source. Check the camera pipeline, source path, or OpenCV GStreamer support."
        )

    summary = {key: summarize_latency(values) for key, values in latency_records.items()}
    summary["frames_read"] = total_frames_read
    summary["frames_measured"] = measured_frames
    (args.output_dir / "latency_summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
