"use client";

import MetricCard from "@/components/common/MetricCard";
import Placeholder from "@/components/common/Placeholder";
import PageShell from "@/components/layout/PageShell";
import { useDroneStore } from "@/stores/droneStore";

export default function PayloadPage() {
  const snapshot = useDroneStore((s) => s.snapshot);

  const waterLevel = snapshot?.payload.waterLevelPct ?? "---";
  const waterTemp = snapshot?.payload.waterTempC.toFixed(1) ?? "---";
  const sprayEnabled = snapshot?.payload.sprayEnabled ? "YES" : "NO";
  const safeToSpray = snapshot?.payload.safeToSpray ? "YES" : "NO";
  const flowEst = snapshot?.payload.flowEstLpm.toFixed(2) ?? "---";
  const flowCmd = snapshot?.payload.flowCommandLpm.toFixed(2) ?? "---";
  const refillState = snapshot?.payload.refillState ?? "IDLE";

  // Calculate remaining water in liters (assuming 2L tank)
  const remainingL =
    snapshot?.payload.waterLevelPct
      ? ((snapshot.payload.waterLevelPct / 100) * 2).toFixed(2)
      : "---";

  return (
    <PageShell
      title="Payload & Cooling"
      description="Water tank, spray system, temperature, and refill status."
    >
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <MetricCard title="Water Level" value={waterLevel} unit="%" />
        <MetricCard title="Water Temp" value={waterTemp} unit="°C" />
        <MetricCard title="Spray Enabled" value={sprayEnabled} />
        <MetricCard title="Safe to Spray" value={safeToSpray} />
        <MetricCard title="Flow Estimate" value={flowEst} unit="L/min" />
        <MetricCard title="Flow Command" value={flowCmd} unit="L/min" />
        <MetricCard title="Remaining Water" value={remainingL} unit="L" />
        <MetricCard title="Refill State" value={refillState} />
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
