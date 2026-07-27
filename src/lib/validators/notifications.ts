import { z } from "zod";

export const ListNotificationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const NotificationBulkActionSchema = z.object({
  action: z.literal("mark-all-read", {
    error: "action must be 'mark-all-read'",
  }),
});

export const NotificationActionSchema = z.object({
  action: z.enum(["read", "dismiss", "accept", "decline"], {
    error: "action must be 'read', 'dismiss', 'accept', or 'decline'",
  }),
});
