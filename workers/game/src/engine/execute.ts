/**
 * Step 4: Execute
 *
 * Produces a new GameState snapshot from a validated GameAction.
 * Also returns metadata for step 5 (events to emit) and step 7 (defeat context).
 */

import type { CardData, DonInstance, GameAction, GameEventType, GameState, LifeCard } from "../types.js";
import {
  getActivePlayerIndex,
  getInactivePlayerIndex,
  findCardInState,
  moveCard,
  removeTopLifeCard,
  placeDonFromDeck,
  restDonForCost,
  attachDon,
  returnAttachedDonToCostArea,
  activateAllRested,
} from "./state.js";
import { getEffectiveCost, getEffectivePower, getBattleDefenderPower } from "./modifiers.js";
import { hasDoubleAttack, hasBanish, hasTrigger } from "./keywords.js";
import { nanoid } from "../util/nanoid.js";

export interface PendingEvent {
  type: GameEventType;
  playerIndex?: 0 | 1;
  payload?: Record<string, unknown>;
}

export interface ExecuteResult {
  state: GameState;
  events: PendingEvent[];
  damagedPlayerIndex?: 0 | 1; // set when a leader takes damage (for defeat check)
}

export function execute(
  state: GameState,
  action: GameAction,
  cardDb: Map<string, CardData>,
): ExecuteResult {
  switch (action.type) {
    case "ADVANCE_PHASE":
      return executeAdvancePhase(state, cardDb);
    case "PLAY_CARD":
      return executePlayCard(state, action.cardInstanceId, action.position, cardDb);
    case "ATTACH_DON":
      return executeAttachDon(state, action.targetInstanceId, action.count);
    case "DECLARE_ATTACK":
      return executeDeclareAttack(state, action.attackerInstanceId, action.targetInstanceId, cardDb);
    case "DECLARE_BLOCKER":
      return executeDeclareBlocker(state, action.blockerInstanceId, cardDb);
    case "USE_COUNTER":
      return executeUseCounter(state, action.cardInstanceId, action.counterTargetInstanceId, cardDb);
    case "USE_COUNTER_EVENT":
      return executeUseCounterEvent(state, action.cardInstanceId, cardDb);
    case "REVEAL_TRIGGER":
      return executeRevealTrigger(state, action.reveal, cardDb);
    case "PASS":
      return executePass(state, cardDb);
    case "CONCEDE":
      return executeConcede(state);
    case "MANUAL_EFFECT":
      return executeManualEffect(state, action.description);
    case "ACTIVATE_EFFECT":
      return { state, events: [] }; // M4
  }
}

// ─── Phase Transitions ────────────────────────────────────────────────────────

