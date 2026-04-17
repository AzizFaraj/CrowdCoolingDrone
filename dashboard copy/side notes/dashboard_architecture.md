
**Dashboard Architecture and Implementation Plan**

for the Autonomous Misting Drone Senior Design Project


This document turns the uploaded senior design report into a concrete
dashboard specification and implementation plan. It is written as
something your team can directly reuse in the report, in planning
meetings, and during development. The dashboard is treated as an
operational safety console first, and as a visualization product second.

2026-04-13

# Executive Summary

The uploaded report makes the dashboard a core deliverable rather than
an optional monitoring page. In the report, the system is defined as an
autonomous crowd-cooling drone with live supervision, reliable status
reporting, operator override, geofencing, safety behaviors,
docking/refill cycles, and performance targets including decision
latency, RTT, boot-to-service time, docking accuracy, and controlled
misting. The dashboard therefore has to support operations, safety,
telemetry, mission control, validation, and evidence collection at the
same time.

The most important architectural consequence is that the browser must
**not** sit in the control loop. The control loop should remain inside
the drone and ground-control services, while the browser acts as a
supervisory client. In practical terms, a strong hybrid design is:

- **Python** for drone-facing services, autonomy, MAVLink, AI outputs,
  health computation, payload logic, and state machines.

- **Node.js** for operator-facing services, authentication, APIs,
  WebSockets, session control, telemetry fan-out, alerting, and
  persistent event storage.

This split matches the report's architecture: a Jetson companion
computer runs perception and waypoint generation, PX4 executes
flight-critical control, an ESP32 handles real-time payload interfacing,
and a 4G communication module connects the drone to the dashboard for
status monitoring and high-level commands.

# Requirements Extracted from the Uploaded Report

## Why the dashboard exists

From the report, the dashboard must satisfy all of the following project
roles:

- live status, supervision, and operator command interface;

- communication endpoint for drone $\rightarrow$ base station
  $\rightarrow$ dashboard status reporting and commands;

- visibility into geofencing, emergency protocols, latency, docking, and
  boot-up metrics;

- support for clear and timely status awareness for staff and operators;

- remote monitoring plus high-level commands such as return-to-home.

The dashboard is not just a map and a few numbers. It must expose
mission state, telemetry quality, payload safety, AI decisions, docking
progress, alerting, manual override, and post-mission evidence.

## Performance and design constraints that drive the dashboard

The report gives concrete measurable targets that the dashboard must
support operationally and verify analytically.

**Requirement**                                   Meaning for the dashboard                                                      Operational consequence
------------------------------------------------- ------------------------------------------------------------------------------ -----------------------------------------------------------
**Decision latency $\leq$ 3 s**                   The UI must expose sensing-to-decision timing, not just camera and map feeds   Add latency cards, timelines, and per-cycle logs
**RTT $\leq$ 2 s**                                Link health must be visible at all times                                       Add heartbeat, RTT, packet loss, and degraded/lost states
**Boot-to-service $<$ 2 min**                     Startup must be observable and measured                                        Add startup checklist and progress states
  **Crowd detection accuracy about 80%**            AI output must be explainable and testable                                     Add predicted count, confidence, thresholds, and overlays
  **Stored water temperature $\leq$ 25$^\circ$C**   Payload safety affects spraying permission                                     Add water temperature state and spray interlocks
  **Flow around 0.3 L/min**                         Water usage must be visible; command vs actual should be separated             Add flow estimation and budget tracking
  **Docking accuracy within 5 cm**                  Docking is a mission phase, not a simple event                                 Add docking phases and alignment error states
  **Operating altitude 3--15 m AGL**                Operator must know whether flight remains inside operational envelope          Add altitude limit indicators and warnings
:::

## State machines already implied by the report

The report already defines the conceptual state logic. The dashboard
should surface it explicitly rather than hiding it inside logs.

### Navigation and safety states

- Operating in-zone

- Boundary recovery

- Return to base

- Failsafe / safe termination condition

### Emergency override states

