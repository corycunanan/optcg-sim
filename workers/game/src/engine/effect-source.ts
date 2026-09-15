import type { EffectSourceIdentity } from "../../../../shared/game-types.js";
import type { CardData, CardInstance, GameState } from "../types.js";
import { findCardInstance } from "./state.js";

/** Project the existing pre-payment snapshot into durable event provenance. */
export function effectSourceIdentity(
  state: GameState,
  sourceInstanceId: string | undefined,
  cardDb: Map<string, CardData>,
  snapshot?: CardInstance
): EffectSourceIdentity | undefined {
  if (!sourceInstanceId) return undefined;
  const source =
    snapshot?.instanceId === sourceInstanceId
      ? snapshot
      : findCardInstance(state, sourceInstanceId);
  const data = source ? cardDb.get(source.cardId) : undefined;
  return source && data
    ? {
        instanceId: source.instanceId,
        cardId: source.cardId,
        cardType: data.type,
      }
    : undefined;
}
