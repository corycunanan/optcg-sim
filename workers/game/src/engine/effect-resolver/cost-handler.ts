/**
 * Cost payment logic — auto-payable and player-selection costs.
 */

import type {
  Cost,
  CostResult,
  EffectBlock,
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

// ─── payCosts (auto-payable) ─────────────────────────────────────────────────

export function payCosts(
  state: GameState,
  costs: Cost[],
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
              if (!cost.filter.traits.every((t) => (data.types ?? []).includes(t))) return false;
            }
            if (cost.filter?.traits_contains) {
              const cardTraits = data.types ?? [];
              if (!cost.filter.traits_contains.every((t: string) => cardTraits.some((tr: string) => tr.includes(t)))) return false;
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

      default:
        // Other cost types to be implemented
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
]);

export function costNeedsPlayerSelection(cost: Cost): boolean {
  if (cost.type === "LIFE_TO_HAND" && (cost as any).position === "TOP_OR_BOTTOM") return true;
  return SELECTION_COST_TYPES.has(cost.type);
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

  for (let i = startIndex; i < costs.length; i++) {
    const cost = costs[i];

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
          costs,
          currentCostIndex: i,
          costsPaid: false,
          oncePerTurnMarked: false,
          pendingTriggers: [],
          accumulatedEvents: events,
        };
        nextState = pushFrame(nextState, frame);

        const pendingPrompt: PendingPromptState = {
          promptType: "PLAYER_CHOICE",
          options: {
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
      const amount = typeof cost.amount === "number" ? cost.amount : 1;

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
        costs,
        currentCostIndex: i,
        costsPaid: false,
        oncePerTurnMarked: false,
        pendingTriggers: [],
        accumulatedEvents: events,
      };
      nextState = pushFrame(nextState, frame);

      const costLabel = getCostLabel(cost);
      const pendingPrompt: PendingPromptState = {
        promptType: "SELECT_TARGET",
        options: {
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
    const singleResult = payCosts(nextState, [cost], controller, cardDb);
    if (!singleResult) {
      return { state: nextState, events, cannotPay: true };
    }
    nextState = singleResult.state;
    events.push(...singleResult.events);
  }

  return { state: nextState, events };
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
          if (cost.filter?.traits) {
            if (!cost.filter.traits.every((t: string) => (data.types ?? []).includes(t))) return false;
          }
          if (cost.filter?.traits_contains) {
            const cardTraits = data.types ?? [];
            if (!cost.filter.traits_contains.every((t: string) => cardTraits.some((tr: string) => tr.includes(t)))) return false;
          }
          if (cost.filter?.color) {
            if (!(data.color ?? []).some((clr: string) => cost.filter!.color!.includes(clr as never))) return false;
          }
          return true;
        });
      }
      return candidates.map((c) => c.instanceId);
    }

    case "KO_OWN_CHARACTER":
    case "TRASH_OWN_CHARACTER":
    case "RETURN_OWN_CHARACTER_TO_HAND":
    case "PLACE_OWN_CHARACTER_TO_DECK": {
      let candidates = player.characters;
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

    case "REST_CARDS":
    case "REST_NAMED_CARD": {
      return player.characters
        .filter((c) => c.state === "ACTIVE")
        .map((c) => c.instanceId);
    }

    default:
      return [];
  }
}

export function getCostLabel(cost: Cost): string {
  const amount = typeof cost.amount === "number" ? cost.amount : 1;
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
    default: return "Select card(s) as cost";
  }
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
    case "REST_NAMED_CARD":
      return player.characters.filter((c) => targetSet.has(c.instanceId));

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
      const toRemove = p.characters.filter((c) => selectedSet.has(c.instanceId));
      const newChars = p.characters.filter((c) => !selectedSet.has(c.instanceId));
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
      const toReturn = p.characters.filter((c) => selectedSet.has(c.instanceId));
      const newChars = p.characters.filter((c) => !selectedSet.has(c.instanceId));
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
        const toPlace = p.characters.filter((c) => selectedSet.has(c.instanceId));
        const newChars = p.characters.filter((c) => !selectedSet.has(c.instanceId));
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
        selectedSet.has(c.instanceId) ? { ...c, state: "RESTED" as const } : c,
      );
      const newPlayers = [...state.players] as [typeof state.players[0], typeof state.players[1]];
      newPlayers[controller] = { ...p, characters: newChars };
      return { ...state, players: newPlayers };
    }

    default:
      return state;
  }
}
