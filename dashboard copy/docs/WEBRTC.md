# WebRTC Video Streaming — Technical Documentation

Low-latency camera feed from the Jetson Orin Nano to the GCS dashboard.

---

## 1. Overview

The CrowdCooling drone carries two **IMX477** cameras (top-down and side-view) connected to the Jetson Orin Nano. The dashboard receives live video from either camera via **WebRTC** over the existing 4G LTE cellular backhaul.

### Design Goals

| Goal | Target | How It Is Achieved |
|------|--------|--------------------|
| Low latency | RTT < 2 s | H.264 Constrained Baseline, NVENC hardware encoding, browser HW decoding |
| Cross-network support | Different LANs | Signaling relay server + TURN media relay |
| Dual camera support | Top-down + Side-view | Camera switching tears down and rebuilds the peer connection |
| Auto-recovery | Survives 4G drops | Exponential back-off reconnect for both WebSocket and WebRTC |
| Operator visibility | Stream health metrics | `getStats()` polled every 2 s, 10 metric cards including transport type |

### Topology — Direct Mode (same LAN / VPN)

```
┌─────────────────────────────┐          LAN / VPN         ┌──────────────────────┐
│       Jetson Orin Nano      │◄──────────────────────────►│   Browser Dashboard  │
│                             │                            │                      │
│  GStreamer → NVENC (H.264)  │   WebRTC Media (SRTP)      │  RTCPeerConnection   │
│  Node.js Telemetry Bridge   │◄──── Signaling (JSON) ────►│  useWebRTCStream()   │
│  (ws://…:8080)              │   over existing WebSocket   │  VideoFeed component │
└─────────────────────────────┘                            └──────────────────────┘
```

### Topology — Relay Mode (different networks: 4G ↔ campus Wi-Fi)

```
┌──────────────────┐                                     ┌──────────────────────┐
│  Jetson Orin Nano │─── wss ──┐                    ┌──── wss ───│ Browser Dashboard  │
│                  │           │                    │            │                    │
│  GStreamer+NVENC │   ┌───────▼────────────────────▼──────┐    │ useWebRTCStream()  │
│  Telemetry Bridge│   │     Public Signaling Relay        │    │ VideoFeed          │
│                  │   │     (server/relay.mjs)             │    │                    │
└──────────────────┘   │     Routes messages by droneId     │    └──────────────────────┘
                       └───────────────────────────────────┘
                                      │
                              TURN media relay
                         (for symmetric NAT / firewalls)
```

- **1:1 peer connection** — one Jetson, one dashboard viewer.
- **Receive-only on browser** — the browser never sends video.
- **Signaling relay** — a lightweight WebSocket forwarder that both sides connect to.
- **TURN relay** — media fallback when direct P2P is impossible (symmetric NAT).

---

## 2. Signaling Protocol

Signaling messages are JSON objects sent over the **shared WebSocket** managed by `wsManager` — the same connection that carries telemetry snapshots. Both hooks (`useWebSocket` for telemetry, `useWebRTCStream` for signaling) share this single socket, eliminating redundant connections.

The system supports two signaling modes configured via `NEXT_PUBLIC_SIGNALING_MODE`:

| Mode | When to Use | How It Works |
|------|-------------|-------------|
| `direct` (default) | Same LAN or VPN | Browser connects directly to the Jetson's WebSocket |
| `relay` | Different networks (4G ↔ Wi-Fi) | Both sides connect to a public relay server that forwards messages by `droneId` |

In **relay mode**, each side sends a `register` message on connect. The relay groups connections by `droneId` and forwards all subsequent messages to the other members of that room. Each message has a `type` field prefixed with `webrtc:` and a `camera` field identifying which sensor is involved.

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

ICE servers are built at startup from environment variables (see `.env.example`):

```typescript
// Resolved from NEXT_PUBLIC_STUN_URLS, NEXT_PUBLIC_TURN_URLS, etc.
{
  iceServers: [
    { urls: ["stun:stun.l.google.com:19302"] },          // STUN (fallback if env is empty)
    { urls: ["turn:..."], username: "...", credential: "..." } // TURN (when configured)
  ],
  iceTransportPolicy: NEXT_PUBLIC_FORCE_TURN === "true" ? "relay" : "all",
  bundlePolicy: "max-bundle",
}
```

- **STUN** handles most 4G NAT scenarios (cone NAT). Defaults to Google's public STUN if `NEXT_PUBLIC_STUN_URLS` is not set.
- **TURN** is used for symmetric NAT environments (campus Wi-Fi, enterprise firewalls). Configure `NEXT_PUBLIC_TURN_URLS`, `NEXT_PUBLIC_TURN_USERNAME`, and `NEXT_PUBLIC_TURN_CREDENTIAL`.
- **Force relay** (`NEXT_PUBLIC_FORCE_TURN=true`) restricts ICE to relay-only transport when direct P2P is impossible.
- **`max-bundle`** reduces the number of ICE candidates and speeds up connection setup.

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

