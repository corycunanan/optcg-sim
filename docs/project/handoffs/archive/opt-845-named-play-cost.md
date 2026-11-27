# OPT-845 — named hand Character activation payment

Implementation handoff, independent review and full verification pending at this commit. Branch: `corymcunanan/opt-845-play-a-named-hand-character-as-hotoris-activation-cost`; base: `a31499ba6f8d0787443501ff9c022e962e0bf01f`. The implementation commit containing this document is the review pointer; the PR and coordinator receipt record its full SHA and subsequent verification.

Hotori now pays its activation cost by selecting and playing one actual Kotori from hand, without paying its DON!! cost. The cost uses canonical zone movement, fresh identity, active entry and current `turnPlayed`. Only named Characters that are legal to play are offered. A full field reveals the selected hand card, then suspends for an existing Character to rule-trash; the selected hand identity survives persistence. Live and staged state eligibility are both checked before committing payment. Invalid, stale, duplicated and wrong-player responses cannot grant the Life effect.

After payment, Hotori resolves its optional Life target and destination before Kotori's On Play and other play observers. Costs publish one canonical `CARD_PLAYED` event; the existing committed-cost scan registers field-entry effects and queues triggers before the Life action, then drains those triggers after the parent effect. The synchronous fallback can pay a unique candidate with space; ambiguous/full-field cases require the interactive cost path and fail closed synchronously.

Read first: `cost/named-play.ts`, `resume/cost.ts`, `cost/feasibility.ts` under `workers/game/src/engine/effect-resolver/`, the OP05-111 schema, and `workers/game/src/__tests__/opt-845-named-play-cost.test.ts`. The new capacity substage is a string on the existing serializable cost frame, admitted by `session/persisted-game-state.ts`.

## Necessary support and successor scope

- OPT-845 absorbs Hotori's `TOP_OR_BOTTOM` schema row from OPT-807, since OPT-845 explicitly requires registered Hotori tests at both Life ends. OPT-807 retains its remaining schema corrections.
- The zero-target scenario exposed Kotori using the candidate's controller to interpret `OPPONENT_LIFE_COUNT`, offering illegal K.O. targets against opponent Life 1. `computeAllValidTargets` now passes the effect controller through its filter wrapper; `condition-queries.ts` uses an explicit filter controller when available. Callers omitting context keep their old candidate-controller fallback. Numeric/static filters are unchanged.
- A recursive registry walk finds one `PLAY_NAMED_CARD_FROM_HAND` consumer: `OP05-111.effects.0.costs.0`. The retained regression walks all nested objects, including choice branches. The accompanying JSON inventories all 19 authored `GAME_STATE` numeric filter uses (Life and DON!! families); target resolution now supplies context for these. The registered Katakuri hand target checks the non-Life, opponent-DON perspective without changing its schema.

## Rules and clause evidence

Sources: repository Comprehensive Rules v1.2.0 (2026-01-16), `docs/rules/rule_comprehensive.md`; `docs/cards/OP-05.md` Hotori/Kotori; `docs/cards/OP-08.md` OP08-062; `docs/game-engine/ZONE-TRANSITION-CONTRACT.md`; `docs/game-engine/README.md`, `RULES-TO-ENGINE-MAP.md`; `docs/FAQs/qa_op05.md`.

