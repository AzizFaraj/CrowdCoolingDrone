import { API_BASE_URL } from "@/lib/constants";

/* ──────────────────────────────────────────────────────────────────────
   Thin REST API client.
   Skeleton – implementations will be fleshed out once the Node.js
   backend is running.
   ────────────────────────────────────────────────────────────────────── */

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

/* ── Drone ───────────────────────────────────────────────────────────── */

export const getDrones = () => request("/drones");
export const getDroneState = (id: string) => request(`/drones/${id}/state`);

/* ── Missions ────────────────────────────────────────────────────────── */

export const getMissions = () => request("/missions");
export const createMission = (body: unknown) =>
  request("/missions", { method: "POST", body: JSON.stringify(body) });
export const startMission = (id: string) =>
  request(`/missions/${id}/start`, { method: "POST" });
export const pauseMission = (id: string) =>
  request(`/missions/${id}/pause`, { method: "POST" });
export const returnToHome = (id: string) =>
  request(`/missions/${id}/rth`, { method: "POST" });

/* ── Alerts ──────────────────────────────────────────────────────────── */

export const getAlerts = () => request("/alerts");
export const acknowledgeAlert = (id: string) =>
  request(`/alerts/${id}/ack`, { method: "POST" });

/* ── Reports ─────────────────────────────────────────────────────────── */

export const getMissionReport = (id: string) =>
  request(`/missions/${id}/report`);
