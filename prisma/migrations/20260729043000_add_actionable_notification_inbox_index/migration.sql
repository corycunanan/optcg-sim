-- Serve the actionable branch of the notification inbox query in recency order
-- without sorting or scanning resolved history.
CREATE INDEX IF NOT EXISTS "notifications_actionable_inbox_idx"
ON "notifications" ("user_id", "created_at" DESC, "id" DESC)
WHERE "type" = 'FRIEND_REQUEST'::"NotificationType"
  AND "status" IN (
    'PENDING'::"NotificationStatus",
    'READ'::"NotificationStatus"
  )
  AND "reference_id" IS NOT NULL;
