import { z } from "zod";

export const CreateLobbySchema = z.object({
  deckId: z.string().min(1, "deckId is required"),
  format: z.string().optional(),
});

export const JoinLobbySchema = z.object({
  code: z.string().min(1, "code is required"),
  deckId: z.string().min(1, "deckId is required").optional(),
});

export const UpdateLobbyDeckSchema = z.object({
  deckId: z.string().min(1, "deckId is required"),
});
