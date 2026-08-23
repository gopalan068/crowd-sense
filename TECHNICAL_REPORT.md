# CrowdSense: Flow-Aware Crowd Safety Early-Warning & Automated Escalation System
## Technical Report — Hackathon Submission Document

---

## 1. Executive Summary

Public gatherings in India—ranging from local temple festivals and political rallies to mega-gatherings like the Maha Kumbh Mela—frequently result in fatal crowd crushes and stampedes. Historical analysis of incidents such as the Karur rally stampede (41 casualties) and the Maha Kumbh Mela bathing stampede (~30 casualties) reveals that detection failure is rarely the root cause. Rather, the critical failure point lies in human decision-deferral under political, social, or logistical pressure. Furthermore, while mega-events receive multi-million rupee custom AI infrastructure, 95% of public gatherings belong to the unfunded "long tail" of local, short-notice events that operate with zero digital safety tooling.

**CrowdSense** bridges this gap. It is an automated, flow-aware crowd surge early-warning and escalation system designed for rapid deployment at unfunded local events. By combining computer vision headcount detection with dense optical flow vector analysis (measuring directional convergence and circular velocity turbulence), CrowdSense detects structural crowd crush dynamics before fatal density thresholds are breached. When critical thresholds are violated or sudden panic signatures erupt, the system enforces automated, un-silenceable graduated escalation timers and immutable timestamped audit logging, explicitly removing human discretion and personal liability deferral from officials under pressure.

---

## 2. Real-World Grounding & Problem Analysis

### 2.1 Case Studies: Karur (2025) and Maha Kumbh Mela (2025)
* **Karur Political Rally (2025):** 41 fatalities occurred when a dense crowd surged toward an arrival convoy following a 7-hour delay. Despite 606 police personnel deployed on ground (exceeding official quota requirements), no forced crowd dispersal or perimeter venting was ordered as crowd density steadily reached lethal levels. Emergency response was severely compromised as ambulances were physically trapped in the unmanaged crowd bottleneck.
* **Maha Kumbh Mela (2025):** A state-of-the-art "Digital Maha Kumbh" command center deployed over 300 cameras, drone surveillance feeds, and real-time AI density monitoring. Yet, on the primary bathing day, a crowd crush killed ~30 people. Pontoon bridges intended as primary evacuation routes had been closed for VIP movement, and official administration required ~16 hours to hold an initial briefing.

### 2.2 Systemic Failure Mode: The Decision-Deferral Gap
In both incidents, crowd monitoring technology was either present or unnecessary to perceive the rising danger. The failure occurred in **operational decision-making under pressure**. Local officials faced with escalating crowd density defer action (such as halting a speaker, opening emergency gates, or rerouting VIPs) because taking action incurs immediate political or social friction, whereas deferring action carries no immediate penalty until disaster strikes. 

### 2.3 Target Segment: The Unfunded Long-Tail
Mega-events like Kumbh Mela receive dedicated telecommunications towers, custom command centers, and multi-year engineering budgets. The vast majority of casualties in India occur at local political rallies, regional temple festivals, and district processions. CrowdSense is specifically engineered for this **unfunded 95%**, requiring only commodity webcams/RTSP feeds and a laptop or local edge device to achieve operational safety automation within 5 minutes of setup.

---

## 3. Proposed Solution & Innovation

CrowdSense is an end-to-end crowd safety microservice architecture comprising an edge Computer Vision (CV) microservice, an automated Risk & Escalation Engine, a Node.js/Express backend with Socket.io real-time transport, SQLite audit logging, and a React operations command dashboard with dual-device field mobile interfaces.

```
       ┌────────────────────────────────────────────────────────┐
       │                CV MICROSERVICE (Python)                │
       │  • YOLOv8n + SAHI (320x320 sliced tiling, Conf 0.06)   │
       │  • VisDrone fine-tuned weights (yolov8n-visdrone.pt)   │
       │  • OpenCV Circular Head CLAHE + Hough Feature Detector  │
       │  • Farneback Dense Optical Flow (Convergence & Turb)   │
       └───────────────────────────┬────────────────────────────┘
                                   │ REST POST /api/density (1Hz)
                                   ▼
       ┌────────────────────────────────────────────────────────┐
       │                 BACKEND RISK ENGINE (Node.js)          │
       │  • Composite Risk Formula (Density, Slope, Flow)       │
       │  • Weather Sensitivity Modifiers (Heat/Rain Factors)   │
       │  • Graduated 30s Escalation Timers (official_1 -> _2)  │
       │  • Behavioral Panic Bypass (panic / exodus signatures) │
       │  • SQLite Audit DB Writer (audit_log.db)               │
       └───────────────────────────┬────────────────────────────┘
                                   │ Socket.io WebSockets
                                   ▼
  ┌────────────────────────────────┬────────────────────────────────┐
  │                                │                                │
  ▼                                ▼                                ▼
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────────┐
│ COMMAND DASHBOARD│    │ FIELD RESPONDER  │    │ CITIZEN SOS PORTAL   │
│ • Live Heatmap   │    │ • Zone Check-in  │    │ • Category Picker    │
│ • Trend Slope    │    │ • Nearest Team   │    │ • Live Status Track  │
│ • Audit Log View │    │ • Response Path  │    │ • SOS Dispatch       │
│ • Weather Control│    │ • Status Buttons │    │ • Peer Sync (Pt 5174)│
└──────────────────┘    └──────────────────┘    └──────────────────────┘
```

