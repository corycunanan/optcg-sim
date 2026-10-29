import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import worker from "../index.js";
import { GameSession } from "../GameSession.js";
import type { Env } from "../types.js";
import { convertPersistedGameState } from "../session/persistence.js";
import { setupGame } from "./factories.js";
import { toPersistedGameState } from "../session/game-state-schema.js";
import { loadGoldenFixture } from "./fixtures/opt-940-golden.js";

const SECRET = "export-test-secret";
const NOW = 1_800_000_000;
const PATH = "/game/private-game-id/export";
function request(
  options: {
    path?: string;
    method?: string;
    expiry?: number;
    secret?: string;
    authorization?: string;
  } = {}
) {
  const path = options.path ?? PATH;
  const expiry = options.expiry ?? NOW + 60;
  const mac = createHmac("sha256", options.secret ?? SECRET)
    .update(`optcg-session-export-v1\nGET\n${path}\n${expiry}`)
    .digest("hex");
  return new Request(`https://worker.example${path}`, {
    method: options.method ?? "GET",
    headers: {
      Authorization: options.authorization ?? `SessionExport ${expiry}:${mac}`,
    },
  });
}

function fixture(name = "battle-ready-with-undo") {
  const golden = loadGoldenFixture().cases[name];
  const session = JSON.parse(golden.sessionJson);
  const undo = JSON.parse(golden.undoHistoryJson);
  for (const state of [session.state, ...undo]) {
    state.id = "private-game-id";
    if (state.executionContext) {
      state.executionContext.trace.gameId = "private-game-id";
      state.executionContext.seed = "independent-seed";
    }
    state.players[0].playerId = "private-player-a";
    state.players[1].playerId = "private-player-b";
    state.players[0].sleeveUrl = "https://private.example/sleeve";
    state.players[1].donArtUrl = "https://private.example/don";
  }
  return { session, undo };
}

function host(values: Record<string, unknown>) {
  const data = new Map(Object.entries(structuredClone(values)));
  const get = vi.fn(async (keys: string | string[]) => {
    if (Array.isArray(keys))
      return new Map(
        keys
          .filter((k) => data.has(k))
          .map((k) => [k, structuredClone(data.get(k))])
      );
    return structuredClone(data.get(keys));
  });
  const put = vi.fn();
  const transaction = vi.fn(async (run: (tx: unknown) => Promise<unknown>) =>
    run({ get, put })
  );
  const storage = {
    get,
    put,
    transaction,
    delete: vi.fn(),
    setAlarm: vi.fn(),
    deleteAlarm: vi.fn(),
  };
  const durable = { storage, getWebSockets: () => [], getTags: () => [] };
  const session = new GameSession(
    durable as unknown as DurableObjectState,
    {
      GAME_WORKER_SECRET: SECRET,
      NEXTJS_URL: "https://app.example",
    } as Env
  );
  const stubFetch = vi.fn((req: Request) => session.fetch(req));
  const idFromName = vi.fn(() => "durable-id");
  const env = {
    GAME_WORKER_SECRET: SECRET,
    NEXTJS_URL: "https://app.example",
    GAME_SESSION: { idFromName, get: () => ({ fetch: stubFetch }) },
  } as unknown as Env;
  return { data, storage, session, stubFetch, idFromName, env };
}

async function atTime<T>(run: () => Promise<T>) {
  const clock = vi.spyOn(Date, "now").mockReturnValue(NOW * 1000);
  try {
    return await run();
  } finally {
    clock.mockRestore();
  }
}

function expectPrivate(response: Response) {
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("access-control-allow-origin")).toBeNull();
}

