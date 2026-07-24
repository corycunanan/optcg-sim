/**
 * Cloudflare Worker entry point — Game + User-channel server
 *
 * Routes:
 *   POST /game/:gameId/init        — Initialize a new game session (called by Next.js)
 *   GET  /game/:gameId/ws          — WebSocket upgrade (called directly by browser clients)
 *   GET  /game/:gameId/cards       — Card DB fetch
 *   POST /game/:gameId/notify-end  — Server-to-server result fallback
 *   GET  /game/:gameId/status      — Server-to-server lifecycle probe
 *
 *   GET  /user/:userId/ws          — User-channel WebSocket upgrade (token in ?token=)
 *   POST /user/:userId/notify      — Server-to-server fanout from Next.js
 *   GET  /user/:userId/health      — Internal connection-count probe
 */

export { GameSession } from "./GameSession.js";
export { UserChannel } from "./UserChannel.js";
import type { Env } from "./types.js";

const GAME_ROUTE_PATTERN =
  /^\/game\/([^/]+)\/(init|ws|cards|notify-end|status)$/;
const USER_ROUTE_PATTERN = /^\/user\/([^/]+)\/(ws|notify|health)$/;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": env.NEXTJS_URL,
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers":
            "Content-Type, Authorization, Upgrade",
        },
      });
    }

    const gameMatch = url.pathname.match(GAME_ROUTE_PATTERN);
    if (gameMatch) {
      if (!env.GAME_WORKER_SECRET) {
        return new Response("Server misconfigured", { status: 500 });
      }
      const [, gameId, route] = gameMatch;

      // Bearer-secret auth for server-to-server routes.
      if (route === "init" || route === "notify-end" || route === "status") {
        const expectedMethod = route === "status" ? "GET" : "POST";
        if (request.method !== expectedMethod) {
          return new Response("Method not allowed", { status: 405 });
        }
        const auth = request.headers.get("Authorization");
        if (auth !== `Bearer ${env.GAME_WORKER_SECRET}`) {
          return new Response("Unauthorized", { status: 401 });
        }
      }

      const id = env.GAME_SESSION.idFromName(gameId);
      const stub = env.GAME_SESSION.get(id);
      return stub.fetch(request);
    }

    const userMatch = url.pathname.match(USER_ROUTE_PATTERN);
    if (userMatch) {
      if (!env.GAME_WORKER_SECRET) {
        return new Response("Server misconfigured", { status: 500 });
      }
      const [, userId, route] = userMatch;

      // Bearer-secret auth for server-to-server routes.
      // The WS upgrade authenticates per-token inside the DO.
      if (route === "notify" || route === "health") {
        const auth = request.headers.get("Authorization");
        if (auth !== `Bearer ${env.GAME_WORKER_SECRET}`) {
          return new Response("Unauthorized", { status: 401 });
        }
      }

      const id = env.USER_CHANNEL.idFromName(userId);
      const stub = env.USER_CHANNEL.get(id);
      return stub.fetch(request);
    }

    return new Response("Not found", { status: 404 });
  },
};
