/**
 * POST /api/lobbies/join — Join a lobby by code and enter the lobby room.
 *
 * Body: { code: string, deckId?: string }
 *
 * Creates a LobbyGuest record, marks the lobby READY, and returns { lobbyId }.
 */

import { after, NextRequest } from "next/server";
import { requireAuth, apiSuccess, apiError } from "@/lib/api-response";
import { JoinLobbySchema } from "@/lib/validators/lobbies";
import { parseBody, isErrorResponse } from "@/lib/validators/helpers";
import { apiLimiter } from "@/lib/rate-limit";
import {
  joinLobbyByCode,
  lobbyJoinFailureMessage,
  publishLobbyJoin,
} from "@/lib/lobbies/join";

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof Response) return authResult;
  const { userId } = authResult;

  const { limited } = await apiLimiter.check(`lobby-join:${userId}`);
  if (limited) {
    return apiError("Too many requests. Try again later.", 429);
  }

  try {
    const parsed = await parseBody(request, JoinLobbySchema);
    if (isErrorResponse(parsed)) return parsed;
    const result = await joinLobbyByCode({ userId, ...parsed });

    if (result.kind !== "joined") {
      const status =
        result.kind === "invalid_code"
          ? 400
          : result.kind === "not_found"
            ? 404
            : 409;
      return apiError(lobbyJoinFailureMessage(result.kind), status, {
        ...(result.kind === "active_game_exists"
          ? { code: "ACTIVE_GAME_EXISTS" }
          : result.kind === "active_lobby_exists"
            ? { code: "ACTIVE_LOBBY_EXISTS" }
            : {}),
      });
    }

    after(async () => {
      await publishLobbyJoin(result, userId);
    });

    return apiSuccess({ lobbyId: result.lobbyId });
  } catch (error) {
    console.error("[lobbies:join] failed", error);
    return apiError("Failed to join lobby", 500);
  }
}
