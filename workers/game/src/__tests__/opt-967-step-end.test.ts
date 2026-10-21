import { describe, expect, it } from "vitest";
import type {
  CardData,
  CardInstance,
  GameAction,
  GameState,
} from "../types.js";
import type { EffectBlock } from "../engine/effect-types.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import { runPipeline } from "../engine/pipeline.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { toPersistedGameState } from "../session/game-state-schema.js";
import { parseStoredSession } from "../session/persistence.js";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
  padChars,
} from "./helpers.js";

function fixture(step: "attack" | "block" | "counter") {
  const db = createTestCardDb();
  let state = createBattleReadyState(db);
  state.triggerRegistry = [];
  state.players[1].hand = [];
  state.players[1].characters = padChars([]);
  const block: EffectBlock = {
    id: "step-removal",
    category: "auto",
    trigger: {
      keyword:
        step === "attack"
          ? "ON_OPPONENT_ATTACK"
          : step === "block"
            ? "ON_BLOCK"
            : "COUNTER_EVENT",
    },
    actions: [
      {
        type: "TRASH_CARD",
        target: {
          type: "CHARACTER",
          controller: "EITHER",
          count: { up_to: 1 },
        },
      },
    ],
  };
  const data: CardData = {
    ...(step === "counter" ? CARDS.EVENT_COUNTER : CARDS.BLOCKER),
    id: "OPT967-REMOVER",
    cost: 0,
    effectText: "[Counter] Synthetic step-removal fixture",
    effectSchema: {
      effects: [
        ...(step !== "counter"
          ? [
              {
                id: "blocker",
                category: "permanent" as const,
                flags: { keywords: ["BLOCKER" as const] },
              },
            ]
          : []),
        block,
      ],
    },
  };
  db.set(data.id, data);
  const card: CardInstance = {
    ...state.players[0].characters[0]!,
    cardId: data.id,
    instanceId: "remover",
    owner: 1,
    controller: 1,
    zone: step === "counter" ? "HAND" : "CHARACTER",
    state: "ACTIVE",
  };
  if (step === "counter") state.players[1].hand = [card];
  else {
    state.players[1].characters = padChars([card]);
    state = registerCardEnteredField(state, card, data);
  }
  return { state, db, card };
}

function act(
  state: GameState,
  action: GameAction,
  db: Map<string, CardData>,
  player: 0 | 1
) {
  if (state.pendingPrompt) {
    const result = resumePromptLifecycle(state, action, db, {
      drainPregame: (s) => s,
      advanceStartOfTurn: (s) => s,
    });
    expect(result.responseRejected).toBe(false);
    return result.state;
  }
  const result = runPipeline(state, action, db, player);
  expect(result.valid, result.error).toBe(true);
  return result.state;
}

function reload(state: GameState, db: Map<string, CardData>, location: string) {
  if (location === "memory") return state;
  const wire = JSON.parse(
    JSON.stringify({
      state: toPersistedGameState(state),
      undoHistory: [toPersistedGameState(state)],
      cardDb: Object.fromEntries(db),
    })
  );
  const loaded = parseStoredSession(wire);
  return location === "live" ? loaded.state : loaded.undoHistory[0];
}

// Independent expectations: rules 7-1-1-4, 7-1-2-3, 7-1-3-3 skip directly
// to End of Battle after the step's suspended effects finish. No damage or
// battle-result event is permitted. Synthetic effects isolate each boundary.
describe.each(["memory", "live", "undo"])(
  "step-end checkpoint through %s",
  (location) => {
    it.each(
      ["attack", "block", "counter"].flatMap((step) =>
        ["attacker", "target"].map((combatant) => ({ step, combatant }))
      )
    )("$combatant leaves inside a $step prompt", ({ step, combatant }) => {
      const f = fixture(step as "attack" | "block" | "counter");
      const target: CardInstance = {
        ...f.state.players[0].characters[0]!,
        instanceId: "target-967",
        owner: 1,
        controller: 1,
        state: "RESTED",
      };
      f.state.players[1].characters = padChars([
        ...f.state.players[1].characters.filter(
          (card): card is CardInstance => card !== null
        ),
        target,
      ]);
      const attacker = f.state.players[0].characters[0]!.instanceId;
      let state = act(
        f.state,
        {
          type: "DECLARE_ATTACK",
          attackerInstanceId: attacker,
          targetInstanceId:
            combatant === "target"
              ? target.instanceId
              : f.state.players[1].leader.instanceId,
        },
        f.db,
        0
      );
      if (step === "block")
        state = act(
          state,
          { type: "DECLARE_BLOCKER", blockerInstanceId: f.card.instanceId },
          f.db,
          1
        );
      if (step === "counter") {
        state = act(state, { type: "PASS" }, f.db, 1);
        state = act(
          state,
          {
            type: "USE_COUNTER_EVENT",
            cardInstanceId: f.card.instanceId,
            counterTargetInstanceId: state.players[1].leader.instanceId,
          },
          f.db,
          1
        );
      }
      expect(state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
      const whilePending = runPipeline(
        state,
        { type: "DECLARE_BLOCKER", blockerInstanceId: f.card.instanceId },
        f.db,
        1
      );
      expect(whilePending.valid).toBe(false);
      expect(
        runPipeline(
          state,
          {
            type: "USE_COUNTER_EVENT",
            cardInstanceId: f.card.instanceId,
            counterTargetInstanceId: target.instanceId,
          },
          f.db,
          1
        ).valid
      ).toBe(false);
      state = reload(state, f.db, location);
      state = act(
        state,
        {
          type: "SELECT_TARGET",
          selectedInstanceIds: [
            combatant === "attacker"
              ? attacker
              : state.turn.battle!.targetInstanceId,
          ],
        },
        f.db,
        1
      );
      expect(state.pendingPrompt).toBeNull();
      expect(state.effectStack).toEqual([]);
      expect(state.turn.battle).toBeNull();
      expect(state.turn.battleSubPhase).toBeNull();
      expect(
        state.eventLog.filter((e) =>
          ["CHARACTER_BATTLES", "COMBAT_VICTORY", "DAMAGE_DEALT"].includes(
            e.type
          )
        )
      ).toEqual([]);
      expect(
        state.eventLog.filter((e) => e.type === "END_OF_BATTLE")
      ).toHaveLength(1);
      expect(
        runPipeline(
          state,
          { type: "DECLARE_BLOCKER", blockerInstanceId: f.card.instanceId },
          f.db,
          1
        ).valid
      ).toBe(false);
      expect(
        runPipeline(
          state,
          {
            type: "USE_COUNTER_EVENT",
            cardInstanceId: f.card.instanceId,
            counterTargetInstanceId: state.players[1].leader.instanceId,
          },
          f.db,
          1
        ).valid
      ).toBe(false);
    });
  }
);
