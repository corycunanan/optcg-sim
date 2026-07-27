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

export type VisibilityRecipient =
  | { kind: "PLAYER"; playerIndex: 0 | 1 }
  | { kind: "OBSERVER" };

export type PromptRecipient =
  | { kind: "RESPONDER"; playerIndex: 0 | 1 }
  | { kind: "OBSERVER" };

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

type PromptVisibilityPolicy = {
  audience: "RESPONDING_PLAYER";
  observerIdentities: "NONE" | "REDACT_CARDS";
};

/**
 * Exhaustive prompt visibility contract for active responders and passive
 * observers. Adding a PromptType requires an explicit identity decision.
 */
export const PROMPT_VISIBILITY = {
  SELECT_BLOCKER: {
    audience: "RESPONDING_PLAYER",
    observerIdentities: "NONE",
  },
  REVEAL_TRIGGER: {
    audience: "RESPONDING_PLAYER",
    observerIdentities: "REDACT_CARDS",
  },
  ARRANGE_TOP_CARDS: {
    audience: "RESPONDING_PLAYER",
    observerIdentities: "REDACT_CARDS",
  },
  SELECT_TARGET: {
    audience: "RESPONDING_PLAYER",
    observerIdentities: "REDACT_CARDS",
  },
  REDISTRIBUTE_DON: {
    audience: "RESPONDING_PLAYER",
    observerIdentities: "NONE",
  },
  PLAYER_CHOICE: {
    audience: "RESPONDING_PLAYER",
    observerIdentities: "NONE",
  },
  OPTIONAL_EFFECT: {
    audience: "RESPONDING_PLAYER",
    observerIdentities: "REDACT_CARDS",
  },
} satisfies Record<PromptType, PromptVisibilityPolicy>;

export const HIDDEN_IDENTITY = "hidden";

function redactCardFace(card: CardInstance): CardInstance {
  return {
    ...card,
    cardId: HIDDEN_IDENTITY,
    attachedDon: [],
  };
}

function redactCardIdentity(card: CardInstance): CardInstance {
  return {
    ...redactCardFace(card),
    instanceId: HIDDEN_IDENTITY,
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

export function filterEventForRecipient(
  event: GameEvent,
  recipient: VisibilityRecipient
): GameEvent {
  const policy = GAME_EVENT_VISIBILITY[event.type];
  if (!policy) return redactEventIdentities(event);
  if (policy.audience === "PUBLIC") return event;

  if (policy.audience === "PUBLIC_AFTER_ACTIVATION") {
    if (event.type !== "TRIGGER_ACTIVATED") return redactEventIdentities(event);
    return event.payload.activated === true ||
      (recipient.kind === "PLAYER" &&
        event.playerIndex === recipient.playerIndex)
      ? event
      : redactEventIdentities(event);
  }

  if (policy.audience === "OWNER_ONLY") {
    return recipient.kind === "PLAYER" &&
      event.playerIndex === recipient.playerIndex
      ? event
      : redactEventIdentities(event);
  }

  if (event.type !== "CARDS_REVEALED") return redactEventIdentities(event);
  const { visibility, visibleTo } = event.payload;
  return visibility !== "CONTROLLER_ONLY" ||
    (recipient.kind === "PLAYER" && visibleTo === recipient.playerIndex)
    ? event
    : redactEventIdentities(event);
}

export function filterEventForPlayer(
  event: GameEvent,
  receivingPlayer: 0 | 1
): GameEvent {
  return filterEventForRecipient(event, {
    kind: "PLAYER",
    playerIndex: receivingPlayer,
  });
}

/**
 * Remove transport-internal prompt data and project it for a player recipient.
 * Only the responding player receives the prompt in a player snapshot.
 */
export function filterPromptForPlayer(
  prompt: PendingPromptState | null,
  receivingPlayer: 0 | 1
): PendingPromptState | null {
  return filterPromptForRecipient(prompt, {
    kind: "RESPONDER",
    playerIndex: receivingPlayer,
  });
}

function promptPolicy(options: PromptOptions): PromptVisibilityPolicy | null {
  const promptType = (options as { promptType?: unknown }).promptType;
  if (
    typeof promptType !== "string" ||
    !Object.prototype.hasOwnProperty.call(PROMPT_VISIBILITY, promptType)
  ) {
    return null;
  }
  return PROMPT_VISIBILITY[promptType as PromptType];
}

function filterPromptOptionsForRecipient(
  options: PromptOptions,
  recipient: PromptRecipient,
  policy: PromptVisibilityPolicy
): PromptOptions {
  if (
    recipient.kind === "RESPONDER" &&
    options.promptType === "SELECT_TARGET" &&
    options.blindSelection
  ) {
    return { ...options, cards: options.cards.map(redactCardFace) };
  }

  if (
    recipient.kind === "OBSERVER" &&
    policy.observerIdentities === "REDACT_CARDS"
  ) {
    switch (options.promptType) {
      case "REVEAL_TRIGGER":
        return {
          ...options,
          cards: options.cards.map(redactCardIdentity),
        };
      case "ARRANGE_TOP_CARDS":
        return {
          ...options,
          cards: options.cards.map(redactCardIdentity),
          ...(options.validTargets !== undefined ? { validTargets: [] } : {}),
        };
      case "SELECT_TARGET":
        return {
          ...options,
          cards: options.cards.map(redactCardIdentity),
          validTargets: [],
          ...(options.dualTargets
            ? {
                dualTargets: {
                  slots: options.dualTargets.slots.map((slot) => ({
                    ...slot,
                    validIds: [],
                  })),
                },
              }
            : {}),
        };
      case "OPTIONAL_EFFECT":
        return {
          ...options,
          ...(options.cards
            ? { cards: options.cards.map(redactCardIdentity) }
            : {}),
        };
      case "SELECT_BLOCKER":
      case "REDISTRIBUTE_DON":
      case "PLAYER_CHOICE":
        throw new Error(
          `Prompt policy incorrectly classifies ${options.promptType} as identity-bearing`,
        );
      default: {
        const exhaustivePrompt: never = options;
        return exhaustivePrompt;
      }
    }
  }

  return options;
}

/**
 * Single prompt projection authority. Unknown prompt types fail closed, while
 * known observers retain passive metadata with face-bearing cards redacted.
 */
export function filterPromptForRecipient(
  prompt: PendingPromptState | null,
  recipient: PromptRecipient
): PendingPromptState | null {
  if (!prompt) return null;
  const policy = promptPolicy(prompt.options);
  if (!policy) return null;
  if (
    recipient.kind === "RESPONDER" &&
    prompt.respondingPlayer !== recipient.playerIndex
  ) {
    return null;
  }

  return {
    ...prompt,
    options: filterPromptOptionsForRecipient(prompt.options, recipient, policy),
    resumeContext: null,
  };
}

export function filterPromptOptionsForPlayer(
  options: PromptOptions
): PromptOptions {
  const policy = promptPolicy(options);
  if (!policy) {
    throw new Error("Cannot send an unclassified prompt type");
  }
  return filterPromptOptionsForRecipient(
    options,
    { kind: "RESPONDER", playerIndex: 0 },
    policy
  );
}
