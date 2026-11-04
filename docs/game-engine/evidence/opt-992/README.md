# OPT-992: exact two-removal feasibility

Base: `0bc10b57dc227c5d6c25e66356e7adf8ecc5778a`. OPT-969 mode8 structural
printed-cost feasibility is already delivered at this base. This change keeps
that contract and adds an exact solver before enumeration; it adds no budget,
persisted data, writer capability, replacement decision, or legality heuristic.

## Scope and proof

For two numeric positive selection costs removing cards from the same zone,
let P be the first cost's candidate IDs, k its amount, m the second amount.
Let S be all original zone cards satisfying the suffix predicate with the
post-prefix scalar counts, before subtracting the selected prefix identities.
The first payment can remove at most |P minus S| expendable cards. It must
therefore consume at least max(0, k - |P minus S|) suffix matches. Choosing
expendable cards first attains that minimum. A complete sequence exists
exactly when |P| >= k and |S| - max(0, k - |P minus S|) >= m.

This argument is independent of enumeration order. The representative first
payment supplies scalar values only; it is not used as a witness. A scarce
suffix match removed by that representative is still counted in S, and the
intersection formula decides whether another choice can preserve it.

The admitted costs are hand trash/deck placement, trash deck placement, and
own Character KO/trash/return to hand/deck/Life. Destination order is not read
by admitted filters. `computeCostTargets` computes P. A real
`applyCostSelection` supplies the post-prefix state, preserving the engine's
mode and destination rules; a changed removal count falls back. All candidates
must be owned/controlled by the payer and have no attachments. Each admitted
payment therefore changes the relevant scalar counts by the same amount,
regardless of the selected IDs. Surviving cards keep identity, zone, state,
printed data and DON count.

S uses the same `matchesFilter` interpreter as `computeCostTargets`. Field
suffixes have no additional fixed-source requirement. Their only extra gate
is removal protection, and the solver requires an empty prohibition array.
`exclude_self` is applied to S exactly as in the target helper. EITHER and
OPPONENT field domains, compound source costs, named play, DON payments, REST,
Life-to-hand and choices are not admitted.

The filter-key/value-source allowlists are closed. Cost/power GAME_STATE
values admit the existing filter interpreter's hand/deck/Life/DON scalar
sources. RESTED_CARD_COUNT is allowed only outside field prefixes. Identity
counts, nested alternatives, reference reads, keyword/effect queries and new
keys fall back. DON-given nested values receive the same source check, although the existing
shared matcher treats a nonnumeric DON-given value as zero; that test row is
a compatibility control, not proof of dynamic DON-given support. Actual
DON-dependent power thresholds use the interpreter's `DON_FIELD_COUNT`.
Active effects and prohibitions must be empty. Hand cards with permanent `zone: HAND` blocks containing `MODIFY_COST`
fall back because these self cost changes are not necessarily registered in
activeEffects. This is the exact block shape inspected by
`getHandZoneSelfCostModifier`: other authored blocks cannot change that read.
The guard deliberately ignores conditions and amount, conservatively retaining
full search for every potentially relevant block. Ordinary injected authored
schemas remain eligible; the paired harness uses actual OP01-025 definitions. No new interpretation of the filter interpreter's
DON_FIELD_COUNT (cost-area count) is introduced.

The actual admitted `applyCostSelection` cases directly call `transitionCards`;
they do not dispatch triggers or scan replacements. Transition cleanup filters
activeEffects, prohibitions and triggerRegistry; only the first two can affect
these candidate reads and they are guarded empty. triggerRegistry, emitted
events, RNG and allocated successor IDs are not read by the admitted filters.
Actual replacement execution remains owned by the existing scanner/payment
flow. Mode8 feasibility models the printed sequence; replacement completion
never supplies a suffix resource. Unsupported replacement/choice producers
retain the oracle search.

The rule basis remains repository CR 8-3-1-1 (printed order), 8-3-1-3 (full
payment), and 3-1-6 (new identity after field movement), with the existing
[mode8 interpretation](../../MODE8-COST-SEMANTICS.md) and
[zone transition contract](../../ZONE-TRANSITION-CONTRACT.md). This is an
algorithmic equivalence proof, not a new rules interpretation.

## Consumers and authored exposure

One public `isCostSequencePayable` contract still serves availability via
validation, direct validation, `canOfferTrigger`, optional resolver gates, and
cost orchestrator sequence/branch/payment gates. No consumer is redirected to
a separate approximation. `isCostSequencePayableWithoutPrune` bypasses both
prior necessary-condition prunes and the new solver.

The recursive authored-cost survey remains unchanged and fails closed on
nonnumeric selection amounts. At this base it inventories 2,474 schemas and
23 selections before a suffix. Only OP17-038 exceeds two cards: its pinned
REST_CARDS 3-of-7 branch has 35 combinations. The rows are EB02-047, EB03-062,
OP02-048/092, OP04-050/055/111, OP05-021/045, OP06-043/079, OP07-058,
OP09-060/089/099, OP10-056, OP11-024, OP13-007, OP17-038 (three branches),
ST06-012 and ST25-004. No authored gate was relaxed to ship this optimization.

## Evidence and limits

`opt-992-two-removal.test.ts` checks 2,970 complete small-state comparisons
against the unpruned oracle across modes6/7/8, all admitted prefix/suffix cost
type pairs, restricted prefix pools, dynamic cost/power GAME_STATE predicates,
DON-given predicates and source exclusion: 1,068 payable and 1,902 rejected.
Every comparison asserts caller-state purity. Independent scarce-match and
forced-overlap controls pin the cardinality proof. Adversarial field attachment
and rested-count examples require the complete fallback because a different
prefix identity makes the suffix payable.

`opt-961-scale-harness.test.ts` adds paired copy-calibrated C(20,8)=125,970
hand/trash dynamic-filter failures with ratio ceiling60. The earlier 6,500
filter/prohibition oracle comparisons, 500 resource samples, mode8 exact-DON
suite, authored survey and four-consumer scale harness remain enabled.

Supported two-cost families have O(state-copy + zone-size * filter-evaluation)
work plus linear inspection of candidate schema blocks, independent of C(n,k). **There is no general hard runtime bound for
arbitrary schemas.** Unsupported effects, protections, attachments, dynamic
identity reads, heterogeneous zones and longer sequences still enumerate
completely. The authored survey gate must remain in place; any new exposure
requires its own scale scenario/proof before admitting it. Extending this
closed family or adding a sound state-key quotient is follow-up work, not a
claim made by this PR.

## Review strengthening

The paired harness uses twenty actual OP01-025 instances with injected authored
schemas; a separate 33-case mode/filter oracle matrix proves ordinary schemas
remain admitted. A hand permanent MODIFY_COST fixture demonstrates why the
precise self-reduction guard remains necessary. Independent controls cover a
numerically eligible excluded source, stolen Character destination ownership,
EITHER/OPPONENT field domains, and a DON_FIELD_COUNT threshold whose result
changes when the cost-area count changes from three to four. Mutations dropping
exclude_self, ownership, field-domain and self-modifier guards all fail; restoring
the former blanket schema guard also fails the authored-hand admission test.
The OPPONENT-domain mutant still falls back via the post-payment count defense;
the EITHER-domain counterexample is what kills the combined domain mutant.
