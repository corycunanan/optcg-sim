# 12 — Pipeline Implementation Reference

> Implementation-level reference for the game engine's trigger/effect pipeline. Maps exact files, functions, and call chains. For architectural principles, see [08-ENGINE-ARCHITECTURE.md](./08-ENGINE-ARCHITECTURE.md).

**Use case:** Debugging trigger failures, auditing event emissions, implementing new action/trigger types.

---

## Quick Reference: Call Chain

```
Player Action
  ↓
runPipeline() [pipeline.ts]
  ├─ validate()
  ├─ checkProhibitions()
  ├─ checkReplacements()
  ├─ execute() [execute.ts]
  │   └─ Produces: ExecuteResult {state, events}
  ├─ fireEventsAndTriggers() [pipeline.ts]
  │   ├─ emitEvent() → records in state.events
  │   ├─ registerTriggersForCard() [triggers.ts]
  │   ├─ matchTriggersForEvent() [triggers.ts]
  │   │   └─ matchesTrigger()
  │   │       ├─ matchesKeywordTrigger()
  │   │       └─ matchesCustomTrigger()
  │   ├─ orderMatchedTriggers() [triggers.ts]
  │   ├─ deregisterTriggersForCard() [triggers.ts]
  │   └─ processPlayerTriggerGroup()
  │       └─ processTriggerQueuePipeline() [LIFO queue]
  │           └─ resolveEffect() [resolver.ts]
  │               ├─ evaluateCondition() [conditions.ts]
  │               ├─ payCostsWithSelection() [cost-handler.ts]
  │               └─ executeActionChain() [resolver.ts]
  │                   └─ ACTION_HANDLERS[action.type]() [actions/*.ts]
  │                       ├─ computeAllValidTargets() [target-resolver.ts]
  │                       ├─ needsPlayerTargetSelection() [target-resolver.ts]
  │                       └─ buildSelectTargetPrompt() [target-resolver.ts]
  ├─ recalculateModifiers() [pipeline.ts]
  │   ├─ evaluateWhileConditions() [duration-tracker.ts]
  │   ├─ expireBattleEffects() [duration-tracker.ts]
  │   └─ processScheduledActions() [duration-tracker.ts]
  └─ finishPipeline() [pipeline.ts]
      └─ checkDefeat() [defeat.ts]
```

---

## Files Map

| File | Purpose | Size |
|------|---------|------|
| `engine/execute.ts` | Action dispatch — routes by action.type | ~4 KB |
| `engine/pipeline.ts` | 7-step loop, trigger queue, LIFO processing | ~14 KB |
| `engine/triggers.ts` | Event → trigger matching, registration/deregistration | ~14 KB |
| `engine/battle.ts` | Battle sub-state machine, event emissions | ~15 KB |
| `engine/phases.ts` | Phase transitions, turn start/end events | ~5 KB |
| `engine/conditions.ts` | Condition evaluation, `matchesFilter()` | ~15 KB |
| `engine/prohibitions.ts` | Prohibition registry scanning | ~3 KB |
| `engine/effect-resolver/resolver.ts` | Effect resolution, action chain executor | ~12 KB |
| `engine/effect-resolver/target-resolver.ts` | Target computation, selection prompts | ~12 KB |
| `engine/effect-resolver/cost-handler.ts` | Cost validation, payment, selection prompts | ~27 KB |
| `engine/effect-resolver/actions/*.ts` | 50+ action handlers (draw, modifiers, removal, life, DON, play, etc.) | — |
| `engine/effect-resolver/modifier-layer.ts` | Power/cost/keyword recalculation | ~5 KB |
| `engine/effect-resolver/duration-tracker.ts` | Effect expiry (turn, battle, while-condition) | ~5 KB |

---

## Event Emission Map

Every trigger requires an event to be emitted. If the event isn't emitted, the trigger silently never fires.

