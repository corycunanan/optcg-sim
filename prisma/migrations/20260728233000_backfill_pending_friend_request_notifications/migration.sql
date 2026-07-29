-- Backfill friend requests created before durable notifications shipped.
-- The conflict target makes this safe to re-run when a notification already
-- exists for a request.
INSERT INTO "notifications" (
    "id",
    "user_id",
    "type",
    "status",
    "actor_user_id",
    "reference_id",
    "payload",
    "created_at",
    "updated_at"
)
SELECT
    gen_random_uuid()::text,
    request."toUserId",
    'FRIEND_REQUEST'::"NotificationType",
    'PENDING'::"NotificationStatus",
    request."fromUserId",
    request."id",
    NULL,
    request."createdAt",
    request."updatedAt"
FROM "friend_requests" AS request
WHERE request."status" = 'PENDING'::"FriendRequestStatus"
ON CONFLICT ("type", "reference_id") DO NOTHING;
