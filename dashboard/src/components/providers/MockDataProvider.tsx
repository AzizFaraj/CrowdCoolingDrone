"use client";

import { useEffect } from "react";

import { useDroneStore } from "@/stores/droneStore";
import {
  generateMockAlerts,
  generateMockCommands,
  generateMockSnapshot,
} from "@/lib/mockData";

/* ──────────────────────────────────────────────────────────────────────
   Mock data provider for development.
   Populates the store with simulated telemetry every 2 seconds.
   ────────────────────────────────────────────────────────────────────── */

export default function MockDataProvider() {
  const setSnapshot = useDroneStore((s) => s.setSnapshot);
  const pushAlert = useDroneStore((s) => s.pushAlert);
  const pushCommand = useDroneStore((s) => s.pushCommand);

  useEffect(() => {
    // Load initial data
    setSnapshot(generateMockSnapshot());
    generateMockAlerts().forEach((alert) => pushAlert(alert));
    generateMockCommands().forEach((command) => pushCommand(command));

    // Simulate live updates every 2 seconds
    const interval = setInterval(() => {
      setSnapshot(generateMockSnapshot());
    }, 2000);

    return () => clearInterval(interval);
  }, [setSnapshot, pushAlert, pushCommand]);

  return null;
}
