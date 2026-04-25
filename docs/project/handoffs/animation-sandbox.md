---
linear-project: Animation Sandbox
linear-project-url: https://linear.app/optcg-sim/project/animation-sandbox-c2c60d216612
last-updated: 2026-04-24 (OPT-285 in review — unblocks OPT-286 + OPT-288)
---

# Animation Sandbox — Handoff Doc

A `/sandbox` surface for showcasing and validating atomic game-state animations in isolation. Each scenario is a declarative TS file that drives the real `BoardLayout` via a fake session provider, with per-scenario input gating (spectator vs interactive). Full scope: [`docs/project/ANIMATION-SANDBOX-SCOPE.md`](../ANIMATION-SANDBOX-SCOPE.md).

---

## Action Plan

Tickets in execution order. Ordering criteria: dependencies → estimate → priority → risk. The Linear project description is the source of truth if this table drifts.

| Order | Ticket | Title | Estimate | Depends on | Status | PR | Notes |
|-------|--------|-------|----------|------------|--------|----|-------|
| 1 | [OPT-285](https://linear.app/optcg-sim/issue/OPT-285) | Sandbox foundation: scenario types + manifest + helpers | 1 | — | In Review | [#129](https://github.com/corycunanan/optcg-sim/pull/129) | Gate ticket. Pure types + empty manifest + helper stubs. Unblocks OPT-286 and OPT-288. |
| 2 | [OPT-287](https://linear.app/optcg-sim/issue/OPT-287) | Curated card-data bundle for sandbox | 1 | — | Backlog | — | Independent of everything else — can be done in parallel with the gate ticket if anyone wants to split. ~20 hand-picked `CardData` snapshots covering Blocker, Counter, Double Attack, Rush, On-Play, On-KO, Trigger event, Stage, plus per-color leaders. |
| 3 | [OPT-288](https://linear.app/optcg-sim/issue/OPT-288) | Sandbox routes + navbar entry + scaffold migration | 2 | OPT-285 | Backlog | — | New top-level routes (`/sandbox`, `/sandbox/scaffold`, `/sandbox/[scenarioId]` placeholder), navbar entry, redirect from `/game/scaffold`. Hub UI reads the (initially empty) manifest. Independent of provider/runner work — can run in parallel with OPT-286/289. |
| 4 | [OPT-286](https://linear.app/optcg-sim/issue/OPT-286) | Sandbox session provider + apply-event reducer | 3 | OPT-285 | Backlog | — | The fake `useGameSession`. Critical path. Reducer is intentionally minimal — visible deltas only, no engine fork. Includes a smoke render test against `BoardLayout` to catch field drift. |
| 5 | [OPT-289](https://linear.app/optcg-sim/issue/OPT-289) | Scenario runner controller + playback model | 3 | OPT-285, OPT-286 | Backlog | — | The brain. Folds `apply-event` over events 0..i. Exposes play/pause/reset/stepForward/resolvePrompt. Step-backward is a documented non-goal — note this in the file's top comment. |
| 6 | [OPT-290](https://linear.app/optcg-sim/issue/OPT-290) | Input gate: spectator vs interactive | 2 | OPT-286, OPT-289 | Backlog | — | Wraps `sendAction`. Try the `interactionMode` prop on `BoardLayout` first; fall back to a pointer-events overlay only if prop addition touches >6 files. |
| 7 | [OPT-291](https://linear.app/optcg-sim/issue/OPT-291) | Scenario player page: board + control bar + info panel | 3 | OPT-287, OPT-288, OPT-289, OPT-290 | Backlog | — | Assembly point. Wires provider + runner + gate + UI into the `[scenarioId]` route. After this lands, the architecture is fully observable. |
| 8 | [OPT-292](https://linear.app/optcg-sim/issue/OPT-292) | Vertical slice: Draw 2 (spectator) + SELECT_TARGET (interactive) | 1 | OPT-291 | Backlog | — | The architecture's smoke test. Two scenarios that exercise the full pipeline. **If anything feels off here, patch the earlier ticket — don't paper over.** |
| 9 | [OPT-293](https://linear.app/optcg-sim/issue/OPT-293) | Scenario batch: Draws & Movement (6 scenarios) | 2 | OPT-292 | Backlog | — | Parallelizable with OPT-294/295/296. Exercises `use-field-arrivals` and the multi-DON fan-out. |
| 10 | [OPT-294](https://linear.app/optcg-sim/issue/OPT-294) | Scenario batch: Combat (5 scenarios) | 2 | OPT-292 | Backlog | — | Parallelizable. Counter-from-hand is the only interactive one in the batch; exercises `use-counter-pulse`. |
| 11 | [OPT-295](https://linear.app/optcg-sim/issue/OPT-295) | Scenario batch: KO + Life (4 scenarios) | 2 | OPT-292 | Backlog | — | Parallelizable. All spectator. Exercises the `kind: "ko"` flight branch and `LIFE_TRASH_REASONS` routing. |
| 12 | [OPT-296](https://linear.app/optcg-sim/issue/OPT-296) | Scenario batch: Prompts (4 interactive scenarios) | 2 | OPT-292 | Backlog | — | Parallelizable. Covers the four remaining prompt modals (`ARRANGE_TOP_CARDS`, `PLAYER_CHOICE`, `OPTIONAL_EFFECT`, `REVEAL_TRIGGER`). |
| 13 | [OPT-297](https://linear.app/optcg-sim/issue/OPT-297) | Polish: global mute default + clock determinism notes | 1 | OPT-291 | Backlog | — | Closeout. Mute toggle + persistence + the `docs/sandbox/clock-determinism.md` doc. Can be done any time after OPT-291; suggest doing it last so the determinism doc reflects what was actually built. |

**Status values:** use Linear status names verbatim (`Backlog`, `Todo`, `In Progress`, `In Review`, `Done`, `Canceled`).

**Next up:** OPT-286 (critical path) and OPT-288 (parallel) — both are unblocked once OPT-285 merges. OPT-287 also still parallelizable.

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

### OPT-285 → OPT-286
**From:** session on 2026-04-24 · **Commit:** `1ac7208` · **PR:** [#129](https://github.com/corycunanan/optcg-sim/pull/129)

- **Primer:** Scenario authoring contract is in place. `src/lib/sandbox/scenarios/{types,helpers,index}.ts` ship `Scenario`, `ScenarioStep`, `ExpectedResponse`, `PartialGameState`/`PartialPlayerState`, plus `makeCard` / `makeLifeStack` / `makeDonStack` / `playerSlot` helpers. The manifest exports `scenarios: Scenario[] = []`.
- **Read first:** `src/lib/sandbox/scenarios/types.ts` (the contract), `src/components/game/board-layout/board-layout.tsx` (props the provider must satisfy), `shared/game-types.ts` (full `GameState` shape — provider hydrates `PartialGameState` into this).
- **Gotchas / do NOT touch:** `ExpectedResponse.allowedActionTypes` is typed as `GameAction["type"][]`, not `string[]` — keep it that way; widening to `string[]` defeats the typo guard. `PartialGameState.players` is a tuple `[PartialPlayerState, PartialPlayerState]` — preserve the tuple-ness when hydrating so `players[0]` / `players[1]` stay non-null.
- **Unresolved:** None blocking. The reducer scope creep risk in `apply-event.ts` is real — the scope doc's "Risks" section calls it out; resist the urge to handle every event type up front.
- **Why this matters for OPT-286:** OPT-286's `apply-event.ts` reducer and `SandboxSessionProvider` consume `PartialGameState` and need to produce a value that satisfies `BoardLayout`'s `me`/`opp`/`turn`/`myIndex`/`cardDb`/`activePrompt` props. The provider is the field-drift surface — wire the smoke render test the scope doc calls for so this gets caught at PR time, not at runtime.

