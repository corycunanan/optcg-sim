/**
 * Pure utility functions for action handlers.
 */

import type { Action, Duration, DynamicValue, EffectResult } from "../effect-types.js";
import type { CardData, GameState } from "../../types.js";
import type { ExpiryTiming } from "../effect-types.js";

export { getActionParams } from "../effect-types.js";

// ─── Shuffle ──────────────────────────────────────────────────────────────────

export function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// ─── Choice Label Generation ─────────────────────────────────────────────────

export const ACTION_LABELS: Record<string, string> = {
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

export function describeActionBranch(actions: Action[]): string {
  if (actions.length === 0) return "Do nothing";
  const labels = actions
    .map((a) => ACTION_LABELS[a.type] ?? a.type.replace(/_/g, " ").toLowerCase())
    .slice(0, 2);
  return labels.join(", then ");
}

// ─── Once-per-turn ────────────────────────────────────────────────────────────

export function markOncePerTurnUsed(state: GameState, effectBlockId: string, instanceId: string): GameState {
  const used = { ...state.turn.oncePerTurnUsed };
  const existing = used[effectBlockId] ? [...used[effectBlockId]] : [];
  existing.push(instanceId);
  used[effectBlockId] = existing;
  return {
    ...state,
    turn: { ...state.turn, oncePerTurnUsed: used },
  };
}

// ─── resolveAmount ────────────────────────────────────────────────────────────

export function resolveAmount(
  amount: number | { type: string; [key: string]: unknown } | undefined,
  resultRefs: Map<string, EffectResult>,
  state?: GameState,
  controller?: 0 | 1,
  cardDb?: Map<string, CardData>,
): number {
  if (typeof amount === "number") return amount;
  if (!amount) return 0;
  // Cast to DynamicValue for type-safe property access after discriminant check
  const dv = amount as DynamicValue;

  if (dv.type === "FIXED") return dv.value ?? 0;

  if (dv.type === "PER_COUNT" && state != null && controller != null) {
    const count = resolvePerCountSource(state, controller, dv.source as string, cardDb);
    return Math.floor(count / (dv.divisor ?? 1)) * (dv.multiplier ?? 1);
  }

  if (dv.type === "GAME_STATE" && state != null && controller != null) {
    const ctrl = (dv.controller as string) ?? "SELF";
    const pi = ctrl === "OPPONENT" ? (controller === 0 ? 1 : 0) : controller;
    return resolveGameStateSource(state, pi as 0 | 1, dv.source as string);
  }

  if (dv.type === "ACTION_RESULT") {
    const result = resultRefs.get(dv.ref);
    return result?.count ?? 0;
  }

  // Fallback for PER_COUNT without state (legacy calls)
  if (dv.type === "PER_COUNT") {
    return dv.multiplier ?? 1;
  }

  return 0;
}

function resolvePerCountSource(
  state: GameState,
  controller: 0 | 1,
  source: string,
  cardDb?: Map<string, CardData>,
): number {
  const p = state.players[controller];
  const opp = state.players[controller === 0 ? 1 : 0];

  switch (source) {
    case "HAND_COUNT":
      return p.hand.length;
    case "CARDS_IN_TRASH":
      return p.trash.length;
    case "EVENTS_IN_TRASH": {
      if (!cardDb) return 0;
      return p.trash.filter((c) => {
        const data = cardDb.get(c.cardId);
        return data?.type.toUpperCase() === "EVENT";
      }).length;
    }
    case "CHARACTERS_ON_FIELD":
    case "MATCHING_CHARACTERS_ON_FIELD":
      return p.characters.length;
    case "DON_FIELD_COUNT":
      return p.donCostArea.length + p.leader.attachedDon.length +
        p.characters.reduce((sum, c) => sum + c.attachedDon.length, 0);
    case "OPPONENT_CHARACTERS_ON_FIELD":
      return opp.characters.length;
    case "DON_RESTED_THIS_WAY":
    case "CARDS_TRASHED_THIS_WAY":
    case "CHARACTERS_RETURNED_THIS_WAY":
    case "CHARACTERS_KO_THIS_WAY":
    case "CARDS_PLACED_TO_DECK_THIS_WAY":
      // These are populated from cost results / action results — return 0 as default
      return 0;
    default:
      return 0;
  }
}

function resolveGameStateSource(
  state: GameState,
  playerIndex: 0 | 1,
  source: string,
): number {
  const p = state.players[playerIndex];
  const opp = state.players[playerIndex === 0 ? 1 : 0];

  switch (source) {
    case "LIFE_COUNT": return p.life.length;
    case "OPPONENT_LIFE_COUNT": return opp.life.length;
    case "COMBINED_LIFE_COUNT": return p.life.length + opp.life.length;
    case "DON_FIELD_COUNT":
      return p.donCostArea.length + p.leader.attachedDon.length +
        p.characters.reduce((sum, c) => sum + c.attachedDon.length, 0);
    case "OPPONENT_DON_FIELD_COUNT":
      return opp.donCostArea.length + opp.leader.attachedDon.length +
        opp.characters.reduce((sum, c) => sum + c.attachedDon.length, 0);
    case "HAND_COUNT": return p.hand.length;
    case "DECK_COUNT": return p.deck.length;
    case "RESTED_CARD_COUNT":
      return p.characters.filter((c) => c.state === "RESTED").length;
    default: return 0;
  }
}

// ─── computeExpiry ────────────────────────────────────────────────────────────

export function computeExpiry(duration: Duration, state: GameState): ExpiryTiming {
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