- Autonomous

- Overridden

- Safe-mode

### Monitoring states

- Monitoring init

- Connected

- Degraded

- Lost

### Dashboard health color states

The report's dashboard health FSM implies a simple but useful color
model:

- **Green**: all clear

- **Yellow**: warnings detected

- **Red**: critical issue detected

# What the Dashboard Should Contain

## Screen 1: Mission Operations Overview

This is the main operational screen. It should be the default page shown
when an operator opens the application.

### Top mission banner

The top banner should always show:

- drone identifier;

- mission name and mission phase;

- armed/disarmed;

- autonomous / overridden / safe-mode;

- monitoring state: init, connected, degraded, lost;

- dashboard health state: green, yellow, red;

- last heartbeat age;

- operator currently in control.

### Main map panel

The map should show:

- current drone position, heading, and trail;

- base station / docking station;

- operating area polygon;

- geofence boundary and keep-out zones;

- current waypoint list and next target waypoint;

- active crowd target region;

- return-to-home path when armed by operator or failsafe;

- boundary recovery path if geofence recovery is active.

### Why this belongs on the main screen

The report's mission logic is spatial. The drone is not just reporting
scalar status; it moves within a restricted operating area, reacts to
crowd targets, and must visibly remain inside safe boundaries. A map is
therefore the operational source of truth for the mission.

## Screen 2: Telemetry and Vehicle Health

This page is for aircraft and communication health.

### Vehicle telemetry cards

Include:

- battery voltage, current, power draw, and estimated remaining time;

- battery percentage and low-battery status;

- altitude AGL, ground speed, climb rate, and heading;

- GPS fix quality and satellite count;

- PX4 health flags: IMU, GPS, barometer, arming state, failsafe flags;

- compute health: Jetson CPU/GPU load, memory, process health;

- ESP32 connection state;

- camera availability and frame rate;

- 4G module signal quality, RTT, packet loss, and last ack time.

### Time-series panels

Each should show short-term and mission-long trends.

- battery percentage over time;

- RTT over time;

- packet loss over time;

- altitude over time;

- mission power draw over time;

- CPU/GPU load over time.

## Screen 3: AI, Vision, and Decision Trace

This page is essential if you want the operator to trust the autonomy.

### Live vision panel

The page should contain:

- live video feed from selected camera;

- option to switch top-down / side-view feed;

- crowd detections overlaid on the frame;

- predicted count or density score;

- target selection region;

- model confidence summary;

- inference latency for the most recent frame;

- end-to-end decision latency for the most recent autonomy cycle.

### Decision trace panel

The system should explain *why* it chose an action.

- current crowd score;

- threshold-on and threshold-off values;

- resulting decision: mist on, mist off, continue scan, redirect,
  return, hold;

- active waypoint mode: nearest-crowd or fixed coverage;

- reason chain, for example: crowd score high $\rightarrow$ spray
  allowed $\rightarrow$ low water false $\rightarrow$ proceed.

### Why this is necessary

The report's AI chain is not a generic object detector. It feeds
waypoint planning and misting decisions. The dashboard should therefore
display both the perception output and the post-processed decision
state.

## Screen 4: Payload, Cooling, and Refill State

The payload is not a minor subsystem here; it is central to the project.

### Required payload indicators

- water level percentage;

- water temperature;

- spray enable state;

- nozzle speed or actuator duty if supported;

- estimated flow rate;

- command flow rate versus measured or estimated flow rate;

- remaining cooling budget for the current sortie;

- refill requested / refill available / refill in progress / refill
  completed;

- payload-safe-to-spray flag.

### Important note from the report

The report explicitly notes that the gravity-fed design may exceed the
target flow because there is no dedicated flow restrictor in the current
design. That means the UI must distinguish:

- **flow command**;

- **flow estimate**;

- **flow measurement**, only if a real sensor is added.

## Screen 5: Docking, Refill, and Recovery

Docking must be modeled as a multi-step process.

### Docking states

Recommended states:

