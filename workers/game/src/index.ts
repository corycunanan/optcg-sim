/**
 * Cloudflare Worker entry point — Game Server
 *
 * Routes:
 *   POST /game/:gameId/init  — Initialize a new game session (called by Next.js)
 *   GET  /game/:gameId/ws    — WebSocket upgrade (called directly by browser clients)
 */

export { GameSession } from "./GameSession.js";

interface Env {
  GAME_SESSION: DurableObjectNamespace;
  NEXTJS_URL: string;
  GAME_WORKER_SECRET: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": env.NEXTJS_URL,
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization, Upgrade",
        },
      });
    }

    // Route: /game/:gameId/init | ws | cards | notify-end
    const match = url.pathname.match(/^\/game\/([^/]+)\/(init|ws|cards|notify-end)$/);
    if (!match) {
      return new Response("Not found", { status: 404 });
    }

    const [, gameId, route] = match;

    // Auth check for /init and /notify-end (must come from Next.js with the shared secret)
    if (route === "init" || route === "notify-end") {
      if (request.method !== "POST") {
        return new Response("Method not allowed", { status: 405 });
      }
      const auth = request.headers.get("Authorization");
      if (auth !== `Bearer ${env.GAME_WORKER_SECRET}`) {
        return new Response("Unauthorized", { status: 401 });
      }
    }

    // Route to the Durable Object for this game
    const id = env.GAME_SESSION.idFromName(gameId);
    const stub = env.GAME_SESSION.get(id);
    return stub.fetch(request);
  },
};
