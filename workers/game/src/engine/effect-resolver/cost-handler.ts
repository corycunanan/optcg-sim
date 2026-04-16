/**
 * Cost payment logic — auto-payable and player-selection costs.
 */

import type {
  ChoiceCost,
  Cost,
  CostResult,
  EffectBlock,
  SimpleCost,
} from "../effect-types.js";
import type {
  CardData,
  CardInstance,
  GameState,
  PendingEvent,
  PendingPromptState,
  EffectStackFrame,
} from "../../types.js";
import { generateFrameId, pushFrame } from "../effect-stack.js";
import type { CostPaymentResult, CostSelectionResult } from "./types.js";
import { setCardState } from "./card-mutations.js";
import { costResultToEntries } from "./types.js";

// ─── Filter helpers ──────────────────────────────────────────────────────────

function matchesHandFilter(data: CardData, filter: NonNullable<SimpleCost["filter"]>): boolean {
  if (filter.traits && !filter.traits.every((t) => (data.types ?? []).includes(t))) return false;
  if (filter.traits_contains) {
    const cardTraits = data.types ?? [];
    if (!filter.traits_contains.every((t) => cardTraits.some((tr) => tr.includes(t)))) return false;
  }
  if (filter.color && !(data.color ?? []).some((clr) => filter.color!.includes(clr as never))) return false;
  if (filter.name && data.name !== filter.name) return false;
  if (filter.name_any_of && !filter.name_any_of.includes(data.name)) return false;
  return true;
}

// ─── payCosts (auto-payable) ─────────────────────────────────────────────────

