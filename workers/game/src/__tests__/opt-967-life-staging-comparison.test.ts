/** Cross-build causal controls. This file intentionally imports no repaired
 * staging helper, so pinned baseline/cf88 engines can execute the same input.
 */
import { expect, it } from "vitest";
import { endPhaseRig, synSchema } from "./opt-962-rig.js";
import { runPipeline as currentPipeline } from "../engine/pipeline.js";
import { resumePromptLifecycle as currentResume } from "../session/prompt-lifecycle.js";
import { CARDS } from "./helpers.js";
import type { Action } from "../engine/effect-types.js";
import type { GameAction } from "../types.js";
it.each(["battle", "effect"] as const)(
  "independent %s internal batch reproduction excludes the resolving Life source",
  async (kind) => {
    const root = process.env.OPT967_COMPARISON_ROOT;
    const pipeline = root
      ? ((await import(`${root}/workers/game/src/engine/pipeline.ts`))
          .runPipeline as typeof currentPipeline)
      : currentPipeline;
    const resume = root
      ? ((await import(`${root}/workers/game/src/session/prompt-lifecycle.ts`))
          .resumePromptLifecycle as typeof currentResume)
      : currentResume;
    const r = endPhaseRig();
    r.putSyn(
      "REST-WATCHER",
      synSchema("REST-WATCHER", "Character", [
        {
          id: "watch",
          category: "auto",
          trigger: { event: "CHARACTER_BECOMES_RESTED" },
          actions: [{ type: "DRAW", params: { amount: 1 } }],
        },
      ]),
      1,
      "CHARACTER"
    );
    const trigger = {
      ...CARDS.VANILLA,
      id: "LIFE-TRIGGER",
      keywords: { ...CARDS.VANILLA.keywords, trigger: true },
      effectSchema: synSchema("LIFE-TRIGGER", "Character", [
        {
          id: "life",
          category: "auto",
          trigger: { keyword: "TRIGGER" },
          actions: [
            { type: "SET_REST", target: { type: "ALL_YOUR_CHARACTERS" } },
            {
              type: "PLAY_CARD",
              target: {
                type: "CHARACTER_CARD",
                source_zone: "TRASH",
                count: { up_to: 1 },
              },
              params: {
                source_zone: "TRASH",
                cost_override: "FREE",
                entry_state: "RESTED",
              },
            },
          ],
        },
      ]),
    };
    r.db.set(trigger.id, trigger);
    r.state.players[1].life = [
      { instanceId: "life-trigger", cardId: trigger.id, face: "DOWN" },
    ];
    const commands: [GameAction, 0 | 1][] =
      kind === "battle"
        ? [
            [
              {
                type: "DECLARE_ATTACK",
                attackerInstanceId: r.state.players[0].leader.instanceId,
                targetInstanceId: r.state.players[1].leader.instanceId,
              },
              0,
            ],
            [{ type: "PASS" }, 1],
            [{ type: "PASS" }, 1],
          ]
        : [];
    if (kind === "effect") {
      const dealer = r.putSyn(
        "DEALER",
        synSchema("DEALER", "Character", [
          {
            id: "damage",
            category: "activate",
            trigger: { keyword: "ACTIVATE_MAIN" },
            actions: [
              {
                type: "DEAL_DAMAGE",
                target: { type: "PLAYER", controller: "OPPONENT" },
                params: { amount: 1 },
              },
            ],
          },
        ]),
        0,
        "CHARACTER"
      );
      commands.push([
        {
          type: "ACTIVATE_EFFECT",
          cardInstanceId: dealer.instanceId,
          effectId: "damage",
        },
        0,
      ]);
    }
    let state = r.state;
    for (const [action, player] of commands) {
      const result = pipeline(state, action, r.db, player);
      expect(result.valid).toBe(true);
      state = result.state;
    }
    expect(state.pendingPrompt?.options.promptType).toBe("REVEAL_TRIGGER");
    const result = resume(
      state,
      { type: "REVEAL_TRIGGER", reveal: true },
      r.db,
      { drainPregame: (s) => s, advanceStartOfTurn: (s) => s }
    );
    expect(result.responseRejected).toBe(false);
    expect(result.state.pendingPrompt).toBeNull();
    expect(result.state.effectStack).toEqual([]);
    expect(
      result.state.players[1].trash.filter((card) => card.cardId === trigger.id)
    ).toHaveLength(1);
  }
);
it("unadjusted synthetic PLAY_SELF/ALL_YOUR setup reaches a genuine ordering wait on both builds", async () => {
  const root = process.env.OPT967_COMPARISON_ROOT;
  const pipeline = root
    ? ((await import(`${root}/workers/game/src/engine/pipeline.ts`))
        .runPipeline as typeof currentPipeline)
    : currentPipeline;
  const resume = root
    ? ((await import(`${root}/workers/game/src/session/prompt-lifecycle.ts`))
        .resumePromptLifecycle as typeof currentResume)
    : currentResume;
  const r = endPhaseRig();
  r.putSyn(
    "REST-WATCHER",
    synSchema("REST-WATCHER", "Character", [
      {
        id: "watch",
        category: "auto",
        trigger: { event: "CHARACTER_BECOMES_RESTED" },
        actions: [{ type: "DRAW", params: { amount: 1 } }],
      },
    ]),
    1,
    "CHARACTER"
  );
  const actions: Action[] = [
    { type: "PLAY_SELF" },
    { type: "SET_REST", target: { type: "ALL_YOUR_CHARACTERS" } },
  ];
  r.db.set("UNADJUSTED", {
    ...CARDS.VANILLA,
    id: "UNADJUSTED",
    keywords: { ...CARDS.VANILLA.keywords, trigger: true },
    effectSchema: synSchema("UNADJUSTED", "Character", [
      {
        id: "life",
        category: "auto",
        trigger: { keyword: "TRIGGER" },
        actions,
      },
    ]),
  });
  r.state.players[1].life = [
    { instanceId: "unadjusted-life", cardId: "UNADJUSTED", face: "DOWN" },
  ];
  let state = r.state;
  for (const [action, player] of [
    [
      {
        type: "DECLARE_ATTACK",
        attackerInstanceId: state.players[0].leader.instanceId,
        targetInstanceId: state.players[1].leader.instanceId,
      },
      0,
    ],
    [{ type: "PASS" }, 1],
    [{ type: "PASS" }, 1],
  ] as [GameAction, 0 | 1][])
    state = pipeline(state, action, r.db, player).state;
  const result = resume(state, { type: "REVEAL_TRIGGER", reveal: true }, r.db, {
    drainPregame: (s) => s,
    advanceStartOfTurn: (s) => s,
  });
  expect(result.state.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");
  expect(result.state.turn.triggerStagingInstanceIds).toEqual([]);
});
