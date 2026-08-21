"""
cv-service/emitter.py
Builds the CV→Backend JSON payload (per docs/api-contract.md) and POSTs it.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import List, Optional

import requests

import config


# ---------------------------------------------------------------------------
# Payload builder
# ---------------------------------------------------------------------------

def build_payload(
    count_samples: List[int],
    zone_id: Optional[str] = None,
    zone_type: Optional[str] = None,
    area_sqm: Optional[float] = None,
    feed_source: Optional[str] = None,
) -> dict:
    """
    Aggregate a window of per-frame person counts into one contract-compliant payload.
    """
    zid = zone_id or config.ZONE_ID
    ztype = zone_type or config.ZONE_TYPE
    asqm = area_sqm if area_sqm is not None else config.AREA_SQM
    fsrc = feed_source or ("live_webcam" if zid == "zone_1" else "pre_recorded")

    avg_count = round(sum(count_samples) / len(count_samples)) if count_samples else 0
    density = round(avg_count / asqm, 3)

    return {
        "zone_id": zid,
        "zone_type": ztype,
        "feed_source": fsrc,
        "people_count": avg_count,
        "area_sqm": asqm,
        "density": density,
        "flow_convergence": 0.0,
        "flow_turbulence": 0.0,
        "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


# ---------------------------------------------------------------------------
# Emitter
# ---------------------------------------------------------------------------

def emit(
    count_samples: List[int],
    zone_id: Optional[str] = None,
    zone_type: Optional[str] = None,
    area_sqm: Optional[float] = None,
    feed_source: Optional[str] = None,
) -> dict:
    """
    Build the payload, POST it to the backend, and return the payload dict.
    """
    payload = build_payload(
        count_samples,
        zone_id=zone_id,
        zone_type=zone_type,
        area_sqm=area_sqm,
        feed_source=feed_source,
    )

    try:
        resp = requests.post(
            config.BACKEND_URL,
            json=payload,
            timeout=2,
        )
        resp.raise_for_status()
    except requests.exceptions.ConnectionError:
        print(f"[WARN] Cannot reach backend at {config.BACKEND_URL} — is it running?")
    except requests.exceptions.Timeout:
        print(f"[WARN] POST to {config.BACKEND_URL} timed out after 2 s")
    except requests.exceptions.HTTPError as exc:
        print(f"[WARN] Backend returned error: {exc}")

    return payload
