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
| 1 | OPT-416 | Unify interaction grammar: drag commits, click selects | — | — | Done | [#286](https://github.com/corycunanan/optcg-sim/pull/286) | Foundation for every board interaction |
| 2 | OPT-415 | Bug: hand dims/disables rule-mod-granted counter cards the server would accept (OPT-400 mismatch) | — | — | Done | [#288](https://github.com/corycunanan/optcg-sim/pull/288) | Fix the known legality lockout before expanding the legality layer |
| 3 | OPT-417 | Client-side legality layer: highlights become a trustworthy contract | — | OPT-416, OPT-415 | Done | [#289](https://github.com/corycunanan/optcg-sim/pull/289) | Browser VQA passed for dimming, tooltip, and drag-target signals |
| 4 | OPT-418 | Visible rejection feedback when the server refuses an action | — | — | In Review | [#294](https://github.com/corycunanan/optcg-sim/pull/294) | Independent server-authority backstop |
| 5 | OPT-419 | In-place effect targeting: SELECT_TARGET on the board when candidates are visible | — | OPT-416, OPT-417 | Backlog | — | Reuses selection grammar and legality signals |
| 6 | OPT-420 | Effect activation discoverability: badge + left-click menu | — | OPT-416 | Backlog | — | Completes the menu verb |
| 7 | OPT-421 | Keyboard + ARIA for all core game actions | — | OPT-419, OPT-420 | Backlog | — | Add input equivalence after gestures stabilize |
| 8 | OPT-464 | Spotlight surface: public reveal overlay for Events, effect reveals, and triggers | — | OPT-416, OPT-419 | Backlog | — | Completes Event presentation and public reveals |
| 9 | OPT-465 | Transform-class zone transitions + pile receipt: fizzle, pile pop, floating +N delta | — | OPT-464 | Backlog | — | Builds Event fizzle on the spotlight lifecycle |
| 10 | OPT-422 | Inspection parity, small state edges, and dead interaction code | — | OPT-421 | Backlog | — | Final cleanup and parity pass |

**Status values:** use Linear status names verbatim (`Backlog`, `Todo`, `In Progress`, `In Review`, `Done`, `Canceled`). Don't invent.

**Next up:** OPT-418 after OPT-417 VQA and merge.

---

## Handoffs

### OPT-416 → OPT-415
**From:** session on 2026-07-12 · **Commit:** `c18ac12` · **PR:** #286

- **Primer:** Board actions now follow drag-commit/click-select semantics: Character counters target the defender, Events use the own-field surface, blocker selection is escapable, and attached-DON redistribution uses a DON token.
- **Read first:** `src/components/game/board-layout/hand-layer.tsx`, `src/components/game/board-layout/use-board-dnd.ts`, `src/components/game/board-layout/player-field.tsx`
- **Gotchas / do NOT touch:** PR #286 still needs browser VQA for nested drop targeting and board-floor handle sizing; keep the 8px pointer activation constraint unchanged.
- **Unresolved:** OPT-415 intentionally remains: `HandLayer.isCounterEligible` still hard-disables Characters based on printed counter even though the new dispatcher accepts any Character and lets the server validate rule-mod grants.
- **Why this matters for OPT-415:** The dispatch side is now permissive and defender-targeted; OPT-415 only needs to bring hand eligibility and dimming into agreement without restoring client-side printed-counter gating.

### OPT-415 → OPT-417
**From:** session on 2026-07-12 · **Commit:** `602ed0e` · **PR:** #288

- **Primer:** Counter eligibility now has one client contract: all Characters remain attemptable for rule-mod grants, while only printed `[Counter]` Events are eligible.
- **Read first:** `src/lib/game/counter-eligibility.ts`, `src/components/game/board-layout/hand-layer.tsx`, `src/components/game/board-layout/player-field.tsx`
- **Gotchas / do NOT touch:** Do not reintroduce printed Character counter checks; the server owns effective counter validation and OPT-418 owns visible rejection feedback.
- **Unresolved:** The client still does not receive effective per-card counter values, so Characters without a grant remain intentionally soft-enabled rather than falsely disabled.
- **Why this matters for OPT-417:** The legality layer should reuse this soft-disable boundary: hard-disable immutable type mismatches, but allow attempts when hidden rule mods can change legality.

### OPT-417 → OPT-418
**From:** session on 2026-07-12 · **Commit:** `ac9f630` · **PR:** #289

- **Primer:** Main-phase hand cards now use effective cost for 35% affordability dimming and exact DON-shortfall tooltips. Drag signals are type-filtered, unaffordable attempts remain soft-enabled without lighting targets, and attack overlays register only the opponent leader plus RESTED Characters.
- **Read first:** `src/lib/game/client-legality.ts`, `src/components/game/board-layout/hand-layer.tsx`, `src/components/game/board-layout/drop-zones.tsx`, `src/components/game/board-layout/field-card.tsx`
- **Gotchas / do NOT touch:** Unaffordable cards deliberately remain draggable so the server can accept effect-modified exceptions; `HandCardDrag.affordable` suppresses target signals without blocking the attempt. Events retain nested own-field droppables but do not light individual Character or Stage zones.
- **VQA required:** In a Main-phase game, verify effective-cost dimming and the “Need N more DON” tooltip; drag an unaffordable card and confirm no play targets light; verify Character/Stage/Event target filtering; attack and confirm the leader + RESTED Characters light while ACTIVE Characters do not.
- **Why this matters for OPT-418:** Soft-enabled affordability and exotic attack restrictions can still be rejected by the server. OPT-418 must make those intentional backstop rejections visible without converting them into client hard-lockouts.

### OPT-418 → OPT-419
**From:** session on 2026-07-12 · **Commit:** `e20a610` · **PR:** #294

- **Primer:** Well-formed server refusals now arrive as typed `action:rejected` messages carrying the attempted action and reason. The client keeps that rejection until an accepted state update, renders the reason in the mid-zone, and maps card-sourced actions to localized grey shake/dim feedback.
- **Read first:** `shared/game-types.ts`, `src/hooks/use-game-ws.ts`, `src/components/game/board-layout/action-feedback.tsx`, `src/components/game/board-layout/mid-zone.tsx`
- **Gotchas / do NOT touch:** Keep protocol/transport failures on `game:error`; `action:rejected` is only for well-formed game actions. Do not clear rejection state when sending the next attempt—accepted `game:state`/`game:update` owns that transition.
- **Unresolved:** In-place `SELECT_TARGET` presentation remains entirely in OPT-419. Its accepted selection should reuse the existing board selection grammar; rejected submissions already map the first selected instance to localized feedback.
- **Pointer:** `git show e20a610`; replay `/sandbox/action-rejected` for the settled mid-zone and motion treatment.
