# OPT-819 — Permanent effects at effect-played field entry

Implementation complete; independent review and merge remain coordinator gates.
Prerequisite OPT-818 merged as `ec9983ddbc3b101f633e97117194f57a456eaf15`.

Read `trigger-ordering.ts`, the new OPT-819 regression, and the strengthened
`op13-082-five-elders.test.ts` first. Resolver event scans now call the same
idempotent `registerCardEnteredField` helper as the action pipeline. Permanent
modifiers and prohibitions exist before nested On Play prompts drain.

Rules packet: `docs/cards/OP-13.md` OP13-079/080/082/083/084/089/091;
comprehensive rules v1.2.0 §8-6-1/1-1 (simultaneous trigger ordering).

| Clause | Evaluation / chooser | Observable evidence |
| --- | --- | --- |
| Five Elders pays a rested DON!! and hand card, trashes board, plays distinct Elders | Imu controller pays/selects; all plays precede queued On Play resolution | Real pipeline and every prompt through resumePromptLifecycle, A/B/C/all-five |
| Elders' seven-trash protection and Rush/Blocker | Continuous condition against current controller trash | Exact permanent block identities; Nusjuro legal attack, Mars/Warcury Blocker; six-trash negative |
| Simultaneous effects queue in turn-player order | Existing scanner ordering untouched | Real Saturn/Mars order prompt, permanent registration both before and after completion; KO batch followed by opponent synthetic On KO recruiting real Saturn/Mars |

Literal ticket wording asks an activeEffects row for every permanent block.
Saturn and Ju Peter include prohibition-only blocks: existing OPT-818 design
correctly stores these in `prohibitions`, not `activeEffects`. Regressions assert
exactly one activeEffects row per modifier block and the authored prohibition
count per instance/block, rather than inventing inactive modifier records.

All 16 scanner call sites audited. Play, SET_REST, KO, batch/cost/choice/chain
resumption and pipeline callers retain returned state. The first target-resume
scan intentionally uses pre-rule-trash state for leave-field matching and carries only
execution context; it cannot introduce CARD_PLAYED events and needs no edit.
Authored registry inventory: 2472 schemas, 650 permanent blocks, 57
prohibition-only blocks. No authored schema, wire contract, or UI changes.

Validation: RED commit `0a5346c5` demonstrated B/C/all-five missing permanence
(A passed). Final focused 16 tests pass; restoring the old scanner produces
five failures including the new KO case and existing test, then restored.
Worker type-check passes. Full verify results are recorded in the PR body.
These are executed local evidence (rung 4); independent rerun is a review gate.

Follow-ups: OPT-820 owns pre-prompt accumulated-event replay; this change does
not alter event-log propagation, continuous trash-count semantics, or client
attack gating. OPT-820 starts after this PR is verified merged.
