---
linear-project: Card Animations
linear-project-url: https://linear.app/optcg-sim/project/card-animations-da25976dfe30
last-updated: 2026-04-22 (OPT-267 merged)
---

# Card Animations — Handoff Doc

Unify game card rendering into a single composable `<Card>` primitive, polish the way cards feel (Balatro-inspired), and close remaining M5d animation gaps. Umbrella: [OPT-263](https://linear.app/optcg-sim/issue/OPT-263/).

---

## Action Plan

Tickets in execution order. Ordering criteria: dependencies → estimate → priority → risk. Within each phase the Linear project's `description` is the source of truth if this table drifts.

| Order | Ticket | Title | Priority | Depends on | Status | PR | Notes |
|-------|--------|-------|----------|------------|--------|----|-------|
| 1 | OPT-266 | Build `<Card>` primitive with 3D DOM foundation | High | — | Done (2026-04-21) | [#99](https://github.com/corycunanan/optcg-sim/pull/99) merged; [#101](https://github.com/corycunanan/optcg-sim/pull/101) VQA polish | Gate — blocks every other ticket in the project |
| 2 | OPT-267 | Migrate `field-card.tsx` to `<Card>` (pilot) | Medium | OPT-266 | Done (2026-04-22) | [#102](https://github.com/corycunanan/optcg-sim/pull/102) merged | Pilot — API tuned: added `motionDelay`. Ring semantics deferred to OPT-273. |
| 3 | OPT-268 | Migrate `hand-layer.tsx` to `<Card>` | Medium | OPT-267 | Backlog | — | Serial after pilot (shared-file risk with field-card) |
| 4 | OPT-269 | Migrate passive zones (DON active + life + trash) | Medium | OPT-267 | Backlog | — | |
| 5 | OPT-270 | Migrate `card-animation-layer.tsx` (flying cards) | Medium | OPT-267 | Backlog | — | Must compose with 3D flip for OPT-276 |
| 6 | OPT-271 | Migrate modal cards + unify `CardTooltip` | Medium | OPT-267 | Backlog | — | Consolidates the two tooltip paths |
| 7 | OPT-272 | Delete `BoardCard` + design-system cleanup | Low | OPT-267..271 | Backlog | — | Capstone — migration gate |
| 8 | OPT-275 | Balatro-style passive motion | Medium | OPT-267 | Backlog | — | Can start once field-card is on primitive |
| 9 | OPT-276 | Drag tilt + flip animations | Medium | OPT-266, OPT-270 | Backlog | — | Flip uses the 3D structure from OPT-266 |
| 10 | OPT-273 | Battle-state micro-interactions | Medium | OPT-267 | Backlog | — | New `<Card state>` values + presets |
| 11 | OPT-274 | Entry + hand re-fan micro-interactions | Medium | OPT-267, OPT-268, OPT-270 | Backlog | — | |
| 12 | OPT-121 | Remaining event coverage + indicator polish | High | primitive finalized | Backlog | — | Last — composes indicators through overlay slots |

**Status values:** use Linear status names verbatim (`Backlog`, `Todo`, `In Progress`, `In Review`, `Done`, `Canceled`).

**Next up:** OPT-268 — `hand-layer.tsx` migration (serial after the pilot).

---

## Handoffs

Append new entries at the bottom. Each entry is written *by* the agent who just finished a ticket, *for* the agent who picks up the next ticket.

### OPT-266 → OPT-267
**From:** session on 2026-04-20 · **Commit:** `2ef2ff5` (+ `99cffbf`) · **PR:** #99

- **Primer:** `<Card>` primitive lives at `src/components/game/card/` with a 3D DOM structure (perspective container → preserve-3d faces → front/back, both always mounted). It composes existing motion presets through a pure `stateToMotionConfig(state, variant, reducedMotion)` mapping. `BoardCard` is untouched; no consumers migrated in this ticket. `/preview/card` renders the full variant × state × size matrix.
- **Read first:** `src/components/game/card/card.tsx` (composition), `state-presets.ts` (state enum + preset mapping), `types.ts` (public API), `sizes.ts` (size tokens align with `board-layout/constants.ts`). Diff `board-card.tsx` side-by-side with `card.tsx` when porting.
- **Gotchas / do NOT touch:**
  - Dnd-kit, zone registration, and external flight positioning are **intentionally** out of the primitive. Keep them in the consumer wrapper (the current pattern in `field-card.tsx` is right — wrap `<Card>` in the existing `motion.div` + `useDraggable/useDroppable` refs).
  - `state` is a single enum, not orthogonal flags. `state="rest"` = game-RESTED (90° rotate + dim). Selection/validation feedback goes through `overlays.highlightRing`, not through additional states. Combining `rest` with a highlight ring is legal.
  - Tooltip is opt-in: the primitive reuses the existing `CardTooltip` from `../use-card-tooltip` — don't duplicate. OPT-271 is the consolidation ticket, not OPT-267.
- **Unresolved:**
  - No jsdom in `vitest.config.ts` yet (node env). Component-render tests need either a jsdom config or a dedicated config file — deferred; OPT-267 should raise this if it wants rendered tests, otherwise stay on the pure unit-test pattern used here.
  - Size token `preview` (200×280) is only used by the preview page; remove in OPT-272 if no production consumer picks it up.
- **Why this matters for OPT-267:** OPT-267 is the pilot — the first consumer to prove the primitive API survives contact with reality (dnd-kit drag/drop, right-click menu, attack drop target, DON drag-source bar, redistribute overlay, zone registration). Expect API tuning. If a prop is awkward for `field-card.tsx`, fix the primitive in the same PR — don't paper over it downstream.

#### Round 2 VQA (2026-04-21) · PR #101
Follow-up polish on the merged primitive, still under OPT-266 scope. Public API unchanged — consumers get these for free once they migrate.
- **DON label in rest state.** The pill was inside the card's rotating layer, so its `bottom-1 right-1` anchor rotated with the card and ended up overflowing the visible bottom-*left* of a rested card. Moved it out of the rotating layer; `right`/`bottom` insets are now computed from the card's un-rotated `(W, H)` so it tracks the *visible* bottom-right in both orientations (`card.tsx` lines ~137-155). Count badge is untouched (stacked-zone cards don't rest).
- **Motion structure split.** The rotating `motion.div` now wraps a nested interaction `motion.div`. Outer owns state rotate/opacity/filter (`cardRest`/`cardActivate`), inner owns `whileHover`/`whileTap`. Done so interaction transforms *compose* with state rotation instead of overwriting it — rested cards wiggle around 90° now, not snap back to 0°.
- **Hover feel.** Scale springs *in* (stiffness 420 / damping 13, faster + more pronounced than `cardActivate`) and tweens *out* (150ms easeOut) so the bounce plays on pointer-enter only. Added a single-cycle ±1.2° / 550ms rotate wiggle on hover-in via keyframes in `board.card.hover` / `handHover` — cards feel alive when picked up.
- **Preview addition.** `/preview/card` now has a **Board simulation — active ↔ rest toggle** section: single field card with DON, inside a 112×112 `SQUARE` slot matching the real character row, with a `secondary` button to flip state. Useful for VQA'ing the rotation + DON + hover combo in isolation.

### OPT-267 → OPT-268
**From:** session on 2026-04-22 · **Commits:** `bd358c2` (primitive), `88508e5` (consumer) · **PR:** #102

- **Primer:** `field-card.tsx` is now on `<Card variant="field">` — the hardest-complexity consumer survived. The primitive owns rest/active rotate + brightness, hover/tap springs, DON corner badge, and tooltip. Consumer wrapper retains dnd-kit refs, zone registration, action menu, selection/blocker rings, `DropOverlay`, DON-redistribute amber bar, and drag-origin opacity. Pattern validated for OPT-268..271.
- **Read first:** `src/components/game/board-layout/field-card.tsx` (the reference pattern for all zone migrations), `src/components/game/card/state-presets.ts` + `card.tsx` for the `motionDelay` wiring, `src/components/game/board-layout/hand-layer.tsx` (OPT-268 target).
- **Gotchas / do NOT touch:**
  - Selection ring and blocker blue ring live as Tailwind classes on the *consumer* outer motion.div, not on the primitive. Don't try to route them through `overlays.highlightRing` — that overlay intentionally no-ops for `selected`/`invalid` right now (see comment in `card-highlight-ring.tsx`). OPT-273 is where ring semantics consolidate.
  - Drag-origin opacity (0.3 ghost) is owned by the consumer (minimal opacity-only `motion.div`). The primitive's `state="dragging"` is explicitly non-dimming because dnd-kit overlays own drag visuals elsewhere — but field-card doesn't use a DragOverlay, so the consumer has to dim itself. Replicate this pattern in hand-layer.
  - DON badge switched from a full-width bar to a corner pill (primitive default). That's intentional — the OPT-266 redesign. If a wrapper relies on bottom-bar geometry (e.g. the DON redistribute amber bar still stretches full-width), it overlays the pill correctly but the z-index order matters: primitive is `z-[1]`, drag-source bar is `z-20`.
  - `donCountAdjust` + `pendingTransferDonIds` are resolved inside the consumer into a single `overlays.donCount` integer. The primitive doesn't know about adjustments or pending transfers.
- **Unresolved:**
  - Ring semantics consolidation → OPT-273. Until then, every consumer replicates the `ring-2 ring-gb-accent-green shadow-[...]` / `ring-2 ring-gb-accent-blue/40` className pair on the outer wrapper when selection is in play.
  - No visual VQA happened this session (auto mode, no browser). The behaviors listed in the PR test plan are unverified manually; first thing to do when picking up OPT-268 is spin up a 2-player lobby and walk through the field-card checklist on PR #102 before depending on its claims.
  - `BoardCard` is still alive and used by non-migrated zones (life, deck, trash stacks, leader-empty placeholder, `DroppableStageZone`). Do not delete yet — that's OPT-272.
- **Why this matters for OPT-268:** hand-layer is structurally simpler than field-card (no dnd-kit droppable, no action menu, no DON), but it introduces *hand-specific* motion — the hand fan/re-fan + card-raise on hover. Reuse the field-card consumer pattern (primitive inside, dnd-kit + interactions outside). The primitive's `variant="hand"` already wires `handCardHover` and suppresses tap; expect less API tuning than the pilot needed.
