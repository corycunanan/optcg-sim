import type {
  CardData,
  ExecuteResult,
  GameState,
  LifeCard,
  PendingEvent,
} from "../types.js";
import { removeTopLifeCard } from "./state.js";
import { hasTrigger } from "./keywords.js";
import { isCostPayable } from "./effect-resolver/cost-handler.js";
import { transitionDetachedCard } from "./zone-transition.js";

export function popLifeForDamage(
  state: GameState,
  damagedPlayerIndex: 0 | 1
): {
  state: GameState;
  lifeCard: LifeCard | null;
  lethal: boolean;
  events: PendingEvent[];
} {
  const events: PendingEvent[] = [];
  if (state.players[damagedPlayerIndex].life.length === 0) {
    return { state, lifeCard: null, lethal: true, events };
  }
  const result = removeTopLifeCard(state, damagedPlayerIndex);
  if (!result) return { state, lifeCard: null, lethal: false, events };
  const { lifeCard, state: nextState } = result;
  if (nextState.players[damagedPlayerIndex].life.length === 0) {
    events.push({
      type: "LIFE_COUNT_BECOMES_ZERO",
      playerIndex: damagedPlayerIndex,
      payload: {},
    });
  }
  return { state: nextState, lifeCard, lethal: false, events };
}

export function moveLifeCardToHand(
  state: GameState,
  lifeCard: LifeCard,
  damagedPlayerIndex: 0 | 1
): { state: GameState; events: PendingEvent[] } {
  const events: PendingEvent[] = [];
  const moved = transitionDetachedCard(
    state,
    {
      instanceId: lifeCard.instanceId,
      cardId: lifeCard.cardId,
      owner: damagedPlayerIndex,
      source: "LIFE",
      lifeFace: lifeCard.face,
    },
    "HAND"
  );
  if (!moved) return { state, events };
  events.push({
    type: "CARD_ADDED_TO_HAND_FROM_LIFE",
    playerIndex: damagedPlayerIndex,
    payload: {
      cardId: lifeCard.cardId,
      cardInstanceId: moved.fact.newInstanceId,
    },
  });
  events.push({
    type: "CARD_REMOVED_FROM_LIFE",
    playerIndex: damagedPlayerIndex,
    payload: {
      cardInstanceId: lifeCard.instanceId,
      newCardInstanceId: moved.fact.newInstanceId,
    },
  });
  return { state: moved.state, events };
}

export function canOfferTrigger(
  state: GameState,
  cardId: string,
  cardDb: Map<string, CardData>,
  ownerIndex: 0 | 1,
  sourceCardInstanceId?: string
): boolean {
  const cardData = cardDb.get(cardId);
  if (!cardData || !hasTrigger(cardData)) return false;
  const block = cardData.effectSchema?.effects?.find(
    (effect) =>
      effect.trigger &&
      "keyword" in effect.trigger &&
      effect.trigger.keyword === "TRIGGER"
  );
  if (!block?.costs?.length) return true;
  return block.costs.every((cost) =>
    isCostPayable(state, cost, ownerIndex, cardDb, sourceCardInstanceId)
  );
}

export function continueEffectDamageSequence(
  state: GameState,
  cardDb: Map<string, CardData>,
  damagedPlayerIndex: 0 | 1,
  remainingDamages: number,
  sourceCardInstanceId: string,
  controllerIndex: 0 | 1
): ExecuteResult {
  const events: PendingEvent[] = [];
  let nextState = state;
  for (let i = 0; i < remainingDamages; i++) {
    const popResult = popLifeForDamage(nextState, damagedPlayerIndex);
    if (popResult.lethal || !popResult.lifeCard) break;
    nextState = popResult.state;
    events.push(...popResult.events);
    const lifeCard = popResult.lifeCard;
    if (
      canOfferTrigger(
        nextState,
        lifeCard.cardId,
        cardDb,
        damagedPlayerIndex,
        lifeCard.instanceId
      )
    ) {
      nextState = {
        ...nextState,
        turn: {
          ...nextState.turn,
          pendingTriggerFromEffect: {
            lifeCard,
            damagedPlayerIndex,
            remainingDamages: remainingDamages - i - 1,
            sourceCardInstanceId,
            controllerIndex,
          },
        },
      };
      events.push({
        type: "TRIGGER_ACTIVATED",
        playerIndex: damagedPlayerIndex,
        payload: { cardId: lifeCard.cardId },
      });
      return { state: nextState, events, damagedPlayerIndex };
    }
    const handResult = moveLifeCardToHand(
      nextState,
      lifeCard,
      damagedPlayerIndex
    );
    nextState = handResult.state;
    events.push(...handResult.events);
  }
  return { state: nextState, events, damagedPlayerIndex };
}
