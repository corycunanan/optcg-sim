# 11 — Encoding Guide

> Quick-reference for encoding OPTCG card text into effect schema JSON. Designed for AI agent consumption.
> For full type definitions, see the spec files (01-10). For complete examples, see [09-EXAMPLE-ENCODINGS.md](./09-EXAMPLE-ENCODINGS.md).

---

## How to Encode a Card

1. **Read** the full card text top to bottom.
2. **Split** into independent effect blocks. Each bracket tag (`[On Play]`, `[Activate: Main]`, `[Blocker]`, `[Trigger]`, etc.) or standalone paragraph = one EffectBlock.
3. **Classify** each block into a category (see table below).
4. **For each block:** identify trigger, conditions, costs, actions, duration, flags.
5. **Encode** using the pattern tables in this document.
6. **Validate** against the checklist at the bottom.

---

## Category Classification

| If you see... | Category | Key fields |
|---|---|---|
| `[On Play]`, `[When Attacking]`, `[On K.O.]`, `[On Block]`, `[Counter]`, `[Trigger]`, `[End of Your Turn]`, `[On Your Opponent's Attack]`, "When X happens..." | `auto` | trigger + actions |
| `[Activate: Main]`, `[Main]` on an Event | `activate` | trigger + costs + actions |
| Static text with no trigger: "This Character gains...", "cannot...", "+X power", keyword grants to populations | `permanent` | modifiers and/or prohibitions |
| "If X would be K.O.'d... instead", "would be removed... instead" | `replacement` | replaces + replacement_actions |
| "Under the rules of this game", "according to the rules", "Also treat this card's name as", deck restrictions, "you may have any number" | `rule_modification` | rule |

---

## Trigger Patterns

### Keyword Triggers

| Card Text | Trigger Encoding |
|---|---|
| `[On Play]` | `{ "keyword": "ON_PLAY" }` |
| `[When Attacking]` | `{ "keyword": "WHEN_ATTACKING" }` |
| `[On K.O.]` | `{ "keyword": "ON_KO" }` |
| `[On Block]` | `{ "keyword": "ON_BLOCK" }` |
| `[On Your Opponent's Attack]` | `{ "keyword": "ON_OPPONENT_ATTACK" }` |
| `[Activate: Main]` | `{ "keyword": "ACTIVATE_MAIN" }` |
| `[Main]` (on Event) | `{ "keyword": "MAIN_EVENT" }` |
| `[Counter]` | `{ "keyword": "COUNTER" }` |
| `[Trigger]` | `{ "keyword": "TRIGGER" }` |
| `[End of Your Turn]` | `{ "keyword": "END_OF_YOUR_TURN" }` |
| `[End of Your Opponent's Turn]` | `{ "keyword": "END_OF_OPPONENT_TURN" }` |
| "at the start of your turn" | `{ "keyword": "START_OF_TURN" }` |

### Custom Event Triggers

