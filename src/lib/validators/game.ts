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