describe("OPT-971 public sanitized persisted-session export", () => {
  it("reads one consistent raw live+undo snapshot without loading, migration, writes, card DB or token access", async () =>
    atTime(async () => {
      const f = fixture();
      const h = host({
        session: f.session,
        "session:undo-history": f.undo,
        "session:card-db": { private: "card-db-marker" },
        consumedTokenJtis: { "ledger-marker": NOW },
      });
      const before = structuredClone(h.data);
      const memory = {
        ...f.session.state,
        turn: { ...f.session.state.turn, number: 999 },
      };
      (h.session as unknown as { gameState: unknown }).gameState = memory;
      const load = vi.spyOn(h.session as never, "loadFromStorage" as never);
      const response = await worker.fetch(request(), h.env);
      expect(response.status).toBe(200);
      expectPrivate(response);
      const body = (await response.json()) as {
        state: Record<string, unknown>;
        undoHistory: Record<string, unknown>[];
        provenance: Record<string, unknown>;
      };
      expect(body.provenance).toMatchObject({
        source: "durable-object-storage",
        sanitizationVersion: 1,
        undoSource: "separate",
      });
      expect(body.state.id).toBe("captured-game-0");
      expect(body.state.schemaVersion).toBe(f.session.state.schemaVersion);
      expect(body.undoHistory).toHaveLength(f.undo.length);
      expect(convertPersistedGameState(body.state, "state")).toBeDefined();
      for (const [i, undo] of body.undoHistory.entries())
        expect(
          convertPersistedGameState(undo, `undoHistory[${i}]`)
        ).toBeDefined();
      expect(h.storage.transaction).toHaveBeenCalledOnce();
      expect(h.storage.get).toHaveBeenCalledExactlyOnceWith([
        "session",
        "session:undo-history",
      ]);
      expect(load).not.toHaveBeenCalled();
      expect(h.storage.put).not.toHaveBeenCalled();
      expect(h.storage.delete).not.toHaveBeenCalled();
      expect(h.storage.setAlarm).not.toHaveBeenCalled();
      expect(h.storage.deleteAlarm).not.toHaveBeenCalled();
      expect(h.data).toEqual(before);
      expect(body.state.turn).toEqual(f.session.state.turn);
      expect((h.session as unknown as { gameState: unknown }).gameState).toBe(
        memory
      );
      expect(h.idFromName).toHaveBeenCalledWith("private-game-id");
      const serialized = JSON.stringify(body);
      for (const secret of [
        "private-game-id",
        "private-player-a",
        "private-player-b",
        "private.example",
        "card-db-marker",
        "ledger-marker",
      ])
        expect(serialized).not.toContain(secret);
    }));

  it.each([
    ["wrong secret", { secret: "wrong" }, 401],
    ["bearer", { authorization: `Bearer ${SECRET}` }, 401],
    ["empty authorization", { authorization: "" }, 401],
    ["expired", { expiry: NOW }, 401],
    ["too distant", { expiry: NOW + 301 }, 401],
    ["wrong method", { method: "POST" }, 405],
    ["preflight", { method: "OPTIONS" }, 405],
    ["query", { path: `${PATH}?token=hidden` }, 400],
  ] as const)(
    "rejects %s at both boundaries without storage or DO dispatch",
    async (_name, options, status) =>
      atTime(async () => {
        const h = host({});
        for (const fetch of [
          (r: Request) => worker.fetch(r, h.env),
          (r: Request) => h.session.fetch(r),
        ]) {
          const response = await fetch(request(options));
          expect(response.status).toBe(status);
          expectPrivate(response);
        }
        expect(h.stubFetch).not.toHaveBeenCalled();
        expect(h.idFromName).not.toHaveBeenCalled();
        expect(h.storage.transaction).not.toHaveBeenCalled();
      })
  );

  it("binds signature to the path and rejects missing secret", async () =>
    atTime(async () => {
      const h = host({});
      const signed = request();
      const moved = new Request("https://worker.example/game/other/export", {
        headers: signed.headers,
      });
      expect((await worker.fetch(moved, h.env)).status).toBe(401);
      expect((await h.session.fetch(moved)).status).toBe(401);
      h.env.GAME_WORKER_SECRET = "";
      h.session.env.GAME_WORKER_SECRET = "";
      expect((await worker.fetch(request(), h.env)).status).toBe(500);
      expect((await h.session.fetch(request())).status).toBe(500);
      expect(h.storage.transaction).not.toHaveBeenCalled();
    }));

  it("returns safe absent and malformed errors without raw payload logging", async () =>
    atTime(async () => {
      const log = vi.spyOn(console, "log");
      const error = vi.spyOn(console, "error");
      try {
        const empty = host({});
        const absent = await worker.fetch(request(), empty.env);
        expect(absent.status).toBe(404);
        expectPrivate(absent);
        const bad = host({ session: { state: "private-payload" } });
        const response = await worker.fetch(request(), bad.env);
        expect(response.status).toBe(422);
        expect(await response.text()).not.toContain("private-payload");
        expect(log).not.toHaveBeenCalled();
        expect(error).not.toHaveBeenCalled();
      } finally {
        log.mockRestore();
        error.mockRestore();
      }
    }));

  it.each(Object.keys(loadGoldenFixture().cases))(
    "preserves legacy %s shape and converter acceptance in live+undo",
    async (name) =>
      atTime(async () => {
        const f = fixture(name);
        const h = host({
          session: { ...f.session, undoHistory: [f.session.state] },
          "session:undo-history": ["ignored-separate-marker"],
        });
        const response = await worker.fetch(request(), h.env);
        expect(response.status).toBe(200);
        const body = (await response.json()) as {
          state: Record<string, unknown>;
          undoHistory: Record<string, unknown>[];
          provenance: { undoSource: string };
        };
        expect(body.provenance.undoSource).toBe("embedded");
        expect(body.state).not.toHaveProperty("schemaVersion");
        expect(body.undoHistory).toEqual([body.state]);
        // Only privacy fields change; nested legacy continuations remain raw.
        const expected = structuredClone(f.session.state);
        expected.id = "captured-game-0";
        if (expected.executionContext)
          expected.executionContext.trace.gameId = "captured-game-0";
        expected.players.forEach((p: Record<string, unknown>, i: number) => {
          p.playerId = `captured-player-${i}`;
          p.sleeveUrl = null;
          p.donArtUrl = null;
        });
        expect(body.state).toEqual(expected);
        expect(convertPersistedGameState(body.state, "state")).toBeDefined();
        expect(
          convertPersistedGameState(body.undoHistory[0], "undoHistory[0]")
        ).toBeDefined();
      })
  );
});

