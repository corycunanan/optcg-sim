# Comprehensive Rules → Game Engine Map

> Maps every gameplay-relevant rule from `docs/rules/rule_comprehensive.md` (v1.2.0) to the engine function that implements it, identifies gaps, and calls out rules that require new functions or architectural changes.

---

## How to Read This Document

Each section mirrors the Comprehensive Rules. Rules are grouped by engine file/function and tagged with one of:

| Status | Meaning |
|--------|---------|
| **IMPL** | Fully implemented |
| **PARTIAL** | Partially implemented — some sub-rules missing |
| **GAP** | No implementation; requires new code |
| **N/A** | Not relevant to the engine (cosmetic, deck construction only, etc.) |

**Engine file index** (all under `workers/game/src/engine/`):

| File | Purpose |
|------|---------|
| `pipeline.ts` | 7-step action pipeline — entry point for every mutation |
| `validation.ts` | Step 1 — action legality checks |
| `prohibitions.ts` | Step 2 — prohibition checking (12+ prohibition types) |
| `replacements.ts` | Step 3 — replacement effect interception ("instead") |
| `execute.ts` | Step 4 — thin dispatcher to phases/battle/main actions |
| `triggers.ts` | Step 5 — trigger registration, matching, and ordering |
| `trigger-ordering.ts` | Per-player trigger ordering per rule §8-6 |
| `modifiers.ts` | Step 6 — layered power/cost computation (3 layers) |
| `defeat.ts` | Step 7 — win/loss condition checks |
| `phases.ts` | Phase transitions: REFRESH → DRAW → DON → MAIN → END |
| `battle.ts` | Attack → Block → Counter → Damage → End of Battle |
| `setup.ts` | Game initialization, mulligan |
| `state.ts` | Immutable state helpers: zone transitions, DON!! mutations, card lookup |
| `conditions.ts` | Effect condition evaluation (40+ condition types) |
| `duration-tracker.ts` | Effect lifecycle: expiry, while-conditions, scheduled actions |
| `effect-stack.ts` | LIFO stack for paused effect chains and player prompts |
| `effect-types.ts` | TypeScript types for EffectSchema, actions, triggers, conditions |
| `events.ts` | Event bus — appends typed events to state log |
| `keywords.ts` | Keyword queries (Rush, Blocker, etc.) |
| `schema-registry.ts` | Loads card effect schemas from 51 set files at runtime |
| `effect-resolver/resolver.ts` | Core effect resolver — 50+ action handlers |
| `effect-resolver/target-resolver.ts` | Target validation and constraint checking |
| `effect-resolver/cost-handler.ts` | Activation cost payment (DON rest, trash, etc.) |
| `effect-resolver/card-mutations.ts` | Card state mutations during effect resolution |
| `effect-resolver/resume.ts` | Resume paused effect chains after player input |
| `effect-resolver/actions/*.ts` | Action handler modules (battle, choice, don, draw-search, effects, hand-deck, life, modifiers, play, removal) |
| `schemas/*.ts` | 51 card schema files (OP01–OP15, ST01–ST29, EB01–EB04, PRB01–PRB02, P) |

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
| **1-2-5.** Card effects that cause win/loss | **PARTIAL** | `defeat.ts` | No card in the current OPTCG card pool uses a "you win/lose" effect; infrastructure exists but untested |

### 1-3. Fundamental Principles

