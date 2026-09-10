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

The optional play uses existing PLAYER_CHOICE, not an ignored action-level optional property and not unmerged OPT-799 or806support. Life reveal emits public reveal evidence and leaves the card in place; no action changes Life top before the immediate play/decline decision. The existing play primitive therefore addresses the same revealed card at TOP. No shared runtime code changes.

Coordinator-approved target-instruction snapshot derivative changes only generatedCount1978→1979 and targetCount2535→2536, accounting for Teach's explicit target. Instruction strings and fallback inventory are unchanged. Registry generation changes exactly these three cards.

## Validation

Shared baseline caf29b1 from `/private/tmp/opt811-baseline-verify.log`: lint/types/bundle/schema, app2360passing+7existing skips, pipeline48passing, worker2458passing+5existing skips and83.27% statements. Initial sandbox-only font build failure was resolved by elevated build (`opt811-baseline-build.log`). This is shared evidence, not independently rerun here.

Own execution evidence (rung4, subject to independent review):

- Initial11registered-card pipeline cases failed8/passed3 before edits (`/private/tmp/opt809-red.log`). Expanded final suite has14authored cases.
- Focused14authored+9existingOPT444+19target-instruction cases pass42/42 (`/private/tmp/opt809-focused.log`). Worker type check passes; schema gate passes34tests,2472cards, source/generated parity and documentation/action inventory (`opt809-schema.log`).
- Nine final mutations all exercise runtime behavior: original Teach2fail, original Black Hole2fail, original Law6fail; moving Teach's ref to the wrong preceding Leader action1fail; removing explicit target1fail; removing zero guard1fail; removing Law's DON condition1fail; replacing the inner choice with forced play3fail; removing revealed-card filters3fail. Each runs all14authored cases. Script `/private/tmp/opt809-mutations.py`, results `/private/tmp/opt809-mutations.json`, per-mutation logs adjacent. Scratch registry restored before passing focused verification.
- Required full `pnpm verify` will run at the committed head; final SHA and result belong in the PR body. Current CI, coordinator diff review and fresh independent review remain required before merge-ready.

No new skipped tests, database migration, UI or protocol changes. No production operations.

## Follow-ups

No new prerequisite. General ACTIVATE_EFFECT enforcement of trigger.don_requirement remains outside this card change; Law is guarded with an equivalent supported condition. Ticket exclusions remain OPT-794 (field-removal trigger vocabulary), OPT-804 (small vocabulary gaps) and OPT-799 (generic action optionality). These are not imported or implemented here.
