# Comprehensive Rules → Game Engine Map

> Maps every gameplay-relevant rule from `docs/rules/rule_comprehensive.md` (v1.2.0) to the engine function that implements it, identifies gaps, and calls out rules that require new functions or architectural changes.

---

## How to Read This Document

Each section mirrors the Comprehensive Rules. Rules are grouped by engine file/function and tagged with one of:

| Status | Meaning |
|--------|---------|
| **IMPL** | Fully implemented in M3 |
| **PARTIAL** | Partially implemented — some sub-rules missing |
| **STUB** | Function or data slot exists but logic is a no-op |
| **GAP** | No implementation; requires new code |
| **N/A** | Not relevant to the engine (cosmetic, deck construction only, etc.) |

**Engine file index** (all under `workers/game/src/engine/`):

| File | Purpose |
|------|---------|
| `pipeline.ts` | 7-step action pipeline — entry point for every mutation |
| `validation.ts` | Step 1 — action legality checks |
| `execute.ts` | Step 4 — thin dispatcher to phases/battle/main actions |
| `phases.ts` | Phase transitions: REFRESH → DRAW → DON → MAIN → END |
| `battle.ts` | Attack → Block → Counter → Damage → End of Battle |
| `setup.ts` | Game initialization, mulligan |
| `state.ts` | Immutable state helpers: zone transitions, DON!! mutations, card lookup |
| `modifiers.ts` | Layered power/cost computation |
| `keywords.ts` | Keyword queries (Rush, Blocker, etc.) |
| `defeat.ts` | Win/loss condition checks |
| `events.ts` | Event bus — appends typed events to state log |

**Shared types**: `shared/game-types.ts`

---

## 1. Game Overview (§1)

### 1-1. Number of Players

| Rule | Status | Engine Location | Notes |
|------|--------|----------------|-------|
| **1-1-1.** Two-player game | **IMPL** | `GameState.players: [PlayerState, PlayerState]` in `game-types.ts:177` | Fixed 2-element tuple enforces this structurally |

### 1-2. Ending the Game

| Rule | Status | Engine Location | Notes |
|------|--------|----------------|-------|
| **1-2-1.** Game ends when a player loses | **IMPL** | `defeat.ts → checkDefeat()` + `pipeline.ts:66–81` | Pipeline step 7 checks defeat after every action |
| **1-2-1-1-1.** Defeat: 0 life + leader takes damage | **IMPL** | `defeat.ts:31–34` | `p0LifeOut` / `p1LifeOut` checks require `damagedPlayerIndex` context |
| **1-2-1-1-2.** Defeat: 0 cards in deck | **IMPL** | `defeat.ts:26–27` | `p0DeckOut` / `p1DeckOut` |
| **1-2-2.** Defeat processed at next rule processing | **IMPL** | `pipeline.ts:61–81` | Step 7 runs after every action |
| **1-2-2-1.** Leader damage + 0 life = defeat | **IMPL** | `defeat.ts:31–34`, `battle.ts:306–309` | Battle checks life-out before moving life cards |
| **1-2-2-2.** 0 deck cards = defeat | **IMPL** | `defeat.ts:26–27` | Checked every pipeline run |
| **1-2-3.** Concession at any time | **IMPL** | `execute.ts → executeConcede()`, `validation.ts:52` | Always legal, immediate game end |
| **1-2-4.** Concession unaffected by cards | **IMPL** | `executeConcede()` bypasses all effect logic | No card effect can block concession |
| **1-2-5.** Card effects that cause win/loss | **GAP** | — | No card effect can currently trigger a win/loss. Needs M4 effect engine to evaluate "you win/lose the game" effect text |

### 1-3. Fundamental Principles

| Rule | Status | Engine Location | Notes |
|------|--------|----------------|-------|
| **1-3-1.** Card text overrides rules | **GAP** | — | M4 effect engine must be able to override base rule logic. Pipeline step 2 (prohibitions) and step 3 (replacements) are stubs |
| **1-3-2.** Impossible actions are skipped | **PARTIAL** | `state.ts:98` (`moveCard` returns state on not-found), `restDonForCost` returns null | Applied ad-hoc; no unified "attempt or skip" pattern |
| **1-3-2-1.** Redundant state changes are no-ops | **PARTIAL** | `activateAllRested()` only touches RESTED cards | Not systematically enforced across all mutations |
| **1-3-2-2.** 0 or negative repetitions = no action | **PARTIAL** | `battle.ts:312` loop breaks on no more life | No universal guard for effect-driven repetition counts |
| **1-3-3.** Prohibiting effects take precedence | **STUB** | `pipeline.ts:42–43` | Step 2 is a no-op; `state.prohibitions` is always empty in M3 |
| **1-3-4.** Turn player chooses first on simultaneous | **GAP** | — | No mechanism for ordering simultaneous choices between players |
| **1-3-5.** Number choices ≥ 0 whole numbers | **GAP** | — | No input validation framework for effect-driven number choices |
| **1-3-6.** Cost/power floor rules | **PARTIAL** | `modifiers.ts:52` clamps cost to ≥ 0; power has no floor per **1-3-6-1** | Cost floor implemented; power correctly allows negatives |
| **1-3-6-1.** Power can be negative | **IMPL** | `modifiers.ts:17–18` comment; no `Math.max` on power | Correctly allows negative power |
| **1-3-6-1-1.** Negative power doesn't trash | **IMPL** | No zero-power KO check exists | Correct by omission — no auto-KO at 0 power |
| **1-3-6-2.** Cost can go negative during calculation | **GAP** | — | M4 cost modifiers need to allow mid-calculation negatives before clamping at the end |
| **1-3-7.** Effects processed top-to-bottom | **GAP** | — | No effect sequencing logic; M4 needs ordered effect resolution |
| **1-3-8.** Rest takes precedence over activate | **GAP** | — | No conflict resolution when an effect tries to both rest and activate a card |
| **1-3-9-1.** Cost definition | **IMPL** | `CardData.cost`, `getEffectiveCost()` in `modifiers.ts` | |
| **1-3-9-2.** Activation cost definition | **GAP** | — | No activation cost parsing or payment. `ACTIVATE_EFFECT` action returns `{ state, events: [] }` (no-op) |
| **1-3-10.** Turn player acts first on simultaneous effects | **GAP** | — | Same as 1-3-4 — no simultaneous effect ordering |