1.  approach;

2.  align;

3.  landing detected;

4.  motor rundown / settling;

5.  alignment verification;

6.  refill authorized;

7.  refill active;

8.  refill complete;

9.  launch-ready;

10. retry / abort.

### Docking widgets

- horizontal and vertical alignment error;

- docking confidence;

- settle timer;

- handshake state;

- retry count;

- refill timer;

- operator override controls;

- abort reason if docking fails.

::: riskbox
The report states that alignment verification can exceed 5 seconds
because the drone may need time for turbulence to settle and motors to
stop vibrating. The UI must expose that delay explicitly, otherwise the
operator will misread a correct wait state as a failure.
:::

## Screen 6: Alerts, Overrides, and Safety Console

This page should present all warnings and critical events with severity,
timestamp, source subsystem, and operator action.

### Alerts that must exist

- geofence breach or boundary recovery;

- telemetry degraded or lost;

- high RTT or high packet loss;

- low battery;

- low water;

- high water temperature;

- camera unavailable;

- Jetson service unavailable;

- ESP32 unavailable;

- AI inference timeout;

- docking failure;

- manual override active;

- safe-mode active;

- return-to-home or failsafe triggered.

### Critical action controls

These should be deliberate and guarded:

- mission pause / hold;

- return-to-home;

- disable spray;

- safe-mode;

- command acknowledgment;

- manual override entry / exit;

- emergency abort.

## Screen 7: Validation and Analytics

This screen proves that the system meets project metrics.

### Metrics to log and visualize

- decision latency per cycle;

- communication RTT per interval;

- packet loss and link degradation episodes;

- boot-to-service time per startup;

- mission duration;

- misting duration;

- water usage per sortie;

- docking attempts, successes, and retries;

- alert counts by severity and subsystem;

- AI confidence distribution;

- operator interventions by mission.

# Information Architecture and Operator Workflow

## Operator workflow from startup to shutdown

1.  Open dashboard and authenticate.

2.  Check system summary: link healthy, vehicle available, payload safe,
    mission loaded.

3.  Observe startup checklist until dashboard state changes from booting
    to ready.

4.  Arm mission and start autonomous operation.

5.  Monitor mission map, AI target selection, and payload state.

6.  Respond to warnings if health changes from green to yellow.

7.  If red state appears, use safe-mode, hold, or return-to-home.

8.  Observe docking sequence, refill, and relaunch readiness.

9.  End mission and export validation logs.

## Navigation hierarchy

A practical sidebar structure is:

1.  Operations

2.  Telemetry

3.  Vision / AI

4.  Payload / Cooling

5.  Docking / Refill

6.  Alerts / Safety

7.  Analytics / Reports

8.  Admin / Configuration

# Recommended Hybrid Backend Architecture

## High-level split

::: center
:::

## What belongs in Python

Python should host everything that is close to the autonomy stack:

- MAVLink bridge to PX4;

- ESP32 interface over UART or serial protocol;

- camera frame acquisition and metadata publication;

- YOLOv8n inference output handling;

- crowd scoring and temporal smoothing;

- waypoint generation;

- mission state machine;

- payload and refill state machine;

- health synthesis and interlock rules;

- command validation before passing commands to PX4 or ESP32.

## What belongs in Node.js

Node should host everything that is close to users and browsers:

- authentication and role-based access control;

- REST API for mission configuration and log retrieval;

- WebSocket fan-out for live telemetry and alerts;

- operator session management;

- command history, acknowledgments, and audit trail;

- alert routing and notification delivery;

- dashboard preferences and mission summaries;

- report export endpoints.

::: implbox
Node.js handles many simultaneous UI clients and real-time subscriptions
well. Python stays close to PX4, AI, and payload logic where the domain
models are richer and where scientific / robotics libraries already
exist. This also reduces the chance that browser-facing concerns
contaminate safety-adjacent services.
:::

# Detailed Service Design

## Python service set

