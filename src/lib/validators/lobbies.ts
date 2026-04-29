import { z } from "zod";

const LobbyModeSchema = z.enum(["PVP", "SOLITAIRE", "PVCOMPUTER"]);

export const CreateLobbySchema = z.object({
  deckId: z.string().min(1, "deckId is required").optional(),
  format: z.string().optional(),
});

export const JoinLobbySchema = z.object({
  code: z.string().min(1, "code is required"),
  deckId: z.string().min(1, "deckId is required").optional(),
});

export const UpdateLobbyDeckSchema = z.object({
  deckId: z.string().min(1, "deckId is required"),
});

export const PatchLobbySchema = z
  .object({
    mode: LobbyModeSchema.optional(),
    format: z.string().min(1, "format is required").optional(),
    hostDeckId: z
      .string()
      .min(1, "hostDeckId is required")
      .nullable()
      .optional(),
    guestDeckId: z
      .string()
      .min(1, "guestDeckId is required")
      .nullable()
      .optional(),
    ready: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  });
