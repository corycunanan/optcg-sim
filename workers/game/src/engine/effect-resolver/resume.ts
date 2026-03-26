/**
 * Resume logic — resumeEffectChain, resumeFromStack, processRemainingTriggers.
 */

import type {
  Action,
  Cost,
  EffectBlock,
  EffectResult,
} from "../effect-types.js";
import { getActionParams } from "../effect-types.js";
import type {
  CardData,
  CardInstance,
  GameState,
  GameAction,
  PendingEvent,
  ResumeContext,
  EffectStackFrame,
  QueuedTrigger,
} from "../../types.js";
import { popFrame, peekFrame, updateTopFrame } from "../effect-stack.js";
import { emitEvent } from "../events.js";
import type { EffectResolverResult } from "./types.js";
import { markOncePerTurnUsed, shuffleArray } from "./action-utils.js";
import { payCostsWithSelection, applyCostSelection } from "./cost-handler.js";
import { resolveEffect, executeActionChain, executeEffectAction } from "./resolver.js";
import { nanoid } from "../../util/nanoid.js";

// ─── resumeEffectChain ───────────────────────────────────────────────────────

export function resumeEffectChain(
  state: GameState,
  resumeCtx: ResumeContext,
  action: GameAction,
  cardDb: Map<string, CardData>,
): EffectResolverResult {
  const {
    effectSourceInstanceId,
    controller,
    pausedAction,
    remainingActions,
    resultRefs: resultRefsEntries,
    validTargets,
  } = resumeCtx;

  const resultRefs = new Map<string, EffectResult>(
    resultRefsEntries.map(([k, v]) => [k, v as EffectResult]),
  );
  const events: PendingEvent[] = [];
  let nextState = state;

  // Player skipped the optional effect
  if (action.type === "PASS") {
    return { state, events, resolved: false };
  }
  if (action.type === "PLAYER_CHOICE" && action.choiceId === "skip") {
    return { state, events, resolved: false };
  }

  // Resume from ARRANGE_TOP_CARDS response (SEARCH_DECK)
  if (action.type === "ARRANGE_TOP_CARDS" && pausedAction !== null && pausedAction.type === "SEARCH_DECK") {
    const sp = getActionParams(pausedAction, "SEARCH_DECK");
    const restDest = sp.rest_destination ?? "BOTTOM";

    const p = nextState.players[controller];
    const keptId = action.keptCardInstanceId;
    const ordered = action.orderedInstanceIds ?? [];

    const removedIds = new Set(ordered);
    if (keptId) removedIds.add(keptId);
    const restOfDeck = p.deck.filter((c) => !removedIds.has(c.instanceId));

    let newHand = [...p.hand];
    if (keptId) {
      const kept = p.deck.find((c) => c.instanceId === keptId);
      if (kept) {
        newHand = [...newHand, { ...kept, zone: "HAND" as const }];
        events.push({ type: "CARD_DRAWN", playerIndex: controller, payload: { cardId: kept.cardId, source: "search" } });
      }
    }

    const arrangedCards = ordered
      .map((id) => p.deck.find((c) => c.instanceId === id))
      .filter(Boolean) as CardInstance[];

    let newDeck: CardInstance[];
    if ((action.destination ?? restDest.toLowerCase()) === "bottom") {
      newDeck = [...restOfDeck, ...arrangedCards];
    } else {
      newDeck = [...arrangedCards, ...restOfDeck];
    }

    const newPlayers = [...nextState.players] as [typeof nextState.players[0], typeof nextState.players[1]];
    newPlayers[controller] = { ...p, deck: newDeck, hand: newHand };
    nextState = { ...nextState, players: newPlayers };
  }

  // Resume from ARRANGE_TOP_CARDS response (SEARCH_AND_PLAY — play to field instead of hand)
  if (action.type === "ARRANGE_TOP_CARDS" && pausedAction !== null && pausedAction.type === "SEARCH_AND_PLAY") {
    const sap = getActionParams(pausedAction, "SEARCH_AND_PLAY");
    const restDest = sap.rest_destination ?? "BOTTOM";
    const shuffleAfter = sap.shuffle_after ?? false;
    const searchFullDeck = sap.search_full_deck ?? false;
    const entryState = sap.entry_state ?? "ACTIVE";

    const p = nextState.players[controller];
    const keptId = action.keptCardInstanceId;
    const ordered = action.orderedInstanceIds ?? [];

    const removedIds = new Set(ordered);
    if (keptId) removedIds.add(keptId);
    const restOfDeck = p.deck.filter((c) => !removedIds.has(c.instanceId));

    // Play kept card to CHARACTER zone instead of hand
    let newCharacters = [...p.characters];
    if (keptId) {
      const kept = p.deck.find((c) => c.instanceId === keptId);
      if (kept) {
        const data = cardDb.get(kept.cardId);
        if (data && data.type.toUpperCase() === "CHARACTER") {
          const newChar: CardInstance = {
            ...kept,
            instanceId: nanoid(),
            zone: "CHARACTER",
            state: entryState,
            attachedDon: [],
            turnPlayed: nextState.turn.number,
            controller,
            owner: controller,
          };
          newCharacters = [...newCharacters, newChar];
          events.push({
            type: "CARD_PLAYED",
            playerIndex: controller,
            payload: { cardInstanceId: newChar.instanceId, cardId: kept.cardId, zone: "CHARACTER", source: "search_and_play" },
          });
        }
      }
    }

    // Arrange remaining cards
    const arrangedCards = ordered
      .map((id) => p.deck.find((c) => c.instanceId === id))
      .filter(Boolean) as CardInstance[];

    let newDeck: CardInstance[];
    if (searchFullDeck) {
      newDeck = restOfDeck;
    } else if ((action.destination ?? restDest.toLowerCase()) === "bottom") {
      newDeck = [...restOfDeck, ...arrangedCards];
    } else {
      newDeck = [...arrangedCards, ...restOfDeck];
    }

    if (shuffleAfter) {
      newDeck = shuffleArray(newDeck);
    }

    const newPlayers = [...nextState.players] as [typeof nextState.players[0], typeof nextState.players[1]];
    newPlayers[controller] = { ...p, deck: newDeck, characters: newCharacters };
    nextState = { ...nextState, players: newPlayers };
  }

  // Resume from PLAYER_CHOICE response
  if (action.type === "PLAYER_CHOICE" && pausedAction !== null &&
      (pausedAction.type === "PLAYER_CHOICE" || pausedAction.type === "OPPONENT_CHOICE")) {
    const options = (pausedAction.params?.options as Action[][]) ?? [];
    const chosenIndex = parseInt(action.choiceId, 10);
    const chosenBranch = options[chosenIndex];
    if (chosenBranch) {
      const branchResult = executeActionChain(
        nextState,
        chosenBranch,
        effectSourceInstanceId,
        controller,
        cardDb,
        resultRefs,
      );
      nextState = branchResult.state;
      events.push(...branchResult.events);

      if (branchResult.pendingPrompt) {
        return { state: nextState, events, resolved: false, pendingPrompt: branchResult.pendingPrompt };
      }
    }
  }

  // Resume from SELECT_TARGET response
  if (action.type === "SELECT_TARGET" && pausedAction !== null) {
    const selected = action.selectedInstanceIds ?? [];
    // Validate — all selected ids must be in validTargets
    if (selected.some((id) => !validTargets.includes(id))) {
      return { state, events, resolved: false };
    }

    const actionResult = executeEffectAction(
      nextState,
      pausedAction,
      effectSourceInstanceId,
      controller,
      cardDb,
      resultRefs,
      selected,
    );
    nextState = actionResult.state;
    events.push(...actionResult.events);

    if (actionResult.pendingPrompt) {
      return { state: nextState, events, resolved: false, pendingPrompt: actionResult.pendingPrompt };
    }
    if (actionResult.result && (pausedAction as any).result_ref) {
      resultRefs.set((pausedAction as any).result_ref as string, actionResult.result);
    }
  }

  // Execute remaining actions (also handles OPTIONAL_EFFECT resume where pausedAction is null)
  if (remainingActions.length > 0) {
    const chainResult = executeActionChain(
      nextState,
      remainingActions,
      effectSourceInstanceId,
      controller,
      cardDb,
      resultRefs,
    );
    nextState = chainResult.state;
    events.push(...chainResult.events);

    if (chainResult.pendingPrompt) {
      return { state: nextState, events, resolved: false, pendingPrompt: chainResult.pendingPrompt };
    }
  }

  return { state: nextState, events, resolved: true };
}

