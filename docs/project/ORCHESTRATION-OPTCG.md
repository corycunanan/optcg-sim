# OPTCG verification for orchestration

Read for engine, authored card schemas, game protocol, or board changes. This supplements the [charter](./ORCHESTRATION-CHARTER.md); select scenarios affected by the diff rather than running an exhaustive checklist for every card.

## Rules packet before implementation

Use `docs/rules/RULE-INDEX.md` to locate exact sections in `rule_comprehensive.md`. Read the affected card's canonical text in `docs/cards/`, relevant official FAQ/errata, and the corresponding engine/spec sections via `docs/game-engine/README.md` and `RULES-TO-ENGINE-MAP.md`. Record card IDs, source URLs/paths, rule sections, version/date, and the interpretation being implemented. Verify current official sources when a ruling/version is uncertain or the ticket concerns newly released/changed text. Missing applicable rulings are uncertainty to resolve, not permission to invent behavior.

Card text and applicable official rulings determine expected behavior. Internal schemas, existing code, local indexes and passing tests do not override them. Record discrepancies between the repo's supported rules version and current official rules; do not silently migrate the whole ruleset inside a card ticket.

Translate each relevant clause into a compact table:

| Card/rule clause | Condition and evaluation time | Cost/payer | Target/chooser | Timing/continuation | Observable result | Test/evidence |
| --- | --- | --- | --- | --- | --- | --- |

Keep owner distinct from controller, activation distinct from resolution, costs distinct from effects, printed values distinct from effective values, and K.O. distinct from other zone movement. Read the existing domain definitions; add terminology only when it resolves a real ambiguity.

## Scenario selection

For each changed behavior, cover a normal execution, its closest illegal/negative case, and the boundary or continuation most likely to break. Add interactions based on the changed shared mechanism:

| Mechanism | Questions the scenarios must settle |
| --- | --- |
| Costs and conditions | Who pays? At what point is each condition checked? What if payment is impossible, optional, declined, interrupted or only partially selectable? Is a cost being confused with a skippable effect action? |
| Targets and choices | Who chooses and controls the target? Which zone, type, name, count, power or cost constraints apply? What do zero and “up to” mean for this exact text? What happens if identity/eligibility changes before a response? |
| Effect chains | Does a later clause depend on successful earlier execution? Does it observe newly drawn/moved cards? Is ordinary “and” being incorrectly interpreted as simultaneous? Consult `docs/game-engine/AND-CHAIN-AUDIT.md`. |
| Triggers and replacement | What is the event and source identity? When are effects queued/resolved, who orders them, and what happens when a prohibition, replacement or nested choice intervenes? |
| Zone transitions | Use `docs/game-engine/ZONE-TRANSITION-CONTRACT.md`: fresh identity, transient-state cleanup, ownership, attached DON!! disposition, ordering, capacity and leave-zone events. Check the cause of movement as well as destination. |
| Continuous effects and duration | Which printed/effective values apply? When are effects recomputed or expired? What happens when the source leaves, changes controller, or is invalidated? |
| Damage and battle | When does processing pause for Life/Trigger choices? How do affected keywords, battle-zone changes and defeat checks interact? |
| Protocol and visibility | Can duplicated, late, wrong-player or superseded prompt responses mutate state? Does disconnect/reconnect preserve the continuation? Can either player's payload reveal hidden card data? |

Do not assert a universal answer from this question table. Derive each expected outcome from the exact supported rules and card text.

## Test at the boundary that owns the behavior

- Engine/card execution: exercise the actual action pipeline with registered authored schemas and complete pending selections/costs. Assert final zones, resources, identities, events and prompts against independently derived expectations. Helper tests alone do not establish playable behavior.
- Session/protocol changes: exercise `GameSession` message/action handling for identity, authorization, ordering and reconnect behavior. A pure resolver test cannot prove the WebSocket boundary.
- Board/prompt changes: inspect the live app for legal choices, decline/zero-selection states, keyboard/focus, stale prompts, and both players' visible information. For layout changes re-run visual verification after fixes; class-string assertions cannot establish geometry. Apply current branding tokens and scaled-board legibility rules from AGENTS.md and the branding guidelines.
- Pure schema/data changes: lint/parity checks plus execution of affected semantics. Do not count an action-type allowlist or inventory entry as proof that a particular card works.

Use the smallest reproducible state. Show red-before-green for a bug fix and retain the regression. For a decisive guard, temporarily disable it in isolated scratch work and verify the claimed test detects the fault; restore and verify tracked contents afterward. Do not derive expected results with the same helper under test.

## Shared impact and scheduling

Inventory actual authored consumers whenever shared handlers, trigger matching, targets, dynamic values, cost resolution or continuation logic changes. Walk nested schemas through existing registry/inventory utilities; text grep alone can miss generated or indirect consumers. Record the changed mechanism, consumer inventory command/result and representative scenario families. Use existing schema lint, source parity, action/trigger coverage and zone contracts before inventing new infrastructure.

Sequence shared support → one representative card proven end to end → independent card-family batches → affected interaction verification. Two tickets editing the same handler/contract belong in one serialized track even if they concern different sets. Pure encodings using established semantics can run independently with separate ownership fences. Keep broad semantic migrations separate from incidental cleanup.

## Review deliverable

For every material finding or safety claim provide: card/rule source, minimal starting state, action/choice sequence, expected result, observed result, source location, evidence level, tested SHA and command/artifact. Label source-only reasoning as unproven; label missing tests or tools as incomplete. A passing test with a mistaken rules interpretation is not a successful rules review.
