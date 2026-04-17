/* ──────────────────────────────────────────────────────────────────────
   WebRTC signaling types.

   Signaling piggybacks on the existing telemetry WebSocket channel.
   The Jetson (publisher) and browser (viewer) exchange SDP offers/answers
   and ICE candidates through `type`-tagged JSON messages on the same
   socket that carries telemetry snapshots.

   Flow:
     Browser  ──  { type: "webrtc:request-stream", camera }  ──►  Jetson
     Jetson   ──  { type: "webrtc:offer",  sdp, camera }     ──►  Browser
     Browser  ──  { type: "webrtc:answer", sdp, camera }     ──►  Jetson
     Both     ◄─► { type: "webrtc:ice-candidate", candidate, camera }
     Browser  ──  { type: "webrtc:stop-stream", camera }     ──►  Jetson
   ────────────────────────────────────────────────────────────────────── */

/** Camera identifiers matching the two IMX477 sensors on the drone. */
export type CameraId = "top-down" | "side-view";

/* ── Signaling messages ─────────────────────────────────────────────── */

export interface WebRTCRequestStream {
  type: "webrtc:request-stream";
  camera: CameraId;
}

export interface WebRTCOffer {
  type: "webrtc:offer";
  camera: CameraId;
  sdp: string;
}

export interface WebRTCAnswer {
  type: "webrtc:answer";
  camera: CameraId;
  sdp: string;
}

export interface WebRTCIceCandidate {
  type: "webrtc:ice-candidate";
  camera: CameraId;
  candidate: RTCIceCandidateInit;
}

export interface WebRTCStopStream {
  type: "webrtc:stop-stream";
  camera: CameraId;
}

export type WebRTCSignalingMessage =
  | WebRTCRequestStream
  | WebRTCOffer
  | WebRTCAnswer
  | WebRTCIceCandidate
  | WebRTCStopStream;

/* ── Connection state exposed to UI ─────────────────────────────────── */

export type WebRTCStreamState =
  | "idle"
  | "signaling"
  | "connecting"
  | "connected"
  | "failed"
  | "closed";

/** Lightweight stats exposed to UI metric cards. */
export interface WebRTCStreamStats {
  /** Video resolution width. */
  frameWidth: number;
  /** Video resolution height. */
  frameHeight: number;
  /** Decoded frames per second. */
  fps: number;
  /** Current round-trip time reported by ICE (seconds). */
  currentRttSec: number;
  /** Jitter in seconds. */
  jitterSec: number;
  /** Cumulative packets lost. */
  packetsLost: number;
  /** Total packets received. */
  packetsReceived: number;
  /** Codec in use (e.g. "H264", "VP8"). */
  codec: string;
  /** Estimated incoming bitrate (kbps). */
  bitrateKbps: number;
  /** Timestamp of last stats sample. */
  sampledAt: number;
  /** ICE transport type: "host" (LAN), "srflx" (STUN), "relay" (TURN). */
  iceTransportType: string;
}

export const EMPTY_STREAM_STATS: WebRTCStreamStats = {
  frameWidth: 0,
  frameHeight: 0,
  fps: 0,
  currentRttSec: 0,
  jitterSec: 0,
  packetsLost: 0,
  packetsReceived: 0,
  codec: "---",
  bitrateKbps: 0,
  sampledAt: 0,
  iceTransportType: "---",
};
