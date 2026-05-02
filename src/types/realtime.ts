/**
 * UserChannel server → client event vocabulary.
 *
 * Discriminated union extended one variant at a time as polling loops are
 * replaced with push events (OPT-354 onward). Empty in OPT-353 — the
 * foundation ticket lands the transport, types, and dispatch wiring without
 * sending any events yet.
 *
 * Adding an event:
 *   1. Add a new member: `{ type: "feature:event_name"; ...payload }`
 *   2. Send from a server route via `notifyUser(targetUserId, event)`.
 *   3. Subscribe on the client via `useUserChannelEvents().subscribe("feature:event_name", handler)`.
 *
 * The discriminator is always `type`. Keep names `<feature>:<verb>`.
 */
export type RealtimeServerEvent = never;

export { type ConnectionStatus } from "@/hooks/use-authed-websocket";
