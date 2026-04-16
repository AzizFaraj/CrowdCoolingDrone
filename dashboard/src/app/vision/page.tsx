"use client";

import { useCallback, useState } from "react";

import MetricCard from "@/components/common/MetricCard";
import MediaMTXVideoFeed from "@/components/vision/MediaMTXVideoFeed";
import StatusBadge from "@/components/common/StatusBadge";
import PageShell from "@/components/layout/PageShell";
import CameraSelector from "@/components/vision/CameraSelector";
import LiveKitVideoFeed from "@/components/vision/LiveKitVideoFeed";
import StreamStats from "@/components/vision/StreamStats";
import VideoFeed from "@/components/vision/VideoFeed";
import { useLiveKitStream } from "@/hooks/useLiveKitStream";
import { useWebRTCStream } from "@/hooks/useWebRTCStream";
import { VIDEO_TRANSPORT } from "@/lib/constants";
import { useDroneStore } from "@/stores/droneStore";
import type { CameraId } from "@/types/webrtc";

/* ──────────────────────────────────────────────────────────────────────
   Vision & AI page.
   Combines live WebRTC camera feed with AI perception telemetry.
   ────────────────────────────────────────────────────────────────────── */

const STATE_VARIANT: Record<string, "green" | "yellow" | "red" | "neutral"> = {
  idle: "neutral",
  signaling: "yellow",
  connecting: "yellow",
  connected: "green",
  failed: "red",
  closed: "neutral",
};

export default function VisionPage() {
  const snapshot = useDroneStore((s) => s.snapshot);
  const webrtc = useWebRTCStream();
  const livekit = useLiveKitStream();
  const transport = VIDEO_TRANSPORT;
  const [activeCamera, setActiveCamera] = useState<CameraId>("top-down");
  const [mediaMtxActive, setMediaMtxActive] = useState(false);
  const state =
    transport === "livekit"
      ? livekit.state
      : transport === "mediamtx"
        ? mediaMtxActive
          ? "connected"
          : "idle"
        : webrtc.state;
  const stats = transport === "livekit" ? livekit.stats : webrtc.stats;
  const start = transport === "livekit" ? livekit.start : webrtc.start;
  const stop = transport === "livekit" ? livekit.stop : webrtc.stop;

  /* ── camera switching ─────────────────────────────────────────────── */
  const handleCameraChange = useCallback(
    (camera: CameraId) => {
      setActiveCamera(camera);
      if (transport === "mediamtx") {
        return;
      }
      if (state === "connected" || state === "signaling" || state === "connecting") {
        stop();
        start(camera);
      }
    },
    [state, start, stop, transport],
  );

  const handleToggleStream = useCallback(() => {
    if (transport === "mediamtx") {
      setMediaMtxActive((current) => !current);
      return;
    }
    if (state === "idle" || state === "closed" || state === "failed") {
      start(activeCamera);
    } else {
      stop();
    }
  }, [state, activeCamera, start, stop, transport]);

  const isStreaming = state === "connected";

  /* ── AI metrics ───────────────────────────────────────────────────── */
  const personCount = snapshot?.ai.personCount ?? "---";
  const crowdScore = snapshot?.ai.crowdScore.toFixed(2) ?? "---";
  const inferenceMs = snapshot?.ai.inferenceMs ?? "---";
  const decisionMs = snapshot?.ai.decisionLatencyMs ?? "---";
  const decision = snapshot?.ai.decision ?? "---";
  const mode = snapshot?.ai.mode ?? "---";
  const confidence = snapshot?.ai.confidenceThreshold.toFixed(2) ?? "---";
  const decisionReason = snapshot?.ai.decisionReason ?? "---";

  return (
    <PageShell
      title="Vision & AI"
      description="Live perception feed, crowd detections, and decision trace."
    >
      {/* ── Video feed + controls ──────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-medium uppercase tracking-wider text-zinc-500">
              Live Feed
            </h2>
            <StatusBadge label={state} variant={STATE_VARIANT[state]} />
          </div>
          <div className="flex items-center gap-3">
            <CameraSelector
              active={activeCamera}
              onChange={handleCameraChange}
              disabled={state === "signaling" || state === "connecting"}
            />
            <button
              type="button"
              onClick={handleToggleStream}
              className={
                isStreaming
                  ? "rounded-md bg-red-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-600"
                  : "rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-600"
              }
            >
              {isStreaming ? "Stop Stream" : "Start Stream"}
            </button>
          </div>
        </div>

        {transport === "mediamtx" ? (
          <MediaMTXVideoFeed
            camera={activeCamera}
            active={mediaMtxActive}
            label={
              activeCamera === "top-down"
                ? "Top-Down (IMX477) via MediaMTX"
                : "Side-View (IMX477) via MediaMTX"
            }
            className="min-h-[360px]"
          />
        ) : transport === "livekit" ? (
          <LiveKitVideoFeed
            track={livekit.track}
            label={
              activeCamera === "top-down"
                ? "Top-Down (IMX477) via LiveKit"
                : "Side-View (IMX477) via LiveKit"
            }
            className="min-h-[360px]"
          />
        ) : (
          <VideoFeed
            stream={webrtc.stream}
            label={
              activeCamera === "top-down"
                ? "Top-Down (IMX477)"
                : "Side-View (IMX477)"
            }
            className="min-h-[360px]"
          />
        )}
      </section>

      {/* ── Stream health metrics ──────────────────────────────────── */}
      {isStreaming && transport !== "mediamtx" && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wider text-zinc-500">
            Stream Health
          </h2>
          <StreamStats stats={stats} />
        </section>
      )}

      {/* ── AI perception + decision trace ─────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wider text-zinc-500">
            Perception
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <MetricCard title="Person Count" value={personCount} />
            <MetricCard title="Crowd Score" value={crowdScore} />
            <MetricCard title="Inference Latency" value={inferenceMs} unit="ms" />
            <MetricCard title="Decision Latency" value={decisionMs} unit="ms" />
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wider text-zinc-500">
            Decision Trace
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <MetricCard title="Current Decision" value={decision} />
            <MetricCard title="Waypoint Mode" value={mode} />
            <MetricCard title="Confidence" value={confidence} />
            <MetricCard
              title="Reason"
              value={decisionReason}
              subtitle="Last autonomy cycle"
            />
          </div>
        </section>
      </div>
    </PageShell>
  );
}
