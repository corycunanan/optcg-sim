---
linear-project: Architecture Floor
linear-project-url: https://linear.app/optcg-sim/project/architecture-floor-869e59d8e7ce
last-updated: 2026-04-28 (project kicked off, all tickets Backlog)
---

# Architecture Floor — Handoff Doc

Tighten the runtime safety floor around the game engine, the app↔worker boundary, deck legality, CI, and board correctness. Ten tickets, eight PRs. Floor first; new features after. Full scope: [`docs/project/ARCHITECTURE-FLOOR-SCOPE.md`](../ARCHITECTURE-FLOOR-SCOPE.md).

---

## Action Plan

Tickets in execution order. Ordering criteria: dependencies → estimate → priority → risk. The Linear project description is the source of truth if this table drifts.

| Order | Ticket | Title | Estimate | Depends on | Status | PR | Notes |
|-------|--------|-------|----------|------------|--------|----|-------|
| 1 | [OPT-326](https://linear.app/optcg-sim/issue/OPT-326) | Add root `pnpm verify` and align CI with local verification | 2 | — | Backlog | — | Gate ticket for PR 1. Adds `pnpm verify` running lint + app type-check + worker type-check + app tests + worker tests + build. CI mirrors verify. |
| 2 | [OPT-327](https://linear.app/optcg-sim/issue/OPT-327) | Restore `workers/game` type-check and refresh stale engine test fixtures | 5 | — | Backlog | — | Real type fixes at `GameSession.ts:856` (`ActiveEffect`/`RuntimeActiveEffect`) and `visibility.test.ts:16`. Add `@types/node` to worker. Build shared test factories module. **No `as any` patches.** |
| 3 | [OPT-328](https://linear.app/optcg-sim/issue/OPT-328) | Normalize worker test/type-check execution from repo root and CI | 2 | — | Backlog | — | Workspace already declared in `pnpm-workspace.yaml`. Just adds root scripts via `pnpm --filter optcg-game ...` and replaces CI's `cd workers/game && npx vitest run`. |
| 4 | [OPT-262](https://linear.app/optcg-sim/issue/OPT-262) | Reconcile Prisma migration drift (`testOrder` column + modified `simplify_lobby_for_m3`) | 3 | OPT-326 (PR 1 first) | Backlog | — | **Blocks OPT-298** (Solitaire schema). Two issues: undocumented `testOrder` column, modified `simplify_lobby_for_m3`. Add CI drift guard. |
| 5 | [OPT-329](https://linear.app/optcg-sim/issue/OPT-329) | App↔Worker contract tests: game init, tokens, result callback, hidden-zone filtering | 5 | OPT-327 | Backlog | — | New `src/__tests__/contracts/`. Pin init payload, token verify, result callback (`GameResultSchema`), notify-end fallback, hidden-zone filtering. |
| 6 | [OPT-330](https://linear.app/optcg-sim/issue/OPT-330) | Enforce playable deck legality server-side before lobby/solitaire game start | 5 | OPT-326 (PR 1 first) | Backlog | — | **Blocks OPT-298**. Extracts `requirePlayableDeck(deckId, userId)` to `src/lib/decks/`. Wires into `lobbies/route.ts` and `lobbies/join/route.ts`. Returns 422 with structured `details`. |
| 7 | [OPT-331](https://linear.app/optcg-sim/issue/OPT-331) | Centralize idempotent game result finalization across worker callback and fallback concede | 3 | OPT-329 | Backlog | — | New `src/lib/game/finalize.ts` with `finalizeGameResult()`. Conditional update on non-terminal state. Adds `reasonCode` enum. Tests cover three idempotency races. |
| 8 | [OPT-332](https://linear.app/optcg-sim/issue/OPT-332) | Triage React lint warnings; fix board correctness warnings (refs-during-render, set-state-in-effect) | 5 | — | Backlog | — | Targets ~6 correctness-class warnings: `board-layout.tsx:127, 137, 330`, `hand-layer.tsx:157`, `card-detail-modal.tsx:100`, two more at `:84`/`:52`. Total warning count target: <350 (from 413). |
| 9 | [OPT-333](https://linear.app/optcg-sim/issue/OPT-333) | Worker WebSocket security audit: token replay, action spam, payload limits, reconnect abuse | 3 | OPT-327 | Backlog | — | Audit-and-triage ticket. Output: `docs/architecture/WORKER-SECURITY-AUDIT.md` + 3–5 follow-up tickets + ≥1 quick-win fix (likely payload cap). |
| 10 | [OPT-324](https://linear.app/optcg-sim/issue/OPT-324) | Flaky test: opt-243 Leader-vs-Leader battle termination intermittently emits 0 END_OF_BATTLE | 3 | OPT-328 | Backlog | — | **Cross-project: lives in Game Board Reliability.** Tracked here as part of PR 8. Root-cause non-determinism in trigger ordering. 20/20 clean runs before close. |

**Total estimate:** 36 points (33 in Architecture Floor + 3 from cross-project OPT-324).

**Status values:** use Linear status names verbatim (`Backlog`, `Todo`, `In Progress`, `In Review`, `Done`, `Canceled`).

**Next up:** **OPT-326** — Add root `pnpm verify` and align CI. PR 1 is the trio OPT-326 + OPT-327 + OPT-328 landing together.

### PR phasing

| PR | Tickets | Why this batch |
|----|---------|----------------|
| **PR 1** | OPT-326, OPT-327, OPT-328 | CI floor trio. Atomic — verify needs type-check passing; type-check needs scripts; scripts feed verify. **Must land first.** |
| PR 2 | OPT-262 | Migration drift reconciliation + CI drift guard. Independent after PR 1. |
| PR 3 | OPT-329 | App↔worker contract tests. Pure additions. |
| PR 4 | OPT-330 | Server-side deck legality. **Unblocks OPT-298 Solitaire.** |
| PR 5 | OPT-331 | Idempotent finalization. Depends on PR 3. |
| PR 6 | OPT-332 | Board lint correctness. Independent. |
| PR 7 | OPT-333 | WS security audit + quick-win fix. |
| PR 8 | OPT-324 | Engine flake. Cross-project (Game Board Reliability). |

PRs 2–8 can land in any order after their dependencies clear.

### Pre-merge gate

None — this initiative starts on a clean main. CI is green for app tests; worker type-check fails locally per OPT-327's failure list. PR 1 will surface the full error inventory on first run.

### Cross-project tickets

- **OPT-324** lives in the **Game Board Reliability** project but is part of this initiative's PR 8. Tracked here in the action plan; project assignment intentionally left in Game Board Reliability so that project's view stays accurate.

### Deferred / tech debt

- Domain service layer for lobbies/decks/results — only the two helpers extracted in this initiative.
- Typed `AppResult<T>` / `AppError` — structured error responses are sufficient.
- Card effect support matrix + feature gates — product roadmap.
- Route-aware shell split — lower leverage.
- Testing strategy doc, runtime boundaries doc, solo-dev runbook — defer until floor settles.
- Request IDs / end-to-end observability — defer to follow-up after WS audit.
- Lint cleanup beyond correctness class (~400 remaining warnings) — separate ticket after OPT-332.

See [`docs/project/ARCHITECTURE-FLOOR-SCOPE.md`](../ARCHITECTURE-FLOOR-SCOPE.md) §"Deferred / tech debt" for full detail.

---

## Handoffs

Append new entries at the bottom. Each entry is written *by* the agent who just finished a ticket, *for* the agent who picks up the next ticket.

<!--
Copy this block when writing a new handoff:

### OPT-XXX → OPT-YYY
**From:** session on YYYY-MM-DD · **Commit:** `<short-sha>` · **PR:** #NN

- **Primer:** <1 sentence — what changed at the system level>
- **Read first:** `path/to/file.ts`, `path/to/other.ts`
- **Gotchas / do NOT touch:** <what to leave alone and why, OR "none">
- **Unresolved:** <follow-ups, open questions, deferred work, tracking IDs — OR "none">
- **Why this matters for OPT-YYY:** <1–2 sentences tying the above to the next ticket's surface>

-->
