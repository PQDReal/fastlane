# Performance baseline

Baseline captured from `next build` followed by `next start -p 3100` on 2026-08-03.
The values below are server response durations from the local production server and are
intended for before/after comparison, not as public-network Web Vitals.

| Route | First request | Warm request | HTML size |
| --- | ---: | ---: | ---: |
| `/` | 2714 ms | 2916 ms | ~99 KB |
| `/bikes` | 2211 ms | 1431 ms | ~88 KB |
| `/bikes/amio` | 4182 ms | 3480 ms | ~122 KB |
| `/accessories` | 3925 ms | 3264 ms | ~470 KB |
| `/deposit` | 5138 ms | 2211 ms | ~492 KB |

Build baseline:

- Shared first-load JavaScript: 102 KB.
- Customer-facing routes: approximately 169–185 KB first-load JavaScript.
- Middleware bundle: 156 KB.
- Most public catalog routes are dynamic and execute server/database work on navigation.

Initial targets:

- Remove local-user database lookups from public requests.
- Warm server response below 500 ms for cached public catalog pages.
- LCP below 2.5 seconds on representative mobile hardware.
- Immediate pressed/loading feedback within 100 ms of navigation input.

## Phase 1 result

After removing local-user database validation from public routes and caching the
motorbike catalog for five minutes:

| Route | First request | Warm request |
| --- | ---: | ---: |
| `/` | 1587 ms | 547 ms |
| `/bikes` | 459 ms | 513 ms |
| `/bikes/amio` | 534 ms | 490 ms |
| `/accessories` | 1787 ms | 1012 ms |
| `/deposit` | 929 ms | 814 ms |

The measurements confirm that catalog/database work was a material bottleneck.
Accessories and deposit remain the next server-rendering priorities because their
HTML responses are also substantially larger than the vehicle catalog pages.
