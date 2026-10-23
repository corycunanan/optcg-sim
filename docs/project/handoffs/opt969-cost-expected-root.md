# PR778 expected-root amendment (OPT-969)

Base implementation HEAD:617bfc3db97272b9ae71d41cceb3ab472ab4c5ab.
Exclusive implementation checkout:/private/tmp/pr778-followup. No merge, push,
GitHub/Linear message, ordinary writer-version switch, or full verify was done.
Root owns the run handoff and final gate.

Approved compatibility: new native7 suspended COST frames gain optional immutable
`costExpectedRoot`. Historical no-field frames retain conservative dual DON
eligibility, including the known rested-prefix rejection. Resuspending the same
older owner preserves evidence absence; only a newly created successor owner
may capture at its own sanctioned suspension. No baseline migration.
See SAVED-STATE-COMPATIBILITY.md for the durable contract and rollout dependency.

Production boundaries: cost orchestrator and resumed cost suspension capture the
actual restored published root; coordinator initial publication finalizes only
newly created owners after pipeline cleanup. Prompt lifecycle validates every
existing evidence owner before any mutation, then refreshes surviving evidence
owners only after successful sanctioned continuation, rule processing, and moved
DON cleanup. COST handler independently checks before overlay. Matching evidence
uses staged DON legality. Optional decline, optional/mandatory committed child,
multiple pauses, exact selections and Decision10 remain governed by existing
semantics. Snapshot comparison ignores object insertion order, retains array
order, and treats absent optional properties like serialized undefined.

Additional audited surface: setPlayerPresence applies only its three exact
transport fields to both expected-root and staged players after validating all
evidence owners. Diverged gameplay still allows normal transport bookkeeping
but leaves evidence invalid. This is necessary because players are part of the
whole overlay projection. Reconnect does not become a way to bless stale board
contents. Prompt/player/frame/count guards remain in their original owners.

Persistence: the actual strict native reader uses the same closed projection
shape for staged and expected state, maps turn shape on its validation copy,
validates executable variants for both, and rejects non-COST/no-staged owners.
All separate/embedded undo entries are validated before retention. Versions
below7 reject the new field; only native7 writes it. Shared projection cloning
adds proportional serialization cost: representative ASCII JSON evidence11,210
bytes in published state36,943 bytes. This is not a production performance claim.

Historical payloads, manifests and generator sources remain byte-identical
except the current replay assertion source which the manifest itself hashes.
Its exact original bytes are archived in
`workers/game/src/__tests__/fixtures/opt-969-native7-producers/producer/opt-969-native7-producers.historical.test-source`.
The original manifest entry now explicitly checks that archive; copying it to
its original `opt-969-native7-producers.test.ts` path reconstructs the historical
capture source. Future-output comparisons independently assert the full new
field equals the published projection before stripping only that field on a
copy; all other historical fields compare unchanged. New semantic regressions
supply proof beyond historical parity.

Validation commands run from checkout root; exact lists were captured with
`pnpm --filter optcg-game exec vitest list` before the applicable runs.

- Initial required focused list/run: src/__tests__/opt-969-expected-root.test.ts,
  opt-969-native7-producers.test.ts, opt-969-native7-producer-guards.test.ts,
  opt-969-native7-producer-matrix.test.ts, opt-969-don-cost-reader.test.ts,
  opt-997-canonical-replay.test.ts, opt-997-canonical-corpus.test.ts,
  opt-997-outcome-reader.test.ts (all under src/__tests__). Run command used
  `pnpm --filter optcg-game exec vitest run` followed by those exact paths.
  Result:992 passed,1 opt-in skip, only self-hash archival check failed; corrected
  through explicit archival and passed in subsequent focused run.
- Expanded list/run exact paths:src/__tests__/opt-969-expected-root.test.ts
  src/__tests__/opt-969-native7-producers.test.ts
  src/__tests__/opt-997-corpus-replay.test.ts
  src/__tests__/opt-997-canonical-replay.test.ts
  src/__tests__/opt-997-canonical-corpus.test.ts
  src/__tests__/opt-997-owner-terminal.test.ts
  src/__tests__/opt-997-ready-replay.test.ts
  src/__tests__/opt-997-replay-stage.test.ts
  src/__tests__/opt-864-decision-10-replaced-cost-rollback.test.ts.
  Result:1365 passed,20 historical7 comparator cases failed only from new
  metadata; applied the same narrow explicit assertion to that previously
  missed comparator. Recheck exact command:
  `pnpm --filter optcg-game exec vitest run src/__tests__/opt-997-corpus-replay.test.ts -t historical7`
  passed88, skipped250.
