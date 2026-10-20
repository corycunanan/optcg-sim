import { describe, expect, it } from "vitest";
import type { CardData, CardInstance, GameAction } from "../types.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { EFFECT_SOURCE_SNAPSHOT_REF } from "../engine/effect-types.js";
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

function fixture() {
  const db = createTestCardDb();
  let state = createBattleReadyState(db);
  state.triggerRegistry = [];
  for (const player of state.players) {
    player.characters = padChars([]);
    player.hand = [];
  }
  const leader = {
    ...CARDS.LEADER,
    id: "OPT964-DONQUIXOTE",
    types: ["Donquixote Pirates"],
  };
  db.set(leader.id, leader);
  for (const player of state.players)
    player.leader = { ...player.leader, cardId: leader.id };
  function authored(id: string, cost: number, power: number) {
    const schema = getEffectSchema(id);
    expect(schema).toBeDefined();
    const data: CardData = {
      ...CARDS.VANILLA,
      id,
      name: schema!.card_name!,
      cost,
      power,
      effectSchema: schema!,
    };
    db.set(id, data);
    return data;
  }
  function put(data: CardData, controller: 0 | 1, zone: "HAND" | "CHARACTER") {
    db.set(data.id, data);
    const card: CardInstance = {
      instanceId: `${data.id}-${controller}-${zone}`,
      cardId: data.id,
      controller,
      owner: controller,
      zone,
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 1,
    };
    if (zone === "HAND") state.players[controller].hand.push(card);
    else {
      state.players[controller].characters[
        state.players[controller].characters.findIndex((c) => !c)
      ] = card;
      state = registerCardEnteredField(state, card, data);
    }
    return card;
  }
  function act(action: GameAction, controller: 0 | 1 = 0) {
    if (state.pendingPrompt) {
      const result = resumePromptLifecycle(state, action, db, {
        drainPregame: (s) => s,
        advanceStartOfTurn: (s) => s,
      });
      expect(
        result.responseRejected,
        JSON.stringify(state.pendingPrompt.options)
      ).toBe(false);
      state = result.state;
    } else {
      const result = runPipeline(state, action, db, controller);
      expect(result.valid, result.error).toBe(true);
      state = result.state;
    }
  }
  function restore(location: "state" | "undoHistory[0]") {
    const saved = toPersistedGameState(state);
    const loaded = parseStoredSession(
      JSON.parse(
        JSON.stringify({
          state: saved,
          undoHistory: [saved],
          cardDb: Object.fromEntries(db),
        })
      )
    );
    state = location === "state" ? loaded.state : loaded.undoHistory[0];
  }
  return {
    db,
    authored,
    put,
    act,
    restore,
    get state() {
      return state;
    },
  };
}

