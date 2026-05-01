---
linear-project: Solitaire Mode
linear-project-url: https://linear.app/optcg-sim/project/solitaire-mode
last-updated: 2026-05-01
---

# Solitaire Mode - Handoff Doc

Solitaire games now start through the Lobby Room flow; the remaining work is the client composite, board perspective UI, and final polish.

---

## Action Plan

Tickets in execution order. Ordering criteria: dependencies -> estimate -> priority -> risk.

| Order | Ticket | Title | Estimate | Depends on | Status | PR | Notes |
|-------|--------|-------|----------|------------|--------|----|-------|
| 1 | OPT-298 | Solitaire backend: init endpoint + token playerIndex claim + mode column | 3 | - | Done | - | Foundation for mode and token claims; superseded by Lobby Room UX flow for creation. |
| 2 | OPT-299 | Solitaire entry page: /solitaire route + dual deck picker | 2 | OPT-298 | Done | - | Historical entry-page scope; Lobby Room UX is now the creation surface. |
| 3 | OPT-300 | Refactor use-game-session to support multiple instances per tab | 2 | OPT-298, OPT-299 | In Review | [#199](https://github.com/corycunanan/optcg-sim/pull/199) | Gates finalization to one owner while preserving the hook surface. |
| 4 | OPT-301 | useSolitaireSession composite hook + perspective state machine | 3 | OPT-300 | Backlog | - | Owns shared card DB/status polling and perspective behavior. |
| 5 | OPT-302 | Wire game board to perspective + Flip button + fade-to-black transition | 3 | OPT-301 | Backlog | - | UI layer after the composite contract exists. |
| 6 | OPT-303 | Solitaire polish: history filter, lobby/feed exclusion, refresh QA | 2 | OPT-302 | Backlog | - | Final product cleanup and QA pass. |

**Status values:** use Linear status names verbatim (`Backlog`, `Todo`, `In Progress`, `In Review`, `Done`, `Canceled`). Don't invent.

**Next up:** OPT-301.

---

## Handoffs

### OPT-300 -> OPT-301
**From:** session on 2026-05-01 - **Commit:** `2c37eef` - **PR:** #199

- **Primer:** `useGameSession` is now safe for dual Solitaire mounts by keeping player 0/PVP as the finalization owner and returning inert navigation handlers from player 1.
- **Read first:** `src/hooks/use-game-session.ts`, `src/hooks/use-game-session.test.tsx`, `src/hooks/use-game-finalizer.ts`, `src/components/game/live-game-shell.tsx`.
- **Gotchas / do NOT touch:** Do not de-duplicate `useCardDatabase` or `useRemoteGameStatus` inside `useGameSession`; OPT-301 should do that at the composite layer where both perspectives are visible.
- **Unresolved:** Build `useSolitaireSession`, own shared leave/finalize behavior at the composite layer, and decide when to hoist `useGameFinalizer` out of `useGameSession`.
- **Why this matters for OPT-301:** OPT-301 can mount `useGameSession(gameId, workerUrl, 0)` and `useGameSession(gameId, workerUrl, 1)` without duplicate finalize POSTs, then layer shared card/status reads and perspective state on top.
