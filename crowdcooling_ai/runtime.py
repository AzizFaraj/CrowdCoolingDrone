from __future__ import annotations

import time
from pathlib import Path
from typing import Iterator

import cv2

from .schemas import DetectedBox


DEVICE_PROFILES = {
    "jetson_nano": {"default_imgsz": 640, "max_imgsz": 640},
    "orin_nano": {"default_imgsz": 640, "max_imgsz": 960},
    "desktop": {"default_imgsz": 640, "max_imgsz": 1280},
}


def build_mediamtx_stream_pipeline(
    *,
    url: str,
    protocol: str,
    fps: float,
    width: int,
    height: int,
    encoder: str = "x264enc",
    bitrate_kbps: int = 2500,
) -> str:
    if protocol not in {"rtsp", "rtmp"}:
        raise ValueError(f"Unsupported stream protocol '{protocol}'.")

    base = (
        "appsrc is-live=true block=true format=time "
        f"caps=video/x-raw,format=BGR,width={width},height={height},framerate={max(int(round(fps)), 1)}/1 ! "
        "videoconvert ! "
        "video/x-raw,format=I420 ! "
    )

    if encoder == "x264enc":
        encode = (
            f"x264enc tune=zerolatency speed-preset=ultrafast bitrate={bitrate_kbps} "
            "key-int-max=30 bframes=0 byte-stream=true ! "
            "h264parse config-interval=1 ! "
        )
    elif encoder == "nvv4l2h264enc":
        encode = (
            "nvvidconv ! "
            f"nvv4l2h264enc insert-sps-pps=true iframeinterval=30 idrinterval=30 bitrate={bitrate_kbps * 1000} ! "
            "h264parse config-interval=1 ! "
        )
    else:
        raise ValueError(
            f"Unsupported stream encoder '{encoder}'. Use 'x264enc', 'nvv4l2h264enc', or --stream-pipeline."
        )

    if protocol == "rtsp":
        sink = f"rtspclientsink location={url} protocols=tcp"
    else:
        sink = f"flvmux streamable=true ! rtmpsink location={url}"

    return base + encode + sink


def resolve_profile_imgsz(profile_name: str, requested_imgsz: int | None) -> int:
    profile = DEVICE_PROFILES[profile_name]
    imgsz = requested_imgsz or profile["default_imgsz"]
    if imgsz > profile["max_imgsz"]:
        raise ValueError(f"Profile '{profile_name}' only supports imgsz <= {profile['max_imgsz']}.")
    return imgsz


def frame_iter(source: str) -> Iterator[tuple[str, any, float]]:
    source_path = Path(source)
    if source_path.is_dir():
        for image_path in sorted(source_path.iterdir()):
            if image_path.suffix.lower() not in {".jpg", ".jpeg", ".png"}:
                continue
            frame = cv2.imread(str(image_path))
            yield image_path.stem, frame, 0.0
        return

    if source_path.is_file():
        capture = cv2.VideoCapture(str(source_path))
    else:
        try:
            capture = cv2.VideoCapture(int(source))
        except ValueError:
            capture = cv2.VideoCapture(source, cv2.CAP_GSTREAMER)

    frame_index = 0
    while True:
        capture_start = time.perf_counter()
        ok, frame = capture.read()
        capture_ms = (time.perf_counter() - capture_start) * 1000.0
        if not ok:
            break
        yield f"frame_{frame_index:06d}", frame, capture_ms
        frame_index += 1
    capture.release()


def boxes_from_result(result) -> list[DetectedBox]:
    if result.boxes is None:
        return []
    xyxy = result.boxes.xyxy.cpu().numpy()
    conf = result.boxes.conf.cpu().numpy() if result.boxes.conf is not None else []
    cls = result.boxes.cls.cpu().numpy() if result.boxes.cls is not None else []
    boxes = []
    for index, xy in enumerate(xyxy):
        boxes.append(
            DetectedBox(
                x1=float(xy[0]),
                y1=float(xy[1]),
                x2=float(xy[2]),
                y2=float(xy[3]),
                confidence=float(conf[index]) if len(conf) > index else 0.0,
                class_id=int(cls[index]) if len(cls) > index else 0,
            )
        )
    return boxes


def draw_overlay(frame, decision_output, boxes: list[DetectedBox] | None = None) -> None:
    for box in boxes or []:
        top_left = (int(box.x1), int(box.y1))
        bottom_right = (int(box.x2), int(box.y2))
        cv2.rectangle(frame, top_left, bottom_right, (0, 255, 0), 2)
        label = f"{box.confidence:.2f}"
        label_origin = (top_left[0], max(top_left[1] - 8, 18))
        cv2.putText(frame, label, label_origin, cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 255, 0), 2)

    roi_u = int(decision_output.roi_u)
    roi_v = int(decision_output.roi_v)
    cv2.drawMarker(frame, (roi_u, roi_v), (0, 0, 255), cv2.MARKER_CROSS, 18, 2)
    if decision_output.camera_role == "side":
        action_line = f"count={decision_output.count_estimate} proceed={decision_output.proceed_flag}"
    else:
        action_line = f"count={decision_output.count_estimate} mist={decision_output.mist_flag}"
    overlay = [
        action_line,
        f"role={decision_output.camera_role} roi=({roi_u},{roi_v}) density={decision_output.density_score:.2f}",
        f"latency={decision_output.latency_ms.total_ms:.1f} ms",
    ]
    for index, text in enumerate(overlay):
        cv2.putText(frame, text, (10, 28 + 28 * index), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