function executeAdvancePhase(state: GameState, cardDb: Map<string, CardData>): ExecuteResult {
  const events: PendingEvent[] = [];
  const pi = getActivePlayerIndex(state);
  const { phase, number: turnNumber } = state.turn;

  let nextState = state;

  switch (phase) {
    case "REFRESH": {
      // Step 1: "until start of your next turn" effects expire (M4)
      // Step 2: "at start of your/opponent's turn" auto effects (M4)
      // Step 3: Return attached DON!! to cost area (rested)
      nextState = returnAttachedDonToCostArea(nextState, pi);
      events.push({ type: "DON_DETACHED", playerIndex: pi });
      // Step 4: Activate all rested cards
      nextState = activateAllRested(nextState, pi);
      // Advance to DRAW
      nextState = { ...nextState, turn: { ...nextState.turn, phase: "DRAW" } };
      events.push({ type: "PHASE_CHANGED", playerIndex: pi, payload: { from: "REFRESH", to: "DRAW" } });
      break;
    }

    case "DRAW": {
      // Draw 1 card (except first player turn 1)
      const isFirstPlayerTurnOne = turnNumber === 1 && pi === 0;
      if (!isFirstPlayerTurnOne) {
        const drawn = nextState.players[pi].deck[0];
        if (drawn) {
          nextState = moveCard(nextState, drawn.instanceId, "HAND");
          events.push({ type: "CARD_DRAWN", playerIndex: pi, payload: { cardId: drawn.cardId } });
        }
        // Deck-out is checked in step 7 (defeat.ts)
      }
      nextState = { ...nextState, turn: { ...nextState.turn, phase: "DON" } };
      events.push({ type: "PHASE_CHANGED", playerIndex: pi, payload: { from: "DRAW", to: "DON" } });
      break;
    }

    case "DON": {
      // Place DON!! cards: 2 normally, 1 on first player's first turn
      const donCount = (turnNumber === 1 && pi === 0) ? 1 : 2;
      nextState = placeDonFromDeck(nextState, pi, donCount);
      events.push({
        type: "DON_PLACED_ON_FIELD",
        playerIndex: pi,
        payload: { count: Math.min(donCount, state.players[pi].donDeck.length) },
      });
      nextState = { ...nextState, turn: { ...nextState.turn, phase: "MAIN" } };
      events.push({ type: "PHASE_CHANGED", playerIndex: pi, payload: { from: "DON", to: "MAIN" } });
      break;
    }

    case "MAIN": {
      // Advance to END
      nextState = { ...nextState, turn: { ...nextState.turn, phase: "END" } };
      events.push({ type: "PHASE_CHANGED", playerIndex: pi, payload: { from: "MAIN", to: "END" } });
      // Run end-phase sequence automatically
      const endResult = runEndPhase(nextState, pi, cardDb);
      nextState = endResult.state;
      events.push(...endResult.events);
      break;
    }

    case "END": {
      // Should not be reached via ADVANCE_PHASE (end phase runs automatically)
      break;
    }
  }

  return { state: nextState, events };
}

function runEndPhase(state: GameState, pi: 0 | 1, _cardDb: Map<string, CardData>): ExecuteResult {
  const events: PendingEvent[] = [];

  // Steps 1 & 2: [End of Your Turn] / [End of Your Opponent's Turn] effects (M4)

  // Steps 3-6: Expiry waves (M4 — no active effects in M3)

  // Turn passes to opponent
  const nextPlayerIndex: 0 | 1 = pi === 0 ? 1 : 0;
  const nextTurnNumber = nextPlayerIndex === 0 ? state.turn.number + 1 : state.turn.number;

  events.push({ type: "TURN_ENDED", playerIndex: pi });

  const nextState: GameState = {
    ...state,
    turn: {
      number: nextTurnNumber,
      activePlayerIndex: nextPlayerIndex,
      phase: "REFRESH",
      battleSubPhase: null,
      battle: null,
      oncePerTurnUsed: {},
      actionsPerformedThisTurn: [],
    },
  };

  events.push({ type: "TURN_STARTED", playerIndex: nextPlayerIndex });
  events.push({
    type: "PHASE_CHANGED",
    playerIndex: nextPlayerIndex,
    payload: { from: "END", to: "REFRESH" },
  });

  return { state: nextState, events };
}

// ─── Play Card ────────────────────────────────────────────────────────────────

