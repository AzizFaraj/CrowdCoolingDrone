import Placeholder from "@/components/common/Placeholder";
import PageShell from "@/components/layout/PageShell";

export default function AnalyticsPage() {
  return (
    <PageShell
      title="Analytics & Reports"
      description="Mission validation metrics, performance tracking, and report export."
    >
      {/* KPI summary */}
      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-zinc-500">
          Key Performance Indicators
        </h2>
        <Placeholder
          label="KPI Cards: Avg Decision Latency, Avg RTT, Boot-to-Service, Misting Duration, Water Usage"
          className="min-h-[100px]"
        />
      </section>

      {/* Charts */}
      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-zinc-500">
          Trend Charts
        </h2>
        <Placeholder
          label="Recharts Panels: Latency Distribution, RTT Timeline, Packet Loss, Docking Success Rate"
          className="min-h-[300px]"
        />
      </section>

      {/* Export */}
      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-zinc-500">
          Export
        </h2>
        <Placeholder label="Export Mission Report (PDF / CSV)" />
      </section>
    </PageShell>
  );
}
