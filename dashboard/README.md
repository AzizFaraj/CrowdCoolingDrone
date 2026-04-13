# CrowdCooling GCS Dashboard

Ground Control Station dashboard for the autonomous crowd-cooling misting drone.

## Overview

This is the **operator-facing supervision and safety layer** of the CrowdCooling Drone system. It provides:

- Live mission map with drone position, geofence, and waypoints
- Vehicle telemetry and communication link health
- AI perception outputs and decision trace
- Payload / misting status and spray interlocks
- Multi-step docking & refill sequence monitoring
- Alerts, safety overrides, and command audit trail
- Mission analytics, validation metrics, and report export

## Architecture

The dashboard follows a **hybrid architecture** as defined in the project specification:

| Layer | Technology | Role |
|-------|-----------|------|
| **Frontend** | Next.js 15 + React 19 + Tailwind CSS v4 | Operator UI |
| **State Management** | Zustand | Fine-grained store subscriptions |
| **Icons** | Lucide React | Consistent icon set |
| **Node.js Backend** (future) | Express / NestJS + Socket.IO | Auth, REST API, WebSocket fan-out, alerts |
| **Python Backend** (existing) | FastAPI / asyncio | MAVLink, AI inference, payload logic |

> **Key principle:** The browser sits outside the control loop. It issues high-level operator commands via the Node.js backend; it never talks directly to PX4, ESP32, or the vehicle network.

## Project Structure

```
dashboard/
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── operations/         # Mission map & overview
│   │   ├── telemetry/          # Vehicle & link health
│   │   ├── vision/             # AI feed & decision trace
│   │   ├── payload/            # Water tank, spray, refill
│   │   ├── docking/            # Multi-step docking sequence
│   │   ├── alerts/             # Safety console & overrides
│   │   └── analytics/          # Metrics & report export
│   ├── components/
│   │   ├── layout/             # Sidebar, TopBanner, PageShell
│   │   └── common/             # MetricCard, StatusBadge, Placeholder
│   ├── hooks/                  # useWebSocket
│   ├── stores/                 # Zustand droneStore
│   ├── services/               # REST API client
│   ├── types/                  # TypeScript telemetry types
│   └── lib/                    # Constants, utility helpers
├── side notes/                 # Architecture & UI design docs
├── .env.example
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

### Environment Variables

Copy `.env.example` to `.env.local` and adjust if your backend runs on different ports:

```bash
cp .env.example .env.local
```

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_WS_URL` | `ws://localhost:8080` | WebSocket telemetry bridge |
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:3001/api` | Node.js REST API |

## Current Status

This is the **skeleton / scaffold** phase. All pages render with placeholder widgets that indicate where live data, maps, video feeds, and charts will be integrated.

### What exists now

- Full routing and sidebar navigation across 7 screens
- Dark theme with Tailwind CSS v4
- TypeScript types matching the normalized telemetry data model
- Zustand store for real-time drone state, alerts, and commands
- WebSocket hook with heartbeat support
- REST API client skeleton
- Reusable layout and metric components

### Next steps (implementation phases)

1. **Phase 1** — Connect live telemetry via WebSocket, populate metric cards, integrate Leaflet/Mapbox map
2. **Phase 2** — AI metadata feed, WebRTC video stream, trend charts (Recharts)
3. **Phase 3** — Docking phase stepper, payload gauges, alert management UI
4. **Phase 4** — Analytics dashboards, report export, auth/RBAC

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