// ─── resumeFromStack ─────────────────────────────────────────────────────────

export function resumeFromStack(
  state: GameState,
  action: GameAction,
  cardDb: Map<string, CardData>,
): EffectResolverResult {
  const topFrame = peekFrame(state) as EffectStackFrame | null;
  if (!topFrame) {
    return { state, events: [], resolved: true };
  }

  const {
    sourceCardInstanceId,
    controller,
    phase,
  } = topFrame;

  const events: PendingEvent[] = [];
  let nextState = state;

  switch (phase) {
    // ── Optional effect: accept or decline ──────────────────────────────
    case "AWAITING_OPTIONAL_RESPONSE": {
      if (action.type === "PASS" || (action.type === "PLAYER_CHOICE" && action.choiceId === "skip")) {
        nextState = popFrame(nextState);
        return processRemainingTriggers(nextState, topFrame.pendingTriggers, cardDb);
      }

      const block = topFrame.effectBlock as EffectBlock;
      if (topFrame.costs.length > 0) {
        const costResult = payCostsWithSelection(
          nextState, topFrame.costs as Cost[], 0, controller, cardDb,
          sourceCardInstanceId, block,
        );

        if (costResult.cannotPay) {
          nextState = popFrame(costResult.state);
          if (block.flags?.once_per_turn) {
            nextState = markOncePerTurnUsed(nextState, block.id, sourceCardInstanceId);
          }
          return processRemainingTriggers(nextState, topFrame.pendingTriggers, cardDb);
        }

        nextState = costResult.state;
        events.push(...costResult.events);

        if (costResult.pendingPrompt) {
          const newTop = peekFrame(nextState) as EffectStackFrame;
          if (newTop && newTop.id !== topFrame.id) {
            nextState = popFrameById(nextState, topFrame.id);
            nextState = updateTopFrame(nextState, { pendingTriggers: topFrame.pendingTriggers });
          }
          return { state: nextState, events, resolved: false, pendingPrompt: costResult.pendingPrompt };
        }
      }

      nextState = popFrame(nextState);
      if (block.flags?.once_per_turn) {
        nextState = markOncePerTurnUsed(nextState, block.id, sourceCardInstanceId);
      }

      if (topFrame.remainingActions.length > 0) {
        const chainResult = executeActionChain(
          nextState,
          topFrame.remainingActions as Action[],
          sourceCardInstanceId,
          controller,
          cardDb,
        );
        nextState = chainResult.state;
        events.push(...chainResult.events);

        if (chainResult.pendingPrompt) {
          const newTop = peekFrame(nextState) as EffectStackFrame;
          if (newTop) {
            nextState = updateTopFrame(nextState, { pendingTriggers: topFrame.pendingTriggers });
          }
          return { state: nextState, events, resolved: false, pendingPrompt: chainResult.pendingPrompt };
        }
      }

      return processRemainingTriggers(nextState, topFrame.pendingTriggers, cardDb, events);
    }

    // ── Cost selection response ──────────────────────────────────────────
    case "AWAITING_COST_SELECTION": {
      if (action.type !== "SELECT_TARGET") {
        return { state, events, resolved: false };
      }

      const selected = action.selectedInstanceIds ?? [];
      const cost = topFrame.costs[topFrame.currentCostIndex] as Cost;

      nextState = applyCostSelection(nextState, cost, selected, controller);
      events.push({
        type: "CARD_TRASHED",
        playerIndex: controller,
        payload: { count: selected.length, reason: "cost" },
      });

      const block = topFrame.effectBlock as EffectBlock;
      const nextCostIndex = topFrame.currentCostIndex + 1;

      if (nextCostIndex < topFrame.costs.length) {
        const remainingCostResult = payCostsWithSelection(
          nextState, topFrame.costs as Cost[], nextCostIndex, controller, cardDb,
          sourceCardInstanceId, block,
        );

        if (remainingCostResult.cannotPay) {
          nextState = popFrame(remainingCostResult.state);
          return processRemainingTriggers(nextState, topFrame.pendingTriggers, cardDb);
        }

        nextState = remainingCostResult.state;
        events.push(...remainingCostResult.events);

        if (remainingCostResult.pendingPrompt) {
          return { state: nextState, events, resolved: false, pendingPrompt: remainingCostResult.pendingPrompt };
        }
      }

      nextState = popFrame(nextState);

      if (block.flags?.once_per_turn && !topFrame.oncePerTurnMarked) {
        nextState = markOncePerTurnUsed(nextState, block.id, sourceCardInstanceId);
      }

      if (topFrame.remainingActions.length > 0) {
        const chainResult = executeActionChain(
          nextState,
          topFrame.remainingActions as Action[],
          sourceCardInstanceId,
          controller,
          cardDb,
        );
        nextState = chainResult.state;
        events.push(...chainResult.events);

        if (chainResult.pendingPrompt) {
          const newTop = peekFrame(nextState) as EffectStackFrame;
          if (newTop) {
            nextState = updateTopFrame(nextState, { pendingTriggers: topFrame.pendingTriggers });
          }
          return { state: nextState, events, resolved: false, pendingPrompt: chainResult.pendingPrompt };
        }
      }

      return processRemainingTriggers(nextState, topFrame.pendingTriggers, cardDb, events);
    }

    // ── Target selection / arrange cards / player choice (mid-action) ────
    case "AWAITING_TARGET_SELECTION":
    case "AWAITING_ARRANGE_CARDS":
    case "AWAITING_PLAYER_CHOICE": {
      nextState = popFrame(nextState);

      const legacyCtx: ResumeContext = {
        effectSourceInstanceId: sourceCardInstanceId,
        controller,
        pausedAction: topFrame.pausedAction as Action | null,
        remainingActions: topFrame.remainingActions as Action[],
        resultRefs: topFrame.resultRefs,
        validTargets: topFrame.validTargets,
      };

      const result = resumeEffectChain(nextState, legacyCtx, action, cardDb);
      nextState = result.state;
      events.push(...result.events);

      if (result.pendingPrompt) {
        const newTop = peekFrame(nextState) as EffectStackFrame;
        if (newTop) {
          nextState = updateTopFrame(nextState, { pendingTriggers: topFrame.pendingTriggers });
        }
        return { state: nextState, events, resolved: false, pendingPrompt: result.pendingPrompt };
      }

      return processRemainingTriggers(nextState, topFrame.pendingTriggers, cardDb, events);
    }

    // ── Interrupted by nested triggers (triggers have completed, resume) ─
    case "INTERRUPTED_BY_TRIGGERS": {
      nextState = popFrame(nextState);

      if (topFrame.remainingActions.length > 0) {
        const resultRefs = new Map<string, EffectResult>(
          topFrame.resultRefs.map(([k, v]) => [k, v as EffectResult]),
        );
        const chainResult = executeActionChain(
          nextState,
          topFrame.remainingActions as Action[],
          sourceCardInstanceId,
          controller,
          cardDb,
          resultRefs,
        );
        nextState = chainResult.state;
        events.push(...chainResult.events);

        if (chainResult.pendingPrompt) {
          return { state: nextState, events, resolved: false, pendingPrompt: chainResult.pendingPrompt };
        }
      }

      return processRemainingTriggers(nextState, topFrame.pendingTriggers, cardDb, events);
    }

    default:
      return { state, events, resolved: false };
  }
}