### 3.5 ICE Candidate Queuing

ICE candidates from the Jetson may arrive before `setRemoteDescription` completes on the browser side. Rather than silently dropping these candidates (which could degrade connectivity), `useWebRTCStream` buffers them in a queue and flushes them immediately after the remote description is applied. This prevents ICE negotiation failures on high-latency links.

### 3.6 Shared WebSocket with Message Queueing

The `wsManager` singleton (`src/services/wsManager.ts`) ensures that telemetry dispatch and WebRTC signaling share a **single WebSocket connection**. Key features:

- Capped exponential back-off reconnection (1 s base, 30 s max)
- **Outbound message queue** (up to 64 messages) — messages sent during brief disconnections are buffered and flushed on reconnect, preventing silent signaling drops
- **Relay registration** — in relay mode, sends a `register` message on connect and waits for acknowledgement before broadcasting "open" to consumers

### 3.7 Auto-Reconnect (WebRTC)

When ICE enters `"failed"`, `useWebRTCStream` automatically tears down the RTCPeerConnection and schedules a reconnect with capped exponential back-off:

| Attempt | Delay |
|---------|-------|
| 1 | 2 s |
| 2 | 4 s |
| 3 | 8 s |
| 4 | 15 s (capped) |
| 5 | 15 s (capped) |
| > 5 | Gives up → state = `"failed"` |

The `"disconnected"` ICE state (common on cellular) is treated as transient — the hook shows `"connecting"` but does **not** trigger a full reconnect, allowing ICE to self-recover. The reconnect counter resets to 0 on any successful `ontrack` event.

### 3.8 ICE Transport Visibility

The stats poller extracts the **local candidate type** (`host`, `srflx`, `relay`) from the succeeded candidate-pair in `getStats()`. This is exposed in the `StreamStats` UI so the operator can confirm whether media is flowing directly (P2P) or via the TURN relay.

---

## 4. Dashboard Components

### 4.1 File Map

```
server/
└── relay.mjs                  # Standalone WebSocket signaling relay (cross-network)

src/
├── types/
│   └── webrtc.ts              # CameraId, signaling messages, WebRTCStreamStats
├── hooks/
│   └── useWebRTCStream.ts     # Core hook: peer connection, signaling, stats, auto-reconnect
├── services/
│   └── wsManager.ts           # Shared WebSocket singleton (relay registration, message queue)
├── components/vision/
│   ├── VideoFeed.tsx           # Low-latency <video> element
│   ├── CameraSelector.tsx      # Top-Down / Side-View toggle buttons
│   └── StreamStats.tsx         # Stream health metric cards (10 cards incl. transport type)
├── app/vision/
│   └── page.tsx                # Vision & AI page (wires everything together)
└── lib/
    └── constants.ts            # ICE, relay config, reconnect constants
```

### 4.2 `useWebRTCStream` Hook

The central piece. It manages exactly one RTCPeerConnection and exposes:

```typescript
interface UseWebRTCStreamReturn {
  state: WebRTCStreamState;      // "idle" | "signaling" | "connecting" | "connected" | "failed" | "closed"
  stream: MediaStream | null;    // Attach to <video>.srcObject
  stats: WebRTCStreamStats;      // RTT, FPS, codec, jitter, packet loss, transport type
  reconnectAttempt: number;      // Auto-reconnect counter (resets on success)
  start: (camera: CameraId) => void;
  stop: () => void;              // Also cancels auto-reconnect
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

Displays 10 metric cards polled from `RTCPeerConnection.getStats()`:

| Metric | Source | Warning Threshold |
|--------|--------|-------------------|
| Stream RTT | `candidate-pair.currentRoundTripTime` | > 1000 ms (warn), > 2000 ms (critical) |
| Resolution | `inbound-rtp.frameWidth × frameHeight` | — |
| Stream FPS | `inbound-rtp.framesPerSecond` | — |
| Codec | `codec.mimeType` | — |
| Bitrate | Derived from `inbound-rtp.bytesReceived` delta | — |
| Jitter | `inbound-rtp.jitter` | — |
| Packet Loss | `packetsLost / packetsReceived` | — |
| Packets Received | `inbound-rtp.packetsReceived` | — |
| Packets Lost | `inbound-rtp.packetsLost` | — |
| Transport | `local-candidate.candidateType` | "relay" = yellow (TURN overhead) |

---

## 5. Configuration Constants

Defined in `src/lib/constants.ts`:

| Constant | Default | Description |
|----------|---------|-------------|
| `SIGNALING_MODE` | `"direct"` | `"direct"` for same-LAN, `"relay"` for cross-network |
| `DRONE_ID` | `"drone-01"` | Relay channel identifier |
| `RELAY_AUTH_TOKEN` | `""` | Optional bearer token for relay authentication |
| `WS_MESSAGE_QUEUE_MAX` | `64` | Max outbound messages queued during disconnections |
| `ICE_SERVERS` | Built from `NEXT_PUBLIC_STUN_URLS` / `NEXT_PUBLIC_TURN_URLS` env vars | STUN/TURN server list |
| `RTC_CONFIG` | `{ iceServers, iceTransportPolicy, bundlePolicy: "max-bundle" }` | Full RTCConfiguration |
| `PREFERRED_H264_PROFILE` | `"42e01f"` | H.264 Constrained Baseline Level 3.1 |
| `WEBRTC_STATS_INTERVAL_MS` | `2000` | How often to poll `getStats()` |
| `WEBRTC_MAX_RECONNECT_RETRIES` | `5` | Max auto-reconnect attempts before giving up |
| `WEBRTC_RECONNECT_BASE_MS` | `2000` | Base delay for WebRTC reconnect back-off |
| `WEBRTC_RECONNECT_MAX_MS` | `15000` | Max delay cap for WebRTC reconnect back-off |
| `WS_URL` | `NEXT_PUBLIC_WS_URL` or auto-inferred from page origin | Shared WebSocket endpoint |
| `WS_RECONNECT_BASE_MS` | `1000` | WebSocket reconnection back-off base delay |
| `WS_RECONNECT_MAX_MS` | `30000` | WebSocket reconnection back-off max delay |

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

## 8. Signaling Relay Server

For cross-network deployments a lightweight relay server (`server/relay.mjs`) bridges the Jetson and browser WebSocket connections.

### 8.1 Quick Start

```bash
# Install dependencies (if not already done)
npm install

