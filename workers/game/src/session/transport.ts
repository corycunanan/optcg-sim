import type {
  CardData,
  CardInstance,
  GameState,
  LifeCard,
  PendingPromptState,
  ServerMessage,
} from "../types.js";
import { filterPromptOptionsForPlayer } from "../engine/visibility.js";
import { visibleStateForPlayer } from "./visibility.js";

export const SUPERSEDED_SOCKET_CLOSE_CODE = 1000;
export const SUPERSEDED_SOCKET_CLOSE_REASON = "superseded";
export const DISCONNECT_BROADCAST_DEBOUNCE_MS = 500;

export interface PlayerSocketAttachment {
  type: "game-session-player-socket";
  playerIndex: 0 | 1;
  connectionId: string;
  acceptedAt: number;
}

export interface SessionSocketState {
  acceptWebSocket(ws: WebSocket, tags?: string[]): void;
  getWebSockets(tag?: string): WebSocket[];
  getTags(ws: WebSocket): string[];
}

/** WebSocket authority, fan-out, prompt presentation, and disconnect debounce. */
export class SessionTransport {
  private nextWebSocketSequence = 0;
  private readonly pendingDisconnectTimers = new Map<
    0 | 1,
    ReturnType<typeof setTimeout>
  >();

  constructor(
    private readonly state: SessionSocketState,
    private readonly onDisconnect: (playerIndex: 0 | 1) => void | Promise<void>,
    private readonly now: () => number = Date.now
  ) {}

  accept(playerIndex: 0 | 1, ws: WebSocket): void {
    this.cancelDisconnect(playerIndex);
    this.state.acceptWebSocket(ws, [`player-${playerIndex}`]);
    const acceptedAt = this.now();
    ws.serializeAttachment({
      type: "game-session-player-socket",
      playerIndex,
      connectionId: `${acceptedAt}-${this.nextWebSocketSequence++}`,
      acceptedAt,
    } satisfies PlayerSocketAttachment);
    this.closeStaleSockets(playerIndex, ws);
  }

  playerIndexFor(ws: WebSocket): 0 | 1 | null {
    const tag = this.state
      .getTags(ws)
      .find((candidate) => candidate.startsWith("player-"));
    if (!tag) return null;
    const parsed = Number.parseInt(tag.slice("player-".length), 10);
    return parsed === 0 || parsed === 1 ? parsed : null;
  }

  isAuthoritative(ws: WebSocket, playerIndex: 0 | 1): boolean {
    return this.playerSocket(playerIndex) === ws;
  }

  playerSocket(playerIndex: 0 | 1): WebSocket | null {
    const sockets = this.state.getWebSockets(`player-${playerIndex}`);
    let newest: { ws: WebSocket; attachment: PlayerSocketAttachment } | null =
      null;
    for (const ws of sockets) {
      const attachment = getPlayerSocketAttachment(ws);
      if (!attachment || attachment.playerIndex !== playerIndex) continue;
      if (
        !newest ||
        attachment.acceptedAt > newest.attachment.acceptedAt ||
        (attachment.acceptedAt === newest.attachment.acceptedAt &&
          attachment.connectionId > newest.attachment.connectionId)
      ) {
        newest = { ws, attachment };
      }
    }
    return newest?.ws ?? sockets[0] ?? null;
  }

  scheduleDisconnect(playerIndex: 0 | 1): void {
    this.cancelDisconnect(playerIndex);
    const timer = setTimeout(() => {
      this.pendingDisconnectTimers.delete(playerIndex);
      void this.onDisconnect(playerIndex);
    }, DISCONNECT_BROADCAST_DEBOUNCE_MS);
    this.pendingDisconnectTimers.set(playerIndex, timer);
  }

  cancelDisconnect(playerIndex: 0 | 1): void {
    const timer = this.pendingDisconnectTimers.get(playerIndex);
    if (timer === undefined) return;
    clearTimeout(timer);
    this.pendingDisconnectTimers.delete(playerIndex);
  }

  send(ws: WebSocket, message: ServerMessage): void {
    try {
      ws.send(JSON.stringify(message));
    } catch {
      // Socket closed between authority lookup and delivery.
    }
  }

  broadcast(message: ServerMessage): void {
    const payload = JSON.stringify(message);
    for (const ws of this.state.getWebSockets()) {
      if (!this.shouldSend(ws)) continue;
      try {
        ws.send(payload);
      } catch {
        // Closed socket; hibernation cleanup owns removal.
      }
    }
  }

