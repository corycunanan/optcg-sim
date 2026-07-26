import { log } from "../lib/log.js";
import { validateRevokeSpectatorsPayload } from "../util/validate.js";
import type { SessionTransport } from "./transport.js";

export async function handleSpectatorRevocationRequest(
  request: Request,
  secret: string,
  transport: SessionTransport,
  syncAlarm: () => Promise<void>
): Promise<Response> {
  if (request.headers.get("Authorization") !== `Bearer ${secret}`) {
    log("auth.failure", { reason: "revoke_spectators_bad_secret" });
    return new Response("Unauthorized", { status: 401 });
  }
  let userIds: string[];
  try {
    ({ userIds } = validateRevokeSpectatorsPayload(await request.json()));
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  const closed = transport.revokeSpectators(userIds);
  await syncAlarm();
  return new Response(JSON.stringify({ ok: true, closed }), {
    headers: { "Content-Type": "application/json" },
  });
}
