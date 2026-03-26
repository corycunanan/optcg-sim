/**
 * M4 Effect Resolver
 *
 * Resolves queued triggers and activated effects:
 * 1. Evaluate block-level conditions
 * 2. Check optional flag (prompt player if needed)
 * 3. Pay costs
 * 4. Execute action chain with THEN/IF_DO/AND connectors
 * 5. Handle back-references (result_ref / target_ref)
 *
 * Each action in the chain enters the pipeline at step 1,
 * which may emit new events and trigger additional effects.
 */

import type {
  Action,
  Duration,
  EffectBlock,
  EffectResult,
  CostResult,
  RuntimeActiveEffect,
  ExpiryTiming,
} from "./effect-types.js";
import type {
  CardData,
  CardInstance,
  GameState,
  GameAction,
  PendingEvent,
  PendingPromptState,
  ResumeContext,
} from "../types.js";
import { evaluateCondition, type ConditionContext } from "./conditions.js";
import { checkReplacementForKO, checkReplacementForRemoval } from "./replacements.js";
import { nanoid } from "../util/nanoid.js";

export interface EffectResolverResult {
  state: GameState;
  events: PendingEvent[];
  resolved: boolean;
  pendingPrompt?: PendingPromptState;
}

/**
 * Resolve a single effect block in the current game state.
 */
export function resolveEffect(
  state: GameState,
  block: EffectBlock,
  sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
): EffectResolverResult {
  const events: PendingEvent[] = [];
  const condCtx: ConditionContext = {
    sourceCardInstanceId,
    controller,
    cardDb,
  };

  // Step 1: Evaluate block-level conditions
  if (block.conditions) {
    if (!evaluateCondition(state, block.conditions, condCtx)) {
      return { state, events, resolved: false };
    }
  }

  // Step 2: Check optional flag — prompt the player before paying costs
  if (block.flags?.optional) {
    const sourceCard = findCardInstanceById(state, sourceCardInstanceId);
    const sourceCardData = sourceCard ? cardDb.get(sourceCard.cardId) : undefined;
    const effectDescription = sourceCardData?.triggerText ?? sourceCardData?.effectText ?? "You may activate this effect.";
    const cards: CardInstance[] = sourceCard ? [sourceCard] : [];
    const resumeCtx: ResumeContext = {
      effectSourceInstanceId: sourceCardInstanceId,
      controller,
      pausedAction: null,
      remainingActions: block.actions ?? [],
      resultRefs: [],
      validTargets: [],
    };
    const pendingPrompt: PendingPromptState = {
      promptType: "OPTIONAL_EFFECT",
      options: { effectDescription, cards },
      respondingPlayer: controller,
      resumeContext: resumeCtx,
    };
    return { state, events, resolved: false, pendingPrompt };
  }

  // Step 3: Pay costs
  if (block.costs && block.costs.length > 0) {
    const costResult = payCosts(state, block.costs, controller, cardDb);
    if (!costResult) {
      // Cannot pay costs — mark once-per-turn as consumed anyway (per rules 8-3-1-3-1)
      state = markOncePerTurnUsed(state, block.id, sourceCardInstanceId);
      return { state, events, resolved: false };
    }
    state = costResult.state;
    events.push(...costResult.events);
  }

  // Mark once-per-turn as used
  if (block.flags?.once_per_turn) {
    state = markOncePerTurnUsed(state, block.id, sourceCardInstanceId);
  }

  // Step 4: Execute action chain
  if (block.actions && block.actions.length > 0) {
    const chainResult = executeActionChain(
      state,
      block.actions,
      sourceCardInstanceId,
      controller,
      cardDb,
    );
    state = chainResult.state;
    events.push(...chainResult.events);

    if (chainResult.pendingPrompt) {
      return { state, events, resolved: false, pendingPrompt: chainResult.pendingPrompt };
    }
  }

  return { state, events, resolved: true };
}

// ─── Cost Payment ─────────────────────────────────────────────────────────────

interface CostPaymentResult {
  state: GameState;
  events: PendingEvent[];
  costResult: CostResult;
}

function payCosts(
  state: GameState,
  costs: import("./effect-types.js").Cost[],
  controller: 0 | 1,
  _cardDb: Map<string, CardData>,
): CostPaymentResult | null {
  const events: PendingEvent[] = [];
  const costResult: CostResult = {
    donRestedCount: 0,
    cardsTrashedCount: 0,
    cardsReturnedCount: 0,
    cardsPlacedToDeckCount: 0,
    charactersKoCount: 0,
  };

  let nextState = state;

  for (const cost of costs) {
    switch (cost.type) {
      case "DON_MINUS": {
        const amount = typeof cost.amount === "number" ? cost.amount : 0;
        const player = nextState.players[controller];
        // Collect DON!! from cost area + attached
        const allFieldDon = [
          ...player.donCostArea,
          ...player.leader.attachedDon,
          ...player.characters.flatMap((c) => c.attachedDon),
        ];
        if (allFieldDon.length < amount) return null;

        // Return DON!! to DON!! deck — prefer cost area DON!! first
        let returned = 0;
        const newPlayers = [...nextState.players] as [typeof nextState.players[0], typeof nextState.players[1]];
        let p = { ...player };

        // Take from cost area first
        const fromCostArea = Math.min(amount, p.donCostArea.length);
        if (fromCostArea > 0) {
          const toReturn = p.donCostArea.slice(0, fromCostArea);
          p = {
            ...p,
            donCostArea: p.donCostArea.slice(fromCostArea),
            donDeck: [...p.donDeck, ...toReturn.map((d) => ({ ...d, state: "ACTIVE" as const, attachedTo: null }))],
          };
          returned += fromCostArea;
        }
        // If still need more, take from attached DON!! (not implemented for simplicity)
        if (returned < amount) return null;

        newPlayers[controller] = p;
        nextState = { ...nextState, players: newPlayers };
        events.push({ type: "DON_DETACHED", playerIndex: controller, payload: { count: amount } });
        break;
      }

      case "DON_REST": {
        const amount = cost.amount === "ANY_NUMBER"
          ? nextState.players[controller].donCostArea.filter((d) => d.state === "ACTIVE").length
          : typeof cost.amount === "number" ? cost.amount : 0;

        if (amount === 0 && cost.amount !== "ANY_NUMBER") return null;

        const p = nextState.players[controller];
        const activeDon = p.donCostArea.filter((d) => d.state === "ACTIVE");
        if (activeDon.length < amount) return null;

        let rested = 0;
        const newDonCostArea = p.donCostArea.map((d) => {
          if (d.state === "ACTIVE" && rested < amount) {
            rested++;
            return { ...d, state: "RESTED" as const };
          }
          return d;
        });

        const newPlayers = [...nextState.players] as [typeof nextState.players[0], typeof nextState.players[1]];
        newPlayers[controller] = { ...p, donCostArea: newDonCostArea };
        nextState = { ...nextState, players: newPlayers };
        costResult.donRestedCount = rested;
        break;
      }

      case "REST_SELF": {
        // Rest the source card — this is handled at the trigger level
        // For now, a no-op since the card would be rested by the caller
        break;
      }

      case "TRASH_FROM_HAND": {
        const amount = typeof cost.amount === "number" ? cost.amount : 1;
        const p = nextState.players[controller];
        if (p.hand.length < amount) return null;

        // Auto-select cards to trash (in real impl, player chooses)
        // For now, take from the end of hand
        let trashable = p.hand;
        if (cost.filter) {
          trashable = trashable.filter((c) => {
            const data = _cardDb.get(c.cardId);
            if (!data) return false;
            // Basic filter check for traits
            if (cost.filter?.traits) {
              return cost.filter.traits.every((t) => (data.types ?? []).includes(t));
            }
            return true;
          });
        }
        if (trashable.length < amount) return null;

        const toTrash = trashable.slice(0, amount);
        const toTrashIds = new Set(toTrash.map((c) => c.instanceId));
        const newHand = p.hand.filter((c) => !toTrashIds.has(c.instanceId));
        const newTrash = [...toTrash.map((c) => ({ ...c, zone: "TRASH" as const })), ...p.trash];

        const newPlayers = [...nextState.players] as [typeof nextState.players[0], typeof nextState.players[1]];
        newPlayers[controller] = { ...p, hand: newHand, trash: newTrash };
        nextState = { ...nextState, players: newPlayers };
        costResult.cardsTrashedCount = amount;
        events.push({ type: "CARD_TRASHED", playerIndex: controller, payload: { count: amount, reason: "cost" } });
        break;
      }

      default:
        // Other cost types to be implemented
        break;
    }
  }

  return { state: nextState, events, costResult };
}

