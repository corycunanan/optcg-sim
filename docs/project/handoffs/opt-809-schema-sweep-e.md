# OPT-809 — selected-card references and Law's optional Life play

## Scope and sources

Base main: `15cad98bd139fc0d8cea075c809e4f8a7b45f507`. Exclusive clone `/private/tmp/optcg-opt809`, branch `codex/opt-809-card-fidelity`. No interrupted809implementation existed;806's recovered work remains isolated and unchanged. No sibling commits or unmerged support imported. Merge mode off.

Read canonical `docs/cards/OP-09.md` and `OP-10.md`, and corresponding official FAQ entries in `docs/FAQs/qa_op09.md` and `qa_op10.md`. Teach FAQ establishes the attack lock lasts through the opponent's next turn; Law FAQ requires total Character cost at least5 before returning a Character, and says an ineligible revealed Life card returns face-down. Supported Comprehensive Rules v1.2.0 §2-7-3 (Event activation/trash), §3-7-6 (field capacity), §3-10 (Life), §4-2 (ownership), §7-1 (battle) and §8-3 (activation costs) inform the scenarios. Relevant runtime contracts: result refs in `resolver.ts`, live ref lookup in `condition-queries.ts`, `executeApplyProhibition`, Life reveal snapshots and `executePlayFromLife`.

| Clause | Implementation and observable pipeline evidence |
| --- | --- |
| OP09-093 Teach: selected Character cannot attack | The ticket's proposed `result_ref` already exists on current main. The remaining defect is omitted APPLY_PROHIBITION target, which creates an unbound restriction and locks unrelated Characters, including after zero selection. Add an explicit Character target and a nonempty Character result-ref condition. Choose one or zero; observe selected negation, opponent-turn attack rejection only for selected card, unrelated Character able to attack, and lock expiry after that turn. |
| OP09-098 Black Hole: if that Character costs4or less, K.O. it | Replace board-wide condition with selected-result-ref card type/cost filter. Selected cost4 is K.O.'d; cost5/6 survives even beside an unrelated cheap Character. Zero does not affect that unrelated card. |
| OP10-022 Law: reveal Life top; eligible Supernovas Character cost≤5 may be played | Capture reveal result snapshot, gate an explicit PLAYER_CHOICE with play/empty-decline branches using the existing primitive. On decline, Life's identity, order and face-down state remain unchanged; return cost stays paid. On accept, exact top card moves to field with fresh identity and active state, without resting DON!! for printed cost. Actual authored ST02-005 Killer plays into the slot vacated on an otherwise full board and completes its On Play K.O. prompt. Ineligible cost6, wrong trait and Event open no play choice and stay in Life. |
| Law's printed DON!!x1 and total-cost prerequisite | ACTIVATE_EFFECT does not enforce trigger.don_requirement. Coordinator approved an equivalent existing DON_GIVEN condition alongside total Character cost≥5, without changing shared code. Zero attached DON!! or total cost4 rejects activation before cost/reveal; attached DON!! remains attached through successful resolution. |

The optional play uses existing PLAYER_CHOICE, not an ignored action-level optional property and not unmerged OPT-799 or806support. Life reveal emits public reveal evidence and leaves the card in place; no action changes Life top before the immediate play/decline decision. The existing play primitive therefore addresses the same revealed card at TOP. The independent-review correction below adds one existing publication-service call at the choice boundary.

Coordinator-approved target-instruction snapshot derivative changes only generatedCount1978→1979 and targetCount2535→2536, accounting for Teach's explicit target. Instruction strings and fallback inventory are unchanged. Registry generation changes exactly these three cards.

## Independent-review correction: publish reveal before the decision

Review of initial head `28d09b7af2324d580ee5e5abb1cacc2c517269e9` found a P1: Law's Life reveal was retained only on the pending choice frame. The opponent's visible state hid Life and the effect stack, so neither generic choice labels nor the frontend could show the revealed card before the decision. Report `/private/tmp/opt809-independent-review.md`.

Coordinator approved one narrow shared change: `executePlayerChoice` invokes the existing OPT-820 `services.publishCommittedEvents(state)` immediately before creating a genuinely multi-option prompt. It leaves zero-option and singleton execution unchanged. `createResolverServices` composes outer prefixes before inner action events; `resume/events.ts` publishes only caller-owned committed events and marks `eventLogEmitted`, preserving the separate `triggerScanned` obligation. It does not inspect or flush staged cost frames, execute trigger drains, or change choice/resume parameters. No unmerged OPT-806 choice support is imported.

