# OPT-806 — OP04/ST05/ST06 schema fidelity

## Scope and sources

Recovered the interrupted four helper regressions unchanged in `27e6c8c`, then integrated main `15cad98bd139fc0d8cea075c809e4f8a7b45f507` in `0a23f5e8db850d135b3907a1fdb155088d8b12a2`. No sibling branch was imported. Implementation is limited to OP04-011, OP04-094, ST05-017 and ST06-004, their generated registry and tests. Merge mode is off.

Canonical sources read: `docs/cards/OP-04.md`, `ST-05.md`, `ST-06.md`; official rulings mirrored in `docs/FAQs/qa_op04.md`, `qa_st-05.md`, `qa_st-06.md`. Supported Comprehensive Rules v1.2.0: §2-7-3 (Event enters trash on activation), §7-1-3-2-2 (Counter Event), §7-1-4-1-2 (battle K.O.). Engine reference: `04-ACTIONS.md` APPLY_PROHIBITION, resolver result-reference handling, condition-query REVEALED_CARD_PROPERTY and `06-PROHIBITIONS-AND-REPLACEMENTS.md`.

| Printed clause | Evaluation, choice and observable result | Registered pipeline evidence |
| --- | --- | --- |
| Nami: revealed Character with at least 6000 power | When attacking, inspect the revealed result snapshot; mandatory reveal then place that card at deck bottom, preserving the other cards' order | 6000/7000 Character boosts with no other qualifying field card; 5000 Character and an Event carrying power metadata do not boost even with an unrelated 7000 Character on field |
| Trueno: trash count 15 upgrades cost limit 4 to 6 | Event is already in its controller's trash before effect resolves. Mutually exclusive conditional KO actions; up to one opponent Character, including zero | Preactivation trash 13/14/15 offers cost4/cost6/cost6 respectively. Cost7 response rejected. Chosen card actually reaches opponent trash. Zero and no-eligible cases finish without a second target prompt |
| Union Armada: selected FILM card +4000 this battle; if Character, cannot be K.O.'d this turn | Counter dispatch must be category auto. Result-ref condition checks the selected card, not Event source. Explicit target specification makes APPLY_PROHIBITION consume the preselected result ref | Real Counter Event use, select Character/Leader/zero. Character survives a 12000-power attacker despite only reaching9000; unselected same-name FILM Character receives no protection. Leader boosts but receives no Character protection. Battle boost expires at battle end; prohibition expires at turn end |
| Smoker: cannot be K.O.'d by effects | Permanent prohibition cause EFFECT includes either player's effect but excludes battle | Authored OP01-094 Kaido, activated and DON-minus cost completed, wipes unprotected bystander while Smoker survives on either side. Smoker is still K.O.'d in battle |

The `REVEALED_CARD_PROPERTY` evaluator also consumes ordinary result refs by looking up their live identities; Union Armada uses that established path. Its explicit target is necessary because APPLY_PROHIBITION treats omitted targets as player-level restrictions. The condition prevents a zero choice from falling back to all friendly Characters. No shared engine code changed.

`opt-775-target-instruction.test.ts.snap` changes only generatedCount1978→1980 and targetCount2535→2537: Trueno's additional cost6 target and Union's explicit target. Existing instruction strings and fallback inventory are unchanged; coordinator approved this generated derivative update.

## Validation and evidence

Shared baseline at caf29b1058dddf3dd26357c708ae42f9743e3426: coordinator's `/private/tmp/opt811-baseline-verify.log` records lint, both type checks, bundle/schema checks, app2360 passing/7existing skips, pipeline48 passing, worker2458 passing/5existing skips and83.27% coverage. Its sandbox-only Google Font build failure was followed by successful elevated build in `/private/tmp/opt811-baseline-build.log`. This is shared baseline evidence, not independently rerun here.

Own execution evidence (rung4; reviewer must independently reproduce claims):

- Initial registered pipeline suite:8fail/4pass before source edits (`/private/tmp/opt806-red.log`). Final suite expanded to17cases plus4unchanged recovered helpers.
- Focused17authored+4recovered+19target-instruction cases pass40/40 (`/private/tmp/opt806-focused.log`). Type-check worker passes. Schema gate passes34tests and checks2472cards, authored parity, action inventory and documentation drift (`/private/tmp/opt806-schema.log`).
- Individual original-card registry mutations fail: Nami4, Trueno2, Union3, Smoker1. Union category rollback3fails, removing explicit target1fail, removing result-ref condition2fails. All17authored tests run per mutation; generated registry restored afterward. Reproduction script `/private/tmp/opt806-mutations.py`; results `/private/tmp/opt806-mutations.json` and per-mutation logs. Full original-registry mutation before the two extra no-target cases failed10of15 (`/private/tmp/opt806-mutation-original.log`).
- Required full `pnpm verify` is queued for the serialized resource slot. Until its success, CI, coordinator and independent review, this handoff does not establish merge-readiness. Final outcome and tested SHA will be recorded in the PR body.

No UI, protocol or database shape changes. Existing environment-dependent database test skips remain part of the baseline; no new skips introduced.

## Follow-ups

No newly discovered out-of-scope implementation is required. Ticket exclusions remain separate: OP03 damage triggers (OPT-796), battle/replacement references (OPT-797), mill and either-player cost primitives (OPT-798). The shared APPLY_PROHIBITION omitted-target behavior is unchanged and this card now uses its established explicit-target contract.
