import { describe, expect, it } from "vitest";
import { GameSession } from "../GameSession.js";
import {
  computeEffectAvailability,
  effectAvailabilityForRecipient,
  effectAvailabilityForSpectator,
} from "../engine/availability.js";
import type {
  EffectSchema,
  RuntimeActiveEffect,
} from "../engine/effect-types.js";
import { EB01_016_BINGOH } from "../engine/schemas/eb01.js";
import { EB02_047_BLUENO } from "../engine/schemas/eb02.js";
import { EB03_014_KUINA } from "../engine/schemas/eb03.js";
import { OP13_099_THE_EMPTY_THRONE } from "../engine/schemas/op13.js";
import { ST27_004_SANJUAN_WOLF } from "../engine/schemas/st27.js";
import type { CardData, Env, GameState } from "../types.js";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
  padChars,
} from "./helpers.js";

const ACTIVATE_MAIN_SCHEMA: EffectSchema = {
  effects: [
    {
      id: "rest_self_effect",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "REST_SELF" }],
      actions: [{ type: "DRAW", params: { amount: 1 } }],
      flags: { once_per_turn: true },
    },
  ],
};

function setSchema(
  cardDb: Map<string, CardData>,
  cardId: string,
  effectSchema: EffectSchema
): void {
  const card = cardDb.get(cardId);
  if (!card) throw new Error(`Missing test card ${cardId}`);
  cardDb.set(cardId, { ...card, effectSchema });
}

function activateMainFixture(): {
  state: GameState;
  cardDb: Map<string, CardData>;
  sourceId: string;
} {
  const cardDb = createTestCardDb();
  setSchema(cardDb, CARDS.VANILLA.id, ACTIVATE_MAIN_SCHEMA);
  const state = createBattleReadyState(cardDb);
  const source = state.players[0].characters[0];
  if (!source) throw new Error("Missing source Character");
  return { state, cardDb, sourceId: source.instanceId };
}

