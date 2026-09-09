# CrowdSense UI Redesign Feature Mapping Specification (MAPPING_DOC.md)

**Document Version:** 1.0.0  
**Author:** AI Pair Programmer & System Architect  
**Source References:**  
- `AUDIT_INTEGRATION.md` (Comprehensive integration audit of frontend components, routes, sockets, DB tables, and gaps)  
- `crowdsense(2)(1).html` (Static visual and information architecture mockup of the simplified 6-page interface)  
- `frontend/src/` (Active codebase component tree)  

---

## 1. Executive Summary & Architectural Directives

This document maps all **100 numbered end-user and infrastructural features** from `AUDIT_INTEGRATION.md` (Sections 2 & 3) directly into the new **6-page UI architecture** defined by `crowdsense(2)(1).html`.

### The 6 Top-Level Pages
1. **Home (`landing`):** Landing overview, real-time command bar, multi-signal AI fusion preview, citizen emergency flow showcase, and the **Dual Phone Simulator** (Citizen SOS app + Tactical Responder mobile app side-by-side).
2. **Plan & Simulate (`plan`):** Comprehensive pre-event planner housing the 2D architectural layout editor (walls, barricades, exits, spawns, calibration), 2D Social Force Model (SFM) physics engine with playback controls, Three.js/WebGL 3D visualizer with OrbitControls and raycast gate toggles, and the multi-scenario "What If...?" comparative simulation suite with Gemini executive narrative synthesis.
3. **Live Monitor (`monitor`):** Real-time venue operational monitoring featuring the real **Zone 2 (Corridor) live camera/drone feed** (MJPEG stream with webcam/canvas fallback), live density vignette, Farneback optical flow motion gauges, density trend extrapolation curve, continuous risk telemetry log, environmental controls, and the grounded **CrowdSense AI Agent** control room assistant chat drawer.
4. **Evacuation (`evac`):** Real-time crisis routing and physical dispatch coordination embedding the interactive **2D Egress & Bottleneck Vector Map** (`BottleneckExitMap.jsx`), dynamic evacuation pipeline, choke point inspector, manual breach lock test deck, animated vehicle dispatch simulation with automatic surge halts, and multi-agency response coordination feed.
5. **Post-Incident (`post`):** Post-event intelligence and safety accountability suite providing interactive incident timeline scrutiny, root cause diagnostic grid, automated Capstone Report generation, SQLite cached report loading, historical report archive browsing, underlying raw JSON inspection, markdown clipboard export, and printable/PDF safety documentation.
6. **Command Center (`cc`):** Unified executive control room presenting high-level operational KPIs, live alert feed with automated graduated escalation, behavioral panic bypass handling, responder dispatch routing, interactive NDMA playbook resolution, historical incident audit log tables, and tactical emergency dispatch simulation.

### Fixed Architectural Placements (Mandatory Constraints Applied)
- **Home:** The `DualPhoneSimulator.jsx` component is mounted directly at the bottom of the Home page as a dedicated interactive showcase section.
- **Plan & Simulate:** Houses the full Planner suite (`PlannerPage.jsx`, `PlannerControls.jsx`, `Venue25DViewer.jsx`, and `PlannerReportPage.jsx`). The mockup's "What If...?" AI scenario card maps directly to the multi-scenario comparative batch simulator and Gemini narrative generator.
- **Live Monitor:** The mockup's generic SVG heatmap placeholder is replaced with the real Zone 2 camera stream (`ZonePanel.jsx`), optical flow gauges (`FlowMetricsDisplay.jsx`), and density trajectory projection (`TrendExtrapolationGraph.jsx`). Directly below the live telemetry, the grounded Control Room Assistant (`AssistantChatPanel.jsx`) is permanently embedded as the "CrowdSense AI Agent".
- **Evacuation:** The mockup's static SVG diagram is replaced by the interactive vector engine `BottleneckExitMap.jsx` with full corridor layer toggling, choke point inspection, manual breach locking, and vehicle transit simulation.
- **Command Center:** Incorporates the immutable Audit Log and Post-Event Milestone Timeline (`AuditLogView.jsx` and `GET /api/post-event-timeline`) alongside active alert triage and responder monitoring.
- **Post-Incident:** Houses the complete official reporting suite (`PostEventAnalysisView.jsx` and `PostEventReportDocument.jsx`).

---

## 2. Feature Mapping Summary Table (Grouped by New Page)

### Page 1: Home (`landing`) — 20 Features

