# OPT-969 reader compatibility corpus

This synthetic-only corpus was emitted by real, isolated writer code at
`46d28acb2511a8a34efb2568ec6cf544659c3f0f`, based on reader
`cc53ba65d4497b36699191ceea3349727b03c5f5`. Earlier six-family capture:
`e4a2f54ab91351a44e26fc818e6be9d9153e5027`. This reader PR does not enable
that writer. No production captures, migration retirement, or full task
completion are claimed.

`manifest.json` records exact SHA-256 bytes. Seven families have 14 live/undo
replay starts and 18 answers, including two later cost-selection pauses.
Six families (12 replays) establish supported completion: direct identity,
EB04-030 replacement identity with non-turn-player owner, fixed DON cost,
positive variable DON cost, historical bucket, and opponent-owned active
cost-area identity. The Amazon family grafts the authored OP15-059 action/cost
onto an activation fixture; it does not claim authored trigger reachability.
Independent assertions check that only the opponent's DON is returned.

The seventh family, `cost-child-replacement`, is an **OPT-997 known-debt
control**, not completion proof. Its two replays preserve an orphaned COST
owner with no prompt after a prompting substitute. Enabling the new behavior
writer is blocked until that owner settles correctly. A separate immutable-base
Ganzui diagnostic reproduces the same pre-existing owner leak; equality with
that debt does not make a new producer safe.

The historical bucket payload is byte-identical to the generator output at
immutable base `7790f86ddb73f9c3f7d2c923000d9ab3e5932b6d` (`cmp` exit 0).
Existing bucket IDs retain their meanings. Exact identity IDs are separately
prefixed `don-return-ids:` followed by a JSON array. Cost frames explicitly
bind those choice IDs alongside eligible DON IDs in `validTargets`.

Run the captured reader checks (no external files/dependencies):

```sh
pnpm --dir workers/game exec vitest list src/__tests__/opt-969-corpus-replay.test.ts
pnpm --dir workers/game exec vitest run src/__tests__/opt-969-corpus-replay.test.ts
```

Regenerate only at the isolated producer revision, never the disabled reader:

```sh
OPT969_REGENERATE=src/__tests__/fixtures/opt-969 pnpm --dir workers/game exec vitest run src/__tests__/opt-969-producer-corpus.test.ts
```

The generator has no mocks. `SessionRepository.save/load` writes and reads the
live pause and an identical undo snapshot; continuations persist later pauses
and completion. The replay compares full states, prompts, events, RNG and ID
counters, without normalizing identities. The repository's actual writer
assigns prompt IDs and schema metadata before capture. The producer test is
skipped by default; default CI runs the captured replay suite.
