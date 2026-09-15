# OPT-794 removal watchers

Implementation candidate, not merge-ready. Initial base main `a31499ba6f8d0787443501ff9c022e962e0bf01f`; integrated main `438fd7da1c29227b87d87b65961cf8236fbc054e`; branch `corymcunanan/opt-794-engine-character_removed_from_field-only-observes-ko-and`. PR [#670](https://github.com/corycunanan/optcg-sim/pull/670); prior verified code head `7e089d0177d23559da53e1108f270fed6feee385`; the latest integration commit is identified by the PR head. Coordinator records the documentation head/readiness receipt.

Read `engine/triggers.ts`, `effect-resolver/card-mutations.ts`, `effect-resolver/cost/resume.ts`, `actions/life.ts` under `workers/game/src`, and `opt-794-removal-pipeline.test.ts` first.

## Semantics and sources

Repo rules v1.2.0 §§3-1-6, 3-7-6-1-1, 8-4-5, 10-2-1-3, 10-2-9/11/12/13; canonical text `docs/cards/OP-{07,08,09,10,13,16}.md`; official FAQ `docs/FAQs/qa_op16.md` OP16-041 and `qa_op07.md` OP07-038. Coordinator reports current official rules v1.2.1; this change does not migrate the supported ruleset.

A watcher remaining on field sees a Character exit to hand/deck/Life; §8-4-5 still suppresses a moved source's own secret-zone auto effect. Explicit source-zone/controller provenance survives fresh identity. Card type excludes Stages; rule overflow is excluded. The Buggy FAQ specifically names Slave Arrow's activation-cost bounce as removal by one's own effect: EFFECT and activation COST satisfy by-effect filters, while the event preserves COST as distinct provenance. This is source-based interpretation, not an assumption copied from OPT-795. Effect controller is independent of removed-card controller/owner.

| Clause | Timing / cost / chooser | Observable evidence |
|---|---|---|
| Hancock | Your turn, any Character removed by your effect; optional; hand ≤5; once per turn | Authored Sables/Red Roc/Jet Pistol, decline then next accept, high hand/opponent turn negatives; all five field cost routes |
| Shakuyaku | Your turn, your removal effect; opponent hand ≥5; once per turn | Opponent chooses bottomdeck, then source rests; low hand and self hidden-zone departure negatives |
| Moby Dick | Your turn, own Whitebeard substring Character by either player's effect | Draw then explicit existing PLAYER_CHOICE top/bottom; both destinations; wrong trait/controller negatives |
| Thousand Sunny | Opponent turn, own Straw Hat by opponent effect; optional rest Stage cost | Red Roc, rest paid, rested DON quantity choice; turn/trait negatives |
| Usopp | Opponent turn, own Dressrosa by opponent effect OR any KO; optional; hand ≤5; once per turn | Red Roc/Jet Pistol and battle KO, single draw with overlapping any_of; trait/hand negatives |
| Oro Jackson | Own Roger substring by opponent effect, once per turn | Bounce/deck/KO/Life via authored removers; rested DON quantity; trait/own-effect negatives |
| Buggy | Own Impel Down removal; DON×1; optional once per turn | Own Sables, exact Slave Arrow cost FAQ through counter pipeline, persisted prompt; DON/trait/overflow negatives |

All rows use registered production watcher schemas with minimal synthetic CardData fixtures (including zero-cost Event setup), not canonical production card-data loading. They execute through runPipeline and complete real prompt lifecycle responses. Supplemental action sources isolate effect trash and five activation-cost movement primitives. The OPPONENT_ACTION movement inventory has 14 wrappers, of which 3 move field Characters: EB01-028, OP06-051, P-055; remaining domains are hand/trash/deck (hand-discard consumers belong to OPT-795). Shared matching tests cover non-field source, Stage, rule/battle causation, and controller distinct from destination owner. New Life event validates its strict persisted payload schema and player/spectator identity redaction; prompt continuation uses JSON roundtrip, not the full persisted-state parser. Cost KO snapshots effective preKO base power and DON before transition.

## Shared consumers

Recursive object walk of generated AUTHORED_SCHEMAS (including nested actions/any_of): CHARACTER_REMOVED_FROM_FIELD has exactly the seven watchers above. Remaining CHARACTER_RETURNED_TO_HAND consumer EB02-023 retains its old matcher behavior. RETURN_TO_HAND:124, RETURN_TO_DECK:66, ADD_TO_LIFE_FROM_FIELD:18, RETURN_OWN_CHARACTER_TO_HAND:23, KO_OWN_CHARACTER:5, TRASH_OWN_CHARACTER:8. Full inventory captured `/private/tmp/opt794-consumers.log`; rerun with `node --import tsx` and recursively inspect Object.values for these strings. Engine changes affect the common movement paths; provenance fields are additive and persistence optional for older state.

## Validation

- Baseline opt407 matcher suite: 7 passed before edits (`/private/tmp/opt794-baseline.log`). Corrected authored regression against baseline registry fails three Hancock draw assertions (`opt794-red-authored.log`); initial wrong-ID fixture attempts are not regression evidence.
- Exact Slave Arrow FAQ red before cost-bounce fix, then green. Independent review reproduced stale old-source registrations, moved Shakuyaku open-Trash suppression, and battle KO retaining EFFECT cause. Red/green regressions retained. Subsequent source-controller audit reproduced OPPONENT_ACTION chooser misattribution; authored Tsuru/Hancock and source-left-as-cost/Oro regressions retained. Same causal controller also feeds removal protections/replacements; authored Tsuru/Nusjuro negative passes.
- Final focused pipeline/helper suite: **48 passed** (`opt794-source-final.log`); matching suite: **25 cases**. Registered authored schemas run with minimal synthetic CardData; no claim of full canonical card-data loading or live UI verification.
- Mutation experiments removed Character type, source zone, and effect-controller guards individually; all red, original file restored (`opt794-mutation-*.log`). These are implementer rung-4 results; reviewer reruns establish independent evidence.
- **Prior integrated `pnpm verify` exited 0 at code head `7e089d0177d23559da53e1108f270fed6feee385`**, including lint, app/worker typechecks, bundle capacity, generated schema parity/lint (34 cases), app tests (2361 passed / 7 skipped), pipeline tests (48 passed), worker coverage (2935 passed / 5 skipped; 245 suites), and production build. Log: `/private/tmp/opt794-sep15-rest-verify.log`. Worker coverage: statements 84.92%, branches 77%, functions 90.63%, lines 88.68%. Database suites skip without TEST_DATABASE_URL; this engine ticket does not require database mutation.
- September 15 integration: normal merges first incorporated main `d262641906d287b0d75ff740a519d652f77d4eff` (OPT-846 Life positions), then `549bfb1d0d24c8fe9a42f207095e9607a4dbbf15` (OPT-847 rest source fidelity). Replacement finalization retains both original removal controller and new rest source identity. Generated registry equals the exact 2472-card semantic union (6 removal card changes, 8 latest-main changes); combined OPT-794/407/847/814 regressions pass 164 tests. Logs: `/private/tmp/opt794-sep15-rest-union.log`, `/private/tmp/opt794-sep15-rest-focused.log`.
- Prior `pnpm verify` gates also exited 0 at `08bb8cff2f877ada374be1a36db0e377186c551a` and first integration `8da7610c9a095442bc5e96d4541ebac41a0a47cb`; those are historical baselines, superseded by the latest integrated gate. Prior sandbox build failed fetching Google Fonts; successful full gates used authorized network escalation. Documentation-only result refresh carries unchanged code-test evidence; coordinator still owns independent review and GitHub readiness gates.

- Final freshness refresh incorporates main `438fd7da1c29227b87d87b65961cf8236fbc054e` (OPT-849 attached-DON activation gate) by clean normal merge. No removal or generated-schema conflict. This committed handoff precedes the renewed full gate so its result can be recorded against the exact commit in the PR body without a receipt-only CI restart. Combined OPT-794/407/849 focused tests: 80 passed. Focused log: `/private/tmp/opt794-sep15-don-focused.log`; full-gate log: `/private/tmp/opt794-sep15-don-verify.log`. Prior green evidence above is preserved, not asserted as a gate on this new head.

## Follow-ups / next ticket

OPT-795 may branch from this pushed head with user-authorized stacking. It owns hand-discard events and OP12/OP14 schemas. Preserve movementCause COST versus EFFECT; field activation costs count as by-effect per the explicit Buggy FAQ. New CARD_ADDED_TO_LIFE is typed, persisted, redacted for players/spectators, and included in source-trigger cleanup.

Existing EB02-023 bounce-only cause-filter behavior was not migrated; other generic custom-event causes still use their prior matching contract. Moby Dick uses explicit top/bottom PLAYER_CHOICE because generic PLACE_HAND_TO_DECK TOP_OR_BOTTOM silently defaults bottom; generic handler repair is separate. No database migrations or manual deployment commands.
