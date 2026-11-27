# OPT-791 damage Life destination — implementation handoff

ST13-003's authored `DAMAGE_RULE_MOD` now redirects face-up Life to deck bottom
before damage can offer a Trigger. Battle damage, repeated/resumed effect damage,
and self-damage share the destination decision. Zone transitions allocate fresh
identities; redirected moves emit `CARD_REMOVED_FROM_LIFE` with old/new IDs and
never emit `CARD_ADDED_TO_HAND_FROM_LIFE`. Banish keeps its independent Trash move.
Face-down behavior, including existing self-damage's no-Trigger behavior, is preserved.

Read `workers/game/src/engine/life-destination.ts` first, then `effect-damage.ts`,
`battle.ts`, `effect-resolver/actions/battle-actions.ts`, and
`src/__tests__/opt-791-damage-rule-mod.test.ts` under the worker.

## Rules and evidence

Source: [official ST13 FAQ](https://en.onepiece-cardgame.com/pdf/qa_st-13.pdf?20240405=),
verified 2026-09-13 (ST13-003 entries, page 1); canonical `docs/cards/ST-13.md`.
Supported comprehensive rules v1.2.0: §7-1-4-1-1-2/3 (Life/Trigger and successive
damages), §10-1-5 (Trigger), §8-3-1-7 (replaced activation costs, successor only).
`docs/game-engine/ZONE-TRANSITION-CONTRACT.md` governs fresh identity and ordering.

| Clause | Evaluation / result | Pipeline evidence |
| --- | --- | --- |
| Face-up Life goes to deck bottom | Read defending Leader rule and current Life face before each damage Trigger offer | Battle, DEAL_DAMAGE and SELF_TAKE_DAMAGE; old/new removal IDs and deck order |
| Face-up Life cannot activate Trigger | Redirect first, without Trigger or hand-added event | Trigger-bearing Life in each damage route |
| Face-down Life unaffected | Existing hand/Trigger processing | Normal Leader negative case; face-down Luffy; self-damage |
| Process repeated damage separately | Reevaluate each next Life after continuation | Two face-up effect damages; mixed-face effect continuation; accepted/declined Double Attack Trigger |
| Replacement only changes a proposed hand destination | Banish still trashes Life | Face-up Banish regression |

Recursive authored inventory used `collectAuthoredActionCounts` over
`getAllAuthoredSchemas`: DEAL_DAMAGE occurs in EB03-055 and OP06-116;
SELF_TAKE_DAMAGE in OP14-115; ST13-003 is the sole DAMAGE_RULE_MOD author.
Tests exercise the registered ST13-003 schema plus synthetic damage sources to
isolate repeated damage and continuation, through `runPipeline`.

Baseline at a31499ba6f8d0787443501ff9c022e962e0bf01f: full worker suite passed
240 files / 2750 tests, 5 skipped. Initial regressions: 4 failed / 2 passed.
Completed ten-scenario suite passed. Temporarily changing the policy's destination
to HAND caused 6 failures / 4 passes; restoring it returned 10 passes. Final
repository validation and PR pointer are recorded in the PR body.

## Successor

OPT-822 becomes runnable after OPT-791 merges. Reuse `lifeToHandDestination`
for effect-driven LIFE_TO_HAND and corresponding activation costs. This query
returns HAND, DECK_BOTTOM, or TRASH and does not move cards or decide whether a
cost was paid. For a replaced cost, preserve the replacement movement but do not
resolve the post-colon effect; verify once-per-turn consumption separately.
Reject/Makino and their prompt lifecycle remain OPT-822's explicit scope.
This damage-only implementation is not full ST13 fidelity. No Linear writes or
merges were performed by the implementer. Delivery status: implementation for review.