| Card Text | Trigger Encoding |
|---|---|
| "When your opponent's Character is K.O.'d" | `{ "event": "OPPONENT_CHARACTER_KO" }` |
| "When a Character is K.O.'d" | `{ "event": "ANY_CHARACTER_KO" }` |
| "When a DON!! card on your field is returned to your DON!! deck" | `{ "event": "DON_RETURNED_TO_DON_DECK", "filter": { "controller": "SELF" } }` |
| "When 2 or more DON!! cards...returned" | above + `"quantity_threshold": 2` |
| "When...returned to your DON!! deck by your effect" | above + `"filter": { "controller": "SELF", "cause": "BY_YOUR_EFFECT" }` |
| "When...given a DON!! card" | `{ "event": "DON_GIVEN_TO_CARD" }` |
| "When your opponent activates an Event" | `{ "event": "EVENT_ACTIVATED", "filter": { "controller": "OPPONENT" } }` |
| "When you play a Character" | `{ "event": "CHARACTER_PLAYED", "filter": { "controller": "SELF" } }` |
| "When your opponent plays a Character with base cost 8+" | `{ "event": "CHARACTER_PLAYED", "filter": { "controller": "OPPONENT", "target_filter": { "base_cost_min": 8 } } }` |
| "When a card is removed from your or your opponent's Life cards" | `{ "event": "CARD_REMOVED_FROM_LIFE", "filter": { "controller": "EITHER" } }` |
| "When a [Trigger] activates" | `{ "event": "TRIGGER_ACTIVATED" }` |
| "When this Character battles and K.O.'s your opponent's Character" | `{ "event": "COMBAT_VICTORY" }` |
| "At the end of a battle in which this Character battles your opponent's Character" | `{ "event": "END_OF_BATTLE", "filter": { "battle_target_type": "CHARACTER" } }` |
| "When your number of Life cards becomes 0" | `{ "event": "LIFE_COUNT_BECOMES_ZERO", "filter": { "controller": "SELF" } }` |
| "When a card is added to your hand from your Life" | `{ "event": "CARD_ADDED_TO_HAND_FROM_LIFE" }` |
| "When you draw a card outside of your Draw Phase" | `{ "event": "DRAW_OUTSIDE_DRAW_PHASE" }` |
| "When this Character becomes rested" | `{ "event": "CHARACTER_BECOMES_RESTED" }` |
| "When this Character becomes rested by your opponent's effect" | `{ "event": "CHARACTER_BECOMES_RESTED", "filter": { "cause": "BY_OPPONENT_EFFECT" } }` |
| "When your opponent's Character is returned to the owner's hand by your effect" | `{ "event": "CHARACTER_RETURNED_TO_HAND", "filter": { "controller": "OPPONENT", "cause": "BY_YOUR_EFFECT" } }` |
| "When you take damage" | `{ "event": "DAMAGE_TAKEN" }` |
| "When your opponent activates [Blocker]" | `{ "event": "BLOCKER_ACTIVATED", "filter": { "controller": "OPPONENT" } }` |
| "When this Leader's attack deals damage to your opponent's Life" | `{ "event": "LEADER_ATTACK_DEALS_DAMAGE" }` |

### Compound Triggers

| Card Text | Trigger Encoding |
|---|---|
| `[On Play]/[When Attacking]` | `{ "any_of": [{ "keyword": "ON_PLAY" }, { "keyword": "WHEN_ATTACKING" }] }` |
| `[Main]/[Counter]` | `{ "any_of": [{ "keyword": "MAIN_EVENT" }, { "keyword": "COUNTER" }] }` |
| "When you take damage **or** your Character...is K.O.'d" | `{ "any_of": [{ "event": "DAMAGE_TAKEN" }, { "event": "ANY_CHARACTER_KO", ... }] }` |

### Trigger Modifiers

| Card Text | Add to trigger |
|---|---|
| `[Your Turn]` prefix | `"turn_restriction": "YOUR_TURN"` |
| `[Opponent's Turn]` prefix | `"turn_restriction": "OPPONENT_TURN"` |
| `[Once Per Turn]` prefix | `"once_per_turn": true` |
| `[DON!! x2]` prefix | `"don_requirement": 2` |
| "K.O.'d by your opponent's effect" | `"cause": "OPPONENT_EFFECT"` (ON_KO only) |

---

## Condition Patterns

