# Deck-builder state and validation

This directory owns the client deck state machine plus the pure parsing,
customization, and legality functions reused by UI and server-side playable-deck
checks.

| File               | Purpose                                                                           |
| ------------------ | --------------------------------------------------------------------------------- |
| `state.ts`         | `DeckBuilderState`, action union, initial state, and reducer.                     |
| `validation.ts`    | Deck statistics, copy-limit overrides, leader restrictions, and legality results. |
| `parser.ts`        | Text deck-list parsing into `{ quantity, cardId }` lines.                         |
| `customization.ts` | Available sleeve and DON!! art options.                                           |
| `index.ts`         | Public barrel for state, validation, parser, and customization exports.           |

## State machine

`DeckBuilderState` stores identity/name/format, leader, a `Map` of card entries,
sleeve and DON!! art, optional test order, dirty/saving flags, revision counters,
and the last successful save time.

The reducer action families are:

- metadata: `SET_NAME`, `SET_FORMAT`;
- composition: leader/card add, remove, quantity, import, and `CLEAR_DECK`;
- customization: art variant, sleeve, DON!! art, and test order;
- persistence: `LOAD_DECK`, `SAVE_START`, `SAVE_SUCCESS`, `SAVE_ERROR`, and
  `MARK_CLEAN`.

Composition changes clear a configured test order. Card quantities are clamped
through `getDeckCardCopyLimit`, so authored unlimited-copy rules are respected
instead of assuming four copies universally. `LOAD_DECK` restores serialized
cards to a `Map` and resets revisions.

Save completion is revision-gated: `SAVE_START` captures `editRevision`, and
`SAVE_SUCCESS` clears `isDirty` only when no edit occurred during the request.
See the reducer cases in [`state.ts`](./state.ts) for exact transition behavior.

## Validation

`validateDeck(leader, cards, format)` returns `{ isValid, results, stats }`.
Current error checks cover leader presence, exactly 50 main-deck cards, copy
limits (including schema-authored unlimited overrides), leader color affinity,
schema-authored leader deck restrictions, banned/restricted cards, and Leader
cards in the main deck. `format` is accepted but currently unused; do not infer
format/block rotation behavior from the parameter.

`stats` reports total cards plus color, cost (10+ bucketed together), card type,
and trait breakdowns. `collectRuleModifications` supports both authored schema
encodings used by card data; target-filter evaluation is shared with the worker
through `shared/target-filter.ts`.

When changing legality, update `validation.ts` and the callers in
`src/lib/decks/` together so editor feedback and server-side playability remain
aligned.
