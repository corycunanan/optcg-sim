import type {
  BattleContext,
  CardData,
  GameEvent,
  GameState,
  PendingPromptState,
  TurnState,
} from "../types.js";
import { isEffectConditionMet } from "../engine/modifiers.js";
import {
  filterStateForPlayer,
  obfuscatePlayersDecksAndFaceDownLife,
} from "../engine/state.js";
import {
  filterEventForRecipient,
  filterPromptForRecipient,
  GAME_EVENT_VISIBILITY,
} from "../engine/visibility.js";

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

/**
 * Every top-level field rewritten by filterStateForPlayer has a spectator rule.
 * This list is independently checked against PLAYER_VIEW_REWRITTEN_FIELDS by
 * the spectator suite, coupling future player-filter changes to this merge.
 */
export const SPECTATOR_PLAYER_VIEW_FIELDS = [
  "executionContext", // Both views contain the same redacted context; assert.
  "players", // Owner-view union, followed by deck/face-down-Life intersection.
  "turn", // Assert both views, then omit private in-flight Trigger identities.
  "eventLog", // Validate player views, then apply observer event semantics.
  "pendingPrompt", // Apply observer semantics to the authoritative prompt.
  "promptRespondingPlayer", // Derived from authoritative prompt; assert equal.
  "effectStack", // Engine-only and empty in both views.
] as const satisfies readonly (keyof GameState)[];

const HANDLED_PLAYER_VIEW_FIELDS = new Set<keyof GameState>(
  SPECTATOR_PLAYER_VIEW_FIELDS,
);

function isStructurallyEqual(a: unknown, b: unknown): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

function assertNoUnhandledPlayerViewDivergence(
  playerZeroView: GameState,
  playerOneView: GameState,
): void {
  for (const field of Object.keys(playerZeroView) as (keyof GameState)[]) {
    if (
      !HANDLED_PLAYER_VIEW_FIELDS.has(field) &&
      !isStructurallyEqual(playerZeroView[field], playerOneView[field])
    ) {
      throw new Error(
        `Spectator visibility invariant violated: unhandled player-view field ${String(field)} differs`,
      );
    }
  }
}

function mergeSpectatorEventLog(
  authoritativeEvents: readonly GameEvent[],
  playerZeroEvents: readonly GameEvent[],
  playerOneEvents: readonly GameEvent[],
): GameEvent[] {
  if (playerZeroEvents.length !== playerOneEvents.length) {
    throw new Error(
      "Spectator visibility invariant violated: eventLog lengths differ between player views",
    );
  }

  return playerZeroEvents.map((playerZeroEvent, index) => {
    const authoritativeEvent = authoritativeEvents[index];
    const playerOneEvent = playerOneEvents[index];
    if (
      playerZeroEvent.type !== playerOneEvent.type ||
      playerZeroEvent.playerIndex !== playerOneEvent.playerIndex ||
      playerZeroEvent.timestamp !== playerOneEvent.timestamp
    ) {
      throw new Error(
        `Spectator visibility invariant violated: eventLog[${index}] order differs between player views`,
      );
    }

    if (
      authoritativeEvent &&
      authoritativeEvent.type === playerZeroEvent.type &&
      authoritativeEvent.playerIndex === playerZeroEvent.playerIndex &&
      authoritativeEvent.timestamp === playerZeroEvent.timestamp
    ) {
      const expectedPlayerZeroEvent = filterEventForRecipient(
        authoritativeEvent,
        { kind: "PLAYER", playerIndex: 0 },
      );
      const expectedPlayerOneEvent = filterEventForRecipient(
        authoritativeEvent,
        { kind: "PLAYER", playerIndex: 1 },
      );
      if (!isStructurallyEqual(playerZeroEvent, expectedPlayerZeroEvent)) {
        throw new Error(
          `Spectator visibility invariant violated: eventLog[${index}] differs from player zero projection`,
        );
      }
      if (!isStructurallyEqual(playerOneEvent, expectedPlayerOneEvent)) {
        throw new Error(
          `Spectator visibility invariant violated: eventLog[${index}] differs from player one projection`,
        );
      }
      return filterEventForRecipient(authoritativeEvent, { kind: "OBSERVER" });
    }

    if (isStructurallyEqual(playerZeroEvent, playerOneEvent)) {
      return filterEventForRecipient(playerZeroEvent, { kind: "OBSERVER" });
    }

    const policy = GAME_EVENT_VISIBILITY[playerZeroEvent.type];
    if (!policy || !("redactor" in policy)) {
      throw new Error(
        `Spectator visibility invariant violated: public eventLog[${index}] differs between player views`,
      );
    }

    throw new Error(
      `Spectator visibility invariant violated: eventLog[${index}] has ambiguous redaction`,
    );
  });
}

