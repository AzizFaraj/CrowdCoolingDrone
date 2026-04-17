# Deployment Notes — Public Relay + Cross-Network Video

This dashboard is designed to work when the **Jetson and the dashboard browser are not on the same LAN**.

---

## 1. Recommended Topology

```text
┌──────────────────────────┐
│   Jetson Orin Nano       │
│   (Python + Node bridge) │
│   4G / LTE               │
└─────────┬────────────────┘
          │ outbound WSS
          ▼
┌──────────────────────────┐     ┌────────────────────────┐
│   Public VPS / Cloud     │     │   TURN Server (coturn) │
│   Node.js backend        │     │   UDP 3478 + TCP 443   │
│   WSS endpoint           │     │   relay range           │
│   REST API               │     │   49152–65535          │
└─────────▲────────────────┘     └───────────▲────────────┘
          │ outbound WSS                      │ relay (when P2P fails)
┌─────────┴────────────────┐                  │
│   Browser Dashboard      ├──────────────────┘
│   Next.js (static build) │  WebRTC media (SRTP)
│   Campus Wi-Fi / home    │
└──────────────────────────┘
```

### Transport Split

| Transport | Carries | Protocol |
|-----------|---------|----------|
| **WebSocket / WSS** | Telemetry, alerts, AI metadata, operator commands, WebRTC signaling | JSON over TCP |
| **WebRTC** | Live camera feed (H.264 SRTP) | UDP (or TCP via TURN) |
| **REST / HTTPS** | Mission configuration, reports | JSON over TCP |

---

## 2. Why a Public Backend Is Needed

The Jetson may be on LTE/4G or another private network, while the dashboard may be on campus Wi-Fi or a different ISP. A public backend lets both connect **outward** without requiring either side to have a public IP or open inbound ports.

The shared `wsManager` in the dashboard opens a **single WebSocket** to this backend for both telemetry and WebRTC signaling, with automatic reconnection (exponential back-off, 1 s → 30 s cap).

---

## 3. Minimum Field Setup

### 3.1 Public Node.js Backend

- Hosts the WSS endpoint and REST API.
- Relays telemetry from Jetson → browser and commands from browser → Jetson.
- Forwards WebRTC signaling messages (`webrtc:*`) between peers.
- **Does not touch the media stream** — video flows peer-to-peer (or through TURN).

### 3.2 TURN Server (`coturn`)

Required when both peers are behind NAT that prevents direct UDP connectivity (symmetric NAT, enterprise firewalls, some 4G carriers).

**Minimal `coturn` configuration (`/etc/turnserver.conf`):**

```ini
# Public IP of the TURN server
external-ip=YOUR_PUBLIC_IP

# Listening ports
listening-port=3478
tls-listening-port=5349

# Relay port range (open in firewall)
min-port=49152
max-port=65535

# Credentials (must match .env.local values)
user=demo-user:demo-password

# Realm
realm=your-server-domain

# Enable long-term credentials
lt-cred-mech

# Optional: enable TURNS (TLS) with your certificate
# cert=/etc/letsencrypt/live/turn.your-server-domain/fullchain.pem
# pkey=/etc/letsencrypt/live/turn.your-server-domain/privkey.pem
```

**Firewall rules:**

| Port | Protocol | Purpose |
|------|----------|---------|
| 3478 | UDP + TCP | STUN / TURN listening |
| 5349 | TCP (TLS) | TURNS (TLS-secured TURN) |
| 49152–65535 | UDP | Media relay range |

### 3.3 Dashboard `.env.local`

```bash
NEXT_PUBLIC_DATA_SOURCE=live
NEXT_PUBLIC_WS_URL=wss://your-server-domain/ws
NEXT_PUBLIC_API_BASE_URL=https://your-server-domain/api

NEXT_PUBLIC_STUN_URLS=stun:stun.l.google.com:19302
NEXT_PUBLIC_TURN_URLS=turn:turn.your-server-domain:3478?transport=udp,turn:turn.your-server-domain:3478?transport=tcp
NEXT_PUBLIC_TURN_USERNAME=demo-user
NEXT_PUBLIC_TURN_CREDENTIAL=demo-password

# Set to true if direct P2P is impossible (campus / enterprise NAT)
NEXT_PUBLIC_FORCE_TURN=false
```

---

## 4. Bandwidth & Performance Notes

- **Video bitrate** is controlled by the Jetson-side GStreamer pipeline (recommended: 1–3 Mbps for 720p @ 20 fps H.264).
- The dashboard monitors incoming bitrate, RTT, jitter, and packet loss via the `StreamStats` component.
- **Telemetry + signaling** adds negligible overhead (~2–5 KB/s for 20 Hz snapshots).
- The shared `wsManager` eliminates a redundant TCP connection that would otherwise double the signaling overhead.
- **TURN relay** adds ~20–50 ms latency compared to direct P2P. Use `NEXT_PUBLIC_FORCE_TURN=false` (default) so the browser attempts direct connectivity first.

---

## 5. Hosting Recommendations

| Component | Recommended | Notes |
|-----------|-------------|-------|
| Node.js backend | Any VPS (DigitalOcean, AWS Lightsail, Hetzner) | 1 vCPU, 1 GB RAM sufficient |
| TURN server | Same VPS or dedicated (coturn) | Needs public IP + open UDP range |
| Dashboard | Vercel, Netlify, or same VPS (`next build && next start`) | Static export possible for CDN |
| TLS certificate | Let's Encrypt (free) | Required for WSS and TURNS |

---

## 6. Security Considerations

- Always use **WSS** (not WS) in production to encrypt telemetry and signaling.
- TURN credentials should be **time-limited** (coturn supports `--use-auth-secret` for ephemeral credentials). For the prototype, static credentials are acceptable.
- The browser **never** issues low-level vehicle commands — all operator commands are high-level and validated by the backend before forwarding to the Jetson.

---

## 7. Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Dashboard shows "closed" link state | WSS endpoint unreachable | Check `NEXT_PUBLIC_WS_URL`, TLS cert, backend is running |
| WebRTC stuck on "signaling" | Jetson not connected to backend | Verify Jetson's outbound WSS connection |
| WebRTC stuck on "connecting" | ICE candidates can't reach peer | Add TURN server, check firewall rules |
| High RTT / stuttering video | 4G congestion or TURN relay | Lower Jetson encode bitrate, check `StreamStats` |
| Reconnection loops | Backend crash / restart | Check backend logs; wsManager will auto-reconnect |