describe("computeEffectAvailability", () => {
  it("marks a payable [Activate: Main] effect usable during its controller's Main Phase", () => {
    const { state, cardDb, sourceId } = activateMainFixture();

    expect(computeEffectAvailability(state, cardDb)[sourceId]).toEqual([
      { effectId: "rest_self_effect", status: "usable" },
    ]);
  });

  it("blocks the same effect by phase during the opponent's turn", () => {
    const { state, cardDb, sourceId } = activateMainFixture();
    const opponentTurn = {
      ...state,
      turn: { ...state.turn, activePlayerIndex: 1 as const },
    };

    expect(computeEffectAvailability(opponentTurn, cardDb)[sourceId]).toEqual([
      { effectId: "rest_self_effect", status: "blocked", reason: "PHASE" },
    ]);
  });

  it("marks a once-per-turn effect used after its source is recorded", () => {
    const { state, cardDb, sourceId } = activateMainFixture();
    const used = {
      ...state,
      turn: {
        ...state.turn,
        oncePerTurnUsed: { rest_self_effect: [sourceId] },
      },
    };

    expect(computeEffectAvailability(used, cardDb)[sourceId]).toEqual([
      { effectId: "rest_self_effect", status: "used" },
    ]);
  });

  it("blocks an effect when its rest-self cost is not payable", () => {
    const { state, cardDb, sourceId } = activateMainFixture();
    const source = state.players[0].characters[0]!;
    const rested = {
      ...state,
      players: [
        {
          ...state.players[0],
          characters: padChars([{ ...source, state: "RESTED" }]),
        },
        state.players[1],
      ],
    } as GameState;

    expect(computeEffectAvailability(rested, cardDb)[sourceId]).toEqual([
      { effectId: "rest_self_effect", status: "blocked", reason: "COST" },
    ]);
  });

  it("keeps a permanent with conditions and no duration condition-gated", () => {
    const cardDb = createTestCardDb();
    setSchema(cardDb, CARDS.VANILLA.id, ST27_004_SANJUAN_WOLF);
    const state = createBattleReadyState(cardDb);
    const sourceId = state.players[0].characters[0]!.instanceId;
    const leaderData = cardDb.get(CARDS.LEADER.id)!;
    cardDb.set(CARDS.LEADER.id, {
      ...leaderData,
      types: ["Blackbeard Pirates"],
    });

    expect(computeEffectAvailability(state, cardDb)[sourceId]).toEqual([
      { effectId: "conditional_blocker_cost", status: "active" },
    ]);

    cardDb.set(CARDS.LEADER.id, { ...leaderData, types: [] });
    expect(computeEffectAvailability(state, cardDb)[sourceId]).toEqual([
      {
        effectId: "conditional_blocker_cost",
        status: "blocked",
        reason: "CONDITION",
      },
    ]);
  });

  it("blocks a permanent effect while its source card is effect-negated", () => {
    const cardDb = createTestCardDb();
    setSchema(cardDb, CARDS.VANILLA.id, ST27_004_SANJUAN_WOLF);
    const state = createBattleReadyState(cardDb);
    const sourceId = state.players[0].characters[0]!.instanceId;
    const leaderData = cardDb.get(CARDS.LEADER.id)!;
    cardDb.set(CARDS.LEADER.id, {
      ...leaderData,
      types: ["Blackbeard Pirates"],
    });
    const negation = {
      id: `negate-${sourceId}`,
      sourceCardInstanceId: "negator",
      sourceEffectBlockId: "negate",
      category: "auto",
      modifiers: [
        {
          type: "NEGATE_EFFECTS_FLAG",
          params: {},
          duration: { type: "THIS_TURN" },
        },
      ],
      duration: { type: "THIS_TURN" },
      expiresAt: { wave: "END_OF_TURN", turn: state.turn.number },
      controller: 1,
      appliesTo: [sourceId],
      timestamp: 0,
    } as RuntimeActiveEffect;
    const negated = { ...state, activeEffects: [negation] };

    expect(computeEffectAvailability(negated, cardDb)[sourceId]).toEqual([
      {
        effectId: "conditional_blocker_cost",
        status: "blocked",
        reason: "CONDITION",
      },
    ]);
  });

  it("activates OP13-099 with 22 trash only during its controller's turn", () => {
    const cardDb = createTestCardDb();
    setSchema(cardDb, CARDS.STAGE.id, OP13_099_THE_EMPTY_THRONE);
    const state = createBattleReadyState(cardDb);
    const sourceSeed = state.players[0].characters[0]!;
    const source = {
      ...sourceSeed,
      instanceId: "op13-099-stage",
      cardId: CARDS.STAGE.id,
      zone: "STAGE" as const,
    };
    const trash = Array.from({ length: 22 }, (_, index) => ({
      ...sourceSeed,
      instanceId: `op13-099-trash-${index}`,
      zone: "TRASH" as const,
    }));
    const ownTurn = {
      ...state,
      players: [
        { ...state.players[0], stage: source, trash },
        state.players[1],
      ],
    } as GameState;

    expect(
      computeEffectAvailability(ownTurn, cardDb)[source.instanceId]?.find(
        ({ effectId }) => effectId === "OP13-099_your_turn_power"
      )
    ).toEqual({ effectId: "OP13-099_your_turn_power", status: "active" });

    const opponentTurn = {
      ...ownTurn,
      turn: { ...ownTurn.turn, activePlayerIndex: 1 as const },
    };
    expect(
      computeEffectAvailability(opponentTurn, cardDb)[source.instanceId]?.find(
        ({ effectId }) => effectId === "OP13-099_your_turn_power"
      )
    ).toEqual({
      effectId: "OP13-099_your_turn_power",
      status: "blocked",
      reason: "CONDITION",
    });
  });

  it("gates a permanent with duration and no conditions", () => {
    const cardDb = createTestCardDb();
    setSchema(cardDb, CARDS.VANILLA.id, {
      effects: [
        {
          id: "your_turn_only",
          category: "permanent",
          modifiers: [
            {
              type: "MODIFY_POWER",
              target: { type: "SELF" },
              params: { amount: 1000 },
            },
          ],
          duration: {
            type: "WHILE_CONDITION",
            condition: { type: "IS_MY_TURN", controller: "SELF" },
          },
        },
      ],
    });
    const state = createBattleReadyState(cardDb);
    const sourceId = state.players[0].characters[0]!.instanceId;

    expect(computeEffectAvailability(state, cardDb)[sourceId]).toEqual([
      { effectId: "your_turn_only", status: "active" },
    ]);

    const opponentTurn = {
      ...state,
      turn: { ...state.turn, activePlayerIndex: 1 as const },
    };
    expect(computeEffectAvailability(opponentTurn, cardDb)[sourceId]).toEqual([
      {
        effectId: "your_turn_only",
        status: "blocked",
        reason: "CONDITION",
      },
    ]);
  });

  it("omits cards with no effect schema", () => {
    const cardDb = createTestCardDb();
    const state = createBattleReadyState(cardDb);
    const sourceId = state.players[0].characters[0]!.instanceId;

    expect(computeEffectAvailability(state, cardDb)).not.toHaveProperty(
      sourceId
    );
  });

  it("does not pre-cost block Blueno when trashing from hand can create its target", () => {
    const { state, cardDb, sourceId } = activateMainFixture();
    setSchema(cardDb, CARDS.VANILLA.id, EB02_047_BLUENO);

    expect(computeEffectAvailability(state, cardDb)[sourceId]).toEqual([
      { effectId: "activate_play_from_trash", status: "usable" },
    ]);
  });

  it("keeps NO_TARGET for Kuina's rest cost when the Leader is not Slash", () => {
    const { state, cardDb, sourceId } = activateMainFixture();
    setSchema(cardDb, CARDS.VANILLA.id, EB03_014_KUINA);

    expect(computeEffectAvailability(state, cardDb)[sourceId]).toEqual([
      { effectId: "activate_give_don", status: "blocked", reason: "NO_TARGET" },
    ]);
  });

  it("skips NO_TARGET when resting self can create a rested own-card target", () => {
    const { state, cardDb, sourceId } = activateMainFixture();
    setSchema(cardDb, CARDS.VANILLA.id, {
      effects: [
        {
          id: "rest_then_target_self",
          category: "activate",
          trigger: { keyword: "ACTIVATE_MAIN" },
          costs: [{ type: "REST_SELF" }],
          actions: [
            {
              type: "MODIFY_POWER",
              target: {
                type: "CHARACTER",
                controller: "SELF",
                filter: { is_rested: true, name: CARDS.VANILLA.name },
              },
              params: { amount: 1000 },
              duration: { type: "THIS_TURN" },
            },
          ],
        },
      ],
    });

    expect(computeEffectAvailability(state, cardDb)[sourceId]).toEqual([
      { effectId: "rest_then_target_self", status: "usable" },
    ]);
  });

  it("keeps NO_TARGET for Bingoh's opponent-only rested target", () => {
    const { state, cardDb, sourceId } = activateMainFixture();
    setSchema(cardDb, CARDS.VANILLA.id, EB01_016_BINGOH);

    expect(computeEffectAvailability(state, cardDb)[sourceId]).toEqual([
      { effectId: "activate_ko", status: "blocked", reason: "NO_TARGET" },
    ]);
  });
});

