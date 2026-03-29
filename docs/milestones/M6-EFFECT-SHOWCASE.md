# M6 — Effect Showcase

> Interactive testing harness for card effect executions: pick a scenario, see the board, walk through prompts, observe the result. Storybook for card effects.

---

## Scope

M6 builds an isolated, interactive showcase for testing and demonstrating individual card effect flows. Each scenario presents a pre-built board state, executes a single effect chain with full prompt interaction, and stops when the effect resolves. No full games — just focused effect walkthroughs.

This serves three purposes:
1. **Effect development** — test new effect schemas without setting up a full game
2. **QA/regression** — verify prompt flows, targeting, and state transitions for each effect archetype
3. **Documentation** — show exactly what happens when a card is played, step by step

### What M6 Is

- A `/admin/showcase` page with a scenario catalog and live board rendering
- A local effect runner that executes the pipeline without a WebSocket/Durable Object
- Pre-built scenario fixtures that set up deterministic board states for each effect type
- Reuse of all existing board UI components and prompt modals

### What M6 Is NOT

- **Not a full game mode** — scenarios stop after the effect resolves, no continuing play
- **Not a visual scenario builder** — fixtures are hand-authored TypeScript, not a drag-and-drop editor
- **Not new engine work** — the pipeline, resolver, and schemas are unchanged from M4
- **Not a replay viewer** — M5 covers post-game replay; M6 is forward-only effect execution

### Deliverables

- [ ] Scenario type definitions (fixture format for board state + trigger action + expected flow)
- [ ] State factory / fixture builder (deterministic `GameState` construction with card placement)
- [ ] Local effect runner (wraps M4 pipeline, manages prompt-response loop client-side)
- [ ] `ShowcaseBoard` wrapper component (replaces WebSocket with local runner, reuses `BoardLayout` + modals)
- [ ] Showcase page with scenario picker UI (`/admin/showcase`)
- [ ] State timeline / step display (before/after snapshots per action in the chain)
- [ ] 10+ initial scenario fixtures covering all major effect archetypes
- [ ] Reset / replay controls (restart same scenario from initial state)

---

## Architecture

M6 introduces no new services or infrastructure. It composes existing pieces with a thin orchestration layer.

```
┌──────────────────────────────────────────────────────────────────────┐
│  /admin/showcase                                                      │
│                                                                       │
│  ┌─────────────────┐    ┌──────────────────────────────────────────┐ │
│  │  Scenario Picker │    │  ShowcaseBoard                           │ │
│  │                  │    │                                          │ │
│  │  ┌────────────┐ │    │  ┌──────────────────┐  ┌─────────────┐ │ │
│  │  │ Searcher   │ │───▶│  │  BoardLayout     │  │ State       │ │ │
│  │  │ Removal    │ │    │  │  (existing M3)   │  │ Timeline    │ │ │
│  │  │ Buff/Debuff│ │    │  │                  │  │             │ │ │
│  │  │ Choice     │ │    │  │  + Prompt Modals │  │ Step 1: ... │ │ │
│  │  │ Cost       │ │    │  │    (existing M4) │  │ Step 2: ... │ │ │
│  │  │ Counter    │ │    │  │                  │  │ Step 3: ... │ │ │
│  │  │ Trigger    │ │    │  └────────▲─────────┘  └─────────────┘ │ │
│  │  │ DON!!      │ │    │           │                             │ │
│  │  │ Life       │ │    │  ┌────────┴─────────┐                  │ │
│  │  │ Activate   │ │    │  │ Local Effect     │                  │ │
│  │  └────────────┘ │    │  │ Runner           │                  │ │
│  │                  │    │  │                  │                  │ │
│  │  [Reset] [Step]  │    │  │ Pipeline ──────┐ │                  │ │
│  └─────────────────┘    │  │ Resolver       │ │                  │ │
│                          │  │ State Factory ─┘ │                  │ │
│                          │  └──────────────────┘                  │ │
│                          └──────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

### Key Constraint: Where the Pipeline Runs

The effect resolver and pipeline live in `workers/game/src/engine/`. The showcase needs to execute them. Three options:

| Option | Approach | Tradeoffs |
|--------|----------|-----------|
| **A. HTTP endpoint on worker** | POST `/game/showcase/step` with state + action, returns new state + prompt | Simplest; no bundling changes; adds network latency per step; requires worker running |
| **B. Import engine into Next.js** | Shared package or direct import of engine modules | Zero latency; works offline; requires bundling engine for browser or server components |
| **C. In-page Web Worker** | Bundle engine into a Web Worker, postMessage interface | Zero network; non-blocking; more complex setup |

**Recommended: Option A** for initial implementation. The pipeline is already pure-functional (state in, state out). A single HTTP endpoint that accepts `{ state, action, cardDb }` and returns `{ state, prompt, events }` is the smallest change. Upgrade to B or C later if latency matters.

---

## Scenario Fixture Format

Each scenario is a self-contained TypeScript object:

```typescript
interface ShowcaseScenario {
  id: string;
  name: string;                        // "Nami — Search top 5 for Straw Hat Crew"
  description: string;                 // What this scenario demonstrates
  category: ScenarioCategory;          // "searcher" | "removal" | "buff" | "choice" | etc.
  card: {
    cardId: string;                    // "OP01-016"
    cardName: string;                  // "Nami"
    effectId: string;                  // "on_play_search"
  };
  buildState: (cardDb: CardDb) => GameState;  // Deterministic state factory
  triggerAction: GameAction;           // The action that kicks off the effect
  notes?: string;                      // Optional author notes for the timeline
}

