# 09 — Example Encodings

> Ten fully encoded OPTCG cards that validate the effect schema. Each card demonstrates different schema features and serves as a reference for encoding agents. Every encoding uses only types defined in the spec files (01-10). When the card text exposes a gap in the current spec, the annotation calls it out explicitly.

**Related docs:** [Schema Overview](./01-SCHEMA-OVERVIEW.md) · [Triggers](./02-TRIGGERS.md) · [Conditions](./03-CONDITIONS.md) · [Actions](./04-ACTIONS.md) · [Targeting](./05-TARGETING.md) · [Prohibitions & Replacements](./06-PROHIBITIONS-AND-REPLACEMENTS.md) · [Rule Modifications](./07-RULE-MODIFICATIONS.md) · [Keywords](./10-KEYWORD-REFERENCE.md)

---

### 1. Nami (OP01-016)
**Categories demonstrated:** auto, ON_PLAY trigger, SEARCH_DECK action, name exclusion filter, rest destination

#### Raw Effect Text
[On Play] Look at 5 cards from the top of your deck; reveal up to 1 {Straw Hat Crew} type card other than [Nami] and add it to your hand. Then, place the rest at the bottom of your deck in any order.

#### Schema Encoding
```json
{
  "effects": [
    {
      "id": "on_play_search",
      "category": "auto",
      "trigger": {
        "keyword": "ON_PLAY"
      },
      "actions": [
        {
          "type": "SEARCH_DECK",
          "params": {
            "look_at": 5,
            "pick": { "up_to": 1 },
            "filter": {
              "traits": ["Straw Hat Crew"],
              "exclude_name": "Nami"
            },
            "rest_destination": "BOTTOM"
          }
        }
      ]
    }
  ]
}
```

#### Annotations
- **Trigger:** Standard `ON_PLAY` keyword trigger. Fires when this card enters the field from any zone.
- **SEARCH_DECK vs FULL_DECK_SEARCH:** The "look at 5" cap makes this `SEARCH_DECK` (top-N), not `FULL_DECK_SEARCH` (entire deck + shuffle).
- **Filter — exclude_name:** "other than [Nami]" maps to `exclude_name: "Nami"` in TargetFilter. This prevents selecting another copy of Nami from the top 5.
- **Filter — no card_type restriction:** The text says "card" (not "Character card"), so any card type with {Straw Hat Crew} trait qualifies — Characters, Events, or Stages.
- **rest_destination:** "place the rest at the bottom of your deck in any order" maps to `"BOTTOM"`. The player arranges the unselected cards in any order at the bottom.
- **No flags.optional:** The effect is mandatory once the trigger fires — the player must look at the top 5 and make a selection (choosing 0 is valid via `up_to`).

---

### 2. Vivi (EB03-001)
**Categories demonstrated:** replacement (proxy KO protection), activate (ACTIVATE_MAIN), costs (REST_SELF), THEN chaining, lacks_effect_type filter, GRANT_KEYWORD, once_per_turn flag

#### Raw Effect Text
[Once Per Turn] If your Character with a base cost of 4 or more would be K.O.'d, you may trash 1 card from your hand instead.
[Activate: Main] You may rest this Leader: Give up to 1 of your opponent's Characters -2000 power during this turn. Then, up to 1 of your Characters without a [When Attacking] effect gains [Rush] during this turn.

#### Schema Encoding
```json
{
  "effects": [
    {
      "id": "ko_replacement",
      "category": "replacement",
      "replaces": {
        "event": "WOULD_BE_KO",
        "target_filter": {
          "controller": "SELF",
          "base_cost_min": 4
        }
      },
      "replacement_actions": [
        {
          "type": "TRASH_CARD",
          "target": {
            "type": "CARD_IN_HAND",
            "controller": "SELF",
            "count": { "exact": 1 }
          }
        }
      ],
      "flags": {
        "once_per_turn": true,
        "optional": true
      }
    },
    {
      "id": "activate_main",
      "category": "activate",
      "trigger": {
        "keyword": "ACTIVATE_MAIN"
      },
      "costs": [
        { "type": "REST_SELF" }
      ],
      "actions": [
        {
          "type": "MODIFY_POWER",
          "target": {
            "type": "CHARACTER",
            "controller": "OPPONENT",
            "count": { "up_to": 1 }
          },
          "params": { "amount": -2000 },
          "duration": { "type": "THIS_TURN" }
        },
        {
          "type": "GRANT_KEYWORD",
          "target": {
            "type": "CHARACTER",
            "controller": "SELF",
            "count": { "up_to": 1 },
            "filter": {
              "lacks_effect_type": "WHEN_ATTACKING"
            }
          },
          "params": { "keyword": "RUSH" },
          "duration": { "type": "THIS_TURN" },
          "chain": "THEN"
        }
      ],
      "flags": { "optional": true }
    }
  ]
}
```

