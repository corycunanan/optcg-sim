import { beforeEach, describe, expect, it, vi } from "vitest";
import { log } from "../lib/log.js";
import type { ServerMessage } from "../types.js";
import {
  MAX_SPECTATOR_SOCKETS,
  SessionTransport,
  SPECTATOR_CAPACITY_CLOSE_CODE,
  SPECTATOR_CAPACITY_CLOSE_REASON,
  isPlayerSocketAttachment,
  isSpectatorSocketAttachment,
} from "../session/transport.js";

class MockWebSocket {
  readonly sent: string[] = [];
  readonly closed: Array<{ code?: number; reason?: string }> = [];
  private attachment: unknown;

  constructor(attachment?: unknown) {
    this.attachment = attachment;
  }

  send(payload: string): void {
    this.sent.push(payload);
  }

  close(code?: number, reason?: string): void {
    this.closed.push({ code, reason });
  }

  serializeAttachment(value: unknown): void {
    this.attachment = value;
  }

  deserializeAttachment(): unknown {
    return this.attachment;
  }
}

class MockSocketState {
  private readonly sockets: MockWebSocket[] = [];
  private readonly tags = new Map<MockWebSocket, string[]>();

  acceptWebSocket(ws: WebSocket, tags?: string[]): void {
    const socket = ws as unknown as MockWebSocket;
    this.sockets.push(socket);
    this.tags.set(socket, tags ?? []);
  }

  getWebSockets(tag?: string): WebSocket[] {
    const sockets = tag
      ? this.sockets.filter((socket) => this.tags.get(socket)?.includes(tag))
      : this.sockets;
    return sockets as unknown as WebSocket[];
  }

  getTags(ws: WebSocket): string[] {
    return this.tags.get(ws as unknown as MockWebSocket) ?? [];
  }

  hibernate(): MockSocketState {
    const restored = new MockSocketState();
    for (const socket of this.sockets) {
      const attachment = JSON.parse(
        JSON.stringify(socket.deserializeAttachment())
      ) as unknown;
      restored.acceptWebSocket(
        new MockWebSocket(attachment) as unknown as WebSocket,
        [...(this.tags.get(socket) ?? [])]
      );
    }
    return restored;
  }
}

function transport(
  state = new MockSocketState(),
  now: () => number = () => 1_000
): SessionTransport {
  return new SessionTransport(state, () => undefined, now);
}

