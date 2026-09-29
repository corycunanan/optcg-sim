/**
 * OPT-901: a player's own face-down Life identities are hidden information.
 *
 * Rules §3-10-2: "The Life area is a secret area. Cards in this area are,
 * unless otherwise specified, placed face-down in a stack and neither player
 * can check the contents of those cards." "Neither player" includes the
 * owner, so the owner's snapshot must redact face-down Life exactly like the
 * opponent's. Exceptions this suite pins:
 *   - §3-10-2-1: face-up Life is an open-area card, visible to both players.
 *   - §3-10-3 / §11-3-1: a look-at-Life effect discloses cards to the player
 *     of that effect, through its prompt payload.
 *   - A damage-revealed Life card is disclosed to the damaged player
 *     (pendingTriggerLifeCard / pendingTriggerFromEffect), and a card moved
 *     from Life to hand is visible in its new zone.
 *
 * Expected values are written from the rules and the zone-local placeholder
 * convention (`hidden-<player>-life-<stack index>`), never by calling the
 * projection helper under test.
 */

import { describe, expect, it } from "vitest";
import { GameSession } from "../GameSession.js";
import {
  executeLifeScry,
  executeLifeToHand,
  executeReorderAllLife,
} from "../engine/effect-resolver/actions/life.js";
import type { ActionOf } from "../engine/effect-types.js";
import { filterStateForPlayer, removeTopLifeCard } from "../engine/state.js";
import { filterPromptForPlayer } from "../engine/visibility.js";
import type { SessionFilteredState } from "../session/filtered-state.js";
import type { SessionTransport } from "../session/transport.js";
import {
  visibleStateForPlayer,
  visibleStateForSpectator,
} from "../session/visibility.js";
import type {
  CardData,
  Env,
  GameState,
  LifeCard,
  PendingPromptState,
  PlayerState,
  ServerMessage,
} from "../types.js";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
} from "./helpers.js";

const PLAYERS = [0, 1] as const;

const secretCardId = (player: 0 | 1, index: number) =>
  `OPT901-SECRET-${player}-${index}`;
const secretInstanceId = (player: 0 | 1, index: number) =>
  `opt901-secret-life-${player}-${index}`;
const faceUpCardId = (player: 0 | 1) => `OPT901-FACEUP-${player}`;
const faceUpInstanceId = (player: 0 | 1) => `opt901-faceup-life-${player}`;

/** Every face-down identity in the fixture, for both players. */
const FACE_DOWN_SECRETS = PLAYERS.flatMap((player) =>
  [0, 2].flatMap((index) => [
    secretCardId(player, index),
    secretInstanceId(player, index),
  ]),
);

/** Top-down stack: face-down, face-up, face-down. */
function sentinelLife(player: 0 | 1): LifeCard[] {
  return [
    { instanceId: secretInstanceId(player, 0), cardId: secretCardId(player, 0), face: "DOWN" },
    { instanceId: faceUpInstanceId(player), cardId: faceUpCardId(player), face: "UP" },
    { instanceId: secretInstanceId(player, 2), cardId: secretCardId(player, 2), face: "DOWN" },
  ];
}

/** Rules §3-10-2 / §3-10-2-1 projection of sentinelLife for ANY viewer. */
function expectedProjectedLife(player: 0 | 1): LifeCard[] {
  return [
    { instanceId: `hidden-${player}-life-0`, cardId: "hidden", face: "DOWN" },
    { instanceId: faceUpInstanceId(player), cardId: faceUpCardId(player), face: "UP" },
    { instanceId: `hidden-${player}-life-2`, cardId: "hidden", face: "DOWN" },
  ];
}

function registerSentinelCards(cardDb: Map<string, CardData>): void {
  for (const player of PLAYERS) {
    for (const id of [
      secretCardId(player, 0),
      secretCardId(player, 2),
      faceUpCardId(player),
    ]) {
      cardDb.set(id, { ...CARDS.VANILLA, id, name: id });
    }
  }
}

