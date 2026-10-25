import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { expect, it, vi } from "vitest";
import { GameSession } from "../GameSession.js";
import { toPersistedGameState } from "../session/game-state-schema.js";
import { SessionTransport } from "../session/transport.js";
import type { Env, GameAction, GameState } from "../types.js";

class Socket {
  sent: string[] = [];
  closed = false;
  attachment: unknown;
  send(message: string) { this.sent.push(message); }
  close() { this.closed = true; }
  serializeAttachment(value: unknown) { this.attachment = value; }
  deserializeAttachment() { return this.attachment; }
}

function durable(stored: Record<string, unknown>) {
  const data = new Map(Object.entries(structuredClone(stored)));
  const sockets = new Map<WebSocket, string[]>();
  const storage = {
    get: async (key: string) => structuredClone(data.get(key)),
    put: vi.fn(async (key: string | Record<string, unknown>, value?: unknown) => {
      for (const [k, v] of typeof key === "string" ? [[key, value]] : Object.entries(key)) data.set(k as string, structuredClone(v));
    }),
    setAlarm: vi.fn(), deleteAlarm: vi.fn(),
  };
  return {
    data, storage,
    acceptWebSocket(ws: WebSocket, tags: string[]) { sockets.set(ws, tags); },
    getWebSockets(tag?: string) { return [...sockets].filter(([ws, tags]) => !(ws as unknown as Socket).closed && (!tag || tags.includes(tag))).map(([ws]) => ws); },
    getTags(ws: WebSocket) { return sockets.get(ws) ?? []; },
  };
}

type Access = {
  gameState: GameState;
  transport: SessionTransport;
  loadFromStorage(): Promise<boolean>;
  webSocketMessage(ws: WebSocket, message: string): Promise<void>;
};

// Actual isolated writer inputs, including recorded prompt IDs. The coordinator
// clears undo at these mandatory prompts; separate repository tests cover mixed8/9.
// The reader must finish the same choices through the real Durable Object entry.
for (const disposition of ["accept", "decline"]) it(`OPT-1006 writer9 ${disposition} survives GameSession recreate and duplicate socket response`, async () => {
  const corpus = JSON.parse(gunzipSync(readFileSync(new URL("./fixtures/opt-1006-writer-corpus.json.gz", import.meta.url))).toString("utf8"));
  const capture = corpus[`OPT-1001-authored-Beckman-Koby-${disposition}-mode8-reload.json`] as {
    producer: string;
    cases: { stored: Record<string, unknown>; replies: GameAction[] }[];
    expected: GameState;
  };
  expect(capture.producer).toBe("09b6b43adc608a07716eef152b29a93afa2d8437");
  const start = capture.cases.find(entry => (entry.stored.session as { state: GameState }).state.schemaVersion === 9)!;
  expect(start).toBeDefined();
  const host = durable(start.stored);
  const recreate = async () => {
    const session = new GameSession(host as unknown as DurableObjectState, { GAME_WORKER_SECRET: "test", NEXTJS_URL: "https://example.test" } as Env) as unknown as Access;
    expect(await session.loadFromStorage()).toBe(true);
    expect(session.gameState.schemaVersion).toBe(9);
    expect(session.gameState.costSemanticsVersion).toBe(8);
    return session;
  };
  let session = await recreate();
  let lastSocket: Socket | undefined;
  for (const action of start.replies) {
    const prompt = session.gameState.pendingPrompt!;
    expect(prompt).not.toBeNull();
    const socket = new Socket();
    session.transport.accept(prompt.respondingPlayer, socket as unknown as WebSocket);
    const message = JSON.stringify({ type: "game:action", action });
    await session.webSocketMessage(socket as unknown as WebSocket, message);
    expect(socket.sent.map(item => JSON.parse(item)).filter(item => item.type === "action:rejected" || item.type === "game:error")).toEqual([]);
    const stateAfter = structuredClone(session.gameState);
    const storageAfter = structuredClone(host.data);
    const writes = host.storage.put.mock.calls.length;
    await session.webSocketMessage(socket as unknown as WebSocket, message);
    expect(socket.sent.map(item => JSON.parse(item)).some(item => item.type === "action:rejected")).toBe(true);
    expect(session.gameState).toEqual(stateAfter);
    expect(host.data).toEqual(storageAfter);
    expect(host.storage.put).toHaveBeenCalledTimes(writes);
    session = await recreate();
    lastSocket = socket;
  }
  expect(lastSocket).toBeDefined();
  expect(toPersistedGameState(session.gameState)).toEqual(capture.expected);
  expect(session.gameState.effectStack).toEqual([]);
  expect(session.gameState.pendingPrompt).toBeNull();
  expect(session.gameState.eventLog.filter(event => event.type === "CARD_KO")).toEqual([]);
  const defender = session.gameState.players[0];
  expect(defender.characters.some(card => card?.cardId === "OPT1001-NAVY-0")).toBe(disposition === "accept");
  expect(defender.trash).toHaveLength(disposition === "accept" ? 0 : 4);
  expect(defender.deck.slice(-3).every(card => card.cardId.startsWith("OPT1001-PAY-"))).toBe(disposition === "accept");
});
