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
import { GAME_EVENT_VISIBILITY } from "../engine/visibility.js";

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

type RedactedGameEventType = {
  [Type in keyof typeof GAME_EVENT_VISIBILITY]:
    (typeof GAME_EVENT_VISIBILITY)[Type] extends { redactor: string }
      ? Type
      : never;
}[keyof typeof GAME_EVENT_VISIBILITY];

/**
 * Spectators union every identity that either player was allowed to see.
 *
 * This is intentionally exhaustive over GAME_EVENT_VISIBILITY policies with a
 * redactor. A new redacted event type fails type-check until its spectator
 * union rule is documented here.
 */
const SPECTATOR_REDACTED_EVENT_RULES = {
  CARD_DRAWN: "Union the owner's drawn-card identity.",
  CARD_RETURNED_TO_HAND: "Union the owner's returned-card identity.",
  CARD_ADDED_TO_HAND_FROM_LIFE: "Union the owner's revealed Life identity.",
  TRIGGER_ACTIVATED: "Union the offered Trigger identity seen by its owner.",
  CARD_RETURNED_TO_DECK: "Union the owner's returned-card identity.",
  CARDS_REVEALED: "Union controller-only peek identities.",
  LIFE_SCRIED: "Union the owner's Life peek identities.",
  LIFE_REORDERED: "Union the owner's revealed Life ordering.",
  CARD_REMOVED_FROM_LIFE: "Union the owner's removed-Life identity.",
} satisfies Record<RedactedGameEventType, string>;

/**
 * Every top-level field rewritten by filterStateForPlayer has a spectator rule.
 * This list is independently checked against PLAYER_VIEW_REWRITTEN_FIELDS by
 * the spectator suite, coupling future player-filter changes to this merge.
 */
export const SPECTATOR_PLAYER_VIEW_FIELDS = [
  "executionContext", // Both views contain the same redacted context; assert.
  "players", // Owner-view union, followed by deck/face-down-Life intersection.
  "turn", // Union three revealed continuations; assert every other turn field.
  "eventLog", // Pairwise identity union; never concatenate.
  "pendingPrompt", // Union the single responder's filtered prompt.
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

function hiddenIdentityCount(value: unknown): number {
  if (value === "hidden") return 1;
  if (Array.isArray(value)) {
    return value.reduce((count, item) => count + hiddenIdentityCount(item), 0);
  }
  if (value !== null && typeof value === "object") {
    return Object.values(value).reduce(
      (count, item) => count + hiddenIdentityCount(item),
      0,
    );
  }
  return 0;
}

function mergeSpectatorEventLog(
  playerZeroEvents: readonly GameEvent[],
  playerOneEvents: readonly GameEvent[],
): GameEvent[] {
  if (playerZeroEvents.length !== playerOneEvents.length) {
    throw new Error(
      "Spectator visibility invariant violated: eventLog lengths differ between player views",
    );
  }

  // Whole-event side selection is correct only while every redacted event
  // carries identities visible to at most one player: current policies produce
  // either identical views or one fully revealed and one fully redacted view.
  // If a future event contains private identities belonging to both players,
  // choosing one side silently under-reveals and this must become a field-level
  // union. The "ambiguous redaction" error below catches only the subset where
  // both views hide equal identity counts. Unequal two-sided redaction is not
  // detected and will under-reveal; whole-side selection is the known limit.
  return playerZeroEvents.map((playerZeroEvent, index) => {
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

    if (isStructurallyEqual(playerZeroEvent, playerOneEvent)) {
      return playerZeroEvent;
    }

    if (!(playerZeroEvent.type in SPECTATOR_REDACTED_EVENT_RULES)) {
      throw new Error(
        `Spectator visibility invariant violated: public eventLog[${index}] differs between player views`,
      );
    }

    const playerZeroHiddenCount = hiddenIdentityCount(playerZeroEvent);
    const playerOneHiddenCount = hiddenIdentityCount(playerOneEvent);
    if (playerZeroHiddenCount === playerOneHiddenCount) {
      throw new Error(
        `Spectator visibility invariant violated: eventLog[${index}] has ambiguous redaction`,
      );
    }
    return playerZeroHiddenCount < playerOneHiddenCount
      ? playerZeroEvent
      : playerOneEvent;
  });
}

function mergeSpectatorPrompt(
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
  return playerZeroPrompt ?? playerOnePrompt;
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

  // Face-down Life identities unseen by either player remain hidden under the
  // intersection rule. This card has already been revealed to its owner, so it
  // is a peek and union-visible rather than an unrevealed face-down Life card.
  const pendingTriggerLifeCard = unionViewerField(
    "turn.battle.pendingTriggerLifeCard",
    playerZeroPendingTrigger,
    playerOnePendingTrigger,
  );
  return pendingTriggerLifeCard
    ? { ...playerZeroPublicBattle, pendingTriggerLifeCard }
    : playerZeroPublicBattle;
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

  return {
    ...playerZeroInvariantTurn,
    battle: mergeSpectatorBattle(playerZeroBattle, playerOneBattle),
    pendingTriggerFromEffect: unionViewerField(
      "turn.pendingTriggerFromEffect",
      playerZeroPendingTriggerFromEffect,
      playerOnePendingTriggerFromEffect,
    ),
    pendingBattleDamageContinuation: unionViewerField(
      "turn.pendingBattleDamageContinuation",
      playerZeroPendingBattleDamageContinuation,
      playerOnePendingBattleDamageContinuation,
    ),
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
    playerZeroView.eventLog,
    playerOneView.eventLog,
  );
  const pendingPrompt = mergeSpectatorPrompt(
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
