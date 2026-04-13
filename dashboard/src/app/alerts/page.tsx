"use client";

import Placeholder from "@/components/common/Placeholder";
import StatusBadge from "@/components/common/StatusBadge";
import PageShell from "@/components/layout/PageShell";
import { useDroneStore } from "@/stores/droneStore";

export default function AlertsPage() {
  const alerts = useDroneStore((s) => s.alerts);
  const commands = useDroneStore((s) => s.commands);

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
          Alert Feed ({alerts.length} alerts)
        </h2>
        <div className="space-y-2">
          {alerts.length === 0 ? (
            <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-center text-sm text-zinc-500">
              No alerts
            </div>
          ) : (
            alerts.map((alert) => (
              <div
                key={alert.id}
                className="flex items-center gap-4 rounded-lg border border-zinc-800 bg-zinc-900 p-4"
              >
                <StatusBadge
                  label={alert.severity}
                  variant={
                    alert.severity === "CRITICAL"
                      ? "red"
                      : alert.severity === "WARNING"
                        ? "yellow"
                        : "neutral"
                  }
                />
                <div className="flex-1">
                  <p className="text-sm font-medium text-white">
                    [{alert.subsystem}] {alert.message}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {new Date(alert.timestamp).toLocaleString()}
                  </p>
                </div>
                {!alert.acknowledged && (
                  <button className="rounded bg-zinc-700 px-3 py-1 text-xs text-white hover:bg-zinc-600">
                    Acknowledge
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </section>

      {/* Command audit trail */}
      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-zinc-500">
          Command History ({commands.length} commands)
        </h2>
        <div className="space-y-2">
          {commands.length === 0 ? (
            <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-center text-sm text-zinc-500">
              No commands issued
            </div>
          ) : (
            commands.map((cmd) => (
              <div
                key={cmd.id}
                className="flex items-center gap-4 rounded-lg border border-zinc-800 bg-zinc-900 p-3"
              >
                <StatusBadge
                  label={cmd.status}
                  variant={
                    cmd.status === "ACKED"
                      ? "green"
                      : cmd.status === "REJECTED"
                        ? "red"
                        : "yellow"
                  }
                />
                <div className="flex-1">
                  <p className="text-sm font-medium text-white">{cmd.type}</p>
                  <p className="text-xs text-zinc-500">
                    by {cmd.issuer} at {new Date(cmd.issuedAt).toLocaleString()}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </PageShell>
  );
}
