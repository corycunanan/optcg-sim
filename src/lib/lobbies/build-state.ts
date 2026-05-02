/**
 * Server-side builder for `LobbyRoomState`. Reads a lobby + each seat's
 * leader card and assembles the wire shape consumed by `GET /api/lobbies/[id]`
 * and the `lobby:state_changed` realtime event.
 */

import { prisma } from "@/lib/db";
import type {
  LobbyRoomDeck,
  LobbyRoomMode,
  LobbyRoomState,
  LobbyRoomStatus,
} from "./state";

export async function buildLobbyRoomState(
  lobbyId: string,
): Promise<LobbyRoomState | null> {
  const lobby = await prisma.lobby.findUnique({
    where: { id: lobbyId },
    select: {
      id: true,
      status: true,
      joinCode: true,
      format: true,
      mode: true,
      hostReady: true,
      hostUserId: true,
      host: { select: { username: true, name: true, image: true } },
      hostDeck: {
        select: { id: true, name: true, leaderId: true, leaderArtUrl: true },
      },
      guest: {
        select: {
          guestReady: true,
          user: {
            select: { id: true, username: true, name: true, image: true },
          },
          deck: {
            select: {
              id: true,
              name: true,
              leaderId: true,
              leaderArtUrl: true,
            },
          },
        },
      },
      gameSession: { select: { id: true } },
    },
  });

  if (!lobby) return null;

  const leaderIds: string[] = [];
  if (lobby.hostDeck) leaderIds.push(lobby.hostDeck.leaderId);
  if (lobby.guest?.deck?.leaderId) leaderIds.push(lobby.guest.deck.leaderId);

  const leaderCards = leaderIds.length
    ? await prisma.card.findMany({
        where: { id: { in: leaderIds } },
        select: { id: true, name: true, imageUrl: true },
      })
    : [];
  const leaderMap = new Map(leaderCards.map((c) => [c.id, c]));

  const hostLeader = lobby.hostDeck
    ? leaderMap.get(lobby.hostDeck.leaderId)
    : null;
  const guestLeader = lobby.guest?.deck
    ? leaderMap.get(lobby.guest.deck.leaderId)
    : null;

  const hostDeck: LobbyRoomDeck | null = lobby.hostDeck
    ? {
        id: lobby.hostDeck.id,
        name: lobby.hostDeck.name,
        leaderId: lobby.hostDeck.leaderId,
        leaderName: hostLeader?.name ?? null,
        leaderImageUrl:
          lobby.hostDeck.leaderArtUrl ?? hostLeader?.imageUrl ?? null,
      }
    : null;

  const guestDeck: LobbyRoomDeck | null = lobby.guest?.deck
    ? {
        id: lobby.guest.deck.id,
        name: lobby.guest.deck.name,
        leaderId: lobby.guest.deck.leaderId,
        leaderName: guestLeader?.name ?? null,
        leaderImageUrl:
          lobby.guest.deck.leaderArtUrl ?? guestLeader?.imageUrl ?? null,
      }
    : null;

  return {
    id: lobby.id,
    status: lobby.status as LobbyRoomStatus,
    joinCode: lobby.joinCode,
    format: lobby.format,
    mode: lobby.mode as LobbyRoomMode,
    hostReady: lobby.hostReady,
    hostUserId: lobby.hostUserId,
    host: lobby.host,
    hostDeck,
    guest: lobby.guest
      ? {
          guestReady: lobby.guest.guestReady,
          user: lobby.guest.user,
          deck: guestDeck,
        }
      : null,
    gameId: lobby.gameSession?.id ?? null,
  };
}