// ─── Action Chain Execution ───────────────────────────────────────────────────

interface ChainResult {
  state: GameState;
  events: PendingEvent[];
  pendingPrompt?: PendingPromptState;
}

function executeActionChain(
  state: GameState,
  actions: Action[],
  sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  initialResultRefs?: Map<string, EffectResult>,
): ChainResult {
  const events: PendingEvent[] = [];
  const resultRefs = initialResultRefs ?? new Map<string, EffectResult>();
  let lastActionSucceeded = true;

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];

    // Check chain connector
    if (action.chain && i > 0) {
      if (action.chain === "IF_DO" && !lastActionSucceeded) {
        lastActionSucceeded = false;
        continue;
      }
      // THEN: always execute
      // AND: execute simultaneously (treated as THEN for now)
    }

    // Check inline conditions
    if (action.conditions) {
      const condCtx: ConditionContext = {
        sourceCardInstanceId,
        controller,
        cardDb,
      };
      if (!evaluateCondition(state, action.conditions, condCtx)) {
        lastActionSucceeded = false;
        continue;
      }
    }

    // Execute the action
    const result = executeEffectAction(
      state,
      action,
      sourceCardInstanceId,
      controller,
      cardDb,
      resultRefs,
    );

    state = result.state;
    events.push(...result.events);
    lastActionSucceeded = result.succeeded;

    if (result.pendingPrompt) {
      // Pause — attach remaining actions into resume context and surface the prompt
      const ctx = result.pendingPrompt.resumeContext as ResumeContext;
      const updatedCtx: ResumeContext = {
        ...ctx,
        remainingActions: actions.slice(i + 1),
        resultRefs: [...resultRefs.entries()].map(([k, v]) => [k, v as unknown]),
      };
      return {
        state: result.state,
        events,
        pendingPrompt: { ...result.pendingPrompt, resumeContext: updatedCtx },
      };
    }

    // Store result reference
    if (action.result_ref && result.result) {
      resultRefs.set(action.result_ref, result.result);
    }
  }

  return { state, events };
}

// ─── Individual Action Execution ──────────────────────────────────────────────

interface ActionResult {
  state: GameState;
  events: PendingEvent[];
  succeeded: boolean;
  result?: EffectResult;
  pendingPrompt?: PendingPromptState;
}

