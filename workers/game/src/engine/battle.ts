/**
 * Battle system
 *
 * Attack → Block → Counter → Damage → End of Battle.
 * All battle-related execution logic, extracted from execute.ts.
 */

import type { CardData, GameState, LifeCard, PendingEvent, ExecuteResult } from "../types.js";
import {
  getActivePlayerIndex,
  getInactivePlayerIndex,
  findCardInState,
  moveCard,
  removeTopLifeCard,
  restDonForCost,
} from "./state.js";
import { getEffectivePower, getEffectiveCost, getBattleDefenderPower } from "./modifiers.js";
import { expireBattleEffects } from "./duration-tracker.js";
import { hasDoubleAttack, hasBanish, hasTrigger } from "./keywords.js";
import { checkReplacementForKO } from "./replacements.js";
import { resolveEffect } from "./effect-resolver/index.js";
import { koCharacter } from "./effect-resolver/card-mutations.js";
import type { EffectSchema } from "./effect-types.js";
import { nanoid } from "../util/nanoid.js";

// ─── Declare Attack ───────────────────────────────────────────────────────────

export function executeDeclareAttack(
  state: GameState,
  attackerInstanceId: string,
  targetInstanceId: string,
  cardDb: Map<string, CardData>,
): ExecuteResult {
  const events: PendingEvent[] = [];
  const pi = getActivePlayerIndex(state);

  // Rest the attacker
  let nextState = setCardState(state, pi, attackerInstanceId, "RESTED");
  events.push({ type: "CARD_STATE_CHANGED", playerIndex: pi, payload: { cardInstanceId: attackerInstanceId, newState: "RESTED" } });

  const attackerFound = findCardInState(nextState, attackerInstanceId)!;
  const attackerData = cardDb.get(attackerFound.card.cardId)!;
  const attackerPower = getEffectivePower(attackerFound.card, attackerData, nextState, cardDb);

  const defenderFound = findCardInState(nextState, targetInstanceId)!;
  const defenderData = cardDb.get(defenderFound.card.cardId)!;
  const defenderPower = getEffectivePower(defenderFound.card, defenderData, nextState, cardDb);

  const battle = {
    battleId: nanoid(),
    attackerInstanceId,
    targetInstanceId,
    attackerPower,
    defenderPower,
    counterPowerAdded: 0,
    blockerActivated: false,
  };

  nextState = {
    ...nextState,
    turn: { ...nextState.turn, battle, battleSubPhase: "ATTACK_STEP" },
  };

  events.push({
    type: "ATTACK_DECLARED",
    playerIndex: pi,
    payload: { attackerInstanceId, targetInstanceId, attackerPower },
  });

  // Emit CHARACTER_BATTLES when attacker is a character (not leader)
  if (attackerFound.card.zone === "CHARACTER") {
    events.push({ type: "CHARACTER_BATTLES", playerIndex: pi, payload: { cardInstanceId: attackerInstanceId, targetInstanceId } });
  }

  // [When Attacking] and [On Your Opponent's Attack] fire here in M4

  // Advance to BLOCK_STEP
  nextState = { ...nextState, turn: { ...nextState.turn, battleSubPhase: "BLOCK_STEP" } };
  events.push({ type: "PHASE_CHANGED", playerIndex: pi, payload: { from: "ATTACK_STEP", to: "BLOCK_STEP" } });

  return { state: nextState, events };
}

// ─── Declare Blocker ──────────────────────────────────────────────────────────

export function executeDeclareBlocker(
  state: GameState,
  blockerInstanceId: string,
  cardDb: Map<string, CardData>,
): ExecuteResult {
  const events: PendingEvent[] = [];
  const inactiveIdx = getInactivePlayerIndex(state);

  // Rest the blocker
  let nextState = setCardState(state, inactiveIdx, blockerInstanceId, "RESTED");
  events.push({ type: "CARD_STATE_CHANGED", playerIndex: inactiveIdx, payload: { cardInstanceId: blockerInstanceId, newState: "RESTED" } });

  // Replace the target in BattleContext
  const battle = nextState.turn.battle!;
  const updatedBattle = { ...battle, targetInstanceId: blockerInstanceId, blockerActivated: true };

  // Recalculate defender power with new target
  const blockerFound = findCardInState(nextState, blockerInstanceId)!;
  const blockerData = cardDb.get(blockerFound.card.cardId)!;
  const blockerPower = getEffectivePower(blockerFound.card, blockerData, nextState, cardDb);

  nextState = {
    ...nextState,
    turn: {
      ...nextState.turn,
      battle: { ...updatedBattle, defenderPower: blockerPower },
    },
  };

  events.push({ type: "BLOCK_DECLARED", playerIndex: inactiveIdx, payload: { blockerInstanceId } });
  // [On Block] fires in M4

  // Advance to COUNTER_STEP
  nextState = { ...nextState, turn: { ...nextState.turn, battleSubPhase: "COUNTER_STEP" } };
  events.push({ type: "PHASE_CHANGED", playerIndex: inactiveIdx, payload: { from: "BLOCK_STEP", to: "COUNTER_STEP" } });

  return { state: nextState, events };
}

