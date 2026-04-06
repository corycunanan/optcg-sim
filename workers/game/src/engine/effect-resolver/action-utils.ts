/**
 * Pure utility functions for action handlers.
 */

import type { Action, Duration, DynamicValue, EffectResult, EffectBlock } from "../effect-types.js";
import type { CardData, CardInstance, GameState } from "../../types.js";
import { findCardInstance } from "../state.js";
import type { ExpiryTiming } from "../effect-types.js";

export { getActionParams } from "../effect-types.js";

function findCardInstanceForDV(state: GameState, instanceId: string): CardInstance | null {
  return findCardInstance(state, instanceId);
}

const THIS_WAY_TO_COST_REF: Record<string, string> = {
  DON_RESTED_THIS_WAY: "__cost_don_rested",
  CARDS_TRASHED_THIS_WAY: "__cost_cards_trashed",
  CHARACTERS_RETURNED_THIS_WAY: "__cost_cards_returned",
  CHARACTERS_KO_THIS_WAY: "__cost_characters_ko",
  CARDS_PLACED_TO_DECK_THIS_WAY: "__cost_cards_placed_to_deck",
};

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
    const source = dv.source as string;
    const costRefKey = THIS_WAY_TO_COST_REF[source];
    if (costRefKey) {
      const costRef = resultRefs.get(costRefKey);
      if (costRef) {
        return Math.floor(costRef.count / (dv.divisor ?? 1)) * (dv.multiplier ?? 1);
      }
    }
    if (source === "REVEALED_CARD_COST" && (dv as any).ref && cardDb) {
      const refResult = resultRefs.get((dv as any).ref as string);
      if (refResult?.targetInstanceIds?.length) {
        const targetCard = findCardInstanceForDV(state, refResult.targetInstanceIds[0]);
        if (targetCard) {
          const data = cardDb.get(targetCard.cardId);
          return Math.floor((data?.cost ?? 0) / (dv.divisor ?? 1)) * (dv.multiplier ?? 1);
        }
      }
    }
    if (source === "DON_GIVEN_TO_TARGET" && (dv as any).ref) {
      const refResult = resultRefs.get((dv as any).ref as string);
      if (refResult?.targetInstanceIds?.length) {
        const targetCard = findCardInstanceForDV(state, refResult.targetInstanceIds[0]);
        if (targetCard) {
          return Math.floor(targetCard.attachedDon.length / (dv.divisor ?? 1)) * (dv.multiplier ?? 1);
        }
      }
      if (refResult) {
        return Math.floor(refResult.count / (dv.divisor ?? 1)) * (dv.multiplier ?? 1);
      }
    }
    const count = resolvePerCountSource(state, controller, source, cardDb);
    return Math.floor(count / (dv.divisor ?? 1)) * (dv.multiplier ?? 1);
  }

  if (dv.type === "GAME_STATE" && state != null && controller != null) {
    const ctrl = (dv.controller as string) ?? "SELF";
    const pi = ctrl === "OPPONENT" ? (controller === 0 ? 1 : 0) : controller;
    return resolveGameStateSource(state, pi as 0 | 1, dv.source as string, cardDb);
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
  cardDb?: Map<string, CardData>,
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
    case "LEADER_BASE_POWER": {
      const leaderData = cardDb?.get(p.leader.cardId);
      return leaderData?.power ?? 0;
    }
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
    case "UNTIL_END_OF_OPPONENT_NEXT_END_PHASE":
    case "UNTIL_END_OF_OPPONENT_NEXT_TURN": {
      // Both mean "until the end of opponent's next turn"
      const oppTurn = state.turn.activePlayerIndex === 0 ? state.turn.number + 1 : state.turn.number + 2;
      return { wave: "END_OF_END_PHASE", turn: oppTurn };
    }
    case "UNTIL_START_OF_YOUR_NEXT_TURN":
      return { wave: "REFRESH_PHASE", turn: state.turn.number + 2 };
    case "UNTIL_END_OF_YOUR_NEXT_TURN": {
      // Lasts until the end of your next turn (2 turns from now)
      return { wave: "END_OF_TURN", turn: state.turn.number + 2 };
    }
    case "SKIP_NEXT_REFRESH": {
      // Effect lasts until the character's next refresh phase
      return { wave: "REFRESH_PHASE", turn: state.turn.number + 2 };
    }
    case "PERMANENT":
      return { wave: "SOURCE_LEAVES_ZONE" };
    case "WHILE_CONDITION":
      return { wave: "CONDITION_FALSE" };
    default:
      return { wave: "END_OF_TURN", turn: state.turn.number };
  }
}

