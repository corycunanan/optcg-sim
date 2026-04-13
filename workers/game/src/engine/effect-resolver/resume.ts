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
import { costResultToEntries, costResultRefsFromEntries } from "./types.js";
import { markOncePerTurnUsed, shuffleArray } from "./action-utils.js";
import { payCostsWithSelection, applyCostSelection } from "./cost-handler.js";
import { resolveEffect, executeActionChain, executeEffectAction } from "./resolver.js";
import { trashCharacter } from "./card-mutations.js";
import { validateTargetConstraints } from "./target-resolver.js";
import { applyRedistributeDonTransfers } from "./actions/don.js";
import { nanoid } from "../../util/nanoid.js";
import { scanEventsForTriggers, buildTriggerSelectionPrompt } from "../trigger-ordering.js";

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

    // Validate kept card is in validTargets (if filter was applied)
    const searchValid = validTargets ?? [];
    const validatedKeptId = keptId && (searchValid.length === 0 || searchValid.includes(keptId))
      ? keptId
      : undefined;

    let newHand = [...p.hand];
    if (validatedKeptId) {
      const kept = p.deck.find((c) => c.instanceId === validatedKeptId);
      if (kept) {
        newHand = [...newHand, { ...kept, zone: "HAND" as const }];
        events.push({ type: "CARD_DRAWN", playerIndex: controller, payload: { cardId: kept.cardId, source: "search" } });
      }
    }

    const removedIds = new Set(ordered);
    if (validatedKeptId) removedIds.add(validatedKeptId);
    const arrangedCards = ordered
      .map((id) => p.deck.find((c) => c.instanceId === id))
      .filter(Boolean) as CardInstance[];

    let newDeck: CardInstance[];
    const restOfDeck = p.deck.filter((c) => !removedIds.has(c.instanceId));
    if ((action.destination ?? restDest.toLowerCase()) === "bottom") {
      newDeck = [...restOfDeck, ...arrangedCards];
    } else {
      newDeck = [...arrangedCards, ...restOfDeck];
    }

    const newPlayers = [...nextState.players] as [typeof nextState.players[0], typeof nextState.players[1]];
    newPlayers[controller] = { ...p, deck: newDeck, hand: newHand };
    nextState = { ...nextState, players: newPlayers };
  }

  // Resume from ARRANGE_TOP_CARDS response (SEARCH_TRASH_THE_REST — kept to hand, rest to trash or bottom)
  if (action.type === "ARRANGE_TOP_CARDS" && pausedAction !== null && pausedAction.type === "SEARCH_TRASH_THE_REST") {
    const sp = (pausedAction.params ?? {}) as Record<string, unknown>;
    const restDest = (sp.rest_destination as string) ?? "TRASH";

    const p = nextState.players[controller];
    const keptId = action.keptCardInstanceId;
    const ordered = action.orderedInstanceIds ?? [];

    const removedIds = new Set(ordered);
    if (keptId) removedIds.add(keptId);
    const restOfDeck = p.deck.filter((c) => !removedIds.has(c.instanceId));

    // Add kept card to hand
    let newHand = [...p.hand];
    if (keptId) {
      const kept = p.deck.find((c) => c.instanceId === keptId);
      if (kept) {
        newHand = [...newHand, { ...kept, zone: "HAND" as const }];
        events.push({ type: "CARD_DRAWN", playerIndex: controller, payload: { cardId: kept.cardId, source: "search" } });
      }
    }

    // Handle remaining cards based on rest_destination
    const remainingCards = ordered
      .map((id) => p.deck.find((c) => c.instanceId === id))
      .filter(Boolean) as CardInstance[];

    let newDeck: CardInstance[];
    let newTrash = [...p.trash];

    if (restDest.toUpperCase() === "TRASH") {
      // Trash the remaining cards
      newDeck = restOfDeck;
      for (const card of remainingCards) {
        newTrash = [{ ...card, zone: "TRASH" as const } as CardInstance, ...newTrash];
        events.push({ type: "CARD_TRASHED", playerIndex: controller, payload: { cardId: card.cardId, reason: "search_trash" } });
      }
    } else {
      // Place at bottom (or top) like SEARCH_DECK
      if ((action.destination ?? restDest.toLowerCase()) === "bottom") {
        newDeck = [...restOfDeck, ...remainingCards];
      } else {
        newDeck = [...remainingCards, ...restOfDeck];
      }
      newTrash = p.trash;
    }

    const newPlayers = [...nextState.players] as [typeof nextState.players[0], typeof nextState.players[1]];
    newPlayers[controller] = { ...p, deck: newDeck, hand: newHand, trash: newTrash };
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

    // Play kept card to field (CHARACTER or STAGE zone)
    let newCharacters = [...p.characters] as (typeof p.characters);
    let newStage = p.stage;
    let newTrash = [...p.trash];
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
          const charSlot = newCharacters.indexOf(null);
          if (charSlot !== -1) newCharacters[charSlot] = newChar;
          events.push({
            type: "CARD_PLAYED",
            playerIndex: controller,
            payload: { cardInstanceId: newChar.instanceId, cardId: kept.cardId, zone: "CHARACTER", source: "search_and_play" },
          });
        } else if (data && data.type.toUpperCase() === "STAGE") {
          // If a Stage already exists, trash it first
          if (newStage) {
            newTrash = [{ ...newStage, zone: "TRASH" as const } as CardInstance, ...newTrash];
          }
          newStage = {
            ...kept,
            instanceId: nanoid(),
            zone: "STAGE" as const,
            state: "ACTIVE" as const,
            attachedDon: [],
            turnPlayed: nextState.turn.number,
            controller,
            owner: controller,
          } as CardInstance;
          events.push({
            type: "CARD_PLAYED",
            playerIndex: controller,
            payload: { cardInstanceId: newStage.instanceId, cardId: kept.cardId, zone: "STAGE", source: "search_and_play" },
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
    newPlayers[controller] = { ...p, deck: newDeck, characters: newCharacters, stage: newStage, trash: newTrash };
    nextState = { ...nextState, players: newPlayers };
  }

  // Resume from ARRANGE_TOP_CARDS response (REORDER_ALL_LIFE — reorder life zone)
  if (action.type === "ARRANGE_TOP_CARDS" && pausedAction !== null && pausedAction.type === "REORDER_ALL_LIFE") {
    // Determine target player from the original action's target
    const targetController = (pausedAction.target?.type === "OPPONENT_LIFE" || pausedAction.target?.controller === "OPPONENT")
      ? (controller === 0 ? 1 : 0) as 0 | 1
      : controller;

    const p = nextState.players[targetController];
    const ordered = action.orderedInstanceIds ?? [];

    // Build new life array in the player's specified order
    const lifeById = new Map(p.life.map((l) => [l.instanceId, l]));
    const newLife = ordered
      .map((id) => lifeById.get(id))
      .filter(Boolean) as typeof p.life;

    // Append any life cards not included in the ordered list (shouldn't happen, but safety)
    for (const l of p.life) {
      if (!ordered.includes(l.instanceId)) newLife.push(l);
    }

    const newPlayers = [...nextState.players] as [typeof nextState.players[0], typeof nextState.players[1]];
    newPlayers[targetController] = { ...p, life: newLife };
    nextState = { ...nextState, players: newPlayers };

    events.push({
      type: "LIFE_REORDERED",
      playerIndex: targetController,
      payload: { orderedInstanceIds: ordered },
    } as unknown as PendingEvent);
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

  // Resume from REDISTRIBUTE_DON response
  if (action.type === "REDISTRIBUTE_DON" && pausedAction !== null && pausedAction.type === "REDISTRIBUTE_DON") {
    const transfers = action.transfers ?? [];
    const amount = ((pausedAction.params?.amount as number) ?? 1);

    // Re-derive valid sources (cards that have DON attached) for this controller.
    const pp = nextState.players[controller];
    const validSourceSet = new Set<string>();
    if (pp.leader.attachedDon.length > 0) validSourceSet.add(pp.leader.instanceId);
    for (const c of pp.characters) {
      if (c && c.attachedDon.length > 0) validSourceSet.add(c.instanceId);
    }
    const validTargetSet = new Set(validTargets);

    const allValid = transfers.length <= amount && transfers.every((t) =>
      t.fromCardInstanceId !== t.toCardInstanceId &&
      validSourceSet.has(t.fromCardInstanceId) &&
      validTargetSet.has(t.toCardInstanceId),
    );

    if (!allValid) {
      return { state, events, resolved: false };
    }

    if (transfers.length > 0) {
      const actionResult = applyRedistributeDonTransfers(nextState, transfers, controller);
      nextState = actionResult.state;
      events.push(...actionResult.events);
      if (actionResult.result && (pausedAction as any).result_ref) {
        resultRefs.set((pausedAction as any).result_ref as string, actionResult.result);
      }
    }
  }

  // Resume from rule 3-7-6-1 overflow trash prompt. The controller picked one
  // of their own Characters to trash so the original effect-driven play can
  // resolve. Trash-one runs as a rule process (emits CARD_TRASHED, NOT CARD_KO)
  // so no On K.O. triggers fire per 3-7-6-1-1. Then re-enter the PLAY_CARD
  // with the original play target preselected.
  if (action.type === "SELECT_TARGET" && pausedAction !== null && resumeCtx.ruleTrashForPlay) {
    const selected = action.selectedInstanceIds ?? [];
    if (selected.length !== 1 || !validTargets.includes(selected[0])) {
      return { state, events, resolved: false };
    }
    const victimId = selected[0];
    const trashResult = trashCharacter(nextState, victimId, controller);
    if (!trashResult) {
      return { state, events, resolved: false };
    }
    nextState = trashResult.state;
    events.push(...trashResult.events);

    const actionResult = executeEffectAction(
      nextState,
      pausedAction,
      effectSourceInstanceId,
      controller,
      cardDb,
      resultRefs,
      [resumeCtx.ruleTrashForPlay.playTargetId],
    );
    nextState = actionResult.state;
    events.push(...actionResult.events);

    if (actionResult.pendingPrompt) {
      return { state: nextState, events, resolved: false, pendingPrompt: actionResult.pendingPrompt };
    }
    if (actionResult.result && (pausedAction as any).result_ref) {
      resultRefs.set((pausedAction as any).result_ref as string, actionResult.result);
    }

    // Scan for triggers produced by the re-entered play (e.g., ON_PLAY)
    if (actionResult.events.length > 0) {
      const scan = scanEventsForTriggers(nextState, actionResult.events, controller, cardDb);
      nextState = scan.state;
      // triggers drain via the outer pipeline — fall through to remainingActions
    }

    // Skip the generic SELECT_TARGET branch below
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

  // Resume from SELECT_TARGET response
  if (action.type === "SELECT_TARGET" && pausedAction !== null) {
    const selected = action.selectedInstanceIds ?? [];
    // Validate — all selected ids must be in validTargets
    if (selected.some((id) => !validTargets.includes(id))) {
      return { state, events, resolved: false };
    }
    // Validate target constraints (aggregate sum, uniqueness, named distribution, dual_targets)
    if (pausedAction.target && !validateTargetConstraints(selected, pausedAction.target, nextState, cardDb, resultRefs)) {
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
      let costRefs: Map<string, EffectResult> | undefined;
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

        if (costResult.costResult) {
          costRefs = costResultRefsFromEntries(costResultToEntries(costResult.costResult));
        }

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
          costRefs,
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

        // Scan chain events for new triggers (e.g., PLAY_CARD → ON_PLAY)
        if (chainResult.events.length > 0) {
          const chainScan = scanEventsForTriggers(nextState, chainResult.events, controller, cardDb);
          nextState = chainScan.state;
          if (chainScan.triggers.length > 0) {
            const allTriggers = [...chainScan.triggers, ...topFrame.pendingTriggers as QueuedTrigger[]];
            return processRemainingTriggers(nextState, allTriggers, cardDb, events);
          }
        }
      }

      return processRemainingTriggers(nextState, topFrame.pendingTriggers, cardDb, events);
    }

    // ── Cost selection response ──────────────────────────────────────────
    case "AWAITING_COST_SELECTION": {
      const cost = topFrame.costs[topFrame.currentCostIndex] as Cost;

      // Reconstruct accumulated cost refs from the frame
      const accumulatedCostRefs = new Map<string, EffectResult>(
        (topFrame.costResultRefs ?? []) as [string, EffectResult][],
      );

      // LIFE_TO_HAND with TOP_OR_BOTTOM — player chose a position
      if (action.type === "PLAYER_CHOICE" && cost.type === "LIFE_TO_HAND") {
        const position = action.choiceId === "1" ? "BOTTOM" : "TOP";
        const p = nextState.players[controller];
        if (p.life.length === 0) {
          nextState = popFrame(nextState);
          return processRemainingTriggers(nextState, topFrame.pendingTriggers, cardDb);
        }

        const removed = position === "TOP" ? p.life.slice(0, 1) : p.life.slice(-1);
        const newLife = position === "TOP" ? p.life.slice(1) : p.life.slice(0, -1);
        const handCards = removed.map((l) => ({
          instanceId: l.instanceId,
          cardId: l.cardId,
          zone: "HAND" as const,
          state: "ACTIVE" as const,
          attachedDon: [] as any[],
          turnPlayed: null,
          controller,
          owner: controller,
        }));

        const newPlayers = [...nextState.players] as [typeof nextState.players[0], typeof nextState.players[1]];
        newPlayers[controller] = { ...p, life: newLife, hand: [...p.hand, ...handCards] };
        nextState = { ...nextState, players: newPlayers };
        events.push({ type: "CARD_ADDED_TO_HAND_FROM_LIFE", playerIndex: controller, payload: { count: 1 } });
      } else if (action.type === "SELECT_TARGET") {
        const selected = action.selectedInstanceIds ?? [];
        nextState = applyCostSelection(nextState, cost, selected, controller);

        // Track selected card IDs as cost result refs based on cost type
        if (cost.type === "TRASH_FROM_HAND" || cost.type === "TRASH_SELF" || cost.type === "TRASH_OWN_CHARACTER") {
          const existing = accumulatedCostRefs.get("__cost_cards_trashed") ?? { targetInstanceIds: [], count: 0 };
          accumulatedCostRefs.set("__cost_cards_trashed", {
            targetInstanceIds: [...existing.targetInstanceIds, ...selected],
            count: existing.count + selected.length,
          });
        } else if (cost.type === "RETURN_OWN_CHARACTER_TO_HAND" || cost.type === "PLACE_OWN_CHARACTER_TO_DECK") {
          const existing = accumulatedCostRefs.get("__cost_cards_returned") ?? { targetInstanceIds: [], count: 0 };
          accumulatedCostRefs.set("__cost_cards_returned", {
            targetInstanceIds: [...existing.targetInstanceIds, ...selected],
            count: existing.count + selected.length,
          });
        } else if (cost.type === "KO_OWN_CHARACTER") {
          const existing = accumulatedCostRefs.get("__cost_characters_ko") ?? { targetInstanceIds: [], count: 0 };
          accumulatedCostRefs.set("__cost_characters_ko", {
            targetInstanceIds: [...existing.targetInstanceIds, ...selected],
            count: existing.count + selected.length,
          });
        }

        events.push({
          type: "CARD_TRASHED",
          playerIndex: controller,
          payload: { count: selected.length, reason: "cost" },
        });
      } else {
        return { state, events, resolved: false };
      }

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
          // Persist accumulated cost refs into the new frame
          const newTop = peekFrame(nextState) as EffectStackFrame;
          if (newTop) {
            nextState = updateTopFrame(nextState, {
              costResultRefs: [...accumulatedCostRefs.entries()].map(([k, v]) => [k, v as any]),
            });
          }
          return { state: nextState, events, resolved: false, pendingPrompt: remainingCostResult.pendingPrompt };
        }

        // Merge remaining cost results into accumulated refs
        if (remainingCostResult.costResult) {
          const remainingRefs = costResultRefsFromEntries(costResultToEntries(remainingCostResult.costResult));
          if (remainingRefs) {
            for (const [key, val] of remainingRefs) {
              const existing = accumulatedCostRefs.get(key);
              if (existing) {
                accumulatedCostRefs.set(key, {
                  targetInstanceIds: [...existing.targetInstanceIds, ...val.targetInstanceIds],
                  count: existing.count + val.count,
                });
              } else {
                accumulatedCostRefs.set(key, val);
              }
            }
          }
        }
      }

      nextState = popFrame(nextState);

      if (block.flags?.once_per_turn && !topFrame.oncePerTurnMarked) {
        nextState = markOncePerTurnUsed(nextState, block.id, sourceCardInstanceId);
      }

      // Build cost refs to pass to action chain
      const hasRefs = [...accumulatedCostRefs.values()].some((v) => v.count > 0);
      const costRefsForActions = hasRefs ? accumulatedCostRefs : undefined;

      if (topFrame.remainingActions.length > 0) {
        const chainResult = executeActionChain(
          nextState,
          topFrame.remainingActions as Action[],
          sourceCardInstanceId,
          controller,
          cardDb,
          costRefsForActions,
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

        // Scan chain events for new triggers (e.g., PLAY_CARD → ON_PLAY)
        if (chainResult.events.length > 0) {
          const chainScan = scanEventsForTriggers(nextState, chainResult.events, controller, cardDb);
          nextState = chainScan.state;
          if (chainScan.triggers.length > 0) {
            const allTriggers = [...chainScan.triggers, ...topFrame.pendingTriggers as QueuedTrigger[]];
            return processRemainingTriggers(nextState, allTriggers, cardDb, events);
          }
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

      // Scan chain events for new triggers (e.g., PLAY_CARD → ON_PLAY)
      if (result.events.length > 0) {
        const chainScan = scanEventsForTriggers(nextState, result.events, controller, cardDb);
        nextState = chainScan.state;
        if (chainScan.triggers.length > 0) {
          const allTriggers = [...chainScan.triggers, ...topFrame.pendingTriggers as QueuedTrigger[]];
          return processRemainingTriggers(nextState, allTriggers, cardDb, events);
        }
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

        // Scan chain events for new triggers (e.g., PLAY_CARD → ON_PLAY)
        if (chainResult.events.length > 0) {
          const chainScan = scanEventsForTriggers(nextState, chainResult.events, controller, cardDb);
          nextState = chainScan.state;
          if (chainScan.triggers.length > 0) {
            const allTriggers = [...chainScan.triggers, ...topFrame.pendingTriggers as QueuedTrigger[]];
            return processRemainingTriggers(nextState, allTriggers, cardDb, events);
          }
        }
      }

      return processRemainingTriggers(nextState, topFrame.pendingTriggers, cardDb, events);
    }

    // ── Simultaneous trigger ordering — player picks which trigger next ──
    case "AWAITING_TRIGGER_ORDER_SELECTION": {
      const simultaneous = (topFrame.simultaneousTriggers ?? []) as QueuedTrigger[];
      const savedPendingTriggers = topFrame.pendingTriggers as QueuedTrigger[];

      // "Done" — player opted to skip remaining optional triggers
      if (action.type === "PLAYER_CHOICE" && action.choiceId === "done") {
        nextState = popFrame(nextState);
        return processRemainingTriggers(nextState, savedPendingTriggers, cardDb, events);
      }

      if (action.type !== "PLAYER_CHOICE" || action.choiceId == null) {
        return { state, events, resolved: false };
      }

      const chosenIndex = parseInt(action.choiceId, 10);
      const chosenTrigger = simultaneous[chosenIndex];
      if (!chosenTrigger) {
        return { state, events, resolved: false };
      }

      // Remove chosen trigger from the remaining simultaneous set
      const remaining = simultaneous.filter((_, i) => i !== chosenIndex);

      // Pop the selection frame
      nextState = popFrame(nextState);

      // Resolve the chosen trigger
      const result = resolveEffect(
        nextState,
        chosenTrigger.effectBlock as EffectBlock,
        chosenTrigger.sourceCardInstanceId,
        chosenTrigger.controller,
        cardDb,
      );
      nextState = result.state;
      events.push(...result.events);

      // If chosen trigger needs player input, carry forward remaining triggers.
      // Merge simultaneousTriggers into pendingTriggers so processRemainingTriggers
      // will re-detect the 2+ same-player group and re-prompt for ordering.
      if (result.pendingPrompt) {
        const newTop = peekFrame(nextState) as EffectStackFrame | null;
        if (newTop) {
          nextState = updateTopFrame(nextState, {
            pendingTriggers: [...remaining, ...savedPendingTriggers],
          });
        }
        return { state: nextState, events, resolved: false, pendingPrompt: result.pendingPrompt };
      }

      // Emit events from the resolved trigger
      for (const event of result.events) {
        nextState = emitEvent(
          nextState,
          event.type,
          event.playerIndex ?? chosenTrigger.controller,
          event.payload ?? {},
        );
      }

      // Scan for nested triggers (LIFO — resolve before returning to simultaneous set)
      if (result.events.length > 0) {
        const scanResult = scanEventsForTriggers(
          nextState, result.events, chosenTrigger.controller, cardDb,
        );
        nextState = scanResult.state;
        if (scanResult.triggers.length > 0) {
          // Process nested triggers first, then come back to remaining simultaneous
          const nestedResult = processRemainingTriggers(nextState, scanResult.triggers, cardDb, events);
          nextState = nestedResult.state;
          // nestedResult.events already includes our prior events (passed as priorEvents)
          if (nestedResult.pendingPrompt) {
            const newTop = peekFrame(nextState) as EffectStackFrame | null;
            if (newTop) {
              nextState = updateTopFrame(nextState, {
                pendingTriggers: [...remaining, ...savedPendingTriggers],
              });
            }
            return { state: nextState, events: nestedResult.events, resolved: false, pendingPrompt: nestedResult.pendingPrompt };
          }
          // Push any new events from nested resolution
          events.length = 0;
          events.push(...nestedResult.events);
        }
      }

      // Re-prompt for remaining simultaneous triggers
      if (remaining.length > 1) {
        const promptResult = buildTriggerSelectionPrompt(
          nextState, remaining, savedPendingTriggers, cardDb,
        );
        return { state: promptResult.state, events, resolved: false, pendingPrompt: promptResult.pendingPrompt };
      }

      if (remaining.length === 1) {
        // Auto-resolve the last one
        const lastResult = resolveEffect(
          nextState,
          remaining[0].effectBlock as EffectBlock,
          remaining[0].sourceCardInstanceId,
          remaining[0].controller,
          cardDb,
        );
        nextState = lastResult.state;
        events.push(...lastResult.events);

        if (lastResult.pendingPrompt) {
          const newTop = peekFrame(nextState) as EffectStackFrame | null;
          if (newTop) {
            nextState = updateTopFrame(nextState, {
              pendingTriggers: savedPendingTriggers,
            });
          }
          return { state: nextState, events, resolved: false, pendingPrompt: lastResult.pendingPrompt };
        }

        // Emit events from the last trigger
        for (const event of lastResult.events) {
          nextState = emitEvent(
            nextState,
            event.type,
            event.playerIndex ?? remaining[0].controller,
            event.payload ?? {},
          );
        }

        // Scan for nested triggers from last resolved trigger
        if (lastResult.events.length > 0) {
          const scanResult2 = scanEventsForTriggers(
            nextState, lastResult.events, remaining[0].controller, cardDb,
          );
          nextState = scanResult2.state;
          if (scanResult2.triggers.length > 0) {
            const nestedResult = processRemainingTriggers(nextState, scanResult2.triggers, cardDb, events);
            nextState = nestedResult.state;
            if (nestedResult.pendingPrompt) {
              const newTop = peekFrame(nextState) as EffectStackFrame | null;
              if (newTop) {
                nextState = updateTopFrame(nextState, { pendingTriggers: savedPendingTriggers });
              }
              return { state: nextState, events: nestedResult.events, resolved: false, pendingPrompt: nestedResult.pendingPrompt };
            }
            events.length = 0;
            events.push(...nestedResult.events);
          }
        }
      }

      // All simultaneous triggers done — process remaining pending triggers
      return processRemainingTriggers(nextState, savedPendingTriggers, cardDb, events);
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

  if (pendingTriggers.length === 0) {
    return { state: nextState, events, resolved: true };
  }

  // Group by controller — turn player resolves first (§8-6),
  // and within each group the player chooses order when 2+.
  const activePI = nextState.turn.activePlayerIndex;
  const turnPlayerTriggers = pendingTriggers.filter(t => t.controller === activePI);
  const nonTurnPlayerTriggers = pendingTriggers.filter(t => t.controller !== activePI);

  // Turn player has 2+ triggers — prompt for ordering
  if (turnPlayerTriggers.length >= 2) {
    const promptResult = buildTriggerSelectionPrompt(
      nextState, turnPlayerTriggers, nonTurnPlayerTriggers, cardDb,
    );
    return { state: promptResult.state, events, resolved: false, pendingPrompt: promptResult.pendingPrompt };
  }

  // Resolve turn player's 0–1 triggers first
  for (const trigger of turnPlayerTriggers) {
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
          pendingTriggers: nonTurnPlayerTriggers,
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

  // Non-turn player has 2+ triggers — prompt for ordering
  if (nonTurnPlayerTriggers.length >= 2) {
    const promptResult = buildTriggerSelectionPrompt(
      nextState, nonTurnPlayerTriggers, [], cardDb,
    );
    return { state: promptResult.state, events, resolved: false, pendingPrompt: promptResult.pendingPrompt };
  }

  // Resolve non-turn player's 0–1 triggers
  for (const trigger of nonTurnPlayerTriggers) {
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
          pendingTriggers: [],
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
