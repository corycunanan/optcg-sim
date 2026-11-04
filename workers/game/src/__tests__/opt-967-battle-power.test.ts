import { describe, expect, it } from "vitest";
import { endPhaseRig, synSchema } from "./opt-962-rig.js";
import { getEffectivePower } from "../engine/modifiers.js";
import { parseStoredSession } from "../session/persistence.js";
import { toPersistedGameState } from "../session/game-state-schema.js";
import { CARDS } from "./helpers.js";

it("actual EB01-003 synchronous attack boost is reflected before the Block decision", () => {
  const r = endPhaseRig();
  const attacker = r.put("EB01-003", 0, "CHARACTER", { power: 5000 });
  r.state.players[1].life = r.state.players[1].life.slice(0, 2);
  r.act({
    type: "DECLARE_ATTACK",
    attackerInstanceId: attacker.instanceId,
    targetInstanceId: r.state.players[1].leader.instanceId,
  });
  expect(r.state.turn.battleSubPhase).toBe("BLOCK_STEP");
  expect(
    getEffectivePower(attacker, r.db.get(attacker.cardId)!, r.state, r.db)
  ).toBe(7000);
  expect(r.state.turn.battle?.attackerPower).toBe(7000);
});

it("a synchronous On Block modifier refreshes the defender before Counter", () => {
  const r = endPhaseRig();
  const blocker = r.putSyn(
    "POWER-BLOCKER-967",
    synSchema("POWER-BLOCKER-967", "Character", [
      {
        id: "block-boost",
        category: "auto",
        trigger: { keyword: "ON_BLOCK" },
        actions: [
          {
            type: "MODIFY_POWER",
            target: { type: "SELF" },
            params: { amount: 2000 },
            duration: { type: "THIS_BATTLE" },
          },
        ],
      },
    ]),
    1,
    "CHARACTER",
    { power: 4000, keywords: { ...CARDS.BLOCKER.keywords } }
  );
  r.act({
    type: "DECLARE_ATTACK",
    attackerInstanceId: r.state.players[0].leader.instanceId,
    targetInstanceId: r.state.players[1].leader.instanceId,
  });
  r.act({ type: "DECLARE_BLOCKER", blockerInstanceId: blocker.instanceId }, 1);
  expect(r.state.turn.battleSubPhase).toBe("COUNTER_STEP");
  expect(r.state.turn.battle?.defenderPower).toBe(6000);
});

describe.each(["memory", "live", "undo"])(
  "post-prompt power refresh (%s)",
  (location) => {
    it("a selected attack debuff refreshes both the next prompt and final battle context", () => {
      const r = endPhaseRig();
      const attacker = r.putSyn("POWER-ATTACKER-967", null, 0, "CHARACTER", {
        power: 5000,
      });
      r.putSyn(
        "POWER-WATCHER-967",
        synSchema("POWER-WATCHER-967", "Character", [
          {
            id: "debuff",
            category: "auto",
            trigger: { keyword: "ON_OPPONENT_ATTACK" },
            actions: [
              {
                type: "MODIFY_POWER",
                target: {
                  type: "CHARACTER",
                  controller: "OPPONENT",
                  count: { up_to: 1 },
                },
                params: { amount: -1000 },
                duration: { type: "THIS_BATTLE" },
              },
              {
                type: "MODIFY_POWER",
                target: {
                  type: "LEADER_OR_CHARACTER",
                  controller: "SELF",
                  count: { up_to: 1 },
                },
                params: { amount: 1000 },
                duration: { type: "THIS_BATTLE" },
              },
            ],
          },
        ]),
        1,
        "CHARACTER"
      );
      r.act({
        type: "DECLARE_ATTACK",
        attackerInstanceId: attacker.instanceId,
        targetInstanceId: r.state.players[1].leader.instanceId,
      });
      if (location !== "memory") {
        const raw = JSON.parse(
          JSON.stringify({
            state: toPersistedGameState(r.state),
            undoHistory: [toPersistedGameState(r.state)],
            cardDb: Object.fromEntries(r.db),
          })
        );
        const loaded = parseStoredSession(raw);
        r.state = location === "live" ? loaded.state : loaded.undoHistory[0];
      }
      r.act(
        { type: "SELECT_TARGET", selectedInstanceIds: [attacker.instanceId] },
        1
      );
      expect(r.state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
      expect(r.state.turn.battle?.attackerPower).toBe(4000);
      r.act(
        {
          type: "SELECT_TARGET",
          selectedInstanceIds: [r.state.players[1].leader.instanceId],
        },
        1
      );
      expect(r.state.pendingPrompt).toBeNull();
      expect(r.state.turn.battle?.attackerPower).toBe(4000);
      expect(r.state.turn.battle?.defenderPower).toBe(6000);
    });
  }
);
