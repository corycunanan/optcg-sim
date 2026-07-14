-- A directional unique key allows concurrent reciprocal requests (A -> B and
-- B -> A). Retain the earliest pending row for each unordered pair before
-- adding the partial expression index that makes the invariant durable.
WITH ranked_pending_requests AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY LEAST("fromUserId", "toUserId"), GREATEST("fromUserId", "toUserId")
      ORDER BY "createdAt" ASC, "id" ASC
    ) AS row_number
  FROM "friend_requests"
  WHERE "status" = 'PENDING'
)
DELETE FROM "friend_requests" AS request
USING ranked_pending_requests AS ranked
WHERE request."id" = ranked."id"
  AND ranked.row_number > 1;

CREATE UNIQUE INDEX "friend_requests_unordered_pending_unique"
  ON "friend_requests" (
    LEAST("fromUserId", "toUserId"),
    GREATEST("fromUserId", "toUserId")
  )
  WHERE "status" = 'PENDING';
