"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  PREFERRED_H264_PROFILE,
  RTC_CONFIG,
  WEBRTC_MAX_RECONNECT_RETRIES,
  WEBRTC_RECONNECT_BASE_MS,
  WEBRTC_RECONNECT_MAX_MS,
  WEBRTC_STATS_INTERVAL_MS,
} from "@/lib/constants";
import { wsManager } from "@/services/wsManager";
import type {
  CameraId,
  WebRTCIceCandidate,
  WebRTCOffer,
  WebRTCStreamState,
  WebRTCStreamStats,
} from "@/types/webrtc";
import { EMPTY_STREAM_STATS } from "@/types/webrtc";

/* ──────────────────────────────────────────────────────────────────────
   useWebRTCStream — receive-only WebRTC hook.

   Design rationale
   ────────────────
   • The browser is receive-only; the Jetson is the sole publisher.
   • Signaling piggybacks on the shared telemetry WebSocket (via
     wsManager) so no extra connection or port is required.
   • The hook manages exactly ONE RTCPeerConnection per camera.
     Switching cameras tears down the old connection and creates a new
     one — cleaner than renegotiation for a 1:1 topology.
   • Stats are polled on a timer and exposed for UI metric cards.
   • ICE candidates that arrive before setRemoteDescription completes
     are queued and flushed afterward to prevent silent drops.

   Cross-network resilience
   ────────────────────────
   • Auto-reconnect: when ICE enters "failed" or "disconnected" the
     hook automatically tears down and retries with capped exponential
     back-off, up to WEBRTC_MAX_RECONNECT_RETRIES.
   • ICE transport type (host / srflx / relay) is extracted from
     getStats() so the operator can confirm TURN relay is in use.

   Low-latency optimisations
   ─────────────────────────
   1. H.264 Constrained Baseline preferred via SDP munging (maps to
      Jetson NVENC hardware encoder → browser HW decoder).
   2. "max-bundle" to reduce ICE candidates and setup time.
   3. The <video> element settings (playsinline, no controls, muted)
      are the responsibility of the VideoFeed component; this hook
      only provides the MediaStream.
   ────────────────────────────────────────────────────────────────────── */

export interface UseWebRTCStreamReturn {
  /** Current connection state. */
  state: WebRTCStreamState;
  /** The MediaStream to attach to a <video> element. null until connected. */
  stream: MediaStream | null;
  /** Latest polled stats. */
  stats: WebRTCStreamStats;
  /** How many automatic reconnect attempts have been made (resets on success). */
  reconnectAttempt: number;
  /** Begin streaming from the given camera. */
  start: (camera: CameraId) => void;
  /** Tear down the peer connection (also cancels auto-reconnect). */
  stop: () => void;
}

/* ── pure helpers (no React state) ───────────────────────────────────── */

/** Prefer H.264 by reordering m=video codecs in the SDP. */
function preferH264(sdp: string): string {
  const lines = sdp.split("\r\n");
  const mVideoIdx = lines.findIndex((l) => l.startsWith("m=video"));
  if (mVideoIdx === -1) return sdp;

  const h264Pts: string[] = [];
  for (const line of lines) {
    if (
      line.startsWith("a=fmtp:") &&
      line.toLowerCase().includes(PREFERRED_H264_PROFILE)
    ) {
      const pt = line.split(":")[1]?.split(" ")[0];
      if (pt) h264Pts.push(pt);
    }
  }
  if (h264Pts.length === 0) return sdp;

  const parts = lines[mVideoIdx].split(" ");
  const proto = parts.slice(0, 3);
  const pts = parts.slice(3);
  const reordered = [
    ...h264Pts,
    ...pts.filter((p) => !h264Pts.includes(p)),
  ];
  lines[mVideoIdx] = [...proto, ...reordered].join(" ");
  return lines.join("\r\n");
}

/** Compute capped exponential back-off delay. */
function reconnectDelay(attempt: number): number {
  return Math.min(
    WEBRTC_RECONNECT_BASE_MS * 2 ** attempt,
    WEBRTC_RECONNECT_MAX_MS,
  );
}

/* ── hook ─────────────────────────────────────────────────────────────── */