function mergeSpectatorPrompt(
  authoritativePrompt: PendingPromptState | null,
  playerZeroPrompt: PendingPromptState | null,
  playerOnePrompt: PendingPromptState | null,
): PendingPromptState | null {
  if (playerZeroPrompt && playerOnePrompt) {
    // A prompt has exactly one respondingPlayer, so both player filters cannot
    // legitimately retain it. Throw instead of guessing which call-to-act wins.
    throw new Error(
      "Spectator visibility invariant violated: both player views contain pendingPrompt",
    );
  }
  return filterPromptForRecipient(authoritativePrompt, { kind: "OBSERVER" });
}

function unionViewerField<Value>(
  field: string,
  playerZeroValue: Value | null | undefined,
  playerOneValue: Value | null | undefined,
): Value | null | undefined {
  if (playerZeroValue != null && playerOneValue != null) {
    assertSameSpectatorField(field, playerZeroValue, playerOneValue);
    return playerZeroValue;
  }
  return playerZeroValue ?? playerOneValue;
}

function mergeSpectatorBattle(
  playerZeroBattle: BattleContext | null,
  playerOneBattle: BattleContext | null,
): BattleContext | null {
  if (!playerZeroBattle || !playerOneBattle) {
    assertSameSpectatorField("turn.battle", playerZeroBattle, playerOneBattle);
    return playerZeroBattle;
  }

  const {
    pendingTriggerLifeCard: playerZeroPendingTrigger,
    ...playerZeroPublicBattle
  } = playerZeroBattle;
  const {
    pendingTriggerLifeCard: playerOnePendingTrigger,
    ...playerOnePublicBattle
  } = playerOneBattle;
  assertSameSpectatorField(
    "turn.battle (excluding pendingTriggerLifeCard)",
    playerZeroPublicBattle,
    playerOnePublicBattle,
  );

  // Validate the player projections, but do not union a private Trigger-Life
  // identity into the observer projection before activation makes it public.
  unionViewerField(
    "turn.battle.pendingTriggerLifeCard",
    playerZeroPendingTrigger,
    playerOnePendingTrigger,
  );
  return playerZeroPublicBattle;
}

