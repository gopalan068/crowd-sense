# Crowd Safety Early-Warning & Accountability System
### Master Blueprint — SIH Internal Hackathon Round

---

## 1. Problem Statement

Large public gatherings in India — political rallies, religious festivals, processions — repeatedly turn deadly, and the pattern repeats regardless of scale or budget:

- **Karur (2025):** A political rally stampede killed 41 people. The crowd surged toward a convoy after a ~7-hour arrival delay. 606 police personnel were deployed — more than officially required — yet no forced dispersal happened as density kept climbing. Ambulances were reportedly physically blocked by the crowd during rescue.
- **Maha Kumbh Mela (2025):** Despite ~300 cameras, drone coverage, and an AI-driven "Digital Maha Kumbh" command center predicting crowd sizes in real time, a stampede on the biggest bathing day killed ~30 people. Pontoon bridges meant for crowd dispersal were closed for VIP movement in the days prior, and the administration took ~16 hours to hold its first briefing.

**The core insight driving this project:** in both cases, the technology to *detect* dangerous crowd conditions either existed or wasn't the bottleneck. The failure was in **decision-making under pressure** — officials had the information and still didn't act in time, often because acting (halting an event, diverting a VIP) carries political or social cost that's easier to defer.

**The real gap** is not mega-events like Kumbh, which already receive massive, purpose-built infrastructure. It's the **long tail of ad hoc, unfunded, short-notice gatherings** — local rallies, temple festivals, processions — that get zero digital safety infrastructure and rely entirely on manual policing judgment calls.

---

## 2. Core Innovation

This is **not** a rebuild of Kumbh's density-counting system. Three things differentiate it:

1. **Built for the long tail, not mega-events.** Designed to be set up same-day/same-week on an unfamiliar ground with minimal infrastructure (a couple of cameras, not a permanent command center) — the case that currently gets nothing.
2. **Flow-aware, not just density-aware.** Crowd crush research (G. Keith Still) shows crush injuries come from *converging or opposing flows*, not static density alone. A ground can be at "safe" density and still be lethal if people are surging toward one point. Kumbh's system was fundamentally headcount-based — this system explicitly measures convergence and turbulence, which is closer to what likely happened at Karur.
3. **Removes discretion from officials under pressure.** Auto-escalating alerts and a timestamped, tamper-evident audit trail mean inaction becomes visible and provable after the fact — directly targeting the actual failure mode seen at both Karur and Kumbh (known danger, deferred action).

**One-line pitch:** *"The tech to detect dangerous crowds already exists, even at billion-rupee scale, and people still died. What's missing isn't detection — it's a system that makes inaction costly and visible, and that works for the thousands of unfunded local events nobody builds Kumbh-scale infrastructure for."*

---

## 3. Demo Scope (Internal Hackathon Round)

- **One demo venue**, defined with 2+ zones: e.g., a general gathering area + one emergency corridor/exit path.
- **Hybrid data source:**
  - **Live webcam feed** of the room/audience — real-time detection running on judges, for credibility.
  - **Pre-recorded dense crowd footage** fed in as a second zone, specifically to push density/flow past red thresholds and demonstrate the alert chain. State clearly that this feed is pre-recorded — honesty here builds trust rather than costing it.
- **Live working demo required** — every "Core" tier feature below must run live, no slides pretending to be software.

---

## 4. Feature List & Build Tiers

| # | Feature | Tier | Notes |
|---|---|---|---|
| 1 | Live person counting + density calc | **Core** | YOLOv8n person detection, frame-sampled |
| 2 | Zone heatmap on dashboard | **Core** | Visual, high impact, cheap to build |
| 3 | Threshold-based alert trigger | **Core** | Configurable per-zone thresholds |
| 4 | Escalation timer (auto-escalate if unacknowledged) | **Core** | Pure backend logic |
| 5 | Timestamped audit log | **Core** | Basic table is enough; hash-chaining optional stretch |
| 6 | Multi-zone support (2–3 zones) | **Core** | Live feed + recorded feed = 2 zones minimum |
| 7 | Emergency corridor monitoring | **Core** | Modeled as a special zone type, not a new subsystem |
| 8 | Trend graph (density over time) | **Tier 2** | Reuses stored density history |
| 9 | Rate-of-rise early warning (trend extrapolation) | **Tier 2** | Linear projection: "crosses red in ~N min" — **call this "early-warning via trend extrapolation," never "AI prediction"** |
| 10 | Flow/movement analysis (convergence + turbulence) | **Tier 2 — high risk, hard time-box** | Optical flow (Farneback), see Section 6 |
| 11 | Post-event analysis view | **Tier 2** | Reuses audit log + density history, low extra engineering |
| 12 | Bottleneck/exit-route modeling | **Mock only** | Static annotated map, manually marked choke points |
| 13 | Police/ambulance auto-dispatch | **Roadmap only** | No real system access — UI toast only, never imply real integration |
| 14 | Public announcement/siren trigger | **Roadmap only** | Same — mock UI, explicit "future integration" framing |

