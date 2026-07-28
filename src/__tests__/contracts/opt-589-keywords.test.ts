import type { Card } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { buildGameInitPayload } from "@/lib/game/init-payload";
import { executePass } from "@engine/engine/battle.js";
import { canAttackThisTurn } from "@engine/engine/keywords.js";
import { prepareDecksAndLeaders } from "@engine/engine/setup.js";
import { registerPermanentEffectsForCard } from "@engine/engine/triggers.js";
import { validate } from "@engine/engine/validation.js";
import type {
  CardInstance,
  GameState,
} from "@engine/types.js";
import type { RuntimeActiveEffect } from "@engine/engine/effect-types.js";

type GrantableKeyword =
  | "RUSH"
  | "RUSH_CHARACTER"
  | "DOUBLE_ATTACK"
  | "BANISH"
  | "BLOCKER"
  | "UNBLOCKABLE";

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

function buildBoundary(card: Card, controller: 0 | 1 = 0) {
  const leader0 = makeCard("BOUNDARY-LEADER-0", {
    type: "Leader",
    cost: null,
    power: 5000,
    life: 5,
  });
  const leader1 = makeCard("BOUNDARY-LEADER-1", {
    type: "Leader",
    cost: null,
    power: 5000,
    life: 5,
  });
  const filler0 = makeCard("BOUNDARY-FILLER-0");
  const filler1 = makeCard("BOUNDARY-FILLER-1");
  const payload = buildGameInitPayload({
    gameId: `opt-589-${card.id}`,
    format: "Standard",
    mode: "SOLITAIRE",
    pregameMode: "SOLITAIRE_RANDOM",
    player1: {
      userId: "player-0",
      leader: leader0,
      deck: makeDeck(controller === 0 ? card : filler0),
    },
    player2: {
      userId: "player-1",
      leader: leader1,
      deck: makeDeck(controller === 1 ? card : filler1),
    },
  });
  const prepared = prepareDecksAndLeaders(
    payload as unknown as Parameters<typeof prepareDecksAndLeaders>[0],
  );
  const source = prepared.state.players[controller].deck[0];
  const character: CardInstance = {
    ...source,
    zone: "CHARACTER",
    state: "ACTIVE",
    turnPlayed: 2,
  };
  let state: GameState = {
    ...prepared.state,
    status: "IN_PROGRESS",
    players: prepared.state.players.map((player, index) =>
      index === controller
        ? {
            ...player,
            deck: player.deck.slice(1),
            characters: [character, null, null, null, null],
          }
        : player,
    ) as GameState["players"],
    turn: {
      ...prepared.state.turn,
      number: 2,
      activePlayerIndex: controller,
      phase: "MAIN",
      battleSubPhase: null,
      battle: null,
    },
  };
  const cardData = prepared.cardDb.get(card.id)!;
  state = registerPermanentEffectsForCard(state, character, cardData);
  return { state, cardDb: prepared.cardDb, character, cardData };
}

function negate(
  state: GameState,
  target: CardInstance,
): GameState {
  const effect: RuntimeActiveEffect = {
    id: `negate-${target.instanceId}`,
    sourceCardInstanceId: "external-negator",
    sourceEffectBlockId: "negate",
    category: "auto",
    modifiers: [{ type: "NEGATE_EFFECTS_FLAG", params: {} }],
    duration: { type: "THIS_TURN" },
    expiresAt: { wave: "END_OF_TURN", turn: state.turn.number },
    controller: target.controller,
    appliesTo: [target.instanceId],
    timestamp: 1,
  };
  return { ...state, activeEffects: [...state.activeEffects, effect] };
}

