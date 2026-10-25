# OPT-1006 / OPT-1001 final field-trash writer

Base and minimum rollback floor: deployed reader PR788 merge
`d8309e70fef64a133ce19d8a2bd327bb625e56fb`, post-CI40146203962/job121027969857
success, worker40146203910/job121028007839 deployment
`bd251100-440e-40f8-b381-302f0a3db6f2`. This writer does not support rollback to
05d02e88, which rejects9. OPT-998 is delivered by the reader; OPT-997 was already
delivered under OPT-969. Neither is reimplemented.

## Candidate and producer contract

The sole runtime delta from the floor is in `executeTrashCard`: explicit
schema8/costSemanticsVersion6|7|8 or retained9 may use the existing field-trash
route; selected field Characters cause a new `{ ...state, schemaVersion: 9 }`
before filtering/scanning. No-match/synchronous and selected prohibited cases
promote; hand-only/zero-selection and setup remain8. Setup remains mode8.
Raw historical source6/7/undefined pipeline callers retain old behavior. Shared
validated Repository/Coordinator ingress proves their8/mode7 promotion before
writer execution. The trash site does not infer modes or migrate continuations.

The source/generator producer is
`a529eebceb5b6a933734403d695829335ebb7653`. Later evidence/contract changes preserve
that runtime and generator. Final candidate SHA is supplied in the run ledger
when the coordinator freezes its snapshot. Fresh independent full+delta SPEC
and correctness assessments are required for this writer stage. Prior reader
assessments remain historical and do not consume this stage's budget.

## Criterion map

| Criterion | Evidence |
|---|---|
| Actual setup8/mode8 → authored Beckman/Koby accept/decline; payment three Trash→deck bottom, Navy stays | `opt-1001-field-trash.test.ts`; setup helper originates at `buildInitialState`, Coordinator/pipeline/lifecycle and Repository reload |
| Explicit8 cost modes6/7/8 retained; negative non-Navy, base>7k, resource shortage/no sibling funding; ordinary no replacement | Source8 authored cases, transition tests and exact corpus replays |
| Group ownership during payment; no CARD_KO, owner/source and OPT-885 counts; self-trash without recursion; Brook branch/rescan | Same authored suite plus unchanged reader route and `opt-885-this-way-action-counts.test.ts` |
| Hand-only/zero target stay8; selected prohibition scan promotes synchronously; immutable original state | `opt-1006-trash-contract.test.ts`, `opt-1006-transition.test.ts` |
| Only scalar changes; exact IDs/RNG/events versus pre-native9 reference; rejected publication preserves input/undo | Transition tests compare complete result states and inject actual publication rejection |
| Historical raw callers unchanged, supported typed historical6/7 through shared validated ingress produces valid9/mode7 | Transition tests exercise direct pipeline, typed Coordinator and Repository/Coordinator |
| Actual synchronous9/live with actual pre8 undo; floor restores8 unchanged | Transition test saves real Coordinator undo and executes floor UNDO |
| First8→9 while COST payment is active | Synthetic grafted REST_DON→KO_OWN_CHARACTER selects authored OP08-045 Thatch; derived COST frame/phase before reply, authored self-trash substitute first activates9, stable9 after floor reload |
| Retained OPT-958 resource/use policy | Existing actual Oden/Ganzui COST accept/decline after promotion and synthetic Thatch case; earlier DON restored, use unconsumed, no post-cost DRAW4; Thatch trash/substitute DRAW1 persists |
| Scale and purity | Source8 authored128-Trash offer remains <1000ms; complete state equality with native9 reference includes allocator/RNG/events/input |
| Actual deployed reader floor replay | `OPT1006_WRITER_FLOOR_ROOT` selects actual floor Repository/Coordinator/lifecycle/GameSession; floor clone independently installed from frozen lockfile, clean detached HEAD checked before run |
| Reload and duplicate socket input | GameSession starts original8 target selection, actual final writer emits9, floor recreates each later reply; exact current reference storage/state, duplicate rejection without writes |

## Immutable corpus and applicability

Historical `opt-1006-writer-corpus.json.gz` remains sha
`053c26128aeb1e5fb68eb8e0f68d2b75c12365c62072b43bb70bd61bb50d824e`:
11 families,28 starts,22 native9 starts. All22 native9 suffixes still compare
complete exact final bytes. The six pre8 starts are independently saved choice
scripts with first prompt-ID discontinuity; they now run real final writer
through completion using authoritative live IDs with independent gameplay
assertions. No IDs/counters are normalized and no historical fixtures are retagged.

Separate `opt-1006-final-writer-corpus.json.gz` sha
`4b88df5f6f4dbcb37912896c7af6cffbe214bc39012556cdde04a31598d54b06` pins the
actual producer above, generator hash and a canonical save/load/reply chain:
11 families,28 starts,22 native9 starts. Its source8 replies and every9 suffix
compare full exact final states/events/IDs, including new final-writer output
loaded by the actual floor. The canonical producer checks independent zone/card
and event-type expectations against the compact authored rig; compact rig paths
without reload can allocate different IDs, so its bytes are not substituted for
canonical output. The manifest includes reproduction commands. Generated
synthetic minimal sessions are covered by the user's scoped exception; no
production capture or full-deck simulation claim is made.

