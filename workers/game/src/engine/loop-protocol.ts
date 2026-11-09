/**
 * Infinite-loop protocol (rules 11-1-1-1 to 11-1-1-3, OPT-952).
 *
 * The engine has no "declare a count" prompt. It applies the protocol through
 * the decisions players already make:
 *
 * - A loop that passes through a prompt the responding player can decline
 *   (an optional effect, an optional Trigger reveal, an "up to" selection, a
 *   Skip choice, an optional Blocker) is one that player can stop. Answering
 *   such a prompt once the resolution has used half its action budget starts
 *   a new budget, so the engine never ends that loop; the player's own
 *   answers are the declared count, and declining is
 *   "finishing it at a timing when that player can choose to stop"
 *   (11-1-1-2). If both players have such prompts in the loop, the first one
 *   to decline stops it, which is the fewer of the two counts (11-1-1-3).
 * - A loop with no such prompt in it is one neither player can stop. When the
 *   action budget runs out and the resolution has repeated a game state, the
 *   game ends in the rule 11-1-1-1 draw (`INFINITE_LOOP_DRAW`).
 * - A budget overflow with no repeated state stays the engine-limit outcome
 *   (Decision 5): it is a long chain, not a proven loop.
 *
 * Repeated-state detection (Brent's cycle detection) samples a fingerprint of
 * the game each time an effect-stack frame is pushed, which is where every
 * effect and trigger activation begins. Straight action chains inside one
 * effect push no frames and are never classified as loops. Sampling starts
 * at half the budget so ordinary resolutions pay nothing.
 *
 * The probe is transient: it lives in a side table keyed by the
 * `actionBudget` object, which `consumeResolutionAction` replaces on every
 * action and transfers the probe to. Every prompt reply replaces the budget
 * object (`admitPromptReplyBudget`), so a probe never survives a suspension,
 * and a live session and a reloaded one classify the same way.
 */

import type { CardInstance, GameState, PendingPromptState } from "../types.js";
import type { EffectStackFrame } from "../types.js";

type ActionBudget = GameState["executionContext"]["actionBudget"];

interface LoopProbe {
  /** Brent's tortoise: the fingerprint the probe compares new samples to. */
  anchor: string | null;
  /** Samples since the anchor was last moved. */
  sinceAnchor: number;
  /** Current anchor interval (a power of two). */
  interval: number;
  /** The game repeated a sampled state during this resolution. */
  repeated: boolean;
}

const probes = new WeakMap<ActionBudget, LoopProbe>();

/** Fraction of the action budget consumed before frame pushes are sampled. */
export function loopProbeThreshold(limit: number): number {
  return Math.floor(limit / 2);
}

/** Carry the probe from the previous budget object to its replacement. */
export function transferLoopProbe(from: ActionBudget, to: ActionBudget): void {
  const probe = probes.get(from);
  if (probe) probes.set(to, probe);
}

/** True when this resolution repeated a sampled game state. */
export function loopRepeatObserved(state: GameState): boolean {
  return probes.get(state.executionContext.actionBudget)?.repeated === true;
}

/**
 * Sample the game as `frame` is pushed. Records only; the action budget
 * decides when the resolution ends.
 */
export function observeFramePush(state: GameState, frame: EffectStackFrame): void {
  const budget = state.executionContext?.actionBudget;
  if (!budget) return;
  const consumed = Math.max(budget.consumed, state.engineActionCount ?? 0);
  if (consumed < loopProbeThreshold(budget.limit)) return;
  let probe = probes.get(budget);
  if (!probe) {
    probe = { anchor: null, sinceAnchor: 0, interval: 1, repeated: false };
    probes.set(budget, probe);
  }
  if (probe.repeated) return;
  const fingerprint = loopFingerprint(state, frame);
  if (probe.anchor === fingerprint) {
    probe.repeated = true;
    return;
  }
  probe.sinceAnchor += 1;
  if (probe.anchor === null || probe.sinceAnchor >= probe.interval) {
    probe.anchor = fingerprint;
    probe.sinceAnchor = 0;
    probe.interval *= 2;
  }
}

