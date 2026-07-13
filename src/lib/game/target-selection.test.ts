import { describe, expect, it } from "vitest";
import type {
  CardData,
  CardDb,
  CardInstance,
  SelectTargetPrompt,
} from "@shared/game-types";
import {
  buildTargetSelectionModel,
  isBattlefieldTargetPrompt,
  selectTargetPromptKey,
} from "./target-selection";

function card(
  instanceId: string,
  cardId: string,
  zone: CardInstance["zone"] = "CHARACTER"
): CardInstance {
  return {
    instanceId,
    cardId,
    zone,
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: null,
    controller: 0,
    owner: 0,
  };
}

function cardData(id: string, overrides: Partial<CardData> = {}): CardData {
  return {
    id,
    name: id,
    type: "Character",
    color: ["Red"],
    cost: 1,
    power: 1000,
    counter: 1000,
    life: null,
    attribute: [],
    types: [],
    effectText: "",
    triggerText: null,
    keywords: {
      rush: false,
      rushCharacter: false,
      doubleAttack: false,
      banish: false,
      blocker: false,
      trigger: false,
      unblockable: false,
    },
    effectSchema: null,
    imageUrl: null,
    ...overrides,
  };
}

function prompt(
  cards: CardInstance[],
  overrides: Partial<SelectTargetPrompt> = {}
): SelectTargetPrompt {
  return {
    promptType: "SELECT_TARGET",
    cards,
    validTargets: cards.map((candidate) => candidate.instanceId),
    effectDescription: "Choose a target",
    countMin: 1,
    countMax: 1,
    ctaLabel: "Confirm",
    ...overrides,
  };
}

const alpha = card("alpha", "A");
const beta = card("beta", "B");
const gamma = card("gamma", "C");
const cardDb: CardDb = {
  A: cardData("A", { name: "Alpha", cost: 2, color: ["Red"] }),
  B: cardData("B", { name: "Beta", cost: 3, color: ["Blue"] }),
  C: cardData("C", { name: "Alpha", cost: 4, color: ["Red"] }),
};

describe("isBattlefieldTargetPrompt", () => {
  it("routes a prompt in place only when every shown candidate is on the battlefield", () => {
    expect(
      isBattlefieldTargetPrompt(prompt([alpha, beta]), [alpha, beta, gamma])
    ).toBe(true);
    expect(
      isBattlefieldTargetPrompt(prompt([alpha, card("hand", "B", "HAND")]), [
        alpha,
        beta,
        gamma,
      ])
    ).toBe(false);
  });

  it("keeps blind selections in the modal even if their instance IDs match board cards", () => {
    expect(
      isBattlefieldTargetPrompt(prompt([alpha], { blindSelection: true }), [
        alpha,
      ])
    ).toBe(false);
  });
});

describe("selectTargetPromptKey", () => {
  it("changes when count or constraint payload changes", () => {
    const base = prompt([alpha, beta]);
    expect(selectTargetPromptKey(base)).not.toBe(
      selectTargetPromptKey({ ...base, countMax: 2 })
    );
    expect(selectTargetPromptKey(base)).not.toBe(
      selectTargetPromptKey({
        ...base,
        aggregateConstraint: { property: "cost", operator: "<=", value: 4 },
      })
    );
  });
});

describe("buildTargetSelectionModel", () => {
  it("uses eligible, selected, and explained disabled states across the real board", () => {
    const model = buildTargetSelectionModel(
      prompt([alpha, beta]),
      new Set([alpha.instanceId]),
      cardDb,
      [alpha, beta, gamma]
    );

    expect(model.byId.get("alpha")).toEqual({
      selected: true,
      eligible: false,
      disabledReason: null,
    });
    expect(model.byId.get("beta")?.disabledReason).toBe(
      "Selection limit reached"
    );
    expect(model.byId.get("gamma")?.disabledReason).toBe("Not a valid target");
    expect(model.canConfirm).toBe(true);
  });

  it("preserves aggregate and uniqueness constraints after each toggle", () => {
    const aggregate = buildTargetSelectionModel(
      prompt([alpha, beta], {
        countMax: 2,
        aggregateConstraint: { property: "cost", operator: "<=", value: 4 },
      }),
      new Set([alpha.instanceId]),
      cardDb
    );
    expect(aggregate.byId.get("beta")?.disabledReason).toBe(
      "Adding this would exceed 4 cost"
    );
    expect(aggregate.aggregateLabel).toBe("Total cost: 2 <= 4");

    const unique = buildTargetSelectionModel(
      prompt([alpha, gamma], {
        countMax: 2,
        uniquenessConstraint: { field: "name" },
      }),
      new Set([alpha.instanceId]),
      cardDb
    );
    expect(unique.byId.get("gamma")?.disabledReason).toBe(
      'Already selected a card named "Alpha"'
    );
  });

  it("allows partial dual-slot selection but requires every slot before confirm", () => {
    const dualPrompt = prompt([alpha, beta], {
      countMin: 2,
      countMax: 2,
      dualTargets: {
        slots: [
          { validIds: [alpha.instanceId], countMin: 1, countMax: 1 },
          { validIds: [beta.instanceId], countMin: 1, countMax: 1 },
        ],
      },
    });
    const partial = buildTargetSelectionModel(
      dualPrompt,
      new Set([alpha.instanceId]),
      cardDb
    );
    expect(partial.byId.get("beta")?.eligible).toBe(true);
    expect(partial.canConfirm).toBe(false);

    const complete = buildTargetSelectionModel(
      dualPrompt,
      new Set([alpha.instanceId, beta.instanceId]),
      cardDb
    );
    expect(complete.canConfirm).toBe(true);
  });
});
