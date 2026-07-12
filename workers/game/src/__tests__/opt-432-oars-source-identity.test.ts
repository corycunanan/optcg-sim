/**
 * OPT-432 — OP15-080 Oars: "You may place 3 cards from your trash at the
 * bottom of your deck in any order: Play THIS CHARACTER CARD from your trash."
 *
 * Pre-fix defects:
 *  1. The play action targeted by NAME, so after the source Oars left the
 *     trash (e.g. consumed by the cost), a different Oars was substituted —
 *     Rule 1-3-2 forbids that: the play must simply be skipped.
 *  2. filter.exclude_self on cost candidates was a silent no-op —
 *     computeCostTargets never received the source instance (OP05-056
 *     X.Barrels could pay its "other than this Character" cost with itself).
 *
 * Fixes under test: the TRIGGERING_CARD_IN_TRASH target type (exact instance,
 * trash-only, fizzles when absent) and exclude_self enforcement in
 * computeCostTargets.
 */

import { describe, expect, it } from "vitest";
import type { CardData, CardInstance, GameState, PlayerState } from "../types.js";
import type { Cost } from "../engine/effect-types.js";
import { resolveEffect, resumeFromStack } from "../engine/effect-resolver/index.js";
import { computeCostTargets, isCostPayable } from "../engine/effect-resolver/cost-handler.js";
import { OP15_080_OARS } from "../engine/schemas/op15.js";
import { createBattleReadyState, createTestCardDb, padChars, CARDS } from "./helpers.js";

function withPlayer(state: GameState, idx: 0 | 1, patch: Partial<PlayerState>): GameState {
  const players = [...state.players] as [PlayerState, PlayerState];
  players[idx] = { ...players[idx], ...patch };
  return { ...state, players };
}

function trashInstance(cardId: string, id: string): CardInstance {
  return {
    instanceId: id,
    cardId,
    zone: "TRASH",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: null,
    controller: 0,
    owner: 0,
  };
}

const SOURCE_ID = "oars-source";
const DECOY_ID = "oars-decoy";

/** State right after the source Oars was K.O.'d: it sits in the trash with
 *  its instanceId preserved (koCharacter semantics), next to a decoy Oars
 *  and three filler cards. */
function afterKoState(): { state: GameState; cardDb: Map<string, CardData> } {
  const cardDb = createTestCardDb();
  const oars: CardData = {
    ...cardDb.get("CHAR-VANILLA")!,
    id: "OP15-080",
    name: "Oars",
    effectSchema: OP15_080_OARS,
  };
  cardDb.set(oars.id, oars);

  let state = createBattleReadyState(cardDb);
  state = withPlayer(state, 0, {
    characters: padChars([]),
    trash: [
      trashInstance(oars.id, SOURCE_ID),
      trashInstance(oars.id, DECOY_ID),
      trashInstance(CARDS.VANILLA.id, "filler-a"),
      trashInstance(CARDS.RUSH.id, "filler-b"),
      trashInstance(CARDS.BLOCKER.id, "filler-c"),
    ],
  });
  return { state, cardDb };
}

/** Drive the on_ko block through accept → cost select → cost arrange. */
function payCostWith(
  state: GameState,
  cardDb: Map<string, CardData>,
  costPicks: string[],
) {
  const block = OP15_080_OARS.effects.find((b) => b.id === "OP15-080_on_ko")!;
  const offered = resolveEffect(state, block, SOURCE_ID, 0, cardDb, SOURCE_ID);
  expect(offered.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");

  const accepted = resumeFromStack(
    offered.state,
    { type: "PLAYER_CHOICE", choiceId: "accept" },
    cardDb,
  );
  expect(accepted.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");

  const selected = resumeFromStack(
    accepted.state,
    { type: "SELECT_TARGET", selectedInstanceIds: costPicks },
    cardDb,
  );
  expect(selected.pendingPrompt?.options.promptType).toBe("ARRANGE_TOP_CARDS");

  return resumeFromStack(
    selected.state,
    {
      type: "ARRANGE_TOP_CARDS",
      keptCardInstanceId: "",
      orderedInstanceIds: costPicks,
      destination: "bottom",
    },
    cardDb,
  );
}

describe("OPT-432: OP15-080 plays the exact K.O.'d instance, never a copy", () => {
  it("cost paid with fillers: the SOURCE instance is played, the decoy stays in trash", () => {
    const { state, cardDb } = afterKoState();
    const done = payCostWith(state, cardDb, ["filler-a", "filler-b", "filler-c"]);

    const p0 = done.state.players[0];
    // The source left the trash (played); the decoy did not move.
    expect(p0.trash.some((c) => c.instanceId === SOURCE_ID)).toBe(false);
    expect(p0.trash.some((c) => c.instanceId === DECOY_ID)).toBe(true);
    // Exactly one Oars is on the field.
    expect(
      p0.characters.filter((c) => c !== null && c.cardId === "OP15-080"),
    ).toHaveLength(1);
    expect(done.state.effectStack).toHaveLength(0);
  });

  it("source consumed by the cost: the play fizzles — the decoy is NOT substituted", () => {
    const { state, cardDb } = afterKoState();
    const done = payCostWith(state, cardDb, [SOURCE_ID, "filler-a", "filler-b"]);

    const p0 = done.state.players[0];
    // Cost paid: the source went to the deck bottom with the fillers.
    expect(p0.deck.slice(-3).map((c) => c.instanceId)).not.toContain(SOURCE_ID);
    // Rule 1-3-2: no substitution — the decoy stays in the trash and no
    // Oars reaches the field.
    expect(p0.trash.some((c) => c.instanceId === DECOY_ID)).toBe(true);
    expect(p0.characters.filter((c) => c !== null && c.cardId === "OP15-080")).toHaveLength(0);
    expect(done.state.effectStack).toHaveLength(0);
  });
});

describe("OPT-432: exclude_self is enforced on cost candidates (OP05-056 shape)", () => {
  const COST: Cost = {
    type: "PLACE_OWN_CHARACTER_TO_DECK",
    amount: 1,
    filter: { exclude_self: true },
    position: "BOTTOM",
  } as Cost;

  it("the source is dropped from the candidate pool", () => {
    const cardDb = createTestCardDb();
    const state = createBattleReadyState(cardDb);
    // Default board: char-0-v1 (the source) and char-0-b1.
    const withSource = computeCostTargets(state, COST, 0, cardDb, "char-0-v1");
    expect(withSource).not.toContain("char-0-v1");
    expect(withSource).toContain("char-0-b1");
    // Without a source id (legacy callers), behavior is unchanged.
    expect(computeCostTargets(state, COST, 0, cardDb)).toContain("char-0-v1");
  });

  it("unpayable when the source is the only character", () => {
    const cardDb = createTestCardDb();
    let state = createBattleReadyState(cardDb);
    const only = state.players[0].characters.find((c) => c !== null)!;
    state = withPlayer(state, 0, { characters: padChars([only]) });

    expect(isCostPayable(state, COST, 0, cardDb, only.instanceId)).toBe(false);
    // A second character makes it payable again.
    expect(isCostPayable(createBattleReadyState(cardDb), COST, 0, cardDb, only.instanceId)).toBe(true);
  });
});
