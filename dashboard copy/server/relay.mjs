#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────────────
   CrowdCooling Signaling Relay

   A minimal WebSocket relay that pairs a Jetson (publisher) with a
   dashboard (viewer) so they can exchange signaling and telemetry
   messages even when they are on completely different networks.

   Both endpoints connect to this relay and send a `register` message:

     { "type": "register", "role": "dashboard"|"jetson", "droneId": "drone-01" }

   The relay groups connections into "rooms" keyed by droneId and
   forwards every subsequent message to the other members of the same
   room.  That is all it does — it never inspects or transforms the
   payloads.

   Usage:
     RELAY_PORT=8080 RELAY_AUTH_TOKEN=secret node server/relay.mjs

   Environment variables:
     RELAY_PORT        – listen port          (default 8080)
     RELAY_AUTH_TOKEN  – optional shared token (empty = no auth)
   ────────────────────────────────────────────────────────────────────── */

import { WebSocketServer, WebSocket } from "ws";

const PORT = parseInt(process.env.RELAY_PORT ?? "8080", 10);
const AUTH_TOKEN = process.env.RELAY_AUTH_TOKEN ?? "";
const HEARTBEAT_INTERVAL_MS = 30_000;

/* ── room management ──────────────────────────────────────────────── */

/**
 * @typedef {{ ws: WebSocket, role: string, droneId: string }} Client
 */

/** @type {Map<string, Set<Client>>} */
const rooms = new Map();

function addToRoom(client) {
  if (!rooms.has(client.droneId)) rooms.set(client.droneId, new Set());
  rooms.get(client.droneId).add(client);
}

function removeFromRoom(client) {
  const room = rooms.get(client.droneId);
  if (!room) return;
  room.delete(client);
  if (room.size === 0) rooms.delete(client.droneId);
}

function forwardToRoom(sender, raw) {
  const room = rooms.get(sender.droneId);
  if (!room) return;
  for (const peer of room) {
    if (peer !== sender && peer.ws.readyState === WebSocket.OPEN) {
      peer.ws.send(raw);
    }
  }
}

/* ── server ───────────────────────────────────────────────────────── */

const wss = new WebSocketServer({ port: PORT, path: "/ws" });

wss.on("connection", (ws) => {
  /** @type {Client | null} */
  let client = null;
  let alive = true;

  /* WebSocket-level keepalive (ping/pong). */
  const heartbeat = setInterval(() => {
    if (!alive) {
      ws.terminate();
      return;
    }
    alive = false;
    ws.ping();
  }, HEARTBEAT_INTERVAL_MS);

  ws.on("pong", () => {
    alive = true;
  });

  ws.on("message", (raw) => {
    /** @type {string} */
    const text = raw.toString();
    let msg;
    try {
      msg = JSON.parse(text);
    } catch {
      return; // ignore malformed
    }

    /* ── registration ─────────────────────────────────────────── */
    if (msg.type === "register") {
      if (AUTH_TOKEN && msg.token !== AUTH_TOKEN) {
        ws.send(JSON.stringify({ type: "relay:error", message: "unauthorized" }));
        ws.close(4001, "unauthorized");
        return;
      }

      const { role, droneId } = msg;
      if (!role || !droneId) {
        ws.send(JSON.stringify({ type: "relay:error", message: "missing role or droneId" }));
        return;
      }

      // If already registered, remove from old room first.
      if (client) removeFromRoom(client);

      client = { ws, role, droneId };
      addToRoom(client);

      ws.send(JSON.stringify({ type: "registered", droneId, role }));
      console.log(`[relay] ${role} registered for ${droneId}  (room size: ${rooms.get(droneId)?.size ?? 0})`);
      return;
    }

    /* ── forward everything else ──────────────────────────────── */
    if (client) {
      forwardToRoom(client, text);
    }
  });

  ws.on("close", () => {
    clearInterval(heartbeat);
    if (client) {
      const { role, droneId } = client;
      removeFromRoom(client);
      console.log(`[relay] ${role} disconnected from ${droneId}`);
    }
  });

  ws.on("error", (err) => {
    console.error("[relay] socket error:", err.message);
  });
});

console.log(`[relay] CrowdCooling signaling relay listening on ws://0.0.0.0:${PORT}/ws`);
if (AUTH_TOKEN) console.log("[relay] Authentication enabled");