#### Annotations
- **Two independent EffectBlocks:** This Leader has a replacement effect and an activate effect. They are separate blocks because they have different categories and triggers.
- **Proxy replacement:** The `target_filter` on `replaces` scopes protection to characters with base cost 4+. This is a proxy replacement — Vivi (the source card) protects other cards, not just herself. See [06 — Proxy Replacement Effects](./06-PROHIBITIONS-AND-REPLACEMENTS.md).
- **base_cost_min:** "base cost of 4 or more" uses `base_cost_min: 4` in the filter. This checks the printed cost, ignoring in-game cost modifications.
- **once_per_turn + optional:** The replacement can only intercept one KO per turn (`once_per_turn: true`) and the player may decline (`optional: true`).
- **REST_SELF cost:** "You may rest this Leader" is both the cost (`REST_SELF`) and the optionality flag. The "you may" is encoded via `flags.optional`.
- **THEN chain:** The power reduction and Rush grant are independent actions connected by `THEN`. The Rush grant executes regardless of whether a target was chosen for the power reduction.
- **lacks_effect_type filter:** "without a [When Attacking] effect" maps to `lacks_effect_type: "WHEN_ATTACKING"` in TargetFilter. This checks the card's printed effect blocks, not current in-game state.

---

### 3. Gol.D.Roger (OP13-064)
**Categories demonstrated:** permanent (aura-style effect negation), auto with DON_MINUS cost, MODIFY_POWER on YOUR_LEADER, MODIFY_POWER on ALL_OPPONENT_CHARACTERS, UNTIL_END_OF_OPPONENT_NEXT_END_PHASE duration

#### Raw Effect Text
Your Leader and all of your Characters that do not have a type including "Roger Pirates" have their effects negated.
[On Play] DON!! -3: Your Leader gains +2000 power until the end of your opponent's next End Phase. Then, give all of your opponent's Characters -2000 power until the end of your opponent's next End Phase.

#### Schema Encoding
```json
{
  "effects": [
    {
      "id": "negation_aura",
      "category": "permanent",
      "modifiers": [
        {
          "type": "NEGATE_EFFECTS",
          "target": {
            "type": "LEADER_OR_CHARACTER",
            "controller": "SELF",
            "count": { "all": true }
          }
        }
      ]
    },
    {
      "id": "on_play_power",
      "category": "auto",
      "trigger": {
        "keyword": "ON_PLAY"
      },
      "costs": [
        { "type": "DON_MINUS", "amount": 3 }
      ],
      "actions": [
        {
          "type": "MODIFY_POWER",
          "target": {
            "type": "YOUR_LEADER"
          },
          "params": { "amount": 2000 },
          "duration": { "type": "UNTIL_END_OF_OPPONENT_NEXT_END_PHASE" }
        },
        {
          "type": "MODIFY_POWER",
          "target": {
            "type": "ALL_OPPONENT_CHARACTERS"
          },
          "params": { "amount": -2000 },
          "duration": { "type": "UNTIL_END_OF_OPPONENT_NEXT_END_PHASE" },
          "chain": "THEN"
        }
      ]
    }
  ]
}
```

