"use client";

import MetricCard from "@/components/common/MetricCard";
import Placeholder from "@/components/common/Placeholder";
import PageShell from "@/components/layout/PageShell";
import { useDroneStore } from "@/stores/droneStore";

export default function OperationsPage() {
  const snapshot = useDroneStore((s) => s.snapshot);

  const altitude = snapshot?.vehicle.altMeterAgl.toFixed(1) ?? "---";
  const speed = snapshot?.vehicle.speedMps.toFixed(1) ?? "---";
  const battery = snapshot?.vehicle.batteryPct ?? "---";
  const phase = snapshot?.missionPhase ?? "IDLE";
  const lat = snapshot?.vehicle.lat.toFixed(4) ?? "---";
  const lng = snapshot?.vehicle.lng.toFixed(4) ?? "---";
  const heading = snapshot?.vehicle.headingDeg ?? "---";

  return (
    <PageShell
      title="Mission Operations"
      description="Live mission map, drone position, geofence, and waypoint tracking."
    >
      {/* Map panel – will be replaced by Leaflet/Mapbox integration */}
      <Placeholder
        label={`Mission Map (Leaflet / Mapbox GL) — Drone at ${lat}, ${lng}`}
        className="min-h-[400px]"
      />

      {/* Quick-glance metrics row */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <MetricCard title="Altitude AGL" value={altitude} unit="m" />
        <MetricCard title="Ground Speed" value={speed} unit="m/s" />
        <MetricCard title="Battery" value={battery} unit="%" />
        <MetricCard title="Mission Phase" value={phase} />
      </div>

      {/* Position & heading */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <MetricCard title="Latitude" value={lat} unit="deg" />
        <MetricCard title="Longitude" value={lng} unit="deg" />
        <MetricCard title="Heading" value={heading} unit="deg" />
      </div>

      {/* Waypoint list placeholder */}
      <Placeholder label="Waypoint List & Next Target" />
    </PageShell>
  );
}
