# Card Analysis Findings

> Comprehensive analysis of all OPTCG card effects across 51 set files (OP-01 through OP-15, ST-01 through ST-29, EB-01 through EB-04, PRB-01, PRB-02, UNKNOWN). Every card with an effect was read and compared against the initial schema plan to identify patterns requiring first-class support.

---

## Table of Contents

1. [Trigger System](#1-trigger-system)
2. [Condition System](#2-condition-system)
3. [Action Primitives](#3-action-primitives)
4. [Cost Types](#4-cost-types)
5. [Targeting & Filtering](#5-targeting--filtering)
6. [Duration & Timing](#6-duration--timing)
7. [Prohibition & Protection](#7-prohibition--protection)
8. [Replacement Effects](#8-replacement-effects)
9. [Effect Structures & Chaining](#9-effect-structures--chaining)
10. [Rule Modifications](#10-rule-modifications)
11. [Life Card Subsystem](#11-life-card-subsystem)
12. [Dynamic Values & Scaling](#12-dynamic-values--scaling)
13. [Keyword & Ability Grants](#13-keyword--ability-grants)

---

## 1. Trigger System

The initial schema plan had 12 keyword triggers and 4 custom triggers. The full card pool requires approximately 30 distinct trigger patterns.

### 1.1 Keyword Triggers (Confirmed)

These are covered by the initial plan and confirmed across all sets:

- `ON_PLAY` — [On Play]
- `WHEN_ATTACKING` — [When Attacking]
- `ON_KO` — [On K.O.]
- `ON_BLOCK` — [On Block]
- `ON_OPPONENT_ATTACK` — [On Your Opponent's Attack]
- `ACTIVATE_MAIN` — [Activate: Main]
- `MAIN_EVENT` — [Main]
- `COUNTER` — [Counter]
- `TRIGGER` — [Trigger]
- `END_OF_YOUR_TURN` — [End of Your Turn]
- `END_OF_OPPONENT_TURN` — [End of Your Opponent's Turn]
- `START_OF_TURN` — "at the start of your turn"

### 1.2 Compound/Dual Triggers

A single effect block fires on either of two trigger events via `/` notation. Very common — appears in every set.

| Pattern | Example Cards |
|---------|---------------|
| `[On Play]/[When Attacking]` | ST26-005, EB01-012, EB01-046, ST10-012, ST14-007 |
| `[When Attacking]/[On Your Opponent's Attack]` | OP15-002 |
| `[When Attacking]/[On Block]` | OP01-078 |
| `[On Play]/[When Attacking]` | OP02-036, OP02-062 |
| `[Main]/[Counter]` | OP03-017, ST12-016 |
| `[On Play]/[On K.O.]` | EB02-053 |

**Schema requirement:** An effect block can be registered on multiple trigger types via `{ any_of: [trigger1, trigger2] }`.

### 1.3 Turn-Restricted Trigger Modifiers

`[Your Turn]` or `[Opponent's Turn]` prefixed on standard triggers restricts when they fire. This is a **timing gate**, not just a condition — an `[On Play]` gated by `[Your Turn]` won't fire if the card is played during the opponent's turn via a Trigger effect.

| Pattern | Example Cards |
|---------|---------------|
| `[Your Turn] [On Play]` | ST22-011, EB03-031, EB03-032, OP03-013 |
| `[Opponent's Turn] [On K.O.]` | EB03-055, EB03-042 |
| `[Your Turn] [Once Per Turn] When opponent's Character is K.O.'d` | EB04-044 |
| `[Opponent's Turn] [Once Per Turn] When DON!! returned` | EB03-033 |

**Schema requirement:** Triggers need an optional `turn_restriction: "YOUR_TURN" | "OPPONENT_TURN"` field.

### 1.4 New Custom Trigger Events

These are reactive triggers on game events not covered by the 12 keyword triggers.

#### 1.4.1 When Opponent's Character Is K.O.'d

Fires when any of the opponent's characters are K.O.'d (by any cause).

- OP01-061 Kaido: "When your opponent's Character is K.O.'d, add up to 1 DON!!"
- OP03-076 Rob Lucci: "When your opponent's Character is K.O.'d, set this Leader as active."
- EB04-044 Koby: "[Your Turn] [Once Per Turn] When your opponent's Character is K.O.'d, draw 1 card."

#### 1.4.2 When Any Character Is K.O.'d (Global)

Fires on ANY character being K.O.'d — yours or opponent's.

- ST08-001 Monkey.D.Luffy: "When a Character is K.O.'d, give up to 1 rested DON!! card to this Leader."
- EB01-047 Laboon: "[Once Per Turn] When a Character is K.O.'d, draw 1 card and trash 1 card from your hand."

#### 1.4.3 When DON!! Returned to DON!! Deck

Fires when DON!! cards leave the field to the DON!! deck. Variants include quantity thresholds and cause filters.

- OP02-071 Magellan: "When a DON!! card on the field is returned to your DON!! deck..."
- OP05-074 Eustass"Captain"Kid: "When a DON!! card on your field is returned to your DON!! deck..."
- OP09-061 Monkey.D.Luffy: "When 2 or more DON!! cards on your field are returned to your DON!! deck..." (quantity threshold)
- EB03-033 Charlotte Brulee: "When a DON!! card on your field is returned to your DON!! deck by your effect..." (cause filter)
- ST10-007 Killer, ST10-011 Heat, ST10-014 Wire: same trigger, different effects

#### 1.4.4 When DON!! Given to a Card

- OP02-002 Monkey.D.Garp: "When this Leader or any of your Characters is given a DON!! card..."

#### 1.4.5 When You/Opponent Activates an Event

- OP01-004 Usopp: "Draw 1 card when your opponent activates an Event."
- OP04-053 Page One: "When you activate an Event, draw 1 card."
- OP06-044 Gion: "When your opponent activates an Event..."
- OP11-102 Camie: "When your opponent activates an Event or [Trigger]..."
- OP15-119 Monkey.D.Luffy: "When your opponent activates an Event or [Blocker]..."

#### 1.4.6 When You/Opponent Plays a Character

- OP02-026 Sanji: "When you play a Character with no base effect from your hand..."
- OP04-024 Sugar: "When your opponent plays a Character..."
- OP12-081 Koala: "When your opponent plays a Character with a base cost of 8 or more, or when your opponent plays a Character using a Character's effect."
- OP13-100 Jewelry Bonney: "When you play a Character with a [Trigger]."

#### 1.4.7 When Card Removed from Life

- OP08-105 Jewelry Bonney: "When a card is removed from your opponent's Life cards..."
- OP11-041 Nami: "When a card is removed from your or your opponent's Life cards..."
- OP12-099 Kalgara: "When a card is removed from your or your opponent's Life cards, draw 1 card."

#### 1.4.8 When a [Trigger] Activates

- OP05-109 Pagaya: "When a [Trigger] activates, draw 2 cards and trash 2 cards from your hand."
- OP13-106 Conney: "When a [Trigger] activates, this Character gains [Blocker] during this turn."

#### 1.4.9 Combat Victory Trigger

- OP02-094 Isuka: "When this Character battles and K.O.'s your opponent's Character, set this Character as active."
- OP04-086: same pattern

#### 1.4.10 When This Character Battles [Target Type]

- ST02-010 Basil Hawkins: "If this Character battles your opponent's Character, set this card as active."
- ST05-010 Zephyr: "When this Character battles <Strike> attribute Characters, this Character gains +3000 power."

#### 1.4.11 At End of a Battle (Post-Battle)

- ST08-013 Mr.2.Bon.Kurei: "At the end of a battle in which this Character battles your opponent's Character, you may K.O. the opponent's Character you battled with."
- OP04-047 Ice Oni: "At the end of a battle in which this Character battles your opponent's Character with a cost of 5 or less, place the opponent's Character you battled with at the bottom of the owner's deck."

**Schema requirement:** Battle context reference — "the opponent's Character you battled with" requires tracking battle participants.

#### 1.4.12 When Life Count Becomes 0

- OP05-098 Enel: "When your number of Life cards becomes 0, add 1 card from the top of your deck to the top of your Life cards."

#### 1.4.13 When Card Added to Hand from Life

- OP05-107 Lieutenant Spacey: "When a card is added to your hand from your Life, this Character gains +2000 power during this turn."

#### 1.4.14 When You Draw Outside Draw Phase

- OP05-053 Mozambia: "When you draw a card outside of your Draw Phase, this Character gains +2000 power during this turn."

#### 1.4.15 When This Character Becomes Rested

- OP14-119 Dracule Mihawk: "When this Character becomes rested, up to 1 of your opponent's Characters with a cost of 9 or less cannot be rested..."

Source-specific variant:
- OP14-070 Buffalo: "When this Character becomes rested by your opponent's Character's effect..."

#### 1.4.16 When Opponent's Character Returned to Hand

- EB02-023 Crocodile: "When your opponent's Character is returned to the owner's hand by your effect..."

#### 1.4.17 When You Take Damage

- OP13-002 Portgas.D.Ace: "When you take damage or your Character with 6000 base power or more is K.O.'d, draw 1 card."

#### 1.4.18 When Opponent Activates [Blocker]

- OP09-118 Gol.D.Roger: "When your opponent activates [Blocker], if either you or your opponent has 0 Life cards, you win the game."

#### 1.4.19 When This Leader's Attack Deals Damage

- OP03-040 Nami: "When this Leader's attack deals damage to your opponent's Life, you may trash 1 card from the top of your deck."

### 1.5 Scoped ON_KO Variants

Generic ON_KO fires on any K.O. The card pool shows cause-specific variants:

| Scope | Example |
|-------|---------|
| By opponent's effect | OP09-052 Marco, OP11-024, OP11-035, OP11-051, ST15-003 Kingdew |
| In battle | Implied by comprehensive rules; distinct from effect-KO |
| Generic (any cause) | Standard [On K.O.] |

**Schema requirement:** ON_KO trigger needs an optional `cause: "EFFECT" | "BATTLE" | "OPPONENT_EFFECT" | "ANY"` qualifier.

### 1.6 Self-Referencing Effect Reuse

Trigger effects that invoke a different effect on the same card:

- "[Trigger] Activate this card's [Counter] effect." — ST03-016, OP01-028, OP01-030
- "[Trigger] Activate this card's [Main] effect." — ST21-017, EB01-020, EB01-051, EB04-049
- "[Trigger] Activate this card's [On Play] effect." — OP13-113, OP14-108

**Schema requirement:** A `REUSE_EFFECT` action primitive that references another effect block on the same card by its trigger type.

### 1.7 Cost on Trigger Effects

Triggers that require a cost to activate (normally Triggers are free):

- EB01-035 Ms. Monday: "[Trigger] DON!! −1: Play this card."
- EB01-038 Oh Come My Way: "[Trigger] DON!! −1: Draw 2 cards."
- OP04-064 Ms. All Sunday: "[Trigger] DON!! −2: Play this card."
- Many more across OP-04, OP-05

**Schema requirement:** Trigger effects must support optional `costs` field, same as auto/activate effects.

---

## 2. Condition System

The initial plan had ~15 condition types. The full card pool requires approximately 35 distinct condition patterns.

### 2.1 Comparative Conditions (Your Value vs Opponent's)

Conditions that compare a metric between players using relative operators (less than, greater than, equal to) rather than absolute thresholds.

| Metric | Example |
|--------|---------|
| Life count comparison | OP03-108: "If you have less Life cards than your opponent..."; OP13-102 Edison: "equal to or less than opponent's" |
| DON!! field count comparison | OP05-069: "If your opponent has more DON!! cards on their field than you..."; EB02-035 |
| Character count comparison | OP10-098: "number of your Characters is at least 2 less than opponent's"; EB04-059 |

### 2.2 Combined Total Conditions (Both Players)

Sums a value across both players and checks against a threshold.

- OP09-100 Karasu: "you and your opponent have a total of 5 or less Life cards"
- OP04-112 Yamato: "cost equal to or less than the total of your and your opponent's Life cards"
- EB04-055 Bartholomew Kuma: "you and your opponent have a total of 5 or less Life cards"
- OP11-114: "total of 5 or more Life cards"

### 2.3 Either-Player Conditions

OR logic between checking your state and opponent's state for the same metric.

- P-104 Shanks: "If either you or your opponent has 10 DON!! cards on the field..."
- P-107 Gol.D.Roger: "If either you or your opponent has 10 DON!! cards on the field..."
- OP09-118 Gol.D.Roger: "if either you or your opponent has 0 Life cards..."

### 2.4 Deck Count

- OP03-045 Carne: "If you have 20 or less cards in your deck..."
- OP03-049, OP03-053: same pattern
- OP15-022 Brook: "if your deck has 0 cards..."

### 2.5 Self Power Check

Checking THIS card's current effective power (including buffs/debuffs).

- OP05-004 Emporio.Ivankov: "If this Character has 7000 power or more..."
- OP14-004 Cavendish: "If this Character has 5000 power or more..."
- OP14-002 Urouge: same

### 2.6 Leader Power Check

- OP05-009 Toh-Toh: "Draw 1 card if your Leader has 0 power or less."
- OP15-004 Sea Cat: "If your Leader has 0 power or less..."

### 2.7 Self Active/Rested State

- ST02-014 X.Drake: "If this Character is rested, your {Supernovas} or {Navy} type Leaders and Characters gain +1000 power."
- OP04-017 Happiness Punch: "if your Leader is active..."

### 2.8 "No Base Effect" (Absence of Printed Effects)

- OP02-026 Sanji: "When you play a Character with no base effect from your hand..."
- OP02-045, OP02-046, OP03-091
- EB02-022 Usopp: "play up to 1 Character card with 6000 power or less and no base effect"
- EB03-009 Makino: "Up to 1 of your Characters with no base effect gains +2000 power"

### 2.9 Negative Effect/Property Filters

Filtering targets by the ABSENCE of a specific effect type.

- EB03-001 Vivi: "up to 1 of your Characters without a [When Attacking] effect"
- PRB01-001 Sanji: "Up to 1 of your Characters without an [On Play] effect"

### 2.10 Field Purity (Universal Quantifier)

ALL characters on your field must match a type — any non-matching character fails the condition.

- OP05-084 Saint Charlos: "If the only Characters on your field are {Celestial Dragons} type Characters..."
- OP11-043 Vinsmoke Ichiji: "when you only have Characters with a type including 'GERMA'..."
- OP13-095 Saint Rosward: same
- EB02-010 Monkey.D.Luffy: "If the only Characters on your field are {Straw Hat Crew} type Characters..."

### 2.11 NOT/Absence Conditions

Negation of existence checks.

- OP01-044 Shachi: "If you don't have [Penguin]..."
- OP01-050, OP03-027: similar
- OP08-005 Chess: "if you don't have [Kuromarimo]"
- OP07-060 Itomimizu: "if you have no other [Itomimizu]"

### 2.12 Duplicate/Uniqueness Check

- OP04-005 Kung Fu Jugon: "If you have a [Kung Fu Jugon] other than this Character..."
- EB01-012 Cavendish: "you have no other [Cavendish] Characters..."
- OP15-080 Oars: "there are no other [Oars] cards..."

### 2.13 Dynamic Threshold from Game State

The cost/power threshold for targeting is derived from a live game state value.

- OP05-102 Gedatsu: "K.O. up to 1 of your opponent's Characters with a cost equal to or less than the number of your opponent's Life cards."
- OP04-112 Yamato: "cost equal to or less than the total of your and your opponent's Life cards."
- OP13-099 The Empty Throne: "cost equal to or less than the number of DON!! cards on your field"
- ST29-002 Usopp: "cost equal to or less than the number of your opponent's Life cards"
- P-090 Charlotte Smoothie: "cost equal to or less than the number of DON!! cards on your opponent's field"

### 2.14 Combined Zone Count

- OP04-040 Queen: "If you have a total of 4 or less cards in your Life area and hand..."
- OP04-116: same pattern

### 2.15 Cost/Power Range (Bounded)

- OP05-088 Mansherry: "cost of 3 to 5"
- OP05-091: "cost of 3 to 7"
- EB03-060: "cost of 2 to 8"
- EB02-039: "5000 to 7000 power"
- OP10-099: "cost of 3 to 8"

### 2.16 Opponent's Life Count (Absolute)

The initial plan only had self life count. Opponent's is also needed:

- OP14-107 Shakuyaku: "If your opponent has 3 or less Life cards..."
- OP13-115: "if your opponent has 2 or less Life cards..."

### 2.17 All DON!! in Specific State

- OP02-027 Inuarashi: "If all of your DON!! cards are rested..."

### 2.18 Active DON!! Count

- OP04-028 Diamante: "If you have 2 or more active DON!! cards..."
- OP13-001 Monkey.D.Luffy: "If you have 5 or less active DON!! cards..."

### 2.19 Disjunctive Numeric Range

Non-contiguous value ranges.

- OP05-060 Monkey.D.Luffy: "If you have 0 or 3 or more DON!! cards on your field..."
- OP14-090 Mr.1: "Character with a cost of 0 or with a cost of 8 or more..."

### 2.20 Board-Wide Existence (Either Player's Field)

No ownership qualifier — checks both players' fields.

- OP14-018 Time for the Counterattack: "If there is a Character with 8000 power or more..."
- EB03-046 Miss Doublefinger: "If there is a Character with a cost of 0 or with a cost of 8 or more..."
- EB04-045 Ginny: "If there are 2 or more Characters with a cost of 8 or more..."

### 2.21 Face-Up Life Card

- EB03-051 Charlotte Smoothie: "If you have a face-up Life card..."
- PRB02-018 Portgas.D.Ace: "If you have a face-up Life card..."

### 2.22 Turn Count

- OP15-058 Enel: "If it is your second turn or later..."

### 2.23 Card Type Count in Specific Zone

- EB01-027 Mr.1: "+1000 power for every 2 Events in your trash"
- EB04-034 Charlotte Pudding: "If you have 4 or more Events in your trash..."
- OP15-021: "If you have 4 or more Events in your trash, give this card in your hand −3 cost."

### 2.24 OR Compound Conditions

Two conditions joined by OR.

- ST10-002 Monkey.D.Luffy: "If you have 0 DON!! cards on your field or 8 or more DON!! cards..."
- OP13-002 Portgas.D.Ace: "When you take damage or your Character with 6000 base power or more is K.O.'d..."

### 2.25 "Was Played This Turn" (Temporal Self-Check)

- ST19-003 Tashigi: "If this Character was played on this turn..."
- EB04-012 Kikunojo: "If this Character was played on this turn..."
- EB03-013 Carrot: same
- OP15-008 Krieg: same

### 2.26 Leader's Color Includes X

- OP11-080 Gear Two: "If your Leader's colors include blue..."

Distinct from "Leader is [Color]" (exact match) — this checks if a specific color is in the Leader's color set.

### 2.27 Multiple Named Cards on Field

- OP15-064 Kotori: "If you have [Satori] and [Hotori]..."
- OP15-072 Hotori: "If you have [Kotori] and [Satori]..."

### 2.28 Named Card with Power Threshold

- OP15-080 Oars: "If you have [Gecko Moria] with 10000 power or more on your field and there are no other [Oars] cards..."

### 2.29 Rested Card Count (All Types)

Counts ALL rested cards (Characters, DON, Stages, Leader).

- ST16-003 Charlotte Katakuri: "If you have 6 or more rested cards..."
- ST24-001 Capone"Gang"Bege: "If you have 6 or more rested cards..."
- OP12-118 Jewelry Bonney: "If you have 8 or more rested cards..."

### 2.30 DON Given to Target (Targeting Filter)

- OP15-001 Krieg: "Rest up to 1 of your opponent's Characters that has 2 or more DON!! cards given."
- OP15-018 Mohji: "K.O. up to 1 of your opponent's Characters with 3000 power or less with a DON!! card given."
- OP15-025 Kuro: "up to 1 rested Character with 3 or more DON!! cards given..."

### 2.31 Opponent Has DON Given

- OP15-005 Cabaji: "If your opponent has any DON!! cards given..."

### 2.32 Source-Specific Immunity Conditions

KO/removal immunity filtered by the SOURCE card's properties.

- OP14-003 Capone"Gang"Bege: "cannot be K.O.'d by effects of your opponent's Characters with 5000 base power or less."
- OP11-005 Smoker: "cannot be K.O.'d by effects of Characters without the <Special> attribute."
- OP01-024 Monkey.D.Luffy: "cannot be K.O.'d in battle by <Strike> attribute Characters."

### 2.33 Action Performed This Turn (Temporal State)

- OP15-002 Lucy: "If you have activated an Event with a base cost of 3 or more during this turn..."

### 2.34 How Card Was Played (Source/Method)

- OP12-081 Koala: "when your opponent plays a Character using a Character's effect."

---

## 3. Action Primitives

The initial plan had ~25 action primitives. The full card pool requires approximately 45.

### 3.1 New Card Movement Primitives

| Primitive | Description | Example Cards |
|-----------|-------------|---------------|
| `FULL_DECK_SEARCH` | Search entire deck (not top N) with filter, then shuffle | ST03-007 Sentomaru |
| `DECK_SCRY` | Look at top N, rearrange each to top/bottom, no selection | OP01-073, ST03-010, OP07-039 |
| `SEARCH_TRASH_THE_REST` | Look at top N, pick M, trash remainder (not deck bottom) | OP03-086, OP09-096, EB04-029 |
| `SEARCH_AND_PLAY` | Look at top N, play matching card directly to field | OP01-116, OP03-094, OP04-084 |
| `PLACE_HAND_TO_DECK` | Place card(s) from hand to top/bottom of deck | OP01-011, OP04-053, OP05-046 |
| `HAND_WHEEL` | Return all hand to deck (shuffle or bottom), draw same count | OP04-048 Sasaki, P-002 |
| `REVEAL_HAND` | Force opponent to reveal entire hand | OP07-090 Morgans |
| `SHUFFLE_DECK` | Explicit deck shuffle (not implied by search) | OP06-047, OP08-071 |
| `EXTRA_TURN` | Take an additional turn after this one | OP05-119 Monkey.D.Luffy |

### 3.2 New Power/Stats Primitives

| Primitive | Description | Example Cards |
|-----------|-------------|---------------|
| `SWAP_BASE_POWER` | Exchange base power between two cards | OP14-001, OP14-009, OP14-017 |
| `COPY_POWER` | Set base power to match another card's current power | OP04-069 Mr.2, OP06-009 Shuraiya, EB01-061, EB04-052 |
| `SET_COST` | Set a card's cost to a specific value | OP03-091 Helmeppo: "Set the cost...to 0" |

### 3.3 New DON!! Primitives

| Primitive | Description | Example Cards |
|-----------|-------------|---------------|
| `REDISTRIBUTE_DON` | Move already-attached DON between cards | OP07-001 Monkey.D.Dragon, EB02-009 Thousand Sunny |
| `FORCE_OPPONENT_DON_RETURN` | Force opponent to return their DON to DON deck | OP02-085 Magellan, OP02-089 |
| `REST_OPPONENT_DON` | Rest opponent's DON!! cards | OP04-021 Viola |
| `GIVE_OPPONENT_DON_TO_OPPONENT` | Move opponent's DON from cost area to their characters | OP15-003 Alvida, OP15-008 Krieg, OP15-015 Higuma, OP15-025 Kuro |
| `DISTRIBUTE_DON` | Give up to M DON each to up to N targets | OP08-001 Tony Tony.Chopper, EB03-026 Boa Hancock, OP14-105 |
| `RETURN_ATTACHED_DON_TO_COST` | Return given DON to cost area (not DON deck) | ST28-004 Kouzuki Momonosuke |

### 3.4 New Battle Primitives

| Primitive | Description | Example Cards |
|-----------|-------------|---------------|
| `REDIRECT_ATTACK` | Change attack target mid-battle (not Blocker) | OP14-060 Donquixote Doflamingo, EB01-038 |
| `DEAL_DAMAGE` | Deal damage via effect (follows damage rules incl. Trigger checks) | EB03-055 Nico Robin, OP06-116 Reject |
| `SELF_TAKE_DAMAGE` | Force yourself to take damage | OP14-115 Rindo: "you take 1 damage" |

### 3.5 New Effect/Meta Primitives

| Primitive | Description | Example Cards |
|-----------|-------------|---------------|
| `ACTIVATE_EVENT_FROM_HAND` | Resolve an Event's effect from hand via another card's effect | OP12-041 Sanji, OP15-014 Bartolomeo, OP15-046 Sabo |
| `ACTIVATE_EVENT_FROM_TRASH` | Execute Event effect from trash (flashback) | EB03-031 Vinsmoke Reiju |
| `REUSE_EFFECT` | Activate another effect on the same card by reference | ST03-016, ST21-017, OP01-028, OP13-113, OP14-108 |
| `NEGATE_TRIGGER_TYPE` | Blanket negate all effects of a given trigger type | OP09-081 Marshall.D.Teach: "Your [On Play] effects are negated" |
| `WIN_GAME` | Trigger win condition | OP09-118 Gol.D.Roger |
| `GRANT_ATTRIBUTE` | Give a card an attribute (Slash, Strike, etc.) | OP15-093 The Risky Brothers |
| `GRANT_COUNTER` | Give Counter value to cards that lack it | EB01-001 Kouzuki Oden |

### 3.6 Life Card Manipulation Primitives

See [Section 11: Life Card Subsystem](#11-life-card-subsystem) for the full suite.

### 3.7 Opponent-Forced Actions

Forced mandatory opponent actions (no "up to" — opponent must execute if able):

- EB01-028: "your opponent returns 1 of their active Characters to the owner's hand."
- EB03-026: "your opponent places 1 card from their hand at the bottom of their deck."
- P-009: "your opponent adds 1 card from their Life area to their hand."
- P-055: "Your opponent places 1 of their Characters at the bottom of the owner's deck."
- OP05-079 Viola: "Your opponent places 3 cards from their trash at the bottom of their deck."

**Schema requirement:** `OPPONENT_ACTION` must distinguish mandatory vs optional (existing schema has this).

### 3.8 Board Wipe Variants

- OP01-094 Kaido: "K.O. all Characters other than this Character." (both players, self-excluded)
- ST08-005 Shanks: "K.O. all Characters with a cost of 1 or less." (both players, filtered)
- OP15-114 Wyper: "K.O. all of your opponent's Characters with 0 power or less." (one side)
- OP13-082 Five Elders: "Trash all of your Characters..." (your own)

### 3.9 K.O. Stages

Stages are explicit KO/removal targets, not just Characters:

- OP02-118 Yasakani: "K.O. up to 1 of your opponent's Stages with a cost of 3 or less."
- OP03-096, OP13-098, OP14-088: similar

---

## 4. Cost Types

The initial plan had ~10 cost types. The full card pool requires approximately 20.

### 4.1 New Cost Types Found

| Cost Type | Description | Example Cards |
|-----------|-------------|---------------|
| `LEADER_POWER_REDUCTION` | Reduce own Leader's power as payment | OP04-002, OP04-006, EB01-004 Koza, EB03-006, EB04-023 |
| `TRASH_OWN_CHARACTER` | Trash character from field (not KO — no On K.O. trigger) | OP03-012, OP04-073, OP05-087 |
| `PLACE_OWN_CHARACTER_TO_DECK` | Place character at bottom of deck | OP15-041, OP15-052 |
| `RETURN_OWN_CHARACTER_TO_HAND` | Bounce your character as cost | OP13-031, OP13-059, OP15-039 |
| `PLACE_FROM_TRASH_TO_DECK` | Return cards from trash to deck bottom | OP03-080, OP03-092, OP07-083, OP05-080 (20 cards!) |
| `PLAY_NAMED_CARD_FROM_HAND` | Play a specific named card as cost | OP05-111 Hotori |
| `PLACE_STAGE_TO_DECK` | Place your Stage at bottom of deck | OP05-104, EB01-030, OP12-080 |
| `PLACE_SELF_AND_HAND_TO_DECK` | Stage + hand card to deck (compound) | EB01-030 Loguetown |
| `REST_NAMED_CARD` | Rest a specific named card | ST27-001 Avalo Pizarro |
| `RETURN_ATTACHED_DON_TO_COST` | Return given DON to cost area (rested) | ST28-004 |
| `VARIABLE_DON_RETURN` | Return 1 or more DON (min 1, no fixed max) | OP09-065 Sanji, OP09-068, OP09-070, OP09-073, OP09-076 |

### 4.2 Filtered Costs

Costs where the card being paid must match a filter:

- ST11-002 Uta: "trash 1 Event from your hand"
- ST05-005 Carina: "trash 1 {FILM} type card from your hand"
- OP02-018 Marco: "trash 1 card with a type including 'Whitebeard Pirates'"
- OP15-039 Rebecca: "return 1 of your {Dressrosa} type Characters to the owner's hand"

**Schema requirement:** All costs that involve selecting a card need a `filter` field matching the Target Filter system.

---

## 5. Targeting & Filtering

### 5.1 Aggregate Sum Constraint

Target selection where the SUM of a property across all selected targets must not exceed a threshold.

- OP05-007 Sabo: "K.O. up to 2 of your opponent's Characters with a total power of 4000 or less."
- OP09-018 Get Out of Here!: same pattern

**Schema requirement:** Target count with `aggregate_constraint: { property: "power", operator: "<=", value: 4000 }`.

### 5.2 Uniqueness Constraint

When selecting multiple cards, each must have a distinct name.

- OP06-062 Vinsmoke Judge: "Play up to 4 {GERMA 66} type Character cards with different card names..."
- OP13-082 Five Elders: "play up to 5 {Five Elders} type Character cards with 5000 power and different card names from your trash."

### 5.3 Asymmetric Multi-Target

Select N targets where each gets a distinct effect.

- OP06-086 Gecko Moria: "Choose up to 1 card (cost 4) and up to 1 card (cost 2)...Play 1 card and play the other card rested."
- OP08-118 Silvers Rayleigh: "Select up to 2...give 1 Character −3000 power and the other −2000 power."
- OP10-058 Rebecca: "Play 1 of the revealed cards and play the other card rested if it has a cost of 4 or less."

### 5.4 Mixed Card-Type Pool

Selecting from a pool spanning multiple card types with a shared total.

- OP06-035 Hody Jones: "Rest up to a total of 2 of your opponent's Characters or DON!! cards."
- OP12-037 Demon Aura: same
- EB02-007: "Up to a total of 3 of your Leader and Character cards gain +1000 power."

### 5.5 Dual Targeting in Single Action

A single action targets two separately filtered sets.

- OP01-096 King: "K.O. up to 1 of your opponent's Characters with a cost of 3 or less and up to 1 of your opponent's Characters with a cost of 2 or less."
- OP03-018: same
- EB04-059: same pattern with different filters

### 5.6 "Per Type" Target Selection

Selecting one from each card type.

- OP10-098 Liberation: "Negate the effect of up to 1 of each of your opponent's Leader and Character cards."

### 5.7 Attribute Filter

Card attributes (Slash, Strike, Ranged, Special, Wisdom) as target filters.

- OP11-006 Zephyr: "Give up to 1 of your opponent's <Special> attribute Characters −5000 power."
- ST05-010 Zephyr: "When this Character battles <Strike> attribute Characters..."

### 5.8 [Trigger] Keyword as Filter

- OP03-022 Arlong: "Play up to 1 Character card with a cost of 4 or less and a [Trigger] from your hand."
- OP13-110 Stussy: "play up to 1 Character card with a cost of 5 or less and a [Trigger]"
- ST29-014 Roronoa Zoro: "trash 1 card with a [Trigger] from your hand"
- EB04-027 Boa Hancock: "Character card with 5000 power or less and a [Trigger]"

### 5.9 Base Cost / Base Power Filters

Filters that check the original printed value, ignoring modifications.

- OP04-003 Usopp: "Characters with 5000 base power or less"
- OP04-119 Donquixote Rosinante: "Characters with a base cost of 5"
- OP15-001 Krieg: "Characters with a base power of 5000 or more"

### 5.10 Multi-Source Zones

Cards can come from either of two zones.

- ST13-003 Monkey.D.Luffy: "add up to 2 Character cards with a cost of 5 from your hand or trash to the top of your Life cards face-up."

### 5.11 "Up to 1 Each Of" (Named Card Distribution)

- ST13-006 Curly.Dadan: "Play up to 1 each of [Sabo], [Portgas.D.Ace], and [Monkey.D.Luffy] with a cost of 2 from your hand."

### 5.12 Dynamic Name Reference from Prior Step

- EB02-039 GERMA 66: "play up to 1 Character card with 5000 to 7000 power and the same card name as the trashed card from your trash."

### 5.13 Power-Based Play Filter

- OP04-010 Tony Tony.Chopper: "Play up to 1 {Animal} type Character card with 3000 power or less from your hand."

### 5.14 Multi-Type Disjunctive Search

- OP05-076 When You're at Sea: "reveal up to 1 {Straw Hat Crew}, {Kid Pirates}, or {Heart Pirates} type card..."
- OP03-112: "[Sanji] or {Big Mom Pirates} type"
- OP12-014 Boa Hancock: "[Monkey.D.Luffy] or red Event"

### 5.15 Multi-Pick Search

Taking multiple cards from a single search.

- OP04-046 Queen: "look at 7 cards from the top of your deck; reveal a total of up to 2 [Plague Rounds] or [Ice Oni] cards and add them to your hand."

### 5.16 DON Given Count as Filter

- OP15-031 Purinpurin: "If the chosen Character has a cost equal to the number of DON!! cards given to it, K.O. it."

---

## 6. Duration & Timing

### 6.1 New Duration Types

| Duration | Example | Notes |
|----------|---------|-------|
| `SKIP_NEXT_REFRESH` | "will not become active in opponent's next Refresh Phase" | ~20+ cards across OP-07 through OP-15 |
| `UNTIL_END_OF_YOUR_NEXT_TURN` | ST10-016: "until the end of your next turn" | Persists through opponent's turn and your next |
| `UNTIL_START_OF_YOUR_NEXT_TURN` | EB01-001: "until the start of your next turn" | Confirmed in initial plan |

### 6.2 Delayed/Scheduled Actions

Effects that are declared now but resolve at a future point. NOT the same as END_OF_TURN triggers — these are dynamically created obligations.

- OP06-006 Saga: "trash 1 of your Characters at the end of this turn"
- OP08-074 Black Maria: "at the end of this turn, return DON!! cards until you have the same number as your opponent"
- OP08-101 Charlotte Angel: "add 1 card from the top of your deck to the top of your Life cards at the end of this turn"
- OP11-092 Helmeppo: "place the 1 Character played by this effect at the bottom of the owner's deck at the end of this turn" (temporary play)
- OP13-024, OP13-038, OP14-031, OP15-025: "set up to N DON!! as active at the end of this turn"
- OP03-005 Thatch: "trash this Character at the end of this turn"
- OP04-009, OP04-026, OP04-033: same

**Schema requirement:** A `SCHEDULE_ACTION` wrapper that defers an action to end-of-turn (or other future timing point). The deferred action is a child of the current effect resolution.

### 6.3 "Next Time" One-Shot Modifier

A pending modifier that triggers exactly once on the next matching action.

- OP02-025 Kin'emon: "the next time you play a {Land of Wano} type Character card with a cost of 3 or more from your hand during this turn, the cost will be reduced by 1."
- OP12-061 Donquixote Rosinante: "The next time you play [Trafalgar Law] with a cost of 4 or more from your hand during this turn, the cost will be reduced by 2."

### 6.4 Specific Future Phase Timing

- PRB02-005 Monkey.D.Luffy: "your opponent rests 1 of their active DON!! cards at the start of their next Main Phase."

### 6.5 "At End of Battle" Scheduled Action

Distinct from END_OF_BATTLE as a timing — these schedule an action when the current battle resolves.

- OP02-064 Mr.2.Bon.Kurei: "at the end of this battle, place this Character at the bottom of the owner's deck."

### 6.6 Refresh Phase Skip (Very Common)

Cards are prevented from untapping during the Refresh Phase.

Appears in: OP07-026, OP07-059, OP08-022, OP08-023, OP08-024, OP08-025, OP08-036, OP10-033, OP12-022, OP13-040, OP14-021, OP14-035, OP15-023, EB02-015, ST24-004, P-057, and many more.

Targets: Characters, DON!! cards, Leader, Stages.

---

## 7. Prohibition & Protection

The initial plan had basic "cannot X" restrictions. The full card pool shows a rich taxonomy of prohibitions with scope qualifiers.

### 7.1 KO Protection Scoping

| Scope | Example |
|-------|---------|
| In battle (any attacker) | ST05-008 Shiki |
| In battle by attribute | OP01-024: "by <Strike> attribute Characters" |
| In battle by Leaders | ST08-002 Uta |
| By effects (any) | ST06-004 Smoker |
| By opponent's effects | ST14-009 Franky |
| By effects of Characters without attribute | OP11-005 Smoker |
| By effects of Characters with base power ≤ N | OP14-003 Capone"Gang"Bege |
| During this turn | ST05-017: "cannot be K.O.'d during this turn" |
| During this battle | OP02-118: "cannot be K.O.'d during this battle" |
| Once per turn (usage counter) | OP10-118: "Once per turn, this Character cannot be K.O.'d" |

**Schema requirement:** KO protection needs `{ cause, source_filter, duration, uses_per_turn }`.

### 7.2 Cannot Be Rested

- OP14-033 Perona: "cannot be rested until the end of your opponent's next End Phase"
- OP14-069 Donquixote Doflamingo: "cannot be rested..."
- OP14-119 Dracule Mihawk: "cannot be rested..."
- EB02-011 Arlong: same

Source-scoped:
- OP12-021 Ipponmatsu: "cannot be rested by your opponent's effects"
- OP15-024 Usopp: "cannot be rested by your opponent's Leader and Character effects"

### 7.3 Cannot Be Removed from Field

- OP13-083 St. Jaygarcia Saturn: "cannot be removed from the field by your opponent's effects."
- P-104 Shanks: "cannot be removed from the field by effects."

### 7.4 Cannot Attack (Variants)

| Variant | Example |
|---------|---------|
| Unconditional | P-084 Buggy: "This Character cannot attack." |
| Leader cannot attack | OP03-058 Iceberg: "This Leader cannot attack." |
| Conditional | EB04-005 Trafalgar Law: "cannot attack unless opponent has 2+ Characters with 5000+ base power." |
| Universal (both sides) | P-084 Buggy: "all Characters with a cost of 3 or 4 cannot attack." |
| With override cost | OP08-043 Edward.Newgate: "cannot attack unless opponent trashes 2 cards whenever they attack." |

### 7.5 Refresh Phase Prevention

See [Section 6.6](#66-refresh-phase-skip-very-common).

### 7.6 Cannot Play Cards

| Variant | Example |
|---------|---------|
| Characters this turn | OP14-020: "you cannot play Character cards during this turn." |
| Characters with base cost ≥ N | OP12-030: "cannot play Character cards with a base cost of 7 or more." |
| All cards from hand | OP13-028 Shanks: "you cannot play cards from your hand during this turn." |
| On specific field area | EB03-024 Vivi: "you cannot play any Character cards on your field during this turn." |

### 7.7 Cannot Draw Using Own Effects

- OP12-099 Kalgara: "you cannot draw cards using your own effects during this turn."

### 7.8 Cannot Be Played By Effects (In-Hand)

- OP12-036 Roronoa Zoro: "This card in your hand cannot be played by effects."

### 7.9 Cannot Activate Blocker (Scoped to Attacker)

- OP12-016: "Your opponent cannot activate [Blocker] when the card given these DON!! cards attacks."
- OP12-077: "if the selected card attacks during this turn, your opponent cannot activate [Blocker]."
- ST01-012: "[DON!! x2] [When Attacking] Your opponent cannot activate [Blocker] during this battle."
- ST01-016 Diable Jambe: "Your opponent cannot activate [Blocker] if that Leader or Character attacks."

### 7.10 Cannot Add Life to Hand Using Own Effects

- ST15-001 Atmos: "you cannot add Life cards to your hand using your own effects during this turn."
- OP06-020 Hody Jones: "you cannot add Life cards to your hand using your own effects during this turn."

### 7.11 Cannot Set DON Active Using Specific Effects

- EB04-016 Bird Neptunian: "you cannot set DON!! cards as active using Character effects during this turn."
- OP10-030 Smoker: same

### 7.12 Self-Prohibition as Drawback

Prohibitions imposed on your own controller after resolving an effect.

- EB03-024 Vivi: "you cannot play any Character cards on your field during this turn."
- OP14-020: "you cannot play Character cards during this turn."
- OP14-079 Crocodile: "All of your opponent's Characters cannot be removed from the field by your effects." (self-limits your own removal)

### 7.13 "Would Leave Field" (Broader than KO)

- OP05-100 Enel: "If this Character would leave the field, you may trash 1 card from the top of your Life cards instead."

Covers ALL forms of removal (KO, bounce, deck-tuck, etc.).

---

## 8. Replacement Effects

The initial plan had basic "would be KO'd" replacement. The full card pool shows many more replacement triggers and replacement actions.

### 8.1 Replacement Triggers (What's Being Replaced)

| Trigger | Example |
|---------|---------|
| Would be K.O.'d | Vivi EB03-001, Buggy P-084 |
| Would be removed from field by opponent's effect | Perona OP15-090, Crocodile & Mihawk ST25-003, St. Jaygarcia Saturn |
| Would leave the field (any cause) | OP05-100 Enel |
| Would be rested by opponent's effect | PRB02-006 Roronoa Zoro |
| Would lose the game (deck-out) | OP03-040 Nami: "win instead of losing" |
| Life card added to hand (rule replacement) | ST13-003 Monkey.D.Luffy: "placed at bottom of deck instead of being added to hand" |

### 8.2 Replacement Actions (What Happens Instead)

| Replacement | Example |
|-------------|---------|
| Trash card from hand | Vivi EB03-001, Perona OP15-090, ST25-003 |
| Trash Character card with filter from hand | Buggy P-084: "trash 1 Character card with 6000 power or less" |
| Return DON to DON deck | EB04-030 Kaido |
| Place cards from trash to deck bottom | OP11-001 Koby: "place 3 cards from your trash at the bottom" |
| Rest one of your DON cards | P-111 Nico Robin |
| Self power reduction | PRB02-002 Trafalgar Law: "give this Character −2000 power instead" |
| Rest different character | PRB02-006 Roronoa Zoro: "rest 1 of your other Characters instead" |
| Turn Life card face-up | ST29-008 Nami |
| Place to Life face-down | OP11-101: "add it to the top of your Life cards face-down instead" |
| Win the game | OP03-040 Nami |
| Place at bottom of deck | ST13-003: Life cards go to deck instead of hand |

### 8.3 Proxy Replacement Effects

A card provides replacement protection for OTHER cards (not itself).

- EB03-001 Vivi: "If your Character with a base cost of 4 or more would be K.O.'d..."
- ST25-003 Crocodile & Mihawk: "If your {Cross Guild} type Character would be removed..."
- P-111 Nico Robin: "If your {Straw Hat Crew} type Character would be removed..."
- ST29-008 Nami: "If your {Egghead} type Character would be K.O.'d..."
- OP15-090 Perona: "If your Character with 7000 base power or less would be removed..."
- OP11-001 Koby: "If your {Navy} type Character with 7000 base power or less would be removed..."
- EB04-043 Kaku: "If your black Character with a base cost of 5 or less would be K.O.'d..."

---

## 9. Effect Structures & Chaining

### 9.1 Back-Reference to Prior Target ("That Card")

A later step in a chain references the specific card targeted by a prior step.

- OP01-029 Radical Beam!!: "+2000 power...Then, if you have 2 or less Life, **that card** gains additional +2000."
- OP04-093: same
- OP06-038: "+2000 power...Then, if condition, **that card** gains additional +2000."
- OP10-097: "+2000 power...Then, **that card** gains [Banish]."

**Schema requirement:** A `target_ref` mechanism to bind targets across chain steps. Prior step assigns a reference ID, later step uses it.

### 9.2 Relational Constraint Between Sequential Actions

The second action's targeting is constrained by a property of the first action's result.

- OP01-002 Trafalgar Law: "return 1 of your Characters to hand. Then, play up to 1 Character that is a **different color** than the returned Character."
- EB02-039 GERMA 66: "play up to 1 Character card with the **same card name as the trashed card** from your trash."

### 9.3 Conditional Target Upgrade

If a condition is met, targeting criteria are replaced with better ones.

- OP04-094 Trueno Bastardo: "K.O. up to 1 with cost 4 or less. If you have 15+ cards in trash, cost 6 or less instead."

### 9.4 Inline Replacement Choice

Mid-effect, one action can be swapped for another based on a condition.

- OP04-040 Queen: "draw 1 card. If you have a Character with cost 8+, you may add 1 from deck to Life instead of drawing."

### 9.5 Destination Choice

Player chooses which zone the target goes to.

- OP04-043 Ulti: "Return up to 1 Character to the owner's hand **or** the bottom of their deck."
- OP11-050 Gotti: "Return to the owner's hand **or** place at the bottom of their deck."
- OP05-096: "K.O. up to 1 **or** return it to the owner's hand."

### 9.6 Tiered/Stacking Threshold Effects

Multiple static effects that stack as a value crosses increasing thresholds. All qualifying tiers apply simultaneously.

- OP15-092 Monkey.D.Luffy: "Apply each based on trash count: 10+ → A; 20+ → A+B; 30+ → A+B+C"

### 9.7 Deferred Conditional Prohibition

Select a target now, but the prohibition only activates when that target performs a future action.

- ST21-003 Sanji: "Select up to 1 of your Characters with 6000 power or more. If the selected Character attacks during this turn, your opponent cannot activate [Blocker]."
- OP07-057 Perfume Femur: "if the selected card attacks during this turn, your opponent cannot activate [Blocker]."

### 9.8 Conditional Self-Negation

A card's own triggered ability negates its own static restriction.

- OP14-056 Wadatsumi: "This Character cannot attack. When a card is trashed from your hand by an effect, this Character's effect is negated during this turn." (unlocks itself)

### 9.9 "Opponent Decision with Consequence"

Opponent chooses between two bad outcomes. "If they do not" creates a fallback branch.

- OP05-099 Amazon: "Your opponent may trash 1 card from their Life. If they do not, give −2000 power."
- OP15-059 Amazon: "Your opponent may return 1 active DON to DON deck. If they do not, give −2000 power."

### 9.10 Cross-Reference Count Between Steps

A later step uses the count from an earlier step.

- EB04-011 Scaled Neptunian: "Draw a card for each of your {Neptunian} type Characters. Then, trash the same number of cards from your hand."
- OP04-048 Sasaki: "draw cards equal to the number you returned to your deck."

### 9.11 Self-Bounce on Failed Condition

Mandatory self-removal if a condition is NOT met.

- P-098 Buggy: "[On Play] If you do not have 5 Characters with a cost of 5 or more, place this Character at the bottom of the owner's deck."

---

## 10. Rule Modifications

### 10.1 Name Aliasing

Card has additional name(s) for all game purposes (deck building, targeting, conditions).

- OP01-121 Yamato: "Also treat this card's name as [Kouzuki Oden] according to the rules."
- OP02-042, OP03-122, OP04-099
- EB02-016 Chopperman: "Also treat this card's name as [Tony Tony.Chopper]."
- EB02-024 Sogeking: "Also treat this card's name as [Usopp]."
- EB04-038 Rosinante & Law: "Also treat this card's name as [Trafalgar Law] and [Donquixote Rosinante]." (multiple aliases)
- P-027 General Franky: "Also treat this card's name as [Franky]."

### 10.2 Counter Value Grant

- EB01-001 Kouzuki Oden: "All of your {Land of Wano} type Character cards without a Counter have a +1000 Counter, according to the rules."

### 10.3 Deck Construction Restrictions

- OP13-079 Imu: "you cannot include Events with a cost of 2 or more in your deck"
- OP12-001 Silvers Rayleigh: "you cannot include cards with a cost of 5 or more in your deck"
- P-117 Nami: "you can only include {East Blue} type cards in your deck"

### 10.4 Deck Copy Limit Override

- OP01-075 Pacifista: "you may have any number of this card in your deck."

### 10.5 DON!! Deck Size Override

- OP15-058 Enel: "your DON!! deck consists of 6 cards."

### 10.6 DON!! Phase Behavior Modification

- OP13-003 Gol.D.Roger: "If you have any DON!! cards on your field, 1 DON!! card placed during your DON!! Phase is given to your Leader."

### 10.7 Loss Condition Modification

- OP03-040 Nami: "When your deck is reduced to 0, you win the game instead of losing." (inverts to win)
- OP15-022 Brook: "you do not lose when your deck has 0 cards. You lose at the end of the turn in which your deck becomes 0 cards." (delays loss)

### 10.8 Start of Game Effects

- OP13-079 Imu: "at the start of the game, play up to 1 {Mary Geoise} type Stage card from your deck."

### 10.9 Blanket Trigger-Type Negation

- OP09-081 Marshall.D.Teach: "Your [On Play] effects are negated." / "Your opponent's [On Play] effects are negated until end of opponent's next turn."

### 10.10 Play State Modification

- OP09-022 Lim: "Your Character cards are played rested." (all Characters enter rested by default)

### 10.11 Damage Rule Modification

- ST13-003 Monkey.D.Luffy: "Your face-up Life cards are placed at the bottom of your deck instead of being added to your hand, according to the rules."

---

## 11. Life Card Subsystem

The Life area is far more mechanically complex than initially modeled. Two full archetypes (Big Mom Pirates, Sabo/Ace/Luffy) and multiple Leaders depend on Life manipulation. This needs first-class support.

### 11.1 Life Card Properties

Each Life card must track:
- **Face orientation**: face-up or face-down (default face-down)
- **Position**: ordered stack with top and bottom

### 11.2 Life Manipulation Actions

| Action | Description | Example Cards |
|--------|-------------|---------------|
| `TURN_LIFE_FACE_UP` | Turn N cards from top of Life face-up | OP08-058, OP10-099, OP11-022, OP11-117, ST20-001, EB01-040, EB02-060 |
| `TURN_LIFE_FACE_DOWN` | Turn N Life cards face-down | OP08-063, OP08-075, OP11-100, OP15-099, EB01-052, ST13-009 |
| `TURN_ALL_LIFE_FACE_DOWN` | Turn all Life cards face-down | OP08-075, EB01-052 |
| `LIFE_SCRY` | Look at top/bottom N of your/opponent's Life, place at top or bottom | OP03-099, OP03-104, OP06-099, OP11-062 |
| `REORDER_ALL_LIFE` | Look at all Life cards, place back in any order | OP13-105, ST13-004, EB01-052 |
| `ADD_TO_LIFE_FROM_DECK` | Add top card from deck to Life (face-up/down, top/bottom) | ST07-005, OP08-101, OP10-119, ST13-005 |
| `ADD_TO_LIFE_FROM_HAND` | Add card from hand to Life | ST07-001, EB03-059 |
| `ADD_TO_LIFE_FROM_FIELD` | Move Character from field to Life (face-up/down, top/bottom) | OP03-123, OP06-103, OP06-107, OP08-069, ST07-017, ST09-015, ST13-001, EB01-053, EB02-057 |
| `PLAY_FROM_LIFE` | Reveal Life card, conditionally play it | OP10-022, ST13-007 |
| `LIFE_TO_HAND` | Add Life card to hand (effect, not damage) choosing top/bottom | ST07-001, OP03-102, OP14-103 |
| `TRASH_FROM_LIFE` | Trash card directly from Life (not damage, no Trigger) | ST04-001, ST07-010, OP03-114, OP03-120, EB03-057, OP15-116 |
| `DRAIN_LIFE_TO_THRESHOLD` | Trash Life cards until you have N remaining | EB01-059, EB01-060 |
| `LIFE_CARD_TO_DECK` | Move Life card to deck top/bottom (not hand, not trash) | OP01-063 Arlong |
| `TRASH_FACE_UP_LIFE` | Trash all face-up Life cards | ST13-002 Portgas.D.Ace |

### 11.3 Life as Source Zone for Play

`PLAY_CARD` needs `from: "LIFE"` as a valid source.

- OP10-022 Trafalgar Law: "Reveal 1 card from the top of your Life cards. If that card is a {Supernovas} type Character card with a cost of 5 or less, you may play that card."
- ST13-007 Sabo: "Reveal 1 card from the top of your Life cards. If that card is a [Sabo] with a cost of 5, you may play that card."

### 11.4 Life as Destination for Characters

`ADD_TO_LIFE` must accept Characters from field (removal method) and from hand.

Owner routing:
- Some effects add to the **owner's** Life (OP03-123, EB01-053)
- Some add to the **opponent's** Life (OP08-069, ST09-015)

---

## 12. Dynamic Values & Scaling

### 12.1 "For Every X" Patterns

| Scaling Basis | Multiplier | Example |
|---------------|------------|---------|
| Cards trashed from hand | +1000 per card | OP03-001 Ace, OP15-002 Lucy |
| DON!! rested this way | +2000 per DON | OP13-001 Monkey.D.Luffy |
| Characters returned | +2000 per returned | P-059 The World's Continuation |
| Events in trash | +1000 per 2 Events | OP01-083 Mr.1 (divisor = 2) |
| Cards in trash (general) | +1000 per 5 cards, +2 cost per 5 cards | EB04-048 Rob Lucci |
| Characters K.O.'d by effect | +1000 per KO | OP06-095 Shadows Asgard |
| Cards placed at bottom | +1000 per 3 cards | OP07-091 (divisor = 3) |
| Revealed card's cost | +1000 per 1 cost | OP15-119 |
| DON!! cards given to target | equals count | OP15-031 (exact match) |

### 12.2 Dynamic Value from Game State

Values derived from live game state rather than fixed numbers.

| Source | Usage | Example |
|--------|-------|---------|
| Opponent's Life count | Target cost threshold | OP05-102, ST29-002, OP15-102 |
| Your Life count | Draw count, cost reduction | Various |
| Combined Life total | Target cost threshold | OP04-112, EB01-059 |
| DON!! field count | Target cost threshold | OP13-099, P-090 |
| Number returned to deck | Draw count | OP04-048 Sasaki |
| Opponent's Life count | Damage amount | Implicit in damage rules |

### 12.3 Scaling with Divisor

"For every N" where N > 1.

- OP01-083 Mr.1: "+1000 for every 2 Events in your trash"
- OP07-091: "+1000 for every 3 cards placed at the bottom"
- EB04-048: "+1000 per 5 cards in trash"

**Schema requirement:** Dynamic value needs `{ per: "reference", divisor: N, multiplier: M }`.

### 12.4 Action Result References

Values derived from the result of a prior action in the same chain.

- OP04-048 Sasaki: "draw cards equal to the number you returned to your deck"
- EB04-011: "Then, trash the same number of cards from your hand"
- OP06-095: "+1000 for every Character K.O.'d" (counts action result)

---

## 13. Keyword & Ability Grants

### 13.1 Standard Keywords (Grant via Effect)

All of these are granted to other cards by effects:

- Rush, Blocker, Double Attack, Banish, Unblockable, Rush: Character

### 13.2 "Can Attack Active Characters"

A distinct ability (NOT Rush: Character) that removes the "rested-only" targeting restriction.

- OP01-021 Franky: "This Character can also attack your opponent's active Characters."
- OP06-110, OP11-010, OP11-014, OP11-082, OP11-084, OP11-119
- EB03-008, EB04-050

### 13.3 "Characters Can Attack Characters on Play Turn"

Partial Rush for characters (can attack Characters but NOT Leader on play turn). Granted by Stages.

- OP01-001 Koby: "your {SWORD} type Characters can attack Characters on the turn in which they are played."
- OP04-096 Corrida Coliseum: "your {Dressrosa} type Characters can attack Characters on the turn in which they are played."

### 13.4 Keyword Choice

Player picks 1 keyword from a set.

- OP09-084 Catarina Devon: "this Character gains [Double Attack], [Banish] or [Blocker] until..."

### 13.5 Conditional Self-Negation (Drawback Removal)

- OP14-056 Wadatsumi: "This Character cannot attack. When a card is trashed from your hand by an effect, this Character's effect is negated during this turn."

### 13.6 Aura Effects (Static Grants to Other Cards)

One card grants abilities/protections to all matching cards while on field.

- OP01-099 Kurozumi Semimaru: "{Kurozumi Clan} type Characters other than your [Kurozumi Semimaru] cannot be K.O.'d in battle."
- OP02-074 Saldeath: grants Blocker to [Blugori]
- OP15-070 Fuza: "All of your [Shura] cards and this Character gain [Unblockable]."
- OP15-071 Holly: "All of your [Ohm] cards and this Character gain [Double Attack]."
- OP05-097 Mary Geoise: cost reduction aura for {Celestial Dragons} Characters

### 13.7 Static Play Cost Reduction

Permanent effects that reduce the play cost for matching cards.

- OP05-097 Mary Geoise: "The cost of playing {Celestial Dragons} type Character cards with a cost of 2 or more from your hand will be reduced by 1."
- OP01-067: "Give blue Events in your hand −1 cost."

### 13.8 Hand-Zone Static Effects

Effects active while the card is in the hand zone (not on field).

- OP12-036 Roronoa Zoro: "This card in your hand cannot be played by effects."
- EB04-061 Monkey.D.Luffy: "If you have 1 or less Life cards, give this card in your hand −1 cost."
- OP15-013, OP15-021, OP15-102, ST23-001, ST23-002, ST26-001, PRB02-014: all "give this card in your hand −N cost"

**Schema requirement:** Effects need a `zone: "HAND" | "FIELD" | "ANY"` qualifier to indicate where the effect is active.

---

_Analysis conducted across 51 set files. Last updated: 2026-03-19_
