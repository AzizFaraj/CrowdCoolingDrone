import MetricCard from "@/components/common/MetricCard";
import Placeholder from "@/components/common/Placeholder";
import PageShell from "@/components/layout/PageShell";

export default function DockingPage() {
  return (
    <PageShell
      title="Docking & Refill"
      description="Multi-step docking sequence, alignment, refill progress, and recovery."
    >
      {/* Docking phase stepper */}
      <Placeholder
        label="Docking Phase Stepper (Approach > Align > Land > Settle > Verify > Refill > Launch)"
        className="min-h-[80px]"
      />

      {/* Docking widgets */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <MetricCard title="Docking Phase" value="---" />
        <MetricCard title="Alignment Error" value="---" unit="cm" />
        <MetricCard title="Confidence" value="---" unit="%" />
        <MetricCard title="Settle Timer" value="---" unit="s" />
        <MetricCard title="Retry Count" value="0" />
        <MetricCard title="Refill Timer" value="---" unit="s" />
        <MetricCard title="Handshake" value="---" />
        <MetricCard title="Abort Reason" value="None" />
      </div>

      {/* Operator override controls */}
      <Placeholder label="Operator Override Controls (Retry / Abort / Force Refill)" />
    </PageShell>
  );
}
