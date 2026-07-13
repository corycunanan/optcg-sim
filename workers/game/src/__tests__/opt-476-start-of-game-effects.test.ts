import { describe, expect, it, vi } from "vitest";
import type { CardData, GameInitPayload, GameState } from "../types.js";
import { advancePregame, resumePregameFromPrompt, startPregame } from "../engine/pregame.js";
import { resumeFromStack } from "../engine/effect-resolver/resume.js";
import { prepareDecksAndLeaders } from "../engine/setup.js";
import { filterStateForPlayer } from "../engine/state.js";
import { CARDS, createTestPayload } from "./helpers.js";

const FIXED_RNG = () => 0.5;

const IMU: CardData = {
  ...CARDS.LEADER,
  id: "OP13-079",
  name: "Imu",
  types: ["The Five Elders"],
};

const MARY_GEOISE: CardData = {
  ...CARDS.STAGE,
  id: "MARY-GEOISE-STAGE",
  name: "Mary Geoise",
  types: ["Mary Geoise"],
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
): { state: GameState; cardDb: Map<string, CardData> } {
  const payload = createTestPayload();
  if (imuPlayers[0]) payload.player1 = withImu(payload.player1, maryPlayers[0]);
  if (imuPlayers[1]) payload.player2 = withImu(payload.player2, maryPlayers[1]);
  const { state, cardDb } = prepareDecksAndLeaders(payload);
  return { state: startPregame(state), cardDb };
}

function chooseFirstPlayer(
  state: GameState,
  cardDb: Map<string, CardData>,
  choiceId: "FIRST" | "SECOND",
): GameState {
  const rolled = advancePregame(state, cardDb, [5, 3], FIXED_RNG).state;
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
    const prompted = advancePregame(chosen, cardDb, [], FIXED_RNG).state;

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

    const dealt = advancePregame(played, cardDb, [], FIXED_RNG).state;
    expect(dealt.pregame?.phase).toBe("MULLIGAN_DECISIONS");
    expect(dealt.pregame?.startOfGameEffectsResolved).toEqual([true, true]);
    expect(dealt.players[0].hand).toHaveLength(5);
    expect(dealt.players[1].hand).toHaveLength(5);
  });

  it("allows the optional play to be declined and still shuffles the deck", () => {
    const { state, cardDb } = buildState([true, false], [true, false]);
    const chosen = chooseFirstPlayer(state, cardDb, "FIRST");
    const prompted = advancePregame(chosen, cardDb, [], FIXED_RNG).state;
    const random = vi.spyOn(Math, "random").mockReturnValue(0);

    const declined = answerSearch(prompted, cardDb, false);
    expect(declined.players[0].stage).toBeNull();
    expect(declined.players[0].deck.filter((card) => card.cardId === MARY_GEOISE.id)).toHaveLength(2);
    expect(random).toHaveBeenCalled();
    random.mockRestore();
  });

  it("resolves both Leaders in first-player order", () => {
    const { state, cardDb } = buildState([true, true], [true, true]);
    const chosen = chooseFirstPlayer(state, cardDb, "SECOND");
    const firstPrompt = advancePregame(chosen, cardDb, [], FIXED_RNG).state;

    expect(firstPrompt.pregame?.firstPlayerIndex).toBe(1);
    expect(firstPrompt.pendingPrompt?.respondingPlayer).toBe(1);
    expect(firstPrompt.pregame?.startOfGameEffectsResolved).toEqual([false, true]);

    const firstDone = answerSearch(firstPrompt, cardDb, false);
    const secondPrompt = advancePregame(firstDone, cardDb, [], FIXED_RNG).state;
    expect(secondPrompt.pendingPrompt?.respondingPlayer).toBe(0);
    expect(secondPrompt.pregame?.startOfGameEffectsResolved).toEqual([true, true]);
    expect(secondPrompt.players[0].hand).toHaveLength(0);
    expect(secondPrompt.players[1].hand).toHaveLength(0);
  });

  it("handles a zero-match search, shuffles, and advances without prompting", () => {
    const { state, cardDb } = buildState([true, false], [false, false]);
    const chosen = chooseFirstPlayer(state, cardDb, "FIRST");
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    const result = advancePregame(chosen, cardDb, [], FIXED_RNG).state;

    expect(random).toHaveBeenCalled();
    expect(result.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");
    expect(result.pregame?.phase).toBe("MULLIGAN_DECISIONS");
    expect(result.pregame?.startOfGameEffectsResolved).toEqual([true, true]);
    random.mockRestore();
  });

  it("does not advance an unresolved prompt and resumes after JSON persistence", () => {
    const { state, cardDb } = buildState([true, false], [true, false]);
    const chosen = chooseFirstPlayer(state, cardDb, "FIRST");
    const prompted = advancePregame(chosen, cardDb, [], FIXED_RNG).state;
    const stillPrompted = advancePregame(prompted, cardDb, [], FIXED_RNG).state;

    expect(stillPrompted.pendingPrompt).toEqual(prompted.pendingPrompt);
    expect(stillPrompted.effectStack).toEqual(prompted.effectStack);
    expect(stillPrompted.players[0].hand).toHaveLength(0);

    const restored = JSON.parse(JSON.stringify(stillPrompted)) as GameState;
    const resumed = answerSearch(restored, cardDb, true);
    expect(resumed.players[0].stage?.cardId).toBe(MARY_GEOISE.id);
    expect(resumed.effectStack).toHaveLength(0);
  });
});
