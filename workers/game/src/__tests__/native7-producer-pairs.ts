/** Eight sequential cost-pair captures, executed serially by the matrix generator. */
import { expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import {
  command,
  memory,
  runtime,
  save,
  type ProducerScenario,
} from "./native7-producer-support.js";
import type { Cost } from "../engine/effect-types.js";
import type { GameAction } from "../types.js";
export async function capturePairs(producerRoot: string, directory: string) {
  const rt = await runtime(producerRoot);
  const { rig, synSchema } = (await import(
    `${producerRoot}/workers/game/src/__tests__/opt-960-rig.ts`
  )) as typeof import("./opt-960-rig.js");
  mkdirSync(directory, { recursive: true });
  for (const first of ["DON_MINUS", "VARIABLE_DON_RETURN"] as const)
    for (const second of ["DON_MINUS", "VARIABLE_DON_RETURN"] as const)
      for (const rested of [false, true]) {
        const r = rig();
        r.deck(0, 5);
        r.state.players[0].donCostArea[0].state = "RESTED";
        const id = `${first}-${second}-${rested ? "rested" : "active"}`;
        const source = r.put(id, 0, "CHARACTER", {
          schema: synSchema(id, [
            {
              id: "activate",
              category: "activate",
              trigger: { keyword: "ACTIVATE_MAIN" },
              costs: [
                { type: first, amount: 1 },
                { type: second, amount: 1 },
              ] as Cost[],
              actions: [{ type: "DRAW", params: { amount: 1 } }],
            },
          ]),
        });
        const initial = await save(rt, r.state, r.db); // actual writer establishes7 before first action
        let loaded = (await memory(rt, initial).repo.load())!;
        const scenario: ProducerScenario = {
          id,
          initial,
          steps: [],
          payer: 0,
          sourceId: source.instanceId,
          expectation: {
            returned: 2,
            hand: 1,
            meaningfulPauses: rested ? 1 : 2,
          },
        };
        let action: GameAction = {
          type: "ACTIVATE_EFFECT",
          cardInstanceId: source.instanceId,
          effectId: "activate",
        };
        for (let index = 0; index < 3; index++) {
          const state = command(rt, loaded.state, loaded.cardDb, action);
          const stored = await save(rt, state, loaded.cardDb);
          scenario.steps.push({
            action: {
              ...action,
              ...(loaded.state.pendingPrompt?.promptId
                ? { promptId: loaded.state.pendingPrompt.promptId }
                : {}),
            },
            stored,
          });
          loaded = (await memory(rt, stored).repo.load())!;
          if (!loaded.state.pendingPrompt) break;
          expect(loaded.state.players[0].hand).toHaveLength(0);
          const prompt = loaded.state.pendingPrompt.options;
          if (prompt.promptType !== "PLAYER_CHOICE")
            throw new Error("Expected DON identity prompt");
          const choice = prompt.choices!.find((c) =>
            c.label.includes(index === 0 && rested ? "Rested" : "Active")
          )!;
          action = { type: "PLAYER_CHOICE", choiceId: choice.id };
        }
        expect(loaded.state.pendingPrompt).toBeNull();
        expect(loaded.state.players[0].hand).toHaveLength(1);
        expect(loaded.state.players[0].donCostArea).toHaveLength(6);
        const bytes = JSON.stringify(scenario, null, 2) + "\n";
        writeFileSync(`${directory}/${id}.json`, bytes);
      }
}