| Event Type | Trigger Keywords | Emitted In |
|-----------|-----------------|-----------|
| `CARD_PLAYED` | ON_PLAY, CHARACTER_PLAYED | execute.ts (hand play), play.ts (effect play), life.ts (play from life) |
| `EVENT_ACTIVATED_FROM_HAND` | EVENT_ACTIVATED_FROM_HAND | execute.ts:executePlayCard (Event from hand), play.ts:executeActivateEventFromHand (effect-driven). Payload carries `costReducedAmount` (printed − paid, clamped ≥ 0) for OPT-238 `cost_reduced` filter; effect-driven path always emits 0 since no cost is paid. |
| `EVENT_MAIN_RESOLVED_FROM_TRASH` | EVENT_MAIN_RESOLVED_FROM_TRASH | play.ts:executeActivateEventFromTrash (Character activates Event [Main] from trash, e.g. Reiju) |
| `EVENT_TRIGGER_RESOLVED` | EVENT_TRIGGER_RESOLVED | battle.ts:executeRevealTrigger (Event card [Trigger] from life) |
| `CARD_KO` | ON_KO, OPPONENT_CHARACTER_KO, ANY_CHARACTER_KO | card-mutations.ts, battle.ts |
| `ATTACK_DECLARED` | WHEN_ATTACKING, ON_OPPONENT_ATTACK | battle.ts:executeDeclareAttack |
| `BLOCK_DECLARED` | ON_BLOCK, BLOCKER_ACTIVATED | battle.ts:executeDeclareBlocker |
| `COUNTER_USED` | COUNTER, COUNTER_EVENT | battle.ts:executeUseCounter(Event) |
| `TRIGGER_ACTIVATED` | TRIGGER, TRIGGER_ACTIVATED | battle.ts:executeRevealTrigger, executeDamageStep |
| `TURN_ENDED` | END_OF_YOUR_TURN, END_OF_OPPONENT_TURN | phases.ts:runEndPhase |
| `TURN_STARTED` | START_OF_TURN | phases.ts:runEndPhase |
| `CARD_STATE_CHANGED` | CHARACTER_BECOMES_RESTED | play.ts:executeSetRest, battle.ts:executeDeclareAttack, battle.ts:executeDeclareBlocker |
| `CARD_RETURNED_TO_HAND` | CHARACTER_RETURNED_TO_HAND | card-mutations.ts:returnToHand |
| `DON_DETACHED` | DON_RETURNED_TO_DON_DECK | don.ts, phases.ts |
| `DON_GIVEN_TO_CARD` | DON_GIVEN_TO_CARD | don.ts, execute.ts |
| `CARD_ADDED_TO_HAND_FROM_LIFE` | CARD_REMOVED_FROM_LIFE, CARD_ADDED_TO_HAND_FROM_LIFE, LIFE_CARD_REMOVED | life.ts, battle.ts |
| `DAMAGE_DEALT` | DAMAGE_TAKEN, LEADER_ATTACK_DEALS_DAMAGE | battle.ts:executeDamageStep (includes attackerInstanceId, attackerType) |
| `BATTLE_RESOLVED` | END_OF_BATTLE | battle.ts:endBattle |
| `COMBAT_VICTORY` | COMBAT_VICTORY | battle.ts:executeDamageStep (attacker wins vs CHARACTER) |
| `CHARACTER_BATTLES` | CHARACTER_BATTLES | battle.ts:executeDeclareAttack (attacker is CHARACTER) |
| `LIFE_COUNT_BECOMES_ZERO` | LIFE_COUNT_BECOMES_ZERO | battle.ts:executeDamageStep (life hits 0 after removal) |
| `DRAW_OUTSIDE_DRAW_PHASE` | DRAW_OUTSIDE_DRAW_PHASE | draw-search.ts:executeDraw, hand-deck.ts:executeHandWheel |

---

## Trigger Matching Logic

