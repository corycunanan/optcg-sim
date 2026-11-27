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
| 3 | OPT-300 | Refactor use-game-session to support multiple instances per tab | 2 | OPT-298, OPT-299 | Done | [#199](https://github.com/corycunanan/optcg-sim/pull/199) | Gates finalization to one owner while preserving the hook surface. |
| 4 | OPT-301 | useSolitaireSession composite hook + perspective state machine | 3 | OPT-300 | Done | [#200](https://github.com/corycunanan/optcg-sim/pull/200) | Composite hook owns both live side sessions and perspective behavior. |
| 5 | OPT-302 | Wire game board to perspective + Flip button + fade-to-black transition | 3 | OPT-301 | Done | [#201](https://github.com/corycunanan/optcg-sim/pull/201) | 2026-05-01: Board chooses Solitaire mode and exposes perspective chrome. |
| 6 | OPT-303 | Solitaire polish: history filter, lobby/feed exclusion, refresh QA | 2 | OPT-302 | In Review | [#202](https://github.com/corycunanan/optcg-sim/pull/202) | 2026-05-01: Active-game surface is PVP-only; refresh prompt regression covered. |

**Status values:** use Linear status names verbatim (`Backlog`, `Todo`, `In Progress`, `In Review`, `Done`, `Canceled`). Don't invent.

**Next up:** Project closeout after OPT-303 merges.

---

## Handoffs

### OPT-300 -> OPT-301
**From:** session on 2026-05-01 - **Commit:** `2c37eef` - **PR:** #199

- **Primer:** `useGameSession` is now safe for dual Solitaire mounts by keeping player 0/PVP as the finalization owner and returning inert navigation handlers from player 1.
- **Read first:** `src/hooks/use-game-session.ts`, `src/hooks/use-game-session.test.tsx`, `src/hooks/use-game-finalizer.ts`, `src/components/game/live-game-shell.tsx`.
- **Gotchas / do NOT touch:** Do not de-duplicate `useCardDatabase` or `useRemoteGameStatus` inside `useGameSession`; OPT-301 should do that at the composite layer where both perspectives are visible.
- **Unresolved:** Build `useSolitaireSession`, own shared leave/finalize behavior at the composite layer, and decide when to hoist `useGameFinalizer` out of `useGameSession`.
- **Why this matters for OPT-301:** OPT-301 can mount `useGameSession(gameId, workerUrl, 0)` and `useGameSession(gameId, workerUrl, 1)` without duplicate finalize POSTs, then layer shared card/status reads and perspective state on top.

### OPT-301 -> OPT-302
**From:** session on 2026-05-01 - **Commit:** `9d4d77f` - **PR:** #200

- **Primer:** `useSolitaireSession(gameId, workerUrl)` now mounts both `useGameSession` sides and returns a perspective-aware surface shaped like the current side, plus `perspective` controls and a `sides` escape hatch.
- **Read first:** `src/hooks/use-solitaire-session.ts`, `src/hooks/use-solitaire-session.test.ts`, `src/components/game/live-game-shell.tsx`, `src/components/game/board.tsx`.
- **Gotchas / do NOT touch:** Keep standard PVP on `useGameSession`; OPT-302 should choose `useSolitaireSession` only for Solitaire mode/board wiring and avoid changing worker socket semantics.
- **Unresolved:** Shared leave/finalize/card/status de-duplication is still not hoisted; track separately if OPT-302 needs it for UX correctness.
- **Why this matters for OPT-302:** The board can now render from `session.game.myIndex`, call `session.perspective.flipPerspective()`, and dispatch through `session.game.sendAction()` without manually deciding which WebSocket owns the action.

### OPT-302 -> OPT-303
**From:** session on 2026-05-01 - **Commit:** `f9c52a4` - **PR:** #201

- **Primer:** `/game/[id]` now reads `game_sessions.mode` server-side, keeps PVP on `useGameSession`, and sends Solitaire games through `useSolitaireSession` with side-aware board chrome.
- **Read first:** `src/app/game/[id]/page.tsx`, `src/components/game/live-game-shell.tsx`, `src/hooks/use-solitaire-session.ts`, `src/app/api/game/[id]/route.ts`.
- **Gotchas / do NOT touch:** The Solitaire badge/Flip control is shell chrome outside `<ScaledBoard>`; keep board internals and worker socket semantics unchanged unless OPT-303 explicitly needs them.
- **Unresolved:** Manual browser QA against a real lobby-created Solitaire game is still the main remaining polish check; no separate tracking ticket beyond OPT-303.
- **Why this matters for OPT-303:** Polish can assume Solitaire board entry works, PVP stays on the old hook path, and the remaining work is history/feed exclusion plus refresh and UX QA.

### OPT-303 -> Project closeout
**From:** session on 2026-05-01 - **Commit:** `53dcdca` - **PR:** #202

- **Primer:** The global active-game query now filters to PVP so Solitaire sessions do not surface as competitive lobby blockers; code audit found no separate history/feed/stats/ranking queries yet.
- **Read first:** `src/app/api/game/active/route.ts`, `src/app/api/game/active/route.test.ts`, `src/hooks/use-solitaire-session.test.ts`.
- **Gotchas / do NOT touch:** Keep Solitaire re-entry owned by direct `/game/[id]` board routing and the lobby room flow; do not reintroduce Solitaire into `/api/game/active` unless a dedicated solo rejoin surface is designed.
- **Unresolved:** Local browser QA used seed account `Luffy_D` to create a Solitaire lobby, select decks, ready, start a game, and verify `/lobbies` still excludes the active Solitaire game from the PVP rejoin blocker; board-level refresh/concede dogfood is still blocked by the in-app browser being below the 1280x640 desktop gate.
- **Pointer:** Run `git show 53dcdca` for the implementation diff.
