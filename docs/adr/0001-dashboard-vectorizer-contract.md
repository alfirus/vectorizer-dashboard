# ADR 0001: Dashboard ↔ Vectorizer contract

**Status:** Accepted
**Date:** 2026-11-26
**Authors:** Lina (Tech Lead, card t_8304a3c1)
**Accepted by:** Maisarah (Engineering Manager), 2026-11-26 — P1 batch review (kanban t_8304a3c1)

---

## Context

The dashboard (`vectorizer-dashboard`) and the backend (`vectorizer`) shipped as
two unversioned checkouts with a silent coupling (R2 C1): the dashboard depended
on exact vectorizer URL shapes, auth headers, and response shapes
(`/usage/daily`, `/messages/analytics`, `vectorizer_writeback_*` metric names)
with no stated pairing and no contract tests. The worst instance broke every
fresh setup: the dashboard README documented `VECTORIZER_URL` *with* an
`/api/v1` suffix while every route appends `/api/v1` itself (R2 D1), and only
the usage routes stamped `X-Agent`, so the documented `REQUIRE_X_AGENT=true`
rollout would 400 every ordinary dashboard page (R2 V3/C6).

Alternatives considered: (a) a shared OpenAPI spec + generated contract tests
(deferred to P2 — needs backend spec work first); (b) vendoring the vectorizer
as a submodule (rejected — the deploy already couples them via sibling
checkouts + one compose stack, and submodules add more friction than pinning).

## Decision

Dashboard v0.1.0 pairs with vectorizer **v0.4.0+** (`ae07294` and later) under
this contract:

1. `VECTORIZER_URL` is the **bare base** (e.g. `http://vectorizer:8091`) — the
   dashboard appends `/api/v1` itself. A suffixed URL is a setup error.
2. Every dashboard → vectorizer call carries `X-API-Key` **and**
   `X-Agent: dashboard` (generic proxy, brain, activity, usage routes).
3. The vectorizer never breaks `/usage/daily`, `/messages/analytics`, or the
   `vectorizer_writeback_*` metric names without a minor-version bump and a
   dashboard-side change in the same release train.
4. Settings cross the repo boundary by **file mount only** (`SETTINGS_ENV_PATH`
   → the vectorizer `.env`; `SETTINGS_SCHEDULES_PATH` → desired-state
   schedules). There is no vectorizer config API; `.env` writes require a
   vectorizer recreate to take effect.

## Consequences

- **Positive:** Fresh setups work from the README; `REQUIRE_X_AGENT=true` can be
  enabled fleet-wide without breaking the dashboard; the pairing is stated in
  `README.md` (Compatibility) and `CHANGELOG.md` instead of living in git history.
- **Negative:** Response-shape drift still degrades to silent zeros — no
  contract tests enforce this ADR yet (P2: OpenAPI + cross-repo CI).
- **Assumptions:** Vectorizer keeps the `/api/v1` prefix and header names
  stable across v0.4.x; the sibling-checkout deploy layout persists.

---

## References

- R2 audit Part B, C1/C6/V3/D1
- Kanban t_8304a3c1 (P1 batch: P1-2 version/release, P1-6 X-Agent)
- Vectorizer `README.md` Agent Attribution section; `docs/releases/v0.4.0.md`
- Follow-up: P2 OpenAPI + contract tests