::: center
  **Service**             Main responsibility                                               Key inputs / outputs
  ----------------------- ----------------------------------------------------------------- -------------------------------------------------------
  **`mavlink_bridge`**    Read flight telemetry and send mission or setpoint commands       PX4 MAVLink in/out
  **`vision_service`**    Run camera ingest, publish detections, counts, and crowd scores   Camera frames in, AI metadata out
  **`mission_service`**   Waypoint generation, mission modes, geofence recovery logic       AI metadata + mission config in, waypoint intents out
  **`payload_service`**   Spray logic, water interlocks, refill states                      ESP32 payload status in, spray commands out
  **`health_service`**    Overall health color, subsystem status, alert derivation          telemetry + payload + AI in, health packets out
  **`stream_broker`**     Publish normalized state to pub/sub backend                       normalized JSON out
:::

## Node.js service set

::: center
  **Service**                 Main responsibility                                       Key interfaces
  --------------------------- --------------------------------------------------------- -------------------------
  **`api_gateway`**           REST endpoints and auth                                   HTTPS API
  **`ws_gateway`**            Live state push to browsers                               WebSocket / Socket.IO
  **`command_service`**       Persist, dispatch, and audit operator commands            API to Python + DB
  **`alert_service`**         Rule-based user notifications and alert acknowledgments   DB + WS
  **`mission_log_service`**   Mission summaries, exports, timelines                     Postgres / object store
  **`config_service`**        Mission templates, thresholds, operator profiles          Postgres
:::

# Real-Time Data Model

## Principle: normalize early

Every browser-visible state should come from a normalized state object,
not from scattered raw telemetry packets. This makes the system
debuggable, testable, and consistent across screens.

## Recommended top-level objects

- `vehicle_state`

- `link_state`

- `ai_state`

- `payload_state`

- `mission_state`

- `dock_state`

- `health_state`

- `alert_event`

- `operator_command`

## Example normalized telemetry packet

``` {style="jsonstyle"}
{
  "drone_id": "drone-01",
  "timestamp": "2026-04-12T14:20:31Z",
  "vehicle": {
    "armed": true,
    "flight_mode": "AUTO_MISSION",
    "lat": 26.3174,
    "lng": 50.1438,
    "alt_m_agl": 7.8,
    "speed_mps": 3.4,
    "heading_deg": 121,
    "battery_pct": 63,
    "battery_voltage_v": 22.4,
    "battery_current_a": 56.8
  },
  "link": {
    "state": "CONNECTED",
    "rtt_ms": 284,
    "packet_loss_pct": 0.7,
    "last_heartbeat_ms": 220
  },
  "ai": {
    "mode": "NEAREST_CROWD",
    "crowd_score": 0.81,
    "person_count": 36,
    "decision": "MIST_ON",
    "inference_ms": 94,
    "decision_latency_ms": 810
  },
  "payload": {
    "water_level_pct": 57,
    "water_temp_c": 21.4,
    "spray_enabled": true,
    "flow_est_lpm": 0.29,
    "safe_to_spray": true
  },
  "health": {
    "overall": "YELLOW",
    "active_alerts": ["HIGH_RTT"]
  }
}
```

# Database and Storage Design

## Recommended storage split

- **Redis**: latest state per drone, WebSocket fan-out cache, pub/sub,
  short-lived command acknowledgments.

- **Postgres or TimescaleDB**: durable telemetry aggregates, alerts,
  commands, mission summaries, configuration, analytics.

- **Object storage**: exported CSV bundles, mission reports, optional
  debug clips, archived raw logs.

## Core relational tables

::: center
  **Table**                 Purpose
  ------------------------- ------------------------------------------------------------
  **`drones`**              drone identity, hardware profile, communication endpoints
  **`missions`**            mission definition, area polygon, thresholds, mode, status
  **`mission_events`**      timeline of important events for playback and reporting
  **`operator_commands`**   issued commands, issuer, timestamps, results
  **`alerts`**              severity, subsystem, lifecycle, acknowledgment info
  **`telemetry_summary`**   sampled values for charts and analytics
  **`dock_events`**         docking attempts, phases, durations, outcomes
  **`payload_events`**      spray on/off cycles, refill cycles, temperature violations
  **`users`**               operators, admins, viewers
  **`roles`**               authorization model
