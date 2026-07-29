import type { Card } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { buildGameInitPayload } from "@/lib/game/init-payload";
import { canAttackThisTurn } from "@engine/engine/keywords.js";
import { derivePrintedKeywords } from "@engine/engine/printed-keywords.js";
import { prepareDecksAndLeaders } from "@engine/engine/setup.js";
import { registerPermanentEffectsForCard } from "@engine/engine/triggers.js";
import { validate } from "@engine/engine/validation.js";
import type { CardData, CardInstance, GameState } from "@engine/types.js";

function makeCard(id: string, overrides: Partial<Card> = {}): Card {
  return {
    id,
    originSet: "OP-TEST",
    name: id,
    color: ["Red"],
    type: "Character",
    cost: 3,
    power: 4000,
    counter: 1000,
    attribute: ["Strike"],
    life: null,
    traits: ["Contract"],
    rarity: "C",
    effectText: "",
    triggerText: null,
    effectSchema: null,
    imageUrl: `https://example.test/${id}.png`,
    blockNumber: 1,
    banStatus: "LEGAL",
    isReprint: false,
    ...overrides,
  };
}

function makeDeck(card: Card) {
  return {
    leaderArtUrl: null,
    sleeveUrl: null,
    donArtUrl: null,
    testOrder: null,
    cards: [{ card, quantity: 50, selectedArtUrl: null }],
  };
}

function buildBoundary() {
  const zoro = makeCard("EB02-019", {
    name: "Roronoa Zoro",
    effectText:
      "If your opponent has 2 or more Characters, this Character can attack Characters on the turn in which it is played.\n[On Play] If your Leader has the {Straw Hat Crew} type, rest up to 1 of your opponent's Characters with a cost of 4 or less.",
  });
  const opponentCharacter = makeCard("OPT-592-OPPONENT");
  const leader0 = makeCard("OPT-592-LEADER-0", {
    type: "Leader",
    cost: null,
    power: 5000,
    life: 5,
  });
  const leader1 = makeCard("OPT-592-LEADER-1", {
    type: "Leader",
    cost: null,
    power: 5000,
    life: 5,
  });
  const payload = buildGameInitPayload({
    gameId: "opt-592-eb02-019",
    format: "Standard",
    mode: "SOLITAIRE",
    pregameMode: "SOLITAIRE_RANDOM",
    player1: {
      userId: "player-0",
      leader: leader0,
      deck: makeDeck(zoro),
    },
    player2: {
      userId: "player-1",
      leader: leader1,
      deck: makeDeck(opponentCharacter),
    },
  });
  const prepared = prepareDecksAndLeaders(
    payload as unknown as Parameters<typeof prepareDecksAndLeaders>[0]
  );
  const source = prepared.state.players[0].deck[0];
  const zoroInstance: CardInstance = {
    ...source,
    zone: "CHARACTER",
    state: "ACTIVE",
    turnPlayed: 2,
  };
  let state: GameState = {
    ...prepared.state,
    status: "IN_PROGRESS",
    players: [
      {
        ...prepared.state.players[0],
        deck: prepared.state.players[0].deck.slice(1),
        characters: [zoroInstance, null, null, null, null],
      },
      prepared.state.players[1],
    ],
    turn: {
      ...prepared.state.turn,
      number: 2,
      activePlayerIndex: 0,
      phase: "MAIN",
      battleSubPhase: null,
      battle: null,
    },
  };
  const cardData = prepared.cardDb.get(zoro.id)!;
  state = registerPermanentEffectsForCard(state, zoroInstance, cardData);

  return {
    state,
    cardDb: prepared.cardDb,
    zoro: zoroInstance,
    cardData,
  };
}

