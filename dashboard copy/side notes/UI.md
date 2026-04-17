# Drone Command Dashboard

Architecture & Implementation Specification


# Dashboard Objectives & Requirements

The Ground Control Station (GCS) dashboard is the primary interface for
operator supervision, bridging the 4G LTE communication gap between the
ground crew and the autonomous misting hexacopter.

To comply with the operational constraints and specifications of the
drone, the dashboard must fulfill the following technical requirements:

- **Network Tolerance:** Handle an expected Round-Trip Time (RTT) of
  $\approx 316\text{ ms}$ over the 4G cellular network without blocking
  UI rendering.

- **Dual Perception Streams:** Display low-latency WebRTC video feeds
  from both the top-down and side-view IMX477 cameras.

- **Payload Monitoring:** Track the 2-liter tank capacity and ensure
  water temperature remains $\le 25^\circ\text{C}$ via ESP32 telemetry.

- **State Machine Supervision:** Visually represent the Navigation,
  Emergency, and Dashboard Health Finite State Machines (FSMs) in
  real-time.

# UI Design & Module Layout

The React-based frontend is divided into four distinct operational
modules, designed using CSS Grid to prevent layout shifts during
critical flight operations.

## 1. Perception & Video Module (Center/Left)

This module serves as the eyes of the operator, verifying the YOLOv8n AI
decisions.

- **Dual Camera Feeds:** Side-by-side or picture-in-picture WebRTC
  streams from the Jetson Orin Nano.

- **AI Overlays:** Bounding boxes or density heatmaps overlaid on the
  top-down feed to validate the model's accuracy target ($\ge 80\%$).

- **Current AI State:** A clear text indicator showing the current
  output of the Rational Decision block: `[MISTING AUTHORIZED]` or
  `[NO CROWD DETECTED]`.

## 2. Mission & Flight Telemetry (Right Column)

Tracks the MAVLink data passed from the PX4 flight controller.

- **Power Metrics:** Remaining capacity of the 6S 22Ah LiPo battery,
  live voltage, and total current draw (Expected hover:
  $\approx 57.36\text{ A}$).

- **Altitude & Attitude:** Current AGL altitude (Target: 3-15m) and an
  artificial horizon for pitch/roll monitoring.

- **Waypoint Mode:** A toggle indicator showing whether the drone is in
  *Reactive Nearest-Crowd* mode or *Fixed Concentric-Circle* mode to
  cover the $10,000\text{ m}^2$ area.

## 3. Payload & Misting Status (Bottom Left)

Displays telemetry originating from the ESP32 microcontroller.

- **Tank Level:** A vertical progress bar representing the 2-liter
  capacity. Decreases dynamically based on the
  $\approx 0.3\text{ L/min}$ flow rate.

- **Thermal Monitor:** Live water temperature. Turns red and triggers a
  UI alert if the temperature exceeds $25^\circ\text{C}$.

- **Pump/Nozzle Status:** Active/Inactive state of the electric
  centrifugal nozzle.

## 4. System Health & Overrides (Top Bar)

A high-visibility banner managing the Finite State Machines.

- **Dashboard Health FSM:** A master traffic light (**GREEN** /
  **YELLOW** / **RED**) reflecting warnings or critical faults.

- **Telemetry Link FSM:** Displays `INIT`, `CONNECTED`, `DEGRADED` (if
  packet loss is high), or `LOST`.

- **Override Controls:** Highly visible buttons for *Manual Pump
  Override*, *Emergency Safe Mode*, and *Return to Base (Dock)*.

# Software Implementation Plan

The system utilizes a Hybrid Architecture to ensure the Jetson Orin Nano
does not block AI processing while handling 4G communications.

## Phase 1: The Jetson Worker (Python)

The Python script on the Jetson Orin Nano merges MAVLink flight data,
YOLOv8n crowd density scores, and ESP32 payload data into a single JSON
packet.

``` {.python language="Python" caption="Data Aggregation on Jetson Orin Nano"}
import time
import socket
import json
import threading
from pymavlink import mavutil
import serial

# Shared State
state = {
    "altitude": 0.0, "battery_v": 0.0, "waypoint_mode": "CONCENTRIC",
    "crowd_density": 0, "mist_decision": False,
    "water_temp": 0.0, "water_level": 100,
    "health_fsm": "GREEN"
}

def px4_thread():
    master = mavutil.mavlink_connection('/dev/ttyTHS1', baud=57600)
    while True:
        msg = master.recv_match(type=['VFR_HUD', 'SYS_STATUS'], blocking=True)
        # Update state with PX4 telemetry...

def esp32_thread():
    # Read payload sensors from ESP32 via UART
    ser = serial.Serial('/dev/ttyUSB0', 115200)
    while True:
        line = ser.readline().decode('utf-8')
        payload_data = json.loads(line)
        state["water_temp"] = payload_data["temp"]
        state["water_level"] = payload_data["level"]

# Broadcast to Node.js server via UDP
sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
while True:
    sock.sendto(json.dumps(state).encode('utf-8'), ("127.0.0.1", 4000))
    time.sleep(0.05) # 20Hz update rate
```

## Phase 2: The Telemetry Bridge (Node.js)

A TypeScript Node.js server running on the Jetson acts as the 4G LTE
bridge. It receives the high-frequency UDP data from Python, validates
it, and pushes it to the React dashboard via WebSockets.

``` {.JavaScript language="JavaScript" caption="Node.js 4G WebSocket Bridge"}
import dgram from 'dgram';
import { WebSocketServer } from 'ws';

const wss = new WebSocketServer({ port: 8080 });
const udpServer = dgram.createSocket('udp4');

let lastHeartbeat = Date.now();

// Listen for UDP from Python
udpServer.on('message', (msg) => {
    const telemetry = msg.toString();
    
    // Push over 4G to React Dashboard
    wss.clients.forEach(client => {
        if (client.readyState === 1) { 
            client.send(telemetry);
        }
    });
});

// Failsafe: Monitor Dashboard connection over 4G
wss.on('connection', (ws) => {
    ws.on('message', (message) => {
        const data = JSON.parse(message);
        if (data.type === 'HEARTBEAT') {
            lastHeartbeat = Date.now();
        } else if (data.type === 'OVERRIDE_MIST') {
            // Forward command to Python worker
        }
    });
});

udpServer.bind(4000);
```

## Phase 3: The React Dashboard (Frontend)

The ground station uses Zustand to manage the incoming WebSocket stream.
This prevents the entire UI from re-rendering when variables like
altitude change, maintaining a smooth interface despite 4G latency.

``` {.JavaScript language="JavaScript" caption="React Zustand Store for Dashboard"}
import { create } from 'zustand';
import { useEffect } from 'react';

export const useDroneStore = create((set) => ({
    telemetry: {
        altitude: 0,
        battery_v: 0,
        crowd_density: 0,
        water_temp: 20,
        health_fsm: 'GREEN'
    },
    updateTelemetry: (newData) => set({ telemetry: newData }),
}));

// Connection Hook
export function useLTEConnection(droneIP) {
    const update = useDroneStore(state => state.updateTelemetry);

    useEffect(() => {
        const ws = new WebSocket(`ws://${droneIP}:8080`);
        
        ws.onmessage = (event) => update(JSON.parse(event.data));
        
        // Send heartbeat every 1 second to maintain link FSM
        const interval = setInterval(() => {
            if(ws.readyState === 1) ws.send(JSON.stringify({type: 'HEARTBEAT'}));
        }, 1000);

        return () => { clearInterval(interval); ws.close(); };
    }, [droneIP, update]);
}
```