The current official [OP05 FAQ](https://asia-en.onepiece-cardgame.com/pdf/qa_op05.pdf) was downloaded and its four pages text-extracted on 2026-09-13. It contains no Hotori or Kotori entry. Download SHA256: `69807fb607c6ccb28ae84ed7be653f8c124da679a7484704916bbd12785a6306`; no special ruling overrides the printed text. The supported rules version remains unchanged.

| Clause | Condition and evaluation | Cost/payer | Target/chooser | Timing | Observable evidence |
| --- | --- | --- | --- | --- | --- |
| Hotori pre-colon play, §8-3-1/8-4-1-3 | named legal Character in own hand | controller plays one Kotori, no DON!! play cost | controller chooses exact hand instance | before Life targets | registered pipeline; multiple copies; free payment; fresh identity |
| Optional cost, §8-3-1-3/4 | absent, non-Character or prohibited cannot pay | decline leaves hand unchanged | optional activation response | no paid cost means no Life effect | absent/type/prohibition/decline; malformed, stale and duplicate responses |
| Full area, §3-7-6-1/1-1 | five Characters after Hotori enters | reveal intended Kotori, rule-trash one existing Character | controller can choose Hotori itself | capacity before Kotori enters | persistence; attached DON!! cleanup; fresh Trash ID; reason `rule`; no K.O.; no effect-only removal observer |
| Add up to one cost-3-or-less Character to Life | current opponent Character, optional zero | already paid | activating player chooses target and either end | before queued Kotori effect | both authored Life ends, face-up placement, zero targets and final zones |
| Kotori's On Play, §8-6-3 | Hotori still present when resolving; compare against opponent Life | none | up to one opponent Character | after Hotori finishes | Life increases from 1 to 2 then cost-2 target legal; zero Life addition leaves cost-2/3 ineligible; source-trash disables Kotori; seat-1 asymmetry |
| Play observers | Character entered via the effect's cost | none | normal event registry | queued once until parent resolves | named play observer draws exactly once with/without capacity and after persistence |
| Zone identity, §3-1-6 and transition contract | each move crosses zones | canonical transitions | exact identity | on movement | hand ID retired, clean field entry; rule-trash cleanup and DON!! return |

The play event uses the existing effect-play convention `source: BY_EFFECT`, `sourceZone: HAND`: Hotori's card text instructs the play, rather than the normal main-phase DON!! payment procedure. Its On Play timing follows §8-6-3. Runtime and intrinsic play prohibitions are both checked; there is no ordinary play-cost deduction.

## Validation evidence

- Before edits: cost payability/type baseline 66/66 passed, `/private/tmp/opt845-baseline.log`.
- Original registered Hotori pipeline regression failed before schema/engine repair, `/private/tmp/opt845-red.log`; no payment prompt appeared because the authored cost used `filter.name` while the handler expected `card_name`.
- Expanded zero-target regression failed before filter-context repair, `/private/tmp/opt845-zero.log`; paused frame proved it was Kotori's K.O. prompt, not repeated Hotori activation.
- After final cleanup, the focused suite passed 94/94 (28 new scenarios + 66 existing) and worker type checking passed; results are recorded in `/private/tmp/opt845-focused-final.log` and `/private/tmp/opt845-types-final.log`.
- Decisive temporary mutations: fake named movement, removal of live-state eligibility guard, and restoration of candidate-controller dynamic lookup. Logs: `/private/tmp/opt845-mutation-{movement,live-guard,filter-context}.log`. Each mutation is restored before final checks. The initial stale test shared live/staged references and did not kill the live guard; serializing/restoring before changing live state makes the regression meaningful.
- The first full `pnpm verify` stopped at a new test's missing `computeAllValidTargets` result-ref argument; fixed before the implementation commit. The immutable gate at `2c1a9c4fc470717b892e5f2cb2aac0546621a671` passed lint, both type checks, worker bundle, schema checks, app tests (2361 passed, 7 database tests skipped without TEST_DATABASE_URL), and pipeline tests (48 passed), then stopped during worker coverage with `ENOSPC`. Build was not reached. Log: `/private/tmp/opt845-verify-final.log`. Final full-gate success remains required and is not claimed here. This documentation-only follow-up changes no tested code.
- After normal integration of main `7491cf09a7eb3961a93a7d8b8453f3bec4c2b7b8`, serialized `VITEST_MAX_WORKERS=1 pnpm verify` at `dced77383d108db973962eeb9bca0b67220e7d79` reached worker coverage: 2799 tests passed, 5 skipped, and one architecture-inventory assertion failed because its expected module list omitted the new `named-play` file. This is a test-inventory failure, not a resource failure. The follow-up adds that module while retaining the dependency-cycle check. Log: `/private/tmp/opt845-verify-serialized.log`; final full-gate success remains pending.

## September 15 removal-observer integration

Main `e0fc652dafa68791c6fc01268287d72ccdd6e107` delivered OPT-794's Character-removal observer support, superseding the earlier generic removal-watcher follow-up. The normal merge exposed a producer mismatch: `trashCharacter` retained OPT-845's `reason: "rule"` but mapped every non-cost reason to `movementCause: "EFFECT"`. The shared matcher correctly rejects `movementCause: "RULE"`; it was receiving the wrong provenance. The bounded fix maps rule, cost and effect reasons to RULE, COST and EFFECT respectively, preserving OPT-794's legitimate effect/cost semantics.

At integration head `e78cfec5509a16ff2277322e567e00e1bafb2a1d`, the retained negative observer test failed, independently reproduced by review. A new registered OP16-041 Buggy test also failed before the fix: DON!! x1 Leader, four existing Characters including an Impel Down victim, Hotori hand-play then named Kotori payment, persisted capacity choice, rule-trash victim, zero Life targets. Buggy incorrectly joined Kotori's pending effects. The OP16-041 FAQ (`docs/FAQs/qa_op16.md:171`) explicitly says overflow cannot activate Buggy. With the corrected producer provenance, the prisoner remains in hand, no Buggy prompt appears, and the event reports RULE. Logs: `/private/tmp/opt845-794-red.log`, `/private/tmp/opt845-794-authored-red.log`, `/private/tmp/opt845-794-focused.log`, `/private/tmp/opt845-794-types.log`. The full gate and renewed independent delta review belong to the final commit receipt; no success is assumed here.

## Follow-ups

- Existing generic effect-play overflow (`resume/target.ts`) calls `trashCharacter` with its default `effect` reason. This ticket explicitly passes `rule` for the new cost path; auditing other existing rule-trash event provenance is separate work.
- `resolveGameStateValue`'s existing DON!! field-count implementation counts cost-area DON!!; attached-DON completeness is outside this controller-context fix. No claim of a general dynamic-value migration is made.

Next runnable ticket: OPT-807, after this branch is pushed if stacking is retained, otherwise after its verified merge. Regenerate the registry and snapshot on the actual base; preserve Hotori's row delivered here. Implementers do not merge or update Linear.