type ScenarioCategory =
  | "searcher"       // SEARCH_DECK, DECK_SCRY, FULL_DECK_SEARCH
  | "removal"        // KO, RETURN_TO_HAND, RETURN_TO_DECK, TRASH_CARD
  | "buff"           // MODIFY_POWER (positive), GRANT_KEYWORD
  | "debuff"         // MODIFY_POWER (negative), NEGATE_EFFECTS
  | "draw"           // DRAW, MILL
  | "choice"         // PLAYER_CHOICE branches
  | "cost"           // Effects with selection-based costs (TRASH_FROM_HAND, etc.)
  | "counter"        // COUNTER step effects
  | "trigger"        // Life card [Trigger] effects
  | "don"            // DON!! manipulation (GIVE_DON, ADD_DON_FROM_DECK, etc.)
  | "life"           // Life manipulation (ADD_TO_LIFE, TRASH_FROM_LIFE, etc.)
  | "activate"       // ACTIVATE_MAIN effects
  | "replacement"    // Replacement effects ("instead of...")
  | "prohibition"    // "Cannot X" effects
```

---

## State Factory

The `buildState` function in each scenario constructs a deterministic `GameState` with cards placed exactly where the effect needs them.

```typescript
// Utility helpers for scenario authoring
function createShowcaseState(config: {
  myLeader: string;           // card ID
  oppLeader: string;
  myHand?: string[];          // card IDs — placed in hand
  myField?: string[];         // card IDs — placed as characters
  oppField?: string[];
  myDeckTop?: string[];       // card IDs — placed on top of deck in order
  myDeckRest?: string[];      // remaining deck (shuffled or ordered)
  myLife?: string[];           // card IDs for life zone
  myTrash?: string[];
  myDon?: { total: number; active: number; };
  turn?: Partial<TurnState>;  // phase, turn number, active player
  activeEffects?: ActiveEffect[];
}): GameState
```

This avoids duplicating `buildInitialState()` logic — it constructs a minimal valid `GameState` with only the zones that matter for the scenario populated. Cards not relevant to the scenario get placeholder IDs.

---

## Local Effect Runner

The runner manages the step-through loop:

```
1. Load scenario fixture
2. Call buildState() → initial GameState
3. Send triggerAction to pipeline → get (newState, pendingPrompt?, events[])
4. Render board with newState
5. If pendingPrompt exists:
   a. Show the appropriate modal (SELECT_TARGET, PLAYER_CHOICE, etc.)
   b. Wait for user response
   c. Send response action to pipeline → get (newState, pendingPrompt?, events[])
   d. Append to timeline
   e. Go to 5
6. If no pendingPrompt: effect fully resolved → STOP
7. Display final state + complete timeline
```

### Runner State Machine

```
IDLE → READY (scenario loaded, initial state rendered)
     → EXECUTING (trigger action sent, waiting for pipeline result)
     → PROMPTING (prompt active, waiting for user input)
     → EXECUTING (user responded, re-entering pipeline)
     → ...loop...
     → COMPLETE (effect stack empty, no more prompts)
