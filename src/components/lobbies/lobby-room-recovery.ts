import type { LobbyRoomState } from "@/lib/lobbies/state";

interface LobbyRoomRecovery {
  route: string;
  message: string | null;
}

export function rejoinGameId(lobby: LobbyRoomState) {
  return lobby.status === "IN_GAME" &&
    lobby.gameStatus === "IN_PROGRESS" &&
    lobby.gameId
    ? lobby.gameId
    : null;
}

export function lobbyRoomRecovery(
  lobby: LobbyRoomState
): LobbyRoomRecovery | null {
  if (lobby.status === "EVICTED") {
    return {
      route: "/lobbies",
      message: "Host changed the lobby to solo mode",
    };
  }
  if (lobby.status === "CLOSED") {
    return {
      route: "/lobbies",
      message: "You're no longer in this party",
    };
  }
  return null;
}
