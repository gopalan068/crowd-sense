# Backend Codebase Technical Audit Record

**Audit Target:** `backend/` (Node.js/Express + Socket.io + SQLite3)  
**Package:** `crowd-safety-backend` (`0.1.0`) ([backend/package.json:1-5](file:///d:/crowd%20sense/backend/package.json#L1-L5))  
**Audited Directory Root:** `d:/crowd sense/backend/`  

---

## 1. Feature Inventory

| Feature | Description (plain language) | Entry point (file:line) | Triggered by |
| :--- | :--- | :--- | :--- |
| **System Health Check** | Returns operational health status, optical flow toggle flag, Groq LLM configuration status, and current timestamp. | [backend/src/index.js:41](file:///d:/crowd%20sense/backend/src/index.js#L41) | HTTP `GET /health` |
| **Dispatch Simulation REST** | Simulates emergency siren activation/dispatch notification for a zone, logs simulated dispatch, and emits real-time broadcast toast. | [backend/src/index.js:52](file:///d:/crowd%20sense/backend/src/index.js#L52) | HTTP `POST /api/dispatch/simulate` |
| **Dual Video Stream Proxy** | Reverse-proxies MJPEG video feeds for zone cameras from CV service port 5001 to backend port 4000. | [backend/src/index.js:89](file:///d:/crowd%20sense/backend/src/index.js#L89) | HTTP `GET /stream/:zone_id` |
| **Static Frontend Delivery** | Serves compiled static frontend assets and provides SPA single-page fallback for non-API routes. | [backend/src/index.js:116-125](file:///d:/crowd%20sense/backend/src/index.js#L116-L125) | HTTP `GET *` |
| **Audit Log Retrieval** | Fetches historical alert audit entries, logged playbook checklist actions, and pushed assistant instructions. | [backend/src/routes/alerts.js:24](file:///d:/crowd%20sense/backend/src/routes/alerts.js#L24) | HTTP `GET /api/audit-log` |
| **Active Alerts Query** | Returns all currently active and unresolved in-memory alerts across all monitored zones. | [backend/src/routes/alerts.js:45](file:///d:/crowd%20sense/backend/src/routes/alerts.js#L45) | HTTP `GET /api/alerts/active` |
| **Alert Playbook Resolution** | Resolves static NDMA/illustrative playbook protocol, calculates live responder shortfall, retrieves completed steps, and generates contextual narrative note. | [backend/src/routes/alerts.js:55](file:///d:/crowd%20sense/backend/src/routes/alerts.js#L55) | HTTP `GET /api/alerts/:id/playbook` |
| **Playbook Step Completion** | Records completion of an action checklist step in SQLite database and broadcasts update across WebSocket. | [backend/src/routes/alerts.js:120](file:///d:/crowd%20sense/backend/src/routes/alerts.js#L120) | HTTP `POST /api/alerts/:id/playbook-step` |
| **Alert Acknowledgment** | Acknowledges an active alert, halts the auto-escalation timer, updates SQLite audit log, and notifies all connected clients. | [backend/src/routes/alerts.js:148](file:///d:/crowd%20sense/backend/src/routes/alerts.js#L148) | HTTP `POST /api/alerts/:id/acknowledge` |
| **Responder Status Tracking** | Updates field responder operational status (`en_route`, `on_scene`, `resolved`, `need_backup`) on an acknowledged alert. | [backend/src/routes/alerts.js:175](file:///d:/crowd%20sense/backend/src/routes/alerts.js#L175) | HTTP `POST /api/alerts/:id/status` |
| **Control Room Grounded Q&A** | Answers official operational queries grounded strictly in live zone telemetry, gate states, active alerts, and weather conditions. | [backend/src/routes/assistant.js:109](file:///d:/crowd%20sense/backend/src/routes/assistant.js#L109) | HTTP `POST /api/assistant/ask` |
| **Assistant History Retrieval** | Retrieves logged push-guidance instructions previously generated and stored in SQLite audit log. | [backend/src/routes/assistant.js:238](file:///d:/crowd%20sense/backend/src/routes/assistant.js#L238) | HTTP `GET /api/assistant/instructions` |
| **Citizen Emergency SOS Intake** | Ingests emergency reports from the public, injects them into the unified alert bus, persists to audit log, and notifies field teams. | [backend/src/routes/citizenReports.js:32](file:///d:/crowd%20sense/backend/src/routes/citizenReports.js#L32) | HTTP `POST /api/citizen-reports` |
| **Weather Status Query** | Fetches the current environmental condition state (preset, temperature, precipitation, sensitivity factors). | [backend/src/routes/conditions.js:15](file:///d:/crowd%20sense/backend/src/routes/conditions.js#L15) | HTTP `GET /api/conditions/current` |
| **Weather Condition Modulation** | Updates active environmental condition preset/parameters, recalculates safety sensitivity modifiers, and broadcasts update. | [backend/src/routes/conditions.js:24](file:///d:/crowd%20sense/backend/src/routes/conditions.js#L24) | HTTP `POST /api/conditions/set` |
| **Density Telemetry Ingestion & Risk Scoring** | Ingests CV density metrics, evaluates trend slope and optical flow, computes composite risk score, manages escalation timers, records history, and emits real-time telemetry. | [backend/src/routes/density.js:28](file:///d:/crowd%20sense/backend/src/routes/density.js#L28) | HTTP `POST /api/density` |
| **Pipeline Execution Status Query** | Queries whether continuous CV data processing is currently active or paused. | [backend/src/routes/pipeline.js:15](file:///d:/crowd%20sense/backend/src/routes/pipeline.js#L15) | HTTP `GET /api/pipeline/status` |
| **Pipeline Execution Toggle** | Flips pipeline active status between running and paused, emitting change over WebSocket. | [backend/src/routes/pipeline.js:23](file:///d:/crowd%20sense/backend/src/routes/pipeline.js#L23) | HTTP `POST /api/pipeline/toggle` |
| **Pipeline Execution Set** | Sets pipeline active status explicitly to true or false. | [backend/src/routes/pipeline.js:37](file:///d:/crowd%20sense/backend/src/routes/pipeline.js#L37) | HTTP `POST /api/pipeline/set` |
| **Pre-Event Planner Narration** | Synthesizes bottleneck simulation analysis results and matched NDMA mitigation rules into a 5-section audit report using Gemini LLM (or deterministic fallback). | [backend/src/routes/planner.js:33](file:///d:/crowd%20sense/backend/src/routes/planner.js#L33) | HTTP `POST /api/planner/narrate-report` |
| **Post-Event Timeline Analysis** | Aggregates historical alert milestones and summary statistics (panic, acknowledged, auto-escalated counts) for a zone. | [backend/src/routes/postEvent.js:18](file:///d:/crowd%20sense/backend/src/routes/postEvent.js#L18) | HTTP `GET /api/post-event-timeline` |
| **Post-Event Report Generation** | Compiles full operational metrics, density history, and audit trails, generating a 6-section safety accountability report via Gemini LLM (or deterministic fallback). | [backend/src/routes/reports.js:24](file:///d:/crowd%20sense/backend/src/routes/reports.js#L24) | HTTP `POST /api/reports/generate` |
| **Latest Generated Report Fetch** | Fetches the most recently generated post-event report from SQLite cache for instant retrieval. | [backend/src/routes/reports.js:55](file:///d:/crowd%20sense/backend/src/routes/reports.js#L55) | HTTP `GET /api/reports/latest` |
| **Report History Listing** | Lists metadata and summary metrics of all previously generated post-event reports. | [backend/src/routes/reports.js:76](file:///d:/crowd%20sense/backend/src/routes/reports.js#L76) | HTTP `GET /api/reports/history` |
| **Raw Report Data Audit** | Returns the unformatted aggregated operational JSON payload compiled across density, alerts, and environmental state without markdown generation. | [backend/src/routes/reports.js:91](file:///d:/crowd%20sense/backend/src/routes/reports.js#L91) | HTTP `GET /api/reports/raw-data` |
| **Specific Report Lookup** | Retrieves a single generated report record by ID, including complete markdown and input JSON. | [backend/src/routes/reports.js:108](file:///d:/crowd%20sense/backend/src/routes/reports.js#L108) | HTTP `GET /api/reports/:id` |
| **Responder Check-In** | Registers a field responder's current location zone into the active in-memory check-in registry and broadcasts event. | [backend/src/routes/responders.js:109](file:///d:/crowd%20sense/backend/src/routes/responders.js#L109) | HTTP `POST /api/responders/checkin` |
| **Responder List Query** | Returns all currently checked-in field responders and their assigned zones. | [backend/src/routes/responders.js:142](file:///d:/crowd%20sense/backend/src/routes/responders.js#L142) | HTTP `GET /api/responders` |
| **Nearest Responder Lookup** | Resolves nearest checked-in responder team to a zone using pre-authored topological adjacency and routes. | [backend/src/routes/responders.js:153](file:///d:/crowd%20sense/backend/src/routes/responders.js#L153) | HTTP `GET /api/responders/nearest` |
| **Venue Listing** | Lists all saved venue layout plans (IDs, names, creation and update timestamps). | [backend/src/routes/venues.js:24](file:///d:/crowd%20sense/backend/src/routes/venues.js#L24) | HTTP `GET /api/venues` |
| **Venue Retrieval** | Fetches full layout JSON (walls, gates, barricades, exits, spawns, zones) for a specific venue ID. | [backend/src/routes/venues.js:42](file:///d:/crowd%20sense/backend/src/routes/venues.js#L42) | HTTP `GET /api/venues/:id` |
| **Venue Upsert** | Creates or updates a venue layout definition in SQLite. | [backend/src/routes/venues.js:68](file:///d:/crowd%20sense/backend/src/routes/venues.js#L68) | HTTP `POST /api/venues` |
| **Venue Deletion** | Permanently deletes a venue layout record by ID from SQLite. | [backend/src/routes/venues.js:90](file:///d:/crowd%20sense/backend/src/routes/venues.js#L90) | HTTP `DELETE /api/venues/:id` |
| **Graduated Auto-Escalation Timer** | Asynchronously transfers unacknowledged red alerts to senior supervisor `official_2` when timeout expires. | [backend/src/services/escalationManager.js:216-218](file:///d:/crowd%20sense/backend/src/services/escalationManager.js#L216-L218) | `setTimeout` (configured by `ESCALATION_TIMEOUT_SEC`) |
| **Panic Alert Buffer & TTL Expiry** | Buffers consecutive panic frames before firing; auto-expires unacknowledged panic alerts if panic signals cease for TTL. | [backend/src/services/escalationManager.js:65-117](file:///d:/crowd%20sense/backend/src/services/escalationManager.js#L65-L117) | Inbound density reading cycle |
| **Proactive Control Room Push Guidance** | Evaluates rule-matched operational recommendations on alerts or threshold crossings and broadcasts short guidance. | [backend/src/services/controlRoomAssistant.js:301-365](file:///d:/crowd%20sense/backend/src/services/controlRoomAssistant.js#L301-L365) | Alert generation or zone risk band shift |
| **Density History Rotation** | Prunes older density telemetry rows to keep SQLite bounded during prolonged runs. | [backend/src/services/densityHistoryService.js:83-85](file:///d:/crowd%20sense/backend/src/services/densityHistoryService.js#L83-L85) | Ingestion counter (`insertCounter % 500 === 0`) |
| **Demo Venue Database Seeding** | Seeds default Temple Chariot Procession layout into SQLite upon application startup. | [backend/src/index.js:148](file:///d:/crowd%20sense/backend/src/index.js#L148), [backend/scripts/seedDemoVenue.js:332](file:///d:/crowd%20sense/backend/scripts/seedDemoVenue.js#L332) | Server start delay (500ms) |

---

## 2. API Endpoints

### 2.1 Server Core Routes (`backend/src/index.js`)

#### `GET /health`
- **Purpose:** Service health check and configuration verification.
- **Request Parameters/Body:** None.
- **Response Schema:**
  ```json
  {
    "status": "ok",
    "service": "crowd-safety-backend",
    "optical_flow_enabled": boolean,
    "groq_configured": boolean,
    "timestamp": string (ISO 8601)
  }
  ```
- **Auth/Permissions:** None.
- **Step-by-Step Logic:**
  1. Reads `ENABLE_OPTICAL_FLOW` env var (defaults to `'true'`), parsing case-insensitively ([backend/src/index.js:45](file:///d:/crowd%20sense/backend/src/index.js#L45)).
  2. Evaluates presence of `GROQ_API_KEY` ([backend/src/index.js:46](file:///d:/crowd%20sense/backend/src/index.js#L46)).
  3. Returns HTTP 200 JSON payload with current ISO timestamp ([backend/src/index.js:42-48](file:///d:/crowd%20sense/backend/src/index.js#L42-L48)).
- **Database Tables:** None.
- **Internal Services Called:** None.
- **Known Edge Cases/Validation:** None.
- **File & Lines:** [backend/src/index.js:41-49](file:///d:/crowd%20sense/backend/src/index.js#L41-L49).

---

#### `POST /api/dispatch/simulate`
- **Purpose:** Simulates an emergency siren or dispatch action for demo purposes.
- **Request Parameters/Body:**
  - `action` (`string`, optional): Dispatch action description (defaults to `'SIREN ACTIVATION'`).
  - `zone_id` (`string`, optional): Target zone identifier (defaults to `'zone_1'`).
- **Response Schema:**
  ```json
  {
    "status": "simulated_demo_mode" | "sent",
    "channel": "ui_mock_toast" | "twilio_sms",
    "message": string,
    "zone_id": string,
    "timestamp": string (ISO 8601),
    "is_simulation": boolean
  }
  ```
- **Auth/Permissions:** None.
- **Step-by-Step Logic:**
  1. Extracts `action` and `zone_id` from body, applying fallbacks `'SIREN ACTIVATION'` and `'zone_1'` ([backend/src/index.js:53-57](file:///d:/crowd%20sense/backend/src/index.js#L53-L57)).
  2. Calls `sendEmergencyNotification(...)` ([backend/src/index.js:55-59](file:///d:/crowd%20sense/backend/src/index.js#L55-L59)).
  3. Emits `mock_dispatch_toast` to all connected clients via Socket.io ([backend/src/index.js:61-69](file:///d:/crowd%20sense/backend/src/index.js#L61-L69)).
  4. Returns HTTP 200 with notification result ([backend/src/index.js:71](file:///d:/crowd%20sense/backend/src/index.js#L71)).
- **Database Tables:** None.
- **Internal Services Called:** `sendEmergencyNotification` ([backend/src/services/notifications.js:31](file:///d:/crowd%20sense/backend/src/services/notifications.js#L31)).
- **Known Edge Cases/Validation:** Missing body safely defaults to `{}` ([backend/src/index.js:53](file:///d:/crowd%20sense/backend/src/index.js#L53)). If `io` is not initialized, emits are skipped safely ([backend/src/index.js:61](file:///d:/crowd%20sense/backend/src/index.js#L61)).
- **File & Lines:** [backend/src/index.js:52-72](file:///d:/crowd%20sense/backend/src/index.js#L52-L72).

---

#### `GET /stream/:zone_id`
- **Purpose:** Reverse-proxies MJPEG video stream from CV service on port 5001.
- **Request Parameters/Body:**
  - `zone_id` (`string`, required, path param): Zone identifier (`zone_1` or `zone_2`).
- **Response Schema:** Binary MJPEG stream (`multipart/x-mixed-replace; boundary=frame`).
- **Auth/Permissions:** None.
- **Step-by-Step Logic:**
  1. Initiates outbound HTTP request to `http://127.0.0.1:5001/stream/${zone_id}` ([backend/src/index.js:91-97](file:///d:/crowd%20sense/backend/src/index.js#L91-L97)).
  2. Forwards status code and headers from target, piping stream chunks directly to client response ([backend/src/index.js:98-101](file:///d:/crowd%20sense/backend/src/index.js#L98-L101)).
  3. Catches upstream connection errors with HTTP 503 `"Stream service unavailable"` ([backend/src/index.js:104-106](file:///d:/crowd%20sense/backend/src/index.js#L104-L106)).
  4. On client abort/close, destroys upstream request ([backend/src/index.js:108-110](file:///d:/crowd%20sense/backend/src/index.js#L108-L110)).
- **Database Tables:** None.
- **Internal Services Called:** Upstream HTTP service (`127.0.0.1:5001`).
- **Known Edge Cases/Validation:** Handles stream disconnection and upstream unavailability gracefully without server crash.
- **File & Lines:** [backend/src/index.js:89-113](file:///d:/crowd%20sense/backend/src/index.js#L89-L113).

---

#### `GET *` (Static SPA Fallback)
- **Purpose:** Serves compiled frontend build or `index.html` fallback.
- **Request Parameters/Body:** Wildcard path.
- **Response Schema:** HTML / static assets or JSON error.
- **Auth/Permissions:** None.
- **Step-by-Step Logic:**
  1. Checks if `../../frontend/dist` exists ([backend/src/index.js:117](file:///d:/crowd%20sense/backend/src/index.js#L117)).
  2. Excludes paths starting with `/api`, `/health`, or `/socket.io`, returning HTTP 404 `{ "error": "Endpoint not found" }` ([backend/src/index.js:121-123](file:///d:/crowd%20sense/backend/src/index.js#L121-L123)).
  3. Serves `index.html` for all other routes ([backend/src/index.js:124](file:///d:/crowd%20sense/backend/src/index.js#L124)).
- **Database Tables:** None.
- **Internal Services Called:** None.
- **File & Lines:** [backend/src/index.js:116-126](file:///d:/crowd%20sense/backend/src/index.js#L116-L126).

---

### 2.2 Alert & Audit Routes (`backend/src/routes/alerts.js`)

#### `GET /api/audit-log`
- **Purpose:** Returns historical audit logs, completed playbook checklist steps, and assistant instructions.
- **Request Parameters/Body:**
  - `limit` (`string`/`number`, optional query param): Maximum rows to return per category. Default `50`.
- **Response Schema:**
  ```json
  {
    "logs": [ { "alert_id": string, "zone_id": string, "severity": string, ... } ],
    "playbook_steps": [ { "id": number, "alert_id": string, "step_index": number, "step_text": string, ... } ],
    "assistant_instructions": [ { "instruction_id": string, "zone_id": string, "text": string, ... } ]
  }
  ```
- **Auth/Permissions:** None.
- **Step-by-Step Logic:**
  1. Parses `req.query.limit` (base 10, default 50) ([backend/src/routes/alerts.js:26](file:///d:/crowd%20sense/backend/src/routes/alerts.js#L26)).
  2. Queries `audit_log`, `playbook_step_log`, and `assistant_instructions` tables in parallel ([backend/src/routes/alerts.js:27-29](file:///d:/crowd%20sense/backend/src/routes/alerts.js#L27-L29)).
  3. Returns HTTP 200 with all three collections ([backend/src/routes/alerts.js:30-34](file:///d:/crowd%20sense/backend/src/routes/alerts.js#L30-L34)).
- **Database Tables:** Reads `audit_log` ([backend/src/db/database.js:263-274](file:///d:/crowd%20sense/backend/src/db/database.js#L263-L274)), `playbook_step_log` ([backend/src/db/database.js:581-593](file:///d:/crowd%20sense/backend/src/db/database.js#L581-L593)), `assistant_instructions` ([backend/src/db/database.js:628-644](file:///d:/crowd%20sense/backend/src/db/database.js#L628-L644)).
- **Internal Services Called:** `getAuditLogs`, `getAllPlaybookStepLogsInDb`, `getAssistantInstructions`.
- **Known Edge Cases/Validation:** Catches database errors and returns HTTP 500 `{ "error": "Failed to fetch audit logs" }` ([backend/src/routes/alerts.js:35-38](file:///d:/crowd%20sense/backend/src/routes/alerts.js#L35-L38)).
- **File & Lines:** [backend/src/routes/alerts.js:24-39](file:///d:/crowd%20sense/backend/src/routes/alerts.js#L24-L39).

---

#### `GET /api/alerts/active`
- **Purpose:** Returns currently active in-memory alerts across all zones.
- **Request Parameters/Body:** None.
- **Response Schema:**
  ```json
  {
    "alerts": [
      {
        "alert_id": string,
        "zone_id": string,
        "severity": string,
        "alert_type": string,
        "triggered_at": string,
        "assigned_to": string,
        "acknowledged_at": string | null,
        "acknowledged_by": string | null,
        "escalated_at": string | null,
        "escalated_to": string | null
      }
    ]
  }
  ```
- **Auth/Permissions:** None.
- **Step-by-Step Logic:**
  1. Calls `getActiveAlerts()` which returns all values in `activeZoneAlerts` map ([backend/src/routes/alerts.js:46](file:///d:/crowd%20sense/backend/src/routes/alerts.js#L46), [backend/src/services/escalationManager.js:346-348](file:///d:/crowd%20sense/backend/src/services/escalationManager.js#L346-L348)).
  2. Returns HTTP 200 JSON object ([backend/src/routes/alerts.js:47](file:///d:/crowd%20sense/backend/src/routes/alerts.js#L47)).
- **Database Tables:** None (in-memory Map).
- **Internal Services Called:** `getActiveAlerts` ([backend/src/services/escalationManager.js:346](file:///d:/crowd%20sense/backend/src/services/escalationManager.js#L346)).
- **File & Lines:** [backend/src/routes/alerts.js:45-48](file:///d:/crowd%20sense/backend/src/routes/alerts.js#L45-L48).

---

#### `GET /api/alerts/:id/playbook`
- **Purpose:** Returns static protocol, live resource shortfall evaluation, checklist completion state, and LLM narrative note for an alert.
- **Request Parameters/Body:**
  - `id` (`string`, required path param): Alert ID.
  - `zone_id` (`string`, optional query param): Fallback zone if alert not found in memory/DB. Default `'zone_1'`.
  - `severity` (`string`, optional query param): Fallback severity. Default `'yellow'`.
  - `alert_type` (`string`, optional query param): Fallback alert type. Default `'graduated_escalation'`.
  - `category` (`string`, optional query param): Fallback category for citizen reports.
- **Response Schema:**
  ```json
  {
    "success": true,
    "alert_id": string,
    "zone_id": string,
    "playbook": {
      "id": string,
      "title": string,
      "alert_type": string,
      "severity": string,
      "source": "ndma_guideline" | "illustrative_default",
      "reference_note": string,
      "required_resources": { "personnel": number, "ambulances": number, "evacuation_team": boolean },
      "immediate_actions": string[]
    },
    "shortfall": {
      "zone_id": string,
      "zone_label": string,
      "required_personnel": number,
      "checked_in_personnel": number,
      "is_shortfall": boolean,
      "shortfall_count": number,
      "status_text": string,
      "ambulances": number,
      "evacuation_team": boolean
    },
    "completed_steps": Array,
    "narrative_wrapper": {
      "text": string,
      "source": "groq_llm" | "deterministic_fallback",
      "model": string
    }
  }
  ```
- **Auth/Permissions:** None.
- **Step-by-Step Logic:**
  1. Searches in-memory `activeZoneAlerts` by `alert_id` ([backend/src/routes/alerts.js:59-60](file:///d:/crowd%20sense/backend/src/routes/alerts.js#L59-L60)).
  2. If not found in memory, queries SQLite `audit_log` ([backend/src/routes/alerts.js:61-63](file:///d:/crowd%20sense/backend/src/routes/alerts.js#L61-L63)).
  3. If still not found, constructs fallback envelope from query params ([backend/src/routes/alerts.js:65-74](file:///d:/crowd%20sense/backend/src/routes/alerts.js#L65-L74)).
  4. Deterministically resolves playbook using priority rules: Priority 1: `immediate_panic_alert` -> `cv_panic_red`; Priority 2: `citizen_report` category matching; Priority 3: severity (`red`/`orange`/`yellow`); Default: `cv_graduated_yellow` ([backend/src/routes/alerts.js:77](file:///d:/crowd%20sense/backend/src/routes/alerts.js#L77), [backend/src/services/playbookService.js:32-86](file:///d:/crowd%20sense/backend/src/services/playbookService.js#L32-L86)).
  5. Evaluates live resource shortfall against checked-in responders in target zone ([backend/src/routes/alerts.js:80](file:///d:/crowd%20sense/backend/src/routes/alerts.js#L80), [backend/src/services/playbookService.js:95-120](file:///d:/crowd%20sense/backend/src/services/playbookService.js#L95-L120)).
  6. Reads completed checklist steps from SQLite `playbook_step_log` ([backend/src/routes/alerts.js:83](file:///d:/crowd%20sense/backend/src/routes/alerts.js#L83)).
  7. Fetches current weather state ([backend/src/routes/alerts.js:86](file:///d:/crowd%20sense/backend/src/routes/alerts.js#L86)).
  8. Calls `generateContextualNarrative(...)` using Groq REST API (models: `qwen/qwen3.8-27b`, `qwen/qwen3.6-27b`, `openai/gpt-oss-20b` with 15s timeout) or fallback ([backend/src/routes/alerts.js:89-94](file:///d:/crowd%20sense/backend/src/routes/alerts.js#L89-L94), [backend/src/services/groqPlaybookService.js:98-191](file:///d:/crowd%20sense/backend/src/services/groqPlaybookService.js#L98-L191)).
  9. Returns HTTP 200 ([backend/src/routes/alerts.js:96-108](file:///d:/crowd%20sense/backend/src/routes/alerts.js#L96-L108)).
- **Database Tables:** Reads `audit_log` (if not in memory) and `playbook_step_log`.
- **Internal Services Called:** `getActiveAlerts`, `getAlertById`, `getPlaybookForAlert`, `evaluateResourceShortfall`, `getCompletedSteps`, `getWeatherState`, `generateContextualNarrative`.
- **Known Edge Cases/Validation:** Missing alerts seamlessly fallback to synthetic envelope. API failure in LLM defaults to deterministic text without failing response.
- **File & Lines:** [backend/src/routes/alerts.js:55-113](file:///d:/crowd%20sense/backend/src/routes/alerts.js#L55-L113).

---

#### `POST /api/alerts/:id/playbook-step`
- **Purpose:** Records completion of an action checklist step into audit log and broadcasts update via WebSocket.
- **Request Parameters/Body:**
  - `id` (`string`, required path param): Alert ID.
  - `step_index` (`number`, required body param): 0-indexed step number.
  - `step_text` (`string`, required body param): Text of the action step.
  - `completed_by` (`string`, optional body param): Official identifier (defaults to `'official_1'`).
- **Response Schema:**
  ```json
  {
    "success": true,
    "step": {
      "id": number,
      "alert_id": string,
      "step_index": number,
      "step_text": string,
      "completed_at": string (ISO 8601),
      "completed_by": string
    }
  }
  ```
- **Auth/Permissions:** None.
- **Step-by-Step Logic:**
  1. Validates that `step_index !== undefined` and `step_text` is non-empty; returns HTTP 400 otherwise ([backend/src/routes/alerts.js:125-127](file:///d:/crowd%20sense/backend/src/routes/alerts.js#L125-L127)).
  2. Inserts row into `playbook_step_log` table ([backend/src/services/playbookService.js:133](file:///d:/crowd%20sense/backend/src/services/playbookService.js#L133), [backend/src/db/database.js:537-553](file:///d:/crowd%20sense/backend/src/db/database.js#L537-L553)).
  3. Emits `playbook_step_completed` event with record over Socket.io ([backend/src/services/playbookService.js:136-138](file:///d:/crowd%20sense/backend/src/services/playbookService.js#L136-L138)).
  4. Returns HTTP 200 with recorded step ([backend/src/routes/alerts.js:137](file:///d:/crowd%20sense/backend/src/routes/alerts.js#L137)).
- **Database Tables:** Writes `playbook_step_log`.
- **Internal Services Called:** `recordPlaybookStep` ([backend/src/services/playbookService.js:132](file:///d:/crowd%20sense/backend/src/services/playbookService.js#L132)).
- **Known Edge Cases/Validation:** Rejects missing `step_index` or empty `step_text` with HTTP 400 ([backend/src/routes/alerts.js:126](file:///d:/crowd%20sense/backend/src/routes/alerts.js#L126)).
- **File & Lines:** [backend/src/routes/alerts.js:120-142](file:///d:/crowd%20sense/backend/src/routes/alerts.js#L120-L142).

---

#### `POST /api/alerts/:id/acknowledge`
- **Purpose:** Acknowledges an active alert, halts the auto-escalation timer, and updates audit records.
- **Request Parameters/Body:**
  - `id` (`string`, required path param): Alert ID.
  - `acknowledged_by` (`string`, optional body param): Operator identity. Defaults to `'official_1'`.
- **Response Schema:**
  ```json
  {
    "success": true,
    "alert": {
      "alert_id": string,
      "zone_id": string,
      "severity": string,
      "alert_type": string,
      "triggered_at": string,
      "acknowledged_at": string,
      "acknowledged_by": string,
      "escalated_at": string | null,
      "escalated_to": string | null,
      ...
    }
  }
  ```
- **Auth/Permissions:** None.
- **Step-by-Step Logic:**
  1. Cancels active auto-escalation timer for `alertId` in `activeTimers` map ([backend/src/services/escalationManager.js:260-263](file:///d:/crowd%20sense/backend/src/services/escalationManager.js#L260-L263)).
  2. Updates SQLite `audit_log` setting `acknowledged_at` and `acknowledged_by` WHERE `alert_id = ?` AND `acknowledged_at IS NULL` ([backend/src/db/database.js:203-217](file:///d:/crowd%20sense/backend/src/db/database.js#L203-L217)).
  3. If no row updated, returns `null` which yields HTTP 404 ([backend/src/routes/alerts.js:156](file:///d:/crowd%20sense/backend/src/routes/alerts.js#L156)).
  4. Updates in-memory `activeZoneAlerts` map ([backend/src/services/escalationManager.js:270-274](file:///d:/crowd%20sense/backend/src/services/escalationManager.js#L270-L274)).
  5. Emits `alert_acknowledged` event over Socket.io ([backend/src/services/escalationManager.js:276-278](file:///d:/crowd%20sense/backend/src/services/escalationManager.js#L276-L278)).
  6. Returns HTTP 200 ([backend/src/routes/alerts.js:158](file:///d:/crowd%20sense/backend/src/routes/alerts.js#L158)).
- **Database Tables:** Updates `audit_log`.
- **Internal Services Called:** `acknowledgeAlert` ([backend/src/services/escalationManager.js:259](file:///d:/crowd%20sense/backend/src/services/escalationManager.js#L259)), `acknowledgeAlertInDb` ([backend/src/db/database.js:200](file:///d:/crowd%20sense/backend/src/db/database.js#L200)).
- **Known Edge Cases/Validation:** Returns HTTP 404 if alert was not found or was already acknowledged ([backend/src/routes/alerts.js:156](file:///d:/crowd%20sense/backend/src/routes/alerts.js#L156)).
- **File & Lines:** [backend/src/routes/alerts.js:148-163](file:///d:/crowd%20sense/backend/src/routes/alerts.js#L148-L163).

---

#### `POST /api/alerts/:id/status`
- **Purpose:** Updates responder operational status on an alert.
- **Request Parameters/Body:**
  - `id` (`string`, required path param): Alert ID.
  - `status` (`string`, required body param): Must be one of `['en_route', 'on_scene', 'resolved', 'need_backup']`.
  - `responder_id` (`string`, optional body param): Responder identity string. Defaults to `'unknown_responder'`.
- **Response Schema:**
  ```json
  {
    "success": true,
    "alert": {
      "alert_id": string,
      "responder_status": string,
      "acknowledged_by": string,
      ...
    }
  }
  ```
- **Auth/Permissions:** None.
- **Step-by-Step Logic:**
  1. Validates `status` against enum `['en_route', 'on_scene', 'resolved', 'need_backup']`; returns HTTP 400 if invalid ([backend/src/routes/alerts.js:180-184](file:///d:/crowd%20sense/backend/src/routes/alerts.js#L180-L184)).
  2. Updates SQLite `audit_log` setting `responder_status = ?` and `acknowledged_by = COALESCE(?, acknowledged_by)` ([backend/src/db/database.js:291-296](file:///d:/crowd%20sense/backend/src/db/database.js#L291-L296)).
  3. Updates in-memory `activeZoneAlerts` map ([backend/src/services/escalationManager.js:326-330](file:///d:/crowd%20sense/backend/src/services/escalationManager.js#L326-L330)).
  4. Emits `alert_status_updated` event over Socket.io ([backend/src/services/escalationManager.js:332](file:///d:/crowd%20sense/backend/src/services/escalationManager.js#L332)).
  5. Returns HTTP 200 with updated alert ([backend/src/routes/alerts.js:191](file:///d:/crowd%20sense/backend/src/routes/alerts.js#L191)).
- **Database Tables:** Updates `audit_log`.
- **Internal Services Called:** `updateAlertStatus` ([backend/src/services/escalationManager.js:321](file:///d:/crowd%20sense/backend/src/services/escalationManager.js#L321)), `updateResponderStatus` ([backend/src/db/database.js:285](file:///d:/crowd%20sense/backend/src/db/database.js#L285)).
- **Known Edge Cases/Validation:** Returns HTTP 400 for unknown statuses ([backend/src/routes/alerts.js:181](file:///d:/crowd%20sense/backend/src/routes/alerts.js#L181)). Returns HTTP 404 if alert ID does not exist ([backend/src/routes/alerts.js:189](file:///d:/crowd%20sense/backend/src/routes/alerts.js#L189)).
- **File & Lines:** [backend/src/routes/alerts.js:175-196](file:///d:/crowd%20sense/backend/src/routes/alerts.js#L175-L196).

---

### 2.3 Assistant Routes (`backend/src/routes/assistant.js`)

#### `POST /api/assistant/ask`
- **Purpose:** Answers operational questions grounded in live zone telemetry, gate states, active alerts, and weather conditions.
- **Request Parameters/Body:**
  - `question` (`string`, required body param): Question string.
  - `zoneId` (`string`, optional body param): Target zone filter.
- **Response Schema:**
  ```json
  {
    "answer": string,
    "source": "local_deterministic" | "groq_llm" | "deterministic_fallback" | "validation_fallback",
    "model": string
  }
  ```
- **Auth/Permissions:** None.
- **Step-by-Step Logic:**
  1. Validates that `question` is a non-empty string ([backend/src/routes/assistant.js:112-117](file:///d:/crowd%20sense/backend/src/routes/assistant.js#L112-L117)).
  2. Gathers live operational context (zones from `liveZoneCache`, weather state, gate states) ([backend/src/routes/assistant.js:120](file:///d:/crowd%20sense/backend/src/routes/assistant.js#L120), [backend/src/services/controlRoomAssistant.js:371-402](file:///d:/crowd%20sense/backend/src/services/controlRoomAssistant.js#L371-L402)).
  3. Gathers active unresolved alerts ([backend/src/routes/assistant.js:121](file:///d:/crowd%20sense/backend/src/routes/assistant.js#L121)).
  4. Matches live rules for all active zones to discover recommended actions ([backend/src/routes/assistant.js:124-139](file:///d:/crowd%20sense/backend/src/routes/assistant.js#L124-L139)).
  5. If `ASSISTANT_LOCAL_MODE=true`, invokes `synthesizeLocalAnswer(...)` directly and returns HTTP 200 without external API call ([backend/src/routes/assistant.js:157-165](file:///d:/crowd%20sense/backend/src/routes/assistant.js#L157-L165)).
  6. If `GROQ_API_KEY` is missing or placeholder, executes `synthesizeLocalAnswer(...)` fallback ([backend/src/routes/assistant.js:167-175](file:///d:/crowd%20sense/backend/src/routes/assistant.js#L167-L175)).
  7. Attempts Groq API completion across candidate models (`qwen/qwen3.8-27b`, `qwen/qwen3.6-27b`, `openai/gpt-oss-20b`) with a strict 4.0s timeout per attempt ([backend/src/routes/assistant.js:179-223](file:///d:/crowd%20sense/backend/src/routes/assistant.js#L179-L223)).
  8. Cleans thinking tags and returns HTTP 200 on success ([backend/src/routes/assistant.js:210-218](file:///d:/crowd%20sense/backend/src/routes/assistant.js#L210-L218)).
  9. If all models fail/timeout, returns HTTP 200 with deterministic answer via `synthesizeLocalAnswer` ([backend/src/routes/assistant.js:226-231](file:///d:/crowd%20sense/backend/src/routes/assistant.js#L226-L231)).
- **Database Tables:** None.
- **Internal Services Called:** `getLiveOperationalContext`, `getActiveAlerts`, `matchLiveRules`, `cleanAssistantText`, `synthesizeLocalAnswer`.
- **Known Edge Cases/Validation:** Never returns HTTP 500 or crashes UI; always degrades to HTTP 200 with local deterministic response.
- **File & Lines:** [backend/src/routes/assistant.js:109-232](file:///d:/crowd%20sense/backend/src/routes/assistant.js#L109-L232).

---

#### `GET /api/assistant/instructions`
- **Purpose:** Fetches recent generated push instructions from the audit log.
- **Request Parameters/Body:**
  - `limit` (`string`/`number`, optional query param): Maximum instructions to return. Default `50`.
- **Response Schema:**
  ```json
  {
    "instructions": [
      {
        "instruction_id": string,
        "triggering_alert_id": string | null,
        "zone_id": string,
        "text": string,
        "severity": string,
        "event_type": string,
        "generated_at": string,
        "source": string
      }
    ]
  }
  ```
- **Auth/Permissions:** None.
- **Step-by-Step Logic:**
  1. Parses limit (default 50) ([backend/src/routes/assistant.js:240](file:///d:/crowd%20sense/backend/src/routes/assistant.js#L240)).
  2. Queries `assistant_instructions` table in SQLite ordered by `generated_at DESC` ([backend/src/routes/assistant.js:241](file:///d:/crowd%20sense/backend/src/routes/assistant.js#L241), [backend/src/db/database.js:632-644](file:///d:/crowd%20sense/backend/src/db/database.js#L632-L644)).
  3. Returns HTTP 200 JSON ([backend/src/routes/assistant.js:242](file:///d:/crowd%20sense/backend/src/routes/assistant.js#L242)).
- **Database Tables:** Reads `assistant_instructions`.
- **Internal Services Called:** `getAssistantInstructions`.
- **File & Lines:** [backend/src/routes/assistant.js:238-247](file:///d:/crowd%20sense/backend/src/routes/assistant.js#L238-L247).

---

### 2.4 Citizen Emergency Routes (`backend/src/routes/citizenReports.js`)

#### `POST /api/citizen-reports`
- **Purpose:** Submits an SOS / citizen emergency incident report into the unified alert pipeline.
- **Request Parameters/Body:**
  - `category` (`string`, required body param): Must be one of `['MEDICAL_ASSISTANCE', 'SUSPICIOUS_ACTIVITY', 'REPORT_THEFT', 'BLOCKED_EXITS', 'STAMPEDE_RISK', 'MEDICAL_EMERGENCY', 'BLOCKED_EXIT', 'GENERAL_PANIC']`.
  - `zone_id` (`string`, optional body param): Target zone. Validated as `'zone_2'` if equal, else defaults to `'zone_1'`.
  - `description` (`string`, optional body param): Report narrative.
  - `reporter_name` (`string`, optional body param): Name of reporter (defaults to `'Anonymous Citizen'`).
- **Response Schema:**
  ```json
  {
    "success": true,
    "alert": {
      "alert_id": string,
      "zone_id": string,
      "severity": "red" | "orange",
      "alert_type": "citizen_report",
      "triggered_at": string,
      "assigned_to": "all_officials",
      "category": string,
      "description": string,
      "reporter_name": string
    }
  }
  ```
- **Auth/Permissions:** None.
- **Step-by-Step Logic:**
  1. Validates `category` against `VALID_CATEGORIES` list; returns HTTP 400 if invalid ([backend/src/routes/citizenReports.js:35-39](file:///d:/crowd%20sense/backend/src/routes/citizenReports.js#L35-L39)).
  2. Normalizes `zone_id`: `zone_id === 'zone_2' ? 'zone_2' : 'zone_1'` ([backend/src/routes/citizenReports.js:41](file:///d:/crowd%20sense/backend/src/routes/citizenReports.js#L41)).
  3. Sets severity: if `category === 'STAMPEDE_RISK'` or `'GENERAL_PANIC'`, assigns `'red'`; otherwise assigns `'orange'` ([backend/src/routes/citizenReports.js:45-50](file:///d:/crowd%20sense/backend/src/routes/citizenReports.js#L45-L50)).
  4. Constructs alert record with `alert_type: 'citizen_report'`, `assigned_to: 'all_officials'` ([backend/src/routes/citizenReports.js:47-61](file:///d:/crowd%20sense/backend/src/routes/citizenReports.js#L47-L61)).
  5. Calls `registerCustomAlert(...)`: stores in `activeZoneAlerts` map, inserts into SQLite `audit_log`, emits `alert_triggered`, and triggers assistant push evaluation ([backend/src/routes/citizenReports.js:66](file:///d:/crowd%20sense/backend/src/routes/citizenReports.js#L66), [backend/src/services/escalationManager.js:295-308](file:///d:/crowd%20sense/backend/src/services/escalationManager.js#L295-L308)).
  6. Emits `mock_dispatch_toast` to all connected clients ([backend/src/routes/citizenReports.js:69-76](file:///d:/crowd%20sense/backend/src/routes/citizenReports.js#L69-L76)).
  7. Returns HTTP 200 with created alert ([backend/src/routes/citizenReports.js:82](file:///d:/crowd%20sense/backend/src/routes/citizenReports.js#L82)).
- **Database Tables:** Writes `audit_log` via `insertAlert`.
- **Internal Services Called:** `registerCustomAlert`, `handleAlertEvent`.
- **Known Edge Cases/Validation:** Invalid category rejected with HTTP 400 ([backend/src/routes/citizenReports.js:36](file:///d:/crowd%20sense/backend/src/routes/citizenReports.js#L36)). Unrecognized zones coerced to `zone_1` ([backend/src/routes/citizenReports.js:41](file:///d:/crowd%20sense/backend/src/routes/citizenReports.js#L41)).
- **File & Lines:** [backend/src/routes/citizenReports.js:32-87](file:///d:/crowd%20sense/backend/src/routes/citizenReports.js#L32-L87).

---

### 2.5 Environmental Conditions Routes (`backend/src/routes/conditions.js`)

#### `GET /api/conditions/current`
- **Purpose:** Returns the current simulated environmental condition state.
- **Request Parameters/Body:** None.
- **Response Schema:**
  ```json
  {
    "condition": "clear" | "extreme_heat" | "heavy_rain" | "hot_and_rainy",
    "label": string,
    "temperature_c": number,
    "precipitation_mm": number,
    "heat_index_c": number,
    "density_factor": number,
    "flow_factor": number,
    "cv_confidence": number,
    "is_simulated": true,
    "updated_at": string (ISO 8601)
  }
  ```
- **Auth/Permissions:** None.
- **Step-by-Step Logic:**
  1. Calls `getWeatherState()` and returns in-memory state object with HTTP 200 ([backend/src/routes/conditions.js:16](file:///d:/crowd%20sense/backend/src/routes/conditions.js#L16), [backend/src/services/weatherService.js:71-73](file:///d:/crowd%20sense/backend/src/services/weatherService.js#L71-L73)).
- **Database Tables:** None.
- **Internal Services Called:** `getWeatherState`.
- **File & Lines:** [backend/src/routes/conditions.js:15-17](file:///d:/crowd%20sense/backend/src/routes/conditions.js#L15-L17).

---

#### `POST /api/conditions/set`
- **Purpose:** Sets the environmental condition preset and optional parameter overrides.
- **Request Parameters/Body:**
  - `condition` (`string`, required body param): One of `'clear'`, `'extreme_heat'`, `'heavy_rain'`, `'hot_and_rainy'`.
  - `temperature_c` (`number`, optional body param): Temperature override in Celsius.
  - `precipitation_mm` (`number`, optional body param): Precipitation override in mm.
- **Response Schema:**
  ```json
  {
    "success": true,
    "state": { ...weatherState }
  }
  ```
- **Auth/Permissions:** None.
- **Step-by-Step Logic:**
  1. Validates `condition` exists in `PRESETS`; returns HTTP 400 if invalid ([backend/src/routes/conditions.js:27-31](file:///d:/crowd%20sense/backend/src/routes/conditions.js#L27-L31)).
  2. Calls `setWeatherState(...)`, updating in-memory `currentState` and appending to `weatherHistory` transition log ([backend/src/routes/conditions.js:33](file:///d:/crowd%20sense/backend/src/routes/conditions.js#L33), [backend/src/services/weatherService.js:80-99](file:///d:/crowd%20sense/backend/src/services/weatherService.js#L80-L99)).
  3. Emits `conditions_updated` event over Socket.io ([backend/src/routes/conditions.js:37](file:///d:/crowd%20sense/backend/src/routes/conditions.js#L37)).
  4. Returns HTTP 200 with updated state ([backend/src/routes/conditions.js:42-45](file:///d:/crowd%20sense/backend/src/routes/conditions.js#L42-L45)).
- **Database Tables:** None.
- **Internal Services Called:** `setWeatherState`.
- **Known Edge Cases/Validation:** Returns HTTP 400 listing valid presets if invalid condition supplied ([backend/src/routes/conditions.js:28-30](file:///d:/crowd%20sense/backend/src/routes/conditions.js#L28-L30)).
- **File & Lines:** [backend/src/routes/conditions.js:24-46](file:///d:/crowd%20sense/backend/src/routes/conditions.js#L24-L46).

---

### 2.6 Density Ingestion Route (`backend/src/routes/density.js`)

#### `POST /api/density`
- **Purpose:** Ingests live density readings from CV service, evaluates trend and risk scores, controls escalation, persists history, and broadcasts real-time telemetry.
- **Request Parameters/Body Schema:**
  - `zone_id` (`string`, required): e.g. `'zone_1'`, `'zone_2'`.
  - `zone_type` (`string`, required): `'general'` or `'corridor'`.
  - `people_count` (`integer`, required): Detected person count.
  - `area_sqm` (`number`, required): Zone area in square meters.
  - `density` (`number`, required): Density in people/m².
  - `flow_convergence` (`number`, required): Optical flow convergence metric.
  - `flow_turbulence` (`number`, required): Optical flow turbulence metric.
  - `timestamp` (`string`, required): ISO 8601 timestamp.
  - `panic_signature` (`boolean`, optional): Stampede/chaotic motion boolean flag.
  - `exodus_signature` (`boolean`, optional): Mass flee / fire evacuation coherent motion flag.
  - `feed_source` (`string`, optional): `'live_webcam'` | `'pre_recorded'`.
  - `camera_type` (`string`, optional): `'drone'` | `'cctv'`.
  - `density_source` (`string`, optional): `'detection'` | `'soft_csrnet'`.
  - `saturated` (`boolean`, optional): Density saturation override indicator.
- **Response Schema:**
  ```json
  {
    "received": true,
    "processed": {
      "zone_id": string,
      "zone_type": string,
      "feed_source": string,
      "camera_type": string,
      "risk_level": "green" | "yellow" | "orange" | "red",
      "risk_score": number,
      "density": number,
      "density_norm": number,
      "trend_slope": number,
      "trend_norm": number,
      "flow_convergence": number,
      "flow_turbulence": number,
      "panic_signature": boolean,
      "exodus_signature": boolean,
      "behavioral_trigger": "panic" | "exodus" | null,
      "eta_to_red_min": number | null,
      "red_threshold": number,
      "base_red_threshold": number,
      "timestamp": string,
      "people_count": number,
      "area_sqm": number,
      "density_source": string,
      "saturated": boolean,
      "weather_modifier": { ... },
      "cv_confidence": number,
      "breakdown": { ... },
      "history": [ { "density": number, "timestamp": number } ]
    }
  }
  ```
- **Auth/Permissions:** None.
- **Step-by-Step Logic:**
  1. Enforces required fields (`zone_id`, `zone_type`, `people_count`, `area_sqm`, `density`, `flow_convergence`, `flow_turbulence`, `timestamp`). Returns HTTP 400 if any missing ([backend/src/routes/density.js:32-39](file:///d:/crowd%20sense/backend/src/routes/density.js#L32-L39)).
  2. Calls `updateAndGetTrendSlope(zone_id, density)` to calculate rate-of-rise slope over rolling 60s history window ([backend/src/routes/density.js:44](file:///d:/crowd%20sense/backend/src/routes/density.js#L44), [backend/src/services/riskEngine.js:30-60](file:///d:/crowd%20sense/backend/src/services/riskEngine.js#L30-L60)).
  3. Calls `computeRiskScore(...)` ([backend/src/routes/density.js:49-58](file:///d:/crowd%20sense/backend/src/routes/density.js#L49-L58), [backend/src/services/riskEngine.js:64-187](file:///d:/crowd%20sense/backend/src/services/riskEngine.js#L64-L187)):
     - Resolves base red density threshold from `zone_type` (`general`: 3.5, `corridor`: 2.0).
     - Applies weather `density_factor` (tightens threshold by 25% under extreme heat: factor `0.75`).
     - Applies weather `flow_factor` (scales convergence/turbulence sensitivity by 1.5x under heavy rain).
     - Normalizes: `density_norm = density / effectiveRedThreshold`, `trend_norm = trend_slope / 2.0`, `conv_norm = flow_convergence * flowFactor`, `turb_norm = flow_turbulence * flowFactor`.
     - Computes composite risk score:
       - If `ENABLE_OPTICAL_FLOW=true`: `rawScore = (density_norm * 0.50) + (trend_norm * 0.30) + (conv_norm * 0.10) + (turb_norm * 0.10)`.
       - If `ENABLE_OPTICAL_FLOW=false`: `rawScore = (density_norm * 0.70) + (trend_norm * 0.30)`.
     - Assigns risk level: `score >= orange` -> `'red'`, `score >= yellow` -> `'orange'`, `score >= green` -> `'yellow'`, else `'green'`.
     - Turbulence fast path: if `turb_norm > 0.88`, raises level by one band (green->yellow, yellow->orange).
     - Behavioral panic bypass: if `panic_signature || exodus_signature`, forces `risk_score = max(score, 0.90)` and `risk_level = 'red'`.
     - Linear ETA to red calculation: `(effectiveRedThreshold - density) / trend_slope`.
  4. Records snapshot to SQLite `density_history` table via `recordDensitySnapshot(...)` ([backend/src/routes/density.js:61-70](file:///d:/crowd%20sense/backend/src/routes/density.js#L61-L70), [backend/src/services/densityHistoryService.js:29-89](file:///d:/crowd%20sense/backend/src/services/densityHistoryService.js#L29-L89)).
  5. Calls `processZoneAlerts(riskResult, payload, io)`:
     - Evaluates panic condition: `panic_signature || exodus_signature || (flow_turbulence >= 0.70 && density >= 1.5) || density >= 4.5 || (trend_slope >= 2.0 && density >= 2.0)`.
     - Checks confirmation buffer (`PANIC_CONFIRM_FRAMES`, default 2 consecutive frames). While building, emits `panic_confirming` ([backend/src/services/escalationManager.js:103-116](file:///d:/crowd%20sense/backend/src/services/escalationManager.js#L103-L116)).
     - If confirmed, creates immediate panic alert, persists to `audit_log`, emits `alert_triggered`, `alert_panic`, `mock_dispatch_toast`, and notifies assistant ([backend/src/services/escalationManager.js:118-176](file:///d:/crowd%20sense/backend/src/services/escalationManager.js#L118-L176)).
     - If standard Red Alert, creates graduated escalation alert, persists to `audit_log`, emits `alert_triggered`, and starts `setTimeout` for auto-escalation in `ESCALATION_TIMEOUT_SEC` (30s) ([backend/src/services/escalationManager.js:179-221](file:///d:/crowd%20sense/backend/src/services/escalationManager.js#L179-L221)).
     - If zone drops to green/yellow and was acknowledged, clears from active map ([backend/src/services/escalationManager.js:222-231](file:///d:/crowd%20sense/backend/src/services/escalationManager.js#L222-L231)).
  6. Emits `density_update` event with complete payload to all Socket.io clients ([backend/src/routes/density.js:115](file:///d:/crowd%20sense/backend/src/routes/density.js#L115)).
  7. Calls `handleDensityReading(...)` to update assistant live context and evaluate threshold crossings ([backend/src/routes/density.js:119](file:///d:/crowd%20sense/backend/src/routes/density.js#L119), [backend/src/services/controlRoomAssistant.js:288-325](file:///d:/crowd%20sense/backend/src/services/controlRoomAssistant.js#L288-L325)).
  8. Returns HTTP 200 with processed payload ([backend/src/routes/density.js:121](file:///d:/crowd%20sense/backend/src/routes/density.js#L121)).
- **Database Tables:** Writes `density_history` and (when alert triggers) `audit_log`.
- **Internal Services Called:** `updateAndGetTrendSlope`, `getWeatherState`, `computeRiskScore`, `recordDensitySnapshot`, `processZoneAlerts`, `handleDensityReading`.
- **Known Edge Cases/Validation:** Missing contract fields rejected with HTTP 400 ([backend/src/routes/density.js:35](file:///d:/crowd%20sense/backend/src/routes/density.js#L35)). Single-frame transient spikes suppressed by `PANIC_CONFIRM_FRAMES` ([backend/src/services/escalationManager.js:98-100](file:///d:/crowd%20sense/backend/src/services/escalationManager.js#L98-L100)). Stale panic alerts auto-expire after `PANIC_ALERT_TTL_MS` (20s) ([backend/src/services/escalationManager.js:69-76](file:///d:/crowd%20sense/backend/src/services/escalationManager.js#L69-L76)).
- **File & Lines:** [backend/src/routes/density.js:28-125](file:///d:/crowd%20sense/backend/src/routes/density.js#L28-L125).

---

### 2.7 Pipeline Control Routes (`backend/src/routes/pipeline.js`)

#### `GET /api/pipeline/status`
- **Purpose:** Returns current execution status of CV data pipeline.
- **Request Parameters/Body:** None.
- **Response Schema:**
  ```json
  {
    "active": boolean,
    "paused_at": string (ISO 8601) | null,
    "last_updated": string (ISO 8601)
  }
  ```
- **Auth/Permissions:** None.
- **Step-by-Step Logic:**
  1. Calls `getPipelineState()` which returns clone of in-memory `pipelineState` object ([backend/src/routes/pipeline.js:16](file:///d:/crowd%20sense/backend/src/routes/pipeline.js#L16), [backend/src/services/pipelineService.js:20-22](file:///d:/crowd%20sense/backend/src/services/pipelineService.js#L20-L22)).
  2. Returns HTTP 200 JSON ([backend/src/routes/pipeline.js:16](file:///d:/crowd%20sense/backend/src/routes/pipeline.js#L16)).
- **Database Tables:** None.
- **Internal Services Called:** `getPipelineState`.
- **File & Lines:** [backend/src/routes/pipeline.js:15-17](file:///d:/crowd%20sense/backend/src/routes/pipeline.js#L15-L17).

---

#### `POST /api/pipeline/toggle`
- **Purpose:** Toggles pipeline execution state between active and paused.
- **Request Parameters/Body:** None.
- **Response Schema:** Same as `GET /api/pipeline/status`.
- **Auth/Permissions:** None.
- **Step-by-Step Logic:**
  1. Inverts `pipelineState.active` ([backend/src/routes/pipeline.js:24](file:///d:/crowd%20sense/backend/src/routes/pipeline.js#L24), [backend/src/services/pipelineService.js:34-36](file:///d:/crowd%20sense/backend/src/services/pipelineService.js#L34-L36)).
  2. Emits `pipeline_status_updated` over Socket.io ([backend/src/routes/pipeline.js:27](file:///d:/crowd%20sense/backend/src/routes/pipeline.js#L27)).
  3. Returns HTTP 200 with new state ([backend/src/routes/pipeline.js:30](file:///d:/crowd%20sense/backend/src/routes/pipeline.js#L30)).
- **Database Tables:** None.
- **Internal Services Called:** `togglePipelineState`.
- **File & Lines:** [backend/src/routes/pipeline.js:23-31](file:///d:/crowd%20sense/backend/src/routes/pipeline.js#L23-L31).

---

#### `POST /api/pipeline/set`
- **Purpose:** Explicitly sets pipeline execution state to active (true) or paused (false).
- **Request Parameters/Body:**
  - `active` (`boolean`, optional body param): Target state. Defaults to `true` if undefined.
- **Response Schema:** Same as `GET /api/pipeline/status`.
- **Auth/Permissions:** None.
- **Step-by-Step Logic:**
  1. Extracts `active` parameter, defaulting to `true` ([backend/src/routes/pipeline.js:38-39](file:///d:/crowd%20sense/backend/src/routes/pipeline.js#L38-L39)).
  2. Updates `pipelineState` ([backend/src/services/pipelineService.js:24-32](file:///d:/crowd%20sense/backend/src/services/pipelineService.js#L24-L32)).
  3. Emits `pipeline_status_updated` over Socket.io ([backend/src/routes/pipeline.js:42](file:///d:/crowd%20sense/backend/src/routes/pipeline.js#L42)).
  4. Returns HTTP 200 with updated state ([backend/src/routes/pipeline.js:45](file:///d:/crowd%20sense/backend/src/routes/pipeline.js#L45)).
- **Database Tables:** None.
- **Internal Services Called:** `setPipelineState`.
- **File & Lines:** [backend/src/routes/pipeline.js:37-46](file:///d:/crowd%20sense/backend/src/routes/pipeline.js#L37-L46).

---

### 2.8 Planner Routes (`backend/src/routes/planner.js`)

#### `POST /api/planner/narrate-report`
- **Purpose:** Synthesizes pre-event bottleneck simulation results into an authoritative 5-section structural safety report using Gemini LLM (or deterministic fallback).
- **Request Parameters/Body:**
  - `bottleneckResults` (`object`, required): Pre-computed spatial bottleneck analysis.
  - `recommendations` (`array`, required): Matched NDMA recommendations.
  - `venueName` (`string`, optional): Venue name.
  - `scenarioLabels` (`string[]`, optional): Scenarios evaluated.
  - `eventContext` (`object`, optional): Attendance, gates, width, area.
- **Response Schema:**
  ```json
  {
    "success": boolean,
    "narration": string,
    "model": string,
    "source": "gemini_llm" | "local_synthesis"
  }
  ```
- **Auth/Permissions:** None.
- **Step-by-Step Logic:**
  1. Validates that `bottleneckResults` and `recommendations` are present; returns HTTP 400 if missing ([backend/src/routes/planner.js:36-38](file:///d:/crowd%20sense/backend/src/routes/planner.js#L36-L38)).
  2. Builds compact prompt payload (strips raw Float32Array grids) containing top 6 persistent and conditional bottlenecks ([backend/src/routes/planner.js:41-80](file:///d:/crowd%20sense/backend/src/routes/planner.js#L41-L80)).
  3. Calls `generatePlannerNarration(...)` ([backend/src/services/geminiPlannerService.js:237-247](file:///d:/crowd%20sense/backend/src/services/geminiPlannerService.js#L237-L247)):
     - Attempts Gemini API call across candidate models (`gemini-3.7-flash`, `gemini-3.6-flash`, `gemini-3.5-flash`, `gemini-3-flash-preview`, `gemini-3-flash`) with 45s timeout ([backend/src/services/geminiPlannerService.js:85-159](file:///d:/crowd%20sense/backend/src/services/geminiPlannerService.js#L85-L159)).
     - Cleans reasoning tags and enforces 5-section structure: Section 1 (Capacity Limits), Section 2 (Ingress/Egress Physics), Section 3 (Bottleneck Diagnostics), Section 4 (Stress Conditions), Section 5 (NDMA Directives).
     - If Gemini API fails or key is missing, invokes `generateLocalDeterministicPlannerSummary(...)` to construct an honest report directly from mathematical values ([backend/src/services/geminiPlannerService.js:165-231](file:///d:/crowd%20sense/backend/src/services/geminiPlannerService.js#L165-L231)).
  4. Returns HTTP 200 with narration ([backend/src/routes/planner.js:84-89](file:///d:/crowd%20sense/backend/src/routes/planner.js#L84-L89)).
- **Database Tables:** None.
- **Internal Services Called:** `generatePlannerNarration`, `callGeminiPlanner`, `generateLocalDeterministicPlannerSummary`.
- **Known Edge Cases/Validation:** Missing inputs return HTTP 400 ([backend/src/routes/planner.js:37](file:///d:/crowd%20sense/backend/src/routes/planner.js#L37)). LLM errors fall back to local deterministic synthesis with HTTP 200 ([backend/src/services/geminiPlannerService.js:246](file:///d:/crowd%20sense/backend/src/services/geminiPlannerService.js#L246)).
- **File & Lines:** [backend/src/routes/planner.js:33-98](file:///d:/crowd%20sense/backend/src/routes/planner.js#L33-L98).

---

### 2.9 Post-Event Timeline Route (`backend/src/routes/postEvent.js`)

#### `GET /api/post-event-timeline`
- **Purpose:** Returns historical alert milestones and summary statistics for post-event review.
- **Request Parameters/Body:**
  - `zone_id` (`string`, optional query param): Filter by zone or `'all'`. Defaults to `'zone_1'`.
- **Response Schema:**
  ```json
  {
    "zone_id": string,
    "generated_at": string (ISO 8601),
    "alerts": Array,
    "summary": {
      "total_alerts": number,
      "panic_alerts": number,
      "escalated_alerts": number,
      "acknowledged_alerts": number
    }
  }
  ```
- **Auth/Permissions:** None.
- **Step-by-Step Logic:**
  1. Reads `zone_id` query param (default `'zone_1'`) ([backend/src/routes/postEvent.js:20](file:///d:/crowd%20sense/backend/src/routes/postEvent.js#L20)).
  2. Queries recent 100 audit logs from SQLite ([backend/src/routes/postEvent.js:21](file:///d:/crowd%20sense/backend/src/routes/postEvent.js#L21)).
  3. Filters logs where `zone_id === 'all'` or `log.zone_id === zone_id` ([backend/src/routes/postEvent.js:24-26](file:///d:/crowd%20sense/backend/src/routes/postEvent.js#L24-L26)).
  4. Calculates counts: total, `immediate_panic_alert`, escalated (`escalated_at` truthy), acknowledged (`acknowledged_at` truthy) ([backend/src/routes/postEvent.js:32-37](file:///d:/crowd%20sense/backend/src/routes/postEvent.js#L32-L37)).
  5. Returns HTTP 200 JSON ([backend/src/routes/postEvent.js:28-38](file:///d:/crowd%20sense/backend/src/routes/postEvent.js#L28-L38)).
- **Database Tables:** Reads `audit_log`.
- **Internal Services Called:** `getAuditLogs`.
- **File & Lines:** [backend/src/routes/postEvent.js:18-43](file:///d:/crowd%20sense/backend/src/routes/postEvent.js#L18-L43).

---

### 2.10 Report Generation Routes (`backend/src/routes/reports.js`)

#### `POST /api/reports/generate`
- **Purpose:** Aggregates operational data across session and synthesizes a formal 6-section safety accountability report via Gemini LLM (or deterministic fallback), persisting to SQLite.
- **Request Parameters/Body:**
  - `scope` (`string`, optional): `'all'` | `'zone_1'` | `'zone_2'`. Default `'all'`.
  - `include_simulated_reference` (`boolean`, optional): Flag to include baseline planning figures. Default `false`.
  - `venue_name` (`string`, optional): Venue name string.
- **Response Schema:**
  ```json
  {
    "success": true,
    "report": {
      "report_id": string,
      "created_at": string,
      "scope": string,
      "generation_source": "gemini_llm" | "local_fallback",
      "model_name": string,
      "markdown_content": string,
      "input_data": object,
      "summary_metrics": {
        "total_incidents": number,
        "avg_acknowledge_sec": number | null,
        "auto_escalations": number,
        "panic_bypasses": number,
        "total_est_peak_occupancy": number
      },
      "is_fallback": boolean
    }
  }
  ```
- **Auth/Permissions:** None.
- **Step-by-Step Logic:**
  1. Calls `aggregateReportData(...)` ([backend/src/routes/reports.js:29-33](file:///d:/crowd%20sense/backend/src/routes/reports.js#L29-L33), [backend/src/services/reportAggregationService.js:24-181](file:///d:/crowd%20sense/backend/src/services/reportAggregationService.js#L24-L181)):
     - Computes session density stats, peak concurrent occupancies, and disclaimer caveats.
     - Calculates average time to acknowledge overall and by severity (`red_avg_sec`, `orange_avg_sec`, `yellow_avg_sec`).
     - Counts auto-escalations, panic alerts, and citizen report resolution states.
     - Appends full weather transition history and optional simulated reference numbers.
  2. Calls `generateAndPersistReport(aggregatedData, scope)` ([backend/src/routes/reports.js:36](file:///d:/crowd%20sense/backend/src/routes/reports.js#L36), [backend/src/services/geminiReportService.js:299-341](file:///d:/crowd%20sense/backend/src/services/geminiReportService.js#L299-L341)):
     - Attempts Gemini API call across candidates (`gemini-3.7-flash`, `gemini-3.6-flash`, `gemini-3.5-flash`, etc.) with 60s timeout ([backend/src/services/geminiReportService.js:60-170](file:///d:/crowd%20sense/backend/src/services/geminiReportService.js#L60-L170)).
     - Enforces 6 mandatory markdown sections: Section 1 (Executive Summary), Section 2 (Event Overview & Occupancy), Section 3 (Crowd Density & Flow Dynamics), Section 4 (Incidents & Alerts Log), Section 5 (Accountability & Response Performance), Section 6 (Actionable Observations & Recommendations).
     - On failure or missing key, invokes `generateLocalDeterministicReport(...)` ([backend/src/services/geminiReportService.js:178-288](file:///d:/crowd%20sense/backend/src/services/geminiReportService.js#L178-L288)).
     - Inserts record into SQLite `reports` table ([backend/src/db/database.js:425-439](file:///d:/crowd%20sense/backend/src/db/database.js#L425-L439)).
     - Writes copy of markdown to disk at `backend/data/reports/${report.report_id}.md` and `latest.md` ([backend/src/db/database.js:446-456](file:///d:/crowd%20sense/backend/src/db/database.js#L446-L456)).
  3. Returns HTTP 200 with saved report record ([backend/src/routes/reports.js:38-41](file:///d:/crowd%20sense/backend/src/routes/reports.js#L38-L41)).
- **Database Tables:** Reads `density_history`, `audit_log`; writes `reports`.
- **Internal Services Called:** `aggregateReportData`, `generateAndPersistReport`, `callGeminiApi`, `generateLocalDeterministicReport`, `insertReport`.
- **File & Lines:** [backend/src/routes/reports.js:24-49](file:///d:/crowd%20sense/backend/src/routes/reports.js#L24-L49).

---

#### `GET /api/reports/latest`
- **Purpose:** Instant retrieval of the most recently generated report from SQLite cache.
- **Request Parameters/Body:** None.
- **Response Schema:**
  ```json
  {
    "success": true,
    "report": { ...reportRecord },
    "is_fallback": boolean
  }
  ```
- **Auth/Permissions:** None.
- **Step-by-Step Logic:**
  1. Queries SQLite: `SELECT * FROM reports ORDER BY created_at DESC LIMIT 1` ([backend/src/db/database.js:468](file:///d:/crowd%20sense/backend/src/db/database.js#L468)).
  2. If none found, returns HTTP 404 `{ "error": "No generated reports found in cache." }` ([backend/src/routes/reports.js:59](file:///d:/crowd%20sense/backend/src/routes/reports.js#L59)).
  3. Parses stored JSON strings `input_data_json` and `summary_metrics_json` back into objects ([backend/src/db/database.js:473-476](file:///d:/crowd%20sense/backend/src/db/database.js#L473-L476)).
  4. Returns HTTP 200 ([backend/src/routes/reports.js:61-65](file:///d:/crowd%20sense/backend/src/routes/reports.js#L61-L65)).
- **Database Tables:** Reads `reports`.
- **Internal Services Called:** `getLatestReport`.
- **File & Lines:** [backend/src/routes/reports.js:55-70](file:///d:/crowd%20sense/backend/src/routes/reports.js#L55-L70).

---

#### `GET /api/reports/history`
- **Purpose:** Returns list of historical generated report summaries.
- **Request Parameters/Body:**
  - `limit` (`string`/`number`, optional query param): Maximum items to return (default `10`).
- **Response Schema:**
  ```json
  {
    "history": [
      {
        "report_id": string,
        "created_at": string,
        "scope": string,
        "generation_source": string,
        "model_name": string,
        "summary_metrics": object
      }
    ]
  }
  ```
- **Auth/Permissions:** None.
- **Step-by-Step Logic:**
  1. Parses `limit` parameter ([backend/src/routes/reports.js:78](file:///d:/crowd%20sense/backend/src/routes/reports.js#L78)).
  2. Queries `reports` table ordered by `created_at DESC LIMIT ?` ([backend/src/db/database.js:488-494](file:///d:/crowd%20sense/backend/src/db/database.js#L488-L494)).
  3. Parses `summary_metrics_json` on each row ([backend/src/db/database.js:497-499](file:///d:/crowd%20sense/backend/src/db/database.js#L497-L499)).
  4. Returns HTTP 200 JSON ([backend/src/routes/reports.js:80](file:///d:/crowd%20sense/backend/src/routes/reports.js#L80)).
- **Database Tables:** Reads `reports`.
- **Internal Services Called:** `getReportHistory`.
- **File & Lines:** [backend/src/routes/reports.js:76-85](file:///d:/crowd%20sense/backend/src/routes/reports.js#L76-L85).

---

#### `GET /api/reports/raw-data`
- **Purpose:** Returns raw aggregated JSON operational payload without triggering markdown generation.
- **Request Parameters/Body:**
  - `scope` (`string`, optional): `'all'`, `'zone_1'`, or `'zone_2'`. Default `'all'`.
  - `include_simulated_reference` (`string`, optional): `'true'` or `'false'`.
- **Response Schema:** Complete JSON object returned by `aggregateReportData(...)`.
- **Auth/Permissions:** None.
- **Step-by-Step Logic:**
  1. Extracts query params `scope` and `include_simulated_reference` ([backend/src/routes/reports.js:93](file:///d:/crowd%20sense/backend/src/routes/reports.js#L93)).
  2. Executes `aggregateReportData(...)` ([backend/src/routes/reports.js:94-97](file:///d:/crowd%20sense/backend/src/routes/reports.js#L94-L97)).
  3. Returns HTTP 200 JSON ([backend/src/routes/reports.js:98](file:///d:/crowd%20sense/backend/src/routes/reports.js#L98)).
- **Database Tables:** Reads `density_history`, `audit_log`.
- **Internal Services Called:** `aggregateReportData`.
- **File & Lines:** [backend/src/routes/reports.js:91-103](file:///d:/crowd%20sense/backend/src/routes/reports.js#L91-L103).

---

#### `GET /api/reports/:id`
- **Purpose:** Retrieves a specific generated report by its ID.
- **Request Parameters/Body:**
  - `id` (`string`, required path param): Report ID.
- **Response Schema:**
  ```json
  {
    "success": true,
    "report": { ...reportRecord }
  }
  ```
- **Auth/Permissions:** None.
- **Step-by-Step Logic:**
  1. Queries SQLite: `SELECT * FROM reports WHERE report_id = ?` ([backend/src/db/database.js:511](file:///d:/crowd%20sense/backend/src/db/database.js#L511)).
  2. If not found, returns HTTP 404 `{ "error": "Report not found" }` ([backend/src/routes/reports.js:112](file:///d:/crowd%20sense/backend/src/routes/reports.js#L112)).
  3. Parses input JSON and summary metrics JSON ([backend/src/db/database.js:516-518](file:///d:/crowd%20sense/backend/src/db/database.js#L516-L518)).
  4. Returns HTTP 200 ([backend/src/routes/reports.js:114](file:///d:/crowd%20sense/backend/src/routes/reports.js#L114)).
- **Database Tables:** Reads `reports`.
- **Internal Services Called:** `getReportById`.
- **File & Lines:** [backend/src/routes/reports.js:108-119](file:///d:/crowd%20sense/backend/src/routes/reports.js#L108-L119).

---

### 2.11 Responders Routes (`backend/src/routes/responders.js`)

#### `POST /api/responders/checkin`
- **Purpose:** Registers or updates a field responder's checked-in zone.
- **Request Parameters/Body:**
  - `responder_id` (`string`, required): Responder identity ID.
  - `name` (`string`, required): Responder human name.
  - `zone_id` (`string`, required): Zone identifier (`zone_1` or `zone_2`).
- **Response Schema:**
  ```json
  {
    "success": true,
    "responder": {
      "responder_id": string,
      "name": string,
      "zone_id": string,
      "checked_in_at": string (ISO 8601)
    }
  }
  ```
- **Auth/Permissions:** None.
- **Step-by-Step Logic:**
  1. Validates presence of `responder_id`, `name`, `zone_id`; returns HTTP 400 if missing ([backend/src/routes/responders.js:112-114](file:///d:/crowd%20sense/backend/src/routes/responders.js#L112-L114)).
  2. Validates `zone_id` exists in `ZONE_ADJACENCY`; returns HTTP 400 if invalid ([backend/src/routes/responders.js:116-118](file:///d:/crowd%20sense/backend/src/routes/responders.js#L116-L118)).
  3. Upserts entry into in-memory `responderCheckIns` Map ([backend/src/routes/responders.js:127](file:///d:/crowd%20sense/backend/src/routes/responders.js#L127)).
  4. Emits `responder_checkin` event over Socket.io ([backend/src/routes/responders.js:131](file:///d:/crowd%20sense/backend/src/routes/responders.js#L131)).
  5. Returns HTTP 200 with entry ([backend/src/routes/responders.js:135](file:///d:/crowd%20sense/backend/src/routes/responders.js#L135)).
- **Database Tables:** None (in-memory Map).
- **Internal Services Called:** None.
- **File & Lines:** [backend/src/routes/responders.js:109-136](file:///d:/crowd%20sense/backend/src/routes/responders.js#L109-L136).

---

#### `GET /api/responders`
- **Purpose:** Returns all currently checked-in field responders.
- **Request Parameters/Body:** None.
- **Response Schema:**
  ```json
  {
    "responders": [
      {
        "responder_id": string,
        "name": string,
        "zone_id": string,
        "checked_in_at": string
      }
    ]
  }
  ```
- **Auth/Permissions:** None.
- **Step-by-Step Logic:**
  1. Returns `Array.from(responderCheckIns.values())` in HTTP 200 JSON ([backend/src/routes/responders.js:143-145](file:///d:/crowd%20sense/backend/src/routes/responders.js#L143-L145)).
- **Database Tables:** None.
- **Internal Services Called:** None.
- **File & Lines:** [backend/src/routes/responders.js:142-146](file:///d:/crowd%20sense/backend/src/routes/responders.js#L142-L146).

---

#### `GET /api/responders/nearest`
- **Purpose:** Resolves nearest checked-in responder team to a zone using topological adjacency and pre-authored routing.
- **Request Parameters/Body:**
  - `zone_id` (`string`, required query param): Target alert zone.
- **Response Schema:**
  ```json
  {
    "responder": { "responder_id": string, "name": string, "zone_id": string, "checked_in_at": string } | null,
    "distance": number,
    "route": { "label": string | null, "steps": string[] } | null
  }
  ```
- **Auth/Permissions:** None.
- **Step-by-Step Logic:**
  1. Validates `zone_id` query param present; returns HTTP 400 if missing ([backend/src/routes/responders.js:155-157](file:///d:/crowd%20sense/backend/src/routes/responders.js#L155-L157)).
  2. Executes `findNearestTeam(alertZoneId)`:
     - Distance logic: `distance = 0` if responder in same zone; `distance = 1` if in adjacent zone via `ZONE_ADJACENCY`; `distance = 2` if non-adjacent ([backend/src/routes/responders.js:83-89](file:///d:/crowd%20sense/backend/src/routes/responders.js#L83-L89)).
     - Selects responder with minimum distance ([backend/src/routes/responders.js:90-94](file:///d:/crowd%20sense/backend/src/routes/responders.js#L90-L94)).
     - Resolves pre-authored route from `RESPONSE_ROUTES` table using key `${best.zone_id}->${alertZoneId}` ([backend/src/routes/responders.js:96-97](file:///d:/crowd%20sense/backend/src/routes/responders.js#L96-L97)).
  3. Returns HTTP 200 JSON ([backend/src/routes/responders.js:160](file:///d:/crowd%20sense/backend/src/routes/responders.js#L160)).
- **Database Tables:** None.
- **Internal Services Called:** `findNearestTeam` ([backend/src/routes/responders.js:72-100](file:///d:/crowd%20sense/backend/src/routes/responders.js#L72-L100)).
- **Known Edge Cases/Validation:** Returns `{ responder: null, distance: Infinity, route: null }` if no responders are checked in ([backend/src/routes/responders.js:74-76](file:///d:/crowd%20sense/backend/src/routes/responders.js#L74-L76)).
- **File & Lines:** [backend/src/routes/responders.js:153-161](file:///d:/crowd%20sense/backend/src/routes/responders.js#L153-L161).

---

### 2.12 Venues Routes (`backend/src/routes/venues.js`)

#### `GET /api/venues`
- **Purpose:** Lists all saved venue layout plans.
- **Request Parameters/Body:** None.
- **Response Schema:**
  ```json
  {
    "venues": [
      {
        "venue_id": string,
        "name": string,
        "created_at": string,
        "updated_at": string
      }
    ]
  }
  ```
- **Auth/Permissions:** None.
- **Step-by-Step Logic:**
  1. Queries SQLite `SELECT venue_id, name, created_at, updated_at FROM venues ORDER BY updated_at DESC` ([backend/src/db/database.js:127](file:///d:/crowd%20sense/backend/src/db/database.js#L127)).
  2. Returns HTTP 200 JSON ([backend/src/routes/venues.js:37](file:///d:/crowd%20sense/backend/src/routes/venues.js#L37)).
- **Database Tables:** Reads `venues`.
- **Internal Services Called:** `getVenues`.
- **File & Lines:** [backend/src/routes/venues.js:24-39](file:///d:/crowd%20sense/backend/src/routes/venues.js#L24-L39).

---

#### `GET /api/venues/:id`
- **Purpose:** Retrieves full layout JSON and metadata for a specific venue.
- **Request Parameters/Body:**
  - `id` (`string`, required path param): Venue ID.
- **Response Schema:**
  ```json
  {
    "venue_id": string,
    "name": string,
    "created_at": string,
    "updated_at": string,
    "layout": {
      "canvasWidth": number,
      "canvasHeight": number,
      "scale": object,
      "walls": Array,
      "exits": Array,
      "spawns": Array,
      "barricades": Array,
      "openings": Array,
      "zones": Array
    }
  }
  ```
- **Auth/Permissions:** None.
- **Step-by-Step Logic:**
  1. Queries SQLite `SELECT * FROM venues WHERE venue_id = ?` ([backend/src/db/database.js:134](file:///d:/crowd%20sense/backend/src/db/database.js#L134)).
  2. If row not found, returns HTTP 404 `{ "error": "Venue not found" }` ([backend/src/routes/venues.js:49](file:///d:/crowd%20sense/backend/src/routes/venues.js#L49)).
  3. Parses `layout_json` into an object (falls back to `{}` on JSON parse error) ([backend/src/routes/venues.js:52-56](file:///d:/crowd%20sense/backend/src/routes/venues.js#L52-L56)).
  4. Returns HTTP 200 ([backend/src/routes/venues.js:57-63](file:///d:/crowd%20sense/backend/src/routes/venues.js#L57-L63)).
- **Database Tables:** Reads `venues`.
- **Internal Services Called:** `getVenueById`.
- **File & Lines:** [backend/src/routes/venues.js:42-65](file:///d:/crowd%20sense/backend/src/routes/venues.js#L42-L65).

---

#### `POST /api/venues`
- **Purpose:** Creates or upserts a venue layout plan.
- **Request Parameters/Body:**
  - `name` (`string`, required body param): Venue title.
  - `layout` (`object`, required body param): Complete layout geometry.
  - `venue_id` (`string`, optional body param): Target venue ID. If omitted, generates new UUIDv4.
- **Response Schema:**
  ```json
  {
    "venue_id": string,
    "name": string,
    "created_at": string (ISO 8601)
  }
  ```
- **Auth/Permissions:** None.
- **Step-by-Step Logic:**
  1. Validates `name` and `layout` exist; returns HTTP 400 if missing ([backend/src/routes/venues.js:71-73](file:///d:/crowd%20sense/backend/src/routes/venues.js#L71-L73)).
  2. Assigns `venue_id = venue_id || uuidv4()` and stringifies layout ([backend/src/routes/venues.js:76-77](file:///d:/crowd%20sense/backend/src/routes/venues.js#L76-L77)).
  3. Executes SQLite UPSERT: `INSERT INTO venues ... ON CONFLICT(venue_id) DO UPDATE SET name = excluded.name, layout_json = excluded.layout_json, updated_at = excluded.updated_at` ([backend/src/db/database.js:139-147](file:///d:/crowd%20sense/backend/src/db/database.js#L139-L147)).
  4. Returns HTTP 201 with `venue_id`, `name`, and `created_at` ([backend/src/routes/venues.js:85](file:///d:/crowd%20sense/backend/src/routes/venues.js#L85)).
- **Database Tables:** Writes `venues`.
- **Internal Services Called:** `upsertVenue`.
- **File & Lines:** [backend/src/routes/venues.js:68-87](file:///d:/crowd%20sense/backend/src/routes/venues.js#L68-L87).

---

#### `DELETE /api/venues/:id`
- **Purpose:** Deletes a venue layout record by ID.
- **Request Parameters/Body:**
  - `id` (`string`, required path param): Venue ID.
- **Response Schema:**
  ```json
  {
    "deleted": true,
    "venue_id": string
  }
  ```
- **Auth/Permissions:** None.
- **Step-by-Step Logic:**
  1. Executes SQLite: `DELETE FROM venues WHERE venue_id = ?` ([backend/src/db/database.js:151](file:///d:/crowd%20sense/backend/src/db/database.js#L151)).
  2. Returns HTTP 200 with confirmation ([backend/src/routes/venues.js:96](file:///d:/crowd%20sense/backend/src/routes/venues.js#L96)).
- **Database Tables:** Writes `venues`.
- **Internal Services Called:** `deleteVenue`.
- **File & Lines:** [backend/src/routes/venues.js:90-98](file:///d:/crowd%20sense/backend/src/routes/venues.js#L90-L98).

---

## 3. Real-Time & WebSocket Channels

The backend attaches a `socket.io` server (`Server` from `socket.io`) to the HTTP server at root with CORS `origin: '*'` ([backend/src/sockets/index.js:16-22](file:///d:/crowd%20sense/backend/src/sockets/index.js#L16-L22)).

### 3.1 Inbound Client Events (Subscribe on Server)

| Event Name | Expected Data Payload | Published By | Server Handling & Triggered Action | File & Lines |
| :--- | :--- | :--- | :--- | :--- |
| `acknowledge_alert` | `{ "alert_id": string, "acknowledged_by"?: string }` | Frontend dashboard operator | Clears auto-escalation timer, updates SQLite `audit_log`, updates in-memory map, and emits `alert_acknowledged`. | [backend/src/sockets/index.js:28-33](file:///d:/crowd%20sense/backend/src/sockets/index.js#L28-L33) |
| `update_alert_status` | `{ "alert_id": string, "status": string, "responder_id"?: string }` | Field responder UI / Mobile | Validates status enum, updates SQLite `audit_log` (`responder_status` column), updates in-memory map, and emits `alert_status_updated`. | [backend/src/sockets/index.js:37-42](file:///d:/crowd%20sense/backend/src/sockets/index.js#L37-L42) |
| `complete_playbook_step` | `{ "alert_id": string, "step_index": number, "step_text": string, "completed_by"?: string }` | Incident Commander UI | Records checklist step into SQLite `playbook_step_log` and emits `playbook_step_completed`. | [backend/src/sockets/index.js:45-56](file:///d:/crowd%20sense/backend/src/sockets/index.js#L45-L56) |

---

### 3.2 Outbound Server Events (Broadcast to Clients)

| Event Name | Data Streamed | Published By | Subscribed By | Triggering Conditions / Frequency |
| :--- | :--- | :--- | :--- | :--- |
| `density_update` | Complete real-time zone telemetry: risk score, risk level, density, trend slope, optical flow convergence/turbulence, panic/exodus booleans, ETA to red, history window ([backend/src/routes/density.js:77-105](file:///d:/crowd%20sense/backend/src/routes/density.js#L77-L105)). | Backend | Command Dashboard | Emitted every time CV service pushes a frame to `POST /api/density` (~1 to 15 Hz per active camera). |
| `panic_confirming` | `{ zone_id, confirmedFrames, requiredFrames, trigger, timestamp }` ([backend/src/services/escalationManager.js:104-110](file:///d:/crowd%20sense/backend/src/services/escalationManager.js#L104-L110)). | Backend | Command Dashboard | Emitted when panic condition evaluates to true but has not yet met `PANIC_CONFIRM_FRAMES` threshold. |
| `alert_triggered` | Full alert object: `alert_id`, `zone_id`, `severity`, `alert_type`, `triggered_at`, `assigned_to` ([backend/src/services/escalationManager.js:151](file:///d:/crowd%20sense/backend/src/services/escalationManager.js#L151), [backend/src/services/escalationManager.js:212](file:///d:/crowd%20sense/backend/src/services/escalationManager.js#L212), [backend/src/services/escalationManager.js:304](file:///d:/crowd%20sense/backend/src/services/escalationManager.js#L304)). | Backend | Command Dashboard & Field Responders | Triggered on confirmed panic bypass, red risk breach, or incoming citizen SOS report. |
| `alert_panic` | Urgent panic alert envelope with `alert_type: "immediate_panic_alert"` ([backend/src/services/escalationManager.js:152](file:///d:/crowd%20sense/backend/src/services/escalationManager.js#L152)). | Backend | Command Dashboard | Triggered simultaneously with `alert_triggered` specifically on panic signature or stampede confirmation. |
| `alert_escalated` | Updated alert record with `escalated_at` timestamp and `escalated_to: "official_2"` ([backend/src/services/escalationManager.js:250](file:///d:/crowd%20sense/backend/src/services/escalationManager.js#L250)). | Backend | Command Dashboard & Senior Staff | Triggered when `ESCALATION_TIMEOUT_SEC` (30s) timer expires on an unacknowledged red alert. |
| `alert_acknowledged` | Updated alert record containing `acknowledged_at` and `acknowledged_by` ([backend/src/services/escalationManager.js:277](file:///d:/crowd%20sense/backend/src/services/escalationManager.js#L277)). | Backend | All clients | Triggered immediately when an alert is acknowledged via REST or WebSocket. |
| `alert_status_updated` | Updated alert record containing `responder_status` and responder ID ([backend/src/services/escalationManager.js:332](file:///d:/crowd%20sense/backend/src/services/escalationManager.js#L332)). | Backend | All clients | Triggered when a responder checks in or updates their progress on an incident. |
| `playbook_step_completed` | `{ id, alert_id, step_index, step_text, completed_at, completed_by }` ([backend/src/services/playbookService.js:137](file:///d:/crowd%20sense/backend/src/services/playbookService.js#L137)). | Backend | Command Dashboard | Triggered when any operator checks off an action step in the playbook UI. |
| `assistant_instruction` | Pushed operational guidance: `instructionId`, `zoneId`, `eventType`, `text`, `severity`, `ruleId`, `source` ([backend/src/services/controlRoomAssistant.js:260-273](file:///d:/crowd%20sense/backend/src/services/controlRoomAssistant.js#L260-L273)). | Backend | Control Room Banner & Field Units | Triggered automatically on risk band transitions, new alerts, stampede detections, or auto-escalations. |
| `conditions_updated` | Complete updated weather state object ([backend/src/routes/conditions.js:37](file:///d:/crowd%20sense/backend/src/routes/conditions.js#L37)). | Backend | Command Dashboard | Triggered whenever weather preset or temperature/precipitation is modified. |
| `pipeline_status_updated` | `{ active: boolean, paused_at: string | null, last_updated: string }` ([backend/src/routes/pipeline.js:27](file:///d:/crowd%20sense/backend/src/routes/pipeline.js#L27), [backend/src/routes/pipeline.js:42](file:///d:/crowd%20sense/backend/src/routes/pipeline.js#L42)). | Backend | Command Dashboard & CV Service | Triggered when pipeline is toggled or explicitly set. |
| `responder_checkin` | `{ responder_id, name, zone_id, checked_in_at }` ([backend/src/routes/responders.js:131](file:///d:/crowd%20sense/backend/src/routes/responders.js#L131)). | Backend | Command Dashboard | Triggered when a responder submits their check-in location. |
| `mock_dispatch_toast` | `{ zone_id, title, message, timestamp, is_simulation: true }` ([backend/src/index.js:62](file:///d:/crowd%20sense/backend/src/index.js#L62), [backend/src/routes/citizenReports.js:69](file:///d:/crowd%20sense/backend/src/routes/citizenReports.js#L69), [backend/src/services/escalationManager.js:166](file:///d:/crowd%20sense/backend/src/services/escalationManager.js#L166)). | Backend | Command Dashboard | Triggered on dispatch simulation, citizen SOS submission, or confirmed stampede bypass. |

---

## 4. Background Jobs & Scheduled Tasks

| Task / Job Name | Execution Mechanism | Frequency / Trigger | What It Does | What It Reads / Writes | Exact Source File & Lines |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Graduated Auto-Escalation Timer** | Node.js `setTimeout` registered in `activeTimers` Map. | Fires `ESCALATION_TIMEOUT_SEC` seconds (default 30s) after a red alert is created. | Checks if alert was acknowledged; if unacknowledged, updates alert in SQLite with `escalated_at` and `escalated_to: "official_2"`, updates in-memory alert, emits `alert_escalated`, and triggers assistant push instruction. | **Reads:** In-memory `activeTimers`, `activeZoneAlerts`<br>**Writes:** SQLite `audit_log`, in-memory maps | [backend/src/services/escalationManager.js:216-256](file:///d:/crowd%20sense/backend/src/services/escalationManager.js#L216-L256) |
| **Panic Alert TTL Expiry Check** | Synchronous inline check inside `processZoneAlerts` on each CV density reading. | Evaluated every time a density reading arrives (~1 to 15 Hz). | Checks `Date.now() - lastPanicSeenMs > PANIC_ALERT_TTL_MS` (default 20,000ms = 20s). If true and alert is unacknowledged, removes `${zone_id}_panic` from in-memory `activeZoneAlerts` so the UI returns to green after video loop resets. | **Reads:** `lastPanicSeenMs` Map<br>**Writes:** In-memory `activeZoneAlerts` Map | [backend/src/services/escalationManager.js:65-76](file:///d:/crowd%20sense/backend/src/services/escalationManager.js#L65-L76) |
| **Density History Table Pruning / Rotation** | Counter-based batch trigger inside `recordDensitySnapshot`. | Runs on every 500th density insert (`insertCounter % 500 === 0`). | Deletes older rows from `density_history` table where `id NOT IN (SELECT id FROM density_history ORDER BY id DESC LIMIT 15000)` to keep SQLite bounded during rehearsals. | **Reads:** SQLite `density_history`<br>**Writes:** SQLite `density_history` (deletions) | [backend/src/services/densityHistoryService.js:83-85](file:///d:/crowd%20sense/backend/src/services/densityHistoryService.js#L83-L85), [backend/src/db/database.js:402-415](file:///d:/crowd%20sense/backend/src/db/database.js#L402-L415) |
| **Demo Venue Database Seeding** | One-shot Node.js `setTimeout`. | Fires 500ms after server startup. | Checks for and upserts the default `"demo-temple-procession"` layout (walls, gates, barricades, exits, spawns, zones) into the `venues` SQLite table. | **Reads:** Static `DEMO_LAYOUT`<br>**Writes:** SQLite `venues` table | [backend/src/index.js:148](file:///d:/crowd%20sense/backend/src/index.js#L148), [backend/scripts/seedDemoVenue.js:332-351](file:///d:/crowd%20sense/backend/scripts/seedDemoVenue.js#L332-L351) |
| **Asynchronous Assistant Evaluation** | Node.js `setImmediate`. | Fired immediately upon alert generation or zone risk band shift. | Defers non-blocking rule matching and LLM generation/fallback to the next event loop turn, ensuring core HTTP response and alert bus are never delayed. | **Reads:** `liveZoneCache`, weather state<br>**Writes:** SQLite `assistant_instructions` | [backend/src/services/controlRoomAssistant.js:303](file:///d:/crowd%20sense/backend/src/services/controlRoomAssistant.js#L303), [backend/src/services/controlRoomAssistant.js:339](file:///d:/crowd%20sense/backend/src/services/controlRoomAssistant.js#L339) |
| **Synthetic CV Data Generator** (Standalone tool) | Node.js `setInterval`. | Runs every 1000ms (or 500ms with `--fast`) when executed via `node backend/scripts/fake_generator.js`. | Simulates concurrent CV density readings for `zone_1` (gradual ramp) and `zone_2` (surging past red threshold 2.0), posting them via HTTP to `POST /api/density`. | **Reads:** Internal step counters<br>**Writes:** HTTP POST requests to `/api/density` | [backend/scripts/fake_generator.js:75-107](file:///d:/crowd%20sense/backend/scripts/fake_generator.js#L75-L107) |

---

## 5. Database Schema

- **Engine:** SQLite3 (`sqlite3` module) ([backend/src/db/database.js:13](file:///d:/crowd%20sense/backend/src/db/database.js#L13))
- **File Location:** `backend/data/audit_log.db` ([backend/src/db/database.js:20](file:///d:/crowd%20sense/backend/src/db/database.js#L20))
- **Initialization:** Executed via `db.serialize(...)` at startup ([backend/src/db/database.js:31-121](file:///d:/crowd%20sense/backend/src/db/database.js#L31-L121))

### 5.1 Table: `audit_log`
Records every alert generated by automated CV risk scoring, panic signatures, or citizen emergency reports, including acknowledgment and escalation timelines.

| Column Name | Data Type | Constraints / Defaults | Description |
| :--- | :--- | :--- | :--- |
| `alert_id` | `TEXT` | `PRIMARY KEY` | Unique alert identifier (e.g. `alt_1715000000000_123` or `alt_cit_...`). |
| `zone_id` | `TEXT` | `NOT NULL` | Zone identifier (e.g. `'zone_1'`, `'zone_2'`). |
| `severity` | `TEXT` | `NOT NULL` | Severity level (`'yellow'`, `'orange'`, `'red'`). |
| `alert_type` | `TEXT` | `NOT NULL` | Classification (`'graduated_escalation'`, `'immediate_panic_alert'`, `'citizen_report'`). |
| `triggered_at` | `TEXT` | `NOT NULL` | ISO 8601 timestamp when alert was created. |
| `assigned_to` | `TEXT` | Nullable | Assigned operator or group (e.g. `'official_1'`, `'all_officials'`). |
| `acknowledged_at` | `TEXT` | Nullable | ISO 8601 timestamp when acknowledged. `NULL` if unacknowledged. |
| `acknowledged_by` | `TEXT` | Nullable | Identifier of acknowledging user (e.g. `'official_1'`). |
| `escalated_at` | `TEXT` | Nullable | ISO 8601 timestamp when auto-escalated on timer expiry. |
| `escalated_to` | `TEXT` | Nullable | Identifier of supervisor escalated to (e.g. `'official_2'`, `'all_officials'`). |
| `responder_status` | `TEXT` | Nullable (Added via `ALTER TABLE`) | Operational status: `'en_route'`, `'on_scene'`, `'resolved'`, `'need_backup'`. |
| `category` | `TEXT` | Nullable (Added via `ALTER TABLE`) | Incident category (e.g. `'MEDICAL_ASSISTANCE'`, `'STAMPEDE_RISK'`). |
| `description` | `TEXT` | Nullable (Added via `ALTER TABLE`) | Incident narrative text or summary description. |

- **Indices:** Primary key index on `alert_id`.
- **Triggers / Computed Fields:** None.

---

### 5.2 Table: `density_history`
Persists time-series density and optical flow readings for post-event review, chart plotting, and aggregated analytics.

| Column Name | Data Type | Constraints / Defaults | Description |
| :--- | :--- | :--- | :--- |
| `id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` | Auto-incrementing row ID. |
| `zone_id` | `TEXT` | `NOT NULL` | Zone identifier (`'zone_1'`, `'zone_2'`). |
| `density` | `REAL` | `NOT NULL` | Measured crowd density in people/m². |
| `people_count` | `INTEGER` | `NOT NULL` | Detected person count in camera frame. |
| `area_sqm` | `REAL` | `NOT NULL` | Calibrated zone footprint area in square meters. |
| `flow_convergence` | `REAL` | `DEFAULT 0` | Optical flow inward vector convergence (0.0 to 1.0). |
| `flow_turbulence` | `REAL` | `DEFAULT 0` | Optical flow motion vector variance/turbulence (0.0 to 1.0). |
| `trend_slope` | `REAL` | `DEFAULT 0` | Density rate of rise in people/m² per minute. |
| `timestamp` | `TEXT` | `NOT NULL` | ISO 8601 timestamp of reading. |

- **Indices:** `CREATE INDEX IF NOT EXISTS idx_density_zone_ts ON density_history (zone_id, timestamp)` ([backend/src/db/database.js:66](file:///d:/crowd%20sense/backend/src/db/database.js#L66)).
- **Triggers / Computed Fields:** None.

---

### 5.3 Table: `reports`
Persists generated post-incident safety and accountability reports along with the complete underlying JSON input data for audit reproducibility.

| Column Name | Data Type | Constraints / Defaults | Description |
| :--- | :--- | :--- | :--- |
| `report_id` | `TEXT` | `PRIMARY KEY` | Unique report identifier (e.g. `rep_1715000000000_456`). |
| `created_at` | `TEXT` | `NOT NULL` | ISO 8601 creation timestamp. |
| `scope` | `TEXT` | `NOT NULL` | Report scope: `'all'`, `'zone_1'`, or `'zone_2'`. |
| `generation_source` | `TEXT` | `NOT NULL` | Source engine: `'gemini_llm'` or `'local_fallback'`. |
| `model_name` | `TEXT` | Nullable | LLM model used (e.g. `'gemini-3.7-flash'`) or fallback engine tag. |
| `markdown_content` | `TEXT` | `NOT NULL` | Complete synthesized 6-section Markdown report. |
| `input_data_json` | `TEXT` | `NOT NULL` | Serialized JSON string of the exact input payload passed into the generator. |
| `summary_metrics_json`| `TEXT` | Nullable | Serialized JSON string of standout metrics (incidents, ack time, auto-escalations). |

- **Indices:** `CREATE INDEX IF NOT EXISTS idx_reports_created ON reports (created_at DESC)` ([backend/src/db/database.js:81](file:///d:/crowd%20sense/backend/src/db/database.js#L81)).
- **Triggers / Computed Fields:** None.

---

### 5.4 Table: `playbook_step_log`
Maintains an immutable audit log of every action step completed from an incident response playbook checklist.

| Column Name | Data Type | Constraints / Defaults | Description |
| :--- | :--- | :--- | :--- |
| `id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` | Auto-incrementing row ID. |
| `alert_id` | `TEXT` | `NOT NULL` | Associated alert identifier. |
| `step_index` | `INTEGER` | `NOT NULL` | 0-indexed position of step in playbook. |
| `step_text` | `TEXT` | `NOT NULL` | Full text of completed directive. |
| `completed_at` | `TEXT` | `NOT NULL` | ISO 8601 timestamp of completion. |
| `completed_by` | `TEXT` | `NOT NULL` | Identifier of official who checked off the step. |

- **Indices:** `CREATE INDEX IF NOT EXISTS idx_playbook_step_alert ON playbook_step_log (alert_id, step_index)` ([backend/src/db/database.js:94](file:///d:/crowd%20sense/backend/src/db/database.js#L94)).
- **Triggers / Computed Fields:** None.

---

### 5.5 Table: `venues`
Persists architectural layout definitions for the CrowdSense Planner pre-event simulation module.

| Column Name | Data Type | Constraints / Defaults | Description |
| :--- | :--- | :--- | :--- |
| `venue_id` | `TEXT` | `PRIMARY KEY` | Unique venue ID (e.g. `'demo-temple-procession'` or UUIDv4). |
| `name` | `TEXT` | `NOT NULL` | Human-readable venue name. |
| `layout_json` | `TEXT` | `NOT NULL` | Serialized JSON geometry: walls, gates, barricades, exits, spawns, zones. |
| `created_at` | `TEXT` | `NOT NULL` | ISO 8601 creation timestamp. |
| `updated_at` | `TEXT` | `NOT NULL` | ISO 8601 update timestamp. |

- **Indices:** Primary key on `venue_id`.
- **Triggers / Computed Fields:** None.

---

### 5.6 Table: `assistant_instructions`
Maintains an audit trail of all proactive guidance instructions generated and pushed to control room operators.

| Column Name | Data Type | Constraints / Defaults | Description |
| :--- | :--- | :--- | :--- |
| `instruction_id` | `TEXT` | `PRIMARY KEY` | Unique instruction ID (`inst_...`). |
| `triggering_alert_id`| `TEXT` | Nullable | Alert ID that triggered the guidance (if alert-driven). |
| `zone_id` | `TEXT` | `NOT NULL` | Target zone identifier. |
| `text` | `TEXT` | `NOT NULL` | Instruction text delivered to operators. |
| `severity` | `TEXT` | `NOT NULL` | Severity at time of generation (`'yellow'`, `'orange'`, `'red'`). |
| `event_type` | `TEXT` | `NOT NULL` | Trigger type: `'alert_triggered'`, `'alert_escalated'`, `'alert_panic'`, `'threshold_crossed'`. |
| `generated_at` | `TEXT` | `NOT NULL` | ISO 8601 timestamp of generation. |
| `source` | `TEXT` | Nullable | Generation engine: `'groq_llm'`, `'local_deterministic'`, or `'deterministic_fallback'`. |

- **Indices:** `CREATE INDEX IF NOT EXISTS idx_assistant_instructions_ts ON assistant_instructions (generated_at DESC)` ([backend/src/db/database.js:120](file:///d:/crowd%20sense/backend/src/db/database.js#L120)).
- **Triggers / Computed Fields:** None.

---

## 6. Configuration & Environment Variables

| Variable Name | Default Value | Controlling File & Lines | What It Controls |
| :--- | :--- | :--- | :--- |
| `PORT` | `4000` | [backend/src/index.js:30](file:///d:/crowd%20sense/backend/src/index.js#L30) | HTTP and WebSocket server listening port. |
| `FRONTEND_URL` | `http://localhost:5173` | [backend/.env.example:2](file:///d:/crowd%20sense/backend/.env.example#L2) | Configured frontend origin URL for reference. |
| `ENABLE_OPTICAL_FLOW` | `'true'` | [backend/src/index.js:45](file:///d:/crowd%20sense/backend/src/index.js#L45), [backend/src/services/riskEngine.js:86](file:///d:/crowd%20sense/backend/src/services/riskEngine.js#L86) | **Feature Flag:** When `'true'`, enables Phase 4 composite risk formula combining density (0.50), trend slope (0.30), flow convergence (0.10), and turbulence (0.10). When `'false'`, falls back to Phase 3 scoring: density (0.70) and slope (0.30) only. |
| `ESCALATION_TIMEOUT_SEC`| `30` | [backend/src/services/escalationManager.js:23](file:///d:/crowd%20sense/backend/src/services/escalationManager.js#L23) | Duration (in seconds) before an unacknowledged red alert auto-escalates to `official_2`. |
| `PANIC_ALERT_TTL_MS` | `20000` (20 seconds) | [backend/src/services/escalationManager.js:29](file:///d:/crowd%20sense/backend/src/services/escalationManager.js#L29) | Auto-expiry time-to-live for panic alerts. If no panic signals arrive within this window, clears panic alert to allow zone recovery. |
| `PANIC_CONFIRM_FRAMES` | `2` | [backend/src/services/escalationManager.js:37](file:///d:/crowd%20sense/backend/src/services/escalationManager.js#L37) | Number of consecutive analysis frames where panic condition must evaluate to true before an immediate panic alert is officially triggered. |
| `ASSISTANT_LOCAL_MODE` | `'false'` | [backend/src/routes/assistant.js:157](file:///d:/crowd%20sense/backend/src/routes/assistant.js#L157), [backend/src/services/controlRoomAssistant.js:219](file:///d:/crowd%20sense/backend/src/services/controlRoomAssistant.js#L219) | **Feature Flag:** When `'true'`, forces control room assistant Q&A and push guidance to run 100% locally via deterministic rule synthesis, bypassing all external Groq LLM calls. |
| `GROQ_API_KEY` | None | [backend/src/routes/assistant.js:167](file:///d:/crowd%20sense/backend/src/routes/assistant.js#L167), [backend/src/services/groqPlaybookService.js:99](file:///d:/crowd%20sense/backend/src/services/groqPlaybookService.js#L99), [backend/src/services/controlRoomAssistant.js:80](file:///d:/crowd%20sense/backend/src/services/controlRoomAssistant.js#L80) | API authentication key for Groq LLM inference (used for Playbook narratives, Control Room Assistant Q&A, and push guidance). |
| `GROQ_MODEL` | `'qwen/qwen3.8-27b'` | [backend/src/services/groqPlaybookService.js:18](file:///d:/crowd%20sense/backend/src/services/groqPlaybookService.js#L18), [backend/src/services/controlRoomAssistant.js:19](file:///d:/crowd%20sense/backend/src/services/controlRoomAssistant.js#L19) | Primary model ID for Groq API calls. Candidates tried: `qwen/qwen3.8-27b`, `qwen/qwen3.6-27b`, `openai/gpt-oss-20b`. |
| `GEMINI_API_KEY` / `GOOGLE_API_KEY` | None | [backend/src/services/geminiReportService.js:61](file:///d:/crowd%20sense/backend/src/services/geminiReportService.js#L61), [backend/src/services/geminiPlannerService.js:86](file:///d:/crowd%20sense/backend/src/services/geminiPlannerService.js#L86) | API key for Google Gemini API (used for post-event reports and pre-event planner narration). |
| `GEMINI_MODEL` | `'gemini-3.7-flash'` | [backend/src/services/geminiReportService.js:20](file:///d:/crowd%20sense/backend/src/services/geminiReportService.js#L20), [backend/src/services/geminiPlannerService.js:15](file:///d:/crowd%20sense/backend/src/services/geminiPlannerService.js#L15) | Primary model ID for Gemini calls. Candidates tried: `gemini-3.7-flash`, `gemini-3.6-flash`, `gemini-3.5-flash`, `gemini-3-flash-preview`, `gemini-3-flash`. |
| `PIPELINE_ACTIVE` / `START_PIPELINE_PAUSED` | Active unless `START_PIPELINE_PAUSED=true` | [backend/src/services/pipelineService.js:8-12](file:///d:/crowd%20sense/backend/src/services/pipelineService.js#L8-L12) | Controls whether CV processing pipeline starts in running or paused state on server launch. |
| `TWILIO_ACCOUNT_SID` | None | [backend/src/services/notifications.js:11](file:///d:/crowd%20sense/backend/src/services/notifications.js#L11) | Twilio account SID for real SMS dispatch. If omitted, dispatches fall back to UI Demo Mode. |
| `TWILIO_AUTH_TOKEN` | None | [backend/src/services/notifications.js:12](file:///d:/crowd%20sense/backend/src/services/notifications.js#L12) | Twilio authentication token. |
| `TWILIO_PHONE_NUMBER` | None | [backend/src/services/notifications.js:13](file:///d:/crowd%20sense/backend/src/services/notifications.js#L13) | Twilio source phone number. |
| `BACKEND_HOST` | `'localhost'` | [backend/scripts/fake_generator.js:16](file:///d:/crowd%20sense/backend/scripts/fake_generator.js#L16) | Target host used by the synthetic data generator script. |
| `BACKEND_PORT` | `4000` | [backend/scripts/fake_generator.js:17](file:///d:/crowd%20sense/backend/scripts/fake_generator.js#L17) | Target port used by the synthetic data generator script. |

---

## 7. Cross-Cutting Logic

### 7.1 Middleware
1. **CORS:** `app.use(cors())` applies wildcard CORS to all incoming HTTP requests ([backend/src/index.js:36](file:///d:/crowd%20sense/backend/src/index.js#L36)). WebSocket CORS is also configured for all origins `origin: '*'` ([backend/src/sockets/index.js:19](file:///d:/crowd%20sense/backend/src/sockets/index.js#L19)).
2. **Body Parsers:** 
   - `express.json({ limit: '10mb' })` ([backend/src/index.js:37](file:///d:/crowd%20sense/backend/src/index.js#L37)).
   - `express.urlencoded({ extended: true, limit: '10mb' })` ([backend/src/index.js:38](file:///d:/crowd%20sense/backend/src/index.js#L38)).
3. **Static File Serving:** `app.use(express.static(frontendDistPath))` conditionally mounted if `frontend/dist` exists on disk ([backend/src/index.js:117-119](file:///d:/crowd%20sense/backend/src/index.js#L117-L119)).
4. **Authentication / Authorization:** **None.** There is currently no token authentication, JWT verification, session middleware, or role-based authorization in this codebase. Operator identities are accepted as caller-provided strings (e.g. `acknowledged_by || 'official_1'`) on request payloads.

### 7.2 Error Handling & Resilience Patterns
1. **Zero-Downtime Deterministic Fallbacks:**
   - Every external LLM integration (Gemini report generation, Gemini planner narration, Groq playbook framing, Groq assistant Q&A, and Groq push guidance) implements automated candidate model fallback cycling and an instant local deterministic fallback. If an API key is missing, network fails, or timeout fires, the backend synthesizes structured outputs locally and returns HTTP 200 without crashing or rejecting requests ([backend/src/services/geminiReportService.js:178](file:///d:/crowd%20sense/backend/src/services/geminiReportService.js#L178), [backend/src/services/geminiPlannerService.js:165](file:///d:/crowd%20sense/backend/src/services/geminiPlannerService.js#L165), [backend/src/services/groqPlaybookService.js:59](file:///d:/crowd%20sense/backend/src/services/groqPlaybookService.js#L59), [backend/src/services/controlRoomAssistant.js:61](file:///d:/crowd%20sense/backend/src/services/controlRoomAssistant.js#L61)).
2. **Non-Blocking Execution (`setImmediate`):**
   - Proactive control room push evaluations are offloaded to `setImmediate` ([backend/src/services/controlRoomAssistant.js:303](file:///d:/crowd%20sense/backend/src/services/controlRoomAssistant.js#L303), [backend/src/services/controlRoomAssistant.js:339](file:///d:/crowd%20sense/backend/src/services/controlRoomAssistant.js#L339)). This guarantees that density ingestion and alert dispatch are never delayed by LLM calls.
3. **Strict Client AbortControllers:**
   - LLM requests enforce strict abort timeouts (Assistant: 2.5s and 4.0s, Playbook: 15s, Planner: 45s, Report: 60s) to prevent hanging sockets.
4. **Proxy Stream Error Recovery:**
   - `GET /stream/:zone_id` catches upstream socket drops and emits HTTP 503 rather than uncaught socket exceptions ([backend/src/index.js:104-106](file:///d:/crowd%20sense/backend/src/index.js#L104-L106)).

### 7.3 Global Business Rules & Risk Calculation Formulas
1. **Zone Thresholds (`THRESHOLDS` in [backend/src/services/riskEngine.js:15-28](file:///d:/crowd%20sense/backend/src/services/riskEngine.js#L15-L28)):**
   - **General Zones (`zone_1`):** Green cut-off `< 0.35`, Yellow cut-off `< 0.60`, Orange cut-off `< 0.80`, Red Density Threshold = `3.5 p/m²`.
   - **Corridor Zones (`zone_2`):** Green cut-off `< 0.25`, Yellow cut-off `< 0.50`, Orange cut-off `< 0.70`, Red Density Threshold = `2.0 p/m²`.
2. **Environmental Sensitivity Modifiers ([backend/src/services/riskEngine.js:78-85](file:///d:/crowd%20sense/backend/src/services/riskEngine.js#L78-L85)):**
   - **Extreme Heat (`extreme_heat` & `hot_and_rainy`):** `density_factor = 0.75`. Effective Red Density Threshold = `baseRedThreshold * 0.75` (e.g. corridor threshold drops from 2.0 to 1.5 p/m²).
   - **Heavy Rain (`heavy_rain` & `hot_and_rainy`):** `flow_factor = 1.5`. Multiplies optical flow convergence and turbulence terms by 1.5x.
3. **Risk Score Formula ([backend/src/services/riskEngine.js:101-109](file:///d:/crowd%20sense/backend/src/services/riskEngine.js#L101-L109)):**
   - When Optical Flow is enabled:
     $$\text{Risk Score} = (0.50 \times \text{density\_norm}) + (0.30 \times \text{trend\_norm}) + (0.10 \times \text{conv\_norm}) + (0.10 \times \text{turb\_norm})$$
   - When Optical Flow is disabled:
     $$\text{Risk Score} = (0.70 \times \text{density\_norm}) + (0.30 \times \text{trend\_norm})$$
4. **Turbulence Fast Path ([backend/src/services/riskEngine.js:126-130](file:///d:/crowd%20sense/backend/src/services/riskEngine.js#L126-L130)):**
   - If `turb_norm > 0.88`, risk level is stepped up by one tier (green $\rightarrow$ yellow, yellow $\rightarrow$ orange). It never skips straight to red.
5. **Panic Fast-Path Bypass Conditions ([backend/src/services/escalationManager.js:80-85](file:///d:/crowd%20sense/backend/src/services/escalationManager.js#L80-L85)):**
   An emergency panic state is flagged if ANY of the following hold true:
   - `panic_signature === true` (chaotic stampede / crush)
   - `exodus_signature === true` (mass flee / fire evacuation high-speed coherent motion)
   - `(flow_turbulence >= 0.70 && density >= 1.5)`
   - `density >= 4.5`
   - `(trend_slope >= 2.0 && density >= 2.0)`
   The panic alert only fires once the condition persists for `PANIC_CONFIRM_FRAMES` (default 2 consecutive frames) to prevent transient noise false positives ([backend/src/services/escalationManager.js:98-100](file:///d:/crowd%20sense/backend/src/services/escalationManager.js#L98-L100)).
6. **Mandatory Occupancy Honesty Caveat ([backend/src/services/reportAggregationService.js:128-130](file:///d:/crowd%20sense/backend/src/services/reportAggregationService.js#L128-L130), [backend/src/services/geminiReportService.js:40](file:///d:/crowd%20sense/backend/src/services/geminiReportService.js#L40)):**
   - All capacity and head-count metrics are strictly labeled as **Estimated Peak Concurrent Occupancy** ($\text{peak\_density} \times \text{area\_sqm}$). The codebase enforces that these numbers must never be described as total unique footfall or cumulative unique attendance.