export function useWebRTCStream(): UseWebRTCStreamReturn {
  const [state, setState] = useState<WebRTCStreamState>("idle");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [stats, setStats] = useState<WebRTCStreamStats>(EMPTY_STREAM_STATS);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const cameraRef = useRef<CameraId | null>(null);
  const statsTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const unsubMsgRef = useRef<(() => void) | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ICE candidate queue — candidates arriving before setRemoteDescription
     are buffered here and flushed once the remote description is applied. */
  const remoteDescSetRef = useRef(false);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);

  /* Bitrate derivation — tracks bytesReceived delta between samples. */
  const prevBytesRef = useRef(0);
  const prevSampleTsRef = useRef(0);

  /* Auto-reconnect bookkeeping. */
  const reconnectAttemptRef = useRef(0);
  /** True when the user has explicitly started a stream (controls auto-reconnect). */
  const userWantsStreamRef = useRef(false);

  /* ── stats polling ─────────────────────────────────────────────────── */

  /** Poll getStats() and extract the video inbound-rtp report. */
  async function sampleStats(pc: RTCPeerConnection) {
    try {
      const report = await pc.getStats();

      type StatsRecord = Record<string, unknown>;
      let inbound: StatsRecord | undefined;
      let candidatePair: StatsRecord | undefined;

      report.forEach((entry: StatsRecord) => {
        if (entry["type"] === "inbound-rtp" && entry["kind"] === "video") {
          inbound = entry;
        }
        if (
          entry["type"] === "candidate-pair" &&
          entry["state"] === "succeeded"
        ) {
          candidatePair = entry;
        }
      });

      if (!inbound) return;

      // Codec lookup
      let codec = "---";
      const codecId = inbound["codecId"] as string | undefined;
      if (codecId) {
        const codecEntry = report.get(codecId) as StatsRecord | undefined;
        if (codecEntry) {
          codec =
            (codecEntry["mimeType"] as string)?.split("/")?.[1] ?? "---";
        }
      }

      // ICE transport type (host / srflx / prflx / relay)
      let iceTransportType = "---";
      if (candidatePair) {
        const localCandidateId = candidatePair["localCandidateId"] as string | undefined;
        if (localCandidateId) {
          const localCandidate = report.get(localCandidateId) as StatsRecord | undefined;
          if (localCandidate) {
            iceTransportType = (localCandidate["candidateType"] as string) ?? "---";
          }
        }
      }

      // Bitrate derivation
      const bytesReceived = (inbound["bytesReceived"] as number) ?? 0;
      const now = Date.now();
      let bitrateKbps = 0;
      if (prevBytesRef.current > 0 && prevSampleTsRef.current > 0) {
        const deltaBytes = bytesReceived - prevBytesRef.current;
        const deltaSec = (now - prevSampleTsRef.current) / 1000;
        if (deltaSec > 0) {
          bitrateKbps = Math.round((deltaBytes * 8) / deltaSec / 1000);
        }
      }
      prevBytesRef.current = bytesReceived;
      prevSampleTsRef.current = now;

      setStats({
        frameWidth: (inbound["frameWidth"] as number) ?? 0,
        frameHeight: (inbound["frameHeight"] as number) ?? 0,
        fps: (inbound["framesPerSecond"] as number) ?? 0,
        currentRttSec:
          (candidatePair?.["currentRoundTripTime"] as number) ?? 0,
        jitterSec: (inbound["jitter"] as number) ?? 0,
        packetsLost: (inbound["packetsLost"] as number) ?? 0,
        packetsReceived: (inbound["packetsReceived"] as number) ?? 0,
        codec,
        bitrateKbps,
        sampledAt: now,
        iceTransportType,
      });
    } catch {
      /* stats unavailable — noop */
    }
  }

  /* ── teardown (internal — does NOT clear userWantsStream) ──────────── */

  const teardown = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (statsTimerRef.current) {
      clearInterval(statsTimerRef.current);
      statsTimerRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.oniceconnectionstatechange = null;
      pcRef.current.ontrack = null;
      pcRef.current.onicecandidate = null;
      pcRef.current.close();
      pcRef.current = null;
    }
    if (unsubMsgRef.current) {
      unsubMsgRef.current();
      unsubMsgRef.current = null;
    }
    remoteDescSetRef.current = false;
    pendingCandidatesRef.current = [];
    prevBytesRef.current = 0;
    prevSampleTsRef.current = 0;
    setStream(null);
    setStats(EMPTY_STREAM_STATS);
  }, []);

  /* ── auto-reconnect scheduler ──────────────────────────────────────── */

  const scheduleReconnect = useCallback(
    (camera: CameraId) => {
      if (!userWantsStreamRef.current) return;
      if (reconnectAttemptRef.current >= WEBRTC_MAX_RECONNECT_RETRIES) {
        setState("failed");
        return;
      }

      const attempt = reconnectAttemptRef.current;
      const delay = reconnectDelay(attempt);
      reconnectAttemptRef.current = attempt + 1;
      setReconnectAttempt(attempt + 1);

      setState("connecting"); // visual feedback during wait

      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null;
        if (userWantsStreamRef.current) {
          /* Tear down old PC and request a fresh stream. */
          teardown();
          initiateConnection(camera);
        }
      }, delay);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [teardown],
  );

  /* ── signaling handlers ────────────────────────────────────────────── */

  async function handleOffer(offer: WebRTCOffer, camera: CameraId) {
    setState("connecting");

    const pc = new RTCPeerConnection(RTC_CONFIG);
    pcRef.current = pc;
    remoteDescSetRef.current = false;

    // Receive-only: add a transceiver for video.
    pc.addTransceiver("video", { direction: "recvonly" });

    // Collect remote stream.
    const mediaStream = new MediaStream();
    pc.ontrack = (event) => {
      event.streams[0]?.getTracks().forEach((track) => {
        mediaStream.addTrack(track);
      });
      setStream(mediaStream);
      setState("connected");
      // Reset reconnect counter on successful connection.
      reconnectAttemptRef.current = 0;
      setReconnectAttempt(0);
    };

    // Forward local ICE candidates to the Jetson.
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        wsManager.send({
          type: "webrtc:ice-candidate",
          camera,
          candidate: event.candidate.toJSON(),
        });
      }
    };

    pc.oniceconnectionstatechange = () => {
      const iceState = pc.iceConnectionState;
      if (iceState === "connected" || iceState === "completed") {
        setState("connected");
      } else if (iceState === "failed") {
        /* Auto-reconnect: tear down and retry with back-off. */
        teardown();
        scheduleReconnect(camera);
      } else if (iceState === "disconnected") {
        /* "disconnected" is often transient on cellular.  Give ICE a
           few seconds to recover before we escalate to a full reconnect. */
        setState("connecting");
      } else if (iceState === "closed") {
        setState("closed");
      }
    };

    // Set remote description (the offer from Jetson).
    await pc.setRemoteDescription({
      type: "offer",
      sdp: offer.sdp,
    });
    remoteDescSetRef.current = true;

    // Flush any ICE candidates that arrived while the remote description
    // was being applied (prevents silent candidate drops).
    for (const c of pendingCandidatesRef.current) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(c));
      } catch {
        /* late / duplicate — safe to ignore */
      }
    }
    pendingCandidatesRef.current = [];

    // Create answer, prefer H.264, and set local description.
    const answer = await pc.createAnswer();
    if (answer.sdp) {
      answer.sdp = preferH264(answer.sdp);
    }
    await pc.setLocalDescription(answer);

    // Send the answer back to Jetson.
    wsManager.send({
      type: "webrtc:answer",
      camera,
      sdp: answer.sdp ?? "",
    });

    // Start stats polling.
    statsTimerRef.current = setInterval(
      () => sampleStats(pc),
      WEBRTC_STATS_INTERVAL_MS,
    );
  }

  async function handleIceCandidate(msg: WebRTCIceCandidate) {
    const pc = pcRef.current;
    if (!pc) return;

    if (!remoteDescSetRef.current) {
      pendingCandidatesRef.current.push(msg.candidate);
      return;
    }

    try {
      await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
    } catch {
      /* late / duplicate — safe to ignore */
    }
  }

  /* ── initiateConnection (shared by start & auto-reconnect) ─────────── */

  function initiateConnection(camera: CameraId) {
    cameraRef.current = camera;
    setState("signaling");

    // Subscribe to signaling messages for this camera.
    unsubMsgRef.current = wsManager.onMessage(async (data) => {
      if (
        typeof data.type !== "string" ||
        !data.type.startsWith("webrtc:") ||
        data.camera !== camera
      ) {
        return;
      }

      switch (data.type) {
        case "webrtc:offer":
          await handleOffer(data as unknown as WebRTCOffer, camera);
          break;
        case "webrtc:ice-candidate":
          await handleIceCandidate(data as unknown as WebRTCIceCandidate);
          break;
        default:
          break;
      }
    });

    // Send the stream request once the socket is open.
    const sendRequest = () => {
      wsManager.send({ type: "webrtc:request-stream", camera });
    };

    if (wsManager.isOpen) {
      sendRequest();
    } else {
      const unsubStatus = wsManager.onStatus((s) => {
        if (s === "open") {
          unsubStatus();
          sendRequest();
        }
      });
    }
  }

  /* ── stop: user-initiated teardown ─────────────────────────────────── */

  const stop = useCallback(() => {
    userWantsStreamRef.current = false;
    if (cameraRef.current) {
      wsManager.send({ type: "webrtc:stop-stream", camera: cameraRef.current });
    }
    teardown();
    setState("idle");
    cameraRef.current = null;
    reconnectAttemptRef.current = 0;
    setReconnectAttempt(0);
    wsManager.release();
  }, [teardown]);

  /* ── start: user-initiated ─────────────────────────────────────────── */

  const start = useCallback(
    (camera: CameraId) => {
      // Tear down any existing connection first.
      if (pcRef.current || reconnectTimerRef.current) {
        stop();
      }

      userWantsStreamRef.current = true;
      reconnectAttemptRef.current = 0;
      setReconnectAttempt(0);

      // Acquire a reference to the shared WebSocket.
      wsManager.acquire();

      initiateConnection(camera);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stop],
  );

  /* ── auto-cleanup on unmount ───────────────────────────────────────── */

  useEffect(() => {
    return () => {
      userWantsStreamRef.current = false;
      teardown();
    };
  }, [teardown]);

  return { state, stream, stats, reconnectAttempt, start, stop };
}
