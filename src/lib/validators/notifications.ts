import { z } from "zod";
import { SerializedNotificationSchema } from "@/lib/validators/realtime";

export const NotificationsResponseSchema = z.object({
  data: z.object({
    notifications: z.array(SerializedNotificationSchema),
    unreadCount: z.number().int().nonnegative(),
    pagination: z.object({
      total: z.number().int().nonnegative(),
      page: z.number().int().positive(),
      limit: z.number().int().positive(),
      totalPages: z.number().int().nonnegative(),
    }),
  }),
});

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
