import { z } from "zod";

export const CreateLobbySchema = z.object({
  deckId: z.string().min(1, "deckId is required"),
  format: z.string().optional(),
});

export type CreateLobbyInput = z.infer<typeof CreateLobbySchema>;

export const JoinLobbySchema = z.object({
  code: z.string().min(1, "code is required"),
  deckId: z.string().min(1, "deckId is required"),
});

export type JoinLobbyInput = z.infer<typeof JoinLobbySchema>;

export const UpdateLobbyDeckSchema = z.object({
  deckId: z.string().min(1, "deckId is required"),
});

export type UpdateLobbyDeckInput = z.infer<typeof UpdateLobbyDeckSchema>;
