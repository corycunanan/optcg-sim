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
  | "invite_gone";

export interface PartySwitchConfirmation {
  kind: "confirmation_required";
  currentLobbyId: string;
  targetCode: string;
  guestName: string | null;
  hasPendingInvite: boolean;
}

interface DisbandedGuest {
  userId: string;
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
  confirmSwitch?: boolean;
}

interface JoinLobbyByInviteInput {
  userId: string;
  inviteId: string;
  confirmSwitch?: boolean;
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
}

class JoinRaceError extends Error {
  constructor(readonly kind: "occupied" | "target_changed" | "invite_gone") {
    super(kind);
  }
}

class CurrentLobbyChangedError extends Error {}

export async function joinLobbyByCode({
  userId,
  code,
  deckId,
  confirmSwitch = false,
}: JoinLobbyByCodeInput): Promise<LobbyJoinResult> {
  const normalizedCode = normalizeLobbyCode(code);
  if (normalizedCode.length !== 6) return { kind: "invalid_code" };

  return joinLobby({
    userId,
    deckId,
    confirmSwitch,
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
  confirmSwitch = false,
}: JoinLobbyByInviteInput): Promise<LobbyJoinResult> {
  return joinLobby({
    userId,
    confirmSwitch,
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
      if (invite.expiresAt.getTime() <= Date.now()) {
        await tx.lobbyInvite.updateMany({
          where: { id: invite.id, status: "PENDING" },
          data: { status: "EXPIRED" },
        });
        return { kind: "invite_gone" };
      }
      return { lobby: invite.lobby, inviteId: invite.id };
    },
  });
}

interface JoinLobbyInput {
  userId: string;
  deckId?: string;
  confirmSwitch: boolean;
  resolveTarget: (
    tx: Prisma.TransactionClient
  ) => Promise<JoinTarget | { kind: LobbyJoinFailureKind }>;
}

async function joinLobby({
  userId,
  deckId,
  confirmSwitch,
  resolveTarget,
}: JoinLobbyInput): Promise<LobbyJoinResult> {
  const activeGame = await findActiveGameLobby(userId);
  if (activeGame) return { kind: "active_game_exists" };

  try {
    return await prisma.$transaction(async (tx) => {
      const target = await resolveTarget(tx);
      if ("kind" in target) return target;

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

      const current = await tx.user.findUnique({
        where: { id: userId },
        select: {
          activeLobbyId: true,
          activeLobby: {
            select: {
              id: true,
              status: true,
              hostUserId: true,
              host: { select: { username: true, name: true } },
              guest: {
                select: {
                  userId: true,
                  user: { select: { username: true, name: true } },
                },
              },
              invites: {
                where: { status: "PENDING" },
                select: { id: true },
              },
            },
          },
        },
      });

      const currentLobby = current?.activeLobby;
      const isCurrentMember = Boolean(
        current?.activeLobbyId &&
        currentLobby &&
        currentLobby.status !== "CLOSED" &&
        (currentLobby.hostUserId === userId ||
          currentLobby.guest?.userId === userId)
      );
      const isHosting = isCurrentMember && currentLobby?.hostUserId === userId;
      const hostedGuest =
        isHosting && currentLobby?.guest?.userId !== userId
          ? currentLobby?.guest
          : null;
      const hasPendingInvite = Boolean(
        isHosting && currentLobby && currentLobby.invites.length > 0
      );

      if ((hostedGuest || hasPendingInvite) && !confirmSwitch && currentLobby) {
        return {
          kind: "confirmation_required" as const,
          currentLobbyId: currentLobby.id,
          targetCode: target.lobby.joinCode,
          guestName: hostedGuest
            ? displayName(hostedGuest.user, "Your guest")
            : null,
          hasPendingInvite,
        };
      }

      if (target.inviteId) {
        const accepted = await tx.lobbyInvite.updateMany({
          where: { id: target.inviteId, status: "PENDING" },
          data: { status: "ACCEPTED" },
        });
        if (accepted.count !== 1) throw new JoinRaceError("invite_gone");
      }

      let previousLobbyId: string | null = null;
      let previousLobbyClosed = false;
      let disbandedGuest: DisbandedGuest | null = null;
      let canceledInvites: CanceledLobbyInvite[] = [];

      if (isCurrentMember && currentLobby) {
        previousLobbyId = currentLobby.id;
        if (isHosting) {
          const closed = await tx.lobby.updateMany({
            where: {
              id: currentLobby.id,
              hostUserId: userId,
              status: { in: ["WAITING", "READY"] },
            },
            data: { status: "CLOSED", revision: { increment: 1 } },
          });
          if (closed.count !== 1) throw new CurrentLobbyChangedError();

          previousLobbyClosed = true;
          if (hostedGuest) {
            disbandedGuest = {
              userId: hostedGuest.userId,
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

      await claimActiveLobby(tx, userId, target.lobby.id);
      try {
        await tx.lobbyGuest.create({
          data: { lobbyId: target.lobby.id, userId, deckId },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
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
        hostName: disbandedGuest.hostName,
      })
    );
    if (result.previousLobbyId) {
      effects.push(
        buildLobbyRoomState(result.previousLobbyId)
          .then((state) =>
            state
              ? notifyUser(disbandedGuest.userId, {
                  type: "lobby:state_changed",
                  lobby: state,
                })
              : Promise.resolve()
          )
          .catch((error) => {
            console.error("[lobbies:join] disband state fanout failed", error);
          })
      );
    }
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
  }
}

function displayName(
  user: { username: string | null; name: string | null },
  fallback: string
) {
  return user.username ?? user.name ?? fallback;
}