| # | Feature Name (from audit) | Current Component(s) | Backend Route(s) / Socket Event(s) | New Page | New Section / Sub-tab / Drawer | Real Component to Reuse | Notes |
|:---|:---|:---|:---|:---|:---|:---|:---|
| **1** | System Health Check | `App.jsx` | `GET /health` | Home | Global Topnav / System Status Pill | `App.jsx` (Shell logic) | Polled or checked on load; drives the `"● AI ACTIVE / SYSTEM OK"` pill in topnav and command bar. |
| **2** | WebSocket Real-Time Connection Management | `App.jsx`, `ConnectionStatusBanner.jsx` | Socket.io (`connect`, `disconnect`) | Home | Global Topnav Status Pill | `ConnectionStatusBanner.jsx` | Persistent across all pages; turns green `● CONNECTED` or triggers amber reconnect banner on connection loss. |
| **3** | Manual WebSocket Reconnection Trigger | `ConnectionStatusBanner.jsx` | `socketInstance.connect()` via `onRetry` | Home | Global Topnav Reconnection Banner | `ConnectionStatusBanner.jsx` | Renders at top of viewport when socket is disconnected to allow instant retry. |
| **4** | Operations Tab Navigation Bar | `App.jsx` | Client-side view router (`showView`) | Home | Global Topnav (`nav-links`) | `App.jsx` / Mockup Nav | Navigates between Home, Plan & Simulate, Live Monitor, Evacuation, Post-Incident, and Command Center. |
| **5** | Dedicated Field Simulator Port Routing (Port 5174) | `App.jsx` | `window.location.port === '5174'` | Home | Router Auto-Redirect / Direct Section Anchor | `App.jsx` | When opened on port 5174, auto-scrolls/focuses on `#dual-simulator` section or isolates simulator view. |
| **6** | Dark / Light Theme Switcher | `App.jsx` | DOM `data-theme` attribute | Home | Global Topnav Action Button | `App.jsx` | Toggles high-contrast dark operations mode vs. light daytime operations styling. |
| **7** | Proactive Architectural Limitations Modal | `KnownLimitationsModal.jsx`, `App.jsx` | None (Client-side state) | Home | Global Topnav Header ("ℹ️" Button / Modal) | `KnownLimitationsModal.jsx` | Displays the 12 operational transparency disclosures (optical flow boundaries, simulated dispatches, NDMA scope). |
| **36** | Citizen Emergency SOS Form Intake | `CitizenReportView.jsx` | `POST /api/citizen-reports` | Home | Dual Phone Simulator (Left Phone / Citizen) | `CitizenReportView.jsx` | Form intake inside the Citizen mobile chassis; enhanced to include `STAMPEDE_RISK` and `GENERAL_PANIC`. |
| **37** | Citizen Live Emergency Status Tracker | `CitizenReportView.jsx` | Socket.io `alert_acknowledged`, `alert_status_updated` | Home | Dual Phone Simulator (Left Phone / Citizen) | `CitizenReportView.jsx` | Real-time 3-stage progress tracker advancing from Report Received → Acknowledged → Resolved. |
| **38** | Tactical Field Responder Check-In | `ResponderCheckin.jsx` | `POST /api/responders/checkin`, Socket `responder_checkin` | Home | Dual Phone Simulator (Right Phone / Responder) | `ResponderCheckin.jsx` | Call-sign and zone selection onboarding inside the Tactical Responder mobile frame. |
| **39** | Tactical Field Responder Change Zone Flow | `ResponderDashboard.jsx` | Client-side state switch | Home | Dual Phone Simulator (Right Phone / Responder) | `ResponderDashboard.jsx` | Allows active responders to switch assigned zones directly from the mobile header. |
| **42** | Tactical Field Alert Feed & Severity Filter | `ResponderDashboard.jsx` | Socket.io `alert_triggered`, `alert_escalated` | Home | Dual Phone Simulator (Right Phone / Responder) | `ResponderDashboard.jsx` | Mobile incident queue with `ALL`, `HIGH`, and `MEDIUM` priority filter chips. |
| **43** | Tactical Alert Staleness Ticker | `ResponderAlertCard.jsx` | Client-side timer (`setInterval`) | Home | Dual Phone Simulator (Right Phone / Responder) | `ResponderAlertCard.jsx` | Time-elapsed counter color-shifting green (<1m) → amber (1-3m) → flashing red (>3m). |
| **44** | Tactical Synthetic Audio Alert Tones | `ResponderDashboard.jsx` | Web Audio API `AudioContext` | Home | Dual Phone Simulator (Right Phone / Responder) | `ResponderDashboard.jsx` | Synthesizes 440Hz alert tones and 880Hz 3-pulse panic sirens on incoming alerts. |
| **45** | Tactical Audio Mute Control | `ResponderDashboard.jsx` | Client-side boolean state | Home | Dual Phone Simulator (Right Phone / Responder) | `ResponderDashboard.jsx` | Mute/unmute toggle silencing audio alarms on field devices. |
| **46** | Field Responder Alert Acknowledgment | `ResponderAlertCard.jsx` | Socket.io `acknowledge_alert` | Home | Dual Phone Simulator (Right Phone / Responder) | `ResponderAlertCard.jsx` | Mobile action button acknowledging incident and opening operational status controls. |
| **47** | Tactical Incident Full-Screen Modal Overlay | `ActiveIncidentResponseModal.jsx` | Client-side modal state | Home | Dual Phone Simulator (Right Phone / Responder) | `ActiveIncidentResponseModal.jsx` | Full-screen tactical overlay inside mobile chassis with route steps, status grid, and playbook. |
| **48** | Responder Operational Status Tracking | `ActiveIncidentResponseModal.jsx`, `ResponderAlertCard.jsx` | `POST /api/alerts/:id/status`, Socket `update_alert_status` | Home | Dual Phone Simulator (Right Phone / Responder) | `ActiveIncidentResponseModal.jsx` | Operational progression controls (`EN ROUTE`, `ON SCENE`, `RESOLVED`, `NEED BACKUP`). |
| **53** | Dual Phone Synchronization Simulation | `DualPhoneSimulator.jsx` | Bidirectional REST & Socket.io bus | Home | Bottom Showcase Section (`#dual-simulator`) | `DualPhoneSimulator.jsx` | Side-by-side synchronized framing demonstrating citizen report intake and instantaneous responder alert. |
| **99** | Static Frontend SPA Fallback | `backend/src/index.js` | HTTP `GET *` (Express static fallback) | Home | Server Routing / Shell Foundation | `backend/src/index.js` | Serves compiled SPA assets and routes non-API URLs to `index.html`. |

**Page 1 Subtotal:** 20 Features

---

### Page 2: Plan & Simulate (`plan`) — 24 Features

