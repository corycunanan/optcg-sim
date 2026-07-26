import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { buildLobbyRoomState } from "./build-state";
import {
  cancelPendingLobbyInvitesInTransaction,
  publishCanceledLobbyInvites,
  type CanceledLobbyInvite,
} from "./cancel-invites";
import {
  ActiveLobbyConflictError,
  claimActiveLobby,
  releaseActiveLobby,
} from "./active-membership";
import { findActiveGameLobby } from "./active-game";
import { lockLobbyMembership } from "./membership-lock";
import {
  isRetryableTransactionConflict,
  retryTransactionOnce,
} from "./transaction-conflict";
import { isLobbySpectatorCollision } from "./unique-constraints";
import {
  notifyLobby,
  notifySpectatorsRemoved,
} from "@/lib/realtime/fanout-lobby";
import { notifyUser } from "@/lib/realtime/fan-out";

export const MAX_LOBBY_SPECTATORS = 20;

export type SpectatorJoinFailureKind =
  | "not_found"
  | "closed"
  | "spectating_disabled"
  | "full"
  | "seated"
  | "active_game_exists"
  | "active_lobby_exists"
  | "concurrent_state_conflict";

interface DisbandedGuest {
  userId: string;
  lobbyId: string;
  hostName: string;
}

export type SpectatorJoinResult =
  | {
      kind: "joined";
      lobbyId: string;
      membership: "created" | "existing";
      previousLobbyId: string | null;
      previousLobbyClosed: boolean;
      removedSpectatorUserIds: string[];
      disbandedGuest: DisbandedGuest | null;
      canceledInvites: CanceledLobbyInvite[];
    }
  | {
      kind: "confirmation_required";
      currentLobbyId: string;
      targetLobbyId: string;
      guestName: string | null;
      hasPendingInvite: boolean;
    }
  | { kind: SpectatorJoinFailureKind };

interface JoinSpectatorInput {
  userId: string;
  lobbyId: string;
  confirmDisbandLobbyId?: string;
}

const currentMembershipSelect = (userId: string) =>
  ({
    activeLobbyId: true,
    activeLobby: {
      select: {
        id: true,
        status: true,
        revision: true,
        hostUserId: true,
        host: { select: { username: true, name: true } },
        guest: {
          select: {
            userId: true,
            user: { select: { username: true, name: true } },
          },
        },
        spectators: {
          where: { userId },
          select: { userId: true },
        },
        invites: {
          where: { status: "PENDING" as const },
          select: { id: true },
        },
      },
    },
  }) satisfies Prisma.UserSelect;

class CurrentLobbyChangedError extends Error {}

function loadCurrentMembership(tx: Prisma.TransactionClient, userId: string) {
  return tx.user.findUnique({
    where: { id: userId },
    select: currentMembershipSelect(userId),
  });
}

