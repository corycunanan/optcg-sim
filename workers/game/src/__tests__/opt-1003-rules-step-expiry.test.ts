import { describe, expect, it } from "vitest";
import { endPhaseRig, synSchema } from "./opt-962-rig.js";
import { computeExpiry } from "../engine/effect-resolver/action-utils.js";

describe("OPT-1003 rules-step duration boundaries", () => {
  it("OP02-118 still protects the battled Character from ST08-013 at End of Battle", () => {
    const r = endPhaseRig({ handSize: 1 });
    const attacker = r.put("ST08-013", 0, "CHARACTER", { power: 4000 }, 1);
    const target = r.putSyn("TARGET-1003", null, 1, "CHARACTER", {
      power: 1000,
    });
    r.state.players[1].characters[0]!.state = "RESTED";
    const payment = r.state.players[1].hand[0];
    const counter = r.put("OP02-118", 1, "HAND", {
      type: "Event",
      cost: 0,
      power: null,
      counter: null,
      effectText:
        "[Counter] You may trash 1 card from your hand: Select up to 1 of your Characters. The selected Character cannot be K.O.'d during this battle.",
    });
    r.act({
      type: "DECLARE_ATTACK",
      attackerInstanceId: attacker.instanceId,
      targetInstanceId: target.instanceId,
    });
    r.act({ type: "PASS" }, 1);
    r.act(
      {
        type: "USE_COUNTER_EVENT",
        cardInstanceId: counter.instanceId,
        counterTargetInstanceId: target.instanceId,
      },
      1
    );
    if (r.state.pendingPrompt?.options.promptType === "OPTIONAL_EFFECT")
      r.act({ type: "PLAYER_CHOICE", choiceId: "accept" }, 1);
    r.act(
      { type: "SELECT_TARGET", selectedInstanceIds: [payment.instanceId] },
      1
    );
    r.act(
      { type: "SELECT_TARGET", selectedInstanceIds: [target.instanceId] },
      1
    );
    expect(r.state.prohibitions).toHaveLength(1);
    r.act({ type: "PASS" }, 1);
    expect(r.state.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
    r.act({ type: "PLAYER_CHOICE", choiceId: "accept" });
    expect(
      r.state.players[1].characters.some(
        (c) => c?.instanceId === target.instanceId
      )
    ).toBe(true);
    expect(
      r.state.players[0].characters.some(
        (c) => c?.instanceId === attacker.instanceId
      )
    ).toBe(true);
    expect(r.state.eventLog.filter((e) => e.type === "CARD_KO")).toHaveLength(
      0
    );
    expect(r.state.prohibitions).toHaveLength(0);
  });

  it("start-of-turn conditions cannot see an until-next-turn power modifier", () => {
    const r = endPhaseRig();
    const id = "REFRESH-1003";
    const source = r.putSyn(
      id,
      synSchema(id, "Character", [
        {
          id: "start-draw",
          category: "auto",
          trigger: { keyword: "START_OF_TURN" },
          conditions: { type: "SELF_POWER", operator: ">=", value: 6000 },
          actions: [{ type: "DRAW", params: { amount: 1 } }],
        },
      ]),
      1,
      "CHARACTER",
      { power: 5000 }
    );
    const duration = { type: "UNTIL_START_OF_YOUR_NEXT_TURN" } as const;
    r.state.activeEffects.push({
      id: "until-refresh-1003",
      sourceCardInstanceId: source.instanceId,
      sourceEffectBlockId: "buff",
      category: "auto",
      controller: 1,
      modifiers: [{ type: "MODIFY_POWER", params: { amount: 1000 }, duration }],
      duration,
      expiresAt: computeExpiry(duration, r.state, 1),
      appliesTo: [source.instanceId],
      timestamp: 1,
    });
    const before = r.state.players[1].hand.length;
    r.act({ type: "ADVANCE_PHASE" });
    expect(r.state.players[1].hand).toHaveLength(before);
    expect(
      r.state.activeEffects.some((e) => e.id === "until-refresh-1003")
    ).toBe(false);
  });
});
