import { describe, expect, it } from "vitest";
import type {
  CardData,
  Env,
  GameAction,
  GameInitPayload,
  GameState,
  PregameMode,
} from "../types.js";
import { GameSession } from "../GameSession.js";
import { advancePregame, resumePregameFromPrompt, startPregame } from "../engine/pregame.js";
import { resumeFromStack } from "../engine/effect-resolver/resume.js";
import { prepareDecksAndLeaders } from "../engine/setup.js";
import { filterStateForPlayer } from "../engine/state.js";
import { CARDS, createTestPayload } from "./helpers.js";

const IMU: CardData = {
  ...CARDS.LEADER,
  id: "OP13-079",
  name: "Imu",
  types: ["The Five Elders"],
};

const MARY_GEOISE: CardData = {
  ...CARDS.STAGE,
  id: "OP05-097",
  name: "Mary Geoise",
  types: ["Mary Geoise"],
};

class MockWebSocket {
  sent: string[] = [];
  send(payload: string): void { this.sent.push(payload); }
  close(): void {}
  serializeAttachment(): void {}
  deserializeAttachment(): unknown { return null; }
}

class MockDurableObjectState {
  storage = {
    put: async () => undefined,
    get: async () => undefined,
    setAlarm: async () => undefined,
    deleteAlarm: async () => undefined,
  };
  acceptWebSocket(): void {}
  getWebSockets(): WebSocket[] { return []; }
  getTags(): string[] { return []; }
}

type TestSession = {
  gameState: GameState;
  cardDb: Map<string, CardData>;
  handleAction(ws: WebSocket, playerIndex: 0 | 1, action: GameAction): Promise<void>;
};

function withImu(
  player: GameInitPayload["player1"],
  includeMaryGeoise: boolean,
): GameInitPayload["player1"] {
  return {
    ...player,
    leader: { cardId: IMU.id, quantity: 1, cardData: IMU },
    deck: includeMaryGeoise
      ? player.deck.map((entry) => entry.cardId === CARDS.STAGE.id
          ? { cardId: MARY_GEOISE.id, quantity: entry.quantity, cardData: MARY_GEOISE }
          : entry)
      : player.deck,
  };
}

function buildState(
  imuPlayers: readonly [boolean, boolean],
  maryPlayers: readonly [boolean, boolean],
  pregameMode: PregameMode = "PRIORITY_ROLL",
): { state: GameState; cardDb: Map<string, CardData> } {
  const payload = createTestPayload();
  if (
    pregameMode === "SIDE_A_FIRST" ||
    pregameMode === "SIDE_B_FIRST" ||
    pregameMode === "SOLITAIRE_RANDOM"
  ) {
    payload.mode = "SOLITAIRE";
  }
  payload.pregameMode = pregameMode;
  if (imuPlayers[0]) payload.player1 = withImu(payload.player1, maryPlayers[0]);
  if (imuPlayers[1]) payload.player2 = withImu(payload.player2, maryPlayers[1]);
  const { state, cardDb } = prepareDecksAndLeaders(payload);
  return { state: startPregame(state, pregameMode), cardDb };
}

function chooseFirstPlayer(
  state: GameState,
  cardDb: Map<string, CardData>,
  choiceId: "FIRST" | "SECOND",
): GameState {
  const rolled = advancePregame(state, cardDb, [5, 3]).state;
  return resumePregameFromPrompt(
    rolled,
    { type: "PLAYER_CHOICE", choiceId },
    rolled.pendingPrompt!.respondingPlayer,
  );
}

function answerSearch(
  state: GameState,
  cardDb: Map<string, CardData>,
  accept: boolean,
): GameState {
  const prompt = state.pendingPrompt;
  if (!prompt || prompt.options.promptType !== "ARRANGE_TOP_CARDS") {
    throw new Error("Expected a start-of-game deck-search prompt");
  }
  const revealedIds = prompt.options.cards.map((card) => card.instanceId);
  const keptCardInstanceId = accept ? revealedIds[0] : "";
  const resumed = resumeFromStack(
    { ...state, pendingPrompt: null },
    {
      type: "ARRANGE_TOP_CARDS",
      keptCardInstanceId,
      orderedInstanceIds: accept ? revealedIds.slice(1) : revealedIds,
      destination: "bottom",
    },
    cardDb,
  );
  return {
    ...resumed.state,
    pendingPrompt: resumed.pendingPrompt ?? null,
  };
}

