/* ──────────────────────────────────────────────────────────────────────
   Application-wide constants.
   ────────────────────────────────────────────────────────────────────── */

/** WebSocket endpoint for live telemetry */
export const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8080";

/** REST API base URL */
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001/api";

/** Heartbeat interval sent to server (ms) */
export const HEARTBEAT_INTERVAL_MS = 1_000;

/** How many seconds without heartbeat before link is "DEGRADED" */
export const DEGRADED_THRESHOLD_SEC = 3;

/** How many seconds without heartbeat before link is "LOST" */
export const LOST_THRESHOLD_SEC = 10;

/** Performance targets from the project spec */
export const SPEC = {
  maxDecisionLatencyMs: 3_000,
  maxRttMs: 2_000,
  maxBootToServiceMin: 2,
  crowdDetectionAccuracyPct: 80,
  maxWaterTempC: 25,
  targetFlowLpm: 0.3,
  dockingAccuracyCm: 5,
  altitudeMinM: 3,
  altitudeMaxM: 15,
} as const;

/** Navigation items for the sidebar */
export const NAV_ITEMS = [
  { label: "Operations",  href: "/operations",  icon: "Monitor"      },
  { label: "Telemetry",   href: "/telemetry",   icon: "Activity"     },
  { label: "Vision / AI", href: "/vision",      icon: "Eye"          },
  { label: "Payload",     href: "/payload",     icon: "Droplets"     },
  { label: "Docking",     href: "/docking",     icon: "Anchor"       },
  { label: "Alerts",      href: "/alerts",      icon: "ShieldAlert"  },
  { label: "Analytics",   href: "/analytics",   icon: "BarChart3"    },
] as const;
