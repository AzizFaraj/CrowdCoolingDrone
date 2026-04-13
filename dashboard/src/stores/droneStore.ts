import { create } from "zustand";

import type {
  AlertEvent,
  DroneSnapshot,
  HealthColor,
  MonitoringState,
  OperatorCommand,
} from "@/types/telemetry";

/* ──────────────────────────────────────────────────────────────────────
   Central client-side store.
   Uses Zustand for fine-grained subscriptions so individual dashboard
   widgets only re-render when their slice of state changes.
   ────────────────────────────────────────────────────────────────────── */

interface DroneStoreState {
  /** Latest full snapshot received from the server. */
  snapshot: DroneSnapshot | null;

  /** Rolling alert list, newest first. */
  alerts: AlertEvent[];

  /** Recent operator commands for the audit trail. */
  commands: OperatorCommand[];

  /** Derived convenience fields */
  linkState: MonitoringState;
  healthColor: HealthColor;

  /** Actions */
  setSnapshot: (snapshot: DroneSnapshot) => void;
  pushAlert: (alert: AlertEvent) => void;
  acknowledgeAlert: (alertId: string) => void;
  pushCommand: (command: OperatorCommand) => void;
  updateCommandStatus: (
    commandId: string,
    status: OperatorCommand["status"],
  ) => void;
  reset: () => void;
}

const INITIAL_STATE = {
  snapshot: null,
  alerts: [] as AlertEvent[],
  commands: [] as OperatorCommand[],
  linkState: "INIT" as MonitoringState,
  healthColor: "GREEN" as HealthColor,
};

export const useDroneStore = create<DroneStoreState>((set) => ({
  ...INITIAL_STATE,

  setSnapshot: (snapshot) =>
    set({
      snapshot,
      linkState: snapshot.link.state,
      healthColor: snapshot.health.overall,
    }),

  pushAlert: (alert) =>
    set((s) => ({ alerts: [alert, ...s.alerts].slice(0, 200) })),

  acknowledgeAlert: (alertId) =>
    set((s) => ({
      alerts: s.alerts.map((a) =>
        a.id === alertId ? { ...a, acknowledged: true } : a,
      ),
    })),

  pushCommand: (command) =>
    set((s) => ({ commands: [command, ...s.commands].slice(0, 100) })),

  updateCommandStatus: (commandId, status) =>
    set((s) => ({
      commands: s.commands.map((c) =>
        c.id === commandId ? { ...c, status } : c,
      ),
    })),

  reset: () => set(INITIAL_STATE),
}));