Actual Law accept/decline pipelines now round-trip strict session persistence before each response and after the pending decision. Both players' `visibleStateForPlayer` projections contain exactly one public identity-bearing CARDS_REVEALED at the decision; the real frontend `eventToSpotlight` converter returns that revealed card. Opponent Life identity stays hidden in the private zone. No reveal appears while the return-cost selection is pending. At the decision the returned Character has already left the field and is in the controller's hand; accepting or declining after persistence never republishes the reveal. The existing return-cost primitive emits no CARD_RETURNED_TO_HAND event (`cost/resume.ts`), so payment ordering is proved from zone state, without inventing a movement event.

An unchanged authored Speed Jil OP08-049 pipeline proves CARD_PLAYED then CARDS_REVEALED public order before its placement choice and no duplicate after persisted bottom placement. Unchanged authored EB02-051 exercises both PLAYER_CHOICE branches through persisted target selection; existing OPT-730 Maser Saber exercises OPPONENT_CHOICE and singleton feasibility. OPT-820 ordered nested/replacement/event-debt tests and OPT-614 staged transactional-cost tests remain passing. This is representative shared support coverage, not a claim to execute every consumer.

Recursive authored registry inventory: 45 choice nodes (37 PLAYER_CHOICE, eight OPPONENT_CHOICE), including the new Law node; 44 legacy nodes unchanged. Inventory includes actions and replacement_actions. Full paths/parameters saved in `/private/tmp/opt809-choice-inventory.txt`. PLAYER consumers: EB01-052, EB02-045, EB02-051, OP03-028, OP03-096, OP04-040, OP04-043, OP04-082 replacement, OP05-096 twice, OP06-021, OP06-039, OP06-065, OP06-092, OP06-093, OP06-116, OP07-097, OP08-030, OP08-049, OP08-057, OP09-084, OP10-022, OP11-050, OP12-060, OP13-035, OP14-062, OP14-069, OP14-104, OP15-054, OP15-055, OP16-033 replacement, OP16-035, OP17-021 replacement, OP17-112, ST11-003, ST12-006, ST26-002. OPPONENT consumers: OP05-099, OP15-059, OP17-049, OP17-099, OP17-117, ST07-010, ST07-015, ST20-005.

## Validation

Shared baseline caf29b1 from `/private/tmp/opt811-baseline-verify.log`: lint/types/bundle/schema, app2360passing+7existing skips, pipeline48passing, worker2458passing+5existing skips and83.27% statements. Initial sandbox-only font build failure was resolved by elevated build (`opt811-baseline-build.log`). This is shared evidence, not independently rerun here.

Own execution evidence (rung4, subject to independent review):

- Initial11registered-card pipeline cases failed8/passed3 before edits (`/private/tmp/opt809-red.log`). Expanded final suite has14authored cases.
- Focused14authored+9existingOPT444+19target-instruction cases pass42/42 (`/private/tmp/opt809-focused.log`). Worker type check passes; schema gate passes34tests,2472cards, source/generated parity and documentation/action inventory (`opt809-schema.log`).
- Nine final mutations all exercise runtime behavior: original Teach2fail, original Black Hole2fail, original Law6fail; moving Teach's ref to the wrong preceding Leader action1fail; removing explicit target1fail; removing zero guard1fail; removing Law's DON condition1fail; replacing the inner choice with forced play3fail; removing revealed-card filters3fail. Each runs all14authored cases. Script `/private/tmp/opt809-mutations.py`, results `/private/tmp/opt809-mutations.json`, per-mutation logs adjacent. Scratch registry restored before passing focused verification.
- Initial head passed full `pnpm verify`: app2360 +7existing skips, pipeline48, worker2500 +5existing skips,83.68% statements and production build (`/private/tmp/opt809-final-verify.log`). That gate predates this correction.
- Visibility regression initially failed both Law decisions (`opt809-reveal-red.log`). Final correction suite has17 authored cases, including three legacy choice cases. Removing just the publication call fails three of17 cases (both Law decisions and Speed Jil); restoring it passes all58 cases across seven focused suites. Focused shared regression results are recorded in `opt809-reveal-final-focused.log` and the mutation in `opt809-reveal-mutation.log`.
- Required renewed full `pnpm verify` will run at the committed correction head; final SHA and result belong in the PR body. Current CI, coordinator diff review and fresh independent review remain required before merge-ready.

No new skipped tests, database migration, UI or protocol changes. No production operations.

## Follow-ups

No new prerequisite. General ACTIVATE_EFFECT enforcement of trigger.don_requirement is tracked in OPT-849 and remains outside this card change; Law is guarded with an equivalent supported condition. Ticket exclusions remain OPT-794 (field-removal trigger vocabulary), OPT-804 (small vocabulary gaps) and OPT-799 (generic action optionality). These are not imported or implemented here.