:::

# API Design

## REST endpoints

- `GET /api/drones`

- `GET /api/drones/:id/state`

- `GET /api/missions`

- `POST /api/missions`

- `POST /api/missions/:id/start`

- `POST /api/missions/:id/pause`

- `POST /api/missions/:id/rth`

- `POST /api/missions/:id/override`

- `POST /api/missions/:id/thresholds`

- `GET /api/missions/:id/events`

- `GET /api/missions/:id/report`

- `GET /api/alerts`

- `POST /api/alerts/:id/ack`

## WebSocket topics

- `drone.state.``id`

- `drone.alerts.``id`

- `drone.video.``id` for metadata, not raw video frames

- `mission.events.``id`

- `dock.state.``id`

## Command handling rules

Every operator command should:

1.  create a database record;

2.  be assigned a command ID;

3.  be validated against current mission state and operator role;

4.  be forwarded to Python services;

5.  receive ack, reject, or timeout status;

6.  be surfaced back to the UI with timestamp and result.

# State Machines for Dashboard Logic

## Mission state machine

Recommended mission states:

::: center
:::

## Monitoring state machine

- INIT: before a stable heartbeat exists.

- CONNECTED: heartbeat, RTT, and packet-loss thresholds healthy.

- DEGRADED: heartbeat continues but RTT or loss exceeds threshold.

- LOST: heartbeat timeout or no acknowledgments.

## Health color computation

A simple server-side rule set is sufficient for the first version:

- **Green**: no critical alerts, no warnings requiring operator action.

- **Yellow**: one or more warnings, but mission can continue safely.

- **Red**: any critical safety, link, power, or control alert.

# Safety, Privacy, and Cybersecurity Requirements

## Safety rules for the dashboard

The dashboard should enforce the following design principles:

- show flight safety boundaries clearly;

- show safe-mode, return-to-home, and override states prominently;

- require confirmation for critical commands;

- avoid accidental single-click aborts;

- expose why spray is disabled when interlocks are active;

- keep operator commands high-level in the first version.

## Privacy requirements

Since the report explicitly avoids identity-level analytics:

- avoid face-recognition or identity storage;

- do not keep video archives by default;

- process crowd metrics on-device where possible;

- mark the system as non-identifying in the UI;

- add an optional test-mode label if clips are temporarily recorded
  during lab validation.

## Cybersecurity requirements

- authenticated logins with roles;

- short-lived access tokens;

- audit trail for all commands;

- TLS for browser connections;

- signed or authenticated internal command messages where possible;

- rate limiting and session timeout;

- replay-resistant command IDs;

- clear incident log for suspicious command sequences.

# Implementation Plan

## Phase 1: foundations

- build the normalized state schema;

- stand up Node API and WebSocket server;

- implement Python MAVLink ingest and simulated state publisher;

- build the main operations screen and telemetry cards;

- create mission, alert, and command tables.

## Phase 2: AI and payload integration

- integrate AI metadata feed into normalized state;

- add video transport layer and overlay rendering;

- add payload state page with water level and temperature;

- add spray interlock reasons;

- implement trend charts and alert generation rules.

## Phase 3: docking and advanced workflows

- build docking page and phase state machine;

- add settling and verification logic;

- add replay and mission analytics pages;

- export mission summary report as PDF / CSV.

## Phase 4: validation and hardening

- test degraded-link scenarios;

- test command ack timeouts;

- test safe-mode and override flows;

- validate startup and boot-to-service measurement;

- validate log completeness against report metrics.

# Detailed Testing Plan

## Functional tests

- mission starts and transitions correctly through states;

- operator commands appear in command history with correct ack result;

- map updates with live position and target changes;

- AI metadata updates detections, crowd score, and decision trace;