function executeEffectAction(
  state: GameState,
  action: Action,
  sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  resultRefs: Map<string, EffectResult>,
  preselectedTargets?: string[],
): ActionResult {
  const events: PendingEvent[] = [];
  const params = action.params ?? {};

  switch (action.type) {
    case "DRAW": {
      const amount = resolveAmount(params.amount as number | { type: string }, resultRefs);
      if (amount <= 0) return { state, events, succeeded: false };

      const p = state.players[controller];
      const drawCount = Math.min(amount, p.deck.length);
      if (drawCount === 0) return { state, events, succeeded: false };

      const drawn = p.deck.slice(0, drawCount);
      const newDeck = p.deck.slice(drawCount);
      const newHand = [...p.hand, ...drawn.map((c) => ({ ...c, zone: "HAND" as const }))];

      const newPlayers = [...state.players] as [typeof state.players[0], typeof state.players[1]];
      newPlayers[controller] = { ...p, deck: newDeck, hand: newHand };

      for (const card of drawn) {
        events.push({ type: "CARD_DRAWN", playerIndex: controller, payload: { cardId: card.cardId } });
      }

      return {
        state: { ...state, players: newPlayers },
        events,
        succeeded: true,
        result: { targetInstanceIds: drawn.map((c) => c.instanceId), count: drawCount },
      };
    }

    case "MODIFY_POWER": {
      const amount = resolveAmount(params.amount as number | { type: string }, resultRefs);
      const duration = action.duration ?? { type: "THIS_TURN" as const };

      const allValidIds = preselectedTargets ?? computeAllValidTargets(state, action.target, controller, cardDb, sourceCardInstanceId, resultRefs);
      if (!preselectedTargets && needsPlayerTargetSelection(action.target, allValidIds)) {
        return buildSelectTargetPrompt(state, action, allValidIds, sourceCardInstanceId, controller, cardDb, resultRefs);
      }
      const targetIds = autoSelectTargets(action.target, allValidIds);
      if (targetIds.length === 0) return { state, events, succeeded: false };

      // Create an active effect entry
      const effect: RuntimeActiveEffect = {
        id: nanoid(),
        sourceCardInstanceId,
        sourceEffectBlockId: "",
        category: "auto",
        modifiers: [{
          type: "MODIFY_POWER",
          params: { amount },
          duration,
        }],
        duration,
        expiresAt: computeExpiry(duration, state),
        controller,
        appliesTo: targetIds,
        timestamp: Date.now(),
      };

      const newActiveEffects = [...state.activeEffects, effect as any];

      for (const id of targetIds) {
        events.push({
          type: "POWER_MODIFIED",
          playerIndex: controller,
          payload: { targetInstanceId: id, amount },
        });
      }

      return {
        state: { ...state, activeEffects: newActiveEffects },
        events,
        succeeded: true,
        result: { targetInstanceIds: targetIds, count: targetIds.length },
      };
    }

    case "GRANT_KEYWORD": {
      const keyword = params.keyword as string;
      const duration = action.duration ?? { type: "THIS_TURN" as const };
      const allValidIds = preselectedTargets ?? computeAllValidTargets(state, action.target, controller, cardDb, sourceCardInstanceId, resultRefs);
      if (!preselectedTargets && needsPlayerTargetSelection(action.target, allValidIds)) {
        return buildSelectTargetPrompt(state, action, allValidIds, sourceCardInstanceId, controller, cardDb, resultRefs);
      }
      const targetIds = autoSelectTargets(action.target, allValidIds);
      if (targetIds.length === 0) return { state, events, succeeded: false };

      const effect: RuntimeActiveEffect = {
        id: nanoid(),
        sourceCardInstanceId,
        sourceEffectBlockId: "",
        category: "auto",
        modifiers: [{
          type: "GRANT_KEYWORD",
          params: { keyword },
          duration,
        }],
        duration,
        expiresAt: computeExpiry(duration, state),
        controller,
        appliesTo: targetIds,
        timestamp: Date.now(),
      };

      return {
        state: { ...state, activeEffects: [...state.activeEffects, effect as any] },
        events,
        succeeded: true,
        result: { targetInstanceIds: targetIds, count: targetIds.length },
      };
    }

    case "KO": {
      const allValidIds = preselectedTargets ?? computeAllValidTargets(state, action.target, controller, cardDb, sourceCardInstanceId, resultRefs);
      if (!preselectedTargets && needsPlayerTargetSelection(action.target, allValidIds)) {
        return buildSelectTargetPrompt(state, action, allValidIds, sourceCardInstanceId, controller, cardDb, resultRefs);
      }
      const targetIds = autoSelectTargets(action.target, allValidIds);
      if (targetIds.length === 0) return { state, events, succeeded: false };

      let nextState = state;
      const koedIds: string[] = [];
      for (const id of targetIds) {
        // Check for replacement effects before completing the KO
        const replacement = checkReplacementForKO(nextState, id, "effect", controller, cardDb);
        if (replacement.pendingPrompt) {
          // Pause for optional replacement prompt
          events.push(...replacement.events);
          return { state: replacement.state, events, succeeded: false, pendingPrompt: replacement.pendingPrompt };
        }
        if (replacement.replaced) {
          nextState = replacement.state;
          events.push(...replacement.events);
          continue; // KO was replaced — skip this target
        }

        const result = koCharacter(nextState, id, controller);
        if (result) {
          nextState = result.state;
          events.push(...result.events);
          koedIds.push(id);
        }
      }

      return {
        state: nextState,
        events,
        succeeded: koedIds.length > 0,
        result: { targetInstanceIds: koedIds, count: koedIds.length },
      };
    }

    case "RETURN_TO_HAND": {
      const allValidIds = preselectedTargets ?? computeAllValidTargets(state, action.target, controller, cardDb, sourceCardInstanceId, resultRefs);
      if (!preselectedTargets && needsPlayerTargetSelection(action.target, allValidIds)) {
        return buildSelectTargetPrompt(state, action, allValidIds, sourceCardInstanceId, controller, cardDb, resultRefs);
      }
      const targetIds = autoSelectTargets(action.target, allValidIds);
      if (targetIds.length === 0) return { state, events, succeeded: false };

      let nextState = state;
      const returnedIds: string[] = [];
      for (const id of targetIds) {
        // Check for removal replacement effects (opponent removing from field)
        const replacement = checkReplacementForRemoval(nextState, id, controller, cardDb);
        if (replacement.pendingPrompt) {
          events.push(...replacement.events);
          return { state: replacement.state, events, succeeded: false, pendingPrompt: replacement.pendingPrompt };
        }
        if (replacement.replaced) {
          nextState = replacement.state;
          events.push(...replacement.events);
          continue; // Removal was replaced
        }

        const result = returnToHand(nextState, id);
        if (result) {
          nextState = result.state;
          events.push(...result.events);
          returnedIds.push(id);
        }
      }

      return {
        state: nextState,
        events,
        succeeded: returnedIds.length > 0,
        result: { targetInstanceIds: returnedIds, count: returnedIds.length },
      };
    }

    case "SEARCH_DECK": {
      const lookAt = (params.look_at as number) ?? 5;
      const pickUpTo = ((params.pick as any)?.up_to as number) ?? 1;
      const filter = (params.filter as any) ?? {};
      const restDest = (params.rest_destination as string) ?? "BOTTOM";

      const p = state.players[controller];
      const topCards = p.deck.slice(0, Math.min(lookAt, p.deck.length));
      console.log(`[search] SEARCH_DECK controller=${controller} deckSize=${p.deck.length} topCards=${topCards.length} filter=${JSON.stringify(filter)}`);

      if (topCards.length === 0) {
        return { state, events, succeeded: false, result: { targetInstanceIds: [], count: 0 } };
      }

      // Find matching cards (valid picks)
      const matching = topCards.filter((c) => {
        const data = cardDb.get(c.cardId);
        if (!data) return false;
        if (filter.traits) {
          if (!filter.traits.every((t: string) => (data.types ?? []).includes(t))) return false;
        }
        if (filter.exclude_name && data.name === filter.exclude_name) return false;
        if (filter.card_type) {
          if (data.type.toUpperCase() !== (filter.card_type as string).toUpperCase()) return false;
        }
        if (filter.cost_min !== undefined && (data.cost ?? 0) < filter.cost_min) return false;
        if (filter.cost_max !== undefined && (data.cost ?? 0) > filter.cost_max) return false;
        return true;
      });

      // All matching cards are selectable — pickUpTo limits how many the player can keep, not which are shown
      const validTargets = matching.map((c) => c.instanceId);
      console.log(`[search] matching=${matching.length} validTargets=${validTargets.length} building ARRANGE_TOP_CARDS prompt`);

      // Build effect description from source card
      const sourceCard = findCardInstanceById(state, sourceCardInstanceId);
      const sourceCardData = sourceCard ? cardDb.get(sourceCard.cardId) : undefined;
      const effectDescription = sourceCardData?.effectText ?? "Look at the top cards of your deck.";

      // Pause — ask the player to pick a card (ARRANGE_TOP_CARDS prompt)
      const resumeCtx: ResumeContext = {
        effectSourceInstanceId: sourceCardInstanceId,
        controller,
        pausedAction: action,
        remainingActions: [],
        resultRefs: [],
        validTargets,
      };
      const pendingPrompt: PendingPromptState = {
        promptType: "ARRANGE_TOP_CARDS",
        options: {
          cards: topCards,
          effectDescription,
          canSendToBottom: restDest.toUpperCase() === "BOTTOM",
          validTargets,
        },
        respondingPlayer: controller,
        resumeContext: resumeCtx,
      };

      return { state, events, succeeded: false, pendingPrompt };
    }

    case "MILL": {
      const amount = (params.amount as number) ?? 1;
      const p = state.players[controller];
      const millCount = Math.min(amount, p.deck.length);
      if (millCount === 0) return { state, events, succeeded: false };

      const milled = p.deck.slice(0, millCount);
      const newDeck = p.deck.slice(millCount);
      const newTrash = [...milled.map((c) => ({ ...c, zone: "TRASH" as const })), ...p.trash];

      const newPlayers = [...state.players] as [typeof state.players[0], typeof state.players[1]];
      newPlayers[controller] = { ...p, deck: newDeck, trash: newTrash };

      events.push({ type: "CARD_TRASHED", playerIndex: controller, payload: { count: millCount, reason: "mill" } });

      return {
        state: { ...state, players: newPlayers },
        events,
        succeeded: true,
        result: { targetInstanceIds: milled.map((c) => c.instanceId), count: millCount },
      };
    }

    case "ADD_TO_LIFE_FROM_DECK": {
      const amount = (params.amount as number) ?? 1;
      const face = (params.face as "UP" | "DOWN") ?? "DOWN";
      const position = (params.position as "TOP" | "BOTTOM") ?? "TOP";

      const p = state.players[controller];
      const count = Math.min(amount, p.deck.length);
      if (count === 0) return { state, events, succeeded: false };

      const cards = p.deck.slice(0, count);
      const newDeck = p.deck.slice(count);
      const lifeCards = cards.map((c) => ({
        instanceId: c.instanceId,
        cardId: c.cardId,
        face,
      }));
      const newLife = position === "TOP"
        ? [...lifeCards, ...p.life]
        : [...p.life, ...lifeCards];

      const newPlayers = [...state.players] as [typeof state.players[0], typeof state.players[1]];
      newPlayers[controller] = { ...p, deck: newDeck, life: newLife };

      return {
        state: { ...state, players: newPlayers },
        events,
        succeeded: true,
      };
    }

    case "TRASH_FROM_LIFE": {
      const amount = (params.amount as number) ?? 1;
      const position = (params.position as "TOP" | "BOTTOM") ?? "TOP";

      const pi = (params.controller === "OPPONENT")
        ? (controller === 0 ? 1 : 0)
        : controller;
      const p = state.players[pi];
      const count = Math.min(amount, p.life.length);
      if (count === 0) return { state, events, succeeded: false };

      const removed = position === "TOP"
        ? p.life.slice(0, count)
        : p.life.slice(-count);
      const newLife = position === "TOP"
        ? p.life.slice(count)
        : p.life.slice(0, -count);

      const trashedCards = removed.map((l) => ({
        instanceId: l.instanceId,
        cardId: l.cardId,
        zone: "TRASH" as const,
        state: "ACTIVE" as const,
        attachedDon: [],
        turnPlayed: null,
        controller: pi as 0 | 1,
        owner: pi as 0 | 1,
      }));

      const newPlayers = [...state.players] as [typeof state.players[0], typeof state.players[1]];
      newPlayers[pi] = {
        ...p,
        life: newLife,
        trash: [...trashedCards, ...p.trash],
      };

      events.push({ type: "CARD_TRASHED", playerIndex: pi as 0 | 1, payload: { count, reason: "life_trash" } });

      return {
        state: { ...state, players: newPlayers },
        events,
        succeeded: true,
      };
    }

    case "APPLY_PROHIBITION": {
      const prohibType = params.prohibition_type as string;
      const duration = action.duration ?? { type: "THIS_TURN" as const };
      const allValidIds = preselectedTargets ?? computeAllValidTargets(state, action.target, controller, cardDb, sourceCardInstanceId, resultRefs);
      if (!preselectedTargets && needsPlayerTargetSelection(action.target, allValidIds)) {
        return buildSelectTargetPrompt(state, action, allValidIds, sourceCardInstanceId, controller, cardDb, resultRefs);
      }
      const targetIds = autoSelectTargets(action.target, allValidIds);

      const prohibition: import("./effect-types.js").RuntimeProhibition = {
        id: nanoid(),
        sourceCardInstanceId,
        sourceEffectBlockId: "",
        prohibitionType: prohibType as any,
        scope: params.scope as any ?? {},
        duration,
        controller,
        appliesTo: targetIds,
        usesRemaining: null,
        conditionalOverride: params.conditional_override as any,
      };

      return {
        state: { ...state, prohibitions: [...state.prohibitions, prohibition as any] },
        events,
        succeeded: true,
      };
    }

    case "SCHEDULE_ACTION": {
      const timing = (params.timing as string) ?? "END_OF_THIS_TURN";
      const scheduledAction = params.action as Action;
      const boundTo = params.bound_to as string | null ?? null;

      const entry: import("./effect-types.js").RuntimeScheduledAction = {
        id: nanoid(),
        timing: timing as any,
        action: scheduledAction,
        boundToInstanceId: boundTo,
        sourceEffectId: sourceCardInstanceId,
        controller,
      };

      return {
        state: { ...state, scheduledActions: [...state.scheduledActions, entry as any] },
        events,
        succeeded: true,
      };
    }

    case "APPLY_ONE_TIME_MODIFIER": {
      const modification = params.modification as import("./effect-types.js").Modifier;
      const appliesTo = params.applies_to as { action: string; filter?: import("./effect-types.js").TargetFilter };
      const expires = action.duration ?? { type: "THIS_TURN" as const };

      if (!modification || !appliesTo) return { state, events, succeeded: false };

      const otm: import("./effect-types.js").RuntimeOneTimeModifier = {
        id: nanoid(),
        appliesTo: appliesTo as any,
        modification,
        expires,
        consumed: false,
        controller,
      };

      return {
        state: { ...state, oneTimeModifiers: [...state.oneTimeModifiers, otm as any] },
        events,
        succeeded: true,
      };
    }

    case "PLAYER_CHOICE":
    case "OPPONENT_CHOICE": {
      const options = params.options as Action[][];
      if (!options || options.length === 0) return { state, events, succeeded: false };

      // Determine who chooses: PLAYER_CHOICE = controller, OPPONENT_CHOICE = opponent
      const chooser = action.type === "OPPONENT_CHOICE"
        ? (controller === 0 ? 1 : 0) as 0 | 1
        : controller;

      // If only one option, auto-select it (no prompt needed)
      if (options.length === 1) {
        const result = executeActionChain(state, options[0], sourceCardInstanceId, controller, cardDb);
        return {
          state: result.state,
          events: [...events, ...result.events],
          succeeded: true,
        };
      }

      // Build choice labels from action types or explicit labels
      const explicitLabels = params.labels as string[] | undefined;
      const choices = options.map((branch, i) => ({
        id: String(i),
        label: explicitLabels?.[i] ?? describeActionBranch(branch),
      }));

      // Build prompt description from source card
      const choiceSourceCard = findCardInstanceById(state, sourceCardInstanceId);
      const choiceSourceData = choiceSourceCard ? cardDb.get(choiceSourceCard.cardId) : undefined;
      const effectDescription = choiceSourceData?.effectText ?? "Choose one";

      const resumeCtx: ResumeContext = {
        effectSourceInstanceId: sourceCardInstanceId,
        controller,
        pausedAction: action,
        remainingActions: [],
        resultRefs: [...resultRefs.entries()].map(([k, v]) => [k, v as unknown]),
        validTargets: [],
      };

      const pendingPrompt: PendingPromptState = {
        promptType: "PLAYER_CHOICE",
        options: {
          effectDescription,
          choices,
        },
        respondingPlayer: chooser,
        resumeContext: resumeCtx,
      };

      return { state, events, succeeded: false, pendingPrompt };
    }

    case "OPPONENT_ACTION": {
      const wrappedAction = params.action as Action;
      if (!wrappedAction) return { state, events, succeeded: false };

      const oppController = controller === 0 ? 1 : 0;
      const result = executeEffectAction(
        state,
        wrappedAction,
        sourceCardInstanceId,
        oppController as 0 | 1,
        cardDb,
        resultRefs,
      );

      return result;
    }

    case "REUSE_EFFECT": {
      // Find the referenced effect block on the same card and resolve it
      const targetEffect = params.target_effect as string;
      const card = findCardInstanceById(state, sourceCardInstanceId);
      if (!card) return { state, events, succeeded: false };

      const data = cardDb.get(card.cardId);
      if (!data) return { state, events, succeeded: false };

      const schema = data.effectSchema as import("./effect-types.js").EffectSchema | null;
      if (!schema) return { state, events, succeeded: false };

      const targetBlock = schema.effects.find((b) => {
        if (!b.trigger) return false;
        if ("keyword" in b.trigger) return b.trigger.keyword === targetEffect;
        return false;
      });

      if (!targetBlock) return { state, events, succeeded: false };

      const resolveResult = resolveEffect(state, targetBlock, sourceCardInstanceId, controller, cardDb);
      return {
        state: resolveResult.state,
        events: [...events, ...resolveResult.events],
        succeeded: resolveResult.resolved,
      };
    }

    case "SET_ACTIVE": {
      const allValidIds = preselectedTargets ?? computeAllValidTargets(state, action.target, controller, cardDb, sourceCardInstanceId, resultRefs);
      if (!preselectedTargets && needsPlayerTargetSelection(action.target, allValidIds)) {
        return buildSelectTargetPrompt(state, action, allValidIds, sourceCardInstanceId, controller, cardDb, resultRefs);
      }
      const targetIds = autoSelectTargets(action.target, allValidIds);
      let nextState = state;

      for (const id of targetIds) {
        nextState = setCardState(nextState, id, "ACTIVE");
      }

      return { state: nextState, events, succeeded: targetIds.length > 0 };
    }

    case "SET_REST": {
      const allValidIds = preselectedTargets ?? computeAllValidTargets(state, action.target, controller, cardDb, sourceCardInstanceId, resultRefs);
      if (!preselectedTargets && needsPlayerTargetSelection(action.target, allValidIds)) {
        return buildSelectTargetPrompt(state, action, allValidIds, sourceCardInstanceId, controller, cardDb, resultRefs);
      }
      const targetIds = autoSelectTargets(action.target, allValidIds);
      let nextState = state;

      for (const id of targetIds) {
        nextState = setCardState(nextState, id, "RESTED");
        events.push({ type: "CARD_STATE_CHANGED", playerIndex: controller, payload: { targetInstanceId: id, newState: "RESTED" } });
      }

      return { state: nextState, events, succeeded: targetIds.length > 0 };
    }

    case "GIVE_DON": {
      const amount = (params.amount as number) ?? 1;
      const allValidIds = preselectedTargets ?? computeAllValidTargets(state, action.target, controller, cardDb, sourceCardInstanceId, resultRefs);
      if (!preselectedTargets && needsPlayerTargetSelection(action.target, allValidIds)) {
        return buildSelectTargetPrompt(state, action, allValidIds, sourceCardInstanceId, controller, cardDb, resultRefs);
      }
      const targetIds = autoSelectTargets(action.target, allValidIds);
      if (targetIds.length === 0) return { state, events, succeeded: false };

      let nextState = state;
      for (const targetId of targetIds) {
        for (let i = 0; i < amount; i++) {
          const result = attachDonToCard(nextState, controller, targetId);
          if (!result) break;
          nextState = result;
        }
      }

      events.push({ type: "DON_GIVEN_TO_CARD", playerIndex: controller, payload: { count: amount } });

      return { state: nextState, events, succeeded: true };
    }

    case "ADD_DON_FROM_DECK": {
      const amount = (params.amount as number) ?? 1;
      const targetState = (params.target_state as "ACTIVE" | "RESTED") ?? "ACTIVE";

      const p = state.players[controller];
      const count = Math.min(amount, p.donDeck.length);
      if (count === 0) return { state, events, succeeded: false };

      const added = p.donDeck.slice(0, count).map((d) => ({
        ...d,
        state: targetState,
        attachedTo: null,
      }));
      const newDonDeck = p.donDeck.slice(count);
      const newDonCostArea = [...p.donCostArea, ...added];

      const newPlayers = [...state.players] as [typeof state.players[0], typeof state.players[1]];
      newPlayers[controller] = { ...p, donDeck: newDonDeck, donCostArea: newDonCostArea };

      events.push({ type: "DON_PLACED_ON_FIELD", playerIndex: controller, payload: { count } });

      return {
        state: { ...state, players: newPlayers },
        events,
        succeeded: true,
      };
    }

    case "FORCE_OPPONENT_DON_RETURN": {
      const amount = (params.amount as number) ?? 1;
      const opp = controller === 0 ? 1 : 0;
      const p = state.players[opp];
      const count = Math.min(amount, p.donCostArea.length);
      if (count === 0) return { state, events, succeeded: false };

      const toReturn = p.donCostArea.slice(0, count);
      const newDonCostArea = p.donCostArea.slice(count);
      const newDonDeck = [...p.donDeck, ...toReturn.map((d) => ({ ...d, state: "ACTIVE" as const, attachedTo: null }))];

      const newPlayers = [...state.players] as [typeof state.players[0], typeof state.players[1]];
      newPlayers[opp] = { ...p, donCostArea: newDonCostArea, donDeck: newDonDeck };

      events.push({ type: "DON_DETACHED", playerIndex: opp as 0 | 1, payload: { count } });

      return {
        state: { ...state, players: newPlayers },
        events,
        succeeded: true,
      };
    }

    case "PLACE_HAND_TO_DECK": {
      const amount = (params.amount as number) ?? 1;
      const position = (params.position as "TOP" | "BOTTOM") ?? "BOTTOM";

      const p = state.players[controller];
      const count = Math.min(amount, p.hand.length);
      if (count === 0) return { state, events, succeeded: false };

      // Auto-select last cards from hand
      const toPlace = p.hand.slice(-count);
      const newHand = p.hand.slice(0, -count);
      const placedCards = toPlace.map((c) => ({ ...c, zone: "DECK" as const }));
      const newDeck = position === "BOTTOM"
        ? [...p.deck, ...placedCards]
        : [...placedCards, ...p.deck];

      const newPlayers = [...state.players] as [typeof state.players[0], typeof state.players[1]];
      newPlayers[controller] = { ...p, hand: newHand, deck: newDeck };

      return {
        state: { ...state, players: newPlayers },
        events,
        succeeded: true,
        result: { targetInstanceIds: toPlace.map((c) => c.instanceId), count },
      };
    }

    default:
      // Action type not yet implemented
      return { state, events, succeeded: true };
  }
}