function fixture(): { state: GameState; cardDb: Map<string, CardData> } {
  const cardDb = createTestCardDb();
  registerSentinelCards(cardDb);
  const base = createBattleReadyState(cardDb);
  const players = base.players.map((player, index) => ({
    ...player,
    life: sentinelLife(index as 0 | 1),
  })) as [PlayerState, PlayerState];
  return { state: { ...base, players }, cardDb };
}

function expectNoFaceDownSecrets(value: unknown): void {
  const serialized = JSON.stringify(value);
  for (const secret of FACE_DOWN_SECRETS) {
    expect(serialized).not.toContain(secret);
  }
}

describe("OPT-901 projection: own face-down Life is secret (§3-10-2)", () => {
  it.each(PLAYERS)(
    "redacts player %i's own face-down Life identities, keeping size and faces",
    (player) => {
      const { state } = fixture();
      const view = filterStateForPlayer(state, player);

      expect(view.players[player].life).toEqual(expectedProjectedLife(player));
    },
  );

  it.each(PLAYERS)(
    "leaves no face-down Life identity of either player anywhere in player %i's view",
    (player) => {
      const { state } = fixture();
      expectNoFaceDownSecrets(filterStateForPlayer(state, player));
    },
  );

  it.each(PLAYERS)(
    "leaves no face-down Life identity in player %i's socket-bound view",
    (player) => {
      const { state, cardDb } = fixture();
      const view = visibleStateForPlayer(state, cardDb, player);

      expect(view.players[player].life).toEqual(expectedProjectedLife(player));
      expectNoFaceDownSecrets(view);
    },
  );

  it("shows face-up Life to both players (§3-10-2-1)", () => {
    const { state } = fixture();
    for (const viewer of PLAYERS) {
      const view = filterStateForPlayer(state, viewer);
      for (const owner of PLAYERS) {
        expect(view.players[owner].life[1]).toEqual({
          instanceId: faceUpInstanceId(owner),
          cardId: faceUpCardId(owner),
          face: "UP",
        });
      }
    }
  });

  it("leaves the owner's own deck unchanged (own-deck policy is OPT-908)", () => {
    const { state } = fixture();
    for (const player of PLAYERS) {
      expect(filterStateForPlayer(state, player).players[player].deck).toEqual(
        state.players[player].deck,
      );
    }
  });

  it("uses zone-local placeholders that cannot follow a card across movements", () => {
    const { state } = fixture();
    const removed = removeTopLifeCard(state, 0);
    if (!removed) throw new Error("fixture has Life");

    // The secret formerly at stack index 2 is now at index 1; its placeholder
    // is derived from its current position only.
    expect(filterStateForPlayer(removed.state, 0).players[0].life).toEqual([
      { instanceId: faceUpInstanceId(0), cardId: faceUpCardId(0), face: "UP" },
      { instanceId: "hidden-0-life-1", cardId: "hidden", face: "DOWN" },
    ]);
  });
});

