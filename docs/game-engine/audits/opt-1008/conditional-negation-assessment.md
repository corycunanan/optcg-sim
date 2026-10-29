# OPT-1008 — bounded conditional negation contract

Original assessment base: `main` at `0bc10b57dc227c5d6c25e66356e7adf8ecc5778a`.
Integrated review base: `main` at `0d902815eec39da26ecb46fbc5b294e0983246e5`.
The initial assessment/reproduction was committed as 265fde08. On 2026-10-28 the
user accepted **apply-once semantics for self-falsifying conditional permanent
negation, matching the existing OPT-242 cost precedent**, with mutually dependent
multi-source conditional cycles deferred to an ordered permanent-effect processor.
This document replaces the initial blocked assessment; it does not claim a new
card-specific Bandai FAQ or a general fixed-point solution.

## Independent expectations and scope

Rules 8-1-3-3 and 8-1-3-3-2 require permanent effects to be valid and conditioned.
Rule 8-1-3-3-5 specifies turn-player then non-turn-player processing, player choice
within each group, and repetition if application changes the state. Its sequential
processing is not a simultaneous Boolean fixed-point equation. The user-approved
policy supplies the self-falsification interpretation: inspect the pre-negation
state while that card's negation decision is in progress, and apply the resulting
negation once in that query. This matches the engine's include-once treatment of
self-falsifying cost thresholds in OPT-242. External changes remain independently
observable on the next root query; no result or negation is cached across queries.

The synthetic reproduction adds CARD_ON_FIELD requiring a printed Rush Character
to Roger's aura, with exactly one nonexempt Rush ally. The condition initially
holds; applying the aura removes its own witness. Expected public negation is
true, effective Rush false, and same-turn attack eligibility false under the
accepted policy. The test repeats these public entries to detect entry-order or
stale-result errors. Additional tests cover target keyword filtering and effective
power/cost conditions re-entering source-negation queries.

SET_POWER evaluates its own target and condition eligibility against a shallow
state view excluding its own setting. Its source-negation query observes the real
root state instead: the setter's pre-negation output can witness a conditional
negation, which applies once and suppresses that setter. Thus a printed 4000 ally
with its own 5000 setter and a synthetic base-power-at-least-5000 negation condition
reports negated true and effective power 4000, regardless of query order. The
setter's own eligibility still cannot bootstrap from its own output. Existing
SET_POWER precedence, self-exclusion and authored base-power controls remain in
the focused suite; this does not redefine numeric layering.

Rule 8-2-3 preserves already-resolved effects. The existing resolved-flag loop still
precedes the permanent-aura visiting guard. Authored OP13-064 remains unconditional
and its Roger Pirates/opponent exemptions are unchanged. Source negation and source
removal still disable its permanent aura. An independent opponent Rush witness
activates a synthetic condition and removing that witness deactivates it.

## Query context and lifetime

Previously only direct source-aura traversal shared a visiting set. Effective
keyword/filter/condition callbacks and effective power/cost readers re-entered
public isCardNegated with fresh guards, reproducing RangeError.

Each synchronous root negation query now owns one visiting set. Nested calls
adopt it when exact state-root identity and cardDb identity match. Internally
created SET_POWER eligibility views are explicitly aliased to their parent root
in a WeakMap, so they share the guard without retaining the temporary view. An
independent shallow or structured-clone snapshot, another game or a different
cardDb gets a separate scope even when card instance IDs match. A synchronous
reentrant query can find its ancestor scope through an intervening independent
scope. A finally block removes each root scope on success or error; the existing
per-card finally removes visiting entries. No context survives a root call and
there is no cache, persisted field, global cross-game result, or async lifetime.

The exception-cleanup test checks fresh guard allocation after a nested exception,
not merely a repeated Boolean result (a leaked empty set could mask retention).
Four reentrancy controls independently inspect another snapshot/database during an
active query and require its own true result. A broad module-global guard would
incorrectly return false for those cases.

## Authored consumer inventory

Loaded every exported schema from 56 authored set modules with
collectExportedSchemas, covering 2,474 schemas. Exactly one modifier producer uses
NEGATE_EFFECTS: OP13-064 / OP13-064_negate_effects in op13.ts. It has no block
condition, block duration or modifier duration. Its target filter is only
traits_exclude:["Roger Pirates"]. **Zero authored conditional permanent negation
producers** were found. NEGATE_EFFECTS action producers write resolved flags and
are a separate contract. All new conditional fixtures are explicitly synthetic;
there is no claim of current-card conditional reachability. Registration already
supports copying authored block conditions, so this is not mutation-only schema
support even though tests use a runtime aura to isolate the query boundary.

## Validation and limitations

The initial public-query regression reproduced Maximum call stack size exceeded.
Existing authored/source/exemption/resolved-flag baseline: 2 files, 61 tests passed.
The final focused suite adds condition, target, numeric, independent-witness,
exception-cleanup and isolated-root controls plus existing OPT-242 cost tests.
The PR records exact final counts, decisive context-loss/cleanup mutations, and
Large verification results.

Mutual multi-source conditional negation remains a documented engine limitation:
reentry-false can differ from player-chosen sequential processing. The existing
source-only fallback already shares that limitation. This change does not build
an ordered processor, add player choice, broaden schema admission, or emit a new
runtime exception. Cyclic conditions on resolved NEGATE_EFFECTS_FLAG durations
are outside this permanent-aura contract. A resolved flag whose WHILE_CONDITION
probes its own effective keyword still overflows because flag evaluation precedes
the visiting guard. This is pre-existing and has no authored producer; it needs a
separate follow-up defining resolved-duration cycle semantics before changing the
flag-first contract. No runtime fix for that route is included here.

Follow-up: a separate ordered 8-1-3-3-5 processor must specify mutually dependent
multi-source outcomes and choices. Any asynchronous query API must replace this
synchronous scope lifetime explicitly rather than holding the context over await.