---

## 2. Card Information (§2)

### 2-1 to 2-5. Name, Category, Color, Type, Attribute

| Rule | Status | Engine Location | Notes |
|------|--------|----------------|-------|
| **2-2-2.** Five card categories | **IMPL** | `CardData.type: "Leader" \| "Character" \| "Event" \| "Stage"` | DON!! cards are `DonInstance` — a separate type, not a `CardData` |
| **2-2-4-1/2.** "Character" vs "Character card" distinction | **GAP** | — | The rules distinguish between a Character (in Character area) and a "Character card" (outside Character area). Engine has no location-sensitive type inference for effect targeting |
| **2-3-4/5.** Multi-color cards | **IMPL** | `CardData.color: string[]` | Array structure supports multi-color |
| **2-4-2.** Multiple types (slash-separated) | **GAP** | `CardData` has no `types` field | Card type/tribe data not modeled. Effects referencing `{type}` brackets cannot be evaluated |
| **2-5.** Attributes (Slash, Strike, etc.) | **GAP** | `CardData` has no `attribute` field | Card attributes not modeled. Effects referencing `<attribute>` brackets cannot be evaluated |

### 2-6 to 2-9. Power, Cost, Card Text, Life

| Rule | Status | Engine Location | Notes |
|------|--------|----------------|-------|
| **2-6-1/2.** Power on Leaders/Characters | **IMPL** | `CardData.power`, `getEffectivePower()` | |
| **2-6-3.** Effects modify power | **STUB** | `modifiers.ts` Layer 1 & 2 are no-ops | M4 modifier layers needed |
| **2-7-1 to 2-7-4.** Cost payment to play cards | **IMPL** | `executePlayCard()` in `execute.ts`, `restDonForCost()` in `state.ts` | Correctly handles Character, Event, and Stage cost payment |
| **2-7-6.** Effects modify cost | **STUB** | `getEffectiveCost()` Layer 1 & 2 are no-ops | M4 cost modifiers needed |
| **2-8-1 to 2-8-3.** Effect text, zone validity, top-to-bottom | **GAP** | — | No effect text parser. `effectText` is a raw string on `CardData`; `effectSchema` is `null` in M3 |
| **2-9-1/2.** Life value on Leader | **IMPL** | `setup.ts:48–50` with fallback chain | Life cards dealt from deck during setup |
| **2-9-4.** Effects can increase Life value | **GAP** | — | No mechanism to add life cards mid-game via effect |

### 2-10/2-11. Counter and Trigger

| Rule | Status | Engine Location | Notes |
|------|--------|----------------|-------|
| **2-10-1.** Symbol counter = power increase during Counter Step | **IMPL** | `executeUseCounter()` in `battle.ts` | Trashes card from hand, adds counter value to `BattleContext.counterPowerAdded` |
| **2-11-1.** Trigger activation from life area | **IMPL** | `battle.ts:339–353` (damage step) + `executeRevealTrigger()` | Detects trigger card, pauses for player choice |
| **2-11-2.** Trigger is card text | **IMPL** | `CardData.triggerText` field exists | |

---

## 3. Game Areas (§3)

### 3-1. General Area Rules

| Rule | Status | Engine Location | Notes |
|------|--------|----------------|-------|
| **3-1-1.** Nine areas defined | **IMPL** | `Zone` type in `game-types.ts:10–20` | All 9 zones modeled: LEADER, CHARACTER, STAGE, COST_AREA, HAND, DECK, TRASH, LIFE, DON_DECK + REMOVED_FROM_GAME |
| **3-1-2.** "The field" = Leader + Character + Stage + Cost areas | **GAP** | — | No `isOnField()` helper function. Would be useful for effect targeting |
| **3-1-4.** Card counts are open info | **IMPL** | `PlayerState` has all zone arrays; client can count | |
| **3-1-5.** Open vs secret areas | **GAP** | — | No formal `isOpenArea()` / `isSecretArea()` helper. Important for **8-4-5** (auto effects only activate when moving to open areas) and **11-2** (revealing cards moved between secret areas) |
| **3-1-6.** Zone transition strips effects, new card identity | **IMPL** | `state.ts → moveCard()` | New `instanceId` via `nanoid()`, `attachedDon` cleared, state reset to ACTIVE |
| **3-1-6-1.** DON!! zone transition strips effects | **IMPL** | `moveCard()` strips `attachedDon` | |
| **3-1-7.** Owner decides order of simultaneous placements | **GAP** | — | No mechanism to let player choose ordering when multiple cards enter a zone simultaneously |
| **3-1-8.** Order hidden when multiple cards go secret→secret | **GAP** | — | No visibility control for simultaneous zone transitions |

### 3-2 to 3-10. Individual Area Rules

