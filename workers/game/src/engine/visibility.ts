import type {
  CardInstance,
  GameEvent,
  GameEventType,
  PendingPromptState,
  PromptOptions,
  PromptType,
} from "../types.js";

type EventVisibilityPolicy =
  | { audience: "PUBLIC" }
  | { audience: "OWNER_ONLY"; redactor: "CARD_IDENTITY" | "CARD_IDENTITIES" }
  | { audience: "PUBLIC_AFTER_ACTIVATION"; redactor: "CARD_IDENTITY" }
  | { audience: "DECLARED_BY_EVENT"; redactor: "CARD_IDENTITIES" };

const PUBLIC = { audience: "PUBLIC" } as const;

/**
 * Exhaustive visibility contract for events sent to clients.
 *
 * Adding a GameEventType without classifying it here is a compile error. Events
 * that can carry secret-zone identities must also name the redactor that is
 * applied outside their authorized audience.
 */
export const GAME_EVENT_VISIBILITY = {
  PHASE_CHANGED: PUBLIC,
  TURN_STARTED: PUBLIC,
  TURN_ENDED: PUBLIC,
  CARD_PLAYED: PUBLIC,
  CARD_KO: PUBLIC,
  CARD_DRAWN: { audience: "OWNER_ONLY", redactor: "CARD_IDENTITY" },
  CARD_TRASHED: PUBLIC,
  CARD_RETURNED_TO_HAND: { audience: "OWNER_ONLY", redactor: "CARD_IDENTITY" },
  CARD_ADDED_TO_HAND_FROM_LIFE: { audience: "OWNER_ONLY", redactor: "CARD_IDENTITY" },
  LIFE_CARD_FACE_CHANGED: PUBLIC,
  ATTACK_DECLARED: PUBLIC,
  ATTACK_TARGET_FINAL: PUBLIC,
  BLOCK_DECLARED: PUBLIC,
  COUNTER_USED: PUBLIC,
  BATTLE_RESOLVED: PUBLIC,
  DAMAGE_DEALT: PUBLIC,
  TRIGGER_ACTIVATED: {
    audience: "PUBLIC_AFTER_ACTIVATION",
    redactor: "CARD_IDENTITY",
  },
  DON_GIVEN_TO_CARD: PUBLIC,
  DON_DETACHED: PUBLIC,
  DON_PLACED_ON_FIELD: PUBLIC,
  DON_STATE_CHANGED: PUBLIC,
  CARD_STATE_CHANGED: PUBLIC,
  POWER_MODIFIED: PUBLIC,
  GAME_OVER: PUBLIC,
  CARD_RETURNED_TO_DECK: { audience: "OWNER_ONLY", redactor: "CARD_IDENTITY" },
  DON_SET_ACTIVE: PUBLIC,
  DON_RESTED: PUBLIC,
  CARDS_REVEALED: { audience: "DECLARED_BY_EVENT", redactor: "CARD_IDENTITIES" },
  EFFECTS_NEGATED: PUBLIC,
  LIFE_CARD_TO_DECK: PUBLIC,
  LIFE_SCRIED: { audience: "OWNER_ONLY", redactor: "CARD_IDENTITIES" },
  LIFE_REORDERED: { audience: "OWNER_ONLY", redactor: "CARD_IDENTITIES" },
  ATTACK_REDIRECTED: PUBLIC,
  CARD_REMOVED_FROM_LIFE: { audience: "OWNER_ONLY", redactor: "CARD_IDENTITY" },
  EXTRA_TURN_GRANTED: PUBLIC,
  EVENT_ACTIVATED_FROM_HAND: PUBLIC,
  EVENT_MAIN_RESOLVED_FROM_TRASH: PUBLIC,
  EVENT_TRIGGER_RESOLVED: PUBLIC,
  LIFE_CARD_TURNED_FACE_UP: PUBLIC,
  LIFE_CARD_TURNED_FACE_DOWN: PUBLIC,
  COMBAT_VICTORY: PUBLIC,
  CHARACTER_BATTLES: PUBLIC,
  END_OF_BATTLE: PUBLIC,
  BATTLE_ABORTED: PUBLIC,
  LIFE_COUNT_BECOMES_ZERO: PUBLIC,
  DRAW_OUTSIDE_DRAW_PHASE: PUBLIC,
  PREGAME_PRIORITY_ROLLED: PUBLIC,
  PREGAME_FIRST_PLAYER_DECIDED: PUBLIC,
  MULLIGAN_DECISION: PUBLIC,
} satisfies Record<GameEventType, EventVisibilityPolicy>;

