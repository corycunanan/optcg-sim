---
linear-project: Animation Sandbox
linear-project-url: https://linear.app/optcg-sim/project/animation-sandbox-c2c60d216612
last-updated: 2026-04-25 (OPT-293 in review — OPT-294/295/296 + OPT-297 all parallelizable now)
---

# Animation Sandbox — Handoff Doc

A `/sandbox` surface for showcasing and validating atomic game-state animations in isolation. Each scenario is a declarative TS file that drives the real `BoardLayout` via a fake session provider, with per-scenario input gating (spectator vs interactive). Full scope: [`docs/project/ANIMATION-SANDBOX-SCOPE.md`](../ANIMATION-SANDBOX-SCOPE.md).

---

## Action Plan

Tickets in execution order. Ordering criteria: dependencies → estimate → priority → risk. The Linear project description is the source of truth if this table drifts.

| Order | Ticket | Title | Estimate | Depends on | Status | PR | Notes |
|-------|--------|-------|----------|------------|--------|----|-------|
| 1 | [OPT-285](https://linear.app/optcg-sim/issue/OPT-285) | Sandbox foundation: scenario types + manifest + helpers | 1 | — | Done | [#129](https://github.com/corycunanan/optcg-sim/pull/129) | Gate ticket. Pure types + empty manifest + helper stubs. Unblocks OPT-286 and OPT-288. |
| 2 | [OPT-287](https://linear.app/optcg-sim/issue/OPT-287) | Curated card-data bundle for sandbox | 1 | — | Done | [#137](https://github.com/corycunanan/optcg-sim/pull/137) | 18 real-card snapshots in `src/lib/sandbox/sandbox-card-data.ts`. Coverage matrix is locked by a unit test — adding cards is fine, dropping a slot fails the suite. |
| 3 | [OPT-288](https://linear.app/optcg-sim/issue/OPT-288) | Sandbox routes + navbar entry + scaffold migration | 2 | OPT-285 | Done | [#135](https://github.com/corycunanan/optcg-sim/pull/135) | New top-level routes (`/sandbox`, `/sandbox/scaffold`, `/sandbox/[scenarioId]` placeholder), navbar entry, redirect from `/game/scaffold`. Hub UI reads the (initially empty) manifest. Independent of provider/runner work — can run in parallel with OPT-286/289. |
| 4 | [OPT-286](https://linear.app/optcg-sim/issue/OPT-286) | Sandbox session provider + apply-event reducer | 3 | OPT-285 | Done | [#132](https://github.com/corycunanan/optcg-sim/pull/132) | The fake `useGameSession`. Critical path. Reducer is intentionally minimal — visible deltas only, no engine fork. Smoke test asserts `BoardLayoutProps` has no undefined fields (no JSDOM needed). |
| 5 | [OPT-289](https://linear.app/optcg-sim/issue/OPT-289) | Scenario runner controller + playback model | 3 | OPT-285, OPT-286 | Done | [#133](https://github.com/corycunanan/optcg-sim/pull/133) | The brain. Folds `apply-event` over events 0..i. Exposes play/pause/reset/stepForward/resolvePrompt. Step-backward is a documented non-goal — noted in the file's top comment. |
| 6 | [OPT-290](https://linear.app/optcg-sim/issue/OPT-290) | Input gate: spectator vs interactive | 2 | OPT-286, OPT-289 | Done | [#136](https://github.com/corycunanan/optcg-sim/pull/136) | Picked option #1 — `interactionMode` prop on `BoardLayout` via a small context. Touched 6 files; pointer-events overlay was rejected because BoardModals render inline (z-index would fight). |
| 7 | [OPT-291](https://linear.app/optcg-sim/issue/OPT-291) | Scenario player page: board + control bar + info panel | 3 | OPT-287, OPT-288, OPT-289, OPT-290 | Done | [#138](https://github.com/corycunanan/optcg-sim/pull/138) | Assembly point. Wires provider + runner + gate + UI into the `[scenarioId]` route. After this lands, the architecture is fully observable. |
| 8 | [OPT-292](https://linear.app/optcg-sim/issue/OPT-292) | Vertical slice: Draw 2 (spectator) + SELECT_TARGET (interactive) | 1 | OPT-291 | Done | [#139](https://github.com/corycunanan/optcg-sim/pull/139) | The architecture's smoke test. Two scenarios that exercise the full pipeline. **If anything feels off here, patch the earlier ticket — don't paper over.** Wiring held — no upstream patches needed. |
| 9 | [OPT-293](https://linear.app/optcg-sim/issue/OPT-293) | Scenario batch: Draws & Movement (6 scenarios) | 2 | OPT-292 | In Review | [#140](https://github.com/corycunanan/optcg-sim/pull/140) | Parallelizable with OPT-294/295/296. Exercises `use-field-arrivals` and the multi-DON fan-out. `redistribute-don` authored as interactive (overlay is fundamentally interactive). |
| 10 | [OPT-294](https://linear.app/optcg-sim/issue/OPT-294) | Scenario batch: Combat (5 scenarios) | 2 | OPT-292 | Backlog | — | Parallelizable. Counter-from-hand is the only interactive one in the batch; exercises `use-counter-pulse`. |
| 11 | [OPT-295](https://linear.app/optcg-sim/issue/OPT-295) | Scenario batch: KO + Life (4 scenarios) | 2 | OPT-292 | Backlog | — | Parallelizable. All spectator. Exercises the `kind: "ko"` flight branch and `LIFE_TRASH_REASONS` routing. |
| 12 | [OPT-296](https://linear.app/optcg-sim/issue/OPT-296) | Scenario batch: Prompts (4 interactive scenarios) | 2 | OPT-292 | Backlog | — | Parallelizable. Covers the four remaining prompt modals (`ARRANGE_TOP_CARDS`, `PLAYER_CHOICE`, `OPTIONAL_EFFECT`, `REVEAL_TRIGGER`). |
| 13 | [OPT-297](https://linear.app/optcg-sim/issue/OPT-297) | Polish: global mute default + clock determinism notes | 1 | OPT-291 | Backlog | — | Closeout. Mute toggle + persistence + the `docs/sandbox/clock-determinism.md` doc. Can be done any time after OPT-291; suggest doing it last so the determinism doc reflects what was actually built. |

**Status values:** use Linear status names verbatim (`Backlog`, `Todo`, `In Progress`, `In Review`, `Done`, `Canceled`).

**Next up:** OPT-294 (critical path) — ready now. OPT-295, OPT-296 are parallelizable batches, also ready now. OPT-297 (polish) is the recommended closeout — save for last so the determinism doc reflects what actually shipped.

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

### OPT-286 → OPT-289
**From:** session on 2026-04-25 · **Commit:** `42a3fac` · **PR:** [#132](https://github.com/corycunanan/optcg-sim/pull/132)

- **Primer:** The fake `useGameSession` exists. `buildSandboxSession({ initialState, events, cardDb, activePrompt?, onAction?, onBackToLobbies? })` is the pure derivation; the runner can call it directly for replay-frame `i` without going through React. `useSandboxGameSession` is the hook that wraps it (adds router-based handleBackToLobbies + memoization). `applyEvent(state, event)` handles the eight visible-delta event types; everything else returns the state unchanged.
- **Read first:** `src/components/sandbox/sandbox-session-provider.tsx` (the public surface — start with `SandboxSessionInput` and `SandboxGameSession`), `src/lib/sandbox/apply-event.ts` (the reducer the runner folds), `src/components/sandbox/sandbox-session-provider.test.ts` (the field-drift contract — break it intentionally to see what fails).
- **Gotchas / do NOT touch:**
  - `eventLog` is exposed on **both** `session.game.eventLog` and `session.game.gameState.eventLog` and they share a reference. The runner should pass `events.slice(0, i)` for the current frame; do not mutate the array in place — `useMemo` deps rely on referential identity.
  - `applyEvent` is `(state, event) => state` for unhandled events. Returning the same reference is intentional — `mapPlayer` does the same when nothing changed. Keep this when adding cases; do not always allocate a new state.
  - Trashing / KO'ing / returning a field card with attached DON returns those DON to the cost area as **active and unattached**. If you add a new "leave the field" event in the future, mirror this — otherwise tokens disappear.
  - `applyEvent` does not search the leader slot for `locateAndRemove`. Leader card movements are not legal in current scenario scope; if a future case needs it, audit whether you actually want it.
- **Unresolved:**
  - No DOM-level smoke render test: vitest is configured for `environment: "node"` and the project doesn't ship JSDOM or `@testing-library/react`. The contract test in `sandbox-session-provider.test.ts` covers field drift via `BoardLayoutProps` assignment — sufficient for now, but if scenario authoring uncovers actual render-time issues, consider adding `@testing-library/react` + `happy-dom` and a real `<BoardLayout>` mount.
  - `applyEvent` only handles the eight scoped event types. The reducer-scope-creep risk remains live for OPT-289 — when authoring the runner, only add a new case if a scenario forces it.
- **Why this matters for OPT-289:** the runner owns the `(events, currentIndex)` state and calls `buildSandboxSession({ events: events.slice(0, currentIndex), ... })` per frame. Step-backward as a non-goal still applies — the docstring you'll write at the top of the runner file should say so. The reducer is "fold-friendly" by design; expect to call it repeatedly for play/stepForward and not at all for resolvePrompt.

### OPT-289 → OPT-290
**From:** session on 2026-04-25 · **Commit:** `701d047` · **PR:** [#133](https://github.com/corycunanan/optcg-sim/pull/133)

- **Primer:** The runner exists. `createScenarioRunner(scenario)` is the pure controller — owns the `setTimeout`, exposes `getState`/`subscribe`/`play`/`pause`/`reset`/`stepForward`/`resolvePrompt`/`dispose`. `useScenarioRunner` is the React hook over it via `useSyncExternalStore`. Derived state is recomputed (and cached per change) by folding `applyEvent` over `script[0..currentStepIndex]`'s events from `scenario.initialState`. `resumeTo` (`"playing" | "paused"`) records where to land after `resolvePrompt`.
- **Read first:** `src/components/sandbox/use-scenario-runner.ts` (controller + hook in one file), `src/components/sandbox/__tests__/use-scenario-runner.test.ts` (the playback contract — 14 tests covering all five acceptance scenarios plus pause-during-awaiting-response edges).
- **Gotchas / do NOT touch:**
  - `resolvePrompt(response)` accepts a `GameAction` for API symmetry but does not validate against `scenario.expectedResponse.predicate` — that's the gate's job (this is OPT-290's surface). The runner just advances. If you tighten this, do it in the gate, not the runner.
  - `useScenarioRunner` creates the controller exactly once via `useState(() => createScenarioRunner(scenario))`. Scenario reference changes after mount are silently ignored. Each scenario gets its own `[scenarioId]` page, so this is fine for now — file a follow-up if that assumption breaks.
  - The runner schedules timers with `setTimeout`, so vitest fake timers work transparently. Keep it that way; don't reach for `requestAnimationFrame` or `performance.now()` for delays — that breaks the test path.
  - Step-backward is a documented v1 non-goal — see top comment. Don't bolt it on without the Motion-timeline reset story; it'll desync `card-animation-layer`.
- **Unresolved:**
  - `pause()` while `playing` and `pause()` while `awaiting-response` both notify, but `pause()` from `idle`/`paused`/`ended` is a no-op without notify. If callers rely on `pause` to ping a listener, that's surprising; flag if OPT-290 hits it.
  - The runner exposes `dispose` but `useScenarioRunner` only calls it on unmount. If OPT-291 ever needs to swap scenarios in-place, add a scenario-change effect that disposes + creates fresh.
- **Why this matters for OPT-290:** OPT-290 wraps `session.sendAction` so interactive scenarios route the user's action through `expectedResponse.predicate` and, on match, call `runner.resolvePrompt(action)`. Spectator scenarios should disable input entirely (the ticket suggests trying `interactionMode` prop on `BoardLayout` first; pointer-events overlay is the fallback). The runner does not own input — only playback — so the gate is the single point that decides "did the user satisfy the prompt yet?"

### OPT-288 → OPT-291
**From:** session on 2026-04-25 · **Commit:** `fde8a3f` · **PR:** [#135](https://github.com/corycunanan/optcg-sim/pull/135)

- **Primer:** The `/sandbox` route surface is in place. Hub at `/sandbox` reads `scenarios` from the manifest and renders one section per `ScenarioCategory` (currently all "No scenarios yet"). `/sandbox/scaffold` is the migrated `BoardScaffold` host. `/sandbox/[scenarioId]/page.tsx` is the placeholder OPT-291 will replace — it already does the manifest lookup and `notFound()` for unknown ids. `/game/scaffold` is now a `permanentRedirect` (308). Navbar has a top-level "Sandbox" link.
- **Read first:** `src/app/sandbox/[scenarioId]/page.tsx` (the surface OPT-291 replaces — keep the param shape `Promise<{ scenarioId: string }>` and the `notFound()` branch), `src/app/sandbox/page.tsx` (hub — references `CATEGORY_ORDER`/`CATEGORY_LABELS` you may want to extract if scenario tiles need to share them), `src/components/nav/navbar.tsx` (Sandbox link + the `/game/` skip rule that intentionally does **not** apply to `/sandbox/*`).
- **Gotchas / do NOT touch:**
  - The navbar's `pathname.startsWith("/game/")` skip rule must stay for `/game/*` and must **not** be widened to `/sandbox/*` — the ticket explicitly calls this out as a default. If we later want to hide the nav during scenario playback, scope it to `inputMode === "interactive"` so spectator scenarios still show navigation.
  - `permanentRedirect` (308) was chosen over `redirect` (307) on `/game/scaffold` so search engines and bookmarks transfer cleanly. Don't downgrade.
  - Hub categories render even when empty by design — removing empty sections would hide which categories OPT-292+ scenarios should land in. Keep the `CATEGORY_ORDER` loop unconditional.
- **Unresolved:**
  - The "uncommitted OPT-290-flavored work" this entry originally flagged was the in-progress OPT-290 branch — now committed and shipped as PR #136 (see the OPT-290 → OPT-291 entry below).
  - `[scenarioId]` placeholder hard-codes the OPT-291 reference in copy. Update or remove that line as part of OPT-291.
- **Why this matters for OPT-291:** OPT-291 turns the placeholder into the real player. Reuse the existing `params: Promise<{ scenarioId: string }>` signature and the `notFound()` branch — only the JSX body changes. The hub's tile click already routes to `/sandbox/<id>`, so once a scenario is in the manifest the only friction is rendering the player. Pull provider (OPT-286), runner (OPT-289), and gate (OPT-290) into this page; nothing else in the route tree should need to move.

### OPT-290 → OPT-291
**From:** session on 2026-04-25 · **Commit:** `b671657` · **PR:** [#136](https://github.com/corycunanan/optcg-sim/pull/136)

- **Primer:** The input gate exists. `useScenarioInputGate({ scenario, playbackState, resolvePrompt })` returns `{ interactionMode, sendAction, hint }`. Spectator scenarios are read-only; interactive scenarios forward an action only when `playbackState === "awaiting-response"` and the action satisfies `expectedResponse` (allowed type + predicate), then call `resolvePrompt`. `BoardLayout` accepts an optional `interactionMode` prop (`"full" | "spectator" | "responseOnly"`) that masks drag/menu via a small `InteractionModeContext`.
- **Read first:** `src/components/sandbox/scenario-input-gate.tsx` (the public surface — `buildScenarioInputGate` is the pure form, `useScenarioInputGate` the hook), `src/components/game/board-layout/interaction-mode.ts` (the context the prop is plumbed through), `src/components/sandbox/__tests__/scenario-input-gate.test.ts` (10 tests covering every cell of the spectator/interactive × playback-state matrix).
- **Gotchas / do NOT touch:**
  - `BoardLayout`'s `interactionMode` defaults to `"full"`. **Do not make it required** — production callers (`/game/[id]`) omit it on purpose. The optional default is what guarantees "no regressions in production game."
  - The gate's hint and `BoardLayout`'s navbar badge are two separate surfaces, both intentional. The badge is global ("Watching" / "Respond" in the navbar's right cluster). The hint is per-prompt context for the info panel — `hint.text` defaults to "Respond to continue" but uses `expectedResponse.hint` when scenarios author one.
  - `useBoardDnd` now accepts a `disabled` flag. When set, `handleDragStart` still tracks `activeDrag` (so DragOverlay renders during the drag) but `handleDragEnd` is a no-op. This is intentional: visual feedback ok, action commit suppressed. Don't suppress `handleDragStart` — that breaks the visual-feedback contract for spectators.
  - Hand-layer drag is gated via the existing `enableDrag` path (`!dndDisabled && (bs.canInteract || bs.canDragCounter)`) — not via context. Field-card and drop-zones use the context. Two paths, both load-bearing — don't try to unify before OPT-291 ships, the existing leaf API is what kept the file count at 6.
- **Unresolved:**
  - No DOM-level integration test of `BoardLayout interactionMode` — same constraint as OPT-286 (vitest `environment: "node"`, no JSDOM). The behavioral guarantees are covered by the gate contract tests + the existing `useBoardDnd disabled` parameter; if scenario authoring uncovers field-level issues, file a follow-up that adds `@testing-library/react` + `happy-dom` for sandbox-specific render tests only.
  - `expectedResponse.hint` is per-scenario but rendered the same way regardless of `promptType`. If OPT-296's prompt-modal scenarios need prompt-type-specific styling (e.g., "Arrange the top 3 cards" vs "Pick a target"), the right place is the `hint` field — extend the type union there, not in BoardLayout.
- **Why this matters for OPT-291:** OPT-291 is the assembly. The `[scenarioId]` page should call `useScenarioRunner(scenario)` → `useScenarioInputGate({ scenario, playbackState: state.playbackState, resolvePrompt: state.resolvePrompt })` → `useSandboxGameSession({ initialState, events: state.eventLog, cardDb, activePrompt: state.activePrompt, onAction: gate.sendAction })`. Then pass `gate.interactionMode` to `<BoardLayout interactionMode={...} />` and render `gate.hint` in the info panel. The runner is the brain, the provider is the body, the gate is the nervous system — OPT-291 is the skeleton that holds them together.

### OPT-287 → OPT-291
**From:** session on 2026-04-25 · **Commit:** `3e4c28d` · **PR:** [#137](https://github.com/corycunanan/optcg-sim/pull/137)

- **Primer:** `SANDBOX_CARD_DB: Record<string, CardData>` is now exported from `src/lib/sandbox/sandbox-card-data.ts`. 18 real-card snapshots covering the OPT-287 acceptance matrix (R/B/G leaders + per-keyword characters + Event-with-Trigger + Stage + 10-cost). `SANDBOX_CARD_IDS` is exported alongside if a scenario needs to enumerate.
- **Read first:** `src/lib/sandbox/sandbox-card-data.ts` (the bundle), `src/lib/sandbox/__tests__/sandbox-card-data.test.ts` (the coverage lock — read it before adding cards so you know what slots are tested).
- **Gotchas / do NOT touch:**
  - Keywords are derived through `extractKeywords` from `src/lib/game/keywords.ts` so the sandbox sees what the live engine sees. Do not hand-set keyword booleans on entries — let the helper compute them, otherwise sandbox and prod will drift.
  - `effectSchema` is `null` for every entry. The sandbox bypasses the engine, so this is intentional. If a future scenario needs to render an effect-driven prompt that *reads* the schema, that's a deeper change — file a follow-up rather than papering over it here.
  - The bundle uses `imageUrl` defaults from the public CDN (`optcg-images.corymcunanan.workers.dev/cards/<id>.webp`). All current entries have art on the CDN; if you add a card without art, override `imageUrl` explicitly.
  - When adding a card to satisfy a *new* coverage requirement, also add a corresponding `it(...)` to the coverage matrix — the lock pattern is what keeps this bundle honest.
- **Unresolved:**
  - The acceptance criterion "resolves every card ID referenced by scenarios in OPT-X (Vertical slice) and the bulk batches" can't be enforced yet because OPT-292..OPT-296 don't exist. When OPT-292 lands, sweep `cardsUsed: []` against `SANDBOX_CARD_IDS` and add a sandbox-build test that fails if any scenario references an unknown card.
  - Yellow/Black leaders are intentionally out of scope for v1 (per the ticket). Add them when a scenario actually needs one.
- **Why this matters for OPT-291:** OPT-291 wires the provider with `cardDb={SANDBOX_CARD_DB}`. No fetch, no `useCardDatabase`, no loading state to render around. Scenarios can hard-reference any ID from `SANDBOX_CARD_IDS` and trust the resolution. If a scenario needs a card outside the bundle, extend the bundle in the same PR — don't reach for the live API.

### OPT-292 → OPT-293 (and parallel batches)
**From:** session on 2026-04-25 · **Commit:** `8cbdeaa` · **PR:** [#139](https://github.com/corycunanan/optcg-sim/pull/139)

- **Primer:** Manifest is no longer empty. `src/lib/sandbox/scenarios/{draws/draw-2,prompts/select-target}.ts` are the first two scenarios; `scenarios/index.ts` registers them. Both passed through the assembly (provider + runner + gate + BoardLayout) without any upstream patches — the architecture held.
- **Read first:** `src/lib/sandbox/scenarios/draws/draw-2.ts` (the spectator template — initial state shape, top-of-deck cardId-matching for `CARD_DRAWN` payloads, the `event → wait → event` cadence), `src/lib/sandbox/scenarios/prompts/select-target.ts` (the interactive template — `expectedResponse` predicate + `allowedActionTypes` shape), `src/lib/sandbox/scenarios/__tests__/manifest.test.ts` (the contract: unique IDs, `cardsUsed` resolves in `SANDBOX_CARD_DB`, `buildSandboxSession` doesn't crash, predicate accept/reject matrix).
- **Gotchas / do NOT touch:**
  - **`allowedActionTypes` is `GameAction["type"][]`, not the ticket's `"RESPOND_TO_PROMPT"` literal.** The actions emitted by the prompt modals are concrete (`SELECT_TARGET`, `PLAYER_CHOICE`, `ARRANGE_TOP_CARDS`, `REVEAL_TRIGGER`, etc.). Use the action type the modal *emits*, not the prompt type. The OPT-285 narrowing is the typo guard — don't widen it.
  - `CARD_DRAWN` payloads carry `cardId` for the flight visual. The reducer (`drawTopOfDeck` in `apply-event.ts`) ignores the payload and slices `deck[0]`, so any cardId would "work" structurally — but `eventToTransitions` reads `event.payload.cardId` for the flying-card art. **Match the payload's `cardId` to the actual deck-top `cardId`** or the flight will animate the wrong face.
  - The runner's `event` step defaults to `DEFAULT_EVENT_DELAY_MS = 800` before applying. The 60ms `wait` between draws is mostly there to ensure the events land in distinct effect ticks of `useCardTransitions` (so each gets its own batch) — at 800ms event delays, the visible spacing is dominated by the event delays themselves. If a batch wants the two-arrival stagger to actually live inside `applyBatchStagger`, that requires events that arrive in the same React effect cycle (e.g., the engine emitting both within one tick). For sandbox authoring, separate event steps are fine.
  - The info panel renders only at `lg+` (`hidden lg:block` in scenario-runner.tsx). If a batch scenario relies on the `cardsUsed` thumbnails to communicate something critical, author for `lg+` viewports — or surface it via `expectedResponse.hint` so the in-board navbar badge picks it up.
- **Unresolved:**
  - Browser verification on `/sandbox/draw-2` and `/sandbox/select-target` was not run by this session (non-interactive). Type-check, lint, and 157 unit tests pass; the field-drift contract holds. **Do a manual smoke before relying on the visuals** — that's the cheap way to catch any rendering surprise the unit tests don't cover.
  - Yellow/Black leaders are still out of scope per OPT-287. If a batch scenario (OPT-294/295/296) needs one, extend `SANDBOX_CARD_DB` in the same PR rather than reaching for the live API.
  - The OPT-287 follow-up (sweep `cardsUsed` across all scenarios for unknown IDs) is now satisfied by `manifest.test.ts`'s "references only cardIds present in `SANDBOX_CARD_DB`" check. Future scenarios get this guarantee for free.
- **Why this matters for OPT-293+ (and parallel batches OPT-294/295/296):** The two templates here are the shape every future scenario follows. Spectator scenarios mostly compose `CARD_*` events and lean on the production animation hooks; interactive scenarios author a single prompt step + a tight predicate. Both templates inline `TURN`/initial-state setup — when that grows tedious across a batch, lift it into a `_shared.ts` next to the batch's files. Don't preemptively factor it; let the second batch tell you what's actually shared.

### OPT-291 → OPT-292
**From:** session on 2026-04-25 · **Commit:** `5665e83` · **PR:** [#138](https://github.com/corycunanan/optcg-sim/pull/138)

- **Primer:** The scenario player route is real. `src/app/sandbox/[scenarioId]/page.tsx` is a server component that resolves the manifest entry (404s if unknown) and renders `<ScenarioRunner scenario={...} />`. `ScenarioRunner` (client) wires runner → gate → session → `<BoardLayout>` in the order the OPT-290 handoff prescribed, and adds two pieces of chrome: `ScenarioInfoPanel` (right) and `PlaybackControlBar` (bottom). Mute is a UI stub — local state only, persistence belongs to OPT-297.
- **Read first:** `src/components/sandbox/scenario-runner.tsx` (the wire-up — every layer of the architecture meets here), `src/components/sandbox/scenario-info-panel.tsx` (consumes `gate.hint` + `scenario.cardsUsed` against `SANDBOX_CARD_DB`), `src/components/sandbox/playback-control-bar.tsx` (transport — Pause replaces Play while playing; Step is hidden when ended; mute toggle is a stub).
- **Gotchas / do NOT touch:**
  - The session input passed to `useSandboxGameSession` is **memoized on the caller side**. `useSandboxGameSession`'s internal `useMemo` keys on input identity, so an inline object literal would invalidate the memo every render. If a new field is added to the wiring, extend the `useMemo` in `scenario-runner.tsx` — don't drop back to inline construction.
  - The provider receives `initialState: scenario.initialState` and `events: runner.eventLog` — **not** `runner.derivedGameState`. The provider folds events itself via `applyEvent`, and `BoardLayout`'s `useCardTransitions` keys flight animations off the `eventLog` array growing over time. Pre-folding the state would silence the animations.
  - `BoardLayout` uses `window.visualViewport` for its absolute geometry math. On the sandbox player page it lives inside a flex column with header + control bar above/below, so the math thinks it has more vertical room than it actually does. On typical desktop (≥1080p) the field still fits comfortably, but if OPT-292's smoke scenarios surface clipping on smaller viewports, the right fix is **inside `board-geometry.ts`** (let the layout consult its container) — don't paper over with extra padding in the runner shell.
  - The info panel renders only at `lg:` and up (`hidden lg:block`). Below `lg`, the board takes the full width. If you author a scenario whose `expectedResponse.hint` is critical to the test, OPT-292 should either (a) author for `lg+` viewports, or (b) hoist the hint into the in-board navbar badge — the gate already exposes `hint.text`.
- **Unresolved:**
  - No DOM-level integration test of the runner shell — same vitest-`environment: "node"` constraint flagged in the OPT-286 and OPT-290 handoffs. The wiring is type-checked end-to-end (`BoardLayoutProps` is a real surface), and the runner/gate/provider have unit coverage individually. OPT-292's vertical-slice scenarios are the first true smoke; if they reveal a wiring bug, that's the cue to add `@testing-library/react` + `happy-dom` for sandbox render tests.
  - Mute toggle is local state only. OPT-297 wires localStorage + the global default. Don't touch the mute stub from OPT-292 — adding persistence here would step on OPT-297's diff.
  - `useScenarioRunner` creates the controller exactly once via `useState(() => createScenarioRunner(scenario))`. If OPT-292 introduces hot-swappable scenarios in tests, that assumption breaks — but each scenario has its own `[scenarioId]` page, so this is fine for now.
- **Why this matters for OPT-292:** OPT-292's two scenarios (`Draw 2` spectator + `SELECT_TARGET` interactive) plug straight into this assembly. Each goes in `src/lib/sandbox/scenarios/<batch>.ts` and registers itself in `src/lib/sandbox/scenarios/index.ts`. Visit `/sandbox/<id>` to verify play/pause/reset/step + the gate's predicate gate for the interactive case. Per the ticket: **if anything feels off, patch the earlier ticket — don't paper over.** The mid-stack location to look first is the input-gate predicate or the runner's `awaiting-response` transition; the assembly itself is thin.

### OPT-293 → OPT-294 (and parallel batches OPT-295/296)
**From:** session on 2026-04-25 · **Commit:** `5902566` · **PR:** [#140](https://github.com/corycunanan/optcg-sim/pull/140)

- **Primer:** Six scenarios shipped under `src/lib/sandbox/scenarios/{draws,movement}/`. Five spectator (event-driven), one interactive (REDISTRIBUTE_DON). The OPT-292 templates held — no upstream patches needed. `SANDBOX_CARD_DB` was sufficient as-is; nothing was added.
- **Read first:** `src/lib/sandbox/scenarios/movement/attach-3-don-staggered.ts` (the multi-DON fan-out shape — `DON_GIVEN_TO_CARD` with `count: N` is a single event step, the hook fans it out), `src/lib/sandbox/scenarios/movement/redistribute-don.ts` (the only interactive one this batch — note the deviation from "spectator" in the ticket and why), `src/lib/sandbox/scenarios/draws/peek-top-3.ts` (the ARRANGE_TOP_CARDS predicate shape — accepts both Skip (`keptCardInstanceId === ""`) and a real pick).
- **Gotchas / do NOT touch:**
  - **Inline-attached DON belongs on the `CardInstance.attachedDon` array, not in `donCostArea`.** When pre-positioning attached DON for a scenario (e.g., `redistribute-don`), build the `CardInstance` literal directly with `attachedDon: [...]` — `makeCard` defaults `attachedDon` to `[]`. The reducer trusts this shape for tokens that should already be attached at scene open.
  - **`DON_GIVEN_TO_CARD` is one event regardless of count.** The `count: N` payload triggers the fan-out branch in `eventToTransitions` (not the per-token batch stagger). For a multi-DON attach, emit a *single* event with `count: N` — emitting N separate events with `count: 1` would still animate, but the visual cadence comes from `applyBatchStagger` instead of the per-token offsets, and the reducer would lose the "atomic attach" semantic.
  - **`redistribute-don` is interactive even though the ticket says spectator.** The redistribute-don-overlay is fundamentally interactive (Skip / Confirm / Undo are the entire interaction surface) — a spectator gate would render the overlay with non-functional buttons. If a future batch tries to author another "show the overlay" spectator scenario, push back at planning, not at authoring.
  - **`CARD_PLAYED` always lands in the *first empty* character slot** per `apply-event.ts:playFromHand`. If a future scenario needs to pin a Character to a specific slot, the reducer needs an `index` field on the `CARD_PLAYED` payload — file a follow-up rather than working around it via initial-state reshuffles.
  - **`use-field-arrivals` runs during render**, not in an effect. It reads the current set of character `instanceId`s and diffs against `prevRef.current`. If you ever wrap or re-key the board layout in a way that re-mounts the field, all current characters will look "new" on remount and the entire field will pop. Don't.
- **Unresolved:**
  - Browser verification on the six new `/sandbox/<id>` pages was not run by this session (non-interactive). Type-check, lint, and 157 unit tests pass; the manifest test asserts the eight registered scenarios are unique and resolve in `SANDBOX_CARD_DB`. **Run a manual smoke before merge** — visual cadence on `attach-3-don-staggered` is the load-bearing acceptance bullet and only the eyes can confirm.
  - The manifest test (`scenarios/__tests__/manifest.test.ts`) only describes `draw-2` and `select-target` explicitly; it generically covers the batch via the unique-IDs / cardId-resolves checks. If a future batch wants per-scenario assertions, the existing per-scenario `describe` blocks are the pattern — but resist the urge to mirror it for every new file. The contract tests are the load-bearing ones.
- **Why this matters for OPT-294 (Combat) and parallel batches OPT-295 (KO+Life) / OPT-296 (Prompts):** the same two templates from OPT-292 still apply — spectator scenarios string `CARD_*` events together, interactive scenarios are a single prompt step + tight predicate. OPT-294 needs counter-from-hand, which is the only interactive in that batch (`USE_COUNTER` action against an attacker target). OPT-295 is all spectator; the `kind: "ko"` flight branch and `LIFE_TRASH_REASONS` routing are the surfaces. OPT-296 covers the four remaining prompt modals — same predicate-permissive shape as `peek-top-3` is fine. Cross-batch: don't preemptively factor a `_shared.ts`; the patterns above (turn const, deck/hand stub builders) are 6–10 lines each and stay readable inline.

