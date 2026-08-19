import { describe, expect, it } from "vitest";
import type { CardData, CardInstance, GameState, PlayerState } from "../types.js";
import { getEffectivePower } from "../engine/modifiers.js";
import { runPipeline } from "../engine/pipeline.js";
import { OP06_041_THE_ARK_NOAH } from "../engine/schemas/op06.js";
import { ST05_001_SHANKS } from "../engine/schemas/st05.js";
import {
  autoSelectTargets,
  computeAllValidTargets,
} from "../engine/effect-resolver/target-resolver.js";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
  padChars,
} from "./helpers.js";

const NO_KEYWORDS = {
  rush: false,
  rushCharacter: false,
  doubleAttack: false,
  banish: false,
  blocker: false,
  trigger: false,
  unblockable: false,
};

const ARK_NOAH: CardData = {
  id: "OP06-041",
  name: "The Ark Noah",
  type: "Stage",
  color: ["Green"],
  cost: 6,
  power: null,
  counter: null,
  life: null,
  attribute: [],
  types: ["Fish-Man Island"],
  effectText: "[On Play] Rest all of your opponent's Characters.",
  triggerText: "[Trigger] Play this card.",
  keywords: { ...NO_KEYWORDS, trigger: true },
  effectSchema: OP06_041_THE_ARK_NOAH,
  imageUrl: null,
};

const SHANKS: CardData = {
  id: "ST05-001",
  name: "Shanks",
  type: "Leader",
  color: ["Purple"],
  cost: null,
  power: 5000,
  counter: null,
  life: 5,
  attribute: ["Slash"],
  types: ["FILM", "The Four Emperors"],
  effectText:
    "[Activate: Main] [Once Per Turn] DON!! -3: All of your {FILM} type Characters gain +2000 power during this turn.",
  triggerText: null,
  keywords: NO_KEYWORDS,
  effectSchema: ST05_001_SHANKS,
  imageUrl: null,
};

const FILM_CHARACTER: CardData = {
  ...CARDS.VANILLA,
  id: "TEST-FILM",
  name: "Test FILM Character",
  types: ["FILM"],
};

function withPlayer(
  state: GameState,
  index: 0 | 1,
  patch: Partial<PlayerState>,
): GameState {
  const players = [...state.players] as [PlayerState, PlayerState];
  players[index] = { ...players[index], ...patch };
  return { ...state, players };
}

function character(
  cardId: string,
  controller: 0 | 1,
  instanceId: string,
): CardInstance {
  return {
    instanceId,
    cardId,
    zone: "CHARACTER",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: 1,
    controller,
    owner: controller,
  };
}

describe("implicit-all character targets", () => {
  it("auto-selects every ALL_* candidate without a count, including filtered targets", () => {
    const ids = ["a", "b", "c"];

    expect(autoSelectTargets({ type: "ALL_YOUR_CHARACTERS" }, ids)).toEqual(ids);
    expect(autoSelectTargets({ type: "ALL_OPPONENT_CHARACTERS" }, ids)).toEqual(ids);
    expect(
      autoSelectTargets(
        { type: "ALL_YOUR_CHARACTERS", filter: { traits: ["FILM"] } },
        ids,
      ),
    ).toEqual(ids);
  });

  it("keeps CHARACTER without a count limited to one candidate", () => {
    expect(autoSelectTargets({ type: "CHARACTER" }, ["a", "b", "c"])).toEqual([
      "a",
    ]);
  });

  it("filters ALL_OPPONENT_CHARACTERS candidates by cost", () => {
    const cardDb = createTestCardDb();
    let state = createBattleReadyState(cardDb);
    state = withPlayer(state, 1, {
      characters: padChars([
        character(CARDS.VANILLA.id, 1, "opponent-cost-3"),
        character(CARDS.RUSH.id, 1, "opponent-cost-2"),
        character(CARDS.DOUBLE_ATK.id, 1, "opponent-cost-4"),
      ]),
    });

    expect(
      computeAllValidTargets(
        state,
        { type: "ALL_OPPONENT_CHARACTERS", filter: { cost_max: 2 } },
        0,
        cardDb,
        state.players[0].leader.instanceId,
        new Map(),
      ),
    ).toEqual(["opponent-cost-2"]);
  });

  it("excludes the source from ALL_YOUR_CHARACTERS when exclude_self is set", () => {
    const cardDb = createTestCardDb();
    let state = createBattleReadyState(cardDb);
    const source = character(CARDS.VANILLA.id, 0, "source");
    state = withPlayer(state, 0, {
      characters: padChars([
        source,
        character(CARDS.BLOCKER.id, 0, "other-a"),
        character(CARDS.RUSH.id, 0, "other-b"),
      ]),
    });

    expect(
      computeAllValidTargets(
        state,
        { type: "ALL_YOUR_CHARACTERS", filter: { exclude_self: true } },
        0,
        cardDb,
        source.instanceId,
        new Map(),
      ),
    ).toEqual(["other-a", "other-b"]);
  });

  it("rests every opponent Character when The Ark Noah is played", () => {
    const cardDb = createTestCardDb();
    cardDb.set(ARK_NOAH.id, ARK_NOAH);
    let state = createBattleReadyState(cardDb);
    const arkInHand: CardInstance = {
      instanceId: "ark-noah-hand",
      cardId: ARK_NOAH.id,
      zone: "HAND",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: null,
      controller: 0,
      owner: 0,
    };
    const opponentCharacters = [
      character(CARDS.VANILLA.id, 1, "opponent-a"),
      character(CARDS.BLOCKER.id, 1, "opponent-b"),
      character(CARDS.RUSH.id, 1, "opponent-c"),
    ];
    state = withPlayer(state, 0, {
      hand: [...state.players[0].hand, arkInHand],
    });
    state = withPlayer(state, 1, {
      characters: padChars(opponentCharacters),
    });

    const result = runPipeline(
      state,
      { type: "PLAY_CARD", cardInstanceId: arkInHand.instanceId },
      cardDb,
      0,
    );

    expect(result.valid).toBe(true);
    expect(result.pendingPrompt).toBeUndefined();
    expect(
      result.state.players[1].characters.filter(Boolean).map((card) => card!.state),
    ).toEqual(["RESTED", "RESTED", "RESTED"]);
  });

  it("buffs every FILM Character and excludes non-FILM Characters for ST05-001", () => {
    const cardDb = createTestCardDb();
    cardDb.set(SHANKS.id, SHANKS);
    cardDb.set(FILM_CHARACTER.id, FILM_CHARACTER);
    let state = createBattleReadyState(cardDb);
    const filmA = character(FILM_CHARACTER.id, 0, "film-a");
    const filmB = character(FILM_CHARACTER.id, 0, "film-b");
    const nonFilm = character(CARDS.VANILLA.id, 0, "non-film");
    state = withPlayer(state, 0, {
      leader: { ...state.players[0].leader, cardId: SHANKS.id },
      characters: padChars([filmA, filmB, nonFilm]),
    });

    const result = runPipeline(
      state,
      {
        type: "ACTIVATE_EFFECT",
        cardInstanceId: state.players[0].leader.instanceId,
        effectId: "activate_film_buff",
      },
      cardDb,
      0,
    );

    expect(result.valid).toBe(true);
    expect(getEffectivePower(filmA, FILM_CHARACTER, result.state, cardDb)).toBe(6000);
    expect(getEffectivePower(filmB, FILM_CHARACTER, result.state, cardDb)).toBe(6000);
    expect(getEffectivePower(nonFilm, CARDS.VANILLA, result.state, cardDb)).toBe(4000);
  });
});
