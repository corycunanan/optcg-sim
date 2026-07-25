import { Prisma, type LobbyMode, type LobbyStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { normalizeLobbyCode } from "@/lib/lobbies";
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
import {
  isRetryableTransactionConflict,
  retryTransactionOnce,
} from "./transaction-conflict";
import { isLobbyGuestCollision } from "./unique-constraints";
import { notifyLobby } from "@/lib/realtime/fanout-lobby";
import { notifyUser } from "@/lib/realtime/fan-out";

export type LobbyJoinFailureKind =
  | "invalid_code"
  | "not_found"
  | "closed"
  | "in_game"
  | "self"
  | "occupied"
  | "solitaire"
  | "computer"
  | "active_game_exists"
  | "active_lobby_exists"
  | "target_changed"
  | "invite_not_found"
  | "invite_forbidden"
  | "invite_gone"
  | "concurrent_state_conflict";

export interface PartySwitchConfirmation {
  kind: "confirmation_required";
  currentLobbyId: string;
  targetCode: string;
  guestName: string | null;
  hasPendingInvite: boolean;
}

interface DisbandedGuest {
  userId: string;
  lobbyId: string;
  hostName: string;
}

export type LobbyJoinResult =
  | {
      kind: "joined";
      lobbyId: string;
      replacedLobbyId: string | null;
      previousLobbyId: string | null;
      previousLobbyClosed: boolean;
      disbandedGuest: DisbandedGuest | null;
      canceledInvites: CanceledLobbyInvite[];
      membership: "created" | "existing";
    }
  | PartySwitchConfirmation
  | { kind: LobbyJoinFailureKind };

interface JoinLobbyByCodeInput {
  userId: string;
  code: string;
  deckId?: string;
  confirmDisbandLobbyId?: string;
}

interface JoinLobbyByInviteInput {
  userId: string;
  inviteId: string;
  confirmDisbandLobbyId?: string;
}

interface JoinableLobby {
  id: string;
  joinCode: string;
  status: LobbyStatus;
  hostUserId: string;
  mode: LobbyMode;
  guest: { userId: string } | null;
}

interface JoinTarget {
  lobby: JoinableLobby;
  inviteId: string | null;
  inviteExpired?: boolean;
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

type CurrentLobby = NonNullable<
  NonNullable<
    Prisma.UserGetPayload<{
      select: ReturnType<typeof currentMembershipSelect>;
    }>
  >["activeLobby"]
>;

class JoinRaceError extends Error {
  constructor(readonly kind: "occupied" | "target_changed" | "invite_gone") {
    super(kind);
  }
}

class CurrentLobbyChangedError extends Error {}

function loadCurrentMembership(tx: Prisma.TransactionClient, userId: string) {
  return tx.user.findUnique({
    where: { id: userId },
    select: currentMembershipSelect(userId),
  });
}

function buildPartySwitchConfirmation(
  currentLobby: CurrentLobby,
  targetCode: string
): PartySwitchConfirmation {
  const hostedGuest =
    currentLobby.guest?.userId !== currentLobby.hostUserId
      ? currentLobby.guest
      : null;

  return {
    kind: "confirmation_required",
    currentLobbyId: currentLobby.id,
    targetCode,
    guestName: hostedGuest ? displayName(hostedGuest.user, "Your guest") : null,
    hasPendingInvite: currentLobby.invites.length > 0,
  };
}

export async function joinLobbyByCode({
  userId,
  code,
  deckId,
  confirmDisbandLobbyId,
}: JoinLobbyByCodeInput): Promise<LobbyJoinResult> {
  const normalizedCode = normalizeLobbyCode(code);
  if (normalizedCode.length !== 6) return { kind: "invalid_code" };

  return joinLobby({
    userId,
    deckId,
    confirmDisbandLobbyId,
    resolveTarget: async (tx) => {
      const lobby = await tx.lobby.findFirst({
        where: { joinCode: normalizedCode },
        select: {
          id: true,
          joinCode: true,
          status: true,
          hostUserId: true,
          mode: true,
          guest: { select: { userId: true } },
        },
      });
      return lobby ? { lobby, inviteId: null } : { kind: "not_found" };
    },
  });
}

export async function joinLobbyByInvite({
  userId,
  inviteId,
  confirmDisbandLobbyId,
}: JoinLobbyByInviteInput): Promise<LobbyJoinResult> {
  const result = await joinLobby({
    userId,
    confirmDisbandLobbyId,
    resolveTarget: async (tx) => {
      const invite = await tx.lobbyInvite.findUnique({
        where: { id: inviteId },
        select: {
          id: true,
          toUserId: true,
          status: true,
          expiresAt: true,
          lobby: {
            select: {
              id: true,
              joinCode: true,
              status: true,
              hostUserId: true,
              mode: true,
              guest: { select: { userId: true } },
            },
          },
        },
      });
      if (!invite) return { kind: "invite_not_found" };
      if (invite.toUserId !== userId) return { kind: "invite_forbidden" };
      if (invite.status !== "PENDING") return { kind: "invite_gone" };
      return {
        lobby: invite.lobby,
        inviteId: invite.id,
        inviteExpired: invite.expiresAt.getTime() <= Date.now(),
      };
    },
  });

  if (result.kind !== "concurrent_state_conflict") return result;

  // Both transaction attempts rolled back. Re-read outside the failed
  // transaction so an invite that remains live gets a retryable 409, while
  // an invite actually canceled/expired by the winner gets the expected 410.
  const currentInvite = await prisma.lobbyInvite.findUnique({
    where: { id: inviteId },
    select: { status: true, expiresAt: true },
  });
  return !currentInvite ||
    currentInvite.status !== "PENDING" ||
    currentInvite.expiresAt.getTime() <= Date.now()
    ? { kind: "invite_gone" }
    : result;
}

interface JoinLobbyInput {
  userId: string;
  deckId?: string;
  confirmDisbandLobbyId?: string;
  resolveTarget: (
    tx: Prisma.TransactionClient
  ) => Promise<JoinTarget | { kind: LobbyJoinFailureKind }>;
}

async function joinLobby({
  userId,
  deckId,
  confirmDisbandLobbyId,
  resolveTarget,
}: JoinLobbyInput): Promise<LobbyJoinResult> {
  const activeGame = await findActiveGameLobby(userId);
  if (activeGame) return { kind: "active_game_exists" };

  try {
    return await retryTransactionOnce(prisma, async (tx) => {
      const target = await resolveTarget(tx);
      if ("kind" in target) return target;

      if (target.inviteId && target.inviteExpired) {
        // Expiry follows the same lobby → invite lock order as send, cancel,
        // and accept, avoiding an invite → lobby deadlock cycle.
        const locked = await tx.lobby.updateMany({
          where: { id: target.lobby.id, status: target.lobby.status },
          data: { status: target.lobby.status },
        });
        if (locked.count !== 1) return { kind: "target_changed" };

        const expired = await tx.lobbyInvite.updateMany({
          where: { id: target.inviteId, status: "PENDING" },
          data: { status: "EXPIRED" },
        });
        if (expired.count !== 1) throw new JoinRaceError("invite_gone");
        return { kind: "invite_gone" };
      }

      if (
        target.lobby.hostUserId !== userId &&
        target.lobby.status !== "CLOSED" &&
        target.lobby.status !== "IN_GAME" &&
        target.lobby.guest?.userId === userId
      ) {
        return existingMembership(target.lobby.id);
      }
      const targetFailure = validateTarget(target.lobby, userId);
      if (targetFailure) return { kind: targetFailure };

      const current = await loadCurrentMembership(tx, userId);

      const currentLobby = current?.activeLobby;
      const isCurrentMember = Boolean(
        current?.activeLobbyId &&
        currentLobby &&
        currentLobby.status !== "CLOSED" &&
        (currentLobby.hostUserId === userId ||
          currentLobby.guest?.userId === userId ||
          currentLobby.spectators?.length > 0)
      );
      const isHosting = isCurrentMember && currentLobby?.hostUserId === userId;
      const isSpectating =
        isCurrentMember && Boolean(currentLobby?.spectators?.length);
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
        return buildPartySwitchConfirmation(
          currentLobby,
          target.lobby.joinCode
        );
      }

      let previousLobbyId: string | null = null;
      let previousLobbyClosed = false;
      let disbandedGuest: DisbandedGuest | null = null;
      let canceledInvites: CanceledLobbyInvite[] = [];

      if (isCurrentMember && currentLobby) {
        previousLobbyId = currentLobby.id;
        if (isHosting) {
          const requiresNoUnconfirmedPartyImpact =
            !confirmationTargetsCurrentLobby;
          const closed = await tx.lobby.updateMany({
            where: {
              id: currentLobby.id,
              hostUserId: userId,
              revision: currentLobby.revision,
              status: { in: ["WAITING", "READY"] },
              ...(requiresNoUnconfirmedPartyImpact
                ? {
                    guest: { is: null },
                    invites: { none: { status: "PENDING" } },
                  }
                : {}),
            },
            data: { status: "CLOSED", revision: { increment: 1 } },
          });
          if (closed.count !== 1) {
            const fresh = await loadCurrentMembership(tx, userId);
            if (
              fresh?.activeLobbyId &&
              fresh.activeLobby?.hostUserId === userId &&
              fresh.activeLobby.status !== "CLOSED"
            ) {
              return buildPartySwitchConfirmation(
                fresh.activeLobby,
                target.lobby.joinCode
              );
            }
            throw new CurrentLobbyChangedError();
          }

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
          if (currentLobby.id === target.lobby.id) {
            previousLobbyId = null;
          } else {
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
          }
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

      const acquired = await tx.lobby.updateMany({
        where: {
          id: target.lobby.id,
          status: "WAITING",
          mode: "PVP",
          guest: { is: null },
        },
        data: { status: "READY", revision: { increment: 1 } },
      });
      if (acquired.count !== 1) throw new JoinRaceError("occupied");

      if (target.inviteId) {
        const accepted = await tx.lobbyInvite.updateMany({
          where: { id: target.inviteId, status: "PENDING" },
          data: { status: "ACCEPTED" },
        });
        if (accepted.count !== 1) throw new JoinRaceError("invite_gone");
      }

      await claimActiveLobby(tx, userId, target.lobby.id);
      try {
        await tx.lobbyGuest.create({
          data: { lobbyId: target.lobby.id, userId, deckId },
        });
      } catch (error) {
        if (isLobbyGuestCollision(error)) {
          throw new JoinRaceError("occupied");
        }
        throw error;
      }

      canceledInvites.push(
        ...(await cancelPendingLobbyInvitesInTransaction(tx, target.lobby.id))
      );

      return {
        kind: "joined" as const,
        lobbyId: target.lobby.id,
        replacedLobbyId: previousLobbyClosed ? previousLobbyId : null,
        previousLobbyId,
        previousLobbyClosed,
        disbandedGuest,
        canceledInvites,
        membership: "created" as const,
      };
    });
  } catch (error) {
    if (error instanceof ActiveLobbyConflictError) {
      return { kind: "active_lobby_exists" };
    }
    if (error instanceof CurrentLobbyChangedError) {
      return { kind: "active_lobby_exists" };
    }
    if (error instanceof JoinRaceError) return { kind: error.kind };
    if (isRetryableTransactionConflict(error)) {
      return { kind: "concurrent_state_conflict" };
    }
    throw error;
  }
}

function validateTarget(
  lobby: JoinableLobby,
  userId: string
): LobbyJoinFailureKind | null {
  if (lobby.hostUserId === userId) return "self";
  if (lobby.status === "CLOSED") return "closed";
  if (lobby.status === "IN_GAME") return "in_game";
  if (lobby.guest && lobby.guest.userId !== userId) return "occupied";
  if (lobby.mode === "SOLITAIRE") return "solitaire";
  if (lobby.mode === "PVCOMPUTER") return "computer";
  if (lobby.status !== "WAITING") return "target_changed";
  return null;
}

function existingMembership(lobbyId: string): LobbyJoinResult {
  return {
    kind: "joined",
    lobbyId,
    replacedLobbyId: null,
    previousLobbyId: null,
    previousLobbyClosed: false,
    disbandedGuest: null,
    canceledInvites: [],
    membership: "existing",
  };
}

/** Publish all post-commit effects shared by code and invite joins. */
export async function publishLobbyJoin(
  result: Extract<LobbyJoinResult, { kind: "joined" }>,
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
        console.error("[lobbies:join] target state fanout failed", error);
      }),
  ];

  if (result.previousLobbyId && !result.previousLobbyClosed) {
    effects.push(
      buildLobbyRoomState(result.previousLobbyId)
        .then((state) =>
          state ? notifyLobby(state, { actorUserId }) : Promise.resolve()
        )
        .catch((error) => {
          console.error("[lobbies:join] previous state fanout failed", error);
        })
    );
  }

  const disbandedGuest = result.disbandedGuest;
  if (disbandedGuest) {
    effects.push(
      notifyUser(disbandedGuest.userId, {
        type: "lobby:party_disbanded",
        lobbyId: disbandedGuest.lobbyId,
        hostName: disbandedGuest.hostName,
      })
    );
  }

  await Promise.all(effects);
}

export function lobbyJoinFailureMessage(kind: LobbyJoinFailureKind) {
  switch (kind) {
    case "invalid_code":
      return "Enter a valid 6-character party code";
    case "not_found":
    case "invite_not_found":
      return "Party code not found";
    case "closed":
      return "This party has been closed";
    case "in_game":
      return "This party is already in a game";
    case "self":
      return "You're already in this party";
    case "occupied":
      return "This party is full";
    case "solitaire":
      return "This party is in solo mode and cannot be joined";
    case "computer":
      return "This party is in computer mode and cannot be joined";
    case "active_game_exists":
      return "Finish or leave your current game first";
    case "active_lobby_exists":
      return "Your current party changed. Please try again";
    case "target_changed":
      return "This party changed before you could join. Please try again";
    case "invite_forbidden":
      return "Forbidden";
    case "invite_gone":
      return "Invite is no longer active";
    case "concurrent_state_conflict":
      return "Invite state changed concurrently. Try again.";
  }
}

function displayName(
  user: { username: string | null; name: string | null },
  fallback: string
) {
  return user.username ?? user.name ?? fallback;
}
