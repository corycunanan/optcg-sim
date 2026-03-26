# Deferred Card Effects

Cards whose effect schemas were too complex to encode on the first pass. Each entry documents the card, its effect text, the specific blocker(s), and which engine feature would unblock it.

Cards are removed from this list once they are encoded in `workers/game/src/engine/schemas/`.

---

## Blocker Categories

| Tag | Description | Example pattern |
|-----|-------------|-----------------|
| `REVEAL_CONDITIONAL` | Reveal card(s) then branch based on revealed card properties | "Reveal top card. If it is [X], play it" |
| `HAND_REVEAL_CONDITIONAL` | Blind hand selection + reveal + conditional branch on card type | "Choose from opponent's hand; reveal. If Event, do X" |
| `HAND_ZONE_MODIFIER` | Permanent cost/stat modifiers applied to cards in hand | "Give blue Events in your hand -1 cost" |
| `SELF_REF_TRACKING` | Effect tracks its own prior activations beyond once_per_turn | "if you haven't drawn using this Leader's effect" |
| `FULL_DECK_SEARCH_AND_PLAY` | Full deck search that plays to field (not hand) | "Play up to 1 [X] from your deck" |
| `NEXT_EVENT_COST_REDUCTION` | One-time cost modifier scoped to next qualifying play event | "the next time you play [X], cost reduced by 1" |

---

## OP01 Deferred Cards (4 remaining)

### OP01-060 Donquixote Doflamingo
**Tags:** `REVEAL_CONDITIONAL`

> [DON!! x2] [When Attacking] (1): Reveal 1 card from the top of your deck. If that card is a {The Seven Warlords of the Sea} type Character card with a cost of 4 or less, you may play that card rested.

**Blocker:** Requires reveal-then-conditional-play pipeline: reveal top card, evaluate filter against revealed card data, then optionally play it to field rested.

**Unblocked by:** `REVEAL` action returning revealed card data + inline condition checking revealed card properties + `PLAY_CARD` targeting revealed card.

---

### OP01-062 Crocodile (Leader)
**Tags:** `SELF_REF_TRACKING`

> [DON!! x1] When you activate an Event, you may draw 1 card if you have 4 or less cards in your hand and haven't drawn a card using this Leader's effect during this turn.

**Blocker:** "haven't drawn using this Leader's effect during this turn" requires tracking beyond `once_per_turn`.

**Workaround:** Encodable with `once_per_turn: true` as an approximation.

---

### OP01-063 Arlong
**Tags:** `HAND_REVEAL_CONDITIONAL`

> [DON!! x1] [Activate: Main] You may rest this Character: Choose 1 card from your opponent's hand; your opponent reveals that card. If the revealed card is an Event, place up to 1 card from your opponent's Life area at the bottom of the owner's deck.

**Blocker:** Blind hand selection + reveal + conditional branch on revealed card type ("if Event, do X").

**Unblocked by:** Extending `REVEAL_HAND` resume to check revealed card type and conditionally gate subsequent action.

---

### OP01-067 Crocodile (Character)
**Tags:** `HAND_ZONE_MODIFIER`

> [Banish]
> [DON!! x1] Give blue Events in your hand -1 cost.

**Blocker:** Permanent cost modifier applied to cards in the hand zone filtered by color and type.

**Unblocked by:** Modifier system supporting `zone: "HAND"` scope on `MODIFY_COST` modifiers, and `getEffectiveCost` checking hand-zone modifiers.

---

## OP02 Deferred Cards

### OP02-025 Kin'emon
**Tags:** `NEXT_EVENT_COST_REDUCTION`

> [Activate: Main] [Once Per Turn] If you have 1 or less Characters, the next time you play a {Land of Wano} type Character card with a cost of 3 or more from your hand during this turn, the cost will be reduced by 1.

**Blocker:** "The next time you play..." requires one-time cost reduction modifier scoped to the next qualifying play event.

**Unblocked by:** One-time modifier system with play-event scoping in the effect resolver.

---

### OP02-030 Kouzuki Oden (On K.O. effect only)
**Tags:** `FULL_DECK_SEARCH_AND_PLAY`

> [On K.O.] Play up to 1 green {Land of Wano} type Character card with a cost of 3 from your deck. Then, shuffle your deck.

**Blocker:** Full deck search that plays to field. `SEARCH_AND_PLAY` exists but currently only supports top-N search. This needs `search_full_deck: true` on `SEARCH_AND_PLAY`.

**Unblocked by:** `SEARCH_AND_PLAY` with `search_full_deck: true` — already supported in the action implementation, just needs the resume handler verified for full-deck mode.

---

## Summary by Blocker

| Blocker | Cards affected | Effort |
|---------|---------------|--------|
| `FULL_DECK_SEARCH_AND_PLAY` | OP01-069, OP01-098, OP01-116, OP02-030 | Medium |
| `REVEAL_CONDITIONAL` | OP01-060 | Medium |
| `HAND_ZONE_MODIFIER` | OP01-067 | Medium |
| `HAND_REVEAL` blind selection | OP01-063, OP01-105 | Medium |
| `NEXT_EVENT_COST_REDUCTION` | OP02-025 | Medium |
| `SELF_REF_TRACKING` | OP01-062 | Low |