describe("OPT-555 spectator transport", () => {
  beforeEach(() => {
    vi.mocked(log).mockClear();
  });

  it("round-trips spectator identity through hibernation without becoming a player", () => {
    const state = new MockSocketState();
    let now = 1_000;
    const beforeWake = transport(state, () => now++);
    beforeWake.acceptSpectator(
      "spectator-user",
      new MockWebSocket() as unknown as WebSocket
    );
    beforeWake.acceptSpectator(
      "spectator-user",
      new MockWebSocket() as unknown as WebSocket
    );

    const restoredState = state.hibernate();
    const afterWake = transport(restoredState);
    const restored = restoredState.getWebSockets()[1]!;

    expect(afterWake.spectatorIdFor(restored)).toBe("spectator-user");
    expect(afterWake.spectatorSocket("spectator-user")).toBe(restored);
    expect(afterWake.playerIndexFor(restored)).toBeNull();
    expect(afterWake.playerSocket(0)).toBeNull();
    expect(isSpectatorSocketAttachment(restored.deserializeAttachment())).toBe(
      true
    );
    expect(isPlayerSocketAttachment(restored.deserializeAttachment())).toBe(
      false
    );
  });

  it("denies a restored spectator attachment when its tag is missing", () => {
    const beforeState = new MockSocketState();
    const beforeWake = transport(beforeState);
    const beforeSocket = new MockWebSocket();
    beforeWake.acceptSpectator(
      "spectator-user",
      beforeSocket as unknown as WebSocket
    );
    const attachment = JSON.parse(
      JSON.stringify(beforeSocket.deserializeAttachment())
    ) as unknown;

    const restoredState = new MockSocketState();
    const restoredSpectator = new MockWebSocket(attachment);
    restoredState.acceptWebSocket(
      restoredSpectator as unknown as WebSocket,
      []
    );
    const afterWake = transport(restoredState);
    const player = new MockWebSocket();
    afterWake.accept(0, player as unknown as WebSocket);

    expect(
      afterWake.spectatorIdFor(restoredSpectator as unknown as WebSocket)
    ).toBeNull();
    expect(
      isSpectatorSocketAttachment(restoredSpectator.deserializeAttachment())
    ).toBe(true);
    afterWake.broadcast({
      type: "game:player_reconnected",
      playerIndex: 0,
    });

    expect(player.sent).toHaveLength(1);
    expect(restoredSpectator.sent).toEqual([]);
  });

  it.each([
    null,
    "attachment",
    {},
    {
      type: "game-session-player-socket",
      userId: "spectator-user",
      connectionId: "1-0",
      acceptedAt: 1,
    },
    {
      type: "game-session-spectator-socket",
      connectionId: "1-0",
      acceptedAt: 1,
    },
    {
      type: "game-session-spectator-socket",
      userId: "",
      connectionId: "1-0",
      acceptedAt: 1,
    },
    {
      type: "game-session-spectator-socket",
      userId: 7,
      connectionId: "1-0",
      acceptedAt: 1,
    },
    {
      type: "game-session-spectator-socket",
      userId: "spectator-user",
      acceptedAt: 1,
    },
    {
      type: "game-session-spectator-socket",
      userId: "spectator-user",
      connectionId: 7,
      acceptedAt: 1,
    },
    {
      type: "game-session-spectator-socket",
      userId: "spectator-user",
      connectionId: "1-0",
    },
    {
      type: "game-session-spectator-socket",
      userId: "spectator-user",
      connectionId: "1-0",
      acceptedAt: "1",
    },
  ])("rejects an unrecognized spectator attachment: %j", (attachment) => {
    expect(isSpectatorSocketAttachment(attachment)).toBe(false);
  });

  it("does not derive spectator identity from missing or empty tags", () => {
    const state = new MockSocketState();
    const missing = new MockWebSocket();
    const empty = new MockWebSocket();
    state.acceptWebSocket(missing as unknown as WebSocket);
    state.acceptWebSocket(empty as unknown as WebSocket, ["spectator:"]);
    const sessionTransport = transport(state);

    expect(
      sessionTransport.spectatorIdFor(missing as unknown as WebSocket)
    ).toBeNull();
    expect(
      sessionTransport.spectatorIdFor(empty as unknown as WebSocket)
    ).toBeNull();
  });

  it("keeps only the newest socket for one spectator user", () => {
    let now = 1_000;
    const sessionTransport = transport(new MockSocketState(), () => now++);
    const first = new MockWebSocket();
    const second = new MockWebSocket();

    expect(
      sessionTransport.acceptSpectator(
        "spectator-user",
        first as unknown as WebSocket
      )
    ).toBe(true);
    expect(
      sessionTransport.acceptSpectator(
        "spectator-user",
        second as unknown as WebSocket
      )
    ).toBe(true);

    expect(first.closed).toEqual([{ code: 1000, reason: "superseded" }]);
    expect(second.closed).toEqual([]);
    expect(sessionTransport.spectatorSocket("spectator-user")).toBe(second);
  });

  it("rejects and logs the twenty-first spectator with a client-visible close", () => {
    expect(SPECTATOR_CAPACITY_CLOSE_CODE).toBe(1013);
    expect(SPECTATOR_CAPACITY_CLOSE_REASON).toBe("spectator capacity reached");
    const sessionTransport = transport();
    for (let index = 0; index < MAX_SPECTATOR_SOCKETS; index += 1) {
      expect(
        sessionTransport.acceptSpectator(
          `spectator-${index}`,
          new MockWebSocket() as unknown as WebSocket
        )
      ).toBe(true);
    }
    const rejected = new MockWebSocket();

    expect(
      sessionTransport.acceptSpectator(
        "spectator-over-cap",
        rejected as unknown as WebSocket
      )
    ).toBe(false);
    expect(rejected.closed).toEqual([
      {
        code: SPECTATOR_CAPACITY_CLOSE_CODE,
        reason: SPECTATOR_CAPACITY_CLOSE_REASON,
      },
    ]);
    expect(
      sessionTransport.spectatorIdFor(rejected as unknown as WebSocket)
    ).toBeNull();
    expect(
      sessionTransport.acceptSpectator(
        "spectator-over-cap",
        new MockWebSocket() as unknown as WebSocket
      )
    ).toBe(false);
    expect(log).toHaveBeenCalledWith("ws.spectator_capacity_rejected", {
      userId: "spectator-over-cap",
      spectatorCount: MAX_SPECTATOR_SOCKETS,
      limit: MAX_SPECTATOR_SOCKETS,
    });

    sessionTransport.broadcast({
      type: "game:player_reconnected",
      playerIndex: 0,
    });
    expect(rejected.sent).toEqual([]);
  });

  it("allows a same-user replacement while at spectator capacity", () => {
    const sessionTransport = transport();
    const first = new MockWebSocket();
    sessionTransport.acceptSpectator(
      "spectator-0",
      first as unknown as WebSocket
    );
    for (let index = 1; index < MAX_SPECTATOR_SOCKETS; index += 1) {
      sessionTransport.acceptSpectator(
        `spectator-${index}`,
        new MockWebSocket() as unknown as WebSocket
      );
    }
    const replacement = new MockWebSocket();

    expect(
      sessionTransport.acceptSpectator(
        "spectator-0",
        replacement as unknown as WebSocket
      )
    ).toBe(true);
    expect(first.closed).toEqual([{ code: 1000, reason: "superseded" }]);
    expect(replacement.closed).toEqual([]);
    expect(log).not.toHaveBeenCalledWith(
      "ws.spectator_capacity_rejected",
      expect.anything()
    );
  });

  it("denies spectator sockets every plain broadcast by default", () => {
    const sessionTransport = transport();
    const player = new MockWebSocket();
    const spectator = new MockWebSocket();
    sessionTransport.accept(0, player as unknown as WebSocket);
    sessionTransport.acceptSpectator(
      "spectator-user",
      spectator as unknown as WebSocket
    );

    sessionTransport.broadcast({
      type: "game:player_reconnected",
      playerIndex: 0,
    } satisfies ServerMessage);

    expect(player.sent).toHaveLength(1);
    expect(spectator.sent).toEqual([]);
  });
});
