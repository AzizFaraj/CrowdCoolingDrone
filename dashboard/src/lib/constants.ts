/* ──────────────────────────────────────────────────────────────────────
   Application-wide constants.
   ────────────────────────────────────────────────────────────────────── */

/** WebSocket endpoint for live telemetry */
export const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8080";

/** Which video transport to use on the Vision page. */
export const VIDEO_TRANSPORT =
  process.env.NEXT_PUBLIC_VIDEO_TRANSPORT ?? "webrtc";

/** LiveKit server URL for room-based video transport. */
export const LIVEKIT_URL =
  process.env.NEXT_PUBLIC_LIVEKIT_URL ?? "";

/** Default LiveKit room used by the dashboard video page. */
export const LIVEKIT_ROOM =
  process.env.NEXT_PUBLIC_LIVEKIT_ROOM ?? "drone-1";

/** Dashboard route that mints a viewer token for LiveKit. */
export const LIVEKIT_TOKEN_ENDPOINT =
  process.env.NEXT_PUBLIC_LIVEKIT_TOKEN_ENDPOINT ?? "/api/livekit/token";

/** MediaMTX browser player base URL, typically http://host:8889 for WebRTC. */
export const MEDIAMTX_WEBRTC_BASE_URL =
  process.env.NEXT_PUBLIC_MEDIAMTX_WEBRTC_BASE_URL ?? "";

/** MediaMTX browser player base URL for HLS, typically http://host:8888. */
export const MEDIAMTX_HLS_BASE_URL =
  process.env.NEXT_PUBLIC_MEDIAMTX_HLS_BASE_URL ?? "";

/** Whether the dashboard embeds MediaMTX via WebRTC or HLS. */
export const MEDIAMTX_EMBED_PROTOCOL =
  process.env.NEXT_PUBLIC_MEDIAMTX_EMBED_PROTOCOL ?? "webrtc";

/** MediaMTX path that receives the top-down annotated video stream. */
export const MEDIAMTX_TOP_PATH =
  process.env.NEXT_PUBLIC_MEDIAMTX_TOP_PATH ?? "drone-top";

/** MediaMTX path that receives the side-view annotated video stream. */
export const MEDIAMTX_SIDE_PATH =
  process.env.NEXT_PUBLIC_MEDIAMTX_SIDE_PATH ?? "drone-side";

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

/* ── WebRTC ──────────────────────────────────────────────────────────── */

/**
 * ICE server configuration.
 * A public STUN server is sufficient for most 4G NAT scenarios.
 * Add a TURN entry if symmetric NAT is encountered in the field.
 */
export const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  // { urls: "turn:turn.example.com:3478", username: "…", credential: "…" },
];

/**
 * RTCPeerConnection configuration tuned for low-latency, receive-only
 * video over a cellular backhaul.
 */
export const RTC_CONFIG: RTCConfiguration = {
  iceServers: ICE_SERVERS,
  iceTransportPolicy: "all",
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
