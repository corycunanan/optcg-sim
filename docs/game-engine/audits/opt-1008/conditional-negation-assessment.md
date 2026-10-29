# OPT-1008 — conditional negation assessment (not an implementation)

Base: `main` at `0bc10b57dc227c5d6c25e66356e7adf8ecc5778a`.
Assessed 2026-10-28. No gameplay behavior changed. The regression is deliberately
red; this branch is not merge-ready and does not complete OPT-1008.

## Reproduction and independent expectations

`opt-1008-conditional-negation.test.ts` registers authored OP13-064 and one
non-Roger-Pirates printed Rush Character. It then adds a **synthetic** runtime
CARD_ON_FIELD condition requiring a Rush Character. The public `isCardNegated`
query raises `RangeError: Maximum call stack size exceeded`.

The observed route is `isCardNegated` → permanent modifier gate → condition
CARD_ON_FIELD → target filter effective keyword → `isCardNegated`. The last call
creates a new visiting set, so the source-aura traversal guard does not bound it.

Independent rule constraints, from `docs/rules/rule_comprehensive.md`:

- 8-1-3-3 and 8-1-3-3-2: permanent effects apply while valid; a conditional
  permanent effect requires its condition to hold.
- 8-1-3-3-5: permanent effects changing their own/other permanent effects' impact
  are processed for the turn player, then the non-turn player, with each player
  choosing order; repeat if the state changes.
- 8-2-3: already-resolved auto/activate effects are not invalidated by later
  effects. Resolved negation flags must retain that independence.
- `docs/cards/OP-13.md` OP13-064: the actual aura is unconditional and excludes
  Roger Pirates and the opponent's cards. The OP13-064 FAQ concerns its separate
  resolved power action and does not decide conditional-negation cycles.

For the exact synthetic fixture, let N mean the Rush ally is negated. With no
other Rush witness, the condition holds exactly when !N. The aura's source is
exempt, so its negation applies exactly when the condition holds: N = !N. Neither
Boolean assignment is stable. A recurrence fallback of false yields true for
negation while destroying the only witness that justified true. Returning true
on recurrence creates the converse problem. Neither is an independent rule
expectation. The existing source-only fallback is not a specification.

Acyclic conditions (e.g. turn identity, printed trait, independent opponent
witness) do have defensible Boolean expectations. They must remain supported if
the chosen policy only rejects cyclic dependencies.

## Consumer inventory

Loaded every exported schema from all 56 authored set modules using
`collectExportedSchemas`, covering 2,474 schemas. Exactly one modifier producer
uses NEGATE_EFFECTS: OP13-064 / OP13-064_negate_effects in `op13.ts`.
It has no block condition, block duration, or modifier duration. Its target
filter is only `traits_exclude: ["Roger Pirates"]`. **Zero authored conditional
permanent negation producers** were found. NEGATE_EFFECTS action producers are
resolved-flag writers and are a separate contract. No current-card reachability
is claimed for the new regression.

## Boundary assessment and alternatives

1. Share recursion context and return a Boolean on recurrence: bounds execution
   but invents conditional gameplay semantics; rejected as an implementation
   basis. Iterating a fixed point also oscillates for this fixture.
2. Share context and throw a named diagnostic: useful internal detection, but
   does not safely handle a supported action. `SessionCoordinator.executeAction`
   only catches writer-ingress errors; execution errors propagate. Replacing a
   RangeError with another uncaught exception is not acceptance completion.
3. Reject a deliberately unsupported class at schema admission: can prevent
   future authored/DB input from entering gameplay, but narrows today's schema
   support. Rejecting all conditions is broader than the actual cyclic case and
   loses safe turn/trait conditions. Target filters and WHILE_CONDITION gates
   also need analysis; keyword-only rejection is not a complete graph proof.
4. Add a structured dependency-query result and propagate it through all query,
   action, prompt, and visible-state boundaries: can represent an engine limit
   without claiming a gameplay Boolean. This requires an agreed product policy
   for the game outcome and a larger boundary change.
5. Implement ordered permanent-effect processing per 8-1-3-3-5, including player
   choices and a policy for nonconvergence. This is wider than a query guard;
   iteration order or arbitrary iteration limits are not a rules substitute.

Existing `terminateForEngineLimit` returns GameState and handles effect-stack or
resolved-action budgets. `terminateForEngineContract` likewise returns state;
its contract enum supports ACTION_HANDLER and REPLACEMENT_DISPATCH only. Neither
is a generic catch for pure Boolean queries, which also run for read-only views.
`registerPermanentEffectsForCard` has the source CardData but no whole cardDb;
it cannot evaluate a complete field dependency graph. Registration-only
rejection also does not cover the reproduced post-registration runtime mutation.

**Decision needed:** accept a specified unsupported-schema boundary, or authorize
structured nonconvergence handling / ordered permanent-effect evaluation. Do not
silently choose a Boolean or claim an exception rename is a safe gameplay fix.

## Validation

- Existing authored, source-negation/removal, exemption, and resolved-flag controls:
  `pnpm --filter optcg-game exec vitest run src/__tests__/opt-994-permanent-negation.test.ts src/__tests__/opt-1004-resolved-modifiers.test.ts`
  — 2 files, 61 tests passed on the unmodified runtime.
- New public-boundary synthetic regression: 1 test failed with the exact
  RangeError above. It asserts no exception and intentionally does not choose a
  Boolean answer for an inconsistent hypothetical effect.
- No green fix, mutation gate, or full `pnpm verify` run: implementation is
  paused for the contract decision. No PR has been created.

## Follow-ups

- Resolve cyclic dependency policy with explicit acceptance expectations.
- If implementing a query context, cover conditions, block/modifier durations,
  target filters, effective power/cost/attributes/grants, resolved-flag duration
  conditions, source traversal, and exception cleanup. Test query entry order
  and separate state snapshots, and avoid leaking ambient context across games.
- Preserve the 61 passing controls and add independent acyclic expected values.
- Run a decisive context-loss mutation and the full Large verification gate only
  once an accepted implementation exists.
