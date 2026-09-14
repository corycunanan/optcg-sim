# OPT-794 removal watchers

Implementation candidate, not merge-ready. Initial base main `a31499ba6f8d0787443501ff9c022e962e0bf01f`; integrated main `38032a5e7dfad849d5f4b1d75b680e46c8df11db`; branch `corymcunanan/opt-794-engine-character_removed_from_field-only-observes-ko-and`. PR/head recorded in the coordinator run ledger after push.

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

All rows use registered production watcher schemas with minimal synthetic CardData fixtures (including zero-cost Event setup), not canonical production card-data loading. They execute through runPipeline and complete real prompt lifecycle responses. Supplemental action sources isolate effect trash and five activation-cost movement primitives. The OPPONENT_ACTION movement inventory has14 wrappers, of which3 move field Characters: EB01-028, OP06-051, P-055; remaining domains are hand/trash/deck (hand-discard consumers belong to OPT-795). Shared matching tests cover non-field source, Stage, rule/battle causation, and controller distinct from destination owner. New Life event validates its strict persisted payload schema and player/spectator identity redaction; prompt continuation uses JSON roundtrip, not the full persisted-state parser. Cost KO snapshots effective preKO base power and DON before transition.

## Shared consumers

Recursive object walk of generated AUTHORED_SCHEMAS (including nested actions/any_of): CHARACTER_REMOVED_FROM_FIELD has exactly the seven watchers above. Remaining CHARACTER_RETURNED_TO_HAND consumer EB02-023 retains its old matcher behavior. RETURN_TO_HAND:124, RETURN_TO_DECK:66, ADD_TO_LIFE_FROM_FIELD:18, RETURN_OWN_CHARACTER_TO_HAND:23, KO_OWN_CHARACTER:5, TRASH_OWN_CHARACTER:8. Full inventory captured `/private/tmp/opt794-consumers.log`; rerun with `node --import tsx` and recursively inspect Object.values for these strings. Engine changes affect the common movement paths; provenance fields are additive and persistence optional for older state.

## Validation

- Baseline opt407 matcher suite: 7 passed before edits (`/private/tmp/opt794-baseline.log`).
- Corrected authored regression against baseline generated registry: three Hancock removal draw assertions fail (`opt794-red-authored.log`); initial fixture used wrong card IDs and is not regression evidence.
- Exact Slave Arrow FAQ red before cost-bounce fix, then green (`opt794-slave-red.log`, `opt794-cost-green.log`).
- Initial pipeline: 39 passed (`opt794-cost-matrix.log`); matcher: 25 cases; four focused files previously green, rerunning final combined checks.
- Mutation experiments removed Character type, source zone, and effect controller guards individually; all red, original file restored (`opt794-mutation-*.log`). These are implementer rung-4 results, reviewers must rerun before treating claims as independently proven.
- First full verify found two legacy assertions encoding the bug (Stage-as-Character and secret-zone Buggy suppression); corrected. Next verify passed lint/type/schema/bundle/app/pipeline/worker coverage and reached build, which failed Google Fonts DNS in sandbox. Final elevated verify found the old aggregate Character-trash event duplicated the new identity event; corrected to one count:1 identity event per Character, and focused 77 tests pass. Independent review reproduced three material lifecycle defects: stale source registrations after cost prompts, moved Shakuyaku suppressed in open Trash, and battle KO retaining EFFECT movement cause. Corrected with shared post-scan old-identity cleanup, open-Trash custom-removal exception, and explicit BATTLE provenance. Added red/green pipeline regressions (81 focused tests passed before adding second open-trash variant); Integrated full pnpm verify passed at f7cdc0c34573899b6be3876905cd19dc16f38c90 (exit0, including build). Subsequent source-controller audit reproduced OPPONENT_ACTION chooser misattribution; corrected via existing identity-guarded source snapshot with live-source fallback, preserving target chooser. Authored Tsuru + Hancock and source-left-as-cost + Oro Jackson regressions red/green. Final source-controller delta gate pending. Database suites skip without TEST_DATABASE_URL; this engine ticket does not require database mutation.

## Follow-ups / next ticket

OPT-795 may branch from this pushed head with user-authorized stacking. It owns hand-discard events and OP12/OP14 schemas. Preserve movementCause COST versus EFFECT; field activation costs count as by-effect per the explicit Buggy FAQ. New CARD_ADDED_TO_LIFE is typed, persisted, redacted for players/spectators, and included in source-trigger cleanup.

Existing EB02-023 bounce-only cause-filter behavior was not migrated; other generic custom-event causes still use their prior matching contract. Moby Dick uses explicit top/bottom PLAYER_CHOICE because generic PLACE_HAND_TO_DECK TOP_OR_BOTTOM silently defaults bottom; generic handler repair is separate. No database migrations or manual deployment commands.