// ─── extractEffectDescription ────────────────────────────────────────────────

/** Bracket notations for trigger keywords in OPTCG card text. */
const KEYWORD_BRACKETS: Record<string, string> = {
  ON_PLAY: "[On Play]",
  WHEN_ATTACKING: "[When Attacking]",
  ON_OPPONENT_ATTACK: "[On Your Opponent's Attack]",
  ON_KO: "[On K.O.]",
  ON_BLOCK: "[On Block]",
  ACTIVATE_MAIN: "[Activate: Main]",
  MAIN_EVENT: "[Main]",
  COUNTER: "[Counter]",
  COUNTER_EVENT: "[Counter]",
  TRIGGER: "[Trigger]",
  END_OF_YOUR_TURN: "[End of Your Turn]",
  END_OF_OPPONENT_TURN: "[End of Opponent's Turn]",
  START_OF_TURN: "[Start of Your Turn]",
};

/**
 * Extract the specific effect section from a card's full effect text
 * based on the effect block's trigger keyword.
 *
 * Falls back to the full text if extraction fails.
 */
export function extractEffectDescription(
  effectText: string,
  block: EffectBlock,
): string {
  if (!effectText) return "You may activate this effect.";

  // Get the bracket text for this block's trigger
  const trigger = block.trigger;
  if (!trigger) return effectText;

  let keyword: string | undefined;
  if ("keyword" in trigger) {
    keyword = trigger.keyword;
  } else if ("any_of" in trigger && Array.isArray(trigger.any_of)) {
    // Compound trigger — try the first keyword trigger
    const first = trigger.any_of.find((t) => t && typeof t === "object" && "keyword" in t);
    if (first && "keyword" in first) {
      keyword = (first as { keyword: string }).keyword;
    }
  }
  if (!keyword) return effectText;

  const bracket = KEYWORD_BRACKETS[keyword];
  if (!bracket) return effectText;

  // Split on <br> tags first, then further split on trigger bracket boundaries.
  // Card text may use <br> between effects OR just concatenate them with spaces.
  const brSegments = effectText.split(/<br\s*\/?>/i);

  // All bracket strings that can start an effect section
  const allBrackets = Object.values(KEYWORD_BRACKETS);

  // Within each <br> segment, split further on bracket boundaries
  const sections: string[] = [];
  for (const seg of brSegments) {
    // Find all positions where a trigger bracket starts
    const starts: number[] = [];
    for (const b of allBrackets) {
      let idx = seg.indexOf(b);
      while (idx !== -1) {
        // Include DON!! prefix if present (e.g., "[DON!! x1] [On Play]")
        let actual = idx;
        const before = seg.substring(0, idx).trimEnd();
        const donMatch = before.match(/\[DON!!(?:\s*[x×]\s*\d+)?\]\s*$/);
        if (donMatch) {
          actual = before.length - donMatch[0].length;
        }
        starts.push(actual);
        idx = seg.indexOf(b, idx + b.length);
      }
    }

    if (starts.length <= 1) {
      sections.push(seg.trim());
    } else {
      const sorted = [...new Set(starts)].sort((a, b) => a - b);
      for (let i = 0; i < sorted.length; i++) {
        const end = i + 1 < sorted.length ? sorted[i + 1] : seg.length;
        sections.push(seg.substring(sorted[i], end).trim());
      }
    }
  }

  // Find the section containing this trigger's bracket
  const match = sections.find((s) => s.includes(bracket));
  if (match) return match;

  return effectText;
}
