# OPT-795 — Hand-trash effect watchers

Implementation includes OPT-794 PR #670, now landed on main as `e0fc652dafa68791c6fc01268287d72ccdd6e107` (tree identical to reviewed parent `f1bc0c1abe6e0ebb1fddce9885a9709d2686dcb2`). PR #674 now targets main. Full `pnpm verify` passed at `6c13a4d65c3a92f7c1263ac4419f30f89c5e5fab`; reconciliation with the squash merge preserves that tested source tree, with only this handoff updated. Implementation and parent integration are complete. Final tested head, verification outcomes, independent review, and coordinator readiness are recorded in [PR #674](https://github.com/corycunanan/optcg-sim/pull/674). Implementer never merges or updates Linear.

## Behavior and entry points

`CARD_TRASHED_FROM_HAND` observes actual positive-count hand discards caused by an effect or its activation cost. `movementCause` retains `EFFECT` versus `COST`; causal card/controller snapshots distinguish the effect source from the discard chooser and discarded card. The three OP14 inverse Life-event placeholders and the pool-audit match OP12-040 Kuzan are corrected. Kuzan filters its own Navy effect source, draws the actual event count after the causing effect resolves, and remains repeatable.

Read `workers/game/src/engine/hand-trash.ts`, `triggers.ts`, `effect-source.ts`, `effect-resolver/action-utils.ts`, and `__tests__/opt-795-hand-trash-pipeline.test.ts` first. Event fields also appear in `shared/game-types.ts` and strict persisted-event validation. The shared source lookup only accepts a snapshot whose instance matches the executing source, preventing replacement effects from inheriting the replaced effect's provenance. Cost continuations preserve that snapshot after the source leaves. Trigger-count refs are separate from the watcher's own cost refs and survive ordering/reconnect.

## Rules packet and explicit interpretation

- Supported local rules remain v1.2.0; current official v1.2.1 was identified during the coordinating research. This ticket does not migrate rules versions. Relevant local clauses: §8-1-3-4-7 replacement ownership, §8-2-3/4 negation and gained effects, §8-3-1 activation costs, §8-6-3 post-effect trigger timing.
- Canonical text: `docs/cards/OP-12.md` (OP12-040, OP12-046, OP12-053, OP12-056) and `docs/cards/OP-14.md` (OP14-045/049/056).
- [Official OP12 FAQ](https://en.onepiece-cardgame.com/pdf/qa_op12.pdf?20260206=), pp.5–7; local transcription `docs/FAQs/qa_op12.md`: Borsalino replacement discards trigger Kuzan, and Garp activation-cost discards draw only after Garp finishes. The Garp FAQ misnumbers Leader Kuzan as OP12-043; the matching Leader is OP12-040. This discrepancy is recorded, not silently corrected in the source.
- [Official OP14 FAQ](https://en.onepiece-cardgame.com/pdf/qa_op14_eb04.pdf?20260626=), pp.4–5; local transcription `docs/FAQs/qa_op14_eb04.md`: opponent Brook Trigger discards grant Kuroobi/Jinbe Rush; Wadatsumi's printed-effect negation preserves externally gained effects.
- **Flagged OP14 assumption:** applying the activation-cost interpretation to OP14-045/049/056 is an inference supported by the Kuzan/Garp analogue and the user's explicit instruction to include effect-cost discards if the rules search did not settle it. There is no claim of a direct OP14 activation-cost FAQ ruling. Both the implementation and regression comments retain this flag.

| Clause | Evaluation and timing | Observable evidence |
| --- | --- | --- |
| Kuroobi/Jinbe hand trash by effect | Own hand, either turn, self or opponent causal effect; positive movement count | Authored effect, activation-cost, opponent-turn, and Brook Trigger pipeline tests |
| Kuzan Navy effect source | Controller and Navy traits of causing card; actual discarded count; no once-per-turn limit | Garp cost ordering, Borsalino replacement, repeated Zephyr, non-Navy source/Navy discarded card negative, opponent Navy Brook negative |
| Wadatsumi self-negation | Printed restriction negated this turn; external grants survive | Authored OP04-001 grants Rush before authored Zephyr hand discard; Rush remains |
| Invalid events | Rule trash, symbol Counter, routine Event disposal, zero count, Life-to-hand, unknown provenance do not qualify | Pipeline negatives and event matcher boundary cases |
| Continuations | Discard choice, trigger ordering, source departure, JSON reconnect preserve source/count | Pipeline prompt/resume regressions; persisted payload validation |

## Validation evidence

- Before edits at parent `82041f74`, initial three authored regressions failed: Kuroobi/Jinbe did not gain Rush, and Kuzan did not draw after Zephyr discarded two cards.
- Initial baseline command accidentally expanded to the entire worker suite through Vitest's `--` separator: 241 files, 2,806 passing tests, one known parent failure in `opt-178-choice-cost` for the duplicate field-cost event, five skipped. Parent correction was integrated before final checks.
- Resumed combined focused run: 80 tests across OPT-794, OPT-795, existing hand-trash tests passed. Subsequent focused OPT-795 suite: 30 tests pass, including ordering/reconnect, generic hand trash, and source departure.
- Independent review found the final automatically resolved simultaneous trigger omitted its triggering event. Red regressions reproduced Kuzan-last and sequential hand-cost underdraws; forwarding the event and identity fixes both. All five queued-trigger resolution call sites now pass the event. The 100-test correction suite and worker type-check pass.
- Lint and worker type-check passed before final integration. The baseline `pnpm verify` passed lint, app/worker type-check, and bundle checks, then identified the missing schema README event entry. That documentation was fixed and `pnpm schema:check` passed (34 gate tests); The integrated gate subsequently identified missing facet registration (fixed, 14 facet tests pass) and three legacy event-payload expectations: HAND_WHEEL retains its prior reason and the two aggregate cost assertions now include provenance. Final integrated gate results are recorded in the PR validation receipt.
- Mutation checks restored their files afterward: excluding COST caused four activation-cost regressions to fail; attributing the effect to the discard chooser caused three Brook regressions to fail; removing the Navy-source guard caused the Navy-discard/non-Navy-source regression to fail. Logs: `/private/tmp/opt795-mutation-{cost-guard,source-owner,navy-source}.log`.
- Complete recursive production schema inventory (including granted effects): 162 schemas contain `TRASH_FROM_HAND` actions, 219 contain that activation cost, 375 unique schemas contain either; 12 have generic `TRASH_CARD` hand targets and one contains `HAND_WHEEL`. Artifact: `/private/tmp/opt795-complete-consumer-inventory.log`. The initial action-root `getNestedActions` inventory (161/11) missed granted effects on EB02-030 and OP08-043. The documented phrase scan finds exactly four cards and schema lint rejects inverse Life triggers, including compound triggers.

## Follow-ups

- Existing OP04-048 Sasaki schema uses unparameterized `HAND_WHEEL`; its handler defaults both counts to zero. Printed text instead returns all hand cards to deck, shuffles, and draws the returned count (`docs/cards/OP-04.md:341`). This unrelated schema defect is unchanged; tracked separately as [OPT-853](https://linear.app/optcg-sim/issue/OPT-853/correct-op04-048-sasaki-hand-to-deck-shuffle-and-redraw).
- A future direct OP14 activation-cost ruling should replace the flagged analogue-based interpretation if it differs.
- ST33 encoding remains outside this ticket's scope. Once OPT-794 and OPT-795 are merged and verified, dependent schema work may use this event capability; stack-ready alone does not fulfill that prerequisite.
