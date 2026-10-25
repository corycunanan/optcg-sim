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
