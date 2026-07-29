import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../../prisma/migrations/20260728233000_backfill_pending_friend_request_notifications/migration.sql",
    import.meta.url
  ),
  "utf8"
).replace(/\s+/g, " ");

describe("pending friend-request notification backfill migration", () => {
  it("selects only pending requests and preserves notification ownership and ordering", () => {
    expect(migration).toContain(
      `SELECT gen_random_uuid()::text, request."toUserId", 'FRIEND_REQUEST'::"NotificationType", 'PENDING'::"NotificationStatus", request."fromUserId", request."id", NULL, request."createdAt", request."updatedAt" FROM "friend_requests" AS request WHERE request."status" = 'PENDING'::"FriendRequestStatus"`
    );
  });

  it("is idempotent for requests that already have a notification", () => {
    expect(migration).toContain(
      `ON CONFLICT ("type", "reference_id") DO NOTHING`
    );
  });
});
