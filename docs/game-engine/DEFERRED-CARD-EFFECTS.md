# Deferred Card Effects

Historical inventory of card effects that were too complex to encode on the
first pass. Each entry records the original blocker and its final disposition.
The authoritative schemas live in `workers/game/src/engine/schemas/`; the
fail-closed schema gate and action-coverage inventory determine playability.

**OPT-475 closure:** the conditional-reveal cohort was reconciled from the stale
19-card audit count to 20 cards (OP08-049 was still partial). All 20 now have
complete authored schemas and machine-checked execution coverage; their entries
remain below as historical disposition records. **Remaining deferred cards: 0.**
No playable-format exclusion is active for this cohort.

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

## OP01 Deferred Cards (0 remaining)

### ~~OP01-060 Donquixote Doflamingo~~ — ENCODED
REVEAL + REVEALED_CARD_PROPERTY + PLAY_CARD encoded in `op01.ts`.

---

### ~~OP01-062 Crocodile (Leader)~~ — ENCODED
Encoded in `op01.ts` with `once_per_turn: true` approximation for self-ref tracking.

---

### ~~OP01-063 Arlong~~ — ENCODED
REVEAL_HAND + REVEALED_CARD_PROPERTY condition on Event type encoded in `op01.ts`.

---

### ~~OP01-067 Crocodile (Character)~~ — ENCODED
Encoded in `op01.ts` with field-to-hand MODIFY_COST pattern.

---

## OP02 Deferred Cards

### ~~OP02-025 Kin'emon~~ — ENCODED
APPLY_ONE_TIME_MODIFIER with MODIFY_COST + trait/costMin filter encoded in `op02.ts`.

---

### ~~OP02-030 Kouzuki Oden~~ — ENCODED
On K.O. full-deck SEARCH_AND_PLAY encoded in `op02.ts`.

---

## OP07 Deferred Cards (0 remaining)

### ~~OP07-048 Donquixote Doflamingo~~ — ENCODED
**Tags:** `REVEAL_CONDITIONAL`

> [Activate: Main] [Once Per Turn] ➁: Reveal 1 card from the top of your deck. If that card is a {The Seven Warlords of the Sea} type Character card with a cost of 4 or less, you may play that card rested. Then, place the rest at the bottom of your deck.

**Blocker:** Same reveal-then-conditional-play pattern as OP01-060. Requires reveal pipeline returning card data + conditional check against revealed card properties + optional play.

**Unblocked by:** Same pipeline as OP01-060 — `REVEAL` returning card data + conditional check + `PLAY_CARD` targeting revealed card.

---

### ~~OP07-064 Sanji~~ — ENCODED
Hand cost reduction + Blocker fully encoded in `op07.ts`.

---

## OP08 Deferred Cards (0 remaining)

### ~~OP08-049 Speed Jil~~ — ENCODED
**Tags:** `REVEAL_CONDITIONAL`

> [On Play] Reveal 1 card from the top of your deck and place it at the top or bottom of your deck. If the revealed card's type includes "Whitebeard Pirates", this Character gains [Rush] during this turn.

**Blocker:** Reveal top card, check trait on revealed card, conditionally grant keyword. Same reveal-conditional pattern as OP01-060 but with keyword grant instead of play.

**Unblocked by:** Same pipeline as OP01-060 — `REVEAL` returning card data + inline condition checking revealed card's trait.

---

## OP11 Deferred Cards (0 remaining)

### ~~OP11-066 Charlotte Oven~~ — ENCODED
**Tags:** `REVEAL_CONDITIONAL`

> [Activate: Main] You may rest this Character: Choose a cost and reveal 1 card from the top of your opponent's deck. If the revealed card has the chosen cost, K.O. up to 1 of your opponent's Characters with a base cost of 3 or less. Then, add up to 1 DON!! card from your DON!! deck and rest it.

**Blocker:** Requires CHOOSE_VALUE + REVEAL + conditional check against chosen value.

---

### ~~OP11-071 Charlotte Perospero~~ — ENCODED
**Tags:** `REVEAL_CONDITIONAL`

> [Activate: Main] [Once Per Turn] You may trash 1 card from your hand: Choose a cost and reveal 1 card from the top of your opponent's deck. If the revealed card has the chosen cost, draw 1 card and add up to 1 DON!! card from your DON!! deck and set it as active.

**Blocker:** Same CHOOSE_VALUE + REVEAL + conditional pattern.

---

### ~~OP11-073 Charlotte Linlin~~ — ENCODED
**Tags:** `REVEAL_CONDITIONAL`

