/* ──────────────────────────────────────────────────────────────────────
   Shared WebSocket manager — singleton.

   Both the telemetry hook and the WebRTC signaling hook share ONE
   WebSocket connection.  A reference-counting mechanism ensures the
   socket stays open as long as at least one consumer needs it and
   cleanly closes when the last one releases.

   Supports two signaling modes (set via NEXT_PUBLIC_SIGNALING_MODE):

     direct  — browser connects straight to the Jetson's WebSocket
               (both on the same LAN or via VPN).

     relay   — both Jetson and browser connect to a public relay
               server.  On connect the manager sends a `register`
               message with the drone ID and role.  The relay pairs
               the two endpoints and forwards messages between them.
               This is the mode required when the two sides sit on
               completely different networks (4G ↔ campus Wi-Fi).

   An outbound message queue ensures that messages sent during brief
   disconnections are not silently lost.  They are flushed once the
   socket is (re-)opened and — in relay mode — registered.

   Reconnection uses capped exponential back-off so the dashboard
   recovers automatically after 4G drops.
   ────────────────────────────────────────────────────────────────────── */

import {
  DRONE_ID,
  HEARTBEAT_INTERVAL_MS,
  RELAY_AUTH_TOKEN,
  SIGNALING_MODE,
  WS_MESSAGE_QUEUE_MAX,
  WS_RECONNECT_BASE_MS,
  WS_RECONNECT_MAX_MS,
  WS_URL,
} from "@/lib/constants";

export type ConnectionStatus = "connecting" | "open" | "closed" | "error";

type MessageHandler = (data: Record<string, unknown>) => void;
type StatusHandler = (status: ConnectionStatus) => void;

/* ── module-level state (client-only) ──────────────────────────────── */

let ws: WebSocket | null = null;
let currentUrl = "";
let refCount = 0;

const messageHandlers = new Set<MessageHandler>();
const statusHandlers = new Set<StatusHandler>();

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempt = 0;
let currentStatus: ConnectionStatus = "closed";

/** True once the relay has acknowledged our `register` message. */
let relayRegistered = false;

/** Outbound messages queued while the socket is down or not yet registered. */
const outboundQueue: string[] = [];

/* ── internal helpers ──────────────────────────────────────────────── */

function broadcast(status: ConnectionStatus) {
  currentStatus = status;
  statusHandlers.forEach((h) => h(status));
}

function clearTimers() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

/** Push a raw JSON string into the queue, enforcing the max size. */
function enqueue(raw: string) {
  if (outboundQueue.length >= WS_MESSAGE_QUEUE_MAX) {
    outboundQueue.shift(); // drop oldest
  }
  outboundQueue.push(raw);
}

/** Flush all queued messages through the open socket. */
function flushQueue() {
  while (outboundQueue.length > 0 && ws?.readyState === WebSocket.OPEN) {
    ws.send(outboundQueue.shift()!);
  }
}

/** True when we are ready to relay application messages. */
function isReady(): boolean {
  if (ws?.readyState !== WebSocket.OPEN) return false;
  return SIGNALING_MODE === "direct" || relayRegistered;
}

function scheduleReconnect() {
  if (reconnectTimer || refCount <= 0) return;

  const delay = Math.min(
    WS_RECONNECT_BASE_MS * 2 ** reconnectAttempt,
    WS_RECONNECT_MAX_MS,
  );
  reconnectAttempt++;

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    openSocket(currentUrl);
  }, delay);
}

function startHeartbeat(socket: WebSocket) {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(() => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "HEARTBEAT" }));
    }
  }, HEARTBEAT_INTERVAL_MS);
}

/** Enter the "ready" state — broadcast open, flush the queue, start heartbeat. */
function becomeReady(socket: WebSocket) {
  reconnectAttempt = 0;
  broadcast("open");
  flushQueue();
  startHeartbeat(socket);
}

function openSocket(url: string) {
  if (
    ws?.readyState === WebSocket.OPEN ||
    ws?.readyState === WebSocket.CONNECTING
  ) {
    return;
  }

  currentUrl = url;
  relayRegistered = false;
  broadcast("connecting");

  const socket = new WebSocket(url);
  ws = socket;

  socket.onopen = () => {
    if (SIGNALING_MODE === "relay") {
      /* In relay mode we must register before doing anything else.
         The relay will respond with { type: "registered" }.         */
      const registration: Record<string, unknown> = {
        type: "register",
        role: "dashboard",
        droneId: DRONE_ID,
      };
      if (RELAY_AUTH_TOKEN) registration.token = RELAY_AUTH_TOKEN;
      socket.send(JSON.stringify(registration));
      /* Do NOT broadcast "open" yet — wait for the registration ack. */
    } else {
      /* Direct mode — ready immediately. */
      becomeReady(socket);
    }
  };

  socket.onmessage = (event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data as string) as Record<string, unknown>;

      /* Relay control messages — consumed here, never forwarded. */
      if (data.type === "registered") {
        relayRegistered = true;
        becomeReady(socket);
        return;
      }
      if (data.type === "relay:error") {
        console.error("[wsManager] relay error:", data.message);
        return;
      }

      messageHandlers.forEach((h) => h(data));
    } catch {
      /* ignore malformed frames */
    }
  };

  socket.onerror = () => broadcast("error");

  socket.onclose = () => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    ws = null;
    relayRegistered = false;
    broadcast("closed");
    scheduleReconnect();
  };
}

function disconnect() {
  clearTimers();
  reconnectAttempt = 0;
  relayRegistered = false;
  outboundQueue.length = 0;
  ws?.close();
  ws = null;
}

/* ── public API ────────────────────────────────────────────────────── */

export const wsManager = {
  /**
   * Acquire a reference.  The socket connects on the first acquire and
   * stays open until the last consumer releases.
   */
  acquire(url: string = WS_URL): void {
    refCount++;
    if (refCount === 1) openSocket(url);
  },

  /** Release a reference.  Disconnects when the last consumer releases. */
  release(): void {
    refCount = Math.max(0, refCount - 1);
    if (refCount === 0) disconnect();
  },

  /**
   * Send a JSON-serialisable message.
   * If the socket is ready the message is sent immediately; otherwise
   * it is queued and flushed once the connection is (re-)established.
   */
  send(msg: object): void {
    const raw = JSON.stringify(msg);
    if (isReady()) {
      ws!.send(raw);
    } else {
      enqueue(raw);
    }
  },

  /**
   * Send a message only if the socket is ready right now.
   * Returns `true` if the message was sent, `false` otherwise.
   * Use this for best-effort messages like heartbeats that should
   * NOT be queued (stale heartbeats are useless).
   */
  sendImmediate(msg: object): boolean {
    if (!isReady()) return false;
    ws!.send(JSON.stringify(msg));
    return true;
  },

  /** Subscribe to all incoming parsed messages.  Returns an unsubscribe function. */
  onMessage(handler: MessageHandler): () => void {
    messageHandlers.add(handler);
    return () => {
      messageHandlers.delete(handler);
    };
  },

  /** Subscribe to connection-status changes.  Fires immediately with the current status. */
  onStatus(handler: StatusHandler): () => void {
    statusHandlers.add(handler);
    handler(currentStatus);
    return () => {
      statusHandlers.delete(handler);
    };
  },

  /** Current connection status. */
  get status(): ConnectionStatus {
    return currentStatus;
  },

  /** True when the underlying WebSocket is ready for application messages. */
  get isOpen(): boolean {
    return isReady();
  },
} as const;
