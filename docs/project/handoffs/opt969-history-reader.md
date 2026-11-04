# OPT-969 bounded history ownership reader

Base: `864bee2b9282004aa46476462447a0aa57b28686`. Actual frozen writer:
`f19da7bb59aa4ef30185ed1d0f029a87c7fe3a3c`. Known failing deployed691 reader:
`69125276e1bb4a1eba7ea2170056cd392b02885b`. This candidate remains reader-first:
ordinary setup retains absent runtime provenance interpreted as6, and Repository
writes6. No ordinary7/8 promotion, writer checkout modification, merge, deployment
or production repair is part of this implementation receipt. The coordinator
owns independent review, full verification and deployment readiness. Once this
reader is deployed and verified, merge repaired main into PR783; do not rebase
or force-push its preserved history.

## Defect and independent expectation

Actual f19 authored ST04-016 publishes `USE_COUNTER_EVENT` at timestamp14 after
the COST staged projection was captured. The staged turn lacks that record.
Main and actual691 accept its DON/target replies but replace the newer history
with the staged turn. The real `ACTIVATED_EVENT` condition changes true→false.
Successful payment must retain exactly one published activation, its original
controller/card/type/cost/timestamp, and still return the selected DON, trash the
Event once and give +4000. These expectations are asserted directly, without
using writer/new-reader equality. ST04-016 costs1; this fixture does not establish
natural reachability of OP15-002's base-cost3 condition.

The test reproduces RED against untouched base production files before applying
the implementation patch, then GREEN on the new reader. The same committed fresh
f19 fixture independently reproduces RED on actual691. Old writer full correctness
and SPEC findings remain in the cumulative run record; this repair does not erase
or reset those findings.

## Ownership inventory and publication contract

| Projection | Ownership after repair |
|---|---|
| `players` | Exact staged payment / exact baseline rollback. Existing narrow presence patch remains. No live player copy; identities, zones and allocations stay cost-owned. |
| `turn.actionsPerformedThisTurn` | Dedicated validated staged entry chooses the longer exact structural prefix. Publication retains B, carries only append-only B→L evidence into staged S, then refreshes root. Exact rollback excludes transaction-only history. |
| All other `turn` members | Existing staged/baseline ownership: battle, phase, player indices, once-per-turn, deck-hit-zero, extra turns and trigger-staging IDs are unchanged. |
| `activeEffects` | Exact staged/baseline ownership; source exit and moved-DON cleanup remain existing logic. |
| `prohibitions` | Exact staged/baseline ownership plus existing narrow `stagedProhibitionView`. No new union. |
| `scheduledActions`, `oneTimeModifiers`, `triggerRegistry` | Exact staged/baseline ownership; no copy from published resources. |
| Outside projection | Existing live stack/prompt, event log, execution context, terminal/winner metadata. Cost refs/counts/IDs, accumulated events and propagation flags remain owner data. History retention does not re-emit an event or allocate IDs/timestamps. |

`applyCostTransactionState` remains exact. Only the primary payment-view entry in
`resume/cost.ts` calls the new staged-entry helper. Every baseline/restoration
call remains exact. All root comparisons still include history and resources
and run before merge, replacement processing or prompt consumption; direct COST
entry now validates every expected owner, matching prompt-lifecycle prevalidation.

The helper gates on native cost capability7 (7 or8/mode7), actual expected-root
and staged evidence. Missing historical evidence stays absent and conservative,
including the known historical rested-prefix rejection. No root/outcome inference,
persisted shape, generic live-history ownership, sorting or timestamp deduplication
is introduced. Ambiguous historical divergence rejects without changing input.

Sanctioned publication retains old expected root B and compares its history with
live L before refreshing evidence. If B prefixes both divergent histories, publish
staged history as `L + S.slice(B.length)`: committed records precede transaction-only
records, preserving exact bytes and each original stream's relative order. An
exact L prefix already present in S is the idempotence gate. A second publication
inserts its new committed suffix before remaining staged-only facts. This placement
was explicitly adjudicated by the coordinator after a synthetic staged-only test
showed that appending L after S would violate the staged-entry prefix invariant.

