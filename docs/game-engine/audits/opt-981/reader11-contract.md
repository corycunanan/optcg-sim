# OPT-981 reader11 — End Phase obligation ordering

Base: main `0bc10b57dc227c5d6c25e66356e7adf8ecc5778a`.
This is the reader half. It does not enable version11 in production constructors
or promote8/9/10 into11. Current explicit8 producers can still advance to9
(field trash) or10 (scheduled provenance), exactly as before.

## Independent rule and card expectations

Rule 6-6-1-2 lets each step owner process multiple already-resolved end-of-turn
obligations in any order, with the turn player's step before the other player's.
The test drives authored OP08-074's activation and OP13-066's on-play resolver,
then the real ADVANCE_PHASE pipeline and prompt lifecycle. This is an authored
resolver/public-boundary reproduction, not a complete deck-play trace.

Start with 3 cost-area DON plus 1 attached to the Leader, against 5 opposing
field DON. Maria adds4 and schedules return-until-equal; Rayleigh schedules add1.
The pair produces two real scheduled entries. Maria then Rayleigh ends6 vs5;
Rayleigh then Maria ends5 vs5. Baseline changes insertion order to establish the
defect. Reader11 tests instead answer the offered ordering choice in each order.
The future11 envelope is synthetic; the two obligations are authored output.

`authored-obligations.json` inventories 17 END_OF_THIS_TURN SCHEDULE_ACTION
producers across 56 source modules / 2,474 schemas. Already-resolved obligations
must not be treated as new trigger activations: source negation, once-per-turn
and activation checks would invalidate their historical provenance.

## Persisted contract

Version11 adds `phaseBoundaryContinuation.awaitingOrder?: true`. It is present
only while an END_PHASE frame owns an ordering decision, at
TURN_PLAYER_END_OF_TURN or NON_TURN_PLAYER_END_OF_TURN, with at least two
remainingScheduledActions. That frame has phase AWAITING_PLAYER_CHOICE and
controller equal to the step owner. The pending PLAYER_CHOICE prompt names
that exact top frame and owner. Choices exactly enumerate the saved queue as
`end-of-turn-obligation:0`, `:1`, etc.; no skip/done choice exists. Existing prompt
IDs retain the stale-response boundary. Unknown fields, wrong stage, missing
queue members, wrong owner/frame, false markers and malformed choices reject.
Versions1–10 cannot carry the marker.

A reply removes precisely the selected queue entry, processes it with the
existing scheduled resolver, and parks the remaining queue under any action
prompt or nested work. Its completion returns to the phase owner. Two or more
remaining obligations offer another choice; one drains directly. Step expiry
and handoff occur only after that owner's queue drains. The implementation
reuses PLAYER_CHOICE presentation/routing, without feeding scheduled work into
the trigger activation executor. No new UI prompt kind or third trigger policy
is introduced.

Reader11 preserves imported11 live states and undo snapshots through save,
load, reply and handoff. Native costs, battle completion, scheduled source
provenance and independent field-trash mode retain the established8/9/10
behavior; explicit11 must carry the same cost/trash capability discriminators.
Lower-version inputs keep their historical behavior and writer envelopes.

## Rule 6-6-1-3 assessment

`expireDuringThisTurn` removes the turn player's due entries, then the other
player's, through `expireEndPhaseClause`. Each removal is a pure array filter
whose predicate reads fixed owner/duration/expiry and turn context. It emits no
event, runs no action, queries no effective card values, and publishes no
intermediate state. One-time cleanup then runs after both owners. Reordering
invalidations within a player's set cannot change the retained set or an
observable intervening action in the current engine. No extra choice is added
for this unobservable order. This does not establish that future on-expiry
callbacks or state-based processing between individual invalidations commute.
The existing until-end expiry after the owner's obligations remains unchanged.

## Reader-first rollout and writer plan

1. Merge/deploy this reader PR only after its validation and review gates pass.
   Record authoritative deployed worker version and commit. Replay11 live/undo
   locally against that exact deployed reader source/build; there is no remote
   saved-state import route. Do not infer deployment from merge status.
2. A separate writer PR activates11 at the End Phase obligation-selection
   producer boundary, before the first new prompt is created or saved. Preserve
   existing cost semantics and use current field-trash mode when lifting8/9/10.
   Historical ingresses keep their established validation/promotion path. Do not
   globally rewrite unrelated games or undo snapshots just to enable a prompt.
3. Capture actual writer-generated prompt and nested action states, plus mixed
   live/undo envelopes, and replay against this exact deployed reader commit.
   The synthetic11 reader fixtures are not that future writer corpus.
4. Roll back the writer only to this verified reader-capable build. Imported11
   sessions keep their queue/choice semantics and can finish; older builds reject
   the new envelope. Reader deployment remains a mandatory external gate.

## Validation and follow-ups

Focused suite: authored outcomes, both player seats, non-turn-owner step,
continuous three-obligation ordering, nested action prompts, per-prompt reload,
saved undo restoration, actual coordinator UNDO, malformed ownership, mixed
8/9/10/11 snapshots and cost/trash discriminators. Existing End Phase persistence,
expiry, v10 scheduled-source and writer-golden tests remain included.

Baseline new suite: 7 failures / 2 passes (future11 is unsupported, authored
insertion-order results pass); existing End Phase controls pass. Mutation gates
change selection to always use index0 and remove the persisted prompt-owner
check; each must make focused tests fail, then production code is restored.

Full verification results and review/deployment evidence belong in the PR body.
The writer is deferred until verified reader deployment; OPT-981 gameplay rollout
is not complete with this reader alone.
