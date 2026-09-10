# OPT-812 — OP15 / OP16 fidelity recovery

## Status and recovery

Stop at merge-ready; no merge authorization. Implementation recovered in `/private/tmp/optcg-opt812`, branch `corymcunanan/opt-812-schema-sweep-h-op15op16-op15-029-wrong-prohibition-op15`. Preserved all interrupted edits and the original four schema tests in commit `91fc93a`, then merged main `caf29b1058dddf3dd26357c708ae42f9743e3426`. Original shape tests remain as supplemental coverage. Production registry regenerated using `pnpm --filter optcg-game schema:generate`.

Implementation and focused verification complete. Full `pnpm verify`, independent review, latest-main integration, GitHub checks and readiness receipt are pending at this handoff snapshot. Final results and exact tested commit will be recorded in the PR body/coordinator receipt. This document does not claim readiness.

## Sources and interpretation

Canonical supported rules: `docs/rules/rule_comprehensive.md` v1.2.0, located through `RULE-INDEX.md`: §1-3-3 (prohibitions take precedence), §3-10-2 (Life order), §4-10-1 (conditional continuation), §8-1-3-3/§8-1-4-2 (permanent effects and duration), §8-3-1 through §8-3-1-4 (costs before colon, complete payment, optional decline). Engine references: `docs/game-engine/README.md`, `RULES-TO-ENGINE-MAP.md`, target/prohibition/cost contracts, and the zone transition identity contract.

Card text: `docs/cards/OP-15.md` and `OP-16.md`. Official FAQ extracts: `docs/FAQs/faq_op15-eb04.md` OP15-099 and OP15-114; `docs/FAQs/qa_op16.md` OP16-081. Urouge's FAQ extraction joins an adjacent answer, but its first question/answer and Wyper's separate clear answer both prohibit paying when the top Life card already has the destination face. The printed TOP requirement is independently explicit. Otama's FAQ explicitly allows an opponent-only cost-8 Character; EITHER is preserved.

| Clause | Condition / evaluation | Cost / chooser | Observable behavior / regression |
| --- | --- | --- | --- |
| OP15-024 opposing Leader/Character rest protection | Opponent's turn; causing card type and controller at rest | No cost; opposing effect targets Usopp | Authored Izo and Carrot cannot rest; Event Paradise Totsuka can. Supplemental Stage/own Character sources can. Usopp can block, attack on its own turn, and pay authored OP14-036's own rest counter cost. Law self-trash retains Character provenance across serialized optional prompt. |
| OP15-029 cannot be rested | Opposing Character cost <=5 when selected; until opponent's next End Phase | On Play; source controller chooses up to1 | Cost5 protected from Straw Sword and attack rest; cost6 can rest. Protection survives controller End Phase and expires after opponent End Phase through actual phase pipeline. |
| OP15-073 exact cost1 in either branch | Hand target name Heavenly Warriors OR Vassals trait, cost exactly1 | On Play; source chooses up to1 | Cost0/2 not offered; both cost1 alternatives executed; zero selection preserves hand. |
| OP15-092 trash20 leader7000 during opponent turn | Continuous trash threshold AND opponent turn | No cost | Trash19/20 boundary and both turns; base7000 only opponent turn. Also prove same card trash9/10 base9000 boundary, retaining printed9000 effect. |
| OP15-099 top Life face-down cost | Payability and actual payment require top UP; lower eligible Life cannot substitute | Owner optionally flips top, then chooses DON recipient | Life identities/order/count preserved, no trash; rested DON attached. Wrong-face/empty cannot activate; decline and changed-face continuation cause no effect. |
| OP15-114 top Life face-up cost | Actual payment requires top DOWN, including resumed payment | Owner optionally flips top | Life retained; all opposing Characters -2000 then cost-independent KO at zero. 2000-power target KOs,3000 survives1000. Wrong-face/empty/decline/changed-face prevent effect. |
| OP16-001 separate Luffy alternative | Luffy any power OR Whitebeard Pirates >=8000 | Leader Activate Main chooses up to1 | 4000 Luffy and8000 Whitebeard gain executable Rush;7999 Whitebeard and unrelated8000 cannot attack on play turn. |
| OP16-081 FAQ nonregression | Cost8+ Character on either field, after cost | Otama rests first | Own-only and opponent-only8 qualify; neither (opponent7) does not debuff, but Otama still pays rest. |

All affected cards execute their unmodified authored schemas through the production registry and action pipeline; prompt choices use the session prompt lifecycle. Small fixture card metadata selects boundary powers/costs without changing effects. Synthetic Stage/own Character sources supplement authored source coverage because registry inventory contains no Stage SET_REST source.

## Necessary support beyond the initial schema-only assumption

Coordinator authorized these tightly bounded prerequisites after behavioral reproductions:

1. Existing flip costs searched the entire Life area. Existing `Cost.position` now constrains both payability and payment to TOP when explicitly authored; unspecified costs retain existing behavior. OP15-099/114 author TOP and remove the mistaken trash/flip action chain.
2. Generic rest checks ignored causing controller/type. SET_REST, rest costs, and replacement feasibility now pass provenance; only rest checks use it. Attack/Blocker rest costs disregard effect-only protections while unconditional rest prohibitions still block them. The shared blocker predicate is consumed by both worker prohibitions and app `player-field.tsx`.
3. A departing effect source needs last-known identity for the new source filter. A typed source snapshot travels in effect result references from before payment through optional/cost/action continuations. Rest filtering uses the live source when present and snapshot only when absent and its instance ID matches the executing source. Each resolver invocation captures its own source before payment and seeds a fresh reserved EFFECT_SOURCE_SNAPSHOT_REF; optional/cost/action continuations carry that same reference. Reused effects executing for the original source retain that identity; a fresh nested resolver invocation gets its own snapshot. The ID guard prevents a foreign inherited reference from standing in for a different source. Authored Law self-trash plus JSON persistence proves this path; no identity-string/card-ID inference.
4. OP15-092's permanent setters were `SET_BASE_POWER/amount`, which the permanent modifier layer does not evaluate. Both affected same-card setters now use canonical `SET_POWER/value`; no shared modifier implementation changed.

`resolver.ts` overlaps external OPT-820 PR #651, which was not on main at implementation. If it lands, integrate main and revalidate continuations before readiness. Sibling OP13/14 and OP05/06 schemas remain untouched.

## Validation evidence

Evidence rung4 for checks executed below. Reviewer must independently reproduce decisive scenarios; this handoff is not an independent review.

- Shared baseline main `caf29b1`: coordinator supplied OPT-811's complete `pnpm verify` log `/private/tmp/opt811-baseline-verify.log`: all gates except sandbox font build succeeded; elevated `pnpm build` then succeeded (`/private/tmp/opt811-baseline-build.log`). This is explicitly shared baseline evidence, not an OPT-812 rerun.
- Initial corrected-harness regression run:24 scenarios,9 failed/15 passed against original production registry, `/private/tmp/opt812-red.log`.
- Final focused restored tree: `pnpm --filter optcg-game exec vitest run src/__tests__/opt-812-authored-pipeline.test.ts src/__tests__/opt-812-schema-sweep-h.test.ts src/__tests__/opt-250-cannot-be-rested-gates.test.ts src/__tests__/cannot-activate-blocker.test.ts --maxWorkers=1`:60 passed, including41 new pipeline scenarios,4 preserved shape tests and15 existing rest/blocker safety tests. Log `/private/tmp/opt812-final-focused.log`.
- `pnpm exec vitest run shared/blocker-prohibition.test.ts src/components/game/board-layout/player-field.test.tsx --maxWorkers=1`:18 passed; `/private/tmp/opt812-blocker-ui.log`.
- `pnpm schema:check`: registry/text parity,2472-card lint, documentation drift,3819 authored action uses and34 tests passed; `/private/tmp/opt812-schema-check.log`.
- Worker type check and focused ESLint passed; `/private/tmp/opt812-types.log`, `/private/tmp/opt812-lint.log`.
- Nine isolated mutation experiments all failed as expected, restored byte-for-byte before final focused checks. [Exact results](opt-812/mutations.json): original production registry17 failures; TOP payment3; TOP payability1; source filter2; source snapshot1; own rest cost context1; shared blocker scope1; Luffy opponent duration2; Otama EITHER→SELF1. Mutation harness and detailed logs remain `/private/tmp/opt812-mutations.py` and `/private/tmp/opt812-mutation-*.log`. Reproduce by applying the named single guard removal, running the new pipeline suite, and restoring the source. Original-registry mutation uses `git show caf29b1:workers/game/src/engine/authored-schemas.generated.ts`; duration/controller mutations target only those card blocks.
- Full final verification: queued under coordinator's serialized verification resource. Not yet reported passed.

No browser visual change; shared board eligibility behavior is covered by actual worker Blocker action and existing player-field tests. Database-backed integration suites require the project's disposable PostgreSQL environment; report actual full-gate skip behavior in PR validation.

## Consumer inventory and follow-ups

Run `node --import tsx workers/game/scripts/opt812-source-inventory.ts` to recursively walk the complete generated authored registry, including nested arrays/options/costs. [Captured inventory](opt-812/consumer-inventory.json):20 flip-cost sites (2 newly explicit TOP),12 rest-prohibition sites and7 Leader rest-action sites, no Stage rest-action sites. Unconditional rest behavior is pinned by existing OPT-250 gates; rest source scope is exercised by authored/supplemental sources above.

Follow-up required outside OPT-812:18 legacy flip-cost sites still omit position and retain scanning behavior. At least EB01-040 Kyros and OP08-063 Katakuri explicitly print TOP in their source comments/card text, so incorrect lower-card substitution remains there. Audit the full captured list against printed text/FAQ and add per-card TOP encodings/regressions in a separately scoped ticket. Do not claim all20 consumers fixed. Coordinator owns Linear follow-up creation and required origin comments.
