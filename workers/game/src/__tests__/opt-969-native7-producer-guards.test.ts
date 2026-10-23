import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  memory,
  runtime,
  type ProducerScenario,
} from "./native7-producer-support.js";
import type { GameAction } from "../types.js";
const fixture = (id: string) =>
  JSON.parse(
    readFileSync(
      new URL(
        `./fixtures/opt-969-native7-producers/${id}.json`,
        import.meta.url
      ),
      "utf8"
    )
  ) as ProducerScenario;
for (const mutation of [
  "stale",
  "wrong-payer",
  "foreign",
  "duplicate",
  "under",
  "over",
  "live-rested",
  "staged-rested",
  "live-attached",
  "staged-attached",
] as const)
  it(`actual native7 DON reply rejects ${mutation} unchanged`, async () => {
    const rt = await runtime(process.env.OPT969_REPLAY_ROOT);
    const corpus = fixture("active-held-filter");
    const loaded = (await memory(rt, corpus.steps[0].stored).repo.load())!;
    const valid = corpus.steps[1].action;
    if (valid.type !== "PLAYER_CHOICE") throw new Error("Missing DON reply");
    const ids = JSON.parse(
      valid.choiceId.slice("don-return-ids:".length)
    ) as string[];
    let action: GameAction = structuredClone(valid);
    let actor = corpus.payer;
    if (mutation === "stale") action = { ...action, promptId: "stale-id" };
    if (mutation === "wrong-payer") actor = corpus.payer === 0 ? 1 : 0;
    if (["foreign", "duplicate", "under", "over"].includes(mutation))
      action = {
        type: "PLAYER_CHOICE",
        promptId: valid.promptId,
        choiceId: `don-return-ids:${JSON.stringify(mutation === "foreign" ? ["foreign"] : mutation === "duplicate" ? [ids[0], ids[0]] : mutation === "under" ? [] : [...ids, "foreign"])}`,
      };
    if (mutation.startsWith("live-") || mutation.startsWith("staged-")) {
      const frame = loaded.state.effectStack.at(-1)!;
      const player = (
        mutation.startsWith("live-")
          ? loaded.state.players
          : frame.costTransactionState!.players
      )[corpus.payer];
      const donor = player.donCostArea.find((d) => d.instanceId === ids[0])!;
      if (mutation.endsWith("rested")) donor.state = "RESTED";
      else {
        player.donCostArea = player.donCostArea.filter(
          (d) => d.instanceId !== donor.instanceId
        );
        player.leader.attachedDon.push({
          ...donor,
          attachedTo: player.leader.instanceId,
        });
      }
    }
    const before = structuredClone(loaded.state);
    const routed = new rt.SessionCoordinator().executeAction(
      loaded.state,
      [],
      actor,
      action,
      loaded.cardDb
    );
    const next =
      routed.kind === "resume"
        ? rt.resumePromptLifecycle(routed.state, action, loaded.cardDb, {
            drainPregame: (s) => s,
            advanceStartOfTurn: (s) => s,
          }).state
        : routed.state;
    expect(next).toEqual(before);
    expect(loaded.state).toEqual(before);
  });