| Card Text | Condition Encoding |
|---|---|
| "If you have N or less Life cards" | `{ "type": "LIFE_COUNT", "controller": "SELF", "operator": "<=", "value": N }` |
| "If your opponent has N or less Life cards" | `{ "type": "LIFE_COUNT", "controller": "OPPONENT", "operator": "<=", "value": N }` |
| "If you have N or less cards in your hand" | `{ "type": "HAND_COUNT", "controller": "SELF", "operator": "<=", "value": N }` |
| "If you have N or more cards in your trash" | `{ "type": "TRASH_COUNT", "controller": "SELF", "operator": ">=", "value": N }` |
| "If you have N or less cards in your deck" | `{ "type": "DECK_COUNT", "controller": "SELF", "operator": "<=", "value": N }` |
| "If you have N DON!! cards on your field" | `{ "type": "DON_FIELD_COUNT", "controller": "SELF", "operator": ">=", "value": N }` |
| "If you have N or more active DON!! cards" | `{ "type": "ACTIVE_DON_COUNT", "controller": "SELF", "operator": ">=", "value": N }` |
| "If all of your DON!! cards are rested" | `{ "type": "ALL_DON_STATE", "controller": "SELF", "required_state": "RESTED" }` |
| "If you have [Name]..." | `{ "type": "CARD_ON_FIELD", "controller": "SELF", "filter": { "name": "Name" } }` |
| "If you don't have [Name]..." | `{ "not": { "type": "CARD_ON_FIELD", "controller": "SELF", "filter": { "name": "Name" } } }` |
| "If you have [A] and [B]..." | `{ "type": "MULTIPLE_NAMED_CARDS", "controller": "SELF", "names": ["A", "B"] }` |
| "If you have [Name] with N power or more" | `{ "type": "NAMED_CARD_WITH_PROPERTY", "controller": "SELF", "name": "Name", "property": { "power": { "operator": ">=", "value": N } } }` |
| "If the only Characters on your field are {Trait} type" | `{ "type": "FIELD_PURITY", "controller": "SELF", "filter": { "traits": ["Trait"] } }` |
| "If your Leader's type includes X" | `{ "type": "LEADER_PROPERTY", "controller": "SELF", "property": { "trait": "X" } }` |
| "If your Leader has 0 power or less" | `{ "type": "LEADER_PROPERTY", "controller": "SELF", "property": { "power": { "operator": "<=", "value": 0 } } }` |
| "If your Leader's colors include blue" | `{ "type": "LEADER_PROPERTY", "controller": "SELF", "property": { "color_includes": "BLUE" } }` |
| "If this Character has N power or more" | `{ "type": "SELF_POWER", "operator": ">=", "value": N }` |
| "If this Character is rested" | `{ "type": "SELF_STATE", "required_state": "RESTED" }` |
| "If this Character was played on this turn" | `{ "type": "WAS_PLAYED_THIS_TURN" }` |
| "If you have less Life cards than your opponent" | `{ "type": "COMPARATIVE", "metric": "LIFE_COUNT", "operator": "<" }` |
| "you and your opponent have a total of N or less Life cards" | `{ "type": "COMBINED_TOTAL", "metric": "LIFE_COUNT", "operator": "<=", "value": N }` |
| "If either you or your opponent has N DON!! on the field" | `{ "type": "DON_FIELD_COUNT", "controller": "EITHER", "operator": ">=", "value": N }` |
| "If you have a face-up Life card" | `{ "type": "FACE_UP_LIFE", "controller": "SELF" }` |
| "N or more Events in your trash" | `{ "type": "CARD_TYPE_IN_ZONE", "controller": "SELF", "card_type": "EVENT", "zone": "TRASH", "operator": ">=", "value": N }` |
| "a total of N or less cards in your Life area and hand" | `{ "type": "COMBINED_ZONE_COUNT", "controller": "SELF", "zones": ["LIFE", "HAND"], "operator": "<=", "value": N }` |
| "If there is a Character with N power or more" (either field) | `{ "type": "BOARD_WIDE_EXISTENCE", "filter": { "card_type": "CHARACTER", "power_min": N } }` |
| "If you have N or more rested cards" | `{ "type": "RESTED_CARD_COUNT", "controller": "SELF", "operator": ">=", "value": N }` |
| "If it is your second turn or later" | `{ "type": "TURN_COUNT", "controller": "SELF", "operator": ">=", "value": 2 }` |

### Compound Conditions

| Pattern | Encoding |
|---|---|
| "If A **and** B" | `{ "all_of": [condA, condB] }` |
| "If A **or** B" | `{ "any_of": [condA, condB] }` |
| "you don't have..." / "there are no..." | `{ "not": condition }` |
| "no other [Name]" | `{ "not": { "type": "CARD_ON_FIELD", ..., "exclude_self": true } }` |

---

## Cost Patterns

| Card Text | Cost Encoding |
|---|---|
| `DON!! -N` (before colon) | `{ "type": "DON_MINUS", "amount": N }` |
| circle symbols (e.g. `①`) | `{ "type": "DON_REST", "amount": 1 }` |
| "You may rest this Leader:" | `{ "type": "REST_SELF" }` |
| "You may trash N card(s) from your hand:" | `{ "type": "TRASH_FROM_HAND", "amount": N }` |
| "trash 1 card with type including {Trait} from your hand:" | `{ "type": "TRASH_FROM_HAND", "amount": 1, "filter": { "traits": ["Trait"] } }` |
| "K.O. 1 of your Characters:" | `{ "type": "KO_OWN_CHARACTER", "amount": 1 }` |
| "return 1 of your Characters to your hand:" | `{ "type": "RETURN_OWN_CHARACTER_TO_HAND" }` |
| "rest any number of your DON!!" | `{ "type": "DON_REST", "amount": "ANY_NUMBER" }` |

