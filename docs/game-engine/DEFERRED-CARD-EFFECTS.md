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

## OP07 Deferred Cards (2 remaining)

### OP07-048 Donquixote Doflamingo
**Tags:** `REVEAL_CONDITIONAL`

> [Activate: Main] [Once Per Turn] ➁: Reveal 1 card from the top of your deck. If that card is a {The Seven Warlords of the Sea} type Character card with a cost of 4 or less, you may play that card rested. Then, place the rest at the bottom of your deck.

**Blocker:** Same reveal-then-conditional-play pattern as OP01-060. Requires reveal pipeline returning card data + conditional check against revealed card properties + optional play.

**Unblocked by:** Same pipeline as OP01-060 — `REVEAL` returning card data + conditional check + `PLAY_CARD` targeting revealed card.

---

### OP07-064 Sanji (Hand cost reduction only)
**Tags:** `HAND_ZONE_MODIFIER`

> If the number of DON!! cards on your field is at least 2 less than the number on your opponent's field, give this card in your hand −3 cost.
> [Blocker]

**Blocker:** Permanent cost modifier applied to this card while in hand, conditioned on DON field count comparison. Same pattern as OP01-067 Crocodile.

**Note:** [Blocker] keyword is encoded in `op07.ts`. Only the hand cost reduction is deferred.

**Unblocked by:** Modifier system supporting `zone: "HAND"` scope on `MODIFY_COST` modifiers with comparative condition.

---

## OP08 Deferred Cards (1 remaining)

### OP08-049 Speed Jil
**Tags:** `REVEAL_CONDITIONAL`

> [On Play] Reveal 1 card from the top of your deck and place it at the top or bottom of your deck. If the revealed card's type includes "Whitebeard Pirates", this Character gains [Rush] during this turn.

**Blocker:** Reveal top card, check trait on revealed card, conditionally grant keyword. Same reveal-conditional pattern as OP01-060 but with keyword grant instead of play.

**Unblocked by:** Same pipeline as OP01-060 — `REVEAL` returning card data + inline condition checking revealed card's trait.

---

## OP11 Deferred Cards (6 remaining)

### OP11-066 Charlotte Brûlée
**Tags:** `REVEAL_CONDITIONAL`

> [Activate: Main] You may rest this Character: Choose a cost and reveal 1 card from the top of your opponent's deck. If the revealed card has the chosen cost, K.O. up to 1 of your opponent's Characters with a base cost of 3 or less. Then, add up to 1 DON!! card from your DON!! deck and rest it.

**Blocker:** Requires CHOOSE_VALUE + REVEAL + conditional check against chosen value.

---

### OP11-071 Charlotte Linlin
**Tags:** `REVEAL_CONDITIONAL`

> [Activate: Main] [Once Per Turn] You may trash 1 card from your hand: Choose a cost and reveal 1 card from the top of your opponent's deck. If the revealed card has the chosen cost, draw 1 card and add up to 1 DON!! card from your DON!! deck and set it as active.

**Blocker:** Same CHOOSE_VALUE + REVEAL + conditional pattern.

---

### OP11-073 Charlotte Katakuri
**Tags:** `REVEAL_CONDITIONAL`

