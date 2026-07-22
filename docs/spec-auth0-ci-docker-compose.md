---
title: 'Complete Auth0, CI, and Docker Compose foundation'
type: 'feature'
created: '2026-07-21'
status: 'done'
baseline_commit: 'f905aa5a10c5a0e9d1f728b59e57197c58e4ac5e'
context:
  - '{project-root}/api-contract/openapi.yaml'
  - '{project-root}/api-contract/components/security.yaml'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** FastLane has a working Next.js landing page and OpenAPI contract, but no executable Auth0 integration, automated CI, or reproducible container workflow. The current environment example also contains a real Supabase secret that must not remain in source control.

**Approach:** Keep Next.js 15 as the application/BFF boundary, add Auth0 Universal Login plus reusable bearer-token authorization utilities, and document the Auth0-to-Supabase third-party trust setup. Add a Node 22 CI pipeline and a standalone Next.js image/Compose service while keeping Supabase managed outside Docker.

## Boundaries & Constraints

**Always:** Preserve the approved hero CSS change; replace all committed credentials with placeholders; require RS256, exact issuer/audience, JWKS, expiry/`nbf`, namespaced Customer/Admin roles, and permissions for API bearer tokens; keep Auth0 session secrets server-only; install and validate root plus `api-contract` dependencies; use Node 22; treat Supabase as an external managed service; upgrade Next.js within 15.5 to a patched Auth0-compatible release.

**Ask First:** Changing from Next.js/BFF to a separate backend, adding a local Supabase/PostgreSQL stack, deploying to a real Auth0/Supabase tenant, or changing the existing OpenAPI authorization model.

**Never:** Commit real Auth0/Supabase secrets, expose a Supabase secret/service-role key through `NEXT_PUBLIC_*`, auto-grant Admin, add custom backend `/auth` endpoints that duplicate Universal Login, run `npm audit fix --force`, or modify the existing database schema/business logic.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Browser login | Anonymous visitor selects login | `/auth/login` redirects to Auth0 Universal Login and callback establishes an encrypted session | Auth0 callback errors do not create a session |
| Browser session | Valid Auth0 session | Header shows the user and logout link | Missing session remains anonymous |
| Protected API | Valid RS256 access token with required role/permissions | Verified claims are returned to the route policy | Invalid/missing token is `401`; insufficient access is `403` |
| Supabase trust | Auth0 ID token includes `role: authenticated` | Managed Supabase can apply authenticated RLS after dashboard integration | Missing claim is treated as anonymous by Supabase |
| Fresh CI checkout | No preinstalled modules or secrets | Both lockfiles install; tests, typecheck, OpenAPI check, build, and Docker build pass | Any failed gate stops CI |
| Compose startup | `.env.local` contains valid runtime configuration | One web container starts and `/api/v1/health` becomes healthy | Missing/invalid Auth0 config is documented and visible in logs |

</frozen-after-approval>

## Code Map

- `package.json`, `package-lock.json` -- pinned runtime/tooling and repeatable commands.
- `.env.example`, `docs/auth0-supabase.md`, `auth0/actions/add-token-claims.js` -- safe configuration contract and tenant-side setup.
- `lib/auth0.ts`, `middleware.ts`, `lib/auth/*` -- Auth0 session boundary, JWT verification, roles, and permissions.
- `app/page.tsx`, `components/header.tsx`, `app/api/v1/health/route.ts` -- login/session UI and container health endpoint.
- `next.config.ts`, `Dockerfile`, `.dockerignore`, `compose.yaml` -- standalone production container with managed Supabase.
- `.github/workflows/ci.yml` -- root/API-contract install and verification gates.
- `README.md` -- local, Auth0, Supabase, CI, and Docker operator instructions.

## Tasks & Acceptance

**Execution:**
- [x] Sanitize `.env.example`, rotate-safe placeholders, dependency versions, and root scripts.
- [x] Implement Universal Login/session UI and RS256 bearer-token role/permission policies with unit tests.
- [x] Add the Post-Login Action and exact Auth0/Supabase dashboard setup documentation.
- [x] Add health route, standalone image, web-only Compose service, and runtime secret handling.
- [x] Add CI and a reproducible README; verify from clean installs.