**Key rule:** Everything before the colon (`:`) in auto/activate text is a cost. Everything after is actions.

---

## Action Patterns

### Card Movement

| Card Text | Action Encoding |
|---|---|
| "Draw N card(s)" | `{ "type": "DRAW", "params": { "amount": N } }` |
| "Look at N cards from the top of your deck; reveal up to M ... and add to your hand. Then, place the rest at the bottom" | `{ "type": "SEARCH_DECK", "params": { "look_at": N, "pick": { "up_to": M }, "filter": {...}, "rest_destination": "BOTTOM" } }` |
| Same but "trash the rest" | `{ "type": "SEARCH_TRASH_THE_REST", "params": { "look_at": N, "pick": { "up_to": M }, "filter": {...} } }` |
| "Search your deck for up to 1 ... add to hand, then shuffle" | `{ "type": "FULL_DECK_SEARCH", "params": { "pick": { "up_to": 1 }, "filter": {...} } }` |
| "Look at N cards...play up to 1...place the rest at the bottom" | `{ "type": "SEARCH_AND_PLAY", "params": { "look_at": N, "pick": { "up_to": 1 }, "filter": {...}, "cost_override": "FREE", "rest_destination": "BOTTOM" } }` |
| "K.O. up to N of your opponent's Characters with cost X or less" | `{ "type": "KO", "target": { "type": "CHARACTER", "controller": "OPPONENT", "count": { "up_to": N }, "filter": { "cost_max": X } } }` |
| "Return up to N of your opponent's Characters with cost X or less to the owner's hand" | `{ "type": "RETURN_TO_HAND", "target": { ..., "count": { "up_to": N }, "filter": { "cost_max": X } } }` |
| "Place...at the bottom of the owner's deck" | `{ "type": "RETURN_TO_DECK", "params": { "position": "BOTTOM" }, "target": {...} }` |
| "Play up to 1 {Trait} Character with cost X or less from your hand" | `{ "type": "PLAY_CARD", "target": { "type": "CHARACTER_CARD", "source_zone": "HAND", "count": { "up_to": 1 }, "filter": { "traits": ["Trait"], "cost_max": X } }, "params": { "source_zone": "HAND", "cost_override": "FREE" } }` |
| "Play...from your trash rested" | above with `"source_zone": "TRASH"` and `"play_state": "RESTED"` |
| "Trash N cards from the top of your deck" | `{ "type": "MILL", "params": { "amount": N } }` |
| "Place N card(s) from your hand at the bottom of your deck" | `{ "type": "PLACE_HAND_TO_DECK", "params": { "amount": N, "position": "BOTTOM" } }` |
| "Look at N cards from the top of your deck; place them at the top or bottom" | `{ "type": "DECK_SCRY", "params": { "count": N } }` |

### Power and Stats

| Card Text | Action Encoding |
|---|---|
| "give...+N power during this turn" | `{ "type": "MODIFY_POWER", "params": { "amount": N }, "duration": { "type": "THIS_TURN" } }` |
| "give...-N power during this turn" | `{ "type": "MODIFY_POWER", "params": { "amount": -N }, "duration": { "type": "THIS_TURN" } }` |
| "set this card's base power to 0" | `{ "type": "SET_BASE_POWER", "params": { "value": 0 } }` |
| "give...-N cost during this turn" | `{ "type": "MODIFY_COST", "params": { "amount": -N }, "duration": { "type": "THIS_TURN" } }` |

### Keywords

| Card Text | Action Encoding |
|---|---|
| "gains [Rush]" | `{ "type": "GRANT_KEYWORD", "params": { "keyword": "RUSH" } }` |
| "gains [Blocker]" | `{ "type": "GRANT_KEYWORD", "params": { "keyword": "BLOCKER" } }` |
| "gains [Double Attack]" | `{ "type": "GRANT_KEYWORD", "params": { "keyword": "DOUBLE_ATTACK" } }` |
| "gains [Banish]" | `{ "type": "GRANT_KEYWORD", "params": { "keyword": "BANISH" } }` |
| "can also attack...active Characters" | `{ "type": "GRANT_KEYWORD", "params": { "keyword": "CAN_ATTACK_ACTIVE" } }` |
| "can attack Characters on the turn played" | `{ "type": "GRANT_KEYWORD", "params": { "keyword": "RUSH_CHARACTER" } }` |

