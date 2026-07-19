/**
 * Runtime validation for payloads entering the Durable Object.
 *
 * GameInitPayload uses manual validators; ClientMessage / GameAction use the
 * shared Zod schemas from shared/validators so both the worker and the Next.js
 * app validate WebSocket action params identically (OPT-187).
 */

import { ClientMessageSchema } from "../../../../shared/validators/client-message.js";
import type {
  CardData,
  GameInitPayload,
  PlayerInitData,
  DeckCardData,
} from "../types.js";
import type { ClientMessage } from "../types.js";
import type { EffectSchema } from "../engine/effect-types.js";
import { validateEffectSchema } from "../engine/schema-registry.js";
import { assertValidTestOrder } from "./test-order.js";

export type NotifyEndPayload = {
  winnerIndex: 0 | 1;
  reason: string;
};

// ─── GameInitPayload ─────────────────────────────────────────────────────────

function isString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

function isAnyString(v: unknown): v is string {
  return typeof v === "string";
}

function isStringOrNullish(v: unknown): v is string | null | undefined {
  return v == null || typeof v === "string";
}

function isLobbyMode(v: unknown): v is GameInitPayload["mode"] {
  return v === "PVP" || v === "SOLITAIRE" || v === "PVCOMPUTER";
}

function isPregameMode(v: unknown): v is GameInitPayload["pregameMode"] {
  return (
    v === "PRIORITY_ROLL" ||
    v === "HOST_FIRST" ||
    v === "GUEST_FIRST" ||
    v === "RANDOM_FIXED" ||
    v === "SIDE_A_FIRST" ||
    v === "SIDE_B_FIRST" ||
    v === "SOLITAIRE_RANDOM"
  );
}

function isNullableNumber(v: unknown): v is number | null {
  return v === null || (typeof v === "number" && Number.isFinite(v));
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every(isAnyString);
}

function parseEffectSchema(raw: unknown, cardId: string): EffectSchema | null {
  if (raw === null) return null;
  const errors = validateEffectSchema(raw, cardId);
  if (errors.length > 0) {
    throw new Error(`CardData.effectSchema is invalid: ${errors[0]}`);
  }
  // validateEffectSchema recursively validates the schema discriminants and
  // nested action contracts; this is the single assertion at the JSON edge.
  return raw as EffectSchema;
}

export function parseCardData(raw: unknown): CardData {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("CardData must be a non-null object");
  }
  const card = raw as Record<string, unknown>;
  if (!isString(card.id))
    throw new Error("CardData.id must be a non-empty string");
  if (!isString(card.name))
    throw new Error(`CardData[${card.id}].name is invalid`);
  if (!["Leader", "Character", "Event", "Stage"].includes(String(card.type))) {
    throw new Error(`CardData[${card.id}].type is invalid`);
  }
  if (!isStringArray(card.color))
    throw new Error(`CardData[${card.id}].color is invalid`);
  if (
    !isNullableNumber(card.cost) ||
    !isNullableNumber(card.power) ||
    !isNullableNumber(card.counter) ||
    !isNullableNumber(card.life)
  ) {
    throw new Error(`CardData[${card.id}] numeric fields are invalid`);
  }
  if (!isStringArray(card.attribute) || !isStringArray(card.types)) {
    throw new Error(`CardData[${card.id}] attribute/types are invalid`);
  }
  if (
    !isAnyString(card.effectText) ||
    !isStringOrNullish(card.triggerText) ||
    !isStringOrNullish(card.imageUrl)
  ) {
    throw new Error(`CardData[${card.id}] text/image fields are invalid`);
  }
  if (
    typeof card.keywords !== "object" ||
    card.keywords === null ||
    Array.isArray(card.keywords)
  ) {
    throw new Error(`CardData[${card.id}].keywords is invalid`);
  }
  const keywords = card.keywords as Record<string, unknown>;
  const keywordKeys = [
    "rush",
    "rushCharacter",
    "doubleAttack",
    "banish",
    "blocker",
    "trigger",
    "unblockable",
  ] as const;
  if (!keywordKeys.every((key) => typeof keywords[key] === "boolean")) {
    throw new Error(`CardData[${card.id}].keywords is invalid`);
  }

  return {
    id: card.id,
    name: card.name,
    type: card.type as CardData["type"],
    color: card.color,
    cost: card.cost,
    power: card.power,
    counter: card.counter,
    life: card.life,
    attribute: card.attribute,
    types: card.types,
    effectText: card.effectText,
    triggerText: card.triggerText ?? null,
    keywords: {
      rush: keywords.rush as boolean,
      rushCharacter: keywords.rushCharacter as boolean,
      doubleAttack: keywords.doubleAttack as boolean,
      banish: keywords.banish as boolean,
      blocker: keywords.blocker as boolean,
      trigger: keywords.trigger as boolean,
      unblockable: keywords.unblockable as boolean,
    },
    effectSchema: parseEffectSchema(card.effectSchema ?? null, card.id),
    imageUrl: card.imageUrl ?? null,
  };
}