// ─── Target Resolution ────────────────────────────────────────────────────────

/**
 * Returns ALL valid target candidates — no count limit applied.
 * Use this before deciding whether to prompt the player.
 */
function computeAllValidTargets(
  state: GameState,
  target: import("./effect-types.js").Target | undefined,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  sourceCardInstanceId: string,
  _resultRefs: Map<string, EffectResult>,
): string[] {
  if (!target) return [];
  const targetType = target.type;
  if (!targetType) return [];

  switch (targetType) {
    case "SELF": return [sourceCardInstanceId];
    case "YOUR_LEADER": return [state.players[controller].leader.instanceId];
    case "OPPONENT_LEADER": {
      const opp = controller === 0 ? 1 : 0;
      return [state.players[opp].leader.instanceId];
    }
    case "ALL_YOUR_CHARACTERS":
      return state.players[controller].characters.map((c) => c.instanceId);
    case "ALL_OPPONENT_CHARACTERS": {
      const opp = controller === 0 ? 1 : 0;
      return state.players[opp].characters.map((c) => c.instanceId);
    }
    case "CHARACTER":
    case "LEADER_OR_CHARACTER": {
      const ctrl = target.controller ?? "SELF";
      const pi = ctrl === "SELF" ? controller : ctrl === "OPPONENT" ? (controller === 0 ? 1 : 0) : -1;
      let candidates: import("../types.js").CardInstance[] = [];
      if (pi === -1) {
        candidates = [...state.players[0].characters, ...state.players[1].characters];
        if (targetType === "LEADER_OR_CHARACTER") candidates = [state.players[0].leader, ...candidates, state.players[1].leader];
      } else {
        candidates = [...state.players[pi].characters];
        if (targetType === "LEADER_OR_CHARACTER") candidates = [state.players[pi].leader, ...candidates];
      }
      if (target.filter) {
        candidates = candidates.filter((c) => {
          if (target.filter!.exclude_self && c.instanceId === sourceCardInstanceId) return false;
          return matchesFilterForTarget(c, target.filter!, cardDb, state);
        });
      }
      if (target.self_ref) return candidates.filter((c) => c.instanceId === sourceCardInstanceId).map((c) => c.instanceId);
      return candidates.map((c) => c.instanceId);
    }
    case "CARD_IN_HAND": {
      const ctrl = target.controller ?? "SELF";
      const pi = ctrl === "SELF" ? controller : (controller === 0 ? 1 : 0);
      let candidates = state.players[pi].hand;
      if (target.filter) candidates = candidates.filter((c) => matchesFilterForTarget(c, target.filter!, cardDb, state));
      return candidates.map((c) => c.instanceId);
    }
    default: return [];
  }
}

