# GorPliaj Public SvelteKit — Phase 6 Release Validation & Stabilization Plan

## Scope of this phase
This document covers release validation and production safety checks for public routes migrated to SvelteKit:

- `/`
- `/events`
- `/events/[slug]`
- `/menu`
- `/booking`
- `/map`
- `/about`

It intentionally avoids admin/API architecture changes and keeps `/legacy` fallback in place.

## 1) Release-readiness audit (route-by-route)
Use this as an execution checklist before production rollout.

### Route checklist (apply to each route)
- [ ] Route loads without client/runtime errors.
- [ ] Data load path points to production API endpoints.
- [ ] Loading state is visible and non-blocking.
- [ ] Empty state copy is actionable and user-safe.
- [ ] Error state is explicit (no silent failure).
- [ ] `<title>` and meta description are present and sane.
- [ ] Mobile layout stable at 360px and 390px widths.
- [ ] Internal links work (no broken transitions).
- [ ] Hydration warning-free in browser console.

### Suggested smoke checks
Run after deploy in staging/prod mirror:

```bash
curl -I https://<host>/
curl -I https://<host>/events
curl -I https://<host>/menu
curl -I https://<host>/booking
curl -I https://<host>/map
curl -I https://<host>/about
```

Expect: `200` for public pages and no redirect loops.

## 2) Runtime resilience expectations

### `/menu`
- API 500: show fallback copy + retry action.
- Empty payload: show "menu temporarily unavailable" state with support path.
- Never render blank screen.

### `/events` + `/events/[slug]`
- API unavailable: show non-fatal fallback state and keep page shell usable.
- Missing slug: show explicit not-found state with link back to `/events`.

### `/booking`
- Availability load failure: inline alert + retry control.
- Submit failure: preserve form data and offer retry.
- Avoid duplicate submissions while retrying.

### `/map`
- Partial/unavailable data: render what is available, hide broken panels, show warning copy.
- Never fail entire page on partial API response.

## 3) Observability and diagnostics (lightweight)

### Server-side
- Structured log for public route resolver (`public_route_resolution`) including:
  - route
  - outcome (`svelte` vs `legacy`)
  - reason (if fallback)
  - durationMs
- One-time warning if Svelte build is missing (`public_svelte_build_missing`).

### Client-side
- Keep client error logging concise and tied to route + data source.
- Do not log full payloads or PII.

## 4) Service worker rollout validation
- Navigation HTML must prefer network to avoid stale app shells.
- Static cache must be versioned (`CACHE_NAME`) and old versions cleaned on activate.
- `SKIP_WAITING` should be explicit message-driven only (not forced on install).
- Avoid intrusive UX; keep update signal optional and safe.

## 5) Rollback / fallback behavior

Current rollback behavior in server:
1. Public route requested.
2. If `DISABLE_SVELTE_PUBLIC=true`, serve legacy index immediately.
3. Else if `public/public-svelte/index.html` exists, serve Svelte build.
4. Else fallback to legacy index and log warning once.
5. Legacy static is always available under `/legacy`.

## 6) Legacy retirement candidates (post-soak)

### Must keep during rollout window
- `/legacy` route and legacy assets.
- Public route fallback in Express.
- SW conservative update behavior.

### Likely safe to remove after soak (once metrics stay healthy)
- Legacy public route templates that overlap migrated pages.
- Legacy-only client JS for migrated public pages.

### Uncertain / monitor longer
- Shared assets used by both legacy and migrated surfaces.
- Any route with unstable API/error-rate trends.

## 7) Day-0 rollout checklist (concise)
- [ ] Confirm Svelte build exists at `public/public-svelte/index.html`.
- [ ] Confirm `DISABLE_SVELTE_PUBLIC` is **not** set.
- [ ] Run public route smoke checks.
- [ ] Verify logs show `public_route_resolution` with expected `svelte` outcomes.
- [ ] Validate `/legacy` opens normally.
- [ ] Verify `/menu`, `/events`, `/booking`, `/map` error states manually.

## 8) Post-release 24h monitoring checklist
- [ ] Track 4xx/5xx trends for public routes and related APIs.
- [ ] Watch fallback rate (`outcome=legacy`) — should remain near zero once build is present.
- [ ] Review client/runtime error logs for hydration/load failures.
- [ ] Verify booking submission success rate and retry failures.
- [ ] Re-check SW version adoption and stale-shell reports.

## 9) Rollout recommendation gate
Use this gate before fully retiring legacy fallback:

- **Ready for rollout**: no blockers in route checks + stable API + low fallback rate.
- **Rollout with caution**: minor UX defects in non-critical states, fallback validated.
- **Blockers remain**: broken load path, silent failures, or unstable booking/menu flows.
