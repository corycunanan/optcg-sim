/**
 * Wire shape for the lobby room snapshot.
 *
 * Single source of truth shared by the `GET /api/lobbies/[id]` response and
 * the `lobby:state_changed` realtime event. Pure types (no `prisma` import) so
 * the client hook can `import type` without dragging the server bundle in.
 */

export type LobbyRoomMode = "PVP" | "SOLITAIRE" | "PVCOMPUTER";
export type LobbyRoomPregameMode =
  | "PRIORITY_ROLL"
  | "HOST_FIRST"
  | "GUEST_FIRST"
  | "RANDOM_FIXED"
  | "SIDE_A_FIRST"
  | "SIDE_B_FIRST"
  | "SOLITAIRE_RANDOM";
export type LobbyRoomStatus =
  | "WAITING"
  | "READY"
  | "IN_GAME"
  | "CLOSED"
  | "EVICTED";

export interface LobbyRoomDeckCard {
  id: string;
  name: string;
  quantity: number;
  imageUrl: string;
}

export interface LobbyRoomDeckContents {
  characters: LobbyRoomDeckCard[];
  events: LobbyRoomDeckCard[];
  stages: LobbyRoomDeckCard[];
}

export interface LobbyRoomDeck {
  id: string;
  name: string;
  leaderId: string;
  leaderName: string | null;
  leaderImageUrl: string | null;
  /** Participant-only grouped card summaries; absent on legacy/public states. */
  contents?: LobbyRoomDeckContents;
}

export interface LobbyRoomState {
  id: string;
  /** Monotonic Lobby.revision used for snapshot ordering when available. */
  version?: number;
  status: LobbyRoomStatus;
  joinCode: string;
  format: string;
  mode: LobbyRoomMode;
  pregameMode: LobbyRoomPregameMode;
  hostReady: boolean;
  hostUserId: string;
  host: {
    username: string | null;
    name: string | null;
    image: string | null;
  } | null;
  hostDeck: LobbyRoomDeck | null;
  guest: {
    guestReady: boolean;
    user: {
      id: string;
      username: string | null;
      name: string | null;
      image: string | null;
    };
    deck: LobbyRoomDeck | null;
  } | null;
  pendingInvite?: {
    id: string;
    expiresAt: string;
    user: {
      id: string;
      username: string | null;
      name: string | null;
      image: string | null;
    };
  } | null;
  gameId: string | null;
  gameStatus?: "IN_PROGRESS" | "FINISHED" | "ABANDONED";
}

/**
 * True when the viewer is neither the host nor the current guest of a
 * non-terminal lobby — i.e. they were ejected during a mode switch and the
 * lobby still exists. Used to surface an `EVICTED` status to the previous
 * guest from `GET /api/lobbies/[id]`.
 */
export function viewerIsEvicted(
  lobby: Pick<LobbyRoomState, "status" | "hostUserId" | "guest">,
  viewerUserId: string
): boolean {
  if (lobby.hostUserId === viewerUserId) return false;
  if (lobby.status !== "WAITING" && lobby.status !== "READY") return false;
  return lobby.guest?.user.id !== viewerUserId;
}