| # | Feature Name (from audit) | Current Component(s) | Backend Route(s) / Socket Event(s) | New Page | New Section / Sub-tab / Drawer | Real Component to Reuse | Notes |
|:---|:---|:---|:---|:---|:---|:---|:---|
| **72** | Planner Architectural Layout Editor | `PlannerPage.jsx` | HTML5 Canvas drawing loop | Plan & Simulate | Architectural Editor Canvas & Toolbar | `PlannerPage.jsx` | Canvas drawing tools: Walls, Barricades, Exits, Dynamic Openings, Spawn Portals, and Focus Targets. |
| **73** | Planner Real-World Scale Calibration | `PlannerPage.jsx` | Client-side geometry calculation | Plan & Simulate | Architectural Editor / Calibration Modal | `PlannerPage.jsx` | Two-point calibration tool calculating `pixelsPerMeter` from physical tape measurements. |
| **74** | Venue Architectural Layout Save (Upsert) | `PlannerPage.jsx` | `POST /api/venues` | Plan & Simulate | Top Toolbar / Venue Action Strip | `PlannerPage.jsx` | Saves venue geometry into SQLite `venues` table with conflict upsert handling. |
| **75** | Saved Venues Directory Query | `PlannerPage.jsx` | `GET /api/venues` | Plan & Simulate | Top Toolbar / Venue Selector Dropdown | `PlannerPage.jsx` | Fetches all saved venue layouts for selection and loading. |
| **76** | Specific Venue Layout Load | `PlannerPage.jsx` | `GET /api/venues/:id` | Plan & Simulate | Top Toolbar / Venue Selector Dropdown | `PlannerPage.jsx` | Loads complete layout JSON into 2D canvas and 3D visualizer. |
| **77** | Venue Architectural Plan Deletion | `backend/src/routes/venues.js` | `DELETE /api/venues/:id` | Plan & Simulate | Top Toolbar / Saved Venues Manager Modal | `PlannerPage.jsx` (Add action button) | **[Gap Addressed]** Wires previously uncalled delete route into a layout management dropdown/modal. |
| **78** | Reset to Default Demo Venue | `PlannerPage.jsx` | Client-side constant `DEMO_VENUE` | Plan & Simulate | Top Toolbar / Venue Action Strip | `PlannerPage.jsx` | Resets active canvas to default Temple Chariot Procession layout. |
| **79** | 2D Social Force Model (SFM) Simulation Engine | `PlannerPage.jsx`, `socialForceSim.js` | `requestAnimationFrame` physics loop | Plan & Simulate | Main 2D Simulation Canvas | `PlannerPage.jsx` | Microscopic pedestrian physics modeling agent-wall repulsion, destination seeking, and friction. |
| **80** | Simulation Playback Controls | `PlannerControls.jsx` | Client-side simulation state loop | Plan & Simulate | Simulation Control Deck | `PlannerControls.jsx` | Play, Pause, Reset, Step, and Speed multiplier buttons. |
| **81** | Emergency Surge Evacuation Mode | `PlannerControls.jsx`, `PlannerPage.jsx` | Client-side SFM agent state mutation | Plan & Simulate | Simulation Control Deck ("Trigger Surge") | `PlannerControls.jsx` | Flashes red `animate-panic`; accelerates agent velocity and reprioritizes nearest emergency exits. |
| **82** | Dynamic Emergency Gate Egress Controls | `PlannerControls.jsx`, `PlannerPage.jsx` | Client-side layout opening toggling | Plan & Simulate | Simulation Control Deck / Gate Toggles | `PlannerControls.jsx` | Dynamically opens/closes gates in 2D collision grid to demonstrate flow redistribution. |
| **83** | Focus Attraction Point Tool | `PlannerControls.jsx`, `PlannerPage.jsx` | Client-side SFM goal mutation | Plan & Simulate | Architectural Editor / Toolbar | `PlannerControls.jsx` | Places attraction coordinates drawing simulated crowds toward stages or points of interest. |
| **84** | Configurable Spawn Inflow Rate | `PlannerControls.jsx` | Client-side SFM spawner state | Plan & Simulate | Simulation Parameters Drawer | `PlannerControls.jsx` | Slider controlling spawn rate (0 to 20 p/s) and per-gate spawn checkboxes. |
| **85** | Population Cap Limiter | `PlannerControls.jsx` | Client-side spawner cap limit | Plan & Simulate | Simulation Parameters Drawer | `PlannerControls.jsx` | Slider setting maximum concurrent agent count (50 to 1,500 agents). |
| **86** | Real-Time Fruin Level of Service Density Heatmap | `PlannerPage.jsx` | Client-side spatial grid density calc | Plan & Simulate | Main 2D Simulation Canvas | `PlannerPage.jsx` | Spatial grid rendering dynamic Fruin LOS colors (Green LOS A through Crimson LOS F). |
| **87** | Three.js 2.5D/3D WebGL Venue Visualizer | `Venue25DViewer.jsx`, `PlannerPage.jsx` | WebGL / Three.js rendering context | Plan & Simulate | View Mode Switcher ("3D / 2D" Toggle) | `Venue25DViewer.jsx` | WebGL canvas with extruded 3D geometry, Gopuram spires, rooftop assets, and GPU-instanced agents. |
| **88** | 3D OrbitControls Navigation | `Venue25DViewer.jsx` | OrbitControls event listeners | Plan & Simulate | 3D WebGL Viewport | `Venue25DViewer.jsx` | Left-click orbit rotation, right-click pan, and mousewheel zoom. |
| **89** | Interactive 3D Gate Raycasting | `Venue25DViewer.jsx` | Three.js `Raycaster` pointerdown | Plan & Simulate | 3D WebGL Viewport | `Venue25DViewer.jsx` | Clicking 3D gate mesh swings it open 85°, illuminates threshold green, and routes 3D agents. |
| **90** | Pre-Event Multi-Scenario Simulation Analysis | `PlannerReportPage.jsx` | Client-side batch SFM runner | Plan & Simulate | "What If...?" AI Scenario Simulation Panel | `PlannerReportPage.jsx` | Automated batch runs of Baseline, Crisis Gate, Overcapacity, and Panic scenarios. |
| **91** | Fruin Level of Service Bottleneck Comparison Table | `PlannerReportPage.jsx` | Client-side metric comparison | Plan & Simulate | "What If...?" Scenario Results Grid | `PlannerReportPage.jsx` | Multi-scenario comparison matrix isolating persistent vs. conditional choke points. |
| **92** | Pre-Event AI Executive Narrative Synthesis | `PlannerReportPage.jsx` | `POST /api/planner/narrate-report` | Plan & Simulate | "What If...?" AI Narrative Section | `PlannerReportPage.jsx` | Calls Gemini LLM (or deterministic fallback) to generate structured 5-section executive safety appraisal. |
| **93** | Structured AI Narrative Viewer | `StructuredNarrativeViewer.jsx` | Presentational render | Plan & Simulate | "What If...?" AI Narrative Section | `StructuredNarrativeViewer.jsx` | Formatted cards for Executive Summary, Bottlenecks, Mitigations, and Regulatory Compliance. |
| **94** | Structured Narrative Text Copy | `StructuredNarrativeViewer.jsx` | `navigator.clipboard.writeText()` | Plan & Simulate | "What If...?" AI Narrative Section | `StructuredNarrativeViewer.jsx` | One-click button copying formatted safety markdown to system clipboard. |
| **100** | Startup Demo Venue Database Seeding | `backend/src/index.js`, `seedDemoVenue.js` | One-shot boot script (SQLite UPSERT) | Plan & Simulate | Seeded Initial State | `backend/src/services/seedDemoVenue.js` | Automatically ensures `demo-temple-procession` layout is populated in DB on startup. |

