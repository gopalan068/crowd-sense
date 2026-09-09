# CrowdSense Frontend Technical Audit (AUDIT_FRONTEND.md)

**Audit Date:** 2026-09-09  
**Audit Target:** `crowd-safety-frontend` (`frontend/`)  
**Framework:** React 18.2.0, Vite 5.4.0, TailwindCSS 3.3.3, Socket.io-client 4.6.2, Three.js 0.185.1  
**Auditor Methodology:** Static Codebase Analysis & Symbol Tracing across all pages, components, and library utilities. No improvements, redesigns, or file modifications proposed.

---

## 1. Screen/Page Inventory

The application is a single-page React application without `react-router-dom`. Routing and screen delivery are controlled via client-side state (`activeTab` in `frontend/src/App.jsx`), port detection (`window.location.port === '5174'`), sub-tab state, and modal state overlays.

| Screen/Page | Route/URL | Purpose | Key Components Used | Exact File Path |
| :--- | :--- | :--- | :--- | :--- |
| **Live Operations Control** | `/` (Tab: `LIVE`, Default on port 5173) | Real-time command center for monitoring dual-zone density, CCTV/drone feeds, OpenCV flow metrics, active alerts, trend extrapolation, and assistant recommendations. | `ConnectionStatusBanner`, `WeatherControlPanel`, `AssistantPushBanner`, `ZonePanel`, `ZoneIntensityOverlay`, `FlowMetricsDisplay`, `AlertPanel`, `TrendExtrapolationGraph`, `AssistantChatPanel`, `AuditLogView`, `KnownLimitationsModal` | [App.jsx](file:///d:/crowd%20sense/frontend/src/App.jsx) |
| **Post-Event Analysis & Capstone Report** | `/` (Tab: `EVENT_ANALYSIS`, also aliases `REPORT`, `POST_EVENT`) | Reconstructs historical incident timelines, SLA benchmarks, SQLite audit logs, and compiles AI post-incident PDF reports. | `WeatherControlPanel`, `PostEventAnalysisView`, `PostEventReportDocument`, `AuditLogView` | [PostEventAnalysisView.jsx](file:///d:/crowd%20sense/frontend/src/components/PostEventAnalysisView.jsx) |
| **Venue Map & Egress Bottlenecks** | `/` (Tab: `VENUE_MAP`) | Interactive 2D vector layout of venue staging lawn, 4.0m connecting channels, and X-Highway emergency response network with breach simulations. | `WeatherControlPanel`, `BottleneckExitMap` | [BottleneckExitMap.jsx](file:///d:/crowd%20sense/frontend/src/components/BottleneckExitMap.jsx) |
| **Dual Phone Simulator** | `/` (Tab: `DUAL_SIM`, Default on port 5174) | Side-by-side mocked smartphone chassis demonstrating bidirectional synchronization between Citizen SOS and Field Patrol responders. | `DualPhoneSimulator`, `CitizenReportView`, `ResponderDashboard`, `ResponderCheckin`, `ResponderAlertCard`, `ActiveIncidentResponseModal`, `PlaybookPanel` | [DualPhoneSimulator.jsx](file:///d:/crowd%20sense/frontend/src/components/DualPhoneSimulator.jsx) |
| **CrowdSense Planner: Simulation** | `/` (Tab: `PLANNER`, Sub-view: `sim`) | Pre-event venue simulation environment utilizing Helbing's Social Force Model (SFM) in 2D canvas and 2.5D/3D Three.js views. | `PlannerPage`, `PlannerControls`, `Venue25DViewer` | [PlannerPage.jsx](file:///d:/crowd%20sense/frontend/src/pages/PlannerPage.jsx) |
| **CrowdSense Planner: Planning Report** | `/` (Tab: `PLANNER`, Sub-view: `report`) | Multi-scenario comparative bottleneck analysis, Fruin LOS density evaluation, rule recommendations, and AI narration. | `PlannerReportPage`, `StructuredNarrativeViewer` | [PlannerReportPage.jsx](file:///d:/crowd%20sense/frontend/src/pages/PlannerReportPage.jsx) |

---

## 2. Interactive Component Inventory

This section audits every component with which end users directly interact (clicking, typing, selecting, dragging, toggling, or filtering).

---

### 2.1 `App.jsx` (Root Shell & Global Navigation)
* **File Path:** [frontend/src/App.jsx](file:///d:/crowd%20sense/frontend/src/App.jsx)
* **What it displays and why:** Displays the global header bar, system title, anonymous headcount privacy badge, WebSocket connection status pill, active tab switcher, theme toggle, limitations trigger, global reconnection banner, and main content area.
* **User Actions Supported:**
  1. *Click Navigation Tab Button* (`LIVE`, `EVENT_ANALYSIS`, `VENUE_MAP`, `DUAL_SIM`, `PLANNER`): Mutates `activeTab` state to switch views.
  2. *Click Limitations Button* (`ℹ️ LIMITATIONS`): Sets `showLimitations(true)` to mount the modal drawer.
  3. *Click Theme Button* (`☀️ DAY` / `🌙 NIGHT`): Calls `toggleTheme()`, mutating `theme` state and updating `document.documentElement.setAttribute('data-theme', nextTheme)`.
  4. *Click Trend Extrapolation Zone Switcher* (`ZONE 1 (GENERAL)` / `ZONE 2 (CORRIDOR)`): Mutates `selectedTrendZone` state (`'zone_1'` or `'zone_2'`).
  5. *Retry WebSocket Button* (via `ConnectionStatusBanner`): Calls `handleManualReconnect()` invoking `socketInstance.connect()`.
* **API Endpoints & WebSocket Channels:**
  - `GET /api/audit-log?limit=50`: Fetched on initial mount, on socket connect, and after alert acknowledgement/escalation/status changes.
  - `GET /api/conditions/current`: Fetched on socket connect.
  - `GET /api/pipeline/status`: Fetched on socket connect.
  - `POST /api/pipeline/toggle`: Triggered by `handleTogglePipeline()`.
  - `POST /api/alerts/:alertId/acknowledge`: Triggered by `handleAcknowledgeAlert(alertId)`.
  - Socket Listeners: `connect`, `disconnect`, `reconnect_attempt`, `conditions_updated`, `pipeline_status_updated`, `density_update`, `alert_triggered`, `alert_escalated`, `alert_acknowledged`, `alert_status_updated`, `playbook_step_completed`, `mock_dispatch_toast`, `assistant_instruction`, `panic_confirming`.
  - Socket Emits: `acknowledge_alert` with payload `{ alert_id, acknowledged_by: 'official_1' }`.
* **State Management:**
  - *Local State:* `theme` ('day'|'night'), `activeTab`, `connected` (boolean), `reconnectCount`, `zoneMap` (`{ zone_1, zone_2 }`), `selectedTrendZone`, `activeAlerts` (array), `auditLogs` (array), `playbookSteps` (array), `mockToasts` (array), `showLimitations` (boolean), `socketInstance`, `weatherState`, `pipelineActive` (boolean), `assistantInstructions` (array), `panicConfirming` (object).
  - *Global Context/Store:* None. All downstream components receive state via direct props.
* **Conditional Rendering Logic:**
  - If `window.location.port === '5174'`, initial `activeTab` is set to `'DUAL_SIM'`, else `'LIVE'`.
  - `WeatherControlPanel` is hidden when `activeTab === 'PLANNER'`.
  - Main container padding is stripped (`p-0`) when `activeTab === 'PLANNER'`, else standard padding (`p-6 max-w-7xl 2xl:max-w-[1600px] mx-auto`).
  - `ConnectionStatusBanner` renders only if `connected === false`.
* **Props Received & Passed Down:**
  - Root component; receives no props.
  - Passes down telemetry and callbacks to `ZonePanel`, `FlowMetricsDisplay`, `AlertPanel`, `TrendExtrapolationGraph`, `AuditLogView`, `WeatherControlPanel`, `PostEventAnalysisView`, `BottleneckExitMap`, `DualPhoneSimulator`, `PlannerPage`.
* **Client-side Validation & Computed Values:**
  - Computes `currentTrendData = zoneMap[selectedTrendZone] || zoneMap.zone_1 || zoneMap.zone_2`.
  - Sanitizes `assistantInstructions` to cap display to latest 5 items.
  - *Dead Code / Discrepancy Note:* `MockDispatchControl` is imported at Line 11 and `mockToasts` state is populated via `socket.on('mock_dispatch_toast')`, but `<MockDispatchControl />` is NOT rendered anywhere in `App.jsx` JSX.

---

### 2.2 `ZonePanel.jsx`
* **File Path:** [frontend/src/components/ZonePanel.jsx](file:///d:/crowd%20sense/frontend/src/components/ZonePanel.jsx)
* **What it displays and why:** Displays operational telemetry for a specific zone (live MJPEG CV stream, fallback HTML5 webcam feed, or fallback HTML5 canvas particle animation), people count, current density ($p/m^2$), rate of rise slope, ETA to red threshold, density saturation override badges, environmental modifier tags, CV confidence percentage, and static snapshot pause badges.
* **User Actions Supported:**
  - Native image error fallback: When `<img src={streamUrl} />` fails, `onError` fires and sets `useMjpegStream(false)`, triggering fallback to browser webcam or canvas simulation.
* **API Endpoints & WebSocket Channels:**
  - Connects to MJPEG stream URL: `${VITE_CV_STREAM_URL || '/stream'}/${zone_id}`.
  - Calls `navigator.mediaDevices.getUserMedia({ video: ... })` if webcam fallback is active.
* **State Management:**
  - *Local State:* `useMjpegStream` (boolean, resets to `true` when `zoneId` changes), `cameraActive` (boolean), `cameraError` (string|null).
  - *Props Received:* `zoneData`, `zoneId`, `panicConfirming`, `pipelineActive`.
* **Conditional Rendering Logic:**
  - If `!zoneData`: Renders centered loading spinner with text `"Awaiting {zoneId} Stream Data…"`.
  - If `isCorridor`: Applies hazard border styling (`corridor-hazard-border border-red-400`).
  - If `density_source === 'override_cached' || density_source === 'override_live' || saturated`: Displays pulsing amber badge `"⚠️ DENSITY FALLBACK ACTIVE"`.
  - If `weather_modifier && weather_modifier.condition !== 'clear'`: Displays amber tag `"⚡ MODIFIED: {weather_modifier.label}"`.
  - If `!pipelineActive`: Displays slate badge `"⏸️ STATIC SNAPSHOT (PAUSED)"`.
  - If `cv_confidence < 80`: CV Confidence badge switches from emerald to amber with label `"(RAIN DEGRADATION)"`.
  - If `eta_to_red_min === 0`: Shows `"CRITICAL NOW"` in red; if non-null, shows `"~X min"`; if null, shows `"STABLE"` in green.
* **Computed/Derived Values:**
  - `isCorridor`: `zoneData?.zone_type === 'corridor' || zoneId === 'zone_2'`.
  - `isLive`: `zoneData?.feed_source === 'live_webcam' || zoneId === 'zone_1'`.
  - `red_threshold`: Drone camera uses `3.5 * weather_modifier.density_factor`, CCTV corridor defaults to `2.0`, standard general defaults to `3.5`.

---

### 2.3 `AlertPanel.jsx`
* **File Path:** [frontend/src/components/AlertPanel.jsx](file:///d:/crowd%20sense/frontend/src/components/AlertPanel.jsx)
* **What it displays and why:** Lists all active unacknowledged incidents (`activeUnacknowledged`), showing alert type (Panic, Citizen Emergency, Red Alert), zone ID, reported category, trigger timestamp, assigned personnel, auto-escalation target, and description.
* **User Actions Supported:**
  - *Click "ACKNOWLEDGE ALERT" Button:* Triggers `onAcknowledgeAlert(alert.alert_id)`.
* **API Endpoints & WebSocket Channels:**
  - Triggers acknowledgment flow implemented in parent `App.jsx` (`socket.emit('acknowledge_alert')` and `POST /api/alerts/:id/acknowledge`).
* **State Management:**
  - Holds no local state. Derived from `alerts` prop.
* **Conditional Rendering Logic:**
  - If `activeUnacknowledged.length === 0`: Renders `"✓ All Zones Normal"` green empty state.
  - If `alert.alert_type === 'immediate_panic_alert'`: Applies `animate-panic ring-2 ring-red-500` and displays `'🛑 IMMEDIATE PANIC ALERT'`.
  - If `alert.alert_type === 'citizen_report'`: Displays `'📱 CITIZEN EMERGENCY REPORT'` and reported issue badge.
  - If `alert.escalated_at && alert.escalated_to`: Shows `"AUTO-ESCALATED → {alert.escalated_to}"` tag.
* **Props Received & Passed Down:**
  - Receives `alerts`, `onAcknowledgeAlert`, `socket`, `backendUrl`.
  - *Dead Import Note:* Imports `PlaybookPanel` at Line 2, but does NOT render it.

---

### 2.4 `TrendExtrapolationGraph.jsx`
* **File Path:** [frontend/src/components/TrendExtrapolationGraph.jsx](file:///d:/crowd%20sense/frontend/src/components/TrendExtrapolationGraph.jsx)
* **What it displays and why:** Renders SVG density trajectory polyline, projected linear slope line to red threshold, rate of rise ($p/m^2/min$), composite risk score ($0.00 - 1.00$), and ETA countdown to threshold limit. Contains a breakdown modal showing formula weights.
* **User Actions Supported:**
  - *Click "HOW IS THIS COMPUTED?" Button:* Toggles `showFormulaModal` boolean state.
  - *Click "✕ CLOSE" Button inside Modal:* Sets `showFormulaModal(false)`.
* **API Endpoints & WebSocket Channels:**
  - None directly; purely driven by `zoneData` prop updates.
* **State Management:**
  - *Local State:* `showFormulaModal` (boolean).
* **Conditional Rendering Logic:**
  - If `!zoneData`: Returns `null`.
  - If `trend_slope > 0`: Extrapolates dashed orange projection line (`stroke="#F97316" strokeDasharray="3 3"`) from the last data coordinate to `red_threshold`.
  - If `eta_to_red_min === 0`: Renders red text `"🛑 CRITICAL THRESHOLD BREACHED"`; if positive integer, renders amber `"Crosses red threshold in ~X min"`; else green `"✓ Density Slope Stable"`.
  - If `showFormulaModal === true`: Renders composite risk score formula table breaking down weights (Density 50%, Trend 30%, Convergence 10%, Turbulence 10%).
* **Computed/Derived Values:**
  - Scales historical density points into SVG viewBox coordinate space ($600 \times 160$ px with 25px padding).
  - Normalizes metrics: `density_norm = min(1.0, density / red_threshold)`, `trend_norm = min(1.0, max(0.0, trend_slope / 2.0))`.

---

### 2.5 `AssistantPushBanner.jsx`
* **File Path:** [frontend/src/components/AssistantPushBanner.jsx](file:///d:/crowd%20sense/frontend/src/components/AssistantPushBanner.jsx)
* **What it displays and why:** Displays push-first automated action guidance banners triggered by threshold crossings, panic signatures, or citizen emergency reports.
* **User Actions Supported:**
  - *Click "✕ DISMISS" Button:* Invokes `onDismiss(inst.instructionId || index)` to filter the instruction out of parent state.
* **API Endpoints & WebSocket Channels:**
  - None directly; instructions are passed via props from `App.jsx` (`socket.on('assistant_instruction')`).
* **State Management:**
  - Pure presentational component.
* **Conditional Rendering Logic:**
  - Returns `null` if `instructions` is empty or null.
  - If `inst.alertType === 'citizen_report' || inst.category`: Uses Citizen SOS styling (`var(--risk-red-bg)` or `var(--risk-orange-bg)`).
  - If `severity === 'red' || eventType === 'alert_panic'`: Adds `animate-panic ring-2 ring-red-500` pulse class and red badge.
  - If `severity === 'orange'`: Uses orange border and badge.
  - If `severity === 'yellow'`: Uses yellow/amber border and badge.
  - Sanitization logic strips internal reasoning tags (`<think>...</think>` or `"Here's a thinking process"`) before rendering text.

---

### 2.6 `AssistantChatPanel.jsx`
* **File Path:** [frontend/src/components/AssistantChatPanel.jsx](file:///d:/crowd%20sense/frontend/src/components/AssistantChatPanel.jsx)
* **What it displays and why:** Secondary pull-mode collapsible Q&A chat drawer for control room staff follow-up questions grounded in live zone telemetry, gate states, and active incidents.
* **User Actions Supported:**
  1. *Click Panel Header Toggle Button:* Inverts `isOpen` boolean state.
  2. *Click Suggested Operational Inquiry Chips:* Passes prompt string directly to `handleSendMessage(prompt)`.
  3. *Type in Text Input:* Updates `inputMessage` state.
  4. *Submit Form (Enter key or Click "SEND ➤"):* Dispatches `handleSendMessage()`.
* **API Endpoints & WebSocket Channels:**
  - `POST /api/assistant/ask` with JSON `{ question: text }`.
* **State Management:**
  - *Local State:* `isOpen` (boolean, defaults `false`), `inputMessage` (string), `loading` (boolean), `messages` (array of `{ id, sender, text, timestamp, source, model }`).
* **Conditional Rendering Logic:**
  - If `isOpen === false`, only the collapsed header button is rendered.
  - If `loading === true`: Shows pulsing indicator `"Consulting live telemetry & standard procedures..."`, and disables send button and text input.
  - Errors during fetch append an error bubble: `"I can't reach the assistant right now. Check the dashboard directly for current zone status."`
* **Client-side Validation:**
  - Blocks dispatch if `!textToSend.trim()` or `loading === true`.

---

### 2.7 `AuditLogView.jsx`
* **File Path:** [frontend/src/components/AuditLogView.jsx](file:///d:/crowd%20sense/frontend/src/components/AuditLogView.jsx)
* **What it displays and why:** Displays an immutable read-only audit log table of system incidents, automated assistant instructions, and completed playbook steps.
* **User Actions Supported:**
  1. *Click Filter Pills* (`ALL`, `PANIC`, `ESCALATED`, `ACKNOWLEDGED`, `ASSISTANT GUIDANCE`, `PLAYBOOK STEPS`): Updates `filter` state.
  2. *Click "↻ REFRESH" Button:* Invokes `onRefresh` prop callback (triggering `fetchAuditLogs()` in `App.jsx`).
* **API Endpoints & WebSocket Channels:**
  - None directly; invokes `onRefresh` prop.
* **State Management:**
  - *Local State:* `filter` (string, defaults to `'ALL'`).
  - *Props Received:* `logs`, `playbookSteps`, `assistantInstructions`, `onRefresh`.
* **Conditional Rendering Logic:**
  - If `filter === 'ASSISTANT GUIDANCE'`: Renders 7-column Assistant Guidance table (`instruction_id`, `zone`, `event_type`, `severity`, `text`, `source`, `generated_at`).
  - If `filter === 'PLAYBOOK STEPS'`: Renders 6-column Playbook Step table (`id`, `alert_id`, `step_index`, `step_text`, `completed_by`, `completed_at`).
  - Default: Renders 10-column Alert Log table (`alert_id`, `zone_id`, `severity`, `alert_type`, `triggered_at`, `assigned_to`, `acknowledged_at`, `acknowledged_by`, `escalated_to`, `responder_status`).
  - Filter logic:
    - `'PANIC'`: `log.alert_type === 'immediate_panic_alert'`
    - `'ESCALATED'`: `Boolean(log.escalated_at)`
    - `'ACKNOWLEDGED'`: `Boolean(log.acknowledged_at)`

---

### 2.8 `WeatherControlPanel.jsx`
* **File Path:** [frontend/src/components/WeatherControlPanel.jsx](file:///d:/crowd%20sense/frontend/src/components/WeatherControlPanel.jsx)
* **What it displays and why:** Top operational environmental strip displaying current simulated temperature (°C), precipitation (mm/h), density factor, flow factor, mandatory simulated disclosure tag, master CV pipeline power status, and presenter preset buttons.
* **User Actions Supported:**
  1. *Click Environmental Preset Buttons* (`CLEAR`, `EXTREME HEAT`, `HEAVY RAIN`): Dispatches `handleSelectPreset(presetId)`.
  2. *Click Master CV Pipeline Power Toggle Button*: Dispatches `handlePipelineToggle()` to pause or resume live CV processing.
* **API Endpoints & WebSocket Channels:**
  - `POST /api/conditions/set` with payload `{ condition: presetId }`.
  - `POST /api/pipeline/toggle` (if `onTogglePipeline` prop not supplied).
* **State Management:**
  - *Local State:* `loadingPreset` (string|null), `togglingPipeline` (boolean).
  - *Props Received:* `weatherState`, `backendUrl`, `pipelineActive`, `onTogglePipeline`.
* **Conditional Rendering Logic:**
  - Active preset button receives highlighted background (`activeBg`) and displays `"● LIVE"`.
  - Pipeline button renders green `"🟢 CV PIPELINE: LIVE"` when active, or amber pulsing `"⏸️ CV PIPELINE: PAUSED"` when paused.
  - Buttons are disabled and show loading states during active network requests.

---

### 2.9 `ConnectionStatusBanner.jsx`
* **File Path:** [frontend/src/components/ConnectionStatusBanner.jsx](file:///d:/crowd%20sense/frontend/src/components/ConnectionStatusBanner.jsx)
* **What it displays and why:** Top-of-screen amber warning banner when the Socket.io connection drops or backend restarts.
* **User Actions Supported:**
  - *Click "🔄 RECONNECT NOW" Button:* Invokes `onRetry` prop callback.
* **API Endpoints & WebSocket Channels:**
  - Invokes `onRetry` prop (calling `socketInstance.connect()`).
* **State Management:**
  - Pure presentational component.
* **Conditional Rendering Logic:**
  - If `connected === true`, returns `null`.
  - When disconnected, shows reconnection attempt counter: `(Attempt {reconnectAttempts}/10)`.

---

### 2.10 `KnownLimitationsModal.jsx`
* **File Path:** [frontend/src/components/KnownLimitationsModal.jsx](file:///d:/crowd%20sense/frontend/src/components/KnownLimitationsModal.jsx)
* **What it displays and why:** Displays 12 proactive architectural limitations and honesty disclosures covering calibration, optical flow vs tracking, demo loop footage, simulated dispatch, privacy/ethics, manual responder check-in, pre-authored routes, in-app feeds, simulated weather, Gemini capstone reporting, peak occupancy definitions, and NDMA decision support boundaries.
* **User Actions Supported:**
  1. *Click "✕ CLOSE" Button (Header):* Invokes `onClose()`.
  2. *Click "ACKNOWLEDGE & RETURN TO DASHBOARD" Button (Footer):* Invokes `onClose()`.
* **API Endpoints & WebSocket Channels:** None.
* **State Management:** Pure presentational modal controlled by `isOpen` prop.
* **Conditional Rendering Logic:** Returns `null` if `isOpen === false`.

---

### 2.11 `MockDispatchControl.jsx`
* **File Path:** [frontend/src/components/MockDispatchControl.jsx](file:///d:/crowd%20sense/frontend/src/components/MockDispatchControl.jsx)
* **What it displays and why:** Card interface for triggering simulated emergency service dispatches and siren announcements, with stacked toast notifications marked `[SIMULATION ONLY]`.
* **User Actions Supported:**
  1. *Click "🚓 DISPATCH POLICE":* Triggers `triggerMockDispatch('POLICE & AMBULANCE DISPATCH', 'zone_1')`.
  2. *Click "🚨 TRIGGER SIREN":* Triggers `triggerMockDispatch('SIREN & PUBLIC ANNOUNCEMENT', 'zone_2')`.
  3. *Click "🚑 DISPATCH AMBULANCE":* Triggers `triggerMockDispatch('MEDICAL RESPONSE UNIT', 'zone_2')`.
  4. *Click "DISMISS" on Toast:* Calls `onDismissToast(index)`.
* **API Endpoints & WebSocket Channels:**
  - `POST /api/dispatch/simulate` with payload `{ action: actionName, zone_id: zoneId }`.
* **State Management:**
  - *Local State:* `loadingAction` (string|null).
  - *Props Received:* `activeToasts`, `onDismissToast`.
* **Conditional Rendering Logic:**
  - Toasts only render if `activeToasts.length > 0`.
  - Buttons are disabled while any action request is in flight (`loadingAction !== null`).
* **Audit Finding / Status:** *UNCLEAR — needs manual review.* Component is fully implemented and imported in `App.jsx`, but is not rendered in `App.jsx`'s layout.

---

### 2.12 `BottleneckExitMap.jsx`
* **File Path:** [frontend/src/components/BottleneckExitMap.jsx](file:///d:/crowd%20sense/frontend/src/components/BottleneckExitMap.jsx)
* **What it displays and why:** Interactive 2D vector operations map illustrating the Staging Lawn ($450\text{ m}^2$), 4.0m connecting channels (IN Gate, OUT Gate, Emergency Way), Main Gathering Field ($1,800\text{ m}^2$), Main Concert Stage, Central X-Junction, and X-Highway emergency corridor network. Includes interactive choke points, animated vehicle dispatch simulation, targeted marshal breach alerts, and telemetry logs.
* **User Actions Supported:**
  1. *Toggle Layer Checkboxes:* Mutates `layers` state (`corridor`, `heatmap`, `chokePoints`, `gridOverlay`).
  2. *Toggle Test Breach Locks:* `handleToggleSegmentBreach('seg_1' | 'seg_2' | 'seg_3a')` locks segment density at $1.35\text{ p/m}^2$.
  3. *Click SVG Corridor Segment Path:* Selects segment into `selectedItem` inspector.
  4. *Click SVG Choke Point Node:* Selects choke point into `selectedItem` inspector.
  5. *Click Vehicle Unit Mode Buttons:* Toggles `dispatchMode` (`'AMBULANCE'` vs `'FOOT_MEDIC'`).
  6. *Select Target Field Quadrant Dropdown:* Changes `dispatchTarget` (`'seg_3a'`, `'seg_3b'`, `'seg_3c'`, `'seg_2'`).
  7. *Click "🚀 Launch Dispatch" / "⏹️ Cancel Dispatch" Button:* Toggles `isSimulating` and resets `simProgress`.
  8. *Click "⚡ Report clearance & Resume Vehicle" / "⚡ report Breach cleared":* Calls `handleClearSegmentBreach(segId)` resetting segment density to $0.25\text{ p/m}^2$, removing marshal alert, and auto-resuming vehicle simulation.
  9. *Click "🧹 Clear All Breaches":* Calls `handleClearAllBreaches()`.
* **API Endpoints & WebSocket Channels:**
  - Directly consumes `zoneMap.zone_2.density` and `zoneMap.zone_1.density` via props.
* **State Management:**
  - *Local State:* `layers` (object), `selectedItem` (object), `segmentDensities` (object), `manualBreaches` (object), `marshalAlerts` (array), `controlRoomLogs` (array), `dispatchMode` (string), `dispatchTarget` (string), `isSimulating` (boolean), `simProgress` (number $0.0 - 1.0$).
* **Conditional Rendering Logic:**
  - *Automatic Breach Halt:* If any segment on the active dispatch path exceeds `redThreshold` ($1.0\text{ p/m}^2$), vehicle transit stops immediately at the entrance node (`isVehicleHaltedAtBreach = true`), displaying the pulsing red `🚨 OFFICIAL ACTION REPORT REQUIRED` banner.
  - Heatmap layers render SVG radial gradients if `layers.heatmap === true`.
  - SVG choke points scale up when clicked (`r={isSelected ? 13 : 9}`).
* **Computed/Derived Values:**
  - Vehicle position is evaluated along quadratic Bezier curves:
    $$B(t) = (1-t)^2 P_0 + 2(1-t)t P_1 + t^2 P_2$$
  - Transit ETA countdown: `Math.round((1 - simProgress) * 55)` seconds.

---

### 2.13 `DualPhoneSimulator.jsx`
* **File Path:** [frontend/src/components/DualPhoneSimulator.jsx](file:///d:/crowd%20sense/frontend/src/components/DualPhoneSimulator.jsx)
* **What it displays and why:** Renders two realistic mocked smartphone device frames side-by-side: Device 1 (iPhone frame running `CitizenReportView`) and Device 2 (Android tactical frame running `ResponderDashboard`).
* **User Actions Supported:**
  - *Click "🖥️ Open Command Ops Dashboard ↗" Header Link:* Opens `http://<host>:5173` in a new tab.
* **API Endpoints & WebSocket Channels:** None directly; passes `socket`, `backendUrl`, `connected`, etc., to child views.
* **State Management:**
  - *Local State:* `currentTime` (formatted `HH:mm`, updated every 10s via `setInterval`).
* **Conditional Rendering Logic:**
  - Port badge displays `'PORT 5174 (DEDICATED)'` if running on port 5174, else `'DUAL PHONE MODE'`.

---

### 2.14 `CitizenReportView.jsx`
* **File Path:** [frontend/src/components/CitizenReportView.jsx](file:///d:/crowd%20sense/frontend/src/components/CitizenReportView.jsx)
* **What it displays and why:** Mobile app interface for event attendees to submit emergency SOS reports (Medical Assistance, Suspicious Activity, Report Theft, Blocked Exits) and view real-time status progression from control room acknowledgment to on-scene resolution.
* **User Actions Supported:**
  1. *Click Category Card Button:* Selects `selectedCategory` (`MEDICAL_ASSISTANCE`, `SUSPICIOUS_ACTIVITY`, `REPORT_THEFT`, `BLOCKED_EXITS`).
  2. *Change Zone Dropdown:* Updates `selectedZone` (`'zone_1'` or `'zone_2'`).
  3. *Type in Details Input:* Updates `description` state.
  4. *Click "🚨 SEND EMERGENCY REPORT" Button:* Dispatches `handleSubmit(e)`.
  5. *Click "+ Submit Another Report" Button:* Invokes `handleReset()`.
* **API Endpoints & WebSocket Channels:**
  - `POST /api/citizen-reports` with JSON body: `{ category, zone_id, description, reporter_name }`.
  - Socket Listeners: `alert_status_updated`, `alert_acknowledged`. When incoming alert matches `submittedAlert.alert_id`, merges status live.
* **State Management:**
  - *Local State:* `selectedCategory`, `selectedZone`, `reporterName`, `description`, `submitting` (boolean), `submittedAlert` (object|null), `error` (string|null).
* **Conditional Rendering Logic:**
  - If `submittedAlert` is non-null: Renders Real-Time Report Tracker Card with three-tier live timeline (Report Received, Acknowledged by Responder, Live Status Update).
  - Else: Renders the 4-category 2x2 grid form.
  - Submit button shows spinner and text `"SENDING SOS..."` during network requests.

---

### 2.15 `ResponderDashboard.jsx`
* **File Path:** [frontend/src/components/ResponderDashboard.jsx](file:///d:/crowd%20sense/frontend/src/components/ResponderDashboard.jsx)
* **What it displays and why:** Tactical operations terminal for checked-in field responders, displaying assigned zone, nearest team lookups, mute toggle, audio alerts (Web Audio API), unacknowledged alert counters, severity filter strip, and alert cards.
* **User Actions Supported:**
  1. *Click "Change zone" Link:* Sets `showChangeZone(true)` to re-render `ResponderCheckin`.
  2. *Click Mute Toggle Button:* Toggles `muted` boolean state.
  3. *Click Severity Filter Buttons* (`ALL`, `HIGH`, `MEDIUM`): Updates `severityFilter` state.
  4. *Click "OPEN ACTIVE INCIDENT SCREEN" / Alert Card Action:* Opens `ActiveIncidentResponseModal`.
* **API Endpoints & WebSocket Channels:**
  - `GET /api/responders/nearest?zone_id=:zone`: Fetched for each unique alert zone.
  - Audio Cue: Web Audio API `AudioContext` synthesizer (440Hz 0.3s beep for graduated alerts; 880Hz 3-pulse burst for panic alerts).
* **State Management:**
  - *Local State:* `responder` (checked-in user object), `showChangeZone` (boolean), `nearestTeams` (map of `zone_id -> nearest result`), `muted` (boolean), `severityFilter` ('ALL'|'HIGH'|'MEDIUM'), `activeTacticalAlert` (object|null).
* **Conditional Rendering Logic:**
  - If `!responder || showChangeZone`: Renders `<ResponderCheckin />`.
  - If no alerts match filter: Renders `"ALL CLEAR - No active alerts"` state.
  - If `activeTacticalAlert` is set: Mounts `<ActiveIncidentResponseModal />` overlay.
* **Client-side Sorting & Filtering:**
  - `sortAlertsByTimeReceived()`: Strictly sorts alerts descending by `triggered_at` timestamp.
  - Severity filter extracts red/panic alerts for `'HIGH'`, orange/medium for `'MEDIUM'`.

---

### 2.16 `ResponderCheckin.jsx`
* **File Path:** [frontend/src/components/ResponderCheckin.jsx](file:///d:/crowd%20sense/frontend/src/components/ResponderCheckin.jsx)
* **What it displays and why:** Check-in screen requiring field responders to register their name/callsign and current zone location.
* **User Actions Supported:**
  1. *Type Name/Team ID Input:* Updates `name` state.
  2. *Click Zone Selection Button* (`Zone 1` vs `Zone 2`): Updates `selectedZone` state.
  3. *Submit Form ("CHECK IN" Button):* Dispatches `handleSubmit(e)`.
* **API Endpoints & WebSocket Channels:**
  - `POST /api/responders/checkin` with JSON `{ responder_id, name, zone_id }`.
* **State Management:**
  - *Local State:* `name` (string), `selectedZone` (string|null), `submitting` (boolean), `error` (string|null).
* **Client-side Validation:**
  - Validates that `name.trim()` and `selectedZone` are both present before sending. Displays red alert message if missing.

---

### 2.17 `ResponderAlertCard.jsx`
* **File Path:** [frontend/src/components/ResponderAlertCard.jsx](file:///d:/crowd%20sense/frontend/src/components/ResponderAlertCard.jsx)
* **What it displays and why:** Panic-usable field alert card displaying SVG type icon, zone label, reported category, live staleness ticker ("Xm Xs ago"), nearest team, pre-planned route, full-width 56px acknowledge button, status update buttons (EN ROUTE, ON SCENE, RESOLVED, NEED BACKUP), and embedded response playbook.
* **User Actions Supported:**
  1. *Click "ACKNOWLEDGE & OPEN RESPONSE VIEW" Button:* Emits socket event `acknowledge_alert` and opens tactical view.
  2. *Click "OPEN ACTIVE INCIDENT SCREEN" Button:* Invokes `onOpenTacticalView(alert)`.
  3. *Click Status Update Buttons* (`EN ROUTE`, `ON SCENE`, `RESOLVED`, `NEED BACKUP`): Dispatches `handleStatusUpdate(status)`.
* **API Endpoints & WebSocket Channels:**
  - Socket Emits:
    - `acknowledge_alert`: `{ alert_id, acknowledged_by }`
    - `update_alert_status`: `{ alert_id, status, responder_id }`
* **State Management:**
  - *Local State:* `stalenessDisplay` (object with label, colorVar, pulse), `activeStatus` (string|null), `statusPending` (boolean).
* **Conditional Rendering Logic:**
  - Live staleness timer shifts color: `< 1 min` = green; `1 - 3 min` = yellow; `> 3 min` = red + `staleness-pulse` CSS animation.
  - If unacknowledged: Renders dominant priority color bar and large acknowledge button.
  - If acknowledged: Renders 2x2 grid of status buttons and mounts `<PlaybookPanel defaultExpanded={false} />`.

---

### 2.18 `ActiveIncidentResponseModal.jsx`
* **File Path:** [frontend/src/components/ActiveIncidentResponseModal.jsx](file:///d:/crowd%20sense/frontend/src/components/ActiveIncidentResponseModal.jsx)
* **What it displays and why:** Full-screen tactical incident response screen inside the mobile frame containing live status controls, nearest team route details, and the complete incident playbook checklist.
* **User Actions Supported:**
  1. *Click "← BACK" / "← Return to Alert Feed" Button:* Invokes `onClose()`.
  2. *Click Live Status Buttons* (`EN ROUTE`, `ON SCENE`, `RESOLVED`, `NEED BACKUP`): Dispatches `handleStatusUpdate(status)`.
* **API Endpoints & WebSocket Channels:**
  - Socket Emit: `update_alert_status` (`{ alert_id, status, responder_id }`).
  - REST Fallback: `POST /api/alerts/:alertId/status` with body `{ status, responder_id }`.
* **State Management:**
  - *Local State:* `activeStatus` (string|null), `statusPending` (boolean).
* **Conditional Rendering Logic:**
  - Selected status button receives active background color and white text.
  - Automatically loads `<PlaybookPanel defaultExpanded={true} hideToggle={true} />`.

---

### 2.19 `PlaybookPanel.jsx`
* **File Path:** [frontend/src/components/PlaybookPanel.jsx](file:///d:/crowd%20sense/frontend/src/components/PlaybookPanel.jsx)
* **What it displays and why:** Incident response decision support panel showing NDMA guideline grounding badges, staffing assessment with live shortfall calculation, Groq/Gemini contextual prioritization narrative, and an interactive checklist of immediate actions.
* **User Actions Supported:**
  1. *Click Header Toggle Button:* Inverts `expanded` state (unless `hideToggle === true`).
  2. *Click Checklist Checkbox:* Invokes `handleToggleStep(stepIndex, stepText)`.
* **API Endpoints & WebSocket Channels:**
  - `GET /api/alerts/:alertId/playbook?zone_id=&severity=&alert_type=&category=`: Fetches playbook protocol, shortfall analysis, and narrative.
  - `POST /api/alerts/:alertId/playbook-step`: Logs completed step to SQLite audit log with body `{ step_index, step_text, completed_by }`.
  - Socket Listeners: `playbook_step_completed`, `responder_checkin`.
  - Socket Emits: `complete_playbook_step` (`{ alert_id, step_index, step_text, completed_by }`).
* **State Management:**
  - *Local State:* `expanded` (boolean), `loading` (boolean), `playbookData` (object|null), `completedStepsMap` (map of `step_index -> record`), `completingIndex` (number|null).
* **Conditional Rendering Logic:**
  - If `shortfall.is_shortfall === true`: Renders red pulsing badge `"⚠️ SHORTFALL (X NEEDED) — REQUEST BACKUP"`; else green `"✓ STAFFING SUFFICIENT"`.
  - Checked items receive strikethrough styling and show completion metadata: `"✓ Completed by [Name] at [Time]"`.
  - Once checked, checkboxes are permanently disabled to preserve audit integrity.

---

### 2.20 `PostEventAnalysisView.jsx`
* **File Path:** [frontend/src/components/PostEventAnalysisView.jsx](file:///d:/crowd%20sense/frontend/src/components/PostEventAnalysisView.jsx)
* **What it displays and why:** Dual-subtab view providing: (1) Capstone Post-Event Report Generator with executive accountability metrics, and (2) Chronological incident timeline and audit log view.
* **User Actions Supported:**
  1. *Click Sub-Tab Switcher* (`FORMAL SAFETY REPORT` vs `TIMELINE & AUDIT LOGS`): Sets `activeSubTab`.
  2. *Click Scope Buttons* (`ALL ZONES`, `ZONE_1`, `ZONE_2`): Updates `selectedZone` state.
  3. *Toggle Simulated Reference Figures Checkbox*: Updates `includeSimulatedRef` boolean.
  4. *Click "📥 Load Cached Report (Demo Safety)" Button*: Dispatches `fetchLatestReport(false)`.
  5. *Click "⚡ GENERATE OFFICIAL REPORT" Button*: Dispatches `handleGenerateReport()`.
* **API Endpoints & WebSocket Channels:**
  - `GET /api/post-event-timeline?zone_id=:selectedZone`: Fetches milestone alert markers and summary stats.
  - `GET /api/reports/latest`: Loads last saved report from SQLite cache.
  - `POST /api/reports/generate`: Dispatches generation request with payload `{ scope, include_simulated_reference, venue_name }`.
* **State Management:**
  - *Local State:* `activeSubTab`, `selectedZone`, `includeSimulatedRef`, `timelineData`, `isGenerating` (boolean), `generationStep` (string), `currentReport` (object|null), `errorMessage` (string|null).
* **Conditional Rendering Logic:**
  - While `isGenerating`: Shows spinner and multi-step pipeline status banner.
  - If error occurs during generation, automatically attempts to fall back to `fetchLatestReport()`.

---

### 2.21 `PostEventReportDocument.jsx`
* **File Path:** [frontend/src/components/PostEventReportDocument.jsx](file:///d:/crowd%20sense/frontend/src/components/PostEventReportDocument.jsx)
* **What it displays and why:** Administrative post-incident filing document featuring executive accountability KPI tiles (Time-to-Acknowledge, Auto-Escalations, Panic Bypasses, Peak Concurrent Occupancy), custom zero-dependency Markdown renderer, simulated tags, verification source tags, and audit inspector.
* **User Actions Supported:**
  1. *Click "🔍 View Underlying JSON Data" Button:* Toggles `showJsonDrawer` boolean state.
  2. *Click "📋 Copy Markdown" Button:* Copies `markdown_content` to clipboard via `navigator.clipboard.writeText()` and displays `"✓ Copied"`.
  3. *Click "🖨️ Export as PDF / Print" Button:* Triggers `window.print()`.
* **API Endpoints & WebSocket Channels:** None.
* **State Management:**
  - *Local State:* `showJsonDrawer` (boolean), `copied` (boolean).
* **Conditional Rendering Logic:**
  - If `report.generation_source === 'local_fallback' || report.is_fallback`: Renders amber badge `"⚠️ LOCAL DETERMINISTIC SYNTHESIS (Offline Fallback)"`; else green badge `"🤖 AI SYNTHESIZED via Gemini LLM"`.
  - Print styles (`@media print` in `index.css` and `print:hidden` classes) hide headers, footers, and utility buttons during PDF export.

---

### 2.22 `PlannerPage.jsx`
* **File Path:** [frontend/src/pages/PlannerPage.jsx](file:///d:/crowd%20sense/frontend/src/pages/PlannerPage.jsx)
* **What it displays and why:** Venue simulation environment for pre-event planning. Features a left-hand canvas drawing editor drawer and a right-hand 2D canvas / 2.5D Three.js simulation viewport with social force agents.
* **User Actions Supported:**
  1. *Toggle View Mode Switcher* (`2D SIMULATION` vs `2.5D VENUE VIEW`): Mutates `viewMode` state.
  2. *Toggle Planner Module View* (`SIMULATION & LAYOUT` vs `PLANNING REPORT`): Mutates `plannerView` state (`'sim'` vs `'report'`).
  3. *Toggle Editor Drawer Button*: Inverts `isEditorOpen` boolean.
  4. *Click Drawing Tool Buttons* (`SELECT`, `WALL`, `BARRICADE`, `EXIT`, `OPENING`, `SPAWN`, `FOCUS`, `SCALE`): Updates `drawTool`.
  5. *Canvas Drawing & Dragging Interactions:*
     - Left-click to add polygon vertices (Wall). Double-click or click near start vertex to close polygon.
     - Click-and-drag two points for Barricades, Exits, and Dynamic Openings.
     - Single click to place Spawns and Focus Attraction points.
     - Drag existing vertices, barricade endpoints, exits, or spawns when `drawTool === 'SELECT'`.
     - Press `Delete` or `Backspace` key to remove selected entity.
  6. *Type Venue Name Input:* Updates `venueName` state.
  7. *Click "SAVE VENUE" Button:* Dispatches `handleSaveVenue()`.
  8. *Click "RESET TO DEMO" Button:* Re-initializes layout to `DEMO_VENUE`.
  9. *Scale Calibration Modal:* Enter real-world distance in meters and submit to calibrate pixels-per-meter.
  10. *Saved Venue Dropdown:* Load previously saved layouts from backend.
* **API Endpoints & WebSocket Channels:**
  - `GET /api/venues`: Fetches saved venue layouts on initial mount.
  - `GET /api/venues/:id`: Loads a specific venue layout.
  - `POST /api/venues`: Saves new or updated layout with JSON `{ id, name, layout_data }`.
* **State Management:**
  - *Local State:* `layout`, `savedVenues`, `venueName`, `venueId`, `saveStatus`, `isEditorOpen`, `viewMode` ('2D'|'2.5D'), `plannerView` ('sim'|'report'), `drawTool`, `selectedItem`, `dragState`, `hoveredHit`, `currentPoly`, `barricadeLine`, `exitLine`, `openingLine`, `scalePoints`, `scaleDistance`, `showScaleDialog`, `mousePos`, `simMode` ('edit'|'running'|'paused'), `isEmergency` (boolean), `agentCount`, `simTimeSec`, `maxDensity`, `fps`, `focusPoint`, `isFocusMode`, `focusCondition`, `spawnRate`, `maxAgents`, `heatmapOpacity`, `showGrid`, `activeSpawnIds`.
* **Conditional Rendering Logic:**
  - If `plannerView === 'report'`: Replaces simulation viewport with `<PlannerReportPage layout={layout} backendUrl={backendUrl} />`.
  - If `viewMode === '2.5D'`: Mounts Three.js `<Venue25DViewer />` instead of 2D HTML5 canvas.
  - Wall editor renders in-progress rubber-band polygon preview lines.

---

### 2.23 `PlannerControls.jsx`
* **File Path:** [frontend/src/components/PlannerControls.jsx](file:///d:/crowd%20sense/frontend/src/components/PlannerControls.jsx)
* **What it displays and why:** Side-panel simulation control deck for the Planner module, exposing playback controls, emergency evacuation triggers, live telemetry (agents, elapsed time, fps, peak density, Fruin LOS badge), spawn rates, population caps, dynamic emergency gate toggles, focus attraction points, and display overlays.
* **User Actions Supported:**
  1. *Click "START SIM" / "RESUME" Button:* Calls `onStart()`.
  2. *Click "PAUSE" Button:* Calls `onPause()`.
  3. *Click "RESET" Button:* Calls `onReset()`.
  4. *Click "TRIGGER EMERGENCY SURGE" Button:* Calls `onTriggerEmergency()`.
  5. *Click Individual Gate Button ("OPEN" / "CLOSED"):* Calls `onToggleOpening(op.id)`.
  6. *Click "Open All" / "Close All" Gate Buttons:* Calls `onOpenAllOpenings()` / `onCloseAllOpenings()`.
  7. *Click Focus Mode "ENABLE" / "✓ ACTIVE" Button:* Calls `onToggleFocusMode()`.
  8. *Click Focus Condition Buttons* (`Normal` vs `Surge`): Calls `onFocusConditionChange('normal' | 'rushed')`.
  9. *Click "📍 Set Target" Link:* Calls `onSelectFocusTool()`.
  10. *Toggle Active Spawn Checkboxes:* Calls `onToggleSpawn(sp.id)`.
  11. *Adjust Spawn Inflow Slider (0 - 20 p/sec):* Calls `onSpawnRateChange(val)`.
  12. *Adjust Population Cap Slider (50 - 1500 agents):* Calls `onMaxAgentsChange(val)`.
  13. *Adjust Heatmap Opacity Slider (0.0 - 1.0):* Calls `onHeatmapOpacityChange(val)`.
  14. *Toggle "Show density grid lines" Checkbox:* Calls `onShowGridChange(val)`.
* **API Endpoints & WebSocket Channels:** None directly; controls local Social Force Model engine via callbacks.
* **State Management:** Pure presentational control interface.
* **Conditional Rendering Logic:**
  - Start button is disabled if `!canRun` (no venue loaded or already running).
  - Emergency button shows red flashing animation `animate-panic` when `isEmergency === true`.
  - Gate buttons animate green pulse when `isOpen === true`.
  - Fruin Level of Service badge color-shifts based on `maxDensityPpm2` ($<1.08$ = LOS A/B Green, $1.08-2.15$ = LOS C Yellow, $2.15-3.8$ = LOS D/E Orange, $>3.8$ = LOS F Red).

---

### 2.24 `Venue25DViewer.jsx`
* **File Path:** [frontend/src/components/Venue25DViewer.jsx](file:///d:/crowd%20sense/frontend/src/components/Venue25DViewer.jsx)
* **What it displays and why:** WebGL/Three.js 2.5D visualizer rendering extruded 3D buildings, Gopuram temple spires, rooftops (HVAC units, water tanks, solar panels, skylights, satellite dishes, communications masts), ground barricades, dynamic emergency gates with illuminated threshold pads, spawn portals, and up to 2,000 GPU-instanced 3D pedestrian agents.
* **User Actions Supported:**
  1. *OrbitControls 3D Camera Navigation:*
     - Left-click drag: Orbit/rotate camera.
     - Right-click drag: Pan camera.
     - Scroll wheel: Zoom camera ($150 - 2400$ distance limits).
  2. *Interactive 3D Gate Raycast Clicking:* Pointer click on any 3D emergency gate mesh triggers Three.js raycaster and invokes `onToggleEmergencyGate(gateId)`.
* **API Endpoints & WebSocket Channels:** None; updates per animation frame directly from `agentsRef.current`.
* **State Management:**
  - *Internal Three.js Refs:* `sceneRef`, `cameraRef`, `rendererRef`, `controlsRef`, `instancedAgentsRef`, `dynamicGroupRef`, `interactiveGateMeshesRef`.
* **Conditional Rendering Logic:**
  - Dynamic gates: Closed gates render red horizontal barriers; open gates swing 85 degrees outward and illuminate green floor pads.
  - Agents: Normal agents render Cyan (`#38bdf8`), panic agents render Red (`#ef4444`), focus agents render Purple (`#c084fc`), and agents heading for emergency exits render Amber (`#f59e0b`).
  - Strict boundary clamping prevents 3D agents from walking outside the venue perimeter into the exterior buffer zone.

---

### 2.25 `PlannerReportPage.jsx`
* **File Path:** [frontend/src/pages/PlannerReportPage.jsx](file:///d:/crowd%20sense/frontend/src/pages/PlannerReportPage.jsx)
* **What it displays and why:** Pre-event analytical report evaluating 4 pre-configured crowd scenarios:
  1. `baseline`: Standard ingress with Gate 2 closed.
  2. `gate2_opens_at_crisis`: Gate 2 opens when density hits red threshold.
  3. `overcapacity`: 2.5x spawn inflow rate.
  4. `panic_midway`: Panic surge injected midway through simulation.
  Displays timeline density charts, Fruin Level of Service comparison tables, persistent vs conditional bottlenecks, 8 rule recommendations, and AI narration.
* **User Actions Supported:**
  1. *Toggle Scenario Checkboxes:* Updates `selectedScenarios` Set.
  2. *Edit Environmental Parameters:* Inputs for `expectedAttendance`, `ambientTemp`, `eventType`, `securityGates`, `exitWidthMeters`.
  3. *Click "RUN MULTI-SCENARIO ANALYSIS" Button:* Calls `handleRunAnalysis()` to execute client-side simulation runs sequentially.
  4. *Click "GENERATE AI EXECUTIVE NARRATIVE" Button:* Calls `handleNarrate()`.
  5. *Click Recommendation Card Accordion Header:* Toggles individual recommendation card `expanded` state.
* **API Endpoints & WebSocket Channels:**
  - `POST /api/planner/narrate-report`: Sends scenario comparison payload, recommendation rules, and environmental context to generate structured narrative prose.
* **State Management:**
  - *Local State:* `selectedScenarios`, `expectedAttendance`, `ambientTemp`, `eventType`, `securityGates`, `exitWidthMeters`, `isRunning` (boolean), `progress`, `error`, `scenarioResults`, `comparison`, `recommendations`, `hottestCells`, `narration`, `narrationSource`, `narrationModel`, `narrationLoading`, `narrationError`.
* **Conditional Rendering Logic:**
  - While analysis runs, displays progress counter: `"Running Scenario [X/Y]..."`.
  - Recommendation cards display color-coded authority badges (`RULE 1` through `RULE 8`).
  - Hottest cells table highlights cells based on Fruin density bands.

---

### 2.26 `StructuredNarrativeViewer.jsx`
* **File Path:** [frontend/src/components/StructuredNarrativeViewer.jsx](file:///d:/crowd%20sense/frontend/src/components/StructuredNarrativeViewer.jsx)
* **What it displays and why:** Formats raw AI narrative markdown prose into distinct executive cards (Executive Summary, Subzone Bottlenecks, Actionable Mitigations, Safety Advisory).
* **User Actions Supported:**
  - *Click "Copy Text" Button:* Copies narrative text to clipboard via `navigator.clipboard.writeText()` and displays `"✓ Copied"`.
* **API Endpoints & WebSocket Channels:** None.
* **State Management:**
  - *Local State:* `copied` (boolean).
* **Conditional Rendering Logic:**
  - Parses markdown headers (`###` or `**`) into cards with colored left accent borders: Blue for Executive Summary, Amber for Subzones, Green for Mitigations, Purple for Safety Advisory.

---

### 2.27 Passive / Non-Interactive Display Components

1. **`FlowMetricsDisplay.jsx`** ([frontend/src/components/FlowMetricsDisplay.jsx](file:///d:/crowd%20sense/frontend/src/components/FlowMetricsDisplay.jsx))
   - Displays OpenCV Farneback Optical Flow telemetry: Flow Convergence ($0.0 - 1.0$), Flow Turbulence ($0.0 - 1.0$), and Panic Signature.
   - Passive; updates via `zoneData` prop. When `panic_signature === true`, applies `bg-red-950 text-white border-red-500 animate-panic` and displays `'🛑 DETECTED'`.
2. **`ZoneIntensityOverlay.jsx`** ([frontend/src/components/ZoneIntensityOverlay.jsx](file:///d:/crowd%20sense/frontend/src/components/ZoneIntensityOverlay.jsx))
   - Positioned as an absolute overlay directly on top of zone video streams.
   - Applies risk-colored radial gradient vignette and live density meter.
   - Risk configurations:
     - `green`: `SAFE` (Shield icon `✓`, Emerald `#10B981`, $5\%$ radial tint)
     - `yellow`: `CAUTION` (Triangle icon `▲`, Amber `#F59E0B`, $10\%$ radial tint)
     - `orange`: `WARNING` (Diamond icon `◆`, Orange `#F97316`, $15\%$ radial tint)
     - `red`: `CRITICAL` (Octagon icon `🛑`, Red `#EF4444`, $20\%$ radial tint)
3. **`TrendGraphPlaceholder.jsx`** ([frontend/src/components/TrendGraphPlaceholder.jsx](file:///d:/crowd%20sense/frontend/src/components/TrendGraphPlaceholder.jsx))
   - Displays a static visual waveform placeholder with badge `'RESERVED SLOT'`.
   - *Status:* Unused placeholder component; not imported anywhere in active screens.

---

## 3. Data Visualizations

| Visualization | Feeds / Data Sources | Refresh / Update Mechanism | Thresholds, Colors & Baked-in Alert Logic | Exact File Path |
| :--- | :--- | :--- | :--- | :--- |
| **Zone Video & Intensity Stream** | OpenCV CV service MJPEG endpoint or HTML5 webcam fallback; `zoneData.density`, `risk_level`, `risk_score`. | Streaming HTTP multipart (`/stream/:id`) + Socket.io `density_update` (1-2 Hz). | Risk Level Colors: Green (`#10b981`), Yellow (`#f59e0b`), Orange (`#f97316`), Red (`#ef4444`). Red threshold defaults to $3.5\text{ p/m}^2$ (general) and $2.0\text{ p/m}^2$ (corridor). Heat tightens threshold by weather factor ($2.625\text{ p/m}^2$). | [ZonePanel.jsx](file:///d:/crowd%20sense/frontend/src/components/ZonePanel.jsx)<br>[ZoneIntensityOverlay.jsx](file:///d:/crowd%20sense/frontend/src/components/ZoneIntensityOverlay.jsx) |
| **Motion Optical Flow Gauges** | `zoneData.flow_convergence`, `zoneData.flow_turbulence`, `zoneData.panic_signature`. | Socket.io `density_update` event. | Convergence bar (Sky-500, $0-100\%$). Turbulence bar (Amber-500, $0-100\%$). Panic Signature box triggers red flashing `animate-panic` on `true`. | [FlowMetricsDisplay.jsx](file:///d:/crowd%20sense/frontend/src/components/FlowMetricsDisplay.jsx) |
| **Density Trend Extrapolation Chart** | `zoneData.history` array of `{ density, timestamp }`, `trend_slope`, `eta_to_red_min`, `red_threshold`. | Socket.io `density_update` event. | Historical curve rendered in Sky Blue (`#38BDF8`, width 2.5). Projected slope rendered in Orange dashed line (`#F97316`). Red Limit threshold drawn as dashed red line (`#EF4444`). ETA $< 0$ min triggers critical alert text. | [TrendExtrapolationGraph.jsx](file:///d:/crowd%20sense/frontend/src/components/TrendExtrapolationGraph.jsx) |
| **Tactical 2D Venue & Choke Map** | `BottleneckExitMap.jsx` internal geometry, `zoneMap` telemetry, and segment densities (`seg_1` to `seg_3c`). | Syncs with `zoneMap.zone_2.density` via Socket.io + vehicle animation loop (100ms interval). | Corridors: Green ($< 0.5\text{ p/m}^2$), Amber ($0.5 - 1.0\text{ p/m}^2$), Red Breached ($\ge 1.0\text{ p/m}^2$, with `animate-pulse` and neon filter). Vehicle halts automatically if route segment breaches red threshold. | [BottleneckExitMap.jsx](file:///d:/crowd%20sense/frontend/src/components/BottleneckExitMap.jsx) |
| **Three.js 2.5D/3D Venue Visualizer** | Three.js WebGL scene, `layout.walls`, `layout.openings`, `agentsRef.current` (SFM engine). | `requestAnimationFrame` loop (60 fps). | Agent coloring: Normal Cyan (`#38bdf8`), Panic Red (`#ef4444`), Focus Purple (`#c084fc`), Emergency Evacuation Amber (`#f59e0b`). Gates: Open Green (`#22c55e`), Closed Red (`#ef4444`). | [Venue25DViewer.jsx](file:///d:/crowd%20sense/frontend/src/components/Venue25DViewer.jsx) |
| **2D Social Force Canvas & Density Heatmap** | 2D HTML5 canvas context, spatial hash grid, `socialForceSim.js` agents. | `requestAnimationFrame` animation loop in `PlannerPage.jsx`. | Heatmap opacity slider ($0.0 - 1.0$). Fruin Level of Service color ramp: LOS A/B Green, LOS C Yellow, LOS D/E Orange, LOS F Red ($> 3.8\text{ p/m}^2$). | [PlannerPage.jsx](file:///d:/crowd%20sense/frontend/src/pages/PlannerPage.jsx)<br>[densityGrid.js](file:///d:/crowd%20sense/frontend/src/lib/densityGrid.js) |
| **Multi-Scenario Density Timeline Charts** | `scenarioResults[i].timeSeries` generated from `runScenariosSequential()`. | On-demand execution of `handleRunAnalysis()`. | Fruin Threshold reference lines: Red LOS F ($3.8\text{ p/m}^2$), Orange LOS D ($2.15\text{ p/m}^2$), Yellow LOS C ($1.08\text{ p/m}^2$). Scenarios: Baseline Blue (`#38bdf8`), Gate 2 Emerald (`#34d399`), Overcapacity Amber (`#fbbf24`), Panic Purple (`#e879f9`). | [PlannerReportPage.jsx](file:///d:/crowd%20sense/frontend/src/pages/PlannerReportPage.jsx) |
| **Post-Event Incident Marker Timeline** | `GET /api/post-event-timeline?zone_id=:id` returning chronological alert records. | On mount and on tab/zone switch. | Panic alerts render with Red dot (`#DC2626`). Graduated red alerts render with Orange-red dot (`#EA580C`). Connected by a sky-blue vertical timeline trunk (`border-sky-500/40`). | [PostEventAnalysisView.jsx](file:///d:/crowd%20sense/frontend/src/components/PostEventAnalysisView.jsx) |

---

## 4. Navigation & Permissions

### 4.1 Route Structure & URL Delivery
The frontend does not use standard URL route paths (`/live`, `/reports`, etc.). All navigation occurs via:
1. **Port Selection:**
   - `http://localhost:5173`: Loads default Command Ops view (`activeTab = 'LIVE'`).
   - `http://localhost:5174`: Dedicated field mobile simulator script (`npm run dev:field`). Detects `window.location.port === '5174'` and loads `activeTab = 'DUAL_SIM'` by default ([App.jsx:L25-27](file:///d:/crowd%20sense/frontend/src/App.jsx#L25-L27)).
2. **Top Navigation Tab Bar ([App.jsx:L304-324](file:///d:/crowd%20sense/frontend/src/App.jsx#L304-L324)):**
   - `🔴 LIVE OPERATIONS` (`activeTab = 'LIVE'`)
   - `📊 EVENT ANALYSIS` (`activeTab = 'EVENT_ANALYSIS'`, also matches legacy `'REPORT'` or `'POST_EVENT'`)
   - `🗺️ VENUE MAP & EGRESS` (`activeTab = 'VENUE_MAP'`)
   - `📱 DUAL PHONE SIMULATOR` (`activeTab = 'DUAL_SIM'`)
   - `🏗️ CROWD PLANNER` (`activeTab = 'PLANNER'`)
3. **Internal Sub-Views:**
   - Inside `PostEventAnalysisView.jsx`: Sub-tabs `'REPORT'` vs `'TIMELINE'`.
   - Inside `PlannerPage.jsx`: Module view `'sim'` vs `'report'`.
   - Inside `ResponderDashboard.jsx`: Check-in view vs Alert feed vs Tactical Response Modal.

### 4.2 Role-Based Access & Visibility Controls
* **Authentication / Session Security:**
  - **Zero Authentication / No RBAC:** There are no login pages, JWT tokens, session cookies, or user permission tiers.
  - Anyone accessing the frontend on port 5173 has full access to all operations controls (acknowledging alerts, triggering simulated conditions, pausing pipelines).
* **Actor Attribution & Self-Assignment:**
  - In `App.jsx`, command room acknowledgments are hardcoded to actor name `'official_1'` ([App.jsx:L243](file:///d:/crowd%20sense/frontend/src/App.jsx#L243)).
  - In `ResponderCheckin.jsx`, field responders type their own name/team callsign (`responder.name`), which is then sent with status updates and playbook step completions.
* **Conditional Visibility Rules:**
  - *Environmental Control Strip (`WeatherControlPanel`):* Rendered on `LIVE`, `EVENT_ANALYSIS`, `VENUE_MAP`, and `DUAL_SIM`, but explicitly hidden when `activeTab === 'PLANNER'` ([App.jsx:L363](file:///d:/crowd%20sense/frontend/src/App.jsx#L363)).
  - *Dynamic Gates & Focus Controls:* Visible in `PlannerControls.jsx` only if layout has openings defined ([PlannerControls.jsx:L249](file:///d:/crowd%20sense/frontend/src/components/PlannerControls.jsx#L249)).
  - *Status Update Buttons:* In `ResponderAlertCard.jsx`, the 2x2 status grid (EN ROUTE, ON SCENE, etc.) is hidden until the alert is acknowledged ([ResponderAlertCard.jsx:L309](file:///d:/crowd%20sense/frontend/src/components/ResponderAlertCard.jsx#L309)).
  - *Print Styles:* Header, navigation tabs, weather controls, and utility buttons are hidden during print/PDF export via `@media print` rules in [index.css:L128](file:///d:/crowd%20sense/frontend/src/index.css#L128).

---

## 5. Global State & Data Store Architecture

The frontend does not use Redux, Zustand, Recoil, or React Context. All global state resides in the root `<App />` component ([App.jsx](file:///d:/crowd%20sense/frontend/src/App.jsx)) and is passed down via props.

### 5.1 Root State Registry (`App.jsx`)

| State Property | Type | Initial Value | How It's Updated | Who Reads / Consumes It |
| :--- | :--- | :--- | :--- | :--- |
| `theme` | `string` | `'day'` | `toggleTheme()` toggles between `'day'` and `'night'`. | Sets `data-theme` attribute on `document.documentElement`; controls CSS color tokens in [index.css](file:///d:/crowd%20sense/frontend/src/index.css). |
| `activeTab` | `string` | `'LIVE'` (or `'DUAL_SIM'` on port 5174) | User clicks header tab buttons. | [App.jsx](file:///d:/crowd%20sense/frontend/src/App.jsx) conditional rendering for active tab content. |
| `connected` | `boolean` | `false` | Socket event `connect` (`true`) and `disconnect` (`false`). | Header WS indicator pill, `ConnectionStatusBanner`, `DualPhoneSimulator`, `ResponderDashboard`. |
| `reconnectCount` | `number` | `0` | `socket.io.on('reconnect_attempt', count)`. | `ConnectionStatusBanner`, `DualPhoneSimulator`, `ResponderDashboard`. |
| `zoneMap` | `object` | `{ zone_1: null, zone_2: null }` | Socket event `density_update`. Merges payload under `[payload.zone_id]`. | `ZonePanel` (Zone 1 & 2), `FlowMetricsDisplay`, `TrendExtrapolationGraph`, `BottleneckExitMap`. |
| `selectedTrendZone`| `string` | `'zone_1'` | User clicks `ZONE 1` or `ZONE 2` buttons in Live Ops tab. | Selects `currentTrendData` passed to `TrendExtrapolationGraph`. |
| `activeAlerts` | `array` | `[]` | Socket events: `alert_triggered` (prepends), `alert_escalated` (replaces), `alert_acknowledged` (merges), `alert_status_updated` (merges). | `AlertPanel`, `DualPhoneSimulator`, `ResponderDashboard`. |
| `auditLogs` | `array` | `[]` | `fetchAuditLogs()` from `GET /api/audit-log`. | `AuditLogView`, `PostEventAnalysisView`. |
| `playbookSteps` | `array` | `[]` | `fetchAuditLogs()` from `GET /api/audit-log`; socket event `playbook_step_completed`. | `AuditLogView`. |
| `assistantInstructions` | `array` | `[]` | Socket event `assistant_instruction`; `fetchAuditLogs()` on initial load. User dismissal filters array. | `AssistantPushBanner`, `AuditLogView`. |
| `weatherState` | `object` | `null` | `fetchWeatherState()` from `GET /api/conditions/current`; socket event `conditions_updated`. | `WeatherControlPanel`. |
| `pipelineActive` | `boolean` | `true` | `fetchPipelineStatus()` from `GET /api/pipeline/status`; `handleTogglePipeline()`; socket event `pipeline_status_updated`. | `WeatherControlPanel`, `ZonePanel`. |
| `panicConfirming` | `object` | `{}` | Socket event `panic_confirming` (`{ zone_id, confirmedFrames, requiredFrames, trigger }`); cleared on `alert_triggered`. | `ZonePanel`, `ZoneIntensityOverlay`. |
| `mockToasts` | `array` | `[]` | Socket event `mock_dispatch_toast`. | *Dead state:* Not currently rendered in active JSX. |
| `showLimitations` | `boolean` | `false` | User clicks `ℹ️ LIMITATIONS` button in header; `KnownLimitationsModal` close callback. | Controls `KnownLimitationsModal` visibility. |
| `socketInstance` | `object` | `null` | Initialized once in `useEffect` via `io(BACKEND_URL, { transports: ['websocket', 'polling'] })`. | Passed to `AlertPanel`, `DualPhoneSimulator`, `ResponderDashboard`. |

---

## 6. Audit Summary & Gotchas for Redesigners

1. **Dead Code / Unrendered Components:**
   - [TrendGraphPlaceholder.jsx](file:///d:/crowd%20sense/frontend/src/components/TrendGraphPlaceholder.jsx): Fully coded component that is never imported or mounted.
   - [MockDispatchControl.jsx](file:///d:/crowd%20sense/frontend/src/components/MockDispatchControl.jsx): Imported in [App.jsx:L11](file:///d:/crowd%20sense/frontend/src/App.jsx#L11), and `mockToasts` state is maintained, but `<MockDispatchControl />` is omitted from the JSX tree.
   - `PlaybookPanel.jsx` in `AlertPanel.jsx`: Imported at [AlertPanel.jsx:L2](file:///d:/crowd%20sense/frontend/src/components/AlertPanel.jsx#L2), but never rendered inside `AlertPanel`.
2. **Port 5174 Dependency:**
   - Running Vite on port 5174 switches default screen behavior to the Dual Phone Simulator. Changing port configuration without checking [App.jsx:L25](file:///d:/crowd%20sense/frontend/src/App.jsx#L25) will break field simulator launch scripts (`npm run dev:field`).
3. **Web Audio API Dependency:**
   - Audio alert tones in `ResponderDashboard.jsx` ([ResponderDashboard.jsx:L21-52](file:///d:/crowd%20sense/frontend/src/components/ResponderDashboard.jsx#L21-L52)) use native browser `AudioContext` oscillators rather than audio files. Any redesign must preserve the offline synthetic beeper.
4. **Client-Side Simulation Physics:**
   - The Crowd Planner module runs Helbing's Social Force Model entirely client-side inside Web Workers / requestAnimationFrame loops in [socialForceSim.js](file:///d:/crowd%20sense/frontend/src/lib/socialForceSim.js). There is zero backend API traffic during live simulation execution.
5. **Print Styles:**
   - [index.css:L120-164](file:///d:/crowd%20sense/frontend/src/index.css#L120-L164) contains strict `@media print` rules specifically tailored for district post-incident PDF exports. Removing or altering CSS selectors will break the `window.print()` PDF generation in `PostEventReportDocument.jsx`.
