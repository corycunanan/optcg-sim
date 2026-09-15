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
  const source = effectSourceCard(state, sourceInstanceId, snapshot);
  const data = source ? cardDb.get(source.cardId) : undefined;
  return source && data
    ? {
        instanceId: source.instanceId,
        cardId: source.cardId,
        cardType: data.type,
      }
    : undefined;
}

/** Resolve only a snapshot belonging to this executing effect's source. */
export function effectSourceCard(
  state: GameState,
  sourceInstanceId: string,
  snapshot?: CardInstance,
): CardInstance | undefined {
  return (snapshot?.instanceId === sourceInstanceId ? snapshot : undefined)
    ?? findCardInstance(state, sourceInstanceId) ?? undefined;
}