**Page 2 Subtotal:** 24 Features

---

### Page 3: Live Monitor (`monitor`) — 22 Features

| # | Feature Name (from audit) | Current Component(s) | Backend Route(s) / Socket Event(s) | New Page | New Section / Sub-tab / Drawer | Real Component to Reuse | Notes |
|:---|:---|:---|:---|:---|:---|:---|:---|
| **8** | Live Zone Video Stream Proxy | `ZonePanel.jsx` | `GET /stream/:zone_id` (MJPEG proxy) | Live Monitor | Zone 2 Live Feed Video Card | `ZonePanel.jsx` | Replaces mockup's static SVG card with live camera/drone MJPEG stream from CV service. |
| **9** | Video Stream Image Error Fallback | `ZonePanel.jsx` | `navigator.mediaDevices.getUserMedia` | Live Monitor | Zone 2 Live Feed Video Card | `ZonePanel.jsx` | Automatic fallback to local webcam or synthetic HTML5 canvas particle crowd if MJPEG drops. |
| **10** | Dynamic Zone Risk Vignette & Meter | `ZonePanel.jsx`, `ZoneIntensityOverlay.jsx` | Socket.io `density_update` | Live Monitor | Zone 2 Live Feed Video Card | `ZoneIntensityOverlay.jsx` | Radial gradient overlay and real-time numeric density meter ($p/m^2$) shifting across Green/Yellow/Orange/Red. |
| **11** | Farneback Optical Flow Motion Gauges | `FlowMetricsDisplay.jsx` | Socket.io `density_update` | Live Monitor | Motion Telemetry Strip (Zone 2) | `FlowMetricsDisplay.jsx` | Dual telemetry gauges displaying flow convergence, turbulence, and pulsing panic indicators. |
| **12** | Optical Flow Feature Flag Toggle | `backend/src/routes/density.js` | Ingestion config (`ENABLE_OPTICAL_FLOW`) | Live Monitor | Motion Telemetry Strip (Advanced Info) | `ZonePanel.jsx` | Visual indicator noting whether 4-factor optical flow or 2-factor density/slope is active. |
| **13** | Density Rate-of-Rise Trend Extrapolation | `TrendExtrapolationGraph.jsx` | Socket.io `density_update` | Live Monitor | Density Trajectory Card | `TrendExtrapolationGraph.jsx` | Historical curve with projected slope lines estimating minutes until critical threshold breach. |
| **14** | Trend Extrapolation Zone Selector | `App.jsx`, `TrendExtrapolationGraph.jsx` | Client-side state switch | Live Monitor | Density Trajectory Card Header | `TrendExtrapolationGraph.jsx` | Selector buttons switching trajectory analysis between Zone 1 (General) and Zone 2 (Corridor). |
| **15** | Composite Risk Score Formula Breakdown Modal | `TrendExtrapolationGraph.jsx` | Client-side state modal | Live Monitor | Risk Dial ("How is this computed?" Link) | `TrendExtrapolationGraph.jsx` | Modal displaying mathematical weights: Density 50%, Slope 30%, Convergence 10%, Turbulence 10%. |
| **16** | Proactive Control Room Push-Guidance Banners | `AssistantPushBanner.jsx` | Socket.io `assistant_instruction` | Live Monitor | Top Viewport Directive Banner | `AssistantPushBanner.jsx` | Automated high-priority action banners pushed on threshold breaches or detected panic. |
| **17** | Push-Guidance Banner Dismissal | `AssistantPushBanner.jsx` | Client-side state filter | Live Monitor | Top Viewport Directive Banner | `AssistantPushBanner.jsx` | Operator dismiss button filtering banner from active view. |
| **18** | Grounded Control Room Assistant Q&A Drawer | `AssistantChatPanel.jsx` | `POST /api/assistant/ask` | Home | CrowdSense AI Agent Panel (Bottom Section) | `AssistantChatPanel.jsx` | Interactive Q&A chat grounded in live telemetry, active alerts, gate statuses, and weather. |
| **19** | Assistant Suggested Operational Prompt Chips | `AssistantChatPanel.jsx` | Client-side query injector | Home | CrowdSense AI Agent Panel | `AssistantChatPanel.jsx` | Quick-inquiry prompt chips (e.g. "Assess Gate 3 bottleneck risk", "Verify Exit E2 status"). |
| **20** | Assistant Local Deterministic Fallback | `backend/src/routes/assistant.js` | Flag `ASSISTANT_LOCAL_MODE` | Home | CrowdSense AI Agent Panel | `AssistantChatPanel.jsx` | Fallback badge noting whether answers are synthesized via Groq LLM or deterministic rules. |
| **21** | Environmental Weather Preset Selector | `WeatherControlPanel.jsx` | `POST /api/conditions/set`, Socket `conditions_updated` | Live Monitor | Environmental Monitoring Card | `WeatherControlPanel.jsx` | Preset selector (`CLEAR`, `EXTREME HEAT`, `HEAVY RAIN`) adjusting physical simulation constants. |
| **22** | Environmental Sensitivity Modifiers | `WeatherControlPanel.jsx` | In-memory `weatherService.js` | Live Monitor | Environmental Monitoring Card | `WeatherControlPanel.jsx` | Displays active sensitivity multipliers (heat: 0.75 density factor; rain: 1.5 flow factor). |
| **23** | Current Environmental Conditions Query | `WeatherControlPanel.jsx` | `GET /api/conditions/current` | Live Monitor | Environmental Monitoring Card | `WeatherControlPanel.jsx` | Fetches active simulated weather state, temperature, and precipitation indices. |
| **24** | Master CV Pipeline Power Toggle | `WeatherControlPanel.jsx` | `POST /api/pipeline/toggle`, Socket `pipeline_status_updated` | Live Monitor | Live Control Bar / Header Action | `WeatherControlPanel.jsx` | Global toggle pausing/resuming continuous video frame processing across all cameras. |
| **25** | Master CV Pipeline State Query | `WeatherControlPanel.jsx` | `GET /api/pipeline/status` | Live Monitor | Live Control Bar / Header Action | `WeatherControlPanel.jsx` | Queries active pipeline status, paused timestamp, and last frame update time. |
| **26** | Master CV Pipeline Explicit State Set | `backend/src/routes/pipeline.js` | `POST /api/pipeline/set` | Live Monitor | Live Control Bar (Advanced Drawer) | `WeatherControlPanel.jsx` | **[Gap Addressed]** Wires explicit boolean set endpoint for automated shutdown or restart scripts. |
| **96** | Density Telemetry Ingestion Contract | `backend/src/routes/density.js` | `POST /api/density` | Live Monitor | Background Telemetry Pipeline | `ZonePanel.jsx` | Ingestion endpoint computing slope, composite risk, and broadcasting `density_update`. |
| **97** | Density History Table Pruning & Rotation | `backend/src/routes/density.js` | Background DB job (every 500th insert) | Live Monitor | Telemetry Maintenance System | `backend/src/routes/density.js` | Automatically prunes SQLite `density_history` table to a rolling window of 15,000 rows. |
| **98** | Direct Assistant Instructions Query | `backend/src/routes/assistant.js` | `GET /api/assistant/instructions?limit=50` | Live Monitor | CrowdSense AI Agent Drawer History | `AssistantChatPanel.jsx` | **[Gap Addressed]** Wires query endpoint to load past push instructions in assistant history drawer. |

