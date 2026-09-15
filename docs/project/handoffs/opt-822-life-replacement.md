# OPT-822 — effect and activation-cost Life replacement

Implementation: `741c276d` on
`corymcunanan/opt-822-apply-st13-003-life-replacement-to-effects-and-replaced`.
Delivery target is an open, merge-ready PR. The user explicitly withheld merging
for this issue. No Linear writes or merges were performed by the implementer.
Final validation/PR readiness evidence belongs in the PR body and coordinator receipt.

ST13-003's OPT-791 destination policy now also governs `LIFE_TO_HAND` actions and
activation costs. Face-up Life moves to deck bottom with a fresh identity. Effects
complete the replacement processing; replaced activation costs keep the move and
prior payments, consume once-per-turn usage, and stop the post-colon action chain.
Face-down payments still resolve normally. Non-damage Life moves offer no Trigger.

Read `effect-resolver/life-movement.ts`, `cost/replaced.ts`, `cost/payment.ts`, and
`resume/cost.ts` under `workers/game/src/engine/` first. The new `replaced` cost
result is a committed outcome, separate from ordinary `cannotPay` rollback.
Every executing result consumer handles it, including optional acceptance, cost
branch selection, fixed-cost replay, and payment of a remaining suffix. The
terminal helper scans unscanned movement events, preserves simultaneous-trigger
ordering context, and drains queued effects without running the failed payoff.
TOP_OR_BOTTOM payment delegates to the fixed executor; TRASH_FROM_LIFE retains
its existing destination and accounting. Damage processing itself is unchanged.

## Rules and verification

