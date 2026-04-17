# CrowdCooling GCS Dashboard

Ground Control Station dashboard for the autonomous crowd-cooling misting drone.

---

## Overview

This is the **operator-facing supervision and safety layer** of the CrowdCooling Drone system. It provides:

- **Live WebRTC video** from dual IMX477 cameras (top-down + side-view)
- Live mission map with drone position, geofence, and waypoints
- Vehicle telemetry and communication link health
- AI perception outputs, crowd detection, and decision trace
- Payload / misting status and spray interlocks
- Multi-step docking & refill sequence monitoring
- Alerts, safety overrides, and command audit trail
- Mission analytics, validation metrics, and report export

## Architecture

The dashboard follows a **hybrid architecture** as defined in the project specification:

| Layer | Technology | Role |
|-------|-----------|------|
| **Frontend** | Next.js 15 + React 19 + Tailwind CSS v4 | Operator UI |
| **State Management** | Zustand 5 | Fine-grained store subscriptions |
| **Video Streaming** | WebRTC (H.264 / NVENC) | Low-latency camera feeds |
| **Icons** | Lucide React | Consistent icon set |
| **Node.js Backend** (future) | Express / NestJS + Socket.IO | Auth, REST API, WebSocket fan-out, alerts |
| **Python Backend** (existing) | FastAPI / asyncio | MAVLink, AI inference, payload logic |

> **Key principle:** The browser sits outside the control loop. It issues high-level operator commands via the Node.js backend; it never talks directly to PX4, ESP32, or the vehicle network.

### System Topology

```
┌──────────────────────────────────┐        4G LTE        ┌─────────────────────────┐
│        Jetson Orin Nano          │◄────────────────────►│    Browser Dashboard     │
│                                  │                       │                         │
│  Python: AI, MAVLink, Payload    │  Telemetry (WS JSON)  │  Next.js + Zustand      │
│  Node.js: Telemetry Bridge       │  Video (WebRTC SRTP)  │  Shared wsManager       │
│  GStreamer → NVENC (H.264)       │  Signaling (WS JSON)  │  useWebSocket()         │
│  ws://…:8080                     │  (single shared conn) │  useWebRTCStream()      │
└──────────────────────────────────┘                       └─────────────────────────┘
```

## Project Structure

```
dashboard/
├── src/
│   ├── app/                        # Next.js App Router pages
│   │   ├── operations/             # Mission map & overview
│   │   ├── telemetry/              # Vehicle & link health
│   │   ├── vision/                 # WebRTC video + AI decision trace
│   │   ├── payload/                # Water tank, spray, refill
│   │   ├── docking/                # Multi-step docking sequence
│   │   ├── alerts/                 # Safety console & overrides
│   │   └── analytics/              # Metrics & report export
│   ├── components/
│   │   ├── layout/                 # Sidebar, TopBanner, PageShell
│   │   ├── common/                 # MetricCard, StatusBadge, Placeholder
│   │   ├── vision/                 # VideoFeed, CameraSelector, StreamStats
│   │   └── providers/              # MockDataProvider, LiveTelemetryProvider
│   ├── hooks/
│   │   ├── useWebSocket.ts         # Telemetry dispatch (uses shared wsManager)
│   │   └── useWebRTCStream.ts      # WebRTC peer connection + signaling
│   ├── stores/                     # Zustand droneStore
│   ├── services/
│   │   ├── api.ts                  # REST API client
│   │   └── wsManager.ts            # Shared WebSocket singleton (reconnection, heartbeats)
│   ├── types/
│   │   ├── telemetry.ts            # Normalized drone state model
│   │   └── webrtc.ts               # Signaling messages, stream stats
│   └── lib/                        # Constants, utilities
├── docs/
│   ├── WEBRTC.md                   # Full WebRTC technical documentation
│   └── DEPLOYMENT.md               # Public relay + cross-network deployment notes
├── side notes/                     # Architecture & UI design docs
├── .env.example
├── QUICKSTART.md
├── package.json
└── README.md
```

## Getting Started

### Prerequisites

- **Node.js** >= 18
- **npm** >= 9

### Install & Run

```bash
cd dashboard
npm install
npm run dev
```

