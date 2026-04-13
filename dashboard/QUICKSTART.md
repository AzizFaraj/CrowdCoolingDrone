# Dashboard Quick Start Guide

## Prerequisites

- **Node.js** >= 18 installed
- Terminal access

## How to Run the Dashboard

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
│   ├── app/                    # Pages
│   │   ├── operations/
│   │   ├── telemetry/
│   │   ├── vision/
│   │   ├── payload/
│   │   ├── docking/
│   │   ├── alerts/
│   │   └── analytics/
│   ├── components/
│   │   ├── layout/             # Sidebar, TopBanner
│   │   ├── common/             # MetricCard, StatusBadge
│   │   └── providers/          # MockDataProvider
│   ├── stores/                 # Zustand store
│   ├── lib/                    # mockData.ts, constants.ts
│   └── types/                  # telemetry.ts
└── package.json
```

---

## Next Steps

When you're ready to connect real telemetry:

1. Remove or disable `<MockDataProvider />` in `src/app/layout.tsx`
2. Uncomment the `useWebSocket()` hook call (currently not active)
3. Point `NEXT_PUBLIC_WS_URL` to your actual WebSocket server
4. The same Zustand store will work with live data

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
✅ Ready for live WebSocket integration
