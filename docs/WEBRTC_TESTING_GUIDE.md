# WebRTC Cross-Network Video Streaming — Testing Guide

**Project:** CrowdCooling Drone GCS  
**Component:** Dashboard ↔ Jetson WebRTC video pipeline  
**Date:** April 2026  
**Authors:** CrowdCooling Team

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture Under Test](#2-architecture-under-test)
3. [Prerequisites](#3-prerequisites)
4. [Environment Setup](#4-environment-setup)
5. [Test Cases](#5-test-cases)
   - [TC-01: Relay Server Startup](#tc-01-relay-server-startup)
   - [TC-02: Jetson Bridge — Direct Mode](#tc-02-jetson-bridge--direct-mode)
   - [TC-03: Jetson Bridge — Relay Mode Registration](#tc-03-jetson-bridge--relay-mode-registration)
   - [TC-04: End-to-End — Direct Mode (Same LAN)](#tc-04-end-to-end--direct-mode-same-lan)
   - [TC-05: End-to-End — Relay Mode (Cross-Network)](#tc-05-end-to-end--relay-mode-cross-network)
   - [TC-06: Camera Switching](#tc-06-camera-switching)
   - [TC-07: Start / Stop Stream Toggle](#tc-07-start--stop-stream-toggle)
   - [TC-08: Auto-Reconnect on ICE Failure](#tc-08-auto-reconnect-on-ice-failure)
   - [TC-09: Auto-Reconnect on WebSocket Drop](#tc-09-auto-reconnect-on-websocket-drop)
   - [TC-10: Message Queue During Disconnection](#tc-10-message-queue-during-disconnection)
   - [TC-11: TURN Relay Fallback](#tc-11-turn-relay-fallback)
   - [TC-12: Forced TURN Mode](#tc-12-forced-turn-mode)
   - [TC-13: Stream Stats Accuracy](#tc-13-stream-stats-accuracy)
   - [TC-14: ICE Transport Type Visibility](#tc-14-ice-transport-type-visibility)
   - [TC-15: Relay Authentication](#tc-15-relay-authentication)
   - [TC-16: Multiple Rapid Start/Stop Cycles](#tc-16-multiple-rapid-startstop-cycles)
   - [TC-17: Page Navigation and Cleanup](#tc-17-page-navigation-and-cleanup)
   - [TC-18: H.264 Codec Preference](#tc-18-h264-codec-preference)
   - [TC-19: Long-Running Stream Stability](#tc-19-long-running-stream-stability)
   - [TC-20: Concurrent Dashboard Instances](#tc-20-concurrent-dashboard-instances)
6. [Environment Variable Reference](#6-environment-variable-reference)
7. [Troubleshooting](#7-troubleshooting)

---

## 1. Overview

This document provides a comprehensive testing plan for the WebRTC video streaming subsystem of the CrowdCooling GCS dashboard. It covers both **direct mode** (same-LAN) and **relay mode** (cross-network) connectivity between the Jetson Orin Nano and the browser-based dashboard.

The testing validates:

- **Signaling**: WebSocket message exchange (request-stream → offer → answer → ICE candidates)
- **Media**: Live H.264 video from IMX477 cameras via WebRTC
- **Resilience**: Auto-reconnect, message queueing, TURN fallback
- **UI**: Stream stats, transport type display, reconnect indicators

---

## 2. Architecture Under Test

```
┌──────────────────────┐                                    ┌────────────────────────┐
│  Jetson Orin Nano     │                                    │  Browser Dashboard     │
│                       │                                    │                        │
│  deploy/              │         Signaling (JSON)           │  dashboard copy/       │
│    webrtc_bridge.py   │◄──────────────────────────────────►│    useWebRTCStream.ts  │
│                       │         via WebSocket               │    wsManager.ts        │
│  IMX477 cameras ×2    │                                    │    Vision page          │
│  GStreamer + NVENC    │         Media (SRTP/H.264)         │    VideoFeed component │
│                       │◄──────────────────────────────────►│    RTCPeerConnection   │
└──────────────────────┘                                    └────────────────────────┘
                                        │
                          ┌─────────────┴──────────────┐
                          │  Optional: Signaling Relay  │
                          │  server/relay.mjs            │
                          │  (cross-network only)        │
                          └────────────────────────────┘
```

**Components:**

| Component | Location | Role |
|-----------|----------|------|
| Signaling relay | `dashboard copy/server/relay.mjs` | Forwards WebSocket messages between Jetson and dashboard (relay mode only) |
| Jetson bridge | `deploy/webrtc_bridge.py` | Handles signaling, captures camera video, publishes via WebRTC |
| Dashboard app | `dashboard copy/` (Next.js) | Receives video, displays stats, provides controls |

---

## 3. Prerequisites

### 3.1 Jetson Orin Nano

```bash
# Python dependencies
pip install aiortc websockets opencv-python aiohttp

# Verify camera access
gst-launch-1.0 nvarguscamerasrc sensor-id=0 ! \
  'video/x-raw(memory:NVMM),width=1280,height=720,framerate=30/1' ! \
  nvvidconv ! autovideosink

# Verify second camera (if available)
gst-launch-1.0 nvarguscamerasrc sensor-id=1 ! \
  'video/x-raw(memory:NVMM),width=1280,height=720,framerate=30/1' ! \
  nvvidconv ! autovideosink
```

### 3.2 Dashboard Machine (Mac / PC)

```bash
cd "dashboard copy"

# Install Node.js dependencies (includes ws for relay)
npm install

# Verify build compiles
npm run build
```

### 3.3 Network Requirements

| Test Type | Network Requirement |
|-----------|-------------------|
| Direct mode | Jetson and Mac on the **same LAN** (Wi-Fi or Ethernet) |
| Relay mode (local) | Both on same machine or LAN (relay runs locally for testing) |
| Relay mode (cross-network) | Relay on a public server; Jetson on 4G, Mac on campus Wi-Fi |
| TURN tests | A TURN server accessible from both sides (e.g. coturn or Metered.ca) |

---

## 4. Environment Setup

### 4.1 Dashboard `.env.local`

Create `dashboard copy/.env.local`:

#### For Direct Mode (same LAN):
```bash
NEXT_PUBLIC_DATA_SOURCE=live
NEXT_PUBLIC_SIGNALING_MODE=direct
NEXT_PUBLIC_WS_URL=ws://<JETSON_LAN_IP>:8080
NEXT_PUBLIC_DRONE_ID=drone-01
NEXT_PUBLIC_RELAY_AUTH_TOKEN=
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001/api
NEXT_PUBLIC_STUN_URLS=stun:stun.l.google.com:19302
NEXT_PUBLIC_TURN_URLS=
NEXT_PUBLIC_TURN_USERNAME=
NEXT_PUBLIC_TURN_CREDENTIAL=
NEXT_PUBLIC_FORCE_TURN=false
```

#### For Relay Mode (cross-network):
```bash
NEXT_PUBLIC_DATA_SOURCE=live
NEXT_PUBLIC_SIGNALING_MODE=relay
NEXT_PUBLIC_WS_URL=ws://<RELAY_HOST>:8080/ws
NEXT_PUBLIC_DRONE_ID=drone-01
NEXT_PUBLIC_RELAY_AUTH_TOKEN=
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001/api
NEXT_PUBLIC_STUN_URLS=stun:stun.l.google.com:19302
NEXT_PUBLIC_TURN_URLS=turn:<TURN_SERVER>:3478?transport=udp,turn:<TURN_SERVER>:3478?transport=tcp
NEXT_PUBLIC_TURN_USERNAME=<TURN_USER>
NEXT_PUBLIC_TURN_CREDENTIAL=<TURN_PASS>
NEXT_PUBLIC_FORCE_TURN=false
```

> **Important:** Replace all `<PLACEHOLDER>` values with your actual IPs, hostnames, and credentials.

### 4.2 Camera Device Mapping

Edit `deploy/webrtc_bridge.py` line 110 if your cameras differ from defaults:

```python
CAMERA_MAP = {
    "top-down": 0,   # CSI camera 0 (nvarguscamerasrc sensor-id=0)
    "side-view": 1,  # CSI camera 1 (nvarguscamerasrc sensor-id=1)
}
```

For USB cameras, use device paths: `"top-down": "/dev/video0"`.

---

## 5. Test Cases

---

### TC-01: Relay Server Startup

**Objective:** Verify the signaling relay server starts and listens correctly.

**Preconditions:** Node.js installed, `npm install` completed in `dashboard copy/`.

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run `npm run relay` in `dashboard copy/` | Terminal prints: `[relay] CrowdCooling signaling relay listening on ws://0.0.0.0:8080/ws` |
| 2 | Run `RELAY_PORT=9090 npm run relay` | Listens on port 9090 instead |
| 3 | Run `RELAY_AUTH_TOKEN=secret npm run relay` | Terminal also prints: `[relay] Authentication enabled` |

**Pass Criteria:** Relay starts without errors and prints the expected log lines.

---

### TC-02: Jetson Bridge — Direct Mode

**Objective:** Verify the Jetson bridge starts in direct mode and opens cameras.

**Preconditions:** Jetson with cameras connected, Python deps installed.

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | On Jetson: `python deploy/webrtc_bridge.py --direct --port 8080` | Prints: `Direct mode — listening on ws://0.0.0.0:8080` |
| 2 | Observe terminal for errors | No camera-related errors at startup (cameras are opened on-demand) |

**Pass Criteria:** Bridge starts and listens without errors.

---

### TC-03: Jetson Bridge — Relay Mode Registration

**Objective:** Verify the Jetson bridge connects to the relay and registers successfully.

**Preconditions:** Relay server running (TC-01).

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Start relay: `npm run relay` (on Mac) | Relay listening |
| 2 | On Jetson: `python deploy/webrtc_bridge.py --relay-url ws://<MAC_IP>:8080/ws --drone-id drone-01` | Jetson prints: `✅ Registered as jetson for drone-01` |
| 3 | Check relay terminal | Relay prints: `[relay] jetson registered for drone-01 (room size: 1)` |

**Pass Criteria:** Both terminals confirm successful registration.

---

### TC-04: End-to-End — Direct Mode (Same LAN)

**Objective:** Full video streaming from Jetson camera to dashboard on the same network.

**Preconditions:** Jetson and Mac on same LAN, dashboard `.env.local` set to `direct` mode pointing at Jetson IP.

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | On Jetson: `python deploy/webrtc_bridge.py --direct --port 8080` | Bridge listening |
| 2 | On Mac: `cd "dashboard copy" && npm run dev` | Dashboard running at `http://localhost:3000` |
| 3 | Open `http://localhost:3000/vision` in browser | Vision page loads, status badge shows "idle" |
| 4 | Click **Start Stream** | Status transitions: idle → signaling → connecting → **connected** (green) |
| 5 | Observe video element | **Live camera feed visible** from Jetson's top-down camera |
| 6 | Check Jetson terminal | Logs: `📹 Stream requested: top-down`, `Sent offer`, `ICE state: connected` |
| 7 | Check metric cards below video | RTT, FPS, Resolution, Codec, Bitrate all populated with non-zero values |
| 8 | Click **Stop Stream** | Video disappears, status returns to "idle", Jetson logs `Stopped camera: top-down` |

**Pass Criteria:** Live video displayed, all metric cards populated, clean start/stop lifecycle.

---

### TC-05: End-to-End — Relay Mode (Cross-Network)

**Objective:** Video streaming when Jetson and dashboard are on different networks.

**Preconditions:**
- Relay server running on a **publicly accessible** host (or use `ngrok` to tunnel local relay)
- Jetson on 4G/cellular or different Wi-Fi
- Dashboard `.env.local` set to `relay` mode
- TURN server configured (required if both behind NAT)

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Start relay on public host: `RELAY_PORT=8080 node server/relay.mjs` | Relay listening |
| 2 | On Jetson: `python deploy/webrtc_bridge.py --relay-url wss://<RELAY_HOST>/ws --drone-id drone-01` | `✅ Registered as jetson for drone-01` |
| 3 | Set `.env.local`: `NEXT_PUBLIC_SIGNALING_MODE=relay`, `NEXT_PUBLIC_WS_URL=wss://<RELAY_HOST>/ws` | — |
| 4 | On Mac: `npm run dev` → Open `/vision` | Dashboard loads |
| 5 | Click **Start Stream** | Relay logs show both `jetson registered` and `dashboard registered`, then signaling messages forwarded |
| 6 | Observe video | **Live video visible** (may take 2-5s longer than direct due to NAT traversal) |
| 7 | Check **Transport** card | Shows `srflx` (STUN) or `relay` (TURN) — **not** `host` |

**Pass Criteria:** Video streams across different networks. Transport type reflects indirect connectivity.

---

### TC-06: Camera Switching

**Objective:** Verify switching between top-down and side-view cameras works cleanly.

**Preconditions:** Streaming established (TC-04 or TC-05 completed successfully).

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | While stream is connected, click **Side-View** toggle | Status transitions: connected → idle → signaling → connecting → **connected** |
| 2 | Observe video | Feed changes to side-view camera |
| 3 | Jetson terminal | Logs `Stopped camera: top-down` then `📹 Stream requested: side-view`, `Sent offer` |
| 4 | Click **Top-Down** toggle | Feed switches back to top-down camera within 1-3 seconds |
| 5 | Rapidly toggle 5 times | No crashes, no stale connections, final state is "connected" |

**Pass Criteria:** Clean camera switches, no resource leaks, no stale peer connections.

---

### TC-07: Start / Stop Stream Toggle

**Objective:** Verify repeated start/stop cycles work without leaking resources.

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click **Start Stream** | Status → connected, video visible |
| 2 | Click **Stop Stream** | Status → idle, video element shows "No video signal" |
| 3 | Click **Start Stream** again | Status → connected, video visible again |
| 4 | Repeat 5× | Every cycle succeeds, no browser console errors |
| 5 | Open browser DevTools → Performance → Memory | No monotonic increase in memory (no MediaStream leaks) |

**Pass Criteria:** All cycles succeed, no memory leaks, no console errors.

---

### TC-08: Auto-Reconnect on ICE Failure

**Objective:** Verify the dashboard auto-reconnects when the WebRTC ICE connection fails.

**Preconditions:** Stream connected (TC-04 or TC-05).

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | While streaming, **kill the Jetson bridge process** (Ctrl+C) | Dashboard: video freezes, status changes to "connecting" |
| 2 | Observe the status bar | Shows `Reconnecting (1/5)` in amber text |
| 3 | Wait ~2 seconds | Counter increments to `Reconnecting (2/5)` |
| 4 | **Restart the Jetson bridge** before attempt 5 | Dashboard auto-reconnects: status → signaling → connecting → **connected** |
| 5 | Check reconnect counter | Resets to 0 after successful reconnection |
| 6 | Kill bridge and do **NOT** restart within 5 attempts | After attempt 5, status → **failed** (red badge), reconnect stops |

**Pass Criteria:** Auto-reconnect fires with increasing delay, recovers when bridge returns, gives up after max retries.

---

### TC-09: Auto-Reconnect on WebSocket Drop

**Objective:** Verify the WebSocket manager reconnects after a network interruption.

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Start streaming in relay mode | Connected |
| 2 | **Kill the relay server** (Ctrl+C) | Dashboard status → "closed" or "connecting" |
| 3 | Observe dashboard console logs | wsManager attempts reconnection with exponential backoff |
| 4 | **Restart relay** within 30 seconds | wsManager reconnects, re-registers with relay |
| 5 | Click **Start Stream** (or observe auto-reconnect) | Video stream resumes |

**Pass Criteria:** WebSocket reconnects transparently after relay restarts.

---

### TC-10: Message Queue During Disconnection

**Objective:** Verify signaling messages sent during brief disconnections are queued and delivered.

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Start relay and Jetson bridge | Both registered |
| 2 | Start dashboard dev server | — |
| 3 | Open DevTools Network tab, filter by "ws" | Observe WebSocket frames |
| 4 | **Kill relay**, immediately click **Start Stream** | `request-stream` message is queued (not lost) |
| 5 | **Restart relay** within a few seconds | wsManager reconnects, flushes queue; Jetson receives `request-stream` |
| 6 | Observe Jetson terminal | Logs `📹 Stream requested` after relay restart |

**Pass Criteria:** The `request-stream` message survives the brief disconnection via the outbound queue.

---

### TC-11: TURN Relay Fallback

**Objective:** Verify that media falls back to TURN when direct P2P fails.

**Preconditions:** TURN server configured, both sides behind NAT.

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Configure `.env.local` with valid TURN credentials | — |
| 2 | Put Jetson on cellular (4G) and Mac on campus Wi-Fi | Symmetric NAT on at least one side |
| 3 | Start relay + bridge + dashboard | — |
| 4 | Click **Start Stream** | Video connects (may take 3-8 seconds) |
| 5 | Check **Transport** metric card | Shows `relay` |
| 6 | Check **RTT** metric card | Higher than direct mode (typically 50-200ms additional) |

**Pass Criteria:** Video streams via TURN relay. Transport card shows `relay`.

---

### TC-12: Forced TURN Mode

**Objective:** Verify `NEXT_PUBLIC_FORCE_TURN=true` blocks all non-relay ICE candidates.

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Set `.env.local`: `NEXT_PUBLIC_FORCE_TURN=true` with valid TURN credentials | — |
| 2 | Start streaming on **same LAN** (where direct P2P would normally work) | Video still connects |
| 3 | Check **Transport** card | Shows `relay` (not `host` or `srflx`) |
| 4 | Set `NEXT_PUBLIC_FORCE_TURN=true` **without** TURN credentials | — |
| 5 | Click Start Stream | Connection **fails** (no relay candidates available), status → "failed" |

**Pass Criteria:** Force-TURN overrides P2P. Without valid TURN creds, connection correctly fails.

---

### TC-13: Stream Stats Accuracy

**Objective:** Verify all 10 metric cards display correct real-time data.

**Preconditions:** Stream connected.

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Check **Resolution** card | Matches camera resolution (e.g. 1280×720) |
| 2 | Check **Stream FPS** card | Shows value close to 30 (±5) |
| 3 | Check **Codec** card | Shows `H264` (preferred) or `VP8` (fallback) |
| 4 | Check **Bitrate** card | Non-zero, typically 500-3000 kbps |
| 5 | Check **Stream RTT** card | Non-zero; < 100ms on LAN, < 500ms on 4G |
| 6 | Check **Jitter** card | Small value (typically < 0.05s) |
| 7 | Check **Packet Loss** card | 0% under good conditions |
| 8 | Check **Packets Recv** card | Incrementing over time |
| 9 | Check **Packets Lost** card | 0 under good conditions |
| 10 | Check **Transport** card | `host`, `srflx`, or `relay` depending on network |
| 11 | Wait 10 seconds | All values update at least 4 times (2s polling interval) |

**Pass Criteria:** All 10 cards show reasonable, updating values.

---

### TC-14: ICE Transport Type Visibility

**Objective:** Verify the Transport card correctly reflects the ICE candidate type in use.

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Test on same LAN (direct mode) | Transport = `host` |
| 2 | Test across networks with STUN only | Transport = `srflx` |
| 3 | Test with `NEXT_PUBLIC_FORCE_TURN=true` | Transport = `relay` |
| 4 | Check Transport card color | `host`/`srflx` = default, `relay` = **yellow** warning |

**Pass Criteria:** Transport type matches the expected ICE path for each network condition.

---

### TC-15: Relay Authentication

**Objective:** Verify the relay rejects unauthorized connections.

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Start relay: `RELAY_AUTH_TOKEN=secret npm run relay` | Auth enabled |
| 2 | Start Jetson bridge **without** auth token | Relay logs: `unauthorized`, bridge gets disconnected (code 4001) |
| 3 | Start Jetson bridge **with** correct token: `--auth-token secret` | `✅ Registered as jetson for drone-01` |
| 4 | Set dashboard `.env.local`: `NEXT_PUBLIC_RELAY_AUTH_TOKEN=wrong-token` | Dashboard wsManager stays in "connecting" (relay rejects) |
| 5 | Fix to `NEXT_PUBLIC_RELAY_AUTH_TOKEN=secret`, restart dashboard | Dashboard connects and registers successfully |

**Pass Criteria:** Invalid tokens are rejected, valid tokens are accepted.

---

### TC-16: Multiple Rapid Start/Stop Cycles

**Objective:** Stress-test the connection lifecycle for race conditions.

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Rapidly click Start → Stop → Start → Stop (10 times in ~5 seconds) | No crashes, no browser console errors |
| 2 | After the flurry, click Start once more | Stream connects normally |
| 3 | Check Jetson terminal | No stale peer connections, logs show clean create/close cycles |
| 4 | Open browser DevTools → Console | No `RTCPeerConnection` or `InvalidStateError` errors |

**Pass Criteria:** No race conditions, no orphaned connections, final state is clean.

---

### TC-17: Page Navigation and Cleanup

**Objective:** Verify resources are cleaned up when navigating away from the Vision page.

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Start streaming on `/vision` | Connected |
| 2 | Navigate to another page (e.g. `/telemetry`) | — |
| 3 | Check Jetson terminal | Logs `Stopped camera: top-down` (stop-stream sent before unmount) |
| 4 | Navigate back to `/vision` | Page loads fresh, status = "idle" |
| 5 | Click Start Stream | Connects normally (no stale state from previous session) |

**Pass Criteria:** useEffect cleanup fires, peer connection is closed, no leaks.

---

### TC-18: H.264 Codec Preference

**Objective:** Verify the SDP munging correctly prioritizes H.264 Constrained Baseline.

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Start streaming | Connected |
| 2 | Check **Codec** metric card | Shows `H264` |
| 3 | Open `chrome://webrtc-internals` (Chrome) or `about:webrtc` (Firefox) | — |
| 4 | Find the active peer connection → inbound-rtp | Codec shows `video/H264` with profile `42e01f` |

**Pass Criteria:** H.264 Constrained Baseline is negotiated (not VP8/VP9).

---

### TC-19: Long-Running Stream Stability

**Objective:** Verify the stream remains stable over an extended period.

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Start streaming | Connected |
| 2 | Leave running for **30 minutes** | — |
| 3 | Check video every 5 minutes | Still playing, no freezes |
| 4 | Check metric cards | Values still updating, no NaN or stale timestamps |
| 5 | Check browser memory (DevTools → Performance → Memory) | No significant growth (< 10 MB increase over 30 min) |
| 6 | Check Jetson CPU/GPU usage | Stable, no runaway processes |

**Pass Criteria:** Stream stable for 30 minutes without degradation or leaks.

---

### TC-20: Concurrent Dashboard Instances

**Objective:** Verify behavior when multiple browser tabs connect to the same drone.

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open `/vision` in Tab A, click Start Stream | Connected, video visible |
| 2 | Open `/vision` in Tab B, click Start Stream | Tab B also connects (separate peer connection) |
| 3 | Check relay logs | Both dashboards registered in the same room |
| 4 | Check Jetson terminal | Two separate offer/answer exchanges logged |
| 5 | Stop stream in Tab A | Tab B continues streaming unaffected |

> **Note:** The current architecture creates one peer connection per dashboard tab. If the Jetson bridge does not support multiple simultaneous PCs, Tab B may fail — document this as a known limitation.

**Pass Criteria:** Second tab either connects independently or fails gracefully (no crash).

---

## 6. Environment Variable Reference

| Variable | Values | Description |
|----------|--------|-------------|
| `NEXT_PUBLIC_DATA_SOURCE` | `mock` / `live` | `live` enables real WebSocket connection |
| `NEXT_PUBLIC_SIGNALING_MODE` | `direct` / `relay` | Signaling path between dashboard and Jetson |
| `NEXT_PUBLIC_WS_URL` | `ws://...` or `wss://...` | WebSocket endpoint (Jetson in direct, relay in relay mode) |
| `NEXT_PUBLIC_DRONE_ID` | string | Identifier for relay room pairing (must match Jetson) |
| `NEXT_PUBLIC_RELAY_AUTH_TOKEN` | string | Bearer token for relay authentication (empty = no auth) |
| `NEXT_PUBLIC_STUN_URLS` | comma-separated | STUN server URLs for NAT traversal |
| `NEXT_PUBLIC_TURN_URLS` | comma-separated | TURN server URLs for media relay |
| `NEXT_PUBLIC_TURN_USERNAME` | string | TURN server username |
| `NEXT_PUBLIC_TURN_CREDENTIAL` | string | TURN server password |
| `NEXT_PUBLIC_FORCE_TURN` | `true` / `false` | Force all media through TURN (blocks direct P2P) |
| `RELAY_PORT` | integer | Relay server listen port (default 8080) |
| `RELAY_AUTH_TOKEN` | string | Server-side auth token (must match client) |

---

## 7. Troubleshooting

| Symptom | Likely Cause | Resolution |
|---------|-------------|------------|
| Bridge: `Cannot open camera device` | CSI ribbon cable loose, or wrong device index | Check physical connection; update `CAMERA_MAP` in bridge |
| Bridge: `GStreamer pipeline failed` | GStreamer not built with NVENC, or no CSI camera | Falls back to V4L2 automatically; verify with `gst-launch-1.0` |
| Dashboard stuck on "signaling" | Jetson bridge not running or not registered | Check both terminals; in relay mode verify both sides registered |
| Dashboard stuck on "connecting" | ICE candidates not reaching peer | Add TURN server; set `NEXT_PUBLIC_FORCE_TURN=true` |
| "Reconnecting (N/5)" cycling | ICE keeps failing | Symmetric NAT detected; TURN is required |
| Transport shows "relay" unexpectedly | Both behind NAT, STUN insufficient | Expected behavior; check TURN server proximity for latency |
| High RTT (> 2s) | 4G congestion or distant TURN server | Co-locate TURN near drone operations area |
| Codec card shows VP8 instead of H264 | H.264 not available on Jetson encoder or browser | Check `chrome://webrtc-internals`; ensure NVENC is working |
| Video connected but black | Camera pipeline producing no frames | Test: `gst-launch-1.0 nvarguscamerasrc ! autovideosink` |
| wsManager stays "connecting" | Relay rejected registration | Verify `RELAY_AUTH_TOKEN` matches on both sides |
| Browser memory growing | MediaStream or RTCPeerConnection leak | Check DevTools; ensure `stop()` is called before `start()` |
| Relay crashes under load | Too many connections | Add `--max-old-space-size=512` to Node.js invocation |

---

## Test Results Template

| TC # | Test Name | Date | Tester | Result | Notes |
|------|-----------|------|--------|--------|-------|
| TC-01 | Relay Server Startup | | | ☐ Pass / ☐ Fail | |
| TC-02 | Jetson Bridge — Direct Mode | | | ☐ Pass / ☐ Fail | |
| TC-03 | Jetson Bridge — Relay Registration | | | ☐ Pass / ☐ Fail | |
| TC-04 | E2E Direct Mode | | | ☐ Pass / ☐ Fail | |
| TC-05 | E2E Relay Mode | | | ☐ Pass / ☐ Fail | |
| TC-06 | Camera Switching | | | ☐ Pass / ☐ Fail | |
| TC-07 | Start / Stop Toggle | | | ☐ Pass / ☐ Fail | |
| TC-08 | Auto-Reconnect ICE Failure | | | ☐ Pass / ☐ Fail | |
| TC-09 | Auto-Reconnect WS Drop | | | ☐ Pass / ☐ Fail | |
| TC-10 | Message Queue | | | ☐ Pass / ☐ Fail | |
| TC-11 | TURN Fallback | | | ☐ Pass / ☐ Fail | |
| TC-12 | Forced TURN | | | ☐ Pass / ☐ Fail | |
| TC-13 | Stream Stats Accuracy | | | ☐ Pass / ☐ Fail | |
| TC-14 | ICE Transport Visibility | | | ☐ Pass / ☐ Fail | |
| TC-15 | Relay Authentication | | | ☐ Pass / ☐ Fail | |
| TC-16 | Rapid Start/Stop | | | ☐ Pass / ☐ Fail | |
| TC-17 | Page Navigation Cleanup | | | ☐ Pass / ☐ Fail | |
| TC-18 | H.264 Codec Preference | | | ☐ Pass / ☐ Fail | |
| TC-19 | Long-Running Stability | | | ☐ Pass / ☐ Fail | |
| TC-20 | Concurrent Instances | | | ☐ Pass / ☐ Fail | |
