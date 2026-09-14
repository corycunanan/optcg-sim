# OPT-807 — schema corrections with named-play prerequisite

**Recovered as a stacked draft; final gates remain pending.** Existing PR654 integrates OPT-845 parent `dced77383d108db973962eeb9bca0b67220e7d79` by normal merge. OPT-845 supplies OP05-111 Hotori’s real named-character activation cost and Life Top/Bottom choice. The child owns the independent schema rows and SEARCH_AND_PLAY remainder correction below. No ignored `life_controller` parameter is introduced.

Workspace `/private/tmp/optcg-opt807`; recovered child head `cbc36e3899c65689dc9653c5cf3b9ded4bcc41bf`, initial integration commit `ab4d066`; latest parent also brings main `7491cf09` (OPT-790 DON phase routing) without conflicts. The coordinator has run-scoped merge authorization for OPT-845/OPT-807 after all readiness gates, and stacking is authorized. Implementation agents do not merge PRs or write Linear. This child must target main and renew integration validation after its parent merges.

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
| OP05-111 | Actor pays optional On Play activation cost by playing a named Kotori before Life resolution | Delivered by parent OPT-845; combined-tree `opt-845-named-play-cost.test.ts` covers payment, legality, capacity, deferred On Play order, persistence, and Top/Bottom. Integrated rerun pending. |

The shared SEARCH_AND_PLAY fix only lets a nonempty, non-full-deck zero-match TOP_OR_BOTTOM pool reach the established arrange/resume path. Fixed destinations and full-deck searches retain their old branch; the empty-pool early return precedes the change. Recursive registry inventory (including nested actions) found23 SEARCH_AND_PLAY consumers, of which5 use TOP_OR_BOTTOM: OP08-052, OP08-054, ST12-010, ST12-013, ST12-017. Each looks at1 card. Inventory is `opt-807-search-consumers.json`; OP08-052 additionally executes the zero-match Top/Bottom regression as an unchanged authored consumer.

## Historical validation (before prerequisite integration)

- Shared untouched-main baseline `caf29b1`: coordinator-supplied OPT-811 `pnpm verify` passed every pre-build gate; sandbox build could not fetch fonts; elevated `pnpm build` passed. Logs `/private/tmp/opt811-baseline-verify.log` and `/private/tmp/opt811-baseline-build.log`. This is shared evidence, not an independently rerun baseline.
- Original-main mutation: temporarily restored the five edited source files and generated registry from HEAD, retaining ticket regressions; focused suite exited1 with21 failures /12 passes. Restored all edited bytes in `finally`. `/private/tmp/opt807-all-regressions-red.log`.
- Final focused: `pnpm --filter optcg-game exec vitest run src/__tests__/opt-807-authored-pipeline.test.ts src/__tests__/opt-821-field-life-position.test.ts --maxWorkers=1` passed49 tests (35 new +14 existing). `/private/tmp/opt807-focused.log`.
- Target-instruction snapshot initially failed solely because Brook adds one explicit trash target: generatedCount1978→1979, targetCount2535→2536; regenerated and inspected those two numeric deltas,19 tests pass.
- Historical full `pnpm verify` passed at `379970231e98fc6879afa54582146604702d19e0` and again at recovered integrated `cbc36e3899c65689dc9653c5cf3b9ded4bcc41bf`, as recorded in the pre-recovery PR body by the coordinator. Logs: `/private/tmp/opt807-final-verify.log`, `/private/tmp/opt807-integrated-verify.log`. These do not establish current-stack readiness.
- The pre-OPT-845 Hotori probe failed its paid-cost Character-zone assertion (`/private/tmp/opt807-hotori-blocked.log`; independently repeated in `/private/tmp/opt807-review-hotori.log`). This is historical red evidence only. The stale probe assumed automatic payment without the now-required named-card selection and is retired; the parent’s registered pipeline suite supersedes it. The original probe remains available in git history at `cbc36e3`.
- Prior independent review at `cbc36e3` found the implemented subset clean, with Hotori then blocked. It reran final35-case source mutation:23fail/12pass, isolated shared-handler mutation:4fail/31pass, and restored authored+OPT821+OPT775:68pass. These are historical observations, not claims of integrated-head verification.

## Prerequisite integration validation

- Production registry regenerated from merged source; card-text manifest refresh skipped because canonical card JSON is unavailable. No manifest change.
- Target coverage regenerated directly from merged registry: targetCount2540, generatedCount1980, fallbackCount560. Relative to parent: +1 target/generated entry for Brook. Snapshot execution remains pending the serialized test slot.
- Focused baseline/final rerun and final `pnpm verify` remain pending. Full gate is scheduled after parent merge/main integration to avoid duplicate expensive runs; independent review and GitHub checks are separate coordinator gates.

## Follow-ups and limitations

- OPT-845 is the stacked prerequisite. Its code is integrated; parent merge, renewed main integration, independent review and required checks still gate whole-ticket delivery.
- As required by ticket: ST09-010 Ace still approximates top-or-bottom Life trash because TRASH_FROM_LIFE has no TOP_OR_BOTTOM; OP06-099 Aisa still lacks complete LIFE_SCRY destination/owner semantics. Neither is changed here.
- No browser or live-session UI changes; evidence exercises engine pipeline and public prompt lifecycle. Independent review and GitHub checks remain coordinator gates. This stacked draft is not merge-ready.
