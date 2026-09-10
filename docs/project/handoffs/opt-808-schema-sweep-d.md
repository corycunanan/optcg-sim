# OPT-808 — OP07 / OP08 authored-card recovery

## Scope and recovery

Recovered `/private/tmp/optcg-opt808` on branch
`corymcunanan/opt-808-schema-sweep-d-op07op08-op07-059-rested-leader-filter-op08`.
The sole interrupted artifact was an untracked five-test file (resolver/helper
and schema-shape assertions, no Chessmarimo). Its exact original is preserved at
`/private/tmp/opt808-recovered-original.test.ts`; this PR replaces it with actual
registered-schema pipeline scenarios. Integrated main
`15cad98bd139fc0d8cea075c809e4f8a7b45f507`, including OPT-821 and OPT-820.
No sibling branch was imported. No merge or Linear writes are authorized here.

## Sources and interpretation

Sources read: `docs/cards/OP-07.md` (OP07-059), `docs/cards/OP-08.md`
(OP08-006/020/045/069/118), `docs/FAQs/qa_op08.md` (Chessmarimo exact names,
Thatch replacement is not K.O., Rayleigh may select three different Characters),
`docs/rules/rule_comprehensive.md` v1.2.0, and
`docs/game-engine/ZONE-TRANSITION-CONTRACT.md`. FAQ source archive:
https://en.onepiece-cardgame.com/pdf/qa_op08.pdf . No broader rules-version
migration is included. Canonical printed text is included in the new fixtures;
expectations are independent of the authored schema implementation.

| Clause | Evaluation / payer / chooser | Observable proof |
| --- | --- | --- |
| Foxy selects rested opponent Leader and up to one Character | Attack, DON!! −3 paid, three Foxy Pirates post-cost; controller chooses Character | Active Leader excluded; rested Leader and selected Character actually remain rested in next Refresh; DON paid |
| Chessmarimo needs both named cards in own trash, during own turn | Continuous, no cost; exact names per FAQ | Both names buff, missing name / field only / lookalike / opponent trash / staging do not; buff persists rested, disappears on opponent turn, appears immediately after paying Chess from hand to trash |
| Drum Kingdom boosts own Drum Characters during opponent turn | Continuous, Stage state irrelevant | Played Stage subsequently rested still buffs on opponent turn; own turn and non-Drum Character negative |
| Thatch replaces any K.O. or opponent effect removal | Mandatory; one replacement for the actual event | Battle, own-effect K.O., opponent-effect K.O., opponent bounce each trash once and draw exactly one; no CARD_KO event; own bounce returns to hand without draw; no duplicate prompt |
| Linlin pays DON!! −1 + one hand card; own optional Life then opponent Character to owner Life | Sequential cost and choice continuation, chooser controller | Both Top/Bottom preserve old Life order, create new target identity face-up, clear field, pay once, add own Life once, exhaust stack; existing OPT-821 suite covers zero/protection/replay/owner boundaries |
| Rayleigh gives −3000 to one and −2000 to another; separate K.O. | Sequential up-to-one choices; exclude first result from second; controller chooses K.O. | Zero, one, two debuff selections; final 4000/5000 from 7000 targets; independent third 3000 Character K.O.; one-target opponent Thatch case skips unavailable second slot and completes K.O. |

Rules supporting these expectations: §1-3-2 (perform possible actions),
§4-10-2 (Then continues), §7-1-4-1-2 and §10-2-1-3 (K.O. vs trash),
§8-1-4-2 (continuous effects), §8-3-1 (activation costs).

Linlin's schema/runtime is already corrected by OPT-821 on main. Its row is
behaviorally covered here; no ignored `life_controller` parameter is added.
Rayleigh uses supported `result_ref`/`exclude_ref`; no target/resolver change.

## Shared support and consumer inventory

Coordinator approved narrow `TrashCountCondition.filter?: TargetFilter` and
matching in `condition-queries.ts`. Existing staging exclusion is retained.
No resolver, payment, replacement, or target infrastructure changed.

Recursively walked every object from `getAllAuthoredSchemas()` and selected
nodes whose `type === "TRASH_COUNT"` (including nested branches/conditions).
`/private/tmp/opt808-trash-inventory.log`: 36 uses in 30 cards; two new filtered
uses in Chessmarimo, 34 pre-existing unfiltered uses in 29 cards:
EB01-050, EB03-045, OP04-093/095, OP05-086/095, OP07-094/095/096,
OP08-095, OP10-085/097, OP11-097, OP13-080/083/084/089/091/099,
OP14-086/096, OP15-083/087/092/093/095/097, OP16-101, PRB02-014.
Legacy regression executes authored OP08-095 at eight/nine cards before play
(the Event itself enters trash before resolution). A supplementary query test
pins unfiltered count and staging exclusion. Production registry regenerated
through `pnpm --dir workers/game schema:generate`.

## Validation and evidence

Implementation evidence is rung 4 (executed engine boundary), pending independent
review. Engine effects start through `runPipeline` and every effect prompt is
completed through `resumePromptLifecycle`. No UI change; VQA not applicable.

- Baseline: corrected initial regression on main was red (8 failed / 7 passed),
  `/private/tmp/opt808-red-final.log`; earlier drafts with fixture issues are not
  claimed as behavioral evidence.
- Final focused: `pnpm --dir workers/game exec vitest run
  src/__tests__/opt-808-schema-sweep-d.test.ts
  src/__tests__/opt-821-field-life-position.test.ts --maxWorkers=1`:
  **37 passed** (23 new + 14 existing), `/private/tmp/opt808-final-focused.log`.
- Worker type-check passed before the final two legacy cases; complete final
  `pnpm verify` at committed head is required next. The PR body/coordinator
  receipt records its exact SHA, result, and log; this document does not claim
  the gate has already run.
- Decisive mutations, 21-case revision before the final two additive legacy
  scenarios: original main schemas restored and registry regenerated →
  **13 failed / 8 passed**; ignoring trash filter → **5 failed / 16 passed**;
  counting staging → **2 failed / 19 passed**. Script:
  `/private/tmp/opt808-mutations.py`; logs `/private/tmp/opt808-mutation-*.log`.
  Script restored all four files byte-for-byte in `finally`; final focused
  run then passed. The two later legacy cases only add coverage.

## Follow-ups / remaining delivery

No new engine blocker found. Out-of-scope OP07-026/038/079 and
OP08-046/056/074/096 remain with their existing linked engine tickets from the
original OPT-808 description. Do not fold those behaviors into this sweep.

Complete the final project gate and push reviewable PR, then independently
review the exact final head. Stop at merge-ready; do not merge. This handoff is
committed before final verification so the gate can run against its final SHA.
