import { z } from "zod";
import type {
  GameAction,
  GameState,
  PromptOptions,
  ServerMessage,
} from "@shared/game-types";
import { LobbyRoomStateSchema } from "@/lib/validators/lobbies";

const SerializedUserSchema = z.object({
  id: z.string(),
  username: z.string().nullable(),
  name: z.string().nullable(),
  image: z.string().nullable(),
});

export const SerializedNotificationSchema = z.object({
  id: z.string(),
  userId: z.string(),
  type: z.literal("FRIEND_REQUEST"),
  status: z.enum(["PENDING", "ACCEPTED", "DECLINED", "READ", "DISMISSED"]),
  actorUserId: z.string().nullable(),
  referenceId: z.string().nullable(),
  payload: z.json(),
  createdAt: z.string(),
  updatedAt: z.string(),
  actor: SerializedUserSchema.nullable(),
});

export const SerializedMessageSchema = z.object({
  id: z.string(),
  fromUserId: z.string(),
  toUserId: z.string(),
  body: z.string(),
  createdAt: z.string(),
  readAt: z.string().nullable(),
  fromUser: SerializedUserSchema,
});

const SerializedFriendRequestSchema = z.object({
  id: z.string(),
  fromUserId: z.string(),
  toUserId: z.string(),
  createdAt: z.string(),
  fromUser: SerializedUserSchema,
});

const SerializedFriendshipSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  user: SerializedUserSchema,
});

export const SerializedLobbyInviteSchema = z.object({
  id: z.string(),
  lobbyId: z.string(),
  fromUserId: z.string(),
  toUserId: z.string(),
  expiresAt: z.string(),
  createdAt: z.string(),
  fromUser: SerializedUserSchema,
  lobby: z.object({
    format: z.string(),
    mode: z.enum(["PVP", "SOLITAIRE", "PVCOMPUTER"]),
    hostUsername: z.string().nullable(),
    joinCode: z.string(),
  }),
});

export const PendingLobbyInvitesResponseSchema = z.object({
  data: z.array(SerializedLobbyInviteSchema),
});

export const RealtimeServerEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("message:new"),
    message: SerializedMessageSchema,
  }),
  z.object({
    type: z.literal("notification:created"),
    notification: SerializedNotificationSchema,
    unreadCount: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal("notification:resolved"),
    notification: SerializedNotificationSchema,
    unreadCount: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal("friend:request_received"),
    request: SerializedFriendRequestSchema,
  }),
  z.object({
    type: z.literal("friend:request_accepted"),
    request: SerializedFriendRequestSchema,
    friendship: SerializedFriendshipSchema,
  }),
  z.object({
    type: z.literal("friend:request_declined"),
    requestId: z.string(),
    toUserId: z.string(),
  }),
  z.object({ type: z.literal("friend:removed"), userId: z.string() }),
  z.object({
    type: z.literal("lobby:state_changed"),
    lobby: LobbyRoomStateSchema,
  }),
  z.object({
    type: z.literal("lobby:spectator_removed"),
    lobbyId: z.string(),
    reason: z.enum(["SPECTATING_DISABLED", "REMOVED_BY_HOST", "LOBBY_CLOSED"]),
  }),
  z.object({
    type: z.literal("lobby:guest_removed"),
    lobbyId: z.string(),
    hostName: z.string(),
  }),
  z.object({
    type: z.literal("game:status"),
    gameId: z.string(),
    status: z.enum(["IN_PROGRESS", "FINISHED", "ABANDONED"]),
    winnerId: z.string().nullable(),
    winReason: z.string().nullable(),
  }),
  z.object({ type: z.literal("presence:friend_online"), userId: z.string() }),
  z.object({
    type: z.literal("presence:friend_offline"),
    userId: z.string(),
    lastSeen: z.string(),
  }),
  z.object({
    type: z.literal("chat:typing_received"),
    fromUserId: z.string(),
    until: z.number(),
  }),
  z.object({
    type: z.literal("chat:read_to"),
    fromUserId: z.string(),
    throughCreatedAt: z.string(),
  }),
  z.object({
    type: z.literal("lobby:invite_received"),
    invite: SerializedLobbyInviteSchema,
  }),
  z.object({ type: z.literal("lobby:invite_declined"), inviteId: z.string() }),
  z.object({ type: z.literal("lobby:invite_canceled"), inviteId: z.string() }),
  z.object({
    type: z.literal("lobby:party_disbanded"),
    lobbyId: z.string(),
    hostName: z.string(),
  }),
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// The shared game protocol does not yet export runtime schemas. These guards
// validate the fields consumed by this client; exhaustive shared schemas are
// tracked as a follow-up so the worker and app cannot drift independently.
const GameStateSchema = z.custom<GameState>(
  (value) =>
    isRecord(value) &&
    typeof value.status === "string" &&
    Array.isArray(value.players)
);
const GameActionSchema = z.custom<GameAction>(
  (value) => isRecord(value) && typeof value.type === "string"
);
const PromptOptionsSchema = z.custom<PromptOptions>(isRecord);
const SpectatorDisplayIdentitySchema = z.object({
  id: z.string(),
  displayName: z.string(),
});

export const GameServerMessageSchema: z.ZodType<ServerMessage> =
  z.discriminatedUnion("type", [
    z.object({
      type: z.literal("game:state"),
      state: GameStateSchema,
      canUndo: z.boolean().optional(),
    }),
    z.object({
      type: z.literal("game:update"),
      state: GameStateSchema,
      action: GameActionSchema.optional(),
      canUndo: z.boolean().optional(),
    }),
    z.object({
      type: z.literal("game:undo"),
      playerIndex: z.union([z.literal(0), z.literal(1)]),
      canUndo: z.boolean(),
    }),
    z.object({
      type: z.literal("game:prompt"),
      options: PromptOptionsSchema,
      promptId: z.string().optional(),
    }),
    z.object({ type: z.literal("game:error"), message: z.string() }),
    z.object({
      type: z.literal("action:rejected"),
      action: GameActionSchema,
      reason: z.string(),
    }),
    z.object({
      type: z.literal("game:over"),
      winner: z.union([z.literal(0), z.literal(1)]).nullable(),
      reason: z.string(),
    }),
    z.object({
      type: z.literal("game:player_disconnected"),
      playerIndex: z.union([z.literal(0), z.literal(1)]),
    }),
    z.object({
      type: z.literal("game:player_reconnected"),
      playerIndex: z.union([z.literal(0), z.literal(1)]),
    }),
    z.object({
      type: z.literal("game:spectator_joined"),
      spectator: SpectatorDisplayIdentitySchema,
    }),
    z.object({
      type: z.literal("game:spectator_left"),
      spectator: SpectatorDisplayIdentitySchema,
      cause: z.enum(["DEPARTED", "EJECTED"]),
    }),
  ]);