| Rule | Status | Engine Location | Notes |
|------|--------|----------------|-------|
| **1-3-1.** Card text overrides rules | **IMPL** | `prohibitions.ts`, `replacements.ts`, `effect-resolver/` | Pipeline steps 2 (prohibitions) and 3 (replacements) intercept base rules; effect resolver overrides via schemas |
| **1-3-2.** Impossible actions are skipped | **PARTIAL** | `state.ts:98` (`moveCard` returns state on not-found), `restDonForCost` returns null | Applied ad-hoc; no unified "attempt or skip" pattern |
| **1-3-2-1.** Redundant state changes are no-ops | **PARTIAL** | `activateAllRested()` only touches RESTED cards | Not systematically enforced across all mutations |
| **1-3-2-2.** 0 or negative repetitions = no action | **PARTIAL** | `battle.ts:312` loop breaks on no more life | No universal guard for effect-driven repetition counts |
| **1-3-3.** Prohibiting effects take precedence | **IMPL** | `prohibitions.ts → checkProhibitions()` | 12+ prohibition types: CANNOT_ATTACK, CANNOT_BLOCK, CANNOT_PLAY_CHARACTER, etc. |
| **1-3-4.** Turn player chooses first on simultaneous | **IMPL** | `trigger-ordering.ts → scanEventsForTriggers()` | Orders triggers per player priority; builds selection prompts |
| **1-3-5.** Number choices ≥ 0 whole numbers | **PARTIAL** | `effect-resolver/actions/choice.ts` | Effect resolver handles player choices; no universal ≥0 guard |
| **1-3-6.** Cost/power floor rules | **IMPL** | `modifiers.ts` clamps cost to ≥ 0; power has no floor per **1-3-6-1** | |
| **1-3-6-1.** Power can be negative | **IMPL** | `modifiers.ts:17–18` comment; no `Math.max` on power | Correctly allows negative power |
| **1-3-6-1-1.** Negative power doesn't trash | **IMPL** | No zero-power KO check exists | Correct by omission — no auto-KO at 0 power |
| **1-3-6-2.** Cost can go negative during calculation | **IMPL** | `modifiers.ts → getEffectiveCost()` | Mid-calculation negatives allowed, clamped at final value |
| **1-3-7.** Effects processed top-to-bottom | **IMPL** | `effect-resolver/resolver.ts` | Actions processed sequentially from schema |
| **1-3-8.** Rest takes precedence over activate | **PARTIAL** | — | No explicit conflict resolution for simultaneous rest+activate on same card |
| **1-3-9-1.** Cost definition | **IMPL** | `CardData.cost`, `getEffectiveCost()` in `modifiers.ts` | |
| **1-3-9-2.** Activation cost definition | **IMPL** | `effect-resolver/cost-handler.ts → payCosts()` | Handles DON_MINUS, DON_REST, TRASH_FROM_HAND, CARD_RETURN |
| **1-3-10.** Turn player acts first on simultaneous effects | **IMPL** | `trigger-ordering.ts` | Same as 1-3-4 |

---

## 2. Card Information (§2)

### 2-1 to 2-5. Name, Category, Color, Type, Attribute

| Rule | Status | Engine Location | Notes |
|------|--------|----------------|-------|
| **2-2-2.** Five card categories | **IMPL** | `CardData.type: "Leader" \| "Character" \| "Event" \| "Stage"` | DON!! cards are `DonInstance` — a separate type, not a `CardData` |
| **2-2-4-1/2.** "Character" vs "Character card" distinction | **IMPL** | `effect-resolver/target-resolver.ts` | Target resolver filters by zone — Character in Character area vs "Character card" in other zones |
| **2-3-4/5.** Multi-color cards | **IMPL** | `CardData.color: string[]` | Array structure supports multi-color |
| **2-4-2.** Multiple types (slash-separated) | **IMPL** | `CardData.types: string[]` | Populated from DB `traits` column. Effect targeting can match `{type}` brackets |
| **2-5.** Attributes (Slash, Strike, etc.) | **IMPL** | `CardData.attribute: string[]` | Populated from DB `attribute` column. Effect targeting can match `<attribute>` brackets |

### 2-6 to 2-9. Power, Cost, Card Text, Life

| Rule | Status | Engine Location | Notes |
|------|--------|----------------|-------|
| **2-6-1/2.** Power on Leaders/Characters | **IMPL** | `CardData.power`, `getEffectivePower()` | |
| **2-6-3.** Effects modify power | **IMPL** | `modifiers.ts` Layers 1 (base-setting) & 2 (additive) | Both layers fully implemented |
| **2-7-1 to 2-7-4.** Cost payment to play cards | **IMPL** | `executePlayCard()` in `execute.ts`, `restDonForCost()` in `state.ts` | Correctly handles Character, Event, and Stage cost payment |
| **2-7-6.** Effects modify cost | **IMPL** | `modifiers.ts → getEffectiveCost()` Layers 1 & 2 | Includes hand-zone and field-to-hand cost modifiers |
| **2-8-1 to 2-8-3.** Effect text, zone validity, top-to-bottom | **IMPL** | `schema-registry.ts`, `effect-resolver/resolver.ts` | Effect schemas loaded from 51 set files; resolver processes actions sequentially |
| **2-9-1/2.** Life value on Leader | **IMPL** | `setup.ts:48–50` with fallback chain | Life cards dealt from deck during setup |
| **2-9-4.** Effects can increase Life value | **IMPL** | `effect-resolver/actions/life.ts` | ADD_TO_LIFE_FROM_DECK, PLAY_FROM_LIFE actions implemented |

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
| **3-1-2.** "The field" = Leader + Character + Stage + Cost areas | **IMPL** | `state.ts → isOnField()` | Returns true for LEADER, CHARACTER, STAGE, COST_AREA |
| **3-1-4.** Card counts are open info | **IMPL** | `PlayerState` has all zone arrays; client can count | |
| **3-1-5.** Open vs secret areas | **IMPL** | `state.ts → isOpenArea()`, `isSecretArea()` | Open: LEADER, CHARACTER, STAGE, COST_AREA, DON_DECK, TRASH. Secret: HAND, DECK, LIFE |
| **3-1-6.** Zone transition strips effects, new card identity | **IMPL** | `state.ts → moveCard()` | New `instanceId` via `nanoid()`, `attachedDon` cleared, state reset to ACTIVE |
| **3-1-6-1.** DON!! zone transition strips effects | **IMPL** | `moveCard()` strips `attachedDon` | |
| **3-1-7.** Owner decides order of simultaneous placements | **PARTIAL** | `trigger-ordering.ts` | Trigger ordering exists; simultaneous zone placement ordering not fully covered |
| **3-1-8.** Order hidden when multiple cards go secret→secret | **GAP** | — | No visibility control for simultaneous zone transitions |

