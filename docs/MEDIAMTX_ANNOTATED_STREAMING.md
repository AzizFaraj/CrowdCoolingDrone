# MediaMTX Annotated Video Streaming

This project can now publish the **annotated AI overlay video** directly from the Jetson inference runner to a MediaMTX path.

The flow is:

```text
Jetson CSI camera -> run_inference.py -> annotated frames -> GStreamer encoder -> MediaMTX RTSP/RTMP path
                                                                     |
                                                                     -> boxes + count + ROI burned into the video
```

MediaMTX can then expose that same path back to browsers through:

- **WebRTC**
- **HLS**

Official MediaMTX docs:

- introduction: [https://mediamtx.org/docs/kickoff/introduction](https://mediamtx.org/docs/kickoff/introduction)
- publish: [https://mediamtx.org/docs/usage/publish](https://mediamtx.org/docs/usage/publish)
- read in browsers: [https://mediamtx.org/docs/usage/read](https://mediamtx.org/docs/usage/read)
- WebRTC specifics: [https://mediamtx.org/docs/usage/webrtc-specific-features](https://mediamtx.org/docs/usage/webrtc-specific-features)

## 1. Publish Path

Recommended first publish path:

```text
rtsp://YOUR_MEDIAMTX_HOST:8554/drone-top
```

Examples:

- top camera: `rtsp://203.0.113.10:8554/drone-top`
- side camera: `rtsp://203.0.113.10:8554/drone-side`

## 2. Jetson Dependencies

Required on the Jetson:

- OpenCV with GStreamer support
- GStreamer `x264enc` plugin or another H.264 encoder

Check them:

```bash
python3 - <<'PY'
import cv2
print(cv2.__version__)
print("GStreamer: YES" if "GStreamer:                   YES" in cv2.getBuildInformation() else "Check OpenCV build")
PY

gst-inspect-1.0 x264enc
```

If `x264enc` is missing:

```bash
sudo apt-get update
sudo apt-get install -y gstreamer1.0-plugins-ugly
```

## 3. Jetson Command

This command:

- reads the CSI camera
- runs the current YOLO inference path
- draws bounding boxes, count, and ROI
- publishes the annotated video to MediaMTX over RTSP

```bash
python3 deploy/run_inference.py \
  --model weights/best.pt \
  --source "nvarguscamerasrc sensor-id=0 ! video/x-raw(memory:NVMM),width=1280,height=720,framerate=30/1,format=NV12 ! queue ! nvvidconv flip-method=0 ! video/x-raw,format=BGRx ! videoconvert ! video/x-raw,format=BGR ! appsink drop=true max-buffers=1 sync=false" \
  --backend pytorch \
  --profile orin_nano \
  --camera-role bottom \
  --imgsz 960 \
  --conf 0.10 \
  --iou 0.70 \
  --device 0 \
  --warmup-frames 20 \
  --show \
  --stream-url "rtsp://YOUR_MEDIAMTX_HOST:8554/drone-top" \
  --stream-protocol rtsp \
  --stream-encoder x264enc \
  --stream-bitrate-kbps 2500 \
  --stream-fps 15 \
  --stream-width 1280 \
  --stream-height 720
```

The same pattern works for the side camera by changing:

- `sensor-id`
- `--camera-role side`
- `--stream-url`

## 4. MediaMTX Read URLs

Once MediaMTX is receiving `drone-top`, the browser-facing URLs are typically:

- WebRTC player page:
  - `http://YOUR_MEDIAMTX_HOST:8889/drone-top`
- HLS path:
  - `http://YOUR_MEDIAMTX_HOST:8888/drone-top`

If you are embedding the stream inside the dashboard, prefer **WebRTC** first and use HLS only as fallback.

## 5. Dashboard Setup

The dashboard can now use MediaMTX directly as a video transport.

Set these in `dashboard/.env.local`:

```env
NEXT_PUBLIC_VIDEO_TRANSPORT=mediamtx
NEXT_PUBLIC_MEDIAMTX_WEBRTC_BASE_URL=http://YOUR_MEDIAMTX_HOST:8889
NEXT_PUBLIC_MEDIAMTX_HLS_BASE_URL=http://YOUR_MEDIAMTX_HOST:8888
NEXT_PUBLIC_MEDIAMTX_EMBED_PROTOCOL=webrtc
NEXT_PUBLIC_MEDIAMTX_TOP_PATH=drone-top
NEXT_PUBLIC_MEDIAMTX_SIDE_PATH=drone-side
```

Then run the dashboard normally:

```bash
cd dashboard
npm install
npm run dev
```

On the Vision page:

- `Top-Down` maps to `drone-top`
- `Side-View` maps to `drone-side`
- `Start Stream` loads the MediaMTX player inside the dashboard
- `Stop Stream` unloads it

## 6. New Inference Flags

`deploy/run_inference.py` now supports:

- `--stream-url`
- `--stream-protocol rtsp|rtmp`
- `--stream-encoder`
- `--stream-bitrate-kbps`
- `--stream-fps`
- `--stream-width`
- `--stream-height`
- `--stream-pipeline`

Use `--stream-pipeline` only if your Jetson needs a fully custom GStreamer output pipeline.

## 7. Notes

- This path streams the **annotated video**, not raw video.
- The overlay is burned into the stream.
- Keep the actual AI decision loop local on the Jetson.
- Start with `1280x720 @ 15 fps` before pushing resolution or bitrate higher.
