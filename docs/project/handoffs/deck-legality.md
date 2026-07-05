---
linear-project: Deck Legality
linear-project-url: https://linear.app/optcg-sim/project/deck-legality-03c2eba86dfa
last-updated: 2026-07-05
---

# Deck Legality — Handoff Doc

Consume card-driven deck-building rule modifications already encoded in `Card.effectSchema`: unlimited-copy cards, then leader deck restrictions. OPT-373 is the first implementation slice.

---

## Action Plan

Tickets in execution order. Ordering criteria: dependencies → estimate → priority → risk.

| Order | Ticket                                                | Title                                                                                                   | Estimate | Depends on | Status      | PR  | Notes                                                                                                 |
| ----- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | -------- | ---------- | ----------- | --- | ----------------------------------------------------------------------------------------------------- |
| 1     | [OPT-373](https://linear.app/optcg-sim/issue/OPT-373) | Enforce COPY_LIMIT_OVERRIDE in deck validation — legal Pacifista/Biscuit Warrior decks falsely rejected | —        | —          | In Progress | —   | Smallest schema-consumer path; proves validator can read rule_modifications from `Card.effectSchema`. |
| 2     | [OPT-374](https://linear.app/optcg-sim/issue/OPT-374) | Enforce leader DECK_RESTRICTION rules at deck build + game start (Rayleigh, Imu, P-117 Nami)            | —        | OPT-373    | Backlog     | —   | Reuse the same schema-reading pattern, then add filter matching plus deck-builder search affordances. |

**Status values:** use Linear status names verbatim (`Backlog`, `Todo`, `In Progress`, `In Review`, `Done`, `Canceled`). Don't invent.

**Next up:** OPT-373 is active. OPT-374 follows after OPT-373 lands.

---

## Handoffs

Append new entries at the bottom. Each entry is written _by_ the agent who just finished a ticket, _for_ the agent who picks up the next ticket.

### Project setup → OPT-373

**From:** session on 2026-07-05 · **Commit:** _(uncommitted; setup lands in OPT-373's PR)_ · **PR:** —

- **Primer:** Deck legality is intentionally schema-driven. The worker schema registry already encodes `COPY_LIMIT_OVERRIDE` and `DECK_RESTRICTION`; this project wires those rule modifications into app-side deck validation instead of introducing a parallel legality table.
- **Read first:** `src/lib/deck-builder/validation.ts`, `src/__tests__/deck-validation.test.ts`, `src/lib/decks/playable.ts`, `workers/game/src/engine/effect-types.ts`.
- **Gotchas / do NOT touch:** `requirePlayableDeck` already funnels game-start legality through `validateDeck`, so avoid a second server-only validator unless the shared API proves insufficient.
- **Unresolved:** OPT-374 may need a small app-side matcher for `cost_min`, `card_type`, and `traits`; defer that until the leader restriction ticket.
- **Why this matters for OPT-373:** Start with the copy-limit rule because it touches one validation branch and establishes the helper shape for reading `effectSchema.rule_modifications`.

### OPT-373 implementation pass → OPT-374

**From:** session on 2026-07-05 · **Commit:** _(uncommitted)_ · **PR:** —

- **Primer:** `validateDeck` now derives copy limits from `Card.effectSchema` instead of a hardcoded card ID allowlist. It reads both top-level `rule_modifications` and `effects[]` blocks with `category: "rule_modification"`, so OP01 Pacifista-style and OP08/OP16 authored schemas are covered. Deck-builder reducer/import/search/modal paths use `getDeckCardCopyLimit`, and API create/update/import schemas allow quantities up to 50 so over-four unlimited-copy decks can be saved.
- **Read first:** `src/lib/deck-builder/validation.ts`, `src/lib/deck-builder/state.ts`, `src/lib/decks/playable.ts`, `src/__tests__/deck-validation.test.ts`, `src/__tests__/deck-builder-state.test.ts`, `src/lib/decks/playable.test.ts`.
- **Gotchas / do NOT touch:** Keep legality schema-driven. Do not reintroduce a card ID allowlist for unlimited-copy cards. Card search/detail APIs already return `effectSchema` because they include full `Card` records; deck GET/import routes explicitly select it.
- **Verification:** `pnpm test` passes 72 files / 523 tests. `pnpm type-check` passes. `pnpm lint` exits 0 with the existing warning baseline only.
- **Unresolved:** OPT-374 should extend the same rule-modification collection helper for leader `DECK_RESTRICTION` rules and add the matcher for filters like `cost_min`, `card_type`, and `traits`.
- **Why this matters for OPT-374:** The app now has a shared helper for reading schema rule modifications and proven app/server plumbing from card records into deck validation.
