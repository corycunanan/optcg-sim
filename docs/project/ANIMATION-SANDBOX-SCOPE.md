# Animation Sandbox — Scope & Plan

**Status:** Ready to start (gate ticket OPT-285 in Backlog)
**Created:** 2026-04-24
**Owner:** Cory Cunanan
**Linear project:** [Animation Sandbox](https://linear.app/optcg-sim/project/animation-sandbox-c2c60d216612)
**Action Plan + cross-session handoffs:** [`docs/project/handoffs/animation-sandbox.md`](handoffs/animation-sandbox.md)

> This doc is the **architectural source of truth**. Ticket descriptions reference it; the handoff doc tracks ticket-by-ticket execution. Use [`/ticket OPT-XXX`](../../.claude/skills/ticket/SKILL.md) to start any of the tickets below.

---

## Summary

A new `/sandbox` surface for showcasing and validating atomic game-state animations in isolation. Each scenario is a declarative TS file that defines an initial game state, a script of `GameEvent`s to play back, and an input mode (spectator or interactive). The same `BoardLayout` component used in production renders the scenario — the showcase exercises the real animation pipeline (`use-card-transitions`, `use-field-arrivals`, `use-counter-pulse`, `use-hand-animation-state`, `card-animation-layer`, all five prompt modals) without touching the WebSocket or the worker.

---

## Goals

- A canonical demo surface for every animation moment we ship
- A fast iteration loop when polishing motion or fixing visual bugs
- An onboarding tool for new contributors to see the animation vocabulary
- A foundation that future visual regression tests can be layered on

## Non-goals (v1)

- Step-backward in playback (forward-step only — see Risks)
- Visual regression / snapshot tests (foundation only — see Decisions #4)
- Running scenarios against the live engine (engine is bypassed by design)
- Authoring scenarios from a UI — all scenarios are code, registered in a manifest
- Multiplayer or shared-session scenario viewing

---

## UX flow

**Entry:** New top-level navbar item "Sandbox", visible to all signed-in users. Routes:

```
/sandbox                  → hub: scenarios grouped by category + Layout Reference link
/sandbox/scaffold         → existing BoardScaffold (migrated from /game/scaffold)
/sandbox/[scenarioId]     → scenario player
```

The navbar's `pathname.startsWith("/game/")` skip rule does **not** apply to `/sandbox/*` — nav stays visible during playback.

**Hub page:** category grid grouping scenarios by `ScenarioCategory` (`draws`, `movement`, `combat`, `ko`, `life`, `effects`, `prompts`, `phase`). Each tile shows title + 1-line description + category badge. A "Layout Reference" tile at the top links to the migrated `BoardScaffold`.

**Scenario player layout:**

```
┌──────────────────────────────────────────────────────────────┐
│ Navbar (existing, visible)                                   │
├──────────────────────────────────────────────────────────────┤
│ ← Back to Sandbox  ·  Scenario Title                         │
├──────────────────────────────────────────────┬───────────────┤
│                                              │ INFO PANEL    │
│                                              │  - description│
│            BoardLayout                       │  - cards used │
│      (rendered through provider)             │  - response   │
│                                              │    hint       │
├──────────────────────────────────────────────┴───────────────┤
│  ▶ Play   ⏸ Pause   ⟲ Reset   ⏭ Step      step 4 / 12   🔇  │
└──────────────────────────────────────────────────────────────┘
```

**Input gating** is per-scenario:

| `inputMode` | Behavior |
|---|---|
| `spectator` | All `sendAction` calls swallowed; cards non-draggable; menus disabled. "Watching" badge top corner. |
| `interactive` | Only actions matching `expectedResponse.allowedActionTypes` forwarded; the runner advances when `expectedResponse.predicate` returns true. |

---

## Architecture — recommended approach

**Fake session provider, replayed event log, zero engine changes.**

```
ScenarioRunner (controller)
  ├─ holds: scenario, currentEventIndex, playbackState, derived gameState
  ├─ exposes: play(), pause(), reset(), stepForward(), resolvePrompt()
  └─ feeds: SandboxSessionProvider
                ├─ game.gameState        ← initialState + events 0..i replayed
                ├─ game.activePrompt     ← scenario's pending prompt (if any)
                ├─ game.eventLog         ← replayed slice
                ├─ game.sendAction       ← scenario-aware: filtered + advances runner
                └─ everything else       ← pass-through/no-op
                     ↓
                BoardLayout (production component, unchanged)
```

The provider exposes the same shape `useGameSession` returns so `BoardLayout` is identical to production. Scenario state is rebuilt by folding `apply-event` over `events 0..currentStepIndex` from `initialState` — making `reset` trivial (set index to 0) and `stepForward` correct under any timing.

`apply-event.ts` is the one piece of new state logic. It handles **only the visible deltas** (zone moves, DON counts, life count, rest/active). The engine is **not** forked; the reducer grows case-by-case as scenarios force it.

### Why not the alternatives

- **Real worker, seeded state.** Authoring becomes "convince the engine to accept this setup," which is a large tax for what is fundamentally a presentation layer. We'd also need to teach the worker to start in arbitrary mid-game states.
- **One bespoke React component per scenario.** Doesn't scale past ~5 scenarios; loses the manifest-driven hub; can't batch-author. The declarative format is more upfront work but pays off as scenarios grow.
- **Extend `BoardScaffold` to render state.** `BoardScaffold` is labeled placeholder boxes — it does not consume game state. The right surface to render state is `BoardLayout`. Scaffold becomes a sibling sandbox tool ("Layout Reference"), not the foundation.

### Real vs sandbox-only — bug blast radius

The architecture is deliberately split between **production code the sandbox renders** and **sandbox-only code that drives it**. This determines where a fix lives and what else it affects.

| Layer | Real or sandbox-only? | Lives in |
|---|---|---|
| Engine, effect resolver, triggers, action pipeline | **Sandbox-only — bypassed entirely** | (sandbox does not touch `workers/game/`) |
| Session, WebSocket, Durable Object | **Sandbox-only — fake provider** | `src/components/sandbox/sandbox-session-provider.tsx` |
| State derivation (folding events) | **Sandbox-only — minimal reducer, ~8 visible-delta events** | `src/lib/sandbox/apply-event.ts` |
| Scenario authoring (initial state + scripted events) | **Sandbox-only** | `src/lib/sandbox/scenarios/**` |
| `BoardLayout` and all child components | **Real — same code production renders** | `src/components/game/board-layout/**` |
| Animation hooks (`use-card-transitions`, `use-field-arrivals`, `use-counter-pulse`, `use-hand-animation-state`) | **Real — same code production runs** | `src/hooks/use-*` |
| Prompt modals (`SelectTarget`, `ArrangeTopCards`, `PlayerChoice`, `OptionalEffect`, `RevealTrigger`) | **Real** | `src/components/game/*-modal.tsx` |
| `interactionMode` gating on `BoardLayout` / `useBoardDnd` / `card-action-menu` | **Real, but optional** — defaults to `"full"`; production callers omit it | `src/components/game/board-layout/interaction-mode.ts` |

**Bug blast radius rule:**

- A bug visible in the sandbox whose fix lives in `BoardLayout` / animation hooks / prompt modals → **fixing it fixes production too.** These files are shared. The OPT-295 patch to `use-card-transitions.ts` is the canonical example: the sandbox surfaced a routing miss, and the fix landed in shared code that production also benefits from.
- A bug whose fix lives in `apply-event.ts` or a scenario file → **production is unaffected.** Production's state comes from the real engine in `workers/game/`, which has no dependency on the sandbox reducer.
- A bug in the `interactionMode` plumbing → **could affect production** if the optional default or prop signature changes. Keep `interactionMode` optional with a `"full"` default; production callers (`/game/[id]`) intentionally omit it.

**Implication for debugging:** if you reproduce an animation glitch in the sandbox, the fix is almost always in shared code — that's the whole point of the harness. If you can't reproduce a production bug in the sandbox, it's likely engine-domain (state the sandbox can't legally reach without an engine), not animation-domain.

### Phase 2: engine-driven playground

Phase 1 (OPT-285 → OPT-297) shipped a scripted-event harness — every scenario pre-bakes a `GameEvent[]` and the runner plays them on a timer. Phase 2 (OPT-304 → OPT-307) adds a parallel **playground** mode where the user drives real `GameAction`s and the engine produces events, alongside the existing scripted scenarios. Scripted scenarios stay; the two modes coexist via a `mode: "scripted" | "playground"` discriminator on `Scenario` (defaulting to `scripted` so existing scenarios are unaffected).

**Architecture extension:**

```
ScenarioRunner (controller)
  ├─ scripted mode  → SandboxSessionProvider feeds apply-event reducer over scripted events  (Phase 1)
  └─ playground mode → SandboxEngineSessionProvider feeds runPipeline output through the same provider shape  (Phase 2)
                          ├─ user drag → GameAction → runPipeline(state, action, cardDb, pi)
                          ├─ result.state → next render
                          └─ result.events → existing card-animation pipeline (eventToTransitions)
```

Both modes converge at the provider boundary: `BoardLayout`, the animation hooks, and the prompt modals don't know which mode produced their inputs. The engine is reached via the `@engine/*` path alias added in OPT-304 — no engine refactor; the engine code is identical to what the worker runs.

**Caveats:**

- **Bundle size.** `engine/schema-registry.ts` does a top-level static import of all 51 effect schema files (`workers/game/src/engine/schemas/*.ts`). Importing it from `/sandbox/*` pulls every schema into the sandbox client chunks. Acceptable for a dev-only tool route; if `/sandbox/*` ever ships to public users, that's a separate optimization ticket (likely lazy-loading per scenario's `cardsUsed`).
- **`effectSchema: null` in `SANDBOX_CARD_DB`.** The curated card bundle was built for Phase 1 where authored `GameEvent`s do all the work — the engine isn't consulted, so cards' effect schemas were intentionally stubbed. Vanilla cards (no [On Play], no [On K.O.], no triggers) work in playground mode unmodified. Effect cards need their schema injected via `injectSchemasIntoCardDb` from `engine/schema-registry`; that wiring is deferred to a later Phase 2 ticket — playground scenarios start with vanilla-only.
- **Engine-driven setup is a hard floor.** Playground scenarios cannot start mid-turn or with arbitrary mid-game state the engine wouldn't accept. If a scenario needs an exotic starting position, author it as a scripted scenario instead — that's why the two modes are kept side-by-side.

