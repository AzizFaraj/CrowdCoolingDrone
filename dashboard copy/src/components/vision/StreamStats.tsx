"use client";

import MetricCard from "@/components/common/MetricCard";
import { SPEC } from "@/lib/constants";
import type { WebRTCStreamStats } from "@/types/webrtc";

/* ──────────────────────────────────────────────────────────────────────
   StreamStats — displays WebRTC stream health metrics.
   ────────────────────────────────────────────────────────────────────── */

interface StreamStatsProps {
  stats: WebRTCStreamStats;
}

export default function StreamStats({ stats }: StreamStatsProps) {
  const rttMs = Math.round(stats.currentRttSec * 1000);
  const rttStatus: "ok" | "warn" | "critical" =
    rttMs === 0
      ? "ok"
      : rttMs <= SPEC.maxRttMs / 2
        ? "ok"
        : rttMs <= SPEC.maxRttMs
          ? "warn"
          : "critical";

  const resolution =
    stats.frameWidth && stats.frameHeight
      ? `${stats.frameWidth}x${stats.frameHeight}`
      : "---";

  const lossPct =
    stats.packetsReceived > 0
      ? ((stats.packetsLost / stats.packetsReceived) * 100).toFixed(1)
      : "0";

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
      <MetricCard
        title="Stream RTT"
        value={rttMs || "---"}
        unit="ms"
        status={rttStatus}
      />
      <MetricCard
        title="Resolution"
        value={resolution}
      />
      <MetricCard
        title="Stream FPS"
        value={stats.fps ? stats.fps.toFixed(0) : "---"}
      />
      <MetricCard
        title="Codec"
        value={stats.codec}
      />
      <MetricCard
        title="Bitrate"
        value={stats.bitrateKbps || "---"}
        unit="kbps"
      />
      <MetricCard
        title="Jitter"
        value={stats.jitterSec ? (stats.jitterSec * 1000).toFixed(1) : "---"}
        unit="ms"
      />
      <MetricCard
        title="Packet Loss"
        value={lossPct}
        unit="%"
      />
      <MetricCard
        title="Packets Recv"
        value={stats.packetsReceived || "---"}
      />
      <MetricCard
        title="Packets Lost"
        value={stats.packetsLost}
      />
      <MetricCard
        title="Transport"
        value={stats.iceTransportType}
        subtitle={stats.iceTransportType === "relay" ? "Via TURN relay" : undefined}
        status={stats.iceTransportType === "relay" ? "warn" : "ok"}
      />
    </div>
  );
}
