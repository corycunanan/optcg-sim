# Animation Sandbox — clock determinism

**Status:** v1 non-goal. The sandbox is a live-playback surface, not a snapshot-test fixture. This doc captures where wall-clock timing currently lives so a future ticket can pick up the determinism story without re-deriving the surface area.

---

## Where wall-clock timing lives today

### `src/hooks/use-card-transitions.ts`

The animation hook reads the current time directly from the host environment in three places:

- `Date.now()` at lines 73, 141, 208 — assigned to `CardTransition.startedAt` so the auto-expire pass can age out flights that never fired their `onAnimationComplete`.
- `Date.now()` at line 305 — the auto-expire pass itself, used as the reference point against `t.startedAt`.
- `setTimeout(..., AUTO_EXPIRE_MS = 1500)` at line 304 — the safety-net cleanup timer.
- `setTimeout(..., 300)` at line 248 — the post-drag cooldown that suppresses a redundant ghost card after the server-confirmed state lands.
- `STAGGER_MS = 60` at line 41 — the per-batch delay between sibling arrivals (multi-card draws, multi-DON fan-outs). Not a wall-clock read, but a load-bearing timing constant; any clock-injection scheme would also need to surface this so tests can fast-forward through staggers.

### `src/components/sandbox/use-scenario-runner.ts`

The runner controller schedules step advances with the host `setTimeout`:

- `setTimeout(...)` at line 132 — the timer that advances to the next `event` step after `delayMs ?? DEFAULT_EVENT_DELAY_MS` (800ms default).
- `clearTimeout(...)` at line 86 — pause/reset/dispose teardown.

The runner intentionally does **not** read `Date.now()` or `performance.now()`. Step advancement is "fire after N ms of idle time," not "fire at absolute wall-clock T." This is what lets the existing tests use `vi.useFakeTimers()` cleanly — see `src/components/sandbox/__tests__/use-scenario-runner.test.ts`.

### Architectural choices that already help

The sandbox shipped with three decisions that keep the deterministic surface small:

- **Static-script playback, no engine fork.** Scenarios declare events directly; there is no concurrent engine producing additional timestamped events that would race with playback. The full event timeline is visible at authoring time.
- **Per-frame `applyEvent` fold.** `useScenarioRunner` re-derives the visible game state by folding `applyEvent` over `script[0..currentStepIndex]`. The fold itself is pure — given the same script and index, it returns the same state. No `Date.now()` reads, no random IDs.
- **`setTimeout` over `requestAnimationFrame`.** The runner uses `setTimeout` for step advancement specifically so vitest fake timers work transparently. (See the OPT-289 handoff: "Don't reach for `requestAnimationFrame` or `performance.now()` for delays — that breaks the test path.") Don't migrate the runner to rAF without a parallel mocking story.

---

## Why the sandbox doesn't need clock mocking today

The sandbox's job is **live playback for a human watching in a browser**. The acceptance criteria in OPT-285 → OPT-297 are visual — "the flight fires distinctly," "the modal opens after the life flip" — and verified by eye, not by snapshot.

For the surface that *is* tested, the timing already cooperates:

- Runner controller tests (`use-scenario-runner.test.ts`) use `vi.useFakeTimers()` and walk timers manually. The runner's reliance on `setTimeout` (no `Date.now()`) means fake timers are sufficient on their own.
- Pure-logic tests (`scenario-input-gate.test.ts`, `apply-event.test.ts`, `sandbox-session-provider.test.ts`) don't touch a clock at all — they exercise reducers and predicates over fixed inputs.
- DOM-level smoke tests do not exist by design (vitest is `environment: "node"`, no JSDOM/happy-dom). The OPT-286 / OPT-290 / OPT-291 handoffs all chose the same trade — field-drift and contract tests cover the wiring, real rendering is verified manually in a browser.

So the `Date.now()` calls in `use-card-transitions.ts` are unreachable from the current test surface. They become a problem only if a future ticket wants to assert "scenario X produces exactly transitions A/B/C with start offsets D/E/F" — which is the snapshot-testing story below.

---

## What snapshot-testable scenarios would require

If a future ticket wants to assert per-frame visual output (e.g., golden-image diffs of the board at step N, or programmatic verification that "draw 2" produces two staggered flights with a 60ms gap), three pieces need to land together:

1. **Clock injection in `use-card-transitions.ts`.** Replace each `Date.now()` call with a context-provided clock. Sketch: a `ClockContext` exposing `now(): number`, with the production provider bound to `Date.now` and a test provider returning a controlled counter. Threading through context (not a hook arg) keeps the change additive — the production call sites stay one line each.

2. **`requestAnimationFrame` mock for Motion.** `card-animation-layer` and the underlying Framer Motion timelines drive frames off `requestAnimationFrame` internally. `vi.useFakeTimers()` in vitest can stub `requestAnimationFrame` (`vi.useFakeTimers({ toFake: ["requestAnimationFrame"] })`), but verifying that the resulting frame budget produces the expected interpolated transform requires either reading Motion's internal state (fragile — internal API) or driving the timeline through a controllable scheduler. The library exposes some hooks for this; pin the version before relying on them.

3. **DOM rendering harness.** Move sandbox tests off `environment: "node"` for snapshot suites specifically (via per-file `// @vitest-environment happy-dom` headers, not a global flip — node is right for the rest). Add `@testing-library/react` for mounting `<ScenarioRunner>` end-to-end. The OPT-286 / OPT-290 / OPT-291 handoffs all flagged this as the cue — this is the cue.

None of the three is hard in isolation. The reason this is deferred is that all three need to land together to be useful, and the payoff (catch a regression that a manual smoke would also catch) is small relative to the maintenance cost of a brittle frame-by-frame snapshot suite. Until the sandbox grows scenarios where the visual cadence is load-bearing in a way that's easy to break and hard to spot by eye, the live-playback model is the right size.

---

## v1 non-goal

OPT-297 is the closeout for the Animation Sandbox project. Snapshot-test infrastructure was scoped out from the start (see `docs/project/ANIMATION-SANDBOX-SCOPE.md`). This doc exists so that decision is recoverable: the next agent who reaches for snapshot tests should skim this first, file a new ticket if the trade-off has shifted, and use the three-piece breakdown above as the implementation skeleton.

**Out of scope here:**

- Any code change to `src/hooks/use-card-transitions.ts` (per the OPT-297 acceptance bullet).
- Any code change to `src/components/sandbox/use-scenario-runner.ts` for clock injection.
- Any new test infrastructure (`happy-dom`, `@testing-library/react`, etc.).

**In scope here:** documentation only. If you're reading this and weighing a snapshot-test ticket, the answer might be "yes" — file it; the analysis above is the starting point, not the verdict.
