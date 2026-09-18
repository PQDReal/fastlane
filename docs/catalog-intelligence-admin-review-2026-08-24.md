# Catalog Intelligence admin review — 2026-08-24

This review separates three questions that must not be collapsed:

1. Can the value be parsed deterministically?
2. Is its context represented without losing a condition?
3. Does the source snapshot still agree with a current official source?

The dry-run remains read-only. No product or canonical-fact row was written.

## Kinet charging decision

The [official Kinet page](https://vinfastauto.com/vn_vi/xe-may-dien-vinfast-kinet)
uses the heading **“Thời gian sạc tiêu chuẩn”** and publishes approximately
9 hours, with approximately 3.5 hours when using a 1000 W charger. It also says
the listed vehicle price includes one charger.

The page does **not** publish the included/standard charger's power, voltage or
current; it does not publish the charging SOC window; and it does not call the
1000 W charger a “fast charger”. Older official Evo material identifies 400 W
as the standard charger for Evo, but that model-specific value cannot be copied
to Kinet. See the [official Evo200 specification article](https://vinfastauto.com/vn_vi/thong-so-ky-thuat-evo200).

The canonical result is therefore:

| Duration | Official qualifier | Deliberately unknown |
| --- | --- | --- |
| ~9 hours | `charging_mode=STANDARD` | charger power; SOC start/end |
| ~3.5 hours | `charger_power_w=1000` | charger class; SOC start/end |

The 9-hour fact is not a fallback for “all other chargers”. The 1000 W fact is
not labelled `FAST` unless a Kinet-specific official source later says so.

## Former INVALID observations

| Product/raw value | Reviewed canonical result | Official evidence |
| --- | --- | --- |
| Kinet `2 x 1,5 kWh (2 pin chạy song song)` | total `3.0 kWh`; `battery_count=2`; unit capacity `1.5 kWh`; `battery_connection=PARALLEL` | [Kinet](https://vinfastauto.com/vn_vi/xe-may-dien-vinfast-kinet) |
| Kinet `9 giờ; 3,5 giờ nếu dùng sạc 1000 W` | two charging facts with the contexts above | [Kinet](https://vinfastauto.com/vn_vi/xe-may-dien-vinfast-kinet) |
| VF 8 The All-New `480-500 km (NEDC)` | numeric interval `[480, 500]`; `test_cycle=NEDC` | [VF 8 The All-New](https://vinfastauto.com/vn_vi/dat-coc-xe-vf8-the-all-new-2026) |
| Kyo `160 km khi lắp 2 pin` | `160 km`; `battery_count=2` | [Kyo](https://vinfastauto.com/vn_vi/xe-may-dien-vinfast-kyo) |

The same policy resolves additive and alternative contexts instead of retaining
only the first number. For example, the official FAQ publishes Evo Grand as
134 km plus 128 km with the auxiliary battery; the two facts become 134 km
without and 262 km with the auxiliary battery. See the
[official VinFast FAQ](https://vinfastauto.com/vn_vi/cau-hoi-thuong-gap).

## UNKNOWN dispositions

Every raw key in the current vehicle audit now has one of these explicit
dispositions:

- Technical definitions were added for rated power, wheelbase, ground
  clearance, seat height, tire specification, suspension, lock, battery type,
  charger type, trunk volume, IP rating, battery weight/location, acceleration,
  climbing speed, brakes, payload/vehicle weight, headlights, infotainment,
  maximum DC charging power, ABS/EBD, airbags, air conditioning, driver-seat
  adjustment, wheels and audio.
- `Màu sắc` is `IGNORED` in technical facts because normalized vehicle variants
  are its structured source of truth.
- `Tiền đặt cọc` is `IGNORED` because it is commerce data, not a technical
  specification.
- `TBD` is `IGNORED/PENDING_OFFICIAL_VALUE`; it never becomes a text fact.
- Legacy unitless car `maxPower` is interpreted as horsepower only for the
  reviewed `fastlane_car_nested_v1` path and converted to kW. An explicit unit
  in the value always wins.

## Source snapshots blocked from canonical promotion

Resolving syntax is not enough when the input itself is stale. The current
source review blocks the exact hashes below; a changed snapshot must be reviewed
again and is not covered by the old decision.

| Snapshot | Why it is blocked | Official source |
| --- | --- | --- |
| Amio S, Amio S2 | legacy Amio speed/power/chassis values copied into newer models | [Amio S](https://vinfastauto.com/vn_vi/xe-may-dien-vinfast-amio-s), [Amio S2](https://vinfastauto.com/vn_vi/xe-may-dien-vinfast-amio-S2) |
| Evo, Evo Lite | old lead-acid snapshot conflicts with the current LFP configuration | [Evo / Evo Lite](https://vinfastauto.com/vn_vi/xe-may-dien-evo) |
| EvoGrand, Evo Grand Lite | battery/range snapshot conflicts with current conditional values | [FAQ](https://vinfastauto.com/vn_vi/cau-hoi-thuong-gap), [brochure](https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dw3466f4c1/Document/Vinfast_EvoGrand_TSKT_FA_2025-07.pdf) |
| Feliz 2025 | snapshot duplicates Feliz II and omits the current conditional range | [FAQ](https://vinfastauto.com/vn_vi/cau-hoi-thuong-gap) |
| Flazz | range and trunk configuration conflict with current FAQ values | [FAQ](https://vinfastauto.com/vn_vi/cau-hoi-thuong-gap) |
| Evo Ultra Super Lite | only one bare range value and no current official product source found | [current official lineup](https://vinfastauto.com/vn_vi) |
| VF 6, VF 7, VF 8 | database snapshot collapses variant-sensitive powertrain values | [VF 6](https://shop.vinfastauto.com/vn_vi/dat-coc-xe-dien-vf6.html), [VF 7](https://shop.vinfastauto.com/vn_vi/dat-coc-xe-dien-vf7.html), [VF 8 brochure](https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dw4da7205d/raisinghands/documents/VF8_Brochure_VN.pdf) |
| VF 9 | range is duplicated across variants and DC charging is still `TBD` in the snapshot | [VF 9](https://shop.vinfastauto.com/vn_vi/dat-coc-o-to-dien-vinfast.html) |

## Current dry-run result

```text
Raw observations              : 658
Resolved                      : 297
Resolved facts (with context) : 304
Ignored by reviewed policy    : 20
Blocked by source review      : 341
Unknown                       : 0
Ambiguous                     : 0
Invalid                       : 0
Database writes               : 0
```

`UNKNOWN=0` and `INVALID=0` therefore do not mean all data is trusted. The
separate `SOURCE_CONFLICT` count is the gate that prevents syntactically valid
but stale values from being promoted.