### Core Differentiators
1. **Built for Unfunded Long-Tail Events:** Designed for rapid, same-day setup using local webcams or RTSP video streams, eliminating the need for expensive permanent command centers or dedicated hardware.
2. **Flow-Aware vs. Static Density:** Grounded in G. Keith Still's crowd dynamics research, CrowdSense evaluates motion vector fields. A venue at moderate static density becomes lethal if crowds converge onto a single exit or exhibit chaotic counter-flow turbulence. CrowdSense quantifies flow convergence and vector turbulence in real time.
3. **Automated Escalation & Timestamped Accountability:** The system removes human discretion by executing mandatory, un-silenceable escalation timers (e.g., 30 seconds to senior officials) and logging all alerts, acknowledgments, and responder status changes to a read-only SQLite audit database. Inaction is rendered visible and provable.

---

## 4. System Architecture & Model History

### 4.1 Architecture Pipeline
The architecture consists of four decoupled layers:
1. **CV Microservice (Python / OpenCV / Ultralytics):** Runs continuous multi-zone frame capture, head detection, dense optical flow calculation, and JSON metric emission.
2. **Backend Services (Node.js / Express / Socket.io / SQLite):** Consumes CV metrics, calculates normalized composite risk scores, manages escalation state machines, updates weather modifiers, and persists events into `audit_log.db`.
3. **Frontend Applications (React / TailwindCSS / Lucide-React / Socket.io-client):**
   * **Command Ops Dashboard (Port 5173 / LIVE Tab):** Multi-zone video stream preview, risk gauges, trend extrapolation graph, active alert panel, and audit log inspector.
   * **Field Responder Interface (DUAL_SIM Tab / Port 5174):** Mobile view providing zone check-in, nearest-team lookup, pre-authored response routes, alert audio cues, and status toggles (`en_route`, `on_scene`, `resolved`, `need_backup`).
   * **Citizen SOS Portal (DUAL_SIM Tab / Port 5174):** Mobile emergency report submission interface synchronized bidirectionally with responder views over Socket.io.
   * **Post-Event Analysis & Venue Map Views:** Historical milestone review and interactive bottleneck egress visualization.
4. **Real-Time Notification Layer:** High-priority WebSockets (`alert_triggered`, `alert_escalated`, `alert_panic`, `mock_dispatch_toast`) and Web Audio API synthesizer cues.

### 4.2 Person Counting Model History & Density-Regression Outcomes

```
           ┌──────────────────────────────────────────────┐
           │   Standard YOLOv8n Whole-Frame (COCO)        │
           │   • Issue: Severe occlusion & small head     │
           │     drop-off at high crowd density           │
           └──────────────────────┬───────────────────────┘
                                  │
                                  ▼
           ┌──────────────────────────────────────────────┐
           │   VisDrone Checkpoint + SAHI Sliced Tiling   │
           │   • Slices frame into 320x320 tiles          │
           │   • Detects small head dots (Conf 0.06)      │
           │   • Added OpenCV Hough Circle CLAHE pass     │
           └──────────────────────┬───────────────────────┘
                                  │
         ┌────────────────────────┴────────────────────────┐
         │                                                 │
         ▼                                                 ▼
┌──────────────────────────────┐        ┌──────────────────────────────┐
│  TransCrowd (Transformer)    │        │  Soft-CSRNet (Density Map)   │
│  • EVALUATED & ROLLED BACK   │        │  • PROTOTYPED & ROLLED BACK  │
│  • High latency (>1.2s/frame)│        │  • Edge calibration failure &│
│  • Edge GPU memory exhaustion│        │    integration complexity    │
└──────────────────────────────┘        └──────────────────────────────┘
                                  │
                                  ▼
           ┌──────────────────────────────────────────────┐
           │      FINAL LIVE SHIPPED DEFAULT STACK        │
           │  • YOLOv8n + SAHI (320x320, 20% overlap)     │
           │  • VisDrone fine-tuned weights               │
           │  • CLAHE + Hough Circle Head Feature Extraction│
           │  • Farneback Dense Optical Flow (Python)     │
           └──────────────────────────────────────────────┘
```

