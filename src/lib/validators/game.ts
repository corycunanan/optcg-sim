import { z } from "zod";

export const GameResultSchema = z.object({
  gameId: z.string().min(1, "gameId is required"),
  status: z.enum(["IN_PROGRESS", "FINISHED", "ABANDONED"]),
  winnerId: z.string().nullable(),
  winReason: z.string().nullable(),
});

export type GameResultInput = z.infer<typeof GameResultSchema>;

export const GameActionSchema = z.object({
  action: z.enum(["FINALIZE", "CONCEDE"], {
    error: "Unsupported action",
  }),
  winnerId: z.string().nullable().optional(),
  winReason: z.string().nullable().optional(),
});

export type GameActionInput = z.infer<typeof GameActionSchema>;
