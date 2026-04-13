import MetricCard from "@/components/common/MetricCard";
import Placeholder from "@/components/common/Placeholder";
import PageShell from "@/components/layout/PageShell";

export default function VisionPage() {
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
            <MetricCard title="Person Count" value="---" />
            <MetricCard title="Crowd Score" value="---" />
            <MetricCard title="Inference Latency" value="---" unit="ms" />
            <MetricCard title="Decision Latency" value="---" unit="ms" />
          </div>
        </div>

        {/* Decision trace */}
        <div className="space-y-4">
          <h2 className="text-sm font-medium uppercase tracking-wider text-zinc-500">
            Decision Trace
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <MetricCard title="Current Decision" value="---" />
            <MetricCard title="Waypoint Mode" value="---" />
            <MetricCard title="Confidence Threshold" value="---" />
            <MetricCard title="Density Score" value="---" />
          </div>
          <Placeholder
            label="Reason Chain Timeline"
            className="min-h-[180px]"
          />
        </div>
      </div>
    </PageShell>
  );
}