#### Detailed Model Evolution Trail:
* **Baseline Whole-Frame YOLOv8n:** Initial tests with standard COCO-trained YOLOv8n at 640px resolution showed significant drop-offs in detection when crowd density exceeded 2.0 people/m² due to body occlusion and small pixel scales in aerial drone angles.
* **VisDrone Fine-Tuning + SAHI Integration:** Migrated to `yolov8n-visdrone.pt` (trained on aerial drone datasets) combined with SAHI (Slicing Aided Hyper Inference). SAHI divides input frames into 320x320 sliced tiles with 20% overlap, enabling ultra-sensitive confidence thresholds ($\text{Conf} = 0.06$) for head dot detection, combined with an OpenCV CLAHE + Hough Circle Feature Extraction pass for invariant head geometries.
* **TransCrowd Evaluation & Rollback:** To handle extreme crowding, TransCrowd (a Transformer-based sequence-to-sequence density regression model) was evaluated. However, testing revealed inference latencies exceeding 1,200 ms per frame on commodity hardware and excessive VRAM requirements. TransCrowd was rolled back to maintain real-time execution (<500 ms target).
* **Soft-CSRNet Evaluation & Rollback:** A density-map regression approach based on Soft-CSRNet was prototyped under `cv-service/soft_csrnet`. While density maps perform well on static benchmark datasets, Soft-CSRNet failed to provide discrete bounding boxes required for spatial optical flow tracking and exhibited severe drift under varying camera homography angles. It was rolled back.
* **Shipped Default:** The final shipped pipeline uses **YOLOv8n + SAHI Sliced Tiling + Hough Circle Feature Extraction**, achieving a reliable balance of density estimation, bounding box output for motion analysis, and real-time execution.

---

## 5. Technical Approach — Per Module

### 5.1 Person/Crowd Counting Microservice
* **Mode-Aware Execution:**
  * **Drone Overhead Mode:** Runs SAHI sliced inference every 3.0 to 4.0 seconds (`DRONE_ANALYSIS_INTERVAL_SEC`) at confidence 0.06 with 1280px resolution to process heavy aerial detail without system lag. Streams evaluated step frames to dashboard.
  * **CCTV Ground Mode:** Runs whole-frame YOLOv8n inference every 1.0 second (`CCTV_ANALYSIS_INTERVAL_SEC`) at confidence 0.30 (strict floor) to prevent false positives from background clutter, while maintaining smooth 30 FPS video playback.
* **Bounding Box Centroid NMS:** Spatial distance deduplication merges duplicate bounding boxes across overlapping SAHI tiles if centroids lie within 20 pixels ($\text{min\_dist\_px} = 20.0$).

### 5.2 Dense Optical Flow & Panic Signature Fast-Path
* **Algorithm:** OpenCV Farneback Dense Optical Flow (`cv2.calcOpticalFlowFarneback`) computed on gray-scale frames scaled to 640px width (`pyr_scale=0.5, levels=3, winsize=15, iterations=3`).
* **Flow Metrics:**
  * **Flow Convergence ($\text{conv\_norm}$):** Mean dot product of motion vectors normalized toward the zone exit/focal point $(X_{\text{focal}}, Y_{\text{focal}})$. Ranges from 0.0 (perpendicular/divergent) to 1.0 (perfect alignment to exit).
  * **Flow Turbulence ($\text{turb\_norm}$):** Circular variance of motion direction angles derived from circular statistics:
    $$\overline{\cos} = \frac{1}{N}\sum \cos(\theta_i), \quad \overline{\sin} = \frac{1}{N}\sum \sin(\theta_i)$$
    $$R = \sqrt{\overline{\cos}^2 + \overline{\sin}^2}, \quad \text{Flow Turbulence} = 1.0 - R$$
    High turbulence ($1 - R \to 1.0$) indicates chaotic counter-flow preceding crowd crush.