it("sanitizes every nested cost/source/event alias while preserving structural IDs, blind slots, unknown legacy work, and inputs", async () =>
  atTime(async () => {
    const f = fixture();
    const privatePlayer = structuredClone(f.session.state.players[0]);
    const card = structuredClone(privatePlayer.leader);
    const nested = {
      costTransactionState: {
        players: [privatePlayer],
        turn: {
          actionsPerformedThisTurn: [
            {
              type: "MANUAL_EFFECT",
              payload: {
                note: "private-player-a in private-game-id",
                target: "private-player-b",
              },
            },
          ],
        },
      },
      costExpectedRoot: { players: [privatePlayer] },
      costBaseline: { players: [privatePlayer] },
      sourceCardSnapshot: {
        ...card,
        imageUrl: "https://private.example/source",
      },
      sourceIdentity: {
        instanceId: card.instanceId,
        cardId: card.cardId,
        controller: 0,
        effectBlockId: "effect-kept",
      },
      accumulatedEvents: [
        {
          type: "SYNTHETIC",
          payload: {
            "private-player-a": "private-player-b",
            json: JSON.stringify({ gameId: "private-game-id" }),
            image: "https://private.example/event-art",
            authorization: "Bearer nested-credential",
            echo: "Bearer nested-credential",
            token: "nested-jwt",
            tokenEcho: "nested-jwt",
            consumedTokenJtis: { "nested-ledger-jti": 123 },
            ledgerEcho: "nested-ledger-jti",
          },
        },
      ],
      blindSlots: [{ token: "blind_00000001-1", instanceId: card.instanceId }],
      legacyUnknown: {
        pendingWork: [1, null, false, "AWAITING_COST_SELECTION"],
      },
    };
    f.session.state.effectStack = [nested];
    f.session.state.pendingPrompt = {
      sourceCardSnapshot: nested.sourceCardSnapshot,
      nested,
    };
    const h = host({
      session: f.session,
      "session:undo-history": [f.session.state],
    });
    const original = structuredClone(h.data);
    const response = await worker.fetch(request(), h.env);
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      state: typeof f.session.state;
      undoHistory: unknown[];
    };
    const serialized = JSON.stringify(body);
    for (const marker of [
      "private-player-a",
      "private-player-b",
      "private-game-id",
      "private.example",
      "nested-credential",
      "nested-jwt",
      "consumedTokenJtis",
    ])
      expect(serialized).not.toContain(marker);
    const out = body.state.effectStack[0];
    expect(out.costTransactionState.players[0].playerId).toBe(
      "captured-player-0"
    );
    expect(out.costExpectedRoot.players).toEqual(
      out.costTransactionState.players
    );
    expect(out.costBaseline.players).toEqual(out.costTransactionState.players);
    expect(out.sourceCardSnapshot).toEqual({ ...card, imageUrl: null });
    expect(out.sourceIdentity).toEqual(nested.sourceIdentity);
    expect(out.blindSlots).toEqual(nested.blindSlots);
    expect(out.legacyUnknown).toEqual(nested.legacyUnknown);
    expect(body.undoHistory).toEqual([body.state]);
    expect(h.data).toEqual(original);
  }));