describe("OPT-901 projection: legitimate Life disclosures still reach the owner", () => {
  it("shows the battle-damage Trigger Life card to the damaged player only", () => {
    const { state } = fixture();
    // Player 0 is active, so player 1 is the damaged (defending) player.
    const revealed: LifeCard = {
      instanceId: "opt901-revealed-trigger",
      cardId: "OPT901-REVEALED-TRIGGER",
      face: "DOWN",
    };
    const battleState: GameState = {
      ...state,
      turn: {
        ...state.turn,
        battleSubPhase: "DAMAGE_STEP",
        battle: {
          battleId: "opt901-battle",
          attackerInstanceId: state.players[0].leader.instanceId,
          targetInstanceId: state.players[1].leader.instanceId,
          attackerPower: 5000,
          defenderPower: 5000,
          counterPowerAdded: 0,
          blockerActivated: false,
          pendingTriggerLifeCard: revealed,
        },
      },
    };

    const damagedView = filterStateForPlayer(battleState, 1);
    expect(damagedView.turn.battle?.pendingTriggerLifeCard).toEqual(revealed);
    expect(damagedView.players[1].life).toEqual(expectedProjectedLife(1));
    expect(JSON.stringify(filterStateForPlayer(battleState, 0))).not.toContain(
      revealed.cardId,
    );
  });

  it("shows the effect-damage Trigger Life card to the damaged player only", () => {
    const { state } = fixture();
    const revealed: LifeCard = {
      instanceId: "opt901-effect-trigger",
      cardId: "OPT901-EFFECT-TRIGGER",
      face: "DOWN",
    };
    const pending: GameState = {
      ...state,
      turn: {
        ...state.turn,
        pendingTriggerFromEffect: {
          lifeCard: revealed,
          damagedPlayerIndex: 0,
          remainingDamages: 0,
          sourceCardInstanceId: state.players[1].leader.instanceId,
          controllerIndex: 1,
        },
      },
    };

    expect(
      filterStateForPlayer(pending, 0).turn.pendingTriggerFromEffect?.lifeCard,
    ).toEqual(revealed);
    expect(filterStateForPlayer(pending, 0).players[0].life).toEqual(
      expectedProjectedLife(0),
    );
    expect(JSON.stringify(filterStateForPlayer(pending, 1))).not.toContain(
      revealed.cardId,
    );
  });

  it("shows a Life card moved to hand in the owner's hand, and nothing else", () => {
    const { state, cardDb } = fixture();
    const result = executeLifeToHand(
      state,
      { type: "LIFE_TO_HAND", params: { amount: 1 } } as ActionOf<"LIFE_TO_HAND">,
      state.players[0].leader.instanceId,
      0,
      cardDb,
      new Map(),
    );
    const view = filterStateForPlayer(result.state, 0);

    expect(view.players[0].hand.map((card) => card.cardId)).toContain(
      secretCardId(0, 0),
    );
    expect(view.players[0].life).toEqual([
      { instanceId: faceUpInstanceId(0), cardId: faceUpCardId(0), face: "UP" },
      { instanceId: "hidden-0-life-1", cardId: "hidden", face: "DOWN" },
    ]);
    expect(JSON.stringify(view)).not.toContain(secretCardId(0, 2));
    expect(JSON.stringify(view)).not.toContain(secretInstanceId(0, 2));
  });

  it("discloses REORDER_ALL_LIFE cards through the prompt payload only", () => {
    const { state, cardDb } = fixture();
    const result = executeReorderAllLife(
      state,
      { type: "REORDER_ALL_LIFE", params: {} } as ActionOf<"REORDER_ALL_LIFE">,
      state.players[0].leader.instanceId,
      0,
      cardDb,
      new Map(),
    );
    const prompt = result.pendingPrompt;
    if (!prompt) throw new Error("REORDER_ALL_LIFE should prompt");
    const view = filterStateForPlayer({ ...result.state, pendingPrompt: prompt }, 0);

    const options = view.pendingPrompt?.options;
    expect(options?.promptType).toBe("ARRANGE_TOP_CARDS");
    if (options?.promptType !== "ARRANGE_TOP_CARDS") throw new Error("prompt");
    expect(options.cards.map((card) => card.cardId)).toEqual(
      sentinelLife(0).map((card) => card.cardId),
    );
    // The prompt is the only disclosure channel: the stack stays redacted.
    expect(view.players[0].life).toEqual(expectedProjectedLife(0));
    expectNoFaceDownSecrets({ ...view, pendingPrompt: null });
    // The prompt frame sent to the responder carries the same identities.
    expect(filterPromptForPlayer(prompt, 0)?.options).toEqual(options);
  });

  it("discloses a targeted LIFE_SCRY card through its ARRANGE prompt only", () => {
    const { state, cardDb } = fixture();
    const topId = secretInstanceId(0, 0);
    const result = executeLifeScry(
      state,
      {
        type: "LIFE_SCRY",
        target: { type: "LIFE_CARD", controller: "SELF", count: { up_to: 1 } },
        params: { look_at: 1 },
      } as ActionOf<"LIFE_SCRY">,
      state.players[0].leader.instanceId,
      0,
      cardDb,
      new Map(),
      [topId],
    );
    const prompt = result.pendingPrompt;
    if (!prompt) throw new Error("targeted LIFE_SCRY should prompt");
    const view = filterStateForPlayer({ ...result.state, pendingPrompt: prompt }, 0);

    const options = view.pendingPrompt?.options;
    if (options?.promptType !== "ARRANGE_TOP_CARDS") throw new Error("prompt");
    expect(options.cards.map((card) => card.cardId)).toEqual([secretCardId(0, 0)]);
    expect(view.players[0].life).toEqual(expectedProjectedLife(0));
  });
});