* **Behavioral Emergency Fast-Paths:**
  * **Panic Signature (Crowd Crush):** Triggers when turbulence spikes $> 0.50$ simultaneously with acceleration $> 0.60$ above a rolling Exponential Moving Average (EMA, $\alpha=0.25$) magnitude baseline, or when sustained turbulence $> 0.65$ persists over 3 consecutive windows at density $\ge 0.30$ p/m² (CCTV) or $1.00$ p/m² (Drone). Confirmed over 2 consecutive frames (`PANIC_CONFIRM_FRAMES`).
  * **Exodus Signature (Mass Evacuation):** Triggers when directional coherence $R > 0.50$ and mean speed $> 4.0$ px/frame persist over 2 consecutive windows, detecting rapid unidirectional fleeing (e.g., fire evacuation).

### 5.3 Composite Risk Score Engine Formula
Implemented in `backend/src/services/riskEngine.js`, the composite risk score combines four normalized parameters:

$$\text{risk\_score} = (\text{density\_norm} \times 0.50) + (\text{trend\_norm} \times 0.30) + (\text{conv\_norm} \times 0.10) + (\text{turb\_norm} \times 0.10)$$

*(If optical flow is disabled via environment variables, the engine falls back to $0.70 \times \text{density\_norm} + 0.30 \times \text{trend\_norm}$.)*

#### Formula Terms & Normalization Rules:
1. **Density Term ($\text{density\_norm}$):**
   $$\text{effectiveRedThreshold} = \text{baseRedThreshold} \times \text{densityFactor}$$
   $$\text{density\_norm} = \min\left(1.0, \max\left(0.0, \frac{\text{density}}{\text{effectiveRedThreshold}}\right)\right)$$
   * $\text{baseRedThreshold}$: 3.5 people/m² for `general` zones; 2.0 people/m² for `corridor` zones.
2. **Trend Slope Term ($\text{trend\_norm}$):**
   $$\text{trend\_slope} = \frac{\text{density}_{t} - \text{density}_{t - \Delta t}}{\Delta t \text{ (minutes)}}$$
   $$\text{trend\_norm} = \min\left(1.0, \max\left(0.0, \frac{\text{trend\_slope}}{2.0}\right)\right)$$
   Calculated over a rolling 60-second window ($\text{HISTORY\_WINDOW\_MS} = 60,000$).
3. **Flow Terms ($\text{conv\_norm}, \text{turb\_norm}$):**
   $$\text{conv\_norm} = \min(1.0, \max(0.0, \text{flow\_convergence} \times \text{flowFactor}))$$
   $$\text{turb\_norm} = \min(1.0, \max(0.0, \text{flow\_turbulence} \times \text{flowFactor}))$$
4. **Risk Level Step Mapping:**
   * Green: $\text{risk\_score} < 0.35$ (general) / $< 0.25$ (corridor)
   * Yellow: $0.35 \le \text{risk\_score} < 0.60$ (general) / $0.25 \le \text{risk\_score} < 0.50$ (corridor)
   * Orange: $0.60 \le \text{risk\_score} < 0.80$ (general) / $0.50 \le \text{risk\_score} < 0.70$ (corridor)
   * Red: $\text{risk\_score} \ge 0.80$ (general) / $\ge 0.70$ (corridor)
5. **Fast-Path Modifications:**
   * **Turbulence Step-Up:** If $\text{turb\_norm} > 0.88$, risk level steps up by one level (Green $\to$ Yellow, Yellow $\to$ Orange).
   * **Panic / Exodus Bypass:** If `panic_signature` or `exodus_signature` is true, $\text{risk\_score} = \max(\text{risk\_score}, 0.90)$ and $\text{risk\_level} = \text{"red"}$.
6. **Linear Projection Rate-of-Rise (ETA to Red):**
   $$\text{eta\_to\_red\_min} = \left\lceil \frac{\text{effectiveRedThreshold} - \text{density}}{\text{trend\_slope}} \right\rceil \quad \text{if } \text{trend\_slope} > 0 \text{ and } \text{density} < \text{effectiveRedThreshold}$$

