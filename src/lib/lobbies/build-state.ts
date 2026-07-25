/**
 * Server-side builder for `LobbyRoomState`. Reads a lobby + each seat's
 * leader card and assembles the wire shape consumed by `GET /api/lobbies/[id]`
 * and the `lobby:state_changed` realtime event.
 */

import { prisma } from "@/lib/db";
import type {
  LobbyRoomDeck,
  LobbyRoomDeckContents,
  LobbyRoomState,
} from "./state";
import {
  LobbyModeSchema,
  LobbyStatusSchema,
  PregameModeSchema,
} from "@/lib/validators/lobbies";

export async function buildLobbyRoomState(
  lobbyId: string,
  viewerUserId?: string
): Promise<LobbyRoomState | null> {
  const lobby = await prisma.lobby.findUnique({
    where: { id: lobbyId },
    select: {
      id: true,
      revision: true,
      status: true,
      joinCode: true,
      format: true,
      mode: true,
      pregameMode: true,
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
      invites: {
        where: {
          status: "PENDING",
          expiresAt: { gt: new Date() },
        },
        orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }],
        take: 1,
        select: {
          id: true,
          expiresAt: true,
          toUser: {
            select: {
              id: true,
              username: true,
              name: true,
              image: true,
            },
          },
        },
      },
      gameSessions: {
        orderBy: [{ startedAt: "desc" }, { id: "desc" }],
        take: 1,
        select: { id: true, status: true },
      },
    },
  });

  if (!lobby) return null;

  const leaderIds: string[] = [];
  const deckIds: string[] = [];
  if (lobby.hostDeck) leaderIds.push(lobby.hostDeck.leaderId);
  if (lobby.guest?.deck?.leaderId) leaderIds.push(lobby.guest.deck.leaderId);
  if (lobby.hostDeck) deckIds.push(lobby.hostDeck.id);
  if (lobby.guest?.deck) deckIds.push(lobby.guest.deck.id);

  const viewerIsParticipant = Boolean(
    viewerUserId &&
    (viewerUserId === lobby.hostUserId || viewerUserId === lobby.guest?.user.id)
  );

  const [leaderCards, decksWithCards] = await Promise.all([
    leaderIds.length
      ? prisma.card.findMany({
          where: { id: { in: leaderIds } },
          select: { id: true, name: true, imageUrl: true },
        })
      : [],
    viewerIsParticipant && deckIds.length
      ? prisma.deck.findMany({
          where: { id: { in: deckIds } },
          select: {
            id: true,
            cards: {
              orderBy: { cardId: "asc" },
              select: {
                cardId: true,
                quantity: true,
                selectedArtUrl: true,
                card: {
                  select: {
                    name: true,
                    type: true,
                    imageUrl: true,
                  },
                },
              },
            },
          },
        })
      : [],
  ]);
  const leaderMap = new Map(leaderCards.map((c) => [c.id, c]));
  const contentsMap = new Map(
    decksWithCards.map((deck) => [deck.id, groupDeckCards(deck.cards)])
  );

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
        ...(viewerIsParticipant
          ? {
              contents:
                contentsMap.get(lobby.hostDeck.id) ?? emptyDeckContents(),
            }
          : {}),
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
        ...(viewerIsParticipant
          ? {
              contents:
                contentsMap.get(lobby.guest.deck.id) ?? emptyDeckContents(),
            }
          : {}),
      }
    : null;

  return {
    id: lobby.id,
    version: lobby.revision,
    status: LobbyStatusSchema.parse(lobby.status),
    joinCode: lobby.joinCode,
    format: lobby.format,
    mode: LobbyModeSchema.parse(lobby.mode),
    pregameMode: PregameModeSchema.parse(lobby.pregameMode),
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
    // Invitee identity is host-only. Callers that do not represent a viewer
    // get the safe default (no pending-invite payload), which prevents shared
    // realtime snapshots from disclosing it to guests or arbitrary users.
    pendingInvite:
      lobby.hostUserId === viewerUserId && lobby.invites[0]
        ? {
            id: lobby.invites[0].id,
            expiresAt: lobby.invites[0].expiresAt.toISOString(),
            user: lobby.invites[0].toUser,
          }
        : null,
    gameId: lobby.gameSessions[0]?.id ?? null,
    gameStatus: lobby.gameSessions[0]?.status,
  };
}

type DeckCardRow = {
  cardId: string;
  quantity: number;
  selectedArtUrl: string | null;
  card: {
    name: string;
    type: string;
    imageUrl: string;
  };
};

function groupDeckCards(cards: DeckCardRow[]): LobbyRoomDeckContents {
  const contents = emptyDeckContents();

  for (const entry of cards) {
    const card = {
      id: entry.cardId,
      name: entry.card.name,
      quantity: entry.quantity,
      imageUrl: entry.selectedArtUrl ?? entry.card.imageUrl,
    };
    if (entry.card.type === "Character") contents.characters.push(card);
    if (entry.card.type === "Event") contents.events.push(card);
    if (entry.card.type === "Stage") contents.stages.push(card);
  }

  return contents;
}

function emptyDeckContents(): LobbyRoomDeckContents {
  return {
    characters: [],
    events: [],
    stages: [],
  };
}