### DON!! Manipulation

| Card Text | Action Encoding |
|---|---|
| "give this Leader/Character up to N DON!!" | `{ "type": "GIVE_DON", "params": { "amount": N } }` |
| "add N DON!! from your DON!! deck to your field active" | `{ "type": "ADD_DON_FROM_DECK", "params": { "amount": N, "target_state": "ACTIVE" } }` |
| "return N DON!! from your field to the DON!! deck" | `{ "type": "RETURN_DON_TO_DECK", "params": { "amount": N, "source": "ANY" } }` |
| "set N of your DON!! cards as active" | `{ "type": "SET_DON_ACTIVE", "params": { "amount": N } }` |
| "your opponent returns N DON!! to their DON!! deck" | `{ "type": "FORCE_OPPONENT_DON_RETURN", "params": { "amount": N } }` |

### Life Manipulation

| Card Text | Action Encoding |
|---|---|
| "Add N card(s) from the top of your deck to the top of your Life cards" | `{ "type": "ADD_TO_LIFE_FROM_DECK", "params": { "amount": N, "position": "TOP", "face": "DOWN" } }` |
| "Trash N card(s) from the top of your Life cards" | `{ "type": "TRASH_FROM_LIFE", "params": { "amount": N, "position": "TOP" } }` |
| "Turn N Life cards face-up" | `{ "type": "TURN_LIFE_FACE_UP", "params": { "amount": N, "position": "TOP" } }` |

### Meta / Flow

| Card Text | Action Encoding |
|---|---|
| "choose one:" (controller chooses) | `{ "type": "PLAYER_CHOICE", "params": { "options": [[branch1], [branch2]] } }` |
| "Your opponent chooses one:" | `{ "type": "OPPONENT_CHOICE", "params": { "mandatory": true, "options": [[branch1], [branch2]] } }` |
| "your opponent returns 1..." (opponent performs) | `{ "type": "OPPONENT_ACTION", "params": { "mandatory": true, "action": {...} } }` |
| "[Trigger] Activate this card's [Counter] effect" | `{ "type": "REUSE_EFFECT", "params": { "target_effect": "COUNTER" } }` |
| "[Trigger] Activate this card's [Main] effect" | `{ "type": "REUSE_EFFECT", "params": { "target_effect": "MAIN_EVENT" } }` |
| "at the end of this turn, trash..." (deferred) | `{ "type": "SCHEDULE_ACTION", "params": { "timing": "END_OF_THIS_TURN", "action": {...} } }` |

---

## Targeting Patterns

| Card Text | Target Encoding |
|---|---|
| "this card" / "this Character" / "this Leader" | `{ "type": "SELF" }` |
| "your Leader" | `{ "type": "YOUR_LEADER" }` |
| "up to 1 of your Characters" | `{ "type": "CHARACTER", "controller": "SELF", "count": { "up_to": 1 } }` |
| "1 of your opponent's Characters" | `{ "type": "CHARACTER", "controller": "OPPONENT", "count": { "exact": 1 } }` |
| "all of your opponent's Characters" | `{ "type": "ALL_OPPONENT_CHARACTERS" }` |
| "your Leader or up to 1 of your Characters" | `{ "type": "LEADER_OR_CHARACTER", "controller": "SELF", "count": { "up_to": 1 } }` |
| "up to 1 of your opponent's Characters with cost X or less" | `{ "type": "CHARACTER", "controller": "OPPONENT", "count": { "up_to": 1 }, "filter": { "cost_max": X } }` |
| "a {Trait} type Character card" (in hand/trash/deck) | `{ "type": "CHARACTER_CARD", "source_zone": "...", "filter": { "traits": ["Trait"] } }` |
| "K.O. all Characters other than this Character" | `{ "type": "CHARACTER", "controller": "EITHER", "count": { "all": true }, "filter": { "exclude_self": true } }` |
| "with a cost of 3 to 5" | `filter: { "cost_range": { "min": 3, "max": 5 } }` |
| "with a cost of 0 or cost of 8 or more" | `filter: { "any_of": [{ "cost_exact": 0 }, { "cost_min": 8 }] }` |
| "with different card names" (multi-select) | add `"uniqueness_constraint": { "field": "name" }` to target |
| "a total power of N or less" (multi-select) | add `"aggregate_constraint": { "property": "power", "operator": "<=", "value": N }` |
| "with a DON!! card given" | `filter: { "don_given_count": { "operator": ">=", "value": 1 } }` |
| "Characters without a [When Attacking] effect" | `filter: { "lacks_effect_type": "WHEN_ATTACKING" }` |
| "Character card with a [Trigger]" | `filter: { "has_trigger": true }` |
| "Character with no base effect" | `filter: { "no_base_effect": true }` |
| "a <Special> attribute Character" | `filter: { "attribute": "SPECIAL" }` |
| "other than [Name]" | `filter: { "exclude_name": "Name" }` |

