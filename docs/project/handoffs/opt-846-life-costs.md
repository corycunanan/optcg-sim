# OPT-846 — Life flip cost migration

Implemented against main `a31499ba6f8d0787443501ff9c022e962e0bf01f`, after OPT-812 / #656. Review first the authored pipeline regression, this disposition table, and the 17 source-schema lines. Production registry regenerated; no engine handler or wire-format changes.

## Sources and disposition

Canonical card text below and official FAQ repository snapshots imported 2026-09-09 (source PDFs and hashes: `docs/FAQs/pdfs/`, `docs/audit/2026-09-09-faq-source-manifest.json`). Official publisher: https://en.onepiece-cardgame.com/rules/. Audit conducted 2026-09-13. The supported comprehensive rules remain v1.2.0: §8-3-1, §8-3-1-3/4 require full optional cost payment before benefit; §3-10-2 preserves Life order. No supported-rules migration is made. FAQ supplies decisive face-state rulings for Kyros, Pudding, Katakuri, Shirahoshi, P-106 and ST20-001; Shanks explicitly permits any position.

| Card | Canonical text | Official FAQ audit | Disposition |
| --- | --- | --- | --- |
| EB01-040 | [EB-01.md](../../cards/EB-01.md) | [qa_eb01.md](../../FAQs/qa_eb01.md); card-specific ruling reviewed | TOP, amount 1: DOWN → UP. |
| EB02-060 | [EB-02.md](../../cards/EB-02.md) | [qa_eb02.md](../../FAQs/qa_eb02.md); no card-specific entry; printed position unambiguous | TOP, amount 1: DOWN → UP. |
| EB03-053 | [EB-03.md](../../cards/EB-03.md) | [qa_eb03.md](../../FAQs/qa_eb03.md); no card-specific entry; printed position unambiguous | TOP, amount 1: DOWN → UP. |
| EB03-056 | [EB-03.md](../../cards/EB-03.md) | [qa_eb03.md](../../FAQs/qa_eb03.md); no card-specific entry; printed position unambiguous | TOP, amount 1: DOWN → UP. |
| EB04-059 | [EB-04.md](../../cards/EB-04.md) | [faq_op15-eb04.md](../../FAQs/faq_op15-eb04.md); no card-specific entry; printed position unambiguous | TOP, amount 1: DOWN → UP. |
| OP08-058 | [OP-08.md](../../cards/OP-08.md) | [qa_op08.md](../../FAQs/qa_op08.md); card-specific ruling reviewed | TOP, amount 2: both of the first two must be DOWN; FAQ explicitly rejects either already UP. |
| OP08-063 | [OP-08.md](../../cards/OP-08.md) | [qa_op08.md](../../FAQs/qa_op08.md); card-specific ruling reviewed | TOP, amount 1: UP → DOWN. |
| OP10-099 | [OP-10.md](../../cards/OP-10.md) | [qa_op10.md](../../FAQs/qa_op10.md); card-specific ruling reviewed | TOP, amount 1: DOWN → UP. |
| OP11-022 | [OP-11.md](../../cards/OP-11.md) | [qa_op11.md](../../FAQs/qa_op11.md); card-specific ruling reviewed | TOP, amount 1: DOWN → UP. |
| OP11-100 | [OP-11.md](../../cards/OP-11.md) | [qa_op11.md](../../FAQs/qa_op11.md); no card-specific entry; printed position unambiguous | TOP, amount 1: UP → DOWN. |
| OP11-103 | [OP-11.md](../../cards/OP-11.md) | [qa_op11.md](../../FAQs/qa_op11.md); no card-specific entry; printed position unambiguous | TOP, amount 1: UP → DOWN. |
| OP11-104 | [OP-11.md](../../cards/OP-11.md) | [qa_op11.md](../../FAQs/qa_op11.md); no card-specific entry; printed position unambiguous | TOP, amount 1: UP → DOWN. |
| OP11-107 | [OP-11.md](../../cards/OP-11.md) | [qa_op11.md](../../FAQs/qa_op11.md); no card-specific entry; printed position unambiguous | TOP, amount 1: UP → DOWN. |
| OP11-108 | [OP-11.md](../../cards/OP-11.md) | [qa_op11.md](../../FAQs/qa_op11.md); no card-specific entry; printed position unambiguous | TOP, amount 1: UP → DOWN. |
| OP11-117 | [OP-11.md](../../cards/OP-11.md) | [qa_op11.md](../../FAQs/qa_op11.md); no card-specific entry; printed position unambiguous | TOP, amount 1: DOWN → UP. |
| P-106 | [UNKNOWN.md](../../cards/UNKNOWN.md) | [qa_promotion-cards.md](../../FAQs/qa_promotion-cards.md); card-specific ruling reviewed | TOP, amount 1: DOWN → UP. |
| ST13-009 | [ST-13.md](../../cards/ST-13.md) | [qa_st-13.md](../../FAQs/qa_st-13.md); card-specific ruling reviewed | Retain unpositioned: any face-up Life card, explicitly confirmed by FAQ. |
| ST20-001 | [ST-20.md](../../cards/ST-20.md) | [qa_st-15-20.md](../../FAQs/qa_st-15-20.md); card-specific ruling reviewed | TOP, amount 1: DOWN → UP. |