export function payCosts(
  state: GameState,
  costs: Cost[],
  controller: 0 | 1,
  _cardDb: Map<string, CardData>,
  sourceCardInstanceId?: string,
): CostPaymentResult | null {
  const events: PendingEvent[] = [];
  const costResult: CostResult = {
    donRestedCount: 0,
    cardsTrashedCount: 0,
    cardsReturnedCount: 0,
    cardsPlacedToDeckCount: 0,
    charactersKoCount: 0,
    cardsTrashedInstanceIds: [],
    cardsReturnedInstanceIds: [],
    charactersKoInstanceIds: [],
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
          ...player.characters.filter(Boolean).flatMap((c) => c!.attachedDon),
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
        if (!sourceCardInstanceId) return null;
        nextState = setCardState(nextState, sourceCardInstanceId, "RESTED");
        events.push({
          type: "CARD_STATE_CHANGED",
          playerIndex: controller,
          payload: { targetInstanceId: sourceCardInstanceId, newState: "RESTED" },
        });
        break;
      }

      case "TRASH_SELF": {
        if (!sourceCardInstanceId) return null;
        // Trash the source card (the card whose effect is being activated)
        let found = false;
        for (let pIdx = 0; pIdx < 2; pIdx++) {
          const player = nextState.players[pIdx as 0 | 1];
          const charIdx = player.characters.findIndex(
            (c) => c?.instanceId === sourceCardInstanceId,
          );
          if (charIdx !== -1) {
            const card = player.characters[charIdx]!;
            const newChars = [...player.characters] as (typeof player.characters);
            newChars[charIdx] = null;
            const newTrash = [{ ...card, zone: "TRASH" as const, attachedDon: [] as typeof card.attachedDon }, ...player.trash];
            const returnedDon = card.attachedDon.map((d) => ({ ...d, state: "RESTED" as const, attachedTo: null }));
            const newPlayers = [...nextState.players] as [typeof nextState.players[0], typeof nextState.players[1]];
            newPlayers[pIdx as 0 | 1] = {
              ...player,
              characters: newChars,
              trash: newTrash,
              donCostArea: [...player.donCostArea, ...returnedDon],
            };
            nextState = { ...nextState, players: newPlayers };
            events.push({ type: "CARD_TRASHED", playerIndex: pIdx as 0 | 1, payload: { cardInstanceId: card.instanceId, cardId: card.cardId, reason: "cost" } });
            costResult.cardsTrashedCount = 1;
            costResult.cardsTrashedInstanceIds.push(card.instanceId);
            found = true;
            break;
          }
          if (player.stage?.instanceId === sourceCardInstanceId) {
            const card = player.stage;
            const newTrash = [{ ...card, zone: "TRASH" as const, attachedDon: [] as typeof card.attachedDon }, ...player.trash];
            const newPlayers = [...nextState.players] as [typeof nextState.players[0], typeof nextState.players[1]];
            newPlayers[pIdx as 0 | 1] = { ...player, stage: null, trash: newTrash };
            nextState = { ...nextState, players: newPlayers };
            events.push({ type: "CARD_TRASHED", playerIndex: pIdx as 0 | 1, payload: { cardInstanceId: card.instanceId, cardId: card.cardId, reason: "cost" } });
            costResult.cardsTrashedCount = 1;
            costResult.cardsTrashedInstanceIds.push(card.instanceId);
            found = true;
            break;
          }
        }
        if (!found) return null;
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
            return matchesHandFilter(data, cost.filter!);
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
        costResult.cardsTrashedInstanceIds.push(...toTrash.map((c) => c.instanceId));
        events.push({ type: "CARD_TRASHED", playerIndex: controller, payload: { count: amount, reason: "cost" } });
        break;
      }

      case "LIFE_TO_HAND": {
        const amount = typeof cost.amount === "number" ? cost.amount : 1;
        const position = (cost as any).position ?? "TOP";
        if (position === "TOP_OR_BOTTOM") return null; // Needs player selection
        const p = nextState.players[controller];
        if (p.life.length < amount) return null;

        const removed = position === "TOP" ? p.life.slice(0, amount) : p.life.slice(-amount);
        const newLife = position === "TOP" ? p.life.slice(amount) : p.life.slice(0, -amount);

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
        events.push({ type: "CARD_ADDED_TO_HAND_FROM_LIFE", playerIndex: controller, payload: { count: amount } });
        break;
      }

      case "TURN_LIFE_FACE_UP": {
        const amount = typeof cost.amount === "number" ? cost.amount : 1;
        const p = nextState.players[controller];
        // Find face-down life cards (from top)
        const faceDownIndices: number[] = [];
        for (let i = 0; i < p.life.length && faceDownIndices.length < amount; i++) {
          if (p.life[i].face === "DOWN") faceDownIndices.push(i);
        }
        if (faceDownIndices.length < amount) return null;

        const newLife = p.life.map((card, i) =>
          faceDownIndices.includes(i) ? { ...card, face: "UP" as const } : card,
        );
        const newPlayers = [...nextState.players] as [typeof nextState.players[0], typeof nextState.players[1]];
        newPlayers[controller] = { ...p, life: newLife };
        nextState = { ...nextState, players: newPlayers };
        events.push({ type: "LIFE_CARD_TURNED_FACE_UP", playerIndex: controller, payload: { count: amount } });
        break;
      }

      case "TURN_LIFE_FACE_DOWN": {
        const amount = typeof cost.amount === "number" ? cost.amount : 1;
        const p = nextState.players[controller];
        // Find face-up life cards
        const faceUpIndices: number[] = [];
        for (let i = 0; i < p.life.length && faceUpIndices.length < amount; i++) {
          if (p.life[i].face === "UP") faceUpIndices.push(i);
        }
        if (faceUpIndices.length < amount) return null;

        const newLife = p.life.map((card, i) =>
          faceUpIndices.includes(i) ? { ...card, face: "DOWN" as const } : card,
        );
        const newPlayers = [...nextState.players] as [typeof nextState.players[0], typeof nextState.players[1]];
        newPlayers[controller] = { ...p, life: newLife };
        nextState = { ...nextState, players: newPlayers };
        events.push({ type: "LIFE_CARD_TURNED_FACE_DOWN", playerIndex: controller, payload: { count: amount } });
        break;
      }

      case "REST_DON": {
        // Alias for DON_REST — rest N active DON in cost area
        const amount = typeof cost.amount === "number" ? cost.amount : 1;
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

      case "PLACE_FROM_TRASH_TO_DECK": {
        const amount = typeof cost.amount === "number" ? cost.amount : 1;
        const p = nextState.players[controller];
        if (p.trash.length < amount) return null;

        // Auto-select from trash (player selection handled by payCostsWithSelection)
        const toMove = p.trash.slice(0, amount);
        const newTrash = p.trash.slice(amount);
        const newDeck = [...p.deck, ...toMove.map((c) => ({ ...c, zone: "DECK" as const }))];

        const newPlayers = [...nextState.players] as [typeof nextState.players[0], typeof nextState.players[1]];
        newPlayers[controller] = { ...p, trash: newTrash, deck: newDeck };
        nextState = { ...nextState, players: newPlayers };
        break;
      }

      case "LEADER_POWER_REDUCTION": {
        // This is tracked as a temporary power modifier on the leader
        // For cost payment, we just verify the leader exists
        const p = nextState.players[controller];
        if (!p.leader) return null;
        // Power reduction is applied as an active effect by the caller
        break;
      }

      case "GIVE_OPPONENT_DON": {
        const amount = typeof cost.amount === "number" ? cost.amount : 1;
        const p = nextState.players[controller];
        const opp = controller === 0 ? 1 : 0;
        const unattached = p.donCostArea.filter((d) => !d.attachedTo);
        if (unattached.length < amount) return null;

        const toGive = unattached.slice(0, amount);
        const toGiveIds = new Set(toGive.map((d) => d.instanceId));
        const remaining = p.donCostArea.filter((d) => !toGiveIds.has(d.instanceId));
        const given = toGive.map((d) => ({ ...d, state: "ACTIVE" as const, attachedTo: null }));

        const newPlayers = [...nextState.players] as [typeof nextState.players[0], typeof nextState.players[1]];
        newPlayers[controller] = { ...p, donCostArea: remaining };
        newPlayers[opp as 0 | 1] = { ...nextState.players[opp as 0 | 1], donCostArea: [...nextState.players[opp as 0 | 1].donCostArea, ...given] };
        nextState = { ...nextState, players: newPlayers };
        break;
      }

      case "VARIABLE_DON_RETURN": {
        // Return a variable number of DON from field to DON deck (like DON_MINUS but amount varies)
        const amount = typeof cost.amount === "number" ? cost.amount : 0;
        if (amount === 0) break;
        const p = nextState.players[controller];
        const unattached = p.donCostArea.filter((d) => !d.attachedTo);
        if (unattached.length < amount) return null;

        const toReturn = unattached.slice(0, amount);
        const toReturnIds = new Set(toReturn.map((d) => d.instanceId));
        const remaining = p.donCostArea.filter((d) => !toReturnIds.has(d.instanceId));
        const returned = toReturn.map((d) => ({ ...d, state: "ACTIVE" as const, attachedTo: null }));

        const newPlayers = [...nextState.players] as [typeof nextState.players[0], typeof nextState.players[1]];
        newPlayers[controller] = { ...p, donCostArea: remaining, donDeck: [...p.donDeck, ...returned] };
        nextState = { ...nextState, players: newPlayers };
        break;
      }

      case "PLACE_STAGE_TO_DECK": {
        const p = nextState.players[controller];
        if (!p.stage) return null;

        const stage = p.stage;
        const newDeck = [...p.deck, { ...stage, zone: "DECK" as const }];
        const newPlayers = [...nextState.players] as [typeof nextState.players[0], typeof nextState.players[1]];
        newPlayers[controller] = { ...p, stage: null, deck: newDeck };
        nextState = { ...nextState, players: newPlayers };
        events.push({ type: "CARD_RETURNED_TO_DECK", playerIndex: controller, payload: { cardInstanceId: stage.instanceId } });
        break;
      }

      case "TRASH_OWN_STAGE": {
        const p = nextState.players[controller];
        if (!p.stage) return null;
        if (cost.filter) {
          const data = _cardDb.get(p.stage.cardId);
          if (!data || !matchesHandFilter(data, cost.filter)) return null;
        }
        const stage = p.stage;
        const newTrash = [{ ...stage, zone: "TRASH" as const, attachedDon: [] as typeof stage.attachedDon }, ...p.trash];
        const returnedDon = stage.attachedDon.map((d) => ({ ...d, state: "RESTED" as const, attachedTo: null }));
        const newPlayers = [...nextState.players] as [typeof nextState.players[0], typeof nextState.players[1]];
        newPlayers[controller] = {
          ...p,
          stage: null,
          trash: newTrash,
          donCostArea: [...p.donCostArea, ...returnedDon],
        };
        nextState = { ...nextState, players: newPlayers };
        events.push({ type: "CARD_TRASHED", playerIndex: controller, payload: { cardInstanceId: stage.instanceId, cardId: stage.cardId, reason: "cost" } });
        costResult.cardsTrashedCount += 1;
        costResult.cardsTrashedInstanceIds.push(stage.instanceId);
        break;
      }

      case "RETURN_ATTACHED_DON_TO_COST": {
        // Detach DON from a card and return to cost area
        const amount = typeof cost.amount === "number" ? cost.amount : 1;
        if (!sourceCardInstanceId) return null;

        let found = false;
        for (let pIdx = 0; pIdx < 2 && !found; pIdx++) {
          const player = nextState.players[pIdx as 0 | 1];
          // Check characters
          const charIdx = player.characters.findIndex((c) => c?.instanceId === sourceCardInstanceId);
          if (charIdx !== -1) {
            const char = player.characters[charIdx]!;
            const detachCount = Math.min(amount, char.attachedDon.length);
            if (detachCount === 0) return null;
            const detached = char.attachedDon.slice(0, detachCount).map((d: any) => ({ ...d, state: "RESTED" as const, attachedTo: null }));
            const remainingDon = char.attachedDon.slice(detachCount);
            const newChars = [...player.characters] as (typeof player.characters);
            newChars[charIdx] = { ...char, attachedDon: remainingDon };
            const newPlayers = [...nextState.players] as [typeof nextState.players[0], typeof nextState.players[1]];
            newPlayers[pIdx as 0 | 1] = { ...player, characters: newChars, donCostArea: [...player.donCostArea, ...detached] };
            nextState = { ...nextState, players: newPlayers };
            found = true;
          }
          // Check leader
          if (!found && player.leader?.instanceId === sourceCardInstanceId) {
            const leader = player.leader;
            const detachCount = Math.min(amount, leader.attachedDon.length);
            if (detachCount === 0) return null;
            const detached = leader.attachedDon.slice(0, detachCount).map((d: any) => ({ ...d, state: "RESTED" as const, attachedTo: null }));
            const remainingDon = leader.attachedDon.slice(detachCount);
            const newPlayers = [...nextState.players] as [typeof nextState.players[0], typeof nextState.players[1]];
            newPlayers[pIdx as 0 | 1] = { ...player, leader: { ...leader, attachedDon: remainingDon }, donCostArea: [...player.donCostArea, ...detached] };
            nextState = { ...nextState, players: newPlayers };
            found = true;
          }
        }
        if (!found) return null;
        break;
      }

      case "PLACE_SELF_AND_HAND_TO_DECK": {
        if (!sourceCardInstanceId) return null;
        const p = nextState.players[controller];
        // Move source card + specified hand cards to deck bottom
        // For auto-pay, just move the source card
        let found = false;
        const charIdx = p.characters.findIndex((c) => c?.instanceId === sourceCardInstanceId);
        if (charIdx !== -1) {
          const card = p.characters[charIdx]!;
          const newChars = [...p.characters] as (typeof p.characters);
          newChars[charIdx] = null;
          const newDeck = [...p.deck, { ...card, zone: "DECK" as const }];
          const newPlayers = [...nextState.players] as [typeof nextState.players[0], typeof nextState.players[1]];
          newPlayers[controller] = { ...p, characters: newChars, deck: newDeck };
          nextState = { ...nextState, players: newPlayers };
          found = true;
        }
        if (!found) return null;
        break;
      }

      case "PLAY_NAMED_CARD_FROM_HAND": {
        // Play a specific named card from hand as part of the cost
        const p = nextState.players[controller];
        const cardName = (cost as any).card_name;
        if (!cardName) return null;
        const handIdx = p.hand.findIndex((c) => {
          const data = _cardDb.get(c.cardId);
          return data && data.name === cardName;
        });
        if (handIdx === -1) return null;
        // Card will be played by the action chain — just verify it exists
        break;
      }

      default:
        // Unrecognized cost type — skip
        break;
    }
  }

  return { state: nextState, events, costResult };
}