function autoSelectTargets(
  target: import("./effect-types.js").Target | undefined,
  allValidIds: string[],
): string[] {
  if (!target || allValidIds.length === 0) return [];
  const count = target.count;
  if (!count) return allValidIds.slice(0, 1);
  if ("all" in count) return allValidIds;
  if ("exact" in count) return allValidIds.slice(0, count.exact);
  if ("up_to" in count) return allValidIds.slice(0, count.up_to);
  if ("any_number" in count) return allValidIds;
  return allValidIds.slice(0, 1);
}

function needsPlayerTargetSelection(
  target: import("./effect-types.js").Target | undefined,
  allValidIds: string[],
): boolean {
  if (!target) return false;
  if (!target.type) return false;
  // Deterministic targets — never prompt
  const auto = ["SELF", "YOUR_LEADER", "OPPONENT_LEADER", "ALL_YOUR_CHARACTERS", "ALL_OPPONENT_CHARACTERS"];
  if (auto.includes(target.type)) return false;
  if (target.self_ref) return false;
  const count = target.count;
  if (!count) return allValidIds.length > 1;
  if ("all" in count || "any_number" in count) return false;
  const maxCount = "exact" in count ? count.exact : "up_to" in count ? count.up_to : 1;
  return allValidIds.length > maxCount;
}