export async function joinLobbyAsSpectator({
  userId,
  lobbyId,
  confirmDisbandLobbyId,
}: JoinSpectatorInput): Promise<SpectatorJoinResult> {
  const activeGame = await findActiveGameLobby(userId);
  if (activeGame) return { kind: "active_game_exists" };

  try {
    return await retryTransactionOnce(prisma, async (tx) => {
      if (!(await lockLobbyMembership(tx, lobbyId))) {
        return { kind: "not_found" as const };
      }

      const target = await tx.lobby.findUnique({
        where: { id: lobbyId },
        select: {
          id: true,
          status: true,
          allowSpectators: true,
          hostUserId: true,
          guest: { select: { userId: true } },
          spectators: {
            where: { userId },
            select: { userId: true },
          },
        },
      });

      if (!target) return { kind: "not_found" as const };
      if (target.status === "CLOSED") return { kind: "closed" as const };
      if (!target.allowSpectators) {
        return { kind: "spectating_disabled" as const };
      }
      if (target.hostUserId === userId || target.guest?.userId === userId) {
        return { kind: "seated" as const };
      }
      if (target.spectators.length > 0) {
        return existingMembership(lobbyId);
      }
      const spectatorCount = await tx.lobbySpectator.count({
        where: { lobbyId },
      });
      if (spectatorCount >= MAX_LOBBY_SPECTATORS) {
        return { kind: "full" as const };
      }

      let current = await loadCurrentMembership(tx, userId);
      let currentLobby = current?.activeLobby;
      const isCurrentMember = Boolean(
        current?.activeLobbyId &&
        currentLobby &&
        currentLobby.status !== "CLOSED" &&
        (currentLobby.hostUserId === userId ||
          currentLobby.guest?.userId === userId ||
          currentLobby.spectators.length > 0)
      );

      if (isCurrentMember && currentLobby && currentLobby.id !== lobbyId) {
        if (!(await lockLobbyMembership(tx, currentLobby.id))) {
          throw new CurrentLobbyChangedError();
        }
        current = await loadCurrentMembership(tx, userId);
        if (
          current?.activeLobbyId !== currentLobby.id ||
          !current.activeLobby ||
          current.activeLobby.status === "CLOSED"
        ) {
          throw new CurrentLobbyChangedError();
        }
        currentLobby = current.activeLobby;
      }

      const isHosting =
        Boolean(isCurrentMember && currentLobby) &&
        currentLobby?.hostUserId === userId;
      const isSpectating =
        Boolean(isCurrentMember && currentLobby) &&
        Boolean(currentLobby?.spectators.length);
      const hostedGuest =
        isHosting && currentLobby?.guest?.userId !== userId
          ? currentLobby?.guest
          : null;
      const hasPendingInvite = Boolean(
        isHosting && currentLobby && currentLobby.invites.length > 0
      );
      const confirmationTargetsCurrentLobby = Boolean(
        isHosting && currentLobby && confirmDisbandLobbyId === currentLobby.id
      );
      const confirmationTargetsAnotherLobby = Boolean(
        isHosting &&
        currentLobby &&
        confirmDisbandLobbyId &&
        confirmDisbandLobbyId !== currentLobby.id
      );

      if (
        currentLobby &&
        (confirmationTargetsAnotherLobby ||
          ((hostedGuest || hasPendingInvite) &&
            !confirmationTargetsCurrentLobby))
      ) {
        return {
          kind: "confirmation_required" as const,
          currentLobbyId: currentLobby.id,
          targetLobbyId: lobbyId,
          guestName: hostedGuest
            ? displayName(hostedGuest.user, "Your guest")
            : null,
          hasPendingInvite,
        };
      }

      let previousLobbyId: string | null = null;
      let previousLobbyClosed = false;
      let removedSpectatorUserIds: string[] = [];
      let disbandedGuest: DisbandedGuest | null = null;
      let canceledInvites: CanceledLobbyInvite[] = [];

      if (isCurrentMember && currentLobby) {
        previousLobbyId = currentLobby.id;
        if (isHosting) {
          const spectators = await tx.lobbySpectator.findMany({
            where: { lobbyId: currentLobby.id },
            select: { userId: true },
          });
          removedSpectatorUserIds = spectators.map(({ userId }) => userId);

          const closed = await tx.lobby.updateMany({
            where: {
              id: currentLobby.id,
              hostUserId: userId,
              revision: currentLobby.revision,
              status: { in: ["WAITING", "READY"] },
              ...(!confirmationTargetsCurrentLobby
                ? {
                    guest: { is: null },
                    invites: { none: { status: "PENDING" } },
                  }
                : {}),
            },
            data: { status: "CLOSED", revision: { increment: 1 } },
          });
          if (closed.count !== 1) throw new CurrentLobbyChangedError();

          previousLobbyClosed = true;
          if (hostedGuest) {
            disbandedGuest = {
              userId: hostedGuest.userId,
              lobbyId: currentLobby.id,
              hostName: displayName(currentLobby.host, "The host"),
            };
          }
          await tx.lobbyGuest.deleteMany({
            where: { lobbyId: currentLobby.id },
          });
          await tx.user.updateMany({
            where: { activeLobbyId: currentLobby.id },
            data: { activeLobbyId: null },
          });
          canceledInvites = await cancelPendingLobbyInvitesInTransaction(
            tx,
            currentLobby.id
          );
        } else if (isSpectating) {
          const released = await tx.lobby.updateMany({
            where: {
              id: currentLobby.id,
              revision: currentLobby.revision,
              status: { not: "CLOSED" },
              spectators: { some: { userId } },
            },
            data: { revision: { increment: 1 } },
          });
          if (released.count !== 1) throw new CurrentLobbyChangedError();
          const removed = await tx.lobbySpectator.deleteMany({
            where: { lobbyId: currentLobby.id, userId },
          });
          if (removed.count !== 1) throw new CurrentLobbyChangedError();
          await releaseActiveLobby(tx, userId, currentLobby.id);
        } else {
          const released = await tx.lobby.updateMany({
            where: {
              id: currentLobby.id,
              status: "READY",
              mode: "PVP",
              guest: { is: { userId } },
            },
            data: {
              status: "WAITING",
              hostReady: false,
              revision: { increment: 1 },
            },
          });
          if (released.count !== 1) throw new CurrentLobbyChangedError();
          const removed = await tx.lobbyGuest.deleteMany({
            where: { lobbyId: currentLobby.id, userId },
          });
          if (removed.count !== 1) throw new CurrentLobbyChangedError();
          await releaseActiveLobby(tx, userId, currentLobby.id);
        }
      } else if (current?.activeLobbyId) {
        await releaseActiveLobby(tx, userId, current.activeLobbyId);
      }

      await claimActiveLobby(tx, userId, lobbyId);
      try {
        await tx.lobbySpectator.create({ data: { lobbyId, userId } });
      } catch (error) {
        if (isLobbySpectatorCollision(error)) {
          throw new CurrentLobbyChangedError();
        }
        throw error;
      }
      await tx.lobby.update({
        where: { id: lobbyId },
        data: { revision: { increment: 1 } },
      });

      return {
        kind: "joined" as const,
        lobbyId,
        membership: "created" as const,
        previousLobbyId,
        previousLobbyClosed,
        removedSpectatorUserIds,
        disbandedGuest,
        canceledInvites,
      };
    });
  } catch (error) {
    if (
      error instanceof ActiveLobbyConflictError ||
      error instanceof CurrentLobbyChangedError
    ) {
      return { kind: "active_lobby_exists" };
    }
    if (isRetryableTransactionConflict(error)) {
      return { kind: "concurrent_state_conflict" };
    }
    throw error;
  }
}

