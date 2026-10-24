/**
 * Step 1: Action Validator
 *
 * Returns an error string if the action is illegal, null if legal.
 * Checks phase compatibility, resource availability, and targeting rules.
 */

import { meetsAttachedDonRequirement } from "./attached-don.js";
import type { CardData, GameAction, GameState } from "../types.js";
import { getActivePlayer, findCardInState } from "./state.js";
import {
  getEffectiveCost,
  isCardNegated,
  hasGrantedKeyword,
  hasRemovedKeyword,
} from "./modifiers.js";
import { getEffectiveCounterValue } from "./counter-value.js";
import { canAttackThisTurn, canAttackLeader, hasEffectiveKeyword } from "./keywords.js";
import { isCostSequencePayable } from "./effect-resolver/cost-handler.js";
import { activationProhibitionVeto } from "./prohibitions.js";
import { isOncePerTurnBlock, type Cost } from "./effect-types.js";
import { evaluateCondition } from "./conditions.js";

export function validate(
  state: GameState,
  action: GameAction,
  cardDb: Map<string, CardData>,
  actingPlayerIndex: 0 | 1,
): string | null {
  if (state.status === "FINISHED") return "Game is already over";
  if (
    state.pendingPrompt &&
    ["DECLARE_BLOCKER", "USE_COUNTER", "USE_COUNTER_EVENT"].includes(
      action.type
    )
  )
    return "A player decision must finish before another game action";

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
      return validateRevealTrigger();

    case "PASS":
      return validatePass(state);

    case "ACTIVATE_EFFECT":
      return validateActivateEffect(
        state,
        action.cardInstanceId,
        action.effectId,
        cardDb,
        actingPlayerIndex,
      );

    case "CONCEDE":
      return null; // always legal

    case "MANUAL_EFFECT":
      return validateManualEffect(state);
    // Prompt responses and UNDO — intercepted by GameSession before the pipeline runs
    case "SELECT_TARGET":
    case "REDISTRIBUTE_DON":
    case "PLAYER_CHOICE":
    case "ARRANGE_TOP_CARDS":
    case "UNDO":
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
    const canAttackActive =
      hasGrantedKeyword(
        attackerFound.card,
        "CAN_ATTACK_ACTIVE",
        state,
        cardDb,
      ) &&
      !hasRemovedKeyword(
        attackerFound.card,
        "CAN_ATTACK_ACTIVE",
        state,
        cardDb,
      );
    if (targetFound.card.state !== "RESTED" && !canAttackActive) {
      return "Can only attack rested Characters";
    }
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
  if (state.turn.battle?.blockerActivated || state.turn.battle?.blockerLocked)
    return "Only one Blocker can be declared per battle (§7-1-2-1)";

  const inactiveIdx = state.turn.activePlayerIndex === 0 ? 1 : 0;
  const found = findCardInState(state, blockerInstanceId);
  if (!found) return `Blocker ${blockerInstanceId} not found`;
  if (found.playerIndex !== inactiveIdx) return "Can only declare your own card as Blocker";
  // §10-1-4-1: [Blocker] is a property of "this card", not of Characters
  // only. A Leader can hold an effective [Blocker] when an effect grants it
  // (OP16-048 on an all-names Leader — qa_op16.md / qa_op17.md p.9).
  if (found.card.zone !== "CHARACTER" && found.card.zone !== "LEADER") {
    return "Blocker must be a Leader or Character";
  }
  if (found.card.state !== "ACTIVE") return "Blocker must be active";

  const cardData = cardDb.get(found.card.cardId);
  if (!cardData) return "Blocker card data not found";
  // OPT-253: printed [Blocker] is suppressed while the Character is negated;
  // externally granted [Blocker] (via GRANT_KEYWORD) still applies.
  const hasBlocker =
    hasEffectiveKeyword(found.card, cardData, "BLOCKER", state, cardDb) &&
    !hasRemovedKeyword(found.card, "BLOCKER", state, cardDb);
  if (!hasBlocker) return "This card does not have [Blocker]";

  if (state.turn.battle) {
    const attackerFound = findCardInState(state, state.turn.battle.attackerInstanceId);
    if (attackerFound) {
      const attackerData = cardDb.get(attackerFound.card.cardId);
      const attackerUnblockable =
        (attackerData
          ? hasEffectiveKeyword(
              attackerFound.card,
              attackerData,
              "UNBLOCKABLE",
              state,
              cardDb,
            )
          : false) &&
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
  // OPT-400: COUNTER_GRANT rule mods can give counterless cards a value.
  if (getEffectiveCounterValue(found.card, cardData, state, cardDb) <= 0) {
    return "This card has no counter value";
  }

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
  const cost = getEffectiveCost(cardData, state, cardInstanceId, cardDb, true, undefined, "USE_COUNTER_EVENT");
  const player = state.players[inactiveIdx];
  const activeDon = player.donCostArea.filter((d) => d.state === "ACTIVE" && !d.attachedTo).length;
  if (activeDon < cost) return `Not enough active DON!! to pay counter event cost (need ${cost})`;

  return null;
}

function validateRevealTrigger(): string | null {
  // OPT-963: a Trigger window is a damage frame that owns its REVEAL_TRIGGER
  // prompt; the reply is a prompt response, not a pipeline action.
  return "Trigger reveals answer the pending prompt";
}

function validatePass(state: GameState): string | null {
  const { battleSubPhase } = state.turn;
  if (battleSubPhase !== "BLOCK_STEP" && battleSubPhase !== "COUNTER_STEP") {
    return "Pass is only valid during Block Step or Counter Step";
  }
  return null;
}

export function getActivateEffectTimingError(state: GameState): string | null {
  if (state.turn.phase !== "MAIN") return "Effects can only be activated during Main Phase";
  if (state.turn.battleSubPhase !== null) return "[Activate: Main] cannot be used during battle";
  return null;
}

/**
 * OPT-864: may the activation cost be paid in full, in printed order?
 *
 * Rule 8-3-1-1 pays the costs top to bottom, and rule 8-3-1-3 makes the cost
 * all-or-nothing, so a later cost is judged on the state after the earlier
 * ones. Checking each cost alone against the pre-cost state falsely rejects a
 * sequence in which an earlier cost enables a later one (for example, a hand
 * trash that fills the trash a later trash-to-deck cost needs).
 *
 * No `isCostPayable` pre-filter runs here. The sequential evaluator already
 * rejects on its first unpayable step, and a per-cost check on the initial
 * state is sound only for index 0. Errors propagate (see
 * `isCostSequencePayable`).
 */
export function areEffectCostsPayable(
  state: GameState,
  costs: readonly Cost[],
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  sourceCardInstanceId: string,
): boolean {
  return isCostSequencePayable(state, costs, controller, cardDb, sourceCardInstanceId);
}

function validateActivateEffect(
  state: GameState,
  cardInstanceId: string,
  effectId: string,
  cardDb: Map<string, CardData>,
  actingPlayerIndex: 0 | 1,
): string | null {
  const timingError = getActivateEffectTimingError(state);
  if (timingError) return timingError;

  const found = findCardInState(state, cardInstanceId);
  if (!found) return "Not your card";
  if (found.playerIndex !== actingPlayerIndex) return "Not your card";

  const cardData = cardDb.get(found.card.cardId);
  const schema = cardData?.effectSchema;
  const block = schema?.effects.find((b) => b.id === effectId);
  if (!block) return "Effect not found on this card";

  // Match executeActivateEffect: Main/Counter Events use separate paths
  // (rules 10-2-3/10-2-4), including Events with combined Main/Counter triggers.
  if (
    block.category !== "activate" ||
    !block.trigger || !("keyword" in block.trigger) ||
    block.trigger.keyword !== "ACTIVATE_MAIN"
  ) {
    return "Only Activate: Main effects can be activated with this action";
  }

  // Rules 2-8-2 and 10-2-2: Activate: Main uses a source on the field.
  if (
    found.card.zone !== "LEADER" &&
    found.card.zone !== "CHARACTER" &&
    found.card.zone !== "STAGE"
  ) {
    return "Card must be on the field to activate this effect";
  }

  // Rule 8-2-1-1: an invalid effect cannot activate or pay its cost.
  if (isCardNegated(found.card, state, cardDb)) return "Card effects are negated";

  if (!meetsAttachedDonRequirement(found.card, block.trigger)) {
    return "Attached DON!! requirement is not met";
  }

  // OPT-864 (Decision 11, rule 1-3-3): an activation-time prohibition vetoes
  // the activation before any cost is judged or paid.
  const prohibited = activationProhibitionVeto(
    state,
    { type: "ACTIVATE_EFFECT", cardInstanceId, effectId },
    cardDb,
    actingPlayerIndex,
  );
  if (prohibited) return prohibited;

  // Rule 10-2-13-3: a used block cannot activate or pay its cost again.
  if (
    isOncePerTurnBlock(block) &&
    state.turn.oncePerTurnUsed[block.id]?.includes(cardInstanceId)
  ) {
    return "Effect has already been used this turn";
  }

  const controller = found.playerIndex;
  if (
    block.costs?.length &&
    !areEffectCostsPayable(state, block.costs, controller, cardDb, cardInstanceId)
  ) {
    return "Cost cannot be paid";
  }
  if (
    block.conditions &&
    !evaluateCondition(state, block.conditions, {
      sourceCardInstanceId: cardInstanceId,
      controller,
      cardDb,
    })
  ) {
    return "Effect conditions are not met";
  }
  return null;
}

function validateManualEffect(state: GameState): string | null {
  if (state.turn.phase !== "MAIN") return "Manual effects can only be announced during Main Phase";
  return null;
}