// ─── Cost Payment with Player Selection ───────────────────────────────────────

const SELECTION_COST_TYPES: Set<string> = new Set([
  "TRASH_FROM_HAND",
  "KO_OWN_CHARACTER",
  "RETURN_OWN_CHARACTER_TO_HAND",
  "PLACE_OWN_CHARACTER_TO_DECK",
  "TRASH_FROM_LIFE",
  "PLACE_HAND_TO_DECK",
  "REST_CARDS",
  "REST_NAMED_CARD",
  "TRASH_OWN_CHARACTER",
  "REVEAL_FROM_HAND",
  "CHOOSE_ONE_COST",
]);

export function costNeedsPlayerSelection(cost: Cost): boolean {
  if (cost.type === "LIFE_TO_HAND" && (cost as any).position === "TOP_OR_BOTTOM") return true;
  return SELECTION_COST_TYPES.has(cost.type);
}

function resolveAmount(cost: SimpleCost, fallback = 1): number {
  return typeof cost.amount === "number" ? cost.amount : fallback;
}

/**
 * Determine whether a single cost is payable in the current state.
 * Pure predicate — no state mutation.
 */
export function isCostPayable(
  state: GameState,
  cost: Cost,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  sourceCardInstanceId?: string,
): boolean {
  if (cost.type === "CHOICE") {
    return (cost as ChoiceCost).options.some((branch) =>
      branch.every((c) => isCostPayable(state, c, controller, cardDb, sourceCardInstanceId)),
    );
  }

  if (cost.type === "CHOOSE_ONE_COST") {
    const opts = (cost as SimpleCost).options ?? [];
    return opts.some((o) => isCostPayable(state, o, controller, cardDb, sourceCardInstanceId));
  }

  if (costNeedsPlayerSelection(cost)) {
    if (cost.type === "LIFE_TO_HAND" && (cost as SimpleCost).position === "TOP_OR_BOTTOM") {
      return state.players[controller].life.length > 0;
    }
    const targets = computeCostTargets(state, cost, controller, cardDb);
    const amt = cost.type === "REST_CARDS" && (cost as SimpleCost).amount === "ANY_NUMBER"
      ? 1
      : resolveAmount(cost as SimpleCost);
    return targets.length >= amt;
  }

  const player = state.players[controller];
  const simple = cost as SimpleCost;

  switch (cost.type) {
    case "DON_MINUS": {
      const amt = resolveAmount(simple, 0);
      const allFieldDon = [
        ...player.donCostArea,
        ...player.leader.attachedDon,
        ...player.characters.filter(Boolean).flatMap((c) => c!.attachedDon),
      ];
      return allFieldDon.length >= amt;
    }

    case "DON_REST":
    case "REST_DON": {
      if (simple.amount === "ANY_NUMBER") return true;
      const amt = resolveAmount(simple);
      if (amt === 0) return false;
      return player.donCostArea.filter((d) => d.state === "ACTIVE").length >= amt;
    }

    case "VARIABLE_DON_RETURN": {
      const amt = resolveAmount(simple, 0);
      if (amt === 0) return true;
      return player.donCostArea.filter((d) => !d.attachedTo).length >= amt;
    }

    case "REST_SELF":
      return !!sourceCardInstanceId;

    case "TRASH_SELF": {
      if (!sourceCardInstanceId) return false;
      for (let pIdx = 0; pIdx < 2; pIdx++) {
        const p = state.players[pIdx as 0 | 1];
        if (p.characters.some((c) => c?.instanceId === sourceCardInstanceId)) return true;
        if (p.stage?.instanceId === sourceCardInstanceId) return true;
      }
      return false;
    }

    case "LIFE_TO_HAND": {
      const amt = resolveAmount(simple);
      return player.life.length >= amt;
    }

    case "TURN_LIFE_FACE_UP": {
      const amt = resolveAmount(simple);
      return player.life.filter((l) => l.face === "DOWN").length >= amt;
    }

    case "TURN_LIFE_FACE_DOWN": {
      const amt = resolveAmount(simple);
      return player.life.filter((l) => l.face === "UP").length >= amt;
    }

    case "PLACE_FROM_TRASH_TO_DECK": {
      const amt = resolveAmount(simple);
      return player.trash.length >= amt;
    }

    case "LEADER_POWER_REDUCTION":
      return !!player.leader;

    case "GIVE_OPPONENT_DON": {
      const amt = resolveAmount(simple);
      return player.donCostArea.filter((d) => !d.attachedTo).length >= amt;
    }

    case "PLACE_STAGE_TO_DECK":
      return !!player.stage;

    case "TRASH_OWN_STAGE": {
      if (!player.stage) return false;
      if (!simple.filter) return true;
      const data = cardDb.get(player.stage.cardId);
      if (!data) return false;
      return matchesHandFilter(data, simple.filter);
    }

    case "RETURN_ATTACHED_DON_TO_COST": {
      if (!sourceCardInstanceId) return false;
      const amt = resolveAmount(simple);
      for (let pIdx = 0; pIdx < 2; pIdx++) {
        const p = state.players[pIdx as 0 | 1];
        const charIdx = p.characters.findIndex((c) => c?.instanceId === sourceCardInstanceId);
        if (charIdx !== -1) return p.characters[charIdx]!.attachedDon.length >= amt;
        if (p.leader?.instanceId === sourceCardInstanceId) return p.leader.attachedDon.length >= amt;
      }
      return false;
    }

    case "PLACE_SELF_AND_HAND_TO_DECK": {
      if (!sourceCardInstanceId) return false;
      return player.characters.some((c) => c?.instanceId === sourceCardInstanceId);
    }

    case "PLAY_NAMED_CARD_FROM_HAND": {
      const cardName = (simple as any).card_name;
      if (!cardName) return false;
      return player.hand.some((c) => {
        const data = cardDb.get(c.cardId);
        return data && data.name === cardName;
      });
    }

    default:
      return true;
  }
}

