import { log } from "../lib/log.js";
import { validateRevokeSpectatorsPayload } from "../util/validate.js";
import type { SessionTransport } from "./transport.js";

export const SPECTATOR_REVOCATION_REVISION_KEY_PREFIX =
  "spectator:revocation-revision:";

export interface SpectatorRevocationStorage {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
}

export async function handleSpectatorRevocationRequest(
  request: Request,
  secret: string,
  storage: SpectatorRevocationStorage,
  transport: SessionTransport,
  syncAlarm: () => Promise<void>
): Promise<Response> {
  if (request.headers.get("Authorization") !== `Bearer ${secret}`) {
    log("auth.failure", { reason: "revoke_spectators_bad_secret" });
    return new Response("Unauthorized", { status: 401 });
  }
  let payload: { lobbyId: string; revision: number; userIds: string[] };
  try {
    payload = validateRevokeSpectatorsPayload(await request.json());
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  const revisionKey = `${SPECTATOR_REVOCATION_REVISION_KEY_PREFIX}${payload.lobbyId}`;
  const highestApplied = await storage.get<number>(revisionKey);
  if (highestApplied !== undefined && payload.revision <= highestApplied) {
    return new Response("Stale revocation", { status: 409 });
  }
  await storage.put(revisionKey, payload.revision);
  const closed = transport.revokeSpectators(payload.userIds);
  await syncAlarm();
  return new Response(JSON.stringify({ ok: true, closed }), {
    headers: { "Content-Type": "application/json" },
  });
}
