---
linear-project: Card Animations
linear-project-url: https://linear.app/optcg-sim/project/card-animations-da25976dfe30
last-updated: 2026-04-21
---

# Card Animations — Handoff Doc

Unify game card rendering into a single composable `<Card>` primitive, polish the way cards feel (Balatro-inspired), and close remaining M5d animation gaps. Umbrella: [OPT-263](https://linear.app/optcg-sim/issue/OPT-263/).

---

## Action Plan

Tickets in execution order. Ordering criteria: dependencies → estimate → priority → risk. Within each phase the Linear project's `description` is the source of truth if this table drifts.

| Order | Ticket | Title | Priority | Depends on | Status | PR | Notes |
|-------|--------|-------|----------|------------|--------|----|-------|
| 1 | OPT-266 | Build `<Card>` primitive with 3D DOM foundation | High | — | Done (2026-04-21) | [#99](https://github.com/corycunanan/optcg-sim/pull/99) | Gate — blocks every other ticket in the project |
| 2 | OPT-267 | Migrate `field-card.tsx` to `<Card>` (pilot) | Medium | OPT-266 | Backlog | — | Pilot — API may tune during this migration |
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

**Next up:** OPT-267 — `field-card.tsx` pilot migration.

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