/**
 * Pay costs iteratively. Auto-payable costs are paid inline.
 * Selection-based costs push a stack frame and return a prompt.
 */
export function payCostsWithSelection(
  state: GameState,
  costs: Cost[],
  startIndex: number,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  sourceCardInstanceId: string,
  effectBlock: EffectBlock,
): CostSelectionResult {
  const events: PendingEvent[] = [];
  let nextState = state;
  const costResult: CostResult = {
    donRestedCount: 0,
    cardsTrashedCount: 0,
    cardsReturnedCount: 0,
    cardsPlacedToDeckCount: 0,
    charactersKoCount: 0,
    cardsTrashedInstanceIds: [],
    cardsReturnedInstanceIds: [],
    charactersKoInstanceIds: [],
  };

  // Use a mutable copy so CHOOSE_ONE_COST auto-select can replace the slot.
  const workingCosts = [...costs];
  for (let i = startIndex; i < workingCosts.length; i++) {
    const cost = workingCosts[i];

    // CHOOSE_ONE_COST — present payable options to the player.
    if (cost.type === "CHOOSE_ONE_COST") {
      const options = cost.options ?? [];
      const payableIndices: number[] = [];
      for (let oi = 0; oi < options.length; oi++) {
        if (isCostPayable(nextState, options[oi], controller, cardDb, sourceCardInstanceId)) {
          payableIndices.push(oi);
        }
      }

      if (payableIndices.length === 0) {
        return { state: nextState, events, cannotPay: true };
      }

      if (payableIndices.length === 1) {
        // Auto-select: replace slot and retry this index.
        workingCosts[i] = options[payableIndices[0]];
        i--;
        continue;
      }

      const frame: EffectStackFrame = {
        id: generateFrameId(),
        sourceCardInstanceId,
        controller,
        effectBlock,
        phase: "AWAITING_COST_SELECTION",
        pausedAction: null,
        remainingActions: effectBlock.actions ?? [],
        resultRefs: [],
        validTargets: payableIndices.map((oi) => String(oi)),
        costs: workingCosts,
        currentCostIndex: i,
        costsPaid: false,
        oncePerTurnMarked: false,
        costResultRefs: [...costResultToEntries(costResult)],
        pendingTriggers: [],
        simultaneousTriggers: [],
        accumulatedEvents: events,
      };
      nextState = pushFrame(nextState, frame);

      const pendingPrompt: PendingPromptState = {
        options: {
          promptType: "PLAYER_CHOICE",
          effectDescription: "Choose a cost to pay",
          choices: payableIndices.map((oi) => ({
            id: String(oi),
            label: getCostLabel(options[oi]),
          })),
        },
        respondingPlayer: controller,
        resumeContext: frame.id,
      };
      return { state: nextState, events, pendingPrompt };
    }

    // CHOICE — branching cost paths; each option is a full Cost[].
    if (cost.type === "CHOICE") {
      const choiceCost = cost as ChoiceCost;
      const payableBranchIndices: number[] = [];
      for (let bi = 0; bi < choiceCost.options.length; bi++) {
        const branchPayable = choiceCost.options[bi].every((c) =>
          isCostPayable(nextState, c, controller, cardDb, sourceCardInstanceId),
        );
        if (branchPayable) payableBranchIndices.push(bi);
      }

      if (payableBranchIndices.length === 0) {
        return { state: nextState, events, cannotPay: true };
      }

      if (payableBranchIndices.length === 1) {
        const branch = choiceCost.options[payableBranchIndices[0]];
        workingCosts.splice(i, 1, ...branch);
        i--;
        continue;
      }

      const frame: EffectStackFrame = {
        id: generateFrameId(),
        sourceCardInstanceId,
        controller,
        effectBlock,
        phase: "AWAITING_COST_SELECTION",
        pausedAction: null,
        remainingActions: effectBlock.actions ?? [],
        resultRefs: [],
        validTargets: payableBranchIndices.map((bi) => String(bi)),
        costs: workingCosts,
        currentCostIndex: i,
        costsPaid: false,
        oncePerTurnMarked: false,
        costResultRefs: [...costResultToEntries(costResult)],
        pendingTriggers: [],
        simultaneousTriggers: [],
        accumulatedEvents: events,
      };
      nextState = pushFrame(nextState, frame);

      const pendingPrompt: PendingPromptState = {
        options: {
          promptType: "PLAYER_CHOICE",
          effectDescription: "Select how to pay the cost",
          choices: payableBranchIndices.map((bi) => ({
            id: String(bi),
            label: choiceCost.labels?.[bi] ?? deriveBranchLabel(choiceCost.options[bi]),
          })),
        },
        respondingPlayer: controller,
        resumeContext: frame.id,
      };
      return { state: nextState, events, pendingPrompt };
    }

    if (costNeedsPlayerSelection(cost)) {
      // Special handling for LIFE_TO_HAND with TOP_OR_BOTTOM — use PLAYER_CHOICE
      if (cost.type === "LIFE_TO_HAND" && (cost as any).position === "TOP_OR_BOTTOM") {
        const p = nextState.players[controller];
        if (p.life.length === 0) {
          return { state: nextState, events, cannotPay: true };
        }

        const frame: EffectStackFrame = {
          id: generateFrameId(),
          sourceCardInstanceId,
          controller,
          effectBlock,
          phase: "AWAITING_COST_SELECTION",
          pausedAction: null,
          remainingActions: effectBlock.actions ?? [],
          resultRefs: [],
          validTargets: ["TOP", "BOTTOM"],
          costs: workingCosts,
          currentCostIndex: i,
          costsPaid: false,
          oncePerTurnMarked: false,
          costResultRefs: [...costResultToEntries(costResult)],
          pendingTriggers: [],
          simultaneousTriggers: [],
          accumulatedEvents: events,
        };
        nextState = pushFrame(nextState, frame);

        const pendingPrompt: PendingPromptState = {
          options: {
            promptType: "PLAYER_CHOICE",
            effectDescription: "Choose top or bottom of your Life cards to add to your hand",
            choices: [
              { id: "0", label: "Top" },
              { id: "1", label: "Bottom" },
            ],
          },
          respondingPlayer: controller,
          resumeContext: frame.id,
        };
        return { state: nextState, events, pendingPrompt };
      }

      // Build valid targets for this cost
      const validTargets = computeCostTargets(nextState, cost, controller, cardDb);
      const amount = typeof (cost as SimpleCost).amount === "number" ? ((cost as SimpleCost).amount as number) : 1;

      if (validTargets.length < amount) {
        return { state: nextState, events, cannotPay: true };
      }

      // Push stack frame for cost selection
      const frame: EffectStackFrame = {
        id: generateFrameId(),
        sourceCardInstanceId,
        controller,
        effectBlock,
        phase: "AWAITING_COST_SELECTION",
        pausedAction: null,
        remainingActions: effectBlock.actions ?? [],
        resultRefs: [],
        validTargets,
        costs: workingCosts,
        currentCostIndex: i,
        costsPaid: false,
        oncePerTurnMarked: false,
        costResultRefs: [...costResultToEntries(costResult)],
        pendingTriggers: [],
        simultaneousTriggers: [],
        accumulatedEvents: events,
      };
      nextState = pushFrame(nextState, frame);

      const costLabel = getCostLabel(cost);
      const pendingPrompt: PendingPromptState = {
        options: {
          promptType: "SELECT_TARGET",
          validTargets,
          countMin: amount,
          countMax: amount,
          effectDescription: costLabel,
          ctaLabel: getCostCtaLabel(cost),
          cards: getCostCards(nextState, cost, validTargets, controller),
        },
        respondingPlayer: controller,
        resumeContext: frame.id,
      };
      return { state: nextState, events, pendingPrompt };
    }

    // Auto-payable cost — use existing payCosts for this single cost
    const singleResult = payCosts(nextState, [cost], controller, cardDb, sourceCardInstanceId);
    if (!singleResult) {
      return { state: nextState, events, cannotPay: true };
    }
    nextState = singleResult.state;
    events.push(...singleResult.events);
    costResult.donRestedCount += singleResult.costResult.donRestedCount;
    costResult.cardsTrashedCount += singleResult.costResult.cardsTrashedCount;
    costResult.cardsReturnedCount += singleResult.costResult.cardsReturnedCount;
    costResult.cardsPlacedToDeckCount += singleResult.costResult.cardsPlacedToDeckCount;
    costResult.charactersKoCount += singleResult.costResult.charactersKoCount;
    costResult.cardsTrashedInstanceIds.push(...singleResult.costResult.cardsTrashedInstanceIds);
    costResult.cardsReturnedInstanceIds.push(...singleResult.costResult.cardsReturnedInstanceIds);
    costResult.charactersKoInstanceIds.push(...singleResult.costResult.charactersKoInstanceIds);
  }

  return { state: nextState, events, costResult };
}

