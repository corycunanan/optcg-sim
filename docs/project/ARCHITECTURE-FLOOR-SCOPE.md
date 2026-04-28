---
status: Ready to start
created: 2026-04-28
owner: Cory Cunanan
linear-project: Architecture Floor
linear-project-url: https://linear.app/optcg-sim/project/architecture-floor-869e59d8e7ce
handoff-doc: docs/project/handoffs/architecture-floor.md
---

# Architecture Floor — Scope & Plan

> This doc is the **architectural source of truth**. Ticket descriptions reference it; the handoff doc tracks ticket-by-ticket execution. Use [`/ticket OPT-XXX`](../../.claude/skills/ticket/SKILL.md) to start any of the tickets below.
>
> **Audit input:** [`docs/architecture/CODEBASE-AUDIT-ARCHITECTURE-ROADMAP.md`](../architecture/CODEBASE-AUDIT-ARCHITECTURE-ROADMAP.md) (Codex, 2026-04-28).
> **Ticket-by-ticket batch:** [`docs/architecture/ARCHITECTURE-ROADMAP-TICKETS.md`](../architecture/ARCHITECTURE-ROADMAP-TICKETS.md) (revised plan after Claude critique pass).

---

## Summary

Tighten the runtime safety floor around the game engine, the app↔worker boundary, deck legality, CI, and board correctness. Ten tickets, eight PRs. Floor first; new features after.

This is not a refactor for its own sake. The 2026-04-28 audit found five concrete failure points — worker type-check is broken, app↔worker contracts are implicit, deck legality is client-only, game finalization isn't idempotent, and React correctness lints accumulate in the board — that compound the longer they sit. Solitaire (OPT-298) makes them worse. The floor closes the gaps.

---

## Goals

- One reliable verification ritual: `pnpm verify` mirrors CI and runs the worker type-check.
- Worker type-check is enforced in CI (currently failing — OPT-327 unblocks).
- The four app↔worker contract surfaces (init payload, game token, result callback, hidden-zone filtering) have regression tests.
- Server-side deck legality blocks illegal decks from starting any game (lobby or solitaire). Solitaire (OPT-298) reuses the same helper.
- Game result finalization is idempotent and centralized — repeated worker callbacks and fallback concedes cannot overwrite a finished game.
- Game-board React correctness warnings (`refs-during-render`, `set-state-in-effect`) are zero in `src/components/game/board-layout/` and `src/components/cards/`.
- Worker WebSocket security has a written audit + at least one quick-win fix; 3–5 follow-up tickets spawned per finding.
- Migration drift reconciled with a CI guard against future drift.
- OPT-324 engine flake has a root-cause fix; 20/20 clean local runs before close.

## Non-goals (this initiative)

- **Generalized "domain service layer."** Two helpers extracted (`requirePlayableDeck`, `finalizeGameResult`). No service-layer pattern.
- **Typed `AppResult<T>` / `AppError` discriminated unions.** Use structured error responses (`{ error: { code, message, details } }`).
- **Card effect support matrix and feature gates.** Product roadmap, not architecture floor. Schedule when solitaire stabilizes.
- **Route-aware shell split** (Codex P2-7). Lower leverage; defer.
- **Documentation marathon.** Data integrity stub lands as part of OPT-262; defer the rest (testing strategy doc, runtime boundaries doc, solo-dev runbook) until the architecture work above settles.
- **Request IDs and end-to-end observability** (Codex P2-4). Worker logging already exists (OPT-204). Defer to a follow-up after the WS audit.
- **Visual regression / E2E tests for game flow.** Separate concern.

---

## Architecture decisions

Why this set, in this order:

| # | Decision |
|---|---|
| 1 | **CI floor first.** Add `pnpm verify`, restore worker type-check, normalize worker test commands — all in one coordinated PR (OPT-326 + OPT-327 + OPT-328). Anything that ships after this can be trusted; anything that shipped before this could not be verified. |
| 2 | **Migration drift before any new schema.** OPT-262 must close before OPT-298 (Solitaire) starts a new schema column, or before any other migration. Drift compounds every following migration. |
| 3 | **Pin contracts before centralizing finalization.** OPT-329 (contract tests) lands before OPT-331 (finalization service). The contract tests pin the result-callback shape; the finalization service refactors what writes to it. |
| 4 | **Server-side deck legality is the OPT-298 dependency.** OPT-330 has explicit `blocks: OPT-298`. Solitaire backend should call `requirePlayableDeck`, not duplicate validation. |
| 5 | **Two helpers, not a layer.** `requirePlayableDeck` (OPT-330) and `finalizeGameResult` (OPT-331) are the only domain extractions. Add more only when concrete duplication shows up. |
| 6 | **Lint correctness ≠ lint cleanup.** OPT-332 targets the ~6 correctness-class warnings (`refs-during-render`, `set-state-in-effect`) that can become bugs. The other 400+ warnings stay for a separate cleanup ticket. Total warning count target: <350 (from 413). |
| 7 | **WS audit produces follow-ups.** OPT-333 is an audit ticket. Acceptance criteria: audit doc exists + ≥1 quick-win fix lands (likely payload size cap). The 3–5 finding-specific fixes spawn follow-up tickets. |
| 8 | **Cross-project ticket: OPT-324.** The Leader-vs-Leader engine flake lives in the **Game Board Reliability** project but is part of this initiative's PR 8. Project assignment intentionally left in Game Board Reliability; tracked here in the action plan. |