// ─── Pass (battle sub-phase transitions) ──────────────────────────────────────

export function executePass(state: GameState, cardDb: Map<string, CardData>): ExecuteResult {
  const events: PendingEvent[] = [];
  const pi = getActivePlayerIndex(state);
  let nextState = state;

  if (state.turn.battleSubPhase === "BLOCK_STEP") {
    // Defender passes blocker window → advance to COUNTER_STEP
    nextState = { ...nextState, turn: { ...nextState.turn, battleSubPhase: "COUNTER_STEP" } };
    events.push({ type: "PHASE_CHANGED", playerIndex: pi, payload: { from: "BLOCK_STEP", to: "COUNTER_STEP" } });
  } else if (state.turn.battleSubPhase === "COUNTER_STEP") {
    // Defender passes counter window → advance to DAMAGE_STEP
    nextState = { ...nextState, turn: { ...nextState.turn, battleSubPhase: "DAMAGE_STEP" } };
    events.push({ type: "PHASE_CHANGED", playerIndex: pi, payload: { from: "COUNTER_STEP", to: "DAMAGE_STEP" } });
    // Run damage resolution immediately
    const dmgResult = executeDamageStep(nextState, cardDb);
    nextState = dmgResult.state;
    events.push(...dmgResult.events);
    return {
      state: nextState,
      events,
      damagedPlayerIndex: dmgResult.damagedPlayerIndex,
      ...(dmgResult.pendingPrompt && { pendingPrompt: dmgResult.pendingPrompt }),
    };
  }

  return { state: nextState, events };
}

// ─── Symbol Counter ───────────────────────────────────────────────────────────

export function executeUseCounter(
  state: GameState,
  cardInstanceId: string,
  counterTargetInstanceId: string,
  cardDb: Map<string, CardData>,
): ExecuteResult {
  const events: PendingEvent[] = [];
  const inactiveIdx = getInactivePlayerIndex(state);

  const found = findCardInState(state, cardInstanceId)!;
  const cardData = cardDb.get(found.card.cardId)!;
  const counterValue = cardData.counter!;

  // Trash the counter card from hand
  let nextState = moveCard(state, cardInstanceId, "TRASH");

  // Add counter power to battle context
  const battle = nextState.turn.battle!;
  const targetFound = findCardInState(nextState, battle.targetInstanceId);
  if (targetFound) {
    const targetData = cardDb.get(targetFound.card.cardId);
    const newCounterPower = battle.counterPowerAdded + counterValue;
    const newDefenderPower = targetData
      ? getBattleDefenderPower(targetFound.card, targetData, newCounterPower, nextState)
      : battle.defenderPower + counterValue;

    nextState = {
      ...nextState,
      turn: {
        ...nextState.turn,
        battle: { ...battle, counterPowerAdded: newCounterPower, defenderPower: newDefenderPower },
      },
    };
  }

  events.push({
    type: "COUNTER_USED",
    playerIndex: inactiveIdx,
    payload: { cardId: cardData.id, counterValue, counterTargetInstanceId },
  });

  return { state: nextState, events };
}

// ─── Counter Event ────────────────────────────────────────────────────────────

export function executeUseCounterEvent(
  state: GameState,
  cardInstanceId: string,
  cardDb: Map<string, CardData>,
): ExecuteResult {
  const events: PendingEvent[] = [];
  const inactiveIdx = getInactivePlayerIndex(state);

  const found = findCardInState(state, cardInstanceId)!;
  const cardData = cardDb.get(found.card.cardId)!;
  const cost = getEffectiveCost(cardData, state, cardInstanceId, cardDb);

  // Pay cost
  let nextState = restDonForCost(state, inactiveIdx, cost)!;
  // Trash the event
  nextState = moveCard(nextState, cardInstanceId, "TRASH");

  events.push({
    type: "COUNTER_USED",
    playerIndex: inactiveIdx,
    payload: { cardId: cardData.id, cardInstanceId, type: "event" },
  });

  return { state: nextState, events };
}

