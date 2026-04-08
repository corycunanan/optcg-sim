/**
 * GET /api/messages/conversations
 * Returns the user's conversations: one entry per other user they've messaged,
 * with the last message and unread count.
 */

import { requireAuth, apiSuccess, apiError } from "@/lib/api-response";
import { prisma } from "@/lib/db";

export async function GET() {
  const authResult = await requireAuth();
  if (authResult instanceof Response) return authResult;
  const { userId } = authResult;

  try {
    // Fetch only the latest message per conversation partner using a
    // DISTINCT ON subquery, avoiding unbounded full-table scan (OPT-128).
    const rows = await prisma.$queryRaw<
      {
        id: string;
        body: string;
        createdAt: Date;
        fromUserId: string;
        toUserId: string;
        otherId: string;
        otherUsername: string | null;
        otherName: string | null;
        otherImage: string | null;
        unreadCount: bigint;
      }[]
    >`
      SELECT
        m.id,
        m.body,
        m."createdAt",
        m."fromUserId",
        m."toUserId",
        m.other_id AS "otherId",
        u.username AS "otherUsername",
        u.name     AS "otherName",
        u.image    AS "otherImage",
        COALESCE(unread.cnt, 0) AS "unreadCount"
      FROM (
        SELECT DISTINCT ON (
          CASE WHEN "fromUserId" = ${userId} THEN "toUserId" ELSE "fromUserId" END
        )
          *,
          CASE WHEN "fromUserId" = ${userId} THEN "toUserId" ELSE "fromUserId" END AS other_id
        FROM messages
        WHERE "fromUserId" = ${userId} OR "toUserId" = ${userId}
        ORDER BY
          CASE WHEN "fromUserId" = ${userId} THEN "toUserId" ELSE "fromUserId" END,
          "createdAt" DESC
      ) m
      JOIN users u ON u.id = m.other_id
      LEFT JOIN (
        SELECT "fromUserId", COUNT(*)::bigint AS cnt
        FROM messages
        WHERE "toUserId" = ${userId} AND read = false
        GROUP BY "fromUserId"
      ) unread ON unread."fromUserId" = m.other_id
      ORDER BY m."createdAt" DESC
    `;

    const conversations = rows.map((row) => ({
      user: {
        id: row.otherId,
        username: row.otherUsername,
        name: row.otherName,
        image: row.otherImage,
      },
      lastMessage: {
        body: row.body,
        createdAt: row.createdAt,
        fromUserId: row.fromUserId,
      },
      unreadCount: Number(row.unreadCount),
    }));

    return apiSuccess(conversations);
  } catch (error) {
    console.error("Conversations list error:", error);
    return apiError("Failed to list conversations", 500);
  }
}
