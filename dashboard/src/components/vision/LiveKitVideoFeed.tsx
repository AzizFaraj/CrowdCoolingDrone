"use client";

import { useEffect, useRef } from "react";
import type { RemoteVideoTrack } from "livekit-client";

import { cn } from "@/lib/utils";

interface LiveKitVideoFeedProps {
  track: RemoteVideoTrack | null;
  label?: string;
  className?: string;
}

export default function LiveKitVideoFeed({
  track,
  label,
  className,
}: LiveKitVideoFeedProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.innerHTML = "";
    if (!track) {
      return;
    }

    const element = track.attach();
    element.autoplay = true;
    element.muted = true;
    element.playsInline = true;
    element.setAttribute("disablePictureInPicture", "true");
    element.className = "h-full w-full object-contain";
    container.appendChild(element);
    element.play().catch(() => {
      /* Allow user interaction to resume playback if needed. */
    });

    return () => {
      track.detach(element);
      element.remove();
    };
  }, [track]);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border border-zinc-800 bg-black",
        className,
      )}
    >
      <div ref={containerRef} className="h-full w-full" />

      {label && (
        <span className="absolute left-2 top-2 rounded bg-black/60 px-2 py-0.5 text-xs font-medium text-white">
          {label}
        </span>
      )}

      {!track && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/80">
          <p className="text-sm text-zinc-500">No video signal</p>
        </div>
      )}
    </div>
  );
}
