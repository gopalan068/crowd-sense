# API Contract — Crowd Safety System

> **This file is the source of truth for all inter-service data shapes.**
> All fields here are verbatim from Section 9 of `crowd-safety-system-blueprint.md`.
> Do **not** invent new fields in any service without updating this document first.
> Blueprint warning: *"mismatched assumptions between the CV and backend developers is
> the single most common cause of lost hours at integration time."*

---

## 1. CV Service → Backend

Pushed as a **REST POST** to `POST /api/density` once per second, per zone.

```json
{
  "zone_id": "zone_1",
  "zone_type": "general | corridor",
  "feed_source": "live_webcam | pre_recorded",
  "people_count": 42,
  "area_sqm": 20,
  "density": 2.1,
  "flow_convergence": 0.3,
  "flow_turbulence": 0.15,
  "timestamp": "2026-08-20T10:15:32Z"
}
```

### Field Notes

| Field             | Type            | Owner      | Notes                                                                 |
|-------------------|-----------------|------------|-----------------------------------------------------------------------|
| `zone_id`         | string          | CV config  | Matches zone keys used in backend and frontend                        |
| `zone_type`       | `"general"` \| `"corridor"` | CV config | Determines threshold logic in backend                  |
| `feed_source`     | `"live_webcam"` \| `"pre_recorded"` | CV config | Explicit stream provenance tag for demo honesty (§3 blueprint) |
| `people_count`    | integer         | CV service | **Window average** of per-frame detections in the 1-sec window        |
| `area_sqm`        | float           | CV config  | Manually configured constant — no homography correction               |
| `density`         | float           | CV service | `people_count / area_sqm`, rounded to 3 decimal places               |
| `flow_convergence`| float 0–1       | CV service | **Tier 2** — optical flow placeholder (emit `0.0`)                    |
| `flow_turbulence` | float 0–1       | CV service | **Tier 2** — optical flow placeholder (emit `0.0`)                    |
| `timestamp`       | ISO 8601 UTC    | CV service | Must include `Z` suffix                                               |

---

## 2. Backend → Frontend

Sent as a **Socket.io** event named `density_update`, once per received CV reading.
Includes computed risk fields and normalized breakdown components that the backend owns.

```json
{
  "zone_id": "zone_1",
  "zone_type": "general",
  "feed_source": "live_webcam",
  "risk_level": "yellow",
  "risk_score": 0.58,
  "density": 2.1,
  "density_norm": 0.60,
  "trend_slope": 0.12,
  "trend_norm": 0.06,
  "eta_to_red_min": 6,
  "timestamp": "2026-08-20T10:15:32Z"
}
```

### Field Notes

| Field           | Type                                      | Owner   | Notes                                                        |
|-----------------|-------------------------------------------|---------|--------------------------------------------------------------|
| `zone_id`       | string                                    | Backend | Passed through from CV payload                               |
| `zone_type`     | `"general"` \| `"corridor"`               | Backend | Passed through from CV payload                               |
| `feed_source`   | `"live_webcam"` \| `"pre_recorded"`       | Backend | Passed through from CV payload                               |
| `risk_level`    | `"green"` \| `"yellow"` \| `"orange"` \| `"red"` | Backend | Derived from `risk_score` via zone threshold table     |
| `risk_score`    | float 0–1                                 | Backend | Weighted composite of normalized density, trend, flow terms  |
| `density`       | float                                     | Backend | Physical people/m² passed through from CV payload            |
| `density_norm`  | float 0–1                                 | Backend | `min(1.0, density / red_threshold)` normalized term          |
| `trend_slope`   | float                                     | Backend | Rate of density change (people/sqm per minute)               |
| `trend_norm`    | float 0–1                                 | Backend | `min(1.0, max(0.0, trend_slope / 2.0))` normalized term      |
| `eta_to_red_min`| integer \| `null`                         | Backend | Linear extrapolation to red threshold                        |
| `timestamp`     | ISO 8601 UTC                              | Backend | Passed through from CV payload                               |

---

## 3. Alert / Audit Log Entry

Written to the database when an alert is triggered, acknowledged, or escalated.
Also surfaced in the frontend audit log viewer.

```json
{
  "alert_id": "a123",
  "zone_id": "zone_1",
  "severity": "red",
  "alert_type": "graduated_escalation",
  "triggered_at": "2026-08-20T10:16:00Z",
  "assigned_to": "official_1",
  "acknowledged_at": null,
  "acknowledged_by": null,
  "escalated_at": null,
  "escalated_to": "official_2"
}
```

### Field Notes

| Field             | Type            | Notes                                                                 |
|-------------------|-----------------|-----------------------------------------------------------------------|
| `alert_id`        | string          | Unique identifier; backend generates (e.g. UUID or sequential)        |
| `zone_id`         | string          | Links alert to a zone                                                 |
| `severity`        | `"yellow"` \| `"orange"` \| `"red"` | Severity level at time of trigger                  |
| `alert_type`      | `"graduated_escalation"` \| `"immediate_panic_alert"` | Distinguishes escalation mode |
| `triggered_at`    | ISO 8601 UTC    | When the threshold was first breached                                 |
| `assigned_to`     | string \| `null`| Official initially assigned; may be `null` if unassigned              |
| `acknowledged_at` | ISO 8601 UTC \| `null` | Null until the assigned official acknowledges               |
| `acknowledged_by` | string \| `null`| Official who acknowledged the alert; null until acknowledged         |
| `escalated_at`    | ISO 8601 UTC \| `null` | Null until auto-escalation fires                            |
| `escalated_to`    | string \| `null`| Official escalated to; null until escalated                           |

---

## Change Log

| Date       | Change                          | Author |
|------------|---------------------------------|--------|
| 2026-08-20 | Initial contract — verbatim §9  | Scaffolding |
| 2026-08-21 | Added alert_type & acknowledged_by to §3 | Phase 2 Backend |

