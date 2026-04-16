/**
 * OPT-209 — Named hand-or-field cost primitives
 *
 * Covers:
 * - TRASH_FROM_HAND with filter.name / name_any_of
 * - TRASH_OWN_STAGE (new primitive) with filter.name
 * - CHOICE cost branches mixing hand and stage sources
 */

import { describe, it, expect } from "vitest";
import type { CardData, CardInstance, PlayerState } from "../types.js";
import type { Cost, ChoiceCost } from "../engine/effect-types.js";
import {
  isCostPayable,
  computeCostTargets,
  payCosts,
} from "../engine/effect-resolver/cost-handler.js";
import { createTestCardDb, createBattleReadyState, CARDS } from "./helpers.js";

function makeState(cardDb: Map<string, CardData>) {
  return createBattleReadyState(cardDb);
}

function withPlayer(
  state: ReturnType<typeof makeState>,
  playerIdx: 0 | 1,
  patch: Partial<PlayerState>,
): ReturnType<typeof makeState> {
  const newPlayers = [...state.players] as [PlayerState, PlayerState];
  newPlayers[playerIdx] = { ...newPlayers[playerIdx], ...patch };
  return { ...state, players: newPlayers };
}

function makeHandCard(cardId: string, suffix: string): CardInstance {
  return {
    instanceId: `hand-${suffix}`,
    cardId,
    zone: "HAND",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: null,
    controller: 0,
    owner: 0,
  };
}

function makeStageCard(cardId: string, suffix: string): CardInstance {
  return {
    instanceId: `stage-${suffix}`,
    cardId,
    zone: "STAGE",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: 1,
    controller: 0,
    owner: 0,
  };
}

describe("OPT-209: TRASH_FROM_HAND with filter.name", () => {
  it("payable when hand contains a card with the matching name", () => {
    const cardDb = createTestCardDb();
    const base = makeState(cardDb);
    const state = withPlayer(base, 0, {
      hand: [
        makeHandCard(CARDS.VANILLA.id, "v1"),
        makeHandCard(CARDS.STAGE.id, "s1"),
      ],
    });
    const cost: Cost = {
      type: "TRASH_FROM_HAND",
      amount: 1,
      filter: { name: CARDS.STAGE.name },
    };
    expect(isCostPayable(state, cost, 0, cardDb)).toBe(true);
  });

  it("unpayable when hand has no card with the matching name", () => {
    const cardDb = createTestCardDb();
    const base = makeState(cardDb);
    const state = withPlayer(base, 0, {
      hand: [makeHandCard(CARDS.VANILLA.id, "v1")],
    });
    const cost: Cost = {
      type: "TRASH_FROM_HAND",
      amount: 1,
      filter: { name: CARDS.STAGE.name },
    };
    expect(isCostPayable(state, cost, 0, cardDb)).toBe(false);
  });

  it("computeCostTargets returns only the matching hand card", () => {
    const cardDb = createTestCardDb();
    const base = makeState(cardDb);
    const state = withPlayer(base, 0, {
      hand: [
        makeHandCard(CARDS.VANILLA.id, "v1"),
        makeHandCard(CARDS.STAGE.id, "match"),
        makeHandCard(CARDS.BLOCKER.id, "b1"),
      ],
    });
    const cost: Cost = {
      type: "TRASH_FROM_HAND",
      amount: 1,
      filter: { name: CARDS.STAGE.name },
    };
    const targets = computeCostTargets(state, cost, 0, cardDb);
    expect(targets).toEqual(["hand-match"]);
  });

  it("name_any_of matches any listed name", () => {
    const cardDb = createTestCardDb();
    const base = makeState(cardDb);
    const state = withPlayer(base, 0, {
      hand: [
        makeHandCard(CARDS.VANILLA.id, "v1"),
        makeHandCard(CARDS.BLOCKER.id, "b1"),
      ],
    });
    const cost: Cost = {
      type: "TRASH_FROM_HAND",
      amount: 1,
      filter: { name_any_of: [CARDS.STAGE.name, CARDS.BLOCKER.name] },
    };
    const targets = computeCostTargets(state, cost, 0, cardDb);
    expect(targets).toEqual(["hand-b1"]);
  });
});

