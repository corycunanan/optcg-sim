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

## OP01 Deferred Cards (3 remaining)

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

### ~~OP01-067 Crocodile (Character)~~ — ENCODED
Encoded in `op01.ts` with field-to-hand MODIFY_COST pattern.

---

## OP02 Deferred Cards

### OP02-025 Kin'emon
**Tags:** `NEXT_EVENT_COST_REDUCTION`

> [Activate: Main] [Once Per Turn] If you have 1 or less Characters, the next time you play a {Land of Wano} type Character card with a cost of 3 or more from your hand during this turn, the cost will be reduced by 1.

**Blocker:** "The next time you play..." requires one-time cost reduction modifier scoped to the next qualifying play event.

**Unblocked by:** One-time modifier system with play-event scoping in the effect resolver.

---

### ~~OP02-030 Kouzuki Oden~~ — ENCODED
On K.O. full-deck SEARCH_AND_PLAY encoded in `op02.ts`.

---

## OP07 Deferred Cards (1 remaining)

### OP07-048 Donquixote Doflamingo
**Tags:** `REVEAL_CONDITIONAL`

> [Activate: Main] [Once Per Turn] ➁: Reveal 1 card from the top of your deck. If that card is a {The Seven Warlords of the Sea} type Character card with a cost of 4 or less, you may play that card rested. Then, place the rest at the bottom of your deck.

**Blocker:** Same reveal-then-conditional-play pattern as OP01-060. Requires reveal pipeline returning card data + conditional check against revealed card properties + optional play.

**Unblocked by:** Same pipeline as OP01-060 — `REVEAL` returning card data + conditional check + `PLAY_CARD` targeting revealed card.

---

### ~~OP07-064 Sanji~~ — ENCODED
Hand cost reduction + Blocker fully encoded in `op07.ts`.

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

**Schema:** START_OF_GAME_EFFECT rule_modification with SEARCH_AND_PLAY encoded in `op13.ts`. Stage support added to resume handler.

**Remaining blocker:** Engine setup (`setup.ts`) does not yet process `START_OF_GAME_EFFECT` rule modifications during game initialization. Needs game session integration to fire actions before first turn.

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

## OP15 Deferred Cards (1 remaining)

### ~~OP15-013 Pincers~~ — ENCODED
Hand cost reduction + Blocker fully encoded in `op15.ts`.

---

### OP15-065 Goro
**Tags:** `REVEAL_CONDITIONAL`

> [On Play] Reveal 1 card from the top of your deck. If the revealed card has a cost of 2 or less, add up to 1 DON!! card from your DON!! deck and rest it.

**Blocker:** Reveal top card, check cost, conditionally add DON.

**Unblocked by:** Same REVEAL pipeline as OP01-060.

---

### ~~OP15-102 Gan.Fall~~ — ENCODED
Hand cost reduction + On Play fully encoded in `op15.ts`.

---

## ST13 Deferred Cards (3 remaining)

### ST13-007 Sabo (cost 2)
**Tags:** `REVEAL_CONDITIONAL`

> [Activate: Main] You may trash this Character: Reveal 1 card from the top of your Life cards. If that card is a [Sabo] with a cost of 5, you may play that card. If you do, up to 1 of your Leader gains +2000 power until the end of your opponent's next turn.

**Blocker:** Reveal from Life + conditional play based on revealed card name and cost.

---

### ~~ST13-009 Shanks~~ — ENCODED
On Play with TURN_LIFE_FACE_DOWN cost fully encoded in `st13.ts`.

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

## ST20 Deferred Cards (0 remaining)

### ~~ST20-001 Charlotte Katakuri~~ — ENCODED
Blocker + Activate Main with TURN_LIFE_FACE_UP cost fully encoded in `st20.ts`.

---

## ST22 Deferred Cards (5 remaining)

### ST22-003 Edward.Newgate (On Play effect only)
**Tags:** `REVEAL_CONDITIONAL`

> [On Play] Reveal 1 card from the top of your deck. If that card's type includes "Whitebeard Pirates", draw 2 cards.

**Blocker:** Reveal top card, check trait, conditionally draw.

**Note:** [Double Attack] keyword is encoded in `st22.ts`.

**Unblocked by:** Same REVEAL pipeline as OP01-060.

---

### ST22-006 Jozu
**Tags:** `REVEAL_CONDITIONAL`

> [On Play] Reveal 1 card from the top of your deck. If that card's type includes "Whitebeard Pirates", draw 2 cards and trash 1 card from your hand.

**Blocker:** Reveal top card, check trait, conditionally draw + trash.

**Unblocked by:** Same REVEAL pipeline as OP01-060.

---

### ST22-007 Squard
**Tags:** `REVEAL_CONDITIONAL`

> [Activate: Main] [Once Per Turn] Reveal 1 card from the top of your deck. If that card's type includes "Whitebeard Pirates", give up to 1 rested DON!! card to your Leader or 1 of your Characters.

**Blocker:** Reveal top card, check trait, conditionally give DON.

**Unblocked by:** Same REVEAL pipeline as OP01-060.

---

### ST22-012 Marco (When Attacking effect only)
**Tags:** `REVEAL_CONDITIONAL`