### 5.4 Alert, Escalation, and Audit-Log System
* **Graduated Escalation Path:** When a zone breaches Red threshold through density accumulation, an alert (`alert_type: "graduated_escalation"`) is assigned to `official_1`. If unacknowledged within 30 seconds (`ESCALATION_TIMEOUT_SEC`), a Node.js timer executes `handleAutoEscalation()`, reassigning the alert to `official_2`, recording `escalated_at` and `escalated_to`, and broadcasting `alert_escalated` over WebSockets.
* **Immediate Panic Bypass:** When `panic_signature` or `exodus_signature` is detected, the 30-second timer is bypassed. An immediate panic alert (`alert_type: "immediate_panic_alert"`) fires instantly to `assigned_to: "all_officials"` and emits a simulated dispatch notification (`mock_dispatch_toast`).
* **Confirmation & Auto-Expiry:** Panic alerts require 2 consecutive frames of positive detection (`PANIC_CONFIRM_FRAMES = 2`) to prevent transient optical flow noise. If no panic signal is received for 20 seconds (`PANIC_ALERT_TTL_MS = 20,000`), active panic alerts auto-expire to handle video loop restarts cleanly.
* **SQLite Audit Log Schema (`audit_log.db`):**
  ```sql
  CREATE TABLE audit_log (
    alert_id TEXT PRIMARY KEY,
    zone_id TEXT NOT NULL,
    severity TEXT NOT NULL,
    alert_type TEXT NOT NULL,
    triggered_at TEXT NOT NULL,
    assigned_to TEXT,
    acknowledged_at TEXT,
    acknowledged_by TEXT,
    escalated_at TEXT,
    escalated_to TEXT,
    responder_status TEXT,
    category TEXT,
    description TEXT
  );
  ```

### 5.5 Citizen Reporting Interface
* Integrated directly into the main alert pipeline via `POST /api/citizen-reports`.
* Crowd members select incident categories (`MEDICAL_ASSISTANCE`, `SUSPICIOUS_ACTIVITY`, `REPORT_THEFT`, `BLOCKED_EXITS`, `STAMPEDE_RISK`, `GENERAL_PANIC`) and select their zone.
* Inserts an entry into `audit_log.db` with `alert_type: "citizen_report"` and `assigned_to: "all_officials"`. Panic categories assign Red severity; others assign Orange.
* Broadcasts `alert_triggered` to Command Dashboard and Field Responder views, and streams real-time status updates back to the citizen UI as field responders update operational status.

### 5.6 Field-Responder Interface
* Surfaces active alerts to ground field personnel.
* Features manual zone check-in (`POST /api/responders/checkin`), nearest-team lookup (`GET /api/responders/nearest`), pre-authored route display (`RESPONSE_ROUTES`), single-tap acknowledgment (`POST /api/alerts/:id/acknowledge`), and a 2x2 status toggle grid (`en_route`, `on_scene`, `resolved`, `need_backup`).
* **Explicit Simplifications:**
  * **Manual Zone Check-in:** Uses zone selection lookup rather than live GPS tracking. Distance is computed as 0 (same zone) or 1 (adjacent zone in `ZONE_ADJACENCY` table).
  * **Pre-Authored Routes:** Response paths (e.g., `"Zone 1 -> Gate Throat -> Zone 2"`) are static string definitions, not runtime pathfinding algorithms.
  * **In-App WebSocket Alerts:** Alerts deliver via WebSocket feed and Web Audio API synth cues; no OS push notifications are used.

### 5.7 Weather & Environmental Modifier Engine
* Managed by `backend/src/services/weatherService.js` and controlled via `POST /api/conditions/set`.
* Presets:
  * `clear`: Baseline ($\text{density\_factor} = 1.0$, $\text{flow\_factor} = 1.0$, 28°C).
  * `extreme_heat`: 42°C, Heat Index 46°C. Reduces red density threshold by 25% ($\text{density\_factor} = 0.75$), accounting for crowd heat stress.
  * `heavy_rain`: 35mm rain. Increases flow sensitivity by 50% ($\text{flow\_factor} = 1.5$) to compensate for slippery terrain and reduced visual clarity (CV confidence drops to 74%).
  * `hot_and_rainy`: Combined preset ($\text{density\_factor} = 0.75$, $\text{flow\_factor} = 1.5$, CV confidence 71%).
* **Explicit Demo Scope:** Weather conditions are manually controlled via presenter demo controls (`WeatherControlPanel.jsx`) for evaluation purposes and are not connected to a live meteorological API.

---

## 6. Technology Stack

