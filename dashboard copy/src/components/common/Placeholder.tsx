import { cn } from "@/lib/utils";

interface PlaceholderProps {
  label: string;
  className?: string;
}

export default function Placeholder({ label, className }: PlaceholderProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-lg border border-dashed border-zinc-700 bg-zinc-900/50 p-12 text-sm text-zinc-500",
        className,
      )}
    >
      {label}
    </div>
  );
}