function executePlayCard(
  state: GameState,
  cardInstanceId: string,
  _position: number | undefined,
  cardDb: Map<string, CardData>,
): ExecuteResult {
  const events: PendingEvent[] = [];
  const pi = getActivePlayerIndex(state);

  const found = findCardInState(state, cardInstanceId)!;
  const cardData = cardDb.get(found.card.cardId)!;
  const cost = getEffectiveCost(cardData);

  // Pay cost: rest DON!!
  let nextState = restDonForCost(state, pi, cost)!;

  if (cardData.type === "Character") {
    // Handle 5-card overflow: if character area already has 5, caller should have
    // prompted for a trash-target. For now, if overflow occurs, discard oldest.
    // Full overflow prompt is handled at the WebSocket layer before the action is sent.
    if (nextState.players[pi].characters.length >= 5) {
      const oldest = nextState.players[pi].characters[0];
      nextState = moveCard(nextState, oldest.instanceId, "TRASH");
      events.push({ type: "CARD_TRASHED", playerIndex: pi, payload: { cardId: oldest.cardId, reason: "overflow" } });
    }

    nextState = moveCard(nextState, cardInstanceId, "CHARACTER");
    // Record turn played for Rush/summoning sickness
    const charIdx = nextState.players[pi].characters.findIndex(
      (c) => c.cardId === found.card.cardId && c.turnPlayed === null,
    );
    if (charIdx !== -1) {
      const chars = [...nextState.players[pi].characters];
      chars[charIdx] = { ...chars[charIdx], turnPlayed: nextState.turn.number };
      const newPlayers = [...nextState.players] as [typeof nextState.players[0], typeof nextState.players[1]];
      newPlayers[pi] = { ...newPlayers[pi], characters: chars };
      nextState = { ...nextState, players: newPlayers };
    }

    events.push({ type: "CARD_PLAYED", playerIndex: pi, payload: { cardId: cardData.id, zone: "CHARACTER" } });

  } else if (cardData.type === "Event") {
    // Trash the event, then the effect fires (MANUAL_EFFECT in M3)
    nextState = moveCard(nextState, cardInstanceId, "TRASH");
    events.push({ type: "CARD_PLAYED", playerIndex: pi, payload: { cardId: cardData.id, zone: "TRASH" } });

  } else if (cardData.type === "Stage") {
    // Trash existing stage first
    if (nextState.players[pi].stage) {
      const existingStage = nextState.players[pi].stage!;
      nextState = moveCard(nextState, existingStage.instanceId, "TRASH");
      events.push({ type: "CARD_TRASHED", playerIndex: pi, payload: { cardId: existingStage.cardId, reason: "stage_replaced" } });
    }
    nextState = moveCard(nextState, cardInstanceId, "STAGE");
    events.push({ type: "CARD_PLAYED", playerIndex: pi, payload: { cardId: cardData.id, zone: "STAGE" } });
  }

  return { state: nextState, events };
}

// ─── Attach DON!! ─────────────────────────────────────────────────────────────

function executeAttachDon(
  state: GameState,
  targetInstanceId: string,
  count: number,
): ExecuteResult {
  const events: PendingEvent[] = [];
  const pi = getActivePlayerIndex(state);
  let nextState = state;

  for (let i = 0; i < count; i++) {
    const result = attachDon(nextState, pi, targetInstanceId);
    if (!result) break;
    nextState = result;
  }

  events.push({ type: "DON_GIVEN_TO_CARD", playerIndex: pi, payload: { targetInstanceId, count } });
  return { state: nextState, events };
}

// ─── Declare Attack ───────────────────────────────────────────────────────────

function executeDeclareAttack(
  state: GameState,
  attackerInstanceId: string,
  targetInstanceId: string,
  cardDb: Map<string, CardData>,
): ExecuteResult {
  const events: PendingEvent[] = [];
  const pi = getActivePlayerIndex(state);

  // Rest the attacker
  let nextState = setCardState(state, pi, attackerInstanceId, "RESTED");

  const attackerFound = findCardInState(nextState, attackerInstanceId)!;
  const attackerData = cardDb.get(attackerFound.card.cardId)!;
  const attackerPower = getEffectivePower(attackerFound.card, attackerData, nextState);

  const defenderFound = findCardInState(nextState, targetInstanceId)!;
  const defenderData = cardDb.get(defenderFound.card.cardId)!;
  const defenderPower = getEffectivePower(defenderFound.card, defenderData, nextState);

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

  // [When Attacking] and [On Your Opponent's Attack] fire here in M4
  // Bail-out check is done after this event in the phase resolver

  // Advance to BLOCK_STEP (bail-out would skip to END_OF_BATTLE — handled in the DO)
  nextState = { ...nextState, turn: { ...nextState.turn, battleSubPhase: "BLOCK_STEP" } };
  events.push({ type: "PHASE_CHANGED", playerIndex: pi, payload: { from: "ATTACK_STEP", to: "BLOCK_STEP" } });

  return { state: nextState, events };
}