**Page 3 Subtotal:** 22 Features

---

### Page 4: Evacuation (`evac`) — 8 Features

| # | Feature Name (from audit) | Current Component(s) | Backend Route(s) / Socket Event(s) | New Page | New Section / Sub-tab / Drawer | Real Component to Reuse | Notes |
|:---|:---|:---|:---|:---|:---|:---|:---|
| **54** | Tactical 2D Egress & Bottleneck Vector Map | `BottleneckExitMap.jsx` | Consumes `zoneMap` telemetry via props | Evacuation | Central Interactive Vector Map | `BottleneckExitMap.jsx` | Replaces mockup's static SVG diagram with interactive vector engine (Staging Lawn, X-Highway). |
| **55** | Egress Corridor Layer Visibility Toggles | `BottleneckExitMap.jsx` | Client-side layer state | Evacuation | Map Layer Control Bar | `BottleneckExitMap.jsx` | Toggles display of Corridors, Density Heatmaps, Choke Point nodes, and Coordinate Grid lines. |
| **56** | Corridor Segment & Choke Point Inspection | `BottleneckExitMap.jsx` | Client-side selection state | Evacuation | Side Choke Point Inspector Drawer | `BottleneckExitMap.jsx` | Clicking SVG corridors or choke point nodes reveals width, live density, status, and capacity. |
| **57** | Corridor Manual Breach Lock | `BottleneckExitMap.jsx` | Client-side simulation state | Evacuation | Simulation & Breach Test Deck | `BottleneckExitMap.jsx` | Overrides segment density to $1.35\text{ p/m}^2$, turns segment flashing neon red, and triggers marshal alert. |
| **58** | Emergency Vehicle Dispatch Animation | `BottleneckExitMap.jsx` | Client-side Bezier animation loop | Evacuation | Vehicle Dispatch Simulator | `BottleneckExitMap.jsx` | Animates ambulance or foot medic along quadratic Bezier curve with real-time ETA countdown. |
| **59** | Automated Vehicle Transit Breach Halt | `BottleneckExitMap.jsx` | Internal route density evaluation | Evacuation | Vehicle Dispatch Simulator | `BottleneckExitMap.jsx` | Automatically pauses vehicle transit if approaching an obstructed segment ($>1.0\text{ p/m}^2$). |
| **60** | Targeted Marshal Clearance Action | `BottleneckExitMap.jsx` | Client-side simulation state | Evacuation | Response Coordination Deck | `BottleneckExitMap.jsx` | Action button clearing corridor blockage, restoring density to $0.25\text{ p/m}^2$, and resuming vehicle. |
| **61** | Clear All Breaches Master Action | `BottleneckExitMap.jsx` | Client-side simulation state | Evacuation | Simulation & Breach Test Deck | `BottleneckExitMap.jsx` | Global button clearing all simulated corridor breach locks across the venue layout. |

**Page 4 Subtotal:** 8 Features

---

### Page 5: Post-Incident (`post`) — 9 Features

