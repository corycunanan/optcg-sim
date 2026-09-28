/**
 * OPT-726 — conditional hand-zone self COUNTER_GRANT integration coverage.
 */

import { describe, expect, it } from "vitest";
import type {
  CardData,
  CardInstance,
  GameState,
  PlayerState,
} from "../types.js";
import { runPipeline } from "../engine/pipeline.js";
import { getEffectiveCounterValue } from "../engine/counter-value.js";
import {
  resolveEffect,
  resumeFromStack,
} from "../engine/effect-resolver/index.js";
import { visibleStateForPlayer } from "../session/visibility.js";
import { OP17_118_ROCKS_D_XEBEC } from "../engine/schemas/op17.js";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
  padChars,
} from "./helpers.js";

const OP17_118_DATA: CardData = {
  ...CARDS.RUSH,
  id: "OP17-118",
  name: "Rocks.D.Xebec",
  color: ["Blue"],
  cost: 9,
  power: 9000,
  counter: null,
  types: ["Rocks Pirates"],
  effectSchema: OP17_118_ROCKS_D_XEBEC,
};

type PlayerIndex = 0 | 1;

function handInstance(owner: PlayerIndex = 0): CardInstance {
  return {
    instanceId: "opt726-xebec-hand",
    cardId: OP17_118_DATA.id,
    zone: "HAND",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: null,
    controller: owner,
    owner,
  };
}

/**
 * Counter step where `defender` holds OP17-118 in hand and is being attacked.
 * `friendlyCharacters` go on the defender's field; `opponentCharacters` on the
 * attacker's field.
 */
function counterStepState(
  friendlyCharacters: CardInstance[],
  options: { defender?: PlayerIndex; opponentCharacters?: CardInstance[] } = {}
) {
  const defender = options.defender ?? 0;
  const attacker: PlayerIndex = defender === 0 ? 1 : 0;
  const cardDb = createTestCardDb();
  cardDb.set(OP17_118_DATA.id, OP17_118_DATA);
  const base = createBattleReadyState(cardDb);
  const players = [...base.players] as [PlayerState, PlayerState];
  players[defender] = {
    ...players[defender],
    hand: [handInstance(defender)],
    characters: padChars(friendlyCharacters),
  };
  players[attacker] = {
    ...players[attacker],
    characters: padChars(options.opponentCharacters ?? []),
  };
  const state: GameState = {
    ...base,
    players,
    turn: {
      ...base.turn,
      activePlayerIndex: attacker,
      battleSubPhase: "COUNTER_STEP",
      battle: {
        battleId: "opt726-battle",
        attackerInstanceId: players[attacker].leader.instanceId,
        targetInstanceId: players[defender].leader.instanceId,
        attackerPower: 5000,
        defenderPower: 5000,
        counterPowerAdded: 0,
        blockerActivated: false,
      },
    },
  };
  return { state, cardDb };
}