**Bug blast radius — Phase 2 row:**

| Layer | Real or sandbox-only? | Lives in |
|---|---|---|
| Engine, effect resolver, triggers, action pipeline (in **playground** mode) | **Real — same code production runs** | `workers/game/src/engine/**`, reached via `@engine/*` alias |

In playground mode the engine moves out of "sandbox-only — bypassed entirely" and into the "real, shared with prod" column. A bug in `runPipeline` reproduced from a playground scenario fixes production too. Scripted scenarios still bypass the engine and remain in the original row.

---

## Scenario contract

```ts
// src/lib/sandbox/scenarios/types.ts
export type ScenarioCategory =
  | "draws" | "movement" | "combat" | "ko"
  | "life" | "effects" | "prompts" | "phase";

export interface Scenario {
  id: string;                       // "double-attack-vs-blocker"
  title: string;
  category: ScenarioCategory;
  description: string;              // 1–2 sentences shown in info panel
  initialState: PartialGameState;
  cardsUsed: string[];              // for sidebar
  script: ScenarioStep[];
  inputMode: "spectator" | "interactive";
  expectedResponse?: ExpectedResponse;
}

export type ScenarioStep =
  | { type: "event"; event: GameEvent; delayMs?: number }
  | { type: "wait"; ms: number }
  | { type: "prompt"; prompt: PromptOptions }
  | { type: "checkpoint"; label: string };

export interface ExpectedResponse {
  allowedActionTypes: string[];
  predicate: (action: GameAction) => boolean;
  hint?: string;
}
```