describe("OPT-901 spectator projection", () => {
  it("hides both players' face-down Life and shows face-up Life", () => {
    const { state, cardDb } = fixture();
    const spectator = visibleStateForSpectator(state, cardDb);

    for (const owner of PLAYERS) {
      expect(spectator.players[owner].life).toEqual(expectedProjectedLife(owner));
    }
    expectNoFaceDownSecrets(spectator);
  });
});

// ─── GameSession message boundary ────────────────────────────────────────────

class MockWebSocket {
  readonly sent: string[] = [];
  private attachment: unknown = null;

  send(payload: string): void {
    this.sent.push(payload);
  }

  close(): void {}

  serializeAttachment(attachment: unknown): void {
    this.attachment = attachment;
  }

  deserializeAttachment(): unknown {
    return this.attachment;
  }
}

class MockDurableObjectState {
  private readonly sockets: MockWebSocket[] = [];
  private readonly tags = new Map<MockWebSocket, string[]>();

  readonly storage = {
    put: async () => undefined,
    get: async () => undefined,
    setAlarm: async () => undefined,
    deleteAlarm: async () => undefined,
  };

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
}

type GameSessionTestAccess = {
  gameState: GameState;
  cardDb: Map<string, CardData>;
  transport: SessionTransport;
  filteredState: SessionFilteredState;
  acceptAuthoritativePlayerSocket(playerIndex: 0 | 1, ws: WebSocket): void;
  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void>;
  sendEffectPrompt(prompt: PendingPromptState): void;
};

type Recipient = "player-0" | "player-1" | "spectator";

function createSession(): {
  session: GameSessionTestAccess;
  sockets: Record<Recipient, MockWebSocket>;
} {
  const session = new GameSession(
    new MockDurableObjectState() as unknown as DurableObjectState,
    {
      GAME_WORKER_SECRET: "test-secret",
      NEXTJS_URL: "https://app.example.test",
    } as Env,
  ) as unknown as GameSessionTestAccess;
  const { state, cardDb } = fixture();
  session.gameState = state;
  session.cardDb = cardDb;

  const sockets: Record<Recipient, MockWebSocket> = {
    "player-0": new MockWebSocket(),
    "player-1": new MockWebSocket(),
    spectator: new MockWebSocket(),
  };
  session.acceptAuthoritativePlayerSocket(0, sockets["player-0"] as unknown as WebSocket);
  session.acceptAuthoritativePlayerSocket(1, sockets["player-1"] as unknown as WebSocket);
  session.transport.acceptSpectator(
    "opt901-spectator",
    sockets.spectator as unknown as WebSocket,
  );
  return { session, sockets };
}

function frames(socket: MockWebSocket): ServerMessage[] {
  return socket.sent.map((payload) => JSON.parse(payload) as ServerMessage);
}

function stateFrames(socket: MockWebSocket): GameState[] {
  return frames(socket).flatMap((frame) =>
    frame.type === "game:state" || frame.type === "game:update"
      ? [frame.state as GameState]
      : [],
  );
}

async function act(
  session: GameSessionTestAccess,
  socket: MockWebSocket,
  action: unknown,
): Promise<void> {
  await session.webSocketMessage(
    socket as unknown as WebSocket,
    JSON.stringify({ type: "game:action", action }),
  );
}