// ─── Cost helpers ─────────────────────────────────────────────────────────────

export function computeCostTargets(
  state: GameState,
  cost: Cost,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
): string[] {
  const player = state.players[controller];

  switch (cost.type) {
    case "TRASH_FROM_HAND":
    case "PLACE_HAND_TO_DECK":
    case "REVEAL_FROM_HAND": {
      let candidates = player.hand;
      if (cost.filter) {
        candidates = candidates.filter((c) => {
          const data = cardDb.get(c.cardId);
          if (!data) return false;
          return matchesHandFilter(data, cost.filter!);
        });
      }
      return candidates.map((c) => c.instanceId);
    }

    case "KO_OWN_CHARACTER":
    case "TRASH_OWN_CHARACTER":
    case "RETURN_OWN_CHARACTER_TO_HAND":
    case "PLACE_OWN_CHARACTER_TO_DECK": {
      let candidates = player.characters.filter(Boolean) as CardInstance[];
      if (cost.filter) {
        candidates = candidates.filter((c) => {
          const data = cardDb.get(c.cardId);
          if (!data) return false;
          if (cost.filter?.traits) {
            if (!cost.filter.traits.every((t: string) => (data.types ?? []).includes(t))) return false;
          }
          if (cost.filter?.traits_contains) {
            const cardTraits = data.types ?? [];
            if (!cost.filter.traits_contains.every((t: string) => cardTraits.some((tr: string) => tr.includes(t)))) return false;
          }
          if (cost.filter?.cost_max !== undefined) {
            return (data.cost ?? 0) <= (cost.filter.cost_max as number);
          }
          return true;
        });
      }
      return candidates.map((c) => c.instanceId);
    }

    case "TRASH_FROM_LIFE": {
      return player.life.map((l) => l.instanceId);
    }

    case "REST_CARDS": {
      return player.characters
        .filter((c): c is CardInstance => c !== null && c.state === "ACTIVE")
        .map((c) => c.instanceId);
    }

    case "REST_NAMED_CARD": {
      const candidates: string[] = [];
      const nameFilter = cost.filter?.name;
      // Include matching active characters
      for (const c of player.characters) {
        if (!c || c.state !== "ACTIVE") continue;
        if (nameFilter) {
          const data = cardDb.get(c.cardId);
          if (!data || data.name !== nameFilter) continue;
        }
        candidates.push(c.instanceId);
      }
      // Include leader if active and matches name filter
      if (player.leader.state === "ACTIVE") {
        if (nameFilter) {
          const leaderData = cardDb.get(player.leader.cardId);
          if (leaderData && leaderData.name === nameFilter) {
            candidates.push(player.leader.instanceId);
          }
        } else {
          candidates.push(player.leader.instanceId);
        }
      }
      return candidates;
    }

    case "CHOOSE_ONE_COST":
      // Targets are computed per-option after selection; no aggregate list.
      return [];

    default:
      return [];
  }
}

