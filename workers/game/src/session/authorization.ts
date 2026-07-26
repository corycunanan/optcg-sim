import type { GameState, LobbyMode } from "../types.js";
import { log } from "../lib/log.js";
import { verifyGameToken } from "../util/auth.js";
import { consumeTokenJti, type TokenJtiStorage } from "../util/token-replay.js";

export interface SessionAuthorizationContext {
  state: GameState | null;
  mode: LobbyMode;
}

export type SessionParticipantIdentity =
  | { role: "player"; playerIndex: 0 | 1 }
  | {
      role: "spectator";
      userId: string;
      displayName: string;
      expiresAt: number;
    };

/**
 * Verifies and consumes single-use game tokens without coupling authorization
 * policy to WebSocket or Durable Object request routing.
 */
export class SessionAuthorizer {
  constructor(
    private readonly storage: TokenJtiStorage,
    private readonly secret: string
  ) {}

  async validate(
    token: string,
    context: SessionAuthorizationContext
  ): Promise<SessionParticipantIdentity | null> {
    const gameState = context.state;
    const payload = await verifyGameToken(token, this.secret, gameState?.id);
    if (!payload) {
      log("auth.failure", { reason: "invalid_token", gameId: gameState?.id });
      return null;
    }
    if (payload.role === "spectator" && payload.playerIndex !== undefined) {
      log("auth.failure", {
        reason: "spectator_player_index_forbidden",
        gameId: gameState?.id,
        userId: payload.sub,
      });
      return null;
    }
    if (!gameState) {
      log("auth.failure", {
        reason:
          payload.role === "spectator"
            ? "spectator_no_game_state"
            : "no_game_state",
      });
      return null;
    }

    const userId = payload.sub;
    if (payload.role === "spectator") {
      const consumed = await consumeTokenJti(
        this.storage,
        payload.jti,
        payload.exp
      );
      if (!consumed) {
        log("auth.failure", {
          reason: "spectator_token_replay",
          gameId: gameState.id,
          userId,
        });
        return null;
      }

      return {
        role: "spectator",
        userId,
        displayName: payload.spectatorName ?? "Spectator",
        expiresAt: payload.exp * 1000,
      };
    }

    const matchesPlayer1 = gameState.players[0].playerId === userId;
    const matchesPlayer2 = gameState.players[1].playerId === userId;
    let playerIndex: 0 | 1 | null = null;

    if (matchesPlayer1 && matchesPlayer2) {
      if (payload.playerIndex !== undefined) {
        if (context.mode !== "SOLITAIRE") {
          log("auth.failure", {
            reason: "player_index_forbidden",
            gameId: gameState.id,
            mode: context.mode,
            userId,
          });
          return null;
        }
        playerIndex = payload.playerIndex;
      } else {
        playerIndex = 0;
      }
    } else if (matchesPlayer1) {
      playerIndex = 0;
    } else if (matchesPlayer2) {
      playerIndex = 1;
    }

    if (playerIndex === null) {
      log("auth.failure", {
        reason: "user_not_in_game",
        gameId: gameState.id,
        userId,
      });
      return null;
    }

    const consumed = await consumeTokenJti(
      this.storage,
      payload.jti,
      payload.exp
    );
    if (!consumed) {
      log("auth.failure", {
        reason: "token_replay",
        gameId: gameState.id,
        userId,
      });
      return null;
    }

    return { role: "player", playerIndex };
  }
}
