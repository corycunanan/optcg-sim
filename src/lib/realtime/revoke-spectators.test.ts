import { describe, expect, it, vi } from "vitest";
import { revokeSpectatorSocketsForLobby } from "./revoke-spectators";

describe("revokeSpectatorSocketsForLobby", () => {
  it("resolves the game and pushes one deduplicated bearer-authenticated close", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, closed: 2 }), { status: 200 })
    );
    const findGameId = vi.fn().mockResolvedValue("game/1");

    await revokeSpectatorSocketsForLobby(
      "lobby-1",
      ["spectator-a", "spectator-b", "spectator-a"],
      {
        workerUrl: "https://worker.example",
        workerSecret: "worker-secret",
        fetch: fetchMock,
        findGameId,
      }
    );

    expect(findGameId).toHaveBeenCalledWith("lobby-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://worker.example/game/game%2F1/revoke-spectators"
    );
    expect(new Headers(init.headers).get("Authorization")).toBe(
      "Bearer worker-secret"
    );
    expect(JSON.parse(init.body)).toEqual({
      userIds: ["spectator-a", "spectator-b"],
    });
  });

  it("does not resolve lobby membership when worker auth is unconfigured", async () => {
    const findGameId = vi.fn();
    const logger = vi.fn();
    await revokeSpectatorSocketsForLobby("lobby-1", ["spectator-a"], {
      findGameId,
      logger,
      workerUrl: "",
      workerSecret: "",
    });
    expect(findGameId).not.toHaveBeenCalled();
    expect(logger).toHaveBeenCalledWith(
      "spectator revocation misconfigured",
      expect.objectContaining({ reason: "missing_worker_url_or_secret" })
    );
  });

  it("does not contact a Durable Object when the lobby has no game", async () => {
    const fetchMock = vi.fn();
    await revokeSpectatorSocketsForLobby("lobby-1", ["spectator-a"], {
      workerUrl: "https://worker.example",
      workerSecret: "worker-secret",
      fetch: fetchMock,
      findGameId: async () => null,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