function buildSelectTargetPrompt(
  state: GameState,
  action: import("./effect-types.js").Action,
  allValidIds: string[],
  sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  resultRefs: Map<string, EffectResult>,
): ActionResult {
  const count = action.target?.count;
  const countMin = (count && "exact" in count) ? count.exact : 0;
  const countMax = !count ? 1
    : "exact" in count ? count.exact
    : "up_to" in count ? count.up_to
    : allValidIds.length;

  const cards: import("../types.js").CardInstance[] = [];
  for (const id of allValidIds) {
    const c = findCardInstanceById(state, id);
    if (c) cards.push(c);
  }

  const sourceCard = findCardInstanceById(state, sourceCardInstanceId);
  const sourceCardData = sourceCard ? cardDb.get(sourceCard.cardId) : undefined;
  const effectDescription = sourceCardData?.effectText ?? "";

  const resumeCtx: ResumeContext = {
    effectSourceInstanceId: sourceCardInstanceId,
    controller,
    pausedAction: action,
    remainingActions: [], // filled in by executeActionChain
    resultRefs: [...resultRefs.entries()].map(([k, v]) => [k, v as unknown]),
    validTargets: allValidIds,
  };

  const pendingPrompt: PendingPromptState = {
    promptType: "SELECT_TARGET",
    options: { cards, validTargets: allValidIds, effectDescription, countMin, countMax, ctaLabel: "Confirm" },
    respondingPlayer: controller,
    resumeContext: resumeCtx,
  };

  return { state, events: [], succeeded: false, pendingPrompt };
}

