/**
 * Rule processing for defeat (rules §9-1-2, §9-2-1).
 *
 * `runRuleProcessing` is the one checkpoint. It evaluates both players at the
 * same moment and writes the result through the common terminal writer, so a
 * draw happens only when both players meet a defeat condition at that same
 * checkpoint (9-2-1). Callers place it after every move that changes a deck or
 * Life count, after every damage determination, before a prompt surfaces, and
 * at action end; once it writes a terminal state every resolver loop stops.
 */

import type { CardData, GameState } from "../types.js";
import { terminateGame } from "./terminal.js";
import { isCardNegated } from "./modifiers.js";

/**
 * Facts a checkpoint needs that the board alone does not show.
 *
 * `lethalDamage` lists players whose Leader took damage that the rules
 * determined lethal at this checkpoint (9-2-1-1: damage taken while at 0 Life;
 * battle: 7-1-4-1-1-1). Zero Life alone is never defeat, and a nonlethal hit
 * that took the last Life card is never listed, so it cannot become lethal
 * later. `endOfTurn` opens the delayed deck-out window (OP15-022 Brook).
 */
export interface RuleProcessingContext {
  lethalDamage?: readonly (0 | 1)[];
  endOfTurn?: boolean;
}

export interface DefeatResult {
  gameOver: boolean;
  winner: 0 | 1 | null; // null = draw
  reason: string;
}

/**
 * True when the player's Leader carries a LOSS_CONDITION_MOD / DELAYED_LOSS rule
 * modification for the DECK_OUT event (e.g., OP15-022 Brook). The immediate
 * deck-out loss is suppressed for such players; the loss is evaluated at the
 * end of the turn against the sticky `deckHitZeroThisTurn` flag.
 */
export function hasDelayedDeckOutLoss(
  state: GameState,
  playerIndex: 0 | 1,
  cardDb: Map<string, CardData> | undefined,
): boolean {
  if (!cardDb) return false;
  const leader = state.players[playerIndex].leader;
  const data = cardDb.get(leader.cardId);
  const schema = data?.effectSchema ?? null;
  const mods = schema?.rule_modifications ?? [];
  return mods.some(
    (m) =>
      m.rule_type === "LOSS_CONDITION_MOD" &&
      m.trigger_event === "DECK_OUT" &&
      m.modification === "DELAYED_LOSS",
  );
}

/**
 * Run all defeat checks against current state.
 * Returns a result if the game is over, null otherwise.
 *
 * When `context.endOfTurn` is true, deck-out loses are evaluated against the
 * sticky `state.turn.deckHitZeroThisTurn` flag — this is the window in which
 * delayed-loss leaders (e.g., Brook) pay their deferred loss.
 */
export function checkDefeat(
  state: GameState,
  context: RuleProcessingContext = {},
  cardDb?: Map<string, CardData>,
): DefeatResult | null {
  const [p0, p1] = state.players;

  const p0HasDelayed = hasDelayedDeckOutLoss(state, 0, cardDb);
  const p1HasDelayed = hasDelayedDeckOutLoss(state, 1, cardDb);

  // Immediate deck-out: deck is currently 0 AND player has no delayed-loss rule.
  // Delayed-loss players defer the deck-out check to end-of-turn.
  const p0DeckOutNow = p0.deck.length === 0 && !p0HasDelayed;
  const p1DeckOutNow = p1.deck.length === 0 && !p1HasDelayed;

  // End-of-turn deck-out: sticky flag set earlier in the turn AND the player
  // still carries the delayed-loss rule (e.g., Brook wasn't removed/negated).
  const sticky = state.turn.deckHitZeroThisTurn ?? [false, false];
  const p0DeckOutEot = !!context.endOfTurn && sticky[0] && p0HasDelayed;
  const p1DeckOutEot = !!context.endOfTurn && sticky[1] && p1HasDelayed;

  // WIN_INSTEAD (OP03-040 / P-117 Nami): "when your deck is reduced to 0, you
  // win the game instead of losing" replaces that player's deck-out loss
  // with a win, unless the Leader's effects are negated (qa_op09.md:204-206).
  const p0WinInstead = (p0DeckOutNow || p0DeckOutEot) && hasDeckOutWinInstead(state, 0, cardDb);
  const p1WinInstead = (p1DeckOutNow || p1DeckOutEot) && hasDeckOutWinInstead(state, 1, cardDb);

  const p0DeckOut = (p0DeckOutNow || p0DeckOutEot) && !p0WinInstead;
  const p1DeckOut = (p1DeckOutNow || p1DeckOutEot) && !p1WinInstead;

  // Life-out defeat (9-2-1-1): only a damage determination made while the
  // player had 0 Life qualifies. The Life count now is not consulted, so
  // taking the last Life card is never defeat by itself.
  const lethal = context.lethalDamage ?? [];
  const p0LifeOut = lethal.includes(0);
  const p1LifeOut = lethal.includes(1);

  // A player loses when they meet an unreplaced defeat condition, or when
  // the opponent wins by WIN_INSTEAD at this checkpoint. Joint checkpoints
  // (assumed, no official ruling; literal reading of the printed text): the
  // clause replaces only the deck-out loss, so a Nami player who also takes
  // lethal damage at the same checkpoint still loses by 9-2-1-1 while the
  // win makes the opponent lose: both lose, a draw (9-2-1). A Nami deck-out
  // together with any opponent defeat is a Nami win.
  const p0Loses = p0DeckOut || p0LifeOut || p1WinInstead;
  const p1Loses = p1DeckOut || p1LifeOut || p0WinInstead;
  if (!p0Loses && !p1Loses) return null;

  const reasons: string[] = [];
  if (p0WinInstead) reasons.push("Player 1's deck reached 0 — Player 1 wins instead of losing");
  if (p0DeckOut) reasons.push("Player 1 decked out");
  if (p0LifeOut) reasons.push("Player 1's life reached 0");
  if (p1WinInstead) reasons.push("Player 2's deck reached 0 — Player 2 wins instead of losing");
  if (p1DeckOut) reasons.push("Player 2 decked out");
  if (p1LifeOut) reasons.push("Player 2's life reached 0");
  const reason = reasons.join("; ");

  if (p0Loses && p1Loses) return { gameOver: true, winner: null, reason: `${reason} — draw` };
  return { gameOver: true, winner: p0Loses ? 1 : 0, reason };
}