| # | Feature Name (from audit) | Current Component(s) | Backend Route(s) / Socket Event(s) | New Page | New Section / Sub-tab / Drawer | Real Component to Reuse | Notes |
|:---|:---|:---|:---|:---|:---|:---|:---|
| **63** | Capstone Post-Event Safety Report Generator | `PostEventAnalysisView.jsx` | `POST /api/reports/generate` | Post-Incident | Official Report Generator Panel | `PostEventAnalysisView.jsx` | Synthesizes formal 6-section safety accountability document via Gemini LLM and saves to SQLite. |
| **64** | Cached Post-Event Safety Report Fetch | `PostEventAnalysisView.jsx` | `GET /api/reports/latest` | Post-Incident | Official Report Generator Panel | `PostEventAnalysisView.jsx` | Instant retrieval of the most recently generated capstone report from SQLite cache. |
| **65** | Historical Report Archive Listing | `backend/src/routes/reports.js` | `GET /api/reports/history?limit=10` | Post-Incident | Report Archive & Historical Picker Modal | `PostEventAnalysisView.jsx` | **[Gap Addressed]** Wires previously uncalled report history listing into a historical report browser. |
| **66** | Single Report Retrieval by ID | `backend/src/routes/reports.js` | `GET /api/reports/:id` | Post-Incident | Report Viewer Container | `PostEventReportDocument.jsx` | **[Gap Addressed]** Wires report retrieval by ID to inspect any archived historical report. |
| **67** | Raw Report Operational Data Retrieval | `backend/src/routes/reports.js` | `GET /api/reports/raw-data` | Post-Incident | Data Audit / Raw Export Modal | `PostEventReportDocument.jsx` | **[Gap Addressed]** Wires endpoint allowing operators to export unaggregated session data. |
| **68** | Administrative Post-Event Report Filing Document | `PostEventReportDocument.jsx` | Presentational render | Post-Incident | Official Report Document View | `PostEventReportDocument.jsx` | Formatted report document rendering executive KPI cards, verification tags, and 6 markdown sections. |
| **69** | Underlying Report JSON Data Inspector | `PostEventReportDocument.jsx` | Client-side collapsible drawer | Post-Incident | Official Report Document View | `PostEventReportDocument.jsx` | Collapsible syntax-highlighted drawer revealing exact input payload used during generation. |
| **70** | Report Markdown Clipboard Export | `PostEventReportDocument.jsx` | `navigator.clipboard.writeText()` | Post-Incident | Report Document Action Bar | `PostEventReportDocument.jsx` | One-click button copying complete markdown report document to system clipboard. |
| **71** | Post-Event Report PDF Export / Print | `PostEventReportDocument.jsx` | Browser native `window.print()` | Post-Incident | Report Document Action Bar | `PostEventReportDocument.jsx` | Activates `@media print` rules hiding navigation and formatting clean printable safety PDF. |

**Page 5 Subtotal:** 9 Features

---

### Page 6: Command Center (`cc`) — 17 Features

| # | Feature Name (from audit) | Current Component(s) | Backend Route(s) / Socket Event(s) | New Page | New Section / Sub-tab / Drawer | Real Component to Reuse | Notes |
|:---|:---|:---|:---|:---|:---|:---|:---|
| **27** | Live Operations Incident Feed | `AlertPanel.jsx` | `GET /api/alerts/active`, Socket `alert_triggered` | Command Center | Active Incident Triage Deck | `AlertPanel.jsx` | Real-time card queue of all unacknowledged red/orange incidents across monitored zones. |
| **28** | Incident Acknowledgment Flow | `AlertPanel.jsx` | `POST /api/alerts/:id/acknowledge`, Socket `acknowledge_alert` | Command Center | Active Incident Triage Deck | `AlertPanel.jsx` | Operator acknowledgment halting auto-escalation timer and recording operator ID in SQLite. |
| **29** | Automated Graduated Auto-Escalation Timer | `AlertPanel.jsx`, `escalationManager.js` | Socket.io `alert_escalated` | Command Center | Active Incident Triage Deck | `AlertPanel.jsx` | Background timer escalating unacknowledged red alerts to supervisor `official_2` after 30 seconds. |
| **30** | Behavioral Panic Fast-Path Bypass | `AlertPanel.jsx`, `ZonePanel.jsx` | Socket `alert_panic`, `alert_triggered` | Command Center | Active Incident Triage Deck / Banner | `AlertPanel.jsx` | Fast-path escalation immediately triggering Red Alert upon confirmed optical stampede signature. |
| **31** | Panic Multi-Frame Confirmation Buffer | `backend/src/services/escalationManager.js` | Ingestion config (`PANIC_CONFIRM_FRAMES`) | Command Center | Incident Telemetry Engine | `AlertPanel.jsx` | Suppresses single-frame optical flow noise until panic condition persists for 2 consecutive frames. |
| **32** | Panic Alert TTL Auto-Expiry | `backend/src/services/escalationManager.js` | Timer logic (`PANIC_ALERT_TTL_MS`) | Command Center | Incident Telemetry Engine | `AlertPanel.jsx` | Automatically clears unacknowledged panic alerts after 20 seconds of sustained calm footage. |
| **33** | Immutable Incident Audit Log Table | `AuditLogView.jsx` | `GET /api/audit-log?limit=50` | Command Center | Incident Audit Log Panel | `AuditLogView.jsx` | Filterable table displaying historical alert logs, completed playbook actions, and pushed guidance. |
| **34** | Audit Log Category Filtering | `AuditLogView.jsx` | Client-side filter state | Command Center | Incident Audit Log Panel | `AuditLogView.jsx` | Category filter pills isolating Panic, Escalated, Acknowledged, Assistant Guidance, or Playbooks. |
| **35** | Audit Log Manual Refresh | `AuditLogView.jsx` | `GET /api/audit-log?limit=50` via `onRefresh` | Command Center | Incident Audit Log Panel | `AuditLogView.jsx` | On-demand button re-querying SQLite audit tables in parallel. |
| **40** | Active Responders Directory Query | `backend/src/routes/responders.js` | `GET /api/responders` | Command Center | Responder Roster & Dispatch Directory Modal | `ResponderDashboard.jsx` (List logic) | **[Gap Addressed]** Wires global responder directory query to show complete roster of active staff. |
| **41** | Nearest Responder Adjacency Resolution | `ResponderDashboard.jsx`, `ResponderAlertCard.jsx` | `GET /api/responders/nearest?zone_id=:zone` | Command Center | Responder Dispatch & Routing Card | `ResponderDashboard.jsx` | Topological routing resolving nearest patrol team to an incident and returning step-by-step path. |
| **49** | Incident Response Playbook Protocol Resolution | `PlaybookPanel.jsx` | `GET /api/alerts/:id/playbook` | Command Center | Incident Details Drawer / Playbook Modal | `PlaybookPanel.jsx` | **[Gap Addressed]** Wires `PlaybookPanel.jsx` into Command Center incident card for control room staff. |
| **50** | Live Responder Shortfall Evaluation | `PlaybookPanel.jsx` | `GET /api/alerts/:id/playbook` | Command Center | Incident Details Drawer / Playbook Modal | `PlaybookPanel.jsx` | Compares required personnel against checked-in responders in the target zone (flags shortfalls). |
| **51** | Playbook Contextual AI Narrative Note | `PlaybookPanel.jsx` | `GET /api/alerts/:id/playbook` | Command Center | Incident Details Drawer / Playbook Modal | `PlaybookPanel.jsx` | Contextual narrative note generated via Groq LLM framing operational priorities. |
| **52** | Playbook Action Checklist Step Completion | `PlaybookPanel.jsx` | `POST /api/alerts/:id/playbook-step`, Socket `complete_playbook_step` | Command Center | Incident Details Drawer / Playbook Modal | `PlaybookPanel.jsx` | Checklist logging completed steps into SQLite `playbook_step_log` with permanent lock. |
| **62** | Post-Event Milestone Timeline | `PostEventAnalysisView.jsx` | `GET /api/post-event-timeline?zone_id=:zone` | Command Center | Incident Timeline & Chronology Panel | `PostEventAnalysisView.jsx` (Trunk logic) | Milestone trunk rendering chronological incident markers and aggregate operational summary metrics. |
| **95** | Simulated Emergency Dispatch Control | `MockDispatchControl.jsx` | `POST /api/dispatch/simulate`, Socket `mock_dispatch_toast` | Command Center | Tactical Dispatch Simulation Deck | `MockDispatchControl.jsx` | **[Gap Addressed]** Wires previously unrendered mock siren and dispatch trigger into Command Center. |

