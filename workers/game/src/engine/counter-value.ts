/**
 * Effective counter values (OPT-400).
 *
 * COUNTER_GRANT rule modifications let an on-field card set the counter value
 * of matching cards ("without a Counter have a +1000 Counter" — EB01-001;
 * "the counter of your 8000-power Characters becomes +2000" — OP16-118).
 * Both the counter-step validation and execution must read this instead of
 * the printed `cardData.counter`.
 */

import type { CardData, CardInstance, GameState } from "../types.js";
import type { CounterGrant, EffectSchema, RuleModification } from "./effect-types.js";
import { matchesFilter } from "./conditions.js";
import { isCardNegated } from "./modifiers.js";

/** Collect rule modifications from both encoding shapes of a schema. */
function collectRuleMods(schema: EffectSchema | null | undefined): RuleModification[] {
  if (!schema) return [];
  const mods: RuleModification[] = [...(schema.rule_modifications ?? [])];
  for (const block of schema.effects ?? []) {
    if (block.category === "rule_modification" && block.rule) mods.push(block.rule);
  }
  return mods;
}

/**
 * Effective counter value of a card in hand: the printed counter, unless a
 * friendly on-field card carries a COUNTER_GRANT whose filter matches — then
 * the highest matching grant value applies ("becomes" semantics).
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
    ...(owner.characters.filter(Boolean) as CardInstance[]),
    ...(owner.stage ? [owner.stage] : []),
  ];

  let granted = 0;
  for (const source of sources) {
    const sourceData = cardDb.get(source.cardId);
    if (!sourceData?.effectSchema) continue;
    if (isCardNegated(source, state, cardDb)) continue;
    for (const mod of collectRuleMods(sourceData.effectSchema as EffectSchema)) {
      if (mod.rule_type !== "COUNTER_GRANT") continue;
      const grant = mod as CounterGrant;
      if (!matchesFilter(card, grant.filter, cardDb, state)) continue;
      granted = Math.max(granted, grant.value);
    }
  }

  return granted > 0 ? Math.max(printed, granted) : printed;
}
