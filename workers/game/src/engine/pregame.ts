/**
 * OPT-366: Pre-game state machine.
 *
 * Drives §5-2-1-1 through §5-2-1-8 of the OPTCG Comprehensive Rules:
 *
 *   PRIORITY_ROLLING → PRIORITY_CHOICE → START_OF_GAME_FX → HAND_DEAL
 *   → MULLIGAN_DECISIONS → LIFE_PLACEMENT → DONE
 *
 * The FSM is single-step: each call to `advancePregame` either runs a
 * server-side step (no prompt; transitions immediately) or surfaces a prompt
 * via `pendingPrompt` and pauses until `resumePregameFromPrompt` is called
 * with the player's response. The DO calls `advancePregame` after init and
 * after each prompt response until `pregame === null` (FSM finished).
 *
 * START_OF_GAME_FX is intentionally a passthrough today (delegated to OPT-365
 * for OP13-079 Imu's Mary Geoise stage play). The phase exists so the ordering
 * is locked in: priority decision → start-of-game effects → hand deal.
 */

import type {
  CardData,
  GameAction,
  GameState,
  PendingPromptState,
  PendingGameEvent,
} from "../types.js";
import type {
  PlayerChoicePrompt,
  PregameState,
} from "../../../../shared/game-types.js";
import { dealOpeningHand, placeLifeCards, applyMulligan } from "./setup.js";
import { emitPendingEvent } from "./events.js";

const PRIORITY_ROLL_TIMEOUT_MS = 60_000;

export interface PregameStepResult {
  state: GameState;
  /** True when the FSM has fully drained — caller advances into REFRESH. */
  done: boolean;
}

/**
 * Initialize the pregame state machine. Called by GameSession.handleInit
 * immediately after `prepareDecksAndLeaders`.
 */
export function startPregame(state: GameState): GameState {
  const pregame: PregameState = {
    phase: "PRIORITY_ROLLING",
    priorityRolls: null,
    priorityDeciderIndex: null,
    firstPlayerIndex: null,
    mulliganDecisions: [null, null],
  };
  return { ...state, pregame };
}

/**
 * Advance the FSM through any non-prompting phases. Returns `done = true`
 * when the FSM is finished (state.pregame is null and the first player's
 * turn machinery should run).
 */
export function advancePregame(
  state: GameState,
  cardDb: Map<string, CardData>,
  testRolls: number[] | null | undefined,
  rng: () => number,
): PregameStepResult {
  let current = state;
  // Defensive: drain consecutive auto-phases until we hit a phase that pauses
  // for player input or until the FSM completes.
  for (let i = 0; i < 16; i++) {
    if (!current.pregame) return { state: current, done: true };

    switch (current.pregame.phase) {
      case "PRIORITY_ROLLING": {
        current = runPriorityRoll(current, testRolls, rng);
        // Transition to PRIORITY_CHOICE which pauses on a prompt.
        current = enterPriorityChoice(current);
        return { state: current, done: false };
      }
      case "PRIORITY_CHOICE":
        // Awaiting prompt response.
        return { state: current, done: false };
      case "START_OF_GAME_FX": {
        // OPT-365 owns this — today it is a passthrough.
        current = {
          ...current,
          pregame: { ...current.pregame, phase: "HAND_DEAL" },
        };
        continue;
      }
      case "HAND_DEAL": {
        current = dealOpeningHand(current, 0);
        current = dealOpeningHand(current, 1);
        current = enterMulliganDecisions(current);
        return { state: current, done: false };
      }
      case "MULLIGAN_DECISIONS":
        // Awaiting prompt response (or transitioning out below).
        return { state: current, done: false };
      case "LIFE_PLACEMENT": {
        current = placeLifeCards(current, cardDb);
        current = {
          ...current,
          pregame: { ...current.pregame, phase: "DONE" },
        };
        continue;
      }
      case "DONE": {
        // Lock in firstPlayerIndex and clear pregame. Active player is set so
        // runStartOfTurnAutoPhases (REFRESH→DRAW→DON→MAIN) runs for the right
        // player.
        const firstPlayerIndex = current.pregame.firstPlayerIndex ?? 0;
        current = {
          ...current,
          pregame: null,
          turn: {
            ...current.turn,
            activePlayerIndex: firstPlayerIndex,
            firstPlayerIndex,
          },
        };
        return { state: current, done: true };
      }
    }
  }
  return { state: current, done: false };
}

/**
 * Apply a player's response to a pregame prompt. Returns the next state with
 * the FSM advanced past the prompt — caller then re-runs `advancePregame`
 * to drain any server-side phases that follow.
 */
export function resumePregameFromPrompt(
  state: GameState,
  action: GameAction,
  respondingPlayer: 0 | 1,
): GameState {
  if (!state.pregame) return state;
  const pregame = state.pregame;

  if (pregame.phase === "PRIORITY_CHOICE") {
    if (action.type !== "PLAYER_CHOICE") return state;
    const choseFirst = action.choiceId === "FIRST";
    const firstPlayerIndex: 0 | 1 = choseFirst
      ? respondingPlayer
      : (respondingPlayer === 0 ? 1 : 0);

    const event: PendingGameEvent = {
      type: "PREGAME_FIRST_PLAYER_DECIDED",
      playerIndex: respondingPlayer,
      payload: { firstPlayerIndex },
    };

    return emitPendingEvent(
      {
        ...state,
        pendingPrompt: null,
        pregame: {
          ...pregame,
          phase: "START_OF_GAME_FX",
          firstPlayerIndex,
        },
      },
      event,
      respondingPlayer,
    );
  }

  if (pregame.phase === "MULLIGAN_DECISIONS") {
    if (action.type !== "PLAYER_CHOICE") return state;
    const redrew = action.choiceId === "REDRAW";
    let nextState = state;
    if (redrew) nextState = applyMulligan(nextState, respondingPlayer);

    const decisions: [boolean | null, boolean | null] = [...pregame.mulliganDecisions];
    decisions[respondingPlayer] = redrew;

    nextState = emitPendingEvent(
      { ...nextState, pendingPrompt: null },
      {
        type: "MULLIGAN_DECISION",
        playerIndex: respondingPlayer,
        payload: { redrew },
      },
      respondingPlayer,
    );

    // If both players have decided, transition to LIFE_PLACEMENT.
    if (decisions[0] !== null && decisions[1] !== null) {
      return {
        ...nextState,
        pregame: { ...pregame, phase: "LIFE_PLACEMENT", mulliganDecisions: decisions },
      };
    }

    // Otherwise re-enter MULLIGAN_DECISIONS so the next decider gets a prompt.
    return enterMulliganDecisions({
      ...nextState,
      pregame: { ...pregame, mulliganDecisions: decisions },
    });
  }

  return state;
}

