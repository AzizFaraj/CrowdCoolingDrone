"use client";

import { useCallback, useEffect, useState } from "react";

import { useDroneStore } from "@/stores/droneStore";
import {
  type ConnectionStatus,
  wsManager,
} from "@/services/wsManager";
import type { AlertEvent, DroneSnapshot } from "@/types/telemetry";

/* ──────────────────────────────────────────────────────────────────────
   WebSocket hook.
   Delegates connection management, heartbeats, and reconnection to
   the shared wsManager so that telemetry and WebRTC signaling share
   one socket.
   ────────────────────────────────────────────────────────────────────── */

export function useWebSocket() {
  const [status, setStatus] = useState<ConnectionStatus>("closed");

  const setSnapshot = useDroneStore((s) => s.setSnapshot);
  const pushAlert = useDroneStore((s) => s.pushAlert);

  useEffect(() => {
    wsManager.acquire();

    const unsubStatus = wsManager.onStatus(setStatus);

    const unsubMsg = wsManager.onMessage((data) => {
      if (data.type === "snapshot") {
        setSnapshot(data.payload as DroneSnapshot);
      } else if (data.type === "alert") {
        pushAlert(data.payload as AlertEvent);
      }
    });

    return () => {
      unsubStatus();
      unsubMsg();
      wsManager.release();
    };
  }, [setSnapshot, pushAlert]);

  const sendCommand = useCallback((type: string, payload?: unknown) => {
    wsManager.send({ type, payload });
  }, []);

  return { status, sendCommand } as const;
}
