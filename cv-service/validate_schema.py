"""
cv-service/validate_schema.py
Contract validation acceptance check.

Verifies that the payload produced by emitter.build_payload() matches
docs/api-contract.md field-for-field: correct key names, correct types,
no extra fields, no missing fields.

Run this as part of the acceptance check:
    python validate_schema.py

Exit code 0 = PASS, exit code 1 = FAIL.
"""
from __future__ import annotations

import json
import sys

from emitter import build_payload

# ---------------------------------------------------------------------------
# Contract definition — mirrors docs/api-contract.md §1 exactly.
# Update both files if the contract ever changes.
# ---------------------------------------------------------------------------
REQUIRED_FIELDS: dict[str, type | tuple] = {
    "zone_id":          str,
    "zone_type":        str,
    "people_count":     int,
    "area_sqm":         (int, float),
    "density":          (int, float),
    "flow_convergence": (int, float),
    "flow_turbulence":  (int, float),
    "timestamp":        str,
}

VALID_ZONE_TYPES = {"general", "corridor"}


def validate(payload: dict) -> list[str]:
    errors: list[str] = []

    # Check for missing fields
    for field in REQUIRED_FIELDS:
        if field not in payload:
            errors.append(f"MISSING field: {field!r}")

    # Check for extra fields not in the contract
    extra = set(payload.keys()) - set(REQUIRED_FIELDS.keys())
    if extra:
        errors.append(f"EXTRA fields not in contract: {sorted(extra)}")

    # Type checks for present fields
    for field, expected_type in REQUIRED_FIELDS.items():
        if field in payload and not isinstance(payload[field], expected_type):
            errors.append(
                f"WRONG TYPE for {field!r}: "
                f"expected {expected_type}, got {type(payload[field]).__name__!r} "
                f"(value={payload[field]!r})"
            )

    # Value constraint: zone_type must be a known value
    if "zone_type" in payload and payload["zone_type"] not in VALID_ZONE_TYPES:
        errors.append(
            f"INVALID zone_type {payload['zone_type']!r}; "
            f"must be one of {sorted(VALID_ZONE_TYPES)}"
        )

    # Timestamp must end in Z (ISO 8601 UTC, not +00:00)
    if "timestamp" in payload and isinstance(payload["timestamp"], str):
        if not payload["timestamp"].endswith("Z"):
            errors.append(
                f"INVALID timestamp format {payload['timestamp']!r}; "
                "must end in 'Z' (UTC), not '+00:00'"
            )

    return errors


if __name__ == "__main__":
    # Simulate a realistic 1-second window: ~6 samples (every 5th frame at 30fps)
    sample_window = [5, 7, 6, 8, 6, 7]
    payload = build_payload(sample_window)

    print("=" * 60)
    print("Sample payload (simulated 1-sec window):")
    print(json.dumps(payload, indent=2))
    print("=" * 60)

    errors = validate(payload)

    if errors:
        print("\n[FAIL] Schema validation errors:")
        for err in errors:
            print(f"  ✗  {err}")
        sys.exit(1)
    else:
        print("\n[PASS] Payload matches docs/api-contract.md contract exactly.")
        print(f"       Fields: {', '.join(payload.keys())}")
        sys.exit(0)