| Layer | Language / Framework | Key Libraries / Modules | Deployment Role / Purpose |
|---|---|---|---|
| **CV Microservice** | Python 3.10+ | Ultralytics YOLOv8, SAHI, OpenCV (`cv2`), NumPy | Head detection, optical flow, frame streaming (Port 5001) |
| **Backend Core** | Node.js (v18+) / Express | Socket.io, `sqlite3`, `dotenv`, `cors` | Risk Engine, escalation state machine, REST endpoints (Port 4000) |
| **Database** | SQLite3 | Embedded `audit_log.db` | Immutable timestamped audit log & incident history |
| **Frontend Shell** | React 18 / Vite | TailwindCSS, Socket.io-client, Lucide-React | Command Ops Dashboard & Dual Phone Simulator (Port 5173 / 5174) |
| **Real-Time Transport**| Socket.io (WebSockets) | `density_update`, `alert_triggered`, `alert_escalated` | Low-latency metric streaming & alert synchronization |
| **Audio Alert Subsystem**| Web Audio API | Browser Synthesizer Oscillators | Single-tone & dual-tone siren cues for active alerts |
| **External SDKs (Roadmap)**| *Twilio / Bridgefy / OpenWeatherMap* | *Roadmap items — not connected in current build* | *Future SMS, offline mesh, & live weather integrations* |

---

## 7. Data Flow & API Contract

Reconciled verbatim against `docs/api-contract.md` and active backend implementation:

### 7.1 CV Service → Backend (`POST /api/density`) — 1 Hz Push
```json
{
  "zone_id": "zone_1",
  "zone_type": "general",
  "feed_source": "live_webcam",
  "camera_type": "drone",
  "people_count": 42,
  "area_sqm": 250.0,
  "density": 0.168,
  "flow_convergence": 0.32,
  "flow_turbulence": 0.15,
  "panic_signature": false,
  "exodus_signature": false,
  "timestamp": "2026-08-23T10:15:32.000Z"
}
```

### 7.2 Backend → Frontend (Socket.io `density_update` Event)
```json
{
  "zone_id": "zone_1",
  "zone_type": "general",
  "feed_source": "live_webcam",
  "camera_type": "drone",
  "risk_level": "yellow",
  "risk_score": 0.42,
  "density": 0.168,
  "density_norm": 0.048,
  "trend_slope": 0.12,
  "trend_norm": 0.06,
  "flow_convergence": 0.32,
  "flow_turbulence": 0.15,
  "panic_signature": false,
  "exodus_signature": false,
  "behavioral_trigger": null,
  "eta_to_red_min": 18,
  "red_threshold": 3.5,
  "base_red_threshold": 3.5,
  "people_count": 42,
  "area_sqm": 250.0,
  "weather_modifier": {
    "condition": "clear",
    "density_factor": 1.0,
    "flow_factor": 1.0,
    "cv_confidence": 96
  },
  "timestamp": "2026-08-23T10:15:32.000Z"
}
```

### 7.3 Alert / Audit Log Data Shape
```json
{
  "alert_id": "alt_1724408132000_482",
  "zone_id": "zone_1",
  "severity": "red",
  "alert_type": "graduated_escalation",
  "triggered_at": "2026-08-23T10:16:00.000Z",
  "assigned_to": "official_1",
  "acknowledged_at": "2026-08-23T10:16:12.000Z",
  "acknowledged_by": "official_1",
  "escalated_at": null,
  "escalated_to": null,
  "responder_status": "en_route",
  "category": null,
  "description": null
}
```

### 7.4 Post-Event Timeline Endpoint (`GET /api/post-event-timeline`)
```json
{
  "zone_id": "zone_1",
  "generated_at": "2026-08-23T10:20:00.000Z",
  "alerts": [
    {
      "alert_id": "alt_1724408132000_482",
      "zone_id": "zone_1",
      "severity": "red",
      "alert_type": "immediate_panic_alert",
      "triggered_at": "2026-08-23T10:16:00.000Z"
    }
  ],
  "summary": {
    "total_alerts": 1,
    "panic_alerts": 1,
    "escalated_alerts": 0,
    "acknowledged_alerts": 1
  }
}
```

---

## 8. Authoritative Disclosed System Limitations

Directly extracted from `KnownLimitationsModal.jsx` (Section 12 of Master Blueprint):

