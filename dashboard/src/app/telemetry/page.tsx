import MetricCard from "@/components/common/MetricCard";
import Placeholder from "@/components/common/Placeholder";
import PageShell from "@/components/layout/PageShell";

export default function TelemetryPage() {
  return (
    <PageShell
      title="Telemetry & Vehicle Health"
      description="Aircraft systems, communication link, and compute health."
    >
      {/* Vehicle telemetry cards */}
      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-zinc-500">
          Vehicle
        </h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <MetricCard title="Battery Voltage" value="---" unit="V" />
          <MetricCard title="Current Draw" value="---" unit="A" />
          <MetricCard title="Battery %" value="---" unit="%" />
          <MetricCard title="Est. Remaining" value="---" unit="min" />
          <MetricCard title="Altitude AGL" value="---" unit="m" />
          <MetricCard title="Heading" value="---" unit="deg" />
          <MetricCard title="GPS Sats" value="---" />
          <MetricCard title="GPS Fix" value="---" />
        </div>
      </section>

      {/* Communication link */}
      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-zinc-500">
          Communication Link
        </h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <MetricCard title="RTT" value="---" unit="ms" />
          <MetricCard title="Packet Loss" value="---" unit="%" />
          <MetricCard title="Last Heartbeat" value="---" unit="ms" />
          <MetricCard title="Link State" value="INIT" />
        </div>
      </section>

      {/* Compute health */}
      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-zinc-500">
          Jetson Compute
        </h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <MetricCard title="CPU Load" value="---" unit="%" />
          <MetricCard title="GPU Load" value="---" unit="%" />
          <MetricCard title="Memory" value="---" unit="%" />
          <MetricCard title="Camera FPS" value="---" />
        </div>
      </section>

      {/* Time-series charts placeholder */}
      <Placeholder
        label="Time-Series Panels (Battery, RTT, Altitude, CPU/GPU over time)"
        className="min-h-[250px]"
      />
    </PageShell>
  );
}
