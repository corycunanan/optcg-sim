# Game Engine Requirements

> Complete mapping of OPTCG Comprehensive Rules v1.2.0 to game engine requirements.
> This is the authoritative reference for simulator implementation. Every rule has been read, interpreted, and translated into concrete engine behavior.

---

## Table of Contents

1. [Fundamental Principles](#1-fundamental-principles)
2. [Card Model & Information](#2-card-model--information)
3. [Game Areas](#3-game-areas)
4. [Game Setup](#4-game-setup)
5. [Turn Structure](#5-turn-structure)
6. [Main Phase Actions](#6-main-phase-actions)
7. [Battle System](#7-battle-system)
8. [Effect System](#8-effect-system)
9. [Rule Processing](#9-rule-processing)
10. [Keyword Effects](#10-keyword-effects)
11. [Keywords](#11-keywords)
12. [Edge Cases & Special Rules](#12-edge-cases--special-rules)
13. [Corrections to Existing M3 Doc](#13-corrections-to-existing-m3-doc)

---

## 1. Fundamental Principles

These are meta-rules the engine must enforce at all times. They govern how every other rule is interpreted.

### 1.1 Card Text Overrides Rules

> Ref: §1-3-1

Card text always takes precedence over the comprehensive rules. The engine must be designed so that card effects can override any default behavior — phase restrictions, targeting rules, area movement, cost calculations, etc.

**Engine requirement:** No game rule should be hardcoded without an override hook. Every rule check should be a function that the effect system can intercept.

### 1.2 Impossible Actions

> Ref: §1-3-2, §1-3-2-1, §1-3-2-2

- If a player is required to perform an impossible action, that action is simply not carried out.
- If an effect requires multiple actions and some are impossible, perform as many as possible.
- If an object must change to a state it's already in, nothing happens (the action is not performed — this matters for trigger counting).
- Performing an action 0 or negative times = do nothing. Negative does NOT mean perform the opposite.

**Engine requirement:** Every action executor must be wrapped in an "attempt" pattern that silently no-ops on impossibility rather than throwing errors. The engine must never crash on impossible instructions.

### 1.3 Prohibition Overrides Instruction

> Ref: §1-3-3

If an effect says "do X" but another active effect says "cannot do X", the prohibition wins. Always.

**Engine requirement:** Before executing any effect action, check a prohibition registry. Prohibitions are modeled as continuous effects that register vetoes.

### 1.4 Simultaneous Choices

> Ref: §1-3-4, §1-3-10

When both players must make choices simultaneously, the turn player chooses first, then the non-turn player. This applies to both rule-based and effect-based simultaneous choices.

**Engine requirement:** Never present both players with a choice prompt at the same time. Serialize: turn player first, then non-turn player.

### 1.5 Number Rules

> Ref: §1-3-5, §1-3-5-1, §1-3-6, §1-3-6-1, §1-3-6-2

- When choosing a number: must be a whole number ≥ 0 (unless specified otherwise).
- "Up to X" allows choosing 0.
- Non-power numbers on cards cannot go below 0 (clamped) — **except during mid-calculation**.
- **Power CAN be negative.** A card with negative power is NOT automatically KO'd or trashed.
- **Cost CAN be negative during calculation**, but outside of calculation the effective cost is treated as 0.
- If a card's cost is already negative and another effect further modifies it, the negative value is used in the calculation.

**Engine requirement:**
```
function getEffectiveCost(card): number {
  const calculated = card.baseCost + sumOfCostModifiers(card);
  return Math.max(0, calculated); // clamp to 0 for payment purposes
}

function getEffectivePower(card): number {
  return card.basePower + sumOfPowerModifiers(card); // NO clamp — can be negative
}
```

### 1.6 Effect Ordering

> Ref: §1-3-7

Card effects are carried out in the order described on the card (top to bottom) unless otherwise specified.

### 1.7 Rest vs Active Conflict

> Ref: §1-3-8

If an effect would simultaneously rest and activate (set active) a card, resting takes precedence.

---

## 2. Card Model & Information

> Ref: §2-1 through §2-17

### 2.1 Card Properties

The engine must track the following properties per card:

| Property | Applies To | Notes |
|----------|-----------|-------|
| Card Name | All | Fixed. Some cards gain names from their text (treated as default name everywhere including deck construction and secret areas) |
| Category | All | Leader, Character, Event, Stage, DON!! |
| Color(s) | All | 6 colors. Multi-color cards count as ALL their colors simultaneously |
| Type(s) | All | Can have multiple, separated by `/`. Matchable in card text via `{ }` brackets |
| Attribute(s) | Leader, Character only | Slash, Strike, Ranged, Special, Wisdom, "?". Can have multiple. Some cards gain attributes from text |
| Power | Leader, Character only | Can be modified by effects. Can go negative |
| Cost | Character, Event, Stage only | Can be modified by effects. Effective minimum 0 for payment |
| Card Text | All | Source of all effects |
| Life | Leader only | Determines starting life card count |
| Counter | Character only | Symbol Counter value — power boost usable during Counter Step |
| Trigger | Any (in text) | Optional effect activated when revealed from life |
| Card Number | All | Used for deck construction (max 4 copies) |
| Block Symbol | All | Block format legality |

### 2.2 Category Semantics

> Ref: §2-2-3 through §2-2-6

The engine must distinguish between a card's category and its current location. This matters for card text targeting:

| Text says | Means |
|-----------|-------|
| "Leader" | Leader card currently in the Leader area |
| "Character" | Character card currently in the Character area |
| "Character card" | Character card located **outside** the Character area (hand, deck, trash, etc.) |
| "Leader and/or Character cards" | The "Character cards" part means Character cards in the Character area |
| "Event" or "Event card" | Event card (any location) |
| "Stage" | Stage card currently in the Stage area |
| "Stage card" | Stage card located **outside** the Stage area |

**Engine requirement:** Targeting filters must consider both card category AND current zone.

### 2.3 Name Matching

> Ref: §2-1-2, §2-1-2-1

- `[Name]` in card text = exact card name match
- `"partial"` in card text = card name contains that string

### 2.4 Card Text Validity by Zone

> Ref: §2-8-2

Unless otherwise specified:
- Leader card text is valid only in the Leader area
- Character card text is valid only in the Character area
- Stage card text is valid only in the Stage area
- Event card text is valid when activated (trashed from hand)

**Engine requirement:** When checking if an effect is active, verify the card is in its valid zone.

### 2.5 "Base" Values

> Ref: §4-9

"Base" means the printed value on the card. When multiple effects set a base value to different amounts on the same card:
- **Base power:** highest value wins
- **Base cost:** highest value wins

**Engine requirement:** Base-setting effects are a separate modifier layer processed before additive/subtractive modifiers.

---

## 3. Game Areas

> Ref: §3-1 through §3-10

### 3.1 Complete Area List

| Area | Type | Visibility | Cards Face | Max Cards | Notes |
|------|------|-----------|-----------|-----------|-------|
| Deck | Secret | Neither player can view | Face-down stack | — | Order matters. Cannot reorder. |
| DON!! Deck | Open | Both can view | Face-down stack | 10 | Both players can view and reorder |
| Hand | Secret | Owner only | — | No limit | Owner can reorder freely |
| Trash | Open | Both can view | Face-up stack | — | Either player can view. Owner can reorder. New cards go on top. |
| Leader Area | Open | Both | Face-up | 1 | Leader cannot be moved from this area by effects or rules |
| Character Area | Open | Both | Face-up | **5 max** | Placed active by default |
| Stage Area | Open | Both | Face-up | **1 max** | Placed active by default |
| Cost Area | Open | Both | Face-up | — | DON!! cards. Placed active by default |
| Life Area | Secret | Neither player | Face-down stack | — | Order matters. Cannot reorder. Top card selected first unless specified |

### 3.2 "The Field"

> Ref: §3-1-2

"The field" = Leader Area + Character Area + Stage Area + Cost Area. Effects referencing "the field" target cards in any of these four areas.

### 3.3 Area Transitions Reset Effects

> Ref: §3-1-6, §3-1-6-1

**Critical rule:** When a card moves from the Character area or Stage area to another area, it is treated as a **new card**. All previously applied effects are removed.

DON!! cards: when they move between ANY areas, all effects are removed.

**Engine requirement:** On every area transition, strip all continuous effect modifiers from the moved card. Assign a new logical identity if tracking "same card" matters.

### 3.4 Character Area Overflow (5-card limit)

> Ref: §3-7-6, §3-7-6-1, §3-7-6-1-1

If the Character area already has 5 cards and the player wants to play a new Character:
1. Reveal the new card
2. Trash 1 existing Character (player's choice)
3. Play the new Character

**This trashing is RULE PROCESSING, not an effect.** This means:
- No effect can be applied to this trash action
- [On K.O.] does NOT trigger (it's not a K.O., it's a rule-mandated trash)
- No replacement effects can replace this

**Engine requirement:** The "trash to make room" action must bypass the entire effect system.

### 3.5 Stage Area Overflow (1-card limit)

> Ref: §3-8-5, §3-8-5-1

If a Stage is already in play and the player plays a new Stage:
1. Reveal the new card
2. Trash the existing Stage
3. Play the new Stage

### 3.6 Life Area Specifics

> Ref: §3-10-2, §3-10-2-1, §3-10-3

- Life cards are face-down, ordered stack. Neither player can view contents.
- When removing a life card, always take from the **top** unless specified otherwise.
- An effect can add a card to life face-up. A face-up life card is treated as being in an open area (exception to the normal secret area rule).
- Effects that "look at" life cards work regardless of face-up or face-down. After looking, restore original orientation.

**Engine requirement:** Life area needs per-card face-up/face-down tracking.

### 3.7 Simultaneous Area Placement

> Ref: §3-1-7, §3-1-8

When multiple cards are placed in an area simultaneously, the owner chooses the order.

When multiple cards move from an open area to a secret area simultaneously, if the owner controls the order, the opponent cannot verify the order.

---

## 4. Game Setup

> Ref: §5-1, §5-2

### 4.1 Setup Sequence (Exact Order)

```
1. Each player presents their deck (must satisfy construction rules §5-1-2)
2. Each player shuffles their deck, places face-down in deck area
3. Each player places Leader card face-up in Leader area
4. Players determine who chooses first/second (e.g. rock-paper-scissors)
5. The chosen player declares first or second
6. Process "At the start of the game" effects (if any)
   → The player who chose first/second resolves their effects first (any order)
   → Then the other player resolves theirs (any order)
   → If any deck was modified by these effects, shuffle it
7. Each player draws 5 cards (opening hand)
8. Beginning with the first player, each player may mulligan ONCE:
   → Return ALL cards in hand to deck, reshuffle, draw 5 new cards
9. Each player places cards from top of deck into Life area:
   → Count = Leader's Life value
   → Card from top of deck goes to BOTTOM of Life area
   → (This means the first card drawn from life was the LAST card placed)
10. First player begins their turn
```

### 4.2 Deck Construction Rules

> Ref: §5-1-2

- Exactly 1 Leader card
- Exactly 50 cards in deck (Characters + Events + Stages)
- Exactly 10 DON!! cards in DON!! deck
- Only colors matching the Leader card's color(s) can be in the deck
- Max 4 cards with the same card number
- Some Leader effects modify deck construction rules (treated as permanent effects valid during construction)

### 4.3 First Turn Restrictions

The player going first has restrictions on turn 1:

| Phase | Restriction |
|-------|------------|
| Draw Phase | Does NOT draw a card (§6-3-1) |
| DON!! Phase | Places only **1** DON!! card instead of 2 (§6-4-1) |
| Battle | Cannot battle at all on first turn (§6-5-6-1) |

**Note on Refresh Phase:** The rules say Refresh Phase still happens on turn 1, but since no cards are rested yet, it's effectively a no-op. The engine should still run the phase (for "start of turn" effect triggers).

**Correction to M3 doc:** M3 says "starting player skips Refresh, Draw, and Attack on Turn 1." This is wrong. Refresh phase is NOT skipped — it still occurs (§6-2 has no turn-1 exception). Draw phase: the player doesn't draw, but the phase still occurs. The restrictions are on specific ACTIONS within those phases, not on the phases themselves. This distinction matters for effects that trigger on phase transitions.

---

## 5. Turn Structure

> Ref: §6-1 through §6-6

### 5.1 Phase Sequence

```
REFRESH_PHASE → DRAW_PHASE → DON_PHASE → MAIN_PHASE → END_PHASE
```

**Important:** There is no separate "Attack Phase." Battles happen DURING the Main Phase (§6-5-6, §7-1). The M3 doc incorrectly models attacks as a separate phase after Main Phase. This is wrong.

> Ref: §6-5-2: "In the Main Phase, you may perform the following Main Phase actions: Play a Card, Activate a Card's Effect, Give DON!! Cards, **and Battle**."
> Ref: §6-5-6-2: "For more information on battles, please refer to 7. Card Attacks and Battles below."

**Engine requirement:** Battle is a Main Phase action, not a separate phase. The player can freely interleave playing cards, attaching DON!!, activating effects, and attacking — all within the Main Phase.

### 5.2 Refresh Phase (Detailed)

> Ref: §6-2

Exact sequence:
1. Effects lasting "until the start of your next turn" expire
2. Auto effects that read "[End of Your Turn]" / "[End of Your Opponent's Turn]" → **No, wrong section.** Let me re-read. §6-2-2: "Your own and your opponent's effects that read 'at the start of your/your opponent's turn' activate."
3. Return ALL DON!! cards given to cards in Leader area and Character area to the cost area and **rest them**
4. Set ALL rested cards in Leader area, Character area, Stage area, and cost area as active

**Critical detail on DON!! return:** DON!! cards given to Leader/Characters are returned to the cost area and **rested** — then immediately set active in step 4. Net result: they end up active. But the sequence matters if effects trigger between steps 3 and 4.

**Engine requirement:** Execute these as 4 discrete steps in order, with effect trigger checks between each.

### 5.3 Draw Phase

> Ref: §6-3

- Turn player draws 1 card.
- First player does NOT draw on their first turn.
- If deck is empty when they should draw → deck-out defeat condition is checked by rule processing (§9-2-1-2). The player has 0 cards in deck, which triggers defeat.

### 5.4 DON!! Phase

> Ref: §6-4

- Place 2 DON!! cards from DON!! deck face-up in cost area.
- First player places only 1 on their first turn.
- If only 1 DON!! remains, place 1.
- If 0 remain, place none.

**Engine requirement:** DON!! cards placed in cost area are set active (§3-9-3).

### 5.5 Main Phase

> Ref: §6-5

Available actions (any order, any number of times):
1. Play a card (Character, Stage, or [Main] Event) — §6-5-3
2. Activate card effects ([Main] or [Activate: Main]) — §6-5-4
3. Give DON!! cards to Leader/Characters — §6-5-5
4. Battle — §6-5-6

Effects reading "at the start of the Main Phase" activate at the beginning (§6-5-1).

The turn player declares end of Main Phase to proceed to End Phase (§6-5-2-1).

### 5.6 End Phase

> Ref: §6-6

Exact sequence:
1. Auto effects "[End of Your Turn]" activate and resolve (turn player chooses order if multiple)
2. After ALL of turn player's end-of-turn effects resolve, auto effects "[End of Your Opponent's Turn]" activate and resolve (non-turn player chooses order if multiple)
3. Each of these can only activate and resolve **once** (§6-6-1-1-1)
4. After all end-of-phase effects resolve, process expiring effects in this order:
   a. Turn player's continuous effects due to be processed "at the end of this turn" / "at the end of your turn" → process them. Turn player's effects lasting "until the end of the turn" / "until the end of the End Phase" become invalid. (Turn player chooses order)
   b. Non-turn player's same. (Non-turn player chooses order)
5. After 4 completes: turn player's effects lasting "during this turn" become invalid. Then non-turn player's effects lasting "during this turn" become invalid.
6. Turn ends. Non-turn player becomes new turn player. Proceed to Refresh Phase.

**Engine requirement:** Three distinct expiry waves:
1. "until end of turn" / "until end of End Phase" effects
2. "during this turn" effects
3. "until start of your next turn" effects (expire in next turn's Refresh Phase)

---

## 6. Main Phase Actions

### 6.1 Playing a Card

> Ref: §6-5-3, §2-7-2 through §2-7-4

**Playing a Character card:**
1. Reveal the card from hand
2. Select active DON!! cards in cost area equal to the card's cost
3. Rest those DON!! cards
4. Place the Character in the Character area (active by default, §3-7-5)
5. The Character **cannot attack this turn** unless it has [Rush] (§3-7-4)

**Activating an Event card ([Main]):**
1. Reveal the card from hand
2. Select active DON!! cards in cost area equal to the card's cost
3. Rest those DON!! cards
4. Trash the Event card
5. Resolve the Event's effect

**Playing a Stage card:**
1. Reveal the card from hand
2. Select active DON!! cards in cost area equal to the card's cost
3. Rest those DON!! cards
4. If a Stage already exists, trash it first (§3-8-5-1)
5. Place the Stage in the Stage area (active by default, §3-8-4)

### 6.2 Giving DON!! Cards

> Ref: §6-5-5

- Take 1 **active** DON!! card from cost area
- Place it underneath a Leader or Character card such that it remains visible
- This is called "giving"
- Can be repeated as many times as desired (as long as active DON!! are available)
- **Effect:** Leader/Character gains +1000 power **during your turn** for each given DON!! (§6-5-5-2)

**Critical detail:** DON!! power bonus is "+1000 during your turn." This means on the opponent's turn, given DON!! cards do NOT grant a power bonus. The card's power drops back to base + other modifiers.

Wait — re-reading §6-5-5-2: "Leader cards and Character cards gain 1000 power during your turn for each DON!! card given to them."

This says "during your turn" — meaning the +1000 per DON!! is only active during the turn player's turn. On the opponent's turn, the DON!! are still attached (they don't return until Refresh Phase §6-2-3), but they don't grant power.

**Engine requirement:** DON!! power bonus is a conditional modifier: `+1000 × attachedDonCount` only when `it is the owner's turn`.

**DON!! return on card leaving field:** When a card with given DON!! moves to another area, all its DON!! are placed in the cost area and **rested** (§6-5-5-4).

### 6.3 Activating Effects

> Ref: §6-5-4

During Main Phase, the turn player can activate:
- [Main] effects (Event cards from hand)
- [Activate: Main] effects (on cards in play)

**[Activate: Main] cannot be used during battle** (§10-2-2-1). Even though battles happen during Main Phase, [Activate: Main] is restricted to non-battle timing.

---

## 7. Battle System

> Ref: §7-1 through §7-1-5

### 7.1 Battle Initiation

> Ref: §7-1

- Battles occur during Main Phase
- Turn player rests an active Leader or Character to declare an attack
- Valid attack targets: opponent's Leader, OR one of opponent's **rested** Characters
- Neither player can battle on their first turn (§6-5-6-1)

### 7.2 Battle Sequence (5 Steps)

```
ATTACK_STEP → BLOCK_STEP → COUNTER_STEP → DAMAGE_STEP → END_OF_BATTLE
```

**Note the order: Block comes BEFORE Counter.** The M3 doc had this reversed (Counter before Blocker). The comprehensive rules are clear: §7-1-2 Block Step → §7-1-3 Counter Step.

### 7.3 Attack Step

> Ref: §7-1-1

1. Turn player declares attack by resting their active Leader or 1 active Character (§7-1-1-1)
2. Turn player selects attack target: opponent's Leader OR 1 of opponent's **rested** Characters (§7-1-1-2)
3. Effects that read [When Attacking], "when you attack", [On Your Opponent's Attack], or [When Attacked] activate (§7-1-1-3)
4. **Bail-out check:** If at the end of the Attack Step, the attacking card OR the target card has moved to another area (due to an effect), skip directly to End of Battle (§7-1-1-4). Do NOT proceed to Block Step.

### 7.4 Block Step

> Ref: §7-1-2

1. The defending player may activate [Blocker] on one of their cards **once per battle** (§7-1-2-1)
2. [Blocker] activation: rest the Blocker card → it replaces the current target
3. If [Blocker] is activated, effects reading [On Block] / "when you block" activate (§7-1-2-2)
4. **Bail-out check:** If at end of Block Step, attacker or target has moved areas → skip to End of Battle (§7-1-2-3)

### 7.5 Counter Step

> Ref: §7-1-3

1. Effects of the defending player reading "when attacked" activate (§7-1-3-1) — **Note:** this is different from [When Attacked] in the Attack Step. "when attacked" without the keyword brackets triggers here in Counter Step.
2. Defending player may perform any number of times, in any order:
   a. **Activate (Symbol) Counter:** Trash a Character card from hand that has Counter → increase power of their Leader or 1 Character by the Counter value **during this battle** (§7-1-3-2-1)
   b. **Activate [Counter] Event:** Pay cost of a [Counter] Event from hand, trash it, activate its [Counter] effect (§7-1-3-2-2)
3. **Bail-out check:** If at end of Counter Step, attacker or target has moved areas → skip to End of Battle (§7-1-3-3)

### 7.6 Damage Step

> Ref: §7-1-4

Compare attacking card's power vs defending card's power:

**If attacker power ≥ defender power (attacker wins):**
- If target is **Leader**: deal 1 damage (see §4-6 Damage Processing below)
- If target is **Character**: K.O. that Character (→ trash, §10-2-1)

**If attacker power < defender power (attacker loses):**
- Nothing happens. No damage. Battle just ends.

**Important:** The attacker is NOT destroyed on a loss. Only the defender can be KO'd, and only if the attacker wins.

### 7.7 Damage Processing

> Ref: §4-6, §7-1-4-1-1

When a Leader takes damage:
1. If damage = 1: move top card from Life area to hand
2. If damage = X: repeat step 1 X times (§4-6-2-2)
3. For each life card moved to hand: if that card has [Trigger], the player MAY choose to reveal it and activate the [Trigger] instead of adding it to hand (§4-6-3, §10-1-5)
4. If [Trigger] is activated, the card doesn't go to hand — it goes to trash after the trigger resolves (§10-1-5-3), unless specified otherwise
5. **Defeat check:** If at the point damage is determined, the player has 0 Life → the attacking player wins (§7-1-4-1-1-1). This check happens BEFORE life cards are moved.

**[Trigger] detail:** While a [Trigger] is being activated, the card itself does not belong to any area (§10-1-5-3). After the trigger effect finishes, trash the card (unless the trigger says otherwise).

**If life card cannot be added to hand (due to effect):** the [Trigger] cannot be activated (§4-6-3-1).

### 7.8 End of Battle

> Ref: §7-1-5

1. Battle ends
2. Effects reading "at the end of the/this battle" or "if this ... battles" activate
3. Turn player's effects lasting "during this battle" become invalid
4. Non-turn player's effects lasting "during this battle" become invalid
5. Return to Main Phase action selection (§6-5-2)

---

## 8. Effect System

> Ref: §8-1 through §8-6

### 8.1 Effect Categories

The engine must support four distinct effect categories:

#### 8.1.1 Auto Effects

> Ref: §8-1-3-1

- Activate automatically when their trigger condition occurs
- Activate once per occurrence (unless specified otherwise)
- May require activation cost and/or conditions
- **Critical:** If the card moves to another area before the auto effect activates, the effect CANNOT activate (§8-1-3-1-3). The card must still be in its valid zone when the trigger fires.
- Auto effects that trigger on area movement (e.g. [On K.O.]) only activate if the destination is an open area (§8-4-5)

**Keywords that denote auto effects:** [On Play], [When Attacking], [On Block], [On K.O.], [End of Your Turn], [End of Your Opponent's Turn], plus any "when ..." or "on ..." phrasing.

#### 8.1.2 Activate Effects

> Ref: §8-1-3-2

- Declared and activated by the turn player during Main Phase
- Cannot be activated during battle (§10-2-2-1)
- Keywords: [Activate: Main], [Main]

#### 8.1.3 Permanent Effects

> Ref: §8-1-3-3

- Continuously affect gameplay while valid
- Some require conditions to be active
- Some read "according to/under the rules" — these are valid even in secret areas (deck, hand)
- When permanent effects interact with each other:
  1. Turn player processes their permanent effects (any order)
  2. Non-turn player processes theirs (any order)
  3. If state changed, repeat until stable

**Engine requirement:** Permanent effects need a continuous recalculation loop with cycle detection.

#### 8.1.4 Replacement Effects

> Ref: §8-1-3-4

- Denoted by the word "instead"
- Replace one action with another
- Priority order:
  1. Replacement effect of the card that generated the situation
  2. Turn player's replacement effects (turn player chooses order)
  3. Non-turn player's replacement effects (non-turn player chooses order)
- Once a process has been replaced, the same replacement effect cannot apply to it again (prevents infinite replacement loops)
- If replacement itself triggers another replacement, that's allowed (but each individual replacement only applies once)
- The replaced part is treated as an effect activated by the owner of the replacement effect

**Engine requirement:** Replacement effects are interceptors in the action pipeline. They must be checked BEFORE any action resolves.

### 8.2 One-Shot vs Continuous Effects

> Ref: §8-1-4

- **One-shot:** Affect the game at the moment they resolve and complete immediately (e.g. "draw 1 card")
- **Continuous:** Affect the game for a specified duration (e.g. "+2000 power during this turn")

### 8.3 Valid/Invalid Effects

> Ref: §8-2

- Effects can be made valid or invalid by other effects
- An invalid effect does not occur, cannot require choices, and its activation cost cannot be paid
- Cards with invalid effects are NOT treated as having "no base effect" (§8-2-2) — they still "have" effects, the effects are just invalid
- Already-activated-and-resolved auto/activate effects CANNOT be retroactively invalidated (§8-2-3)
- If an invalidated card gains a new effect, the new effect IS valid (§8-2-4)

### 8.4 Activation Cost & Conditions

> Ref: §8-3

**Activation cost** (before the `:` colon):
- Must be fully payable or the effect cannot be activated (§8-3-1-3)
- If you start paying but become unable to pay mid-payment: pay as much as possible, but the effect after the colon does NOT resolve (§8-3-1-3-1)
- Costs with "can" / "may": player can choose not to pay (but then can't activate)
- `①` symbol: rest that many active DON!! from cost area
- `DON!! −X`: return X DON!! from Leader area, Character area, OR cost area to DON!! deck

**Conditions** (in brackets like [DON!! xX], [Your Turn], [Opponent's Turn]):
- ALL conditions must be met (§8-3-2-1)
- [DON!! xX]: condition met when this card has X or more DON!! given to it
- [Your Turn]: met during your turn
- [Opponent's Turn]: met during opponent's turn

**"If..." clauses:**
- If the "if" clause cannot be resolved, everything after it also cannot resolve (§8-3-3)

### 8.5 Effect Activation Sequence

> Ref: §8-4-1

```
1. Check conditions are met
2. Specify the effect to activate (reveal card if in hand)
3. Determine and pay all activation costs
4. Activate the effect
5. Resolve the effect
```

**Event card activation:** trash the Event card, then carry out the effect (§8-4-2).

**Choosing targets:** "choose", "select", "up to" — choices are made **during resolution**, not during activation (§8-4-4). If "up to" is specified, player may choose 0 (§8-4-4-1).

**Secret area choosing:** When choosing unrevealed cards from a secret area based on card information, the player cannot guarantee the choice meets conditions — so they can decline to choose (§8-4-4-2).

**Choosing from deck:** When choosing cards from the deck, check the cards' faces (§8-4-4-4).

### 8.6 Card Activation vs Effect Activation

> Ref: §8-5

These are DIFFERENT concepts:
- **Card activation** = using an Event card from hand
- **Effect activation** = activating an effect on any card

"When you activate an Event" refers to card activation, not just any effect.

### 8.7 Effect Resolution Order

> Ref: §8-6

**When both players' effects trigger simultaneously:**
1. Turn player resolves their effect first
2. If during that resolution, another of the turn player's effects triggers → the non-turn player's pending effect resolves first, THEN the newly triggered turn player effect

**During damage processing:** effects that trigger during damage processing wait until ALL damage processing finishes before activating (§8-6-2). Exception: [Trigger] can suspend damage processing to resolve immediately (§8-6-2-1).

**Effect chains:** If an effect triggers during card/effect activation, it waits until the current activation fully resolves (§8-6-3).

---

## 9. Rule Processing

> Ref: §9-1, §9-2

### 9.1 What Is Rule Processing

Rule processing is automatic processing that occurs when specific game events happen. It resolves **immediately** when the event occurs, even if other actions are in progress (§9-1-2).

### 9.2 Defeat Judgment

Checked at every rule processing point:
1. **Life-out defeat:** Player has 0 Life cards AND their Leader takes damage → that player loses
2. **Deck-out defeat:** Player has 0 cards in deck → that player loses

**Both players can lose simultaneously** → draw (implied by "all of those players lose" in §9-2-1).

**Engine requirement:** Defeat checks must run after every atomic game action. They interrupt any in-progress sequence.

---

## 10. Keyword Effects

> Ref: §10-1

### 10.1 [Rush]

> Ref: §10-1-1

Allows a Character to attack on the turn it was played. Overrides the default §3-7-4 restriction.

### 10.2 [Double Attack]

> Ref: §10-1-2

When a card with [Double Attack] deals damage to the opponent's Leader via an attack, deal **2 damage instead of 1**.

**Engine requirement:** Modifies damage count in Damage Step. Processes two life-card removals sequentially (§7-1-4-1-1-3), each with their own [Trigger] check.

### 10.3 [Banish]

> Ref: §10-1-3

When a card with [Banish] deals damage to the opponent's Leader via an attack, the life card is **trashed instead of added to hand**. [Trigger] is NOT activated.

**Engine requirement:** Replaces the destination of the life card movement. Suppresses [Trigger] check entirely.

### 10.4 [Blocker]

> Ref: §10-1-4

Activation timing: when one of your **other** cards is being attacked (cannot block for yourself). Activated during Block Step by resting this card. The [Blocker] card replaces the original attack target.

Only one [Blocker] per battle (§7-1-2-1).

### 10.5 [Trigger]

> Ref: §10-1-5

When taking damage and a life card has [Trigger]:
- Player may reveal the card and activate [Trigger] instead of adding to hand
- Player may decline (add to hand without revealing)
- While [Trigger] resolves, the card is in **no area** (§10-1-5-3)
- After [Trigger] resolves, trash the card (unless specified otherwise)

### 10.6 [Rush: Character]

> Ref: §10-1-6

Like [Rush], but the Character can only attack **opponent's Characters** on the turn it was played (cannot attack Leader).

### 10.7 [Unblockable]

> Ref: §10-1-7

When a card with [Unblockable] attacks, the opponent cannot activate [Blocker]. Skip the Block Step effectively.

---

## 11. Keywords

> Ref: §10-2

### 11.1 K.O.

> Ref: §10-2-1

- K.O. = Character being trashed from losing a battle OR from a card effect
- As an instruction: move Character card from Character area to owner's trash
- [On K.O.] and "cannot be K.O.'d" effects are only valid when KO is from an effect or battle result
- If a Character is trashed by another method (e.g. rule processing, cost payment), it is NOT "K.O.'d"

**Engine requirement:** Track the CAUSE of a trash action: `battle_result`, `effect_ko`, `rule_processing`, `cost_payment`, `other`. Only `battle_result` and `effect_ko` count as K.O.

### 11.2 [Activate: Main]

> Ref: §10-2-2

Activated during Main Phase, **except when in battle**. This is a key restriction — during a battle sequence (Attack Step through End of Battle), [Activate: Main] cannot be used.

### 11.3 [Main]

> Ref: §10-2-3

Event-exclusive keyword. Activated during Main Phase, except in battle.
Exception: [Trigger] and other effects may allow [Main] to be activated in other situations.

### 11.4 [Counter]

> Ref: §10-2-4

Event-exclusive keyword. Activated during opponent's Counter Step only.
Exception: [Trigger] and other effects may allow [Counter] activation.
[Counter] cannot be activated by effects unless the effect explicitly says "activate [Counter]" (§10-2-4-1-2).

### 11.5 [When Attacking]

> Ref: §10-2-5

Triggers when the card declares an attack during the Attack Step.

### 11.6 [On Play]

> Ref: §10-2-6

Triggers when the card is played.

### 11.7 [End of Your Turn] / [End of Your Opponent's Turn]

> Ref: §10-2-7, §10-2-8

Trigger during End Phase. Each can only activate and resolve once per End Phase (§6-6-1-1-1).

### 11.8 [DON!! xX]

> Ref: §10-2-9

Condition: satisfied when a card goes from having less than X DON!! to having X or more DON!!. This is a threshold-crossing check, not a continuous check.

### 11.9 DON!! −X

> Ref: §10-2-10

Activation cost: return X DON!! cards from Leader area, Character area, and/or cost area to DON!! deck. The player chooses which DON!! to return.

### 11.10 [Once Per Turn]

> Ref: §10-2-13

- Effect can only activate and resolve once per turn
- Multiple cards with the same effect: each card gets one use
- After resolving once, cannot activate again even if conditions re-trigger
- If the card leaves the field and returns, it's a new card — [Once Per Turn] resets (§3-1-6)
- If activation cost payment fails mid-payment (§8-3-1-3-1), the [Once Per Turn] is still consumed — cannot retry (§10-2-13-5)

### 11.11 [On K.O.]

> Ref: §10-2-17

**Special behavior:** [On K.O.] is unique among auto effects:
1. When the card would be KO'd, check if activation conditions are met **while the card is still on the field**
2. If conditions met, the effect **activates on the field**
3. THEN the Character card is trashed
4. The effect **resolves while the card is in the trash**

The card moves areas between activation and resolution. This is explicitly called out as different from other auto effects (§10-2-17-2).

**Engine requirement:** [On K.O.] needs a two-phase resolution: activate (check conditions, pay costs) while in Character area, then resolve after moving to trash.

### 11.12 [On Your Opponent's Attack]

> Ref: §10-2-16

Triggers when the opponent declares an attack, but resolves **after** the opponent's [When Attacking] and other Attack Step effects resolve.

### 11.13 [On Block]

> Ref: §10-2-15

Triggers during Block Step when you have activated your [Blocker].

### 11.14 Trash (keyword)

> Ref: §10-2-14

As a keyword in card text: select a card from hand and place it in the trash.

---

## 12. Edge Cases & Special Rules

### 12.1 Infinite Loops

> Ref: §11-1

The engine must detect and handle infinite loops:

**Neither player can stop the loop:** Game ends in a draw (§11-1-1-1).

**One player can stop:** That player declares how many loop iterations they want. Execute that many, then stop at the point where they can exit. Player cannot restart the loop if the game state is identical (§11-1-1-2).

**Both players can stop:** Turn player declares iteration count first, then non-turn player. Execute the FEWER of the two counts. Stop at the timing where the player who chose fewer can exit (§11-1-1-3).

**Engine requirement:** Loop detection (game state hashing per iteration), loop resolution UI prompting players for iteration counts.

### 12.2 Revealing Cards

> Ref: §11-2

- When a card moves from one secret area to another secret area (e.g. "Add [specific card] from deck to hand"), the card MUST be revealed even if the text doesn't say "reveal" (§11-2-1).
- When a card in a secret area is revealed by effect/cost, it becomes unrevealed again after that effect/cost resolves (§11-2-2).

### 12.3 Viewing Secret Areas

> Ref: §11-3

- Some effects let players look at secret areas. Unless specified, only the effect's player can look (§11-3-1).
- Cards remain in their area while being looked at (§11-3-2).
- After looking, if no action is specified, cards must be returned to original state (§11-3-3).

### 12.4 "If" vs "Then"

> Ref: §4-10

- `If X, do Y`: If X cannot resolve → Y also cannot resolve
- `X, then Y`: If X cannot resolve → Y CAN still resolve

**Engine requirement:** Parse card text structure to distinguish conditional chains from sequential chains.

### 12.5 "Up to X" Selection

> Ref: §4-8

When "up to X card(s)" appears: choose between 0 and X cards **immediately before the effect processes**. Then resolve.

Exception: "Draw up to X cards" follows a different procedure — draw one at a time, choosing to stop between each draw (§4-5-4).

### 12.6 Set Power to 0

> Ref: §4-12

This is implemented as: reduce power by the card's **current** power at the time the effect activates. It is NOT "set power = 0" — it's "power minus (current power)."

If the card already has negative power, this effect does nothing (§4-12-2).

**Engine requirement:** `setPowerToZero(card)` → apply modifier of `-(card.currentPower)`. If `card.currentPower < 0`, skip.

---

## 13. Corrections to Existing M3 Doc

The following items in the current M3 doc are incorrect based on the comprehensive rules:

### 13.1 Battle is NOT a Separate Phase

**M3 says:** Phases are `REFRESH → DRAW → DON → MAIN → ATTACK → END`
**Rules say:** Phases are `REFRESH → DRAW → DON → MAIN → END` (§6-1-1). Battle happens WITHIN the Main Phase as one of four available actions (§6-5-2).

**Impact:** The phase enum needs to drop `ATTACK`. Battle is a sub-state of MAIN.

### 13.2 Block Step Comes BEFORE Counter Step

**M3 says:** Counter window → Blocker window (counter first, then block)
**Rules say:** Attack Step → Block Step → Counter Step → Damage Step (§7-1-1 through §7-1-4). Block comes BEFORE counter.

**Impact:** The battle sequence is reversed. This fundamentally changes the flow.

### 13.3 Refresh Phase is NOT Skipped on Turn 1

**M3 says:** "Starting player skips Refresh, Draw, and Attack on Turn 1"
**Rules say:** Refresh Phase always occurs (§6-2 has no turn-1 exception). The first player doesn't draw in Draw Phase (§6-3-1) and can't battle (§6-5-6-1), but the phases themselves still happen.

Additionally, DON!! Phase has a turn-1 restriction that M3 doesn't mention: first player places only 1 DON!! instead of 2 (§6-4-1).

### 13.4 DON!! Power is Turn-Conditional

**M3 says:** Attaching DON!! increases power by +1000 per DON!!
**Rules say:** DON!! grants +1000 power **during your turn** (§6-5-5-2). On the opponent's turn, DON!! remains attached but does not grant power.

**Impact:** Power calculation must account for whose turn it is.

### 13.5 DON!! Return Happens in Refresh Phase, Not End Phase

**M3 says:** "End Phase: Return all DON!! attached to Characters/Leader back to the active DON!! pool"
**Rules say:** DON!! return happens during Refresh Phase (§6-2-3), not End Phase.

**Impact:** DON!! stays attached through the opponent's entire turn (granting no power per §6-5-5-2), then returns in your next Refresh Phase.

### 13.6 Attack Targets: Only Rested Characters

**M3 says:** Attack target is "opponent's Leader or a rested Character" (correct)
**But M3's data structures don't enforce this.** The validation logic must explicitly check that targeted Characters are in the rested state.

### 13.7 DON!! Returned During Refresh are RESTED

**M3 says:** (not specified)
**Rules say:** DON!! returned from Leader/Character areas to cost area are placed **rested** (§6-2-3), then set active in the next step (§6-2-4).

### 13.8 Characters Placed on Field Are Active

**M3 mentions this** but worth emphasizing: Character cards are placed active (§3-7-5), Stage cards are placed active (§3-8-4), DON!! cards placed in cost area are active (§3-9-3). All of these are defaults that can be overridden by card effects.

### 13.9 Life Card Ordering

**M3 doesn't address this.**
**Rules say:** During setup, the card on top of the deck goes to the bottom of the Life area (§5-2-1-7, §2-9-2-1). This means the last card placed in Life is the first one drawn as damage.

### 13.10 Mulligan is All-or-Nothing

**M3 correctly states this** but worth emphasizing: mulligan returns ALL cards, reshuffle, draw 5. No partial mulligans. First player mulligans first (§5-2-1-6).

### 13.11 Missing: "At the Start of the Game" Effects

**M3 doesn't account for this.**
**Rules say:** Some Leaders have "at the start of the game" effects processed between choosing first/second and drawing opening hands (§5-2-1-5-1).

### 13.12 Missing: Card Category vs Zone Targeting

**M3 doesn't account for this.**
**Rules say:** "Character" vs "Character card" have different meanings (§2-2-4-1 vs §2-2-4-2). The engine's targeting system must distinguish between these.

---

## Appendix: State Machine Summary

### Game Lifecycle

```
SETUP → PLAYING → FINISHED

SETUP:
  present_decks → shuffle → place_leaders → choose_first_second
  → start_of_game_effects → draw_opening_hands → mulligan → place_life_cards
  → PLAYING

PLAYING:
  turn_loop:
    REFRESH_PHASE → DRAW_PHASE → DON_PHASE → MAIN_PHASE → END_PHASE
    → opponent becomes turn player → repeat

FINISHED:
  triggered by: defeat_condition | concession | draw (infinite loop)
```

### Main Phase Sub-States

```
MAIN_PHASE:
  IDLE (waiting for turn player action)
    → PLAY_CARD (resolving cost payment + placement)
    → ACTIVATE_EFFECT (resolving effect)
    → GIVE_DON (attaching DON!! to card)
    → BATTLE (sub-state machine below)
    → END_MAIN_PHASE → proceed to END_PHASE
```

### Battle Sub-State Machine

```
BATTLE:
  ATTACK_STEP
    → declare attacker (rest it)
    → select target
    → resolve [When Attacking], [On Your Opponent's Attack], etc.
    → bail-out check
  BLOCK_STEP
    → defender may activate [Blocker] (once)
    → resolve [On Block] effects
    → bail-out check
  COUNTER_STEP
    → resolve "when attacked" effects
    → defender may use (Symbol) Counter and/or [Counter] Events (any number)
    → bail-out check
  DAMAGE_STEP
    → compare power
    → if attacker wins: deal damage (Leader) or KO (Character)
    → if attacker loses: nothing
  END_OF_BATTLE
    → resolve "end of battle" effects
    → expire "during this battle" effects
    → return to MAIN_PHASE IDLE
```

### Defeat Condition Checks

Run after every atomic game action:
```
if any_player.life.count == 0 AND any_player.leader.took_damage_this_action:
  → that player loses
if any_player.deck.count == 0:
  → that player loses
if both players lose simultaneously:
  → draw
```

---

_Last updated: 2026-03-15_
_Source: OPTCG Comprehensive Rules v1.2.0 (January 16, 2026)_
