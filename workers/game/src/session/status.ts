import type { GameState } from "../types.js";
import { log } from "../lib/log.js";

export async function handleGameStatusRequest(
  request: Request,
  workerSecret: string,
  readState: () => Promise<GameState | null>
): Promise<Response> {
  const auth = request.headers.get("Authorization");
  if (auth !== `Bearer ${workerSecret}`) {
    log("auth.failure", { reason: "status_bad_secret" });
    return new Response("Unauthorized", { status: 401 });
  }

  const state = await readState();
  if (!state) {
    return Response.json({ status: "ABSENT" }, { status: 404 });
  }

  return Response.json({
    status: state.status,
    winnerId:
      state.winner === null ? null : state.players[state.winner].playerId,
    winReason: state.winReason,
  });
}