**Sequencing rule:** get the single-zone core loop (detect → density → threshold → alert → acknowledge → log) fully stable first. Everything else is an *extension* of that loop, not a separate build. If Feature 10 (flow analysis) proves fragile, time-box it hard and be ready to cut it to a roadmap slide without losing the rest of the demo.

---

## 5. Composite Risk Score (the core "intelligence" of the system)

Don't rely on density alone. Combine four signals per zone into one score:

```
risk_score = f(density, density_trend_slope, flow_convergence, flow_turbulence)
```

- **density** — people/sqm in the zone (from person detection ÷ calibrated area)
- **density_trend_slope** — rate of change over the last N readings (people/sqm per minute)
- **flow_convergence** — are motion vectors pointing toward a common point (stage, gate)?
- **flow_turbulence** — variance in movement direction within the zone (chaotic counter-flow)

Displayed as a single color-coded level (green/yellow/orange/red) with the four underlying numbers available on demand — this is what you show a judge who asks "how is this computed?"

**Why this matters for the pitch:** a ground can be at "safe" density and still be dangerous if people are converging on one point — this is likely closer to what happened at Karur than a simple headcount would capture, and it's a concrete technical answer to "how is this different from Kumbh's system."

---

## 6. Technical Approach — Flow/Movement Detection

- **Method:** OpenCV dense optical flow (Farneback) between consecutive frames — gives a field of motion vectors without needing to track individual identities.
- **Why not per-person tracking (ByteTrack, etc.):** more precise, but tracking breaks down exactly when density is highest (occlusion), and adds real integration risk right before a live demo. Optical flow gives ~80% of the safety value for a fraction of the engineering risk. Per-person tracking is a legitimate "next version" line in the pitch, not something to build for this round.
- **Derived signals per zone:**
  - Convergence score: vectors pointing toward a common focal point
  - Turbulence score: high local variance in direction (precursor to crush)

---

## 7. System Architecture

```
[Camera 1: Live webcam]  [Camera 2: Recorded feed] ...per zone
            │                       │
            ▼                       ▼
     ┌─────────────────────────────────┐
     │   CV Microservice (Python)      │
     │   - YOLOv8n person detection    │
     │   - Area calibration            │
     │   - Optical flow (Tier 2)       │
     │   Outputs: {zone_id, count,     │
     │   density, flow_metrics, ts}    │
     └───────────────┬─────────────────┘
                      │ REST/WebSocket push
                      ▼
     ┌─────────────────────────────────┐
     │   Backend (Node/Express or      │
     │   FastAPI)                      │
     │   - Risk score computation      │
     │   - Threshold engine            │
     │   - Escalation timers           │
     │   - Audit log writer            │
     │   - Notification dispatch       │
     └───────────────┬─────────────────┘
                      │ WebSocket (Socket.io)
                      ▼
     ┌─────────────────────────────────┐
     │   Frontend Dashboard (React)    │
     │   - Live camera + density view  │
     │   - Zone heatmap                │
     │   - Alert panel + acknowledge   │
     │   - Trend graph                 │
     │   - Audit log viewer            │
     │   - Post-event analysis view    │
     └─────────────────────────────────┘
                      │
                      ▼
        [Twilio SMS/WhatsApp — Tier 2 if time permits]
```

---

## 8. Recommended Tech Stack

| Layer | Tech | Notes |
|---|---|---|
| CV/detection | Python, OpenCV, Ultralytics YOLOv8n | Pretrained — no training needed |
| Flow analysis | OpenCV Farneback optical flow | Tier 2 |
| Backend/API | Node.js + Express, or FastAPI | Whichever the backend lead is stronger in |
| Real-time transport | Socket.io / WebSockets | Push density + alerts to dashboard |
| Database | SQLite or Firebase | No need for production DB for this round |
| Frontend | React + Tailwind | Matches team's core strength |
| Venue map | Leaflet or plain SVG overlay | Simplicity over polish for round 1 |
| Notifications | Twilio SMS/WhatsApp sandbox | Build a "demo mode" mock fallback in case venue wifi fails |

---

## 9. Data Schema / API Contract (lock this before writing code)

