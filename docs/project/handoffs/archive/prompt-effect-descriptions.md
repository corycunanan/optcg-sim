---
linear-project: Prompt Effect Descriptions: Clause-Scoped Modal Text
linear-project-url: https://linear.app/optcg-sim/project/prompt-effect-descriptions-clause-scoped-modal-text
last-updated: 2026-09-03
---

# Prompt Effect Descriptions: Clause-Scoped Modal Text — Handoff Doc

Prompt modals now show the active effect clause with the shared effect-text presentation; all three project tickets merged by 2026-09-03 and the Linear project is Completed.

---

## Action Plan

| Order | Ticket | Title | Estimate | Depends on | Status | PR | Notes |
|-------|--------|-------|----------|------------|--------|----|-------|
| 1 | OPT-760 | Make `extractEffectDescription` match imported card text | — | — | Done | [#621](https://github.com/corycunanan/optcg-sim/pull/621) | Newline, preamble, and authored `source_text` extraction. |
| 2 | OPT-762 | Render prompt modal descriptions with `EffectText` | — | OPT-760 | Done | [#620](https://github.com/corycunanan/optcg-sim/pull/620) | Five modals share notation rendering and an accessible title contract. |
| 3 | OPT-761 | Route raw prompt text through clause extraction | — | OPT-760 | Done | [#622](https://github.com/corycunanan/optcg-sim/pull/622) | Eight prompt sites now use block-aware source selection. |

**Next up:** All three tickets are merged; Linear project marked Completed on 2026-09-03.

---

## Handoffs

### OPT-760 → OPT-762

**Status:** Merged 2026-08-29 · **Squash commit:** `d6108eff` · **PR:** [#621](https://github.com/corycunanan/optcg-sim/pull/621)

- **Primer:** `extractEffectDescription` now splits on newlines, isolates a single bracketed clause after a same-line preamble, and returns `EffectBlock.source_text` before applying heuristics. The old splitter predated the pipeline format, which converts `<br>` boundaries to newlines.
- **Read first:** `workers/game/src/engine/effect-resolver/action-utils.ts`, `workers/game/src/__tests__/extract-effect-description.test.ts`.
- **Gotchas / do NOT touch:** Keep authored `source_text` verbatim. It is the durable escape hatch when printed-text heuristics are ambiguous.
- **Unresolved:** Two effect blocks that share one trigger keyword still resolve to the first matching section unless the schema authors `source_text`.
- **Why this matters for OPT-762:** Modal presentation can consume one extracted clause without reimplementing worker-side splitting.

### OPT-762 → OPT-761

**Status:** Merged 2026-08-29 · **Squash commit:** `16ddd163` · **PR:** [#620](https://github.com/corycunanan/optcg-sim/pull/620)

- **Primer:** Five game prompt modals render `effectDescription` through `src/components/cards/effect-text.tsx` for shared notation chips, emphasis, and line breaks.
- **Read first:** `src/components/game/select-target-modal.tsx`, `src/components/game/player-choice-modal.tsx`, `src/components/game/arrange-top-cards-modal.tsx`, `src/components/game/optional-effect-modal.tsx`, `src/components/game/reveal-trigger-modal.tsx`.
- **Gotchas / do NOT touch:** Preserve a persistent, screen-reader-only `DialogTitle` beside visible `EffectText`. `DialogTitle asChild` drops Radix's title ID and heading role; review found and fixed both accessibility blockers.
- **Unresolved:** None.
- **Why this matters for OPT-761:** Once every prompt producer supplies clause-scoped text, these modals present it consistently without weakening the dialog naming contract.

### OPT-761 → Project complete

**Status:** Merged 2026-09-03 · **Squash commit:** `978ea05c` · **PR:** [#622](https://github.com/corycunanan/optcg-sim/pull/622)

- **Primer:** Eight raw `effectText` prompt sites now use `promptEffectDescription`; `sourceTextForBlock` gives the resolver and prompt paths one block-aware source contract.
- **Read first:** `workers/game/src/engine/effect-resolver/action-utils.ts`, `workers/game/src/engine/effect-resolver/resolver.ts`, `workers/game/src/engine/replacements.ts`, `workers/game/src/__tests__/extract-effect-description.test.ts`.
- **Gotchas / do NOT touch:** Preserve the deliberate precedence: TRIGGER blocks use `triggerText ?? effectText`; every other block uses `effectText`. Do not restore blanket `triggerText ?? effectText`. A card's `[Trigger]` clause must not describe a non-TRIGGER block. Adversarial review found zero authored-card regressions under this contract.
- **Unresolved:** Replacement-prompt block routing through `sourceEffectBlockId` in `workers/game/src/engine/replacements.ts` remains Rung 2 and has no dedicated regression test. Review verified it once with an OP17-095 runtime probe.
- **Why this matters:** Prompt producers and modal consumers now preserve clause identity from the active schema block through accessible player-facing text.

---

## Deferred Follow-ups

- **Replacement prompts:** Add a dedicated regression test for `sourceEffectBlockId` routing in `workers/game/src/engine/replacements.ts`. The current evidence is one manual runtime probe with OP17-095 during PR #622 review.
- **Duplicate trigger keywords:** Two effect blocks that share one trigger keyword still map to the first matching printed section. Add verbatim `source_text` to the schema when that ambiguity occurs.
- **Modal accessibility contract:** Keep a persistent `sr-only` `DialogTitle` beside visible `EffectText`; do not replace it with `DialogTitle asChild`.