/** Every prompt is private to its responding player. */
export const PROMPT_VISIBILITY = {
  SELECT_BLOCKER: "RESPONDING_PLAYER",
  SELECT_COUNTER_TARGET: "RESPONDING_PLAYER",
  SELECT_ATTACK_TARGET: "RESPONDING_PLAYER",
  REVEAL_TRIGGER: "RESPONDING_PLAYER",
  SELECT_CARD_TO_TRASH: "RESPONDING_PLAYER",
  ARRANGE_TOP_CARDS: "RESPONDING_PLAYER",
  SELECT_TARGET: "RESPONDING_PLAYER",
  REDISTRIBUTE_DON: "RESPONDING_PLAYER",
  PLAYER_CHOICE: "RESPONDING_PLAYER",
  OPTIONAL_EFFECT: "RESPONDING_PLAYER",
} satisfies Record<PromptType, "RESPONDING_PLAYER">;

const HIDDEN_IDENTITY = "hidden";

function redactCard(card: CardInstance): CardInstance {
  return {
    ...card,
    cardId: HIDDEN_IDENTITY,
    attachedDon: [],
  };
}

function redactEventIdentities(event: GameEvent): GameEvent {
  const payload = event.payload as Record<string, unknown>;
  const redactedPayload: Record<string, unknown> = { ...payload };

  if ("cardId" in payload) redactedPayload.cardId = HIDDEN_IDENTITY;
  if ("cardInstanceId" in payload) redactedPayload.cardInstanceId = HIDDEN_IDENTITY;
  if ("newCardInstanceId" in payload) redactedPayload.newCardInstanceId = HIDDEN_IDENTITY;
  if (Array.isArray(payload.cards)) {
    redactedPayload.cards = payload.cards.map((card) => ({
      ...(card as Record<string, unknown>),
      cardId: HIDDEN_IDENTITY,
      instanceId: HIDDEN_IDENTITY,
    }));
  }
  if (Array.isArray(payload.orderedInstanceIds)) {
    redactedPayload.orderedInstanceIds = payload.orderedInstanceIds.map(
      () => HIDDEN_IDENTITY,
    );
  }

  return { ...event, payload: redactedPayload } as GameEvent;
}

export function filterEventForPlayer(
  event: GameEvent,
  receivingPlayer: 0 | 1,
): GameEvent {
  const policy = GAME_EVENT_VISIBILITY[event.type];
  if (policy.audience === "PUBLIC") return event;

  if (policy.audience === "PUBLIC_AFTER_ACTIVATION") {
    if (event.type !== "TRIGGER_ACTIVATED") return redactEventIdentities(event);
    return event.payload.activated === true || event.playerIndex === receivingPlayer
      ? event
      : redactEventIdentities(event);
  }

  if (policy.audience === "OWNER_ONLY") {
    return event.playerIndex === receivingPlayer ? event : redactEventIdentities(event);
  }

  if (event.type !== "CARDS_REVEALED") return redactEventIdentities(event);
  const { visibility, visibleTo } = event.payload;
  return visibility !== "CONTROLLER_ONLY" || visibleTo === receivingPlayer
    ? event
    : redactEventIdentities(event);
}

/**
 * Remove transport-internal prompt data and hide blind-selection card faces.
 * The prompt itself is only returned to the responding player.
 */
export function filterPromptForPlayer(
  prompt: PendingPromptState | null,
  receivingPlayer: 0 | 1,
): PendingPromptState | null {
  if (!prompt || prompt.respondingPlayer !== receivingPlayer) return null;
  if (PROMPT_VISIBILITY[prompt.options.promptType] !== "RESPONDING_PLAYER") return null;

  return {
    ...prompt,
    options: filterPromptOptionsForPlayer(prompt.options),
    resumeContext: null,
  };
}

export function filterPromptOptionsForPlayer(options: PromptOptions): PromptOptions {
  if (options.promptType !== "SELECT_TARGET" || !options.blindSelection) return options;
  return { ...options, cards: options.cards.map(redactCard) };
}
