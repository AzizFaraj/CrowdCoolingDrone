"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  PREFERRED_H264_PROFILE,
  RTC_CONFIG,
  WEBRTC_STATS_INTERVAL_MS,
  WS_URL,
} from "@/lib/constants";
import type {
  CameraId,
  WebRTCIceCandidate,
  WebRTCOffer,
  WebRTCSignalingMessage,
  WebRTCStreamState,
  WebRTCStreamStats,
} from "@/types/webrtc";
import { EMPTY_STREAM_STATS } from "@/types/webrtc";

/* ──────────────────────────────────────────────────────────────────────
   useWebRTCStream — receive-only WebRTC hook.

   Design rationale
   ────────────────
   • The browser is receive-only; the Jetson is the sole publisher.
   • Signaling piggybacks on the existing telemetry WebSocket so no
     extra server or port is required.
   • The hook manages exactly ONE RTCPeerConnection per camera.
     Switching cameras tears down the old connection and creates a new
     one — cleaner than renegotiation for a 1:1 topology.
   • Stats are polled on a timer and exposed for UI metric cards.

   Low-latency optimisations applied here
   ───────────────────────────────────────
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
  /** Begin streaming from the given camera. */
  start: (camera: CameraId) => void;
  /** Tear down the peer connection. */
  stop: () => void;
}

export function useWebRTCStream(wsUrl: string = WS_URL): UseWebRTCStreamReturn {
  const [state, setState] = useState<WebRTCStreamState>("idle");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [stats, setStats] = useState<WebRTCStreamStats>(EMPTY_STREAM_STATS);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const cameraRef = useRef<CameraId | null>(null);
  const statsTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ── helpers ───────────────────────────────────────────────────────── */

  /** Send a signaling message over the shared WS. */
  const send = useCallback((msg: WebRTCSignalingMessage) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  /** Prefer H.264 by reordering m=video codecs in the SDP. */
  function preferH264(sdp: string): string {
    const lines = sdp.split("\r\n");
    const mVideoIdx = lines.findIndex((l) => l.startsWith("m=video"));
    if (mVideoIdx === -1) return sdp;

    // Collect payload types whose fmtp contains our preferred profile.
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
    if (h264Pts.length === 0) return sdp; // browser doesn't list it

    // Reorder the m= line so H.264 PTs come first.
    const parts = lines[mVideoIdx].split(" ");
    // parts: ["m=video", port, proto, ...payloadTypes]
    const proto = parts.slice(0, 3);
    const pts = parts.slice(3);
    const reordered = [
      ...h264Pts,
      ...pts.filter((p) => !h264Pts.includes(p)),
    ];
    lines[mVideoIdx] = [...proto, ...reordered].join(" ");
    return lines.join("\r\n");
  }

  /** Poll getStats() and extract the video inbound-rtp report. */
  async function sampleStats(pc: RTCPeerConnection) {
    try {
      const report = await pc.getStats();

      // Collect relevant entries by iterating the report map.
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
        sampledAt: Date.now(),
      });
    } catch {
      /* stats unavailable — noop */
    }
  }

  /* ── teardown ──────────────────────────────────────────────────────── */

  const cleanup = useCallback(() => {
    if (statsTimerRef.current) {
      clearInterval(statsTimerRef.current);
      statsTimerRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    setStream(null);
    setStats(EMPTY_STREAM_STATS);
    setState("idle");
    cameraRef.current = null;
  }, []);

  /* ── stop: tear down + notify remote ───────────────────────────────── */

  const stop = useCallback(() => {
    if (cameraRef.current) {
      send({ type: "webrtc:stop-stream", camera: cameraRef.current });
    }
    cleanup();
  }, [send, cleanup]);

  /* ── start ─────────────────────────────────────────────────────────── */

  const start = useCallback(
    (camera: CameraId) => {
      // Tear down any existing connection first.
      if (pcRef.current) {
        stop();
      }

      cameraRef.current = camera;
      setState("signaling");

      // Ensure a WebSocket is open for signaling.
      let ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        ws = new WebSocket(wsUrl);
        wsRef.current = ws;
      }

      const setupSignaling = () => {
        // Request the Jetson to start publishing for this camera.
        send({ type: "webrtc:request-stream", camera });
      };

      if (ws.readyState === WebSocket.OPEN) {
        setupSignaling();
      } else {
        ws.addEventListener("open", setupSignaling, { once: true });
      }

      // Handle incoming signaling messages.
      const onMessage = async (event: MessageEvent) => {
        let data: Record<string, unknown>;
        try {
          data = JSON.parse(event.data);
        } catch {
          return;
        }

        // Only process WebRTC signaling for our active camera.
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
            await handleIceCandidate(
              data as unknown as WebRTCIceCandidate,
            );
            break;
          default:
            break;
        }
      };

      ws.addEventListener("message", onMessage);

      // Store the listener for cleanup.
      const currentWs = ws;
      return () => {
        currentWs.removeEventListener("message", onMessage);
      };
    },
    [wsUrl, send, stop],
  );

  /* ── signaling handlers ────────────────────────────────────────────── */

  async function handleOffer(offer: WebRTCOffer, camera: CameraId) {
    setState("connecting");

    const pc = new RTCPeerConnection(RTC_CONFIG);
    pcRef.current = pc;

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
    };

    // Forward local ICE candidates to the Jetson.
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        send({
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
        setState("failed");
      } else if (iceState === "disconnected" || iceState === "closed") {
        setState("closed");
      }
    };

    // Set remote description (the offer from Jetson).
    await pc.setRemoteDescription({
      type: "offer",
      sdp: offer.sdp,
    });

    // Create answer, prefer H.264, and set local description.
    const answer = await pc.createAnswer();
    if (answer.sdp) {
      answer.sdp = preferH264(answer.sdp);
    }
    await pc.setLocalDescription(answer);

    // Send the answer back to Jetson.
    send({
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
    try {
      await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
    } catch {
      /* ICE candidate could arrive before remote description is set;
         safe to ignore in that edge case. */
    }
  }

  /* ── auto-cleanup on unmount ───────────────────────────────────────── */

  useEffect(() => {
    return () => {
      cleanup();
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [cleanup]);

  return { state, stream, stats, start, stop };
}