1. **Manual Fixed Area Calibration:** Zone footprint square metres (`area_sqm`) is a manually configured constant for this demo, not dynamically estimated via camera homography correction.
2. **Optical Flow vs Per-Person Tracking:** Uses OpenCV dense optical flow (Farneback) for motion vector fields instead of identity tracking (ByteTrack), trading identity precision for demo reliability at extreme densities.
3. **Pre-Recorded Demo Feed:** Zone 2 Emergency Corridor uses pre-recorded crowd footage (or synthetic generator) on a loop to reliably push density past red thresholds during judge evaluation.
4. **Simulated Dispatch & Announcements:** Police/ambulance dispatch and siren triggers are simulated UI actions (mock toasts) and not connected to live emergency services API infrastructure.
5. **Privacy & Identity Preservation:** Anonymous headcount & density metrics only. Zero facial recognition, biometric identity storage, or individual tracking is performed.
6. **Responder Check-In (Manual Zone):** Nearest-team assignment uses manual zone check-in, not live GPS tracking. Responders select their current zone at check-in; "nearest team" means the closest checked-in zone to the alert zone—a simple lookup, not coordinate math. No location data is collected or stored.
7. **Pre-Authored Response Routes:** Recommended response paths shown to field responders are pre-defined, hand-authored zone-to-zone connections in the system configuration—not computed at runtime. No pathfinding algorithm, graph traversal, or live obstacle-avoidance routing is used.
8. **In-App Alert Notifications (No Push):** Field responder alerts are delivered via a persistent live in-app WebSocket feed with audio cue (Web Audio API). No OS-level push notifications or background service workers are used. The responder tab must remain open to receive alerts.
9. **Simulated Weather Conditions & Demo Controls:** Weather conditions are simulated and manually set via presenter demo controls, not pulled from a live weather service. Preset environmental conditions (including a combined Hot + Heavy Rain preset) are mutually exclusive menu selections for this demo. Production deployment would integrate a live API (e.g., OpenWeatherMap) for continuous real-time conditions at the venue.

---

## 9. Feasibility & Implementation Tiering Matrix

| Feature / Module | Implementation Tier | Actual Current Build Status |
|---|---|---|
| **YOLOv8n + SAHI Head Count** | **Fully Real & Live-Demoable** | Live execution on webcam & pre-recorded video feeds at 1–4 sec intervals. |
| **Farneback Optical Flow** | **Fully Real & Live-Demoable** | Motion vector field computation, convergence, turbulence, & panic/exodus bypass. |
| **Composite Risk Engine** | **Fully Real & Live-Demoable** | Weighted formula, slope calculation, turbulence step-up, & panic overrides. |
| **Graduated Escalation & Audit Log**| **Fully Real & Live-Demoable** | 30s unacknowledged timer, auto-escalation to `official_2`, SQLite DB persistence. |
| **Dual Phone Simulator (Port 5174)**| **Fully Real & Live-Demoable** | Side-by-side Citizen SOS & Responder views with real-time peer WebSocket sync. |
| **Citizen Emergency SOS App** | **Fully Real & Live-Demoable** | Category picker, zone selection, DB insertion as `citizen_report`, live status feedback. |
| **Post-Event Timeline Analysis** | **Fully Real & Live-Demoable** | Historical timeline review and alert milestone summary endpoint. |
| **Responder Check-in & Route** | **Built but Simplified** | Manual zone check-in (not GPS); pre-authored route strings (not computed paths). |
| **Area Calibration** | **Built but Simplified** | Fixed manual constant (`AREA_SQM`), not dynamic 3D camera homography. |
| **Weather Modifiers** | **Simulated for Demo** | Presenter control panel with presets (Heat/Rain) scaling risk thresholds manually. |
| **Emergency Dispatch & Sirens** | **Simulated for Demo** | UI toasts tagged `[SIMULATION ONLY]`; no live emergency dispatch integration. |
| **Venue Exit Map** | **Simulated for Demo** | Annotated static venue SVG layout with marked choke points and egress doors. |
| **GPS Nearest-Responder Matching**| **Roadmap Only** | Planned continuous device GPS tracking for automatic nearest team dispatch. |
| **Runtime Dynamic Routing** | **Roadmap Only** | Planned pathfinding algorithms (A*/Dijkstra) with live obstacle avoidance. |
| **OS-Level Push Notifications** | **Roadmap Only** | Planned Web Push API / Service Worker background notification integration. |
| **Offline Mesh Networking** | **Roadmap Only** | Planned Bridgefy SDK integration for off-grid peer-to-peer relay during network outages. |
| **Live Weather API Integration** | **Roadmap Only** | Planned OpenWeatherMap API connection for automated real-time environmental ingestion. |

---

## 10. Impact & Operational Distribution Strategy

### 10.1 Intended Primary Users: District Police & Permitting Authorities
In India, organizing any public gathering above a minimum threshold (religious processions, political rallies, commercial expos) legally requires prior written permission from the **District Magistrate (DM)** and **Superintendent of Police (SP)**. 

This regulatory gate provides a natural deployment and distribution pathway:
1. **Permit Approval Mandate:** District authorities can mandate the setup of CrowdSense as a condition for granting event permits for mid-to-large gatherings.
2. **Standardized Operations:** Venue parameters ($\text{area\_sqm}$, exit points) are registered during permit filing. On event day, duty officers connect existing CCTV or temporary webcams to the local edge node.
3. **Command Control:** District police command centers gain real-time oversight of multiple concurrent local events across a municipality without dispatching excessive personnel.

