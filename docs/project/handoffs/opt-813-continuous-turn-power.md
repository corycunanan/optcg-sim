# OPT-813 — continuous turn power

Base main15cad98bd139fc0d8cea075c809e4f8a7b45f507; exclusive clone `/private/tmp/optcg-opt813`, branch `codex/opt-813-card-fidelity`. Merge mode off. No shared runtime changes or sibling commits imported.

## Sources and behavior

Canonical sources: `docs/cards/EB-01.md` (EB01-058), `docs/cards/EB-02.md` (EB02-005), `docs/cards/OP-01.md` (Jinbe On Block), `docs/cards/ST-01.md` (Luffy gives rested DON!!). Official [EB01 card list](https://en.onepiece-cardgame.com/cardlist/?series=569201) and [EB02 card list](https://en.onepiece-cardgame.com/cardlist/?series=569202), checked2026-09-10, confirm both corrected cards cost2 and have printed3000power. No card-specific FAQ entries found in the local EB01/EB02 FAQ files. Supported rules v1.2.0 §6-5-5 governs given DON!! and owner-turn power; §8-1-4-2 governs continuous effects.

Fake Straw Hat Crew's two turn clauses are permanent self modifiers with mutually exclusive WHILE_CONDITION turn scopes. They apply immediately on field entry, including opponent-turn effect play, and change when the turn changes without accumulating start-of-turn bonuses. Actual registered-card tests play it from hand for either player through four turn changes, and play it during the opponent's turn through authored OP01-014 Jinbe On Block for either controller. Expected effective power is5000 on its controller's turn and1000 on the opponent's turn.

Cricket removes only the unprinted ACTIVE_DON_COUNT gate. Keep source-specific attached DON!!≥1, Life≤2 and own-turn scope. Actual registered-card tests pay its play cost, give one DON!! while leaving zero active cost-area DON!!, check Life0/1/2/3, check no-attached DON!! despite active resources, attack while rested, and give exactly one rested DON!! through authored ST01-001. Expected3000base,4000with attached DON but Life3,6000with attached DON and Life≤2, and3000during the opponent's turn. These are focused engine fixtures, not deck-construction tests.

## OPT-603 recovery assessment

GitHub PR470 verified MERGED2026-07-30T23:34:11Z at c8745bdef22ba7a1492d6555f0b093d378bd845c, an ancestor of current main. Actual diff added source-attached DON!! while preserving the existing active-DON clause. Its Cricket regression intentionally pinned that old clause. Coordinator approved correcting the Cricket test title and its active-DON0 expected value6000→8000 (that older helper uses printed5000power), retaining attached/Life scenarios and all Sanji/replacement checks.

Target-instruction snapshot changes only the two Fake modifiers from action-generated instructions to non-action fallbacks: fallback557→559, generated1978→1976; total targets and instruction strings unchanged. Coordinator approved this derivative.

## Validation checkpoint

Shared baseline caf29b1: `/private/tmp/opt811-baseline-verify.log` passed lint/types/bundle/schema, app2360+7existing skips, pipeline48, worker2458+5existing skips,83.27%statement coverage. Sandbox font build failure resolved by elevated baseline build (`opt811-baseline-build.log`). Shared evidence, not independently rerun here.

Own rung4 evidence: final11authored pipeline cases plus7OPT603behavior and2OPT603schema-lint cases pass20/20 (`/private/tmp/opt813-focused.log`). Schema34tests and worker types pass. Seven semantic mutations detect original Fake4fail, original Cricket5fail, removing attached gate4fail, Life gate1fail, own-turn Cricket gate3fail, and each Fake turn gate4fail. All11authored cases run per mutation; original registry restored. Script `/private/tmp/opt813-mutations.py`, results `/private/tmp/opt813-mutations.json` and adjacent logs. Initial red run included an incomplete Jinbe keyword fixture; final original-card mutations use its corrected printed Blocker metadata and prove the actual defects.

Full `pnpm verify`, independent review and required CI remain pending. Work checkpointed clean so the implementer can address an independent809review finding; no publication attempt made for813 yet. Final validation results belong in the PR body.

## Follow-ups

None newly required. EB01-051 remains excluded under OPT-798. Sanji's separate conditions remain outside this ticket and unchanged.

## Landed-main integration (2026-09-13)

Merged landed main `ff2217ceb3cb62850b393257ed684dfd829d65f7` normally into reviewed `e44f03efdfac601c58245847f97909e0b3f45dc4`, preserving delivered OPT805/806/808/809/810/811/812/814. Only generated registry and target snapshot conflicted. Regeneration proves the exact 2,472-card union: EB01-058/EB02-005 match the reviewed implementation; all 44 incoming changed cards match main. Eighty other incoming files are byte-identical to main. No production behavior was modified during integration.

Relative to current main, the generated target snapshot adds only the two EB02-005 permanent modifier fallbacks, moving fallbackCount 558→560 and generatedCount 1981→1979. Total targets, instruction text and all incoming derivative changes remain intact, including OPT809 Teach's explicit target. The original OPT603 Cricket expectation correction and all Sanji coverage are preserved.

Combined integration coverage passes 224 tests across 15 suites (`/private/tmp/opt813-main809-focused.log`): all 11 authored OPT813 cases and both OPT603 suites, OPT812 continuous/base-power and source/prohibition cases, OPT810 turn-power/cost cases, OPT805/809 Event and public-choice continuation, OPT806 eligibility and authored effects, OPT820 event propagation, and the target snapshot. Own/opponent entry, repeated turn transitions, Life/attached-DON boundaries, resting and real Jinbe/Luffy effect paths remain observable pipeline proof. No additional integration regression was needed; existing suites cover the unchanged interactions.

Prior original independent specification/correctness/domain review and seven reproduced guard mutations remain evidence for unchanged implementation. Required full verification runs at the committed integration head; the final SHA/result and independent integration review belong in the prepared PR body. Earlier pending-check and merge-mode statements are historical. The user has explicitly approved publication after checks and coordinator non-frontend merges after all readiness gates; the implementer does not merge or write Linear. OPT798's EB01-051 exclusion and the run's separate OPT845–850 follow-ups are not imported into this scope.