---

## Duration Patterns

| Card Text | Duration Encoding |
|---|---|
| "during this turn" | `{ "type": "THIS_TURN" }` |
| "during this battle" | `{ "type": "THIS_BATTLE" }` |
| "until the end of your opponent's next End Phase" | `{ "type": "UNTIL_END_OF_OPPONENT_NEXT_END_PHASE" }` |
| "until the end of your opponent's next turn" | `{ "type": "UNTIL_END_OF_OPPONENT_NEXT_TURN" }` |
| "until the end of your next turn" | `{ "type": "UNTIL_END_OF_YOUR_NEXT_TURN" }` |
| "until the start of your next turn" | `{ "type": "UNTIL_START_OF_YOUR_NEXT_TURN" }` |
| No duration text on a permanent block | `{ "type": "PERMANENT" }` (implicit) |

---

## Chain Patterns

| Card Text | Chain Connector |
|---|---|
| "Then," (next action always executes) | `"chain": "THEN"` |
| "If you do," (next action only if prior succeeded) | `"chain": "IF_DO"` |
| Two simultaneous effects | `"chain": "AND"` |

### Back-References

When a later action refers to "that card" or the result of a prior action:

1. Add `"result_ref": "ref_id"` to the first action.
2. Add `"target_ref": "ref_id"` to the later action.

Example: "+2000 power to 1 Character. Then, if 2 or less Life, **that card** gains +2000 more."

```json
[
  { "type": "MODIFY_POWER", "target": {...}, "params": { "amount": 2000 }, "result_ref": "boosted" },
  { "type": "MODIFY_POWER", "target_ref": "boosted", "params": { "amount": 2000 }, "chain": "THEN", "conditions": { "type": "LIFE_COUNT", "controller": "SELF", "operator": "<=", "value": 2 } }
]
```

### Dynamic Values

| Card Text | Dynamic Value |
|---|---|
| "for every DON!! rested this way" (x2000) | `{ "type": "PER_COUNT", "source": "DON_RESTED_THIS_WAY", "multiplier": 2000 }` |
| "+1000 for every 2 Events in your trash" | `{ "type": "PER_COUNT", "source": "EVENTS_IN_TRASH", "multiplier": 1000, "divisor": 2 }` |
| "cost equal to or less than your opponent's Life count" | `{ "type": "GAME_STATE", "source": "OPPONENT_LIFE_COUNT" }` |
| "draw cards equal to the number returned" | `{ "type": "ACTION_RESULT", "ref": "returned_count" }` |

---

## Prohibition Patterns

| Card Text | Prohibition Encoding |
|---|---|
| "cannot attack" | `{ "type": "CANNOT_ATTACK" }` |
| "cannot be K.O.'d" | `{ "type": "CANNOT_BE_KO" }` |
| "cannot be K.O.'d in battle" | `{ "type": "CANNOT_BE_KO", "scope": { "cause": "IN_BATTLE" } }` |
| "cannot be K.O.'d by your opponent's effects" | `{ "type": "CANNOT_BE_KO", "scope": { "cause": "BY_EFFECT", "source_filter": { "controller": "OPPONENT" } } }` |
| "cannot activate [Blocker]" | `{ "type": "CANNOT_ACTIVATE_BLOCKER" }` (apply via `APPLY_PROHIBITION`) |
| "cannot be rested by your opponent's effects" | `{ "type": "CANNOT_BE_RESTED", "scope": { "source_filter": { "controller": "OPPONENT" } } }` |
| "cannot be removed from the field by your opponent's effects" | `{ "type": "CANNOT_BE_REMOVED_FROM_FIELD", "scope": { "source_filter": { "controller": "OPPONENT" } } }` |
| "cannot play Character cards during this turn" | `{ "type": "CANNOT_PLAY_CARDS" }` with `duration: THIS_TURN` |
| "Once per turn, cannot be K.O.'d" | `{ "type": "CANNOT_BE_KO", "scope": { "uses_per_turn": 1 } }` |