// ─── Reveal Trigger ───────────────────────────────────────────────────────────

export function executeRevealTrigger(
  state: GameState,
  reveal: boolean,
  cardDb: Map<string, CardData>,
): ExecuteResult {
  const events: PendingEvent[] = [];
  const inactiveIdx = getInactivePlayerIndex(state);
  let nextState = state;

  const battle = state.turn.battle as typeof state.turn.battle & { pendingTriggerLifeCard?: LifeCard };
  if (!battle?.pendingTriggerLifeCard) return { state, events };

  const lifeCard = battle.pendingTriggerLifeCard;

  if (reveal) {
    // Activate trigger — card goes to trash (rules §10-1-5-3)
    const trashCard = {
      instanceId: lifeCard.instanceId,
      cardId: lifeCard.cardId,
      zone: "TRASH" as const,
      state: "ACTIVE" as const,
      attachedDon: [],
      turnPlayed: null,
      controller: inactiveIdx,
      owner: inactiveIdx,
    };
    const newPlayers = [...nextState.players] as typeof nextState.players;
    newPlayers[inactiveIdx] = {
      ...newPlayers[inactiveIdx],
      trash: [trashCard, ...newPlayers[inactiveIdx].trash],
    };
    nextState = { ...nextState, players: newPlayers };
    events.push({ type: "TRIGGER_ACTIVATED", playerIndex: inactiveIdx, payload: { cardId: lifeCard.cardId, activated: true } });

    // If the trigger card has an effectSchema with a TRIGGER block, resolve it
    const triggerCardData = cardDb.get(lifeCard.cardId);
    if (triggerCardData?.type === "Event") {
      events.push({
        type: "EVENT_TRIGGER_RESOLVED",
        playerIndex: inactiveIdx,
        payload: { cardId: lifeCard.cardId, cardInstanceId: lifeCard.instanceId },
      });
    }
    const schema = triggerCardData?.effectSchema as EffectSchema | null;
    if (schema?.effects) {
      const triggerBlock = schema.effects.find(
        (b) => b.trigger && "keyword" in b.trigger && b.trigger.keyword === "TRIGGER",
      );
      if (triggerBlock) {
        const effectResult = resolveEffect(
          nextState,
          triggerBlock,
          lifeCard.instanceId,
          inactiveIdx,
          cardDb,
        );
        nextState = effectResult.state;
        events.push(...effectResult.events);
        // If the trigger effect needs player input, end the battle first
        // then surface the prompt — battle is over, we're just resolving the effect
        if (effectResult.pendingPrompt) {
          nextState = endBattle(nextState, events);
          return { state: nextState, events, pendingPrompt: effectResult.pendingPrompt };
        }
      }
    }
  } else {
    // Decline trigger — add to hand
    const handCard = {
      instanceId: lifeCard.instanceId,
      cardId: lifeCard.cardId,
      zone: "HAND" as const,
      state: "ACTIVE" as const,
      attachedDon: [],
      turnPlayed: null,
      controller: inactiveIdx,
      owner: inactiveIdx,
    };
    const newPlayers = [...nextState.players] as typeof nextState.players;
    newPlayers[inactiveIdx] = {
      ...newPlayers[inactiveIdx],
      hand: [...newPlayers[inactiveIdx].hand, handCard],
    };
    nextState = { ...nextState, players: newPlayers };
    events.push({ type: "CARD_ADDED_TO_HAND_FROM_LIFE", playerIndex: inactiveIdx, payload: { cardId: lifeCard.cardId, cardInstanceId: lifeCard.instanceId } });
  }

  // Clear pending trigger and end battle
  const cleanedBattle = { ...battle };
  delete (cleanedBattle as Partial<typeof cleanedBattle & { pendingTriggerLifeCard?: LifeCard }>).pendingTriggerLifeCard;
  nextState = { ...nextState, turn: { ...nextState.turn, battle: cleanedBattle } };
  nextState = endBattle(nextState, events);

  return { state: nextState, events };
}

// ─── Recalculate Battle Powers ───────────────────────────────────────────────

/**
 * Recalculate attacker/defender power in the battle context using current
 * activeEffects. Called after trigger resolution and at damage step to ensure
 * modifiers from [When Attacking] / [On Your Opponent's Attack] are reflected.
 */