- payload interlocks correctly block spray when water is unsafe;

- docking state sequence progresses correctly.

## Performance tests

- WebSocket latency under nominal telemetry rate;

- server ability to fan out live state to multiple clients;

- decision latency visualization matches backend timing;

- chart rendering remains usable during long missions.

## Failure tests

- link degradation and heartbeat loss;

- camera failure;

- ESP32 disconnect;

- Jetson service crash or inference timeout;

- PX4 fallback behavior under companion disconnect;

- payload over-temperature lockout;

- docking verification timeout.

# Concrete Recommendations for Your Team

## Recommendation 1: Keep the browser out of the control path

The browser should only issue operator requests to Node, and Node should
forward validated commands to Python services. The browser should never
talk directly to PX4, the ESP32, or the vehicle network.

## Recommendation 2: Build health computation server-side

Do not calculate red/yellow/green in React. Compute it in Python or Node
from normalized telemetry and alert rules, then publish a final health
object.

## Recommendation 3: Add measured flow if possible

The current report admits that actual gravity-fed flow may deviate from
the target. A small flow sensor would greatly strengthen both the
payload page and your validation evidence.

## Recommendation 4: Treat docking as a mission phase

Do not implement docking as a single boolean flag. It needs a full state
model because the report already identifies settling, verification, and
handshake timing as practical issues.

## Recommendation 5: Separate video from control/telemetry

The report explicitly values compact control messages and separation of
critical command traffic from high-bandwidth data. That should remain
true in implementation: WebRTC or a separate media path for video, and a
lighter metadata path for telemetry and alerts.

# Suggested Tech Stack

## Frontend

- React or Next.js

- Tailwind CSS

- Leaflet or Mapbox GL for mission map

- Recharts for telemetry and analytics plots

- Zustand or Redux Toolkit for client state

- WebRTC-based viewer for live video

## Node backend

- NestJS or Express with TypeScript

- Socket.IO or native WebSocket server

- Prisma or TypeORM

- Redis

- Postgres / TimescaleDB

## Python backend

- FastAPI

- asyncio

- pymavlink

- OpenCV

- Ultralytics YOLO

- Pydantic for typed schemas

- Redis or MQTT client for pub/sub

# Proposed Report Text You Can Reuse Directly

::: implbox
The dashboard is designed as the operator-facing supervision and safety
layer of the autonomous misting drone system. It provides live mission
status, geospatial visualization of the operating area, telemetry and
communication health, payload and misting status, AI perception outputs,
docking/refill progress, and operator command interfaces.
Architecturally, the dashboard is implemented using a hybrid backend:
Python services handle autonomy-adjacent functions including MAVLink
communication, AI inference output handling, waypoint generation,
payload logic, and health-state synthesis, while Node.js services handle
authentication, REST APIs, WebSocket fan-out, operator session
management, persistent logging, and alert delivery. This split keeps
safety-critical and robotics-specific logic close to the flight stack
while providing a scalable, browser-friendly real-time interface for
supervision, command, and validation.
:::

# Conclusion

A correct dashboard for this project is not merely a visual accessory.
It is the control, validation, and accountability surface for the entire
system. Because the uploaded report already defines deliverables, state
logic, latency targets, docking behaviors, payload safety conditions,
and communications structure, the dashboard should be designed as a
direct software expression of those requirements.

The strongest implementation path is a hybrid architecture in which
Python owns autonomy-facing services and Node.js owns operator-facing
services. This design is aligned with the report's technical
architecture, keeps the browser outside safety-critical loops, and gives
your team a practical way to implement a polished, defensible,
senior-project-quality dashboard.

# Source Basis Used for This Document {#source-basis-used-for-this-document .unnumbered}

This engineering note was derived from the uploaded *Senior Design
Project II Report*, especially the sections covering project
deliverables, customer needs, dashboard health and telemetry link FSMs,
discipline-specific block/arrows, final architecture, communication
module, AI workflow, software architecture, system boot timing,
alignment verification, and final design performance summary.
