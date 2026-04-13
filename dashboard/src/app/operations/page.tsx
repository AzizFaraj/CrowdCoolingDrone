import MetricCard from "@/components/common/MetricCard";
import Placeholder from "@/components/common/Placeholder";
import PageShell from "@/components/layout/PageShell";

export default function OperationsPage() {
  return (
    <PageShell
      title="Mission Operations"
      description="Live mission map, drone position, geofence, and waypoint tracking."
    >
      {/* Map panel – will be replaced by Leaflet/Mapbox integration */}
      <Placeholder
        label="Mission Map (Leaflet / Mapbox GL)"
        className="min-h-[400px]"
      />

      {/* Quick-glance metrics row */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <MetricCard title="Altitude AGL" value="---" unit="m" />
        <MetricCard title="Ground Speed" value="---" unit="m/s" />
        <MetricCard title="Battery" value="---" unit="%" />
        <MetricCard title="Mission Phase" value="IDLE" />
      </div>

      {/* Waypoint list placeholder */}
      <Placeholder label="Waypoint List & Next Target" />
    </PageShell>
  );
}