> [On Your Opponent's Attack] [Once Per Turn] DON!! −5: Choose a cost and reveal 1 card from the top of your opponent's deck. If the revealed card has the chosen cost, up to 1 of your Leader gains +2000 power during this turn.

**Blocker:** Same CHOOSE_VALUE + REVEAL + conditional pattern.

---

### ~~OP11-074 Streusen~~ — ENCODED
**Tags:** `REVEAL_CONDITIONAL`

> [Activate: Main] [Once Per Turn] DON!! −1, You may rest this Character: Choose a cost and reveal 1 card from the top of your opponent's deck. If the revealed card has the chosen cost, rest up to 1 of your opponent's Characters with a cost of 4 or less.

**Blocker:** Same CHOOSE_VALUE + REVEAL + conditional pattern.

---

### ~~OP11-079 When Two Men Are Fighting the Last Thing I Need Is Some Half-Hearted Assistance!!!!~~ — ENCODED
**Tags:** `REVEAL_CONDITIONAL`

> [Counter] Choose a cost and reveal 1 card from the top of your opponent's deck. If the revealed card has the chosen cost, up to 1 of your Leader or Character cards gains +5000 power during this battle.

**Blocker:** Same CHOOSE_VALUE + REVEAL + conditional pattern.

---

### ~~OP11-081 Cognac Mama-Mash~~ — ENCODED
**Tags:** `REVEAL_CONDITIONAL`

> [Main] Choose a cost and reveal 1 card from the top of your opponent's deck. If the revealed card has the chosen cost, K.O. up to 1 of your opponent's Characters with a base cost of 8 or less.

**Blocker:** Same CHOOSE_VALUE + REVEAL + conditional pattern.

**Unblocked by:** All six OP11 REVEAL_CONDITIONAL cards need a `CHOOSE_VALUE` action that stores a player-chosen number, `REVEAL` from opponent deck top, then an inline condition comparing the revealed card's cost to the chosen value. This is the same pipeline as OP01-060 but with "choose a cost" instead of a fixed filter.

---

## OP12 Deferred Cards (0 remaining)

### ~~OP12-058 I Will Make Whitebeard the King of the Pirates~~ — ENCODED
**Tags:** `REVEAL_CONDITIONAL`

> [Main] If your Leader's type includes "Whitebeard Pirates", reveal 1 card from the top of your deck. If that card is a Character card with a type including "Whitebeard Pirates" and a cost of 9 or less, you may play that card. If you do, that Character gains [Rush] during this turn.

**Blocker:** Reveal-then-conditional-play: reveal top card, check type + trait + cost filter, optionally play, then grant Rush.

**Unblocked by:** Same pipeline as OP01-060 — `REVEAL` returning card data + conditional check + `PLAY_CARD` targeting revealed card.

---

### ~~OP12-061 Donquixote Rosinante~~ — ENCODED
APPLY_ONE_TIME_MODIFIER with MODIFY_COST + name/costMin filter encoded in `op12.ts`.

---

## OP13 Deferred Cards (0 remaining)

### ~~OP13-079 Imu (Start-of-game effect only)~~ — ENCODED
**Tags:** `FULL_DECK_SEARCH_AND_PLAY`

> Under the rules of this game ... at the start of the game, play up to 1 {Mary Geoise} type Stage card from your deck.

**Schema:** `START_OF_GAME_EFFECT` rule modification with `SEARCH_AND_PLAY` encoded in `op13.ts`. `pregame.ts` executes both Leaders in first-player order before opening hands, persists prompt progress, and resumes Stage placement through the normal effect stack. Covered by `opt-476-start-of-game-effects.test.ts`.

---

## OP14 Deferred Cards (0 remaining)

### ~~OP14-044 Edward.Newgate (On Play effect only)~~ — ENCODED
**Tags:** `REVEAL_CONDITIONAL`

> [On Play] Reveal 1 card from the top of your deck. If that card's type includes "Whitebeard Pirates", draw 2 cards and trash 1 card from your hand.

**Blocker:** Reveal top card, check trait, conditionally draw + trash.

**Note:** [Blocker] keyword is encoded in `op14.ts`.

**Unblocked by:** Same REVEAL pipeline as OP01-060.

---

### ~~OP14-053 Vista~~ — ENCODED
SET_POWER with dynamic GAME_STATE LEADER_BASE_POWER value encoded in `op14.ts`.

---

## OP15 Deferred Cards (0 remaining)

### ~~OP15-013 Pincers~~ — ENCODED
Hand cost reduction + Blocker fully encoded in `op15.ts`.

---

### ~~OP15-065 Goro~~ — ENCODED
**Tags:** `REVEAL_CONDITIONAL`

> [On Play] Reveal 1 card from the top of your deck. If the revealed card has a cost of 2 or less, add up to 1 DON!! card from your DON!! deck and rest it.

**Blocker:** Reveal top card, check cost, conditionally add DON.

**Unblocked by:** Same REVEAL pipeline as OP01-060.

---

### ~~OP15-102 Gan.Fall~~ — ENCODED
Hand cost reduction + On Play fully encoded in `op15.ts`.

---

## ST13 Deferred Cards (0 remaining)

### ~~ST13-007 Sabo (cost 2)~~ — ENCODED
**Tags:** `REVEAL_CONDITIONAL`

> [Activate: Main] You may trash this Character: Reveal 1 card from the top of your Life cards. If that card is a [Sabo] with a cost of 5, you may play that card. If you do, up to 1 of your Leader gains +2000 power until the end of your opponent's next turn.

**Blocker:** Reveal from Life + conditional play based on revealed card name and cost.

---

### ~~ST13-009 Shanks~~ — ENCODED
On Play with TURN_LIFE_FACE_DOWN cost fully encoded in `st13.ts`.

---

### ~~ST13-010 Portgas.D.Ace (cost 2)~~ — ENCODED
**Tags:** `REVEAL_CONDITIONAL`

> [Activate: Main] You may trash this Character: Reveal 1 card from the top of your Life cards. If that card is a [Portgas.D.Ace] with a cost of 5, you may play that card. If you do, up to 1 of your Leader gains +2000 power until the end of your opponent's next turn.

**Blocker:** Reveal from Life + conditional play based on revealed card name and cost.

---

### ~~ST13-014 Monkey.D.Luffy (cost 2)~~ — ENCODED
**Tags:** `REVEAL_CONDITIONAL`

> [Activate: Main] You may trash this Character: Reveal 1 card from the top of your Life cards. If that card is a [Monkey.D.Luffy] with a cost of 5, you may play that card. If you do, up to 1 of your Leader gains +2000 power until the end of your opponent's next turn.

**Blocker:** Reveal from Life + conditional play based on revealed card name and cost.

---

## ST17 Deferred Cards (0 remaining)

### ~~ST17-001 Crocodile~~ — ENCODED
**Tags:** `REVEAL_CONDITIONAL`

> [On Play] Reveal 1 card from the top of your deck. If that card is a {The Seven Warlords of the Sea} type card, draw 2 cards and place 1 card from your hand at the top of your deck.

**Blocker:** Reveal top card + conditional branch based on revealed card's trait.

---

## ST20 Deferred Cards (0 remaining)

### ~~ST20-001 Charlotte Katakuri~~ — ENCODED
Blocker + Activate Main with TURN_LIFE_FACE_UP cost fully encoded in `st20.ts`.

---

## ST22 Deferred Cards (0 remaining)

### ~~ST22-003 Edward.Newgate (On Play effect only)~~ — ENCODED
**Tags:** `REVEAL_CONDITIONAL`

> [On Play] Reveal 1 card from the top of your deck. If that card's type includes "Whitebeard Pirates", draw 2 cards.

**Blocker:** Reveal top card, check trait, conditionally draw.

**Note:** [Double Attack] keyword is encoded in `st22.ts`.

**Unblocked by:** Same REVEAL pipeline as OP01-060.

---

### ~~ST22-006 Jozu~~ — ENCODED
**Tags:** `REVEAL_CONDITIONAL`

> [On Play] Reveal 1 card from the top of your deck. If that card's type includes "Whitebeard Pirates", draw 2 cards and trash 1 card from your hand.

**Blocker:** Reveal top card, check trait, conditionally draw + trash.

**Unblocked by:** Same REVEAL pipeline as OP01-060.

---

### ~~ST22-007 Squard~~ — ENCODED
**Tags:** `REVEAL_CONDITIONAL`

> [Activate: Main] [Once Per Turn] Reveal 1 card from the top of your deck. If that card's type includes "Whitebeard Pirates", give up to 1 rested DON!! card to your Leader or 1 of your Characters.

**Blocker:** Reveal top card, check trait, conditionally give DON.

**Unblocked by:** Same REVEAL pipeline as OP01-060.

---

### ~~ST22-012 Marco (When Attacking effect only)~~ — ENCODED
**Tags:** `REVEAL_CONDITIONAL`

> [When Attacking] Reveal 1 card from the top of your deck. If that card's type includes "Whitebeard Pirates", this Character gains +1000 power until the end of your opponent's next turn.

**Blocker:** Reveal top card, check trait, conditionally grant power.

**Note:** Replacement effect (K.O. protection) is encoded in `st22.ts`.

**Unblocked by:** Same REVEAL pipeline as OP01-060.

---

### ~~ST22-016 Take That Back!! (Counter effect only)~~ — ENCODED
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
| ~~`REVEAL_CONDITIONAL`~~ | ~~OP01-060 plus the OPT-475 20-card reconciled cohort~~ | 0 | Done |
| ~~`HAND_ZONE_MODIFIER`~~ | ~~OP14-053~~ | 0 | Done |
| ~~`FULL_DECK_SEARCH_AND_PLAY`~~ | ~~OP13-079~~ | 0 | Done |
| ~~`LIFE_FACE_COST`~~ | ~~ST13-009, ST20-001, P-106~~ | 0 | Done |
| ~~`HAND_REVEAL_CONDITIONAL`~~ | ~~OP01-063, OP01-105~~ | 0 | Done |
| ~~`NEXT_EVENT_COST_REDUCTION`~~ | ~~OP02-025, OP12-061~~ | 0 | Done |
| ~~`SELF_REF_TRACKING`~~ | ~~OP01-062~~ | 0 | Done (approx.) |

---

## M4.5 QA Findings — Final Disposition

The Phase 1 validation sweep mixed genuine gaps with coarse-detector false
positives. The runtime-backed schema gate now requires every authored action to
have a handler and executable coverage, and every low-confidence finding must
have a disposition in this document or
[SCHEMA-QA-DISPOSITIONS.md](SCHEMA-QA-DISPOSITIONS.md).

### ~~Cards Using Unhandled Action Types (F9)~~ — ALL RESOLVED

All 18 action types now have handlers registered in `resolver.ts`. The F9 scan was run before
handlers were implemented. Additionally, `SEARCH_TRASH_THE_REST` resume handler was added
to process player card selections.

`ADD_TO_LIFE` (EB02-057) was a false positive — the schema correctly uses `ADD_TO_LIFE_FROM_FIELD`.

### Low-Confidence Encodings

The current detector reports 51 findings across 50 unique cards. It is
intentionally conservative: composite search/play actions, reveal costs,
permanent hand modifiers, and reference-driven targets do not satisfy its
single-action heuristics even when the authored schema is complete.

OPT-484 re-ran the 17-card cohort recorded in
[SCHEMA-QA-DISPOSITIONS.md](SCHEMA-QA-DISPOSITIONS.md): 15 were implemented
false positives and 2 real schema/UI defects (ST12-017 and ST22-011), both
corrected with executable regressions. Other current findings already have
encoded historical entries above. The remaining coarse-detector false
positives are grouped here so the disposition gate reflects current runtime
output rather than the stale `~80` estimate:

| Pattern | Cards | Disposition |
|---|---|---|
| `SEARCH_TRASH_THE_REST` | OP01-116, OP06-003, OP08-007, OP11-051, OP14-010, EB01-009, EB02-025, ST12-013 | Implemented with `SEARCH_AND_PLAY` (and ST12-013's separate `DECK_SCRY`); the heuristic does not recognize composite play/rest handling. |
| `BASE_POWER_BECOMES` | OP04-069, OP06-009, EB01-061, EB04-003 | Implemented with `COPY_POWER` or the permanent set-power modifier layer; the heuristic only recognizes the action-form base-power setter. |
| `REVEAL_WITHOUT_ACTION` | OP06-057, OP06-119, OP08-040, ST11-001, ST12-010, ST12-013, ST22-001 | Implemented by `SEARCH_AND_PLAY`, `SEARCH_DECK`, or `REVEAL_FROM_HAND` costs; the heuristic only recognizes an action literally named `REVEAL`. |
| `PLAY_FROM_DECK` | OP08-071 | Implemented as a named `PLAY_CARD` target from `DECK`, followed by `SHUFFLE_DECK`. |
| `HAND_COST_REDUCTION` | OP11-023, EB04-061, PRB02-014 | Implemented as conditional hand-zone `MODIFY_COST` permanent modifiers; the detector always flags this high-risk wording for review. |
| `SAME_NAME_AS_TRASHED` | EB02-039 | Implemented with the implicit `__cost_cards_trashed` result and `name_matching_ref`; semantic validation and post-cost regressions cover the reference. |

All 51 findings have a checked-in disposition. None remains deferred or
silently playable with a known partial effect.

### Totals

| Category | Current inventory | Open / deferred | Playable exclusions |
|---|---:|---:|---:|
| Historical card entries in this document | 38 cards | 0 | 0 |
| OPT-475 conditional-reveal cohort (subset above, reconciled from 19) | 20 cards | 0 | 0 |
| Runtime low-confidence detector | 51 findings / 50 cards | 0 | 0 |
| Authored action inventory | 3,574 uses / 73 authored types | 0 unhandled or unexecuted | 0 |
| **Tracked cards still needing disposition** | — | **0** | **0** |
