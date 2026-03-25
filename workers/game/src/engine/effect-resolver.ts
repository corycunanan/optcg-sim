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
  PendingEvent,
} from "../types.js";
import { evaluateCondition, type ConditionContext } from "./conditions.js";
import { nanoid } from "../util/nanoid.js";

export interface EffectResolverResult {
  state: GameState;
  events: PendingEvent[];
  resolved: boolean;
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

  // Step 2: Check optional flag
  // In a real implementation, this would prompt the player.
  // For now, auto-resolve: always activate if conditions are met.
  // (The WebSocket layer will handle prompting in the future.)

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
}

function executeActionChain(
  state: GameState,
  actions: Action[],
  sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
): ChainResult {
  const events: PendingEvent[] = [];
  const resultRefs = new Map<string, EffectResult>();
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
}

function executeEffectAction(
  state: GameState,
  action: Action,
  sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  resultRefs: Map<string, EffectResult>,
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

      // Resolve target(s) — for now, auto-select based on target spec
      const targetIds = resolveTargetInstances(state, action.target, controller, cardDb, sourceCardInstanceId, resultRefs);
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
      const targetIds = resolveTargetInstances(state, action.target, controller, cardDb, sourceCardInstanceId, resultRefs);
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
      const targetIds = resolveTargetInstances(state, action.target, controller, cardDb, sourceCardInstanceId, resultRefs);
      if (targetIds.length === 0) return { state, events, succeeded: false };

      let nextState = state;
      for (const id of targetIds) {
        const result = koCharacter(nextState, id, controller);
        if (result) {
          nextState = result.state;
          events.push(...result.events);
        }
      }

      return {
        state: nextState,
        events,
        succeeded: targetIds.length > 0,
        result: { targetInstanceIds: targetIds, count: targetIds.length },
      };
    }

    case "RETURN_TO_HAND": {
      const targetIds = resolveTargetInstances(state, action.target, controller, cardDb, sourceCardInstanceId, resultRefs);
      if (targetIds.length === 0) return { state, events, succeeded: false };

      let nextState = state;
      for (const id of targetIds) {
        const result = returnToHand(nextState, id);
        if (result) {
          nextState = result.state;
          events.push(...result.events);
        }
      }

      return {
        state: nextState,
        events,
        succeeded: targetIds.length > 0,
        result: { targetInstanceIds: targetIds, count: targetIds.length },
      };
    }

    case "SEARCH_DECK": {
      const lookAt = (params.look_at as number) ?? 5;
      const pickUpTo = ((params.pick as any)?.up_to as number) ?? 1;
      const filter = (params.filter as any) ?? {};
      const restDest = (params.rest_destination as string) ?? "BOTTOM";

      const p = state.players[controller];
      const topCards = p.deck.slice(0, Math.min(lookAt, p.deck.length));

      // Find matching cards
      const matching = topCards.filter((c) => {
        const data = cardDb.get(c.cardId);
        if (!data) return false;
        // Basic filter matching
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

      // Pick up to N
      const picked = matching.slice(0, pickUpTo);
      const pickedIds = new Set(picked.map((c) => c.instanceId));
      const remaining = topCards.filter((c) => !pickedIds.has(c.instanceId));
      const restOfDeck = p.deck.slice(Math.min(lookAt, p.deck.length));

      // Add picked to hand
      const newHand = [...p.hand, ...picked.map((c) => ({ ...c, zone: "HAND" as const }))];

      // Place rest at destination
      let newDeck: CardInstance[];
      if (restDest === "BOTTOM") {
        newDeck = [...restOfDeck, ...remaining];
      } else {
        newDeck = [...remaining, ...restOfDeck];
      }

      const newPlayers = [...state.players] as [typeof state.players[0], typeof state.players[1]];
      newPlayers[controller] = { ...p, deck: newDeck, hand: newHand };

      for (const card of picked) {
        events.push({ type: "CARD_DRAWN", playerIndex: controller, payload: { cardId: card.cardId, source: "search" } });
      }

      return {
        state: { ...state, players: newPlayers },
        events,
        succeeded: picked.length > 0,
        result: { targetInstanceIds: picked.map((c) => c.instanceId), count: picked.length },
      };
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
      const targetIds = resolveTargetInstances(state, action.target, controller, cardDb, sourceCardInstanceId, resultRefs);

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

    case "PLAYER_CHOICE":
    case "OPPONENT_CHOICE": {
      // For now, auto-select the first option
      const options = params.options as Action[][];
      if (!options || options.length === 0) return { state, events, succeeded: false };

      const chosenBranch = options[0];
      const result = executeActionChain(state, chosenBranch, sourceCardInstanceId, controller, cardDb);

      return {
        state: result.state,
        events: [...events, ...result.events],
        succeeded: true,
      };
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
      const targetIds = resolveTargetInstances(state, action.target, controller, cardDb, sourceCardInstanceId, resultRefs);
      let nextState = state;

      for (const id of targetIds) {
        nextState = setCardState(nextState, id, "ACTIVE");
      }

      return { state: nextState, events, succeeded: targetIds.length > 0 };
    }

    case "SET_REST": {
      const targetIds = resolveTargetInstances(state, action.target, controller, cardDb, sourceCardInstanceId, resultRefs);
      let nextState = state;

      for (const id of targetIds) {
        nextState = setCardState(nextState, id, "RESTED");
        events.push({ type: "CARD_STATE_CHANGED", playerIndex: controller, payload: { targetInstanceId: id, newState: "RESTED" } });
      }

      return { state: nextState, events, succeeded: targetIds.length > 0 };
    }

    case "GIVE_DON": {
      const amount = (params.amount as number) ?? 1;
      const targetIds = resolveTargetInstances(state, action.target, controller, cardDb, sourceCardInstanceId, resultRefs);
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

function resolveTargetInstances(
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
