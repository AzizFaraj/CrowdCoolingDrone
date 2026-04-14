# WebRTC Video Streaming — Technical Documentation

Low-latency camera feed from the Jetson Orin Nano to the GCS dashboard.

---

## 1. Overview

The CrowdCooling drone carries two **IMX477** cameras (top-down and side-view) connected to the Jetson Orin Nano. The dashboard receives live video from either camera via **WebRTC** over the existing 4G LTE cellular backhaul.

### Design Goals

| Goal | Target | How It Is Achieved |
|------|--------|--------------------|
| Low latency | RTT < 2 s | H.264 Constrained Baseline, NVENC hardware encoding, browser HW decoding |
| No extra infrastructure | Reuse existing channel | Signaling piggybacks on the telemetry WebSocket |
| Dual camera support | Top-down + Side-view | Camera switching tears down and rebuilds the peer connection |
| Operator visibility | Stream health metrics | `getStats()` polled every 2 s, displayed in metric cards |

### Topology

```
┌─────────────────────────────┐          4G LTE           ┌──────────────────────┐
│       Jetson Orin Nano      │◄──────────────────────────►│   Browser Dashboard  │
│                             │                            │                      │
│  GStreamer → NVENC (H.264)  │   WebRTC Media (SRTP)      │  RTCPeerConnection   │
│  Node.js Telemetry Bridge   │◄──── Signaling (JSON) ────►│  useWebRTCStream()   │
│  (ws://…:8080)              │   over existing WebSocket   │  VideoFeed component │
└─────────────────────────────┘                            └──────────────────────┘
```

- **1:1 peer connection** — one Jetson, one dashboard viewer.
- **Receive-only on browser** — the browser never sends video.
- **No SFU / media server** — direct peer-to-peer over 4G.

---

## 2. Signaling Protocol

Signaling messages are JSON objects sent over the **same WebSocket** (`ws://localhost:8080`) that carries telemetry snapshots. Each message has a `type` field prefixed with `webrtc:` and a `camera` field identifying which sensor is involved.

### Message Flow

```
Step  Direction              Message Type                  Purpose
────  ─────────              ────────────                  ───────
 1    Browser → Jetson       webrtc:request-stream         Ask Jetson to start publishing
 2    Jetson  → Browser      webrtc:offer                  SDP offer with H.264 track
 3    Browser → Jetson       webrtc:answer                 SDP answer (H.264 preferred)
 4    Both    ↔ Both         webrtc:ice-candidate          ICE candidate exchange (trickle)
 5    Browser → Jetson       webrtc:stop-stream            Tear down the stream
```

### Message Schemas

#### `webrtc:request-stream`
```json
{
  "type": "webrtc:request-stream",
  "camera": "top-down"
}
```

#### `webrtc:offer`
```json
{
  "type": "webrtc:offer",
  "camera": "top-down",
  "sdp": "v=0\r\no=- 46117…"
}
```

#### `webrtc:answer`
```json
{
  "type": "webrtc:answer",
  "camera": "top-down",
  "sdp": "v=0\r\no=- 46118…"
}
```

#### `webrtc:ice-candidate`
```json
{
  "type": "webrtc:ice-candidate",
  "camera": "top-down",
  "candidate": {
    "candidate": "candidate:1 1 UDP 2122…",
    "sdpMid": "0",
    "sdpMLineIndex": 0
  }
}
```

#### `webrtc:stop-stream`
```json
{
  "type": "webrtc:stop-stream",
  "camera": "side-view"
}
```

### Camera Identifiers

| ID | Sensor | Mounting | Purpose |
|----|--------|----------|---------|
| `top-down` | IMX477 #1 | Nadir (downward-facing) | Crowd detection, AI overlay verification |
| `side-view` | IMX477 #2 | Forward / angled | Situational awareness, docking alignment |

---

## 3. Low-Latency Optimizations

### 3.1 Codec — H.264 Constrained Baseline

| Property | Value |
|----------|-------|
| Profile | Constrained Baseline (42e01f) |
| Encoder | NVENC (Jetson hardware) |
| Decoder | Browser hardware (Chrome / Edge / Safari) |
| Why | Lowest encode/decode latency; universally supported |