export function getCostLabel(cost: Cost): string {
  const amount = typeof (cost as SimpleCost).amount === "number" ? ((cost as SimpleCost).amount as number) : 1;
  switch (cost.type) {
    case "TRASH_FROM_HAND": return `Choose ${amount} card(s) from hand to trash as cost`;
    case "KO_OWN_CHARACTER": return `Choose ${amount} character(s) to KO as cost`;
    case "RETURN_OWN_CHARACTER_TO_HAND": return `Choose ${amount} character(s) to return to hand as cost`;
    case "PLACE_OWN_CHARACTER_TO_DECK": return `Choose ${amount} character(s) to place on deck as cost`;
    case "TRASH_FROM_LIFE": return `Choose ${amount} life card(s) to trash as cost`;
    case "PLACE_HAND_TO_DECK": return `Choose ${amount} card(s) to place on deck as cost`;
    case "REST_CARDS": return `Choose ${amount} card(s) to rest as cost`;
    case "TRASH_OWN_CHARACTER": return `Choose ${amount} character(s) to trash as cost`;
    case "REVEAL_FROM_HAND": return `Choose ${amount} card(s) from hand to reveal as cost`;
    case "CHOOSE_ONE_COST": return "Choose a cost to pay";
    default: return "Select card(s) as cost";
  }
}

