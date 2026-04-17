# Dashboard Quick Start Guide

## Prerequisites

- **Node.js** >= 18 installed
- Terminal access

## How to Run the Dashboard

### 0. Choose your data source

For offline UI work, keep `NEXT_PUBLIC_DATA_SOURCE=mock`.
For Jetson/backend integration, set `NEXT_PUBLIC_DATA_SOURCE=live` and point `NEXT_PUBLIC_WS_URL` / `NEXT_PUBLIC_API_BASE_URL` to your public backend.

### 1. Navigate to the dashboard directory

```bash
cd "CrowdCoolingDrone/dashboard"
```

### 2. Install dependencies (first time only)

```bash
npm install
```

✅ This was already done — dependencies are installed.

### 3. Start the development server

```bash
npm run dev
```

The dashboard will start at: **http://localhost:3000**

### 4. Open in your browser

Visit: [http://localhost:3000](http://localhost:3000)

You'll be automatically redirected to `/operations`.

---

## What You'll See

The dashboard is now running with **mock data** that simulates a live drone mission:

### **Top Banner** (always visible)
- Drone ID: `drone-01`
- Mission Phase: `IN_FLIGHT`
- Armed: `ARMED` (red)
- Override Mode: `AUTONOMOUS`
- Link State: `CONNECTED` (green)
- Health: **Green dot** (all systems nominal)

### **Sidebar Navigation**
Click any item to navigate:
- **Operations** — Mission map placeholder, altitude, speed, battery, GPS position
- **Telemetry** — Vehicle systems, communication link, Jetson compute stats
- **Vision / AI** — Person count (36), crowd score (0.81), inference latency, decision trace
- **Payload** — Water level (57%), temp (21.4°C), spray status, flow rates
- **Docking** — Docking phase stepper (placeholder)
- **Alerts** — Shows 2 sample alerts + 2 command history entries
- **Analytics** — Metrics and reports (placeholder)

### **Live Updates**
- Mock data refreshes **every 2 seconds**
- Top banner health dot updates in real-time
- All metric cards update with simulated telemetry

---

## Available Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server (with hot reload) |
| `npm run build` | Build for production |
| `npm start` | Run production build |
| `npm run lint` | Run ESLint |

---

## Testing Different Pages

### Operations
- Shows drone position (26.3174, 50.1438)
- Altitude: 7.8m
- Battery: 63%

### Telemetry
- Battery voltage: 22.4V, current: 56.8A
- RTT: 284ms, packet loss: 0.7%
- CPU: 42%, GPU: 68%, Memory: 51%

### Vision
- Person count: 36
- Crowd score: 0.81
- Decision: `MIST_ON`
- Reason: "cooling hotspot stable"

### Payload
- Water level: 57% (1.14L remaining)
- Temperature: 21.4°C
- Spray enabled: YES
- Flow: 0.29 L/min

### Alerts
- 2 alerts (1 INFO, 1 WARNING)
- 2 commands (both ACKED)

---

## File Structure (for reference)

```
dashboard/
├── src/
│   ├── app/                    # Pages (Next.js App Router)
│   │   ├── operations/
│   │   ├── telemetry/
│   │   ├── vision/
│   │   ├── payload/
│   │   ├── docking/
│   │   ├── alerts/
│   │   └── analytics/
│   ├── components/
│   │   ├── layout/             # Sidebar, TopBanner, PageShell
│   │   ├── common/             # MetricCard, StatusBadge, Placeholder
│   │   ├── vision/             # VideoFeed, CameraSelector, StreamStats
│   │   └── providers/          # MockDataProvider, LiveTelemetryProvider
│   ├── hooks/                  # useWebSocket, useWebRTCStream
│   ├── stores/                 # Zustand droneStore
│   ├── services/               # api.ts, wsManager.ts
│   ├── lib/                    # constants.ts, mockData.ts, utils.ts
│   └── types/                  # telemetry.ts, webrtc.ts
├── docs/                       # WEBRTC.md, DEPLOYMENT.md
└── package.json
```

---

## Switching to Live Mode

When you're ready to connect a real Jetson backend:

1. Copy `.env.example` to `.env.local`
2. Set `NEXT_PUBLIC_DATA_SOURCE=live`
3. Set `NEXT_PUBLIC_WS_URL=wss://your-server-domain/ws`
4. Set `NEXT_PUBLIC_API_BASE_URL=https://your-server-domain/api`
5. Configure STUN/TURN values if the Jetson and dashboard are on different networks (see `docs/DEPLOYMENT.md`)
6. Restart the dev server — the layout will mount `LiveTelemetryProvider` instead of `MockDataProvider`
7. The shared `wsManager` opens a single WebSocket with automatic reconnection; the same Zustand store and Vision page work with live data

---

## Troubleshooting

### Port 3000 already in use
```bash
# Kill the process or use a different port
PORT=3001 npm run dev
```

### Build fails
```bash
# Clear cache and rebuild
rm -rf .next node_modules
npm install
npm run dev
```

### Changes not showing
- Make sure the dev server is running
- Hard refresh browser: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)

---

## Summary

✅ Dashboard is fully functional with mock data  
✅ All 7 pages navigable and displaying simulated telemetry  
✅ Updates every 2 seconds automatically  
✅ Mock / live switching via `NEXT_PUBLIC_DATA_SOURCE`  
✅ Shared WebSocket with automatic reconnection  
✅ WebRTC streaming with ICE candidate queuing and bitrate monitoring  
✅ Env-driven STUN/TURN for cross-network deployment