Sources: canonical `docs/cards/ST-13.md` and `OP-06.md`; supported comprehensive
rules v1.2.0 §§8-3-1-1/3/4/7 and 10-2-13-5; [official ST13 FAQ](https://en.onepiece-cardgame.com/pdf/qa_st-13.pdf?20240405=)
verified 2026-09-13, page 1 ST13-003 Reject/Makino/Trigger entries and page 2
Makino face-preservation answer. No rule-version migration is included.

| Clause | Condition, cost and chooser | Continuation/result | Pipeline evidence |
| --- | --- | --- | --- |
| Reject FAQ | Luffy controller adds own top Life after opponent damage | Damage retained; UP redirects, DOWN enters hand | Real OP06-116 play/choice, both faces, removal event owners ordered opponent then self |
| Makino FAQ / §8-3-1-7 | Owner accepts Life activation cost and chooses top/bottom | UP replacement stands, no reorder; DOWN payment starts reorder | Real ST13-012 play/optional/position/arrangement, four face/position combinations |
| §10-2-13-5 | Activated once-per-turn cost is replaced | Usage consumed, repeat packet cannot activate it or move another card | Fixed top/bottom, optional and direct activation; real OP04-102 Kin'emon |
| Ordered costs | Kin'emon rests DON before selecting Life | Earlier payment and replacement remain, payoff skipped | Authored Kin'emon stays rested; synthetic hand selection followed by fixed Life cost |
| Branch continuations | Player chooses a Life cost | Both CHOICE and CHOOSE_ONE_COST preserve committed failure | Production branch prompts and resumed execution |
| Life exit event contract | Cost replacement removes Life | One old/new-ID removal, no hand-added event, watcher resolves once | Makino with watcher that draws then pauses to select a hand trash; storage-cloned prompts resumed to completion |
| Owner/negative boundaries | Opponent target, mixed faces; normal Leader; empty Life; decline | Actual owner policy; normal payment; no impossible/declined movement | Mixed two-card top/bottom effects, normal-Leader Makino, empty/declined Makino |
| Damage unchanged | OPT-791 damage and existing cost contracts | Battle/effect/Banish behavior preserved | Focused OPT-463/614/791/846 suites alongside new regression |

Tests use registered Reject, Makino, Luffy and Kin'emon schemas. Synthetic blocks
cover shared cost continuations, multi-card movement and watcher mechanics; they
do not replace the real-card regressions. Prompt responses go through
`resumePromptLifecycle` after `structuredClone`, matching durable storage semantics.

Baseline at original prerequisite `38032a5`: coordinator ran OPT-463/614/791,
16 passed. Initial real-card regression: 3 failed (Reject UP and both Makino UP
positions), 3 DOWN controls passed. After recovery on main `d2626419`, final
focused checks passed 5 files / 65 tests; worker type-check passed. Ticket suite
has 20 scenarios. Disabling the committed replacement result caused 11 failures /
9 passes; disabling usage marking caused 8 failures / 12 passes. Both mutations
were restored and the 65-test focused group passed again. The cost-module architecture inventory now includes the committed replacement
terminal helper; its acyclic-module check remains unchanged. Full required gate
results are recorded in the PR body; these focused results alone are not readiness.

## Authored impact and boundaries

Recursive inventory used `getAllAuthoredSchemas()` and
`collectAuthoredActionCounts({ [id]: schema })` (which walks `getNestedActions`),
plus a recursive object walk for LIFE_TO_HAND nodes in cost paths. On `d2626419`:
36 action-consuming cards, 50 cost-consuming cards. All current Life costs are
amount 1 and final in their block; 16 use fixed TOP/default, 34 TOP_OR_BOTTOM.
Five have preceding costs: OP04-102, OP15-100, PRB02-016, ST07-009, ST07-017.
No authored nested Life-choice costs or fixed BOTTOM-only costs were found.
Tests cover both branch forms and fixed BOTTOM as shared-engine boundaries.

Action consumers: EB02-061 EB03-053 EB04-001 EB04-054 OP02-001 OP02-009 OP06-024
OP06-028 OP06-029 OP06-030 OP06-034 OP06-035 OP06-116 OP08-098 OP08-116 OP09-104
OP10-034 OP10-102 OP11-072 OP12-061 OP12-081 OP13-108 OP14-021 OP14-041 OP14-112
OP15-033 OP15-098 OP15-105 OP15-115 OP16-107 OP16-116 OP17-112 P-009 P-062
ST15-004 ST22-015.

Cost consumers: EB01-056 EB02-057 EB04-060 OP01-008 OP01-013 OP03-102 OP03-110
OP04-102 OP04-115 OP04-117 OP05-060 OP06-017 OP06-096 OP06-106 OP07-110 OP07-112
OP08-008 OP08-103 OP08-117 OP09-028 OP09-075 OP09-103 OP10-103 OP10-107 OP11-069
OP11-106 OP11-110 OP12-100 OP14-103 OP15-100 OP15-109 OP17-101 P-036 P-073 P-105
PRB02-016 ST07-001 ST07-004 ST07-005 ST07-009 ST07-017 ST08-014 ST09-007 ST09-008
ST09-012 ST13-012 ST13-017 ST13-018 ST20-004 ST29-007.

Follow-ups: none discovered that require expanding this slice. Ordinary unpaid
cost rollback and unrelated field-exit replacement handling keep their existing
contracts. OPT-789 owns PLAY_FROM_LIFE entry initialization; OPT-822 changes only
executeLifeToHand and a separate import in their shared actions/life.ts file.

## Integration with subsequent engine work

Latest main `aed6d6ab` adds removal provenance (OPT-794), named-play cost support
(OPT-845), activated DON handling (OPT-849), and nested Event completion
(OPT-850). Integration retains those contracts and both `named-play` and
`replaced` in the cost-module architecture inventory. Conflicts were import-only;
no existing rest/removal provenance or Event-parent routing was removed.

Two additional production-pipeline regressions exercise a nested Event whose
Life cost is replaced, using selected and automatic Event entry. Storage-cloned
cost prompts complete without the child's post-colon draw, publish exactly one
Event activation after Life removal, then execute the parent suffix and queued
siblings in their retained ordering group. These are explicit synthetic contract
probes; the real Reject/Makino FAQ coverage remains unchanged. Ticket coverage is
now 22 cases; the immediate OPT-822/850/478 integration group passed 48 tests.
The complete integrated gate and final head are recorded in the PR body.