// ─── Stack Helpers ────────────────────────────────────────────────────────────

function popFrameById(state: GameState, frameId: string): GameState {
  return {
    ...state,
    effectStack: state.effectStack.filter(
      (f) => (f as unknown as EffectStackFrame).id !== frameId,
    ) as GameState["effectStack"],
  };
}

// ─── processRemainingTriggers ────────────────────────────────────────────────

export function processRemainingTriggers(
  state: GameState,
  pendingTriggers: QueuedTrigger[],
  cardDb: Map<string, CardData>,
  priorEvents: PendingEvent[] = [],
): EffectResolverResult {
  const events = [...priorEvents];
  let nextState = state;

  for (let i = 0; i < pendingTriggers.length; i++) {
    const trigger = pendingTriggers[i];
    const result = resolveEffect(
      nextState,
      trigger.effectBlock as EffectBlock,
      trigger.sourceCardInstanceId,
      trigger.controller,
      cardDb,
    );
    nextState = result.state;
    events.push(...result.events);

    if (result.pendingPrompt) {
      const topFrame = peekFrame(nextState) as EffectStackFrame;
      if (topFrame) {
        nextState = updateTopFrame(nextState, {
          pendingTriggers: pendingTriggers.slice(i + 1),
        });
      }
      return { state: nextState, events, resolved: false, pendingPrompt: result.pendingPrompt };
    }

    // Emit events from this trigger's resolution
    for (const event of result.events) {
      nextState = emitEvent(
        nextState,
        event.type,
        event.playerIndex ?? trigger.controller,
        event.payload ?? {},
      );
    }
  }

  return { state: nextState, events, resolved: true };
}
