#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
CrowdCooling -- Jetson WebRTC Signaling Bridge.

Connects to the signaling relay (or runs on the Jetson's local WS in
direct mode), listens for ``webrtc:request-stream`` from the dashboard,
and publishes a live H.264 camera feed via WebRTC using aiortc.

Usage (relay mode -- cross-network):
    python deploy/webrtc_bridge.py \
        --relay-url wss://relay.your-domain.com/ws \
        --drone-id drone-01

Usage (direct mode -- same LAN, Jetson runs its own WS):
    python deploy/webrtc_bridge.py --direct --port 8080

Environment variables (override CLI args):
    RELAY_URL, DRONE_ID, RELAY_AUTH_TOKEN

Requirements (install on Jetson):
    pip install aiortc websockets opencv-python aiohttp
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import signal
import sys
# typing not used -- removed for Python 3.6+ compat

import cv2
from aiortc import RTCPeerConnection, RTCSessionDescription, VideoStreamTrack
from aiortc.contrib.media import MediaRelay
from av import VideoFrame

# ── logging ──────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("webrtc-bridge")

# ── camera video track ───────────────────────────────────────────────


class CameraVideoTrack(VideoStreamTrack):
    """Captures frames from an OpenCV VideoCapture and serves them as
    a WebRTC video track.  Uses GStreamer on Jetson for NVENC H.264."""

    kind = "video"

    def __init__(self, device=0, width=640, height=480, fps=15):
        super().__init__()
        self._target_w = width
        self._target_h = height
        self._cap = None

        # Try GStreamer pipeline first (Jetson NVENC), fall back to V4L2
        gst_pipeline = (
            "nvarguscamerasrc sensor-id=%s ! "
            "video/x-raw(memory:NVMM),width=%d,height=%d,"
            "framerate=%d/1,format=NV12 ! "
            "nvvidconv ! video/x-raw,format=BGRx ! "
            "videoconvert ! video/x-raw,format=BGR ! appsink"
            % (str(device), width, height, fps)
        )
        try:
            self._cap = cv2.VideoCapture(gst_pipeline, cv2.CAP_GSTREAMER)
        except Exception:
            pass

        if self._cap is None or not self._cap.isOpened():
            log.warning("GStreamer pipeline failed, falling back to V4L2 device %s", device)
            dev = int(device) if str(device).isdigit() else device
            self._cap = cv2.VideoCapture(dev)
            if self._cap.isOpened():
                self._cap.set(cv2.CAP_PROP_FRAME_WIDTH, width)
                self._cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)
                self._cap.set(cv2.CAP_PROP_FPS, fps)

        if self._cap is None or not self._cap.isOpened():
            raise RuntimeError("Cannot open camera device %s" % str(device))

        self._fps = fps
        actual_w = int(self._cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        actual_h = int(self._cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        log.info(
            "Camera opened: %dx%d (target %dx%d) @ %d fps (device=%s)",
            actual_w, actual_h, width, height, fps, device,
        )
        # Flag if we need to resize
        self._needs_resize = (actual_w != width or actual_h != height)

    async def recv(self):
        pts, time_base = await self.next_timestamp()
        ret, frame = self._cap.read()
        if not ret:
            import numpy as np
            frame = np.zeros((self._target_h, self._target_w, 3), dtype=np.uint8)

        # Resize large frames so aiortc can encode them in real-time
        if self._needs_resize:
            frame = cv2.resize(frame, (self._target_w, self._target_h))

        video_frame = VideoFrame.from_ndarray(frame, format="bgr24")
        video_frame.pts = pts
        video_frame.time_base = time_base
        return video_frame

    def stop(self):
        super().stop()
        if self._cap is not None:
            self._cap.release()
            self._cap = None
            log.info("Camera device released")


# ── camera mapping ───────────────────────────────────────────────────

# Map dashboard camera IDs to Jetson device indices / paths.
# Both map to device 0 if only one camera is connected.
CAMERA_MAP = {
    "top-down": 0,   # CSI camera 0 (or /dev/video0)
    "side-view": 0,  # Change to 1 when second camera is connected
}

# ── peer connection management ───────────────────────────────────────

pcs = {}       # camera -> RTCPeerConnection
tracks = {}    # camera -> CameraVideoTrack


async def create_offer_for_camera(camera, send_fn):
    """Create an RTCPeerConnection, add the camera track, and send an
    SDP offer to the dashboard via *send_fn*."""

    # Close existing PC and release camera for this slot
    await stop_camera(camera)

    pc = RTCPeerConnection()
    pcs[camera] = pc

    device = CAMERA_MAP.get(camera, 0)
    try:
        track = CameraVideoTrack(device=device)
        tracks[camera] = track
    except RuntimeError as exc:
        log.error("Cannot open camera %s (%s): %s", camera, device, exc)
        await pc.close()
        pcs.pop(camera, None)
        return

    pc.addTrack(track)

    @pc.on("iceconnectionstatechange")
    async def _on_ice_state():
        log.info("ICE state (%s): %s", camera, pc.iceConnectionState)
        if pc.iceConnectionState == "connected":
            log.info("[OK] WebRTC connected for %s", camera)
        elif pc.iceConnectionState in ("failed", "closed"):
            await stop_camera(camera)

    @pc.on("icecandidate")
    def _on_ice_candidate(candidate):
        if candidate:
            send_fn(json.dumps({
                "type": "webrtc:ice-candidate",
                "camera": camera,
                "candidate": {
                    "candidate": candidate.candidate,
                    "sdpMid": candidate.sdpMid,
                    "sdpMLineIndex": candidate.sdpMLineIndex,
                },
            }))

    offer = await pc.createOffer()
    await pc.setLocalDescription(offer)

    send_fn(json.dumps({
        "type": "webrtc:offer",
        "camera": camera,
        "sdp": pc.localDescription.sdp,
    }))
    log.info("Sent offer for camera: %s", camera)


async def handle_answer(camera, sdp):
    pc = pcs.get(camera)
    if not pc:
        log.warning("Got answer for unknown camera: %s", camera)
        return
    await pc.setRemoteDescription(RTCSessionDescription(sdp=sdp, type="answer"))
    log.info("Remote description set for camera: %s", camera)


async def handle_ice_candidate(camera, candidate_dict):
    pc = pcs.get(camera)
    if not pc:
        return
    try:
        from aiortc import RTCIceCandidate
        # aiortc expects the candidate string without "candidate:" prefix
        cand_str = candidate_dict.get("candidate", "")
        if cand_str.startswith("candidate:"):
            cand_str = cand_str[len("candidate:"):]
        # Parse the candidate — aiortc handles this internally via
        # setRemoteDescription; trickle ICE not fully supported in aiortc,
        # so we log and skip. The offer/answer exchange includes all
        # candidates gathered before setLocalDescription returns.
        log.debug("Received ICE candidate for %s (trickle — logged only)", camera)
    except Exception as exc:
        log.debug("ICE candidate handling: %s", exc)


async def stop_camera(camera=None):
    """Stop a specific camera, or all if camera is None."""
    if camera is not None:
        # Stop the track first to release the device
        t = tracks.pop(camera, None)
        if t is not None:
            t.stop()
        pc = pcs.pop(camera, None)
        if pc is not None:
            await pc.close()
            log.info("Stopped camera: %s", camera)
    else:
        # Stop all
        for t in tracks.values():
            t.stop()
        tracks.clear()
        coros = [pc.close() for pc in pcs.values()]
        await asyncio.gather(*coros, return_exceptions=True)
        pcs.clear()


async def cleanup_all():
    await stop_camera(None)


# ── relay mode ───────────────────────────────────────────────────────

async def run_relay(relay_url, drone_id, auth_token):
    """Connect to the public relay and handle signaling messages."""
    import websockets

    while True:
        try:
            log.info("Connecting to relay: %s", relay_url)
            async with websockets.connect(relay_url) as ws:
                # Register
                reg = {"type": "register", "role": "jetson", "droneId": drone_id}
                if auth_token:
                    reg["token"] = auth_token
                await ws.send(json.dumps(reg))
                log.info("Sent registration (drone=%s)", drone_id)

                def send_fn(raw):
                    asyncio.ensure_future(ws.send(raw))

                async for raw in ws:
                    try:
                        msg = json.loads(raw)
                    except json.JSONDecodeError:
                        continue

                    msg_type = msg.get("type", "")

                    if msg_type == "registered":
                        log.info("[OK] Registered as jetson for %s", msg.get("droneId"))
                        continue

                    if msg_type == "relay:error":
                        log.error("Relay error: %s", msg.get("message"))
                        continue

                    if msg_type == "webrtc:request-stream":
                        camera = msg.get("camera", "top-down")
                        log.info("[STREAM] Stream requested: %s", camera)
                        await create_offer_for_camera(camera, send_fn)

                    elif msg_type == "webrtc:answer":
                        await handle_answer(msg["camera"], msg["sdp"])

                    elif msg_type == "webrtc:ice-candidate":
                        await handle_ice_candidate(msg["camera"], msg.get("candidate", {}))

                    elif msg_type == "webrtc:stop-stream":
                        await stop_camera(msg["camera"])

        except Exception as exc:
            log.warning("Relay connection lost: %s -- reconnecting in 3s", exc)
            await cleanup_all()
            await asyncio.sleep(3)


# ── direct mode (Jetson runs its own WS server) ─────────────────────

async def run_direct(host, port):
    """Run a WebSocket server on the Jetson for same-LAN connections."""
    import websockets

    async def handler(ws, path=None):
        log.info("Dashboard connected from %s", ws.remote_address)

        def send_fn(raw):
            asyncio.ensure_future(ws.send(raw))

        try:
            async for raw in ws:
                try:
                    msg = json.loads(raw)
                except json.JSONDecodeError:
                    continue

                msg_type = msg.get("type", "")

                if msg_type == "HEARTBEAT":
                    continue

                if msg_type == "webrtc:request-stream":
                    camera = msg.get("camera", "top-down")
                    log.info("[STREAM] Stream requested: %s", camera)
                    await create_offer_for_camera(camera, send_fn)

                elif msg_type == "webrtc:answer":
                    await handle_answer(msg["camera"], msg["sdp"])

                elif msg_type == "webrtc:ice-candidate":
                    await handle_ice_candidate(msg["camera"], msg.get("candidate", {}))

                elif msg_type == "webrtc:stop-stream":
                    await stop_camera(msg["camera"])

        except websockets.ConnectionClosed:
            log.info("Dashboard disconnected")
        finally:
            await cleanup_all()

    log.info("Direct mode -- listening on ws://%s:%d", host, port)
    async with websockets.serve(handler, host, port):
        await asyncio.Future()  # run forever


# ── main ─────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Jetson WebRTC signaling bridge")
    parser.add_argument("--direct", action="store_true", help="Run in direct mode (Jetson hosts WS server)")
    parser.add_argument("--host", default="0.0.0.0", help="Direct mode: bind address")
    parser.add_argument("--port", type=int, default=8080, help="Direct mode: listen port")
    parser.add_argument("--relay-url", default=None, help="Relay mode: relay WebSocket URL")
    parser.add_argument("--drone-id", default=None, help="Drone ID for relay pairing")
    parser.add_argument("--auth-token", default=None, help="Relay auth token")
    args = parser.parse_args()

    # Env vars override CLI
    relay_url = args.relay_url or os.environ.get("RELAY_URL", "ws://localhost:8080/ws")
    drone_id = args.drone_id or os.environ.get("DRONE_ID", "drone-01")
    auth_token = args.auth_token or os.environ.get("RELAY_AUTH_TOKEN", "")

    loop = asyncio.new_event_loop()

    # Graceful shutdown
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, lambda: asyncio.ensure_future(shutdown(loop)))

    if args.direct:
        loop.run_until_complete(run_direct(args.host, args.port))
    else:
        loop.run_until_complete(run_relay(relay_url, drone_id, auth_token))


async def shutdown(loop):
    log.info("Shutting down...")
    await cleanup_all()
    tasks = [t for t in asyncio.all_tasks() if t is not asyncio.current_task()]
    for t in tasks:
        t.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)
    loop.stop()


if __name__ == "__main__":
    main()
