import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface MetricCardProps {
  title: string;
  value: ReactNode;
  unit?: string;
  subtitle?: string;
  status?: "ok" | "warn" | "critical";
  className?: string;
}

const STATUS_RING: Record<string, string> = {
  ok: "border-emerald-700/50",
  warn: "border-amber-700/50",
  critical: "border-red-700/50",
};

export default function MetricCard({
  title,
  value,
  unit,
  subtitle,
  status = "ok",
  className,
}: MetricCardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-zinc-900 p-4",
        STATUS_RING[status] ?? "border-zinc-800",
        className,
      )}
    >
      <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
        {title}
      </p>
      <p className="mt-1 text-2xl font-semibold text-white">
        {value}
        {unit && (
          <span className="ml-1 text-sm font-normal text-zinc-400">
            {unit}
          </span>
        )}
      </p>
      {subtitle && <p className="mt-1 text-xs text-zinc-500">{subtitle}</p>}
    </div>
  );
}
