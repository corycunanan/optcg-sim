# Corrected native7 actual-producer corpus

This is separate corrected evidence after review of reader d523e5f. Original v7
payloads/manifest/source patch in `../opt-997-v7` are unchanged historical inputs;
the replay suite loads every original pause live/undo against separately generated
corrected expectations. Original v6 corpus is also unchanged. No old payload or
allocator/event/prompt identity was normalized or repaired.

Actual producer: `5e6b33e5e5a58b8958d80929b5c5660ae9aabcb6`, isolated writer
candidate. Patch base: `b4ed42582fc601a90bf4ebce00b478af65939886`. Apply the
checked-in full producer patch to that base in an isolated checkout with frozen
lockfile dependencies, then from checkout root:

```
pnpm --dir workers/game exec vitest list src/__tests__/opt-997-producer-corpus.test.ts
OPT997_REGENERATE=../../../opt997-v7-corrected-regenerated pnpm --dir workers/game exec vitest run src/__tests__/opt-997-producer-corpus.test.ts
```

All 29 payloads matched a second pinned generation byte-for-byte. Manifest records
all full payload SHA256s, patch hash and deterministic counts. Default CI has no
external dependency: generator is opt-in, replay reads checked-in payloads only.

28 supported families have 61 pause starts, each replayed on live, restored undo,
mixed-live and mixed-undo:244 completion starts. One legacy-unknown family has1
pause and 4 diagnostic starts. These are replay ingress variants, not 248 distinct
gameplay scenarios. Historical original-v7 inputs add44 pauses × live/undo =88
controls. Manifest/hash assertions cover both original and corrected artifacts.

The initial18 supported families are documented in the original README. Added:

| Family | Independent expectation |
| --- | --- |
| fixed-mandatory-prefix | REST_DON then TRASH_SELF; mandatory DRAW1→TRASH_FROM_HAND1 preserves deck4, child hand5→final4, replacement use; earlier REST rolls back |
| selected-mandatory-prefix | generic selected Character exit; same root/staged distinction and exact owner |
| compound-select-prefix | self+trash selection with shuffle, same mandatory prefix |
| compound-arrange-prefix | ordered self+trash replay, same mandatory prefix |
| opponent-life-prefix | opponent destination replay, nonturn replacement owner and distinct once-per-turn activation source |
| fixed-accept-prefix / selected-accept-prefix | optional acceptance controls preserve the same prefix and use marker |
| terminal-after-child-prefix | DRAW1, prompted trash1, MILL4; terminal wins, full independent event order once |
| picker-duplicate-hosts | actual native7 action planner names both same-name Character slots; generic labels and metadata distinguish hosts |
| picker-hold-durations | actual planner names source and distinct next-refresh/this-turn holds without raw IDs |

Prefix payloads assert state/use at every child pause, save and completion;
independent event expectations are DRAW, DRAW_OUTSIDE_DRAW_PHASE, hand-trash,
then terminal deck-trash/GAME_OVER where applicable. No replay of prior events
is used to reconstruct erased state. Once-use is checked for both replacement
and the actual activation source (which differs for opponent-Life).

Separate executor-rung depth101 regression now includes DRAW prefix and use:
root deck4/hand 4 remain committed, returned prefix events remain in their existing
collector, terminal stack/prompt stay empty and GAME_OVER is published once. This
is payment-executor evidence, not a full ordinary-action terminal capture.

The isolated producer explicitly flips ordinary writer 7 and DON cost choices for
capture only. It uses the shared grouped planner for both generic labels and
optional metadata. The reader ordinary writer remains 6; native7 continuation
capability is version-gated. Reader deploy must precede ordinary writer 7, after
which rollback requires a semantic 7 reader. Generic choices remain old-client
fallback. Historical unknown outcomes remain diagnostic, never inferred.

Approved evidence scope is synthetic-only OPT969 plus bounded OPT997. No
production capture, legacy repair, retirement or broader OPT1006 claim. OPT958
rollback policy/deviation fixture remains unchanged and open.

The pending6 upgrade family captures an actual save7/load7 before answer. It is
not evidence that final production writer first-load ordering is implemented;
that stage must convert live and every undo before the first action, not merely
save7 afterward. Ordinary reader6 behavior remains intentional here.
