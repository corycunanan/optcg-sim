import { describe, expect, it } from "vitest";
import type {
  CardData,
  CardInstance,
  GameAction,
  GameState,
} from "../types.js";
import {
  SessionRepository,
  parseStoredSession,
  type SessionStorage,
} from "../session/persistence.js";
import { runPipeline } from "../engine/pipeline.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import {
  registerCardEnteredField,
  matchTriggersForEvent,
} from "../engine/triggers.js";
import { getEffectiveBasePower } from "../engine/modifiers.js";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
  padChars,
} from "./helpers.js";

class RestMemory implements SessionStorage {
  data = new Map<string, unknown>();
  async get<T>(key: string) {
    return this.data.get(key) as T | undefined;
  }
  async put(key: string | Record<string, unknown>, value?: unknown) {
    for (const [k, v] of Object.entries(
      typeof key === "string" ? { [key]: value } : key
    ))
      this.data.set(k, JSON.parse(JSON.stringify(v)));
  }
  async setAlarm() {}
  async deleteAlarm() {}
}
async function roundTripRest(state: GameState, cardDb: Map<string, CardData>) {
  const storage = new RestMemory();
  const config = { nextJsUrl: "https://example.test", workerSecret: "test" };
  await new SessionRepository(storage, config).save({
    state,
    cardDb,
    undoHistory: [],
    mode: "PVP",
    pregameMode: "PRIORITY_ROLL",
    testPriorityRolls: null,
  });
  const loaded = await new SessionRepository(storage, config).load();
  expect(loaded).not.toBeNull();
  return loaded!;
}

// Expectations: docs/cards/{EB-03,EB-04,PRB-02,UNKNOWN}.md and PRB02-004/006 FAQ.
function fixture() {
  const db = createTestCardDb();
  for (const [id, cost] of [
    ["EB03-018", 4],
    ["EB04-003", 8],
    ["EB04-035", 3],
    ["EB04-038", 3],
    ["P-085", 3],
    ["PRB02-004", 3],
    ["PRB02-006", 4],
    ["PRB02-009", 3],
    ["OP01-033", 3],
    ["OP01-054", 5],
    ["EB04-030", 8],
    ["OP10-036", 3],
    ["OP01-117", 2],
    ["OP01-118", 1],
    ["OP01-058", 2],
  ] as const) {
    const schema = getEffectSchema(id)!;
    db.set(id, {
      ...CARDS.VANILLA,
      id,
      name: schema.card_name!,
      effectText:
        id === "OP01-117"
          ? "[Main] DON!! −1: Rest up to 1 of your opponent’s Characters with a cost of 6 or less."
          : id === "OP01-058"
            ? "[Counter] Up to 1 of your Leader or Character cards gains +4000 power during this battle. Then, rest up to 1 of your opponent’s Characters with a cost of 4 or less."
            : id === "OP01-118"
              ? "[Counter] DON!! −2: Up to 1 of your Leader or Character cards gains +2000 power during this battle. Then, draw 1 card."
              : "",
      cost,
      type: schema.card_type === "Event" ? "Event" : "Character",
      effectSchema: schema,
    });
  }
  let state = createBattleReadyState(db);
  state.players[0].characters = padChars([]);
  state.players[1].characters = padChars([]);
  function put(
    id: string,
    controller: 0 | 1,
    zone: CardInstance["zone"] = "CHARACTER"
  ) {
    const c: CardInstance = {
      ...state.players[controller].leader,
      cardId: id,
      instanceId: `${id}-${controller}-${zone}`,
      controller,
      owner: controller,
      zone,
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 0,
    };
    if (zone === "HAND") state.players[controller].hand.push(c);
    else {
      state.players[controller].characters[
        state.players[controller].characters.indexOf(null)
      ] = c;
      state = registerCardEnteredField(state, c, db.get(id)!);
    }
    return c;
  }
  function act(
    action: GameAction,
    player: 0 | 1 = state.turn.activePlayerIndex
  ) {
    if (state.pendingPrompt) {
      const r = resumePromptLifecycle(state, action, db, {
        drainPregame: (s) => s,
        advanceStartOfTurn: (s) => s,
      });
      expect(r.responseRejected).not.toBe(true);
      state = { ...r.state, pendingPrompt: r.state.pendingPrompt ?? null };
    } else {
      const r = runPipeline(state, action, db, player);
      expect(r.valid, r.error).toBe(true);
      state = { ...r.state, pendingPrompt: r.pendingPrompt ?? null };
    }
  }
  const select = (ids: string[]) =>
    act({ type: "SELECT_TARGET", selectedInstanceIds: ids });
  const choose = (choiceId: string) => {
    const options = state.pendingPrompt?.options;
    const id =
      options?.promptType === "PLAYER_CHOICE"
        ? (options.choices.find((c) => c.label === choiceId)?.id ?? choiceId)
        : choiceId;
    act({ type: "PLAYER_CHOICE", choiceId: id });
  };
  function play(id: string) {
    const c = put(id, state.turn.activePlayerIndex, "HAND");
    act({ type: "PLAY_CARD", cardInstanceId: c.instanceId });
    return c;
  }
  function leaderTypes(types: string[]) {
    db.set(CARDS.LEADER.id, { ...CARDS.LEADER, types });
  }
  return {
    db,
    put,
    act,
    select,
    choose,
    play,
    leaderTypes,
    get state() {
      return state;
    },
  };
}