The browser's SDP answer is **munged** to reorder H.264 payload types first (`preferH264()` in `useWebRTCStream.ts`). This ensures the Jetson's NVENC encoder is selected over VP8/VP9.

### 3.2 ICE Configuration

```typescript
{
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  iceTransportPolicy: "all",
  bundlePolicy: "max-bundle",
}
```

- **STUN** handles most 4G NAT scenarios (cone NAT).
- **`max-bundle`** reduces the number of ICE candidates and speeds up connection setup.
- A **TURN** server entry is included as a commented placeholder for symmetric NAT environments encountered in the field.

### 3.3 Video Element Settings

The `<video>` element in `VideoFeed.tsx` is configured for zero-buffer playback:

| Attribute | Value | Reason |
|-----------|-------|--------|
| `autoPlay` | `true` | Start rendering frames immediately |
| `playsInline` | `true` | Prevent fullscreen takeover on mobile Safari |
| `muted` | `true` | Required for autoplay policy compliance |
| `disablePictureInPicture` | `true` | Prevent accidental PiP that could stall the stream |
| `controls` | omitted | No user-accessible buffering controls |

### 3.4 Connection Lifecycle

Camera switching **destroys and recreates** the RTCPeerConnection rather than using renegotiation. For a 1:1 topology this is:
- Simpler (no `addTrack`/`removeTrack` state machine)
- More reliable (clean ICE restart)
- Fast enough (setup takes ~1-2 seconds over 4G)

---

## 4. Dashboard Components

### 4.1 File Map

```
src/
├── types/
│   └── webrtc.ts              # CameraId, signaling messages, WebRTCStreamStats
├── hooks/
│   └── useWebRTCStream.ts     # Core hook: peer connection, signaling, stats
├── components/vision/
│   ├── VideoFeed.tsx           # Low-latency <video> element
│   ├── CameraSelector.tsx      # Top-Down / Side-View toggle buttons
│   └── StreamStats.tsx         # Stream health metric cards
├── app/vision/
│   └── page.tsx                # Vision & AI page (wires everything together)
└── lib/
    └── constants.ts            # ICE_SERVERS, RTC_CONFIG, PREFERRED_H264_PROFILE
```

### 4.2 `useWebRTCStream` Hook

The central piece. It manages exactly one RTCPeerConnection and exposes:

```typescript
interface UseWebRTCStreamReturn {
  state: WebRTCStreamState;      // "idle" | "signaling" | "connecting" | "connected" | "failed" | "closed"
  stream: MediaStream | null;    // Attach to <video>.srcObject
  stats: WebRTCStreamStats;      // RTT, FPS, codec, jitter, packet loss
  start: (camera: CameraId) => void;
  stop: () => void;
}
```

**State machine:**

```
idle ──start()──► signaling ──offer──► connecting ──track──► connected
  ▲                                                            │
  └──────────────────── stop() / unmount ◄─────────────────────┘
                                         ◄── failed
                                         ◄── closed
```

### 4.3 `VideoFeed` Component

A pure rendering component. Receives a `MediaStream` and renders it in a `<video>` element with:
- "No video signal" overlay when `stream` is null
- Camera label badge in the top-left corner
- `object-contain` to preserve aspect ratio

### 4.4 `CameraSelector` Component

A segmented toggle with two buttons: **Top-Down** and **Side-View**. When the active camera changes while streaming, the hook tears down the current connection and starts a new one for the selected camera.

### 4.5 `StreamStats` Component

Displays 8 metric cards polled from `RTCPeerConnection.getStats()`:

| Metric | Source | Warning Threshold |
|--------|--------|-------------------|
| Stream RTT | `candidate-pair.currentRoundTripTime` | > 1000 ms (warn), > 2000 ms (critical) |
| Resolution | `inbound-rtp.frameWidth × frameHeight` | — |
| Stream FPS | `inbound-rtp.framesPerSecond` | — |
| Codec | `codec.mimeType` | — |
| Jitter | `inbound-rtp.jitter` | — |
| Packet Loss | `packetsLost / packetsReceived` | — |
| Packets Received | `inbound-rtp.packetsReceived` | — |
| Packets Lost | `inbound-rtp.packetsLost` | — |

