import { describe, expect, it } from "vitest";
import type {
  CardData,
  CardInstance,
  GameAction,
  QueuedTrigger,
} from "../types.js";
import type { EffectBlock } from "../engine/effect-types.js";
import { runPipeline } from "../engine/pipeline.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { parseStoredSession } from "../session/persistence.js";
import { toPersistedGameState } from "../session/game-state-schema.js";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
  padChars,
} from "./helpers.js";

function rig() {
  const db = createTestCardDb();
  let state = createBattleReadyState(db);
  state.triggerRegistry = [];
  for (const p of state.players) {
    p.characters = padChars([]);
    p.hand = [];
  }
  function put(
    id: string,
    owner: 0 | 1,
    effects: EffectBlock[],
    leader = false
  ) {
    const data: CardData = {
      ...(leader ? CARDS.LEADER : CARDS.VANILLA),
      id,
      name: id,
      power: 7000,
      effectSchema: { effects },
    };
    db.set(id, data);
    const card: CardInstance = {
      instanceId: id,
      cardId: id,
      owner,
      controller: owner,
      zone: leader ? "LEADER" : "CHARACTER",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 1,
    };
    if (leader) state.players[owner].leader = card;
    else
      state.players[owner].characters[
        state.players[owner].characters.findIndex((c) => !c)
      ] = card;
    state = registerCardEnteredField(state, card, data);
    return card;
  }
  function act(action: GameAction, player: 0 | 1 = 0) {
    if (state.pendingPrompt) {
      const result = resumePromptLifecycle(state, action, db, {
        drainPregame: (s) => s,
        advanceStartOfTurn: (s) => s,
      });
      expect(result.responseRejected).toBe(false);
      state = result.state;
    } else {
      const result = runPipeline(state, action, db, player);
      expect(result.valid, result.error).toBe(true);
      state = result.state;
    }
  }
  function reload(location: string) {
    const saved = toPersistedGameState(state);
    const result = parseStoredSession(
      JSON.parse(
        JSON.stringify({
          state: saved,
          undoHistory: [saved],
          cardDb: Object.fromEntries(db),
        })
      )
    );
    state = location === "state" ? result.state : result.undoHistory[0];
  }
  return {
    put,
    act,
    reload,
    get state() {
      return state;
    },
  };
}

function identity(queue: QueuedTrigger[]) {
  expect(queue.length).toBeGreaterThan(0);
  for (const trigger of queue) {
    expect(trigger.sourceSnapshot).toEqual({
      instanceId: trigger.sourceCardInstanceId,
      cardId: trigger.sourceCardInstanceId,
      controller: trigger.controller,
      effectBlockId: trigger.effectBlock.id,
    });
  }
}

describe.each(["state", "undoHistory[0]"])(
  "special queued producers %s",
  (location) => {
    it("captures attacker-class and deferred damage-window source identities", () => {
      const f = rig();
      const attacker = f.put(
        "damage-attacker",
        0,
        ["first-damage", "second-damage"].map((id) => ({
          id,
          category: "auto",
          trigger: { event: "ATTACK_DEALS_DAMAGE" },
          actions: [{ type: "DRAW", params: { amount: 1 } }],
        }))
      );
      const defender = f.put(
        "damage-defender",
        1,
        [
          {
            id: "deferred-empty-life",
            category: "auto",
            trigger: {
              event: "LIFE_COUNT_BECOMES_ZERO",
              filter: { controller: "SELF" },
            },
            actions: [{ type: "DRAW", params: { amount: 1 } }],
          },
        ],
        true
      );
      f.state.players[1].life = [
        { instanceId: "last-life", cardId: CARDS.TRIGGER.id, face: "DOWN" },
      ];
      f.act({
        type: "DECLARE_ATTACK",
        attackerInstanceId: attacker.instanceId,
        targetInstanceId: defender.instanceId,
      });
      f.act({ type: "PASS" }, 1);
      f.act({ type: "PASS" }, 1);
      expect(f.state.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");
      const damage = f.state.effectStack.find((frame) => frame.battleDamage)!;
      const ordering = f.state.effectStack.find(
        (frame) => frame.simultaneousTriggers.length
      )!;
      expect(damage.pendingTriggers).toHaveLength(1);
      expect(ordering.simultaneousTriggers).toHaveLength(2);
      identity(damage.pendingTriggers);
      identity(ordering.simultaneousTriggers);
      f.reload(location);
      identity(
        f.state.effectStack.find((frame) => frame.battleDamage)!.pendingTriggers
      );
      identity(
        f.state.effectStack.find((frame) => frame.simultaneousTriggers.length)!
          .simultaneousTriggers
      );
      // The snapshots survive until the attacker class drains before Life reveal.
      const choice = f.state.effectStack.flatMap(
        (frame) => frame.simultaneousTriggers
      )[0].orderingId!;
      f.act({ type: "PLAYER_CHOICE", choiceId: choice });
      if (f.state.pendingPrompt?.options.promptType === "PLAYER_CHOICE") {
        const next = f.state.pendingPrompt.options.choices!.find(
          (c) => !c.disabled && c.id !== "done"
        )!;
        f.act({ type: "PLAYER_CHOICE", choiceId: next.id });
      }
      expect(f.state.players[0].hand).toHaveLength(2);
      expect(f.state.players[1].hand).toHaveLength(0);
      expect(f.state.pendingPrompt?.options.promptType).toBe("REVEAL_TRIGGER");
    });

    it("captures End Phase wave identities and skips a later source removed by the earlier effect", () => {
      const f = rig();
      f.put("end-remover", 0, [
        {
          id: "end-remove",
          category: "auto",
          trigger: { keyword: "END_OF_YOUR_TURN" },
          actions: [
            {
              type: "KO",
              target: {
                type: "CHARACTER",
                controller: "SELF",
                count: { exact: 1 },
                filter: { name: "end-victim" },
              },
            },
          ],
        },
      ]);
      f.put("end-victim", 0, [
        {
          id: "end-draw",
          category: "auto",
          trigger: { keyword: "END_OF_YOUR_TURN" },
          actions: [{ type: "DRAW", params: { amount: 1 } }],
        },
      ]);
      f.act({ type: "ADVANCE_PHASE" });
      expect(f.state.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");
      const queued = f.state.effectStack.flatMap(
        (frame) => frame.simultaneousTriggers
      );
      expect(queued).toHaveLength(2);
      identity(queued);
      f.reload(location);
      const first = f.state.effectStack
        .flatMap((frame) => frame.simultaneousTriggers)
        .find((t) => t.effectBlock.id === "end-remove")!;
      f.act({ type: "PLAYER_CHOICE", choiceId: first.orderingId! });
      if (f.state.pendingPrompt?.options.promptType === "SELECT_TARGET") {
        f.act({ type: "SELECT_TARGET", selectedInstanceIds: ["end-victim"] });
      }
      if (f.state.pendingPrompt?.options.promptType === "PLAYER_CHOICE") {
        const next = f.state.pendingPrompt.options.choices!.find(
          (c) => !c.disabled && c.id !== "done"
        )!;
        f.act({ type: "PLAYER_CHOICE", choiceId: next.id });
      }
      expect(
        f.state.players[0].trash.some((c) => c.cardId === "end-victim")
      ).toBe(true);
      expect(f.state.players[0].hand).toHaveLength(0);
      expect(
        f.state.eventLog.some(
          (event) => event.type === "CARD_DRAWN" && event.playerIndex === 0
        )
      ).toBe(false);
      expect(f.state.pendingPrompt).toBeNull();
      expect(f.state.effectStack).toHaveLength(0);
    });
  }
);