> [On Your Opponent's Attack] [Once Per Turn] DON!! −5: Choose a cost and reveal 1 card from the top of your opponent's deck. If the revealed card has the chosen cost, up to 1 of your Leader gains +2000 power during this turn.

**Blocker:** Same CHOOSE_VALUE + REVEAL + conditional pattern.

---

### OP11-074 Charlotte Cracker
**Tags:** `REVEAL_CONDITIONAL`

> [Activate: Main] [Once Per Turn] DON!! −1, You may rest this Character: Choose a cost and reveal 1 card from the top of your opponent's deck. If the revealed card has the chosen cost, rest up to 1 of your opponent's Characters with a cost of 4 or less.

**Blocker:** Same CHOOSE_VALUE + REVEAL + conditional pattern.

---

### OP11-079 Mochi Mochi no Mi
**Tags:** `REVEAL_CONDITIONAL`

> [Counter] Choose a cost and reveal 1 card from the top of your opponent's deck. If the revealed card has the chosen cost, up to 1 of your Leader or Character cards gains +5000 power during this battle.

**Blocker:** Same CHOOSE_VALUE + REVEAL + conditional pattern.

---

### OP11-081 Flaming Mochi
**Tags:** `REVEAL_CONDITIONAL`

> [Main] Choose a cost and reveal 1 card from the top of your opponent's deck. If the revealed card has the chosen cost, K.O. up to 1 of your opponent's Characters with a base cost of 8 or less.

**Blocker:** Same CHOOSE_VALUE + REVEAL + conditional pattern.

**Unblocked by:** All six OP11 REVEAL_CONDITIONAL cards need a `CHOOSE_VALUE` action that stores a player-chosen number, `REVEAL` from opponent deck top, then an inline condition comparing the revealed card's cost to the chosen value. This is the same pipeline as OP01-060 but with "choose a cost" instead of a fixed filter.

---

## OP12 Deferred Cards (2 remaining)

### OP12-058 I Will Make Whitebeard the King of the Pirates
**Tags:** `REVEAL_CONDITIONAL`

> [Main] If your Leader's type includes "Whitebeard Pirates", reveal 1 card from the top of your deck. If that card is a Character card with a type including "Whitebeard Pirates" and a cost of 9 or less, you may play that card. If you do, that Character gains [Rush] during this turn.

**Blocker:** Reveal-then-conditional-play: reveal top card, check type + trait + cost filter, optionally play, then grant Rush.

**Unblocked by:** Same pipeline as OP01-060 — `REVEAL` returning card data + conditional check + `PLAY_CARD` targeting revealed card.

---

### OP12-061 Donquixote Rosinante (Activate:Main effect only)
**Tags:** `NEXT_EVENT_COST_REDUCTION`

> [Activate: Main] [Once Per Turn] DON!! −1: The next time you play [Trafalgar Law] with a cost of 4 or more from your hand during this turn, the cost will be reduced by 2.

**Blocker:** "The next time you play..." requires one-time cost reduction modifier scoped to the next qualifying play event with name + cost filter.

**Unblocked by:** One-time modifier system with play-event scoping — same as OP02-025.

---

## OP13 Deferred Cards (1 remaining)

### OP13-079 Imu (Start-of-game effect only)
**Tags:** `FULL_DECK_SEARCH_AND_PLAY`

> Under the rules of this game ... at the start of the game, play up to 1 {Mary Geoise} type Stage card from your deck.

**Blocker:** Start-of-game full deck search that plays a Stage to field. Requires `START_OF_GAME_EFFECT` rule modification with `SEARCH_AND_PLAY` using `search_full_deck: true`.

**Note:** The deck restriction and activate_main effects are encoded in `op13.ts`.

**Unblocked by:** `START_OF_GAME_EFFECT` rule modification with `SEARCH_AND_PLAY` full-deck mode.

---

## OP14 Deferred Cards (2 remaining)

### OP14-044 Edward.Newgate (On Play effect only)
**Tags:** `REVEAL_CONDITIONAL`

> [On Play] Reveal 1 card from the top of your deck. If that card's type includes "Whitebeard Pirates", draw 2 cards and trash 1 card from your hand.

**Blocker:** Reveal top card, check trait, conditionally draw + trash.

**Note:** [Blocker] keyword is encoded in `op14.ts`.

**Unblocked by:** Same REVEAL pipeline as OP01-060.

---

### OP14-053 Vista (Opponent's Turn effect only)
**Tags:** `HAND_ZONE_MODIFIER`

> [Opponent's Turn] If you have 7 or less cards in your hand, this Character's base power becomes the same as your Leader's base power.

**Blocker:** Dynamic base power copy — "becomes the same as your Leader's base power" requires a dynamic value reference to leader's current base power.

**Note:** [Blocker] keyword is encoded in `op14.ts`.

**Unblocked by:** `SET_BASE_POWER` with a dynamic value `{ type: "GAME_STATE", source: "LEADER_BASE_POWER" }` or similar.

---

## OP15 Deferred Cards (3 remaining)

### OP15-013 Pincers (Hand zone cost reduction)
**Tags:** `HAND_ZONE_MODIFIER`

> If your Leader has 0 power or less, give this card in your hand −2 cost.

**Blocker:** Permanent cost modifier applied to this card while in hand, conditioned on Leader power.

**Note:** [Blocker] keyword is encoded in `op15.ts`.

**Unblocked by:** Modifier system supporting `zone: "HAND"` scope + Leader power condition.

---

### OP15-065 Goro
**Tags:** `REVEAL_CONDITIONAL`

> [On Play] Reveal 1 card from the top of your deck. If the revealed card has a cost of 2 or less, add up to 1 DON!! card from your DON!! deck and rest it.

**Blocker:** Reveal top card, check cost, conditionally add DON.

**Unblocked by:** Same REVEAL pipeline as OP01-060.

---

### OP15-102 Gan.Fall (Hand zone cost reduction)
**Tags:** `HAND_ZONE_MODIFIER`

> If you have a {Sky Island} type Character with 7000 power or more, give this card in your hand −3 cost.

**Blocker:** Permanent cost modifier applied to this card while in hand, conditioned on field state.

**Note:** [On Play] effect is encoded in `op15.ts`.

**Unblocked by:** Modifier system supporting `zone: "HAND"` scope + field existence condition.

---

## ST13 Deferred Cards (4 remaining)

### ST13-007 Sabo (cost 2)
**Tags:** `REVEAL_CONDITIONAL`

> [Activate: Main] You may trash this Character: Reveal 1 card from the top of your Life cards. If that card is a [Sabo] with a cost of 5, you may play that card. If you do, up to 1 of your Leader gains +2000 power until the end of your opponent's next turn.

**Blocker:** Reveal from Life + conditional play based on revealed card name and cost.

---

### ST13-009 Shanks
**Tags:** `LIFE_FACE_COST`

> [On Play] You may turn 1 of your face-up Life cards face-down: If your opponent has 7 or more cards in their hand, trash up to 1 card from the top of your opponent's Life cards.

**Blocker:** `TURN_LIFE_FACE_DOWN` is not a valid `CostType`. Requires adding it to the cost type enum.

---

### ST13-010 Portgas.D.Ace (cost 2)
**Tags:** `REVEAL_CONDITIONAL`

> [Activate: Main] You may trash this Character: Reveal 1 card from the top of your Life cards. If that card is a [Portgas.D.Ace] with a cost of 5, you may play that card. If you do, up to 1 of your Leader gains +2000 power until the end of your opponent's next turn.

**Blocker:** Reveal from Life + conditional play based on revealed card name and cost.

---

### ST13-014 Monkey.D.Luffy (cost 2)
**Tags:** `REVEAL_CONDITIONAL`

> [Activate: Main] You may trash this Character: Reveal 1 card from the top of your Life cards. If that card is a [Monkey.D.Luffy] with a cost of 5, you may play that card. If you do, up to 1 of your Leader gains +2000 power until the end of your opponent's next turn.

**Blocker:** Reveal from Life + conditional play based on revealed card name and cost.

---

## ST17 Deferred Cards (1 remaining)

### ST17-001 Crocodile
**Tags:** `REVEAL_CONDITIONAL`

> [On Play] Reveal 1 card from the top of your deck. If that card is a {The Seven Warlords of the Sea} type card, draw 2 cards and place 1 card from your hand at the top of your deck.

**Blocker:** Reveal top card + conditional branch based on revealed card's trait.

---

## ST20 Deferred Cards (1 remaining)

### ST20-001 Charlotte Katakuri
**Tags:** `LIFE_FACE_COST`

> [Blocker]
> [Activate: Main] [Once Per Turn] You may turn 1 card from the top of your Life cards face-up: Give up to 1 rested DON!! card to your Leader or 1 of your Characters.

**Blocker:** `TURN_LIFE_FACE_UP` is not a valid `CostType`. Requires adding it to the cost type enum.

---

## Summary by Blocker

| Blocker | Cards affected | Effort |
|---------|---------------|--------|
| `FULL_DECK_SEARCH_AND_PLAY` | OP01-069, OP01-098, OP01-116, OP02-030, OP13-079 | Medium |
| `REVEAL_CONDITIONAL` | OP01-060, OP11-066, OP11-071, OP11-073, OP11-074, OP11-079, OP11-081, OP12-058, OP14-044, OP15-065, ST13-007, ST13-010, ST13-014, ST17-001 | Medium |
| `HAND_ZONE_MODIFIER` | OP01-067, OP14-053, OP15-013, OP15-102 | Medium |
| `HAND_REVEAL` blind selection | OP01-063, OP01-105 | Medium |
| `NEXT_EVENT_COST_REDUCTION` | OP02-025, OP12-061 | Medium |
| `SELF_REF_TRACKING` | OP01-062 | Low |
| `LIFE_FACE_COST` | ST13-009, ST20-001 | Low |
