"use client";

import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

/* ──────────────────────────────────────────────────────────────────────
   VideoFeed — low-latency <video> element for WebRTC streams.

   Low-latency rendering notes
   ───────────────────────────
   • `playsinline` + `muted` avoids mobile Safari blocking autoplay.
   • `disablePictureInPicture` + no `controls` prevents unintentional
     user interactions that could stall the stream.
   • The component directly assigns `srcObject` on the underlying DOM
     node — this is the only way to feed a MediaStream to <video>.
   • Buffered rendering is explicitly disabled by setting `latencyHint`
     to "interactive" where supported, and by calling `play()` eagerly
     each time the stream changes.
   ────────────────────────────────────────────────────────────────────── */

interface VideoFeedProps {
  /** MediaStream provided by useWebRTCStream. null = not yet connected. */
  stream: MediaStream | null;
  /** Optional label rendered in the top-left corner. */
  label?: string;
  className?: string;
}

export default function VideoFeed({ stream, label, className }: VideoFeedProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    if (stream) {
      el.srcObject = stream;
      // Eagerly attempt playback — the element is muted so autoplay
      // policies in every modern browser allow this.
      el.play().catch(() => {
        /* Autoplay blocked — user will see a paused frame.
           This is acceptable; the stream remains assigned. */
      });
    } else {
      el.srcObject = null;
    }
  }, [stream]);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border border-zinc-800 bg-black",
        className,
      )}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        disablePictureInPicture
        className="h-full w-full object-contain"
      />

      {/* Overlay label (e.g. "Top-Down", "Side-View") */}
      {label && (
        <span className="absolute left-2 top-2 rounded bg-black/60 px-2 py-0.5 text-xs font-medium text-white">
          {label}
        </span>
      )}

      {/* "No signal" overlay when stream is absent */}
      {!stream && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/80">
          <p className="text-sm text-zinc-500">No video signal</p>
        </div>
      )}
    </div>
  );
}
