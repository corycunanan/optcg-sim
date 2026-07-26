/**
 * GET    /api/lobbies/[id] — Poll lobby status (host uses this to discover game start)
 * PATCH  /api/lobbies/[id] — Mutate in-room settings, decks, and ready state
 * DELETE /api/lobbies/[id] — Close a pre-game PVP lobby (host only)
 */

import { after, NextRequest } from "next/server";
import {
  requireAuth,
  apiSuccess,
  apiAction,
  apiError,
} from "@/lib/api-response";
import { prisma } from "@/lib/db";
import { PatchLobbySchema } from "@/lib/validators/lobbies";
import { parseBody, isErrorResponse } from "@/lib/validators/helpers";
import { apiLimiter } from "@/lib/rate-limit";
import { buildLobbyRoomState } from "@/lib/lobbies/build-state";
import { cancelPendingLobbyInvites } from "@/lib/lobbies/cancel-invites";
import { viewerIsEvicted } from "@/lib/lobbies/state";
import { notifyUser } from "@/lib/realtime/fan-out";
import {
  notifyLobby,
  notifySpectatorsRemoved,
} from "@/lib/realtime/fanout-lobby";
import { resolvePregameMode, type PregameMode } from "@shared/game-init";
import { releaseActiveLobby } from "@/lib/lobbies/active-membership";
import { lockLobbyMembership } from "@/lib/lobbies/membership-lock";

type RouteContext = { params: Promise<{ id: string }> };

type PatchLobbyData = {
  mode?: "PVP" | "SOLITAIRE" | "PVCOMPUTER";
  pregameMode?: PregameMode;
  format?: string;
  hostDeckId?: string | null;
  allowSpectators?: boolean;
  hostReady?: boolean;
  status?: "WAITING" | "READY";
};

