"use client";

import { useMemo } from "react";

import { cn } from "@/lib/utils";
import {
  MEDIAMTX_EMBED_PROTOCOL,
  MEDIAMTX_HLS_BASE_URL,
  MEDIAMTX_SIDE_PATH,
  MEDIAMTX_TOP_PATH,
  MEDIAMTX_WEBRTC_BASE_URL,
} from "@/lib/constants";
import type { CameraId } from "@/types/webrtc";

interface MediaMTXVideoFeedProps {
  camera: CameraId;
  active: boolean;
  label?: string;
  className?: string;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export default function MediaMTXVideoFeed({
  camera,
  active,
  label,
  className,
}: MediaMTXVideoFeedProps) {
  const src = useMemo(() => {
    if (!active) {
      return "";
    }

    const path = camera === "top-down" ? MEDIAMTX_TOP_PATH : MEDIAMTX_SIDE_PATH;
    if (MEDIAMTX_EMBED_PROTOCOL === "hls") {
      if (!MEDIAMTX_HLS_BASE_URL) {
        return "";
      }
      return `${trimTrailingSlash(MEDIAMTX_HLS_BASE_URL)}/${path}`;
    }

    if (!MEDIAMTX_WEBRTC_BASE_URL) {
      return "";
    }

    return `${trimTrailingSlash(MEDIAMTX_WEBRTC_BASE_URL)}/${path}/`;
  }, [active, camera]);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border border-zinc-800 bg-black",
        className,
      )}
    >
      {src ? (
        <iframe
          src={src}
          className="h-full w-full border-0"
          allow="autoplay; fullscreen; picture-in-picture"
          title={`MediaMTX ${camera} stream`}
        />
      ) : null}

      {label && (
        <span className="absolute left-2 top-2 z-10 rounded bg-black/60 px-2 py-0.5 text-xs font-medium text-white">
          {label}
        </span>
      )}

      {!src && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/80">
          <p className="text-sm text-zinc-500">No MediaMTX stream configured</p>
        </div>
      )}
    </div>
  );
}