  broadcastExcept(exclude: WebSocket, message: ServerMessage): void {
    const payload = JSON.stringify(message);
    for (const ws of this.state.getWebSockets()) {
      if (ws === exclude || !this.shouldSend(ws)) continue;
      try {
        ws.send(payload);
      } catch {
        // Closed socket; hibernation cleanup owns removal.
      }
    }
  }

  broadcastFilteredState(
    state: GameState,
    cardDb: Map<string, CardData>,
    build: (
      filteredState: GameState,
      recipientPlayerIndex: 0 | 1
    ) => ServerMessage,
    exclude?: WebSocket
  ): void {
    for (const playerIndex of [0, 1] as const) {
      const ws = this.playerSocket(playerIndex);
      if (!ws || ws === exclude) continue;
      this.send(
        ws,
        build(visibleStateForPlayer(state, cardDb, playerIndex), playerIndex)
      );
    }
  }

  sendEffectPrompt(prompt: PendingPromptState): void {
    const ws = this.playerSocket(prompt.respondingPlayer);
    if (!ws) return;
    this.send(ws, {
      type: "game:prompt",
      promptId: prompt.promptId,
      options: filterPromptOptionsForPlayer(prompt.options),
    });
  }

  sendPendingPrompts(state: GameState, cardDb: Map<string, CardData>): void {
    if (state.pendingPrompt) {
      this.sendEffectPrompt(state.pendingPrompt);
      return;
    }
    if (state.effectStack.length > 0) return;

    const { battleSubPhase, battle } = state.turn;
    const inactivePlayer = state.turn.activePlayerIndex === 0 ? 1 : 0;
    const ws = this.playerSocket(inactivePlayer);
    if (!ws) return;

    if (battleSubPhase === "BLOCK_STEP") {
      const blockers = state.players[inactivePlayer].characters
        .filter(
          (card): card is CardInstance =>
            card !== null && card.state === "ACTIVE"
        )
        .map((card) => card.instanceId);
      this.send(ws, {
        type: "game:prompt",
        options: {
          promptType: "SELECT_BLOCKER",
          validTargets: blockers,
          optional: true,
          timeoutMs: 30_000,
        },
      });
      return;
    }

    if (
      battleSubPhase !== "DAMAGE_STEP" ||
      !battle ||
      !("pendingTriggerLifeCard" in battle)
    ) {
      return;
    }
    const triggerLifeCard = battle.pendingTriggerLifeCard;
    const cardData = triggerLifeCard
      ? cardDb.get(triggerLifeCard.cardId)
      : undefined;
    const cards = triggerLifeCard
      ? [lifeCardForPrompt(triggerLifeCard, inactivePlayer)]
      : [];
    this.send(ws, {
      type: "game:prompt",
      options: {
        promptType: "REVEAL_TRIGGER",
        cards,
        effectDescription:
          cardData?.triggerText ??
          cardData?.effectText ??
          "You may reveal this Trigger card to activate its effect",
        optional: false,
        timeoutMs: 30_000,
      },
    });
  }

  private closeStaleSockets(
    playerIndex: 0 | 1,
    authoritative: WebSocket
  ): void {
    for (const ws of this.state.getWebSockets(`player-${playerIndex}`)) {
      if (ws === authoritative) continue;
      try {
        ws.close(SUPERSEDED_SOCKET_CLOSE_CODE, SUPERSEDED_SOCKET_CLOSE_REASON);
      } catch {
        // Already closed.
      }
    }
  }

  private shouldSend(ws: WebSocket): boolean {
    const playerIndex = this.playerIndexFor(ws);
    return playerIndex === null || this.isAuthoritative(ws, playerIndex);
  }
}

function isPlayerSocketAttachment(
  value: unknown
): value is PlayerSocketAttachment {
  if (value === null || typeof value !== "object") return false;
  return (
    "type" in value &&
    value.type === "game-session-player-socket" &&
    "playerIndex" in value &&
    (value.playerIndex === 0 || value.playerIndex === 1) &&
    "connectionId" in value &&
    typeof value.connectionId === "string" &&
    "acceptedAt" in value &&
    typeof value.acceptedAt === "number"
  );
}

function getPlayerSocketAttachment(
  ws: WebSocket
): PlayerSocketAttachment | null {
  try {
    const attachment = ws.deserializeAttachment();
    return isPlayerSocketAttachment(attachment) ? attachment : null;
  } catch {
    return null;
  }
}

function lifeCardForPrompt(card: LifeCard, playerIndex: 0 | 1): CardInstance {
  return {
    instanceId: card.instanceId,
    cardId: card.cardId,
    zone: "LIFE",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: null,
    controller: playerIndex,
    owner: playerIndex,
  };
}
