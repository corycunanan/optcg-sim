import { z } from "zod";

// OPT-197 — `messageId` query param for `PUT /api/messages/read`. Prisma
// generates Message ids via `@default(uuid())`, so anything else is a bad
// request and should fail before we hit the DB.
export const MessageIdSchema = z.object({
  messageId: z.string().uuid(),
});

export const SendMessageSchema = z.object({
  idempotencyKey: z.string().uuid("idempotencyKey must be a valid UUID"),
  body: z
    .string()
    .min(1, "Message body is required")
    .max(2000, "Message body must be 2000 characters or fewer")
    .transform((s) => s.trim())
    .pipe(z.string().min(1, "Message body is required")),
});

const MessageCursorTimestampSchema = z.iso.datetime({ offset: true });

/**
 * OPT-489 — query parameters for message polling and history pagination.
 * `afterId` is the tie-breaker for an `after` timestamp, so it is invalid on
 * its own. An `after` timestamp without an id remains supported for clients
 * starting a fresh polling window.
 */
export const MessageHistoryQuerySchema = z
  .object({
    cursor: MessageCursorTimestampSchema.optional(),
    after: MessageCursorTimestampSchema.optional(),
    afterId: z.string().min(1).optional(),
  })
  .refine(({ after, afterId }) => !afterId || Boolean(after), {
    message: "afterId requires after",
    path: ["afterId"],
  });

/**
 * OPT-359 — body for `POST /api/messages/[userId]/read`. The cutoff is the
 * `createdAt` of the latest message the recipient has visible; the route
 * marks every message from the conversation partner created at-or-before
 * that timestamp as read.
 */
export const MarkMessagesReadSchema = z.object({
  throughCreatedAt: z
    .string()
    .min(1, "throughCreatedAt is required")
    .refine(
      (s) => !Number.isNaN(new Date(s).getTime()),
      "throughCreatedAt must be a valid ISO date"
    ),
});

export const ChatMessageSchema = z.object({
  id: z.string(),
  body: z.string(),
  createdAt: z.string(),
  fromUserId: z.string(),
  readAt: z.string().nullable(),
});

export const MessageHistoryResponseSchema = z.object({
  data: z.array(ChatMessageSchema),
  more: z.boolean().optional(),
});

export const SendMessageResponseSchema = z.object({ data: ChatMessageSchema });