```

### Timeline Events

Each step through the runner appends to a timeline:

```typescript
interface TimelineEntry {
  step: number;
  action: GameAction | "TRIGGER";      // What happened
  description: string;                  // Human-readable: "Searched top 5 cards"
  stateBefore: GameState;               // Snapshot before this step
  stateAfter: GameState;                // Snapshot after this step
  prompt?: PendingPromptState;          // If this step produced a prompt
  events: GameEvent[];                  // Events emitted during this step
}
```

---

## Showcase Page UI

### Layout

```
┌──────────────────────────────────────────────────────────┐
│  Effect Showcase                                [Admin]   │
├──────────────┬───────────────────────────────────────────┤
│              │                                            │
│  Categories  │  Board Area                               │
│              │  ┌──────────────────────────────────────┐ │
│  ▸ Searcher  │  │                                      │ │
│  ▸ Removal   │  │         BoardLayout                  │ │
│  ▸ Buff      │  │         (+ active prompt modal)      │ │
│  ▸ Choice    │  │                                      │ │
│  ▸ Cost      │  └──────────────────────────────────────┘ │
│  ▸ Counter   │                                            │
│  ▸ Trigger   │  Timeline                                  │
│  ▸ DON!!     │  ┌──────────────────────────────────────┐ │
│  ▸ Life      │  │ Step 1: Nami played from hand        │ │
│  ▸ Activate  │  │ Step 2: ON_PLAY triggered → search   │ │
│              │  │ Step 3: Prompt: select 1 of 3        │ │
│  Scenarios   │  │ Step 4: ✓ Added Luffy to hand        │ │
│  ────────    │  │ Step 5: Rest placed on deck bottom   │ │
│  • Nami      │  │ ✓ Effect complete                    │ │
│  • Chopper   │  └──────────────────────────────────────┘ │
│  • Robin     │                                            │
│              │  [Reset]  [Step ▶]  [Auto-play ▶▶]        │
└──────────────┴───────────────────────────────────────────┘
```

### Controls

- **Reset** — reload scenario from initial state
- **Step** — advance one pipeline step at a time (auto-respond to prompts with first valid option)
- **Auto-play** — run through with auto-responses for quick visual verification
- Interactive mode is the default — prompts pause and wait for user input

---

## Initial Scenario Catalog (10+)

| # | Category | Card | Effect | What It Demonstrates |
|---|----------|------|--------|---------------------|
| 1 | Searcher | OP01-016 Nami | ON_PLAY: Search top 5 for Straw Hat Crew | `SEARCH_DECK` → `SELECT_TARGET` prompt → add to hand, rest to bottom |
| 2 | Removal | OP01-025 Zoro | WHEN_ATTACKING: KO cost ≤ 3 | `KO` with `SELECT_TARGET` filtering by cost |
| 3 | Buff | OP01-004 Luffy (Leader) | ACTIVATE_MAIN: +1000 to character | `MODIFY_POWER` with `REST_SELF` cost, duration THIS_TURN |
| 4 | Draw | OP01-017 Nami (Event) | Play: Draw 2 | Simple `DRAW` action, no prompts |
| 5 | Choice | (card with PLAYER_CHOICE) | Branch: option A or B | `PLAYER_CHOICE` modal → different action chains |
| 6 | Cost | (card with TRASH_FROM_HAND cost) | Activate with discard cost | `SELECT_TARGET` for cost payment before effect resolution |
| 7 | Counter | (Counter event card) | Counter: +2000 power | Counter step timing, `MODIFY_POWER` during battle |
| 8 | Trigger | (life card with [Trigger]) | Life trigger: optional add-to-hand | `REVEAL_TRIGGER` modal → conditional effect |
| 9 | DON!! | (DON!! attach/return card) | DON!! manipulation | `GIVE_DON` / `ADD_DON_FROM_DECK` |
| 10 | Debuff | (power reduction card) | -2000 power to opponent | `MODIFY_POWER` negative with target filter |
| 11 | Activate | (field card with Activate: Main) | Once-per-turn activation | `ACTIVATE_MAIN` trigger + once-per-turn flag |
| 12 | Life | (life manipulation card) | Add/remove from life zone | `ADD_TO_LIFE_FROM_DECK` or `TRASH_FROM_LIFE` |

Exact cards for slots 5–12 will be selected from authored OP01/OP02 schemas during implementation.

---

## Component Breakdown

### New Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `ShowcasePage` | `src/app/admin/showcase/page.tsx` | Server shell — loads card DB, renders showcase |
| `ShowcaseShell` | `src/components/showcase/showcase-shell.tsx` | Client component — scenario picker + board + timeline |
| `ShowcaseBoard` | `src/components/showcase/showcase-board.tsx` | Wraps `BoardLayout` + prompt modals, wired to local runner |
| `ScenarioPicker` | `src/components/showcase/scenario-picker.tsx` | Category list + scenario list sidebar |
| `EffectTimeline` | `src/components/showcase/effect-timeline.tsx` | Step-by-step log of effect execution |
| `ShowcaseControls` | `src/components/showcase/showcase-controls.tsx` | Reset, step, auto-play buttons |

### New Hooks

| Hook | Purpose |
|------|---------|
| `useShowcaseRunner` | Manages runner state machine (IDLE → READY → EXECUTING → PROMPTING → COMPLETE) |

### New Worker Endpoint (Option A)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/game/showcase/step` | POST | Accepts `{ state, action, cardDb }`, runs pipeline, returns `{ state, prompt, events }` |

