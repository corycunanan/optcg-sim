/**
 * Runtime validation for payloads entering the Durable Object.
 *
 * Manual validators (no zod dependency) to keep the Worker bundle small.
 */

import type { GameInitPayload, PlayerInitData, DeckCardData } from "../types.js";
import type { ClientMessage, GameAction } from "../types.js";

// ─── GameInitPayload ─────────────────────────────────────────────────────────

function isString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

function isStringOrNullish(v: unknown): v is string | null | undefined {
  return v == null || typeof v === "string";
}

function isDeckCardData(v: unknown): v is DeckCardData {
  if (typeof v !== "object" || v === null) return false;
  const d = v as Record<string, unknown>;
  return (
    isString(d.cardId) &&
    typeof d.quantity === "number" &&
    Number.isInteger(d.quantity) &&
    d.quantity > 0 &&
    typeof d.cardData === "object" &&
    d.cardData !== null &&
    isString((d.cardData as Record<string, unknown>).id)
  );
}

function isPlayerInitData(v: unknown): v is PlayerInitData {
  if (typeof v !== "object" || v === null) return false;
  const p = v as Record<string, unknown>;
  return (
    isString(p.userId) &&
    Array.isArray(p.deck) &&
    p.deck.length > 0 &&
    p.deck.every(isDeckCardData) &&
    isDeckCardData(p.leader) &&
    isStringOrNullish(p.sleeveUrl) &&
    isStringOrNullish(p.donArtUrl)
  );
}

export function validateGameInitPayload(raw: unknown): GameInitPayload {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("GameInitPayload must be a non-null object");
  }
  const obj = raw as Record<string, unknown>;

  if (!isString(obj.gameId)) {
    throw new Error("GameInitPayload.gameId must be a non-empty string");
  }
  if (!isPlayerInitData(obj.player1)) {
    throw new Error("GameInitPayload.player1 is invalid");
  }
  if (!isPlayerInitData(obj.player2)) {
    throw new Error("GameInitPayload.player2 is invalid");
  }
  if (!isString(obj.format)) {
    throw new Error("GameInitPayload.format must be a non-empty string");
  }

  return obj as unknown as GameInitPayload;
}

// ─── ClientMessage ───────────────────────────────────────────────────────────

const ACTION_TYPES = new Set<string>([
  "ADVANCE_PHASE", "PLAY_CARD", "ATTACH_DON", "ACTIVATE_EFFECT",
  "DECLARE_ATTACK", "DECLARE_BLOCKER", "USE_COUNTER", "USE_COUNTER_EVENT",
  "REVEAL_TRIGGER", "ARRANGE_TOP_CARDS", "SELECT_TARGET", "PLAYER_CHOICE",
  "PASS", "CONCEDE", "MANUAL_EFFECT", "UNDO",
]);

function isGameAction(v: unknown): v is GameAction {
  if (typeof v !== "object" || v === null) return false;
  const a = v as Record<string, unknown>;
  return typeof a.type === "string" && ACTION_TYPES.has(a.type);
}

export function validateClientMessage(raw: unknown): ClientMessage {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("ClientMessage must be a non-null object");
  }
  const msg = raw as Record<string, unknown>;

  if (msg.type === "game:leave") {
    return { type: "game:leave" };
  }

  if (msg.type === "game:action") {
    if (!isGameAction(msg.action)) {
      throw new Error("ClientMessage action has invalid or missing type");
    }
    return msg as unknown as ClientMessage;
  }

  throw new Error(`Unknown ClientMessage type: ${String(msg.type)}`);
}
