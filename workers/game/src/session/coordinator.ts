import type {
  CardData,
  CardInstance,
  GameAction,
  GameState,
  LifeCard,
  PendingPromptState,
  PromptType,
} from "../types.js";
import { isStartOfTurnAutoPhase } from "../engine/phases.js";
import { runPipeline } from "../engine/pipeline.js";
import { setPlayerConnected } from "../engine/state.js";
import { boundUndoHistory } from "./history.js";

type DurablePromptType = Extract<
  PromptType,
  | "SELECT_TARGET"
  | "ARRANGE_TOP_CARDS"
  | "REDISTRIBUTE_DON"
  | "PLAYER_CHOICE"
  | "OPTIONAL_EFFECT"
  | "REVEAL_TRIGGER"
>;

const EXPECTED_RESPONSE_TYPES: Record<
  DurablePromptType,
  ReadonlyArray<GameAction["type"]>
> = {
  SELECT_TARGET: ["SELECT_TARGET"],
  ARRANGE_TOP_CARDS: ["ARRANGE_TOP_CARDS"],
  REDISTRIBUTE_DON: ["REDISTRIBUTE_DON"],
  PLAYER_CHOICE: ["PLAYER_CHOICE"],
  OPTIONAL_EFFECT: ["PLAYER_CHOICE", "PASS"],
  REVEAL_TRIGGER: ["REVEAL_TRIGGER"],
};

function isDurablePromptType(value: PromptType): value is DurablePromptType {
  return value in EXPECTED_RESPONSE_TYPES;
}

export type PromptRoute =
  | { kind: "pipeline"; state: GameState }
  | { kind: "resume"; state: GameState }
  | { kind: "reject"; reason: string; state: GameState };

export interface PresenceUpdate {
  connected: boolean;
  awayReason: "LEFT" | "DISCONNECTED" | null;
  rejoinDeadlineAt: number | null;
}

export type SessionActionResult =
  | {
      kind: "reject";
      state: GameState;
      undoHistory: GameState[];
      reason: string;
    }
  | {
      kind: "resume";
      state: GameState;
      undoHistory: GameState[];
    }
  | {
      kind: "undo";
      state: GameState;
      undoHistory: GameState[];
      canUndo: boolean;
    }
  | {
      kind: "applied";
      state: GameState;
      undoHistory: GameState[];
      canUndo: boolean;
      gameOver?: { winner: 0 | 1 | null; reason: string };
    };

const INACTIVE_PLAYER_ACTIONS = new Set<GameAction["type"]>([
  "DECLARE_BLOCKER",
  "USE_COUNTER",
  "USE_COUNTER_EVENT",
  "REVEAL_TRIGGER",
  "PASS",
]);

const UNDOABLE_ACTIONS = new Set<GameAction["type"]>([
  "PLAY_CARD",
  "ATTACH_DON",
  "ACTIVATE_EFFECT",
  "ADVANCE_PHASE",
]);

/**
 * Serializes engine commands and owns session-level action/prompt policy.
 * It has no Cloudflare, WebSocket, storage, or network dependency.
 */
export class SessionCoordinator {
  private tail: Promise<void> = Promise.resolve();

