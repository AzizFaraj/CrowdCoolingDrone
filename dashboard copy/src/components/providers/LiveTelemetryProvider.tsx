"use client";

import { useWebSocket } from "@/hooks/useWebSocket";

/* ──────────────────────────────────────────────────────────────────────
   Live telemetry provider.
   Connects the dashboard to the public/backend WebSocket endpoint so
   the browser receives normalized drone snapshots, alerts, and command
   acks.  The hook delegates to the shared wsManager which handles
   connection lifecycle, heartbeats, and automatic reconnection.
   ────────────────────────────────────────────────────────────────────── */

export default function LiveTelemetryProvider() {
  useWebSocket();
  return null;
}
