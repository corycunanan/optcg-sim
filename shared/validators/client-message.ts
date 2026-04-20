// Runtime validation schemas for WebSocket client → server messages.
//
// Shared between the Next.js app (src/lib/validators) and the game worker
// (workers/game/src/util/validate.ts). Kept in `shared/` so both consumers
// can import it without a cross-package dependency.

import { z } from "zod";

const id = () => z.string().min(1);

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
  })
  .strict();

const ArrangeTopCards = z
  .object({
    type: z.literal("ARRANGE_TOP_CARDS"),
    keptCardInstanceId: id(),
    orderedInstanceIds: z.array(id()),
    destination: z.enum(["top", "bottom"]),
  })
  .strict();

const SelectTarget = z
  .object({
    type: z.literal("SELECT_TARGET"),
    selectedInstanceIds: z.array(id()),
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
  })
  .strict();

const PlayerChoice = z
  .object({
    type: z.literal("PLAYER_CHOICE"),
    choiceId: id(),
  })
  .strict();

const Pass = z.object({ type: z.literal("PASS") }).strict();
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