  run<T>(command: () => Promise<T>): Promise<T> {
    const result = this.tail.then(command);
    this.tail = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  routePromptResponse(
    state: GameState,
    playerIndex: 0 | 1,
    action: GameAction
  ): PromptRoute {
    if (!state.pendingPrompt) {
      return promptResponseId(action)
        ? { kind: "reject", reason: "That prompt response is stale", state }
        : { kind: "pipeline", state };
    }

    if (action.type === "CONCEDE") return { kind: "pipeline", state };
    const prompt = state.pendingPrompt;
    const promptType = prompt.options.promptType;
    const expected = isDurablePromptType(promptType)
      ? EXPECTED_RESPONSE_TYPES[promptType]
      : null;
    if (!expected) {
      return {
        kind: "reject",
        reason: "Waiting for player to respond to prompt",
        state,
      };
    }
    if (playerIndex !== prompt.respondingPlayer) {
      return {
        kind: "reject",
        reason: "Waiting for opponent to respond to prompt",
        state,
      };
    }
    if (!expected.includes(action.type)) {
      return {
        kind: "reject",
        reason: `Expected a ${promptType} response`,
        state,
      };
    }
    if (prompt.promptId && promptResponseId(action) !== prompt.promptId) {
      return { kind: "reject", reason: "That prompt response is stale", state };
    }

    const reason = validatePromptPayload(prompt, action);
    if (reason) return { kind: "reject", reason, state };
    if (action.type === "REVEAL_TRIGGER") {
      return { kind: "pipeline", state: { ...state, pendingPrompt: null } };
    }
    return { kind: "resume", state };
  }

  executeAction(
    initialState: GameState,
    initialUndoHistory: readonly GameState[],
    playerIndex: 0 | 1,
    action: GameAction,
    cardDb: Map<string, CardData>
  ): SessionActionResult {
    const undoHistory = boundUndoHistory(initialUndoHistory);
    if (
      initialState.status === "FINISHED" ||
      initialState.status === "ABANDONED"
    ) {
      return {
        kind: "reject",
        state: initialState,
        undoHistory,
        reason: "Game is already over",
      };
    }

    if (action.type === "UNDO") {
      if (!this.canUndo(initialState, undoHistory, playerIndex)) {
        return {
          kind: "reject",
          state: initialState,
          undoHistory,
          reason: "Cannot undo right now",
        };
      }
      const state = undoHistory.pop()!;
      return {
        kind: "undo",
        state,
        undoHistory,
        canUndo: this.canUndo(state, undoHistory, playerIndex),
      };
    }

    const pauseReason = this.pauseReason(initialState, playerIndex);
    if (pauseReason && action.type !== "CONCEDE") {
      return {
        kind: "reject",
        state: initialState,
        undoHistory,
        reason: pauseReason,
      };
    }

    const promptRoute = this.routePromptResponse(
      initialState,
      playerIndex,
      action
    );
    if (promptRoute.kind === "reject") {
      return {
        kind: "reject",
        state: promptRoute.state,
        undoHistory,
        reason: promptRoute.reason,
      };
    }
    if (promptRoute.kind === "resume") {
      return { kind: "resume", state: promptRoute.state, undoHistory };
    }

    const stateBeforePipeline = promptRoute.state;
    if (action.type !== "CONCEDE") {
      let expectedPlayer: 0 | 1 = INACTIVE_PLAYER_ACTIONS.has(action.type)
        ? stateBeforePipeline.turn.activePlayerIndex === 0
          ? 1
          : 0
        : stateBeforePipeline.turn.activePlayerIndex;
      if (
        action.type === "REVEAL_TRIGGER" &&
        stateBeforePipeline.turn.pendingTriggerFromEffect
      ) {
        expectedPlayer =
          stateBeforePipeline.turn.pendingTriggerFromEffect.damagedPlayerIndex;
      }
      if (playerIndex !== expectedPlayer) {
        return {
          kind: "reject",
          state: stateBeforePipeline,
          undoHistory,
          reason: "Not your turn",
        };
      }
    }

    let nextUndoHistory = UNDOABLE_ACTIONS.has(action.type)
      ? [stateBeforePipeline]
      : [];
    let pipeline = runPipeline(
      stateBeforePipeline,
      action,
      cardDb,
      playerIndex
    );
    if (!pipeline.valid) {
      return {
        kind: "reject",
        state: stateBeforePipeline,
        undoHistory: [],
        reason: pipeline.error ?? "Invalid action",
      };
    }
    if (!pipeline.gameOver) {
      pipeline = {
        ...pipeline,
        state: this.advanceStartOfTurn(pipeline.state, cardDb),
      };
    }

    let state = pipeline.state;
    if (state.pendingPrompt || state.effectStack.length > 0)
      nextUndoHistory = [];
    state = this.surfaceRevealTrigger(state, cardDb);
    if (pipeline.gameOver) nextUndoHistory = [];
    return {
      kind: "applied",
      state,
      undoHistory: nextUndoHistory,
      canUndo:
        nextUndoHistory.length > 0 &&
        !state.pendingPrompt &&
        state.effectStack.length === 0 &&
        !state.turn.battleSubPhase,
      gameOver: pipeline.gameOver,
    };
  }

  advanceStartOfTurn(
    state: GameState,
    cardDb: Map<string, CardData>
  ): GameState {
    let current = state;
    while (
      current.status === "IN_PROGRESS" &&
      isStartOfTurnAutoPhase(current)
    ) {
      const result = runPipeline(
        current,
        { type: "ADVANCE_PHASE" },
        cardDb,
        current.turn.activePlayerIndex
      );
      if (!result.valid) break;
      current = result.state;
    }
    return current;
  }

  surfaceRevealTrigger(
    state: GameState,
    cardDb: Map<string, CardData>
  ): GameState {
    if (state.pendingPrompt || state.effectStack.length > 0) return state;
    const { battleSubPhase, battle, pendingTriggerFromEffect } = state.turn;
    let lifeCard: LifeCard | undefined;
    let respondingPlayer: 0 | 1 | undefined;

    if (battleSubPhase === "DAMAGE_STEP" && battle) {
      lifeCard = battle.pendingTriggerLifeCard;
      if (lifeCard)
        respondingPlayer = state.turn.activePlayerIndex === 0 ? 1 : 0;
    } else if (pendingTriggerFromEffect) {
      lifeCard = pendingTriggerFromEffect.lifeCard;
      respondingPlayer = pendingTriggerFromEffect.damagedPlayerIndex;
    }
    if (!lifeCard || respondingPlayer === undefined) return state;

    const cardData = cardDb.get(lifeCard.cardId);
    const promptCard: CardInstance = {
      instanceId: lifeCard.instanceId,
      cardId: lifeCard.cardId,
      zone: "LIFE",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: null,
      controller: respondingPlayer,
      owner: respondingPlayer,
    };
    return {
      ...state,
      pendingPrompt: {
        options: {
          promptType: "REVEAL_TRIGGER",
          cards: [promptCard],
          effectDescription:
            cardData?.triggerText ??
            cardData?.effectText ??
            "You may reveal this Trigger card to activate its effect",
          optional: false,
          timeoutMs: 30_000,
        },
        respondingPlayer,
        resumeContext: null,
      },
    };
  }

  setPlayerPresence(
    state: GameState,
    playerIndex: 0 | 1,
    update: PresenceUpdate
  ): GameState {
    const connected = setPlayerConnected(state, playerIndex, update.connected);
    const players: GameState["players"] = [
      connected.players[0],
      connected.players[1],
    ];
    players[playerIndex] = { ...players[playerIndex], ...update };
    return { ...connected, players };
  }

  canUndo(
    state: GameState | null,
    undoHistory: readonly GameState[],
    playerIndex: 0 | 1
  ): boolean {
    return (
      !!state &&
      undoHistory.length > 0 &&
      state.status === "IN_PROGRESS" &&
      playerIndex === state.turn.activePlayerIndex &&
      !state.pendingPrompt &&
      state.effectStack.length === 0 &&
      !state.turn.battleSubPhase
    );
  }

  pauseReason(state: GameState | null, playerIndex: 0 | 1): string | null {
    if (!state) return null;
    const awayPlayers = ([0, 1] as const).filter((index) => {
      const player = state.players[index];
      return !player.connected && player.rejoinDeadlineAt !== null;
    });
    if (awayPlayers.length === 0) return null;
    if (awayPlayers.length === 2)
      return "Both players are away. Rejoin to continue.";

    const awayPlayer = awayPlayers[0];
    if (awayPlayer === playerIndex)
      return "You left the game. Rejoin to continue.";
    if (state.turn.activePlayerIndex === awayPlayer) {
      return `Waiting for Player ${awayPlayer + 1} to rejoin for their turn.`;
    }
    const subPhase = state.turn.battleSubPhase;
    if (
      subPhase === "BLOCK_STEP" ||
      subPhase === "COUNTER_STEP" ||
      subPhase === "DAMAGE_STEP"
    ) {
      return `Waiting for Player ${awayPlayer + 1} to rejoin before battle can continue.`;
    }
    return null;
  }
}

export function isDeclineResponse(action: GameAction): boolean {
  return (
    action.type === "PASS" ||
    (action.type === "PLAYER_CHOICE" && action.choiceId === "skip")
  );
}

function promptResponseId(action: GameAction): string | undefined {
  return "promptId" in action ? action.promptId : undefined;
}

function validatePromptPayload(
  prompt: PendingPromptState,
  action: GameAction
): string | null {
  if (
    prompt.options.promptType === "ARRANGE_TOP_CARDS" &&
    action.type === "ARRANGE_TOP_CARDS"
  ) {
    return validateArrangeResponse(prompt.options, action);
  }
  if (
    prompt.options.promptType === "PLAYER_CHOICE" &&
    action.type === "PLAYER_CHOICE"
  ) {
    return prompt.options.choices.some(
      (choice) => choice.id === action.choiceId
    )
      ? null
      : "That choice is no longer available";
  }
  if (
    prompt.options.promptType === "OPTIONAL_EFFECT" &&
    action.type === "PLAYER_CHOICE"
  ) {
    return action.choiceId === "activate" ||
      action.choiceId === "accept" ||
      action.choiceId === "skip"
      ? null
      : "That choice is no longer available";
  }
  return null;
}

function validateArrangeResponse(
  prompt: Extract<
    PendingPromptState["options"],
    { promptType: "ARRANGE_TOP_CARDS" }
  >,
  action: Extract<GameAction, { type: "ARRANGE_TOP_CARDS" }>
): string | null {
  const revealedIds = prompt.cards.map((card) => card.instanceId);
  const revealed = new Set(revealedIds);
  const requestedKept = action.keptCardInstanceIds?.length
    ? action.keptCardInstanceIds
    : action.keptCardInstanceId
      ? [action.keptCardInstanceId]
      : [];
  const kept = new Set(requestedKept);
  const ordered = new Set(action.orderedInstanceIds);

  if (
    kept.size !== requestedKept.length ||
    ordered.size !== action.orderedInstanceIds.length
  ) {
    return "Arrangement contains duplicate cards";
  }
  if (
    requestedKept.some((id) => !revealed.has(id)) ||
    action.orderedInstanceIds.some((id) => !revealed.has(id))
  ) {
    return "Arrangement contains a card that was not revealed";
  }
  if (requestedKept.some((id) => ordered.has(id))) {
    return "A card cannot be both kept and arranged";
  }

  const validPicks =
    prompt.validTargets === undefined ? revealed : new Set(prompt.validTargets);
  if (requestedKept.some((id) => !validPicks.has(id)))
    return "That card is not a valid pick";
  if (requestedKept.length > (prompt.maxKeep ?? 1))
    return "Too many cards were selected";
  if (
    kept.size + ordered.size !== revealed.size ||
    revealedIds.some((id) => !kept.has(id) && !ordered.has(id))
  ) {
    return "Arrangement must include every revealed card exactly once";
  }
  return null;
}