#### Annotations
- **Negative trait filtering:** The card text restricts negation to cards "that do not have a type including Roger Pirates." The `traits_exclude` filter field on [TargetFilter](./05-TARGETING.md) handles this — cards matching any trait in `traits_exclude` are excluded from the target set. Cards with the Roger Pirates trait retain their effects.
- **Permanent negation as modifier:** The NEGATE_EFFECTS modifier on a permanent block continuously blanks effects on the target population. This is an aura — it applies to all qualifying cards on the field and automatically includes/excludes cards as they enter/leave.
- **DON_MINUS cost:** "DON!! -3" is a cost, not a condition. The player must return 3 DON!! from field to DON!! deck before the actions resolve. If fewer than 3 DON!! are available, the effect cannot be activated.
- **YOUR_LEADER target:** "Your Leader gains +2000 power" targets the controller's Leader specifically, not a selected character. No count or filter needed.
- **ALL_OPPONENT_CHARACTERS target:** "give all of your opponent's Characters -2000 power" targets every opponent character on the field at resolution time. Count is implicit `{ all: true }`.
- **Duration alignment:** Both power modifications share the same duration (`UNTIL_END_OF_OPPONENT_NEXT_END_PHASE`), matching the card text "until the end of your opponent's next End Phase."

---

### 4. Perona
**Categories demonstrated:** auto, ON_PLAY trigger, block-level condition (HAND_COUNT), PLAYER_CHOICE branching, OPPONENT_ACTION, MODIFY_COST (negative)

#### Raw Effect Text
[On Play] If your opponent has 5 or more cards in their hand, choose one:
- Your opponent trashes 1 card from their hand.
- Give up to 1 of your opponent's Characters -3 cost during this turn.

#### Schema Encoding
```json
{
  "effects": [
    {
      "id": "on_play_choice",
      "category": "auto",
      "trigger": {
        "keyword": "ON_PLAY"
      },
      "conditions": {
        "type": "HAND_COUNT",
        "controller": "OPPONENT",
        "operator": ">=",
        "value": 5
      },
      "actions": [
        {
          "type": "PLAYER_CHOICE",
          "params": {
            "options": [
              [
                {
                  "type": "OPPONENT_ACTION",
                  "params": {
                    "mandatory": true,
                    "action": {
                      "type": "TRASH_CARD",
                      "target": {
                        "type": "CARD_IN_HAND",
                        "controller": "OPPONENT",
                        "count": { "exact": 1 }
                      }
                    }
                  }
                }
              ],
              [
                {
                  "type": "MODIFY_COST",
                  "target": {
                    "type": "CHARACTER",
                    "controller": "OPPONENT",
                    "count": { "up_to": 1 }
                  },
                  "params": { "amount": -3 },
                  "duration": { "type": "THIS_TURN" }
                }
              ]
            ]
          }
        }
      ]
    }
  ]
}
```

