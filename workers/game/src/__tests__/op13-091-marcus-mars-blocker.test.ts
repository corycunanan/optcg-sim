/**
 * OPT-738 — OP13-091 runtime Blocker visibility.
 */

import { describe, expect, it } from "vitest";
import { hasRuntimeKeyword } from "../../../../shared/effective-keyword.js";
import type {
  CardData,
  CardInstance,
  GameState,
  PlayerState,
} from "../types.js";
import { derivePrintedKeywords } from "../engine/printed-keywords.js";
import { OP13_091_ST_MARCUS_MARS } from "../engine/schemas/op13.js";
import { registerPermanentEffectsForCard } from "../engine/triggers.js";
import { validate } from "../engine/validation.js";
import { visibleStateForPlayer } from "../session/visibility.js";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
  padChars,
} from "./helpers.js";

const MARS_BASE_DATA: CardData = {
  ...CARDS.VANILLA,
  id: "OP13-091",
  name: "St. Marcus Mars",
  color: ["Black"],
  cost: 5,
  power: 6000,
  effectText:
    "If you have 7 or more cards in your trash, this Character cannot be removed from the field by your opponent's effects and gains [Blocker].",
  effectSchema: OP13_091_ST_MARCUS_MARS,
};

const MARS_DATA: CardData = {
  ...MARS_BASE_DATA,
  keywords: derivePrintedKeywords(MARS_BASE_DATA, OP13_091_ST_MARCUS_MARS),
};

function card(
  cardId: string,
  instanceId: string,
  zone: CardInstance["zone"] = "CHARACTER"
): CardInstance {
  return {
    instanceId,
    cardId,
    zone,
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: zone === "CHARACTER" ? 1 : null,
    controller: 1,
    owner: 1,
  };
}

function blockerState(trashCount: number): {
  state: GameState;
  cardDb: Map<string, CardData>;
  mars: CardInstance;
} {
  const cardDb = createTestCardDb();
  cardDb.set(MARS_DATA.id, MARS_DATA);
  let state = createBattleReadyState(cardDb);
  const mars = card(MARS_DATA.id, "opt738-mars");
  const players = [...state.players] as [PlayerState, PlayerState];
  players[1] = {
    ...players[1],
    characters: padChars([mars]),
    trash: Array.from({ length: trashCount }, (_, index) =>
      card(CARDS.VANILLA.id, `opt738-trash-${index}`, "TRASH")
    ),
  };
  state = {
    ...state,
    players,
    turn: {
      ...state.turn,
      activePlayerIndex: 0,
      battleSubPhase: "BLOCK_STEP",
      battle: {
        battleId: "opt738-battle",
        attackerInstanceId: players[0].leader.instanceId,
        targetInstanceId: players[1].leader.instanceId,
        attackerPower: 5000,
        defenderPower: 5000,
        counterPowerAdded: 0,
        blockerActivated: false,
      },
    },
    activeEffects: [],
  };
  state = registerPermanentEffectsForCard(state, mars, MARS_DATA);
  return { state, cardDb, mars };
}

describe("OPT-738: OP13-091 St. Marcus Mars runtime Blocker", () => {
  it("rejects Blocker at six trash and accepts it at seven", () => {
    const belowThreshold = blockerState(6);
    expect(
      validate(
        belowThreshold.state,
        {
          type: "DECLARE_BLOCKER",
          blockerInstanceId: belowThreshold.mars.instanceId,
        },
        belowThreshold.cardDb,
        1
      )
    ).toBe("This card does not have [Blocker]");

    const atThreshold = blockerState(7);
    expect(atThreshold.cardDb.get(MARS_DATA.id)?.keywords.blocker).toBe(false);
    expect(
      validate(
        atThreshold.state,
        {
          type: "DECLARE_BLOCKER",
          blockerInstanceId: atThreshold.mars.instanceId,
        },
        atThreshold.cardDb,
        1
      )
    ).toBeNull();
  });

  it("broadcasts the condition-true self keyword grant with Mars in appliesTo", () => {
    const { state, cardDb, mars } = blockerState(7);
    const visible = visibleStateForPlayer(state, cardDb, 1);
    const grant = visible.activeEffects.find((effect) =>
      effect.modifiers.some(
        (modifier) =>
          modifier.type === "GRANT_KEYWORD" &&
          modifier.params?.keyword === "BLOCKER"
      )
    );

    expect(grant).toBeDefined();
    expect(grant?.appliesTo).toContain(mars.instanceId);
    expect(
      hasRuntimeKeyword(
        mars.instanceId,
        cardDb.get(mars.cardId)?.keywords,
        visible.activeEffects,
        "BLOCKER"
      )
    ).toBe(true);
  });
});
