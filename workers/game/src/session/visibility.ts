import type { CardData, GameState } from "../types.js";
import { isEffectConditionMet } from "../engine/modifiers.js";
import {
  filterStateForPlayer,
  obfuscatePlayersDecksAndFaceDownLife,
} from "../engine/state.js";

function assertSameSpectatorField(
  field: string,
  playerZeroValue: unknown,
  playerOneValue: unknown,
): void {
  if (JSON.stringify(playerZeroValue) !== JSON.stringify(playerOneValue)) {
    throw new Error(
      `Spectator visibility invariant violated: ${field} differs between player views`,
    );
  }
}

/** Remove display-only active effects whose WHILE condition is not met. */
export function stripInactiveEffects(
  state: GameState,
  cardDb: Map<string, CardData>
): GameState {
  const effects = state.activeEffects;
  const active = effects.filter((effect) =>
    isEffectConditionMet(effect, state, cardDb)
  );
  return active.length === state.activeEffects.length
    ? state
    : { ...state, activeEffects: active };
}

/** Build the only state representation allowed to cross the socket boundary. */
export function visibleStateForPlayer(
  state: GameState,
  cardDb: Map<string, CardData>,
  playerIndex: 0 | 1
): GameState {
  return filterStateForPlayer(stripInactiveEffects(state, cardDb), playerIndex);
}

/**
 * Build the spectator state using union-for-revealed and
 * intersection-for-secret visibility. Each player's owner view supplies their
 * hand and other zones, but deck order and face-down Life are re-obfuscated for
 * BOTH players. Otherwise, a colluding spectator could relay each player's own
 * deck order or Life identities to their opponent. Consequently, spectator
 * clients must never assume a deck card has `cardId !== "hidden"`.
 */
export function visibleStateForSpectator(
  state: GameState,
  cardDb: Map<string, CardData>,
): GameState {
  const stripped = stripInactiveEffects(state, cardDb);
  const playerZeroView = filterStateForPlayer(stripped, 0);
  const playerOneView = filterStateForPlayer(stripped, 1);

  assertSameSpectatorField(
    "executionContext",
    playerZeroView.executionContext,
    playerOneView.executionContext,
  );

  for (const playerIndex of [0, 1] as const) {
    const playerZeroPublicZones = {
      leader: playerZeroView.players[playerIndex].leader,
      characters: playerZeroView.players[playerIndex].characters,
      stage: playerZeroView.players[playerIndex].stage,
      trash: playerZeroView.players[playerIndex].trash,
    };
    const playerOnePublicZones = {
      leader: playerOneView.players[playerIndex].leader,
      characters: playerOneView.players[playerIndex].characters,
      stage: playerOneView.players[playerIndex].stage,
      trash: playerOneView.players[playerIndex].trash,
    };
    assertSameSpectatorField(
      `players[${playerIndex}] public zones`,
      playerZeroPublicZones,
      playerOnePublicZones,
    );
  }

  const players = obfuscatePlayersDecksAndFaceDownLife([
    playerZeroView.players[0],
    playerOneView.players[1],
  ]);

  return {
    ...playerZeroView,
    executionContext: playerZeroView.executionContext,
    players,
    // TODO(OPT-549): Spectator event-log merge semantics are decided there.
    eventLog: playerZeroView.eventLog,
    // TODO(OPT-549): Spectator prompt merge semantics are decided there.
    pendingPrompt: playerZeroView.pendingPrompt,
    // TODO(OPT-549): Spectator prompt ownership semantics are decided there.
    promptRespondingPlayer: playerZeroView.promptRespondingPlayer,
    effectStack: [],
    // TODO(OPT-549): Spectator private turn-field merge semantics are decided there.
    turn: playerZeroView.turn,
    // TODO(OPT-550): Spectator effect availability is decided there.
    effectAvailability: playerZeroView.effectAvailability,
  };
}
