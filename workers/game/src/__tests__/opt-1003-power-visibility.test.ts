import {
  getEffectiveBasePower,
  getEffectivePower,
} from "../engine/modifiers.js";
import { describe, expect, it } from "vitest";
import { endPhaseRig, synSchema } from "./opt-962-rig.js";
import { convertPersistedGameState } from "../session/persistence.js";
import { toPersistedGameState } from "../session/game-state-schema.js";

describe.each([6, 7] as const)("loaded8 mode%s EOB power condition", (mode) => {
  it.each([6000, 7000])(
    "a 4000 +2000 THIS_BATTLE attacker meets only the valid %s threshold",
    (threshold) => {
      const r = endPhaseRig();
      r.state = { ...r.state, schemaVersion: 8, costSemanticsVersion: mode };
      const id = `POWER-VISIBILITY-${threshold}`;
      const source = r.putSyn(
        id,
        synSchema(id, "Character", [
          {
            id: "attack-power",
            category: "auto",
            trigger: { keyword: "WHEN_ATTACKING" },
            actions: [
              {
                type: "MODIFY_POWER",
                target: { type: "SELF" },
                params: { amount: 2000 },
                duration: { type: "THIS_BATTLE" },
              },
            ],
          },
          {
            id: "end-power",
            category: "auto",
            trigger: { event: "END_OF_BATTLE" },
            conditions: {
              type: "SELF_POWER",
              operator: ">=",
              value: threshold,
            },
            flags: { optional: true },
            actions: [{ type: "DRAW", params: { amount: 1 } }],
          },
        ]),
        0,
        "CHARACTER",
        { power: 4000 }
      );
      r.act({
        type: "DECLARE_ATTACK",
        attackerInstanceId: source.instanceId,
        targetInstanceId: r.state.players[1].leader.instanceId,
      });
      r.act({ type: "PASS" }, 1);
      // Strict low-level reader is identical to the already-deployed v8 reader.
      r.state = convertPersistedGameState(
        JSON.parse(JSON.stringify(toPersistedGameState(r.state))),
        "state"
      );
      const hand = r.state.players[0].hand.length;
      r.act({ type: "PASS" }, 1);
      if (threshold === 6000) {
        expect(r.state.pendingPrompt?.options.promptType).toBe(
          "OPTIONAL_EFFECT"
        );
        expect(r.state.effectStack[0].battleCompletion).toBeDefined();
        expect(
          r.state.activeEffects.some(
            (e) =>
              e.sourceCardInstanceId === source.instanceId &&
              e.duration.type === "THIS_BATTLE"
          )
        ).toBe(true);
        r.state = convertPersistedGameState(
          JSON.parse(JSON.stringify(toPersistedGameState(r.state))),
          "state"
        );
        r.act({ type: "PLAYER_CHOICE", choiceId: "accept" });
      } else expect(r.state.pendingPrompt).toBeNull();
      expect(r.state.players[0].hand).toHaveLength(
        hand + (threshold === 6000 ? 1 : 0)
      );
      expect(
        r.state.activeEffects.some(
          (e) =>
            e.sourceCardInstanceId === source.instanceId &&
            e.duration.type === "THIS_BATTLE"
        )
      ).toBe(false);
      expect(
        r.state.eventLog.filter((e) => e.type === "BATTLE_RESOLVED")
      ).toHaveLength(1);
    }
  );
});

describe.each([6, 7] as const)("loaded8 mode%s base-power duration", (mode) => {
  it("keeps a THIS_BATTLE base-power swap visible through the EOB option, then restores both bases", () => {
    const r = endPhaseRig();
    r.state = { ...r.state, schemaVersion: 8, costSemanticsVersion: mode };
    const id = "SWAP-VISIBILITY-1003";
    const source = r.putSyn(
      id,
      synSchema(id, "Character", [
        {
          id: "swap",
          category: "auto",
          trigger: { keyword: "WHEN_ATTACKING" },
          actions: [
            {
              type: "SWAP_BASE_POWER",
              target: {
                type: "CHARACTER",
                controller: "SELF",
                count: { exact: 2 },
              },
              duration: { type: "THIS_BATTLE" },
            },
          ],
        },
        {
          id: "end-power",
          category: "auto",
          trigger: { event: "END_OF_BATTLE" },
          conditions: { type: "SELF_POWER", operator: ">=", value: 7000 },
          flags: { optional: true },
          actions: [{ type: "DRAW", params: { amount: 1 } }],
        },
      ]),
      0,
      "CHARACTER",
      { power: 4000 }
    );
    const other = r.putSyn("SWAP-OTHER-1003", null, 0, "CHARACTER", {
      power: 7000,
    });
    r.act({
      type: "DECLARE_ATTACK",
      attackerInstanceId: source.instanceId,
      targetInstanceId: r.state.players[1].leader.instanceId,
    });
    if (r.state.pendingPrompt?.options.promptType === "SELECT_TARGET")
      r.act({
        type: "SELECT_TARGET",
        selectedInstanceIds: [source.instanceId, other.instanceId],
      });
    r.act({ type: "PASS" }, 1);
    r.state = convertPersistedGameState(
      JSON.parse(JSON.stringify(toPersistedGameState(r.state))),
      "state"
    );
    r.act({ type: "PASS" }, 1);
    expect(r.state.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
    expect(
      r.state.activeEffects.filter(
        (e) =>
          e.sourceCardInstanceId === source.instanceId &&
          e.duration.type === "THIS_BATTLE"
      )
    ).toHaveLength(2);
    const hand = r.state.players[0].hand.length;
    r.act({ type: "PLAYER_CHOICE", choiceId: "accept" });
    expect(r.state.players[0].hand).toHaveLength(hand + 1);
    expect(
      r.state.activeEffects.some(
        (e) =>
          e.sourceCardInstanceId === source.instanceId &&
          e.duration.type === "THIS_BATTLE"
      )
    ).toBe(false);
    expect(
      r.state.players[0].characters.some(
        (c) => c?.instanceId === other.instanceId
      )
    ).toBe(true);
    expect(getEffectiveBasePower(source, r.db.get(id)!, r.state, r.db)).toBe(
      4000
    );
    expect(getEffectivePower(source, r.db.get(id)!, r.state, r.db)).toBe(4000);
    expect(
      getEffectiveBasePower(other, r.db.get(other.cardId)!, r.state, r.db)
    ).toBe(7000);
    expect(
      getEffectivePower(other, r.db.get(other.cardId)!, r.state, r.db)
    ).toBe(7000);
  });
});
