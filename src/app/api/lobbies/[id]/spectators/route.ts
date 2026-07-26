/**
 * POST /api/lobbies/[id]/spectators — Join a lobby as a spectator.
 *
 * Body: { confirmDisbandLobbyId?: string }
 */

import { after, NextRequest } from "next/server";
import { requireAuth, apiSuccess, apiError } from "@/lib/api-response";
import { parseBody, isErrorResponse } from "@/lib/validators/helpers";
import { JoinSpectatorSchema } from "@/lib/validators/lobbies";
import { apiLimiter } from "@/lib/rate-limit";
import { buildLobbyRoomState } from "@/lib/lobbies/build-state";
import {
  joinLobbyAsSpectator,
  publishSpectatorJoin,
  spectatorJoinFailureMessage,
} from "@/lib/lobbies/join-spectator";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuth();
  if (authResult instanceof Response) return authResult;
  const { userId } = authResult;

  const { limited } = await apiLimiter.check(`lobby-join:${userId}`);
  if (limited) {
    return apiError("Too many requests. Try again later.", 429);
  }

  const parsed = await parseBody(request, JoinSpectatorSchema);
  if (isErrorResponse(parsed)) return parsed;
  const { id } = await params;

  try {
    const result = await joinLobbyAsSpectator({
      userId,
      lobbyId: id,
      ...parsed,
    });

    if (result.kind === "confirmation_required") {
      return apiError("Switching parties requires confirmation", 409, {
        code: "PARTY_SWITCH_CONFIRMATION_REQUIRED",
        details: {
          currentLobbyId: result.currentLobbyId,
          targetLobbyId: result.targetLobbyId,
          guestName: result.guestName,
          hasPendingInvite: result.hasPendingInvite,
        },
      });
    }

    if (result.kind !== "joined") {
      const status =
        result.kind === "not_found"
          ? 404
          : result.kind === "spectating_disabled"
            ? 403
            : 409;
      return apiError(spectatorJoinFailureMessage(result.kind), status, {
        ...(result.kind === "active_game_exists"
          ? { code: "ACTIVE_GAME_EXISTS" }
          : result.kind === "active_lobby_exists"
            ? { code: "ACTIVE_LOBBY_EXISTS" }
            : {}),
      });
    }

    after(async () => {
      await publishSpectatorJoin(result, userId);
    });

    const state = await buildLobbyRoomState(id, userId);
    if (!state) {
      return apiError("Party state is unavailable", 409, {
        code: "LOBBY_STATE_CHANGED",
      });
    }

    return apiSuccess(state);
  } catch (error) {
    console.error("[lobbies:spectators:join] failed", error);
    return apiError("Failed to join party as a spectator", 500);
  }
}
