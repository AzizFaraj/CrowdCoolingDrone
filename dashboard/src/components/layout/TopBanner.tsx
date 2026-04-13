"use client";

import { cn } from "@/lib/utils";
import { useDroneStore } from "@/stores/droneStore";

const HEALTH_STYLES: Record<string, string> = {
  GREEN: "bg-emerald-600",
  YELLOW: "bg-amber-500",
  RED: "bg-red-600",
};

const LINK_STYLES: Record<string, string> = {
  INIT: "text-zinc-400",
  CONNECTED: "text-emerald-400",
  DEGRADED: "text-amber-400",
  LOST: "text-red-400",
};

export default function TopBanner() {
  const snapshot = useDroneStore((s) => s.snapshot);

  const droneId = snapshot?.droneId ?? "---";
  const missionPhase = snapshot?.missionPhase ?? "IDLE";
  const overrideMode = snapshot?.overrideMode ?? "---";
  const linkState = snapshot?.link.state ?? "INIT";
  const healthColor = snapshot?.health.overall ?? "GREEN";
  const armed = snapshot?.vehicle.armed ?? false;
  const lastHb = snapshot?.link.lastHeartbeatMs;

  return (
    <header className="flex items-center justify-between border-b border-zinc-800 bg-zinc-950 px-4 py-2 text-xs text-zinc-300">
      {/* Left cluster */}
      <div className="flex items-center gap-4">
        <span className="font-semibold text-white">{droneId}</span>
        <span className="rounded bg-zinc-800 px-2 py-0.5">{missionPhase}</span>
        <span className={armed ? "text-red-400" : "text-zinc-500"}>
          {armed ? "ARMED" : "DISARMED"}
        </span>
        <span>{overrideMode}</span>
      </div>

      {/* Right cluster */}
      <div className="flex items-center gap-4">
        <span className={cn("font-medium", LINK_STYLES[linkState] ?? "")}>
          Link: {linkState}
        </span>
        {lastHb !== undefined && (
          <span className="text-zinc-500">HB: {lastHb} ms</span>
        )}
        <span
          className={cn(
            "inline-block h-3 w-3 rounded-full",
            HEALTH_STYLES[healthColor] ?? "bg-zinc-600",
          )}
          title={`Health: ${healthColor}`}
        />
      </div>
    </header>
  );
}