describe("OPT-814 registered authored-card pipeline", () => {
  it.each(["ACTIVE", "RESTED"] as const)(
    "EB04-003 keeps Navy leader base 7000 while %s on opponent turn",
    (cardState) => {
      const f = fixture();
      f.leaderTypes(["Navy"]);
      const host = f.put("EB04-003", 1);
      host.state = cardState;
      f.play("OP01-033");
      f.select([]);
      const leader = f.state.players[1].leader;
      expect(
        getEffectiveBasePower(leader, f.db.get(leader.cardId)!, f.state, f.db)
      ).toBe(7000);
    }
  );
  it.each([false, true])(
    "EB04-003 own turn / non-Navy %s has base5000",
    (navy) => {
      const f = fixture();
      f.leaderTypes(navy ? ["Navy"] : []);
      f.put("EB04-003", navy ? 0 : 1).state = "RESTED";
      f.play("OP01-033");
      f.select([]);
      const leader = f.state.players[navy ? 0 : 1].leader;
      expect(
        getEffectiveBasePower(leader, f.db.get(leader.cardId)!, f.state, f.db)
      ).toBe(5000);
    }
  );
  it("EB03-018 remains protected from X.Drake while rested on opponent turn", () => {
    const f = fixture();
    const host = f.put("EB03-018", 1);
    host.state = "RESTED";
    f.play("OP01-054");
    if (f.state.pendingPrompt) f.select([host.instanceId]);
    expect(
      f.state.players[1].characters.some(
        (c) => c?.instanceId === host.instanceId
      )
    ).toBe(true);
    expect(f.state.players[1].trash.some((c) => c.cardId === host.cardId)).toBe(
      false
    );
  });
  it.each([5, 8, 9])(
    "EB04-038 compares field DON at %i vs8 before draw and add",
    (opponentDon) => {
      const f = fixture();
      f.state.players[1].donCostArea = Array.from(
        { length: opponentDon },
        (_, i) => ({
          instanceId: `opp-don-${i}`,
          state: "ACTIVE",
          attachedTo: null,
        })
      );
      const beforeHand = f.state.players[0].hand.length;
      f.play("EB04-038");
      if (opponentDon >= 8) {
        expect(f.state.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");
        f.choose("1");
      }
      expect(f.state.pendingPrompt).toBeNull();
      expect(f.state.players[0].hand).toHaveLength(
        beforeHand + (opponentDon >= 8 ? 1 : 0)
      );
      expect(f.state.players[0].donCostArea).toHaveLength(
        opponentDon >= 8 ? 9 : 8
      );
    }
  );
  it.each(["TOP", "BOTTOM"])(
    "P-085 explicitly chooses %s of owner's Life face-up",
    (position) => {
      const f = fixture();
      f.leaderTypes(["Supernovas"]);
      const target = f.put(CARDS.VANILLA.id, 1);
      target.owner = 0;
      const oldLife = f.state.players[0].life.map((c) => c.instanceId);
      f.play("P-085");
      f.select([target.instanceId]);
      expect(f.state.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");
      const options = f.state.pendingPrompt!.options;
      if (options.promptType !== "PLAYER_CHOICE")
        throw new Error("position prompt");
      const choice = options.choices.find((c) =>
        c.id.toUpperCase().includes(position)
      );
      expect(choice).toBeDefined();
      f.choose(choice!.id);
      expect(f.state.pendingPrompt).toBeNull();
      const life = f.state.players[0].life;
      expect(life).toHaveLength(oldLife.length + 1);
      expect(life[position === "TOP" ? 0 : life.length - 1]).toMatchObject({
        cardId: target.cardId,
        face: "UP",
      });
      expect(
        life
          .filter((c) => oldLife.includes(c.instanceId))
          .map((c) => c.instanceId)
      ).toEqual(oldLife);
    }
  );
  it("P-085 accepts zero without asking position", () => {
    const f = fixture();
    f.leaderTypes(["Supernovas"]);
    const target = f.put(CARDS.VANILLA.id, 1);
    f.play("P-085");
    f.select([]);
    expect(f.state.pendingPrompt).toBeNull();
    expect(
      f.state.players[1].characters.some(
        (c) => c?.instanceId === target.instanceId
      )
    ).toBe(true);
  });
  it.each([0, 1])(
    "PRB02-004 is mandatory but may set %i DON active",
    (count) => {
      const f = fixture();
      const host = f.put("PRB02-004", 1);
      f.state.players[1].donCostArea[0].state = "RESTED";
      const attacker = f.put(CARDS.VANILLA.id, 0);
      f.act({
        type: "DECLARE_ATTACK",
        attackerInstanceId: attacker.instanceId,
        targetInstanceId: f.state.players[1].leader.instanceId,
      });
      expect(f.state.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");
      f.choose(String(count));
      expect(
        f.state.players[1].donCostArea.filter((c) => c.state === "RESTED")
      ).toHaveLength(1 - count);

      expect(
        f.state.turn.oncePerTurnUsed["on_opponent_attack_set_don_active"]
      ).toContain(host.instanceId);
      expect(
        f.state.players[1].characters.some(
          (c) => c?.instanceId === host.instanceId
        )
      ).toBe(true);
    }
  );
  it("PRB02-009 triggers for its own rest by Izo and pays trash-self before drawing2", () => {
    const f = fixture();
    const host = f.put("PRB02-009", 1);
    const n = f.state.players[1].hand.length;
    f.play("OP01-033");
    f.select([host.instanceId]);
    expect(f.state.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
    f.choose("accept");
    expect(f.state.pendingPrompt).toBeNull();
    expect(
      f.state.players[1].characters.some(
        (c) => c?.instanceId === host.instanceId
      )
    ).toBe(false);
    expect(f.state.players[1].trash.some((c) => c.cardId === host.cardId)).toBe(
      true
    );
    expect(f.state.players[1].hand).toHaveLength(n + 2);
  });
  it("PRB02-009 ignores sibling rested by opponent", () => {
    const f = fixture();
    f.put("PRB02-009", 1);
    const sibling = f.put(CARDS.VANILLA.id, 1);
    const n = f.state.players[1].hand.length;
    f.play("OP01-033");
    f.select([sibling.instanceId]);
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.state.players[1].hand).toHaveLength(n);
  });
  it("EB04-035 adds one rested DON for your return, even when Sheep's Horn selects zero", () => {
    const f = fixture();
    f.leaderTypes(["Kid Pirates"]);
    f.put("EB04-035", 0);
    f.put(CARDS.VANILLA.id, 1);
    f.play("OP01-117");
    f.choose("accept");
    // Mandatory DON-minus cost is paid before the target selection.
    if (f.state.pendingPrompt?.options.promptType === "SELECT_TARGET")
      f.select([]);
    expect(f.state.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");
    f.choose("1");
    if (f.state.pendingPrompt?.options.promptType === "SELECT_TARGET")
      f.select([]);
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.state.players[0].donCostArea).toHaveLength(8);
    expect(
      f.state.players[0].donCostArea.filter((d) => d.state === "RESTED")
    ).toHaveLength(2);
  });
  it("EB04-035 ignores opponent DON returned by Ulti-Mortar during your attack", () => {
    const f = fixture();
    f.leaderTypes(["Kid Pirates"]);
    f.put("EB04-035", 0);
    const attacker = f.put(CARDS.VANILLA.id, 0);
    const event = f.put("OP01-118", 1, "HAND");
    f.act({
      type: "DECLARE_ATTACK",
      attackerInstanceId: attacker.instanceId,
      targetInstanceId: f.state.players[1].leader.instanceId,
    });
    f.act({ type: "PASS" }, 1);
    f.act(
      {
        type: "USE_COUNTER_EVENT",
        cardInstanceId: event.instanceId,
        counterTargetInstanceId: f.state.players[1].leader.instanceId,
      },
      1
    );
    if (f.state.pendingPrompt?.options.promptType === "OPTIONAL_EFFECT")
      f.choose("accept");
    if (f.state.pendingPrompt?.options.promptType === "SELECT_TARGET")
      f.select([]);
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.state.players[0].donCostArea).toHaveLength(8);
    expect(f.state.players[1].donCostArea).toHaveLength(4);
  });
  it("PRB02-006 on opponent turn replaces Izo rest with another Character", () => {
    const f = fixture();
    const zoro = f.put("PRB02-006", 1);
    const alternate = f.put(CARDS.VANILLA.id, 1);
    f.play("OP01-033");
    f.select([zoro.instanceId]);
    expect(f.state.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
    f.choose("accept");
    if (f.state.pendingPrompt?.options.promptType === "SELECT_TARGET")
      f.select([alternate.instanceId]);
    expect(f.state.pendingPrompt).toBeNull();
    expect(
      f.state.players[1].characters.find(
        (c) => c?.instanceId === zoro.instanceId
      )?.state
    ).toBe("ACTIVE");
    expect(
      f.state.players[1].characters.find(
        (c) => c?.instanceId === alternate.instanceId
      )?.state
    ).toBe("RESTED");
  });
  it("PRB02-006 cannot replace rest during its own turn from opponent Punk Gibson", () => {
    const f = fixture();
    const zoro = f.put("PRB02-006", 0);
    const attacker = f.put(CARDS.VANILLA.id, 0);
    f.put("EB04-035", 0);
    const event = f.put("OP01-058", 1, "HAND");
    f.act({
      type: "DECLARE_ATTACK",
      attackerInstanceId: attacker.instanceId,
      targetInstanceId: f.state.players[1].leader.instanceId,
    });
    f.act({ type: "PASS" }, 1);
    f.act(
      {
        type: "USE_COUNTER_EVENT",
        cardInstanceId: event.instanceId,
        counterTargetInstanceId: f.state.players[1].leader.instanceId,
      },
      1
    );
    f.select([]);
    f.select([zoro.instanceId]);
    expect(f.state.pendingPrompt).toBeNull();
    expect(
      f.state.players[0].characters.find(
        (c) => c?.instanceId === zoro.instanceId
      )?.state
    ).toBe("RESTED");
  });
  it("PRB02-009 ignores resting itself to attack", () => {
    const f = fixture();
    const host = f.put("PRB02-009", 0);
    const n = f.state.players[0].hand.length;
    f.act({
      type: "DECLARE_ATTACK",
      attackerInstanceId: host.instanceId,
      targetInstanceId: f.state.players[1].leader.instanceId,
    });
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.state.players[0].hand).toHaveLength(n);
  });

  it("PRB02-009 ignores a set-active event even with opponent-effect provenance", () => {
    const f = fixture();
    const host = f.put("PRB02-009", 1);
    f.play("OP01-033");
    f.select([]);
    expect(
      matchTriggersForEvent(
        f.state,
        {
          type: "CARD_STATE_CHANGED",
          playerIndex: 0,
          timestamp: 1,
          payload: {
            targetInstanceId: host.instanceId,
            newState: "ACTIVE",
            cause: "EFFECT",
            causingController: 0,
          },
        },
        f.db
      )
    ).toHaveLength(0);
  });
  it.each(["OP10-036", "OP14-070"])(
    "leaves unscoped %s cause filters unchanged pending source support",
    (id) => {
      const f = fixture();
      const target = f.put(CARDS.VANILLA.id, 1);
      const schema = getEffectSchema(id)!;
      f.db.set(id, { ...CARDS.VANILLA, id, effectSchema: schema });
      f.put(id, id === "OP10-036" ? 0 : 1);
      f.play("OP01-033");
      f.select([target.instanceId]);
      expect(f.state.pendingPrompt).toBeNull();
    }
  );
  it("PRB02-009 preserves opponent effect provenance after batch Zoro replacement is declined", () => {
    const f = fixture();
    f.leaderTypes(["Navy"]);
    const schema = getEffectSchema("OP10-023")!;
    f.db.set("OP10-023", {
      ...CARDS.VANILLA,
      id: "OP10-023",
      effectSchema: schema,
    });
    const zoro = f.put("PRB02-006", 1);
    const mr3 = f.put("PRB02-009", 1);
    f.put(CARDS.VANILLA.id, 1);
    const n = f.state.players[1].hand.length;
    f.play("OP10-023");
    f.select([zoro.instanceId, mr3.instanceId]);
    expect(f.state.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
    f.choose("skip");
    expect(f.state.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
    f.choose("accept");
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.state.players[1].hand).toHaveLength(n + 2);
    expect(
      f.state.players[1].characters.find(
        (c) => c?.instanceId === zoro.instanceId
      )?.state
    ).toBe("RESTED");
    expect(f.state.players[1].trash.some((c) => c.cardId === mr3.cardId)).toBe(
      true
    );
  });
  it("PRB02-009 ignores being rested by your own Dragon Twister effect", () => {
    const f = fixture();
    const mr3 = f.put("PRB02-009", 0);
    f.put(CARDS.VANILLA.id, 1);
    const schema = getEffectSchema("OP07-036")!;
    f.db.set("OP07-036", {
      ...CARDS.VANILLA,
      id: "OP07-036",
      type: "Event",
      cost: 2,
      effectText:
        "[Main] Up to 1 of your Leader or Character cards gains +3000 power during this turn. Then, you may rest 1 of your Characters with a cost of 3 or more. If you do, rest up to 1 of your opponent's Characters with a cost of 5 or less.",
      effectSchema: schema,
    });
    const n = f.state.players[0].hand.length;
    f.play("OP07-036");
    f.choose("accept");
    f.select([]);
    if (
      f.state.pendingPrompt?.options.promptType === "SELECT_TARGET" &&
      f.state.pendingPrompt.options.validTargets.includes(mr3.instanceId)
    )
      f.select([mr3.instanceId]);
    if (f.state.pendingPrompt?.options.promptType === "SELECT_TARGET")
      f.select([]);
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.state.players[0].hand).toHaveLength(n);
    expect(
      f.state.players[0].characters.find(
        (c) => c?.instanceId === mr3.instanceId
      )?.state
    ).toBe("RESTED");
  });
  it.each([false, true])(
    "rest event survives durable save/load and Mr.3 continues once; resumed batch%s",
    async (batch) => {
      const f = fixture();
      const mr3 = f.put("PRB02-009", 1);
      const n = f.state.players[1].hand.length;
      if (batch) {
        f.leaderTypes(["Navy"]);
        const schema = getEffectSchema("OP10-023")!;
        f.db.set("OP10-023", {
          ...CARDS.VANILLA,
          id: "OP10-023",
          effectSchema: schema,
        });
        const zoro = f.put("PRB02-006", 1);
        f.put(CARDS.VANILLA.id, 1);
        f.play("OP10-023");
        f.select([zoro.instanceId, mr3.instanceId]);
        f.choose("skip");
      } else {
        f.play("OP01-033");
        f.select([mr3.instanceId]);
      }
      expect(f.state.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
      const loaded = await roundTripRest(f.state, f.db);
      const events = loaded.state.eventLog.filter(
        (e) =>
          e.type === "CARD_STATE_CHANGED" &&
          e.payload.targetInstanceId === mr3.instanceId
      );
      expect(events).toHaveLength(1);
      expect(events[0].payload).toMatchObject({
        newState: "RESTED",
        cause: "EFFECT",
        causingController: 0,
      });
      const resolved = resumePromptLifecycle(
        loaded.state,
        { type: "PLAYER_CHOICE", choiceId: "accept" },
        loaded.cardDb,
        { drainPregame: (s) => s, advanceStartOfTurn: (s) => s }
      );
      expect(resolved.responseRejected).toBe(false);
      expect(resolved.state.pendingPrompt).toBeNull();
      const completed = await roundTripRest(resolved.state, loaded.cardDb);
      expect(completed.state.players[1].hand).toHaveLength(n + 2);
      expect(
        completed.state.players[1].trash.filter((c) => c.cardId === mr3.cardId)
      ).toHaveLength(1);
    }
  );

  it("legacy declaration rest without cause/controller remains loadable", async () => {
    const f = fixture();
    const attacker = f.put(CARDS.VANILLA.id, 0);
    f.act({
      type: "DECLARE_ATTACK",
      attackerInstanceId: attacker.instanceId,
      targetInstanceId: f.state.players[1].leader.instanceId,
    });
    const loaded = await roundTripRest(f.state, f.db);
    const event = loaded.state.eventLog.find(
      (e) => e.type === "CARD_STATE_CHANGED"
    );
    expect(event?.payload).toEqual({
      cardInstanceId: attacker.instanceId,
      newState: "RESTED",
    });
  });
  it.each([
    { cause: "COST" },
    { cause: 1 },
    { causingController: 2 },
    { causingController: "0" },
    { unexpectedProvenance: true },
  ])("strict rest event decoding rejects invalid provenance %j", (patch) => {
    const f = fixture();
    const target = f.put(CARDS.VANILLA.id, 1);
    f.play("OP01-033");
    f.select([target.instanceId]);
    const raw = JSON.parse(
      JSON.stringify({
        state: f.state,
        cardDb: Object.fromEntries(f.db),
        mode: "PVP",
      })
    );
    const event = raw.state.eventLog.find(
      (e: { type: string }) => e.type === "CARD_STATE_CHANGED"
    );
    Object.assign(event.payload, patch);
    expect(() => parseStoredSession(raw)).toThrow("unknown event variant");
  });
});