class MockWebSocket {
  sent: string[] = [];
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
  private sockets: MockWebSocket[] = [];
  private tags = new Map<MockWebSocket, string[]>();

  storage = {
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
  acceptAuthoritativePlayerSocket(playerIndex: 0 | 1, ws: WebSocket): void;
  broadcastFilteredState(
    build: (state: GameState) => { type: "game:state"; state: GameState }
  ): void;
};

describe("GameSession availability broadcast", () => {
  it("only sends each player availability for cards they control", () => {
    const durableState = new MockDurableObjectState();
    const session = new GameSession(
      durableState as unknown as DurableObjectState,
      {
        GAME_WORKER_SECRET: "test-secret",
        NEXTJS_URL: "https://app.example.test",
      } as Env
    ) as unknown as GameSessionTestAccess;
    const { state, cardDb, sourceId } = activateMainFixture();
    const opponentSourceId = state.players[1].characters[0]!.instanceId;
    session.gameState = state;
    session.cardDb = cardDb;

    const player0 = new MockWebSocket();
    const player1 = new MockWebSocket();
    session.acceptAuthoritativePlayerSocket(0, player0 as unknown as WebSocket);
    session.acceptAuthoritativePlayerSocket(1, player1 as unknown as WebSocket);
    session.broadcastFilteredState((visibleState) => ({
      type: "game:state",
      state: visibleState,
    }));

    const payload0 = JSON.parse(player0.sent[0]) as {
      state: GameState;
    };
    const payload1 = JSON.parse(player1.sent[0]) as {
      state: GameState;
    };
    expect(payload0.state.effectAvailability?.[sourceId]).toEqual([
      { effectId: "rest_self_effect", status: "usable" },
    ]);
    expect(payload0.state.effectAvailability).not.toHaveProperty(
      opponentSourceId
    );
    expect(payload1.state.effectAvailability?.[opponentSourceId]).toEqual([
      { effectId: "rest_self_effect", status: "blocked", reason: "PHASE" },
    ]);
    expect(payload1.state.effectAvailability).not.toHaveProperty(sourceId);
  });
});

describe("effectAvailabilityForRecipient", () => {
  it("builds spectator availability from both controllers when their values differ", () => {
    const { state, cardDb, sourceId } = activateMainFixture();
    const opponentSourceId = state.players[1].characters[0]!.instanceId;
    const availability = computeEffectAvailability(state, cardDb);

    expect(availability[sourceId]).toEqual([
      { effectId: "rest_self_effect", status: "usable" },
    ]);
    expect(availability[opponentSourceId]).toEqual([
      { effectId: "rest_self_effect", status: "blocked", reason: "PHASE" },
    ]);

    const spectatorPayload = {
      state: {
        ...state,
        effectAvailability: effectAvailabilityForRecipient(
          state,
          availability,
          null
        ),
      },
    };

    expect(spectatorPayload.state.effectAvailability).toEqual({
      [sourceId]: [{ effectId: "rest_self_effect", status: "usable" }],
      [opponentSourceId]: [
        {
          effectId: "rest_self_effect",
          status: "blocked",
          reason: "PHASE",
        },
      ],
    });
  });
});

describe("effectAvailabilityForSpectator", () => {
  it("fails loudly instead of clobbering overlapping controller keys", () => {
    const { state, cardDb, sourceId } = activateMainFixture();
    const opponentSource = state.players[1].characters[0]!;
    const duplicateInstanceState = {
      ...state,
      players: [
        state.players[0],
        {
          ...state.players[1],
          characters: padChars([
            { ...opponentSource, instanceId: sourceId, controller: 1 },
          ]),
        },
      ],
    } as GameState;
    const availability = computeEffectAvailability(
      duplicateInstanceState,
      cardDb
    );

    expect(() =>
      effectAvailabilityForSpectator(duplicateInstanceState, availability)
    ).toThrow(
      `Effect availability invariant violated: card instance ${sourceId} belongs to both controllers`
    );
  });
});