**Page 6 Subtotal:** 17 Features

---

## 3. UNRESOLVED — Needs Decision

The following 4 items represent architectural trade-offs, interface overlaps, or UX decisions between the legacy implementation and the new simplified 6-page paradigm:

### Decision 1: Dedicated Field Simulator Port (Port 5174) vs. Unified Single-Page Shell
- **Audit Feature:** #5 (`Dedicated Field Simulator Port Routing (Port 5174)`).
- **Context:** In the legacy codebase, opening the web app on `http://localhost:5174` dynamically bypassed the entire control room dashboard and loaded `<DualPhoneSimulator />` full-screen. In the new 6-page mockup, Dual Phone Simulator is placed at the bottom of the Home (`landing`) page.
- **Ambiguity:** If a user runs Vite on port 5174, should it:
  1. Load the full Home page and automatically scroll/focus down to the `#dual-simulator` anchor? OR
  2. Detect `port === '5174'` and render a clean, isolated standalone view of only the Dual Phone Simulator without the landing page header/hero?
- **Recommendation:** **Option 2 (Conditional Isolated View).** When `window.location.port === '5174'` (or URL contains `?mode=simulator`), render `<DualPhoneSimulator />` in an isolated viewport for dedicated mobile testing and responsive devtools framing. On standard port 5173 / production, render it in its designated place at the bottom of the Home page.

### Decision 2: Control Room Playbook Execution vs. Field-Only Playbook Execution
- **Audit Features:** #49, #50, #51, #52 (`PlaybookPanel.jsx`).
- **Context:** `AUDIT_INTEGRATION.md` Section 1 Gap 5 identified that `PlaybookPanel.jsx` was imported in `AlertPanel.jsx` but never rendered in the main dashboard JSX — it was only accessible inside the mobile responder modal.
- **Ambiguity:** Should command center operators be able to complete NDMA checklist steps directly from the desktop Command Center, or should step completion be reserved strictly for field responders on their mobile devices?
- **Recommendation:** **Dual Access with Role Attribution.** Mount `<PlaybookPanel />` inside an expandable "Incident Response Playbook" drawer on the Command Center's active incident cards. When an operator checks a box, `completed_by` records `"command_operator_1"`. When a field responder checks a box on mobile, it records the responder's callsign (e.g. `"Officer Kumar"`). This directly fixes Gap 5 without altering backend schema.

### Decision 3: Citizen SOS Intake Severity Categorization (Form vs. Backend Gap)
- **Audit Feature:** #36 (`Citizen Emergency SOS Form Intake`).
- **Context:** In `AUDIT_INTEGRATION.md` Section 1 Gap 2, the backend only elevates reports to `'red'` severity if `category === 'STAMPEDE_RISK' || category === 'GENERAL_PANIC'`. However, `CitizenReportView.jsx` currently only displays 4 buttons (`MEDICAL_ASSISTANCE`, `SUSPICIOUS_ACTIVITY`, `REPORT_THEFT`, `BLOCKED_EXITS`), meaning no citizen report can ever trigger a critical Red Alert.
- **Ambiguity:** Should the mobile form remain restricted to 4 general buttons (all yielding `'orange'` severity), or should the form be updated to include direct panic/stampede options?
- **Recommendation:** **Harmonize Categories in UI.** Update `CitizenReportView.jsx`'s category selection to 6 buttons by adding `"Stampede / Surge Risk"` (`STAMPEDE_RISK`) and `"Crush / Panic Threat"` (`GENERAL_PANIC`). When selected, these will immediately trigger the backend's critical `'red'` alert pipeline.

