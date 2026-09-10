import { describe, expect, it } from "vitest";
import {
  OP15_024_USOPP,
  OP15_029_BARTHOLOMEW_KUMA,
  OP15_073_YAMA,
  OP15_092_MONKEY_D_LUFFY,
} from "../engine/schemas/op15.js";

describe("OPT-812 schema sweep H", () => {
  it("OP15-024 limits rest protection to opposing Leader and Character effects", () => {
    const effect = OP15_024_USOPP.effects.find(
      (candidate) => candidate.id === "OP15-024_opponent_turn_protection",
    );

    expect(effect?.prohibitions?.[0]).toMatchObject({
      type: "CANNOT_BE_RESTED",
      scope: {
        cause: "BY_OPPONENT_EFFECT",
        source_filter: { card_type: ["LEADER", "CHARACTER"] },
      },
    });
  });

  it("OP15-029 prevents the selected Character from being rested", () => {
    const effect = OP15_029_BARTHOLOMEW_KUMA.effects.find(
      (candidate) => candidate.id === "OP15-029_on_play",
    );

    expect(effect?.actions?.[0]).toMatchObject({
      type: "APPLY_PROHIBITION",
      params: { prohibition_type: "CANNOT_BE_RESTED" },
    });
  });

  it("OP15-073 plays only cost-1 Characters from either alternative", () => {
    const effect = OP15_073_YAMA.effects.find(
      (candidate) => candidate.id === "OP15-073_on_play",
    );

    expect(effect?.actions?.[0]?.target?.filter?.any_of).toEqual([
      { name: "Heavenly Warriors", cost_exact: 1 },
      { traits: ["Vassals"], cost_exact: 1 },
    ]);
  });

  it("OP15-092 applies the 20-card Leader power only during the opponent's turn", () => {
    const effect = OP15_092_MONKEY_D_LUFFY.effects.find(
      (candidate) => candidate.id === "OP15-092_trash_20",
    );

    expect(effect?.duration).toEqual({
      type: "WHILE_CONDITION",
      condition: { type: "IS_MY_TURN", controller: "OPPONENT" },
    });
  });
});