function withOpposingCharacters(
  state: GameState,
  count: 0 | 1 | 2
): { state: GameState; targetInstanceId?: string } {
  const characters = state.players[1].deck.slice(0, count).map((card) => ({
    ...card,
    zone: "CHARACTER" as const,
    state: "RESTED" as const,
    turnPlayed: null,
  }));
  return {
    state: {
      ...state,
      players: [
        state.players[0],
        {
          ...state.players[1],
          deck: state.players[1].deck.slice(count),
          characters: [...characters, ...Array(5 - count).fill(null)],
        },
      ],
    },
    targetInstanceId: characters[0]?.instanceId,
  };
}

function validateCharacterAttack(
  state: GameState,
  zoro: CardInstance,
  targetInstanceId: string,
  cardDb: Map<string, CardData>
) {
  return validate(
    state,
    {
      type: "DECLARE_ATTACK",
      attackerInstanceId: zoro.instanceId,
      targetInstanceId,
    },
    cardDb,
    0
  );
}

describe("OPT-592 EB02-019 conditional Rush: Character", () => {
  it("cannot attack on its play turn with 0 opposing Characters", () => {
    const boundary = buildBoundary();

    expect(
      canAttackThisTurn(
        boundary.zoro,
        boundary.cardData,
        boundary.state,
        boundary.cardDb
      )
    ).toBe(false);
  });

  it("cannot attack a Character on its play turn with exactly 1 opposing Character", () => {
    const boundary = buildBoundary();
    const withOne = withOpposingCharacters(boundary.state, 1);

    expect(
      validateCharacterAttack(
        withOne.state,
        boundary.zoro,
        withOne.targetInstanceId!,
        boundary.cardDb
      )
    ).toBe("This card cannot attack this turn");
  });

  it("can attack a Character on its play turn with 2 opposing Characters", () => {
    const boundary = buildBoundary();
    const withTwo = withOpposingCharacters(boundary.state, 2);

    expect(
      validateCharacterAttack(
        withTwo.state,
        boundary.zoro,
        withTwo.targetInstanceId!,
        boundary.cardDb
      )
    ).toBeNull();
  });

  it("gains attack legality when the opponent reaches 2 Characters after Zoro is played", () => {
    const boundary = buildBoundary();
    expect(
      canAttackThisTurn(
        boundary.zoro,
        boundary.cardData,
        boundary.state,
        boundary.cardDb
      )
    ).toBe(false);

    const withTwo = withOpposingCharacters(boundary.state, 2);
    expect(
      validateCharacterAttack(
        withTwo.state,
        boundary.zoro,
        withTwo.targetInstanceId!,
        boundary.cardDb
      )
    ).toBeNull();
  });

  it("loses attack legality when the opponent drops from 2 Characters to 1", () => {
    const boundary = buildBoundary();
    const withTwo = withOpposingCharacters(boundary.state, 2);
    expect(
      validateCharacterAttack(
        withTwo.state,
        boundary.zoro,
        withTwo.targetInstanceId!,
        boundary.cardDb
      )
    ).toBeNull();

    const remainingTarget = withTwo.state.players[1].characters[0]!;
    const knockedOut = withTwo.state.players[1].characters[1]!;
    const withOne: GameState = {
      ...withTwo.state,
      players: [
        withTwo.state.players[0],
        {
          ...withTwo.state.players[1],
          characters: [remainingTarget, null, null, null, null],
          trash: [
            ...withTwo.state.players[1].trash,
            { ...knockedOut, zone: "TRASH" },
          ],
        },
      ],
    };
    expect(
      validateCharacterAttack(
        withOne,
        boundary.zoro,
        remainingTarget.instanceId,
        boundary.cardDb
      )
    ).toBe("This card cannot attack this turn");
  });

  it("keeps the conditional keyword runtime-only rather than intrinsic", () => {
    const boundary = buildBoundary();

    expect(boundary.cardData.keywords.rushCharacter).toBe(false);
    expect(
      derivePrintedKeywords(boundary.cardData, boundary.cardData.effectSchema)
        .rushCharacter
    ).toBe(false);
  });
});
