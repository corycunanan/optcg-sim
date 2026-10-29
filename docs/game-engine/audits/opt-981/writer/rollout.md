# OPT-981 producer-only writer11

Campaign: 2026-10-28 Pacific. ISO timestamps in immutable evidence use UTC.
Reader base: `8c8a80bdf93c0d095d10f100feb3e31c60aa3e61`.
Source producer: `e003cc7cce91ee54af3934d545e3dfc153db7ebc` (runtime activation
commit `0709cec25511614fc6726d4309da5cc5a9947b7a`, followed by test-policy and
capture-source corrections). `phases.ts` SHA-256:
`48a18eb6084eac1f3c0370ccbb7a0be7cbf9029228e990b7704bc9745fca2abd`.

## Contract and rollout floor

Rule6-6-1-2 grants each step owner the choice among already-resolved obligations.
The existing reader11 owns this choice, its queue, nested work, event scanning,
expiry and handoff. This writer enables it only when a nonlegacy End Phase step
first has at least two obligations and is about to offer a choice. Explicit
schema8/9/10 with recorded cost mode6/7/8 promotes to11 before any awaitingOrder
marker or prompt. Existing11 resumes normally. The independent field-trash
capability is copied (8→field8,9→field9,10→its explicit mode), not inferred from
cost mode. Constructors remain8; ordinary scheduling and trash producers keep
their existing promotions. Zero/one obligation, legacy stage, raw historical
caller, rejected action and stale/invalid response do not publish promotion.
Session ingress still owns historical validation and normalization.

Reader PR797 merged at8c8; deployment run40823212099 succeeded. The coordinator
verified active worker version `e2f0e4b3-b460-4080-b745-cb6148b47784` at100%,
deployment `54ebd5a3-92f1-4706-84e4-c025347106eb`. Its Git tree
`19c723a47ed28141313d693dee72aac7034a0410` equals the assessed integration6399325.
See [reader-floor.json](reader-floor.json). This floor was verified before the
writer was implemented. Rollback after any11 write is only this reader-capable
8c8 build or a newer compatible build, never an older reader. Writer deployment
and completion remain separate coordinator gates; this document is not evidence
that the writer itself has deployed.

Rule6-6-1-3 remains the reader-stage assessment: expiry is pure filtering over
fixed record/context fields, with no callbacks, queries or intermediate event
publication; within-owner order has no observable effect today. Future expiry
callbacks require re-evaluation. The17-producer authored inventory remains in
[authored-obligations.json](../authored-obligations.json).

## Actual writer corpus and reader replay

The gzip archive `workers/game/src/__tests__/fixtures/opt-981-writer-produced.json.gz`
contains58 action receipts, including16 authored setup receipts. No generator
assigns schema11. Four authored runs (both seats, both choices) start at8,
activate OP08-074, play OP13-066 through the public coordinator/pipeline, then
advance End Phase from10 into writer-produced11. Rayleigh's paid play needs8
active DON: the synthetic board starts8 active plus1 given; Maria adds1 rested,
then Rayleigh costs8. Field totals are10 vs5. Maria-first finishes6 vs5;
Rayleigh-first finishes5 vs5. This strengthens the reader-stage resolver-only
3+1→8 reproduction; it is not a full-deck game or production capture.

The remaining scenarios use explicitly synthetic public activation schemas to
produce delayed trash/optional watcher/terminal paths and nested scheduling,
for turn and non-turn owners. All receipts use production persistence. History
is carried across each authored action; next-player ATTACH_DON and coordinator
UNDO produce and restore actual11 undo snapshots. The coordinator clears undo
when ordering prompts open, so no natural10-undo/11-live history is claimed.
Separate reader tests retain mixed8/9/10/11 history without blanket retagging.

Archive hash: `bfaa3aeddfb353c44f52b1f6a4caf2e8082f66eab4274c9b24eb92bc27aa01c8`.
Uncompressed payload hash: `7e7ceb633fe894129b6a2be3dcc8adc55d7f2107aeb99ddafe351353c3a8d0b8`.
[corpus-manifest.json](corpus-manifest.json) records the producing source SHA.
The exact clean deployed-reader checkout8c8 loaded116 before/after snapshots
and replayed32 native11 actions with exact JSON storage equality. The26 setup
or10→11 producer receipts are load-tested, not executed on the intentionally
disabled reader. The replay script dynamically imports only the selected reader
runtime and refuses a wrong SHA or tracked source changes. There is no remote
saved-state import route; this is local replay against verified deployed source.

From `workers/game`, reproduce with:

```
node --import tsx scripts/replay-opt-981-reader.ts /absolute/path/to/deployed-reader-11
```

Do not regenerate the committed corpus to mask a regression. The source capture
script is archived for provenance; generation must run at its recorded source.

## Validation and historical expectation changes

The source baseline without promotion fails the new producer/public authored
checks. Mutants promoting a one-obligation step, rewriting cost/trash capability,
and assigning the wrong owner each fail. A corpus mutation choosing the other
obligation fails exact deployed-reader replay. Parent independent mutants also
cover legacy stage, missing explicit cost, both trash modes and queue count.
All runtime mutations were restored before generation. Focused17 files/360 tests
pass; full Large verification and final CI/review results belong in the PR.
Cross-family review was unavailable because Claude's session budget was exhausted;
a fresh independent native review and the additional critical mutations replace
it, with the loss of reviewer diversity recorded explicitly.

The initial full worker pass had49 failing tests plus one suite-load failure,
all traced to old FIFO expectations:

- Shared archived End Phase builder:18 golden tests,2 malformed-ingress tests,
  1 current-writer test and the reader suite load. It now explicitly reconstructs
  historical7; current ingress still promotes that to8/cost7. Only JSON key order
  differs for the archived End Phase golden (cost mode is appended); every value
  remains exact, and the immutable file is unchanged.
- Current prompt paths:1 each in735,793,1004 provenance and1004 reader;3 End Phase
  persistence and3 shape tests. They answer ordering explicitly and assert11
  where the producer ran. The7-step prompt sequence includes both owner choices.
- Archived replay suffixes:13 OPT1004,4 OPT966 future-phase and1 OPT966 final
  corpus. They explicitly choose the former FIFO order. OPT1004 keeps GameSession
  routing and persistence, aliases generated IDs consistently, and asserts the
  exact added prompt-ID counter delta. New prompts clear undo by existing policy;
  a formerly continuous ending action is no longer logged into the next turn,
  consuming one fewer logical timestamp. All other gameplay, queues, ownership,
  source snapshots and event ordering remain compared against frozen archives.

No production bypass, test-only engine flag, archived payload rewrite,971
compatibility repair, or new worker/session creation is included.