function mergeSpectatorTurn(
  playerZeroTurn: TurnState,
  playerOneTurn: TurnState,
): TurnState {
  const {
    battle: playerZeroBattle,
    pendingTriggerFromEffect: playerZeroPendingTriggerFromEffect,
    pendingBattleDamageContinuation:
      playerZeroPendingBattleDamageContinuation,
    ...playerZeroInvariantTurn
  } = playerZeroTurn;
  const {
    battle: playerOneBattle,
    pendingTriggerFromEffect: playerOnePendingTriggerFromEffect,
    pendingBattleDamageContinuation:
      playerOnePendingBattleDamageContinuation,
    ...playerOneInvariantTurn
  } = playerOneTurn;

  // Every remaining turn field is viewer-invariant. A newly filtered nested
  // turn field changes this remainder and fails instead of selecting player 0.
  assertSameSpectatorField(
    "turn (excluding spectator-union fields)",
    playerZeroInvariantTurn,
    playerOneInvariantTurn,
  );

  unionViewerField(
    "turn.pendingTriggerFromEffect",
    playerZeroPendingTriggerFromEffect,
    playerOnePendingTriggerFromEffect,
  );
  unionViewerField(
    "turn.pendingBattleDamageContinuation",
    playerZeroPendingBattleDamageContinuation,
    playerOnePendingBattleDamageContinuation,
  );

  return {
    ...playerZeroInvariantTurn,
    battle: mergeSpectatorBattle(playerZeroBattle, playerOneBattle),
    pendingTriggerFromEffect: null,
    pendingBattleDamageContinuation: null,
  };
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
 * Build the spectator state from both player projections, then apply explicit
 * observer semantics to private prompts, events, and in-flight Trigger state.
 * Deck order and face-down Life are re-obfuscated for BOTH players so a
 * colluding spectator cannot relay either player's private ordering.
 *
 * OPT-550 decides spectator `effectAvailability` at
 * `GameSession.broadcastFilteredState`; this pure core deliberately does not
 * set that transport-only field. OPT-552 broadcast callers must contain any
 * invariant error from this function so spectator delivery alone fails,
 * without interrupting authoritative player delivery.
 *
 * Spectators receive passive prompt state from this merged snapshot, but must
 * not receive `game:prompt` frames: those frames are calls to act and remain
 * addressed only to the responding player's socket. OPT-552 must preserve that
 * prompt-channel boundary when it adds spectator broadcast wiring.
 */
export function visibleStateForSpectator(
  state: GameState,
  cardDb: Map<string, CardData>,
): GameState {
  const stripped = stripInactiveEffects(state, cardDb);
  const playerZeroView = filterStateForPlayer(stripped, 0);
  const playerOneView = filterStateForPlayer(stripped, 1);

  return mergePlayerViewsForSpectator(
    stripped,
    playerZeroView,
    playerOneView,
  );
}

/**
 * Merge two already-filtered player views under the spectator policy.
 * Exported so defensive invariants can be tested with impossible synthetic
 * view divergence without weakening or bypassing the production filters.
 */
export function mergePlayerViewsForSpectator(
  stripped: GameState,
  playerZeroView: GameState,
  playerOneView: GameState,
): GameState {
  if (
    playerZeroView.id !== stripped.id ||
    playerOneView.id !== stripped.id
  ) {
    throw new Error(
      "Spectator visibility invariant violated: player views do not match authoritative state id",
    );
  }
  // filterStateForPlayer preserves the receiving player's authoritative object
  // reference and replaces only the opponent tuple entry. Besides being cheap,
  // checking both indexed owner references rejects swapped or duplicated views.
  if (
    playerZeroView.players[0] !== stripped.players[0] ||
    playerOneView.players[1] !== stripped.players[1]
  ) {
    throw new Error(
      "Spectator visibility invariant violated: player views are not their indexed owner views",
    );
  }

  assertNoUnhandledPlayerViewDivergence(playerZeroView, playerOneView);
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
  const turn = mergeSpectatorTurn(
    playerZeroView.turn,
    playerOneView.turn,
  );
  const eventLog = mergeSpectatorEventLog(
    stripped.eventLog,
    playerZeroView.eventLog,
    playerOneView.eventLog,
  );
  const pendingPrompt = mergeSpectatorPrompt(
    stripped.pendingPrompt,
    playerZeroView.pendingPrompt,
    playerOneView.pendingPrompt,
  );
  assertSameSpectatorField(
    "promptRespondingPlayer",
    playerZeroView.promptRespondingPlayer,
    playerOneView.promptRespondingPlayer,
  );
  assertSameSpectatorField(
    "effectStack",
    playerZeroView.effectStack,
    playerOneView.effectStack,
  );

  // Deliberately explicit: do not replace this literal with a view spread.
  // Record<keyof ...> makes newly-added optional core fields fail type-check
  // too, forcing a deliberate spectator decision for every state field.
  return {
    id: stripped.id,
    executionContext: playerZeroView.executionContext,
    players,
    turn,
    pregame: stripped.pregame,
    activeEffects: stripped.activeEffects,
    prohibitions: stripped.prohibitions,
    scheduledActions: stripped.scheduledActions,
    oneTimeModifiers: stripped.oneTimeModifiers,
    triggerRegistry: stripped.triggerRegistry,
    eventLog,
    pendingPrompt,
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