Adding a scenario = one new file in `src/lib/sandbox/scenarios/<category>/<id>.ts` + one line in the manifest. No React per scenario.

---

## Decisions (locked in)

| # | Question | Decision |
|---|----------|----------|
| 1 | Mock state vs real worker? | **Mock + synthetic events.** Authentic engine semantics aren't required for a presentation harness; cost of running the worker per scenario isn't justified. |
| 2 | One file per scenario, or one React component per scenario? | **Declarative TS objects** in `src/lib/sandbox/scenarios/<category>/<id>.ts`, registered in a manifest. Adds upfront type work; pays off past ~5 scenarios. |
| 3 | Card data: live DB or curated bundle? | **Curated bundle** (`sandbox-card-data.ts`, ~20 cards) at build time. No fetch indirection, no DB coupling, instant load. Cost: manual update when a new scenario needs an unbundled card. |
| 4 | Visual snapshot tests in v1? | **No.** Live playback only. Determinism work (clock injection, RAF mock, Motion timeline reset) deferred — see `docs/sandbox/clock-determinism.md` (created in OPT-297). |
| 5 | Step-backward in v1? | **No.** Forward-only. Backward would need per-step state snapshotting (cheap) AND Motion timeline reset (not cheap). Documented non-goal. |
| 6 | Default mute? | **Muted on**, persisted to localStorage. Auto-loop scenarios shouldn't be a noise hazard. |
| 7 | Hide navbar during scenario playback? | **No.** Sandbox is a tool, not an immersive surface. Nav remains visible. |
| 8 | Scaffold relationship to sandbox? | **Sibling**, not foundation. `BoardScaffold` migrates to `/sandbox/scaffold` and is linked from the hub as "Layout Reference." `/game/scaffold` redirects. |

