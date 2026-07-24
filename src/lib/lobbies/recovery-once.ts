const handledLobbyRecoveries = new Set<string>();

/**
 * Converges directed terminal events and terminal room snapshots so whichever
 * reaches the client first owns the single toast + redirect for that lobby.
 */
export function claimLobbyRecovery(lobbyId: string) {
  if (handledLobbyRecoveries.has(lobbyId)) return false;
  handledLobbyRecoveries.add(lobbyId);
  return true;
}
