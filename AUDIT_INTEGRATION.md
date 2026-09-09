# CrowdSense System Integration Map (AUDIT_INTEGRATION.md)

**Audit Date:** 2026-09-09  
**Source Materials:** `AUDIT_FRONTEND.md` (`frontend/`) and `AUDIT_BACKEND.md` (`backend/`)  
**Scope:** Direct integration mapping between frontend UI components, network transports (REST & WebSocket), backend route handlers/services, database persistence, and user-facing state transitions.  
**Auditor Methodology:** Static Codebase Cross-Referencing & Symbol Tracing. No speculative features or unverified endpoints introduced. Discrepancies, unused endpoints, and gaps are flagged explicitly.

---

## 1. Explicit Gaps, Mismatches & Unlinked Interfaces

The following architectural gaps, dangling endpoints, and mismatches identified across `AUDIT_FRONTEND.md` and `AUDIT_BACKEND.md` are flagged explicitly:

1. **`MockDispatchControl.jsx` Mounted State Mismatch:**
   - *Frontend:* `frontend/src/components/MockDispatchControl.jsx` is fully coded and imported in `frontend/src/App.jsx:L11`. Local `mockToasts` state is populated via `socket.on('mock_dispatch_toast')`, but `<MockDispatchControl />` is **never rendered** in `App.jsx`'s JSX tree.
   - *Backend:* `backend/src/index.js:52` fully exposes `POST /api/dispatch/simulate` and emits `mock_dispatch_toast`.
   - *Flagged Gap:* The user cannot trigger simulated police/siren dispatches from the active UI without manually mounting `<MockDispatchControl />`.

2. **Citizen SOS Category Severity Divergence:**
   - *Frontend:* `frontend/src/components/CitizenReportView.jsx` provides 4 category selection buttons: `MEDICAL_ASSISTANCE`, `SUSPICIOUS_ACTIVITY`, `REPORT_THEFT`, `BLOCKED_EXITS`.
   - *Backend:* `backend/src/routes/citizenReports.js:35-50` accepts `VALID_CATEGORIES` including `STAMPEDE_RISK` and `GENERAL_PANIC`. The backend only assigns critical `'red'` severity if `category === 'STAMPEDE_RISK' || category === 'GENERAL_PANIC'`; all other categories receive `'orange'`.
   - *Flagged Gap:* Because neither `STAMPEDE_RISK` nor `GENERAL_PANIC` exists in the frontend form, all reports submitted via `CitizenReportView` will receive `'orange'` severity upon intake.

3. **Report Archive & History Endpoints Uncalled by Frontend:**
   - *Backend:* Exposes `GET /api/reports/history` (`backend/src/routes/reports.js:76`), `GET /api/reports/:id` (`backend/src/routes/reports.js:108`), and `GET /api/reports/raw-data` (`backend/src/routes/reports.js:91`).
   - *Frontend:* `frontend/src/components/PostEventAnalysisView.jsx` only calls `POST /api/reports/generate` and `GET /api/reports/latest`. There is no historical report picker UI to load older reports by ID or browse report history.

4. **Venue Deletion Endpoint Uncalled by Frontend:**
   - *Backend:* Exposes `DELETE /api/venues/:id` (`backend/src/routes/venues.js:90`) to permanently delete venue layouts.
   - *Frontend:* `frontend/src/pages/PlannerPage.jsx` allows listing (`GET /api/venues`), fetching (`GET /api/venues/:id`), and saving (`POST /api/venues`), but does not provide a UI button or handler to invoke venue deletion.

5. **`PlaybookPanel.jsx` Dead Import in `AlertPanel.jsx`:**
   - *Frontend:* `frontend/src/components/AlertPanel.jsx:L2` imports `PlaybookPanel.jsx`, but never renders it in its JSX. (The playbook panel is rendered exclusively inside field mobile views: `ResponderAlertCard.jsx` and `ActiveIncidentResponseModal.jsx`).

6. **All Responders Query Uncalled:**
   - *Backend:* Exposes `GET /api/responders` (`backend/src/routes/responders.js:142`) returning all checked-in personnel.
   - *Frontend:* `frontend/src/components/ResponderDashboard.jsx` calls `GET /api/responders/nearest?zone_id=:zone`, but never queries the global responder directory list.

7. **Direct Assistant Instructions Query Uncalled:**
   - *Backend:* Exposes `GET /api/assistant/instructions` (`backend/src/routes/assistant.js:238`).
   - *Frontend:* `frontend/src/App.jsx` retrieves historical instructions via the aggregated endpoint `GET /api/audit-log` and live updates via Socket.io `assistant_instruction`, leaving `GET /api/assistant/instructions` uncalled.

8. **Pipeline Explicit Set Route Uncalled:**
   - *Backend:* Exposes `POST /api/pipeline/set` (`backend/src/routes/pipeline.js:37`) taking `{ active: boolean }`.
   - *Frontend:* `frontend/src/components/WeatherControlPanel.jsx` and `frontend/src/App.jsx` exclusively invoke `POST /api/pipeline/toggle`.

9. **Unused Component `TrendGraphPlaceholder.jsx`:**
   - *Frontend:* `frontend/src/components/TrendGraphPlaceholder.jsx` is defined in the repository but is not imported or mounted by any active screen.

---

## 2. End-to-End User-Facing Feature Flow Traces

