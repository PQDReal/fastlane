# Catalog Intelligence shadow report — 2026-08-25

Command:

```powershell
npm run catalog-intelligence:shadow -- --details
```

The run was read-only (`writes = 0`) and compared the existing vehicle-spec
normalizer with the canonical planner over the same 112 active product rows.

## Summary

| Metric | Count |
| --- | ---: |
| Vehicle products compared | 29 |
| Accessories skipped outside current schema | 83 |
| Source-blocked products | 13 |
| Legacy warning products | 1 |
| Fact dispositions | 200 |
| `MATCH` | 106 |
| `VALUE_MISMATCH` | 2 |
| `LEGACY_ONLY` | 0 |
| `CANONICAL_ONLY` | 2 |
| `CONTEXT_SPLIT` | 6 |
| `CANONICAL_BLOCKED` | 84 |
| Match rate over directly comparable values | 98.15% |

## Current cut-over gate

| Canonical key | Decision | Reason |
| --- | --- | --- |
| `top_speed_kmh` | `READY` | 10 matches, no mismatch or flat-context loss |
| `max_torque_nm` | `READY` | 6 matches, no mismatch or flat-context loss |
| `dimensions_mm` | `READY` | 16 matches, no mismatch or flat-context loss |
| `seats` | `READY` | 6 matches, no mismatch or flat-context loss |
| `drive_type` | `READY` | 15 matches, no mismatch or flat-context loss |
| `range_km` | `HOLD` | 2 products require multiple condition-specific facts |
| `battery_capacity_kwh` | `HOLD` | 3 products require multiple condition-specific facts |
| `charging_time` | `HOLD` | Kinet requires standard and 1000 W contexts |
| `max_power_kw` | `HOLD` | VF 3 and VF 5 disagree because legacy treats reviewed unitless horsepower as kW |

`CANONICAL_BLOCKED` values are excluded from readiness calculations. They are
not parser mismatches: the exact source snapshots were already rejected by the
official-source review and must not be promoted by either read path.

## Review cases

- `max_power_kw`: VF 3 and VF 5 are the two value mismatches. The canonical
  parser applies the reviewed `fastlane_car_nested_v1` unitless-horsepower rule;
  the legacy reader returns the raw number as kW.
- `charging_time`: Kinet is intentionally `CONTEXT_SPLIT` into standard charge
  (~9 hours) and charger power 1000 W (~3.5 hours).
- `range_km`: Vero X and Viper retain conditional range contexts.
- `battery_capacity_kwh`: Feliz II, Vero X and Viper retain configuration
  contexts instead of overwriting one value with another.

No assistant response path was changed in this milestone. The next cut-over
must wait for migration 067, a bounded persistence apply, and a repeat run that
confirms `already_applied` idempotency before any `READY` key is enabled.
