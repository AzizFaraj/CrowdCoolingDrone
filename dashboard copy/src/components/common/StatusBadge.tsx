import { cn } from "@/lib/utils";

type Variant = "green" | "yellow" | "red" | "neutral";

interface StatusBadgeProps {
  label: string;
  variant?: Variant;
  className?: string;
}

const VARIANT_STYLES: Record<Variant, string> = {
  green: "bg-emerald-900/60 text-emerald-300 border-emerald-700",
  yellow: "bg-amber-900/60 text-amber-300 border-amber-700",
  red: "bg-red-900/60 text-red-300 border-red-700",
  neutral: "bg-zinc-800 text-zinc-300 border-zinc-700",
};

export default function StatusBadge({
  label,
  variant = "neutral",
  className,
}: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
        VARIANT_STYLES[variant],
        className,
      )}
    >
      {label}
    </span>
  );
}