**Acceptance Criteria:**
- Given a fresh checkout, when documented install and verification commands run on Node 22, then root and API-contract checks pass without committed secrets.
- Given valid Auth0 configuration, when a visitor logs in and out, then Universal Login and the server session update the header correctly.
- Given invalid, valid-customer, and valid-admin bearer tokens, when authorization policies run, then they produce `401`, `403`, and authorized claims respectively.
- Given `.env.local`, when `docker compose up --build` runs, then the web service becomes healthy without a local database container.
- Given a pull request, when GitHub Actions runs, then typecheck, unit tests, OpenAPI validation, Next build, and Docker build are required gates.

## Spec Change Log

- 2026-07-21: Review hardening made authorization fail-closed, added runtime smoke testing, and resolved the PostCSS advisory.

## Design Notes

Auth0 roles serve application authorization through a namespaced claim on access and ID tokens. A separate literal `role: authenticated` claim is added only to the ID token because managed Supabase requires it for third-party authentication/RLS. Actual tenant creation, callback registration, Action deployment, role assignment, Supabase dashboard integration, and secret rotation remain human-owned external steps because credentials are not available in the repository.

## Verification

**Commands:**
- `npm ci && npm ci --prefix api-contract` -- both lockfiles install cleanly.
- `npm test && npm run typecheck && npm run check:openapi && npm run build` -- code and contract gates pass.
- `docker build -t fastlane:verify .` -- standalone image builds.
- `docker compose config` -- web-only Compose configuration resolves with placeholder-safe inputs.

**Result (2026-07-21):** Both clean installs passed. `npm run verify` passed 23 unit tests, TypeScript, all five OpenAPI check groups, and the Next.js production build. The standalone Docker image built successfully; runtime smoke tests returned `200` from both `/api/v1/health` and the session-backed homepage. `docker compose config` passed with one web service and no database service. The application dependency audit returned zero vulnerabilities after overriding Next.js's bundled PostCSS with patched `8.5.20`. The source secret-pattern scan returned no candidates, and the pre-existing `app/globals.css` SHA-256 remained unchanged.

## Suggested Review Order

**Authentication and authorization**

- Start at the Auth0 SDK boundary for Universal Login and encrypted sessions.
  [`auth0.ts:3`](../lib/auth0.ts#L3)

- Fail-closed policies always require roles; Admin additionally requires permissions.
  [`authorize.ts:41`](../lib/auth/authorize.ts#L41)

- Verify exact RS256 issuer/audience while preserving operational JWKS failures.
  [`jwt.ts:67`](../lib/auth/jwt.ts#L67)

- Reject split tenants and any API audience matching the application client ID.
  [`config.ts:28`](../lib/auth/config.ts#L28)

- Emit normalized role claims and deny users without an assigned application role.
  [`add-token-claims.js:7`](../auth0/actions/add-token-claims.js#L7)

- Bind the encrypted server session to homepage login/logout presentation.
  [`page.tsx:16`](../app/page.tsx#L16)

**Delivery and runtime**

- CI installs both lockfiles and smoke-tests the built production container.
  [`ci.yml:15`](../.github/workflows/ci.yml#L15)

- Build a minimal non-root standalone Next.js image on Node 22.
  [`Dockerfile:1`](../Dockerfile#L1)

- Run only the web service and require explicit runtime configuration.
  [`compose.yaml:1`](../compose.yaml#L1)

- Keep managed Supabase outside Compose while exposing a deterministic health check.
  [`route.ts:1`](../app/api/v1/health/route.ts#L1)

**Configuration, tests, and operations**

- Exercise adversarial JWT, policy, header, role, permission, and outage cases.
  [`authorize.test.ts:80`](../lib/auth/authorize.test.ts#L80)

- Test tenant-side claim normalization and denied unassigned users.
  [`add-token-claims.test.js:22`](../auth0/actions/add-token-claims.test.js#L22)

- Follow exact Auth0, RBAC, Action, Supabase, and secret-rotation steps.
  [`auth0-supabase.md:15`](auth0-supabase.md#L15)

- Use documented clean-install, verification, Compose, and CI commands.
  [`README.md:13`](../README.md#L13)
