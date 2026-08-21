"""
cv-service/emitter.py
Builds the CV→Backend JSON payload (per docs/api-contract.md) and POSTs it.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import List

import requests

import config


# ---------------------------------------------------------------------------
# Payload builder
# ---------------------------------------------------------------------------

def build_payload(count_samples: List[int]) -> dict:
    """
    Aggregate a window of per-frame person counts into one contract-compliant payload.

    Aggregation method: WINDOW AVERAGE.
    Rationale: averaging the ~6 samples collected in a 1-second window smooths
    per-frame detection jitter (YOLO sometimes misses one person for a single
    frame). The alternative — last-sample — is jumpier and would feed noisier
    density readings into Phase 3's ETA-to-red linear projection, amplifying
    false spikes. Max would similarly over-react to single-frame outliers.
    Averaging is pinned here as an explicit contract, not left to discretion.
    """
    avg_count = round(sum(count_samples) / len(count_samples)) if count_samples else 0
    density = round(avg_count / config.AREA_SQM, 3)

    return {
        "zone_id": config.ZONE_ID,
        "zone_type": config.ZONE_TYPE,
        "people_count": avg_count,
        "area_sqm": config.AREA_SQM,
        "density": density,
        # flow_convergence / flow_turbulence: Tier 2 (optical flow).
        # Emit 0.0 as placeholder so the contract shape is always fully populated.
        "flow_convergence": 0.0,
        "flow_turbulence": 0.0,
        "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


# ---------------------------------------------------------------------------
# Emitter
# ---------------------------------------------------------------------------

def emit(count_samples: List[int]) -> dict:
    """
    Build the payload, POST it to the backend, and return the payload dict
    (so main.py can log it regardless of whether the POST succeeded).

    POST failures are logged as warnings — the CV service should keep running
    even if the backend is briefly unavailable (e.g. during startup sequencing).
    """
    payload = build_payload(count_samples)

    try:
        resp = requests.post(
            config.BACKEND_URL,
            json=payload,
            timeout=2,  # don't block the 1-sec emission loop on a slow backend
        )
        resp.raise_for_status()
    except requests.exceptions.ConnectionError:
        print(f"[WARN] Cannot reach backend at {config.BACKEND_URL} — is it running?")
    except requests.exceptions.Timeout:
        print(f"[WARN] POST to {config.BACKEND_URL} timed out after 2 s")
    except requests.exceptions.HTTPError as exc:
        print(f"[WARN] Backend returned error: {exc}")

    return payload
