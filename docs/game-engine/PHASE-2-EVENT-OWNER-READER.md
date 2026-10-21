# Event publication-owner reader amendment (OPT-966)

This prerequisite changes only the propagation-debt recipient for an already loaded version-5 trigger scope. It creates no scope, changes no saved shape, and preserves the ordinary version-1–4 reader path.

The authored OP01-058 Punk Gibson Counter selects its power target, then rests PRB02-009 Mr.3. Mr.3's optional effect pauses. The former `retainPropagationBeforePrompt` chose the first interrupted frame, an Event activation completion boundary below the trigger owner, and retained POWER_MODIFIED there. Saving that pause produced a completion boundary carrying executable work, which the supported reader correctly rejected. The validator remains unchanged.

With a version-5 owner present, the helper searches downward from the child for the nearest trigger owner or a matching live Character battle-replacement damage boundary. Completion-only Event frames are not recipients. A stale battle ID cannot acquire debt; a nested owner remains responsible for its own child. Existing propagation flags and reference identity remain intact, including separate equal-payload events. With no version-5 owner, the original recipient selection remains unchanged.

## Evidence

The immutable actual-writer corpus is `workers/game/src/__tests__/fixtures/opt-966-counter-prefix-writer.json`, produced from clean writer commit `4ada636309c7b4034cacb3f5241890813be71055`. It contains all three pauses (target, target, optional), their full stored session and undo snapshots, replies, and final GameState. The board is synthetic; both effect schemas are authored. This is not a captured production session.

The writer also avoids allocating an otherwise empty trigger scope for a standalone Event completion boundary. Its notification scan still reports real matches. The exemption is restricted to a single-frame stack so lower legacy cohorts still receive ownership. This removed an unnecessary final ID allocation; no IDs or state fields are normalized in the replay oracle.

The reader test executes each saved live and undo state, saves/reloads at every later pause, compares the complete intermediate GameState and final GameState, and requires exact Counter/activation/power publication counts and two Mr.3 draws. It independently exercises a normal version-4 Counter pipeline against the pinned deployed reader and compares stored live/undo bytes at all three pauses. Routing probes cover nearest inner owner, matching and stale battle IDs, independently unfinished scanning/publication flags, reference deduplication, separate equal-payload occurrences, and terminal no-op.

Focused validation: 91 tests pass across the new corpus/probes, authored Event activation tests, nested Event tests and retained battle-reader tests. Worker type-check passes. Full verification and independent review are pending at this checkpoint.

Reproduce from this checkout:

```sh
OPT966_READER_ROOT=/Users/corycunanan/Documents/Codex/2026-10-20/work/opt966-deployed-reader-v3 pnpm --filter optcg-game test src/__tests__/opt-966-event-owner-reader.test.ts src/__tests__/opt-805-authored-fidelity.test.ts src/__tests__/opt-850-nested-event-activation.test.ts src/__tests__/opt-966-battle-reader.test.ts
pnpm --filter optcg-game type-check
```

The pinned baseline is merged reader `07957d1235a24d075140c7b53d24c549996fd178`. Reverting the helper to that baseline makes the earliest two actual pauses fail on the later save; ownership probes independently reject the old recipient choice. Restoring the correction returns the focused suite to green.

## Limits and follow-ups

This bounded amendment proves the Counter path and ownership probes described above, not all future combinations of nested card effects. Main OPT-966 writer activation remains incomplete and requires its full final replay corpus, verification and fresh review. The inherited missing production-capture corpus (OPT-971) remains an evidence limitation; no supported reader or converter is retired here. Existing OPT-881 (DON return cause filtering) and OPT-999 (Rebecca hand reveal) remain separate follow-ups.
