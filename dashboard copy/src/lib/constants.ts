/* ──────────────────────────────────────────────────────────────────────
   Application-wide constants.
   ────────────────────────────────────────────────────────────────────── */

function inferWsUrl(): string {
  if (typeof window === "undefined") {
    return "ws://localhost:8080";
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
}

function inferApiBaseUrl(): string {
  if (typeof window === "undefined") {
    return "http://localhost:3001/api";
  }

  return `${window.location.origin}/api`;
}

/** Dashboard data source. `mock` for offline development, `live` for Jetson/backend integration. */
export const DATA_SOURCE = process.env.NEXT_PUBLIC_DATA_SOURCE ?? "mock";

/** WebSocket endpoint for live telemetry and WebRTC signaling. */
export const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? inferWsUrl();

/** REST API base URL. */
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? inferApiBaseUrl();

/** Heartbeat interval sent to server (ms) */
export const HEARTBEAT_INTERVAL_MS = 1_000;

/** How many seconds without heartbeat before link is "DEGRADED" */
export const DEGRADED_THRESHOLD_SEC = 3;

/** How many seconds without heartbeat before link is "LOST" */
export const LOST_THRESHOLD_SEC = 10;

/** Base delay for WebSocket reconnection back-off (ms) */
export const WS_RECONNECT_BASE_MS = 1_000;

/** Maximum delay cap for WebSocket reconnection back-off (ms) */
export const WS_RECONNECT_MAX_MS = 30_000;

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

/* ── Signaling relay ─────────────────────────────────────────────────── */

/**
 * Signaling mode.
 * - `"direct"` — browser connects straight to the Jetson WebSocket.
 * - `"relay"`  — both Jetson and browser connect to a public relay
 *   server that forwards messages between them.  Required when the
 *   two endpoints live on different networks (4G ↔ campus Wi-Fi).
 */
export const SIGNALING_MODE =
  (process.env.NEXT_PUBLIC_SIGNALING_MODE ?? "direct") as "direct" | "relay";

/** Drone ID used by the relay to pair dashboard ↔ Jetson connections. */
export const DRONE_ID = process.env.NEXT_PUBLIC_DRONE_ID ?? "drone-01";

/** Optional bearer token the relay checks on `register`. */
export const RELAY_AUTH_TOKEN = process.env.NEXT_PUBLIC_RELAY_AUTH_TOKEN ?? "";

/** Max messages queued while the WebSocket is temporarily disconnected. */
export const WS_MESSAGE_QUEUE_MAX = 64;

/* ── WebRTC ──────────────────────────────────────────────────────────── */

function buildIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [];

  const stunUrls = process.env.NEXT_PUBLIC_STUN_URLS
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (stunUrls && stunUrls.length > 0) {
    servers.push({ urls: stunUrls });
  } else {
    servers.push({ urls: "stun:stun.l.google.com:19302" });
  }

  const turnUrls = process.env.NEXT_PUBLIC_TURN_URLS
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (turnUrls && turnUrls.length > 0) {
    servers.push({
      urls: turnUrls,
      username: process.env.NEXT_PUBLIC_TURN_USERNAME,
      credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL,
    });
  }

  return servers;
}

/**
 * ICE server configuration.
 * For field deployment, point STUN/TURN to the public relay used by the
 * Jetson and the dashboard when they are on different networks.
 */
export const ICE_SERVERS: RTCIceServer[] = buildIceServers();

/**
 * RTCPeerConnection configuration tuned for low-latency, receive-only
 * video over a cellular backhaul.
 */
export const RTC_CONFIG: RTCConfiguration = {
  iceServers: ICE_SERVERS,
  iceTransportPolicy: process.env.NEXT_PUBLIC_FORCE_TURN === "true" ? "relay" : "all",
  bundlePolicy: "max-bundle",
};

/**
 * Preferred H.264 profile for receive.
 * Constrained Baseline (42e0) is universally supported and yields
 * the lowest encode/decode latency on NVENC + browser HW decoders.
 */
export const PREFERRED_H264_PROFILE = "42e01f";

/** How often (ms) to sample RTCPeerConnection stats for the UI. */
export const WEBRTC_STATS_INTERVAL_MS = 2_000;

/** Max automatic WebRTC reconnect attempts before the hook gives up. */
export const WEBRTC_MAX_RECONNECT_RETRIES = 5;

/** Base delay (ms) before the first WebRTC reconnect attempt. */
export const WEBRTC_RECONNECT_BASE_MS = 2_000;

/** Max delay cap (ms) for WebRTC reconnect back-off. */
export const WEBRTC_RECONNECT_MAX_MS = 15_000;

/** Navigation items for the sidebar */
export const NAV_ITEMS = [
  { label: "Operations", href: "/operations", icon: "Monitor" },
  { label: "Telemetry", href: "/telemetry", icon: "Activity" },
  { label: "Vision / AI", href: "/vision", icon: "Eye" },
  { label: "Payload", href: "/payload", icon: "Droplets" },
  { label: "Docking", href: "/docking", icon: "Anchor" },
  { label: "Alerts", href: "/alerts", icon: "ShieldAlert" },
  { label: "Analytics", href: "/analytics", icon: "BarChart3" },
] as const;
