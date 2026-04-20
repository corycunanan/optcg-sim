/**
 * Runtime validation for payloads entering the Durable Object.
 *
 * GameInitPayload uses manual validators; ClientMessage / GameAction use the
 * shared Zod schemas from shared/validators so both the worker and the Next.js
 * app validate WebSocket action params identically (OPT-187).
 */

import { ClientMessageSchema } from "../../../../shared/validators/client-message.js";
import type { GameInitPayload, PlayerInitData, DeckCardData } from "../types.js";
import type { ClientMessage } from "../types.js";

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

export function validateClientMessage(raw: unknown): ClientMessage {
  const result = ClientMessageSchema.safeParse(raw);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue.path.length > 0 ? issue.path.join(".") : "root";
    throw new Error(`Invalid ClientMessage at ${path}: ${issue.message}`);
  }
  return result.data as ClientMessage;
}
