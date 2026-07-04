import { describe, expect, it } from "vitest";

import type {
  Action,
  EffectBlock,
  EffectSchema,
  Prohibition,
} from "../engine/effect-types.js";
import { EB03_014_KUINA } from "../engine/schemas/eb03.js";
import { OP08_114_S_HAWK } from "../engine/schemas/op08.js";
import { OP15_093_THE_RISKY_BROTHERS } from "../engine/schemas/op15.js";
import {
  P_025_SMOKER,
  P_052_DRACULE_MIHAWK,
  P_054_MONKEY_D_GARP,
} from "../engine/schemas/p.js";

function firstBlock(schema: EffectSchema): EffectBlock {
  const block = schema.effects[0];
  expect(block).toBeDefined();
  return block;
}

function firstProhibition(schema: EffectSchema): Prohibition {
  const prohibition = firstBlock(schema).prohibitions?.[0];
  expect(prohibition).toBeDefined();
  return prohibition as Prohibition;
}

function actionByType(schema: EffectSchema, type: Action["type"]): Action {
  const action = schema.effects
    .flatMap((block) => block.actions ?? [])
    .find((candidate) => candidate.type === type);
  expect(action).toBeDefined();
  return action as Action;
}

describe("authored schemas stay aligned with sanitized attribute text", () => {
  it("narrows historical promo battle protections to their restored attributes", () => {
    expect(firstProhibition(P_025_SMOKER).scope).toEqual({
      cause: "BATTLE",
      source_filter: { card_type: "CHARACTER", attribute_not: "SPECIAL" },
    });
    expect(firstProhibition(P_052_DRACULE_MIHAWK).scope).toEqual({
      cause: "BATTLE",
      source_filter: { attribute: "SLASH" },
    });
    expect(firstProhibition(P_054_MONKEY_D_GARP).scope).toEqual({
      cause: "BATTLE",
      source_filter: { attribute: "STRIKE" },
    });
  });

  it("keeps OP08-114 battle protection scoped to Slash attackers", () => {
    expect(firstProhibition(OP08_114_S_HAWK).scope).toEqual({
      cause: "BATTLE",
      source_filter: { attribute: "SLASH" },
    });
  });

  it("grants the Slash attribute for OP15-093", () => {
    expect(
      actionByType(OP15_093_THE_RISKY_BROTHERS, "GRANT_ATTRIBUTE").params
    ).toEqual({
      attribute: "SLASH",
    });
  });

  it("targets only a Slash attribute Leader for EB03-014", () => {
    expect(actionByType(EB03_014_KUINA, "GIVE_DON").target).toEqual({
      type: "LEADER_OR_CHARACTER",
      controller: "SELF",
      filter: { card_type: "LEADER", attribute: "SLASH" },
    });
  });
});