export function deriveBranchLabel(branch: Cost[]): string {
  return branch.map((c) => getCostLabel(c)).join(" + ");
}

export function getCostCtaLabel(cost: Cost): string {
  switch (cost.type) {
    case "TRASH_FROM_HAND":
    case "TRASH_OWN_CHARACTER":
    case "TRASH_FROM_LIFE": return "Trash";
    case "KO_OWN_CHARACTER": return "KO";
    case "RETURN_OWN_CHARACTER_TO_HAND": return "Return";
    case "PLACE_OWN_CHARACTER_TO_DECK":
    case "PLACE_HAND_TO_DECK": return "Place on Deck";
    case "REST_CARDS":
    case "REST_NAMED_CARD": return "Rest";
    case "REVEAL_FROM_HAND": return "Reveal";
    default: return "Confirm";
  }
}

export function getCostCards(
  state: GameState,
  cost: Cost,
  validTargets: string[],
  controller: 0 | 1,
): CardInstance[] {
  const player = state.players[controller];
  const targetSet = new Set(validTargets);

  switch (cost.type) {
    case "TRASH_FROM_HAND":
    case "PLACE_HAND_TO_DECK":
    case "REVEAL_FROM_HAND":
      return player.hand.filter((c) => targetSet.has(c.instanceId));

    case "KO_OWN_CHARACTER":
    case "TRASH_OWN_CHARACTER":
    case "RETURN_OWN_CHARACTER_TO_HAND":
    case "PLACE_OWN_CHARACTER_TO_DECK":
    case "REST_CARDS":
    case "REST_NAMED_CARD": {
      const cards = player.characters.filter((c): c is CardInstance => c !== null && targetSet.has(c.instanceId));
      if (targetSet.has(player.leader.instanceId)) {
        cards.push(player.leader);
      }
      return cards;
    }

    case "TRASH_FROM_LIFE":
      // Life cards aren't CardInstance, return empty for now
      return [];

    default:
      return [];
  }
}

export function promptTypeToPhase(promptType: string): EffectStackFrame["phase"] {
  switch (promptType) {
    case "OPTIONAL_EFFECT": return "AWAITING_OPTIONAL_RESPONSE";
    case "SELECT_TARGET": return "AWAITING_TARGET_SELECTION";
    case "REDISTRIBUTE_DON": return "AWAITING_TARGET_SELECTION";
    case "ARRANGE_TOP_CARDS": return "AWAITING_ARRANGE_CARDS";
    case "PLAYER_CHOICE": return "AWAITING_PLAYER_CHOICE";
    default: return "AWAITING_TARGET_SELECTION";
  }
}