// ─── Declare Blocker ──────────────────────────────────────────────────────────

function executeDeclareBlocker(
  state: GameState,
  blockerInstanceId: string,
  cardDb: Map<string, CardData>,
): ExecuteResult {
  const events: PendingEvent[] = [];
  const inactiveIdx = getInactivePlayerIndex(state);

  // Rest the blocker
  let nextState = setCardState(state, inactiveIdx, blockerInstanceId, "RESTED");

  // Replace the target in BattleContext
  const battle = nextState.turn.battle!;
  const updatedBattle = { ...battle, targetInstanceId: blockerInstanceId, blockerActivated: true };

  // Recalculate defender power with new target
  const blockerFound = findCardInState(nextState, blockerInstanceId)!;
  const blockerData = cardDb.get(blockerFound.card.cardId)!;
  const blockerPower = getEffectivePower(blockerFound.card, blockerData, nextState);

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

// ─── Pass ─────────────────────────────────────────────────────────────────────

function executePass(state: GameState, cardDb: Map<string, CardData>): ExecuteResult {
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
    return { state: nextState, events, damagedPlayerIndex: dmgResult.damagedPlayerIndex };
  }

  return { state: nextState, events };
}

// ─── Symbol Counter ───────────────────────────────────────────────────────────

function executeUseCounter(
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

function executeUseCounterEvent(
  state: GameState,
  cardInstanceId: string,
  cardDb: Map<string, CardData>,
): ExecuteResult {
  const events: PendingEvent[] = [];
  const inactiveIdx = getInactivePlayerIndex(state);

  const found = findCardInState(state, cardInstanceId)!;
  const cardData = cardDb.get(found.card.cardId)!;
  const cost = getEffectiveCost(cardData);

  // Pay cost
  let nextState = restDonForCost(state, inactiveIdx, cost)!;
  // Trash the event
  nextState = moveCard(nextState, cardInstanceId, "TRASH");

  events.push({
    type: "COUNTER_USED",
    playerIndex: inactiveIdx,
    payload: { cardId: cardData.id, type: "event" },
  });

  // Counter event effect is manual in M3 (MANUAL_EFFECT to follow if needed)
  return { state: nextState, events };
}

// ─── Damage Step ─────────────────────────────────────────────────────────────

function executeDamageStep(
  state: GameState,
  cardDb: Map<string, CardData>,
): ExecuteResult & { damagedPlayerIndex?: 0 | 1 } {
  const events: PendingEvent[] = [];
  const pi = getActivePlayerIndex(state);
  const inactiveIdx = getInactivePlayerIndex(state);
  const battle = state.turn.battle!;
  let nextState = state;
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

        damagedPlayerIndex = inactiveIdx;

        // Check life-out defeat BEFORE moving life cards (rules §7-1-4-1-1-1)
        if (nextState.players[inactiveIdx].life.length === 0) {
          // Defeat detected — step 7 will handle it
          events.push({ type: "DAMAGE_DEALT", playerIndex: pi, payload: { target: "leader", amount: damageCount } });
        } else {
          // Process each damage point
          for (let i = 0; i < damageCount; i++) {
            const result = removeTopLifeCard(nextState, inactiveIdx);
            if (!result) break; // no more life

            const { lifeCard, state: stateAfterRemoval } = result;
            nextState = stateAfterRemoval;

            events.push({ type: "DAMAGE_DEALT", playerIndex: pi, payload: { amount: 1 } });

            if (isBanish) {
              // Banish: life card goes to trash, no Trigger
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
              // Has [Trigger] — DO will send a prompt to the defending player.
              // We store the pending life card in battle context and pause.
              // The REVEAL_TRIGGER action continues from here.
              const updatedBattle = {
                ...nextState.turn.battle!,
                pendingTriggerLifeCard: lifeCard,
              };
              nextState = {
                ...nextState,
                turn: { ...nextState.turn, battle: updatedBattle as typeof battle },
              };
              events.push({ type: "TRIGGER_ACTIVATED", playerIndex: inactiveIdx, payload: { cardId: lifeCard.cardId } });
              // Pause — waiting for REVEAL_TRIGGER action
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
              events.push({ type: "CARD_ADDED_TO_HAND_FROM_LIFE", playerIndex: inactiveIdx, payload: { cardId: lifeCard.cardId } });
            }
          }
        }
      } else if (targetFound.card.zone === "CHARACTER") {
        // KO the character
        nextState = moveCard(nextState, targetInstanceId, "TRASH");
        events.push({ type: "CARD_KO", playerIndex: pi, payload: { instanceId: targetInstanceId, cause: "battle" } });
        // [On K.O.] fires in M4
      }
    }
  }
  // Attacker power < defender power: nothing happens

  // End of Battle
  nextState = endBattle(nextState, events);

  return { state: nextState, events, damagedPlayerIndex };
}