- Final new regression command:
  `pnpm --filter optcg-game exec vitest run src/__tests__/opt-969-expected-root.test.ts`
  passed37. Covers original real-save/reload witness, in-memory/reloaded absent,
  moved, state-still-eligible, effect, unrelated and array-order root drift;
  legacy missing field rejection; two pauses; object-key reorder; all seven
  malformed projection fields in live/all undo ingress; invalid executable,
  unknown projection key, non-COST owner, version6 rejection; optional decline,
  optional/mandatory committed substitutes, stale root below child; reconnect,
  stale gameplay followed by presence; ordinary default/explicit6 control; new
  evidence wrong-player/stale-prompt/foreign/duplicate/under/over guards.
- `pnpm --filter optcg-game type-check` passed after production changes.
- Targeted `pnpm exec eslint` over all16 changed TS files passed0 errors;
 12 existing unused-variable warnings in existing production code. Final new
 test/helper/historical comparator lint passed without warnings.
- `git diff --check` passed. Logs:/private/tmp/pr778-{focused,final-focused,
 historical,regression,types,final-types,lint,final-lint,size}.log;
 exact test lists:/private/tmp/pr778-{focused,final-focused,regression}-list.log.

Final combined selected run (union of both lists above,13 files) passed1420
tests,1 opt-in matrix capture skipped (12 passing files,1 skipped file). Exact
command uses `pnpm --filter optcg-game exec vitest run` with the13 paths in
`/private/tmp/pr778-combined-list.log`; output `/private/tmp/pr778-combined.log`.
The earlier failed runs are retained and described above. A final small cleanup
skips computing live DON targets for evidence-bearing owners; the evidence and
DON reader suites were rerun for that change:46 passed
(`/private/tmp/pr778-last-don.log`). Final worker type check passed and targeted
lint passed0 errors (2 existing unused-variable warnings). Root must run final pnpm verify
against the frozen reviewed candidate. Rollback floor
is this verified amendment, not original485. The loaded7 producer closure and
new evidence reader must ship together before future ordinary7 rollout.


## Adjudicated compatibility delta after review

Both independent reviewers reproduced one bounded policy mismatch: an existing
historical no-field COST owner gained evidence when its validated field
selection opened an optional replacement prompt. `suspendCurrentFrame` now
refreshes evidence only when the incoming owner already has it. Orchestrator
creation of new native7 owners still captures evidence. The unchanged
`positive-ko-decline.json` public fixture proves the same owner remains
field-free immediately and after save/reload. No historical source was changed.

The session-boundary addition uses the existing real GameSession harness,
without coordinator mocks: persist initial native7 state, instantiate the DO
again, send ACTIVATE_EFFECT through `webSocketMessage`, inspect its persisted
rest-prefix DON offer, instantiate again, and send the exact choice reply.
Acceptance persists one returned donor and one DRAW; repeat reply is rejected
without a second DRAW. A separately persisted root-state mutation rejects via
the same message path, preserves the complete state/prompt and emits
`action:rejected`. This is actual action handling and durable rehydration proof,
not a UI or production deployment claim.


Delta validation from `/private/tmp/pr778-followup`:
`pnpm --filter optcg-game exec vitest list src/__tests__/opt-969-expected-root.test.ts src/__tests__/opt-554-session-authorization.test.ts src/__tests__/opt-969-native7-producers.test.ts src/__tests__/opt-997-canonical-corpus.test.ts src/__tests__/opt-997-corpus-replay.test.ts`
preceded the same command with `run` instead of `list`: all 1,345 tests passed
across five files, including all 38 expected-root regressions and both new
GameSession WebSocket cases. Logs: `/private/tmp/pr778-delta-list.log` and
`/private/tmp/pr778-delta.log`. `pnpm --filter optcg-game type-check` passed
(`/private/tmp/pr778-delta-types.log`). `pnpm exec eslint` for the three changed
TS files passed with zero errors and two existing unused-variable warnings
(`/private/tmp/pr778-delta-lint.log`). `git diff --check` passed. No full verify,
push, merge, or external messages were performed; the root run ledger was not
edited.
