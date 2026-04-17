"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Anchor,
  BarChart3,
  Droplets,
  Eye,
  Monitor,
  ShieldAlert,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "@/lib/constants";

const ICON_MAP: Record<string, React.ElementType> = {
  Monitor,
  Activity,
  Eye,
  Droplets,
  Anchor,
  ShieldAlert,
  BarChart3,
};

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-56 flex-col border-r border-zinc-800 bg-zinc-950 text-zinc-300">
      {/* Logo / Title */}
      <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-4">
        <Droplets className="h-6 w-6 text-sky-400" />
        <span className="text-sm font-semibold tracking-tight text-white">
          CrowdCooling GCS
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-2 py-3">
        {NAV_ITEMS.map((item) => {
          const Icon = ICON_MAP[item.icon];
          const active = pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-zinc-800 text-white"
                  : "hover:bg-zinc-900 hover:text-white",
              )}
            >
              {Icon && <Icon className="h-4 w-4 shrink-0" />}
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-zinc-800 px-4 py-3 text-xs text-zinc-500">
        v0.1.0 &middot; Skeleton
      </div>
    </aside>
  );
}
