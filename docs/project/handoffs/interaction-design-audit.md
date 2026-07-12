---
linear-project: Interaction Design Audit
linear-project-url: https://linear.app/optcg-sim/project/interaction-design-audit-e427eb5d2b6b
last-updated: 2026-07-12
---

# Interaction Design Audit — Handoff Doc

Unify the game board's interaction grammar, legality signals, targeting, accessibility, and action feedback against `docs/design/INTERACTION-GRAMMAR.md`.

---

## Action Plan

Tickets in execution order. Ordering criteria: dependencies → estimate → priority → risk.

| Order | Ticket | Title | Estimate | Depends on | Status | PR | Notes |
|-------|--------|-------|----------|------------|--------|----|-------|
| 1 | OPT-416 | Unify interaction grammar: drag commits, click selects | — | — | In Review | [#286](https://github.com/corycunanan/optcg-sim/pull/286) | Foundation for every board interaction |
| 2 | OPT-415 | Bug: hand dims/disables rule-mod-granted counter cards the server would accept (OPT-400 mismatch) | — | — | Backlog | — | Fix the known legality lockout before expanding the legality layer |
| 3 | OPT-417 | Client-side legality layer: highlights become a trustworthy contract | — | OPT-416, OPT-415 | Backlog | — | Critical path for trustworthy drag affordances |
| 4 | OPT-418 | Visible rejection feedback when the server refuses an action | — | — | Backlog | — | Independent server-authority backstop |
| 5 | OPT-419 | In-place effect targeting: SELECT_TARGET on the board when candidates are visible | — | OPT-416, OPT-417 | Backlog | — | Reuses selection grammar and legality signals |
| 6 | OPT-420 | Effect activation discoverability: badge + left-click menu | — | OPT-416 | Backlog | — | Completes the menu verb |
| 7 | OPT-421 | Keyboard + ARIA for all core game actions | — | OPT-419, OPT-420 | Backlog | — | Add input equivalence after gestures stabilize |
| 8 | OPT-464 | Spotlight surface: public reveal overlay for Events, effect reveals, and triggers | — | OPT-416, OPT-419 | Backlog | — | Completes Event presentation and public reveals |
| 9 | OPT-465 | Transform-class zone transitions + pile receipt: fizzle, pile pop, floating +N delta | — | OPT-464 | Backlog | — | Builds Event fizzle on the spotlight lifecycle |
| 10 | OPT-422 | Inspection parity, small state edges, and dead interaction code | — | OPT-421 | Backlog | — | Final cleanup and parity pass |

**Status values:** use Linear status names verbatim (`Backlog`, `Todo`, `In Progress`, `In Review`, `Done`, `Canceled`). Don't invent.

**Next up:** OPT-415.

---

## Handoffs

### OPT-416 → OPT-415
**From:** session on 2026-07-12 · **Commit:** `c18ac12` · **PR:** #286

- **Primer:** Board actions now follow drag-commit/click-select semantics: Character counters target the defender, Events use the own-field surface, blocker selection is escapable, and attached-DON redistribution uses a DON token.
- **Read first:** `src/components/game/board-layout/hand-layer.tsx`, `src/components/game/board-layout/use-board-dnd.ts`, `src/components/game/board-layout/player-field.tsx`
- **Gotchas / do NOT touch:** PR #286 still needs browser VQA for nested drop targeting and board-floor handle sizing; keep the 8px pointer activation constraint unchanged.
- **Unresolved:** OPT-415 intentionally remains: `HandLayer.isCounterEligible` still hard-disables Characters based on printed counter even though the new dispatcher accepts any Character and lets the server validate rule-mod grants.
- **Why this matters for OPT-415:** The dispatch side is now permissive and defender-targeted; OPT-415 only needs to bring hand eligibility and dimming into agreement without restoring client-side printed-counter gating.
