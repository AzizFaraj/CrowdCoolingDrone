# LiveKit Video Transport

This branch now supports an **optional LiveKit video path** for the Vision page.

The intended architecture is:

```text
Jetson CSI camera -> separate LiveKit publisher process -> LiveKit room -> Dashboard subscriber
                                                           \
                                                            -> existing telemetry WebSocket
```

LiveKit is used for **video only**. The existing telemetry WebSocket remains the source of AI metrics, decision traces, and heartbeat data.

## Why It Is Split This Way

The current Jetson AI environment is pinned to:

- JetPack `5.1.2`
- Python `3.8.10`

The current LiveKit Python SDK requires **Python 3.9+**. That means the LiveKit publisher **cannot** run inside the existing AI venv on the Jetson.

Use two separate runtime environments:

1. **Jetson AI runtime**
   - Python `3.8`
   - PyTorch / Ultralytics / inference pipeline
2. **LiveKit publisher runtime**
   - Python `3.9+`
   - `livekit` package only
   - camera-to-dashboard streaming

## Dashboard Setup

Add these environment variables to the dashboard app:

```env
NEXT_PUBLIC_VIDEO_TRANSPORT=livekit
NEXT_PUBLIC_LIVEKIT_URL=wss://your-livekit-server
NEXT_PUBLIC_LIVEKIT_ROOM=drone-1
NEXT_PUBLIC_LIVEKIT_TOKEN_ENDPOINT=/api/livekit/token

LIVEKIT_API_KEY=your_api_key
LIVEKIT_API_SECRET=your_api_secret
LIVEKIT_URL=wss://your-livekit-server
```

The dashboard already includes:

- a token route at `src/app/api/livekit/token/route.ts`
- a LiveKit client hook at `src/hooks/useLiveKitStream.ts`
- a track renderer at `src/components/vision/LiveKitVideoFeed.tsx`

The Vision page uses the environment variable `NEXT_PUBLIC_VIDEO_TRANSPORT` to choose between:

- `webrtc`
- `livekit`

## Track Naming

Track names must match the dashboard camera IDs exactly:

- `top-down`
- `side-view`

If the names do not match, the dashboard will connect to the room but show **No video signal**.

## Jetson Publisher

The publisher script is:

```text
deploy/livekit_publisher.py
```

It publishes one camera feed into a room as one named LiveKit video track.

Example:

```bash
python deploy/livekit_publisher.py \
  --source "nvarguscamerasrc sensor-id=0 ! video/x-raw(memory:NVMM),width=1280,height=720,framerate=30/1,format=NV12 ! queue ! nvvidconv flip-method=0 ! video/x-raw,format=BGRx ! videoconvert ! video/x-raw,format=BGR ! appsink drop=true max-buffers=1 sync=false" \
  --track-name top-down \
  --room drone-1 \
  --token-endpoint "https://your-dashboard-host/api/livekit/token" \
  --fps 15 \
  --show
```

For the side camera:

```bash
python deploy/livekit_publisher.py \
  --source "nvarguscamerasrc sensor-id=1 ! video/x-raw(memory:NVMM),width=1280,height=720,framerate=30/1,format=NV12 ! queue ! nvvidconv flip-method=0 ! video/x-raw,format=BGRx ! videoconvert ! video/x-raw,format=BGR ! appsink drop=true max-buffers=1 sync=false" \
  --track-name side-view \
  --room drone-1 \
  --token-endpoint "https://your-dashboard-host/api/livekit/token" \
  --fps 15 \
  --show
```

The publisher requests a token from the dashboard token route using:

- `publish=1`
- `subscribe=0`

This avoids needing the LiveKit server SDK on the Jetson.

## Publisher Environment

Install the publisher dependencies in a separate Python `3.9+` environment:

```bash
python3.10 -m venv ~/venvs/livekit-publisher
source ~/venvs/livekit-publisher/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements-livekit-publisher.txt
```

`opencv-python` is **not** listed in `requirements-livekit-publisher.txt` on purpose. On Jetson, prefer the system OpenCV build with GStreamer support.

## Operational Notes

- The dashboard stream is for operator visibility.
- Keep the inference/control loop local on the Jetson.
- Do not make AI decisions from the dashboard video stream.
- Start with `1280x720 @ 15 fps` or `30 fps`, not `1080p60`.

## Current Limitation

This first version publishes **raw camera frames**. It does not yet publish the AI-annotated overlay.

If you want the dashboard to show the inference boxes, count, and ROI exactly as rendered on Jetson, the next step is to feed the annotated frames from the inference pipeline into the LiveKit publisher instead of the raw CSI frames.