function friendlyCharacter(
  cardId: string,
  instanceId: string,
  controller: PlayerIndex = 0
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

function useXebecCounter(
  state: GameState,
  cardDb: Map<string, CardData>,
  defender: PlayerIndex = 0
) {
  return runPipeline(
    state,
    {
      type: "USE_COUNTER",
      cardInstanceId: "opt726-xebec-hand",
      counterTargetInstanceId: state.players[defender].leader.instanceId,
    },
    cardDb,
    defender
  );
}

function xebecHandCounter(
  state: GameState,
  cardDb: Map<string, CardData>,
  owner: PlayerIndex = 0
): number {
  const hand = state.players[owner].hand.find(
    (card) => card.instanceId === "opt726-xebec-hand"
  );
  if (!hand) throw new Error("missing OP17-118 hand card");
  return getEffectiveCounterValue(hand, OP17_118_DATA, state, cardDb);
}

describe("OPT-726: OP17-118 hand-zone self Counter", () => {
  describe.each([0, 1] as const)("held by defending player %i", (defender) => {
    it("grants +2000 at counter time when every friendly Character lacks a printed Counter", () => {
      const attacker: PlayerIndex = defender === 0 ? 1 : 0;
      // The opponent's printed-Counter Character must not block the grant:
      // the no-Counter predicate is scoped to the holder's own field.
      const { state, cardDb } = counterStepState(
        [friendlyCharacter(CARDS.RUSH.id, "counterless-character", defender)],
        {
          defender,
          opponentCharacters: [
            friendlyCharacter(CARDS.VANILLA.id, "opponent-printed", attacker),
          ],
        }
      );

      expect(xebecHandCounter(state, cardDb, defender)).toBe(2000);
      const result = useXebecCounter(state, cardDb, defender);

      expect(result.valid).toBe(true);
      expect(result.state.turn.battle?.counterPowerAdded).toBe(2000);
    });

    // OP17 FAQ p.8: "If I have 0 Characters, does this card have
    // 'Counter +2000'? A: No, it does not."
    it("does not grant Counter when the friendly field has zero Characters (FAQ)", () => {
      const { state, cardDb } = counterStepState([], { defender });

      const result = useXebecCounter(state, cardDb, defender);

      expect(result.valid).toBe(false);
      expect(result.error).toBe("This card has no counter value");
      expect(xebecHandCounter(state, cardDb, defender)).toBe(0);
    });
  });

  it("does not grant Counter when a friendly Character has a printed Counter", () => {
    const { state, cardDb } = counterStepState([
      friendlyCharacter(CARDS.VANILLA.id, "printed-counter-character"),
    ]);

    const result = useXebecCounter(state, cardDb);

    expect(result.valid).toBe(false);
    expect(result.error).toBe("This card has no counter value");
  });

  it("does not grant Counter on a mixed board with counterless and printed-Counter Characters", () => {
    const { state, cardDb } = counterStepState([
      friendlyCharacter(CARDS.RUSH.id, "counterless-character"),
      friendlyCharacter(CARDS.VANILLA.id, "printed-counter-character"),
    ]);

    const result = useXebecCounter(state, cardDb);

    expect(result.valid).toBe(false);
    expect(result.error).toBe("This card has no counter value");
    expect(xebecHandCounter(state, cardDb)).toBe(0);
  });

  it("ignores the opponent's counterless Characters when the friendly field is empty", () => {
    const { state, cardDb } = counterStepState([], {
      opponentCharacters: [
        friendlyCharacter(CARDS.RUSH.id, "opponent-counterless", 1),
      ],
    });

    const result = useXebecCounter(state, cardDb);

    expect(result.valid).toBe(false);
    expect(result.error).toBe("This card has no counter value");
    expect(xebecHandCounter(state, cardDb)).toBe(0);
  });

  it("turns the grant off when the only friendly Character leaves the field", () => {
    const { state, cardDb } = counterStepState([
      friendlyCharacter(CARDS.RUSH.id, "counterless-character"),
    ]);
    expect(xebecHandCounter(state, cardDb)).toBe(2000);

    const players = [...state.players] as [PlayerState, PlayerState];
    players[0] = { ...players[0], characters: padChars([]) };
    const emptied: GameState = { ...state, players };

    expect(xebecHandCounter(emptied, cardDb)).toBe(0);
    const result = useXebecCounter(emptied, cardDb);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("This card has no counter value");
  });

  it("publishes no effective Counter on the owner's visible hand card with zero Characters", () => {
    const { state, cardDb } = counterStepState([]);

    const visible = visibleStateForPlayer(state, cardDb, 0);
    const handCard = visible.players[0].hand[0] as CardInstance & {
      effectiveCounter?: number;
    };

    expect(handCard.effectiveCounter).toBe(0);
  });

  it("publishes the server-computed effective Counter on the owner's visible hand card", () => {
    const { state, cardDb } = counterStepState([
      friendlyCharacter(CARDS.RUSH.id, "counterless-character"),
    ]);

    const visible = visibleStateForPlayer(state, cardDb, 0);
    const handCard = visible.players[0].hand[0] as CardInstance & {
      effectiveCounter?: number;
    };

    expect(handCard.effectiveCounter).toBe(2000);

    const opponentView = visibleStateForPlayer(state, cardDb, 1);
    expect(opponentView.players[0].hand[0].effectiveCounter).toBeUndefined();
  });

  it("does not leak its HAND-only grant from an on-field OP17-118 to another hand Character", () => {
    const cardDb = createTestCardDb();
    cardDb.set(OP17_118_DATA.id, OP17_118_DATA);
    const counterlessData: CardData = {
      ...CARDS.RUSH,
      id: "OPT726-COUNTERLESS",
      name: "Counterless Character",
      counter: null,
      effectSchema: null,
    };
    cardDb.set(counterlessData.id, counterlessData);
    const base = createBattleReadyState(cardDb);
    const source = friendlyCharacter(OP17_118_DATA.id, "opt726-xebec-field");
    const handCard: CardInstance = {
      ...handInstance(),
      instanceId: "opt726-other-hand",
      cardId: counterlessData.id,
    };
    const players = [...base.players] as [PlayerState, PlayerState];
    players[0] = {
      ...players[0],
      characters: padChars([source]),
      hand: [handCard],
    };
    const state = { ...base, players };

    expect(
      getEffectiveCounterValue(handCard, counterlessData, state, cardDb)
    ).toBe(0);
  });

  it("evaluates an on-field conditional grant against the source card's controller", () => {
    const cardDb = createTestCardDb();
    const sourceData: CardData = {
      ...CARDS.RUSH,
      id: "OPT726-CONDITIONAL-SOURCE",
      name: "Conditional Source",
      effectSchema: {
        effects: [
          {
            id: "your_turn_counter_grant",
            category: "rule_modification",
            conditions: { type: "IS_MY_TURN", controller: "SELF" },
            rule: {
              rule_type: "COUNTER_GRANT",
              value: 1000,
              filter: { card_type: "CHARACTER", has_counter: false },
            },
          },
        ],
      },
    };
    const counterlessData: CardData = {
      ...CARDS.RUSH,
      id: "OPT726-CONDITIONAL-TARGET",
      name: "Conditional Target",
      counter: null,
      effectSchema: null,
    };
    cardDb.set(sourceData.id, sourceData);
    cardDb.set(counterlessData.id, counterlessData);
    const base = createBattleReadyState(cardDb);
    const source = friendlyCharacter(
      sourceData.id,
      "opt726-conditional-source"
    );
    const handCard: CardInstance = {
      ...handInstance(),
      instanceId: "opt726-conditional-target",
      cardId: counterlessData.id,
    };
    const players = [...base.players] as [PlayerState, PlayerState];
    players[0] = {
      ...players[0],
      characters: padChars([source]),
      hand: [handCard],
    };
    const opponentTurn = {
      ...base,
      players,
      turn: { ...base.turn, activePlayerIndex: 1 as const },
    };

    expect(
      getEffectiveCounterValue(handCard, counterlessData, opponentTurn, cardDb)
    ).toBe(0);
    expect(
      getEffectiveCounterValue(
        handCard,
        counterlessData,
        {
          ...opponentTurn,
          turn: { ...opponentTurn.turn, activePlayerIndex: 0 },
        },
        cardDb
      )
    ).toBe(1000);
  });
});

describe("OPT-726: OP17-118 On Play mixed-card support", () => {
  it("offers and freely plays a Rocks Pirates Stage from hand", () => {
    const cardDb = createTestCardDb();
    cardDb.set(OP17_118_DATA.id, OP17_118_DATA);
    const stageData: CardData = {
      ...CARDS.RUSH,
      id: "OP17-057",
      name: "Fullalead",
      type: "Stage",
      cost: 1,
      power: null,
      counter: null,
      types: ["Rocks Pirates"],
      effectSchema: null,
    };
    cardDb.set(stageData.id, stageData);
    const base = createBattleReadyState(cardDb);
    const source = friendlyCharacter(OP17_118_DATA.id, "opt726-xebec-field");
    const stage: CardInstance = {
      ...handInstance(),
      instanceId: "opt726-fullalead-hand",
      cardId: stageData.id,
    };
    const players = [...base.players] as [PlayerState, PlayerState];
    players[0] = {
      ...players[0],
      characters: padChars([source]),
      hand: [stage],
    };
    const state = { ...base, players };
    const effect = OP17_118_ROCKS_D_XEBEC.effects.find(
      (block) => block.id === "on_play_draw_and_play"
    );
    if (!effect) throw new Error("missing OP17-118 On Play effect");

    let result = resolveEffect(state, effect, source.instanceId, 0, cardDb);
    expect(result.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    if (result.pendingPrompt?.options.promptType !== "SELECT_TARGET") {
      throw new Error("expected mixed-card hand prompt");
    }
    expect(result.pendingPrompt.options.validTargets).toContain(
      stage.instanceId
    );
    result = resumeFromStack(
      result.state,
      { type: "SELECT_TARGET", selectedInstanceIds: [stage.instanceId] },
      cardDb
    );

    expect(result.state.players[0].stage?.cardId).toBe(stageData.id);
    expect(
      result.state.players[0].hand.some(
        (card) => card.instanceId === stage.instanceId
      )
    ).toBe(false);
  });
});