// ─── applyCostSelection ──────────────────────────────────────────────────────

export function applyCostSelection(
  state: GameState,
  cost: Cost,
  selectedIds: string[],
  controller: 0 | 1,
): GameState {
  const p = state.players[controller];
  const selectedSet = new Set(selectedIds);

  switch (cost.type) {
    case "TRASH_FROM_HAND": {
      const toTrash = p.hand.filter((c) => selectedSet.has(c.instanceId));
      const newHand = p.hand.filter((c) => !selectedSet.has(c.instanceId));
      const newTrash = [...toTrash.map((c) => ({ ...c, zone: "TRASH" as const })), ...p.trash];
      const newPlayers = [...state.players] as [typeof state.players[0], typeof state.players[1]];
      newPlayers[controller] = { ...p, hand: newHand, trash: newTrash };
      return { ...state, players: newPlayers };
    }

    case "KO_OWN_CHARACTER":
    case "TRASH_OWN_CHARACTER": {
      const toRemove = p.characters.filter((c): c is CardInstance => c !== null && selectedSet.has(c.instanceId));
      const newChars = p.characters.map((c) => c !== null && selectedSet.has(c.instanceId) ? null : c);
      const newTrash = [
        ...toRemove.map((c) => ({ ...c, zone: "TRASH" as const, attachedDon: [] as typeof c.attachedDon })),
        ...p.trash,
      ];
      // Return attached DON to cost area (rested)
      const returnedDon = toRemove.flatMap((c) => c.attachedDon.map((d) => ({ ...d, state: "RESTED" as const, attachedTo: null })));
      const newPlayers = [...state.players] as [typeof state.players[0], typeof state.players[1]];
      newPlayers[controller] = {
        ...p,
        characters: newChars,
        trash: newTrash,
        donCostArea: [...p.donCostArea, ...returnedDon],
      };
      return { ...state, players: newPlayers };
    }

    case "RETURN_OWN_CHARACTER_TO_HAND": {
      const toReturn = p.characters.filter((c): c is CardInstance => c !== null && selectedSet.has(c.instanceId));
      const newChars = p.characters.map((c) => c !== null && selectedSet.has(c.instanceId) ? null : c);
      const newHand = [
        ...p.hand,
        ...toReturn.map((c) => ({ ...c, zone: "HAND" as const, attachedDon: [] as typeof c.attachedDon })),
      ];
      const returnedDon = toReturn.flatMap((c) => c.attachedDon.map((d) => ({ ...d, state: "RESTED" as const, attachedTo: null })));
      const newPlayers = [...state.players] as [typeof state.players[0], typeof state.players[1]];
      newPlayers[controller] = {
        ...p,
        characters: newChars,
        hand: newHand,
        donCostArea: [...p.donCostArea, ...returnedDon],
      };
      return { ...state, players: newPlayers };
    }

    case "PLACE_HAND_TO_DECK":
    case "PLACE_OWN_CHARACTER_TO_DECK": {
      if (cost.type === "PLACE_HAND_TO_DECK") {
        const toPlace = p.hand.filter((c) => selectedSet.has(c.instanceId));
        const newHand = p.hand.filter((c) => !selectedSet.has(c.instanceId));
        const position = cost.position ?? "BOTTOM";
        const deckCards = toPlace.map((c) => ({ ...c, zone: "DECK" as const }));
        const newDeck = position === "TOP" ? [...deckCards, ...p.deck] : [...p.deck, ...deckCards];
        const newPlayers = [...state.players] as [typeof state.players[0], typeof state.players[1]];
        newPlayers[controller] = { ...p, hand: newHand, deck: newDeck };
        return { ...state, players: newPlayers };
      } else {
        const toPlace = p.characters.filter((c): c is CardInstance => c !== null && selectedSet.has(c.instanceId));
        const newChars = p.characters.map((c) => c !== null && selectedSet.has(c.instanceId) ? null : c);
        const returnedDon = toPlace.flatMap((c) => c.attachedDon.map((d) => ({ ...d, state: "RESTED" as const, attachedTo: null })));
        const position = cost.position ?? "BOTTOM";
        const deckCards = toPlace.map((c) => ({ ...c, zone: "DECK" as const, attachedDon: [] as typeof c.attachedDon }));
        const newDeck = position === "TOP" ? [...deckCards, ...p.deck] : [...p.deck, ...deckCards];
        const newPlayers = [...state.players] as [typeof state.players[0], typeof state.players[1]];
        newPlayers[controller] = {
          ...p,
          characters: newChars,
          deck: newDeck,
          donCostArea: [...p.donCostArea, ...returnedDon],
        };
        return { ...state, players: newPlayers };
      }
    }

    case "REST_CARDS":
    case "REST_NAMED_CARD": {
      const newChars = p.characters.map((c) =>
        c !== null && selectedSet.has(c.instanceId) ? { ...c, state: "RESTED" as const } : c,
      );
      const newLeader = selectedSet.has(p.leader.instanceId)
        ? { ...p.leader, state: "RESTED" as const }
        : p.leader;
      const newPlayers = [...state.players] as [typeof state.players[0], typeof state.players[1]];
      newPlayers[controller] = { ...p, leader: newLeader, characters: newChars };
      return { ...state, players: newPlayers };
    }

    default:
      return state;
  }
}