type CloseFailure = "NOT_FOUND" | "FORBIDDEN" | "ALREADY_STARTED" | "NOT_PVP";

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuth();
  if (authResult instanceof Response) return authResult;

  const { id } = await params;

  const state = await buildLobbyRoomState(id, authResult.userId);
  if (!state) {
    return apiError("Lobby not found", 404);
  }

  return apiSuccess(
    viewerIsEvicted(state, authResult.userId)
      ? { ...state, status: "EVICTED" as const }
      : state,
    200,
    { "Cache-Control": "no-store" },
  );
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuth();
  if (authResult instanceof Response) return authResult;
  const { userId } = authResult;

  const { limited } = await apiLimiter.check(`lobby-update:${userId}`);
  if (limited) {
    return apiError("Too many requests. Try again later.", 429);
  }

  const { id } = await params;
  const parsed = await parseBody(request, PatchLobbySchema);
  if (isErrorResponse(parsed)) return parsed;

  const force = request.nextUrl.searchParams.get("force") === "true";
  const lobby = await prisma.lobby.findUnique({
    where: { id },
    include: {
      guest: {
        include: {
          user: { select: { id: true, username: true, name: true } },
        },
      },
      spectators: {
        where: { userId },
        select: { userId: true },
      },
    },
  });

  if (!lobby || (lobby.status !== "WAITING" && lobby.status !== "READY")) {
    return apiError("Lobby not found or already started", 404);
  }

  const isHost = lobby.hostUserId === userId;
  const isGuest = lobby.guest?.userId === userId && !isHost;
  const isSpectator = lobby.spectators.length > 0;
  if (!isHost && !isGuest) {
    return isSpectator
      ? apiError("Forbidden", 403)
      : apiError("Lobby not found", 404);
  }

  const hasReadinessAffectingHostChange =
    parsed.mode !== undefined ||
    parsed.pregameMode !== undefined ||
    parsed.format !== undefined ||
    parsed.hostDeckId !== undefined;
  const hasHostControlledChange =
    hasReadinessAffectingHostChange || parsed.allowSpectators !== undefined;
  if (hasHostControlledChange && !isHost) {
    return apiError("Forbidden", 403);
  }

  const spectatorSettingChanged =
    parsed.allowSpectators !== undefined &&
    parsed.allowSpectators !== lobby.allowSpectators;
  const hasNonSpectatorPatchField = Object.keys(parsed).some(
    (field) => field !== "allowSpectators",
  );
  if (
    parsed.allowSpectators !== undefined &&
    !spectatorSettingChanged &&
    !hasNonSpectatorPatchField
  ) {
    return apiAction();
  }

  const targetMode = parsed.mode ?? lobby.mode;
  if (targetMode === "PVCOMPUTER") {
    return apiError("PVComputer mode is not yet implemented", 501);
  }
  const requestedPregameMode = parsed.pregameMode ?? lobby.pregameMode;
  const targetPregameMode = resolvePregameMode(
    targetMode,
    requestedPregameMode,
    parsed.pregameMode !== undefined,
  );
  if (targetPregameMode === null) {
    return apiError(
      `pregameMode ${requestedPregameMode} is not valid for ${targetMode} lobbies`,
      400,
      { code: "INVALID_PREGAME_MODE" },
    );
  }
  if (parsed.guestDeckId !== undefined) {
    if (targetMode === "SOLITAIRE" && !isHost) {
      return apiError(
        "guestDeckId can only be changed by the host in Solitaire mode",
        403,
      );
    }
    if (targetMode === "PVP" && !isGuest) {
      return apiError(
        "guestDeckId can only be changed by the guest in PVP mode",
        403,
      );
    }
  }

  const guestReadyActorIsValid =
    (targetMode === "PVP" && isGuest) || (targetMode === "SOLITAIRE" && isHost);

  if (parsed.ready === true) {
    if (isHost) {
      if (hasHostControlledChange) {
        return apiError(
          "Ready cannot be set while changing host-controlled settings",
          400,
        );
      }
      if (!lobby.hostDeckId) {
        return apiError("Select a deck before readying", 422, {
          code: "DECK_REQUIRED",
        });
      }
    } else if (isGuest) {
      if (parsed.guestDeckId !== undefined) {
        return apiError("Ready cannot be set while changing decks", 400);
      }
      if (!lobby.guest?.deckId) {
        return apiError("Select a deck before readying", 422, {
          code: "DECK_REQUIRED",
        });
      }
    }
  }

  if (parsed.ready !== undefined && !isHost && !guestReadyActorIsValid) {
    return apiError("Ready cannot be changed in this lobby mode", 400);
  }

  if (parsed.hostDeckId) {
    const deck = await prisma.deck.findFirst({
      where: { id: parsed.hostDeckId, userId },
    });
    if (!deck) return apiError("Deck not found", 404);
  }

  if (parsed.guestDeckId) {
    const deck = await prisma.deck.findFirst({
      where: { id: parsed.guestDeckId, userId },
    });
    if (!deck) return apiError("Deck not found", 404);
  }

  const switchingToSolitaire =
    lobby.mode === "PVP" && targetMode === "SOLITAIRE";
  const realGuest =
    lobby.guest && lobby.guest.userId !== lobby.hostUserId ? lobby.guest : null;
  if (switchingToSolitaire && realGuest && !force) {
    return apiError("Guest is present", 409, {
      code: "GUEST_PRESENT",
      details: {
        guestUserId: realGuest.userId,
        guestUserName: realGuest.user.username ?? realGuest.user.name,
      },
    });
  }

  const lobbyData: PatchLobbyData = {};
  if (parsed.mode !== undefined) lobbyData.mode = parsed.mode;
  if (
    parsed.pregameMode !== undefined ||
    targetPregameMode !== lobby.pregameMode
  ) {
    lobbyData.pregameMode = targetPregameMode;
  }
  if (parsed.format !== undefined) lobbyData.format = parsed.format;
  if (parsed.hostDeckId !== undefined) lobbyData.hostDeckId = parsed.hostDeckId;
  if (spectatorSettingChanged) {
    lobbyData.allowSpectators = parsed.allowSpectators;
  }
  if (hasReadinessAffectingHostChange) lobbyData.hostReady = false;
  if (
    isHost &&
    parsed.ready !== undefined &&
    !hasReadinessAffectingHostChange
  ) {
    lobbyData.hostReady = parsed.ready;
  }

  if (switchingToSolitaire) {
    lobbyData.status = "READY";
  } else if (lobby.mode === "SOLITAIRE" && targetMode === "PVP") {
    lobbyData.status = "WAITING";
    lobbyData.hostReady = false;
  }

  const result = await prisma.$transaction(async (tx) => {
    // Lock the exact active snapshot that authorized this PATCH. If close
    // has already committed CLOSED (or another mutation changed lifecycle
    // state), no guest-seat write below is allowed to run.
    const guarded = await tx.lobby.updateMany({
      where: {
        id,
        status: lobby.status,
        mode: lobby.mode,
        ...((switchingToSolitaire && realGuest) || spectatorSettingChanged
          ? { revision: lobby.revision }
          : {}),
      },
      data: {
        ...(Object.keys(lobbyData).length > 0
          ? lobbyData
          : { status: lobby.status }),
        revision: { increment: 1 },
      },
    });

    if (guarded.count !== 1) {
      const current = await tx.lobby.findUnique({
        where: { id },
        select: { status: true },
      });
      return {
        failure:
          !current || current.status === "CLOSED"
            ? ("NOT_FOUND" as const)
            : ("CONFLICT" as const),
        removedSpectatorUserIds: [] as string[],
      };
    }

    let removedSpectatorUserIds: string[] = [];
    if (spectatorSettingChanged && parsed.allowSpectators === false) {
      // Capture the terminal-event audience before deleting it. Removed
      // spectators cannot be recovered from the post-mutation room state.
      const spectators = await tx.lobbySpectator.findMany({
        where: { lobbyId: id },
        select: { userId: true },
      });
      removedSpectatorUserIds = spectators.map(({ userId }) => userId);
      await tx.lobbySpectator.deleteMany({ where: { lobbyId: id } });
      await Promise.all(
        removedSpectatorUserIds.map((spectatorUserId) =>
          releaseActiveLobby(tx, spectatorUserId, id),
        ),
      );
    }

    if (switchingToSolitaire) {
      await tx.lobbyGuest.deleteMany({ where: { lobbyId: id } });
      if (realGuest) {
        await releaseActiveLobby(tx, realGuest.userId, id);
      }
      await tx.lobbyGuest.upsert({
        where: { lobbyId: id },
        create: {
          lobbyId: id,
          userId: lobby.hostUserId,
          deckId: parsed.guestDeckId ?? null,
          guestReady: false,
        },
        update: {
          userId: lobby.hostUserId,
          deckId: parsed.guestDeckId ?? null,
          guestReady: false,
        },
      });
    } else if (lobby.mode === "SOLITAIRE" && targetMode === "PVP") {
      await tx.lobbyGuest.deleteMany({
        where: { lobbyId: id, userId: lobby.hostUserId },
      });
    } else if (targetMode === "SOLITAIRE" && isHost && !lobby.guest) {
      await tx.lobbyGuest.upsert({
        where: { lobbyId: id },
        create: {
          lobbyId: id,
          userId: lobby.hostUserId,
          deckId: parsed.guestDeckId ?? null,
          guestReady: false,
        },
        update: {
          userId: lobby.hostUserId,
          deckId: parsed.guestDeckId ?? null,
          guestReady: false,
        },
      });
    } else if (parsed.guestDeckId !== undefined) {
      await tx.lobbyGuest.update({
        where: { lobbyId: id },
        data: { deckId: parsed.guestDeckId, guestReady: false },
      });
    } else if (parsed.ready !== undefined && !isHost) {
      await tx.lobbyGuest.update({
        where: { lobbyId: id },
        data: { guestReady: parsed.ready },
      });
    }

    return { failure: null, removedSpectatorUserIds };
  });

  if (result.failure === "NOT_FOUND") {
    return apiError("Lobby not found or already closed", 404);
  }
  if (result.failure === "CONFLICT") {
    return apiError("Lobby state changed before the update completed", 409, {
      code: "LOBBY_STATE_CHANGED",
    });
  }

  // Capture the ejected guest (if any) so the post-transaction fanout can
  // tell them their lobby is gone — switchingToSolitaire wipes them off the
  // freshly-built state.
  const ejectedGuestUserId =
    switchingToSolitaire && realGuest ? realGuest.userId : null;

  after(async () => {
    const spectatorEjectionFanout = result.removedSpectatorUserIds.length
      ? notifySpectatorsRemoved({
          lobbyId: id,
          reason: "SPECTATING_DISABLED",
          removedSpectatorUserIds: result.removedSpectatorUserIds,
        })
      : Promise.resolve();
    const stateFanout = buildLobbyRoomState(id).then(async (state) => {
      if (!state) return;

      await notifyLobby(state, { actorUserId: userId });
      if (ejectedGuestUserId) {
        await notifyUser(ejectedGuestUserId, {
          type: "lobby:state_changed",
          lobby: { ...state, status: "EVICTED" },
        });
      }
    });

    await Promise.allSettled([spectatorEjectionFanout, stateFanout]);
  });

  return apiAction();
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuth();
  if (authResult instanceof Response) return authResult;
  const { userId } = authResult;

  const { limited } = await apiLimiter.check(`lobby-delete:${userId}`);
  if (limited) {
    return apiError("Too many requests. Try again later.", 429);
  }

  const { id } = await params;

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Serialize close against spectator joins before capturing their IDs.
      // The lock is shared with all writes to this lobby row, including start.
      if (!(await lockLobbyMembership(tx, id))) {
        return {
          failure: "NOT_FOUND" as const,
          removedSpectatorUserIds: [] as string[],
        };
      }

      const lobby = await tx.lobby.findUnique({
        where: { id },
        select: {
          hostUserId: true,
          mode: true,
          status: true,
          spectators: { select: { userId: true } },
        },
      });

      if (!lobby) {
        return {
          failure: "NOT_FOUND" as const,
          removedSpectatorUserIds: [] as string[],
        };
      }

      let failure: CloseFailure | null = null;
      if (lobby.status === "CLOSED") failure = "NOT_FOUND";
      else if (lobby.hostUserId !== userId) failure = "FORBIDDEN";
      else if (lobby.status === "IN_GAME") failure = "ALREADY_STARTED";
      else if (lobby.mode !== "PVP") failure = "NOT_PVP";

      if (failure) {
        return { failure, removedSpectatorUserIds: [] as string[] };
      }

      // Capture the directed terminal-event audience before CLOSED clears
      // active membership. The post-mutation room audience is not authoritative.
      const removedSpectatorUserIds = lobby.spectators.map(
        ({ userId }) => userId,
      );
      const closed = await tx.lobby.updateMany({
        where: {
          id,
          hostUserId: userId,
          mode: "PVP",
          status: { in: ["WAITING", "READY"] },
        },
        data: { status: "CLOSED", revision: { increment: 1 } },
      });

      if (closed.count === 1) {
        await tx.user.updateMany({
          where: { activeLobbyId: id },
          data: { activeLobbyId: null },
        });
        return { failure: null, removedSpectatorUserIds };
      }
      return {
        failure: "NOT_FOUND" as const,
        removedSpectatorUserIds: [] as string[],
      };
    });

    if (result.failure) return closeFailureResponse(result.failure);

    after(async () => {
      // The CLOSED status blocks join and invite acceptance synchronously.
      // Cancel the now-moot invite rows and dismiss visible invite toasts.
      const cancelInvites = cancelPendingLobbyInvites(id).catch((error) => {
        // Invite fan-out is best-effort and must not suppress the seated
        // guest's terminal CLOSED event.
        console.error("[lobbies:close] invite cancellation failed", error);
      });
      const spectatorEjectionFanout = result.removedSpectatorUserIds.length
        ? notifySpectatorsRemoved({
            lobbyId: id,
            reason: "LOBBY_CLOSED",
            removedSpectatorUserIds: result.removedSpectatorUserIds,
          })
        : Promise.resolve();
      const guestTerminalFanout = buildLobbyRoomState(id).then((state) => {
        if (!state) return;

        const guestUserId =
          state.guest && state.guest.user.id !== state.hostUserId
            ? state.guest.user.id
            : null;
        return guestUserId
          ? notifyUser(guestUserId, {
              type: "lobby:state_changed",
              lobby: { ...state, status: "CLOSED" },
            })
          : undefined;
      });

      await Promise.allSettled([
        cancelInvites,
        spectatorEjectionFanout,
        guestTerminalFanout,
      ]);
    });

    return apiAction();
  } catch (error) {
    console.error("[lobbies:close] failed", error);
    return apiError("Failed to close lobby", 500);
  }
}

function closeFailureResponse(failure: CloseFailure) {
  switch (failure) {
    case "NOT_FOUND":
      return apiError("Lobby not found", 404);
    case "FORBIDDEN":
      return apiError("Forbidden", 403);
    case "ALREADY_STARTED":
      return apiError("Lobby already started", 409, {
        code: "ALREADY_STARTED",
      });
    case "NOT_PVP":
      return apiError("Only a pre-game PVP lobby can be closed", 409);
  }
}