### 3-2 to 3-10. Individual Area Rules

| Rule | Status | Engine Location | Notes |
|------|--------|----------------|-------|
| **3-2-1/2.** Deck: secret, face-down stack | **IMPL** | `PlayerState.deck: CardInstance[]`, index 0 = top | Client should not reveal deck contents (enforced at WS layer) |
| **3-2-3.** Multiple deck moves happen one-by-one | **PARTIAL** | — | `drawN()` in `setup.ts` moves multiple at once via `slice`. Functionally equivalent but doesn't emit per-card events for trigger detection |
| **3-2-4.** Shuffle | **IMPL** | `shuffleDeck()` in `setup.ts` | Fisher-Yates shuffle |
| **3-3-1/2.** DON!! deck: open area | **IMPL** | `PlayerState.donDeck: DonInstance[]` | |
| **3-4-1/2.** Hand: secret to opponent | **IMPL** | `PlayerState.hand: CardInstance[]` | WS layer filters opponent hand |
| **3-5-1/2.** Trash: open, face-up stack | **IMPL** | `PlayerState.trash: CardInstance[]`, index 0 = top | |
| **3-6-1/2/3.** Leader area: open, cannot be moved | **IMPL** | `removeCardFromZone()` returns player unchanged for LEADER zone | |
| **3-7-3.** Playing = placing in Character area | **IMPL** | `executePlayCard()` calls `moveCard(state, id, "CHARACTER")` | |
| **3-7-4.** Summoning sickness | **IMPL** | `keywords.ts → canAttackThisTurn()` | Checks `turnPlayed === turn.number` |
| **3-7-5.** Characters enter active | **IMPL** | `moveCard()` sets `state: "ACTIVE"` on zone entry | |
| **3-7-6.** Max 5 Characters | **IMPL** | `executePlayCard()` checks `characters.length >= 5` | |
| **3-7-6-1.** 5-card overflow: trash 1, then play | **PARTIAL** | `executePlayCard()` auto-trashes oldest | Rules say the player *chooses* which Character to trash. Engine auto-trashes the oldest (`characters[0]`). Should prompt via `SELECT_CARD_TO_TRASH` |
| **3-7-6-1-1.** Overflow trash is rule processing, no effects apply | **PARTIAL** | — | Current implementation emits `CARD_TRASHED` with reason "overflow" but the distinction from K.O. is event-type based |
| **3-8-3/4/5.** Stage: max 1, enter active | **IMPL** | `executePlayCard()` trashes existing stage before placing new | |
| **3-8-5-1.** Stage overflow: trash existing, then play | **IMPL** | `execute.ts:110–114` | |
| **3-9-1/2/3.** Cost area: DON!! cards, open, enter active | **IMPL** | `PlayerState.donCostArea`, `placeDonFromDeck()` sets active | |
| **3-10-1/2.** Life area: secret, face-down stack, top removed first | **IMPL** | `PlayerState.life: LifeCard[]`, `removeTopLifeCard()` | Index 0 = top |
| **3-10-2-1.** Effects can add life face-up | **IMPL** | `LifeCard.face: "UP" \| "DOWN"`, `effect-resolver/actions/life.ts` | Both data model and action handlers support face-up life cards |

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
| **4-5-3.** Draw X cards = repeat draw X times | **IMPL** | `state.ts → drawCards()` | Draws one at a time, emits `CARD_DRAWN` per card, stops early if deck empty (§4-5-3-1) |
| **4-5-4.** Draw up to X cards | **IMPL** | `effect-resolver/actions/draw-search.ts` | DRAW action with `upTo` parameter supports player choice |

### 4-6. Damage Processing