| Rule | Status | Engine Location | Notes |
|------|--------|----------------|-------|
| **3-2-1/2.** Deck: secret, face-down stack | **IMPL** | `PlayerState.deck: CardInstance[]`, index 0 = top | Client should not reveal deck contents (enforced at WS layer) |
| **3-2-3.** Multiple deck moves happen one-by-one | **GAP** | — | `drawN()` in `setup.ts` moves multiple at once via `slice`. Functionally equivalent but doesn't emit per-card events for trigger detection |
| **3-2-4.** Shuffle | **IMPL** | `shuffleDeck()` in `setup.ts` | Fisher-Yates shuffle |
| **3-3-1/2.** DON!! deck: open area | **IMPL** | `PlayerState.donDeck: DonInstance[]` | |
| **3-4-1/2.** Hand: secret to opponent | **IMPL** | `PlayerState.hand: CardInstance[]` | WS layer filters opponent hand |
| **3-5-1/2.** Trash: open, face-up stack | **IMPL** | `PlayerState.trash: CardInstance[]`, index 0 = top | |
| **3-6-1/2/3.** Leader area: open, cannot be moved | **IMPL** | `removeCardFromZone()` returns player unchanged for LEADER zone | |
| **3-7-3.** Playing = placing in Character area | **IMPL** | `executePlayCard()` calls `moveCard(state, id, "CHARACTER")` | |
| **3-7-4.** Summoning sickness | **IMPL** | `keywords.ts → canAttackThisTurn()` | Checks `turnPlayed === turn.number` |
| **3-7-5.** Characters enter active | **IMPL** | `moveCard()` sets `state: "ACTIVE"` on zone entry | |
| **3-7-6.** Max 5 Characters | **IMPL** | `executePlayCard()` checks `characters.length >= 5` | |
| **3-7-6-1.** 5-card overflow: trash 1, then play | **PARTIAL** | `executePlayCard()` auto-trashes oldest | **GAP**: Rules say the player *chooses* which Character to trash. Engine auto-trashes the oldest (`characters[0]`). Should prompt via `SELECT_CARD_TO_TRASH`. The `PromptType` exists but isn't wired up in this code path |
| **3-7-6-1-1.** Overflow trash is rule processing, no effects apply | **GAP** | — | Current implementation emits `CARD_TRASHED` with reason "overflow" but doesn't suppress `[On K.O.]` triggers. M4 must distinguish rule-based trashing from K.O. |
| **3-8-3/4/5.** Stage: max 1, enter active | **IMPL** | `executePlayCard()` trashes existing stage before placing new | |
| **3-8-5-1.** Stage overflow: trash existing, then play | **IMPL** | `execute.ts:110–114` | |
| **3-9-1/2/3.** Cost area: DON!! cards, open, enter active | **IMPL** | `PlayerState.donCostArea`, `placeDonFromDeck()` sets active | |
| **3-10-1/2.** Life area: secret, face-down stack, top removed first | **IMPL** | `PlayerState.life: LifeCard[]`, `removeTopLifeCard()` | Index 0 = top |
| **3-10-2-1.** Effects can add life face-up | **PARTIAL** | `LifeCard.face: "UP" \| "DOWN"` exists | Data model supports it but no function currently adds face-up life cards |

---

## 4. Basic Game Terminology (§4)

### 4-4. Card States (Active/Rested)

| Rule | Status | Engine Location | Notes |
|------|--------|----------------|-------|
| **4-4-1.** Active (vertical) / Rested (horizontal) | **IMPL** | `CardInstance.state: "ACTIVE" \| "RESTED"` | |
| **4-4-2.** Given DON!! cards are neither active nor rested | **GAP** | `DonInstance.state` is always `"ACTIVE" \| "RESTED"` even when attached | When attached (`attachedTo !== null`), state field is meaningless but still exists. Could cause bugs if effects query attached DON!! state |

### 4-5. Draw a Card

| Rule | Status | Engine Location | Notes |
|------|--------|----------------|-------|
| **4-5-1/2.** Draw = top of deck → hand, hidden | **IMPL** | `phases.ts:43–46` (Draw Phase), `moveCard()` | |
| **4-5-3.** Draw X cards = repeat draw X times | **GAP** | — | No `drawCards(n)` function for effect-driven draws. `drawN()` in `setup.ts` is setup-only and doesn't emit events per card |
| **4-5-4.** Draw up to X cards | **GAP** | — | No "draw up to" mechanic — needs player choice loop |

### 4-6. Damage Processing

| Rule | Status | Engine Location | Notes |
|------|--------|----------------|-------|
| **4-6-1/2.** Damage processing | **IMPL** | `battle.ts → executeDamageStep()` | |
| **4-6-2-1.** 1 damage = move 1 life card to hand | **IMPL** | `battle.ts:354–372` | Normal damage path: `removeTopLifeCard()` → add to hand |
| **4-6-2-2.** X damage = repeat X times | **IMPL** | `battle.ts:312` loop | `damageCount` handles Double Attack (2) |
| **4-6-3.** Trigger activation during damage | **IMPL** | `battle.ts:339–353` | Detects trigger, stores `pendingTriggerLifeCard`, pauses for `REVEAL_TRIGGER` action |
| **4-6-3-1.** Trigger can't activate if life can't be added to hand | **GAP** | — | No check for replacement effects that prevent adding life to hand |

### 4-7. Play a Card

| Rule | Status | Engine Location | Notes |
|------|--------|----------------|-------|
| **4-7-1.** Play = pay cost + activate/play from hand | **IMPL** | `executePlayCard()` in `execute.ts` | |
| **4-7-2.** "Cannot be played" | **STUB** | `pipeline.ts:42–43` | Prohibitions check is a no-op |

### 4-9. "Base"

| Rule | Status | Engine Location | Notes |
|------|--------|----------------|-------|
| **4-9-2.** "Base" = printed value on card | **IMPL** | `modifiers.ts` Layer 0 reads `cardData.power` / `cardData.cost` | |
| **4-9-2-1.** Multiple base-setting effects: use highest | **GAP** | — | M4 modifier system needs conflict resolution: when multiple effects set base power, highest wins |
| **4-9-2-2.** Multiple base-setting effects for cost: use highest | **GAP** | — | Same as above for cost |

### 4-10/4-11/4-12. "If"/"Then", "Remove", "Set Power to 0"

| Rule | Status | Engine Location | Notes |
|------|--------|----------------|-------|
| **4-10.** If/Then clause dependencies | **GAP** | — | No conditional clause resolution in effect processing |
| **4-11.** "Remove" = move to another area | **GAP** | — | `moveCard()` exists but "remove" as an effect verb isn't parsed or dispatched |
| **4-12.** «Set Power to 0» = reduce by current power | **GAP** | — | No implementation. Needs: read current power, apply equal negative modifier. Important subtlety: doesn't apply if power already negative (**4-12-2**) |

---

## 5. Game Setup (§5)

### 5-1. Deck Construction