Prohibitions on a card itself go in `category: "permanent"` with `prohibitions: [...]`.
Prohibitions applied by an effect to a target go in an action: `{ "type": "APPLY_PROHIBITION", "params": { "prohibition_type": "..." } }`.

---

## Replacement Patterns

| Card Text | Replacement Encoding |
|---|---|
| "If this/your Character would be K.O.'d... instead" | `replaces: { "event": "WOULD_BE_KO" }` |
| "If your Character with base cost 4+ would be K.O.'d..." | `replaces: { "event": "WOULD_BE_KO", "target_filter": { "controller": "SELF", "base_cost_min": 4 } }` |
| "would be removed from the field by your opponent's effect... instead" | `replaces: { "event": "WOULD_BE_REMOVED_FROM_FIELD", "cause_filter": { "by": "OPPONENT_EFFECT" } }` |
| "When your deck is reduced to 0, you win instead" | `replaces: { "event": "WOULD_LOSE_GAME" }` with `replacement_actions: [{ "type": "WIN_GAME" }]` |

Replacement effects use `category: "replacement"` with `replaces` + `replacement_actions`.
Add `flags: { "optional": true }` when the text says "you may...instead."

---

## Special Patterns

| Card Text | Encoding Pattern |
|---|---|
| `[Blocker]`, `[Rush]`, etc. (intrinsic keywords) | `category: "permanent"`, `flags: { "keywords": ["BLOCKER"] }` |
| "Also treat this card's name as [Name]" | `category: "rule_modification"`, `rule: { "rule_type": "NAME_ALIAS", "aliases": ["Name"] }`, `zone: "ANY"` |
| "you cannot include Events with cost 2+ in your deck" | `category: "rule_modification"`, `rule: { "rule_type": "DECK_RESTRICTION", "restriction": "CANNOT_INCLUDE", "filter": { "card_type": "EVENT", "cost_min": 2 } }` |
| "you may have any number of this card in your deck" | `category: "rule_modification"`, `rule: { "rule_type": "COPY_LIMIT_OVERRIDE", "limit": "UNLIMITED" }` |
| "your DON!! deck consists of N cards" | `category: "rule_modification"`, `rule: { "rule_type": "DON_DECK_SIZE_OVERRIDE", "size": N }` |
| "at the start of the game, play..." | `category: "rule_modification"`, `rule: { "rule_type": "START_OF_GAME_EFFECT", "actions": [...] }` |
| "This card in your hand cannot be played by effects" | `category: "permanent"`, `zone: "HAND"`, `prohibitions: [{ "type": "CANNOT_BE_PLAYED_BY_EFFECTS" }]` |
| "give this card in your hand -N cost" | `category: "permanent"`, `zone: "HAND"`, `modifiers: [{ "type": "MODIFY_COST", "target": { "self_ref": true }, "params": { "amount": -N } }]` |

---

## Permanent Modifier Patterns (Auras)

Static effects that continuously apply while the source card is on the field. These use `category: "permanent"` with `modifiers`, NOT auto triggers.

| Card Text | Encoding Pattern |
|---|---|
| "All of your [Name] cards gain [Keyword]" | `permanent` + `modifiers: [{ "type": "GRANT_KEYWORD", "target": { "controller": "SELF", "filter": { "name": "Name" } }, "params": { "keyword": "..." } }]` |
| "Your {Trait} type Characters gain +1000 power" | `permanent` + `modifiers: [{ "type": "MODIFY_POWER", "target": { "controller": "SELF", "card_type": "CHARACTER", "filter": { "traits": ["Trait"] } }, "params": { "amount": 1000 } }]` |
| "{Trait} Characters cannot be K.O.'d in battle" | `permanent` + `prohibitions: [{ "type": "CANNOT_BE_KO", "target": { "filter": { "traits": ["Trait"] } }, "scope": { "cause": "IN_BATTLE" } }]` |
| "The cost of playing {Trait} Characters...reduced by 1" | `permanent` + `modifiers: [{ "type": "MODIFY_COST", "target": { "controller": "SELF", "zone": "HAND", "filter": { "traits": ["Trait"] } }, "params": { "amount": -1 } }]` |
| "Your Leader and Characters...have their effects negated" | `permanent` + `modifiers: [{ "type": "NEGATE_EFFECTS", "target": { "type": "LEADER_OR_CHARACTER", ... } }]` |

