import type { AlertEvent, DroneSnapshot, OperatorCommand } from "@/types/telemetry";

/* ──────────────────────────────────────────────────────────────────────
   Mock data generator for development and demo purposes.
   ────────────────────────────────────────────────────────────────────── */

export function generateMockSnapshot(): DroneSnapshot {
  return {
    droneId: "drone-01",
    timestamp: new Date().toISOString(),
    missionPhase: "IN_FLIGHT",
    overrideMode: "AUTONOMOUS",
    vehicle: {
      armed: true,
      flightMode: "AUTO_MISSION",
      lat: 26.3174,
      lng: 50.1438,
      altMeterAgl: 7.8,
      speedMps: 3.4,
      headingDeg: 121,
      batteryPct: 63,
      batteryVoltage: 22.4,
      batteryCurrent: 56.8,
      gpsFix: 3,
      satelliteCount: 12,
    },
    link: {
      state: "CONNECTED",
      rttMs: 284,
      packetLossPct: 0.7,
      lastHeartbeatMs: 220,
    },
    ai: {
      mode: "NEAREST_CROWD",
      crowdScore: 0.81,
      personCount: 36,
      decision: "MIST_ON",
      decisionReason: "cooling hotspot stable",
      inferenceMs: 94,
      decisionLatencyMs: 810,
      confidenceThreshold: 0.35,
    },
    payload: {
      waterLevelPct: 57,
      waterTempC: 21.4,
      sprayEnabled: true,
      flowEstLpm: 0.29,
      flowCommandLpm: 0.3,
      safeToSpray: true,
      refillState: "IDLE",
    },
    dock: {
      phase: "APPROACH",
      alignmentErrorCm: 2.3,
      confidence: 0.92,
      settleTimerSec: 0,
      retryCount: 0,
      abortReason: null,
    },
    health: {
      overall: "GREEN",
      activeAlerts: [],
    },
    compute: {
      cpuLoadPct: 42,
      gpuLoadPct: 68,
      memoryUsedPct: 51,
      cameraAvailable: true,
      cameraFps: 20,
      esp32Connected: true,
    },
  };
}

export function generateMockAlerts(): AlertEvent[] {
  return [
    {
      id: "alert-001",
      severity: "INFO",
      subsystem: "Navigation",
      message: "Mission started successfully",
      timestamp: new Date(Date.now() - 120000).toISOString(),
      acknowledged: true,
    },
    {
      id: "alert-002",
      severity: "WARNING",
      subsystem: "Communication",
      message: "RTT elevated above 250ms threshold",
      timestamp: new Date(Date.now() - 60000).toISOString(),
      acknowledged: false,
    },
  ];
}

export function generateMockCommands(): OperatorCommand[] {
  return [
    {
      id: "cmd-001",
      type: "START_MISSION",
      issuedAt: new Date(Date.now() - 180000).toISOString(),
      issuer: "operator@crowdcooling.local",
      status: "ACKED",
    },
    {
      id: "cmd-002",
      type: "SET_WAYPOINT_MODE",
      issuedAt: new Date(Date.now() - 90000).toISOString(),
      issuer: "operator@crowdcooling.local",
      status: "ACKED",
    },
  ];
}
