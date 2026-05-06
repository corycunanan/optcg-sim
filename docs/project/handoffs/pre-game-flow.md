---
linear-project: Pre-Game Flow
linear-project-url: https://linear.app/optcg-sim/project/pre-game-flow-6e2829b12a96
last-updated: 2026-05-06
---

# Pre-Game Flow — Handoff Doc

OPTCG §5-2-1 pre-game procedure: priority decision (2d6), first/second choice, start-of-game leader effects (Imu), opening-hand mulligan, life placement. OPT-366 lays the foundation; OPT-365/367/368 layer on top.

---

## Action Plan

Tickets in execution order. Ordering criteria: dependencies → estimate → priority → risk.

| Order | Ticket | Title | Estimate | Depends on | Status | PR | Notes |
|-------|--------|-------|----------|------------|--------|----|-------|
| 1 | OPT-366 | Pre-game flow: priority decision (2d6) + hand-redraw mulligan + setup restructure | 5 | — | In Review | — | Foundation — unblocks all the rest |
| 2 | OPT-365 | Wire START_OF_GAME_EFFECT processing for OP13-079 Imu (Mary Geoise stage play) | 2 | OPT-366 | Backlog | — | Drops into the START_OF_GAME_FX phase the FSM already exposes |
| 3 | OPT-367 | Lobby settings: host-configurable pre-game flow (turn order + priority roll opt-out) | 3 | OPT-366 | Backlog | — | Adds host overrides; pure surface work above the FSM |
| 4 | OPT-368 | Solitaire-mode pre-game UX: streamline priority decision when one user controls both sides | 2 | OPT-366 | Backlog | — | Solitaire UX polish; mechanics already work |

**Status values:** use Linear status names verbatim (`Backlog`, `Todo`, `In Progress`, `In Review`, `Done`, `Canceled`). Don't invent.

**Next up:** OPT-365 once OPT-366 merges (highest priority, smallest estimate, foundation in place).

---

## Handoffs

Append new entries at the bottom. Each entry is written *by* the agent who just finished a ticket, *for* the agent who picks up the next ticket.

### OPT-366 → OPT-365
**From:** session on 2026-05-06 · **Commit:** _to be filled in commit message_ · **PR:** _to be filled in_

- **Primer:** Added a pre-game finite state machine (`workers/game/src/engine/pregame.ts`) that drives priority roll → first/second prompt → **`START_OF_GAME_FX` (passthrough today)** → hand deal → mulligan → life placement → first turn. `GameSession.handleInit` no longer jumps straight into `runStartOfTurnAutoPhases`; it enters the FSM via `startPregame` + `drainPregame`. New `pregame: PregameState | null` lives on the shared `GameState`; clients render `<PregameOverlay>` when non-null.
- **Read first:** `workers/game/src/engine/pregame.ts` (the FSM — note `START_OF_GAME_FX` is the seam OPT-365 plugs into), `workers/game/src/engine/setup.ts` (`prepareDecksAndLeaders`/`dealOpeningHand`/`placeLifeCards` — primitives the FSM composes), `shared/game-types.ts` (`PregameState`, `TurnState.firstPlayerIndex`).
- **Gotchas / do NOT touch:**
  - `state.turn.firstPlayerIndex` is **optional** in the type — read sites must default to `0` (`?? 0`). Don't make it required without sweeping every test fixture that builds a `TurnState` literal. See `phases.ts` for the read pattern.
  - `executeConcede` now clears `pendingPrompt`. Don't revert — without it the pipeline early-returns on the prompt and never builds `gameOver`. Test in `opt-366-pregame-flow.test.ts` ("CONCEDE during PRIORITY_CHOICE") will catch a regression.
  - The pregame `PLAYER_CHOICE` prompts are tagged with `effectDescription === "PREGAME_FIRST_OR_SECOND"` / `"PREGAME_MULLIGAN"`. `board-modals.tsx` skips the generic `PlayerChoiceModal` when the description starts with `"PREGAME_"` — keep that filter when adding more pregame prompt types or you'll double-render.
  - `mulliganDone` field on `StoredSession` is now legacy (optional) — replaced by `state.pregame.mulliganDecisions`. Keep the field optional for in-flight DOs, but don't write to it.
- **Unresolved:**
  - START_OF_GAME_EFFECT processing is a single-line passthrough (`pregame.ts` `START_OF_GAME_FX` case). OPT-365 fills in the §5-2-1-5-1 ordering (priority-decider's leader effects fire first, then opponent's) and the §5-2-1-5-2 reshuffle if a deck-touching effect fired.
  - The spec mentioned a dedicated `game:pregame_priority_rolled` server message; deferred — clients animate off the `pregame.priorityRolls` field flipping non-null in `game:state`. Add the dedicated message only if the diff-driven animation feels janky in real testing.
- **Why this matters for OPT-365:** The FSM has a slot waiting at `pregame.phase === "START_OF_GAME_FX"`. After OPT-365 lands, that case stops being a passthrough and instead invokes the trigger pipeline for both leaders' `START_OF_GAME_EFFECT` rule_modifications in §5-2-1-5-1 order, then transitions to `HAND_DEAL`. Tests in `opt-366-pregame-flow.test.ts` ("hand dealing ordering") already lock in that hand is dealt **after** START_OF_GAME_FX — those tests will start exercising the real Imu effect once OPT-365 wires it up.
