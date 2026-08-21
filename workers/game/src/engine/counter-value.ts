/**
 * Effective counter values (OPT-400).
 *
 * COUNTER_GRANT rule modifications let an on-field card, or a card's own
 * HAND-zone rule block, set the counter value
 * of matching cards ("without a Counter have a +1000 Counter" — EB01-001;
 * "the counter of your 8000-power Characters becomes +2000" — OP16-118).
 * Both the counter-step validation and execution must read this instead of
 * the printed `cardData.counter`.
 */

import type { CardData, CardInstance, GameState } from "../types.js";
import type { CounterGrant, EffectBlock, EffectSchema, RuleModification } from "./effect-types.js";
import { evaluateCondition, matchesFilter } from "./conditions.js";
import { isCardNegated } from "./modifiers.js";
import { isPresent } from "./type-guards.js";

type RuleModSource = {
  rule: RuleModification;
  block?: EffectBlock;
};

/** Collect rule modifications without discarding effect-block scope or conditions. */
function collectRuleMods(schema: EffectSchema | null | undefined): RuleModSource[] {
  if (!schema) return [];
  const mods: RuleModSource[] = (schema.rule_modifications ?? []).map((rule) => ({ rule }));
  for (const block of schema.effects ?? []) {
    if (block.category === "rule_modification" && block.rule) {
      mods.push({ rule: block.rule, block });
    }
  }
  return mods;
}

/**
 * Effective counter value of a card in hand: the printed counter, unless its
 * own HAND-zone rule block or a friendly on-field card carries a matching
 * COUNTER_GRANT — then the highest matching value applies ("becomes" semantics).
 */
export function getEffectiveCounterValue(
  card: CardInstance,
  cardData: CardData,
  state: GameState,
  cardDb: Map<string, CardData>,
): number {
  const printed = cardData.counter ?? 0;

  const owner = state.players[card.owner];
  const sources: CardInstance[] = [
    owner.leader,
    ...owner.characters.filter(isPresent),
    ...(owner.stage ? [owner.stage] : []),
  ];

  let granted = 0;

  // OP17-118: a rule block explicitly scoped to HAND modifies only the card
  // carrying that schema while that exact instance remains in hand.
  if (card.zone === "HAND") {
    for (const block of cardData.effectSchema?.effects ?? []) {
      if (block.category !== "rule_modification" || block.zone !== "HAND") continue;
      if (block.rule?.rule_type !== "COUNTER_GRANT") continue;
      if (
        block.conditions &&
        !evaluateCondition(state, block.conditions, {
          sourceCardInstanceId: card.instanceId,
          controller: card.controller,
          cardDb,
        })
      ) {
        continue;
      }
      if (!matchesFilter(card, block.rule.filter, cardDb, state)) continue;
      granted = Math.max(granted, block.rule.value);
    }
  }

  for (const source of sources) {
    const sourceData = cardDb.get(source.cardId);
    if (!sourceData?.effectSchema) continue;
    if (isCardNegated(source, state, cardDb)) continue;
    for (const { rule: mod, block } of collectRuleMods(sourceData.effectSchema)) {
      if (mod.rule_type !== "COUNTER_GRANT") continue;
      if (block?.zone === "HAND") continue;
      if (
        block?.conditions &&
        !evaluateCondition(state, block.conditions, {
          sourceCardInstanceId: source.instanceId,
          controller: source.controller,
          cardDb,
        })
      ) {
        continue;
      }
      const grant = mod as CounterGrant;
      if (!matchesFilter(card, grant.filter, cardDb, state)) continue;
      granted = Math.max(granted, grant.value);
    }
  }

  return granted > 0 ? Math.max(printed, granted) : printed;
}