#### Annotations
- **Block-level condition:** "If your opponent has 5 or more cards in their hand" gates the entire effect. If the opponent has fewer than 5 cards, the effect does not activate at all.
- **PLAYER_CHOICE:** "choose one" with exactly two branches. The controller (Perona's player) selects which option to apply. Each branch is an array of actions (here, one action per branch).
- **Option 1 — OPPONENT_ACTION:** "Your opponent trashes 1 card from their hand" is an opponent-performed action. The OPPONENT_ACTION wrapper delegates the card selection to the opponent (`mandatory: true` — the opponent must trash if this branch is chosen). The opponent chooses which card to discard.
- **Option 2 — MODIFY_COST:** Reducing an opponent's character's cost by 3 is a debuff — it makes the character vulnerable to cost-based removal effects (e.g., "K.O. a character with cost 3 or less"). The `up_to: 1` allows the controller to choose 0 targets.
- **No flags.optional:** The effect is mandatory once conditions are met. The controller must choose one of the two options.

---

### 5. Charlotte Linlin (ST07-010)
**Categories demonstrated:** auto, ON_PLAY trigger, OPPONENT_CHOICE (mandatory), TRASH_FROM_LIFE, ADD_TO_LIFE_FROM_DECK

#### Raw Effect Text
[On Play] Your opponent chooses one:
- Trash 1 card from the top of your opponent's Life cards.
- Add 1 card from the top of your deck to the top of your Life cards.

#### Schema Encoding
```json
{
  "effects": [
    {
      "id": "on_play_opponent_choice",
      "category": "auto",
      "trigger": {
        "keyword": "ON_PLAY"
      },
      "actions": [
        {
          "type": "OPPONENT_CHOICE",
          "params": {
            "mandatory": true,
            "options": [
              [
                {
                  "type": "TRASH_FROM_LIFE",
                  "params": {
                    "amount": 1,
                    "position": "TOP",
                    "controller": "OPPONENT"
                  }
                }
              ],
              [
                {
                  "type": "ADD_TO_LIFE_FROM_DECK",
                  "params": {
                    "amount": 1,
                    "position": "TOP",
                    "face": "DOWN"
                  }
                }
              ]
            ]
          }
        }
      ]
    }
  ]
}
```

#### Annotations
- **OPPONENT_CHOICE vs PLAYER_CHOICE:** "Your opponent chooses one" means the decision belongs to the opponent, not the controller. This uses `OPPONENT_CHOICE` with `mandatory: true` — the opponent must select one branch.
- **Option 1 — TRASH_FROM_LIFE:** "Trash 1 card from the top of your opponent's Life cards" removes a Life card without triggering damage or Trigger effects. The `controller: "OPPONENT"` on the params specifies whose Life is affected. This is bad for the opponent (they lose a Life card).
- **Option 2 — ADD_TO_LIFE_FROM_DECK:** "Add 1 card from the top of your deck to the top of your Life cards" benefits the controller (Linlin's player). The `face: "DOWN"` is the standard Life card orientation.
- **Lose-lose for opponent:** Both options benefit the Linlin player — either the opponent loses a Life card or the Linlin player gains one. This is the classic "punisher choice" pattern where the opponent picks the lesser evil.
- **No conditions:** The effect is unconditional — it always activates on play.

---

### 6. Edward.Newgate (OP08-043)
**Categories demonstrated:** auto, ON_PLAY trigger, compound condition (all_of), LEADER_PROPERTY (trait), LIFE_COUNT, APPLY_PROHIBITION with conditional_override, ALL_OPPONENT_CHARACTERS select-all, UNTIL_END_OF_OPPONENT_NEXT_TURN duration

#### Raw Effect Text
[On Play] If your Leader's type includes "Whitebeard Pirates" and you have 2 or less Life cards, select all of your opponent's Characters on their field. Until the end of your opponent's next turn, none of the selected Characters can attack unless your opponent trashes 2 cards from their hand whenever they attack.

#### Schema Encoding
```json
{
  "effects": [
    {
      "id": "on_play_lockdown",
      "category": "auto",
      "trigger": {
        "keyword": "ON_PLAY"
      },
      "conditions": {
        "all_of": [
          {
            "type": "LEADER_PROPERTY",
            "controller": "SELF",
            "property": { "trait": "Whitebeard Pirates" }
          },
          {
            "type": "LIFE_COUNT",
            "controller": "SELF",
            "operator": "<=",
            "value": 2
          }
        ]
      },
      "actions": [
        {
          "type": "APPLY_PROHIBITION",
          "target": {
            "type": "ALL_OPPONENT_CHARACTERS"
          },
          "params": {
            "prohibition_type": "CANNOT_ATTACK",
            "conditional_override": {
              "action": {
                "type": "TRASH_CARD",
                "target": {
                  "type": "CARD_IN_HAND",
                  "controller": "OPPONENT",
                  "count": { "exact": 2 }
                }
              }
            }
          },
          "duration": { "type": "UNTIL_END_OF_OPPONENT_NEXT_TURN" }
        }
      ]
    }
  ]
}
```

#### Annotations
- **Compound condition (all_of):** "If your Leader's type includes 'Whitebeard Pirates' AND you have 2 or less Life cards" requires both conditions to be true simultaneously. The `all_of` wrapper combines them.
- **LEADER_PROPERTY with trait:** `{ trait: "Whitebeard Pirates" }` checks whether the Leader's type line includes the trait. This is distinct from `name` (card name match).
- **Select-all at resolution time:** "select all of your opponent's Characters on their field" captures the set of characters present when the action resolves. Characters played after this point are NOT affected by the prohibition. The `ALL_OPPONENT_CHARACTERS` target evaluates at resolution time.
- **CANNOT_ATTACK with conditional_override:** "cannot attack unless your opponent trashes 2 cards from their hand" combines a prohibition with an escape clause. Each time a selected character would attack, the opponent may trash 2 cards from hand to bypass the prohibition. The override cost is paid per attack attempt, not once for all.
- **conditional_override bridging 04 and 06:** The `conditional_override` field is defined on the `Prohibition` interface (06) and logically applies when creating a prohibition via `APPLY_PROHIBITION` (04). The engine constructs a Prohibition instance with the override included.
- **Duration:** `UNTIL_END_OF_OPPONENT_NEXT_TURN` means the prohibition persists through the opponent's entire next turn and expires at that turn's end.

---

### 7. Nami (OP03-040)
**Categories demonstrated:** rule_modification (LOSS_CONDITION_MOD), auto with custom trigger (LEADER_ATTACK_DEALS_DAMAGE), MILL action, optional flag

#### Raw Effect Text
When your deck is reduced to 0, you win the game instead of losing, according to the rules.
[DON!! x1] When this Leader's attack deals damage to your opponent's Life, you may trash 1 card from the top of your deck.

#### Schema Encoding
```json
{
  "effects": [
    {
      "id": "deck_out_win",
      "category": "rule_modification",
      "rule": {
        "rule_type": "LOSS_CONDITION_MOD",
        "trigger_event": "DECK_OUT",
        "modification": "WIN_INSTEAD"
      }
    },
    {
      "id": "damage_mill",
      "category": "auto",
      "trigger": {
        "event": "LEADER_ATTACK_DEALS_DAMAGE"
      },
      "actions": [
        {
          "type": "MILL",
          "params": { "amount": 1 }
        }
      ],
      "flags": { "optional": true }
    }
  ]
}
```

#### Annotations
- **rule_modification vs replacement:** "according to the rules" in the card text signals this is a rule modification, not a replacement effect. The `LOSS_CONDITION_MOD` with `modification: "WIN_INSTEAD"` overrides the standard deck-out loss rule at the engine level. This could alternatively be encoded as a `replacement` block with `replaces.event: "WOULD_LOSE_GAME"` (see [06](./06-PROHIBITIONS-AND-REPLACEMENTS.md) for that pattern). The rule_modification approach is preferred here because the card explicitly says "according to the rules."
- **Synergy between effects:** The rule modification (deck-out = win) and the auto effect (mill your own deck) form a combo. The player mills their own deck to reach 0 cards and win instead of losing.
- **DON!! x1 on CustomTrigger:** The `[DON!! x1]` prefix requires 1 DON!! attached to this Leader. The `don_requirement` field is defined on both `KeywordTrigger` and `CustomTrigger` (see [02-TRIGGERS.md](./02-TRIGGERS.md)).
- **LEADER_ATTACK_DEALS_DAMAGE:** A custom trigger that fires when this Leader's attack successfully deals damage to the opponent's Life (i.e., the attack resolves, is not blocked, and removes a Life card).
- **MILL vs TRASH_CARD:** "trash 1 card from the top of your deck" is a mill operation (deck to trash, top card). MILL is the correct primitive — TRASH_CARD requires a target selection, while MILL always takes from the top.

---

### 8. Diable Jambe (ST01-016)
**Categories demonstrated:** activate (MAIN_EVENT on Event card), auto (TRIGGER), APPLY_PROHIBITION (CANNOT_ACTIVATE_BLOCKER scoped to attacker), KO with keyword filter, dual-timing Event

#### Raw Effect Text
Effect: [Main] Select up to 1 of your {Straw Hat Crew} type Leader or Character cards. Your opponent cannot activate [Blocker] if that Leader or Character attacks during this turn.
Trigger Effect: [Trigger] K.O. up to 1 of your opponent's [Blocker] Characters with a cost of 3 or less.

#### Schema Encoding
```json
{
  "effects": [
    {
      "id": "main_effect",
      "category": "activate",
      "trigger": {
        "keyword": "MAIN_EVENT"
      },
      "actions": [
        {
          "type": "APPLY_PROHIBITION",
          "target": {
            "type": "LEADER_OR_CHARACTER",
            "controller": "SELF",
            "count": { "up_to": 1 },
            "filter": { "traits": ["Straw Hat Crew"] }
          },
          "params": {
            "prohibition_type": "CANNOT_ACTIVATE_BLOCKER"
          },
          "duration": { "type": "THIS_TURN" }
        }
      ]
    },
    {
      "id": "trigger_effect",
      "category": "auto",
      "trigger": {
        "keyword": "TRIGGER"
      },
      "actions": [
        {
          "type": "KO",
          "target": {
            "type": "CHARACTER",
            "controller": "OPPONENT",
            "count": { "up_to": 1 },
            "filter": {
              "keywords": ["BLOCKER"],
              "cost_max": 3
            }
          }
        }
      ]
    }
  ]
}
```

#### Annotations
- **Dual-timing Event:** This Event card has two separate EffectBlocks: a `[Main]` effect (played from hand during Main Phase) and a `[Trigger]` effect (activated when revealed from Life). These are independent — the player uses one or the other depending on context.
- **MAIN_EVENT trigger:** Event cards use `MAIN_EVENT` (not `ACTIVATE_MAIN`) for their `[Main]` timing. The distinction is cosmetic in the schema — both indicate Main Phase activation — but `MAIN_EVENT` is the canonical trigger for Events.
- **CANNOT_ACTIVATE_BLOCKER targeting the selected card:** The prohibition target is the Straw Hat Crew Leader/Character being selected. The engine applies the prohibition such that when the selected card attacks, the opponent cannot activate Blocker. This is a deferred conditional prohibition — it grants the property now but the restriction only activates during an attack by that specific card. See [06 — CANNOT_ACTIVATE_BLOCKER](./06-PROHIBITIONS-AND-REPLACEMENTS.md).
- **keywords filter on KO target:** "your opponent's [Blocker] Characters" uses `keywords: ["BLOCKER"]` in the filter. This checks for the Blocker keyword on the card (intrinsic or granted). Combined with `cost_max: 3`, the target must have both Blocker and cost 3 or less.
- **No REUSE_EFFECT:** These are two separate EffectBlocks, not a Trigger that reuses the Main effect. The Trigger effect has its own distinct action (KO vs prohibition).

---

### 9. Marco (OP02-018)
**Categories demonstrated:** permanent (intrinsic keyword BLOCKER), auto (ON_KO), filtered cost (TRASH_FROM_HAND with trait filter), block-level condition (LIFE_COUNT), PLAY_CARD from TRASH rested, self-targeting from trash

#### Raw Effect Text
[Blocker] (After your opponent declares an attack, you may rest this card to make it the new target of the attack.)
[On K.O.] You may trash 1 card with a type including "Whitebeard Pirates" from your hand: If you have 2 or less Life cards, play this Character card from your trash rested.

#### Schema Encoding
```json
{
  "effects": [
    {
      "id": "blocker",
      "category": "permanent",
      "flags": {
        "keywords": ["BLOCKER"]
      }
    },
    {
      "id": "on_ko_revive",
      "category": "auto",
      "trigger": {
        "keyword": "ON_KO"
      },
      "costs": [
        {
          "type": "TRASH_FROM_HAND",
          "amount": 1,
          "filter": { "traits": ["Whitebeard Pirates"] }
        }
      ],
      "conditions": {
        "type": "LIFE_COUNT",
        "controller": "SELF",
        "operator": "<=",
        "value": 2
      },
      "actions": [
        {
          "type": "PLAY_CARD",
          "target": {
            "type": "SELF"
          },
          "params": {
            "source_zone": "TRASH",
            "play_state": "RESTED",
            "cost_override": "FREE"
          }
        }
      ],
      "flags": { "optional": true }
    }
  ]
}
```

#### Annotations
- **Intrinsic keyword:** `[Blocker]` is a permanent keyword stored in `EffectFlags.keywords`. It does not require a trigger, condition, or action — it is always active while the card is on the field. The reminder text in parentheses is flavor, not a separate effect.
- **Filtered cost:** "trash 1 card with a type including 'Whitebeard Pirates' from your hand" is a cost, not an action. The colon (`:`) in the card text separates cost from effect. The `filter` on the cost constrains which hand cards can be trashed to pay it.
- **Block-level condition:** "If you have 2 or less Life cards" gates the entire On K.O. effect. Per the action pipeline, the engine checks block-level conditions before presenting the cost to the player. If the condition fails, the effect cannot be activated.
- **Self-targeting from trash:** When Marco is K.O.'d, it moves to trash. The ON_KO trigger fires while the card is transitioning zones. The action `PLAY_CARD` with `target: { type: "SELF" }` and `source_zone: "TRASH"` plays Marco back onto the field from the trash.
- **play_state: RESTED:** "play this Character card from your trash rested" means Marco enters the field in the rested (tapped) state. This prevents immediate Blocker activation on the same turn.
- **cost_override: FREE:** Playing from trash via effect does not require paying Marco's normal play cost.
- **flags.optional:** The "you may" on the cost makes the entire activation optional. The player can decline to pay the cost and let Marco stay in the trash.

---

### 10. Monkey.D.Luffy (OP13-001)
**Categories demonstrated:** auto, ON_OPPONENT_ATTACK trigger with don_requirement, ACTIVE_DON_COUNT condition, variable cost (DON_REST with ANY_NUMBER), PER_COUNT dynamic value (DON_RESTED_THIS_WAY), LEADER_OR_CHARACTER target, THIS_BATTLE duration

#### Raw Effect Text
[DON!! x1] [On Your Opponent's Attack] If you have 5 or less active DON!! cards, you may rest any number of your DON!! cards. For every DON!! card rested this way, this Leader or up to 1 of your {Straw Hat Crew} type Characters gains +2000 power during this battle.

#### Schema Encoding
```json
{
  "effects": [
    {
      "id": "reactive_power_boost",
      "category": "auto",
      "trigger": {
        "keyword": "ON_OPPONENT_ATTACK",
        "don_requirement": 1
      },
      "conditions": {
        "type": "ACTIVE_DON_COUNT",
        "controller": "SELF",
        "operator": "<=",
        "value": 5
      },
      "costs": [
        {
          "type": "DON_REST",
          "amount": "ANY_NUMBER"
        }
      ],
      "actions": [
        {
          "type": "MODIFY_POWER",
          "target": {
            "type": "LEADER_OR_CHARACTER",
            "controller": "SELF",
            "count": { "up_to": 1 },
            "filter": { "traits": ["Straw Hat Crew"] }
          },
          "params": {
            "amount": {
              "type": "PER_COUNT",
              "source": "DON_RESTED_THIS_WAY",
              "multiplier": 2000
            }
          },
          "duration": { "type": "THIS_BATTLE" }
        }
      ],
      "flags": { "optional": true }
    }
  ]
}
```

#### Annotations
- **don_requirement on KeywordTrigger:** `[DON!! x1]` requires 1 DON!! attached to this Leader as a precondition. The DON!! is not consumed — it is a state check. `don_requirement: 1` on the trigger encodes this.
- **ACTIVE_DON_COUNT condition:** "If you have 5 or less active DON!! cards" checks untapped DON!! specifically, not total DON!! on field. This is distinct from `DON_FIELD_COUNT` (which counts all DON!! regardless of state).
- **Variable cost (ANY_NUMBER):** "rest any number of your DON!! cards" is modeled as a cost with `amount: "ANY_NUMBER"`. The player chooses how many DON!! to rest as part of paying the cost. The count feeds into the dynamic power calculation.
- **PER_COUNT dynamic value:** "For every DON!! card rested this way" scales the power boost by the cost paid. `DON_RESTED_THIS_WAY` is the dynamic source that reads the count of DON!! rested during cost payment. With `multiplier: 2000`, resting 3 DON!! yields +6000 power.
- **LEADER_OR_CHARACTER target with trait filter:** "this Leader or up to 1 of your {Straw Hat Crew} type Characters" allows the player to boost either themselves (the Leader) or a Straw Hat Crew character. The `traits: ["Straw Hat Crew"]` filter applies to the target pool. Since OP13-001 Monkey.D.Luffy is a {Straw Hat Crew} Leader, the filter matches the Leader as well, making the encoding correct for this specific card. For Leaders without the Straw Hat Crew trait, "this Leader" would be an unconditional self-reference requiring separate handling.
- **THIS_BATTLE duration:** "during this battle" scopes the power boost to the current battle only. It expires when the battle resolves, before the next attack.
- **Reactive timing:** ON_OPPONENT_ATTACK fires when the opponent declares any attack. This is a defensive trigger — the Luffy player boosts power in response to an incoming attack.

---

_Last updated: 2026-03-19_
