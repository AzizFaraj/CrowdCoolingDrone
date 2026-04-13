"use client";

import MetricCard from "@/components/common/MetricCard";
import Placeholder from "@/components/common/Placeholder";
import PageShell from "@/components/layout/PageShell";
import { useDroneStore } from "@/stores/droneStore";

export default function VisionPage() {
  const snapshot = useDroneStore((s) => s.snapshot);

  const personCount = snapshot?.ai.personCount ?? "---";
  const crowdScore = snapshot?.ai.crowdScore.toFixed(2) ?? "---";
  const inferenceMs = snapshot?.ai.inferenceMs ?? "---";
  const decisionMs = snapshot?.ai.decisionLatencyMs ?? "---";
  const decision = snapshot?.ai.decision ?? "---";
  const mode = snapshot?.ai.mode ?? "---";
  const confidence = snapshot?.ai.confidenceThreshold.toFixed(2) ?? "---";
  const densityScore = "N/A"; // Not in AI state, would need separate field
  const decisionReason = snapshot?.ai.decisionReason ?? "---";

  return (
    <PageShell
      title="Vision & AI"
      description="Live perception feed, crowd detections, and decision trace."
    >
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Live video feed */}
        <div className="space-y-4">
          <h2 className="text-sm font-medium uppercase tracking-wider text-zinc-500">
            Live Feed
          </h2>
          <Placeholder
            label="WebRTC Video Stream + AI Overlays"
            className="min-h-[300px]"
          />
          <div className="grid grid-cols-2 gap-4">
            <MetricCard title="Person Count" value={personCount} />
            <MetricCard title="Crowd Score" value={crowdScore} />
            <MetricCard title="Inference Latency" value={inferenceMs} unit="ms" />
            <MetricCard title="Decision Latency" value={decisionMs} unit="ms" />
          </div>
        </div>

        {/* Decision trace */}
        <div className="space-y-4">
          <h2 className="text-sm font-medium uppercase tracking-wider text-zinc-500">
            Decision Trace
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <MetricCard title="Current Decision" value={decision} />
            <MetricCard title="Waypoint Mode" value={mode} />
            <MetricCard title="Confidence Threshold" value={confidence} />
            <MetricCard title="Density Score" value={densityScore} />
          </div>
          <Placeholder
            label={`Reason: ${decisionReason}`}
            className="min-h-[180px]"
          />
        </div>
      </div>
    </PageShell>
  );
}
