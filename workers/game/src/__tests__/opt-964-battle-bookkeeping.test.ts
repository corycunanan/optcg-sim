import { describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  CardData,
  CardInstance,
  GameAction,
  GameState,
} from "../types.js";
import type { EffectBlock } from "../engine/effect-types.js";
import { OP16_080_MARSHALL_D_TEACH } from "../engine/schemas/op16.js";
import { EB01_038_OH_COME_MY_WAY } from "../engine/schemas/eb01.js";
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

const whenAttacked = (id: string, amount: number): EffectBlock => ({
  id,
  category: "auto",
  trigger: { keyword: "WHEN_ATTACKED" },
  actions: [{ type: "DRAW", params: { amount } }],
});

function fixture(teach: boolean) {
  const db = createTestCardDb();
  let state = createBattleReadyState(db);
  state.triggerRegistry = [];
  state.players[1].characters = padChars([]);
  state.players[1].hand = [];
  const leader: CardData = teach
    ? {
        ...CARDS.LEADER,
        id: "OP16-080",
        name: "Marshall.D.Teach",
        types: ["Blackbeard Pirates"],
        effectSchema: {
          ...OP16_080_MARSHALL_D_TEACH,
          effects: [
            ...OP16_080_MARSHALL_D_TEACH.effects,
            whenAttacked("leader-observer", 1),
          ],
        },
      }
    : {
        ...CARDS.LEADER,
        id: "OPT964-BAROQUE",
        types: ["Baroque Works"],
        effectSchema: { effects: [whenAttacked("leader-observer", 1)] },
      };
  db.set(leader.id, leader);
  state.players[1].leader = { ...state.players[1].leader, cardId: leader.id };
  state = registerCardEnteredField(state, state.players[1].leader, leader);
  function character(id: string, amount: number, blocker = false) {
    const data: CardData = {
      ...(blocker ? CARDS.BLOCKER : CARDS.VANILLA),
      id,
      types: ["Blackbeard Pirates"],
      effectSchema: {
        effects: [
          ...(blocker
            ? [
                {
                  id: `${id}-blocker`,
                  category: "permanent" as const,
                  flags: { keywords: ["BLOCKER" as const] },
                },
              ]
            : []),
          whenAttacked(`${id}-observer`, amount),
        ],
      },
    };
    db.set(id, data);
    const card: CardInstance = {
      instanceId: id,
      cardId: id,
      owner: 1,
      controller: 1,
      zone: "CHARACTER",
      state: blocker ? "ACTIVE" : "RESTED",
      attachedDon: [],
      turnPlayed: 1,
    };
    state.players[1].characters[
      state.players[1].characters.findIndex((c) => !c)
    ] = card;
    state = registerCardEnteredField(state, card, data);
    return card;
  }
  const original = character("opt964-original", 2);
  const blocker = character("opt964-blocker", 3, true);
  const alternate = character("opt964-alternate", 4);
  state.players[1].characters[2] = { ...alternate, state: "ACTIVE" };
  const handCard = (id: string, cardId: string): CardInstance => ({
    ...original,
    instanceId: id,
    cardId,
    zone: "HAND",
    state: "ACTIVE",
  });
  if (teach) {
    state.players[1].hand = [
      handCard("trigger-cost-a", CARDS.TRIGGER.id),
      handCard("trigger-cost-b", CARDS.TRIGGER.id),
    ];
  } else {
    db.set("EB01-038", {
      ...CARDS.EVENT_COUNTER,
      id: "EB01-038",
      name: "Oh Come My Way",
      cost: 0,
      effectText:
        '[Counter] DON!! −1: If your Leader\'s type includes "Baroque Works", select 1 of your Characters. Change the attack target to the selected Character.',
      effectSchema: EB01_038_OH_COME_MY_WAY,
    });
    state.players[1].hand = [handCard("redirect-counter", "EB01-038")];
  }
  return { state, db, original, blocker, alternate };
}

function step(
  state: GameState,
  action: GameAction,
  db: Map<string, CardData>,
  player: 0 | 1 = 1
) {
  if (state.pendingPrompt) {
    const result = resumePromptLifecycle(state, action, db, {
      drainPregame: (s) => s,
      advanceStartOfTurn: (s) => s,
    });
    expect(
      result.responseRejected,
      JSON.stringify(state.pendingPrompt.options)
    ).toBe(false);
    return result.state;
  }
  const result = runPipeline(state, action, db, player);
  expect(result.valid, result.error).toBe(true);
  return result.state;
}

function restore(
  state: GameState,
  db: Map<string, CardData>,
  location: string,
  name: string
) {
  const wire = {
    state: toPersistedGameState(state),
    undoHistory: [toPersistedGameState(state)],
    cardDb: Object.fromEntries(db),
  };
  const corpusDir = process.env.OPT964_CORPUS_DIR;
  if (corpusDir && location === "state") {
    mkdirSync(corpusDir, { recursive: true });
    writeFileSync(
      join(corpusDir, `${name}.json`),
      JSON.stringify(wire, null, 2)
    );
  }
  if (location === "memory") return state;
  const loaded = parseStoredSession(JSON.parse(JSON.stringify(wire)));
  return location === "state" ? loaded.state : loaded.undoHistory[0];
}

function assertBattle(state: GameState, expected: Record<string, unknown>) {
  expect(state.turn.battle).toMatchObject({
    step: state.turn.battleSubPhase,
    ...expected,
  });
}

const finalEvents = (state: GameState) =>
  state.eventLog.filter((e) => e.type === "ATTACK_TARGET_FINAL");

