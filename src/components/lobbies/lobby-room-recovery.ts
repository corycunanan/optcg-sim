import type { LobbyRoomState } from "@/lib/lobbies/state";

interface LobbyRoomRecovery {
  route: string;
  message: string | null;
}

export function lobbyRoomRecovery(
  lobby: LobbyRoomState
): LobbyRoomRecovery | null {
  if (lobby.status === "IN_GAME" && lobby.gameId) {
    return { route: `/game/${lobby.gameId}`, message: null };
  }
  if (lobby.status === "EVICTED") {
    return {
      route: "/lobbies",
      message: "Host changed the lobby to solo mode",
    };
  }
  if (lobby.status === "CLOSED") {
    return {
      route: "/lobbies",
      message: "The host closed the lobby",
    };
  }
  return null;
}