| Rule | Status | Engine Location | Notes |
|------|--------|----------------|-------|
| **4-6-1/2.** Damage processing | **IMPL** | `battle.ts → executeDamageStep()` | |
| **4-6-2-1.** 1 damage = move 1 life card to hand | **IMPL** | `battle.ts:354–372` | Normal damage path: `removeTopLifeCard()` → add to hand |
| **4-6-2-2.** X damage = repeat X times | **IMPL** | `battle.ts:312` loop | `damageCount` handles Double Attack (2) |
| **4-6-3.** Trigger activation during damage | **IMPL** | `battle.ts:339–353` | Detects trigger, stores `pendingTriggerLifeCard`, pauses for `REVEAL_TRIGGER` action |
| **4-6-3-1.** Trigger can't activate if life can't be added to hand | **PARTIAL** | — | Replacement effects can now intercept life addition, but no explicit check that suppresses trigger when life-to-hand is replaced |

### 4-7. Play a Card

| Rule | Status | Engine Location | Notes |
|------|--------|----------------|-------|
| **4-7-1.** Play = pay cost + activate/play from hand | **IMPL** | `executePlayCard()` in `execute.ts` | |
| **4-7-2.** "Cannot be played" | **IMPL** | `prohibitions.ts → checkProhibitions()` | CANNOT_PLAY_CHARACTER, CANNOT_PLAY_EVENT prohibition types |

### 4-9. "Base"

| Rule | Status | Engine Location | Notes |
|------|--------|----------------|-------|
| **4-9-2.** "Base" = printed value on card | **IMPL** | `modifiers.ts` Layer 0 reads `cardData.power` / `cardData.cost` | |
| **4-9-2-1.** Multiple base-setting effects: use highest | **IMPL** | `modifiers.ts → getEffectivePower()` Layer 1 | Base-setting effects resolved; highest value wins |
| **4-9-2-2.** Multiple base-setting effects for cost: use highest | **IMPL** | `modifiers.ts → getEffectiveCost()` Layer 1 | Same as above for cost |

### 4-10/4-11/4-12. "If"/"Then", "Remove", "Set Power to 0"

| Rule | Status | Engine Location | Notes |
|------|--------|----------------|-------|
| **4-10.** If/Then clause dependencies | **IMPL** | `conditions.ts` | 40+ condition types including compound (all_of, any_of, not) |
| **4-11.** "Remove" = move to another area | **IMPL** | `effect-resolver/actions/removal.ts` | KO, RETURN_TO_HAND, TRASH_CARD, RETURN_TO_DECK, REMOVE_FROM_GAME actions |
| **4-12.** «Set Power to 0» = reduce by current power | **IMPL** | `effect-resolver/actions/modifiers.ts` | SET_BASE_POWER action handler |

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
| **5-2-1-7.** Place life cards (top of deck → bottom of life area) | **IMPL** | `setup.ts:55–58` | Life array is reversed after drawing so `life[0]` (removed first by `removeTopLifeCard()`) is the last card drawn |
| **5-2-1-8.** First player begins | **IMPL** | `setup.ts:80–88` | `activePlayerIndex: 0`, `phase: "REFRESH"` |

---

## 6. Game Progression (§6)

### 6-1/6-2. Turn Flow / Refresh Phase

| Rule | Status | Engine Location | Notes |
|------|--------|----------------|-------|
| **6-1-1.** Turn = Refresh → Draw → DON → Main → End | **IMPL** | `Phase` type in `game-types.ts:69` | `"REFRESH" \| "DRAW" \| "DON" \| "MAIN" \| "END"` |
| **6-2-1.** "Until start of your next turn" effects expire | **IMPL** | `duration-tracker.ts → expireEffects()` | Wave-based expiry at REFRESH_PHASE timing |
| **6-2-2.** "At the start of your/opponent's turn" auto effects | **IMPL** | `triggers.ts → matchTriggersForEvent()` | Matches TURN_STARTED events; trigger-ordering handles player priority |
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
| **6-5-1.** "At the start of the Main Phase" effects | **IMPL** | `triggers.ts` | Trigger matching for PHASE_CHANGED events with MAIN phase |
| **6-5-2.** Main Phase actions: Play Card, Activate Effect, Give DON!!, Battle | **IMPL** | `execute.ts` dispatches `PLAY_CARD`, `ATTACH_DON`, `DECLARE_ATTACK`, `ACTIVATE_EFFECT` | All four main-phase action types exist |
| **6-5-2-1.** Declare end of Main Phase → End Phase | **IMPL** | `ADVANCE_PHASE` action from MAIN phase | `phases.ts:69–77` |
| **6-5-3-1.** Play Character/Stage or activate [Main] Event | **IMPL** | `validatePlayCard()` checks card type and `[Main]` keyword | `validation.ts:89–91` |
| **6-5-4-1.** Activate [Main] or [Activate: Main] effects | **IMPL** | `execute.ts → executeActivateEffect()` | Full effect activation with cost payment and resolution |
| **6-5-5-1.** Give DON!! = 1 active DON!! → Leader/Character | **IMPL** | `executeAttachDon()` in `execute.ts`, `attachDon()` in `state.ts` | |
| **6-5-5-2.** +1000 power per DON!! during owner's turn | **IMPL** | `modifiers.ts → getEffectivePower()` | `card.attachedDon.length * 1000` when `isOwnersTurn` |
| **6-5-5-3.** Giving can be performed many times | **IMPL** | `executeAttachDon()` supports `count` parameter | |
| **6-5-5-4.** Card moves zones → DON!! return rested | **IMPL** | `state.ts → moveCard()` | Strips `attachedDon`, returns them to `donCostArea` rested |
| **6-5-6-1.** Neither player can battle on first turn | **IMPL** | `validation.ts:137–139` | Checks `turn.number === 1` |