function parseDeckCardData(raw: unknown): DeckCardData {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("DeckCardData must be a non-null object");
  }
  const deckCard = raw as Record<string, unknown>;
  if (
    !isString(deckCard.cardId) ||
    !Number.isInteger(deckCard.quantity) ||
    (deckCard.quantity as number) <= 0
  ) {
    throw new Error("DeckCardData cardId/quantity is invalid");
  }
  const cardData = parseCardData(deckCard.cardData);
  if (cardData.id !== deckCard.cardId) {
    throw new Error(
      `DeckCardData.cardId '${deckCard.cardId}' does not match CardData.id '${cardData.id}'`
    );
  }
  return {
    cardId: deckCard.cardId,
    quantity: deckCard.quantity as number,
    cardData,
  };
}

function parsePlayerInitData(raw: unknown): PlayerInitData {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("PlayerInitData must be a non-null object");
  }
  const player = raw as Record<string, unknown>;
  if (
    !isString(player.userId) ||
    !Array.isArray(player.deck) ||
    player.deck.length === 0 ||
    !isStringOrNullish(player.sleeveUrl) ||
    !isStringOrNullish(player.donArtUrl)
  ) {
    throw new Error("PlayerInitData fields are invalid");
  }
  let testOrder: PlayerInitData["testOrder"];
  if (player.testOrder != null) {
    if (
      typeof player.testOrder !== "object" ||
      Array.isArray(player.testOrder)
    ) {
      throw new Error("PlayerInitData.testOrder is invalid");
    }
    const order = player.testOrder as Record<string, unknown>;
    if (!isStringArray(order.life) || !isStringArray(order.hand)) {
      throw new Error("PlayerInitData.testOrder is invalid");
    }
    testOrder = { life: order.life, hand: order.hand };
  }
  const parsed: PlayerInitData = {
    userId: player.userId,
    deck: player.deck.map(parseDeckCardData),
    leader: parseDeckCardData(player.leader),
    sleeveUrl: player.sleeveUrl,
    donArtUrl: player.donArtUrl,
    testOrder: testOrder ?? null,
  };
  assertValidTestOrder(parsed);
  return parsed;
}

export function validateGameInitPayload(raw: unknown): GameInitPayload {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("GameInitPayload must be a non-null object");
  }
  const obj = raw as Record<string, unknown>;

  if (!isString(obj.gameId)) {
    throw new Error("GameInitPayload.gameId must be a non-empty string");
  }
  const player1 = parsePlayerInitData(obj.player1);
  const player2 = parsePlayerInitData(obj.player2);
  if (!isString(obj.format)) {
    throw new Error("GameInitPayload.format must be a non-empty string");
  }
  if (!isLobbyMode(obj.mode)) {
    throw new Error("GameInitPayload.mode must be a valid lobby mode");
  }
  const pregameMode = obj.pregameMode ?? "PRIORITY_ROLL";
  if (!isPregameMode(pregameMode)) {
    throw new Error("GameInitPayload.pregameMode must be a valid pregame mode");
  }
  const pvpPregameMode =
    pregameMode === "PRIORITY_ROLL" ||
    pregameMode === "HOST_FIRST" ||
    pregameMode === "GUEST_FIRST" ||
    pregameMode === "RANDOM_FIXED";
  const solitairePregameMode =
    pregameMode === "SIDE_A_FIRST" ||
    pregameMode === "SIDE_B_FIRST" ||
    pregameMode === "SOLITAIRE_RANDOM";
  if (
    (obj.mode === "PVP" && !pvpPregameMode) ||
    (obj.mode === "SOLITAIRE" && !solitairePregameMode)
  ) {
    throw new Error(
      `GameInitPayload.pregameMode ${pregameMode} is not valid for ${obj.mode} mode`,
    );
  }
  if (obj.testPriorityRolls != null) {
    if (
      !Array.isArray(obj.testPriorityRolls) ||
      !obj.testPriorityRolls.every(
        (n) => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 6,
      )
    ) {
      throw new Error("GameInitPayload.testPriorityRolls must be an array of d6 integers (1-6)");
    }
  }

  const payload: GameInitPayload = {
    gameId: obj.gameId,
    player1,
    player2,
    format: obj.format,
    mode: obj.mode,
    pregameMode,
  };
  if (obj.testPriorityRolls !== undefined) {
    payload.testPriorityRolls = obj.testPriorityRolls as number[] | null;
  }
  return payload;
}

export function validateNotifyEndPayload(raw: unknown): NotifyEndPayload {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("NotifyEndPayload must be a non-null object");
  }
  const obj = raw as Record<string, unknown>;
  if (obj.winnerIndex !== 0 && obj.winnerIndex !== 1) {
    throw new Error("NotifyEndPayload.winnerIndex must be 0 or 1");
  }
  if (!isString(obj.reason)) {
    throw new Error("NotifyEndPayload.reason must be a non-empty string");
  }
  return { winnerIndex: obj.winnerIndex, reason: obj.reason };
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
