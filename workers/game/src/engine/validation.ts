/**
 * Step 1: Action Validator
 *
 * Returns an error string if the action is illegal, null if legal.
 * Checks phase compatibility, resource availability, and targeting rules.
 */

import type { CardData, GameAction, GameState } from "../types.js";
import type { EffectSchema } from "./effect-types.js";
import { getActivePlayer, findCardInState } from "./state.js";
import { getEffectiveCost, hasGrantedKeyword, hasRemovedKeyword } from "./modifiers.js";
import { canAttackThisTurn, canAttackLeader } from "./keywords.js";
import { isCostPayable } from "./effect-resolver/cost-handler.js";

export function validate(
  state: GameState,
  action: GameAction,
  cardDb: Map<string, CardData>,
): string | null {
  if (state.status === "FINISHED") return "Game is already over";

  switch (action.type) {
    case "ADVANCE_PHASE":
      return validateAdvancePhase(state);

    case "PLAY_CARD":
      return validatePlayCard(state, action.cardInstanceId, cardDb, action.position);

    case "ATTACH_DON":
      return validateAttachDon(state, action.targetInstanceId, action.count);

    case "DECLARE_ATTACK":
      return validateDeclareAttack(state, action.attackerInstanceId, action.targetInstanceId, cardDb);

    case "DECLARE_BLOCKER":
      return validateDeclareBlocker(state, action.blockerInstanceId, cardDb);

    case "USE_COUNTER":
      return validateUseCounter(state, action.cardInstanceId, action.counterTargetInstanceId, cardDb);

    case "USE_COUNTER_EVENT":
      return validateUseCounterEvent(state, action.cardInstanceId, cardDb);

    case "REVEAL_TRIGGER":
      return validateRevealTrigger(state);

    case "PASS":
      return validatePass(state);

    case "ACTIVATE_EFFECT":
      return validateActivateEffect(state, action.cardInstanceId, action.effectId, cardDb);

    case "CONCEDE":
      return null; // always legal

    case "MANUAL_EFFECT":
      return validateManualEffect(state);
    // Prompt responses — intercepted by GameSession before the pipeline runs
    case "SELECT_TARGET":
    case "REDISTRIBUTE_DON":
    case "PLAYER_CHOICE":
    case "ARRANGE_TOP_CARDS":
      return null;
  }
}

// ─── Individual validators ────────────────────────────────────────────────────

function validateAdvancePhase(state: GameState): string | null {
  const { phase, battleSubPhase } = state.turn;
  // Can only advance phase when not inside a battle sub-state
  if (battleSubPhase !== null) {
    return `Cannot advance phase during battle (current sub-phase: ${battleSubPhase})`;
  }
  if (phase === "END") {
    return "Already in End phase"; // shouldn't normally be sent
  }
  return null;
}

function validatePlayCard(
  state: GameState,
  cardInstanceId: string,
  cardDb: Map<string, CardData>,
  position?: number,
): string | null {
  if (state.turn.phase !== "MAIN") return "Cards can only be played during the Main Phase";
  if (state.turn.battleSubPhase !== null) return "Cannot play cards during battle";

  const found = findCardInState(state, cardInstanceId);
  if (!found) return `Card ${cardInstanceId} not found`;
  if (found.playerIndex !== state.turn.activePlayerIndex) return "Not your card";
  if (found.card.zone !== "HAND") return "Card must be in hand to play";

  const cardData = cardDb.get(found.card.cardId);
  if (!cardData) return `Card data not found for ${found.card.cardId}`;
  if (cardData.type === "Leader") return "Leader cards cannot be played from hand";
  if (cardData.type === "Event" && !cardData.effectText.includes("[Main]")) {
    return "This Event cannot be played during the Main Phase";
  }

  // Character field overflow: must specify which slot to replace
  const player = getActivePlayer(state);
  const charCount = player.characters.filter(Boolean).length;
  if (cardData.type === "Character" && charCount >= 5) {
    if (position == null) return "Character area is full — choose a character to replace";
    if (position < 0 || position >= player.characters.length || player.characters[position] === null) return `Invalid position ${position}`;
  }

  const cost = getEffectiveCost(cardData, state, cardInstanceId, cardDb);
  const activeDon = player.donCostArea.filter((d) => d.state === "ACTIVE" && !d.attachedTo).length;

  if (activeDon < cost) {
    return `Not enough active DON!! (need ${cost}, have ${activeDon})`;
  }

  return null;
}