describe.each(["memory", "state", "undoHistory[0]"])(
  "native battle bookkeeping %s",
  (location) => {
    it.each([false, true])(
      "Teach pays once, selects before final-target timing, then Blocker=%s",
      (useBlocker) => {
        const f = fixture(true);
        let state = step(
          f.state,
          {
            type: "DECLARE_ATTACK",
            attackerInstanceId: f.state.players[0].characters[0]!.instanceId,
            targetInstanceId: f.original.instanceId,
          },
          f.db,
          0
        );
        expect(state.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
        state = step(
          state,
          { type: "PLAYER_CHOICE", choiceId: "accept" },
          f.db
        );
        expect(state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
        assertBattle(state, {
          step: "BLOCK_STEP",
          redirectWindow: false,
          blockerLocked: false,
          targetLocked: false,
        });
        state = restore(state, f.db, location, "teach-hand-cost");
        state = step(
          state,
          { type: "SELECT_TARGET", selectedInstanceIds: ["trigger-cost-a"] },
          f.db
        );
        expect(state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
        assertBattle(state, {
          redirectWindow: true,
          targetInstanceId: f.original.instanceId,
        });
        expect(state.players[1].hand).toHaveLength(1);
        expect(finalEvents(state)).toHaveLength(0);
        state = restore(state, f.db, location, "teach-redirect-selection");
        state = step(
          state,
          {
            type: "SELECT_TARGET",
            selectedInstanceIds: [state.players[1].leader.instanceId],
          },
          f.db
        );
        assertBattle(state, {
          redirectWindow: false,
          targetLocked: true,
          blockerLocked: false,
          targetInstanceId: state.players[1].leader.instanceId,
        });
        expect(finalEvents(state)).toHaveLength(0);
        expect(state.players[1].hand).toHaveLength(1);
        state = step(
          state,
          useBlocker
            ? {
                type: "DECLARE_BLOCKER",
                blockerInstanceId: f.blocker.instanceId,
              }
            : { type: "PASS" },
          f.db
        );
        assertBattle(state, {
          step: "COUNTER_STEP",
          blockerLocked: true,
          targetLocked: true,
          targetInstanceId: useBlocker
            ? f.blocker.instanceId
            : state.players[1].leader.instanceId,
        });
        expect(finalEvents(state)).toHaveLength(1);
        expect(state.players[1].hand).toHaveLength(1 + (useBlocker ? 3 : 1));
        expect(
          state.players[1].trash.filter((c) => c.cardId === CARDS.TRIGGER.id)
        ).toHaveLength(1);
      }
    );

    it.each([false, true])(
      "Counter redirect remains legal after target lock and Blocker=%s",
      (useBlocker) => {
        const f = fixture(false);
        let state = step(
          f.state,
          {
            type: "DECLARE_ATTACK",
            attackerInstanceId: f.state.players[0].characters[0]!.instanceId,
            targetInstanceId: f.state.players[1].leader.instanceId,
          },
          f.db,
          0
        );
        state = step(
          state,
          useBlocker
            ? {
                type: "DECLARE_BLOCKER",
                blockerInstanceId: f.blocker.instanceId,
              }
            : { type: "PASS" },
          f.db
        );
        const handBefore = state.players[1].hand.length;
        const donBefore = state.players[1].donCostArea.length;
        assertBattle(state, {
          step: "COUNTER_STEP",
          blockerLocked: true,
          targetLocked: true,
        });
        expect(finalEvents(state)).toHaveLength(1);
        state = step(
          state,
          {
            type: "USE_COUNTER_EVENT",
            cardInstanceId: "redirect-counter",
            counterTargetInstanceId: f.alternate.instanceId,
          },
          f.db
        );
        if (state.pendingPrompt?.options.promptType === "OPTIONAL_EFFECT") {
          state = step(
            state,
            { type: "PLAYER_CHOICE", choiceId: "accept" },
            f.db
          );
        }
        expect(state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
        // DON-minus may ask which DON to return before offering the redirect.
        if (
          state.effectStack.at(-1)?.pausedAction?.type !== "REDIRECT_ATTACK"
        ) {
          state = restore(state, f.db, location, "counter-don-cost");
          state = step(
            state,
            {
              type: "SELECT_TARGET",
              selectedInstanceIds: [state.players[1].donCostArea[0].instanceId],
            },
            f.db
          );
        }
        assertBattle(state, {
          step: "COUNTER_STEP",
          blockerLocked: true,
          targetLocked: true,
          redirectWindow: true,
        });
        expect(state.players[1].donCostArea).toHaveLength(donBefore - 1);
        state = restore(state, f.db, location, "counter-redirect-selection");
        state = step(
          state,
          {
            type: "SELECT_TARGET",
            selectedInstanceIds: [f.alternate.instanceId],
          },
          f.db
        );
        assertBattle(state, {
          step: "COUNTER_STEP",
          blockerLocked: true,
          targetLocked: true,
          redirectWindow: false,
          targetInstanceId: f.alternate.instanceId,
        });
        expect(state.players[1].donCostArea).toHaveLength(donBefore - 1);
        expect(state.players[1].hand).toHaveLength(handBefore - 1);
        expect(finalEvents(state)).toHaveLength(1);
        expect(state.pendingPrompt).toBeNull();
        const denied = runPipeline(
          state,
          { type: "DECLARE_BLOCKER", blockerInstanceId: f.blocker.instanceId },
          f.db,
          1
        );
        expect(denied.valid).toBe(false);
      }
    );
  }
);