**CV service → Backend (pushed every ~1 sec per zone):**
```json
{
  "zone_id": "zone_1",
  "zone_type": "general | corridor",
  "people_count": 42,
  "area_sqm": 20,
  "density": 2.1,
  "flow_convergence": 0.3,
  "flow_turbulence": 0.15,
  "timestamp": "2026-08-20T10:15:32Z"
}
```

**Backend → Frontend (WebSocket event, includes computed risk):**
```json
{
  "zone_id": "zone_1",
  "risk_level": "yellow",
  "risk_score": 0.58,
  "density": 2.1,
  "trend_slope": 0.12,
  "eta_to_red_min": 6,
  "timestamp": "2026-08-20T10:15:32Z"
}
```

**Alert/audit log entry:**
```json
{
  "alert_id": "a123",
  "zone_id": "zone_1",
  "severity": "red",
  "triggered_at": "2026-08-20T10:16:00Z",
  "assigned_to": "official_1",
  "acknowledged_at": null,
  "escalated_at": null,
  "escalated_to": "official_2"
}
```

Agree on this contract **as a team before hour 0** — mismatched assumptions between the CV and backend developers is the single most common cause of lost hours at integration time.

---

## 10. Team Roles (5–6 people)

| Role | Owns |
|---|---|
| CV/detection lead (Python) | YOLOv8 setup, calibration, optical flow, exposing results via endpoint |
| Backend/integration lead | API, WebSocket server, DB schema, risk scoring, escalation logic, Twilio |
| Frontend lead 1 | Live view, zone heatmap, trend graph |
| Frontend lead 2 | Alert panel, acknowledgment UI, audit log + post-event analysis view |
| Pitch/demo/data prep | Sourcing demo footage, "replay as live feed" script, deck, rehearsing judge Q&A |

---

## 11. Execution Timeline

Run CV and backend/frontend **in parallel from hour 0** — don't build sequentially.

| Hours | CV Lead | Backend Lead | Frontend Leads |
|---|---|---|---|
| 0–4 | YOLOv8 running on sample video | API skeleton, DB schema | Wireframe dashboard |
| 4–14 | Calibration + optical flow prototyping | Alert/escalation logic (using stubbed/fake density data) | Build against mocked WebSocket events |
| 14–16 | **Integration**: swap real CV output into backend, swap real backend data into frontend | | |
| 16–24 | Flow analysis hardening (time-boxed) | Notification integration, audit log polish | Trend graph, corridor zone UI |
| 24–30 | Support integration/debugging | Escalation edge cases, post-event view | Polish, error states |
| 30–33 | Full run-through with demo footage | Full run-through | Full run-through |
| 33–36 | Pitch prep — everyone rehearses the "why different from Kumbh" answer together | | |

**Hard time-box:** if optical flow (Feature 10) isn't stable by a set checkpoint (e.g. hour 22), cut it to a roadmap slide. Never risk the core loop for a stretch feature.

---

## 12. Known Limitations — State These Proactively, Don't Wait to Be Asked

- Area calibration is a fixed manual estimate for this demo, not per-camera homography correction — a solvable production concern, flagged as future work.
- Flow analysis uses optical flow, not per-person tracking — a deliberate trade-off for demo reliability, not a limitation you're hiding.
- One feed is pre-recorded, not live drone footage — stated openly in the pitch.
- No real integration with police/ambulance dispatch or public announcement systems — explicitly roadmap, shown as mocked UI only.
- Anonymous headcount/density only — no facial recognition, no identity storage. State this unprompted; it preempts a surveillance concern and is a genuine design strength.

---

## 13. Roadmap / Future Work (for the pitch deck, not built now)

- Real per-camera calibration via homography
- Per-person tracking for higher-precision flow analysis
- Real integration with police/ambulance dispatch systems and district event-permission workflows
- Tamper-evident (hash-chained) audit log
- Deployment path: district police / event-permitting offices as primary users, since large gatherings already require permits in most of India — a natural distribution channel
- **Real-time GPS-based nearest-responder matching** — current implementation uses manual zone check-in (same as citizen zone selection); production version would use device GPS for continuous responder location without manual re-check-in
- **True dynamic routing and live obstacle-avoidance** — current implementation uses pre-authored zone-to-zone path labels (same scope decision as the bottleneck/exit-route modeling feature); production version would compute optimal paths from real-time corridor density and blocked-route data
- **OS-level push notifications via service-worker** — current implementation delivers alerts via a persistent in-app WebSocket feed with Web Audio API cue (tab must remain open); production version would use service-worker background sync so alerts reach the device even when the app is in the background
- **Live weather API integration (e.g. OpenWeatherMap)** — current implementation uses simulated presenter demo controls and presets; production version would ingest real-time environmental API streams to scale risk thresholds dynamically based on venue weather


