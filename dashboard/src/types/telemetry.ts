/* ──────────────────────────────────────────────────────────────────────
   Normalized telemetry types shared by the dashboard frontend.
   These mirror the canonical state objects defined in the architecture
   document (dashboard_architecture.md §Real-Time Data Model).
   ────────────────────────────────────────────────────────────────────── */

/* ── Enums / Unions ─────────────────────────────────────────────────── */

export type MonitoringState = "INIT" | "CONNECTED" | "DEGRADED" | "LOST";
export type HealthColor = "GREEN" | "YELLOW" | "RED";
export type OverrideMode = "AUTONOMOUS" | "OVERRIDDEN" | "SAFE_MODE";
export type MissionPhase =
  | "IDLE"
  | "PREFLIGHT"
  | "ARMED"
  | "IN_FLIGHT"
  | "DOCKING"
  | "REFILLING"
  | "RETURNING"
  | "LANDING"
  | "COMPLETED"
  | "ABORTED";

export type AIDecision =
  | "MIST_ON"
  | "MIST_OFF"
  | "CONTINUE_SCAN"
  | "REDIRECT"
  | "RETURN"
  | "HOLD";

export type WaypointMode = "NEAREST_CROWD" | "CONCENTRIC";

export type DockingPhase =
  | "APPROACH"
  | "ALIGN"
  | "LANDING_DETECTED"
  | "SETTLING"
  | "VERIFICATION"
  | "REFILL_AUTHORIZED"
  | "REFILL_ACTIVE"
  | "REFILL_COMPLETE"
  | "LAUNCH_READY"
  | "RETRY"
  | "ABORT";

export type AlertSeverity = "INFO" | "WARNING" | "CRITICAL";

/* ── Sub-objects ─────────────────────────────────────────────────────── */

export interface VehicleState {
  armed: boolean;
  flightMode: string;
  lat: number;
  lng: number;
  altMeterAgl: number;
  speedMps: number;
  headingDeg: number;
  batteryPct: number;
  batteryVoltage: number;
  batteryCurrent: number;
  gpsFix: number;
  satelliteCount: number;
}

export interface LinkState {
  state: MonitoringState;
  rttMs: number;
  packetLossPct: number;
  lastHeartbeatMs: number;
}

export interface AIState {
  mode: WaypointMode;
  crowdScore: number;
  personCount: number;
  decision: AIDecision;
  decisionReason: string;
  inferenceMs: number;
  decisionLatencyMs: number;
  confidenceThreshold: number;
}

export interface PayloadState {
  waterLevelPct: number;
  waterTempC: number;
  sprayEnabled: boolean;
  flowEstLpm: number;
  flowCommandLpm: number;
  safeToSpray: boolean;
  refillState: "IDLE" | "REQUESTED" | "AVAILABLE" | "IN_PROGRESS" | "COMPLETED";
}

export interface DockState {
  phase: DockingPhase;
  alignmentErrorCm: number;
  confidence: number;
  settleTimerSec: number;
  retryCount: number;
  abortReason: string | null;
}

export interface HealthState {
  overall: HealthColor;
  activeAlerts: string[];
}

export interface ComputeHealth {
  cpuLoadPct: number;
  gpuLoadPct: number;
  memoryUsedPct: number;
  cameraAvailable: boolean;
  cameraFps: number;
  esp32Connected: boolean;
}

/* ── Alert Event ─────────────────────────────────────────────────────── */

export interface AlertEvent {
  id: string;
  severity: AlertSeverity;
  subsystem: string;
  message: string;
  timestamp: string;
  acknowledged: boolean;
}

/* ── Operator Command ────────────────────────────────────────────────── */

export interface OperatorCommand {
  id: string;
  type: string;
  issuedAt: string;
  issuer: string;
  status: "PENDING" | "ACKED" | "REJECTED" | "TIMEOUT";
}

/* ── Top-level Drone Snapshot ────────────────────────────────────────── */

export interface DroneSnapshot {
  droneId: string;
  timestamp: string;
  missionPhase: MissionPhase;
  overrideMode: OverrideMode;
  vehicle: VehicleState;
  link: LinkState;
  ai: AIState;
  payload: PayloadState;
  dock: DockState;
  health: HealthState;
  compute: ComputeHealth;
}
