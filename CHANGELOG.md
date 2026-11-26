# Changelog — vectorizer-dashboard

## v0.1.0 — 2026-11-26 (first versioned release)

Pairs with **vectorizer v0.4.0+** (`ae07294` and later); see README
Compatibility + `docs/adr/0001-dashboard-vectorizer-contract.md`.

### Security (P0, shipped in `16af213`)

- Bearer-token gate (`DASHBOARD_AUTH_TOKEN`) on every `/api/*` route
  (middleware + in-code re-checks), fail-closed when unset; per-IP rate limits.
- Settings API returns masked secrets only; newline-injection guard + quoted
  `.env` writes; secret values never overwritten by their own mask echo.
- Vault file-read path guard fixed (single realpath containment check).
- Vectorizer proxy: allowlisted method+path shapes only, `..`/slash segments
  rejected, request/response body caps. Chroma proxy: GET-only allowlist —
  POST/PUT/DELETE no longer exported.
- Reindex: single-flight guard, abort kills spawned children, no absolute
  server paths in responses, workspace name validated.

### Trust / contract (P1, this release)

- `X-Agent: dashboard` stamped on every vectorizer call (generic proxy, brain,
  activity, usage) — dashboard works under `REQUIRE_X_AGENT=true`.
- Foundations parity: MIT LICENSE, CI (`npm ci` + `tsc --noEmit` + `next build`),
  `tsconfig.tsbuildinfo` untracked.
- README scrubbed of live infra + fixed: bare `VECTORIZER_URL` (no `/api/v1`
  suffix), compose-`environment:` as the canonical Docker path (`.env.local`
  is local-dev only), single cron story (ubuntu crontab owns the two real
  jobs), real Docker settings path (`SETTINGS_ENV_PATH` mount, writes need a
  vectorizer recreate), corrected Security/Analytics/Pages/Structure sections.
- Cron reconciliation: settings schedules now track the two real jobs
  (`vectorizer-backup-daily` 03:00 UTC, `vectorizer-health-1h` hourly) as
  desired state; the settings page no longer claims Hermes-cron ownership.
- `SETTINGS_ENV_PATH` / `SETTINGS_SCHEDULES_PATH` / `REINDEX_SCRIPT_DIR`
  wired through compose for both stacks (server + local).