### Feature: Global Operations Navigation & Screen Routing
User clicks top header navigation tab button (`LIVE`, `EVENT_ANALYSIS`, `VENUE_MAP`, `DUAL_SIM`, `PLANNER`) → [App.jsx](file:///d:/crowd%20sense/frontend/src/App.jsx) → None (client-side state switch) → None → None → None → `activeTab` updated in [App.jsx](file:///d:/crowd%20sense/frontend/src/App.jsx) → Screen switches view container; padding adjusts and `WeatherControlPanel` hides if switching to `PLANNER`.

---

### Feature: System Health & WebSocket Connection Management
User opens web dashboard or loses connection → [App.jsx](file:///d:/crowd%20sense/frontend/src/App.jsx) / [ConnectionStatusBanner.jsx](file:///d:/crowd%20sense/frontend/src/components/ConnectionStatusBanner.jsx) → Socket.io transport connection to `http://localhost:4000` → [index.js](file:///d:/crowd%20sense/backend/src/index.js) / [sockets/index.js](file:///d:/crowd%20sense/backend/src/sockets/index.js) → Node.js HTTP/WebSocket server → Socket connection established (`connect` / `disconnect`) → `connected` boolean and `reconnectCount` updated in [App.jsx](file:///d:/crowd%20sense/frontend/src/App.jsx) → Header connection pill turns green `● CONNECTED`, or amber `ConnectionStatusBanner` appears displaying reconnection attempts.

---

### Feature: Manual WebSocket Reconnection
User clicks "🔄 RECONNECT NOW" button on dropped connection banner → [ConnectionStatusBanner.jsx](file:///d:/crowd%20sense/frontend/src/components/ConnectionStatusBanner.jsx) → `socketInstance.connect()` via `onRetry` prop → [sockets/index.js](file:///d:/crowd%20sense/backend/src/sockets/index.js) → Node.js WebSocket server → Socket reconnects → `connected: true` in [App.jsx](file:///d:/crowd%20sense/frontend/src/App.jsx) → Warning banner dismisses and dashboard telemetry resumes live updates.

---

### Feature: Theme Switching (Day / Night Mode)
User clicks "☀️ DAY" / "🌙 NIGHT" button in header → [App.jsx](file:///d:/crowd%20sense/frontend/src/App.jsx) → None (client-side DOM mutation) → None → None → None → `theme` state toggles ('day' ↔ 'night'); sets `document.documentElement.setAttribute('data-theme', theme)` → Global CSS variables flip between dark tactical glassmorphism and clean high-contrast light operations theme.

---

### Feature: Proactive Architectural Limitations & Disclosures Modal
User clicks "ℹ️ LIMITATIONS" in header (or "✕ CLOSE" / "ACKNOWLEDGE" to exit) → [App.jsx](file:///d:/crowd%20sense/frontend/src/App.jsx) / [KnownLimitationsModal.jsx](file:///d:/crowd%20sense/frontend/src/components/KnownLimitationsModal.jsx) → None (pure client-side state) → None → None → None → `showLimitations` boolean set in [App.jsx](file:///d:/crowd%20sense/frontend/src/App.jsx) → Modal drawer opens displaying 12 operational disclosures (optical flow limitations, simulated dispatch, NDMA boundaries), or closes back to dashboard.

---

### Feature: Live Zone Video Stream Proxy
User views Zone 1 or Zone 2 video card → [ZonePanel.jsx](file:///d:/crowd%20sense/frontend/src/components/ZonePanel.jsx) → HTTP `GET /stream/:zone_id` (`<img src="...">`) → Proxy handler in [backend/src/index.js](file:///d:/crowd%20sense/backend/src/index.js) → Reverse proxy pipes stream from CV Service (`http://127.0.0.1:5001/stream/:zone_id`) → Binary multipart MJPEG stream chunks (`multipart/x-mixed-replace`) → Image DOM element paints chunks continuously → User sees live video footage of crowd movement in the monitored zone.

---

### Feature: Video Stream Fallback (Webcam / Canvas Simulation)
MJPEG video stream fails or disconnects (`img onError` fires) → [ZonePanel.jsx](file:///d:/crowd%20sense/frontend/src/components/ZonePanel.jsx) → Native browser `navigator.mediaDevices.getUserMedia()` fallback → Local client hardware or HTML5 canvas fallback → None → Browser media stream or procedural particle generator → `useMjpegStream: false`, `cameraActive: true` in [ZonePanel.jsx](file:///d:/crowd%20sense/frontend/src/components/ZonePanel.jsx) → User sees local device camera feed or animated synthetic particle crowd simulation instead of a broken image icon.

---

### Feature: Live Zone Risk Intensity Vignette & Density Meter
User observes zone feed while density changes → [ZonePanel.jsx](file:///d:/crowd%20sense/frontend/src/components/ZonePanel.jsx) / [ZoneIntensityOverlay.jsx](file:///d:/crowd%20sense/frontend/src/components/ZoneIntensityOverlay.jsx) → Socket.io event listener `density_update` → Emitted by `POST /api/density` handler in [backend/src/routes/density.js](file:///d:/crowd%20sense/backend/src/routes/density.js) → In-memory risk engine evaluates density, slope, convergence, turbulence → Processed telemetry payload with `risk_level` (`green`, `yellow`, `orange`, `red`) and `risk_score` → `zoneMap[zone_id]` updated in [App.jsx](file:///d:/crowd%20sense/frontend/src/App.jsx) → Live numeric meter updates ($p/m^2$); radial gradient overlay color-shifts dynamically (Green `SAFE` → Yellow `CAUTION` → Orange `WARNING` → Red `CRITICAL`).

---

### Feature: Farneback Optical Flow & Motion Telemetry Gauges
User monitors optical motion turbulence and convergence → [FlowMetricsDisplay.jsx](file:///d:/crowd%20sense/frontend/src/components/FlowMetricsDisplay.jsx) → Socket.io event listener `density_update` → Emitted by [backend/src/routes/density.js](file:///d:/crowd%20sense/backend/src/routes/density.js) → `computeRiskScore` in [backend/src/services/riskEngine.js](file:///d:/crowd%20sense/backend/src/services/riskEngine.js) → Payload fields `flow_convergence`, `flow_turbulence`, `panic_signature` → `zoneMap` prop update in [FlowMetricsDisplay.jsx](file:///d:/crowd%20sense/frontend/src/components/FlowMetricsDisplay.jsx) → Sky-blue convergence bar and amber turbulence bar expand/contract; if `panic_signature` is true, badge flashes red `animate-panic` reading `🛑 DETECTED`.

---

### Feature: Real-Time Density Trend Extrapolation & Critical Slope Projection
User views density trajectory chart for selected zone → [TrendExtrapolationGraph.jsx](file:///d:/crowd%20sense/frontend/src/components/TrendExtrapolationGraph.jsx) → Socket.io event listener `density_update` → Emitted by [backend/src/routes/density.js](file:///d:/crowd%20sense/backend/src/routes/density.js) → `updateAndGetTrendSlope` in [backend/src/services/riskEngine.js](file:///d:/crowd%20sense/backend/src/services/riskEngine.js) → Payload fields `history`, `trend_slope`, `eta_to_red_min`, `red_threshold` → `zoneMap` updated in [App.jsx](file:///d:/crowd%20sense/frontend/src/App.jsx) → SVG historical density curve redraws in blue; dashed orange line extrapolates future rate of rise toward red threshold line; ETA displays `"~X min"` or `"🛑 CRITICAL THRESHOLD BREACHED"`.

---

### Feature: Trend Extrapolation Zone Switcher
User clicks `ZONE 1 (GENERAL)` or `ZONE 2 (CORRIDOR)` button → [App.jsx](file:///d:/crowd%20sense/frontend/src/App.jsx) → None (client-side state switch) → None → None → None → `selectedTrendZone` state updated in [App.jsx](file:///d:/crowd%20sense/frontend/src/App.jsx) → [TrendExtrapolationGraph.jsx](file:///d:/crowd%20sense/frontend/src/components/TrendExtrapolationGraph.jsx) switches target data feed and redraws trajectory for the chosen zone.

---

### Feature: Composite Risk Score Formula Breakdown Inspector
User clicks "HOW IS THIS COMPUTED?" on trend card (or "✕ CLOSE" to exit) → [TrendExtrapolationGraph.jsx](file:///d:/crowd%20sense/frontend/src/components/TrendExtrapolationGraph.jsx) → None (pure client-side state) → None → None → None → `showFormulaModal` toggles boolean in [TrendExtrapolationGraph.jsx](file:///d:/crowd%20sense/frontend/src/components/TrendExtrapolationGraph.jsx) → Modal opens displaying exact weight breakdown (Density 50%, Slope 30%, Convergence 10%, Turbulence 10%) and active environmental multiplier values.

---

### Feature: Proactive Control Room Push-Guidance Banners
Automated threshold crossing, panic detection, or citizen report triggers guidance → [AssistantPushBanner.jsx](file:///d:/crowd%20sense/frontend/src/components/AssistantPushBanner.jsx) → Socket.io event listener `assistant_instruction` → Emitted by `handleAlertEvent` / `handleDensityReading` in [backend/src/services/controlRoomAssistant.js](file:///d:/crowd%20sense/backend/src/services/controlRoomAssistant.js) → Groq API or local deterministic rule engine; row inserted into SQLite `assistant_instructions` table → Instruction payload with `instructionId`, `text`, `severity`, `ruleId` → `assistantInstructions` prepended in [App.jsx](file:///d:/crowd%20sense/frontend/src/App.jsx) (capped to 5 items) → High-priority color-coded directive banner appears at the top of the command screen with action guidance and blinking severity icon.

---

### Feature: Dismissal of Proactive Push Guidance
User clicks "✕ DISMISS" on push guidance banner → [AssistantPushBanner.jsx](file:///d:/crowd%20sense/frontend/src/components/AssistantPushBanner.jsx) → `onDismiss` prop callback in [App.jsx](file:///d:/crowd%20sense/frontend/src/App.jsx) → None → None → None → Target instruction filtered out of `assistantInstructions` array in [App.jsx](file:///d:/crowd%20sense/frontend/src/App.jsx) → Instruction banner smoothly unmounts from dashboard view.

---

### Feature: Grounded Control Room Assistant Q&A Drawer
User clicks chat drawer, types query (or clicks suggested chip), and clicks "SEND ➤" → [AssistantChatPanel.jsx](file:///d:/crowd%20sense/frontend/src/components/AssistantChatPanel.jsx) → HTTP `POST /api/assistant/ask` with `{ question, zoneId }` → Route handler in [backend/src/routes/assistant.js](file:///d:/crowd%20sense/backend/src/routes/assistant.js) → Reads `liveZoneCache`, weather state, and active alerts via `controlRoomAssistant.js`; executes Groq LLM completion (or deterministic fallback) → JSON `{ answer, source, model }` → Response message appended to `messages` array, `loading` set to false in [AssistantChatPanel.jsx](file:///d:/crowd%20sense/frontend/src/components/AssistantChatPanel.jsx) → Assistant response bubble renders with markdown formatting and model attribution badge.

---

### Feature: Environmental Weather Condition Modulation
User clicks weather preset button (`CLEAR`, `EXTREME HEAT`, `HEAVY RAIN`) → [WeatherControlPanel.jsx](file:///d:/crowd%20sense/frontend/src/components/WeatherControlPanel.jsx) → HTTP `POST /api/conditions/set` with `{ condition: presetId }` → Route handler in [backend/src/routes/conditions.js](file:///d:/crowd%20sense/backend/src/routes/conditions.js) → In-memory `weatherService.js` updates state; broadcasts Socket.io event `conditions_updated` → HTTP 200 `{ success: true, state }` → `weatherState` updated in [App.jsx](file:///d:/crowd%20sense/frontend/src/App.jsx) → Active preset highlights `"● LIVE"`; temperature, precipitation, density sensitivity factor (0.75 in heat), and flow sensitivity factor (1.5 in rain) update across all panels and tighten red alert thresholds immediately.

---

### Feature: Master CV Pipeline Execution Power Toggle
User clicks master pipeline button ("🟢 CV PIPELINE: LIVE" / "⏸️ CV PIPELINE: PAUSED") → [WeatherControlPanel.jsx](file:///d:/crowd%20sense/frontend/src/components/WeatherControlPanel.jsx) → HTTP `POST /api/pipeline/toggle` → Route handler in [backend/src/routes/pipeline.js](file:///d:/crowd%20sense/backend/src/routes/pipeline.js) → In-memory `pipelineService.js` inverts `pipelineState.active`; broadcasts Socket.io event `pipeline_status_updated` → HTTP 200 `{ active, paused_at, last_updated }` → `pipelineActive` boolean updated in [App.jsx](file:///d:/crowd%20sense/frontend/src/App.jsx) → Button flips to amber `"⏸️ CV PIPELINE: PAUSED"`; zone panels mount `"⏸️ STATIC SNAPSHOT (PAUSED)"` badges.

---

### Feature: Live Command Operations Alert Feed
Automated threshold crossing, panic detection, or citizen report occurs → [AlertPanel.jsx](file:///d:/crowd%20sense/frontend/src/components/AlertPanel.jsx) → Socket.io event listener `alert_triggered` → Broadcasted by `processZoneAlerts` / `registerCustomAlert` in [backend/src/services/escalationManager.js](file:///d:/crowd%20sense/backend/src/services/escalationManager.js) → In-memory `activeZoneAlerts` map updated; row inserted into SQLite `audit_log` table → Alert record payload (`alert_id`, `zone_id`, `severity`, `alert_type`, `triggered_at`, `assigned_to`) → `activeAlerts` prepended in [App.jsx](file:///d:/crowd%20sense/frontend/src/App.jsx) → Alert card renders with red/orange badge; empty state switches to active warning; audio alert triggers on responder devices.

---

### Feature: Command Operations Alert Acknowledgment
User clicks "ACKNOWLEDGE ALERT" button on incident card → [AlertPanel.jsx](file:///d:/crowd%20sense/frontend/src/components/AlertPanel.jsx) → Emits Socket.io `acknowledge_alert` (`{ alert_id, acknowledged_by: 'official_1' }`) & HTTP `POST /api/alerts/:id/acknowledge` → Handlers in [backend/src/sockets/index.js](file:///d:/crowd%20sense/backend/src/sockets/index.js) & [backend/src/routes/alerts.js](file:///d:/crowd%20sense/backend/src/routes/alerts.js) → Cancels auto-escalation timer in `escalationManager.js`; updates `acknowledged_at` & `acknowledged_by` in SQLite `audit_log` table; emits Socket.io `alert_acknowledged` → HTTP 200 `{ success: true, alert }` → `activeAlerts` merged in [App.jsx](file:///d:/crowd%20sense/frontend/src/App.jsx) and audit logs re-fetched → Acknowledge button disappears; alert reflects acknowledged status; auto-escalation timer is halted.

---

### Feature: Immutable Incident Audit Log Table & Filtering
User clicks audit log filter pills (`ALL`, `PANIC`, `ESCALATED`, `ACKNOWLEDGED`, `ASSISTANT GUIDANCE`, `PLAYBOOK STEPS`) → [AuditLogView.jsx](file:///d:/crowd%20sense/frontend/src/components/AuditLogView.jsx) → None (client-side filter over existing prop data) → None → None → None → `filter` state updated in [AuditLogView.jsx](file:///d:/crowd%20sense/frontend/src/components/AuditLogView.jsx) → Table rows filter dynamically to isolate specific categories (e.g. only auto-escalated incidents or only completed checklist steps).

---

### Feature: Audit Log Manual Refresh
User clicks "↻ REFRESH" button on audit log panel → [AuditLogView.jsx](file:///d:/crowd%20sense/frontend/src/components/AuditLogView.jsx) → HTTP `GET /api/audit-log?limit=50` via `onRefresh` prop → Route handler in [backend/src/routes/alerts.js](file:///d:/crowd%20sense/backend/src/routes/alerts.js) → Queries SQLite `audit_log`, `playbook_step_log`, and `assistant_instructions` tables in parallel → JSON `{ logs, playbook_steps, assistant_instructions }` → `auditLogs`, `playbookSteps`, `assistantInstructions` updated in [App.jsx](file:///d:/crowd%20sense/frontend/src/App.jsx) → All three audit log tables reload with the latest persisted database records.

---

### Feature: Automated Graduated Escalation Timer (System / Background)
Red alert remains unacknowledged for `ESCALATION_TIMEOUT_SEC` (30s) → [AlertPanel.jsx](file:///d:/crowd%20sense/frontend/src/components/AlertPanel.jsx) / [AuditLogView.jsx](file:///d:/crowd%20sense/frontend/src/components/AuditLogView.jsx) → Socket.io event listener `alert_escalated` → Timer callback in [backend/src/services/escalationManager.js](file:///d:/crowd%20sense/backend/src/services/escalationManager.js) → Updates `escalated_at` & `escalated_to: 'official_2'` in SQLite `audit_log`; triggers assistant instruction; broadcasts `alert_escalated` → Alert payload with `escalated_to: 'official_2'` → `activeAlerts` item updated in [App.jsx](file:///d:/crowd%20sense/frontend/src/App.jsx) → Alert card displays flashing tag `"AUTO-ESCALATED → official_2"`; new push banner advises supervisor intervention.

---

### Feature: Behavioral Panic Fast-Path Bypass & TTL Expiry
CV service detects stampede or high turbulence + density for 2 consecutive frames → [ZonePanel.jsx](file:///d:/crowd%20sense/frontend/src/components/ZonePanel.jsx) / [AlertPanel.jsx](file:///d:/crowd%20sense/frontend/src/components/AlertPanel.jsx) → Socket.io events `panic_confirming`, then `alert_triggered` & `alert_panic` → `processZoneAlerts` in [backend/src/services/escalationManager.js](file:///d:/crowd%20sense/backend/src/services/escalationManager.js) → Injects immediate panic alert into `activeZoneAlerts`; inserts into SQLite `audit_log`; emits `mock_dispatch_toast` → Telemetry with `risk_level: 'red'` and alert with `alert_type: 'immediate_panic_alert'` → `activeAlerts` and `panicConfirming` updated in [App.jsx](file:///d:/crowd%20sense/frontend/src/App.jsx) → Card pulses with `animate-panic ring-2 ring-red-500` reading `🛑 IMMEDIATE PANIC ALERT`; if panic frames cease for 20s (`PANIC_ALERT_TTL_MS`), alert automatically expires so UI recovers cleanly.

---

### Feature: Citizen Emergency SOS Report Submission
Citizen clicks emergency category, selects zone, types details, and clicks "🚨 SEND EMERGENCY REPORT" → [CitizenReportView.jsx](file:///d:/crowd%20sense/frontend/src/components/CitizenReportView.jsx) → HTTP `POST /api/citizen-reports` with `{ category, zone_id, description, reporter_name }` → Route handler in [backend/src/routes/citizenReports.js](file:///d:/crowd%20sense/backend/src/routes/citizenReports.js) → Inserts alert into SQLite `audit_log`; injects into `activeZoneAlerts`; broadcasts `alert_triggered`, `mock_dispatch_toast`; triggers assistant evaluation → HTTP 200 `{ success: true, alert }` → `submittedAlert` set in [CitizenReportView.jsx](file:///d:/crowd%20sense/frontend/src/components/CitizenReportView.jsx); `activeAlerts` prepended in [App.jsx](file:///d:/crowd%20sense/frontend/src/App.jsx) → Citizen form transforms into live tracking card; command operations alert feed immediately displays `"📱 CITIZEN EMERGENCY REPORT"`; responder units receive alert notification.

---

### Feature: Citizen Live Emergency Tracker & Status Updates
Field responder acknowledges or updates status of citizen's SOS → [CitizenReportView.jsx](file:///d:/crowd%20sense/frontend/src/components/CitizenReportView.jsx) → Socket.io event listeners `alert_acknowledged` and `alert_status_updated` → Broadcasted from backend responder handlers in [backend/src/routes/alerts.js](file:///d:/crowd%20sense/backend/src/routes/alerts.js) → Updates `audit_log` in SQLite → Alert update payload matching `submittedAlert.alert_id` → `submittedAlert` merged in [CitizenReportView.jsx](file:///d:/crowd%20sense/frontend/src/components/CitizenReportView.jsx) → Three-step timeline advances live (Report Received ✓ → Acknowledged by Responder ✓ → Status: EN ROUTE / ON SCENE / RESOLVED).

---

### Feature: Tactical Field Responder Check-In
Responder types callsign/name, selects Zone 1 or Zone 2, and clicks "CHECK IN" → [ResponderCheckin.jsx](file:///d:/crowd%20sense/frontend/src/components/ResponderCheckin.jsx) → HTTP `POST /api/responders/checkin` with `{ responder_id, name, zone_id }` → Route handler in [backend/src/routes/responders.js](file:///d:/crowd%20sense/backend/src/routes/responders.js) → Upserts responder into in-memory `responderCheckIns` Map; broadcasts Socket.io event `responder_checkin` → HTTP 200 `{ success: true, responder }` → `responder` object stored in `localStorage` & state in [ResponderDashboard.jsx](file:///d:/crowd%20sense/frontend/src/components/ResponderDashboard.jsx) → Check-in screen unmounts; tactical responder terminal renders showing assigned zone badge and live incident queue.

---

### Feature: Field Responder Change Zone Flow
Responder clicks "Change zone" link in header of tactical dashboard → [ResponderDashboard.jsx](file:///d:/crowd%20sense/frontend/src/components/ResponderDashboard.jsx) → None (client-side state switch) → None → None → None → `showChangeZone: true` in [ResponderDashboard.jsx](file:///d:/crowd%20sense/frontend/src/components/ResponderDashboard.jsx) → Active alert feed temporarily replaced with `<ResponderCheckin />` prefilled with existing callsign to allow re-registration to a new zone.

---

### Feature: Field Responder Tactical Alert Feed & Severity Filter
Responder clicks severity filter pills (`ALL`, `HIGH`, `MEDIUM`) → [ResponderDashboard.jsx](file:///d:/crowd%20sense/frontend/src/components/ResponderDashboard.jsx) → None (client-side filter) → None → None → None → `severityFilter` state updated in [ResponderDashboard.jsx](file:///d:/crowd%20sense/frontend/src/components/ResponderDashboard.jsx) → Cards re-sort strictly descending by `triggered_at`; displays only high-priority red/panic alerts or medium orange incidents.

---

### Feature: Tactical Responder Audio Alert Synthesizer
New alert arrives on field device → [ResponderDashboard.jsx](file:///d:/crowd%20sense/frontend/src/components/ResponderDashboard.jsx) → Socket.io event listener `alert_triggered` → Broadcasted from backend escalation engine → None → Web Audio API `AudioContext` synthesized tone → Frequency generator plays audio tone → Device emits 440Hz 0.3s beep for standard alerts or an urgent 880Hz 3-pulse burst for panic alerts (unless muted).

---

### Feature: Tactical Audio Alert Mute Toggle
Responder clicks audio mute button (`🔊` / `🔇`) → [ResponderDashboard.jsx](file:///d:/crowd%20sense/frontend/src/components/ResponderDashboard.jsx) → None (pure client-side state) → None → None → None → `muted` boolean toggles in [ResponderDashboard.jsx](file:///d:/crowd%20sense/frontend/src/components/ResponderDashboard.jsx) → Button icon switches to `🔇 Muted`; subsequent incoming alert audio tones are suppressed.

---

### Feature: Nearest Responder Team Routing Resolution
Tactical card loads for an alert in a specific zone → [ResponderDashboard.jsx](file:///d:/crowd%20sense/frontend/src/components/ResponderDashboard.jsx) / [ResponderAlertCard.jsx](file:///d:/crowd%20sense/frontend/src/components/ResponderAlertCard.jsx) → HTTP `GET /api/responders/nearest?zone_id=:zone` → Route handler in [backend/src/routes/responders.js](file:///d:/crowd%20sense/backend/src/routes/responders.js) → Compares alert zone against `responderCheckIns` using topological `ZONE_ADJACENCY`; extracts pre-authored path from `RESPONSE_ROUTES` → HTTP 200 `{ responder, distance, route }` → `nearestTeams` state updated in [ResponderDashboard.jsx](file:///d:/crowd%20sense/frontend/src/components/ResponderDashboard.jsx) → Alert card displays closest patrol team name, distance step count, and navigation route instructions.

---

### Feature: Field Responder Alert Acknowledgment
Responder clicks "ACKNOWLEDGE & OPEN RESPONSE VIEW" on alert card → [ResponderAlertCard.jsx](file:///d:/crowd%20sense/frontend/src/components/ResponderAlertCard.jsx) → Emits Socket.io `acknowledge_alert` (`{ alert_id, acknowledged_by: responder.name }`) → Handlers in [backend/src/sockets/index.js](file:///d:/crowd%20sense/backend/src/sockets/index.js) & [backend/src/routes/alerts.js](file:///d:/crowd%20sense/backend/src/routes/alerts.js) → Cancels escalation timer; updates `audit_log` in SQLite; emits `alert_acknowledged` → Socket broadcast received by all clients → `activeTacticalAlert` set in [ResponderDashboard.jsx](file:///d:/crowd%20sense/frontend/src/components/ResponderDashboard.jsx); card transitions to acknowledged → Large acknowledge button disappears; 2x2 operational status grid appears; incident response playbook expands.

---

### Feature: Tactical Incident Full-Screen Response Modal
Responder clicks "OPEN ACTIVE INCIDENT SCREEN" on an acknowledged card (or "← BACK" to return) → [ResponderDashboard.jsx](file:///d:/crowd%20sense/frontend/src/components/ResponderDashboard.jsx) / [ActiveIncidentResponseModal.jsx](file:///d:/crowd%20sense/frontend/src/components/ActiveIncidentResponseModal.jsx) → None (client-side modal toggle) → None → None → None → `activeTacticalAlert` set/cleared in [ResponderDashboard.jsx](file:///d:/crowd%20sense/frontend/src/components/ResponderDashboard.jsx) → Full-screen tactical overlay mounts over mobile chassis displaying dominant status buttons, navigation route, and NDMA checklist.

---

### Feature: Field Operational Status Updates
Responder clicks operational status button (`EN ROUTE`, `ON SCENE`, `RESOLVED`, `NEED BACKUP`) → [ActiveIncidentResponseModal.jsx](file:///d:/crowd%20sense/frontend/src/components/ActiveIncidentResponseModal.jsx) / [ResponderAlertCard.jsx](file:///d:/crowd%20sense/frontend/src/components/ResponderAlertCard.jsx) → Emits Socket.io `update_alert_status` (fallback HTTP `POST /api/alerts/:id/status`) with `{ alert_id, status, responder_id }` → Handlers in [backend/src/sockets/index.js](file:///d:/crowd%20sense/backend/src/sockets/index.js) & [backend/src/routes/alerts.js](file:///d:/crowd%20sense/backend/src/routes/alerts.js) → Updates `responder_status` column in SQLite `audit_log`; updates in-memory map; emits `alert_status_updated` → HTTP 200 / Socket broadcast → `activeStatus` updated in card/modal; merged into `activeAlerts` in [App.jsx](file:///d:/crowd%20sense/frontend/src/App.jsx) → Selected status button highlights; status badge updates across command dashboard, field mobile devices, and citizen tracker timeline.

---

### Feature: Incident Response Playbook Protocol & Shortfall Resolution
Playbook panel mounts or receives alert update → [PlaybookPanel.jsx](file:///d:/crowd%20sense/frontend/src/components/PlaybookPanel.jsx) → HTTP `GET /api/alerts/:alertId/playbook?zone_id=&severity=&alert_type=&category=` → Route handler in [backend/src/routes/alerts.js](file:///d:/crowd%20sense/backend/src/routes/alerts.js) → Resolves NDMA protocol in `playbookService.js`; compares required personnel against `responderCheckIns`; reads `playbook_step_log`; calls Groq API (or deterministic fallback) for narrative → HTTP 200 `{ playbook, shortfall, completed_steps, narrative_wrapper }` → `playbookData` and `completedStepsMap` populated in [PlaybookPanel.jsx](file:///d:/crowd%20sense/frontend/src/components/PlaybookPanel.jsx) → Displays NDMA reference badges, staffing sufficiency badge (green `"✓ SUFFICIENT"` or pulsing red `"⚠️ SHORTFALL (X NEEDED)"`), contextual narrative note, and action checklist.

---

### Feature: Playbook Action Checklist Step Completion
Operator or field commander clicks checkbox next to an action step → [PlaybookPanel.jsx](file:///d:/crowd%20sense/frontend/src/components/PlaybookPanel.jsx) → HTTP `POST /api/alerts/:alertId/playbook-step` (and Socket emit `complete_playbook_step`) with `{ step_index, step_text, completed_by }` → Handlers in [backend/src/routes/alerts.js](file:///d:/crowd%20sense/backend/src/routes/alerts.js) & [backend/src/sockets/index.js](file:///d:/crowd%20sense/backend/src/sockets/index.js) → Inserts row into SQLite `playbook_step_log` table; broadcasts Socket.io event `playbook_step_completed` → HTTP 200 `{ success: true, step }` → `completedStepsMap` updated in [PlaybookPanel.jsx](file:///d:/crowd%20sense/frontend/src/components/PlaybookPanel.jsx); step appended in [App.jsx](file:///d:/crowd%20sense/frontend/src/App.jsx) → Checklist item receives strikethrough styling; shows completion metadata (`"✓ Completed by [Name] at [Time]"`); checkbox is permanently disabled to preserve audit integrity.

---

### Feature: Dual Phone Synchronization Simulation
User interacts with iPhone (Citizen) and Android (Responder) side-by-side → [DualPhoneSimulator.jsx](file:///d:/crowd%20sense/frontend/src/components/DualPhoneSimulator.jsx) → Bidirectional REST & Socket.io traffic detailed in Citizen and Responder flows above → Backend alert bus and SQLite database → Synchronized Socket.io broadcasts → Local states update concurrently in child frames → Action submitted on Citizen phone (e.g. SOS report) instantly rings and displays on Responder phone; status updates on Responder phone immediately advance Citizen tracker.

---

### Feature: Tactical 2D Venue Operations & Egress Corridor Map
User navigates to Venue Map tab → [BottleneckExitMap.jsx](file:///d:/crowd%20sense/frontend/src/components/BottleneckExitMap.jsx) → Consumes `zoneMap` telemetry via props from [App.jsx](file:///d:/crowd%20sense/frontend/src/App.jsx) (driven by `density_update` socket events) → None (client-side SVG rendering) → None → None → Segment densities sync with live zone data → Displays 2D SVG vector layout of Staging Lawn, 4.0m connecting channels, Main Gathering Field, and X-Highway network with color-coded corridor densities.

---

### Feature: Egress Corridor Layer Visibility Toggles
User toggles map layer checkboxes (`corridor`, `heatmap`, `chokePoints`, `gridOverlay`) → [BottleneckExitMap.jsx](file:///d:/crowd%20sense/frontend/src/components/BottleneckExitMap.jsx) → None (pure client-side state) → None → None → None → `layers` boolean state toggled in [BottleneckExitMap.jsx](file:///d:/crowd%20sense/frontend/src/components/BottleneckExitMap.jsx) → SVG canvas selectively shows/hides radial density heatmap gradients, choke point circular nodes, corridor route bands, and coordinate grid lines.

---

### Feature: Egress Corridor Interactive Choke Point & Segment Inspection
User clicks SVG corridor segment path or choke point circle → [BottleneckExitMap.jsx](file:///d:/crowd%20sense/frontend/src/components/BottleneckExitMap.jsx) → None (pure client-side state) → None → None → None → `selectedItem` populated in [BottleneckExitMap.jsx](file:///d:/crowd%20sense/frontend/src/components/BottleneckExitMap.jsx) → Selected SVG element expands and highlights; side inspector drawer displays segment metrics (width, live density, status, flow capacity).

---

### Feature: Manual Corridor Breach Lock & Density Override
User clicks "Lock Breach: seg_1 / seg_2 / seg_3a" test button → [BottleneckExitMap.jsx](file:///d:/crowd%20sense/frontend/src/components/BottleneckExitMap.jsx) → None (client-side simulation state) → None → None → None → `segmentDensities[segId]` forced to $1.35\text{ p/m}^2$, `manualBreaches` updated in [BottleneckExitMap.jsx](file:///d:/crowd%20sense/frontend/src/components/BottleneckExitMap.jsx) → Corridor segment turns flashing neon red; marshal dispatch alert appears; active vehicle dispatches along the path halt immediately.

---

### Feature: Emergency Response Vehicle Dispatch Simulation
User selects unit mode (`AMBULANCE` / `FOOT_MEDIC`), picks target quadrant, and clicks "🚀 Launch Dispatch" → [BottleneckExitMap.jsx](file:///d:/crowd%20sense/frontend/src/components/BottleneckExitMap.jsx) → None (pure client-side animation loop) → None → None → None → `isSimulating: true`, `simProgress` increments via `setInterval` in [BottleneckExitMap.jsx](file:///d:/crowd%20sense/frontend/src/components/BottleneckExitMap.jsx) → Vehicle marker smoothly animates along quadratic Bezier curve path; ETA countdown ticks down; dispatch log records transit milestones.

---

### Feature: Automated Vehicle Transit Breach Halt
Animated vehicle reaches a corridor segment whose density exceeds $1.0\text{ p/m}^2$ → [BottleneckExitMap.jsx](file:///d:/crowd%20sense/frontend/src/components/BottleneckExitMap.jsx) → Internal path evaluation check → None → None → None → Vehicle transit timer paused; `isVehicleHaltedAtBreach` set to true in [BottleneckExitMap.jsx](file:///d:/crowd%20sense/frontend/src/components/BottleneckExitMap.jsx) → Vehicle stops moving at entrance node; pulsing red banner displays `🚨 OFFICIAL ACTION REPORT REQUIRED: Route blocked by crowd surge`.

---

### Feature: Targeted Marshal Clearance & Vehicle Dispatch Resumption
User clicks "⚡ Report clearance & Resume Vehicle" button → [BottleneckExitMap.jsx](file:///d:/crowd%20sense/frontend/src/components/BottleneckExitMap.jsx) → None (client-side simulation state) → None → None → None → Segment density resets to $0.25\text{ p/m}^2$; marshal alert removed; transit timer resumes in [BottleneckExitMap.jsx](file:///d:/crowd%20sense/frontend/src/components/BottleneckExitMap.jsx) → Blocked corridor segment turns green; halt banner disappears; vehicle resumes moving toward target quadrant.

---

### Feature: Clear All Corridor Breaches
User clicks "🧹 Clear All Breaches" button → [BottleneckExitMap.jsx](file:///d:/crowd%20sense/frontend/src/components/BottleneckExitMap.jsx) → None (client-side simulation state) → None → None → None → All segments in `manualBreaches` cleared and reset to baseline $0.25\text{ p/m}^2$ in [BottleneckExitMap.jsx](file:///d:/crowd%20sense/frontend/src/components/BottleneckExitMap.jsx) → All corridor paths return to green; all marshal warning banners dismiss simultaneously.

---

### Feature: Post-Event Milestone Timeline & Historical Alert Statistics
User switches sub-tab to "TIMELINE & AUDIT LOGS" (or changes zone scope) → [PostEventAnalysisView.jsx](file:///d:/crowd%20sense/frontend/src/components/PostEventAnalysisView.jsx) → HTTP `GET /api/post-event-timeline?zone_id=:selectedZone` → Route handler in [backend/src/routes/postEvent.js](file:///d:/crowd%20sense/backend/src/routes/postEvent.js) → Queries SQLite `audit_log` table (100 recent rows); filters by zone; aggregates totals → HTTP 200 `{ zone_id, alerts, summary }` → `timelineData` state populated in [PostEventAnalysisView.jsx](file:///d:/crowd%20sense/frontend/src/components/PostEventAnalysisView.jsx) → Milestone trunk renders color-coded event nodes (Panic Red, Graduated Orange-red); top summary cards show total, panic, acknowledged, and escalated counts.

---

### Feature: Capstone Post-Event Safety Accountability Report Generation
User selects scope, toggles simulated reference figures checkbox, and clicks "⚡ GENERATE OFFICIAL REPORT" → [PostEventAnalysisView.jsx](file:///d:/crowd%20sense/frontend/src/components/PostEventAnalysisView.jsx) → HTTP `POST /api/reports/generate` with `{ scope, include_simulated_reference, venue_name }` → Route handler in [backend/src/routes/reports.js](file:///d:/crowd%20sense/backend/src/routes/reports.js) → `reportAggregationService.js` aggregates SQLite `density_history` and `audit_log`; `geminiReportService.js` calls Gemini LLM (or deterministic fallback); inserts into SQLite `reports` table → HTTP 200 `{ success: true, report }` → `currentReport` set, `isGenerating: false` in [PostEventAnalysisView.jsx](file:///d:/crowd%20sense/frontend/src/components/PostEventAnalysisView.jsx) → Multi-step progress spinner dismisses; formal 6-section safety report renders inside [PostEventReportDocument.jsx](file:///d:/crowd%20sense/frontend/src/components/PostEventReportDocument.jsx).

---

### Feature: Cached Post-Event Safety Report Instant Retrieval
User clicks "📥 Load Cached Report (Demo Safety)" button → [PostEventAnalysisView.jsx](file:///d:/crowd%20sense/frontend/src/components/PostEventAnalysisView.jsx) → HTTP `GET /api/reports/latest` → Route handler in [backend/src/routes/reports.js](file:///d:/crowd%20sense/backend/src/routes/reports.js) → Queries SQLite `reports` table ordered by `created_at DESC LIMIT 1` → HTTP 200 `{ success: true, report, is_fallback }` → `currentReport` state set in [PostEventAnalysisView.jsx](file:///d:/crowd%20sense/frontend/src/components/PostEventAnalysisView.jsx) → Previously generated capstone report loads instantly from SQLite cache without LLM latency.

---

### Feature: Administrative Post-Event Report Filing & Markdown Display
Report is loaded or generated → [PostEventReportDocument.jsx](file:///d:/crowd%20sense/frontend/src/components/PostEventReportDocument.jsx) → None (presentational render) → None → None → None → Props rendered in [PostEventReportDocument.jsx](file:///d:/crowd%20sense/frontend/src/components/PostEventReportDocument.jsx) → Executive KPI cards render (Average Acknowledge Time, Auto-escalations, Panic Bypasses, Peak Occupancy); source badge shows `🤖 AI SYNTHESIZED` or `⚠️ LOCAL DETERMINISTIC SYNTHESIS`; custom markdown renderer displays all 6 report sections.

---

### Feature: Underlying Report Raw JSON Data Inspector
User clicks "🔍 View Underlying JSON Data" button → [PostEventReportDocument.jsx](file:///d:/crowd%20sense/frontend/src/components/PostEventReportDocument.jsx) → None (pure client-side state) → None → None → None → `showJsonDrawer` boolean toggles in [PostEventReportDocument.jsx](file:///d:/crowd%20sense/frontend/src/components/PostEventReportDocument.jsx) → Collapsible drawer expands below report showing syntax-highlighted raw JSON payload used to generate the document.

---

### Feature: Post-Event Report Markdown Copy to Clipboard
User clicks "📋 Copy Markdown" button → [PostEventReportDocument.jsx](file:///d:/crowd%20sense/frontend/src/components/PostEventReportDocument.jsx) → Native browser `navigator.clipboard.writeText()` → Local OS clipboard → None → Clipboard write succeeds → `copied: true` in [PostEventReportDocument.jsx](file:///d:/crowd%20sense/frontend/src/components/PostEventReportDocument.jsx) → Button label changes to `"✓ Copied"`; raw markdown document is placed on user's clipboard.

---

### Feature: Post-Event Report PDF Export / Print
User clicks "🖨️ Export as PDF / Print" button → [PostEventReportDocument.jsx](file:///d:/crowd%20sense/frontend/src/components/PostEventReportDocument.jsx) → Browser native `window.print()` → Browser print subsystem → None → Print preview dialog opens → `@media print` CSS rules in [index.css](file:///d:/crowd%20sense/frontend/src/index.css) apply → Header, navigation tabs, weather bar, and utility buttons are hidden; formal document styles format cleanly for district safety PDF export.

---

### Feature: Crowd Planner Venue Architectural Canvas Drawing
User selects tool (`WALL`, `BARRICADE`, `EXIT`, `OPENING`, `SPAWN`, `FOCUS`), then clicks/drags on canvas → [PlannerPage.jsx](file:///d:/crowd%20sense/frontend/src/pages/PlannerPage.jsx) → None (HTML5 canvas state mutation) → None → None → None → `layout` entity arrays updated in [PlannerPage.jsx](file:///d:/crowd%20sense/frontend/src/pages/PlannerPage.jsx) → Canvas renders interactive geometry: polygon walls, red barricade lines, green exit lines, dynamic openings, and spawn portals.

---

### Feature: Pre-Event Scale Calibration Tool
User selects `SCALE` tool, clicks two points on canvas, enters real-world distance in meters, and submits → [PlannerPage.jsx](file:///d:/crowd%20sense/frontend/src/pages/PlannerPage.jsx) → None (client-side math calculation) → None → None → None → `layout.scale.pixelsPerMeter` recalculated in [PlannerPage.jsx](file:///d:/crowd%20sense/frontend/src/pages/PlannerPage.jsx) → Calibration dialog closes; canvas distance coordinates and Fruin density evaluations scale to the calibrated physical dimensions.

---

### Feature: Venue Architectural Plan Save (Upsert)
User types venue name and clicks "SAVE VENUE" button → [PlannerPage.jsx](file:///d:/crowd%20sense/frontend/src/pages/PlannerPage.jsx) → HTTP `POST /api/venues` with `{ name, layout, venue_id }` → Route handler in [backend/src/routes/venues.js](file:///d:/crowd%20sense/backend/src/routes/venues.js) → Executes SQLite UPSERT on `venues` table (`INSERT INTO venues ... ON CONFLICT(venue_id) DO UPDATE`) → HTTP 201 `{ venue_id, name, created_at }` → `saveStatus: 'saved'` in [PlannerPage.jsx](file:///d:/crowd%20sense/frontend/src/pages/PlannerPage.jsx); `savedVenues` re-fetched → Status banner confirms `"Saved successfully"`; layout is permanently stored in SQLite.

---

### Feature: Venue Architectural Plan Load
User selects a venue layout from the saved venue dropdown → [PlannerPage.jsx](file:///d:/crowd%20sense/frontend/src/pages/PlannerPage.jsx) → HTTP `GET /api/venues/:id` → Route handler in [backend/src/routes/venues.js](file:///d:/crowd%20sense/backend/src/routes/venues.js) → Queries SQLite `SELECT * FROM venues WHERE venue_id = ?`; parses `layout_json` → HTTP 200 `{ venue_id, name, layout }` → `layout`, `venueName`, `venueId` updated in [PlannerPage.jsx](file:///d:/crowd%20sense/frontend/src/pages/PlannerPage.jsx) → 2D canvas and 3D Three.js visualizer re-render with the chosen venue layout's walls, gates, and spawn portals.

---

### Feature: Reset Venue Layout to Default Seeded Demo
User clicks "RESET TO DEMO" button in Planner editor → [PlannerPage.jsx](file:///d:/crowd%20sense/frontend/src/pages/PlannerPage.jsx) → None (re-reads static client-side `DEMO_VENUE` constant) → None → None → None → `layout` reset to default in [PlannerPage.jsx](file:///d:/crowd%20sense/frontend/src/pages/PlannerPage.jsx) → Canvas reloads the Temple Chariot Procession layout (inner sanctum, chariot path, Gopuram exits, and barrier gates).

---

### Feature: 2D Social Force Model (SFM) Crowd Dynamics Simulation
User clicks "START SIM" in Planner control deck → [PlannerControls.jsx](file:///d:/crowd%20sense/frontend/src/components/PlannerControls.jsx) / [PlannerPage.jsx](file:///d:/crowd%20sense/frontend/src/pages/PlannerPage.jsx) → None (client-side physics worker / `requestAnimationFrame` loop in `socialForceSim.js`) → None → None → None → `simMode: 'running'`, `agentCount`, `simTimeSec`, `maxDensity` updated per frame in [PlannerPage.jsx](file:///d:/crowd%20sense/frontend/src/pages/PlannerPage.jsx) → Pedestrian agents spawn and navigate around walls and barricades toward exits; live spatial grid computes Fruin Level of Service density heatmap ($p/m^2$).

---

### Feature: Social Force Model Simulation Playback Controls
User clicks "PAUSE" or "RESET" button in Planner controls → [PlannerControls.jsx](file:///d:/crowd%20sense/frontend/src/components/PlannerControls.jsx) → None (client-side simulation loop control) → None → None → None → `simMode` set to `'paused'` or `'edit'`, agents array cleared on reset in [PlannerPage.jsx](file:///d:/crowd%20sense/frontend/src/pages/PlannerPage.jsx) → Agent motion halts instantly on pause; canvas clears all agents and resets clock to 0:00 on reset.

---

### Feature: Emergency Surge Evacuation Trigger
User clicks "TRIGGER EMERGENCY SURGE" button during simulation → [PlannerControls.jsx](file:///d:/crowd%20sense/frontend/src/components/PlannerControls.jsx) → None (client-side SFM agent state mutation) → None → None → None → `isEmergency: true` in [PlannerPage.jsx](file:///d:/crowd%20sense/frontend/src/pages/PlannerPage.jsx) → Emergency button flashes red `animate-panic`; all agents reprioritize nearest emergency exits; agent velocity and panic behaviors surge.

---

### Feature: Dynamic Emergency Gate Toggling (2D Controls)
User clicks dynamic gate button ("OPEN" / "CLOSED") or "Open All" / "Close All" in control panel → [PlannerControls.jsx](file:///d:/crowd%20sense/frontend/src/components/PlannerControls.jsx) → None (client-side layout opening state mutation) → None → None → None → `layout.openings[i].isOpen` inverted in [PlannerPage.jsx](file:///d:/crowd%20sense/frontend/src/pages/PlannerPage.jsx) → Gate barrier line vanishes from collision grid; gate button pulses green; crowd agents redirect through the opened egress pathway.

---

### Feature: Focus Attraction Target Placement & Inflow Manipulation
User enables Focus Mode, clicks "📍 Set Target", and clicks point on canvas → [PlannerControls.jsx](file:///d:/crowd%20sense/frontend/src/components/PlannerControls.jsx) / [PlannerPage.jsx](file:///d:/crowd%20sense/frontend/src/pages/PlannerPage.jsx) → None (client-side SFM goal state mutation) → None → None → None → `focusPoint` and `isFocusMode` set in [PlannerPage.jsx](file:///d:/crowd%20sense/frontend/src/pages/PlannerPage.jsx) → Purple focus target ring appears on canvas; subset of pedestrians alter trajectory toward the attraction point.

---

### Feature: Spawn Inflow Rate & Active Inflow Checkboxes
User adjusts spawn inflow slider (0 - 20 p/s) or toggles active spawn checkboxes → [PlannerControls.jsx](file:///d:/crowd%20sense/frontend/src/components/PlannerControls.jsx) → None (client-side SFM parameters) → None → None → None → `spawnRate` and `activeSpawnIds` updated in [PlannerPage.jsx](file:///d:/crowd%20sense/frontend/src/pages/PlannerPage.jsx) → Simulation adjusts agent insertion frequency and selectively activates or silences specific venue entrance gates.

---

### Feature: Population Cap & Density Grid Display Toggles
User adjusts max agents slider (50 - 1500), heatmap opacity (0.0 - 1.0), or grid line checkbox → [PlannerControls.jsx](file:///d:/crowd%20sense/frontend/src/components/PlannerControls.jsx) → None (client-side rendering settings) → None → None → None → `maxAgents`, `heatmapOpacity`, `showGrid` updated in [PlannerPage.jsx](file:///d:/crowd%20sense/frontend/src/pages/PlannerPage.jsx) → Agent spawner respects maximum population cap; canvas heatmap gradient adjusts transparency and overlays density grid coordinate lines.

---

### Feature: Three.js 2.5D/3D WebGL Venue Visualizer & Camera Navigation
User clicks "2.5D VENUE VIEW" toggle and navigates with mouse (orbit drag, right-click pan, scroll zoom) → [PlannerPage.jsx](file:///d:/crowd%20sense/frontend/src/pages/PlannerPage.jsx) / [Venue25DViewer.jsx](file:///d:/crowd%20sense/frontend/src/components/Venue25DViewer.jsx) → None (WebGL / Three.js OrbitControls frame loop) → None → None → None → `viewMode: '2.5D'` in [PlannerPage.jsx](file:///d:/crowd%20sense/frontend/src/pages/PlannerPage.jsx) → 2D canvas is replaced by Three.js WebGL scene with extruded 3D buildings, Gopuram spires, rooftop infrastructure, illuminated gates, and up to 2,000 GPU-instanced 3D pedestrian agents.

---

### Feature: Raycast 3D Dynamic Gate Click Interaction
User clicks on a 3D dynamic gate mesh inside the WebGL viewport → [Venue25DViewer.jsx](file:///d:/crowd%20sense/frontend/src/components/Venue25DViewer.jsx) → None (Three.js pointer raycasting) → None → None → None → `onToggleEmergencyGate(gateId)` invoked; `layout.openings` toggled in [PlannerPage.jsx](file:///d:/crowd%20sense/frontend/src/pages/PlannerPage.jsx) → 3D gate mesh swings 85° outward, floor threshold pad illuminates green, and pedestrian agents surge through the opening.

---

### Feature: Pre-Event Multi-Scenario Comparative Simulation Analysis
User selects scenarios (`baseline`, `gate2_opens_at_crisis`, `overcapacity`, `panic_midway`), adjusts parameters, and clicks "RUN MULTI-SCENARIO ANALYSIS" → [PlannerReportPage.jsx](file:///d:/crowd%20sense/frontend/src/pages/PlannerReportPage.jsx) → None (client-side sequential SFM batch simulations) → None → None → None → `scenarioResults`, `comparison`, `recommendations`, `hottestCells` populated in [PlannerReportPage.jsx](file:///d:/crowd%20sense/frontend/src/pages/PlannerReportPage.jsx) → Displays timeline density charts, Fruin Level of Service comparison tables, persistent vs conditional bottlenecks, and 8 matched NDMA safety recommendations.

---

### Feature: Pre-Event AI Executive Safety Narrative Synthesis
User clicks "GENERATE AI EXECUTIVE NARRATIVE" on planning report → [PlannerReportPage.jsx](file:///d:/crowd%20sense/frontend/src/pages/PlannerReportPage.jsx) → HTTP `POST /api/planner/narrate-report` with `{ bottleneckResults, recommendations, venueName, scenarioLabels, eventContext }` → Route handler in [backend/src/routes/planner.js](file:///d:/crowd%20sense/backend/src/routes/planner.js) → Compacts bottlenecks; calls Google Gemini API (or deterministic fallback) in `geminiPlannerService.js` → HTTP 200 `{ success: true, narration, model, source }` → `narration` markdown string populated in [PlannerReportPage.jsx](file:///d:/crowd%20sense/frontend/src/pages/PlannerReportPage.jsx) → Loading spinner dismisses; structured AI executive narrative renders inside [StructuredNarrativeViewer.jsx](file:///d:/crowd%20sense/frontend/src/components/StructuredNarrativeViewer.jsx).

---

### Feature: Structured AI Narrative Viewer & Clipboard Export
Narrative loads into viewer; user clicks "Copy Text" button → [StructuredNarrativeViewer.jsx](file:///d:/crowd%20sense/frontend/src/components/StructuredNarrativeViewer.jsx) → Native browser `navigator.clipboard.writeText()` → Local OS clipboard → None → Clipboard write succeeds → `copied: true` in [StructuredNarrativeViewer.jsx](file:///d:/crowd%20sense/frontend/src/components/StructuredNarrativeViewer.jsx) → Parsed cards render with colored left accents (Blue for Executive Summary, Amber for Bottlenecks, Green for Mitigations, Purple for Advisory); button confirms `"✓ Copied"`.

---

### Feature: Mock Emergency Dispatch Simulation *(Unrendered Frontend Component)*
User clicks dispatch action button in mock control card → [MockDispatchControl.jsx](file:///d:/crowd%20sense/frontend/src/components/MockDispatchControl.jsx) → HTTP `POST /api/dispatch/simulate` with `{ action, zone_id }` → Route handler in [backend/src/index.js](file:///d:/crowd%20sense/backend/src/index.js) → `notifications.js` executes simulated dispatch; emits Socket.io `mock_dispatch_toast` → HTTP 200 `{ status: 'simulated_demo_mode', message, is_simulation: true }` → `mockToasts` array appended in [App.jsx](file:///d:/crowd%20sense/frontend/src/App.jsx) → Stacked toast notifications marked `[SIMULATION ONLY]` appear. *(Flagged: Component omitted from active JSX tree in `App.jsx`).*

---

### Feature: Density Telemetry Ingestion, Risk Scoring & History Pruning (CV Pipeline)
CV service pushes camera frame telemetry → CV Service (External) → HTTP `POST /api/density` with full metric contract → Route handler in [backend/src/routes/density.js](file:///d:/crowd%20sense/backend/src/routes/density.js) → Computes slope, composite risk, escalation; inserts into SQLite `density_history`; prunes old rows on every 500th insert; emits `density_update` → HTTP 200 `{ received: true, processed }` → `zoneMap[zone_id]` updated in [App.jsx](file:///d:/crowd%20sense/frontend/src/App.jsx) → All dashboard telemetry cards, gauges, charts, and video overlays refresh with new density and risk scores.

---

### Feature: Venue Layout Deletion *(Backend Exposed Only)*
External client or script requests venue deletion → External API call → HTTP `DELETE /api/venues/:id` → Route handler in [backend/src/routes/venues.js](file:///d:/crowd%20sense/backend/src/routes/venues.js) → Executes SQLite `DELETE FROM venues WHERE venue_id = ?` → HTTP 200 `{ deleted: true, venue_id }` → None (no frontend caller exists) → Venue record is permanently purged from the database. *(Flagged: No UI button exists in `PlannerPage.jsx`).*

---

### Feature: Historical Generated Report Archive Query *(Backend Exposed Only)*
External client queries list of past reports → External API call → HTTP `GET /api/reports/history?limit=10` → Route handler in [backend/src/routes/reports.js](file:///d:/crowd%20sense/backend/src/routes/reports.js) → Queries SQLite `reports` table ordered by `created_at DESC` → HTTP 200 `{ history: [...] }` → None (no frontend caller exists) → JSON array of historical report metadata returned. *(Flagged: Frontend only calls `/latest`).*

---

### Feature: Single Report Lookup by ID *(Backend Exposed Only)*
External client requests report by identifier → External API call → HTTP `GET /api/reports/:id` → Route handler in [backend/src/routes/reports.js](file:///d:/crowd%20sense/backend/src/routes/reports.js) → Queries SQLite `SELECT * FROM reports WHERE report_id = ?` → HTTP 200 `{ success: true, report }` → None (no frontend caller exists) → Full markdown and input JSON for specific report returned. *(Flagged: Frontend only loads `/latest`).*

---

### Feature: Raw Report Data Audit *(Backend Exposed Only)*
External client queries aggregated data without markdown generation → External API call → HTTP `GET /api/reports/raw-data` → Route handler in [backend/src/routes/reports.js](file:///d:/crowd%20sense/backend/src/routes/reports.js) → Runs `aggregateReportData` over SQLite `density_history` and `audit_log` tables → HTTP 200 raw aggregated JSON object → None (no frontend caller exists) → Returns full operational session dataset. *(Flagged: Frontend inspects in-memory JSON on loaded report rather than calling this endpoint).*

---

### Feature: Active Responders Directory Query *(Backend Exposed Only)*
External client queries all checked-in staff → External API call → HTTP `GET /api/responders` → Route handler in [backend/src/routes/responders.js](file:///d:/crowd%20sense/backend/src/routes/responders.js) → Reads all values from in-memory `responderCheckIns` Map → HTTP 200 `{ responders: [...] }` → None (no frontend caller exists) → Returns complete roster of active field responders. *(Flagged: Frontend only queries `/nearest`).*

---

### Feature: Direct Assistant Instructions Query *(Backend Exposed Only)*
External client queries pushed instruction history → External API call → HTTP `GET /api/assistant/instructions?limit=50` → Route handler in [backend/src/routes/assistant.js](file:///d:/crowd%20sense/backend/src/routes/assistant.js) → Queries SQLite `assistant_instructions` table → HTTP 200 `{ instructions: [...] }` → None (no frontend caller exists) → Returns recent push guidance instructions. *(Flagged: Frontend retrieves instructions via `/api/audit-log`).*

---

### Feature: Static SPA Asset Delivery & Fallback
Browser requests root or deep URL route → Browser navigation → HTTP `GET *` → Static fallback handler in [backend/src/index.js](file:///d:/crowd%20sense/backend/src/index.js) → Checks `frontend/dist` directory on disk; excludes `/api`, `/health`, `/socket.io` → Serves compiled `index.html` or static asset bundle → Browser loads single-page React application → User sees the CrowdSense web application shell.

---

### Feature: Startup Demo Venue Database Seeding (Background Job)
Backend server process initializes → Node.js process startup → One-shot `setTimeout` (500ms delay) in [backend/src/index.js](file:///d:/crowd%20sense/backend/src/index.js) → `seedDemoVenue.js` executes SQLite UPSERT on `venues` table → Reads static `DEMO_LAYOUT` definition → Database write completes → Default `"demo-temple-procession"` record is initialized → Demo venue is immediately available for Planner loading without requiring manual layout creation.

---

## 3. Full Feature Checklist

This flat numbered list captures every distinct feature found across `AUDIT_FRONTEND.md` and `AUDIT_BACKEND.md`. It serves as the authoritative acceptance checklist during UI redesign — nothing on this list should end up broken, orphaned, or missing.

1. **System Health Check (`GET /health`):** Verifies backend service status, optical flow toggle flag, Groq LLM availability, and ISO timestamp.
2. **WebSocket Real-Time Connection Management:** Bidirectional Socket.io connection channel with connection status pill and disconnect handling.
3. **Manual WebSocket Reconnection Trigger:** Actionable reconnection button displayed on dropped connection banners.
4. **Operations Tab Navigation Bar:** Global header tab bar switching between Live Operations, Post-Event Analysis, Venue Map, Dual Phone Simulator, and Planner.
5. **Dedicated Field Simulator Port Routing (Port 5174):** Automatic initialization to Dual Phone Simulator view when launched on port 5174.
6. **Dark / Light Theme Switcher:** Theme toggle switching between high-contrast dark operations mode and light day mode via `data-theme`.
7. **Proactive Architectural Limitations Modal:** Informational drawer detailing 12 transparency disclosures (optical flow limits, simulated dispatch, NDMA boundaries).
8. **Live Zone Video Stream Proxy (`GET /stream/:zone_id`):** Reverse-proxied MJPEG camera stream from CV service on port 5001 to backend port 4000.
9. **Video Stream Image Error Fallback:** Automatic fallback to device webcam (`getUserMedia`) or HTML5 canvas simulation if MJPEG feed drops.
10. **Dynamic Zone Risk Vignette & Meter:** Radial gradient overlay and real-time numeric density meter ($p/m^2$) shifting across Green, Yellow, Orange, and Red.
11. **Farneback Optical Flow Motion Gauges:** Telemetry indicators displaying flow convergence ($0.0 - 1.0$), turbulence ($0.0 - 1.0$), and panic signature warnings.
12. **Optical Flow Feature Flag Toggle (`ENABLE_OPTICAL_FLOW`):** Backend flag switching between 4-component risk formula and 2-component density/slope scoring.
13. **Density Rate-of-Rise Trend Extrapolation:** SVG trajectory curve with projected slope lines estimating time to critical threshold breach.
14. **Trend Extrapolation Zone Selector:** Live Operations controls switching trend trajectory analysis between Zone 1 and Zone 2.
15. **Composite Risk Score Formula Breakdown Modal:** Explanatory modal breaking down exact mathematical weights (Density 50%, Slope 30%, Convergence 10%, Turbulence 10%).
16. **Proactive Control Room Push-Guidance Banners:** Automated high-priority action banners pushed on threshold crossings, panic signatures, or citizen reports.
17. **Push-Guidance Banner Dismissal:** Operator dismiss button filtering pushed guidance from active memory.
18. **Grounded Control Room Assistant Q&A Drawer (`POST /api/assistant/ask`):** Collapsible chat drawer answering operational queries grounded in live telemetry, gate states, and active incidents.
19. **Assistant Suggested Operational Prompt Chips:** Quick-inquiry prompt chips injecting pre-formulated operational questions into the assistant chat.
20. **Assistant Local Deterministic Fallback (`ASSISTANT_LOCAL_MODE`):** Automatic or flag-enforced fallback synthesizing structured Q&A locally without external LLM calls.
21. **Environmental Weather Preset Selector (`POST /api/conditions/set`):** Operational presets (`CLEAR`, `EXTREME HEAT`, `HEAVY RAIN`) adjusting temperature, precipitation, and sensitivity multipliers.
22. **Environmental Sensitivity Modifiers:** Automated 25% threshold reduction under heat (`density_factor: 0.75`) and 1.5x flow sensitivity boost under rain (`flow_factor: 1.5`).
23. **Current Environmental Conditions Query (`GET /api/conditions/current`):** Retrieval of active simulated weather parameters and sensitivity factors.
24. **Master CV Pipeline Power Toggle (`POST /api/pipeline/toggle`):** Global operational toggle pausing or resuming continuous CV processing across backend and frontend.
25. **Master CV Pipeline State Query (`GET /api/pipeline/status`):** Endpoint querying current pipeline active status, paused timestamp, and last update time.
26. **Master CV Pipeline Explicit State Set (`POST /api/pipeline/set`):** *[Backend Exposed]* Endpoint setting pipeline active status explicitly to true or false.
27. **Live Operations Incident Feed (`GET /api/alerts/active`):** Real-time command dashboard card list of all active unacknowledged incidents across monitored zones.
28. **Incident Acknowledgment Flow (`POST /api/alerts/:id/acknowledge`):** Command operations acknowledgment halting auto-escalation timers and recording operator ID in SQLite.
29. **Automated Graduated Auto-Escalation Timer:** Asynchronous background timer escalating unacknowledged red alerts to supervisor `official_2` after 30 seconds.
30. **Behavioral Panic Fast-Path Bypass:** Immediate elevation to Red Alert upon detected stampede, exodus, or high turbulence/density.
31. **Panic Multi-Frame Confirmation Buffer (`PANIC_CONFIRM_FRAMES`):** Suppression of single-frame transient noise until panic persists for 2 consecutive frames.
32. **Panic Alert TTL Auto-Expiry (`PANIC_ALERT_TTL_MS`):** Automatic clearance of unacknowledged panic alerts after 20 seconds of calm video footage.
33. **Immutable Incident Audit Log Table (`GET /api/audit-log`):** Filterable table displaying historical alert logs, completed playbook actions, and pushed guidance.
34. **Audit Log Category Filtering:** Quick-filter pills isolating Panic alerts, Escalated alerts, Acknowledged alerts, Assistant guidance, or Playbook steps.
35. **Audit Log Manual Refresh:** Refresh button re-querying SQLite audit tables on demand.
36. **Citizen Emergency SOS Form Intake (`POST /api/citizen-reports`):** Public mobile interface for reporting Medical Assistance, Suspicious Activity, Theft, or Blocked Exits.
37. **Citizen Live Emergency Status Tracker:** Real-time 3-stage progress tracker updating citizen on report receipt, responder acknowledgment, and resolution.
38. **Tactical Field Responder Check-In (`POST /api/responders/checkin`):** Mobile registration allowing field personnel to register callsign/name and assigned zone.
39. **Tactical Field Responder Change Zone Flow:** Check-in modification flow enabling responders to switch assigned zones.
40. **Active Responders Directory Query (`GET /api/responders`):** *[Backend Exposed]* Directory endpoint listing all currently checked-in field personnel and their locations.
41. **Nearest Responder Adjacency Resolution (`GET /api/responders/nearest`):** Spatial routing algorithm resolving the closest responder team to an incident and returning navigation steps.
42. **Tactical Field Alert Feed & Severity Filter:** Priority-sorted tactical incident feed for responders with `ALL`, `HIGH`, and `MEDIUM` severity filtering.
43. **Tactical Alert Staleness Ticker:** Dynamic time-elapsed counter shifting color from green (<1m) to yellow (1-3m) to pulsing red (>3m).
44. **Tactical Synthetic Audio Alert Tones:** Web Audio API synthesizer generating 440Hz single beeps for alerts and 880Hz 3-pulse bursts for panic.
45. **Tactical Audio Mute Control:** Hardware/software audio toggle silencing synthetic alarm beeps on field devices.
46. **Field Responder Alert Acknowledgment:** Mobile card action emitting `acknowledge_alert` and unlocking operational status controls.
47. **Tactical Incident Full-Screen Modal Overlay:** Dedicated mobile focus screen displaying live incident controls, route steps, and response playbook.
48. **Responder Operational Status Tracking (`POST /api/alerts/:id/status`):** Operational status progression controls (`EN ROUTE`, `ON SCENE`, `RESOLVED`, `NEED BACKUP`) synced across all screens.
49. **Incident Response Playbook Resolution (`GET /api/alerts/:id/playbook`):** NDMA guideline protocol resolution with dynamic resource requirements and checklist steps.
50. **Live Responder Shortfall Evaluation:** Real-time staffing assessment comparing required personnel against checked-in responders in target zone.
51. **Playbook Contextual AI Narrative Note:** Dynamic situation appraisal generated via Groq LLM (or deterministic fallback) framing immediate priorities.
52. **Playbook Action Checklist Step Completion (`POST /api/alerts/:id/playbook-step`):** Interactive checklist logging completed steps into SQLite `playbook_step_log` with permanent checkbox lock.
53. **Dual Phone Simulator Chassis View:** Side-by-side synchronized rendering of Citizen SOS and Tactical Responder mobile applications.
54. **Tactical 2D Egress & Bottleneck Vector Map:** Interactive vector map illustrating Staging Lawn, 4.0m connecting channels, and X-Highway emergency response corridors.
55. **Egress Corridor Layer Visibility Toggles:** Interactive display checkboxes toggling corridors, heatmap gradients, choke points, and coordinate grid lines.
56. **Corridor Segment & Choke Point Inspection:** Clickable SVG elements opening side inspector with width, live density, and flow capacity.
57. **Corridor Manual Breach Lock:** Simulation control locking segment density to $1.35\text{ p/m}^2$ to simulate corridor obstruction.
58. **Emergency Vehicle Dispatch Animation:** Animated emergency vehicle transit along quadratic Bezier curves with ETA countdown.
59. **Automated Vehicle Transit Breach Halt:** Automatic stoppage of emergency transit when approaching a corridor segment exceeding $1.0\text{ p/m}^2$.
60. **Targeted Marshal Clearance Action:** Targeted action clearing corridor obstruction, resetting density to $0.25\text{ p/m}^2$, and resuming vehicle movement.
61. **Clear All Breaches Master Action:** Global reset button clearing all active corridor breach locks across the venue layout.
62. **Post-Event Milestone Timeline (`GET /api/post-event-timeline`):** Chronological incident marker trunk displaying historical alerts and summary metrics.
63. **Capstone Post-Event Safety Report Generator (`POST /api/reports/generate`):** Comprehensive 6-section safety accountability report synthesized via Gemini LLM (or deterministic fallback) and saved to SQLite.
64. **Cached Post-Event Safety Report Fetch (`GET /api/reports/latest`):** Instant retrieval of the most recently generated capstone report from SQLite cache.
65. **Historical Report Archive Listing (`GET /api/reports/history`):** *[Backend Exposed]* Listing of previously generated safety reports with metadata and summary metrics.
66. **Single Report Retrieval by ID (`GET /api/reports/:id`):** *[Backend Exposed]* Detailed lookup of a historical report by its primary key.
67. **Raw Report Operational Data Retrieval (`GET /api/reports/raw-data`):** *[Backend Exposed]* Aggregated operational session data without markdown synthesis.
68. **Administrative Post-Event Report Filing Document:** Formatted document view rendering executive KPI cards, verification tags, and 6 markdown sections.
69. **Underlying Report JSON Data Inspector:** Collapsible JSON viewer displaying the exact input payload used during report generation.
70. **Report Markdown Clipboard Export:** Utility action copying raw report markdown text directly to the system clipboard.
71. **Post-Event Report PDF Export / Print:** Print stylesheet suppressing UI navigation and formatting the safety report for PDF export.
72. **Planner Architectural Layout Editor:** Canvas drawing drawer supporting Wall polygons, Barricades, Exits, Openings, Spawns, and Focus points.
73. **Planner Real-World Scale Calibration:** Two-point calibration tool calculating pixels-per-meter from physical measurements.
74. **Venue Architectural Layout Save (`POST /api/venues`):** Upsert endpoint permanently storing venue layout geometry into SQLite `venues` table.
75. **Saved Venues Directory Query (`GET /api/venues`):** Listing endpoint returning all saved venue layout plans.
76. **Specific Venue Layout Load (`GET /api/venues/:id`):** Retrieval endpoint loading full layout geometry for editing and simulation.
77. **Venue Architectural Plan Deletion (`DELETE /api/venues/:id`):** *[Backend Exposed]* Deletion endpoint purging a venue record from SQLite.
78. **Reset to Default Demo Venue:** Editor reset restoring the default Temple Chariot Procession layout.
79. **2D Social Force Model (SFM) Simulation Engine:** Client-side microscopic pedestrian dynamics simulation evaluating collision avoidance and crowd physics.
80. **Simulation Playback Controls:** Control deck for starting, pausing, and resetting the crowd simulation.
81. **Emergency Surge Evacuation Mode:** Trigger redirecting all simulated agents toward nearest emergency exits with increased velocity.
82. **Dynamic Emergency Gate Egress Controls:** Toggle controls dynamically opening and closing venue gates in the 2D collision grid.
83. **Focus Attraction Point Tool:** Inflow manipulation tool drawing a subset of pedestrians toward a designated attraction coordinate.
84. **Configurable Spawn Inflow Rate:** Rate slider adjusting pedestrian spawn frequency from 0 to 20 persons/second.
85. **Population Cap Limiter:** Safety ceiling slider restricting total concurrent simulation agents between 50 and 1,500.
86. **Real-Time Fruin Level of Service Density Heatmap:** Dynamic spatial grid overlay color-coding crowd density from LOS A (Green) to LOS F (Red).
87. **Three.js 2.5D/3D WebGL Venue Visualizer:** WebGL 3D environment rendering extruded architectural buildings, Gopuram spires, rooftop assets, and 3D agents.
88. **3D OrbitControls Navigation:** Interactive 3D camera navigation supporting left-click orbit rotation, right-click pan, and scroll zoom.
89. **Interactive 3D Gate Raycasting:** Three.js raycaster enabling direct clicking on 3D emergency gate meshes to toggle them open or closed.
90. **Pre-Event Multi-Scenario Simulation Analysis:** Automated comparative analysis running Baseline, Crisis Gate, Overcapacity, and Panic scenarios.
91. **Fruin Level of Service Bottleneck Comparison Table:** Cross-scenario evaluation table identifying persistent vs conditional choke points.
92. **Pre-Event AI Executive Narrative Synthesis (`POST /api/planner/narrate-report`):** 5-section pre-event executive safety assessment synthesized via Gemini LLM (or deterministic fallback).
93. **Structured AI Narrative Viewer:** Formatted card viewer displaying Executive Summary, Bottlenecks, Mitigations, and Safety Advisory.
94. **Structured Narrative Text Copy:** Utility action copying AI planner narrative text directly to clipboard.
95. **Simulated Emergency Dispatch Control (`POST /api/dispatch/simulate`):** *[Unrendered in Frontend]* Trigger for simulated emergency siren activation and police/ambulance dispatch toast.
96. **Density Telemetry Ingestion Contract (`POST /api/density`):** Ingestion endpoint for CV frame metrics computing composite risk and managing history.
97. **Density History Table Pruning & Rotation:** Automated background rotation pruning SQLite `density_history` table to 15,000 rows.
98. **Direct Assistant Instructions Query (`GET /api/assistant/instructions`):** *[Backend Exposed]* Endpoint returning recent generated push instructions.
99. **Static Frontend SPA Fallback (`GET *`):** Server fallback serving compiled frontend single-page application assets.
100. **Startup Demo Venue Database Seeding:** Server background task automatically seeding default Temple Chariot Procession layout on boot.