Auras automatically apply to new cards entering the field that match the filter, and stop applying when the source card leaves the field.

---

## Tiered Threshold Patterns

When a permanent effect stacks multiple modifier tiers based on game state:

"If 10+ cards in trash: +1000 power. If 20+ cards: also gains [Rush]. If 30+ cards: also cannot be K.O.'d."

Encode as separate `permanent` EffectBlocks, each with its own condition. All qualifying tiers apply simultaneously.

---

## Common Encoding Pitfalls

| Mistake | Correct Approach |
|---|---|
| Encoding intrinsic `[Blocker]` as a `GRANT_KEYWORD` action | Use `flags: { "keywords": ["BLOCKER"] }` on a `permanent` block |
| Using `KO` when the card says "trash" | Use `TRASH_CARD` -- trashing does NOT fire On K.O. triggers |
| Putting conditions after the colon as costs | Only text before `:` is a cost; "If..." clauses are conditions |
| Using `ACTIVATE_MAIN` for Events | Use `MAIN_EVENT` for `[Main]` on Event cards |
| Encoding "cannot activate [Blocker]" as removing the keyword | Use `APPLY_PROHIBITION` with `CANNOT_ACTIVATE_BLOCKER` |
| Using `cost_max` when text says "base cost" | Use `base_cost_max` -- base checks printed value, ignoring modifications |
| Encoding "opponent cannot activate [Blocker] during this battle" as `UNBLOCKABLE` | Different scope/duration; encode as `APPLY_PROHIBITION` with `THIS_BATTLE` duration |
| Missing `zone: "HAND"` on in-hand effects | Effects active in hand (self-cost-reduction, play restrictions) need `zone: "HAND"` |
| Confusing `SEARCH_DECK` with `FULL_DECK_SEARCH` | "Look at N from top" = `SEARCH_DECK`; "search your deck" (entire deck + shuffle) = `FULL_DECK_SEARCH` |

---

## Flags Quick-Reference

| Card Text | Flag |
|---|---|
| `[Once Per Turn]` | `flags.once_per_turn: true` |
| "You may..." (optional activation) | `flags.optional: true` |
| `[Blocker]` / `[Rush]` / etc. (printed keywords) | `flags.keywords: ["BLOCKER"]` etc. |

---

## Validation Checklist

- [ ] Every effect block has an `id` (e1, e2, ... or descriptive)
- [ ] Category matches content: `auto` has trigger+actions, `permanent` has modifiers/prohibitions, `replacement` has replaces+replacement_actions, `rule_modification` has rule
- [ ] All trigger keywords use exact enum values from [02-TRIGGERS.md](./02-TRIGGERS.md)
- [ ] All condition types use exact types from [03-CONDITIONS.md](./03-CONDITIONS.md)
- [ ] All action types use exact types from [04-ACTIONS.md](./04-ACTIONS.md)
- [ ] Duration matches card text exactly
- [ ] Chain connectors: `THEN` for "Then,", `IF_DO` for "If you do,"
- [ ] `[Once Per Turn]` mapped to `flags.once_per_turn: true`
- [ ] "You may" mapped to `flags.optional: true`
- [ ] Intrinsic keywords in `flags.keywords`, not as actions
- [ ] Costs are before the colon, actions are after
- [ ] Back-references (`result_ref` / `target_ref`) used when a later action refers to "that card"
- [ ] `SELF` used for "this card", `YOUR_LEADER` for "your Leader" on non-Leader cards
- [ ] `base_cost_*` / `base_power_*` used when text says "base cost" / "base power"
- [ ] `cost_*` / `power_*` (non-base) used for effective/current values
- [ ] `zone: "HAND"` set on effects active in hand
- [ ] `zone: "ANY"` set on rule modifications (especially NAME_ALIAS)
- [ ] KO (fires On K.O. triggers) vs TRASH_CARD (does not) distinguished correctly

---

_Last updated: 2026-03-19_