export function resolveTargetInstances(
  state: GameState,
  target: import("./effect-types.js").Target | undefined,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  sourceCardInstanceId: string,
  _resultRefs: Map<string, EffectResult>,
): string[] {
  if (!target) return [];

  // Handle target_ref back-reference (from the action, not the target)
  // This is checked at the action level

  const targetType = target.type;
  if (!targetType) return [];

  switch (targetType) {
    case "SELF":
      return [sourceCardInstanceId];

    case "YOUR_LEADER":
      return [state.players[controller].leader.instanceId];

    case "OPPONENT_LEADER": {
      const opp = controller === 0 ? 1 : 0;
      return [state.players[opp].leader.instanceId];
    }

    case "ALL_YOUR_CHARACTERS":
      return state.players[controller].characters.map((c) => c.instanceId);

    case "ALL_OPPONENT_CHARACTERS": {
      const opp = controller === 0 ? 1 : 0;
      return state.players[opp].characters.map((c) => c.instanceId);
    }

    case "CHARACTER":
    case "LEADER_OR_CHARACTER": {
      const ctrl = target.controller ?? "SELF";
      const pi = ctrl === "SELF" ? controller : ctrl === "OPPONENT" ? (controller === 0 ? 1 : 0) : -1;

      let candidates: CardInstance[] = [];
      if (pi === -1) {
        // EITHER — both players
        candidates = [
          ...state.players[0].characters,
          ...state.players[1].characters,
        ];
        if (targetType === "LEADER_OR_CHARACTER") {
          candidates = [state.players[0].leader, ...candidates, state.players[1].leader];
        }
      } else {
        candidates = [...state.players[pi].characters];
        if (targetType === "LEADER_OR_CHARACTER") {
          candidates = [state.players[pi].leader, ...candidates];
        }
      }

      // Apply filter
      if (target.filter) {
        candidates = candidates.filter((c) => {
          if (target.filter!.exclude_self && c.instanceId === sourceCardInstanceId) return false;
          return matchesFilterForTarget(c, target.filter!, cardDb, state);
        });
      }

      // Apply self_ref
      if (target.self_ref) {
        return candidates.filter((c) => c.instanceId === sourceCardInstanceId).map((c) => c.instanceId);
      }

      // Apply count
      const count = target.count;
      if (!count) return candidates.slice(0, 1).map((c) => c.instanceId);
      if ("all" in count) return candidates.map((c) => c.instanceId);
      if ("exact" in count) return candidates.slice(0, count.exact).map((c) => c.instanceId);
      if ("up_to" in count) return candidates.slice(0, count.up_to).map((c) => c.instanceId);
      if ("any_number" in count) return candidates.map((c) => c.instanceId);

      return candidates.slice(0, 1).map((c) => c.instanceId);
    }

    case "CARD_IN_HAND": {
      const ctrl = target.controller ?? "SELF";
      const pi = ctrl === "SELF" ? controller : (controller === 0 ? 1 : 0);
      let candidates = state.players[pi].hand;

      if (target.filter) {
        candidates = candidates.filter((c) => matchesFilterForTarget(c, target.filter!, cardDb, state));
      }

      const count = target.count;
      if (!count) return candidates.slice(0, 1).map((c) => c.instanceId);
      if ("exact" in count) return candidates.slice(0, count.exact).map((c) => c.instanceId);
      if ("up_to" in count) return candidates.slice(0, count.up_to).map((c) => c.instanceId);

      return candidates.slice(0, 1).map((c) => c.instanceId);
    }

    default:
      return [];
  }
}

function matchesFilterForTarget(
  card: CardInstance,
  filter: import("./effect-types.js").TargetFilter,
  cardDb: Map<string, CardData>,
  state: GameState,
): boolean {
  // Reuse the condition evaluator's matchesFilter
  return matchesFilterImpl(card, filter, cardDb, state);
}

// Import matchesFilter from conditions
import { matchesFilter as matchesFilterImpl } from "./conditions.js";

// ─── State Mutation Helpers ───────────────────────────────────────────────────

function koCharacter(
  state: GameState,
  instanceId: string,
  causingController: 0 | 1,
): { state: GameState; events: PendingEvent[] } | null {
  for (const [pi, player] of state.players.entries()) {
    const charIdx = player.characters.findIndex((c) => c.instanceId === instanceId);
    if (charIdx === -1) continue;

    const char = player.characters[charIdx];
    const newChars = player.characters.filter((_, i) => i !== charIdx);

    // Return attached DON!! to cost area
    const returnedDon = char.attachedDon.map((d) => ({
      ...d,
      state: "RESTED" as const,
      attachedTo: null,
    }));

    const newTrash = [{ ...char, zone: "TRASH" as const, attachedDon: [], state: "ACTIVE" as const }, ...player.trash];

    const newPlayers = [...state.players] as [typeof state.players[0], typeof state.players[1]];
    newPlayers[pi] = {
      ...player,
      characters: newChars,
      trash: newTrash,
      donCostArea: [...player.donCostArea, ...returnedDon],
    };

    return {
      state: { ...state, players: newPlayers },
      events: [{
        type: "CARD_KO",
        playerIndex: pi as 0 | 1,
        payload: {
          cardInstanceId: instanceId,
          cardId: char.cardId,
          cause: "EFFECT",
          causingController,
        },
      }],
    };
  }
  return null;
}

function returnToHand(
  state: GameState,
  instanceId: string,
): { state: GameState; events: PendingEvent[] } | null {
  for (const [pi, player] of state.players.entries()) {
    const charIdx = player.characters.findIndex((c) => c.instanceId === instanceId);
    if (charIdx === -1) continue;

    const char = player.characters[charIdx];
    const newChars = player.characters.filter((_, i) => i !== charIdx);

    // Return attached DON!! to cost area
    const returnedDon = char.attachedDon.map((d) => ({
      ...d,
      state: "RESTED" as const,
      attachedTo: null,
    }));

    const newHand = [...player.hand, { ...char, zone: "HAND" as const, attachedDon: [], state: "ACTIVE" as const }];

    const newPlayers = [...state.players] as [typeof state.players[0], typeof state.players[1]];
    newPlayers[pi] = {
      ...player,
      characters: newChars,
      hand: newHand,
      donCostArea: [...player.donCostArea, ...returnedDon],
    };

    return {
      state: { ...state, players: newPlayers },
      events: [{
        type: "CARD_RETURNED_TO_HAND",
        playerIndex: pi as 0 | 1,
        payload: { cardInstanceId: instanceId, cardId: char.cardId },
      }],
    };
  }
  return null;
}