it("exports actual current writer state without changing its schema/capabilities or hydrating memory", async () =>
  atTime(async () => {
    const { state } = setupGame();
    const persisted = toPersistedGameState({ ...state, id: "private-game-id" });
    const h = host({
      session: { formatVersion: 2, state: persisted },
      "session:undo-history": [persisted],
    });
    const memory = (h.session as unknown as { gameState: unknown }).gameState;
    const response = await worker.fetch(request({ expiry: NOW + 300 }), h.env);
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      state: typeof persisted;
      undoHistory: unknown[];
    };
    expect(body.state.schemaVersion).toBe(persisted.schemaVersion);
    expect(body.state.costSemanticsVersion).toBe(
      persisted.costSemanticsVersion
    );
    expect(body.state.players[0].leader).toEqual(persisted.players[0].leader);
    expect(body.state.turn).toEqual(persisted.turn);
    expect(body.state.executionContext.rngState).toBe(
      persisted.executionContext.rngState
    );
    expect(convertPersistedGameState(body.state, "state")).toBeDefined();
    expect(
      convertPersistedGameState(body.undoHistory[0], "undoHistory[0]")
    ).toBeDefined();
    expect((h.session as unknown as { gameState: unknown }).gameState).toBe(
      memory
    );
    // A bounded replay is intentionally allowed and never consumes a token/nonce.
    expect(
      (await worker.fetch(request({ expiry: NOW + 300 }), h.env)).status
    ).toBe(200);
    expect(h.storage.put).not.toHaveBeenCalled();
  }));

it("fails closed on private structural-ID collisions, invalid undo, and read errors without emitting their content", async () =>
  atTime(async () => {
    const f = fixture();
    f.session.state.players[0].leader.instanceId = "private-player-a-card";
    for (const values of [
      { session: f.session },
      {
        session: {
          ...fixture().session,
          undoHistory: { leaked: "private-marker" },
        },
      },
      {
        session: {
          ...fixture().session,
          state: { ...fixture().session.state, id: "wrong-game" },
        },
      },
    ]) {
      const h = host(values);
      const response = await worker.fetch(request(), h.env);
      expect(response.status).toBe(422);
      expectPrivate(response);
      expect(await response.text()).not.toMatch(/private|wrong-game/);
      expect(h.storage.put).not.toHaveBeenCalled();
    }
    const h = host({});
    h.storage.transaction.mockRejectedValueOnce(
      new Error("private-storage-error")
    );
    const response = await worker.fetch(request(), h.env);
    expect(response.status).toBe(422);
    expect(await response.text()).not.toContain("private-storage-error");
  }));

it("distinguishes absent undo from an explicit empty embedded history", async () =>
  atTime(async () => {
    const f = fixture();
    for (const embedded of [false, true]) {
      const h = host({
        session: { ...f.session, ...(embedded ? { undoHistory: [] } : {}) },
      });
      const response = await worker.fetch(request(), h.env);
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        provenance: { undoSource: string };
        undoHistory: unknown[];
      };
      expect(body.provenance.undoSource).toBe(embedded ? "embedded" : "absent");
      expect(body.undoHistory).toEqual([]);
    }
  }));

it("does not normalize a stored null undo value into an absent history", async () =>
  atTime(async () => {
    const f = fixture();
    const h = host({ session: f.session, "session:undo-history": null });
    const before = structuredClone(h.data);
    const response = await worker.fetch(request(), h.env);
    expect(response.status).toBe(422);
    expect(h.data).toEqual(before);
    expect(h.storage.put).not.toHaveBeenCalled();
  }));