function validateAttachDon(
  state: GameState,
  targetInstanceId: string,
  count: number,
): string | null {
  if (state.turn.phase !== "MAIN") return "DON!! can only be attached during the Main Phase";
  if (state.turn.battleSubPhase !== null) return "Cannot attach DON!! during battle";
  if (count < 1) return "Must attach at least 1 DON!!";

  const player = getActivePlayer(state);
  const activeDon = player.donCostArea.filter((d) => d.state === "ACTIVE" && !d.attachedTo).length;
  if (activeDon < count) return `Not enough active DON!! (need ${count}, have ${activeDon})`;

  const found = findCardInState(state, targetInstanceId);
  if (!found) return `Target ${targetInstanceId} not found`;
  if (found.playerIndex !== state.turn.activePlayerIndex) return "Can only attach DON!! to your own cards";
  if (found.card.zone !== "LEADER" && found.card.zone !== "CHARACTER") {
    return "DON!! can only be attached to Leader or Character cards";
  }

  return null;
}

function validateDeclareAttack(
  state: GameState,
  attackerInstanceId: string,
  targetInstanceId: string,
  cardDb: Map<string, CardData>,
): string | null {
  if (state.turn.phase !== "MAIN") return "Battles can only happen during the Main Phase";
  if (state.turn.battleSubPhase !== null) return "Already in a battle";

  // §6-5-6-1: Neither player can battle on their first turn
  if (state.turn.number === 1) {
    return "Neither player can attack on their first turn";
  }

  const attackerFound = findCardInState(state, attackerInstanceId);
  if (!attackerFound) return `Attacker ${attackerInstanceId} not found`;
  if (attackerFound.playerIndex !== state.turn.activePlayerIndex) return "Not your card";
  if (attackerFound.card.zone !== "LEADER" && attackerFound.card.zone !== "CHARACTER") {
    return "Attacker must be a Leader or Character";
  }
  if (attackerFound.card.state !== "ACTIVE") return "Attacker must be active (not rested)";

  const attackerData = cardDb.get(attackerFound.card.cardId);
  if (!attackerData) return "Attacker card data not found";

  if (!canAttackThisTurn(attackerFound.card, attackerData, state, cardDb)) {
    return "This card cannot attack this turn";
  }

  const targetFound = findCardInState(state, targetInstanceId);
  if (!targetFound) return `Target ${targetInstanceId} not found`;
  if (targetFound.playerIndex === state.turn.activePlayerIndex) return "Cannot attack your own cards";

  if (targetFound.card.zone === "LEADER") {
    if (!canAttackLeader(attackerFound.card, attackerData, state, cardDb)) {
      return "This card can only attack Characters on the turn it is played";
    }
  } else if (targetFound.card.zone === "CHARACTER") {
    if (targetFound.card.state !== "RESTED") return "Can only attack rested Characters";
  } else {
    return "Invalid attack target";
  }

  return null;
}

function validateDeclareBlocker(
  state: GameState,
  blockerInstanceId: string,
  cardDb: Map<string, CardData>,
): string | null {
  if (state.turn.battleSubPhase !== "BLOCK_STEP") return "Blocker can only be declared during Block Step";

  // §7-1-2-1: Only one Blocker can be declared per battle
  if (state.turn.battle?.blockerActivated) return "Only one Blocker can be declared per battle (§7-1-2-1)";

  const inactiveIdx = state.turn.activePlayerIndex === 0 ? 1 : 0;
  const found = findCardInState(state, blockerInstanceId);
  if (!found) return `Blocker ${blockerInstanceId} not found`;
  if (found.playerIndex !== inactiveIdx) return "Can only declare your own card as Blocker";
  if (found.card.zone !== "CHARACTER") return "Blocker must be a Character";
  if (found.card.state !== "ACTIVE") return "Blocker must be active";

  const cardData = cardDb.get(found.card.cardId);
  if (!cardData) return "Blocker card data not found";
  const hasBlocker =
    (cardData.keywords.blocker || hasGrantedKeyword(found.card, "BLOCKER", state, cardDb)) &&
    !hasRemovedKeyword(found.card, "BLOCKER", state, cardDb);
  if (!hasBlocker) return "This card does not have [Blocker]";

  if (state.turn.battle) {
    const attackerFound = findCardInState(state, state.turn.battle.attackerInstanceId);
    if (attackerFound) {
      const attackerData = cardDb.get(attackerFound.card.cardId);
      const attackerUnblockable =
        (attackerData?.keywords.unblockable ||
          hasGrantedKeyword(attackerFound.card, "UNBLOCKABLE", state, cardDb)) &&
        !hasRemovedKeyword(attackerFound.card, "UNBLOCKABLE", state, cardDb);
      if (attackerUnblockable) return "Attacker has [Unblockable]";
    }
  }

  return null;
}