/**
 * True when the player's Leader carries an unnegated LOSS_CONDITION_MOD /
 * WIN_INSTEAD rule modification for the DECK_OUT event (OP03-040, P-117
 * Nami). Read from both `rule_modifications` and `rule_modification` effect
 * blocks, where the Nami schemas author it. A negated Leader loses on
 * deck-out (qa_op09.md:204-206, qa_op10.md:207).
 */
export function hasDeckOutWinInstead(
  state: GameState,
  playerIndex: 0 | 1,
  cardDb: Map<string, CardData> | undefined,
): boolean {
  if (!cardDb) return false;
  const leader = state.players[playerIndex].leader;
  const schema = cardDb.get(leader.cardId)?.effectSchema;
  if (!schema) return false;
  const rules = [
    ...(schema.rule_modifications ?? []),
    ...(schema.effects ?? []).flatMap((block) =>
      block.category === "rule_modification" && block.rule ? [block.rule] : [],
    ),
  ];
  const winInstead = rules.some(
    (m) =>
      m.rule_type === "LOSS_CONDITION_MOD" &&
      m.trigger_event === "DECK_OUT" &&
      m.modification === "WIN_INSTEAD",
  );
  return winInstead && !isCardNegated(leader, state, cardDb);
}

/**
 * Mark the sticky "deck hit zero this turn" flag the first time either
 * player's deck is 0 at a checkpoint (OP15-022 Brook's delayed loss reads it
 * at the end of the turn). Reset on turn change by phases.ts.
 */
export function updateDeckHitZeroFlag(state: GameState): GameState {
  const [p0, p1] = state.players;
  const flag: [boolean, boolean] = state.turn.deckHitZeroThisTurn ?? [false, false];
  const next0 = flag[0] || p0.deck.length === 0;
  const next1 = flag[1] || p1.deck.length === 0;
  if (next0 === flag[0] && next1 === flag[1] && state.turn.deckHitZeroThisTurn) {
    return state;
  }
  return {
    ...state,
    turn: { ...state.turn, deckHitZeroThisTurn: [next0, next1] },
  };
}

/**
 * The rule-processing checkpoint (9-1-2, 9-2-1). Evaluates both players'
 * defeat conditions and the delayed deck-out modification once, then writes
 * the terminal state once through `terminateGame`. Returns the state
 * unchanged when the game is already over or nobody meets a condition.
 */
export function runRuleProcessing(
  state: GameState,
  context: RuleProcessingContext,
  cardDb: Map<string, CardData> | undefined,
  actorIndex: 0 | 1 = state.turn.activePlayerIndex,
): GameState {
  if (state.status !== "IN_PROGRESS") return state;
  // Must run before checkDefeat so end-of-turn evaluation sees the flag.
  const flagged = updateDeckHitZeroFlag(state);
  const defeat = checkDefeat(flagged, context, cardDb);
  if (!defeat) return flagged;
  return terminateGame(
    flagged,
    { kind: "RULES", winner: defeat.winner, reason: defeat.reason },
    actorIndex,
  );
}

/**
 * True when a deck or Life count differs between two states. Mid-resolution
 * checkpoints run when this is true or a lethal determination was made
 * ("after each move that changes a deck or Life count"). The action-end
 * checkpoint always runs, so a count that was already 0 when the action
 * began has already been processed by the previous action's checkpoint.
 */
export function deckOrLifeCountsChanged(
  before: Pick<GameState, "players">,
  after: Pick<GameState, "players">,
): boolean {
  return before.players.some(
    (player, index) =>
      player.deck.length !== after.players[index].deck.length ||
      player.life.length !== after.players[index].life.length,
  );
}

/**
 * Mid-resolution checkpoint: run rule processing when `after` differs from
 * `before` in a deck or Life count, or `context` carries a lethal damage
 * determination or the end-of-turn window. Otherwise return `after` unchanged.
 */
export function runRuleProcessingAfterMove(
  before: Pick<GameState, "players">,
  after: GameState,
  context: RuleProcessingContext,
  cardDb: Map<string, CardData> | undefined,
  actorIndex?: 0 | 1,
): GameState {
  if (!(context.lethalDamage?.length) && !context.endOfTurn && !deckOrLifeCountsChanged(before, after)) {
    return after;
  }
  return runRuleProcessing(after, context, cardDb, actorIndex);
}