describe("OPT-476 start-of-game effects", () => {
  it("plays Imu's Mary Geoise Stage before dealing opening hands", () => {
    const { state, cardDb } = buildState([true, false], [true, false]);
    const chosen = chooseFirstPlayer(state, cardDb, "FIRST");
    const prompted = advancePregame(chosen, cardDb, []).state;

    expect(prompted.pregame?.phase).toBe("START_OF_GAME_FX");
    expect(prompted.pendingPrompt?.respondingPlayer).toBe(0);
    expect(prompted.players[0].hand).toHaveLength(0);
    expect(prompted.players[1].hand).toHaveLength(0);
    expect(prompted.pregame?.startOfGameEffectsResolved).toEqual([true, false]);

    const ownerView = filterStateForPlayer(prompted, 0);
    const opponentView = filterStateForPlayer(prompted, 1);
    expect(ownerView.pendingPrompt?.options.promptType).toBe("ARRANGE_TOP_CARDS");
    expect(opponentView.pendingPrompt).toBeNull();

    const played = answerSearch(prompted, cardDb, true);
    expect(played.players[0].stage?.cardId).toBe(MARY_GEOISE.id);
    expect(played.players[0].hand).toHaveLength(0);
    expect(played.pregame?.phase).toBe("START_OF_GAME_FX");

    const dealt = advancePregame(played, cardDb, []).state;
    expect(dealt.pregame?.phase).toBe("MULLIGAN_DECISIONS");
    expect(dealt.pregame?.startOfGameEffectsResolved).toEqual([true, true]);
    expect(dealt.players[0].hand).toHaveLength(5);
    expect(dealt.players[1].hand).toHaveLength(5);
  });

  it("routes the resumed Stage play through the pipeline before pregame advances", async () => {
    const { state, cardDb } = buildState([true, false], [true, false]);
    const chosen = chooseFirstPlayer(state, cardDb, "FIRST");
    const prompted = advancePregame(chosen, cardDb, []).state;
    const prompt = prompted.pendingPrompt;
    if (!prompt || prompt.options.promptType !== "ARRANGE_TOP_CARDS") {
      throw new Error("Expected Mary Geoise search prompt");
    }
    const revealedIds = prompt.options.cards.map((card) => card.instanceId);
    const session = new GameSession(
      new MockDurableObjectState() as unknown as DurableObjectState,
      { GAME_WORKER_SECRET: "test", NEXTJS_URL: "https://app.example.test" } as Env,
    ) as unknown as TestSession;
    session.gameState = prompted;
    session.cardDb = cardDb;

    await session.handleAction(new MockWebSocket() as unknown as WebSocket, 0, {
      type: "ARRANGE_TOP_CARDS",
      keptCardInstanceId: revealedIds[0],
      orderedInstanceIds: revealedIds.slice(1),
      destination: "bottom",
    });

    const stage = session.gameState.players[0].stage;
    expect(stage?.cardId).toBe(MARY_GEOISE.id);
    expect(session.gameState.activeEffects).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceCardInstanceId: stage?.instanceId,
        sourceEffectBlockId: "permanent_play_cost_reduction",
      }),
    ]));
    expect(session.gameState.pregame?.phase).toBe("MULLIGAN_DECISIONS");
  });

  it("allows the optional play to be declined and still shuffles the deck", () => {
    const { state, cardDb } = buildState([true, false], [true, false]);
    const chosen = chooseFirstPlayer(state, cardDb, "FIRST");
    const prompted = advancePregame(chosen, cardDb, []).state;
    const rngStateBeforeShuffle = prompted.executionContext.rngState;

    const declined = answerSearch(prompted, cardDb, false);
    expect(declined.players[0].stage).toBeNull();
    expect(declined.players[0].deck.filter((card) => card.cardId === MARY_GEOISE.id)).toHaveLength(2);
    expect(declined.executionContext.rngState).not.toBe(rngStateBeforeShuffle);
  });

  it("resolves both Leaders in priority-decider order", () => {
    const { state, cardDb } = buildState([true, true], [true, true]);
    const chosen = chooseFirstPlayer(state, cardDb, "SECOND");
    const firstPrompt = advancePregame(chosen, cardDb, []).state;

    expect(firstPrompt.pregame?.firstPlayerIndex).toBe(1);
    expect(firstPrompt.pregame?.priorityDeciderIndex).toBe(0);
    expect(firstPrompt.pendingPrompt?.respondingPlayer).toBe(0);
    expect(firstPrompt.pregame?.startOfGameEffectsResolved).toEqual([true, false]);

    const firstDone = answerSearch(firstPrompt, cardDb, false);
    const secondPrompt = advancePregame(firstDone, cardDb, []).state;
    expect(secondPrompt.pendingPrompt?.respondingPlayer).toBe(1);
    expect(secondPrompt.pregame?.startOfGameEffectsResolved).toEqual([true, true]);
    expect(secondPrompt.players[0].hand).toHaveLength(0);
    expect(secondPrompt.players[1].hand).toHaveLength(0);
  });

  it("fires a one-sided Solitaire Imu after the configured first side", () => {
    const { state, cardDb } = buildState(
      [false, true],
      [false, true],
      "SIDE_A_FIRST",
    );
    const prompted = advancePregame(state, cardDb, []).state;

    expect(prompted.pregame?.firstPlayerIndex).toBe(0);
    expect(prompted.pregame?.priorityDeciderIndex).toBe(0);
    expect(prompted.pendingPrompt?.respondingPlayer).toBe(1);
    expect(prompted.pregame?.startOfGameEffectsResolved).toEqual([true, true]);
  });

  it.each([
    ["SIDE_A_FIRST", 0],
    ["SIDE_B_FIRST", 1],
  ] as const)(
    "resolves both Solitaire Imu Leaders in %s order",
    (pregameMode, firstPlayerIndex) => {
      const { state, cardDb } = buildState(
        [true, true],
        [true, true],
        pregameMode,
      );
      const firstPrompt = advancePregame(state, cardDb, []).state;

      expect(firstPrompt.pregame?.firstPlayerIndex).toBe(firstPlayerIndex);
      expect(firstPrompt.pregame?.priorityDeciderIndex).toBe(firstPlayerIndex);
      expect(firstPrompt.pendingPrompt?.respondingPlayer).toBe(
        firstPlayerIndex,
      );
      expect(firstPrompt.pregame?.startOfGameEffectsResolved).toEqual(
        firstPlayerIndex === 0 ? [true, false] : [false, true],
      );

      const firstDone = answerSearch(firstPrompt, cardDb, false);
      const secondPrompt = advancePregame(firstDone, cardDb, []).state;
      expect(secondPrompt.pendingPrompt?.respondingPlayer).toBe(
        firstPlayerIndex === 0 ? 1 : 0,
      );
      expect(secondPrompt.pregame?.startOfGameEffectsResolved).toEqual([
        true,
        true,
      ]);
    },
  );

  it("handles a zero-match search, shuffles, and advances without prompting", () => {
    const { state, cardDb } = buildState([true, false], [false, false]);
    const chosen = chooseFirstPlayer(state, cardDb, "FIRST");
    const rngStateBeforeShuffle = chosen.executionContext.rngState;
    const result = advancePregame(chosen, cardDb, []).state;

    expect(result.executionContext.rngState).not.toBe(rngStateBeforeShuffle);
    expect(result.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");
    expect(result.pregame?.phase).toBe("MULLIGAN_DECISIONS");
    expect(result.pregame?.startOfGameEffectsResolved).toEqual([true, true]);
  });

  it("does not advance an unresolved prompt and resumes after JSON persistence", () => {
    const { state, cardDb } = buildState([true, false], [true, false]);
    const chosen = chooseFirstPlayer(state, cardDb, "FIRST");
    const prompted = advancePregame(chosen, cardDb, []).state;
    const stillPrompted = advancePregame(prompted, cardDb, []).state;

    expect(stillPrompted.pendingPrompt).toEqual(prompted.pendingPrompt);
    expect(stillPrompted.effectStack).toEqual(prompted.effectStack);
    expect(stillPrompted.players[0].hand).toHaveLength(0);

    const restored = JSON.parse(JSON.stringify(stillPrompted)) as GameState;
    const resumed = answerSearch(restored, cardDb, true);
    expect(resumed.players[0].stage?.cardId).toBe(MARY_GEOISE.id);
    expect(resumed.effectStack).toHaveLength(0);
  });
});
