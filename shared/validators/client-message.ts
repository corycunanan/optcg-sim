// Runtime validation schemas for WebSocket client → server messages.
//
// Shared between the Next.js app (src/lib/validators) and the game worker
// (workers/game/src/util/validate.ts). Kept in `shared/` so both consumers
// can import it without a cross-package dependency.

import { z } from "zod";

import type { GameAction } from "../game-types";

const id = () => z.string().min(1);
const promptId = { promptId: id().optional() };

const AdvancePhase = z.object({ type: z.literal("ADVANCE_PHASE") }).strict();

const PlayCard = z
  .object({
    type: z.literal("PLAY_CARD"),
    cardInstanceId: id(),
    position: z.number().int().nonnegative().optional(),
  })
  .strict();

const AttachDon = z
  .object({
    type: z.literal("ATTACH_DON"),
    targetInstanceId: id(),
    count: z.number().int().positive(),
  })
  .strict();

const ActivateEffect = z
  .object({
    type: z.literal("ACTIVATE_EFFECT"),
    cardInstanceId: id(),
    effectId: id(),
  })
  .strict();

const DeclareAttack = z
  .object({
    type: z.literal("DECLARE_ATTACK"),
    attackerInstanceId: id(),
    targetInstanceId: id(),
  })
  .strict();

const DeclareBlocker = z
  .object({
    type: z.literal("DECLARE_BLOCKER"),
    blockerInstanceId: id(),
  })
  .strict();

const UseCounter = z
  .object({
    type: z.literal("USE_COUNTER"),
    cardInstanceId: id(),
    counterTargetInstanceId: id(),
  })
  .strict();

const UseCounterEvent = z
  .object({
    type: z.literal("USE_COUNTER_EVENT"),
    cardInstanceId: id(),
    counterTargetInstanceId: id(),
  })
  .strict();

const RevealTrigger = z
  .object({
    type: z.literal("REVEAL_TRIGGER"),
    reveal: z.boolean(),
    ...promptId,
  })
  .strict();

const ArrangeTopCards = z
  .object({
    type: z.literal("ARRANGE_TOP_CARDS"),
    // Empty string is the "keep none" sentinel — sent when the prompt has no
    // valid targets (e.g. Kujyaku reveals top 5 with no Navy cards) or when
    // the player chooses to skip a SEARCH_DECK pick.
    keptCardInstanceId: z.string(),
    // Multi-pick responses ("play up to N" — OP16-059): the picked instance
    // ids. When present, the server prefers this over keptCardInstanceId.
    keptCardInstanceIds: z.array(id()).optional(),
    orderedInstanceIds: z.array(id()),
    destination: z.enum(["top", "bottom"]),
    ...promptId,
  })
  .strict();

const SelectTarget = z
  .object({
    type: z.literal("SELECT_TARGET"),
    selectedInstanceIds: z.array(id()),
    ...promptId,
  })
  .strict();

const RedistributeDon = z
  .object({
    type: z.literal("REDISTRIBUTE_DON"),
    transfers: z.array(
      z
        .object({
          fromCardInstanceId: id(),
          donInstanceId: id(),
          toCardInstanceId: id(),
        })
        .strict(),
      ),
    ...promptId,
  })
  .strict();

const PlayerChoice = z
  .object({
    type: z.literal("PLAYER_CHOICE"),
    choiceId: id(),
    ...promptId,
  })
  .strict();

const Pass = z.object({ type: z.literal("PASS"), ...promptId }).strict();
const Concede = z.object({ type: z.literal("CONCEDE") }).strict();

const ManualEffect = z
  .object({
    type: z.literal("MANUAL_EFFECT"),
    description: z.string().min(1),
  })
  .strict();

const Undo = z.object({ type: z.literal("UNDO") }).strict();