`runPipeline` adds narrow new-owner publication; Coordinator also handles later
session cleanup for new IDs only. Successful prompt lifecycle refreshes surviving
owners only after input prevalidation and moved-DON cleanup. Missing staged evidence
fails closed at publication. A valid current producer outside this contract is a
STOP/design question, not permission to reject valid play or broaden the merge.
No such unsupported current producer was observed in the executed matrix.

## Acceptance map

| Required risk | Executable evidence |
|---|---|
| Actual authored history/query/payment | `opt-969-history-reader`: frozen f19 public pipeline capture → real Repository/Coordinator → DON reply → save/reload → target; exact activation once, query true, selected donor once, Event trash once, power9000. |
| Live/staged extension and publication ordering | `opt-969-history-ownership`: both prefix directions, preserved staged resources/once-per-turn; divergent B streams, repeated publication/idempotence; exact rollback excludes staged-only record. Synthetic controls, not producer-prevalence claims. |
| Actual KO publication | Fresh f19 `positive-ko-decline`: exact `CHARACTER_KO` history once and `CARD_KO` log once, plus independent resources/completion. Cost helper itself returns PendingEvents; history is appended by actual emission. |
| Repeat/branch/new owners | Fresh f19 repeated DON, branch, choose-one, nested trigger/parent and selected-prefix trigger cases; start every producer boundary, then reader creates/saves/reloads all remaining pauses. |
| Replacement decline/accept/child/abandon | Fresh f19 fixed decline/accept and accepted DON-prefix rollback. A separately labeled synthetic staged-only record injected into actual accepted replacement is preserved privately through child reload, excluded on abandon, and leaves one once-per-turn replacement marker. Existing Decision10 suite stays unchanged. |
| Exact resources, refs, aura and moved-DON cleanup | Fresh fixed REST_DON prefix and held-DON cases, immutable82-scenario replay (including all historical fields/refs), expected-root suite, `opt-869-give-don-attach-prohibition`, `opt-792-mixed-pool`, sequential cost and prohibition-timing suites. |
| Terminal dominance | Fresh last-deck `terminal-cost-suppresses-don`; existing owner-depth, transactional cost and `opt-960-terminal-stops` controls: no prompt revival or later effect payment. |
| Stale/wrong/duplicate replies | Explicit Counter history/resource mutations reject unchanged before merge; existing expected-root tests cover player/prompt/identity/duplicate/under/over guards; actual GameSession duplicate target reply rejects with unchanged final persisted state. |
| Missing historical evidence | Existing expected-root absent-field/resuspension/reload and canonical corpus controls, plus helper absence/ambiguity/missing-staged controls. |
| Live, separate and embedded undo | Counter tested live plus first/later separate and first/later embedded entries, restored through real Repository and Coordinator UNDO from a legal synthetic live wrapper. This is storage/reader proof, not a claim that Counter play itself is undoable. Old corpus also exercises every storage context. |
| Actual Durable Object routing | One focused case in existing `opt-554-session-authorization` harness consumes frozen f19 Counter DON reply, persists/recreates GameSession, consumes target, asserts query/history/resources/power, then rejects duplicate. No routing mock or duplicate mock harness. |
| Capability and writer conservation | Explicit public7, public8/mode7 and public8/mode6 Counter controls preserve envelope/mode. Ordinary actual setup remains runtime legacy6 and direct Repository reload is6. Existing native8 replay and provenance controls pass. |
| History consumers | Existing performed-card, attacked-source, CHARACTER_KO, nested Event, Counter and authored OP16 FAQ/until-count suites; canonical ST04-016 and repo v1.2.0 rules8-3-1/8-5-4 read. No global rules migration. |

