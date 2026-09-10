# OPT-821 — Field-to-Life destination choice

Implementation branch: `corymcunanan/opt-821-field-life-position`, based on main `50331c89f742b4a0a04a6e6d8465b97e7999317f`. This document ships in the implementation PR; readiness and merging remain coordinator responsibilities.

`ADD_TO_LIFE_FROM_FIELD` honors fixed TOP/BOTTOM and pauses after target selection for TOP_OR_BOTTOM. The effect controller chooses the destination, while `transitionCard` sends the card to its owner's Life with the authored face and a new identity. Existing Life order/faces remain intact. Zero targets and wholly prohibited removal finish without an unnecessary destination prompt. Concrete moves retain sequential, evolving-state removal checks.

Read `actions/life.ts`, `resume/choice.ts`, and `opt-821-field-life-position.test.ts` first. `fieldToLifeTargetIds` is carried through all prompt-to-stack bridges and validated by the persisted-state schema; it retains selected identities without rerunning target selection. Choice IDs bind the destination to those identities; existing SessionCoordinator ownership/prompt-ID guards remain authoritative. Resume rechecks removal protection, reports whether movement succeeded, and carries result references into remaining actions.

## Rules and acceptance evidence

Sources: `docs/cards/OP-08.md` (OP08-069), `docs/cards/OP-06.md` (OP06-103), repository-supported Comprehensive Rules v1.2.0 `docs/rules/rule_comprehensive.md` §§3-1-6, 3-10-2/2-1, 8-3-1, 8-4-4/4-1, plus `docs/game-engine/ZONE-TRANSITION-CONTRACT.md`. This ticket does not migrate the supported ruleset. No new ruling ambiguity was identified.

| Clause | Evaluation / payer / chooser | Continuation / observable outcome | Evidence |
| --- | --- | --- | --- |
| Linlin On Play: DON!! −1, trash 1; optionally add deck card; then opponent cost≤6 Character to top/bottom Life face-up | Controller pays costs and selects 0–1 target during resolution | Deck-to-Life clause finishes once; field card waits for controller's destination choice | Production PLAY_CARD pipeline with registered authored schema, both ends and restored continuation |
| Kawamatsu When Attacking: trash 2; own 0-power Character to owner's top/bottom Life face-up | Controller pays and selects 0–1 own Character | A borrowed Character enters its owner's Life, independent of its controller | Production DECLARE_ATTACK pipeline; borrowed target, both ends and restored continuation |
| §3-10: unchanged Life cards retain order/face; new placement follows explicit text | Resolve selected destination after selection | New card at index 0 or last index, face UP; mixed existing UP/DOWN sequence unchanged | Four real-schema completion/restore cases |
| §8-4-4-1: up to permits zero; removal prohibition remains effective | Target selection and destination resume | No destination prompt for zero/protected target; protection introduced during pause prevents movement | Zero/prohibited cases on both cards; resume-time protection regression |
| §3-1-6 and zone contract: new identity; do not replace an obsolete selection | At field exit | Old identity disappears; stale/duplicate/wrong-player input cannot repeat movement | Fresh ID assertions, vanished target case, SessionRepository roundtrip, SessionCoordinator wrong-player/stale prompt checks, invalid choice/replay rejection |

## Shared consumers and limits

Recursive inventory via `getAllAuthoredSchemas()` and `getNestedActions()` across effect actions, replacement actions and start-of-game modifications found 19 uses on 18 cards: EB01-053, EB02-057, OP03-123, OP04-097, OP04-110, OP04-117, OP05-096, OP05-111, OP06-103, OP06-107, OP08-069, OP09-101, OP11-101, OP11-116 (two effects), OP12-117, P-085, ST07-017, ST09-015. Every authored target is SELF or at most one Character. Existing TOP_OR_BOTTOM consumers now use the same choice. Only OP08-069 and OP06-103 schema omissions are corrected here, with regenerated registry parity.

No new `life_controller` interpretation or removed-from-field event contract is introduced. Generic field-removal event work remains OPT-794; other schema omissions remain in OPT-807/808/814, and opponent-Life activation costs remain separate (OPT-804/828). Those tickets must retain their remaining rows after accounting for these two representative schema corrections. Successors wait for this PR to merge unless the coordinator obtains stacking authorization.

## Validation

Baseline worker type-check passed before implementation. RED at the base revision plus regression tests: 3 failures showing fixed BOTTOM inserts at top and each real authored lifecycle moves immediately without a destination prompt (`/private/tmp/opt821-red.log`).

Mutation check: disabling field-to-Life removal prohibitions caused all three targeted protection regressions to fail; the handler was restored byte-for-byte (`/private/tmp/opt821-mutation.log`).

Final focused coverage: 14 tests. Full worker suite: 218 files, 2350 passed / 5 skipped, exit 0 (`/private/tmp/opt821-worker.log`, `.exit`). Required full verification and final PR/head are recorded in the PR body and coordinator receipt. Initial full verification caught a stale generated registry; it was regenerated before final verification. No failed check is treated as a pass.

Coordinator VQA at 1680×875 used a temporary representative sandbox fixture, not a live engine UI session: exact Linlin clause wrapped legibly; Top/Bottom visible; Skip disabled; Tab+Space selected Top and enabled Confirm; Bottom deselected Top; Confirm closed the modal and advanced the fixture. Temporary fixture restored exactly before final verification.