### 6-6. End Phase

| Rule | Status | Engine Location | Notes |
|------|--------|----------------|-------|
| **6-6-1-1.** [End of Your Turn] effects activate | **IMPL** | `triggers.ts` | Matches END_OF_TURN trigger keyword on TURN_ENDED events |
| **6-6-1-1-1.** [End of Your Turn] effects activate only once | **IMPL** | `triggers.ts` | Once-per-turn tracking in trigger registration |
| **6-6-1-1-2.** Turn player's end-of-turn effects resolve first, then opponent's | **IMPL** | `trigger-ordering.ts → scanEventsForTriggers()` | Orders by active player first |
| **6-6-1-1-3/4.** Multiple end-of-turn effects: player chooses order | **IMPL** | `trigger-ordering.ts → buildTriggerSelectionPrompt()` | Prompts player when multiple triggers fire simultaneously |
| **6-6-1-2.** "At the end of this turn" / "until the end of the turn" effect expiry | **IMPL** | `duration-tracker.ts → expireEffects()` | END_OF_TURN wave expires matching effects |
| **6-6-1-3.** "During this turn" effects expire | **IMPL** | `duration-tracker.ts` | Same END_OF_TURN wave |
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
| **7-1-1-3.** [When Attacking] / [On Your Opponent's Attack] / [When Attacked] activate | **IMPL** | `triggers.ts → matchTriggersForEvent()` | Matches WHEN_ATTACKING, ON_OPPONENTS_ATTACK, WHEN_ATTACKED trigger keywords |
| **7-1-1-4.** Card moved areas during Attack Step → skip to End of Battle | **PARTIAL** | — | Triggers can move cards during attack step; no explicit check that skips to End of Battle if attacker/target leaves |

### 7-1-2. Block Step

| Rule | Status | Engine Location | Notes |
|------|--------|----------------|-------|
| **7-1-2-1.** Defender can activate [Blocker] once per battle | **IMPL** | `executeDeclareBlocker()` + `validation.ts → validateDeclareBlocker()` | Rests blocker, replaces target. `blockerActivated` enforced |
| **7-1-2-2.** [On Block] effects activate | **IMPL** | `triggers.ts` | ON_BLOCK trigger keyword matched on blocker declaration events |
| **7-1-2-3.** Card moved areas during Block Step → skip to End of Battle | **PARTIAL** | — | Same as 7-1-1-4 |

### 7-1-3. Counter Step

| Rule | Status | Engine Location | Notes |
|------|--------|----------------|-------|
| **7-1-3-1.** "When attacked" effects activate during Counter Step | **IMPL** | `triggers.ts` | WHEN_ATTACKED trigger fires during counter step |
| **7-1-3-2.** Defender can use Symbol Counters and Counter Events | **IMPL** | `executeUseCounter()`, `executeUseCounterEvent()` in `battle.ts` | |
| **7-1-3-2-1.** Symbol Counter: trash Character from hand, add power | **IMPL** | `battle.ts:140–182` | Trashes card, adds `counterValue` to `counterPowerAdded` |
| **7-1-3-2-2.** Counter Event: pay cost, trash, activate [Counter] | **IMPL** | `battle.ts:186–211` + `effect-resolver/` | Cost paid, card trashed, effect resolved via schema |
| **7-1-3-3.** Card moved areas during Counter Step → skip to End of Battle | **PARTIAL** | — | Same as 7-1-1-4 |

### 7-1-4. Damage Step

| Rule | Status | Engine Location | Notes |
|------|--------|----------------|-------|
| **7-1-4-1.** Compare power: attacker ≥ defender = win | **IMPL** | `battle.ts:294` | `attackerPower >= defenderPower` |
| **7-1-4-1-1.** Leader attacked: 1 damage | **IMPL** | `battle.ts:297–375` | Full damage processing with life removal |
| **7-1-4-1-1-1.** 0 life + damage = defeat | **IMPL** | `battle.ts` damage loop + `defeat.ts:31–34` | Life-0 check runs at the start of each damage instance |
| **7-1-4-1-1-2.** Life → hand; trigger option | **IMPL** | `battle.ts:339–372` | Normal: add to hand. Trigger: pause for REVEAL_TRIGGER |
| **7-1-4-1-1-3.** Double Attack: 2 damage | **IMPL** | `battle.ts:301` | `damageCount = hasDoubleAttack ? 2 : 1` |
| **7-1-4-1-2.** Character attacked: K.O. | **IMPL** | `battle.ts:377–380` | `moveCard(state, targetId, "TRASH")` + `CARD_KO` event |
| **7-1-4-2.** Attacker loses: nothing happens | **IMPL** | `battle.ts:384` comment | Falls through to `endBattle()` |

### 7-1-5. End of Battle

| Rule | Status | Engine Location | Notes |
|------|--------|----------------|-------|
| **7-1-5-1.** Battle ends | **IMPL** | `battle.ts → endBattle()` | Clears `battle` and `battleSubPhase` from turn state |
| **7-1-5-2.** "At the end of battle" / "if this ... battles" effects | **IMPL** | `triggers.ts`, `duration-tracker.ts` | Trigger matching for battle-end events; END_OF_BATTLE duration wave |
| **7-1-5-3/4.** "During this battle" effects expire (turn player then non-turn player) | **IMPL** | `duration-tracker.ts → expireEffects()` | END_OF_BATTLE wave expires battle-scoped effects |
| **7-1-5-5.** Return to Main Phase (6-5-2) | **IMPL** | `endBattle()` emits `PHASE_CHANGED` from `DAMAGE_STEP` to `MAIN` | |

---

## 8. Activating and Resolving Effects (§8)

### 8-1. Effect Categories

| Rule | Status | Engine Location | Notes |
|------|--------|----------------|-------|
| **8-1-2.** "Can"/"may" = optional; no such word = mandatory | **IMPL** | `effect-types.ts` | EffectBlock has optional flag; resolver checks before requiring execution |
| **8-1-3-1.** Auto effects (activate on event) | **IMPL** | `triggers.ts → matchTriggersForEvent()` | Full trigger registration and matching for 12+ keyword triggers |
| **8-1-3-1-1.** Auto effect keywords: [On Play], [When Attacking], etc. | **IMPL** | `triggers.ts` | Matches ON_PLAY, WHEN_ATTACKING, ON_KO, ON_BLOCK, END_OF_TURN, etc. |
| **8-1-3-1-3.** Auto effect doesn't activate if card moved zones before activation | **IMPL** | `triggers.ts` | Zone-presence check at trigger resolution time |
| **8-1-3-2.** Activate effects ([Activate: Main], [Main]) | **IMPL** | `execute.ts → executeActivateEffect()` | Full activation with cost payment and resolution |
| **8-1-3-3.** Permanent effects | **IMPL** | `triggers.ts → registerPermanentEffectsForCard()` | Continuous modifier effects registered on zone entry |
| **8-1-3-4.** Replacement effects ("instead") | **IMPL** | `replacements.ts → checkReplacements()` | Full replacement detection, matching, optional prompts |
| **8-1-3-4-2.** Replacement effect priority (card owner → turn player → non-turn player) | **IMPL** | `replacements.ts` | Priority ordering implemented |
| **8-1-3-4-3.** Same replacement can't apply twice to same process | **IMPL** | `replacements.ts` | Once-per-event tracking |
| **8-1-4-1.** One-shot effects | **IMPL** | `effect-resolver/resolver.ts` | One-shot actions resolve immediately |
| **8-1-4-2.** Continuous effects | **IMPL** | `duration-tracker.ts` | Duration tracking with wave-based expiry and while-conditions |

### 8-2. Valid/Invalid Effects

| Rule | Status | Engine Location | Notes |
|------|--------|----------------|-------|
| **8-2-1 to 8-2-4.** Effect invalidation rules | **PARTIAL** | `conditions.ts`, `duration-tracker.ts` | While-condition effects re-evaluated; no explicit "invalidate other effects" mechanism |

### 8-3. Activation Cost and Conditions

| Rule | Status | Engine Location | Notes |
|------|--------|----------------|-------|
| **8-3-1.** Activation cost (before the colon) | **IMPL** | `effect-resolver/cost-handler.ts → payCosts()` | Handles DON_MINUS, DON_REST, TRASH_FROM_HAND, CARD_RETURN |
| **8-3-1-5.** ① symbol = rest N active DON!! | **IMPL** | `cost-handler.ts` | DON_REST cost type implemented |
| **8-3-1-6.** "DON!! −X" = return DON!! to DON!! deck | **IMPL** | `state.ts → returnDonToDeck()` | Returns DON!! from cost area to DON!! deck, preferring rested |
| **8-3-2-3.** [DON!! xX] condition | **IMPL** | `conditions.ts` | DON_FIELD_COUNT condition type evaluates attached DON!! count |
| **8-3-2-4/5.** [Your Turn] / [Opponent's Turn] conditions | **IMPL** | `conditions.ts` | Active player index comparison |

### 8-4. Activation and Resolution

| Rule | Status | Engine Location | Notes |
|------|--------|----------------|-------|
| **8-4-1 to 8-4-6.** Full activation sequence | **IMPL** | `effect-resolver/`, `cost-handler.ts`, `triggers.ts` | Check conditions → pay cost → activate → resolve → post-resolution triggers |
| **8-4-4.** "Choose"/"select"/"up to" during resolution | **IMPL** | `effect-resolver/target-resolver.ts`, `effect-stack.ts` | Target selection with constraints; effect stack pauses for player input |
| **8-4-5.** Auto effects only activate when moving to open area | **IMPL** | `triggers.ts`, `state.ts → isOpenArea()` | Zone-check at trigger registration and matching |
| **8-4-4-2.** Secret area cards: player can decline to choose | **PARTIAL** | — | Target resolver handles optional targets but secret-area specific rules not fully covered |

### 8-5. Card Activation vs Effect Activation

| Rule | Status | Engine Location | Notes |
|------|--------|----------------|-------|
| **8-5-1 to 8-5-4.** Distinct concepts | **PARTIAL** | — | Engine distinguishes "play Event card" from "activate effect on card" but doesn't track which distinction matters for triggers like "when you activate an Event" |

### 8-6. Order of Effect Resolution

| Rule | Status | Engine Location | Notes |
|------|--------|----------------|-------|
| **8-6-1.** Turn player resolves first, then non-turn player | **IMPL** | `trigger-ordering.ts → scanEventsForTriggers()` | Orders triggers by active player priority |
| **8-6-1-1.** Cascading triggers during resolution | **IMPL** | `effect-stack.ts`, `triggers.ts` | Re-entrant trigger detection via effect stack |
| **8-6-2.** Effects triggered during damage processing wait until damage finishes | **IMPL** | `effect-stack.ts`, `battle.ts` | Effect stack pauses during damage; triggers queued |
| **8-6-3.** Effects triggered by card/effect activation wait for resolution | **IMPL** | `trigger-ordering.ts` | Post-resolution trigger queue via event scanning |

---

## 9. Rule Processing (§9)

| Rule | Status | Engine Location | Notes |
|------|--------|----------------|-------|
| **9-1-1.** Rule processing = automatic processing on specific events | **IMPL** | `pipeline.ts` step 7 calls `checkDefeat()` | |
| **9-1-2.** Rule processing is immediate, even during other actions | **PARTIAL** | Runs after every pipeline call, but not mid-execution (e.g., not between individual damage points) | |
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
| K.O. — trashed by non-KO method ≠ K.O. | 10-2-1-3 | **IMPL** | `events.ts` | `CARD_KO` vs `CARD_TRASHED` event types distinguish K.O. from rule-based trashing |
| **[Activate: Main]** | 10-2-2 | **IMPL** | `execute.ts → executeActivateEffect()` | Full activation with cost and effect resolution |
| **[Main]** (Event) | 10-2-3 | **IMPL** | `validation.ts:89` checks keyword + `effect-resolver/` resolves | |
| **[Counter]** (Event) | 10-2-4 | **IMPL** | `validation.ts:249` + `effect-resolver/` | |
| **[When Attacking]** | 10-2-5 | **IMPL** | `triggers.ts → matchTriggersForEvent()` | Auto trigger on attack declaration |
| **[On Play]** | 10-2-6 | **IMPL** | `triggers.ts` | Auto trigger on card entering play |
| **[End of Your Turn]** | 10-2-7 | **IMPL** | `triggers.ts` | Matches TURN_ENDED events for active player |
| **[End of Opponent's Turn]** | 10-2-8 | **IMPL** | `triggers.ts` | Matches TURN_ENDED events for non-active player |
| **[DON!! xX]** | 10-2-9 | **IMPL** | `conditions.ts` | DON_FIELD_COUNT condition checks attached DON!! count ≥ X |
| **DON!! −X** | 10-2-10 | **IMPL** | `state.ts → returnDonToDeck()` | Returns DON!! from cost area to DON!! deck |
| **[Your Turn]** / **[Opponent's Turn]** | 10-2-11/12 | **IMPL** | `conditions.ts` | Condition evaluation based on active player index |
| **[Once Per Turn]** | 10-2-13 | **IMPL** | `triggers.ts`, `TurnState.oncePerTurnUsed` | Usage tracked per card instance; checked before activation |
| [Once Per Turn] — §10-2-13-4 | 10-2-13-4 | **IMPL** | `state.ts → moveCard()` | New `instanceId` on zone entry resets once-per-turn tracking |
| **Trash** (from hand) | 10-2-14 | **IMPL** | `moveCard(state, id, "TRASH")` | Used in counter card and event activation |
| **[On Block]** | 10-2-15 | **IMPL** | `triggers.ts` | ON_BLOCK trigger keyword |
| **[On Your Opponent's Attack]** | 10-2-16 | **IMPL** | `triggers.ts` | ON_OPPONENTS_ATTACK trigger keyword |
| **[On K.O.]** | 10-2-17 | **IMPL** | `triggers.ts` | CARD_KO event triggers ON_KO keyword handlers |
| **[On K.O.] — §10-2-17-2** | 10-2-17-2 | **IMPL** | `triggers.ts` | Effect activates while card on field, then card moves to trash, then resolves |

---

## 11. Other (§11)

| Rule | Status | Engine Location | Notes |
|------|--------|----------------|-------|
| **11-1-1.** Infinite loop detection | **GAP** | — | No loop detection. Risk: auto effects could create infinite loops. Need: action counter or state hash comparison |
| **11-1-1-1.** Unstoppable loop → draw | **GAP** | — | |
| **11-1-1-2/3.** Player can declare loop count | **GAP** | — | Need: prompt for loop count |
| **11-2-1.** Cards moved secret→secret must be revealed | **GAP** | — | No reveal enforcement on secret-to-secret transfers |
| **11-2-2.** Revealed cards become unrevealed after effect resolves | **GAP** | — | No reveal/unrevealed state tracking on cards |
| **11-3.** Viewing secret areas | **PARTIAL** | `effect-resolver/actions/draw-search.ts` | SEARCH_DECK and FULL_DECK_SEARCH let players view deck cards; no generic "look at" for life area |

---

## Remaining Gaps

The following items still require implementation:

### Setup & Game Flow

1. **First/Second Choice** — Let the winning player choose to go first or second, rather than hardcoding player1 = first.
   - Rules: 5-2-1-4, 5-2-1-5

2. **"At the Start of the Game" Effects** — Pre-game effect hook for Leaders with start-of-game text.
   - Rules: 5-2-1-5-1, 5-2-1-5-2

3. **Character Overflow Player Choice** — Prompt the player to choose which Character to trash (instead of auto-trashing oldest).
   - Rules: 3-7-6-1

### Battle Step Integrity

4. **Mid-Battle Zone Check** — After Attack Step, Block Step, and Counter Step, check if attacker or target left the battlefield. If so, skip to End of Battle.
   - Rules: 7-1-1-4, 7-1-2-3, 7-1-3-3

### Edge Cases & Misc

5. **Infinite Loop Detection** — Track repeated game states; if detected, prompt players for loop count or declare draw.
   - Rules: 11-1-1 to 11-1-1-3

6. **Secret-to-Secret Reveal Enforcement** — When a card moves between two secret areas, reveal it to both players.
   - Rules: 11-2-1, 11-2-2

7. **Attached DON!! State** — Clarify whether attached DON!! should have ACTIVE/RESTED state or a third "attached" state.
   - Rules: 4-4-2

8. **Rest vs Activate Conflict** — Explicit resolution when an effect tries to both rest and activate a card.
   - Rules: 1-3-8

---

## Priority Tiers

### Tier 1 — Required for correct battle behavior
Items 4

### Tier 2 — Required for specific card mechanics
Items 1, 2, 3

### Tier 3 — Correctness & edge cases
Items 5, 6, 7, 8

---

_Updated from `docs/rules/rule_comprehensive.md` v1.2.0 and engine source as of 2026-04-08_
