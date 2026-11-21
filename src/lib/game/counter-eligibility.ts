import type { CardData, CardDb, PlayerState } from "@shared/game-types";

export function isCounterEvent(
  data: Pick<CardData, "type" | "effectText"> | undefined,
): boolean {
  return data?.type === "Event" && data.effectText.includes("[Counter]");
}

function grantsStageCounterRule(schema: unknown): boolean {
  if (!schema || typeof schema !== "object") return false;
  const effects = (schema as { effects?: unknown }).effects;
  if (!Array.isArray(effects)) return false;
  return effects.some((block) => {
    const rule = (block as { rule?: { rule_type?: unknown; filter?: { card_type?: unknown } } } | null)?.rule;
    if (!rule || rule.rule_type !== "COUNTER_GRANT") return false;
    const type = rule.filter?.card_type;
    return type === "STAGE" || (Array.isArray(type) && type.includes("STAGE"));
  });
}

/**
 * OPT-1046: true when a card on this player's field grants Stage cards in hand
 * a Counter (OP18-021 Franky: "All Stage cards in your hand have a +3000
 * Counter"). The server stays authoritative on the effective value.
 */
export function grantsStageCounter(
  player: Pick<PlayerState, "leader" | "characters" | "stage"> | null | undefined,
  cardDb: CardDb,
): boolean {
  if (!player) return false;
  const fieldCards = [player.leader, ...player.characters, player.stage];
  return fieldCards.some((card) => !!card && grantsStageCounterRule(cardDb[card.cardId]?.effectSchema));
}

/**
 * Client-side Counter Step eligibility.
 *
 * Any Character must remain attemptable because COUNTER_GRANT rule mods can
 * give a printed-counterless card an effective counter value. The server is
 * authoritative and rejects Characters whose effective value is still zero.
 * A Stage is attemptable only while a field card grants Stages a Counter
 * (OPT-1046). Events are immutable here: only printed [Counter] Events can be
 * used.
 */
export function isCounterEligibleCard(
  data: CardData | undefined,
  options: { stageCounterGranted?: boolean } = {},
): boolean {
  if (!data) return false;
  if (data.type === "Character") return true;
  if (data.type === "Stage") return options.stageCounterGranted === true;
  return isCounterEvent(data);
}