---

## Phased plan

Tickets are tracked in the [Animation Sandbox Linear project](https://linear.app/optcg-sim/project/animation-sandbox-c2c60d216612). Execution order, status, and inter-ticket handoffs live in [`handoffs/animation-sandbox.md`](handoffs/animation-sandbox.md).

| Tier | Ticket | Title | Estimate |
|------|--------|-------|----------|
| 1 — Foundation | [OPT-285](https://linear.app/optcg-sim/issue/OPT-285) | Scenario types + manifest + helpers | 1 pt (~half day) |
| 1 — Foundation | [OPT-287](https://linear.app/optcg-sim/issue/OPT-287) | Curated card-data bundle | 1 pt (~half day) |
| 1 — Foundation | [OPT-288](https://linear.app/optcg-sim/issue/OPT-288) | Routes + navbar + scaffold migration | 2 pts (~1 day) |
| 1 — Foundation | [OPT-286](https://linear.app/optcg-sim/issue/OPT-286) | Session provider + apply-event reducer | 3 pts (~1.5–2 days) |
| 2 — Runtime | [OPT-289](https://linear.app/optcg-sim/issue/OPT-289) | Scenario runner controller + playback model | 3 pts (~1.5 days) |
| 2 — Runtime | [OPT-290](https://linear.app/optcg-sim/issue/OPT-290) | Input gate (spectator vs interactive) | 2 pts (~1 day) |
| 3 — Surface | [OPT-291](https://linear.app/optcg-sim/issue/OPT-291) | Scenario player page (board + control bar + info panel) | 3 pts (~1.5 days) |
| 4 — Validation | [OPT-292](https://linear.app/optcg-sim/issue/OPT-292) | Vertical slice (Draw 2 + SELECT_TARGET) | 1 pt (~half day) |
| 5 — Coverage | [OPT-293](https://linear.app/optcg-sim/issue/OPT-293) | Scenario batch: Draws & Movement (6) | 2 pts (~1 day) |
| 5 — Coverage | [OPT-294](https://linear.app/optcg-sim/issue/OPT-294) | Scenario batch: Combat (5) | 2 pts (~1 day) |
| 5 — Coverage | [OPT-295](https://linear.app/optcg-sim/issue/OPT-295) | Scenario batch: KO + Life (4) | 2 pts (~1 day) |
| 5 — Coverage | [OPT-296](https://linear.app/optcg-sim/issue/OPT-296) | Scenario batch: Prompts (4) | 2 pts (~1 day) |
| 6 — Polish | [OPT-297](https://linear.app/optcg-sim/issue/OPT-297) | Mute default + clock determinism notes | 1 pt (~half day) |

**Total estimate: ~2 weeks of focused work.**

**Critical path** is 6 hops: OPT-285 → OPT-286 → OPT-289 → OPT-290 → OPT-291 → OPT-292 → bulk batches in parallel.

OPT-287 and OPT-288 can run alongside the runtime tier without blocking it. The four scenario batches (OPT-293/294/295/296) are fully parallelizable once OPT-292 validates the architecture.

---

## Risks & watch-outs

- **Provider field drift.** `SandboxSessionProvider` mimics `useGameSession` field-by-field. If `useGameSession` adds a field after OPT-286 lands, scenarios crash with `cannot read X of undefined`. **Mitigation:** smoke render test in OPT-286 that mounts `BoardLayout` against the provider with a static state. Runs in CI.
- **Reducer scope creep in `apply-event.ts`.** Easy to fall into "let me handle every event type just in case." Don't. The engine handles ~50 event types; the sandbox needs the visible deltas only. **Rule:** add a case only when a scenario forces it, not preemptively.
- **Step-backward demand.** Users will ask. Adding it requires per-step state snapshotting (cheap) AND resetting Motion timelines mid-flight in `card-animation-layer.tsx` (not cheap). Defer with a clear pointer in `use-scenario-runner.ts`'s top comment.
- **Card-data drift.** The curated bundle is hand-authored. If a real card's `CardData` schema changes (e.g., a new required field on `CardData` in `src/types/index.ts`), the bundle silently goes stale and scenarios render with broken cards. **Mitigation:** OPT-287 should derive `SANDBOX_CARD_DB` entries from real DB rows where possible (copy snapshots), and any schema change should add the field to bundled entries in the same PR.
- **Don't generalize.** Resist the urge to make the runner a generic state-replayer for production debugging. Sandbox is the feature; if engine debugging via event replay becomes useful, that's a separate product on a different surface.

---

## Touchpoints reference

Quick map of files most likely to be touched, mapped to the ticket that owns each change.

| Layer | File | Change | Ticket |
|-------|------|--------|--------|
| Types | `src/lib/sandbox/scenarios/types.ts` | New | [OPT-285](https://linear.app/optcg-sim/issue/OPT-285) |
| Manifest | `src/lib/sandbox/scenarios/index.ts` | New (created in OPT-285; appended to in OPT-292/293/294/295/296) | [OPT-285](https://linear.app/optcg-sim/issue/OPT-285) |
| Helpers | `src/lib/sandbox/scenarios/helpers.ts` | New | [OPT-285](https://linear.app/optcg-sim/issue/OPT-285) |
| Card data | `src/lib/sandbox/sandbox-card-data.ts` | New (~20 curated cards) | [OPT-287](https://linear.app/optcg-sim/issue/OPT-287) |
| Provider | `src/components/sandbox/sandbox-session-provider.tsx` | New | [OPT-286](https://linear.app/optcg-sim/issue/OPT-286) |
| Reducer | `src/lib/sandbox/apply-event.ts` | New (visible deltas only) | [OPT-286](https://linear.app/optcg-sim/issue/OPT-286) |
| Reducer test | `src/lib/sandbox/__tests__/apply-event.test.ts` | New | [OPT-286](https://linear.app/optcg-sim/issue/OPT-286) |
| Runner | `src/components/sandbox/use-scenario-runner.ts` | New | [OPT-289](https://linear.app/optcg-sim/issue/OPT-289) |
| Runner test | `src/components/sandbox/__tests__/use-scenario-runner.test.ts` | New | [OPT-289](https://linear.app/optcg-sim/issue/OPT-289) |
| Input gate | `src/components/sandbox/scenario-input-gate.tsx` | New | [OPT-290](https://linear.app/optcg-sim/issue/OPT-290) |
| Board layout | `src/components/game/board-layout/index.ts` | Add optional `interactionMode` prop | [OPT-290](https://linear.app/optcg-sim/issue/OPT-290) |
| Board DnD | `src/components/game/board-layout/use-board-dnd.ts` | Bail when `interactionMode !== "full"` | [OPT-290](https://linear.app/optcg-sim/issue/OPT-290) |
| Card menu | `src/components/game/card-action-menu.tsx` | Bail when `interactionMode !== "full"` | [OPT-290](https://linear.app/optcg-sim/issue/OPT-290) |
| Hub page | `src/app/sandbox/page.tsx` | New | [OPT-288](https://linear.app/optcg-sim/issue/OPT-288) |
| Scaffold page | `src/app/sandbox/scaffold/page.tsx` | New (renders existing `BoardScaffold`) | [OPT-288](https://linear.app/optcg-sim/issue/OPT-288) |
| Player route | `src/app/sandbox/[scenarioId]/page.tsx` | New (placeholder in OPT-288, real shell in OPT-291) | [OPT-288](https://linear.app/optcg-sim/issue/OPT-288), [OPT-291](https://linear.app/optcg-sim/issue/OPT-291) |
| Old scaffold | `src/app/game/scaffold/page.tsx` | Replace body with `redirect('/sandbox/scaffold')` | [OPT-288](https://linear.app/optcg-sim/issue/OPT-288) |
| Navbar | `src/components/nav/navbar.tsx` | Add "Sandbox" top-level item | [OPT-288](https://linear.app/optcg-sim/issue/OPT-288) |
| Player shell | `src/components/sandbox/scenario-runner.tsx` | New (assembly: provider + runner + gate + UI) | [OPT-291](https://linear.app/optcg-sim/issue/OPT-291) |
| Info panel | `src/components/sandbox/scenario-info-panel.tsx` | New | [OPT-291](https://linear.app/optcg-sim/issue/OPT-291) |
| Control bar | `src/components/sandbox/playback-control-bar.tsx` | New | [OPT-291](https://linear.app/optcg-sim/issue/OPT-291) |
| Scenarios | `src/lib/sandbox/scenarios/draws/draw-2.ts` | New | [OPT-292](https://linear.app/optcg-sim/issue/OPT-292) |
| Scenarios | `src/lib/sandbox/scenarios/prompts/select-target.ts` | New | [OPT-292](https://linear.app/optcg-sim/issue/OPT-292) |
| Scenarios | `src/lib/sandbox/scenarios/draws/*`, `movement/*` | New (5 more files) | [OPT-293](https://linear.app/optcg-sim/issue/OPT-293) |
| Scenarios | `src/lib/sandbox/scenarios/combat/*` | New (5 files) | [OPT-294](https://linear.app/optcg-sim/issue/OPT-294) |
| Scenarios | `src/lib/sandbox/scenarios/ko/*`, `life/*` | New (4 files) | [OPT-295](https://linear.app/optcg-sim/issue/OPT-295) |
| Scenarios | `src/lib/sandbox/scenarios/prompts/*` | New (4 more files) | [OPT-296](https://linear.app/optcg-sim/issue/OPT-296) |
| Mute hook | `src/components/sandbox/use-sandbox-mute.ts` | New | [OPT-297](https://linear.app/optcg-sim/issue/OPT-297) |
| Determinism doc | `docs/sandbox/clock-determinism.md` | New | [OPT-297](https://linear.app/optcg-sim/issue/OPT-297) |
| Docs | `CLAUDE.md` | Light update — add `src/app/sandbox/`, `src/components/sandbox/`, `src/lib/sandbox/` to directory map | [OPT-297](https://linear.app/optcg-sim/issue/OPT-297) |

## Read-only references

Files the sandbox **reads from** (no edits planned):

- `src/components/game/board-layout/index.ts` — production board, rendered as-is
- `src/components/game/game-board-visual.tsx:215-303` — production dev-only modal harness; mental model for the prompt shapes scenarios drive
- `src/components/game/board-scaffold.tsx` — moved unmodified to `/sandbox/scaffold`
- `src/hooks/use-game-session.ts` — interface the provider mimics
- `src/hooks/use-card-transitions.ts` — `eventToTransitions` is the existing event → animation pipeline scenarios exercise (line 42 has `LIFE_TRASH_REASONS`, lines 75–95 have DON-attach fan-out)
- `src/hooks/use-field-arrivals.ts`, `src/hooks/use-counter-pulse.ts`, `src/hooks/use-hand-animation-state.ts` — animation hooks scenarios exercise
- `workers/game/src/types.ts` — `GameEvent`, `GameState`, `PromptOptions` types
- `workers/game/src/engine/battle.ts` — engine reference for which events fire during combat (used to author event sequences in OPT-294, not invoked at runtime)
