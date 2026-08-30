/**
 * Pure utility functions for action handlers.
 */

import type {
  Action,
  ActionParamsMap,
  Duration,
  DynamicValue,
  EffectResult,
  EffectBlock,
} from "../effect-types.js";
import type { CardData, GameState } from "../../types.js";
import { matchesFilter } from "../conditions.js";
import type { ExpiryTiming } from "../effect-types.js";
import { resolveDynamicValue } from "../dynamic-values.js";
import { findCardInstance } from "../state.js";

export { getActionParams } from "../effect-types.js";

export function getSearchAndPlayPickLimit(
  params: ActionParamsMap["SEARCH_AND_PLAY"],
  validTargetCount: number,
): number {
  const pick = params.pick;
  if (!pick) return 1;
  if ("up_to" in pick) return pick.up_to;
  if ("exact" in pick) return pick.exact;
  return validTargetCount;
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
  amount: number | DynamicValue | undefined,
  resultRefs: Map<string, EffectResult>,
  state?: GameState,
  controller?: 0 | 1,
  cardDb?: Map<string, CardData>,
): number {
  if (typeof amount === "number") return amount;
  if (!amount) return 0;
  const resolution = resolveDynamicValue(amount, {
    resultRefs,
    state,
    controller,
    cardDb,
    matchesFilter,
  });
  if (resolution.resolved) return resolution.value;

  // Fallback for PER_COUNT without state (legacy calls)
  if (amount.type === "PER_COUNT" && (state == null || controller == null)) {
    return amount.multiplier ?? 1;
  }

  return 0;
}

// ─── computeExpiry ────────────────────────────────────────────────────────────

/**
 * Round number of seat `seat`'s next turn strictly after the current one.
 *
 * turn.number counts ROUNDS (OPT-366): it increments only when control
 * returns to the first player, so both seats share a number within a round.
 * The second player's round-N turn is still ahead while the first player is
 * active — that is the only case where "next turn" stays in the current round.
 */
function nextTurnOf(seat: 0 | 1, state: GameState): number {
  const active = state.turn.activePlayerIndex;
  const first = state.turn.firstPlayerIndex ?? 0;
  return active !== seat && seat !== first ? state.turn.number : state.turn.number + 1;
}

/**
 * Expiry for a RuntimeProhibition, stamped at creation. Same math as active
 * effects except SKIP_NEXT_REFRESH: those prohibitions are consumed by the
 * Refresh Phase they skip (applyRefreshProhibitions), never wave-expired.
 */
export function computeProhibitionExpiry(
  duration: Duration,
  state: GameState,
  controller: 0 | 1,
): ExpiryTiming {
  if (duration.type === "SKIP_NEXT_REFRESH") return { wave: "NEVER" };
  return computeExpiry(duration, state, controller);
}

export function computeExpiry(duration: Duration, state: GameState, controller: 0 | 1): ExpiryTiming {
  switch (duration.type) {
    case "THIS_TURN":
      return { wave: "END_OF_TURN", turn: state.turn.number };
    case "THIS_BATTLE":
      return { wave: "END_OF_BATTLE", battleId: state.turn.battle?.battleId ?? "" };
    case "UNTIL_END_OF_OPPONENT_NEXT_END_PHASE":
    case "UNTIL_END_OF_OPPONENT_NEXT_TURN": {
      // Both mean "until the end of the controller's opponent's next turn"
      const opp: 0 | 1 = controller === 0 ? 1 : 0;
      return { wave: "END_OF_END_PHASE", turn: nextTurnOf(opp, state), player: opp };
    }
    case "UNTIL_START_OF_YOUR_NEXT_TURN":
      return { wave: "REFRESH_PHASE", turn: nextTurnOf(controller, state), player: controller };
    case "UNTIL_END_OF_YOUR_NEXT_TURN":
      return { wave: "END_OF_TURN", turn: nextTurnOf(controller, state), player: controller };
    case "SKIP_NEXT_REFRESH": {
      // As an active-effect duration this expires at the controller's next
      // refresh — one refresh after the opponent's refresh it modifies, so it
      // survives through that phase. (All current schema usages route through
      // APPLY_PROHIBITION and are consumed by applyRefreshProhibitions instead.)
      return { wave: "REFRESH_PHASE", turn: nextTurnOf(controller, state), player: controller };
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
  if (typeof block.source_text === "string" && block.source_text.trim()) {
    return block.source_text;
  }

  if (!effectText) return "You may activate this effect.";

  // Get the bracket text for this block's trigger
  const trigger = block.trigger;
  if (!trigger) return effectText;

  let keyword: string | undefined;
  if ("keyword" in trigger) {
    keyword = trigger.keyword;
  } else if ("any_of" in trigger && Array.isArray(trigger.any_of)) {
    // Compound trigger — try the first keyword trigger
    const first = trigger.any_of.find(
      (candidate) =>
        candidate !== null &&
        typeof candidate === "object" &&
        "keyword" in candidate
    );
    if (first && "keyword" in first) keyword = first.keyword;
  }
  if (!keyword) return effectText;

  const bracket = KEYWORD_BRACKETS[keyword];
  if (!bracket) return effectText;

  // Split on line breaks first, then further split on trigger bracket boundaries.
  // Card text may use <br> or newlines between effects, or concatenate them.
  const brSegments = effectText.split(/<br\s*\/?>|\r?\n/i);

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
      const start = starts[0];
      if (start !== undefined && start > 0) {
        sections.push(seg.substring(0, start).trim());
        sections.push(seg.substring(start).trim());
      } else {
        sections.push(seg.trim());
      }
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

/** Clause-scoped description for a prompt raised by the active effect.
 * Finds the effect block for sourceCardInstanceId on the effect stack
 * (topmost matching frame) and extracts its clause; falls back to the
 * card's full text when no frame or block is found. */
export function promptEffectDescription(
  state: GameState,
  cardDb: Map<string, CardData>,
  sourceCardInstanceId: string,
): string {
  const sourceCard = findCardInstance(state, sourceCardInstanceId);
  const sourceCardData = sourceCard ? cardDb.get(sourceCard.cardId) : undefined;
  const fullEffectText = sourceCardData?.effectText ?? "";
  let block: EffectBlock | undefined;
  for (let index = state.effectStack.length - 1; index >= 0; index -= 1) {
    const candidate = state.effectStack[index];
    if (candidate?.sourceCardInstanceId === sourceCardInstanceId) {
      block = candidate.effectBlock;
      break;
    }
  }
  if (!block) return fullEffectText;

  const trigger = block.trigger;
  const isTriggerBlock = !!trigger && (
    ("keyword" in trigger && trigger.keyword === "TRIGGER") ||
    ("any_of" in trigger && trigger.any_of.some(
      (candidate) => "keyword" in candidate && candidate.keyword === "TRIGGER",
    ))
  );
  const text = isTriggerBlock
    ? sourceCardData?.triggerText ?? fullEffectText
    : fullEffectText;
  return extractEffectDescription(text, block);
}