describe("OPT-901 GameSession frames", () => {
  it("sends every recipient a game:state snapshot with face-down Life redacted", () => {
    const { session, sockets } = createSession();

    session.filteredState.broadcastState();

    for (const player of PLAYERS) {
      const [snapshot] = stateFrames(sockets[`player-${player}`]);
      expect(snapshot?.players[player].life).toEqual(expectedProjectedLife(player));
    }
    const [spectatorSnapshot] = stateFrames(sockets.spectator);
    for (const owner of PLAYERS) {
      expect(spectatorSnapshot?.players[owner].life).toEqual(
        expectedProjectedLife(owner),
      );
    }
    for (const socket of Object.values(sockets)) {
      expect(socket.sent).toHaveLength(1);
      expectNoFaceDownSecrets(socket.sent);
    }
  });

  it("keeps face-down Life secret through real battle-damage game:update frames", async () => {
    const { session, sockets } = createSession();
    const attacker = session.gameState.players[0].leader.instanceId;
    const target = session.gameState.players[1].leader.instanceId;

    await act(session, sockets["player-0"], {
      type: "DECLARE_ATTACK",
      attackerInstanceId: attacker,
      targetInstanceId: target,
    });
    for (let step = 0; step < 4 && session.gameState.turn.battle; step += 1) {
      await act(session, sockets["player-1"], { type: "PASS" });
    }

    // The attack resolved: player 1 took 1 damage from the top of Life.
    expect(session.gameState.turn.battle).toBeNull();
    expect(session.gameState.players[1].life).toHaveLength(2);
    for (const socket of Object.values(sockets)) {
      expect(frames(socket).some((frame) => frame.type === "action:rejected")).toBe(false);
      expect(stateFrames(socket).length).toBeGreaterThan(1);
    }

    // No frame to anyone ever carried a still-face-down identity.
    const stillSecret = [
      secretCardId(0, 0),
      secretInstanceId(0, 0),
      secretCardId(0, 2),
      secretInstanceId(0, 2),
      secretCardId(1, 2),
      secretInstanceId(1, 2),
    ];
    for (const socket of Object.values(sockets)) {
      const serialized = JSON.stringify(socket.sent);
      for (const secret of stillSecret) expect(serialized).not.toContain(secret);
    }

    // Before the damage, player 1's own frames never named the card that
    // would be dealt; afterwards it is in their hand, where they may see it.
    const playerOneStates = stateFrames(sockets["player-1"]);
    const finalOwnView = playerOneStates[playerOneStates.length - 1]!;
    expect(finalOwnView.players[1].life).toEqual([
      { instanceId: faceUpInstanceId(1), cardId: faceUpCardId(1), face: "UP" },
      { instanceId: "hidden-1-life-1", cardId: "hidden", face: "DOWN" },
    ]);
    expect(finalOwnView.players[1].hand.map((card) => card.cardId)).toContain(
      secretCardId(1, 0),
    );
    for (const earlier of playerOneStates.filter(
      (view) => view.players[1].life.length === 3,
    )) {
      expect(JSON.stringify(earlier)).not.toContain(secretCardId(1, 0));
      expect(earlier.players[1].life).toEqual(expectedProjectedLife(1));
    }
    // The attacker never learns the card that went to the opponent's hand.
    expect(JSON.stringify(sockets["player-0"].sent)).not.toContain(
      secretCardId(1, 0),
    );
  });

  it("delivers a look-at-Life ARRANGE prompt to its responder only", () => {
    const { session, sockets } = createSession();
    const result = executeReorderAllLife(
      session.gameState,
      { type: "REORDER_ALL_LIFE", params: {} } as ActionOf<"REORDER_ALL_LIFE">,
      session.gameState.players[0].leader.instanceId,
      0,
      session.cardDb,
      new Map(),
    );
    const prompt = result.pendingPrompt;
    if (!prompt) throw new Error("REORDER_ALL_LIFE should prompt");

    session.sendEffectPrompt({ ...prompt, promptId: "opt901-reorder" });

    const [promptFrame] = frames(sockets["player-0"]);
    expect(promptFrame?.type).toBe("game:prompt");
    if (promptFrame?.type !== "game:prompt") throw new Error("prompt frame");
    const options = promptFrame.options;
    if (options.promptType !== "ARRANGE_TOP_CARDS") throw new Error("prompt type");
    expect(options.cards.map((card) => card.cardId)).toEqual(
      sentinelLife(0).map((card) => card.cardId),
    );
    expect(sockets["player-1"].sent).toEqual([]);
    expect(sockets.spectator.sent).toEqual([]);
  });
});
