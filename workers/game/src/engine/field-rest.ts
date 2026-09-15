import type { EffectSourceIdentity } from "../../../../shared/game-types.js";
import type { GameState, PendingEvent } from "../types.js";
import { findCardInstance } from "./state.js";
import { setCardState } from "./effect-resolver/card-mutations.js";

/** DON in the cost area is a valid rest target but is not a CardInstance. */
export function isRestTargetActive(
  state: GameState,
  instanceId: string
): boolean {
  const card = findCardInstance(state, instanceId);
  return (
    (card?.state === "ACTIVE" &&
      ["LEADER", "CHARACTER", "STAGE"].includes(card.zone)) ||
    state.players.some((p) =>
      p.donCostArea.some(
        (d) => d.instanceId === instanceId && d.state === "ACTIVE"
      )
    )
  );
}

/** Shared by ordinary execution and persisted replacement-batch finalization. */
export function restFieldTarget(
  state: GameState,
  instanceId: string,
  causingController: 0 | 1,
  causingSource?: EffectSourceIdentity
): { state: GameState; events: PendingEvent[] } | null {
  if (!isRestTargetActive(state, instanceId)) return null;
  for (const pi of [0, 1] as const) {
    const player = state.players[pi];
    if (!player.donCostArea.some((d) => d.instanceId === instanceId)) continue;
    const players = [...state.players] as GameState["players"];
    players[pi] = {
      ...player,
      donCostArea: player.donCostArea.map((d) =>
        d.instanceId === instanceId ? { ...d, state: "RESTED" as const } : d
      ),
    };
    return {
      state: { ...state, players },
      events: [
        {
          type: "DON_STATE_CHANGED",
          playerIndex: pi,
          payload: {},
        },
      ],
    };
  }
  const nextState = setCardState(state, instanceId, "RESTED");
  if (nextState === state) return null;
  return {
    state: nextState,
    events: [
      {
        type: "CARD_STATE_CHANGED",
        playerIndex: causingController,
        payload: {
          targetInstanceId: instanceId,
          newState: "RESTED",
          cause: "EFFECT",
          causingController,
          causingSource,
        },
      },
    ],
  };
}