| Rule | Status | Engine Location | Notes |
|------|--------|----------------|-------|
| **5-1-2.** 1 Leader, 50-card deck, 10-card DON!! deck | **PARTIAL** | `setup.ts → buildInitialState()` | Deck is built from `PlayerInitData.deck` but **engine doesn't validate** 50-card count or 4-copy limit. Validation happens in deck builder (`src/lib/deck-builder/validation.ts`) |
| **5-1-2-2.** Deck colors must match Leader colors | **GAP** (in engine) | — | Not checked at engine level. Deck builder checks this, but engine trusts the payload |
| **5-1-2-3.** Max 4 copies per card number | **GAP** (in engine) | — | Same — trusted from deck builder |
| **5-1-2-4.** Some Leaders modify deck construction rules | **GAP** | — | No support for Leader effects that change deck rules |

### 5-2. Pre-Game Preparations

| Rule | Status | Engine Location | Notes |
|------|--------|----------------|-------|
| **5-2-1-2.** Shuffle deck | **IMPL** | `setup.ts:38–39` | Fisher-Yates in `shuffleDeck()` |
| **5-2-1-3.** Place Leader face-up | **IMPL** | `setup.ts:144–153` | Leader built with `zone: "LEADER"`, `state: "ACTIVE"` |
| **5-2-1-4/5.** Decide first/second | **GAP** | — | Not modeled. `GameInitPayload` assumes player1 always goes first (index 0). No coin flip or choice mechanism |
| **5-2-1-5-1.** "At the start of the game" effects | **GAP** | — | No hook for pre-game effects. Some Leaders have "At the start of the game" text |
| **5-2-1-5-2.** Shuffle after start-of-game effects | **GAP** | — | No post-effect shuffle |
| **5-2-1-6.** Draw 5 cards as opening hand | **IMPL** | `setup.ts:42–43` | `drawN(shuffled, 5)` |
| **5-2-1-6-1.** Mulligan: return all, reshuffle, redraw 5 | **IMPL** | `setup.ts → applyMulligan()` | Returns hand to deck, shuffles, draws 5. One mulligan per player |
| **5-2-1-7.** Place life cards (top of deck → bottom of life area) | **IMPL** | `setup.ts:52–58` | Cards drawn from top of deck; first drawn is index 0 of life (top of life area). **Potential issue**: Rule says "card at top of deck is at bottom of life area" — current code maps first drawn to `life[0]` which is treated as top. Need to verify ordering matches rule intent. See `removeTopLifeCard()` which takes `life[0]`. If `life[0]` is "top" (first removed on damage), the current ordering may be inverted vs rules |
| **5-2-1-8.** First player begins | **IMPL** | `setup.ts:80–88` | `activePlayerIndex: 0`, `phase: "REFRESH"` |

---

## 6. Game Progression (§6)

### 6-1/6-2. Turn Flow / Refresh Phase

| Rule | Status | Engine Location | Notes |
|------|--------|----------------|-------|
| **6-1-1.** Turn = Refresh → Draw → DON → Main → End | **IMPL** | `Phase` type in `game-types.ts:69` | `"REFRESH" \| "DRAW" \| "DON" \| "MAIN" \| "END"` |
| **6-2-1.** "Until start of your next turn" effects expire | **STUB** | `phases.ts:26–27` comment | No-op; no active effects in M3 |
| **6-2-2.** "At the start of your/opponent's turn" auto effects | **STUB** | `phases.ts:27` comment | No-op |
| **6-2-3.** Return DON!! to cost area, rest them | **IMPL** | `phases.ts:29`, `state.ts → returnAttachedDonToCostArea()` | Detaches all DON!! from Leader + Characters, returns to cost area rested |
| **6-2-4.** Set all rested cards active | **IMPL** | `phases.ts:32`, `state.ts → activateAllRested()` | Activates Leader, Characters, Stage, and all cost area DON!! |

### 6-3. Draw Phase

| Rule | Status | Engine Location | Notes |
|------|--------|----------------|-------|
| **6-3-1.** Draw 1 card (first player turn 1: no draw) | **IMPL** | `phases.ts:40–49` | `isFirstPlayerTurnOne` check skips draw |

### 6-4. DON!! Phase

| Rule | Status | Engine Location | Notes |
|------|--------|----------------|-------|
| **6-4-1.** Place 2 DON!! (first player turn 1: 1 DON!!) | **IMPL** | `phases.ts:56–57` | `donCount` calculation handles first-turn exception |
| **6-4-2.** Only 1 DON!! left: place 1 | **IMPL** | `state.ts → placeDonFromDeck()` | `Math.min(count, player.donDeck.length)` |
| **6-4-3.** 0 DON!! left: skip | **IMPL** | `placeDonFromDeck()` returns state unchanged if 0 available | |

### 6-5. Main Phase

| Rule | Status | Engine Location | Notes |
|------|--------|----------------|-------|
| **6-5-1.** "At the start of the Main Phase" effects | **GAP** | — | No hook for start-of-main-phase auto effects |
| **6-5-2.** Main Phase actions: Play Card, Activate Effect, Give DON!!, Battle | **IMPL** | `execute.ts` dispatches `PLAY_CARD`, `ATTACH_DON`, `DECLARE_ATTACK`, `ACTIVATE_EFFECT` | All four main-phase action types exist |
| **6-5-2-1.** Declare end of Main Phase → End Phase | **IMPL** | `ADVANCE_PHASE` action from MAIN phase | `phases.ts:69–77` |
| **6-5-3-1.** Play Character/Stage or activate [Main] Event | **IMPL** | `validatePlayCard()` checks card type and `[Main]` keyword | `validation.ts:89–91` |
| **6-5-4-1.** Activate [Main] or [Activate: Main] effects | **STUB** | `ACTIVATE_EFFECT` returns `{ state, events: [] }` | M4 — no effect activation logic |
| **6-5-5-1.** Give DON!! = 1 active DON!! → Leader/Character | **IMPL** | `executeAttachDon()` in `execute.ts`, `attachDon()` in `state.ts` | |
| **6-5-5-2.** +1000 power per DON!! during owner's turn | **IMPL** | `modifiers.ts → getEffectivePower()` | `card.attachedDon.length * 1000` when `isOwnersTurn` |
| **6-5-5-3.** Giving can be performed many times | **IMPL** | `executeAttachDon()` supports `count` parameter | |
| **6-5-5-4.** Card moves zones → DON!! return rested | **IMPL** | `state.ts → moveCard()` | Strips `attachedDon`, returns them to `donCostArea` rested |
| **6-5-6-1.** Neither player can battle on first turn | **IMPL** | `validation.ts:137–139` | Checks `turn.number === 1` |

