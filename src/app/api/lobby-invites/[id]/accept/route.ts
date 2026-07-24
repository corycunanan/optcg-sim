/**
 * POST /api/lobby-invites/[id]/accept — accept through the same transactional
 * party-switch machinery as join-by-code.
 */

import { after, NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, apiSuccess, apiError } from "@/lib/api-response";
import { apiLimiter } from "@/lib/rate-limit";
import {
  joinLobbyByInvite,
  lobbyJoinFailureMessage,
  publishLobbyJoin,
} from "@/lib/lobbies/join";

type RouteContext = { params: Promise<{ id: string }> };

const AcceptLobbyInviteSchema = z.object({
  confirmDisbandLobbyId: z.string().min(1).optional(),
});

export async function POST(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuth();
  if (authResult instanceof Response) return authResult;
  const { userId } = authResult;

  const { limited } = await apiLimiter.check(`lobby-invite-accept:${userId}`);
  if (limited) {
    return apiError("Too many requests. Try again later.", 429);
  }

  const parsed = await parseOptionalBody(request);
  if (parsed instanceof Response) return parsed;

  try {
    const { id: inviteId } = await params;
    const result = await joinLobbyByInvite({
      userId,
      inviteId,
      confirmDisbandLobbyId: parsed.confirmDisbandLobbyId,
    });

    if (result.kind === "confirmation_required") {
      return apiError("Switching parties requires confirmation", 409, {
        code: "PARTY_SWITCH_CONFIRMATION_REQUIRED",
        details: {
          currentLobbyId: result.currentLobbyId,
          targetCode: result.targetCode,
          guestName: result.guestName,
          hasPendingInvite: result.hasPendingInvite,
        },
      });
    }

    if (result.kind !== "joined") {
      return inviteJoinFailureResponse(result.kind);
    }

    after(() => publishLobbyJoin(result, userId));
    return apiSuccess({ lobbyId: result.lobbyId });
  } catch (error) {
    console.error("[lobby-invites:accept] failed", error);
    return apiError("Failed to accept invite", 500);
  }
}

async function parseOptionalBody(request: NextRequest) {
  const raw = await request.text();
  if (!raw.trim()) return {} as z.infer<typeof AcceptLobbyInviteSchema>;

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  const parsed = AcceptLobbyInviteSchema.safeParse(value);
  if (!parsed.success) {
    return apiError(
      parsed.error.issues[0]?.message ?? "Invalid request body",
      400
    );
  }
  return parsed.data;
}

function inviteJoinFailureResponse(
  kind: Exclude<
    Awaited<ReturnType<typeof joinLobbyByInvite>>["kind"],
    "joined" | "confirmation_required"
  >
) {
  const message = lobbyJoinFailureMessage(kind);
  switch (kind) {
    case "invite_not_found":
      return apiError("Invite not found", 404);
    case "invite_forbidden":
      return apiError(message, 403);
    case "invite_gone":
      return apiError(message, 410);
    case "self":
    case "occupied":
    case "solitaire":
    case "computer":
    case "closed":
    case "in_game":
    case "target_changed":
    case "active_game_exists":
    case "active_lobby_exists":
      return apiError(message, 409, {
        ...(kind === "active_game_exists"
          ? { code: "ACTIVE_GAME_EXISTS" }
          : {}),
      });
    case "invalid_code":
      return apiError(message, 400);
    case "not_found":
      return apiError(message, 404);
  }
}