### Reused Components (unchanged)

- `BoardLayout` + all zone components (field, hand, DON, life, trash)
- `BoardCard` + tooltips
- `SelectTargetModal`, `PlayerChoiceModal`, `ArrangeTopCardsModal`, `OptionalEffectModal`, `RevealTriggerModal`

### Scenario Fixtures

| File | Purpose |
|------|---------|
| `src/components/showcase/scenarios/types.ts` | `ShowcaseScenario` type + `ScenarioCategory` |
| `src/components/showcase/scenarios/state-factory.ts` | `createShowcaseState()` utility |
| `src/components/showcase/scenarios/searcher.ts` | Searcher scenarios (Nami, etc.) |
| `src/components/showcase/scenarios/removal.ts` | Removal scenarios |
| `src/components/showcase/scenarios/index.ts` | Barrel export of all scenarios |
| ... | One file per category |

---

## Roadmap

| Step | Task | Size |
|------|------|------|
| 1 | Define `ShowcaseScenario` type and `ScenarioCategory` | S |
| 2 | Build `createShowcaseState()` factory utility | M |
| 3 | Add `/game/showcase/step` HTTP endpoint on game worker | M |
| 4 | Build `useShowcaseRunner` hook (state machine + timeline) | M |
| 5 | Build `ShowcaseBoard` wrapper (BoardLayout + modals + runner) | M |
| 6 | Build `ScenarioPicker` sidebar component | S |
| 7 | Build `EffectTimeline` component | S–M |
| 8 | Build `ShowcaseControls` (reset, step, auto-play) | S |
| 9 | Wire up `ShowcasePage` and `ShowcaseShell` | S |
| 10 | Author first 3 scenario fixtures (searcher, removal, buff) | M |
| 11 | Author remaining 7+ scenarios | M |
| 12 | End-to-end testing of all scenarios | M |

---

## Acceptance Criteria

- [ ] `/admin/showcase` page loads with scenario catalog
- [ ] Selecting a scenario renders the board with the correct initial state
- [ ] Playing through a searcher scenario shows: card played → search prompt → selection → card added to hand → rest to bottom
- [ ] Playing through a removal scenario shows: attack declared → KO prompt → target selected → character KO'd
- [ ] All prompt types work: SELECT_TARGET, PLAYER_CHOICE, ARRANGE_TOP_CARDS, OPTIONAL_EFFECT, REVEAL_TRIGGER
- [ ] Timeline displays each step with before/after state descriptions
- [ ] Reset button restores the scenario to its initial state
- [ ] Step button auto-advances one step (auto-selects first valid option for prompts)
- [ ] Effect execution stops when the effect stack is empty (no continuing the game)
- [ ] No WebSocket or Durable Object required — pipeline runs via HTTP endpoint
- [ ] At least 10 scenarios covering all major effect categories
- [ ] Existing board components and prompt modals are reused without modification

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Engine bundling for browser is complex | Blocks Option B/C | Start with Option A (HTTP endpoint); engine stays in worker |
| HTTP latency per pipeline step feels sluggish | Poor UX during prompt chains | Pipeline steps are fast (<50ms); batch if needed; upgrade to Option B later |
| State factory produces invalid states | Confusing test results | Validate factory output against GameState invariants; keep scenarios simple |
| Scenario fixtures drift from schema changes | Broken scenarios after M4 updates | Scenario fixtures use the same typed schemas; TypeScript catches drift at compile time |
| Board components assume full game context | Missing props / broken rendering | BoardLayout already accepts props cleanly; test with minimal state first |

---

## Dependencies

- M4 effect engine (pipeline, resolver, schemas) — complete and stable
- M3 board UI components (BoardLayout, prompt modals) — complete
- OP01/OP02 effect schemas authored — at least the cards used in scenarios
- Card database populated (M0 pipeline)

---

## Future Extensions (Not M6 Scope)

- **Visual scenario builder** — drag cards onto a board to create fixtures
- **Automated regression suite** — run all scenarios headlessly, assert final state matches expected
- **Public showcase** — move from `/admin` to a public-facing page for new player education
- **Effect diffing** — highlight exactly which zones/cards changed at each step
- **Shareable scenario URLs** — link to a specific scenario + pre-selected choices

---

_Last updated: 2026-03-26_
