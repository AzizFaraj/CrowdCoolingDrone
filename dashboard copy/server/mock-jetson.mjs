#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────────────
   Mock Jetson — simulates the Jetson-side WebRTC publisher.

   Connects to the signaling relay, registers as role "jetson",
   and responds to `webrtc:request-stream` by creating an
   RTCPeerConnection that sends a test video pattern.

   Usage:
     node server/mock-jetson.mjs

   Environment variables (all optional):
     RELAY_URL     – relay WebSocket URL   (default ws://localhost:8080/ws)
     DRONE_ID      – drone identifier      (default drone-01)
     AUTH_TOKEN    – relay auth token       (default empty)

   Requirements:
     npm install ws wrtc
     (wrtc provides the RTCPeerConnection API in Node.js)
   ────────────────────────────────────────────────────────────────────── */

import WebSocket from "ws";

let wrtc;
try {
  wrtc = await import("wrtc");
} catch {
  console.error(
    "[mock-jetson] ❌  Missing 'wrtc' package.\n" +
    "              Install it:  npm install wrtc\n" +
    "              (provides RTCPeerConnection for Node.js)\n\n" +
    "              NOTE: If wrtc fails to install on your platform,\n" +
    "              see the alternative test methods below the script."
  );
  process.exit(1);
}

const { RTCPeerConnection, MediaStream } = wrtc.default ?? wrtc;

const RELAY_URL = process.env.RELAY_URL ?? "ws://localhost:8080/ws";
const DRONE_ID  = process.env.DRONE_ID  ?? "drone-01";
const AUTH_TOKEN = process.env.AUTH_TOKEN ?? "";

/** @type {Map<string, RTCPeerConnection>} */
const peerConnections = new Map();

/* ── connect to relay ─────────────────────────────────────────────── */

function connect() {
  console.log(`[mock-jetson] Connecting to relay at ${RELAY_URL} ...`);
  const ws = new WebSocket(RELAY_URL);

  ws.on("open", () => {
    const reg = { type: "register", role: "jetson", droneId: DRONE_ID };
    if (AUTH_TOKEN) reg.token = AUTH_TOKEN;
    ws.send(JSON.stringify(reg));
    console.log("[mock-jetson] Sent registration");
  });

  ws.on("message", async (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    if (msg.type === "registered") {
      console.log(`[mock-jetson] ✅  Registered as jetson for ${msg.droneId}`);
      return;
    }

    if (msg.type === "relay:error") {
      console.error("[mock-jetson] Relay error:", msg.message);
      return;
    }

    /* ── handle dashboard signaling messages ──────────────────── */

    if (msg.type === "webrtc:request-stream") {
      console.log(`[mock-jetson] 📹  Stream requested for camera: ${msg.camera}`);
      await createOffer(ws, msg.camera);
      return;
    }

    if (msg.type === "webrtc:answer") {
      console.log(`[mock-jetson] Got answer for camera: ${msg.camera}`);
      const pc = peerConnections.get(msg.camera);
      if (pc) {
        await pc.setRemoteDescription({ type: "answer", sdp: msg.sdp });
        console.log("[mock-jetson] Remote description set");
      }
      return;
    }

    if (msg.type === "webrtc:ice-candidate") {
      const pc = peerConnections.get(msg.camera);
      if (pc && msg.candidate) {
        try {
          await pc.addIceCandidate(msg.candidate);
        } catch { /* ignore late candidates */ }
      }
      return;
    }

    if (msg.type === "webrtc:stop-stream") {
      console.log(`[mock-jetson] 🛑  Stop requested for camera: ${msg.camera}`);
      const pc = peerConnections.get(msg.camera);
      if (pc) {
        pc.close();
        peerConnections.delete(msg.camera);
      }
      return;
    }
  });

  ws.on("close", () => {
    console.log("[mock-jetson] Disconnected from relay. Reconnecting in 3s...");
    setTimeout(connect, 3000);
  });

  ws.on("error", (err) => {
    console.error("[mock-jetson] WS error:", err.message);
  });
}

/* ── create offer with a dummy video track ────────────────────────── */

async function createOffer(ws, camera) {
  // Close existing PC for this camera if any
  if (peerConnections.has(camera)) {
    peerConnections.get(camera).close();
  }

  const pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });
  peerConnections.set(camera, pc);

  // Forward ICE candidates to the dashboard
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      ws.send(JSON.stringify({
        type: "webrtc:ice-candidate",
        camera,
        candidate: event.candidate.toJSON(),
      }));
    }
  };

  pc.oniceconnectionstatechange = () => {
    console.log(`[mock-jetson] ICE state (${camera}): ${pc.iceConnectionState}`);
  };

  // Create a video source.  wrtc provides nonstandard-video-source
  // which generates a solid color pattern — good enough for testing.
  try {
    const source = new wrtc.nonstandard.RTCVideoSource();
    const track = source.createTrack();
    pc.addTrack(track);

    // Generate frames (320x240, 15 fps, cycling color)
    let hue = 0;
    const width = 320, height = 240;
    const frameInterval = setInterval(() => {
      if (pc.iceConnectionState === "closed" || pc.iceConnectionState === "failed") {
        clearInterval(frameInterval);
        return;
      }
      const frame = createColorFrame(width, height, hue);
      source.onFrame(frame);
      hue = (hue + 2) % 360;
    }, 1000 / 15);

    console.log("[mock-jetson] Added video track (color pattern 320×240 @ 15fps)");
  } catch (err) {
    console.warn("[mock-jetson] Could not create video source:", err.message);
    console.warn("[mock-jetson] Falling back to transceiver-only offer (no media)");
    pc.addTransceiver("video", { direction: "sendonly" });
  }

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  ws.send(JSON.stringify({
    type: "webrtc:offer",
    camera,
    sdp: offer.sdp,
  }));

  console.log(`[mock-jetson] Sent offer for camera: ${camera}`);
}

/* ── create a solid-color RGBA frame ──────────────────────────────── */

function createColorFrame(width, height, hue) {
  const [r, g, b] = hslToRgb(hue / 360, 0.8, 0.5);
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i]     = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = 255;
  }
  return { width, height, data };
}

function hslToRgb(h, s, l) {
  let r, g, b;
  if (s === 0) { r = g = b = l; }
  else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

/* ── start ────────────────────────────────────────────────────────── */
connect();
