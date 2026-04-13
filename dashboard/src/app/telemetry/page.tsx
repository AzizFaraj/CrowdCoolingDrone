"use client";

import MetricCard from "@/components/common/MetricCard";
import Placeholder from "@/components/common/Placeholder";
import PageShell from "@/components/layout/PageShell";
import { useDroneStore } from "@/stores/droneStore";

export default function TelemetryPage() {
  const snapshot = useDroneStore((s) => s.snapshot);

  const voltage = snapshot?.vehicle.batteryVoltage.toFixed(1) ?? "---";
  const current = snapshot?.vehicle.batteryCurrent.toFixed(1) ?? "---";
  const batteryPct = snapshot?.vehicle.batteryPct ?? "---";
  const altitude = snapshot?.vehicle.altMeterAgl.toFixed(1) ?? "---";
  const heading = snapshot?.vehicle.headingDeg ?? "---";
  const gpsSats = snapshot?.vehicle.satelliteCount ?? "---";
  const gpsFix = snapshot?.vehicle.gpsFix ?? "---";

  const rtt = snapshot?.link.rttMs ?? "---";
  const packetLoss = snapshot?.link.packetLossPct.toFixed(1) ?? "---";
  const lastHb = snapshot?.link.lastHeartbeatMs ?? "---";
  const linkState = snapshot?.link.state ?? "INIT";

  const cpuLoad = snapshot?.compute.cpuLoadPct ?? "---";
  const gpuLoad = snapshot?.compute.gpuLoadPct ?? "---";
  const memoryLoad = snapshot?.compute.memoryUsedPct ?? "---";
  const cameraFps = snapshot?.compute.cameraFps ?? "---";

  // Simple battery time estimation (simplified)
  const estRemaining =
    snapshot?.vehicle.batteryPct && snapshot?.vehicle.batteryCurrent
      ? ((snapshot.vehicle.batteryPct / 100) * 60).toFixed(0)
      : "---";

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
          <MetricCard title="Battery Voltage" value={voltage} unit="V" />
          <MetricCard title="Current Draw" value={current} unit="A" />
          <MetricCard title="Battery %" value={batteryPct} unit="%" />
          <MetricCard title="Est. Remaining" value={estRemaining} unit="min" />
          <MetricCard title="Altitude AGL" value={altitude} unit="m" />
          <MetricCard title="Heading" value={heading} unit="deg" />
          <MetricCard title="GPS Sats" value={gpsSats} />
          <MetricCard title="GPS Fix" value={gpsFix} />
        </div>
      </section>

      {/* Communication link */}
      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-zinc-500">
          Communication Link
        </h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <MetricCard title="RTT" value={rtt} unit="ms" />
          <MetricCard title="Packet Loss" value={packetLoss} unit="%" />
          <MetricCard title="Last Heartbeat" value={lastHb} unit="ms" />
          <MetricCard title="Link State" value={linkState} />
        </div>
      </section>

      {/* Compute health */}
      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-zinc-500">
          Jetson Compute
        </h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <MetricCard title="CPU Load" value={cpuLoad} unit="%" />
          <MetricCard title="GPU Load" value={gpuLoad} unit="%" />
          <MetricCard title="Memory" value={memoryLoad} unit="%" />
          <MetricCard title="Camera FPS" value={cameraFps} />
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
