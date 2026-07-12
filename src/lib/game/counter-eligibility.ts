import type { CardData } from "@shared/game-types";

export function isCounterEvent(
  data: Pick<CardData, "type" | "effectText"> | undefined,
): boolean {
  return data?.type === "Event" && data.effectText.includes("[Counter]");
}

/**
 * Client-side Counter Step eligibility.
 *
 * Any Character must remain attemptable because COUNTER_GRANT rule mods can
 * give a printed-counterless card an effective counter value. The server is
 * authoritative and rejects Characters whose effective value is still zero.
 * Events are immutable here: only printed [Counter] Events can be used.
 */
export function isCounterEligibleCard(data: CardData | undefined): boolean {
  if (!data) return false;
  if (data.type === "Character") return true;
  return isCounterEvent(data);
}