### 6-6. End Phase

| Rule | Status | Engine Location | Notes |
|------|--------|----------------|-------|
| **6-6-1-1.** [End of Your Turn] effects activate | **STUB** | `phases.ts:92` comment | No-op |
| **6-6-1-1-1.** [End of Your Turn] effects activate only once | **GAP** | — | No once-per-end-phase enforcement |
| **6-6-1-1-2.** Turn player's end-of-turn effects resolve first, then opponent's | **GAP** | — | No ordering mechanism |
| **6-6-1-1-3/4.** Multiple end-of-turn effects: player chooses order | **GAP** | — | No player choice for effect ordering |
| **6-6-1-2.** "At the end of this turn" / "until the end of the turn" effect expiry | **STUB** | `phases.ts:94` comment | No active effects to expire in M3 |
| **6-6-1-3.** "During this turn" effects expire | **STUB** | Same | |
| **6-6-1-4.** Turn passes to opponent | **IMPL** | `phases.ts:97–113 → runEndPhase()` | Correctly swaps `activePlayerIndex`, resets turn state |

---

## 7. Card Attacks and Battles (§7)

### 7-1. Attack Declaration

| Rule | Status | Engine Location | Notes |
|------|--------|----------------|-------|
| **7-1.** Rest active Leader/Character to attack opponent's Leader or rested Character | **IMPL** | `validation.ts → validateDeclareAttack()`, `battle.ts → executeDeclareAttack()` | Validates zone, active state, target validity |

### 7-1-1. Attack Step

