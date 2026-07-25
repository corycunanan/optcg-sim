import { z } from "zod";

export const LobbyModeSchema = z.enum(["PVP", "SOLITAIRE", "PVCOMPUTER"]);
export const PregameModeSchema = z.enum([
  "PRIORITY_ROLL",
  "HOST_FIRST",
  "GUEST_FIRST",
  "RANDOM_FIXED",
  "SIDE_A_FIRST",
  "SIDE_B_FIRST",
  "SOLITAIRE_RANDOM",
]);
export const LobbyStatusSchema = z.enum([
  "WAITING",
  "READY",
  "IN_GAME",
  "CLOSED",
  "EVICTED",
]);

const LobbyUserSchema = z.object({
  id: z.string(),
  username: z.string().nullable(),
  name: z.string().nullable(),
  image: z.string().nullable(),
});

const LobbyDeckCardSchema = z.object({
  id: z.string(),
  name: z.string(),
  quantity: z.number().int().positive(),
  imageUrl: z.string(),
});

const LobbyDeckContentsSchema = z.object({
  characters: z.array(LobbyDeckCardSchema),
  events: z.array(LobbyDeckCardSchema),
  stages: z.array(LobbyDeckCardSchema),
});

const LobbyDeckSchema = z.object({
  id: z.string(),
  name: z.string(),
  leaderId: z.string(),
  leaderName: z.string().nullable(),
  leaderImageUrl: z.string().nullable(),
  contents: LobbyDeckContentsSchema.optional(),
});

export const LobbyRoomStateSchema = z.object({
  id: z.string(),
  version: z.number().int().nonnegative().optional(),
  status: LobbyStatusSchema,
  joinCode: z.string(),
  format: z.string(),
  mode: LobbyModeSchema,
  pregameMode: PregameModeSchema.default("PRIORITY_ROLL"),
  hostReady: z.boolean(),
  hostUserId: z.string(),
  host: LobbyUserSchema.omit({ id: true }).nullable(),
  hostDeck: LobbyDeckSchema.nullable(),
  allowSpectators: z.boolean(),
  spectators: z.array(LobbyUserSchema),
  spectatorCount: z.number().int().nonnegative(),
  viewerRole: z.enum(["host", "guest", "spectator"]).nullable(),
  guest: z
    .object({
      guestReady: z.boolean(),
      user: LobbyUserSchema,
      deck: LobbyDeckSchema.nullable(),
    })
    .nullable(),
  pendingInvite: z
    .object({
      id: z.string(),
      expiresAt: z.string(),
      user: LobbyUserSchema,
    })
    .nullable()
    .optional(),
  gameId: z.string().nullable(),
  gameStatus: z.enum(["IN_PROGRESS", "FINISHED", "ABANDONED"]).optional(),
});

export const LobbyRoomResponseSchema = z.object({ data: LobbyRoomStateSchema });
export const StartLobbyResponseSchema = z.object({
  data: z.object({ gameId: z.string() }),
});
export const CreateLobbyResponseSchema = z.object({
  data: z.object({ lobbyId: z.string(), joinCode: z.string() }),
});
export const JoinLobbyResponseSchema = z.object({
  data: z.object({ lobbyId: z.string() }),
});
export const LobbyActionResponseSchema = z.object({
  success: z.literal(true),
});

export const CreateLobbySchema = z.object({
  deckId: z.string().min(1, "deckId is required").optional(),
  format: z.string().optional(),
});

export const JoinLobbySchema = z.object({
  code: z.string().min(1, "code is required"),
  deckId: z.string().min(1, "deckId is required").optional(),
  confirmDisbandLobbyId: z.string().min(1).optional(),
});

export const UpdateLobbyDeckSchema = z.object({
  deckId: z.string().min(1, "deckId is required"),
});

export const PatchLobbySchema = z
  .object({
    mode: LobbyModeSchema.optional(),
    pregameMode: PregameModeSchema.optional(),
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
    allowSpectators: z.boolean().optional(),
    ready: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  });
