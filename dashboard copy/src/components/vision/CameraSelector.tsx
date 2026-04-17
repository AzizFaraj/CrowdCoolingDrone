"use client";

import { cn } from "@/lib/utils";
import type { CameraId } from "@/types/webrtc";

/* ──────────────────────────────────────────────────────────────────────
   CameraSelector — toggle between the two IMX477 camera feeds.
   ────────────────────────────────────────────────────────────────────── */

const CAMERAS: { id: CameraId; label: string }[] = [
  { id: "top-down", label: "Top-Down" },
  { id: "side-view", label: "Side-View" },
];

interface CameraSelectorProps {
  active: CameraId;
  onChange: (camera: CameraId) => void;
  disabled?: boolean;
  className?: string;
}

export default function CameraSelector({
  active,
  onChange,
  disabled,
  className,
}: CameraSelectorProps) {
  return (
    <div className={cn("inline-flex rounded-lg border border-zinc-700", className)}>
      {CAMERAS.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          disabled={disabled}
          onClick={() => onChange(id)}
          className={cn(
            "px-3 py-1.5 text-xs font-medium transition-colors",
            "first:rounded-l-lg last:rounded-r-lg",
            id === active
              ? "bg-zinc-700 text-white"
              : "bg-zinc-900 text-zinc-400 hover:text-zinc-200",
            disabled && "cursor-not-allowed opacity-50",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