---

## 5. Configuration Constants

Defined in `src/lib/constants.ts`:

| Constant | Default | Description |
|----------|---------|-------------|
| `ICE_SERVERS` | `[{ urls: "stun:stun.l.google.com:19302" }]` | STUN/TURN server list |
| `RTC_CONFIG` | `{ iceServers, iceTransportPolicy: "all", bundlePolicy: "max-bundle" }` | Full RTCConfiguration |
| `PREFERRED_H264_PROFILE` | `"42e01f"` | H.264 Constrained Baseline Level 3.1 |
| `WEBRTC_STATS_INTERVAL_MS` | `2000` | How often to poll `getStats()` |
| `WS_URL` | `ws://localhost:8080` | WebSocket endpoint (shared with telemetry) |

---

## 6. Jetson-Side Requirements

The dashboard (browser) side is fully implemented. The Jetson-side Node.js bridge must implement the following to complete the integration:

### 6.1 Signaling Handler

The existing telemetry bridge at `ws://…:8080` needs to handle `webrtc:*` messages:

1. **On `webrtc:request-stream`** — Create an RTCPeerConnection, attach the camera's MediaStream (from GStreamer), create an SDP offer, and send it back as `webrtc:offer`.
2. **On `webrtc:answer`** — Set the remote description on the peer connection.
3. **On `webrtc:ice-candidate`** — Add the ICE candidate to the peer connection.
4. **On `webrtc:stop-stream`** — Close the peer connection and release the camera pipeline.

### 6.2 GStreamer Pipeline (Recommended)

```
nvarguscamerasrc sensor-id=0
  → video/x-raw(memory:NVMM),width=1280,height=720,framerate=20/1
  → nvvidconv
  → nvv4l2h264enc preset-level=1 iframeinterval=30 bitrate=2000000
  → h264parse
  → [WebRTC sink via node-webrtc or werift]
```

### 6.3 Recommended Libraries

| Library | Purpose |
|---------|---------|
| **werift** | Lightweight WebRTC for Node.js (no native deps) |
| **node-webrtc** (`wrtc`) | Google's WebRTC native bindings for Node.js |
| **gstreamer** + **gst-webrtcbin** | Alternative: GStreamer-native WebRTC (bypasses Node for media) |

---

## 7. Testing Without the Jetson

During development, you can test the WebRTC UI components with a mock stream:

```typescript
// In browser console or a test component:
navigator.mediaDevices.getUserMedia({ video: true }).then((stream) => {
  // Replace the hook's stream with your webcam
});
```

Or use the existing **MockDataProvider** which populates telemetry — the video feed will show "No video signal" until a real WebRTC connection is established, while all AI metric cards display mock data normally.

---

## 8. Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| State stuck on "signaling" | Jetson not responding to `request-stream` | Verify Jetson bridge handles `webrtc:*` messages |
| State stuck on "connecting" | ICE candidates not reaching peer | Check NAT type; add a TURN server to `ICE_SERVERS` |
| Stream connected but black video | Camera pipeline not producing frames | Test GStreamer pipeline independently |
| High RTT (> 2 s) | 4G congestion or TURN relay | Check `StreamStats` RTT card; consider lowering bitrate |
| No H.264 | Browser doesn't support the profile | Check `StreamStats` codec card; falls back to VP8 |
| Packet loss spikes | Network instability | Monitor `StreamStats` packet loss; consider FEC |

---

## 9. Future Enhancements

- **Dual simultaneous streams** — Show both cameras side-by-side (requires two peer connections)
- **AI overlay compositing** — Render bounding boxes on top of the video canvas using detection data from the Zustand store
- **Adaptive bitrate** — Monitor `getStats()` and send bitrate adjustment commands to the Jetson encoder
- **Recording** — Use `MediaRecorder` API to capture the stream client-side for post-mission review
- **Screenshot** — Capture a single frame from the video element for annotation or reporting
