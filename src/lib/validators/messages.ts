import { z } from "zod";

export const SendMessageSchema = z.object({
  body: z
    .string()
    .min(1, "Message body is required")
    .max(2000, "Message body must be 2000 characters or fewer")
    .transform((s) => s.trim())
    .pipe(z.string().min(1, "Message body is required")),
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
      "throughCreatedAt must be a valid ISO date",
    ),
});