The reader code, schemas, native9 continuation/feasibility/removal logic and all
historical fixtures are byte-equivalent to the deployed floor. The bounded
writer source diff changes only entry gating and immutable scalar activation;
unchanged native9 reader corpus/validation evidence remains applicable. New
writer checks cover the newly reachable source8 boundary and actual floor
interoperation separately.

## Validation and remaining gates

Baseline selection: `../opt1006-writer-baseline-selection.txt`; normal source8
baseline run: `../opt1006-writer-baseline-red.txt`,28 failed/82 passed in4 files.
Both OPT-1001 field gaps were converted from `it.fails` only after the source8
red baseline; unrelated expected debts remain.

Canonical producer capture:23 tests passed. Focused env-enabled actual-floor
selection: `../opt1006-final-writer-focused-selection.txt`; run
`../opt1006-final-writer-focused-floor2.txt`:8 files,241 passed and2 unrelated
expected-fail controls. Worker types pass. The added immutable manifest/generator assertions then
passed110 tests in `../opt1006-final-manifest-floor.txt`; worker types rechecked
clean in `../opt1006-final-writer-types3.txt`. Default CI/full verify uses self-runtime unless the
floor environment variable is explicitly supplied; it must not be mislabeled
as another actual cross-build run.

The failed attempts retained outside the repo are harness diagnostics: historical
non-contiguous prompt IDs, comparing reloaded vs non-reloaded derived frame kinds,
and a package CLI pipe EPERM (resolved with `node --import tsx`). No source
continuation/feasibility repair was introduced. The canonical capture was
regenerated after those harness fixes. Full local verification, fresh reviews,
exact-head CI and verified post-merge deployment remain completion gates.

## Follow-ups and policy

OPT-958 stays open. Accepted Decision10 restores earlier paid DON and leaves the
use unconsumed after replaced costs; rule-literal8-3-1-3-1 retains paid resources,
and applying10-2-13-5 use consumption specifically to replaced costs is an assumed
reading. Next review condition remains an applicable authoritative ruling or
payment/card change expanding authored reachability. The grafted Thatch activation
is synthetic and does not broaden authored-combination claims. No debt closure,
active-session repair, migration, merge, Linear write or self-approval is part
of this implementation stage.

## Full-gate expectation delta

The initial frozen-head `a17d7690c4bf63d1b81c6b63fe2fe26d3361aba0` full gate
passed lint, both type checks, bundle/schema checks,261 root files/2431 tests and
7 pipeline files/58 tests. Worker coverage found36 failures in3 retained replay
suites, with437 files/8380 tests passing plus9 expected debts and85 skips. Build
was not reached. Every failure was solely expected schema8 versus actual9; no
other byte, event, ID, counter, mode or gameplay difference appeared. The initial
receipt remains `../opt1006-final-full-verify.txt`; the coordinator's independent
493-transition diagnostic is retained at
`../evidence/writer-existing-corpus-diagnostic-a17d769.json`.

The bounded correction changes tests only. `opt-1006-envelope-expectations.ts`
asserts the specifically expected live/same-state-undo schema separately, then
compares every remaining stored byte exactly. It never changes a fixture or an
input. Expected capability is a static clause/action table, never inferred from
observed output, event or version:

- OPT-1007 abort-attack/block/counter execute their watcher Character-trash
  selection at global step1/2/3, in both cost modes. Only a replay starting at or
  before that producer step becomes9 after that step. Historical8 starts after
  the movement remain8.
- Thatch's authored SELF trash executes at Rayleigh pause0 reply1/pause1 reply0;
  two-instances pause0 reply0; group-then-nested-payment pause0 reply0;
  declined-prefix pause0 reply1/pause1 reply0; old-offered-ko/removal pause0 reply0.
  Group later pauses, nested-trash-watcher and declined-prefix pause2 already
  passed the movement and remain8.
- OPT-967 attack/block synthetic watcher replies explicitly produce9. The raw
  historical reference keeps old engine semantics; its comparison composes the
  known9 envelope and retained mode provenance explicitly.

With `OPT1006_WRITER_FLOOR_ROOT`, the original exact8 semantics replay separately
on actual d8309e7, while newly emitted9 states and subsequent replies compare
exactly between current writer and that floor. OPT-967 also saves/loads its actual
completed9 output on that floor. Its unrelated `OPT967_BASELINE_ROOT` branch is
explicitly a pre9 historical checkpoint-defect experiment, never a supported
writer9 rollback claim. Default CI runs the statically mapped current-writer
branch; actual cross-build evidence requires the env-enabled run.

Focused delta selection `../opt1006-envelope-delta-selection.txt` and env run
`../opt1006-envelope-delta-floor.txt` passed132 tests/3 files plus1 capture-only
skip; worker types passed. The additional OPT-967 exact8/final9 floor assertions
have their separate focused receipt. Runtime, producer/generator, all historical
fixtures and both writer corpus payloads are unchanged. Same-reviewer reserved
delta assessments and a new exact-head full gate are required after this change.
