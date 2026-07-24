import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { normalizeLobbyCode } from "@/lib/lobbies";
import { buildLobbyRoomState } from "./build-state";
import { cancelPendingLobbyInvites } from "./cancel-invites";
import {
  ActiveLobbyConflictError,
  claimActiveLobby,
  releaseActiveLobby,
} from "./active-membership";
import { notifyLobby } from "@/lib/realtime/fanout-lobby";

export type LobbyJoinFailureKind =
  | "invalid_code"
  | "not_found"
  | "self"
  | "occupied"
  | "solitaire"
  | "computer"
  | "active_lobby_exists";

export type LobbyJoinResult =
  | {
      kind: "joined";
      lobbyId: string;
      replacedLobbyId: string | null;
    }
  | { kind: LobbyJoinFailureKind };

interface JoinLobbyByCodeInput {
  userId: string;
  code: string;
  deckId?: string;
}

export async function joinLobbyByCode({
  userId,
  code,
  deckId,
}: JoinLobbyByCodeInput): Promise<LobbyJoinResult> {
  const normalizedCode = normalizeLobbyCode(code);
  if (normalizedCode.length < 4) return { kind: "invalid_code" };

  try {
    return await prisma.$transaction(async (tx) => {
      const lobby = await tx.lobby.findFirst({
        where: { joinCode: normalizedCode },
        include: { guest: true },
      });

      if (!lobby || lobby.status !== "WAITING") {
        return { kind: "not_found" as const };
      }
      if (lobby.hostUserId === userId) return { kind: "self" as const };
      if (lobby.guest) return { kind: "occupied" as const };
      if (lobby.mode === "SOLITAIRE") return { kind: "solitaire" as const };
      if (lobby.mode === "PVCOMPUTER") return { kind: "computer" as const };

      // READY is acquired conditionally in the same transaction as the seat.
      // If close commits after the read, no guest row can resurrect the room.
      const acquired = await tx.lobby.updateMany({
        where: {
          id: lobby.id,
          status: "WAITING",
          mode: "PVP",
          guest: { is: null },
        },
        data: { status: "READY", revision: { increment: 1 } },
      });
      if (acquired.count !== 1) return { kind: "not_found" as const };

      const replacedLobbyId = await claimLobbyForJoin(tx, userId, lobby.id);

      await tx.lobbyGuest.create({
        data: { lobbyId: lobby.id, userId, deckId },
      });
      return {
        kind: "joined" as const,
        lobbyId: lobby.id,
        replacedLobbyId,
      };
    });
  } catch (error) {
    if (error instanceof ActiveLobbyConflictError) {
      return { kind: "active_lobby_exists" };
    }
    throw error;
  }
}

/**
 * Publish the two post-commit effects shared by API and resolver joins.
 * Failures are logged but cannot undo a successfully committed membership.
 */
export async function publishLobbyJoin(
  result: Extract<LobbyJoinResult, { kind: "joined" }>,
  actorUserId: string
) {
  const cancelReplacedLobby = result.replacedLobbyId
    ? cancelPendingLobbyInvites(result.replacedLobbyId).catch((error) => {
        console.error("[lobbies:join] invite cancellation failed", error);
      })
    : Promise.resolve();

  const notifyTargetLobby = buildLobbyRoomState(result.lobbyId)
    .then((state) =>
      state ? notifyLobby(state, { actorUserId }) : Promise.resolve()
    )
    .catch((error) => {
      console.error("[lobbies:join] state fanout failed", error);
    });

  await Promise.all([cancelReplacedLobby, notifyTargetLobby]);
}

export function lobbyJoinFailureMessage(kind: LobbyJoinFailureKind) {
  switch (kind) {
    case "invalid_code":
      return "Invalid lobby code";
    case "not_found":
      return "Lobby not found or already started";
    case "self":
      return "You cannot join your own lobby";
    case "occupied":
      return "Lobby already has a guest";
    case "solitaire":
      return "This lobby is in solo mode and cannot be joined";
    case "computer":
      return "This lobby is in computer mode and cannot be joined";
    case "active_lobby_exists":
      return "An active lobby already exists";
  }
}

async function claimLobbyForJoin(
  tx: Prisma.TransactionClient,
  userId: string,
  targetLobbyId: string
) {
  try {
    await claimActiveLobby(tx, userId, targetLobbyId);
    return null;
  } catch (error) {
    if (!(error instanceof ActiveLobbyConflictError)) throw error;
  }

  const current = await tx.user.findUnique({
    where: { id: userId },
    select: {
      activeLobbyId: true,
      activeLobby: {
        select: {
          id: true,
          status: true,
          hostUserId: true,
          guest: { select: { userId: true } },
        },
      },
    },
  });
  const personalLobby = current?.activeLobby;
  const canReplacePersonalLobby = Boolean(
    current?.activeLobbyId &&
    personalLobby &&
    personalLobby.hostUserId === userId &&
    personalLobby.guest === null &&
    (personalLobby.status === "WAITING" || personalLobby.status === "READY")
  );

  if (!canReplacePersonalLobby || !current?.activeLobbyId) {
    throw new ActiveLobbyConflictError();
  }

  const closed = await tx.lobby.updateMany({
    where: {
      id: current.activeLobbyId,
      hostUserId: userId,
      status: { in: ["WAITING", "READY"] },
      guest: { is: null },
    },
    data: { status: "CLOSED", revision: { increment: 1 } },
  });
  if (closed.count !== 1) throw new ActiveLobbyConflictError();

  await releaseActiveLobby(tx, userId, current.activeLobbyId);
  await claimActiveLobby(tx, userId, targetLobbyId);
  return current.activeLobbyId;
}
