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
  if (playerZeroValue === playerOneValue) return;

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
 *
 * OPT-550 decides spectator `effectAvailability` at
 * `GameSession.broadcastFilteredState`; this pure core deliberately does not
 * set that transport-only field. OPT-552 broadcast callers must contain any
 * invariant error from this function so spectator delivery alone fails,
 * without interrupting authoritative player delivery.
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
    for (const zone of ["leader", "characters", "stage", "trash"] as const) {
      assertSameSpectatorField(
        `players[${playerIndex}].${zone}`,
        playerZeroView.players[playerIndex][zone],
        playerOneView.players[playerIndex][zone],
      );
    }
  }

  const players = obfuscatePlayersDecksAndFaceDownLife([
    playerZeroView.players[0],
    playerOneView.players[1],
  ]);

  // Deliberately explicit: do not replace this literal with a view spread.
  // Record<keyof ...> makes newly-added optional core fields fail type-check
  // too, forcing a deliberate spectator decision for every state field.
  return {
    id: stripped.id,
    executionContext: playerZeroView.executionContext,
    players,
    // TODO(OPT-549): Spectator private turn-field merge semantics are decided there.
    turn: playerZeroView.turn,
    pregame: stripped.pregame,
    activeEffects: stripped.activeEffects,
    prohibitions: stripped.prohibitions,
    scheduledActions: stripped.scheduledActions,
    oneTimeModifiers: stripped.oneTimeModifiers,
    triggerRegistry: stripped.triggerRegistry,
    // TODO(OPT-549): Spectator event-log merge semantics are decided there.
    eventLog: playerZeroView.eventLog,
    // TODO(OPT-549): Spectator prompt merge semantics are decided there.
    pendingPrompt: playerZeroView.pendingPrompt,
    // TODO(OPT-549): Spectator prompt ownership semantics are decided there.
    promptRespondingPlayer: playerZeroView.promptRespondingPlayer,
    effectStack: [],
    status: stripped.status,
    winner: stripped.winner,
    winReason: stripped.winReason,
    engineOutcome: stripped.engineOutcome,
    engineActionCount: stripped.engineActionCount,
  } satisfies GameState & Record<
    keyof Omit<GameState, "effectAvailability">,
    unknown
  >;
}
