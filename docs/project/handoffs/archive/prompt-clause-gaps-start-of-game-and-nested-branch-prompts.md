---
linear-project: Prompt Clause Gaps: Start-of-Game and Nested Branch Prompts
linear-project-url: https://linear.app/optcg-sim/project/prompt-clause-gaps-start-of-game-and-nested-branch-prompts-182209655b7b
last-updated: 2026-09-06
---

# Prompt Clause Gaps: Start-of-Game and Nested Branch Prompts — Handoff Doc

Start-of-game and nested-branch prompts now preserve clause-scoped descriptions; all five tickets are Done, and the orchestrator will mark the Linear project Completed after this handoff PR merges.

---

## Action Plan

| Order | Ticket  | Title                                                                                   | Estimate | Depends on | Status | PR                                                        | Notes                                                                                    |
| ----- | ------- | --------------------------------------------------------------------------------------- | -------- | ---------- | ------ | --------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 1     | OPT-764 | Add `prompt_text` to `StartOfGameEffect` and document it                                | 1        | —          | Done   | [#625](https://github.com/corycunanan/optcg-sim/pull/625) | Types and docs; adversarial APPROVE. NIT: the doc-drift gate is vacuous for the new row. |
| 2     | OPT-765 | Apply the block-clause override to prompts raised inside nested choice branches         | 2        | —          | Done   | [#626](https://github.com/corycunanan/optcg-sim/pull/626) | One full and one delta review; merged with survivors filed as OPT-770 and OPT-771.       |
| 3     | OPT-766 | Scope the Imu start-of-game prompt to the Mary Geoise clause                            | 3        | OPT-764    | Done   | [#629](https://github.com/corycunanan/optcg-sim/pull/629) | User-facing fix; multi-rule limitation filed as OPT-769.                                 |
| 4     | OPT-768 | Offer OP11-040 Luffy's start-of-turn search as an optional activation                   | 2        | —          | Done   | [#627](https://github.com/corycunanan/optcg-sim/pull/627) | Premise confirmed by official Q&A; round one strengthened tests; delta APPROVE.          |
| 5     | OPT-767 | Route the remaining raw `effectText` prompt fallbacks through `promptEffectDescription` | 2        | OPT-765    | Done   | [#630](https://github.com/corycunanan/optcg-sim/pull/630) | Adversarial APPROVE; four of six sites remain unproven by mutation.                      |

**Next up:** All five tickets are Done; the orchestrator will mark the Linear project Completed after this handoff PR merges.

---

## Handoffs

### OPT-764 → OPT-765

**Status:** Merged 2026-09-06 · **Squash commit:** `1aa0d7c4` · **PR:** [#625](https://github.com/corycunanan/optcg-sim/pull/625)

- **Primer:** `StartOfGameEffect.prompt_text?: string` provides a prompt-only description that may be a fragment and is never used for highlighting. It is deliberately not `source_text`, whose whole-line equality drives the client clause highlighter in `src/lib/game/effect-clauses.ts`.
- **Read first:** `workers/game/src/engine/effect-types.ts`, `docs/game-engine/07-RULE-MODIFICATIONS.md` §10.8, `docs/game-engine/11-ENCODING-GUIDE.md`, `workers/game/src/engine/authored-schemas.generated.ts`, `pipeline/sync-effect-schemas.ts`.
- **Gotchas / do NOT touch:** Do not replace `prompt_text` with `source_text` or use it for highlighting. Review proved that `prompt_text` survives both the generated registry and the `sync-effect-schemas.ts` collector.
- **Unresolved:** `check-doc-drift.sh` stays green if the new documentation row is deleted.
- **Why this matters for OPT-765:** The new field closes the start-of-game rule-modification gap, while OPT-765 carries the same clause identity through effect-stack continuations and nested choice prompts.

### OPT-765 → OPT-766

**Status:** Merged 2026-09-06 · **Squash commit:** `50d1e741` · **PR:** [#626](https://github.com/corycunanan/optcg-sim/pull/626)

- **Primer:** `withChainDescription` in `workers/game/src/engine/effect-resolver/resolver.ts` preserves clause-scoped prompt text through auto-selected choice branches. `effectDescription?: string` now crosses `EffectStackFrame`, `ResumeContext`, the persisted-frame Zod schema, `resume-core.ts`, and the choice, cost, target, and batch resume paths.
- **Read first:** `workers/game/src/engine/effect-resolver/resolver.ts`, `workers/game/src/types.ts`, `workers/game/src/session/persisted-game-state.ts`, `workers/game/src/engine/effect-resolver/resume-core.ts`, `workers/game/src/engine/effect-resolver/resume/choice.ts`, `workers/game/src/engine/effect-resolver/resume/cost.ts`, `workers/game/src/engine/effect-resolver/resume/target.ts`, `workers/game/src/engine/effect-resolver/resume/batch.ts`.
- **Gotchas / do NOT touch:** Do not apply the outer description to the replacement-batch continuation or trigger-drain return. Those prompts belong to a replacement substitute or another card, so the omitted wrapper is deliberate.
- **Unresolved:** OPT-770 tracks non-optional cost frames, invalid-target re-prompts in `resume/target.ts`, and invalid simultaneous-selection re-prompts in `resume-core.ts`, which still lose the clause as they already did on `main`. OPT-771 tracks nine pass-throughs with no red-going test.
- **Why this matters for OPT-766:** OPT-766 can give each start-of-game rule its own description without nested continuations discarding clause identity.

### OPT-766 → OPT-768

**Status:** Merged 2026-09-06 · **Squash commit:** `4677d28f` · **PR:** [#629](https://github.com/corycunanan/optcg-sim/pull/629)

- **Primer:** `startOfGameEffectDescription(rule, cardData)` chooses authored `prompt_text`, then the first bracket-free printed line, then `"Start-of-game effect"`. `advanceStartOfGameEffects` now runs a per-rule loop with each rule's description, and OP13-079 authors `prompt_text: "At the start of the game, play up to 1 {Mary Geoise} type Stage card from your deck."`
- **Read first:** `workers/game/src/engine/effect-resolver/action-utils.ts`, `workers/game/src/engine/pregame.ts`, `workers/game/src/engine/schemas/op13.ts`, `src/components/cards/effect-text.tsx`.
- **Gotchas / do NOT touch:** Preserve brace notation in the authored prompt so `{Mary Geoise}` renders as a trait chip through `EffectText`.
- **Unresolved:** OPT-769 tracks a multi-rule limitation: a leader with two `START_OF_GAME_EFFECT` rules would skip rules after the first prompting one. No authored card has two.
- **Why this matters for OPT-768:** Start-of-game prompt descriptions now identify the active rule clause; OPT-768 applies the same player-facing precision to an optional phase-boundary activation.

### OPT-768 → OPT-767

**Status:** Merged 2026-09-06 · **Squash commit:** `69f43d8b` · **PR:** [#627](https://github.com/corycunanan/optcg-sim/pull/627)

- **Primer:** OP11-040's `start_of_turn_search` now authors `flags: { optional: true }` and full-line `source_text`. The schema comment records the official Q&A ruling: activation is the player's choice, and the effect resolves at the start of the Refresh Phase before the draw.
- **Read first:** `workers/game/src/engine/schemas/op11.ts`, `workers/game/src/__tests__/op11-040-start-of-turn-optional.test.ts`.
- **Gotchas / do NOT touch:** Keep `source_text` as the full printed line. The multi-clause test expects only the `OPTIONAL_EFFECT` description; after acceptance, the `ARRANGE` description depends on OPT-765's persisted frame contract.
- **Unresolved:** None. OPT-765's delta review verified the post-accept `ARRANGE` description after both changes merged.
- **Why this matters for OPT-767:** The pipeline and `resumePromptLifecycle` test demonstrate clause identity across an optional prompt and its accepted continuation before the remaining raw fallback sites are migrated.

### OPT-767 → Project complete

**Status:** Merged 2026-09-06 · **Squash commit:** `6754d0d0` · **PR:** [#630](https://github.com/corycunanan/optcg-sim/pull/630)

- **Primer:** Six handlers under `workers/game/src/engine/effect-resolver/actions/`—two in `choice.ts`, one in `don.ts`, one in `removal.ts`, and two in `draw-search.ts`—now use `promptEffectDescription(state, cardDb, sourceCardInstanceId) || "<literal fallback>"` instead of raw `effectText` fallbacks.
- **Read first:** `workers/game/src/engine/effect-resolver/actions/choice.ts`, `workers/game/src/engine/effect-resolver/actions/don.ts`, `workers/game/src/engine/effect-resolver/actions/removal.ts`, `workers/game/src/engine/effect-resolver/actions/draw-search.ts`, `workers/game/src/__tests__/extract-effect-description.test.ts`.
- **Gotchas / do NOT touch:** Preserve the literal fallback after `||`. It now appears for a present card with empty `effectText`, although that state is unreachable with authored cards.
- **Unresolved:** Four of the six migrated sites have no red-going test.
- **Why this matters:** Start-of-game rule modifications, nested choice continuations, optional phase-boundary effects, and the remaining raw prompt sites now share the clause-scoped description contract.

---

## Deferred Follow-ups

- **OPT-769 — Low:** Support multiple `START_OF_GAME_EFFECT` rules when an earlier rule prompts. A leader with two such rules would currently skip rules after the first prompting one; no authored card has two.
- **OPT-770 — Medium · Ready for agent:** Preserve the clause description through non-optional cost frames, invalid-target re-prompts in `resume/target.ts`, and invalid simultaneous-selection re-prompts in `resume-core.ts`.
- **OPT-771 — Low · Ready for agent:** Add red-going coverage for the nine nested-prompt description pass-throughs that review could not prove by mutation.
- **Doc-drift gate — NIT · no ticket:** Strengthen `workers/game/src/engine/schemas/check-doc-drift.sh`; it remains green if the new start-of-game `prompt_text` documentation row is deleted.