function setCardState(state: GameState, instanceId: string, newState: "ACTIVE" | "RESTED"): GameState {
  for (const [pi, player] of state.players.entries()) {
    if (player.leader.instanceId === instanceId) {
      const newPlayers = [...state.players] as [typeof state.players[0], typeof state.players[1]];
      newPlayers[pi] = { ...player, leader: { ...player.leader, state: newState } };
      return { ...state, players: newPlayers };
    }
    const charIdx = player.characters.findIndex((c) => c.instanceId === instanceId);
    if (charIdx !== -1) {
      const newChars = [...player.characters];
      newChars[charIdx] = { ...newChars[charIdx], state: newState };
      const newPlayers = [...state.players] as [typeof state.players[0], typeof state.players[1]];
      newPlayers[pi] = { ...player, characters: newChars };
      return { ...state, players: newPlayers };
    }
  }
  return state;
}

function attachDonToCard(
  state: GameState,
  controller: 0 | 1,
  targetInstanceId: string,
): GameState | null {
  const p = state.players[controller];
  const activeDon = p.donCostArea.find((d) => d.state === "ACTIVE");
  if (!activeDon) return null;

  const newDonCostArea = p.donCostArea.filter((d) => d.instanceId !== activeDon.instanceId);
  const attachedDon = { ...activeDon, attachedTo: targetInstanceId };

  // Find the target card and attach
  const newPlayers = [...state.players] as [typeof state.players[0], typeof state.players[1]];
  let pp = { ...p, donCostArea: newDonCostArea };

  if (pp.leader.instanceId === targetInstanceId) {
    pp = { ...pp, leader: { ...pp.leader, attachedDon: [...pp.leader.attachedDon, attachedDon] } };
  } else {
    const charIdx = pp.characters.findIndex((c) => c.instanceId === targetInstanceId);
    if (charIdx !== -1) {
      const newChars = [...pp.characters];
      newChars[charIdx] = { ...newChars[charIdx], attachedDon: [...newChars[charIdx].attachedDon, attachedDon] };
      pp = { ...pp, characters: newChars };
    }
  }

  newPlayers[controller] = pp;
  return { ...state, players: newPlayers };
}

function findCardInstanceById(state: GameState, instanceId: string): CardInstance | null {
  for (const player of state.players) {
    if (player.leader.instanceId === instanceId) return player.leader;
    const char = player.characters.find((c) => c.instanceId === instanceId);
    if (char) return char;
    if (player.stage?.instanceId === instanceId) return player.stage;
    const hand = player.hand.find((c) => c.instanceId === instanceId);
    if (hand) return hand;
    const trash = player.trash.find((c) => c.instanceId === instanceId);
    if (trash) return trash;
  }
  return null;
}

// ─── Choice Label Generation ─────────────────────────────────────────────────

const ACTION_LABELS: Record<string, string> = {
  DRAW: "Draw cards",
  SEARCH_DECK: "Search deck",
  KO: "KO a character",
  RETURN_TO_HAND: "Return to hand",
  RETURN_TO_DECK: "Return to deck",
  MODIFY_POWER: "Modify power",
  MODIFY_COST: "Modify cost",
  GRANT_KEYWORD: "Grant keyword",
  TRASH_CARD: "Trash a card",
  TRASH_FROM_HAND: "Trash from hand",
  GIVE_DON: "Give DON!!",
  SET_ACTIVE: "Set active",
  SET_REST: "Set to rest",
  OPPONENT_ACTION: "Opponent action",
  ADD_DON_FROM_DECK: "Add DON!! from deck",
  PLAY_CARD: "Play a card",
  MILL: "Trash from deck",
};

function describeActionBranch(actions: Action[]): string {
  if (actions.length === 0) return "Do nothing";
  const labels = actions
    .map((a) => ACTION_LABELS[a.type] ?? a.type.replace(/_/g, " ").toLowerCase())
    .slice(0, 2);
  return labels.join(", then ");
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function markOncePerTurnUsed(state: GameState, effectBlockId: string, instanceId: string): GameState {
  const used = { ...state.turn.oncePerTurnUsed };
  const existing = used[effectBlockId] ? [...used[effectBlockId]] : [];
  existing.push(instanceId);
  used[effectBlockId] = existing;
  return {
    ...state,
    turn: { ...state.turn, oncePerTurnUsed: used },
  };
}

function resolveAmount(
  amount: number | { type: string; [key: string]: unknown } | undefined,
  resultRefs: Map<string, EffectResult>,
): number {
  if (typeof amount === "number") return amount;
  if (!amount) return 0;

  if (amount.type === "FIXED") return (amount as any).value ?? 0;
  if (amount.type === "PER_COUNT") {
    const multiplier = (amount as any).multiplier as number ?? 1;
    // For PER_COUNT, we'd look at cost results or game state
    // Simplified for now
    return multiplier;
  }
  if (amount.type === "ACTION_RESULT") {
    const ref = (amount as any).ref as string;
    const result = resultRefs.get(ref);
    return result?.count ?? 0;
  }

  return 0;
}

function computeExpiry(duration: Duration, state: GameState): ExpiryTiming {
  switch (duration.type) {
    case "THIS_TURN":
      return { wave: "END_OF_TURN", turn: state.turn.number };
    case "THIS_BATTLE":
      return { wave: "END_OF_BATTLE", battleId: state.turn.battle?.battleId ?? "" };
    case "UNTIL_END_OF_OPPONENT_NEXT_END_PHASE": {
      const oppTurn = state.turn.activePlayerIndex === 0 ? state.turn.number + 1 : state.turn.number + 2;
      return { wave: "END_OF_END_PHASE", turn: oppTurn };
    }
    case "UNTIL_START_OF_YOUR_NEXT_TURN":
      return { wave: "REFRESH_PHASE", turn: state.turn.number + 2 };
    case "PERMANENT":
      return { wave: "SOURCE_LEAVES_ZONE" };
    case "WHILE_CONDITION":
      return { wave: "CONDITION_FALSE" };
    default:
      return { wave: "END_OF_TURN", turn: state.turn.number };
  }
}

// ─── Resume after player prompt response ──────────────────────────────────────

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
    const params = pausedAction.params ?? {} as any;
    const restDest = ((params as any).rest_destination as string) ?? "BOTTOM";

    const p = nextState.players[controller];
    const keptId = action.keptCardInstanceId;
    const ordered = action.orderedInstanceIds ?? [];

    // Cards being removed from deck = kept card + arranged rest
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

    // Arrange remaining shown cards per player's chosen order, then place at destination
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
