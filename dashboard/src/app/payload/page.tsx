import MetricCard from "@/components/common/MetricCard";
import Placeholder from "@/components/common/Placeholder";
import PageShell from "@/components/layout/PageShell";

export default function PayloadPage() {
  return (
    <PageShell
      title="Payload & Cooling"
      description="Water tank, spray system, temperature, and refill status."
    >
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <MetricCard title="Water Level" value="---" unit="%" />
        <MetricCard title="Water Temp" value="---" unit="C" />
        <MetricCard title="Spray Enabled" value="---" />
        <MetricCard title="Safe to Spray" value="---" />
        <MetricCard title="Flow Estimate" value="---" unit="L/min" />
        <MetricCard title="Flow Command" value="---" unit="L/min" />
        <MetricCard title="Cooling Budget" value="---" unit="L" />
        <MetricCard title="Refill State" value="IDLE" />
      </div>

      {/* Visual tank gauge placeholder */}
      <Placeholder
        label="Visual Tank Gauge & Temperature Indicator"
        className="min-h-[200px]"
      />

      {/* Spray interlock reasons */}
      <Placeholder label="Spray Interlock Reasons (if spray is blocked)" />
    </PageShell>
  );
}
