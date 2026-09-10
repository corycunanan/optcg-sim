# OPT-807 — independent schema corrections; Hotori blocked

**Delivery is incomplete / draft.** OP05-111 Hotori depends on [OPT-845](https://linear.app/optcg-sim/issue/OPT-845/play-a-named-hand-character-as-hotoris-activation-cost-before). Its named-hand-character cost only verifies a name and never plays the card; current encoding also supplies `filter.name` where that cost expects `card_name`. No ignored Life parameter or unplayable schema edit is claimed as a fix. The remaining corrections are independently reviewable.

Recovered clean workspace `/private/tmp/optcg-opt807`, original base `50331c89f742b4a0a04a6e6d8465b97e7999317f`, fast-forwarded to `caf29b1058dddf3dd26357c708ae42f9743e3426` before edits. No previous PR or ticket edits existed. Merge permission is off.

## Sources and scenario interpretation

Canonical card text: `docs/cards/OP-05.md`, `OP-06.md`, `ST-09.md`, `ST-12.md`. Relevant official FAQ mirrors: `docs/FAQs/qa_op06.md` (Zephyr, Brook, Kawamatsu, Momonosuke), `qa_st-12.md` (Ivankov). Supported Comprehensive Rules v1.2.0: §3-1-6 fresh zone identity, §3-1-7 owner's ordering, §3-10-2-1 face-up Life, §7-1-3 Counter, §8-3-1-3-1 and §8-3-1-7 activation cost, §10-2-1 K.O. Engine references: `ZONE-TRANSITION-CONTRACT.md`, `04-ACTIONS.md`, `RULES-TO-ENGINE-MAP.md`. This change does not migrate the supported rules version.

| Card / clause | Evaluation, cost and chooser | Observable result / execution evidence |
| --- | --- | --- |
| OP05-030 opponent's turn | Replacement condition at attempted K.O.; Rosinante controller chooses | Own-turn Orlumbus K.O. proceeds; opponent-turn replacement preserves rested target and trashes Rosinante. |
| OP06-015 trash a 6000+ Character | Own activation cost, before choosing FILM trash card | Authored pipeline + cost-resume event: CARD_TRASHED; Taralan does not mill as On K.O.; 2000-power FILM enters rested; 5999 cannot pay; decline leaves zones unchanged. Baseline already suppressed Taralan's K.O. trigger, so the decisive red distinction is the missing trash event, not an invented baseline mill. |
| OP06-074 “that Character” <=5000 | Reference to the selected negated identity at later action | 6000 selected target survives despite weak bystander; exactly5000 is K.O.'d. |
| OP06-088 Dressrosa Leader active | Permanent condition uses leader type and active state | Played Sai gains2000 only with active Dressrosa Leader; rested and wrong-trait negatives. |
| OP06-092 opponent's trash | Opponent selects exactly3 or all available if fewer, then orders | 0/2/3/4-card trash fixtures; distinct card IDs assert reversed suffix ordering; hand unchanged. Uses supported RETURN_TO_DECK rather than adding an unsupported action name. FAQ expressly allows fewer than3. |
| OP05-096 Life option | Actor picks opponent cost<=1, then Top/Bottom | Both actual Life positions, face-up, old Life ordering preserved, skip; cost2 excluded. |
| OP06-103 | Already corrected by merged OPT-821 | No new schema edit. Existing `opt-821-field-life-position.test.ts` Kawamatsu authored attack/cost/target/position pipeline covers Top/Bottom, owner versus controller, persistence, skip, removal prohibition and stale identity. |
| OP06-107 | Actor picks own Wano Character excluding Momonosuke | Top/Bottom/skip; same-name candidate excluded; final Life order and field removal. |
| ST09-015 | Actual Counter window; first +4000, then own Life<=2 condition | Category corrected from activate to auto so Counter pipeline executes it. Declare attack→pass→use Counter→target→Top/Bottom; Life3 and skip negatives; +4000 remains. |
| ST12-010 / ST12-013 | Revealed cost2 Character only; actor arranges remainder | Match declined, no match, both Top/Bottom, selected card enters active/rested respectively; empty deck creates no prompt. |
| OP05-111 | Requires actual Kotori play as activation cost | Blocked by OPT-845, unchanged. Executable red probe preserved below. |

The shared SEARCH_AND_PLAY fix only lets a nonempty, non-full-deck zero-match TOP_OR_BOTTOM pool reach the established arrange/resume path. Fixed destinations and full-deck searches retain their old branch; the empty-pool early return precedes the change. Recursive registry inventory (including nested actions) found23 SEARCH_AND_PLAY consumers, of which5 use TOP_OR_BOTTOM: OP08-052, OP08-054, ST12-010, ST12-013, ST12-017. Each looks at1 card. Inventory is `opt-807-search-consumers.json`; OP08-052 additionally executes the zero-match Top/Bottom regression as an unchanged authored consumer.

## Validation

- Shared untouched-main baseline `caf29b1`: coordinator-supplied OPT-811 `pnpm verify` passed every pre-build gate; sandbox build could not fetch fonts; elevated `pnpm build` passed. Logs `/private/tmp/opt811-baseline-verify.log` and `/private/tmp/opt811-baseline-build.log`. This is shared evidence, not an independently rerun baseline.
- Original-main mutation: temporarily restored the five edited source files and generated registry from HEAD, retaining ticket regressions; focused suite exited1 with21 failures /12 passes. Restored all edited bytes in `finally`. `/private/tmp/opt807-all-regressions-red.log`.
- Final focused: `pnpm --filter optcg-game exec vitest run src/__tests__/opt-807-authored-pipeline.test.ts src/__tests__/opt-821-field-life-position.test.ts --maxWorkers=1` passed49 tests (35 new +14 existing). `/private/tmp/opt807-focused.log`.
- `pnpm --filter optcg-game schema:generate` regenerated production registry. Worker type check passed before the final test-only additions; final required `pnpm verify` is pending the coordinator's serialized resource slot.
- Executed Hotori probe fails its actual paid-cost Character-zone assertion. `/private/tmp/opt807-hotori-blocked.log`. To reproduce without adding a failing suite to normal CI:

```sh
cp docs/project/handoffs/probes/opt-807-hotori.test.ts.txt workers/game/src/__tests__/opt-807-hotori-probe.test.ts
pnpm --filter optcg-game exec vitest run src/__tests__/opt-807-hotori-probe.test.ts --maxWorkers=1
rm workers/game/src/__tests__/opt-807-hotori-probe.test.ts
```

This is an explicit unresolved regression artifact, not a skipped passing test. Expected failure is at “Kotori is on the Character field before the Life target prompt.”

## Follow-ups and limitations

- OPT-845 blocks OP05-111 and whole-ticket merge readiness. Requires named-card choice, prohibition/capacity/overflow handling, actual paid play, fresh identity/DON cleanup, deferred On Play ordering, continuation/persistence and no-payment negatives. Do not substitute an effect action for this cost.
- As required by ticket: ST09-010 Ace still approximates top-or-bottom Life trash because TRASH_FROM_LIFE has no TOP_OR_BOTTOM; OP06-099 Aisa still lacks complete LIFE_SCRY destination/owner semantics. Neither is changed here.
- No browser or live-session UI changes; evidence exercises engine pipeline and public prompt lifecycle. Independent review and GitHub checks remain coordinator gates. This draft is not merge-ready.