// ─── Reveal Trigger ───────────────────────────────────────────────────────────

function executeRevealTrigger(
  state: GameState,
  reveal: boolean,
  _cardDb: Map<string, CardData>,
): ExecuteResult {
  const events: PendingEvent[] = [];
  const inactiveIdx = getInactivePlayerIndex(state);
  let nextState = state;

  const battle = state.turn.battle as typeof state.turn.battle & { pendingTriggerLifeCard?: LifeCard };
  if (!battle?.pendingTriggerLifeCard) return { state, events };

  const lifeCard = battle.pendingTriggerLifeCard;

  if (reveal) {
    // Activate trigger — card goes to trash after (rules §10-1-5-3)
    // In M3 the trigger effect text is manual; card goes to trash
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
    events.push({ type: "CARD_ADDED_TO_HAND_FROM_LIFE", playerIndex: inactiveIdx, payload: { cardId: lifeCard.cardId } });
  }

  // Clear pending trigger and end battle
  const cleanedBattle = { ...battle };
  delete (cleanedBattle as Partial<typeof cleanedBattle & { pendingTriggerLifeCard?: LifeCard }>).pendingTriggerLifeCard;
  nextState = { ...nextState, turn: { ...nextState.turn, battle: cleanedBattle } };
  nextState = endBattle(nextState, events);

  return { state: nextState, events };
}

// ─── Concede ──────────────────────────────────────────────────────────────────

function executeConcede(state: GameState): ExecuteResult {
  const pi = getActivePlayerIndex(state);
  const winner: 0 | 1 = pi === 0 ? 1 : 0;
  const nextState: GameState = {
    ...state,
    status: "FINISHED",
    winner,
    winReason: `Player ${pi + 1} conceded`,
  };
  return {
    state: nextState,
    events: [{ type: "GAME_OVER", playerIndex: pi, payload: { winner, reason: "concede" } }],
  };
}

// ─── Manual Effect ────────────────────────────────────────────────────────────

function executeManualEffect(state: GameState, _description: string): ExecuteResult {
  // No state change — just logged for the game record
  return { state, events: [] };
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
    characters: player.characters.map((c) => update(c) as typeof c),
  };
  return { ...state, players: newPlayers };
}

function endBattle(state: GameState, events: PendingEvent[]): GameState {
  // End of Battle: clear battle context, expire THIS_BATTLE effects (M4), return to MAIN
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

// Needed for DON!! attachment type — re-export from state
export type { DonInstance };