| Rule | Status | Engine Location | Notes |
|------|--------|----------------|-------|
| **7-1-1-1.** Declare attack by resting attacker | **IMPL** | `battle.ts:33` | `setCardState(state, pi, attackerInstanceId, "RESTED")` |
| **7-1-1-2.** Select target: opponent's Leader or rested Character | **IMPL** | `validation.ts:160–168` | Validates target is opponent's Leader or rested Character |
| **7-1-1-3.** [When Attacking] / [On Your Opponent's Attack] / [When Attacked] activate | **STUB** | `battle.ts:64` comment | "fires here in M4" |
| **7-1-1-4.** Card moved areas during Attack Step → skip to End of Battle | **GAP** | — | No check for attacker/target leaving the battlefield during Attack Step. Currently advances to BLOCK_STEP unconditionally |

### 7-1-2. Block Step

| Rule | Status | Engine Location | Notes |
|------|--------|----------------|-------|
| **7-1-2-1.** Defender can activate [Blocker] once per battle | **IMPL** | `executeDeclareBlocker()` + `validation.ts → validateDeclareBlocker()` | Rests blocker, replaces target in `BattleContext`. `blockerActivated` enforced: `validateDeclareBlocker()` rejects when `battle.blockerActivated === true` |
| **7-1-2-2.** [On Block] effects activate | **STUB** | `battle.ts:104` comment | "fires in M4" |
| **7-1-2-3.** Card moved areas during Block Step → skip to End of Battle | **GAP** | — | Same as 7-1-1-4 — no early-exit check |

### 7-1-3. Counter Step

| Rule | Status | Engine Location | Notes |
|------|--------|----------------|-------|
| **7-1-3-1.** "When attacked" effects activate during Counter Step | **STUB** | — | Not implemented |
| **7-1-3-2.** Defender can use Symbol Counters and Counter Events | **IMPL** | `executeUseCounter()`, `executeUseCounterEvent()` in `battle.ts` | |
| **7-1-3-2-1.** Symbol Counter: trash Character from hand, add power | **IMPL** | `battle.ts:140–182` | Trashes card, adds `counterValue` to `counterPowerAdded`, updates `defenderPower` |
| **7-1-3-2-2.** Counter Event: pay cost, trash, activate [Counter] | **PARTIAL** | `battle.ts:186–211` | Cost paid, card trashed, but **effect text not resolved** — comment says "Counter event effect is manual in M3" |
| **7-1-3-3.** Card moved areas during Counter Step → skip to End of Battle | **GAP** | — | Same as 7-1-1-4 |

### 7-1-4. Damage Step

| Rule | Status | Engine Location | Notes |
|------|--------|----------------|-------|
| **7-1-4-1.** Compare power: attacker ≥ defender = win | **IMPL** | `battle.ts:294` | `attackerPower >= defenderPower` |
| **7-1-4-1-1.** Leader attacked: 1 damage | **IMPL** | `battle.ts:297–375` | Full damage processing with life removal |
| **7-1-4-1-1-1.** 0 life + damage = defeat | **IMPL** | `battle.ts` damage loop + `defeat.ts:31–34` | Life-0 check runs at the start of each damage instance; `damagedPlayerIndex` only set when life is already 0 |
| **7-1-4-1-1-2.** Life → hand; trigger option | **IMPL** | `battle.ts:339–372` | Normal: add to hand. Trigger: pause for REVEAL_TRIGGER |
| **7-1-4-1-1-3.** Double Attack: 2 damage | **IMPL** | `battle.ts:301` | `damageCount = hasDoubleAttack ? 2 : 1` |
| **7-1-4-1-2.** Character attacked: K.O. | **IMPL** | `battle.ts:377–380` | `moveCard(state, targetId, "TRASH")` + `CARD_KO` event |
| **7-1-4-2.** Attacker loses: nothing happens | **IMPL** | `battle.ts:384` comment | Falls through to `endBattle()` |

### 7-1-5. End of Battle

| Rule | Status | Engine Location | Notes |
|------|--------|----------------|-------|
| **7-1-5-1.** Battle ends | **IMPL** | `battle.ts → endBattle()` | Clears `battle` and `battleSubPhase` from turn state |
| **7-1-5-2.** "At the end of battle" / "if this ... battles" effects | **GAP** | — | No hook for end-of-battle auto effects |
| **7-1-5-3/4.** "During this battle" effects expire (turn player then non-turn player) | **GAP** | — | No battle-scoped continuous effects to expire |
| **7-1-5-5.** Return to Main Phase (6-5-2) | **IMPL** | `endBattle()` emits `PHASE_CHANGED` from `DAMAGE_STEP` to `MAIN` | |

---

## 8. Activating and Resolving Effects (§8)

> This entire section is the core of M4. Almost everything here is a gap.

### 8-1. Effect Categories

| Rule | Status | Engine Location | Notes |
|------|--------|----------------|-------|
| **8-1-2.** "Can"/"may" = optional; no such word = mandatory | **GAP** | — | No effect text parser to distinguish optional vs mandatory effects |
| **8-1-3-1.** Auto effects (activate on event) | **STUB** | `RegisteredTrigger` type exists; `triggerRegistry` array is always empty | M4 needs: event bus → trigger matching → auto effect resolution |
| **8-1-3-1-1.** Auto effect keywords: [On Play], [When Attacking], etc. | **GAP** | Keywords detected in `KeywordSet` but no auto-fire logic | |
| **8-1-3-1-3.** Auto effect doesn't activate if card moved zones before activation | **GAP** | — | No zone-presence check at trigger resolution time |
| **8-1-3-2.** Activate effects ([Activate: Main], [Main]) | **STUB** | `ACTIVATE_EFFECT` action exists; `execute.ts:57` returns no-op | |
| **8-1-3-3.** Permanent effects | **GAP** | — | No continuous effect layer. Needed for effects like "All your {type} Characters gain +1000 power" |
| **8-1-3-4.** Replacement effects ("instead") | **STUB** | Pipeline step 3 is a no-op | No replacement effect detection or resolution |
| **8-1-3-4-2.** Replacement effect priority (card owner → turn player → non-turn player) | **GAP** | — | |
| **8-1-3-4-3.** Same replacement can't apply twice to same process | **GAP** | — | |
| **8-1-4-1.** One-shot effects | **GAP** | — | No effect duration tracking |
| **8-1-4-2.** Continuous effects | **GAP** | — | No duration tracking / expiry logic |

### 8-2. Valid/Invalid Effects

| Rule | Status | Engine Location | Notes |
|------|--------|----------------|-------|
| **8-2-1 to 8-2-4.** Effect invalidation rules | **GAP** | — | No mechanism to mark an effect as invalid, or to handle effects that invalidate other effects |

### 8-3. Activation Cost and Conditions

| Rule | Status | Engine Location | Notes |
|------|--------|----------------|-------|
| **8-3-1.** Activation cost (before the colon) | **GAP** | — | No activation cost parser. `CardData` has `effectText` as raw string |
| **8-3-1-5.** ① symbol = rest N active DON!! | **GAP** | — | DON!! rest-for-activation not implemented |
| **8-3-1-6.** "DON!! −X" = return DON!! to DON!! deck | **GAP** | — | No function to return DON!! cards to DON!! deck. `returnAttachedDonToCostArea()` returns to cost area, not DON!! deck. **New function needed**: `returnDonToDeck(state, playerIndex, count)` |
| **8-3-2-3.** [DON!! xX] condition | **GAP** | — | `KeywordSet` doesn't include `donCondition`. No check for attached DON!! count meeting a threshold |
| **8-3-2-4/5.** [Your Turn] / [Opponent's Turn] conditions | **GAP** | — | Easy to implement as `state.turn.activePlayerIndex` check, but no condition evaluation framework |

### 8-4. Activation and Resolution

| Rule | Status | Engine Location | Notes |
|------|--------|----------------|-------|
| **8-4-1 to 8-4-6.** Full activation sequence | **GAP** | — | No generic "activate effect" pipeline. M4 needs: check conditions → reveal card → pay cost → activate → resolve → post-resolution |
| **8-4-4.** "Choose"/"select"/"up to" during resolution | **GAP** | — | No mid-resolution choice mechanism (needs prompt system integration) |
| **8-4-5.** Auto effects only activate when moving to open area | **GAP** | — | No `isOpenArea()` check in trigger matching |
| **8-4-4-2.** Secret area cards: player can decline to choose | **GAP** | — | No handling of secret-area targeting constraints |

### 8-5. Card Activation vs Effect Activation

| Rule | Status | Engine Location | Notes |
|------|--------|----------------|-------|
| **8-5-1 to 8-5-4.** Distinct concepts | **GAP** | — | Engine doesn't distinguish "activating an Event card" from "activating a card's effect". Important for triggers like "when you activate an Event" |

### 8-6. Order of Effect Resolution

| Rule | Status | Engine Location | Notes |
|------|--------|----------------|-------|
| **8-6-1.** Turn player resolves first, then non-turn player | **GAP** | — | No effect queue / resolution ordering |
| **8-6-1-1.** Cascading triggers during resolution | **GAP** | — | No re-entrant trigger detection |
| **8-6-2.** Effects triggered during damage processing wait until damage finishes | **PARTIAL** | `battle.ts` pauses on trigger, but only for the life-triggered [Trigger] keyword, not for general auto effects that might fire during damage | |
| **8-6-3.** Effects triggered by card/effect activation wait for resolution | **GAP** | — | No post-resolution trigger queue |

---

## 9. Rule Processing (§9)

| Rule | Status | Engine Location | Notes |
|------|--------|----------------|-------|
| **9-1-1.** Rule processing = automatic processing on specific events | **IMPL** | `pipeline.ts` step 7 calls `checkDefeat()` | |
| **9-1-2.** Rule processing is immediate, even during other actions | **PARTIAL** | Runs after every pipeline call, but not mid-execution (e.g., not between individual damage points). Damage loop in `battle.ts:312` doesn't check defeat between damage instances |
| **9-2-1.** Defeat judgment processing | **IMPL** | `defeat.ts → checkDefeat()` | |
| **9-2-1-1.** Leader damage + 0 life = defeat | **IMPL** | `defeat.ts:31–34` | |
| **9-2-1-2.** 0 deck = defeat | **IMPL** | `defeat.ts:26–27` | |
| Simultaneous defeat → draw | **IMPL** | `defeat.ts:39–41` | Both players lose → `winner: null` |

---

## 10. Keyword Effects and Keywords (§10)

### 10-1. Keyword Effects

| Keyword | Rule | Status | Engine Location | Notes |
|---------|------|--------|----------------|-------|
| **[Rush]** | 10-1-1 | **IMPL** | `keywords.ts → hasRush()`, `canAttackThisTurn()` | Bypasses summoning sickness |
| **[Double Attack]** | 10-1-2 | **IMPL** | `keywords.ts → hasDoubleAttack()`, `battle.ts:301` | 2 damage instead of 1 to Leader |
| **[Banish]** | 10-1-3 | **IMPL** | `keywords.ts → hasBanish()`, `battle.ts:321–338` | Life card goes to trash, no Trigger |
| **[Blocker]** | 10-1-4 | **IMPL** | `keywords.ts → hasBlocker()`, `validation.ts:189`, `battle.ts → executeDeclareBlocker()` | Rests blocker, replaces target |
| **[Trigger]** | 10-1-5 | **IMPL** | `keywords.ts → hasTrigger()`, `battle.ts:339–353`, `executeRevealTrigger()` | Pause for choice; reveal → trash, or add to hand |
| **[Trigger] — §10-1-5-3** | 10-1-5-3 | **IMPL** | `executeRevealTrigger()` | Card trashed after trigger effect (or added to hand if declined) |
| **[Rush: Character]** | 10-1-6 | **IMPL** | `keywords.ts → hasRushCharacter()`, `canAttackLeader()` | Can attack Characters only on turn played |
| **[Unblockable]** | 10-1-7 | **IMPL** | `keywords.ts → hasUnblockable()`, `validation.ts:192–198` | Rejects blocker declaration if attacker has Unblockable |

### 10-2. Keywords

| Keyword | Rule | Status | Engine Location | Notes |
|---------|------|--------|----------------|-------|
| **K.O.** | 10-2-1 | **IMPL** | `battle.ts:377–380` + `CARD_KO` event | Character trashed to owner's trash |
| K.O. — trashed by non-KO method ≠ K.O. | 10-2-1-3 | **GAP** | — | No distinction between "K.O." and "trashed by rule processing" (e.g., overflow). The `CARD_KO` event is only emitted in battle, but the engine doesn't suppress `[On K.O.]` triggers if a card is trashed by overflow (**3-7-6-1-1**) |
| **[Activate: Main]** | 10-2-2 | **STUB** | `validation.ts:273–277` validates phase only | No effect execution |
| **[Main]** (Event) | 10-2-3 | **IMPL** | `validation.ts:89` checks `effectText.includes("[Main]")` | String-based check; works for M3 |
| **[Counter]** (Event) | 10-2-4 | **IMPL** | `validation.ts:249` checks `effectText.includes("[Counter]")` | String-based check |
| **[When Attacking]** | 10-2-5 | **STUB** | — | Auto effect; no trigger matching |
| **[On Play]** | 10-2-6 | **STUB** | — | Auto effect; no trigger matching |
| **[End of Your Turn]** | 10-2-7 | **STUB** | `phases.ts:92` comment | No-op in `runEndPhase()` |
| **[End of Opponent's Turn]** | 10-2-8 | **STUB** | Same | |
| **[DON!! xX]** | 10-2-9 | **GAP** | — | Not in `KeywordSet`. Needs: check attached DON!! count ≥ X as effect condition |
| **DON!! −X** | 10-2-10 | **GAP** | — | No function to return DON!! to DON!! deck. See §8-3-1-6 |
| **[Your Turn]** / **[Opponent's Turn]** | 10-2-11/12 | **GAP** | — | Condition keywords; not modeled |
| **[Once Per Turn]** | 10-2-13 | **PARTIAL** | `TurnState.oncePerTurnUsed: Record<string, string[]>` | Data structure exists but **nothing populates it**. M4 must record effect usage and check against it |
| [Once Per Turn] — §10-2-13-4 | 10-2-13-4 | **GAP** | — | Card moved to new zone → treated as new card → can re-use [Once Per Turn]. `moveCard()` assigns new `instanceId`, which should satisfy this rule, but `oncePerTurnUsed` tracking doesn't exist yet |
| **Trash** (from hand) | 10-2-14 | **IMPL** | `moveCard(state, id, "TRASH")` | Used in counter card and event activation |
| **[On Block]** | 10-2-15 | **STUB** | — | Auto effect; no trigger matching |
| **[On Your Opponent's Attack]** | 10-2-16 | **STUB** | — | Auto effect; fires after [When Attacking] effects |
| **[On K.O.]** | 10-2-17 | **STUB** | — | Complex: activates on field, resolves in trash. `CARD_KO` event exists but no trigger handler |
| **[On K.O.] — §10-2-17-2** | 10-2-17-2 | **GAP** | — | Unique activation pattern: effect activates while card is still on field, then card moves to trash, then effect resolves. Needs special-case handling in M4 trigger system |

---

## 11. Other (§11)

| Rule | Status | Engine Location | Notes |
|------|--------|----------------|-------|
| **11-1-1.** Infinite loop detection | **GAP** | — | No loop detection. Risk: M4 auto effects could create infinite loops. Need: action counter or state hash comparison |
| **11-1-1-1.** Unstoppable loop → draw | **GAP** | — | |
| **11-1-1-2/3.** Player can declare loop count | **GAP** | — | Need: prompt for loop count |
| **11-2-1.** Cards moved secret→secret must be revealed | **GAP** | — | No reveal enforcement on secret-to-secret transfers |
| **11-2-2.** Revealed cards become unrevealed after effect resolves | **GAP** | — | No reveal/unrevealed state tracking on cards |
| **11-3.** Viewing secret areas | **GAP** | — | No "look at" mechanic for effects that let players view deck/life |

---

## Summary: Functions Needed for M4

The following new functions or systems are required, derived directly from the gaps above:

### Core Effect Engine (§8)

1. **Effect Text Parser** — Parse `CardData.effectText` into structured `effectSchema`. Map text patterns to executable effect blocks.
   - Rules: 8-1-1, 8-1-2, 2-8-1 to 2-8-3
   
2. **Auto Effect Trigger System** — When a `GameEvent` fires, scan `triggerRegistry` for matching auto effects and queue them for resolution.
   - Rules: 8-1-3-1, 8-6-1, 8-6-2, 8-6-3
   
3. **Activate Effect Handler** — Replace the `ACTIVATE_EFFECT` no-op with: check conditions → pay activation cost → resolve effect.
   - Rules: 8-1-3-2, 8-3-1, 8-4-1

4. **Permanent Effect Layer** — Continuously applied effects that modify the game state (e.g., "+1000 to all {type} Characters").
   - Rules: 8-1-3-3, 8-1-3-3-5

5. **Replacement Effect System** — Intercept game actions and substitute alternative outcomes ("instead").
   - Rules: 8-1-3-4, 8-1-3-4-2 to 8-1-3-4-7

6. **Effect Duration Tracking** — Track continuous effects with durations: "during this turn", "during this battle", "until end of turn", "until start of your next turn".
   - Rules: 8-1-4-2, 6-2-1, 6-6-1-2, 6-6-1-3, 7-1-5-3/4

7. **Effect Invalidation System** — Mark effects as invalid when other effects say so.
   - Rules: 8-2-1 to 8-2-4

### Modifier System Expansion (§1-3-6, §4-9, §4-12)

8. **Base-Setting Modifier Layer** (`modifiers.ts` Layer 1) — Effects that set base power/cost to a specific value. Conflict resolution: highest value wins.
   - Rules: 4-9-2-1, 4-9-2-2

9. **«Set Power to 0»** — Reduce power by the card's current power. No-op if power already negative.
   - Rules: 4-12-1, 4-12-2

10. **Cost Modifier Layer** (`modifiers.ts` Layer 1/2) — Allow mid-calculation negative costs, clamp only at final payment.
    - Rules: 1-3-6-2, 1-3-6-2-1

### Missing Keyword Implementations (§10-2)

11. **[DON!! xX] Condition Check** — Evaluate `card.attachedDon.length >= X` as an effect condition.
    - Rules: 8-3-2-3, 10-2-9

12. **DON!! −X (Return to DON!! Deck)** — `returnDonToDeck(state, playerIndex, count)` — select DON!! from Leader/Character/Cost areas and return to DON!! deck.
    - Rules: 8-3-1-6, 10-2-10

13. **[Once Per Turn] Enforcement** — Populate `TurnState.oncePerTurnUsed`, check before activation, handle zone-reset rule (§10-2-13-4).
    - Rules: 10-2-13-1 to 10-2-13-5

14. **[On K.O.] Special Resolution** — Activate on field, move to trash, then resolve.
    - Rules: 10-2-17-1, 10-2-17-2

### Battle Step Integrity (§7)

15. **Mid-Battle Zone Check** — After Attack Step, Block Step, and Counter Step, check if attacker or target left the battlefield. If so, skip to End of Battle.
    - Rules: 7-1-1-4, 7-1-2-3, 7-1-3-3

16. ~~**Blocker Once-Per-Battle Enforcement**~~ — **DONE (M3.5).** `validateDeclareBlocker()` rejects when `battle.blockerActivated === true`.
    - Rules: 7-1-2-1

17. **End-of-Battle Effects** — Hook for "at the end of battle" auto effects.
    - Rules: 7-1-5-2

### Setup & Miscellaneous

18. **First/Second Choice** — Let the winning player choose to go first or second, rather than hardcoding player1 = first.
    - Rules: 5-2-1-4, 5-2-1-5

19. **"At the Start of the Game" Effects** — Pre-game effect hook for Leaders with start-of-game text.
    - Rules: 5-2-1-5-1, 5-2-1-5-2

20. **Character Overflow Player Choice** — Prompt the player to choose which Character to trash (instead of auto-trashing oldest).
    - Rules: 3-7-6-1

21. **Card Data Expansion** — Add `attribute` and `types` (tribe) fields to `CardData`.
    - Rules: 2-4-1 to 2-4-4, 2-5-1 to 2-5-7

22. **Infinite Loop Detection** — Track repeated game states; if detected, prompt players for loop count or declare draw.
    - Rules: 11-1-1 to 11-1-1-3

23. **Secret-to-Secret Reveal Enforcement** — When a card moves between two secret areas, reveal it to both players.
    - Rules: 11-2-1, 11-2-2

24. **"Look at" Mechanic** — Effects that let a player view cards in a secret area (deck, life).
    - Rules: 11-3-1 to 11-3-3

25. **Life Area Ordering** — Verify that `setup.ts` life card ordering matches rule §5-2-1-7 (top of deck → bottom of life). Current implementation may have inverted order — `life[0]` is treated as "top" (first removed) but should be the *last* card placed (originally on top of the deck).
    - Rules: 2-9-2-1, 5-2-1-7

---

## Priority Tiers

### Tier 1 — Required for any card effect resolution (M4 core)
Items 1–7, 13, 14

### Tier 2 — Required for correct battle/phase behavior
Items 15–17

### Tier 3 — Required for specific card mechanics
Items 8–12, 20, 21, 24

### Tier 4 — Correctness & edge cases
Items 18, 19, 22, 23, 25

---

_Generated from `docs/rules/rule_comprehensive.md` v1.2.0 and engine source as of 2026-03-22_