All 18 legacy sites accounted for: 17 constrained; Shanks unchanged. Existing two OPT-812 sites stay TOP. Recursive inventory walks every nested object and costs array: `node --import tsx workers/game/scripts/opt846-life-cost-inventory.ts`; committed output `opt-846/consumer-inventory.json` contains 20 costs: 19 TOP and one unpositioned. Existing `TOP` support takes exactly the first amount cards, so Pudding requires no new handler semantics. Generic scanning remains unchanged.

## Clause-to-evidence map

| Clause / timing | Payer / target | Continuation and observable result | Evidence |
| --- | --- | --- | --- |
| Top one must change its face at activation/payment | Controller's own top Life; no choice of a lower card | Wrong face or empty Life prevents benefit; legal payment changes face only | Authored Kyros Activate Main and Katakuri On Play matrix |
| Top two must both change their faces | Pudding controller's first two Life | Both mixed orientations, zero/one Life fail atomically; successful attack trigger adds one rested DON | Authored Pudding Declare Attack matrix |
| Optional cost may be declined | Controller | Skip leaves Life unchanged and grants no KO/DON | All three decline rows |
| Payment rechecks state after a saved prompt | Controller | JSON serialization before accept; changed required face cannot be bypassed by lower Life | All three persisted and stale rows |
| Any face-up Life, not necessarily top | Shanks controller | Lower sole face-up card flips while all identities/order/count remain stable | Authored Shanks; post-cost hand condition false to isolate generic cost |

The tests enter through `runPipeline`, complete session prompt lifecycle (including downstream DON quantity choices and KO selection), assert no pending effect work, and compare full Life objects for identity/order/count preservation. No UI or transport code changes; JSON-persisted engine/session continuation is covered, not a claim of live WebSocket verification.

## Validation

- Before edits: OPT-812 authored and OPT-258 suites: 61/61 passed.
- New authored regressions before schema edits: 7 failed / 18 passed; wrong-top, mixed top-two and resumed stale-face scenarios expose legacy scanning. After 17 schema edits and production regeneration: 25/25 passed; strengthened printed metadata / normal DON costs and compound Merry Go cases subsequently pass 29/29.
- `pnpm --filter optcg-game schema:check`: passed (2,472 schemas, source/production parity, 3,822 action uses, 34 gate tests).
- Final focused suite: 90/90 passed; worker type-check and focused ESLint passed. Final-fixture mutation restores the old production registry temporarily: 8 failures / 21 passes; fixed artifact restored, 90/90 pass.
- Full `pnpm verify`: scheduled at implementation commit; result recorded in PR body to avoid changing the tested head.

## Follow-ups

Shanks has a separate pre-existing downstream targeting defect: with opponent hand >=7, its authored TRASH_FROM_LIFE puts OPPONENT on `target`, while `actions/life.ts` reads `params.controller`; after legal payment it trashes its controller's top Life. This migration leaves Shanks and that handler unchanged. Tracked separately as [OPT-851](https://linear.app/optcg-sim/issue/OPT-851). A focused actual authored pipeline reproduction is retained as `opt-846/shanks-followup.test.ts.txt` (exploratory simplified cost-0 fixture, not a passing test or full printed-metadata verification). Generic-cost regression intentionally keeps the post-cost condition false and proves the scoped unchanged cost semantics without asserting the broken downstream effect works.

## Handoff

Implementation complete; independent review, full validation and coordinator readiness gates remain. No stacking, no implementation-agent merge or Linear mutation. OPT-846 has no successor prerequisite in this run. Preserve the generic Shanks disposition in future sweeps; do not replace every omitted position mechanically.