function grantKeyword(
  state: GameState,
  target: CardInstance,
  keyword: GrantableKeyword,
): GameState {
  const effect: RuntimeActiveEffect = {
    id: `grant-${keyword}-${target.instanceId}`,
    sourceCardInstanceId: `external-${keyword}`,
    sourceEffectBlockId: "grant",
    category: "auto",
    modifiers: [
      {
        type: "GRANT_KEYWORD",
        target: { type: "SELF" },
        params: { keyword },
      },
    ],
    duration: { type: "THIS_TURN" },
    expiresAt: { wave: "END_OF_TURN", turn: state.turn.number },
    controller: target.controller,
    appliesTo: [target.instanceId],
    timestamp: 2,
  };
  return { ...state, activeEffects: [...state.activeEffects, effect] };
}

function placeDeckCharacter(
  state: GameState,
  controller: 0 | 1,
): { state: GameState; character: CardInstance } {
  const source = state.players[controller].deck[0];
  const character: CardInstance = {
    ...source,
    zone: "CHARACTER",
    state: "ACTIVE",
    turnPlayed: null,
  };
  return {
    state: {
      ...state,
      players: state.players.map((player, index) =>
        index === controller
          ? {
              ...player,
              deck: player.deck.slice(1),
              characters: [character, ...player.characters.slice(1)],
            }
          : player,
      ) as GameState["players"],
    },
    character,
  };
}

function withLeaderDamageBattle(
  state: GameState,
  attacker: CardInstance,
  lifeCount: number,
): GameState {
  const life = Array.from({ length: lifeCount }, (_, index) => ({
    instanceId: `keyword-life-${index}`,
    cardId: "BOUNDARY-FILLER-1",
    face: "DOWN" as const,
  }));
  return {
    ...state,
    players: [
      state.players[0],
      { ...state.players[1], life, hand: [], trash: [] },
    ],
    turn: {
      ...state.turn,
      activePlayerIndex: 0,
      battleSubPhase: "COUNTER_STEP",
      battle: {
        battleId: `keyword-battle-${attacker.instanceId}`,
        attackerInstanceId: attacker.instanceId,
        targetInstanceId: state.players[1].leader.instanceId,
        attackerPower: 6000,
        defenderPower: 5000,
        counterPowerAdded: 0,
        blockerActivated: false,
      },
    },
  };
}