## Fixture provenance and reproduction

New fixture directory:
`workers/game/src/__tests__/fixtures/opt-969-history-reader/`.
Its manifest pins actual f19 production sources, capture/support sources, seed
recipe hashes and every payload SHA256. It contains **13 payloads**: one Counter
snapshot plus **12 producer recipes**, totaling **41 recorded action steps**.
Starting at every recipe boundary executes **95 continuation actions** in one
storage context; separate Counter/undo/WS controls are additional and not multiplied
into that count. No historical82-case payload, manifest or archived source changed.

The twelve captures execute f19 freshly from immutable historical synthetic
initial card/resource definitions and reply recipes. Initial definitions are
input seeds, not expected end states. The reply uses its freshly issued prompt ID;
relevant card/DON IDs and events are never normalized. Default CI is self-contained.
An opt-in `OPT969_HISTORY_PRODUCER_ROOT` must point to exact f19 and validates its
source hashes. `OPT969_HISTORY_CAPTURE=1` writes only this new directory. Run
explicit test paths with `pnpm --filter optcg-game exec vitest list` before `run`.
For actual691 negative control, select only the first Counter test with
`OPT969_HISTORY_READER_ROOT=/private/tmp/pr778-followup` and
`-t 'actual f19 Counter publication'`. Expected result is the documented RED.

## Validation baselines and results

- Initial dependency disappearance was an external environment change; coordinator
  restored run-owned frozen-lockfile dependencies/COW copies. First collection
  could not find Vitest; no source was changed to address the environment.
- First fixture setup omitted canonical `[Counter]` display text and was rejected
  by validation; corrected to canonical ST04-016 text. Base RED then established
  actual history deletion. The initial explicit runtime6 assertion was corrected
  to main's absent-provenance/legacy6 baseline; Repository output still asserts6.
- Initial staged-only unit expectations exposed publication placement ambiguity;
  coordinator adjudicated committed-prefix order. All revised mechanism tests
  pass; no continuing serial current-producer patch loop occurred.
- Focused **26 files: 1,405 passed, 3 expected failures**, exit0. The expected failures
  are unchanged P-059 OPT912 and OP08-019 Main/Counter authored gaps. Explicit paths
  and selection are in the coordinator's `work/history-reader/focused-paths.txt`
  and `focused-list.log`; run in `focused-run.log`.
- Final default four-file delta **63 passed**, exit0, then added separately labeled
  staged-only abandonment and reader-root opt-in: two-file delta **24 passed**,
  exit0. Final Counter identity/event-once strengthening reran the same two files:
  **24 passed**, exit0. Source-exit/moved-DON/terminal risk delta **6 files, 122 passed**, exit0.
- Actual691 Counter negative: **1 failed, 9 skipped**, exit1, exact lost activation.
  Both reader-new GREEN and negative checks use independent expectations.
- Worker TypeScript exited0. Targeted ESLint across all9 changed TS files exited0:
  no errors,3 pre-existing unused-variable warnings; the one newly introduced
  unused prompt binding was removed. Actual frozen-source pin test exited0.
  `git diff --check` passed; tracked historical fixture/archive diff is empty.
  Full `pnpm verify`, independent reviews, mutation
  checks, CI, merge and deployment are coordinator-owned and not claimed here.

## Follow-ups and limits

Resume PR783 only after verified reader deployment, merge repaired main into it,
and replace its rollback-floor proof with that deployed reader plus actual fresh
and subsequent writer snapshot compatibility. Its prior691 floor claim is unsafe
for Counter history and is superseded by this defect receipt.

Final OPT921/948 domain/feasibility integration, authored corrections
EB02-061/OP12-070/OP15-069, OPT958 Decision10 policy, historical recovery/capture/
retirement, and project/parent closure remain excluded. Evidence is synthetic
under the explicit user-approved exception; no production reachability/capture,
UI/wire/layout change or VQA geometry claim is made.