---

## Migration / PR plan

| PR | Tickets | Scope |
|----|---------|-------|
| **PR 1** | OPT-326 + OPT-327 + OPT-328 | CI floor trio. Atomic — verify needs type-check passing; type-check needs scripts; scripts feed verify. **Must land before any other PR in this initiative.** |
| PR 2 | OPT-262 | Migration drift reconciliation + CI drift guard. Independent after PR 1. |
| PR 3 | OPT-329 | App↔worker contract tests. Pure additions. |
| PR 4 | OPT-330 | Server-side deck legality. **Blocks OPT-298** (Solitaire). |
| PR 5 | OPT-331 | Idempotent game result finalization. Depends on PR 3. |
| PR 6 | OPT-332 | Lint correctness pass (board + modals). |
| PR 7 | OPT-333 | WS security audit + quick-win fix. Spawns follow-up tickets. |
| PR 8 | OPT-324 | Engine flake. Can land any time after PR 1. Cross-project (Game Board Reliability). |

PRs 2–8 can land in any order after their dependencies clear, except PR 1 must land first.

### Dependency graph

```
PR 1 (OPT-326/327/328) ─┬─→ PR 2 (OPT-262)
                        ├─→ PR 3 (OPT-329) ──→ PR 5 (OPT-331)
                        ├─→ PR 4 (OPT-330) ──→ unblocks OPT-298
                        ├─→ PR 6 (OPT-332)
                        ├─→ PR 7 (OPT-333)
                        └─→ PR 8 (OPT-324)
```

### Pre-merge gate

None — this initiative starts on a clean main. CI is green for app tests; worker type-check fails locally per OPT-327's findings. The first verify run on PR 1 will surface the full type-check error list.

---

## Verified baseline (commit `4c59d77`, 2026-04-28)

- `pnpm run type-check` — passes (app)
- `pnpm test` — passes (211 tests)
- `pnpm run lint` — passes with **413 warnings**
- `pnpm --dir workers/game run type-check` — **fails** (real type errors at `GameSession.ts:856`, `visibility.test.ts:16`; drifted fixtures)
- CI runs `cd workers/game && npx vitest run` (drifts from local `pnpm test`)
- `pnpm-workspace.yaml` declares `workers/*` — workspace structure is correct, just no root scripts

---

## Deferred / tech debt

- **Domain service layer for lobbies/decks/results** — only `requirePlayableDeck` and `finalizeGameResult` extracted. Revisit if duplication shows up.
- **Typed `AppResult<T>` / `AppError`** — use structured error responses. Revisit if UI distinction code becomes painful.
- **Card effect support matrix + feature gates** — product roadmap. Schedule when solitaire stabilizes.
- **Route-aware shell split** — lower leverage. Defer.
- **Testing strategy doc, runtime boundaries doc, solo-dev runbook** — defer until floor settles. Data integrity policy stub lands with OPT-262.
- **Request IDs and end-to-end observability** (Codex P2-4) — defer to follow-up after WS audit.
- **Lint cleanup beyond correctness class** (~400 remaining warnings after OPT-332) — separate ticket.
- **WS security findings beyond the audit's quick-win** — 3–5 follow-up tickets spawned by OPT-333.

---

## Done when

- All 8 PRs merged.
- `pnpm verify` is green and required in CI.
- Worker type-check enforced.
- Contract tests prevent app↔worker drift.
- Illegal decks cannot start any game.
- Game finalization is idempotent end-to-end.
- Board correctness lints are zero.
- WS security audit doc exists with follow-up tickets.
- Migration drift reconciled; CI drift guard in place.
- OPT-324 root-caused and fixed; 20/20 clean.

After this lands, OPT-298 Solitaire is unblocked from a safety standpoint.