describe("authored Sugar source timing (OP04 FAQ)", () => {
  it.each(["state", "undoHistory[0]"] as const)(
    "Marco removes Sugar before her pending effect activates (%s)",
    (location) => {
      const f = fixture();
      const sugar = f.put(f.authored("OP04-024", 2, 2000), 1, "CHARACTER");
      const marco = f.put(f.authored("OP03-013", 5, 6000), 0, "HAND");
      f.act({ type: "PLAY_CARD", cardInstanceId: marco.instanceId });
      expect(f.state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
      expect(f.state.pendingPrompt?.respondingPlayer).toBe(0);
      f.restore(location);
      f.act({ type: "SELECT_TARGET", selectedInstanceIds: [sugar.instanceId] });
      expect(
        f.state.players[1].trash.some((c) => c.cardId === sugar.cardId)
      ).toBe(true);
      expect(
        f.state.players[0].characters.find((c) => c?.cardId === marco.cardId)
          ?.state
      ).toBe("ACTIVE");
      expect(f.state.pendingPrompt).toBeNull();
      expect(f.state.effectStack).toHaveLength(0);
      expect(
        f.state.turn.oncePerTurnUsed.opponent_turn_reactive_rest ?? []
      ).not.toContain(sugar.instanceId);
      expect(
        f.state.eventLog.filter(
          (e) =>
            e.type === "CARD_STATE_CHANGED" && e.payload.newState === "RESTED"
        )
      ).toHaveLength(0);
    }
  );

  it("Sugar that remains offers her real rest effect and then rests herself", () => {
    const f = fixture();
    const sugar = f.put(f.authored("OP04-024", 2, 2000), 1, "CHARACTER");
    const played = f.put(CARDS.VANILLA, 0, "HAND");
    f.act({ type: "PLAY_CARD", cardInstanceId: played.instanceId });
    expect(f.state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    expect(f.state.pendingPrompt?.respondingPlayer).toBe(1);
    const target = f.state.players[0].characters.find(
      (c) => c?.cardId === played.cardId
    )!;
    f.act(
      { type: "SELECT_TARGET", selectedInstanceIds: [target.instanceId] },
      1
    );
    expect(
      f.state.players[0].characters.find(
        (c) => c?.instanceId === target.instanceId
      )?.state
    ).toBe("RESTED");
    expect(
      f.state.players[1].characters.find(
        (c) => c?.instanceId === sugar.instanceId
      )?.state
    ).toBe("RESTED");
    expect(f.state.turn.oncePerTurnUsed.opponent_turn_reactive_rest).toContain(
      sugar.instanceId
    );
    expect(f.state.pendingPrompt).toBeNull();
  });
});

it.each(["state", "undoHistory[0]"] as const)(
  "authored Senor Pink pays DON, schedules refresh, then leaves before End Phase (%s)",
  (location) => {
    const f = fixture();
    const pink = f.put(f.authored("OP04-026", 3, 5000), 0, "CHARACTER");
    // The removal producer is deliberately synthetic. Pink's complete authored
    // When Attacking cost, post-cost condition, rest and schedule stay intact.
    const killer = f.put(
      {
        ...CARDS.VANILLA,
        id: "OPT964-PINK-REMOVER",
        name: "Timing removal producer",
        effectSchema: {
          effects: [
            {
              id: "remove-attacker",
              category: "auto",
              trigger: { keyword: "ON_OPPONENT_ATTACK" },
              actions: [
                {
                  type: "KO",
                  target: {
                    type: "CHARACTER",
                    controller: "OPPONENT",
                    count: { exact: 1 },
                    filter: { name: "Senor Pink" },
                  },
                },
              ],
            },
          ],
        },
      },
      1,
      "CHARACTER"
    );
    const donBefore = f.state.players[0].donCostArea.filter(
      (d) => d.state === "ACTIVE"
    ).length;
    f.act({
      type: "DECLARE_ATTACK",
      attackerInstanceId: pink.instanceId,
      targetInstanceId: f.state.players[1].leader.instanceId,
    });
    expect(f.state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    expect(f.state.pendingPrompt?.respondingPlayer).toBe(0);
    expect(
      f.state.players[0].donCostArea.filter((d) => d.state === "ACTIVE")
    ).toHaveLength(donBefore - 1);
    f.restore(location);
    f.act({ type: "SELECT_TARGET", selectedInstanceIds: [killer.instanceId] });
    if (f.state.pendingPrompt?.options.promptType === "SELECT_TARGET") {
      expect(f.state.pendingPrompt.respondingPlayer).toBe(1);
      f.act(
        { type: "SELECT_TARGET", selectedInstanceIds: [pink.instanceId] },
        1
      );
    }
    expect(f.state.players[0].trash.some((c) => c.cardId === pink.cardId)).toBe(
      true
    );
    expect(f.state.scheduledActions).toHaveLength(1);
    expect(f.state.scheduledActions[0]).toMatchObject({
      timing: "END_OF_THIS_TURN",
      action: { type: "SET_DON_ACTIVE" },
      controller: 0,
    });
    f.restore(location);
    // An attacker removed during attack triggers may leave a battle to close.
    for (let i = 0; i < 4 && f.state.turn.battle; i++)
      f.act({ type: "PASS" }, 1);
    expect(f.state.turn.battle).toBeNull();
    f.act({ type: "ADVANCE_PHASE" });
    expect(f.state.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");
    f.restore(location);
    f.act({ type: "PLAYER_CHOICE", choiceId: "choose-value:1" });
    if (f.state.pendingPrompt?.options.promptType === "SELECT_TARGET") {
      const rested = f.state.players[0].donCostArea.find(
        (d) => d.state === "RESTED"
      )!;
      f.act({
        type: "SELECT_TARGET",
        selectedInstanceIds: [rested.instanceId],
      });
    }
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.state.scheduledActions).toHaveLength(0);
    expect(
      f.state.players[0].donCostArea.filter((d) => d.state === "ACTIVE")
    ).toHaveLength(donBefore);
    expect(
      f.state.players[0].characters.some(
        (c) => c?.instanceId === pink.instanceId
      )
    ).toBe(false);
  }
);

it.each(["state", "undoHistory[0]"] as const)(
  "authored Marco OnKO activates from its fresh Trash identity and replays (%s)",
  (location) => {
    const f = fixture();
    const marco = f.put(f.authored("OP03-013", 5, 6000), 1, "CHARACTER");
    const eventCost = f.put(CARDS.EVENT_COUNTER, 1, "HAND");
    // Only the opposing K.O. producer is synthetic; Marco's authored
    // OnKO trash-Event cost and rested replay are used without modification.
    const remover = f.put(
      {
        ...CARDS.VANILLA,
        id: "OPT964-MARCO-REMOVER",
        cost: 0,
        effectSchema: {
          effects: [
            {
              id: "remove-marco",
              category: "auto",
              trigger: { keyword: "ON_PLAY" },
              actions: [
                {
                  type: "KO",
                  target: {
                    type: "CHARACTER",
                    controller: "OPPONENT",
                    count: { exact: 1 },
                  },
                },
              ],
            },
          ],
        },
      },
      0,
      "HAND"
    );
    f.act({ type: "PLAY_CARD", cardInstanceId: remover.instanceId });
    expect(f.state.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
    const trashedMarco = f.state.players[1].trash.find(
      (c) => c.cardId === marco.cardId
    )!;
    expect(trashedMarco.instanceId).not.toBe(marco.instanceId);
    const activated = f.state.effectStack.at(-1)!;
    expect(activated.sourceCardInstanceId).toBe(trashedMarco.instanceId);
    expect(
      activated.resultRefs.find(
        ([key]) => key === EFFECT_SOURCE_SNAPSHOT_REF
      )?.[1].sourceIdentity
    ).toEqual({
      instanceId: trashedMarco.instanceId,
      cardId: marco.cardId,
      controller: 1,
      effectBlockId: "on_ko_replay",
    });
    f.restore(location);
    f.act({ type: "PLAYER_CHOICE", choiceId: "accept" }, 1);
    if (f.state.pendingPrompt?.options.promptType === "SELECT_TARGET") {
      f.act(
        { type: "SELECT_TARGET", selectedInstanceIds: [eventCost.instanceId] },
        1
      );
    }
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.state.effectStack).toHaveLength(0);
    const replayed = f.state.players[1].characters.find(
      (c) => c?.cardId === marco.cardId
    )!;
    expect(replayed.state).toBe("RESTED");
    expect(replayed.instanceId).not.toBe(trashedMarco.instanceId);
    expect(replayed.instanceId).not.toBe(marco.instanceId);
    expect(
      f.state.players[1].trash.some((c) => c.cardId === eventCost.cardId)
    ).toBe(true);
  }
);
