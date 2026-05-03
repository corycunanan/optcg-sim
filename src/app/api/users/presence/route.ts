/**
 * GET /api/users/presence?ids=a,b,c — Initial presence snapshot for the
 * client `usePresenceMap` hook. Returns one entry per requested id (filtered
 * to only friends of the requester):
 *
 *   { [userId]: { online: boolean, lastSeen: string | null } }
 *
 * `online` aggregates `UserChannel.getConnectionCount` via the worker
 * `/user/:userId/health` route. `lastSeen` is a column on `User` that the
 * DO PATCHes from `/api/realtime/users/:userId/last-seen` after the 5s
 * offline debounce.
 *
 * Friend-only filter: any id the requester isn't friends with is dropped from
 * the response. Without this an authenticated user could probe arbitrary user
 * presence — out of scope for the privacy story today.
 */

import { NextRequest } from "next/server";
import { requireAuth, apiSuccess, apiError } from "@/lib/api-response";
import { prisma } from "@/lib/db";

const GAME_WORKER_URL = process.env.GAME_WORKER_URL ?? "";
const GAME_WORKER_SECRET = process.env.GAME_WORKER_SECRET ?? "";
const HEALTH_TIMEOUT_MS = 1_500;
const MAX_IDS = 200;

export interface PresenceEntry {
  online: boolean;
  lastSeen: string | null;
}

export type PresenceMap = Record<string, PresenceEntry>;

export async function GET(request: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof Response) return authResult;
  const { userId } = authResult;

  const idsParam = request.nextUrl.searchParams.getAll("ids");
  const ids = parseIds(idsParam);
  if (ids.length === 0) {
    return apiSuccess<PresenceMap>({});
  }
  if (ids.length > MAX_IDS) {
    return apiError(`Too many ids; max ${MAX_IDS}`, 400);
  }

  try {
    // Friendship gate — only return presence for users the caller is friends
    // with. Without this, presence is a leak of "is user X online right now".
    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [
          { userAId: userId, userBId: { in: ids } },
          { userBId: userId, userAId: { in: ids } },
        ],
      },
      select: { userAId: true, userBId: true },
    });
    const allowed = new Set(
      friendships.map((f) => (f.userAId === userId ? f.userBId : f.userAId)),
    );

    const visibleIds = ids.filter((id) => allowed.has(id));
    if (visibleIds.length === 0) {
      return apiSuccess<PresenceMap>({});
    }

    const users = await prisma.user.findMany({
      where: { id: { in: visibleIds } },
      select: { id: true, lastSeen: true },
    });
    const lastSeenById = new Map(users.map((u) => [u.id, u.lastSeen]));

    const onlineById = await aggregateOnline(visibleIds);

    const data: PresenceMap = {};
    for (const id of visibleIds) {
      const lastSeen = lastSeenById.get(id) ?? null;
      data[id] = {
        online: onlineById.get(id) ?? false,
        lastSeen: lastSeen ? lastSeen.toISOString() : null,
      };
    }

    return apiSuccess<PresenceMap>(data);
  } catch (error) {
    console.error("presence aggregator error:", error);
    return apiError("Failed to load presence", 500);
  }
}

function parseIds(raw: string[]): string[] {
  const out = new Set<string>();
  for (const value of raw) {
    for (const part of value.split(",")) {
      const trimmed = part.trim();
      if (trimmed) out.add(trimmed);
    }
  }
  return Array.from(out);
}

async function aggregateOnline(ids: string[]): Promise<Map<string, boolean>> {
  const result = new Map<string, boolean>();
  if (!GAME_WORKER_URL || !GAME_WORKER_SECRET) {
    // Misconfigured environment — degrade to all-offline rather than 500.
    for (const id of ids) result.set(id, false);
    return result;
  }

  const settled = await Promise.allSettled(
    ids.map((id) => fetchHealth(id)),
  );
  for (let i = 0; i < ids.length; i += 1) {
    const id = ids[i]!;
    const outcome = settled[i]!;
    result.set(id, outcome.status === "fulfilled" ? outcome.value : false);
  }
  return result;
}

async function fetchHealth(userId: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
  try {
    const res = await fetch(
      `${GAME_WORKER_URL}/user/${encodeURIComponent(userId)}/health`,
      {
        headers: { Authorization: `Bearer ${GAME_WORKER_SECRET}` },
        signal: controller.signal,
      },
    );
    if (!res.ok) return false;
    const body = (await res.json()) as { connections?: number };
    return typeof body.connections === "number" && body.connections > 0;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
