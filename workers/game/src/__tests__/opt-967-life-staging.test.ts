import { describe, expect, it } from "vitest";
import { endPhaseRig, synSchema, type EndPhaseRig } from "./opt-962-rig.js";
import { CARDS } from "./helpers.js";
import type { Action, EffectBlock } from "../engine/effect-types.js";
import { SessionRepository } from "../session/persistence.js";
import { MemorySessionStorage } from "./fixtures/opt-940-synthetic-states.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import {
  beginLifeTriggerStaging,
  finishLifeTriggerStaging,
} from "../engine/life-trigger-staging.js";
import { continuationFrame } from "../engine/damage-frames.js";
import { resumeBattleDamageFrame } from "../engine/battle.js";
import { resumeEffectDamageFrame } from "../engine/effect-damage.js";
import { drainPendingWork } from "../engine/pending-work-drain.js";
import { resolverExecutionServices } from "../engine/effect-resolver/resolver.js";
import { SessionCoordinator } from "../session/coordinator.js";
import { transitionCard } from "../engine/zone-transition.js";

const services = {
  drainPregame: (s: EndPhaseRig["state"]) => s,
  advanceStartOfTurn: (s: EndPhaseRig["state"]) => s,
};
const rest: Action = {
  type: "SET_REST",
  target: {
    type: "CHARACTER",
    controller: "EITHER",
    count: { all: true },
    filter: { name: "REST-WATCHER-967" },
  },
};
const play: Action = {
  type: "PLAY_CARD",
  target: { type: "CHARACTER_CARD", source_zone: "TRASH", count: { up_to: 1 } },
  params: {
    source_zone: "TRASH",
    cost_override: "FREE",
    entry_state: "RESTED",
  },
};
const draw: Action = { type: "DRAW", params: { amount: 1 } };
function setup(
  kind: "battle" | "effect",
  actions: Action[],
  onPlay?: Action[],
  watcher: Action[] = [draw],
  watcherOwner: 0 | 1 = 1
) {
  const r = endPhaseRig({ handSize: 0, deckSize: 12 });
  r.state.turn.triggerStagingInstanceIds = ["unrelated-outer-marker"];
  r.putSyn(
    "REST-WATCHER-967",
    synSchema("REST-WATCHER-967", "Character", [
      {
        id: "rest-watch",
        category: "auto",
        trigger: { event: "CHARACTER_BECOMES_RESTED" },
        actions: watcher,
      },
    ]),
    watcherOwner,
    "CHARACTER"
  );
  // A dedicated hand-zone Trigger fixture avoids unrelated field re-registration
  // when PLAY_SELF enters; its On Play remains a normal field effect.
  const effects: EffectBlock[] = [
    {
      id: "life",
      category: "auto",
      zone: "HAND",
      trigger: { keyword: "TRIGGER" },
      actions,
    },
  ];
  if (onPlay)
    effects.push({
      id: "on-play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: onPlay,
    });
  const trigger = {
    ...CARDS.VANILLA,
    id: "LIFE-TRIGGER-967",
    keywords: { ...CARDS.VANILLA.keywords, trigger: true },
    effectSchema: synSchema("LIFE-TRIGGER-967", "Character", effects),
  };
  r.db.set(trigger.id, trigger);
  r.state.players[1].life = [
    { instanceId: "life-trigger", cardId: trigger.id, face: "DOWN" },
  ];
  if (kind === "battle") {
    r.act({
      type: "DECLARE_ATTACK",
      attackerInstanceId: r.state.players[0].leader.instanceId,
      targetInstanceId: r.state.players[1].leader.instanceId,
    });
    r.act({ type: "PASS" }, 1);
    r.act({ type: "PASS" }, 1);
  } else {
    const dealer = r.putSyn(
      "DEALER-967",
      synSchema("DEALER-967", "Character", [
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
    r.act({
      type: "ACTIVATE_EFFECT",
      cardInstanceId: dealer.instanceId,
      effectId: "damage",
    });
  }
  expect(r.state.pendingPrompt?.options.promptType).toBe("REVEAL_TRIGGER");
  return r;
}
async function reload(r: EndPhaseRig, location: string) {
  r.state.pendingPrompt!.promptId = "staging-fixed";
  if (location === "memory") return;
  const storage = new MemorySessionStorage();
  const repo = new SessionRepository(storage, {
    nextJsUrl: "https://app.example.test",
    workerSecret: "secret",
  });
  await repo.save({
    state: r.state,
    cardDb: r.db,
    undoHistory: [r.state],
    mode: "PVP",
    pregameMode: "PRIORITY_ROLL",
    testPriorityRolls: null,
  });
  expect(JSON.stringify(Object.fromEntries(storage.data))).not.toContain(
    '"lifeTriggerStaging"'
  );
  const loaded = (await repo.load())!;
  r.state = location === "live" ? loaded.state : loaded.undoHistory[0];
}
const stable = (r: EndPhaseRig) => {
  expect(r.state.pendingPrompt).toBeNull();
  expect(r.state.effectStack).toEqual([]);
  expect(r.state.turn.triggerStagingInstanceIds).toEqual([
    "unrelated-outer-marker",
  ]);
};
describe.each(["battle", "effect"] as const)(
  "Life staging across %s work-only returns",
  (kind) => {
    it("internal SET_REST batch keeps its own source hidden through the trash suffix", () => {
      const r = setup(kind, [rest, play]);
      r.act({ type: "REVEAL_TRIGGER", reveal: true }, 1);
      stable(r);
      expect(
        r.state.players[1].trash.filter(
          (card) => card.cardId === "LIFE-TRIGGER-967"
        )
      ).toHaveLength(1);
      expect(
        r.state.eventLog.filter(
          (event) => event.type === "CARD_REMOVED_FROM_LIFE"
        )
      ).toHaveLength(1);
      expect(
        r.state.eventLog.filter((event) => event.type === "CARD_DRAWN")
      ).toHaveLength(1);
    });
    it("direct work/compatibility handoff carries its exact transient cursor into the common drain", () => {
      const r = setup(kind, [rest, play]);
      const raw =
        kind === "battle"
          ? resumeBattleDamageFrame(
              { ...r.state, pendingPrompt: null },
              true,
              r.db
            )
          : resumeEffectDamageFrame(
              { ...r.state, pendingPrompt: null },
              true,
              r.db
            );
      expect(raw.lifeTriggerStaging).toHaveLength(1);
      expect(raw.state.turn.triggerStagingInstanceIds).toHaveLength(2);
      const drained = drainPendingWork(
        { ...raw, resolved: true },
        r.db,
        resolverExecutionServices
      );
      expect(drained.lifeTriggerStaging).toBeUndefined();
      r.state = drained.state;
      stable(r);
    });
    it.each(["plain", "self-ko", "return-and-hand-trash"] as const)(
      "follows remapped PLAY_SELF source exactly (%s)",
      (path) => {
        const onPlay: Action[] | undefined =
          path === "self-ko"
            ? [{ type: "KO", target: { type: "SELF" } }]
            : path === "return-and-hand-trash"
              ? [
                  { type: "RETURN_TO_HAND", target: { type: "SELF" } },
                  {
                    type: "TRASH_CARD",
                    target: {
                      type: "CARD_IN_HAND",
                      controller: "SELF",
                      count: { all: true },
                    },
                  },
                ]
              : undefined;
        const r = setup(
          kind,
          [{ type: "PLAY_SELF" }, rest, play],
          onPlay,
          [draw],
          0
        );
        r.act({ type: "REVEAL_TRIGGER", reveal: true }, 1);
        stable(r);
        const sourceField = r.state.players[1].characters.filter(
          (card) => card?.cardId === "LIFE-TRIGGER-967"
        );
        const sourceTrash = r.state.players[1].trash.filter(
          (card) => card.cardId === "LIFE-TRIGGER-967"
        );
        expect(sourceField).toHaveLength(path === "plain" ? 1 : 0);
        expect(sourceTrash).toHaveLength(path === "plain" ? 0 : 1);
        expect(
          r.state.eventLog.filter(
            (event) =>
              event.type === "CARD_PLAYED" &&
              event.payload.cardId === "LIFE-TRIGGER-967"
          )
        ).toHaveLength(1);
        expect(
          r.state.eventLog.filter(
            (event) => event.type === "CARD_REMOVED_FROM_LIFE"
          )
        ).toHaveLength(1);
      }
    );
    it.each(["memory", "live", "undo"])(
      "a genuine prompt clears staging after candidates lock, preserving historical later replies (%s)",
      async (location) => {
        const r = setup(kind, [rest, play, play]);
        const other = r.putSyn("TRASH-CANDIDATE-967", null, 1, "HAND");
        r.state = transitionCard(r.state, other.instanceId, "TRASH")!.state;
        const otherId = r.state.players[1].trash.find(
          (card) => card.cardId === other.cardId
        )!.instanceId;
        r.act({ type: "REVEAL_TRIGGER", reveal: true }, 1);
        expect(r.state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
        if (r.state.pendingPrompt?.options.promptType !== "SELECT_TARGET")
          throw new Error("expected target decision");
        expect(r.state.pendingPrompt.options.validTargets).toEqual([otherId]);
        expect(r.state.turn.triggerStagingInstanceIds).toEqual([
          "unrelated-outer-marker",
        ]);
        await reload(r, location);
        const before = structuredClone(r.state);
        const rejected = resumePromptLifecycle(
          r.state,
          { type: "SELECT_TARGET", selectedInstanceIds: ["invalid"] },
          r.db,
          services
        );
        expect(rejected.responseRejected).toBe(true);
        expect(rejected.state).toEqual(before);
        const duplicate = new SessionCoordinator().routePromptResponse(
          r.state,
          1,
          { type: "REVEAL_TRIGGER", reveal: true }
        );
        expect(duplicate.kind).toBe("reject");
        expect(duplicate.state).toEqual(before);
        r.act({ type: "SELECT_TARGET", selectedInstanceIds: [otherId] }, 1);
        const source = r.state.players[1].trash.find(
          (card) => card.cardId === "LIFE-TRIGGER-967"
        )!;
        if (r.state.pendingPrompt?.options.promptType !== "SELECT_TARGET")
          throw new Error("expected second target decision");
        // Existing genuine-prompt behavior: the later suffix can see the source.
        expect(r.state.pendingPrompt.options.validTargets).toEqual([
          source.instanceId,
        ]);
        expect(r.state.turn.triggerStagingInstanceIds).toEqual([
          "unrelated-outer-marker",
        ]);
        r.act({ type: "SELECT_TARGET", selectedInstanceIds: [] }, 1);
        stable(r);
        expect(
          r.state.eventLog.filter(
            (event) => event.type === "CARD_REMOVED_FROM_LIFE"
          )
        ).toHaveLength(1);
      }
    );
    it("memory, live and undo preserve the exact complete trace and state after a true wait", async () => {
      const states = [];
      for (const location of ["memory", "live", "undo"]) {
        const r = setup(kind, [rest, play, play]);
        const other = r.putSyn("TRASH-CANDIDATE-967", null, 1, "HAND");
        r.state = transitionCard(r.state, other.instanceId, "TRASH")!.state;
        const target = r.state.players[1].trash[0].instanceId;
        r.act({ type: "REVEAL_TRIGGER", reveal: true }, 1);
        await reload(r, location);
        r.act({ type: "SELECT_TARGET", selectedInstanceIds: [target] }, 1);
        r.act({ type: "SELECT_TARGET", selectedInstanceIds: [] }, 1);
        stable(r);
        states.push(r.state);
      }
      expect(states[1]).toEqual(states[0]);
      expect(states[2]).toEqual(states[0]);
    });
    it("a genuine trigger-order decision clears staging after its same-effect suffix already excluded the source", () => {
      const r = setup(kind, [rest, play]);
      r.putSyn(
        "SECOND-WATCHER",
        synSchema("SECOND-WATCHER", "Character", [
          {
            id: "second",
            category: "auto",
            trigger: { event: "CHARACTER_BECOMES_RESTED" },
            actions: [draw],
          },
        ]),
        1,
        "CHARACTER"
      );
      r.act({ type: "REVEAL_TRIGGER", reveal: true }, 1);
      expect(r.state.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");
      expect(r.state.turn.triggerStagingInstanceIds).toEqual([
        "unrelated-outer-marker",
      ]);
      expect(r.orderTriggers()).toBeGreaterThan(0);
      // The batch's same-effect suffix precedes its newly fulfilled ordinary
      // watcher cohort. Its candidates were built while the source was staged.
      stable(r);
      expect(
        r.state.players[1].trash.filter(
          (card) => card.cardId === "LIFE-TRIGGER-967"
        )
      ).toHaveLength(1);
      expect(
        r.state.eventLog.filter((event) => event.type === "CARD_PLAYED")
      ).toHaveLength(0);
      expect(
        r.state.eventLog.filter((event) => event.type === "CARD_DRAWN")
      ).toHaveLength(2);
    });
    it("nested same-card Life waits clear the enclosing scope without clearing unrelated markers", () => {
      const r = setup(kind, [
        {
          type: "DEAL_DAMAGE",
          target: { type: "PLAYER", controller: "OPPONENT" },
          params: { amount: 1 },
        },
        play,
      ]);
      r.state.players[0].life = [
        { instanceId: "inner-life", cardId: "LIFE-TRIGGER-967", face: "DOWN" },
      ];
      r.act({ type: "REVEAL_TRIGGER", reveal: true }, 1);
      expect(r.state.pendingPrompt?.options.promptType).toBe("REVEAL_TRIGGER");
      expect(r.state.turn.triggerStagingInstanceIds).toEqual([
        "unrelated-outer-marker",
      ]);
      r.act({ type: "REVEAL_TRIGGER", reveal: false }, 0);
      expect(r.state.turn.triggerStagingInstanceIds).toEqual([
        "unrelated-outer-marker",
      ]);
      if (r.state.pendingPrompt?.options.promptType === "SELECT_TARGET")
        r.act({ type: "SELECT_TARGET", selectedInstanceIds: [] }, 1);
      stable(r);
    });
    it.each([false, true])(
      "terminal at an internal boundary clears scoped and pending staging (remap %s)",
      (remap) => {
        const r = setup(
          kind,
          [...(remap ? [{ type: "PLAY_SELF" } as Action] : []), rest, play],
          undefined,
          [{ type: "WIN_GAME" }],
          0
        );
        r.act({ type: "REVEAL_TRIGGER", reveal: true }, 1);
        expect(r.state.status).toBe("FINISHED");
        expect(r.state.pendingPrompt).toBeNull();
        expect(r.state.effectStack).toEqual([]);
        expect(r.state.turn.triggerStagingInstanceIds).toEqual([]);
        expect(
          r.state.eventLog.filter((event) => event.type === "GAME_OVER")
        ).toHaveLength(1);
        expect(r.state.eventLog.at(-1)?.type).toBe("GAME_OVER");
      }
    );
  }
);
it("nested exact slots adjust after an inner cleanup, including same-card identities and movement of an outer source", () => {
  const r = endPhaseRig();
  const owner = (id: string) =>
    continuationFrame({
      id,
      sourceCardInstanceId: r.state.players[0].leader.instanceId,
      controller: 0,
      phase: "INTERRUPTED_BY_TRIGGERS",
      effectDamage: {
        stage: "TRIGGER_EFFECT",
        damagedPlayerIndex: 0,
        remainingDamages: 0,
        dealt: 1,
        sourceCardInstanceId: "dealer",
        controllerIndex: 1,
        lifeCardInstanceId: id,
      },
    });
  r.state.effectStack = [owner("outer"), owner("inner")];
  r.state.turn.triggerStagingInstanceIds = ["unrelated"];
  const a = beginLifeTriggerStaging(r.state, "outer", "same-card-outer");
  const b = beginLifeTriggerStaging(a.state, "inner", "same-card-inner");
  b.state.turn.triggerStagingInstanceIds = [
    "unrelated",
    "outer-remapped-by-child",
    "inner-remapped",
  ];
  const inner = finishLifeTriggerStaging(
    b.state,
    [...a.scopes, ...b.scopes],
    "inner"
  );
  expect(inner.state.turn.triggerStagingInstanceIds).toEqual([
    "unrelated",
    "outer-remapped-by-child",
  ]);
  expect(inner.scopes).toEqual(a.scopes);
  const all = finishLifeTriggerStaging(inner.state, inner.scopes);
  expect(all.state.turn.triggerStagingInstanceIds).toEqual(["unrelated"]);
  const first = finishLifeTriggerStaging(
    b.state,
    [...a.scopes, ...b.scopes],
    "outer"
  );
  expect(first.scopes).toEqual([{ damageOwnerId: "inner", slot: 1 }]);
  expect(
    finishLifeTriggerStaging(first.state, first.scopes).state.turn
      .triggerStagingInstanceIds
  ).toEqual(["unrelated"]);
});
it.each(["missing-owner", "lost-slot"])(
  "an owned contradiction stops via contract cleanup without mutating unrelated input (%s)",
  (broken) => {
    const r = setup("battle", [rest, play]);
    const frame = r.state.effectStack.at(-1)!;
    const staged = beginLifeTriggerStaging(r.state, frame.id, "owned");
    const invalid = {
      ...staged.state,
      effectStack: broken === "missing-owner" ? [] : staged.state.effectStack,
      turn: {
        ...staged.state.turn,
        triggerStagingInstanceIds:
          broken === "lost-slot"
            ? ["unrelated-outer-marker"]
            : staged.state.turn.triggerStagingInstanceIds,
      },
    };
    const before = structuredClone(invalid);
    const failed = finishLifeTriggerStaging(invalid, staged.scopes);
    expect(invalid).toEqual(before);
    expect(failed.state.engineOutcome?.type).toBe("ENGINE_ERROR_DRAW");
    expect(failed.state.turn.triggerStagingInstanceIds).toEqual([]);
    expect(
      failed.state.eventLog.filter((event) => event.type === "GAME_OVER")
    ).toHaveLength(1);
  }
);
