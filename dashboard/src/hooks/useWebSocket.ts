"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { HEARTBEAT_INTERVAL_MS, WS_URL } from "@/lib/constants";
import { useDroneStore } from "@/stores/droneStore";
import type { AlertEvent, DroneSnapshot } from "@/types/telemetry";

/* ──────────────────────────────────────────────────────────────────────
   WebSocket hook.
   Connects to the telemetry bridge, dispatches incoming messages to
   the Zustand store, and sends periodic heartbeats.
   ────────────────────────────────────────────────────────────────────── */

type ConnectionStatus = "connecting" | "open" | "closed" | "error";

export function useWebSocket(url: string = WS_URL) {
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("closed");

  const setSnapshot = useDroneStore((s) => s.setSnapshot);
  const pushAlert = useDroneStore((s) => s.pushAlert);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setStatus("connecting");
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => setStatus("open");

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "snapshot") {
          setSnapshot(data.payload as DroneSnapshot);
        } else if (data.type === "alert") {
          pushAlert(data.payload as AlertEvent);
        }
      } catch {
        /* Ignore malformed messages in skeleton phase */
      }
    };

    ws.onerror = () => setStatus("error");

    ws.onclose = () => {
      setStatus("closed");
      wsRef.current = null;
    };
  }, [url, setSnapshot, pushAlert]);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
  }, []);

  const sendCommand = useCallback((type: string, payload?: unknown) => {
    const ws = wsRef.current;
    if (ws?.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type, payload }));
  }, []);

  /* Auto-connect on mount, send heartbeats while connected */
  useEffect(() => {
    connect();

    const heartbeat = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "HEARTBEAT" }));
      }
    }, HEARTBEAT_INTERVAL_MS);

    return () => {
      clearInterval(heartbeat);
      disconnect();
    };
  }, [connect, disconnect]);

  return { status, connect, disconnect, sendCommand } as const;
}