The dev server starts at [http://localhost:3000](http://localhost:3000).

### Available Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Build for production |
| `npm start` | Run production build |
| `npm run lint` | Run ESLint |

### Environment Variables

Copy `.env.example` to `.env.local` and adjust for your deployment:

```bash
cp .env.example .env.local
```

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_DATA_SOURCE` | `mock` | `mock` for offline UI dev, `live` for Jetson/backend integration |
| `NEXT_PUBLIC_WS_URL` | auto-inferred | WebSocket endpoint (telemetry + WebRTC signaling) |
| `NEXT_PUBLIC_API_BASE_URL` | auto-inferred | Node.js REST API base URL |
| `NEXT_PUBLIC_STUN_URLS` | Google STUN | Comma-separated STUN server URLs |
| `NEXT_PUBLIC_TURN_URLS` | *(none)* | Comma-separated TURN server URLs |
| `NEXT_PUBLIC_TURN_USERNAME` | *(none)* | TURN credential username |
| `NEXT_PUBLIC_TURN_CREDENTIAL` | *(none)* | TURN credential password |
| `NEXT_PUBLIC_FORCE_TURN` | `false` | Force relay-only ICE transport (for symmetric NAT) |

## Dashboard Pages

| Page | Route | Description |
|------|-------|-------------|
| **Operations** | `/operations` | Mission map, drone position, altitude, speed, battery, GPS |
| **Telemetry** | `/telemetry` | Vehicle systems, communication link, Jetson compute health |
| **Vision / AI** | `/vision` | WebRTC camera feed, crowd detection, AI decision trace |
| **Payload** | `/payload` | Water level, temperature, spray status, flow rates |
| **Docking** | `/docking` | Multi-step docking sequence, alignment, override controls |
| **Alerts** | `/alerts` | Alert feed, safety overrides, command audit trail |
| **Analytics** | `/analytics` | KPI tracking, trend charts, report export |

## WebRTC Video Streaming

The Vision / AI page includes a full WebRTC implementation for low-latency camera feeds.

### Key Features

- **Receive-only** — browser receives video from Jetson, never sends
- **Dual cameras** — top-down and side-view (IMX477), switchable in the UI
- **H.264 Constrained Baseline** — SDP munged to prefer NVENC hardware codec
- **Signaling over existing WebSocket** — no extra server or port needed
- **Live stream health** — RTT, FPS, codec, resolution, jitter, packet loss

### Signaling Flow

```
Browser  ──  { type: "webrtc:request-stream", camera }  ──►  Jetson
Jetson   ──  { type: "webrtc:offer",  sdp, camera }     ──►  Browser
Browser  ──  { type: "webrtc:answer", sdp, camera }     ──►  Jetson
Both     ◄─► { type: "webrtc:ice-candidate", candidate, camera }
Browser  ──  { type: "webrtc:stop-stream", camera }     ──►  Jetson
```

> **Full technical documentation:** See [`docs/WEBRTC.md`](docs/WEBRTC.md) for signaling schemas, low-latency optimizations, Jetson-side requirements, GStreamer pipeline, and troubleshooting.

## State Management

The Zustand store (`src/stores/droneStore.ts`) holds a single normalized `DroneSnapshot` object that drives all dashboard widgets:

```
DroneSnapshot
├── vehicle   — armed, position, altitude, speed, battery, GPS
├── link      — state (INIT/CONNECTED/DEGRADED/LOST), RTT, packet loss
├── ai        — crowd score, person count, decision, inference latency
├── payload   — water level, temperature, spray, flow rates
├── dock      — phase, alignment error, confidence, retry count
├── health    — overall color (GREEN/YELLOW/RED), active alerts
└── compute   — CPU, GPU, memory, camera FPS, ESP32 connection
```

Updates arrive via WebSocket at up to 20 Hz. The store uses **fine-grained selectors** so individual components only re-render when their slice changes.

## Mock vs Live Data

The root layout selects a data provider based on `NEXT_PUBLIC_DATA_SOURCE`:

- **`mock`** (default) — `MockDataProvider` populates the store with simulated telemetry every 2 seconds. WebRTC streaming controls are disabled.
- **`live`** — `LiveTelemetryProvider` activates the shared `wsManager`, which opens a single WebSocket to the backend for telemetry, alerts, and WebRTC signaling. Reconnection with exponential back-off is handled automatically.

## Current Status

### Implemented

- Full routing and sidebar navigation across 7 screens
- Dark theme with Tailwind CSS v4
- TypeScript types for normalized telemetry + WebRTC signaling
- Zustand store for real-time drone state, alerts, and commands
- **Shared WebSocket manager** (`wsManager`) — single connection for telemetry + signaling, automatic reconnection with exponential back-off
- WebSocket hook with heartbeat support
- WebRTC hook with signaling, H.264 preference, ICE candidate queuing, bitrate tracking, and stats polling
- VideoFeed, CameraSelector, and StreamStats components (9 metric cards including bitrate)
- **Mock / Live data source switching** via `NEXT_PUBLIC_DATA_SOURCE`
- LiveTelemetryProvider + MockDataProvider
- Env-driven STUN/TURN/force-relay configuration for cross-network deployment
- REST API client skeleton
- Reusable layout and metric components

### Next Steps

1. **Phase 1** — Implement Jetson-side WebRTC publisher, integrate Leaflet/Mapbox map
2. **Phase 2** — AI overlay compositing on the video canvas
3. **Phase 3** — Docking phase stepper, payload gauges, alert management UI
4. **Phase 4** — Analytics dashboards, trend charts (Recharts), report export, auth/RBAC

## Performance Targets (from project spec)

| Metric | Target |
|--------|--------|
| Decision latency | <= 3 s |
| Communication RTT | <= 2 s |
| Boot-to-service | < 2 min |
| Crowd detection accuracy | ~80% |
| Water temperature | <= 25 C |
| Flow rate | ~0.3 L/min |
| Docking accuracy | within 5 cm |
| Operating altitude | 3-15 m AGL |


### Communication Architecture

- **Jetson -> public backend**: outbound connection for telemetry, alerts, and WebRTC signaling
- **Browser -> public backend**: outbound connection for telemetry subscription, signaling, and operator commands
- **WebRTC video**: live camera feed from the Jetson to the browser
- **WebSocket JSON**: telemetry, AI metadata, alerts, and command flow
- **STUN/TURN support**: allows video to work across 4G, campus Wi-Fi, and other NAT-restricted networks

This matches the intended system design where **video is separate from the main telemetry/control path**.

## Documentation

| Document | Location | Description |
|----------|----------|-------------|
| **README** | `dashboard/README.md` | This file — project overview and setup |
| **Quick Start** | `dashboard/QUICKSTART.md` | Step-by-step guide to run with mock data |
| **WebRTC Docs** | `dashboard/docs/WEBRTC.md` | Full WebRTC technical specification |
| **Deployment / Relay** | `dashboard/docs/DEPLOYMENT.md` | Public backend, WebSocket relay, and TURN deployment notes |
| **Architecture** | `dashboard/side notes/dashboard_architecture.md` | Original architecture and requirements |
| **UI Spec** | `dashboard/side notes/UI.md` | UI module layout and design specification |