# Start the relay (default port 8080)
npm run relay

# Or with auth and custom port
RELAY_PORT=9090 RELAY_AUTH_TOKEN=secret npm run relay
```

### 8.2 Production Deployment

Deploy the relay on any publicly reachable host (a $5 VPS is sufficient). It has no dependencies beyond Node.js ≥ 18 and the `ws` package.

```bash
# On your relay server
RELAY_PORT=443 RELAY_AUTH_TOKEN=your-secure-token node server/relay.mjs
```

Then configure the dashboard `.env`:
```
NEXT_PUBLIC_SIGNALING_MODE=relay
NEXT_PUBLIC_WS_URL=wss://your-relay-host.com/ws
NEXT_PUBLIC_DRONE_ID=drone-01
NEXT_PUBLIC_RELAY_AUTH_TOKEN=your-secure-token
```

And configure the Jetson's telemetry bridge to connect to the same relay with `role: "jetson"` and the same `droneId`.

### 8.3 How It Works

1. Both Jetson and browser open a WebSocket to the relay
2. Each sends `{ type: "register", role: "jetson"|"dashboard", droneId: "drone-01" }`
3. The relay groups connections by `droneId` into rooms
4. All subsequent messages from one side are forwarded to the other(s)
5. The relay never inspects or transforms payloads — it is a pure forwarder
6. WebSocket-level ping/pong keeps connections alive over NAT

---

## 9. Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| State stuck on "signaling" | Jetson not responding to `request-stream` | Verify Jetson bridge handles `webrtc:*` messages; in relay mode check both sides registered |
| State stuck on "connecting" | ICE candidates not reaching peer | Check `Transport` card; add TURN server or set `NEXT_PUBLIC_FORCE_TURN=true` |
| "Reconnecting (N/5)" cycling | ICE keeps failing | Likely symmetric NAT; configure TURN and set `NEXT_PUBLIC_FORCE_TURN=true` |
| Transport shows "relay" | Media flowing via TURN | Expected on different networks; check TURN server location for latency |
| Stream connected but black video | Camera pipeline not producing frames | Test GStreamer pipeline independently |
| High RTT (> 2 s) | 4G congestion or distant TURN relay | Check `StreamStats` RTT card; co-locate TURN server near drone ops area |
| No H.264 | Browser doesn't support the profile | Check `StreamStats` codec card; falls back to VP8 |
| Packet loss spikes | Network instability | Monitor `StreamStats` packet loss; consider FEC |
| wsManager stays "connecting" | Relay rejected registration | Check `RELAY_AUTH_TOKEN` matches; check relay server logs |

---

## 10. Future Enhancements

- **Dual simultaneous streams** — Show both cameras side-by-side (requires two peer connections)
- **AI overlay compositing** — Render bounding boxes on top of the video canvas using detection data from the Zustand store
- **Adaptive bitrate** — Monitor `getStats()` and send bitrate adjustment commands to the Jetson encoder
- **Recording** — Use `MediaRecorder` API to capture the stream client-side for post-mission review
- **Screenshot** — Capture a single frame from the video element for annotation or reporting
- **Multi-drone relay** — The relay already supports multiple `droneId` rooms; the dashboard could switch between drones