> [When Attacking] Reveal 1 card from the top of your deck. If that card's type includes "Whitebeard Pirates", this Character gains +1000 power until the end of your opponent's next turn.

**Blocker:** Reveal top card, check trait, conditionally grant power.

**Note:** Replacement effect (K.O. protection) is encoded in `st22.ts`.

**Unblocked by:** Same REVEAL pipeline as OP01-060.

---

### ST22-016 Take That Back!! (Counter effect only)
**Tags:** `REVEAL_CONDITIONAL`

> [Counter] Reveal 1 card from the top of your deck. If that card's type includes "Whitebeard Pirates", up to 1 of your Leader or Character cards gains +4000 power during this battle.

**Blocker:** Reveal top card, check trait, conditionally grant power.

**Note:** [Trigger] effect (Draw 1 card) is encoded in `st22.ts`.

**Unblocked by:** Same REVEAL pipeline as OP01-060.

---

## ST23 Deferred Cards (0 remaining)

### ~~ST23-001 Uta~~ — ENCODED
Hand cost reduction + Blocker fully encoded in `st23.ts`.

---

### ~~ST23-002 Shanks~~ — ENCODED
Hand cost reduction + On Play fully encoded in `st23.ts`.

---

## ST26 Deferred Cards (0 remaining)

### ~~ST26-001 Soba Mask~~ — ENCODED
Hand cost reduction + On Play fully encoded in `st26.ts`.

---

## P (Promo) Deferred Cards (0 remaining)

### ~~P-106 Monkey.D.Luffy~~ — ENCODED
Already encoded in `p.ts` with TURN_LIFE_FACE_UP cost. Cost handler already supports it.

---

## Summary by Blocker (Original Deferrals)

| Blocker | Cards | Count | Effort |
|---------|-------|-------|--------|
| `REVEAL_CONDITIONAL` | OP01-060, OP07-048, OP08-049, OP11-066/071/073/074/079/081, OP12-058, OP14-044, OP15-065, ST13-007/010/014, ST17-001, ST22-003/006/007/012/016 | 19 | Medium |
| `HAND_ZONE_MODIFIER` | OP14-053 | 1 | Medium |
| `FULL_DECK_SEARCH_AND_PLAY` | OP13-079 (schema done, needs setup.ts integration) | 1 | Low |
| ~~`LIFE_FACE_COST`~~ | ~~ST13-009, ST20-001, P-106~~ | 0 | Done |
| `HAND_REVEAL_CONDITIONAL` | OP01-063, OP01-105 | 2 | Medium |
| `NEXT_EVENT_COST_REDUCTION` | OP02-025, OP12-061 | 2 | Medium |
| `SELF_REF_TRACKING` | OP01-062 | 1 | Low |

---

## M4.5 QA Findings — Additional Cards Needing Engine Work

Identified by the Phase 1 validation sweep (F9 engine coverage check + low-confidence encoding detector). These cards have schemas encoded with action types that have no engine handler, or card text that doesn't cleanly map to the schema's action types.

### ~~Cards Using Unhandled Action Types (F9)~~ — ALL RESOLVED

All 18 action types now have handlers registered in `resolver.ts`. The F9 scan was run before
handlers were implemented. Additionally, `SEARCH_TRASH_THE_REST` resume handler was added
to process player card selections.

`ADD_TO_LIFE` (EB02-057) was a false positive — the schema correctly uses `ADD_TO_LIFE_FROM_FIELD`.

### Low-Confidence Encodings (Card Text / Schema Mismatch)

| Pattern | Count | Cards |
|---|---|---|
| `REVEAL_WITHOUT_ACTION` | 18 | OP06-057, OP06-119, OP08-040/044/052/054/055, OP14-044, ST11-001, ST12-010/013/017, ST22-001/003/011/012/016/017 |
| `HAND_COST_REDUCTION` | 10 | EB04-061, OP07-064, OP11-023, OP15-013/021/102, PRB02-014, ST23-001/002, ST26-001 |
| `SEARCH_TRASH_THE_REST` | 9 | EB01-009, EB02-025/056, OP01-116, OP06-003, OP08-007, OP11-051, OP14-010, ST12-013 |
| `TURN_LIFE_FACE` | 7 | EB03-053/056, OP10-099, OP12-102, OP13-109, P-106, ST29-008 |
| `BASE_POWER_BECOMES` | 6 | EB01-061, EB04-003/052, OP04-069, OP06-009, OP14-053 |
| `PLAY_FROM_DECK` | 4 | OP02-030, OP08-071/073, OP13-079 |
| `SAME_NAME_AS_TRASHED` | 1 | EB02-039 |
| `NEXT_TIME_YOU_PLAY` | 1 | OP12-061 |

### Totals

| Category | Count |
|---|---|
| Original deferrals (pre-QA) | 24 |
| ~~NEW: unhandled action types (F9)~~ | ~~50~~ 0 (all handlers exist) |
| NEW: low-confidence encodings (LC) | 56 |
| Overlap (flagged by multiple sources) | ~24 |
| **Total unique cards needing work** | **~80** |
