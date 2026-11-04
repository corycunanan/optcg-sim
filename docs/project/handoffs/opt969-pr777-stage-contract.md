# OPT-969 / OPT-997 PR777 bounded continuation

This revision closes native7 parked COST stage/action compatibility and the
native7 amount DON rested-filter omission. Ordinary writers remain version6;
accepted Decision10 rollback, production repair/capture/retirement and historical
corpus payloads are unchanged. The normative stage table and scope limitations
are in `docs/game-engine/SAVED-STATE-COMPATIBILITY.md`, under “Native7 parked COST
stage/action contract”. No saved snapshot/offer target or zone authentication is
claimed for coordinated identity rewrites.

## Implementation and consumers

`replacement-replay.ts` classifies saved cost, arrangement flag, shuffle policy
and offered domain before validating an action. Only the four actual fixed
capture families accept the fixed sentinel. The legacy fixed target helper
retains its compound-hand membership: its only executable consumer is
`cost/orchestrator.ts`, including ordinary6; this membership is unreachable as a
canonical compound capture because the earlier compound branch handles payment.
The former exported fixed replay set had no consumers outside this parser.

The five canonical constructors are fixed exits in `cost/orchestrator.ts`, and
compound shuffle selection, compound arrangement, opponent Life placement and
generic field selection in `resume/cost.ts`. Repository ingress invokes the
same validator through `session/game-state-schema.ts`; the optional answer
boundary invokes it through `session/prompt-lifecycle.ts` before substitute work.
Only the fixed constructor needed its existing effectBlock passed explicitly.

The native7 amount DON executor intersects positive active/rested flags and exact
state; false flags impose no restriction, consistent with the shared filter
contract. It supplies both actual identity plans and replacement feasibility
(`replacements.ts` probes `executeEffectAction`, including exact identity-choice
branches). The general DON target resolver supports positive active/rested flags
but separately omits exact state; that broader behavior remains outside scope.

## Acceptance map

| Invariant | Evidence |
| --- | --- |
| All five capture sites, mandatory child, reoffer, later costs, accepted rollback, promotion diagnostics | Immutable original/corrected/canonical corpora, canonical/ready/outcome reader tests |
| All four fixed types; remaining generic field families; forced direct arrangement | Existing canonical corpus plus actual producer cases in `opt-997-replay-stage.test.ts` |
| Exact reported compound hand sentinel and selection sibling | Only action changed in canonical hand arrangement early/accepted states and real numeric-zero hand shuffle capture |
| Stage/shuffle/domain incompatibility | New stage tests run public SessionRepository live, separate/embedded undo first/later (index 0 beyond retention), and optional accept/skip boundaries; input/storage unchanged |
| Zero secondary selection and source-only arrangement | Actual native7 hand/trash producers with populated candidate zones, accept/decline, save/load and precise payment checks |
| Rested DON filters, printed actor, identity consumption, insufficient replacements | `opt-997-native-don.test.ts`, both selector spellings and both controllers, contradictory/false flags, ordinary6 control |
| Named hand vs Stage | Existing canonical control retained; no new identity authentication asserted |

Final focused selection: 10 files / 1,071 tests passed. Worker TypeScript and
ESLint for all five affected TypeScript files passed; `git diff --check` passed.
The final new stage file has 63 tests: against original e516968 production,
33 fail / 30 pass; final DON file has 12: 8 fail / 4 pass. Original production was
restored only for those red runs, then candidate bytes restored and verified.
Candidate focused selection above ran after all restoration/mutation exercises.

Three individual DON predicate deletions (active, rested, exact state) and four
replay mutations (noncompound stage guard, forced-domain guard, arrangement
shuffle guard, selection shuffle guard) were each killed by focused tests.
Logs use `/private/tmp/opt969-20261023-impl-*.log`. Full readiness/CI and bounded
independent assessments belong to the coordinator; this handoff claims neither
merge readiness nor an ordinary writer rollout.

## Bounded runtime guard repair delta

Independent review of ee86b9a found that the in-memory optional-answer guard
relied only on phase-derived kind: changing a retained COST owner's phase to
AWAITING_TARGET_SELECTION skipped validation and allowed substitute DRAW work.
This was a corrupted-memory-only boundary failure; persisted ingress already
rejected the shape. The repair invokes the existing strict validator when the
caller has derived COST kind, explicit COST kind, or retained replacement cost
metadata. It does not expand general frame ownership semantics.

`opt-997-optional-caller.test.ts` checks accept and skip with phase-only,
kind-only, unchecked, missing replay and untyped phase corruption, requiring a
rejection before effects and unchanged input. Valid ordinary6/native7 answers
remain controls. The final 14-case file against ee86b9a fails 4 / passes 10;
with the repair all 14 pass. Seven focused files / 1,110 tests pass, including
actual canonical corpora and legitimate battle replacement callers. This delta
is within the same bounded full-plus-delta assessment; no review budget reset
or legal-producer save/load exploit is claimed.