function existingMembership(lobbyId: string): SpectatorJoinResult {
  return {
    kind: "joined",
    lobbyId,
    membership: "existing",
    previousLobbyId: null,
    previousLobbyClosed: false,
    removedSpectatorUserIds: [],
    disbandedGuest: null,
    canceledInvites: [],
  };
}

export async function publishSpectatorJoin(
  result: Extract<SpectatorJoinResult, { kind: "joined" }>,
  actorUserId: string
) {
  if (result.membership === "existing") return;

  const effects: Promise<unknown>[] = [
    publishCanceledLobbyInvites(result.canceledInvites),
    buildLobbyRoomState(result.lobbyId)
      .then((state) =>
        state ? notifyLobby(state, { actorUserId }) : Promise.resolve()
      )
      .catch((error) => {
        console.error("[lobbies:spectators:join] target fanout failed", error);
      }),
  ];

  if (result.previousLobbyId && !result.previousLobbyClosed) {
    effects.push(
      buildLobbyRoomState(result.previousLobbyId)
        .then((state) =>
          state ? notifyLobby(state, { actorUserId }) : Promise.resolve()
        )
        .catch((error) => {
          console.error(
            "[lobbies:spectators:join] previous fanout failed",
            error
          );
        })
    );
  }

  if (result.removedSpectatorUserIds.length > 0 && result.previousLobbyId) {
    effects.push(
      notifySpectatorsRemoved({
        lobbyId: result.previousLobbyId,
        reason: "LOBBY_CLOSED",
        removedSpectatorUserIds: result.removedSpectatorUserIds,
      })
    );
  }

  if (result.disbandedGuest) {
    effects.push(
      notifyUser(result.disbandedGuest.userId, {
        type: "lobby:party_disbanded",
        lobbyId: result.disbandedGuest.lobbyId,
        hostName: result.disbandedGuest.hostName,
      })
    );
  }

  await Promise.allSettled(effects);
}

export function spectatorJoinFailureMessage(kind: SpectatorJoinFailureKind) {
  switch (kind) {
    case "not_found":
      return "Party not found";
    case "closed":
      return "This party has been closed";
    case "spectating_disabled":
      return "Spectating is disabled for this party";
    case "full":
      return "This party is full";
    case "seated":
      return "Seated players cannot spectate their own party";
    case "active_game_exists":
      return "Finish or leave your current game first";
    case "active_lobby_exists":
      return "Your current party changed. Please try again";
    case "concurrent_state_conflict":
      return "Party state changed concurrently. Try again.";
  }
}

function displayName(
  user: { username: string | null; name: string | null },
  fallback: string
) {
  return user.username ?? user.name ?? fallback;
}
