from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path

import cv2

if sys.version_info < (3, 9):
    raise RuntimeError(
        "LiveKit's current Python SDK requires Python 3.9 or newer. "
        "Run this publisher in a separate Python 3.9+ environment instead of the Jetson AI venv."
    )

from livekit import rtc


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


TRACK_NAMES = ("top-down", "side-view")


@dataclass
class LiveKitCredentials:
    token: str
    url: str
    room: str
    identity: str
    name: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Publish a Jetson camera or video source into a LiveKit room.",
    )
    parser.add_argument(
        "--source",
        required=True,
        help="Camera index, video path, or GStreamer pipeline.",
    )
    parser.add_argument(
        "--track-name",
        choices=TRACK_NAMES,
        required=True,
        help="LiveKit video track name. Match the dashboard camera selector IDs.",
    )
    parser.add_argument(
        "--room",
        default="drone-1",
        help="LiveKit room name.",
    )
    parser.add_argument(
        "--identity",
        help="Participant identity. Defaults to jetson-<track-name>.",
    )
    parser.add_argument(
        "--name",
        default="Jetson Publisher",
        help="Participant display name.",
    )
    parser.add_argument(
        "--token-endpoint",
        help="HTTP endpoint that returns a LiveKit token JSON payload.",
    )
    parser.add_argument(
        "--token",
        help="LiveKit JWT. Use this or --token-endpoint.",
    )
    parser.add_argument(
        "--url",
        help="LiveKit WebSocket URL. Use this or return it from --token-endpoint.",
    )
    parser.add_argument(
        "--fps",
        type=float,
        default=15.0,
        help="Target publish frame rate.",
    )
    parser.add_argument(
        "--width",
        type=int,
        help="Resize frames to this width before publishing.",
    )
    parser.add_argument(
        "--height",
        type=int,
        help="Resize frames to this height before publishing.",
    )
    parser.add_argument(
        "--loop",
        action="store_true",
        help="Loop file-based sources when they reach EOF.",
    )
    parser.add_argument(
        "--show",
        action="store_true",
        help="Show a local preview window while publishing.",
    )
    return parser.parse_args()


def resolve_capture(source: str) -> cv2.VideoCapture:
    source_path = Path(source)
    if source_path.is_file():
        return cv2.VideoCapture(str(source_path))
    try:
        return cv2.VideoCapture(int(source))
    except ValueError:
        return cv2.VideoCapture(source, cv2.CAP_GSTREAMER)


def fetch_credentials(args: argparse.Namespace) -> LiveKitCredentials:
    identity = args.identity or f"jetson-{args.track_name}"

    if args.token:
        if not args.url:
            raise ValueError("--url is required when using --token directly.")
        return LiveKitCredentials(
            token=args.token,
            url=args.url,
            room=args.room,
            identity=identity,
            name=args.name,
        )

    if not args.token_endpoint:
        raise ValueError("Use either --token-endpoint or --token/--url.")

    params = urllib.parse.urlencode(
        {
            "room": args.room,
            "identity": identity,
            "name": args.name,
            "publish": "1",
            "subscribe": "0",
        }
    )
    separator = "&" if "?" in args.token_endpoint else "?"
    request_url = f"{args.token_endpoint}{separator}{params}"

    with urllib.request.urlopen(request_url, timeout=10) as response:
        payload = json.loads(response.read().decode("utf-8"))

    return LiveKitCredentials(
        token=payload["token"],
        url=payload.get("url") or args.url,
        room=payload.get("room", args.room),
        identity=payload.get("identity", identity),
        name=payload.get("name", args.name),
    )


def prepare_frame(frame, width: int | None, height: int | None):
    if width and height:
        frame = cv2.resize(frame, (width, height), interpolation=cv2.INTER_AREA)
    return frame


def make_video_frame(frame) -> rtc.VideoFrame:
    bgra = cv2.cvtColor(frame, cv2.COLOR_BGR2BGRA)
    return rtc.VideoFrame(
        width=frame.shape[1],
        height=frame.shape[0],
        type=rtc.VideoBufferType.BGRA,
        data=memoryview(bgra),
    )


async def publish_frames(args: argparse.Namespace) -> None:
    credentials = fetch_credentials(args)
    if not credentials.url:
        raise RuntimeError(
            "No LiveKit URL was supplied. Provide --url or return 'url' from the token endpoint."
        )

    capture = resolve_capture(args.source)
    if not capture.isOpened():
        raise RuntimeError(f"Failed to open source: {args.source}")

    ok, first_frame = capture.read()
    if not ok or first_frame is None:
        capture.release()
        raise RuntimeError(f"Failed to read the first frame from source: {args.source}")

    first_frame = prepare_frame(first_frame, args.width, args.height)
    frame_height, frame_width = first_frame.shape[:2]

    room = rtc.Room()
    await room.connect(credentials.url, credentials.token)

    source = rtc.VideoSource(frame_width, frame_height)
    track = rtc.LocalVideoTrack.create_video_track(args.track_name, source)
    publish_options = rtc.TrackPublishOptions()
    publish_options.source = rtc.TrackSource.SOURCE_CAMERA
    await room.local_participant.publish_track(track, publish_options)

    frame_interval = 1.0 / args.fps if args.fps > 0 else 0.0
    source_path = Path(args.source)

    try:
        frame = first_frame
        while True:
            loop_start = time.perf_counter()

            if frame.shape[1] != frame_width or frame.shape[0] != frame_height:
                frame = cv2.resize(frame, (frame_width, frame_height), interpolation=cv2.INTER_AREA)

            source.capture_frame(make_video_frame(frame))

            if args.show:
                cv2.imshow(f"LiveKit Publisher - {args.track_name}", frame)
                key = cv2.waitKey(1) & 0xFF
                if key in (27, ord("q")):
                    break

            ok, next_frame = capture.read()
            if not ok or next_frame is None:
                if args.loop and source_path.is_file():
                    capture.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    ok, next_frame = capture.read()
                if not ok or next_frame is None:
                    break

            frame = prepare_frame(next_frame, args.width, args.height)

            elapsed = time.perf_counter() - loop_start
            if frame_interval > 0 and elapsed < frame_interval:
                await asyncio.sleep(frame_interval - elapsed)
    finally:
        capture.release()
        if args.show:
            cv2.destroyAllWindows()
        await room.disconnect()


def main() -> None:
    args = parse_args()
    try:
        asyncio.run(publish_frames(args))
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