function validateUseCounter(
  state: GameState,
  cardInstanceId: string,
  counterTargetInstanceId: string,
  cardDb: Map<string, CardData>,
): string | null {
  if (state.turn.battleSubPhase !== "COUNTER_STEP") return "Counters can only be used during Counter Step";

  const inactiveIdx = state.turn.activePlayerIndex === 0 ? 1 : 0;
  const found = findCardInState(state, cardInstanceId);
  if (!found) return `Counter card ${cardInstanceId} not found`;
  if (found.playerIndex !== inactiveIdx) return "Can only use your own counter cards";
  if (found.card.zone !== "HAND") return "Counter card must be in hand";

  const cardData = cardDb.get(found.card.cardId);
  if (!cardData) return "Card data not found";
  if (cardData.type !== "Character") return "Symbol counters are on Character cards";
  if (!cardData.counter || cardData.counter <= 0) return "This card has no counter value";

  // Validate counter target (must be one of the inactive player's Leader or Characters)
  const targetFound = findCardInState(state, counterTargetInstanceId);
  if (!targetFound) return `Counter target ${counterTargetInstanceId} not found`;
  if (targetFound.playerIndex !== inactiveIdx) return "Counter target must be your own card";
  if (targetFound.card.zone !== "LEADER" && targetFound.card.zone !== "CHARACTER") {
    return "Counter target must be a Leader or Character";
  }

  return null;
}

function validateUseCounterEvent(
  state: GameState,
  cardInstanceId: string,
  cardDb: Map<string, CardData>,
): string | null {
  if (state.turn.battleSubPhase !== "COUNTER_STEP") return "Counter Events can only be used during Counter Step";

  const inactiveIdx = state.turn.activePlayerIndex === 0 ? 1 : 0;
  const found = findCardInState(state, cardInstanceId);
  if (!found) return `Counter Event ${cardInstanceId} not found`;
  if (found.playerIndex !== inactiveIdx) return "Can only use your own cards";
  if (found.card.zone !== "HAND") return "Counter Event must be in hand";

  const cardData = cardDb.get(found.card.cardId);
  if (!cardData) return "Card data not found";
  if (cardData.type !== "Event") return "Counter Events must be Event cards";
  if (!cardData.effectText.includes("[Counter]")) return "This Event does not have [Counter]";

  // Check cost
  const cost = getEffectiveCost(cardData, state, cardInstanceId, cardDb);
  const player = state.players[inactiveIdx];
  const activeDon = player.donCostArea.filter((d) => d.state === "ACTIVE" && !d.attachedTo).length;
  if (activeDon < cost) return `Not enough active DON!! to pay counter event cost (need ${cost})`;

  return null;
}

function validateRevealTrigger(state: GameState): string | null {
  if (state.turn.battleSubPhase !== "DAMAGE_STEP") return "Trigger reveal only during Damage Step";
  return null;
}

function validatePass(state: GameState): string | null {
  const { battleSubPhase } = state.turn;
  if (battleSubPhase !== "BLOCK_STEP" && battleSubPhase !== "COUNTER_STEP") {
    return "Pass is only valid during Block Step or Counter Step";
  }
  return null;
}

function validateActivateEffect(
  state: GameState,
  cardInstanceId: string,
  effectId: string,
  cardDb: Map<string, CardData>,
): string | null {
  if (state.turn.phase !== "MAIN") return "Effects can only be activated during Main Phase";
  if (state.turn.battleSubPhase !== null) return "[Activate: Main] cannot be used during battle";

  const found = findCardInState(state, cardInstanceId);
  if (!found) return null; // executeActivateEffect will no-op; keep behavior parity

  const cardData = cardDb.get(found.card.cardId);
  const schema = cardData?.effectSchema as EffectSchema | null | undefined;
  const block = schema?.effects.find((b) => b.id === effectId);
  if (!block || block.category !== "activate" || !block.costs?.length) return null;

  const controller = found.playerIndex;
  for (const cost of block.costs) {
    if (!isCostPayable(state, cost, controller, cardDb, cardInstanceId)) {
      return "Cost cannot be paid";
    }
  }
  return null;
}

function validateManualEffect(state: GameState): string | null {
  if (state.turn.phase !== "MAIN") return "Manual effects can only be announced during Main Phase";
  return null;
}