describe("OPT-209: TRASH_OWN_STAGE", () => {
  it("payable when a stage is on the field (no filter)", () => {
    const cardDb = createTestCardDb();
    const base = makeState(cardDb);
    const state = withPlayer(base, 0, {
      stage: makeStageCard(CARDS.STAGE.id, "s1"),
    });
    const cost: Cost = { type: "TRASH_OWN_STAGE" };
    expect(isCostPayable(state, cost, 0, cardDb)).toBe(true);
  });

  it("unpayable when no stage is on the field", () => {
    const cardDb = createTestCardDb();
    const state = withPlayer(makeState(cardDb), 0, { stage: null });
    const cost: Cost = { type: "TRASH_OWN_STAGE" };
    expect(isCostPayable(state, cost, 0, cardDb)).toBe(false);
  });

  it("payable when stage name matches filter", () => {
    const cardDb = createTestCardDb();
    const base = makeState(cardDb);
    const state = withPlayer(base, 0, {
      stage: makeStageCard(CARDS.STAGE.id, "s1"),
    });
    const cost: Cost = {
      type: "TRASH_OWN_STAGE",
      filter: { name: CARDS.STAGE.name },
    };
    expect(isCostPayable(state, cost, 0, cardDb)).toBe(true);
  });

  it("unpayable when stage exists but name does not match", () => {
    const cardDb = createTestCardDb();
    const base = makeState(cardDb);
    const state = withPlayer(base, 0, {
      stage: makeStageCard(CARDS.STAGE.id, "s1"),
    });
    const cost: Cost = {
      type: "TRASH_OWN_STAGE",
      filter: { name: "Some Other Stage" },
    };
    expect(isCostPayable(state, cost, 0, cardDb)).toBe(false);
  });

  it("payCosts moves the stage to trash and clears the stage slot", () => {
    const cardDb = createTestCardDb();
    const base = makeState(cardDb);
    const stage = makeStageCard(CARDS.STAGE.id, "s1");
    const state = withPlayer(base, 0, { stage });

    const result = payCosts(
      state,
      [{ type: "TRASH_OWN_STAGE", filter: { name: CARDS.STAGE.name } }],
      0,
      cardDb,
    );

    expect(result).not.toBeNull();
    const p0 = result!.state.players[0];
    expect(p0.stage).toBeNull();
    expect(p0.trash[0]?.instanceId).toBe("stage-s1");
    expect(p0.trash[0]?.zone).toBe("TRASH");
    expect(result!.costResult.cardsTrashedCount).toBe(1);
    expect(result!.costResult.cardsTrashedInstanceIds).toContain("stage-s1");
  });

  it("payCosts returns null when stage filter does not match", () => {
    const cardDb = createTestCardDb();
    const base = makeState(cardDb);
    const state = withPlayer(base, 0, {
      stage: makeStageCard(CARDS.STAGE.id, "s1"),
    });
    const result = payCosts(
      state,
      [{ type: "TRASH_OWN_STAGE", filter: { name: "Some Other Stage" } }],
      0,
      cardDb,
    );
    expect(result).toBeNull();
  });
});

describe("OPT-209: CHOICE cost combining hand and stage named sources", () => {
  // Mirrors OP06-033 branch 2: trash 1 [NamedCard] from hand OR field.
  // Expressed here via a flat CHOICE with two branches so each source is
  // its own payable option.
  function arkLikeChoice(): ChoiceCost {
    return {
      type: "CHOICE",
      labels: ["Trash named card from hand", "Trash named stage"],
      options: [
        [{ type: "TRASH_FROM_HAND", amount: 1, filter: { name: CARDS.STAGE.name } }],
        [{ type: "TRASH_OWN_STAGE", filter: { name: CARDS.STAGE.name } }],
      ],
    };
  }

  it("payable when the named card is in hand only", () => {
    const cardDb = createTestCardDb();
    const base = makeState(cardDb);
    const state = withPlayer(base, 0, {
      hand: [makeHandCard(CARDS.STAGE.id, "h1")],
      stage: null,
    });
    expect(isCostPayable(state, arkLikeChoice(), 0, cardDb)).toBe(true);
  });

  it("payable when the named card is on the stage only", () => {
    const cardDb = createTestCardDb();
    const base = makeState(cardDb);
    const state = withPlayer(base, 0, {
      hand: [makeHandCard(CARDS.VANILLA.id, "v1")],
      stage: makeStageCard(CARDS.STAGE.id, "s1"),
    });
    expect(isCostPayable(state, arkLikeChoice(), 0, cardDb)).toBe(true);
  });

  it("unpayable when the named card is in neither hand nor stage", () => {
    const cardDb = createTestCardDb();
    const base = makeState(cardDb);
    const state = withPlayer(base, 0, {
      hand: [makeHandCard(CARDS.VANILLA.id, "v1")],
      stage: null,
    });
    expect(isCostPayable(state, arkLikeChoice(), 0, cardDb)).toBe(false);
  });
});