### 10.2 Addressing the Operational Failure Mode
Generic crowd-counting software provides passive metrics that officials can easily ignore during politically sensitive events. CrowdSense specifically targets the **decision-deferral failure mode**:
* **Enforced Escalation:** Unacknowledged warnings escalate automatically to higher-ranking officers, removing single-point discretion.
* **Legal Audit Trail:** The immutable SQLite log records the exact second an alert breached red thresholds, who was assigned, and when it was acknowledged or escalated. This creates clear legal accountability, motivating early preventative action rather than passive delay.

---

## 11. Comprehensive System Roadmap

Compiled from the accumulated development roadmap across project milestones:

1. **Real-Time GPS-Based Nearest-Responder Matching:** Replace manual zone selection at check-in with continuous background device GPS tracking to calculate true distance metrics and automatically match the nearest patrol team.
2. **True Dynamic Routing & Live Obstacle Avoidance:** Replace pre-authored static route strings with runtime graph traversal algorithms (e.g., A* or Dijkstra) that compute optimal evacuation paths based on live corridor density and exit blockage data.
3. **OS-Level Service-Worker Push Notifications:** Implement Web Push API and background service workers so field responders receive high-priority alert tones and notifications even when their mobile browser tab is closed or backgrounded.
4. **Offline Mesh Networking (Bridgefy Precedent):** Integrate peer-to-peer Bluetooth/Wi-Fi Direct mesh networking SDKs (specifically Bridgefy, as proven in disaster and protest scenarios) to maintain alert transmission between citizen phones, field responders, and edge nodes when local cellular towers collapse due to crowd congestion.
5. **Live Weather API Integration:** Connect backend services to live meteorological APIs (e.g., OpenWeatherMap) to ingest real-time ambient temperature, humidity, heat index, and precipitation data, dynamically scaling risk thresholds without manual presenter control intervention.
6. **Per-Camera Homography Calibration:** Implement interactive multi-point homography calibration tools allowing operators to mark ground planes on camera feeds, enabling precise pixel-to-square-metre perspective transformation.
7. **Identity-Preserving Per-Person Tracking (ByteTrack):** Integrate lightweight multi-object tracking (ByteTrack) for low-to-medium density zones to extract individual velocity trajectories, complementing dense optical flow in sparse crowd areas.
8. **Tamper-Evident Hash-Chained Audit Logging:** Upgrade the SQLite audit database with cryptographic hash-chaining (SHA-256 block chaining) per log entry to guarantee tamper-proof audit trails for post-incident judicial inquiries.
9. **Combined Environmental & Physical Choke Point Modeling:** Expand venue map modeling to dynamically adjust flow turbulence thresholds based on physical geometry (staircases, narrow gates, pontoon bridges).

---

## 12. References & Technical Grounding

1. **Karur Political Rally Incident Report (2025):** Analysis of crowd dynamics, 7-hour arrival delay factors, and emergency vehicle obstruction during local political gathering stampedes.
2. **Maha Kumbh Mela Command Audit (2025):** Evaluation of digital surveillance limitations, VIP corridor closures, and administrative briefing delays during mega-event crowd crushes.
3. **Fruin, J. J. (1971):** *Pedestrian Planning and Design.* Metropolitan Area Planning Council, New York. (Establishes Level of Service [LOS] crowd density thresholds: safe $<1.08$ p/m², critical $>2.15$ p/m², crush hazard $>3.8$ p/m²).
4. **Still, G. K. (2014):** *Introduction to Crowd Science.* CRC Press. (Defines force transmission in dense crowds, directional flow convergence, and vector turbulence as primary physical drivers of crowd crush injuries).
5. **Farnebäck, G. (2003):** "Two-Frame Motion Estimation Based on Polynomial Expansion." *Image Analysis*, SCIA 2003. Lecture Notes in Computer Science, vol 2749. Springer. (Theoretical foundation for OpenCV dense optical flow vector extraction).
6. **VisDrone Challenge Dataset (2021):** *Drone-based Vision Sensing for Object Detection and Tracking.* IEEE Transactions on Pattern Analysis and Mean Intelligence. (Dataset utilized for fine-tuning `yolov8n-visdrone.pt` aerial head detection).
7. **Soft-CSRNet & TransCrowd Evaluation Literature:** Comparative studies on density map regression versus detection-based architectures in high-density real-time edge processing.