/** True when the given action targets the current pregame prompt. */
export function isPregamePromptResponse(state: GameState): boolean {
  return state.pregame !== null
    && (state.pregame.phase === "PRIORITY_CHOICE"
      || state.pregame.phase === "MULLIGAN_DECISIONS");
}

// ─── Internal helpers ────────────────────────────────────────────────────────

/**
 * Roll 2d6 for priority. Re-rolls on tie until a winner is found. The final
 * (non-tied) pair is recorded on pregame.priorityRolls; intermediate ties are
 * not surfaced to clients (they would just be cosmetic noise — the spec says
 * "re-roll on tie").
 */
function runPriorityRoll(
  state: GameState,
  testRolls: number[] | null | undefined,
  rng: () => number,
): GameState {
  const queue = (testRolls ?? []).slice();
  const nextRoll = (): number => {
    if (queue.length > 0) return queue.shift()!;
    // crypto-backed when available, falls back to the supplied rng
    return rollD6(rng);
  };

  let p0 = 0;
  let p1 = 0;
  // Cap reroll loop in case of pathological test input.
  for (let i = 0; i < 32; i++) {
    p0 = nextRoll();
    p1 = nextRoll();
    if (p0 !== p1) break;
  }
  if (p0 === p1) {
    // Ultimate fallback — pick a winner deterministically rather than spin.
    p0 = 6;
    p1 = 1;
  }

  const priorityDeciderIndex: 0 | 1 = p0 > p1 ? 0 : 1;
  const event: PendingGameEvent = {
    type: "PREGAME_PRIORITY_ROLLED",
    playerIndex: priorityDeciderIndex,
    payload: { rolls: [p0, p1], priorityDeciderIndex },
  };
  return emitPendingEvent(
    {
      ...state,
      pregame: {
        ...state.pregame!,
        priorityRolls: [p0, p1],
        priorityDeciderIndex,
      },
    },
    event,
    priorityDeciderIndex,
  );
}

function enterPriorityChoice(state: GameState): GameState {
  const decider = state.pregame?.priorityDeciderIndex ?? 0;
  const prompt: PlayerChoicePrompt = {
    promptType: "PLAYER_CHOICE",
    effectDescription: "PREGAME_FIRST_OR_SECOND",
    choices: [
      { id: "FIRST", label: "Go first" },
      { id: "SECOND", label: "Go second" },
    ],
  };
  const pendingPrompt: PendingPromptState = {
    options: prompt,
    respondingPlayer: decider,
    resumeContext: { type: "PREGAME_PRIORITY_CHOICE" },
  };
  return {
    ...state,
    pregame: { ...state.pregame!, phase: "PRIORITY_CHOICE" },
    pendingPrompt,
  };
}

function enterMulliganDecisions(state: GameState): GameState {
  const pregame = state.pregame;
  if (!pregame || pregame.firstPlayerIndex === null) return state;

  // §5-2-1-6 order: first player decides, then second player.
  const order: [0 | 1, 0 | 1] = [
    pregame.firstPlayerIndex,
    (pregame.firstPlayerIndex === 0 ? 1 : 0) as 0 | 1,
  ];
  const nextDecider = order.find((p) => pregame.mulliganDecisions[p] === null);
  if (nextDecider === undefined) {
    // All decided — leave the FSM to advance to LIFE_PLACEMENT on its next tick.
    return { ...state, pregame: { ...pregame, phase: "LIFE_PLACEMENT" } };
  }

  const prompt: PlayerChoicePrompt = {
    promptType: "PLAYER_CHOICE",
    effectDescription: "PREGAME_MULLIGAN",
    choices: [
      { id: "KEEP", label: "Keep hand" },
      { id: "REDRAW", label: "Redraw" },
    ],
  };
  const pendingPrompt: PendingPromptState = {
    options: prompt,
    respondingPlayer: nextDecider,
    resumeContext: { type: "PREGAME_MULLIGAN" },
  };
  return {
    ...state,
    pregame: { ...pregame, phase: "MULLIGAN_DECISIONS" },
    pendingPrompt,
  };
}

function rollD6(rng: () => number): number {
  return Math.floor(rng() * 6) + 1;
}

/** crypto-backed RNG factory; falls back to Math.random when unavailable. */
export function defaultPregameRng(): () => number {
  return () => {
    const g = (globalThis as unknown as { crypto?: Crypto }).crypto;
    if (g?.getRandomValues) {
      const buf = new Uint32Array(1);
      g.getRandomValues(buf);
      return buf[0] / 0x1_0000_0000;
    }
    return Math.random();
  };
}

void PRIORITY_ROLL_TIMEOUT_MS; // reserved for future per-prompt timeouts