describe("OPT-589 app payload to worker keyword legality", () => {
  it("gates ST01-004 Rush on its authored DON!! x2 condition", () => {
    const sanji = makeCard("ST01-004", {
      name: "Sanji",
      effectText: "[DON!! x2] This Character gains [Rush].",
    });
    const boundary = buildBoundary(sanji);
    const target = boundary.state.players[1].leader.instanceId;

    expect(
      validate(
        boundary.state,
        {
          type: "DECLARE_ATTACK",
          attackerInstanceId: boundary.character.instanceId,
          targetInstanceId: target,
        },
        boundary.cardDb,
        0,
      ),
    ).toBe("This card cannot attack this turn");

    const attached = [0, 1].map((index) => ({
      instanceId: `don-${index}`,
      state: "RESTED" as const,
      attachedTo: boundary.character.instanceId,
    }));
    const withDon = {
      ...boundary.state,
      players: boundary.state.players.map((player, index) =>
        index === 0
          ? {
              ...player,
              characters: player.characters.map((character) =>
                character?.instanceId === boundary.character.instanceId
                  ? { ...character, attachedDon: attached }
                  : character,
              ),
            }
          : player,
      ) as GameState["players"],
    };

    expect(
      validate(
        withDon,
        {
          type: "DECLARE_ATTACK",
          attackerInstanceId: boundary.character.instanceId,
          targetInstanceId: target,
        },
        boundary.cardDb,
        0,
      ),
    ).toBeNull();
  });

  it("does not let OP02-074 declare itself as Blocker", () => {
    const saldeath = makeCard("OP02-074", {
      name: "Saldeath",
      effectText: "Your [Blugori] gains [Blocker].",
    });
    const boundary = buildBoundary(saldeath, 0);
    const state: GameState = {
      ...boundary.state,
      turn: {
        ...boundary.state.turn,
        activePlayerIndex: 1,
        battleSubPhase: "BLOCK_STEP",
        battle: {
          battleId: "opt-589-block",
          attackerInstanceId: boundary.state.players[1].leader.instanceId,
          targetInstanceId: boundary.state.players[0].leader.instanceId,
          attackerPower: 5000,
          defenderPower: 5000,
          counterPowerAdded: 0,
          blockerActivated: false,
        },
      },
    };

    expect(
      validate(
        state,
        {
          type: "DECLARE_BLOCKER",
          blockerInstanceId: boundary.character.instanceId,
        },
        boundary.cardDb,
        0,
      ),
    ).toBe("This card does not have [Blocker]");
  });

  it("deals one damage when OP07-009 only grants Double Attack to another card", () => {
    const dogura = makeCard("OP07-009", {
      name: "Dogura & Magura",
      cost: 2,
      power: 6000,
      effectText:
        "[On Play] Up to 1 of your red Characters with a cost of 1 gains [Double Attack] during this turn.",
    });
    const boundary = buildBoundary(dogura);
    const life = [0, 1, 2].map((index) => ({
      instanceId: `life-${index}`,
      cardId: "BOUNDARY-FILLER-1",
      face: "DOWN" as const,
    }));
    const state: GameState = {
      ...boundary.state,
      players: [
        boundary.state.players[0],
        { ...boundary.state.players[1], life },
      ],
      turn: {
        ...boundary.state.turn,
        battleSubPhase: "COUNTER_STEP",
        battle: {
          battleId: "opt-589-double-attack",
          attackerInstanceId: boundary.character.instanceId,
          targetInstanceId: boundary.state.players[1].leader.instanceId,
          attackerPower: 4000,
          defenderPower: 0,
          counterPowerAdded: 0,
          blockerActivated: false,
        },
      },
    };

    const result = executePass(state, boundary.cardDb);
    expect(result.state.players[1].life).toHaveLength(2);
  });

  it("preserves Rush negation and external-grant semantics from OPT-253", () => {
    const zoro = makeCard("OP01-025", {
      name: "Roronoa Zoro",
      effectText: "[Rush] (This card can attack on the turn in which it is played.)",
    });
    const printed = buildBoundary(zoro);
    expect(
      canAttackThisTurn(
        printed.character,
        printed.cardData,
        printed.state,
        printed.cardDb,
      ),
    ).toBe(true);
    expect(
      canAttackThisTurn(
        printed.character,
        printed.cardData,
        negate(printed.state, printed.character),
        printed.cardDb,
      ),
    ).toBe(false);
    const negatedAndGranted = grantKeyword(
      negate(printed.state, printed.character),
      printed.character,
      "RUSH",
    );
    expect(
      canAttackThisTurn(
        printed.character,
        printed.cardData,
        negatedAndGranted,
        printed.cardDb,
      ),
    ).toBe(true);
  });

  it("preserves Rush: Character negation and external-grant semantics", () => {
    const fisherTiger = makeCard("OP07-032", {
      name: "Fisher Tiger",
      effectText:
        "This Character can attack Characters on the turn in which it is played.",
    });
    const printed = buildBoundary(fisherTiger);
    const negated = negate(printed.state, printed.character);

    expect(
      canAttackThisTurn(
        printed.character,
        printed.cardData,
        negated,
        printed.cardDb,
      ),
    ).toBe(false);
    expect(
      canAttackThisTurn(
        printed.character,
        printed.cardData,
        grantKeyword(negated, printed.character, "RUSH_CHARACTER"),
        printed.cardDb,
      ),
    ).toBe(true);
  });

  it("preserves Blocker negation and external-grant semantics", () => {
    const blocker = makeCard("ST23-001", {
      name: "Uta",
      effectText: "[Blocker]",
    });
    const printed = buildBoundary(blocker);
    const battle: GameState = {
      ...printed.state,
      turn: {
        ...printed.state.turn,
        activePlayerIndex: 1,
        battleSubPhase: "BLOCK_STEP",
        battle: {
          battleId: "keyword-blocker",
          attackerInstanceId: printed.state.players[1].leader.instanceId,
          targetInstanceId: printed.state.players[0].leader.instanceId,
          attackerPower: 5000,
          defenderPower: 5000,
          counterPowerAdded: 0,
          blockerActivated: false,
        },
      },
    };
    const action = {
      type: "DECLARE_BLOCKER" as const,
      blockerInstanceId: printed.character.instanceId,
    };
    const negated = negate(battle, printed.character);

    expect(validate(negated, action, printed.cardDb, 0)).toBe(
      "This card does not have [Blocker]",
    );
    expect(
      validate(
        grantKeyword(negated, printed.character, "BLOCKER"),
        action,
        printed.cardDb,
        0,
      ),
    ).toBeNull();
  });

  it("preserves Unblockable negation and external-grant semantics", () => {
    const morley = makeCard("OP16-033", {
      name: "Morley",
      power: 6000,
      effectText: "[Unblockable]",
    });
    const printed = buildBoundary(morley);
    const defender = placeDeckCharacter(printed.state, 1);
    const defenderCanBlock = grantKeyword(
      defender.state,
      defender.character,
      "BLOCKER",
    );
    const battle: GameState = {
      ...defenderCanBlock,
      turn: {
        ...defenderCanBlock.turn,
        activePlayerIndex: 0,
        battleSubPhase: "BLOCK_STEP",
        battle: {
          battleId: "keyword-unblockable",
          attackerInstanceId: printed.character.instanceId,
          targetInstanceId: defenderCanBlock.players[1].leader.instanceId,
          attackerPower: 6000,
          defenderPower: 5000,
          counterPowerAdded: 0,
          blockerActivated: false,
        },
      },
    };
    const action = {
      type: "DECLARE_BLOCKER" as const,
      blockerInstanceId: defender.character.instanceId,
    };
    const negated = negate(battle, printed.character);

    expect(validate(negated, action, printed.cardDb, 1)).toBeNull();
    expect(
      validate(
        grantKeyword(negated, printed.character, "UNBLOCKABLE"),
        action,
        printed.cardDb,
        1,
      ),
    ).toBe("Attacker has [Unblockable]");
  });

  it("preserves Double Attack negation and external-grant semantics", () => {
    const newgate = makeCard("ST22-003", {
      name: "Edward.Newgate",
      power: 6000,
      effectText: "[Double Attack]",
    });
    const printed = buildBoundary(newgate);
    const battle = withLeaderDamageBattle(
      printed.state,
      printed.character,
      3,
    );
    const negated = negate(battle, printed.character);

    expect(executePass(negated, printed.cardDb).state.players[1].life).toHaveLength(2);
    expect(
      executePass(
        grantKeyword(negated, printed.character, "DOUBLE_ATTACK"),
        printed.cardDb,
      ).state.players[1].life,
    ).toHaveLength(1);
  });

  it("preserves Banish negation and external-grant semantics", () => {
    const luffy = makeCard("OP04-014", {
      name: "Monkey.D.Luffy",
      power: 6000,
      effectText: "[Banish]",
    });
    const printed = buildBoundary(luffy);
    const battle = withLeaderDamageBattle(
      printed.state,
      printed.character,
      1,
    );
    const negatedResult = executePass(
      negate(battle, printed.character),
      printed.cardDb,
    ).state;
    expect(negatedResult.players[1].hand).toHaveLength(1);
    expect(negatedResult.players[1].trash).toHaveLength(0);

    const grantedResult = executePass(
      grantKeyword(
        negate(battle, printed.character),
        printed.character,
        "BANISH",
      ),
      printed.cardDb,
    ).state;
    expect(grantedResult.players[1].hand).toHaveLength(0);
    expect(grantedResult.players[1].trash).toHaveLength(1);
  });
});
