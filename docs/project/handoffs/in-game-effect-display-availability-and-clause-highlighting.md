---
linear-project: In-Game Effect Display: Availability & Clause Highlighting
linear-project-url: https://linear.app/optcg-sim/project/in-game-effect-display-availability-and-clause-highlighting-f9b0f0033de1
last-updated: 2026-07-16
---

# In-Game Effect Display: Availability & Clause Highlighting — Handoff Doc

Server-computed availability, clause-level tooltip styling, action gating, usable rings, and durable source mapping are implemented; all seven project tickets merged on 2026-07-16 and the Linear project is Completed.

---

## Action Plan

| Order | Ticket | Title | Estimate | Depends on | Status | PR | Notes |
|-------|--------|-------|----------|------------|--------|----|-------|
| 1 | OPT-393 | Server: compute per-card effect availability and broadcast it | — | — | Done | [#354](https://github.com/corycunanan/optcg-sim/pull/354) | Availability contract and broadcast foundation. |
| 2 | OPT-394 | Client: clause segmentation lib — map effectText segments to schema blocks | — | — | Done | [#353](https://github.com/corycunanan/optcg-sim/pull/353) | Conservative bracket-heuristic mapping. |
| 3 | OPT-395 | Client: effect-availability context/hook consuming the broadcast | — | OPT-393 | Done | [#355](https://github.com/corycunanan/optcg-sim/pull/355) | Shared client consumption point. |
| 4 | OPT-396 | Tooltip: per-clause effect rendering with availability styling | — | OPT-394, OPT-395 | Done | [#357](https://github.com/corycunanan/optcg-sim/pull/357) | Clause-level player-facing rendering. |
| 5 | OPT-397 | Action menu: gate Activate items on real availability with reason tooltips | — | OPT-395 | Done | [#356](https://github.com/corycunanan/optcg-sim/pull/356) | Server-authoritative activation gating. |
| 6 | OPT-398 | Board: "usable effect" ring indicator on cards with an activatable effect | — | OPT-395 | Done | [#358](https://github.com/corycunanan/optcg-sim/pull/358) | Ambient board affordance. |
| 7 | OPT-399 | Schema: optional source_text on EffectBlock for durable clause mapping (Phase 2) | — | OPT-396 | Done | [#359](https://github.com/corycunanan/optcg-sim/pull/359) | Merged 2026-07-16 as squash commit `d264758`. |

**Next up:** All 7 tickets merged same-day 2026-07-16 (PRs #353-#359); Linear project marked Completed.

---

## Handoffs

### OPT-399 → Project complete

**Status:** Merged 2026-07-16 · **Squash commit:** `d264758` · **PR:** [#359](https://github.com/corycunanan/optcg-sim/pull/359)

- **Primer:** Exact verbatim `source_text` now wins clause mapping when fresh, while absent or stale values degrade to the existing heuristic.
- **Read first:** `src/lib/game/effect-clauses.ts`, `workers/game/src/engine/effect-types.ts`, `workers/game/src/__tests__/schema-source-text.test.ts`.
- **Gotchas / do NOT touch:** Do not bulk-backfill all sets or guess/paraphrase source text; copy from `docs/cards/<set>.md` and leave the field absent when uncertain.
- **Unresolved:** One printed clause maps to multiple blocks on OP13-114, OP14-111, and ST14-001; the singular `EffectClause.blockId` cannot represent those safely and the PR Follow-ups section records the design decision needed.
- **Why this matters:** PR #359 completes the project's durable clause-mapping phase without weakening neutral rendering for ambiguous or stale text.

---

## Deferred Follow-ups

- **PR #354:** Public-only availability for opponent-controlled cards — this project intentionally omits opponent entries entirely because cost/target availability can depend on hidden zones; a richer public-only computation is future work.
- **PR #356:** Worker engine does not recognize any_of ACTIVATE_MAIN triggers (availability.ts isActivateMain + execute.ts executeActivateEffect); no such schema exists today — extend recognition in both places before authoring one, then relax the UI fail-closed rule for compound blocks. Also coordinate getActivateMainState (client opener) which only recognizes trigger.keyword.
- **PR #357:** The tooltip component does not render triggerText (stale ticket reference); trigger-body presentation should be tracked separately if desired.
- **PR #358:** Manual 1280x640 ring-legibility visual check still pending (no browser backend was available during implementation; ring-4 floor rule gives compliance-by-construction). ALSO: EffectAvailabilityContext invalidates all subscribers on every broadcast (mirrors the ActiveEffectsProvider pattern); if board rerender cost matters, add per-instance subscriptions — touches the OPT-395 context surface.
- **PR #359:** OP13-114, OP14-111, ST14-001 each encode one printed clause as multiple blocks; singular EffectClause.blockId cannot map those safely — a future ticket should decide multi-block clause views vs schema consolidation. New/future schema work should add verbatim source_text incrementally; the heuristic remains the fallback forever.
- **Orchestrator review note:** card-action-menu.tsx no longer uses the activation/canActivateNow props but CardActionMenuContentProps still declares them and field-card.tsx + drop-zones.tsx still pass them — prune the dead props (left in place during the parallel wave to avoid cross-ticket file conflicts).
- **CI note:** opt-242-threshold-permanent-fixed-point.test.ts's 50ms wall-clock assertion flaked twice on shared runners today (pre-existing flake class, unrelated to this project's diffs).