/**
 * The game state as rule 11-1-1-2 compares it ("all cards in all areas are
 * the same"), plus the effect-stack shape and the frame being pushed, so two
 * samples match only at the same point of the same loop action. Instance ids
 * are left out: they reset on every zone change (rule 3-1-6), so a card that
 * leaves and returns is the same card for this comparison.
 */
export function loopFingerprint(state: GameState, frame: EffectStackFrame): string {
  const cardIds = new Map<string, string>();
  const remember = (card: { instanceId: string; cardId: string }) => cardIds.set(card.instanceId, card.cardId);
  const fieldCard = (card: CardInstance) => {
    remember(card);
    const don = card.attachedDon.map((d) => d.state[0]).sort().join("");
    return `${card.cardId}:${card.state[0]}:${don}`;
  };
  const listed = (cards: readonly CardInstance[]) => cards.map((card) => (remember(card), card.cardId));
  const players = state.players.map((player) => [
    fieldCard(player.leader),
    player.characters.flatMap((card) => (card ? [fieldCard(card)] : [])).sort(),
    player.stage ? fieldCard(player.stage) : null,
    listed(player.hand).sort(),
    listed(player.deck),
    listed(player.trash),
    player.life.map((card) => (remember(card), `${card.cardId}:${card.face[0]}`)),
    listed(player.removedFromGame).sort(),
    player.donCostArea.map((don) => don.state[0]).sort().join(""),
    player.donDeck.length,
  ]);
  const frameShape = (f: EffectStackFrame) =>
    `${f.effectBlock?.id ?? "?"}@${cardIds.get(f.sourceCardInstanceId) ?? "?"}:${f.controller}:${f.phase}:${f.remainingActions?.length ?? 0}`;
  const battle = state.turn.battle;
  return JSON.stringify([
    state.turn.number,
    state.turn.activePlayerIndex,
    state.turn.phase,
    battle ? [battle.step ?? null, cardIds.get(battle.attackerInstanceId) ?? "?", cardIds.get(battle.targetInstanceId) ?? "?"] : null,
    players,
    state.effectStack.map(frameShape),
    frameShape(frame),
  ]);
}

/**
 * True when the responding player can answer `prompt` without continuing the
 * effect: the loop it belongs to is one that player can stop (11-1-1-2).
 */
export function promptOffersStop(prompt: PendingPromptState): boolean {
  const options = prompt.options;
  switch (options.promptType) {
    case "OPTIONAL_EFFECT":
      return true;
    case "REVEAL_TRIGGER":
    case "SELECT_BLOCKER":
      return options.optional;
    case "SELECT_TARGET":
      return options.countMin === 0;
    case "PLAYER_CHOICE":
      return options.confirmOrSkip === true ||
        options.choices.some((choice) => choice.id === "skip" && !choice.disabled);
    case "ARRANGE_TOP_CARDS":
    case "REDISTRIBUTE_DON":
      return false;
  }
}

/**
 * Budget admission for a prompt reply. Past half the budget, a reply to a
 * prompt that offers a stop starts a new budget (the player chose to continue
 * a loop they can stop).
 * Any other reply keeps the count. Either way the budget object is replaced,
 * so no repeated-state probe crosses a suspension.
 */
export function admitPromptReplyBudget(state: GameState, prompt: PendingPromptState): GameState {
  const context = state.executionContext;
  if (!context) return state;
  const consumed = Math.max(context.actionBudget.consumed, state.engineActionCount ?? 0);
  // Only a resolution already in the probe range is reset, so ordinary play
  // (far below the budget) persists exactly the counters it always did.
  const reset = promptOffersStop(prompt) && consumed >= loopProbeThreshold(context.actionBudget.limit);
  return {
    ...state,
    ...(reset ? { engineActionCount: 0 } : {}),
    executionContext: {
      ...context,
      actionBudget: { ...context.actionBudget, ...(reset ? { consumed: 0 } : {}) },
    },
  };
}