export function recalculateBattlePowers(
  state: GameState,
  cardDb: Map<string, CardData>,
): GameState {
  const battle = state.turn.battle;
  if (!battle) return state;

  const attackerFound = findCardInState(state, battle.attackerInstanceId);
  const defenderFound = findCardInState(state, battle.targetInstanceId);
  if (!attackerFound || !defenderFound) return state;

  const attackerData = cardDb.get(attackerFound.card.cardId);
  const defenderData = cardDb.get(defenderFound.card.cardId);
  if (!attackerData || !defenderData) return state;

  const newAttackerPower = getEffectivePower(attackerFound.card, attackerData, state, cardDb);
  const newDefenderPower = getBattleDefenderPower(
    defenderFound.card, defenderData, battle.counterPowerAdded, state, cardDb,
  );

  if (newAttackerPower === battle.attackerPower && newDefenderPower === battle.defenderPower) {
    return state;
  }

  return {
    ...state,
    turn: {
      ...state.turn,
      battle: { ...battle, attackerPower: newAttackerPower, defenderPower: newDefenderPower },
    },
  };
}

// ─── Damage Step (internal) ──────────────────────────────────────────────────

function executeDamageStep(
  state: GameState,
  cardDb: Map<string, CardData>,
): ExecuteResult & { damagedPlayerIndex?: 0 | 1 } {
  const events: PendingEvent[] = [];
  const pi = getActivePlayerIndex(state);
  const inactiveIdx = getInactivePlayerIndex(state);

  // Recalculate powers to reflect all modifiers (triggers, counters, effects)
  let nextState = recalculateBattlePowers(state, cardDb);
  const battle = nextState.turn.battle!;
  let damagedPlayerIndex: 0 | 1 | undefined;

  const { attackerPower, defenderPower, targetInstanceId } = battle;

  if (attackerPower >= defenderPower) {
    const targetFound = findCardInState(state, targetInstanceId);
    if (targetFound) {
      if (targetFound.card.zone === "LEADER") {
        // Leader takes damage
        const attackerFound = findCardInState(state, battle.attackerInstanceId);
        const attackerData = attackerFound ? cardDb.get(attackerFound.card.cardId) : undefined;
        const damageCount = attackerData && hasDoubleAttack(attackerData) ? 2 : 1;
        const isBanish = attackerData ? hasBanish(attackerData) : false;

        // Process each damage point (rules §7-1-4-1-1-3)
        for (let i = 0; i < damageCount; i++) {
          // §7-1-4-1-1-1: If 0 life at the point damage would be dealt → defeat
          if (nextState.players[inactiveIdx].life.length === 0) {
            damagedPlayerIndex = inactiveIdx;
            events.push({ type: "DAMAGE_DEALT", playerIndex: pi, payload: { target: "leader", amount: 1, lethal: true, attackerInstanceId: battle.attackerInstanceId, attackerType: attackerData?.type?.toUpperCase() === "LEADER" ? "LEADER" : "CHARACTER" } });
            break;
          }

          // §7-1-4-1-1-2: Has life → remove top life card
          const result = removeTopLifeCard(nextState, inactiveIdx);
          if (!result) break;

          const { lifeCard, state: stateAfterRemoval } = result;
          nextState = stateAfterRemoval;

          events.push({ type: "DAMAGE_DEALT", playerIndex: pi, payload: { amount: 1, attackerInstanceId: battle.attackerInstanceId, attackerType: attackerData?.type?.toUpperCase() === "LEADER" ? "LEADER" : "CHARACTER" } });

          // Emit when life just hit zero (trigger for cards like OP05)
          if (nextState.players[inactiveIdx].life.length === 0) {
            events.push({ type: "LIFE_COUNT_BECOMES_ZERO", playerIndex: inactiveIdx, payload: {} });
          }

          if (isBanish) {
            // Banish: life card goes to trash, no Trigger (rules §10-1-3-1)
            const trashCard = {
              instanceId: lifeCard.instanceId,
              cardId: lifeCard.cardId,
              zone: "TRASH" as const,
              state: "ACTIVE" as const,
              attachedDon: [],
              turnPlayed: null,
              controller: inactiveIdx,
              owner: inactiveIdx,
            };
            const newPlayers = [...nextState.players] as typeof nextState.players;
            newPlayers[inactiveIdx] = {
              ...newPlayers[inactiveIdx],
              trash: [trashCard, ...newPlayers[inactiveIdx].trash],
            };
            nextState = { ...nextState, players: newPlayers };
          } else if (hasTrigger(cardDb.get(lifeCard.cardId) ?? { keywords: { trigger: false } } as CardData)) {
            // Has [Trigger] — pause for defending player's choice (rules §10-1-5-1)
            const updatedBattle = {
              ...nextState.turn.battle!,
              pendingTriggerLifeCard: lifeCard,
            };
            nextState = {
              ...nextState,
              turn: { ...nextState.turn, battle: updatedBattle as typeof battle },
            };
            events.push({ type: "TRIGGER_ACTIVATED", playerIndex: inactiveIdx, payload: { cardId: lifeCard.cardId } });
            return { state: nextState, events, damagedPlayerIndex };
          } else {
            // Normal: add life card to hand
            const handCard = {
              instanceId: lifeCard.instanceId,
              cardId: lifeCard.cardId,
              zone: "HAND" as const,
              state: "ACTIVE" as const,
              attachedDon: [],
              turnPlayed: null,
              controller: inactiveIdx,
              owner: inactiveIdx,
            };
            const newPlayers = [...nextState.players] as typeof nextState.players;
            newPlayers[inactiveIdx] = {
              ...newPlayers[inactiveIdx],
              hand: [...newPlayers[inactiveIdx].hand, handCard],
            };
            nextState = { ...nextState, players: newPlayers };
            events.push({ type: "CARD_ADDED_TO_HAND_FROM_LIFE", playerIndex: inactiveIdx, payload: { cardId: lifeCard.cardId, cardInstanceId: lifeCard.instanceId } });
          }
        }
      } else if (targetFound.card.zone === "CHARACTER") {
        // Emit COMBAT_VICTORY — attacker won against a character
        events.push({ type: "COMBAT_VICTORY", playerIndex: pi, payload: { cardInstanceId: battle.attackerInstanceId, targetInstanceId } });

        // Check for replacement effects before KO
        const replacement = checkReplacementForKO(nextState, targetInstanceId, "battle", pi as 0 | 1, cardDb);
        if (replacement.pendingPrompt) {
          events.push(...replacement.events);
          return { state: replacement.state, events, damagedPlayerIndex, pendingPrompt: replacement.pendingPrompt };
        }
        if (replacement.replaced) {
          nextState = replacement.state;
          events.push(...replacement.events);
        } else {
          // KO the character — use koCharacter() to preserve instanceId for ON_KO triggers
          const preKODonCount = targetFound.card.attachedDon.length;
          const koResult = koCharacter(nextState, targetInstanceId, pi as 0 | 1);
          if (koResult) {
            nextState = koResult.state;
            for (const ev of koResult.events) {
              if (ev.type === "CARD_KO" && ev.payload) {
                events.push({
                  type: "CARD_KO",
                  playerIndex: ev.playerIndex,
                  payload: { ...ev.payload, cause: "BATTLE", preKO_donCount: preKODonCount },
                });
              } else {
                events.push(ev);
              }
            }
          }
        }
      }
    }
  }
  // Attacker power < defender power: nothing happens

  // End of Battle
  nextState = endBattle(nextState, events);

  return { state: nextState, events, damagedPlayerIndex };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setCardState(
  state: GameState,
  playerIndex: 0 | 1,
  instanceId: string,
  cardState: "ACTIVE" | "RESTED",
): GameState {
  const player = state.players[playerIndex];
  const update = (card: { instanceId: string; state: string }) =>
    card.instanceId === instanceId ? { ...card, state: cardState } : card;

  const newPlayers = [...state.players] as typeof state.players;
  newPlayers[playerIndex] = {
    ...player,
    leader: update(player.leader) as typeof player.leader,
    characters: player.characters.map((c) => c ? update(c) as typeof c : null),
  };
  return { ...state, players: newPlayers };
}

function endBattle(state: GameState, events: PendingEvent[]): GameState {
  // Expire battle-scoped effects before clearing battle state
  const battleId = state.turn.battle?.battleId;
  if (battleId) {
    state = expireBattleEffects(state, battleId);
  }

  events.push({ type: "BATTLE_RESOLVED", playerIndex: state.turn.activePlayerIndex });
  events.push({
    type: "PHASE_CHANGED",
    playerIndex: state.turn.activePlayerIndex,
    payload: { from: "DAMAGE_STEP", to: "MAIN" },
  });

  return {
    ...state,
    turn: {
      ...state.turn,
      battle: null,
      battleSubPhase: null,
    },
  };
}