```
matchesTrigger(trigger, event, state, sourceCard, cardDb)
  ├─ CompoundTrigger: any_of → recursive match on sub-triggers
  ├─ KeywordTrigger:
  │   ├─ keywordToEventType() → map keyword to GameEventType
  │   ├─ Self-referencing check (ON_PLAY, WHEN_ATTACKING, ON_KO, ON_BLOCK)
  │   │   └─ getCardFromEvent() reads event.payload.cardInstanceId
  │   ├─ Turn restriction: YOUR_TURN / OPPONENT_TURN
  │   ├─ DON!! requirement: sourceCard.attachedDon.length >= threshold
  │   └─ KO cause filter: BATTLE / EFFECT / OPPONENT_EFFECT
  └─ CustomTrigger:
      ├─ customEventToGameEvent() → map CustomEventType to GameEventType
      ├─ EventFilter: controller (SELF/OPPONENT), cause
      └─ Quantity threshold
```

**Critical invariant:** `getCardFromEvent()` reads `event.payload.cardInstanceId`. All event emissions must use this key for self-referencing triggers to work.

---

## Custom Event Type Mappings

`customEventToGameEvent()` in triggers.ts maps schema-level custom triggers to engine-level event types:

| CustomEventType | Maps To |
|----------------|---------|
| OPPONENT_CHARACTER_KO | CARD_KO |
| ANY_CHARACTER_KO | CARD_KO |
| DON_RETURNED_TO_DON_DECK | DON_DETACHED |
| DON_GIVEN_TO_CARD | DON_GIVEN_TO_CARD |
| EVENT_ACTIVATED_FROM_HAND | EVENT_ACTIVATED_FROM_HAND |
| EVENT_MAIN_RESOLVED_FROM_TRASH | EVENT_MAIN_RESOLVED_FROM_TRASH |
| EVENT_TRIGGER_RESOLVED | EVENT_TRIGGER_RESOLVED |
| CHARACTER_PLAYED | CARD_PLAYED |
| CARD_REMOVED_FROM_LIFE | CARD_ADDED_TO_HAND_FROM_LIFE |
| LIFE_CARD_REMOVED | CARD_ADDED_TO_HAND_FROM_LIFE |
| TRIGGER_ACTIVATED | TRIGGER_ACTIVATED |
| DAMAGE_TAKEN | DAMAGE_DEALT |
| BLOCKER_ACTIVATED | BLOCK_DECLARED |
| LEADER_ATTACK_DEALS_DAMAGE | DAMAGE_DEALT |
| CARD_ADDED_TO_HAND_FROM_LIFE | CARD_ADDED_TO_HAND_FROM_LIFE |
| CHARACTER_BECOMES_RESTED | CARD_STATE_CHANGED |
| CHARACTER_RETURNED_TO_HAND | CARD_RETURNED_TO_HAND |
| END_OF_BATTLE | BATTLE_RESOLVED |
| COMBAT_VICTORY | COMBAT_VICTORY |
| CHARACTER_BATTLES | CHARACTER_BATTLES |
| LIFE_COUNT_BECOMES_ZERO | LIFE_COUNT_BECOMES_ZERO |
| DRAW_OUTSIDE_DRAW_PHASE | DRAW_OUTSIDE_DRAW_PHASE |

All custom event types are now mapped.

---

## Key Semantics

1. **LIFO trigger queue:** New triggers from resolved effects jump to front of queue. Creates natural cascading per OPTCG rules.

2. **Paused prompts:** When target selection or cost payment needs player input, the engine pushes an `EffectStackFrame` and returns a `pendingPrompt`. On resume, remaining actions execute from the saved frame.

3. **Once-per-turn:** Tracked per `{effectBlockId, sourceCardInstanceId}` in `state.turn.oncePerTurnUsed`.

4. **Modifier layer:** Power/cost/keywords are never stored as mutated values. Recalculated from base + active modifiers on every read. Duration expiry simply removes the modifier.
