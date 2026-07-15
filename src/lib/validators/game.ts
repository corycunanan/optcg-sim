import { z } from "zod";

export const GameEndReasonCodeSchema = z.enum([
  "LEADER_KO",
  "DECK_OUT",
  "LIFE_LOSS",
  "CONCEDE",
  "DISCONNECT_TIMEOUT",
  "FALLBACK_CONCEDE",
  "UNKNOWN",
]);

export type GameEndReasonCode = z.infer<typeof GameEndReasonCodeSchema>;

export const GameResultSchema = z.object({
  gameId: z.string().min(1, "gameId is required"),
  status: z.enum(["IN_PROGRESS", "FINISHED", "ABANDONED"]),
  winnerId: z.string().nullable(),
  winReason: z.string().nullable(),
  reasonCode: GameEndReasonCodeSchema.nullable().optional(),
});

export const GameActionSchema = z.object({
  action: z.enum(["FINALIZE", "CONCEDE"], {
    error: "Unsupported action",
  }),
  winnerId: z.string().nullable().optional(),
  winReason: z.string().nullable().optional(),
  reasonCode: GameEndReasonCodeSchema.nullable().optional(),
});

export const GameTokenResponseSchema = z.object({
  data: z.object({ token: z.string().min(1) }),
});

export const RealtimeTokenResponseSchema = z.object({
  data: z.object({
    token: z.string().min(1),
    expiresAt: z.number(),
  }),
});

export const RemoteGameStatusSchema = z.object({
  id: z.string(),
  mode: z.enum(["PVP", "SOLITAIRE", "PVCOMPUTER"]),
  status: z.enum(["IN_PROGRESS", "FINISHED", "ABANDONED"]),
  winnerId: z.string().nullable(),
  winReason: z.string().nullable(),
  winnerPerspective: z.enum(["SELF", "OPPONENT", "NONE"]),
  canFallbackConcede: z.boolean(),
  playerIndex: z.union([z.literal(0), z.literal(1)]).optional(),
});

export const RemoteGameStatusResponseSchema = z.object({
  data: RemoteGameStatusSchema,
});

export const ConcedeGameResponseSchema = z.object({
  data: z.object({
    id: z.string(),
    status: z.enum(["IN_PROGRESS", "FINISHED", "ABANDONED"]),
    winnerId: z.string().nullable(),
    winReason: z.string().nullable(),
    winnerPerspective: z.enum(["SELF", "OPPONENT", "NONE"]),
    canFallbackConcede: z.boolean(),
  }),
});

export const ActiveGameResponseSchema = z.object({
  data: z.object({ id: z.string() }).nullable(),
});

export type RemoteGameStatus = z.infer<typeof RemoteGameStatusSchema>;
