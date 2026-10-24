import { expect, it } from "vitest";
import { rig, synSchema } from "./opt-960-rig.js";
import { command, capture } from "./opt-997-corpus-support.js";
import type { GameState } from "../types.js";

// Synthetic capability fixture, never a retagged forward producer corpus.
for (const reload of [false, true]) it(`mode8 DON payment starts and completes fresh Life watcher reload=${reload}`, async () => {
  const r = rig(); r.state.schemaVersion = 8; r.state.costSemanticsVersion = 8 as GameState["costSemanticsVersion"];
  r.deck(0, 5); r.deck(1, 5); r.leader(0, "ST13-003"); r.life(0, 1); r.state.players[0].life[0].face = "UP";
  const p = r.state.players[0]; const [active, donor, ...reserve] = p.donCostArea;
  p.donCostArea = [active]; p.donDeck.push(...reserve); p.leader.attachedDon = [{ ...donor, attachedTo: p.leader.instanceId }];
  r.put("mode8-watcher", 0, "CHARACTER", { schema: synSchema("mode8-watcher", [{
    id: "watch", category: "auto", trigger: { event: "DON_RETURNED_TO_DON_DECK" }, flags: { optional: true },
    costs: [{ type: "LIFE_TO_HAND", amount: 1 }, { type: "TRASH_FROM_HAND", amount: 1 }], actions: [{ type: "DRAW", params: { amount: 1 } }],
  }]) });
  const source = r.put("mode8-don", 0, "CHARACTER", { schema: synSchema("mode8-don", [{
    id: "activate", category: "activate", trigger: { keyword: "ACTIVATE_MAIN" }, flags: { optional: true },
    costs: [{ type: "DON_MINUS", amount: 1 }, { type: "REST_DON", amount: 1 }],
    actions: [{ type: "MODIFY_POWER", target: { type: "SELF" }, params: { amount: 1000 }, duration: { type: "THIS_TURN" } }],
  }]) });
  r.state = command(r.state, { type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId: "activate" }, r.db);
  expect(r.promptType()).toBe("OPTIONAL_EFFECT"); if (reload) await capture(r);
  r.state = command(r.state, { type: "PLAYER_CHOICE", choiceId: "accept" }, r.db);
  expect(r.promptType()).toBe("PLAYER_CHOICE"); if (reload) await capture(r);
  r.state = command(r.state, { type: "PLAYER_CHOICE", choiceId: `don-return-ids:${JSON.stringify([donor.instanceId])}` }, r.db);
  expect(r.promptType()).toBe("OPTIONAL_EFFECT"); if (reload) await capture(r);
  r.state = command(r.state, { type: "PLAYER_CHOICE", choiceId: "accept" }, r.db);
  if (reload) await capture(r);
  expect(r.state.costSemanticsVersion).toBe(8); expect(r.state.players[0].life).toHaveLength(0);
  expect(r.state.players[0].deck).toHaveLength(6); expect(r.state.players[0].hand).toHaveLength(0);
  expect(r.state.players[0].leader.attachedDon).toHaveLength(0);
  expect(r.state.players[0].donCostArea).toEqual([{ ...active, state: "RESTED" }]);
  expect(r.state.effectStack).toHaveLength(0); expect(r.state.pendingPrompt).toBeNull();
});
