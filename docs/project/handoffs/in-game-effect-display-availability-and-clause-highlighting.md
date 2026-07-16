---
linear-project: In-Game Effect Display: Availability & Clause Highlighting
linear-project-url: https://linear.app/optcg-sim/project/in-game-effect-display-availability-and-clause-highlighting-f9b0f0033de1
last-updated: 2026-07-16
---

# In-Game Effect Display: Availability & Clause Highlighting — Handoff Doc

Server-computed availability, clause-level tooltip styling, action gating, usable rings, and durable source mapping are implemented; OPT-399 is the final project ticket and is ready for review.

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
| 7 | OPT-399 | Schema: optional source_text on EffectBlock for durable clause mapping (Phase 2) | — | OPT-396 | In Progress | [#359](https://github.com/corycunanan/optcg-sim/pull/359) | Ready for review; Linear intentionally unchanged per ticket instructions. |

**Next up:** Project complete after PR #359 merges; no follow-up tickets remain in the Action Plan.

---

## Handoffs

### OPT-399 → Project complete

**From:** session on 2026-07-16 · **Commit:** `6583104` · **PR:** [#359](https://github.com/corycunanan/optcg-sim/pull/359)

- **Primer:** Exact verbatim `source_text` now wins clause mapping when fresh, while absent or stale values degrade to the existing heuristic.
- **Read first:** `src/lib/game/effect-clauses.ts`, `workers/game/src/engine/effect-types.ts`, `workers/game/src/__tests__/schema-source-text.test.ts`.
- **Gotchas / do NOT touch:** Do not bulk-backfill all sets or guess/paraphrase source text; copy from `docs/cards/<set>.md` and leave the field absent when uncertain.
- **Unresolved:** One printed clause maps to multiple blocks on OP13-114, OP14-111, and ST14-001; the singular `EffectClause.blockId` cannot represent those safely and the PR Follow-ups section records the design decision needed.
- **Why this matters:** PR #359 completes the project's durable clause-mapping phase without weakening neutral rendering for ambiguous or stale text.
