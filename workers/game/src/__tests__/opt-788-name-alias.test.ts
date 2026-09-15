import { describe, expect, it } from "vitest";
import { CARDS, setupGame, padChars } from "./helpers.js";
import { matchesFilter, evaluateCondition } from "../engine/conditions.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { resumeFromStack } from "../engine/effect-resolver/index.js";
import { runPipeline } from "../engine/pipeline.js";
import { registerPermanentEffectsForCard } from "../engine/triggers.js";
import { getEffectivePower } from "../engine/modifiers.js";
import type { CardData, CardInstance } from "../types.js";

function data(id: string): CardData {
  const schema = getEffectSchema(id)!;
  return {
    ...CARDS.VANILLA,
    id,
    name: schema.card_name!,
    effectSchema: schema,
  };
}
function instance(
  cardId: string,
  instanceId = cardId,
  zone: CardInstance["zone"] = "CHARACTER"
): CardInstance {
  return {
    cardId,
    instanceId,
    zone,
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: 1,
    owner: 0,
    controller: 0,
  };
}

describe("OPT-788 name aliases", () => {
  it.each([
    ["EB02-016", "Tony Tony.Chopper"],
    ["EB02-024", "Usopp"],
    ["EB04-038", "Trafalgar Law"],
    ["EB04-038", "Donquixote Rosinante"],
    ["OP01-121", "Kouzuki Oden"],
    ["OP02-042", "Kouzuki Oden"],
    ["OP03-122", "Usopp"],
    ["OP04-099", "Charlotte Linlin"],
    ["P-027", "Franky"],
  ])("matches %s as %s in public and secret areas", (id, alias) => {
    const { state, cardDb } = setupGame();
    cardDb.set(id, data(id));
    for (const zone of ["CHARACTER", "HAND", "DECK"] as const) {
      const card = instance(id, id, zone);
      expect(matchesFilter(card, { name: alias }, cardDb, state)).toBe(true);
      expect(
        matchesFilter(
          card,
          { name_any_of: ["unrelated", alias] },
          cardDb,
          state
        )
      ).toBe(true);
      expect(matchesFilter(card, { exclude_name: alias }, cardDb, state)).toBe(
        false
      );
      expect(matchesFilter(card, { name: "unrelated" }, cardDb, state)).toBe(
        false
      );
      expect(matchesFilter(card, { name: data(id).name }, cardDb, state)).toBe(
        true
      );
    }
  });

  it("uses aliases in Leader and named-card conditions", () => {
    const { state, cardDb } = setupGame();
    const card = data("EB04-038");
    cardDb.set(card.id, card);
    state.players[0].leader = instance(card.id, "leader", "LEADER");
    state.players[0].characters = padChars([instance(card.id)]);
    const ctx = {
      controller: 0 as const,
      sourceCardInstanceId: card.id,
      cardDb,
    };
    expect(
      evaluateCondition(
        state,
        {
          type: "LEADER_PROPERTY",
          controller: "SELF",
          property: { name: "Trafalgar Law" },
        },
        ctx
      )
    ).toBe(true);
    expect(
      evaluateCondition(
        state,
        {
          type: "MULTIPLE_NAMED_CARDS",
          controller: "SELF",
          names: ["Trafalgar Law", "Donquixote Rosinante"],
        },
        ctx
      )
    ).toBe(true);
    expect(
      evaluateCondition(
        state,
        {
          type: "LEADER_PROPERTY",
          controller: "SELF",
          property: { name_includes: "Trafalgar" },
        },
        ctx
      )
    ).toBe(true);
    expect(
      evaluateCondition(
        state,
        {
          type: "NAMED_CARD_WITH_PROPERTY",
          controller: "SELF",
          name: "Trafalgar Law",
          property: { power: { min: 4000, max: 4000 } },
        },
        ctx
      )
    ).toBe(true);
    expect(
      evaluateCondition(
        state,
        {
          type: "NAMED_CARD_WITH_PROPERTY",
          controller: "SELF",
          name: "Usopp",
          property: { power: { min: 4000, max: 4000 } },
        },
        ctx
      )
    ).toBe(false);
  });

  it("compares references through shared aliases in either direction", () => {
    const { state, cardDb } = setupGame();
    cardDb.set("EB04-038", data("EB04-038"));
    cardDb.set("OP13-031", data("OP13-031"));
    const duo = instance("EB04-038"),
      law = instance("OP13-031");
    state.players[0].characters = padChars([duo, law]);
    expect(
      evaluateCondition(
        state,
        {
          type: "CARD_ON_FIELD",
          controller: "SELF",
          filter: { name: "Trafalgar Law", unique_names: true },
          count: { operator: "==", value: 2 },
        },
        { controller: 0, sourceCardInstanceId: duo.instanceId, cardDb }
      )
    ).toBe(true);

    for (const [candidate, referenced] of [
      [duo, law],
      [law, duo],
    ]) {
      const refs = new Map([
        ["chosen", { targetInstanceIds: [referenced.instanceId], count: 1 }],
      ]);
      expect(
        matchesFilter(
          candidate,
          { name_matching_ref: "chosen" },
          cardDb,
          state,
          refs
        )
      ).toBe(true);
    }
    expect(
      matchesFilter(duo, { name_includes: "Trafalgar" }, cardDb, state)
    ).toBe(true);
    expect(matchesFilter(duo, { name_includes: "Usopp" }, cardDb, state)).toBe(
      false
    );
  });

  // Official OP16 FAQ p.4: count printed identities, neither alias strings nor alias intersections.
  it.each([
    [1, false, 2000],
    [2, false, 2000],
    [1, true, 3000],
  ])(
    "preserves FAQ distinct-name power (%s copies, Law %s)",
    (copies, law, boost) => {
      const { state, cardDb } = setupGame();
      for (const id of ["OP16-034", "EB04-038", "OP13-031"])
        cardDb.set(id, data(id));
      const luffy = instance("OP16-034");
      luffy.attachedDon = [
        { instanceId: "don", state: "ACTIVE", attachedTo: luffy.instanceId },
      ];
      state.turn.activePlayerIndex = 0;
      state.players[0].characters = padChars([
        luffy,
        ...Array.from({ length: copies }, (_, i) =>
          instance("EB04-038", `duo-${i}`)
        ),
        ...(law ? [instance("OP13-031")] : []),
      ]);
      expect(
        getEffectivePower(
          luffy,
          cardDb.get(luffy.cardId)!,
          registerPermanentEffectsForCard(
            state,
            luffy,
            cardDb.get(luffy.cardId)!
          ),
          cardDb
        )
      ).toBe(4000 + 1000 + boost);
    }
  );

  it("offers Yamato in an actual name-filtered deck search", () => {
    const { state, cardDb } = setupGame();
    state.turn = {
      ...state.turn,
      phase: "MAIN",
      number: 3,
      activePlayerIndex: 0,
    };
    state.pregame = null;
    const leader = state.players[0].leader;
    cardDb.set(leader.cardId, {
      ...CARDS.LEADER,
      effectSchema: {
        effects: [
          {
            id: "search",
            category: "activate",
            trigger: { keyword: "ACTIVATE_MAIN" },
            actions: [
              {
                type: "SEARCH_DECK",
                params: {
                  look_at: 2,
                  pick: { up_to: 1 },
                  filter: { name: "Kouzuki Oden" },
                  rest_destination: "BOTTOM",
                },
              },
            ],
          },
        ],
      },
    });
    cardDb.set("OP01-121", data("OP01-121"));
    state.players[0].deck = [
      instance("OP01-121", "yamato", "DECK"),
      instance(CARDS.VANILLA.id, "other", "DECK"),
    ];
    const result = runPipeline(
      state,
      {
        type: "ACTIVATE_EFFECT",
        cardInstanceId: leader.instanceId,
        effectId: "search",
      },
      cardDb,
      0
    );
    expect(result.valid).toBe(true);
    expect(result.pendingPrompt?.options.promptType).toBe("ARRANGE_TOP_CARDS");
    if (result.pendingPrompt?.options.promptType !== "ARRANGE_TOP_CARDS")
      throw new Error("Missing search prompt");
    expect(result.pendingPrompt.options.validTargets).toEqual(["yamato"]);
    const picked = resumeFromStack(
      result.state,
      {
        type: "ARRANGE_TOP_CARDS",
        keptCardInstanceId: "yamato",
        orderedInstanceIds: ["other"],
        destination: "bottom",
      },
      cardDb
    );
    expect(
      picked.state.players[0].hand.some((c) => c.cardId === "OP01-121")
    ).toBe(true);
  });
  it("executes authored Dr.Kureha search and adds Chopperman by its alias", () => {
    const { state, cardDb } = setupGame();
    state.turn = {
      ...state.turn,
      phase: "MAIN",
      number: 3,
      activePlayerIndex: 0,
    };
    state.pregame = null;
    for (const id of ["OP08-015", "EB02-016"]) cardDb.set(id, data(id));
    state.players[0].donCostArea = Array.from({ length: 3 }, (_, i) => ({
      instanceId: `don-${i}`,
      state: "ACTIVE",
      attachedTo: null,
    }));
    state.players[0].characters = padChars([]);
    state.players[0].hand = [instance("OP08-015", "kureha", "HAND")];
    state.players[0].deck = [
      instance("EB02-016", "chopperman", "DECK"),
      instance(CARDS.VANILLA.id, "other", "DECK"),
    ];
    const result = runPipeline(
      state,
      { type: "PLAY_CARD", cardInstanceId: "kureha", position: 0 },
      cardDb,
      0
    );
    expect(result.valid).toBe(true);
    expect(result.pendingPrompt?.options.promptType).toBe("ARRANGE_TOP_CARDS");
    if (result.pendingPrompt?.options.promptType !== "ARRANGE_TOP_CARDS")
      throw new Error("Missing search prompt");
    expect(result.pendingPrompt.options.validTargets).toEqual(["chopperman"]);
    const picked = resumeFromStack(
      result.state,
      {
        type: "ARRANGE_TOP_CARDS",
        keptCardInstanceId: "chopperman",
        orderedInstanceIds: ["other"],
        destination: "bottom",
      },
      cardDb
    );
    expect(picked.state.players[0].hand.map((c) => c.cardId)).toEqual([
      "EB02-016",
    ]);
    expect(picked.state.players[0].deck.map((c) => c.cardId)).toEqual([
      CARDS.VANILLA.id,
    ]);
  });
});
