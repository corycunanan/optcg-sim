# OPT-909 — Power reads during a battle

Inventory of the engine checks that read a card's power while a battle is in progress, and whether each sees the power a [Symbol Counter] added in the Counter Step. Taken on main `d1ecbfa` (2026-11-08).

## The rule

- Rules §7-1-3-2-1: activating a [Symbol Counter] "increases the power of their Leader or 1 Character card by the value of the [Symbol Counter] during that battle". That is a real power increase on the attacked card, for the rest of the battle.
- qa_op05 (OP05-001 Sabo): a Character with base power 4000 or less that becomes 5000 or more in the Counter Step can be protected by Sabo's "Character with 5000 power or more" replacement.

The engine stores Counter power on `BattleContext.counterPowerAdded`, not on the card. Counter power can only go to the battle target: the Counter Step follows the Block Step, so `targetInstanceId` is final by then.

## What OPT-909 changed

`getBattlePower()` in `workers/game/src/engine/modifiers.ts` returns effective power plus `counterPowerAdded` for the current battle's target (a Leader or Character), and plain effective power otherwise. `matchesFilterInBattle()` in `conditions.ts` is `matchesFilter` with that power read.

## Inventory

| Check | Where | Sees Counter power | Decision |
|---|---|---|---|
| Battle result (attacker vs. defender power) | `recalculateBattlePowers()` → `getBattleDefenderPower()` in `battle.ts` / `modifiers.ts` | Yes (already) | Correct per §7-1-3-2-1. |
| Replacement `target_filter` (`power_min`, `power_max`), battle K.O. and effect K.O. during the battle | `replacementMatchesTarget()` in `replacements.ts` | **Yes (fixed here)** | Correct per §7-1-3-2-1 and qa_op05 OP05-001. Covered by `opt-903-sabo-replaced-card-power.test.ts` ("base 4000 raised to 6000 in the Counter Step qualifies"). |
| Replacement block conditions | `isEffectConditionMet()` in `modifiers.ts` | No | No authored replacement condition reads the protected card's power today (they gate on DON!!, turn, or Leader). Same follow-up as the condition rows below. |
| Effect target filters (`power_min`, `power_max`) | `matchesFilter()` via `conditionQueries` in `conditions.ts` / `condition-queries.ts` | No | Should see it per §7-1-3-2-1. Example: a [Counter] Event choosing "your Character with 5000 power or less" after a Symbol Counter. Follow-up. |
| Conditions `SELF_POWER`, `LEADER_PROPERTY.power`, `CARD_ON_FIELD` property power | `condition-queries.ts` | No | Should see it per §7-1-3-2-1. Follow-up. |
| Aggregate power constraints on a selection | `resolveCardProperty()` in `effect-resolver/target-resolver.ts` | No | Should see it. Follow-up. |
| `SET_POWER_TO_ZERO` | `effect-resolver/actions/modifiers.ts` | No: it subtracts effective power only, so the defender keeps its Counter power | Needs a ruling on where Counter power sits relative to "becomes 0" before changing. Follow-up. |
| `COPY_POWER` source power | `effect-resolver/actions/modifiers.ts` | No | Should see it when the copied card is the battle target. Follow-up. |
| Continuous modifier conditions evaluated inside `getEffectivePower()` | `modifiers.ts` | No | Same follow-up. |
| Board display of the defender's power | client, `battle.defenderPower` / `counterPowerAdded` in `use-battle-state.ts` | Shown separately in the battle panel | Display only; no rules impact. |

## Why the rest is a follow-up

Making every read see Counter power means moving it into the power layers that `getEffectivePower()` computes, and then removing the separate addition in `getBattleDefenderPower()` so it is not counted twice. Where it sits relative to SET_POWER ("this card's power becomes N") is not settled by the rules text or an FAQ entry in the repo. That needs a ruling and its own tests, so this PR keeps the fix to the replacement scan that OPT-909 names and lists the rest here.