### Decision 4: Deprecation of `TrendGraphPlaceholder.jsx`
- **Audit Feature:** Section 1 Gap 9 (`Unused Component TrendGraphPlaceholder.jsx`).
- **Context:** `TrendGraphPlaceholder.jsx` exists in `frontend/src/components/` but is completely unreferenced. The active application already uses `TrendExtrapolationGraph.jsx` which contains real SVG curves, dynamic slope extrapolation, and threshold calculation.
- **Recommendation:** **Explicitly Deprecate & Omit.** Do not mount `TrendGraphPlaceholder.jsx` anywhere in the new UI. All trend visualization requirements are fully satisfied by `TrendExtrapolationGraph.jsx`.

---

## 4. Gaps Being Addressed (Audit Section 1 Resolutions)

The table below details the explicit resolution for every architectural gap and unlinked interface identified in Section 1 of `AUDIT_INTEGRATION.md`:

| Gap # | Audit Flagged Item | Legacy Status | Redesign Resolution | Target Page & Section |
|:---|:---|:---|:---|:---|
| **1** | `MockDispatchControl.jsx` Mounted State Mismatch | Coded and imported in `App.jsx`, but never rendered in JSX tree. | **Wired Up.** Restyle and mount `<MockDispatchControl />` as an expandable "Tactical Simulation & Drill Deck" inside the Command Center. Dispatches trigger sirens, toasts, and audit rows as intended. | Command Center (`cc`) → Simulation Deck |
| **2** | Citizen SOS Category Severity Divergence | Backend requires `STAMPEDE_RISK` or `GENERAL_PANIC` for red severity, but frontend only offers 4 medium categories. | **Wired Up.** Expand the SOS category options in `CitizenReportView.jsx` to include `STAMPEDE_RISK` and `GENERAL_PANIC`, enabling citizen-initiated critical red alerts. | Home (`landing`) → Dual Phone Simulator (Left) |
| **3** | Report Archive Endpoints Uncalled (`GET /api/reports/history`, `GET /api/reports/:id`, `GET /api/reports/raw-data`) | Backend exposes history, ID lookup, and raw data audit, but frontend only called `POST /generate` and `GET /latest`. | **Wired Up.** Add a "Historical Report Archive" dropdown/modal to `PostEventAnalysisView.jsx` to browse and load past reports by ID, plus a "Raw Session Data" export button. | Post-Incident (`post`) → Report Archive Modal |
| **4** | Venue Deletion Endpoint Uncalled (`DELETE /api/venues/:id`) | Backend exposes layout deletion, but Planner frontend has no UI button to delete a saved venue. | **Wired Up.** Add a "Delete Layout" icon button with confirmation prompt next to the saved venue dropdown in the Plan & Simulate top toolbar. | Plan & Simulate (`plan`) → Top Toolbar |
| **5** | `PlaybookPanel.jsx` Dead Import in `AlertPanel.jsx` | Imported in `AlertPanel.jsx:L2` but never rendered in desktop JSX (only rendered in field mobile modals). | **Wired Up.** Wire `<PlaybookPanel />` into an expandable incident response drawer in Command Center's incident feed, allowing control room staff to execute NDMA checklists. | Command Center (`cc`) → Incident Details Drawer |
| **6** | All Responders Directory Query Uncalled (`GET /api/responders`) | Backend exposes global responder roster, but frontend only queried `/nearest`. | **Wired Up.** Add an "Active Responders Directory" modal/tab in Command Center showing all checked-in personnel, their callsigns, and assigned zones. | Command Center (`cc`) → Responder Status Panel |
| **7** | Direct Assistant Instructions Query Uncalled (`GET /api/assistant/instructions`) | Backend exposes direct instruction query, but frontend retrieved them through `/api/audit-log`. | **Wired Up.** Wire endpoint into the CrowdSense AI Agent drawer on Live Monitor to display a dedicated "Past Directive History" tab. | Live Monitor (`monitor`) → AI Agent Drawer |
| **8** | Pipeline Explicit State Set Uncalled (`POST /api/pipeline/set`) | Backend exposes explicit active boolean setter, but frontend only called `/toggle`. | **Wired Up.** Add explicit "Force Start" and "Force Pause" controls in an Advanced CV Settings sub-menu on Live Monitor for administrative overrides. | Live Monitor (`monitor`) → CV Control Strip |
| **9** | Unused Component `TrendGraphPlaceholder.jsx` | Unreferenced placeholder component in repository. | **Explicitly Deferred / Retired.** Omitted from all pages in favor of the active, mathematically complete `TrendExtrapolationGraph.jsx`. | Retired (No home needed) |

---

## 5. Coverage Check & Verification

| Page / Section | Feature Count | Percentage of Total |
|:---|:---|:---|
| **Page 1: Home (`landing`)** | 20 | 20.0% |
| **Page 2: Plan & Simulate (`plan`)** | 24 | 24.0% |
| **Page 3: Live Monitor (`monitor`)** | 22 | 22.0% |
| **Page 4: Evacuation (`evac`)** | 8 | 8.0% |
| **Page 5: Post-Incident (`post`)** | 9 | 9.0% |
| **Page 6: Command Center (`cc`)** | 17 | 17.0% |
| **Total Features Mapped** | **100** | **100.0%** |
| **Audit Feature Baseline (`AUDIT_INTEGRATION.md` Section 3)** | **100** | **100.0%** |
| **Silently Dropped Features** | **0** | **0.0%** |

### Verification Confirmation
Every single numbered feature (1 through 100) from `AUDIT_INTEGRATION.md` has been assigned a definitive home in the new 6-page architecture. All 9 flagged gaps from Section 1 have an explicit, actionable resolution. No feature has been omitted, orphaned, or silently dropped.
