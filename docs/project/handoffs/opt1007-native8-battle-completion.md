# OPT-1007 reader candidate handoff

Base: `69125276e1bb4a1eba7ea2170056cd392b02885b` (#778). Branch: `corymcunanan/opt-1007-reader-prerequisite-resume-end-of-battle-completion-before`. Scope is the reader prerequisite for OPT-1003; no ordinary writer activation, session promotion, Linear write or merge is included. End Phase reader/writer stage code in phases.ts is unchanged.

## Result and contract

Native8 has an explicit unique root BATTLE_COMPLETION owner. END_OF_BATTLE effects and every child finish while battle durations remain visible; the owner then detaches, expires turn-player then opponent effects/prohibitions for its exact battle, and reports completion/Main once. The live battle is already cleared, avoiding Damage replay; new EOB-created battle durations consult the owner. A terminal effect or stack-limit failure cancels ordinary completion and preserves committed events before GAME_OVER. Strict malformed owner/turn/prompt checks apply to every live/undo load.

Required native8 `costSemanticsVersion:6|7` preserves originating cost behavior. Mode7 keeps expected-root publication/reply evidence and future DON identity producers; mode6 keeps ordinary6 behavior and documented legacy debt. Ordinary writer6 and existing native7 semantics are unchanged. No automatic first-load promotion exists here. See [the detailed support and acceptance contract](../../game-engine/NATIVE8-BATTLE-COMPLETION.md).

## Evidence

The isolated writer source is immutable `2b9f10cb8ed4d61648a81759c7142b7a31f4304f`, with complete base-to-producer patch, exact generator source and SHA-256/byte manifest in [the corpus](../../../workers/game/src/__tests__/fixtures/opt-1007-native8/README.md). It flips only its isolated setup to create native8; that setup change and active generator are absent from the reader branch. Native7 provenance is an explicit controlled fixture input. There are 34 synthetic scenarios in 17 families, 153 action transitions, 187 initial/later/final starting boundaries, and 42 captured completion-owner boundaries. Three replay contexts cover live, separate undo and embedded undo through real SessionRepository/SessionCoordinator, preserving exact identifiers, counters, events, prompts and roots. Totals are manifest-derived and tested. These are not production captures.

Independent assertions cover authored ST08-013 + OP02-118 survivor/IF_DO behavior, authored ST01-002 Life Trigger, authored OP10-034 battle-KO replacement, normal Character/Leader damage, Attack/Block/Counter abortion, power-condition visibility, EOB-created power/keyword duration context, nested target→On-KO choices, source leaves, both-player generation order, EOB costs/replacement evidence, terminal cancellation, and adversarial stack exhaustion. Stack exhaustion uses a controlled canonical full-stack input through the public battle facade/pipeline, not a naturally reached authored sequence.

A single mode6 cost replacement scenario is diagnostic, not a completion pass: the historical checked COST owner has neither final outcome nor prompt. The same scenario is independently reproduced on unmodified base69125276, archived in the corpus baseline directory. Reader8.mode6 preserves that debt losslessly, keeps completion pending, and never infers payment history. Mode7 uses existing Decision10 replacement abandonment, with substitute events committed, staged costs rolled back, and no post-colon DRAW. That accepted rules deviation remains separate work.

The original OPT-1003 pipeline regressions were red on `4858458abb4516c3085543f84c5b20e2364c8ec6`: protected defender is incorrectly KO'd at EOB, and a start-of-turn condition sees an expired-next-turn power modifier. Original source/logs remain in run-owned `work/evidence/opt1003`; they are not active failing tests in the reader release. A mutation that restores early expiry to native8 is rejected by all three authored memory/live/undo cases; exact source bytes were restored. This supports the decisive guard independently from generated-state equality.

Nested authored action inventory at the unchanged authored registry: THIS_BATTLE MODIFY_POWER 211 uses / 202 cards, APPLY_PROHIBITION 10/10, GRANT_KEYWORD 4/4, SWAP_BASE_POWER 1/1. Custom EOB consumers are OP04-047 and ST08-013. The iterator uses production getAllAuthoredSchemas/getNestedActions; script/output remain in run-owned evidence. Runtime queries include modifiers.ts power/keyword reads, target/condition checks and prohibition gates. Inventory is source evidence, not playable certification for every card.

## Commands and results at candidate freeze

Own frozen-lockfile dependencies were installed independently in reader, writer prototype and baseline clones, with no sibling node_modules symlinks. Selection was inspected before focused invocations.

- `pnpm --filter optcg-game exec vitest run src/__tests__/opt-1007-native8-replay.test.ts src/__tests__/opt-1007-battle-completion.test.ts`: 122 passed, including 102 context replay cases, corpus hashes/counts and negative reader guards. Log `work/evidence/opt1007/focused-new.log`.
- Focused shared selection: new owner test, opt-963-v3-reader, opt-969-expected-root/native7-producers/native7-producer-guards, opt-997-corpus-replay, opt-967-step-end, opt-872-battle-ko-replacement-continuation, opt-962-end-phase-persistence and all timing-baseline files. Initial run: 16 files, 967 passed, one expected failure and one skipped, with no timing snapshot changes. Final renewal and full-gate logs are attached in the implementation report.
- `pnpm --filter optcg-game type-check`: passed before final comment-only metadata documentation. Final full gate repeats required checks.
- Mutation: `vitest run src/__tests__/opt-1007-battle-completion.test.ts -t 'retains OP02-118'` under temporary always-expire mutation fails all three selected cases; source restored, green renewal passed.
- Producer generator: manifest command, one test passed, 34 fixture payloads created. Baseline cost-debt probe: one test passed on base69125276. Logs are run-owned evidence.

Large tier requires local `VITEST_MAX_WORKERS=2 pnpm verify` plus CI on the exact candidate. Full-gate completion is reported separately with the immutable commit; this handoff does not anticipate its outcome. Existing independent timing/source cost corpora are unchanged. No full independent review is claimed by the implementation agent.

## Follow-ups and rollout gates

Deploy and verify this reader before OPT-1003 writer activation. Production capture preflight failed with expired-token authentication; no production fetch workaround or capture evidence is claimed. Production captures or an explicit scoped synthetic-only exception remain a coordinator-owned rollout gate. Preserve this limitation in readiness/rollout records.

The parent writer must explicitly promote historical6 with mode6 and7 with mode7, consistently for live and undo before actions, and preserve already-started legacy EOB semantics without fabricating completion obligations for old prompts. Refresh expiry must move before TURN_STARTED while retaining OP11-040 and End Phase stage bytes. Existing legacy6 unknown cost debt and Decision10 policy are not resolved here. After native8 writes, this semantic8 reader is the rollback floor; seven-only executables reject rather than reinterpret it.