export const GameActionSchema = z.discriminatedUnion("type", [
  AdvancePhase,
  PlayCard,
  AttachDon,
  ActivateEffect,
  DeclareAttack,
  DeclareBlocker,
  UseCounter,
  UseCounterEvent,
  RevealTrigger,
  ArrangeTopCards,
  SelectTarget,
  RedistributeDon,
  PlayerChoice,
  Pass,
  Concede,
  ManualEffect,
  Undo,
]);

type ActionOf<T extends GameAction["type"]> = Extract<GameAction, { type: T }>;
type IsExact<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? (<T>() => T extends B ? 1 : 2) extends <T>() => T extends A ? 1 : 2
      ? true
      : false
    : false;
type Assert<T extends true> = T;

/** One erased compile-time assertion for each action schema. */
type ActionSchemaAssertions = {
  ADVANCE_PHASE: Assert<
    IsExact<z.infer<typeof AdvancePhase>, ActionOf<"ADVANCE_PHASE">>
  >;
  PLAY_CARD: Assert<IsExact<z.infer<typeof PlayCard>, ActionOf<"PLAY_CARD">>>;
  ATTACH_DON: Assert<
    IsExact<z.infer<typeof AttachDon>, ActionOf<"ATTACH_DON">>
  >;
  ACTIVATE_EFFECT: Assert<
    IsExact<z.infer<typeof ActivateEffect>, ActionOf<"ACTIVATE_EFFECT">>
  >;
  DECLARE_ATTACK: Assert<
    IsExact<z.infer<typeof DeclareAttack>, ActionOf<"DECLARE_ATTACK">>
  >;
  DECLARE_BLOCKER: Assert<
    IsExact<z.infer<typeof DeclareBlocker>, ActionOf<"DECLARE_BLOCKER">>
  >;
  USE_COUNTER: Assert<
    IsExact<z.infer<typeof UseCounter>, ActionOf<"USE_COUNTER">>
  >;
  USE_COUNTER_EVENT: Assert<
    IsExact<z.infer<typeof UseCounterEvent>, ActionOf<"USE_COUNTER_EVENT">>
  >;
  REVEAL_TRIGGER: Assert<
    IsExact<z.infer<typeof RevealTrigger>, ActionOf<"REVEAL_TRIGGER">>
  >;
  ARRANGE_TOP_CARDS: Assert<
    IsExact<z.infer<typeof ArrangeTopCards>, ActionOf<"ARRANGE_TOP_CARDS">>
  >;
  SELECT_TARGET: Assert<
    IsExact<z.infer<typeof SelectTarget>, ActionOf<"SELECT_TARGET">>
  >;
  REDISTRIBUTE_DON: Assert<
    IsExact<z.infer<typeof RedistributeDon>, ActionOf<"REDISTRIBUTE_DON">>
  >;
  PLAYER_CHOICE: Assert<
    IsExact<z.infer<typeof PlayerChoice>, ActionOf<"PLAYER_CHOICE">>
  >;
  PASS: Assert<IsExact<z.infer<typeof Pass>, ActionOf<"PASS">>>;
  CONCEDE: Assert<IsExact<z.infer<typeof Concede>, ActionOf<"CONCEDE">>>;
  MANUAL_EFFECT: Assert<
    IsExact<z.infer<typeof ManualEffect>, ActionOf<"MANUAL_EFFECT">>
  >;
  UNDO: Assert<IsExact<z.infer<typeof Undo>, ActionOf<"UNDO">>>;
};

/** Ensures every GameAction variant has a corresponding schema assertion. */
export type GameActionSchemaAssertions = Assert<
  IsExact<keyof ActionSchemaAssertions, GameAction["type"]>
>;

export const ClientMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("game:leave") }).strict(),
  z
    .object({
      type: z.literal("game:action"),
      action: GameActionSchema,
    })
    .strict(),
]);

export type GameActionParsed = z.infer<typeof GameActionSchema>;
export type ClientMessageParsed = z.infer<typeof ClientMessageSchema>;
