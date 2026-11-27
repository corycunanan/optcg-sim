---
linear-project: Deck Legality
linear-project-url: https://linear.app/optcg-sim/project/deck-legality-03c2eba86dfa
last-updated: 2026-07-07
---

# Deck Legality — Handoff Doc

Consume card-driven deck-building rule modifications already encoded in `Card.effectSchema`: unlimited-copy cards, then leader deck restrictions. OPT-373 is the first implementation slice.

---

## Action Plan

Tickets in execution order. Ordering criteria: dependencies → estimate → priority → risk.

| Order | Ticket                                                | Title                                                                                                   | Estimate | Depends on | Status      | PR  | Notes                                                                                                 |
| ----- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | -------- | ---------- | ----------- | --- | ----------------------------------------------------------------------------------------------------- |
| 1     | [OPT-373](https://linear.app/optcg-sim/issue/OPT-373) | Enforce COPY_LIMIT_OVERRIDE in deck validation — legal Pacifista/Biscuit Warrior decks falsely rejected | —        | —          | Done        | [#228](https://github.com/corycunanan/optcg-sim/pull/228) | Smallest schema-consumer path; proves validator can read rule_modifications from `Card.effectSchema`. |
| 2     | [OPT-374](https://linear.app/optcg-sim/issue/OPT-374) | Enforce leader DECK_RESTRICTION rules at deck build + game start (Rayleigh, Imu, P-117 Nami)            | —        | OPT-373    | Done        | [#229](https://github.com/corycunanan/optcg-sim/pull/229) | Reuses schema-rule collection, adds app-side deck-restriction filter matching, and dims illegal cards in search. |

**Status values:** use Linear status names verbatim (`Backlog`, `Todo`, `In Progress`, `In Review`, `Done`, `Canceled`). Don't invent.

**Next up:** None — project complete (OPT-374 merged in [#229](https://github.com/corycunanan/optcg-sim/pull/229)).

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

**From:** session on 2026-07-05 · **Commit:** `9f2d8f4` · **PR:** [#228](https://github.com/corycunanan/optcg-sim/pull/228)

- **Primer:** `validateDeck` now derives copy limits from `Card.effectSchema` instead of a hardcoded card ID allowlist. It reads both top-level `rule_modifications` and `effects[]` blocks with `category: "rule_modification"`, so OP01 Pacifista-style and OP08/OP16 authored schemas are covered. Deck-builder reducer/import/search/modal paths use `getDeckCardCopyLimit`, and API create/update/import schemas allow quantities up to 50 so over-four unlimited-copy decks can be saved.
- **Read first:** `src/lib/deck-builder/validation.ts`, `src/lib/deck-builder/state.ts`, `src/lib/decks/playable.ts`, `src/__tests__/deck-validation.test.ts`, `src/__tests__/deck-builder-state.test.ts`, `src/lib/decks/playable.test.ts`.
- **Gotchas / do NOT touch:** Keep legality schema-driven. Do not reintroduce a card ID allowlist for unlimited-copy cards. Card search/detail APIs already return `effectSchema` because they include full `Card` records; deck GET/import routes explicitly select it.
- **Verification:** `pnpm test` passes 72 files / 523 tests. `pnpm type-check` passes. `pnpm lint` exits 0 with the existing warning baseline only.
- **Unresolved:** OPT-374 should extend the same rule-modification collection helper for leader `DECK_RESTRICTION` rules and add the matcher for filters like `cost_min`, `card_type`, and `traits`.
- **Why this matters for OPT-374:** The app now has a shared helper for reading schema rule modifications and proven app/server plumbing from card records into deck validation.

### OPT-374 implementation pass → project complete

**From:** session on 2026-07-06 · **Commit:** `9f8923e` · **PR:** [#229](https://github.com/corycunanan/optcg-sim/pull/229)

- **Primer:** `validateDeck` now consumes leader `DECK_RESTRICTION` rule modifications for the three current authored cases: Rayleigh `CANNOT_INCLUDE { cost_min: 5 }`, Imu `CANNOT_INCLUDE { card_type: "EVENT", cost_min: 2 }`, and P-117 Nami `ONLY_INCLUDE { traits: ["East Blue"] }`. Game-start legality follows automatically through `requirePlayableDeck`.
- **Read first:** `src/lib/deck-builder/validation.ts`, `src/components/deck-builder/deck-builder-search.tsx`, `src/__tests__/deck-validation.test.ts`, `src/lib/decks/playable.test.ts`.
- **Gotchas / do NOT touch:** The matcher is intentionally app-side and slim because OPT-101 has not moved worker filter utilities into a shared package. `rg -n "DECK_RESTRICTION" workers/game/src/engine/schemas` still shows only OP12-001, OP13-079, and P-117 plus docs.
- **Verification:** `pnpm verify` passes with network enabled. The first sandboxed run only failed during `next build` because DNS to `fonts.googleapis.com` was blocked.
- **Unresolved:** None in this Deck Legality action plan. Future broader sharing of filter semantics belongs with OPT-101.

### Post-merge review fix → effect schema sync

**From:** session on 2026-07-06 · **Commit:** `58fd713` · **PR:** [#231](https://github.com/corycunanan/optcg-sim/pull/231) (fixes), [#232](https://github.com/corycunanan/optcg-sim/pull/232) (cleanup), [#233](https://github.com/corycunanan/optcg-sim/pull/233)/[#234](https://github.com/corycunanan/optcg-sim/pull/234) (CI auto-sync)

- **Primer:** This doc's premise ("rule modifications already encoded in `Card.effectSchema`") was false: no code path ever wrote that column, and both Neon branches had `effectSchema = NULL` for every card, so OPT-373/374 validation was inert and unlimited-copy decks regressed (the deleted allowlist had no schema replacement). `pipeline/sync-effect-schemas.ts` now materializes the deck-legality subset (`rule_modifications` only) from the authored worker schemas into the DB — as `pnpm pipeline:sync-schemas` (`--check` for drift, `--dry-run`), and as Step 7 of `pipeline/import.ts` so imports can't leave the column empty.
- **Read first:** `pipeline/sync-effect-schemas.ts`, `src/__tests__/effect-schema-sync.test.ts`, `workers/game/src/engine/schema-registry.ts` (`getAllAuthoredSchemas`).
- **Gotchas / do NOT touch:** The DB column is a derived copy — authored TS files in `workers/game/src/engine/schemas/` stay the single source of truth; never hand-edit `effectSchema` in the DB. The CI test `effect-schema-sync.test.ts` fails on any authored `DECK_RESTRICTION` filter key outside `{cost_min, card_type, traits}` — extend `matchesDeckRestrictionFilter` in `validation.ts` before authoring new keys (the matcher silently ignores unknown keys otherwise).
- **Verification:** dev synced (23 cards) and prod synced (21 cards; OP16-042/OP16-118 flagged missing because prod lacks the OP16 set), `--check` clean on both; `pnpm lint` / `type-check` / `test` (74 files, 536 tests) / `build` pass.
- **Unresolved:** None. The same session also fixed the other post-merge review findings: import modal now carries leader `effectSchema` (restrictions visible for imported decks), import preview warns when quantities will be clamped to a card's copy limit (and counts the clamped total), the leader inspect modal has a working "Remove Leader" button (`onRemoveLeader` prop on `DeckBuilderCardModal`), and deck POST/PUT reject over-limit quantities schema-aware via `src/lib/decks/copy-limits.ts`.
