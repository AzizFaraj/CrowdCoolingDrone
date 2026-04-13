import Placeholder from "@/components/common/Placeholder";
import PageShell from "@/components/layout/PageShell";

export default function AlertsPage() {
  return (
    <PageShell
      title="Alerts & Safety Console"
      description="Warnings, critical events, override controls, and command audit trail."
    >
      {/* Critical action controls */}
      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-zinc-500">
          Critical Controls
        </h2>
        <Placeholder label="Guarded Action Buttons: Pause, RTH, Disable Spray, Safe-Mode, Emergency Abort" />
      </section>

      {/* Alert feed */}
      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-zinc-500">
          Alert Feed
        </h2>
        <Placeholder
          label="Scrollable Alert List (severity, timestamp, subsystem, message, ack button)"
          className="min-h-[300px]"
        />
      </section>

      {/* Command audit trail */}
      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-zinc-500">
          Command History
        </h2>
        <Placeholder
          label="Command Audit Trail Table"
          className="min-h-[200px]"
        />
      </section>
    </PageShell>
  );
}
