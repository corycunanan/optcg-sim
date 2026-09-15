import { expect, it } from "vitest";
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
import { filterStateForPlayer } from "../engine/state.js";
import { visibleStateForSpectator } from "../session/visibility.js";
import { runPipeline } from "../engine/pipeline.js";
import { SessionCoordinator } from "../session/coordinator.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import {
  getEffectSchema,
  getAllAuthoredSchemas,
} from "../engine/schema-registry.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import { getEffectivePower } from "../engine/modifiers.js";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
  padChars,
} from "./helpers.js";

class ActivationMemory implements SessionStorage {
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
async function activationRoundTrip(
  state: GameState,
  cardDb: Map<string, CardData>
) {
  const storage = new ActivationMemory();
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

// Printed costs/types verified against the official OP12/OP15 card lists.
const text: Record<string, string> = {};
function fixture() {
  const db = createTestCardDb();
  for (const [id, cost, color, traits] of [
    ["OP12-041", 0, ["Blue", "Purple"], ["Straw Hat Crew"]],
    ["OP12-059", 1, ["Blue"], ["Straw Hat Crew"]],
    ["OP09-077", 1, ["Purple"], ["Straw Hat Crew"]],
    ["OP04-053", 4, ["Blue"], ["Animal Kingdom Pirates"]],
    ["EB03-031", 4, ["Purple"], ["Vinsmoke Family"]],
    ["OP15-014", 4, ["Red"], ["Dressrosa"]],
    ["OP15-046", 7, ["Blue"], ["Dressrosa"]],
    ["OP15-055", 3, ["Blue"], ["Dressrosa"]],
    ["OP15-002", 0, ["Red", "Blue"], ["Dressrosa"]],
    ["OP15-119", 10, ["Yellow"], ["Straw Hat Crew"]],
    ["OP09-078", 1, ["Purple"], ["Straw Hat Crew"]],
    ["EB04-028", 2, ["Blue"], ["Navy"]],
  ] as const) {
    const schema = getEffectSchema(id)!;
    const type = schema.card_type as CardData["type"];
    db.set(id, {
      ...CARDS.VANILLA,
      id,
      name: schema.card_name!,
      type,
      cost: type === "Leader" ? null : cost,
      power: type === "Leader" ? 5000 : null,
      color: [...color],
      types: [...traits],
      effectText: text[id] ?? "",
      effectSchema: schema,
    });
  }
  let state = createBattleReadyState(db);
  state.players[0].characters = padChars([]);
  state.players[1].characters = padChars([]);
  function put(
    id: string,
    controller: 0 | 1,
    zone: CardInstance["zone"] = "CHARACTER",
    suffix = ""
  ) {
    const c: CardInstance = {
      ...state.players[controller].leader,
      instanceId: `${id}-${controller}-${zone}-${suffix}`,
      cardId: id,
      controller,
      owner: controller,
      zone,
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 0,
    };
    if (zone === "LEADER") state.players[controller].leader = c;
    else if (zone === "CHARACTER")
      state.players[controller].characters[
        state.players[controller].characters.indexOf(null)
      ] = c;
    else if (zone === "HAND") state.players[controller].hand.push(c);
    else if (zone === "TRASH") state.players[controller].trash.push(c);
    if (zone === "LEADER" || zone === "CHARACTER")
      state = registerCardEnteredField(state, c, db.get(id)!);
    return c;
  }
  function act(
    action: GameAction,
    player: 0 | 1 = state.turn.activePlayerIndex
  ) {
    if (state.pendingPrompt) {
      action = {
        ...action,
        promptId: state.pendingPrompt.promptId,
      } as GameAction;
      expect(
        new SessionCoordinator().routePromptResponse(
          state,
          state.pendingPrompt.respondingPlayer,
          action
        ).kind
      ).toBe("resume");
      const r = resumePromptLifecycle(state, action, db, {
        drainPregame: (s) => s,
        advanceStartOfTurn: (s) => s,
      });
      expect(r.responseRejected).toBe(false);
      state = r.state;
    } else {
      const r = runPipeline(state, action, db, player);
      expect(r.valid, r.error).toBe(true);
      state = { ...r.state, pendingPrompt: r.pendingPrompt ?? null };
    }
  }
  const choose = (choiceId: string) => {
    const o = state.pendingPrompt?.options;
    act({
      type: "PLAYER_CHOICE",
      choiceId:
        o?.promptType === "PLAYER_CHOICE"
          ? (o.choices.find((c) => c.label === choiceId)?.id ?? choiceId)
          : choiceId,
    });
  };
  const select = (selectedInstanceIds: string[]) =>
    act({ type: "SELECT_TARGET", selectedInstanceIds });
  const play = (id: string) => {
    const c = put(
      id,
      state.turn.activePlayerIndex,
      "HAND",
      String(state.turn.actionsPerformedThisTurn.length)
    );
    act({ type: "PLAY_CARD", cardInstanceId: c.instanceId });
    return c;
  };
  return {
    db,
    put,
    act,
    choose,
    select,
    play,
    async reload() {
      const loaded = await activationRoundTrip(state, db);
      state = loaded.state;
      for (const [id, data] of loaded.cardDb) db.set(id, data);
    },
    get state() {
      return state;
    },
  };
}
it.each([0, 1] as const)(
  "registered Sanji controller %s activates Concasser Main and draws once",
  (owner) => {
    const f = fixture();
    f.state.turn.activePlayerIndex = owner;
    const sanji = f.put("OP12-041", owner, "LEADER");
    const event = f.put("OP12-059", owner, "HAND");
    const hand = f.state.players[owner].hand.length;
    const don = f.state.players[owner].donCostArea.length;
    f.act({
      type: "ACTIVATE_EFFECT",
      cardInstanceId: sanji.instanceId,
      effectId: "OP12-041_activate",
    });
    if (f.state.pendingPrompt?.options.promptType === "PLAYER_CHOICE")
      f.choose("Return 1 DON!! from cost area");
    f.select([event.instanceId]);
    expect(f.state.players[owner].hand.length).toBe(hand);
    expect(f.state.players[owner].donCostArea.length).toBe(don - 1);
    expect(
      f.state.players[owner].trash.filter((c) => c.cardId === "OP12-059")
    ).toHaveLength(1);
    expect(f.state.pendingPrompt).toBeNull();
  }
);

it.each([false, true])(
  "nested Lightning pays DON−2 then persists target; zero target %s",
  async (zero) => {
    const f = fixture();
    const sanji = f.put("OP12-041", 0, "LEADER");
    const event = f.put("OP09-077", 0, "HAND");
    const target = f.put(CARDS.VANILLA.id, 1);
    const donor = f.put(CARDS.VANILLA.id, 0);
    const attached = f.state.players[0].donCostArea.pop()!;
    donor.attachedDon = [{ ...attached, attachedTo: donor.instanceId }];
    const initialDon = f.state.players[0].donCostArea.length + 1;
    f.act({
      type: "ACTIVATE_EFFECT",
      cardInstanceId: sanji.instanceId,
      effectId: "OP12-041_activate",
    });
    // DON_MINUS uses the engine's existing automatic payment. The attached DON
    // remains, and both costs must still be paid exactly once.
    if (f.state.pendingPrompt?.options.promptType === "PLAYER_CHOICE")
      f.choose("cost_area");
    f.select([event.instanceId]);
    expect(f.state.pendingPrompt).not.toBeNull();
    expect(
      f.state.eventLog.filter((e) => e.type === "EVENT_ACTIVATED_FROM_HAND")
    ).toHaveLength(0);
    await f.reload();
    if (f.state.pendingPrompt?.options.promptType === "PLAYER_CHOICE")
      f.choose("cost_area");
    expect(f.state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    await f.reload();
    f.select(zero ? [] : [target.instanceId]);
    expect(
      f.state.players[1].characters.some(
        (c) => c?.instanceId === target.instanceId
      )
    ).toBe(zero);
    expect(
      f.state.players[0].donCostArea.length + donor.attachedDon.length
    ).toBe(initialDon - 3);
    expect(
      f.state.eventLog.filter((e) => e.type === "EVENT_ACTIVATED_FROM_HAND")
    ).toHaveLength(1);
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.state.effectStack).toHaveLength(0);
  }
);

it("Page One waits until Lightning finishes, then cycles exactly once across reload", async () => {
  const f = fixture();
  const sanji = f.put("OP12-041", 0, "LEADER");
  const page = f.put("OP04-053", 0);
  const don = f.state.players[0].donCostArea.pop()!;
  page.attachedDon = [{ ...don, attachedTo: page.instanceId }];
  const event = f.put("OP09-077", 0, "HAND");
  const target = f.put(CARDS.VANILLA.id, 1);
  const hand = f.state.players[0].hand.length;
  f.act({
    type: "ACTIVATE_EFFECT",
    cardInstanceId: sanji.instanceId,
    effectId: "OP12-041_activate",
  });
  if (f.state.pendingPrompt?.options.promptType === "PLAYER_CHOICE")
    f.choose("cost_area");
  f.select([event.instanceId]);
  if (f.state.pendingPrompt?.options.promptType === "PLAYER_CHOICE")
    f.choose("cost_area");
  expect(f.state.players[0].hand.length).toBe(hand - 1);
  expect(f.state.eventLog.filter((e) => e.type === "CARD_DRAWN")).toHaveLength(
    0
  );
  await f.reload();
  f.select([target.instanceId]);
  expect(f.state.players[0].hand.length).toBe(hand);
  expect(f.state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
  const before = f.state.eventLog.map((e) => e.type);
  expect(before.indexOf("CARD_KO")).toBeLessThan(
    before.indexOf("EVENT_ACTIVATED_FROM_HAND")
  );

  await f.reload();
  f.select([f.state.players[0].hand[0].instanceId]);
  expect(f.state.players[0].hand.length).toBe(hand - 1);
  expect(
    f.state.eventLog.filter((e) => e.type === "EVENT_ACTIVATED_FROM_HAND")
  ).toHaveLength(1);
  expect(f.state.eventLog.filter((e) => e.type === "CARD_DRAWN")).toHaveLength(
    1
  );
  const committed = f.state.eventLog.map((e) => e.type);
  expect(committed.indexOf("EVENT_ACTIVATED_FROM_HAND")).toBeLessThan(
    committed.indexOf("CARD_DRAWN")
  );
  expect(f.state.effectStack).toHaveLength(0);
});

it.each(["OP15-014", "OP15-046"])(
  "registered %s resolves selected Dressrosa Main choice",
  async (producer) => {
    const f = fixture();
    f.put("OP15-002", 0, "LEADER");
    const event = f.put("OP15-055", 0, "HAND");
    const hand = f.state.players[0].hand.length;
    while (f.state.players[0].donCostArea.length < 10)
      f.state.players[0].donCostArea.push(f.state.players[0].donDeck.pop()!);
    f.play(producer);
    f.select([event.instanceId]);
    expect(f.state.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");
    expect(
      f.state.eventLog.filter((e) => e.type === "EVENT_ACTIVATED_FROM_HAND")
    ).toHaveLength(0);
    await f.reload();
    f.choose("Draw 2 cards");
    expect(f.state.players[0].hand.length).toBe(hand + 1);
    expect(
      f.state.eventLog.filter((e) => e.type === "EVENT_ACTIVATED_FROM_HAND")
    ).toHaveLength(1);
    expect(f.state.effectStack).toHaveLength(0);
  }
);

it("registered Reiju resolves nested Main from trash without changing Event identity", async () => {
  const f = fixture();
  f.put("OP12-041", 0, "LEADER");
  const event = f.put("OP09-077", 0, "TRASH");
  const target = f.put(CARDS.VANILLA.id, 1);
  f.play("EB03-031");
  f.select([event.instanceId]);
  expect(f.state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
  expect(
    f.state.eventLog.filter((e) => e.type === "EVENT_MAIN_RESOLVED_FROM_TRASH")
  ).toHaveLength(0);
  await f.reload();
  f.select([target.instanceId]);
  expect(
    f.state.players[0].trash.some((c) => c.instanceId === event.instanceId)
  ).toBe(true);
  expect(
    f.state.eventLog.filter((e) => e.type === "EVENT_MAIN_RESOLVED_FROM_TRASH")
  ).toHaveLength(1);
  expect(
    f.state.eventLog.filter((e) => e.type === "EVENT_ACTIVATED_FROM_HAND")
  ).toHaveLength(0);
  expect(f.state.effectStack).toHaveLength(0);
});

it("zero Event selection pays Sanji only and never activates Counter-only cards", () => {
  const f = fixture();
  const sanji = f.put("OP12-041", 0, "LEADER");
  const counter = f.put("OP09-078", 0, "HAND");
  const main = f.put("OP12-059", 0, "HAND");
  const don = f.state.players[0].donCostArea.length;
  f.act({
    type: "ACTIVATE_EFFECT",
    cardInstanceId: sanji.instanceId,
    effectId: "OP12-041_activate",
  });
  const options = f.state.pendingPrompt!.options;
  expect(options.promptType).toBe("SELECT_TARGET");
  if (options.promptType === "SELECT_TARGET") {
    expect(options.validTargets).not.toContain(counter.instanceId);
    expect(options.validTargets).toContain(main.instanceId);
  }
  f.select([]);
  expect(f.state.players[0].donCostArea.length).toBe(don - 1);
  expect(f.state.players[0].trash).toHaveLength(0);
  expect(
    f.state.eventLog.filter((e) => e.type === "EVENT_ACTIVATED_FROM_HAND")
  ).toHaveLength(0);
});

it.each([true, false])(
  "Reiju nested Ice Time optional cost persists, accept %s",
  async (accept) => {
    const f = fixture();
    f.put("OP12-041", 0, "LEADER");
    const event = f.put("EB04-028", 0, "TRASH");
    const hand = f.state.players[0].hand.length;
    const payment = f.state.players[0].hand[0];
    f.play("EB03-031");
    f.select([event.instanceId]);
    expect(f.state.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
    await f.reload();
    f.choose(accept ? "accept" : "skip");
    if (accept) {
      expect(f.state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
      expect(f.state.effectStack.at(-1)?.sourceCardInstanceId).toBe(
        event.instanceId
      );
      expect(
        f.state.eventLog.filter(
          (e) => e.type === "EVENT_MAIN_RESOLVED_FROM_TRASH"
        )
      ).toHaveLength(0);
      await f.reload();
      f.select([payment.instanceId]);
    }
    // Sanji is not Navy: after the paid cost, Ice Time's post-colon gate fails.
    expect(f.state.players[0].hand.length).toBe(hand - Number(accept));
    expect(
      f.state.players[0].trash.filter((c) => c.cardId === payment.cardId).length
    ).toBe(Number(accept));
    expect(
      f.state.eventLog.filter(
        (e) => e.type === "EVENT_MAIN_RESOLVED_FROM_TRASH"
      )
    ).toHaveLength(1);
    expect(f.state.effectStack).toHaveLength(0);
    expect(f.state.pendingPrompt).toBeNull();
  }
);

it("opponent Luffy watcher activates only after nested Main target resolves", async () => {
  const f = fixture();
  const sanji = f.put("OP12-041", 0, "LEADER");
  f.put("OP15-119", 1);
  const event = f.put("OP09-077", 0, "HAND");
  const target = f.put(CARDS.VANILLA.id, 1);
  f.act({
    type: "ACTIVATE_EFFECT",
    cardInstanceId: sanji.instanceId,
    effectId: "OP12-041_activate",
  });
  f.select([event.instanceId]);
  expect(f.state.players[1].life[0].face).toBe("DOWN");
  await f.reload();
  f.select([target.instanceId]);
  expect(f.state.players[1].life[0].face).toBe("UP");
  expect(
    f.state.eventLog.filter((e) => e.type === "EVENT_ACTIVATED_FROM_HAND")
  ).toHaveLength(1);
  expect(f.state.effectStack).toHaveLength(0);
});

it("nested hand Main keeps its parent's source and suffix after a persisted prompt", async () => {
  const f = fixture();
  // Synthetic parent suffix isolates the shared contract; current authored
  // producers end at activation. The nested Event remains registered Lightning.
  const schema = structuredClone(getEffectSchema("OP12-041")!);
  schema.effects[0].actions!.unshift({ type: "DRAW", params: { amount: 1 } });
  schema.effects[0].actions!.push({
    type: "MODIFY_POWER",
    target: { type: "SELF" },
    params: { amount: 1000 },
    duration: { type: "THIS_TURN" },
    chain: "THEN",
  });
  f.db.set("OP12-041", { ...f.db.get("OP12-041")!, effectSchema: schema });
  const sanji = f.put("OP12-041", 0, "LEADER");
  const event = f.put("OP09-077", 0, "HAND");
  const target = f.put(CARDS.VANILLA.id, 1);
  f.act({
    type: "ACTIVATE_EFFECT",
    cardInstanceId: sanji.instanceId,
    effectId: "OP12-041_activate",
  });
  f.select([event.instanceId]);
  expect(
    getEffectivePower(f.state.players[0].leader, f.db.get("OP12-041")!, f.state)
  ).toBe(5000);
  await f.reload();
  f.select([target.instanceId]);
  expect(
    getEffectivePower(f.state.players[0].leader, f.db.get("OP12-041")!, f.state)
  ).toBe(6000);
  expect(
    f.state.eventLog
      .filter((e) =>
        ["CARD_DRAWN", "CARD_KO", "EVENT_ACTIVATED_FROM_HAND"].includes(e.type)
      )
      .map((e) => e.type)
  ).toEqual(["CARD_DRAWN", "CARD_KO", "EVENT_ACTIVATED_FROM_HAND"]);
  expect(f.state.effectStack).toHaveLength(0);
});

it("nested prompt rejects wrong responder/target and hides continuation data across reload", async () => {
  const f = fixture();
  const sanji = f.put("OP12-041", 0, "LEADER");
  const event = f.put("OP09-077", 0, "HAND");
  const target = f.put(CARDS.VANILLA.id, 1);
  const secret = f.state.players[0].hand[0];
  f.act({
    type: "ACTIVATE_EFFECT",
    cardInstanceId: sanji.instanceId,
    effectId: "OP12-041_activate",
  });
  f.select([event.instanceId]);
  await f.reload();
  const action: GameAction = {
    type: "SELECT_TARGET",
    selectedInstanceIds: [target.instanceId],
    promptId: f.state.pendingPrompt!.promptId,
  };
  expect(
    new SessionCoordinator().routePromptResponse(f.state, 1, action).kind
  ).toBe("reject");
  const invalid = resumePromptLifecycle(
    f.state,
    { ...action, selectedInstanceIds: [secret.instanceId] },
    f.db,
    {
      drainPregame: (s) => s,
      advanceStartOfTurn: (s) => s,
    }
  );
  expect(invalid.responseRejected).toBe(true);
  expect(
    invalid.state.players[1].characters.some(
      (c) => c?.instanceId === target.instanceId
    )
  ).toBe(true);
  for (const player of [0, 1] as const) {
    const visible = filterStateForPlayer(f.state, player);
    expect(visible.effectStack).toEqual([]);
    expect(JSON.stringify(visible)).not.toContain("eventActivationCompletion");
    expect(visible.pendingPrompt?.resumeContext ?? null).toBeNull();
  }
  expect(
    JSON.stringify(filterStateForPlayer(f.state, 1).players[0].hand)
  ).not.toContain(secret.cardId);
  expect(visibleStateForSpectator(f.state, f.db).effectStack).toEqual([]);
  f.select([target.instanceId]);
  expect(
    new SessionCoordinator().routePromptResponse(f.state, 0, action).kind
  ).not.toBe("resume");
  expect(
    f.state.eventLog.filter((e) => e.type === "EVENT_ACTIVATED_FROM_HAND")
  ).toHaveLength(1);
});

it("unpayable nested Main skips its effect without refunding Sanji or replaying activation", () => {
  const f = fixture();
  const sanji = f.put("OP12-041", 0, "LEADER");
  const event = f.put("OP09-077", 0, "HAND");
  const target = f.put(CARDS.VANILLA.id, 1);
  const player = f.state.players[0];
  player.donDeck.push(...player.donCostArea.splice(1));
  f.act({
    type: "ACTIVATE_EFFECT",
    cardInstanceId: sanji.instanceId,
    effectId: "OP12-041_activate",
  });
  f.select([event.instanceId]);
  expect(f.state.players[0].donCostArea).toHaveLength(0);
  expect(f.state.players[0].trash.some((c) => c.cardId === event.cardId)).toBe(
    true
  );
  expect(
    f.state.players[1].characters.some(
      (c) => c?.instanceId === target.instanceId
    )
  ).toBe(true);
  expect(
    f.state.eventLog.filter((e) => e.type === "EVENT_ACTIVATED_FROM_HAND")
  ).toHaveLength(1);
  expect(f.state.effectStack).toHaveLength(0);
});

it("persisted completion accepts legacy absence and rejects malformed notification", () => {
  const f = fixture();
  const sanji = f.put("OP12-041", 0, "LEADER");
  const event = f.put("OP09-077", 0, "HAND");
  f.put(CARDS.VANILLA.id, 1);
  f.act({
    type: "ACTIVATE_EFFECT",
    cardInstanceId: sanji.instanceId,
    effectId: "OP12-041_activate",
  });
  f.select([event.instanceId]);
  const snapshot = () =>
    JSON.parse(
      JSON.stringify({
        formatVersion: 1,
        state: f.state,
        cardDb: Object.fromEntries(f.db),
        undoHistory: [],
      })
    );
  const index = f.state.effectStack.findIndex(
    (frame) => frame.eventActivationCompletion
  );
  expect(index).toBeGreaterThanOrEqual(0);
  expect(
    parseStoredSession(snapshot()).state.effectStack[index]
      .eventActivationCompletion?.type
  ).toBe("EVENT_ACTIVATED_FROM_HAND");
  const legacy = snapshot();
  delete legacy.state.effectStack[index].eventActivationCompletion;
  expect(
    parseStoredSession(legacy).state.effectStack[index]
      .eventActivationCompletion
  ).toBeUndefined();
  for (const completion of [
    "bad",
    { type: "UNKNOWN" },
    { type: "CARD_DRAWN", playerIndex: 0, payload: { cardId: "x" } },
    {
      type: "EVENT_ACTIVATED_FROM_HAND",
      playerIndex: 2,
      payload: { cardId: "x", cardInstanceId: "x", costReducedAmount: 0 },
    },
    {
      type: "EVENT_ACTIVATED_FROM_HAND",
      playerIndex: 0,
      payload: { cardId: "x" },
    },
  ]) {
    const malformed = snapshot();
    malformed.state.effectStack[index].eventActivationCompletion = completion;
    expect(() => parseStoredSession(malformed)).toThrow();
  }
});

it("recursive authored activation inventory remains three hand producers and one trash producer", () => {
  const found: Record<string, string[]> = {
    ACTIVATE_EVENT_FROM_HAND: [],
    ACTIVATE_EVENT_FROM_TRASH: [],
  };
  function walk(value: unknown, id: string): void {
    if (Array.isArray(value)) return value.forEach((v) => walk(v, id));
    if (!value || typeof value !== "object") return;
    const object = value as Record<string, unknown>;
    if (typeof object.type === "string" && found[object.type])
      found[object.type].push(id);
    Object.values(object).forEach((v) => walk(v, id));
  }
  for (const [id, schema] of Object.entries(getAllAuthoredSchemas()))
    walk(schema, id);
  expect(found).toEqual({
    ACTIVATE_EVENT_FROM_HAND: ["OP12-041", "OP15-014", "OP15-046"],
    ACTIVATE_EVENT_FROM_TRASH: ["EB03-031"],
  });
});

it.each([true, false])(
  "synthetic hand Main cost preserves fresh source and parent payment; accept %s",
  async (accept) => {
    const f = fixture();
    const sanji = f.put("OP12-041", 0, "LEADER");
    // No current Sanji-eligible authored Main has a selected hand-trash cost.
    // This synthetic Event isolates that nested persistence branch; Lightning
    // above is the authored retained-cost proof.
    f.db.set("synthetic-main-cost", {
      ...f.db.get("OP12-059")!,
      id: "synthetic-main-cost",
      name: "Selected cost test",
      effectSchema: {
        effects: [
          {
            id: "selected-cost-main",
            category: "auto",
            trigger: { keyword: "MAIN_EVENT" },
            costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
            flags: { optional: true },
            actions: [{ type: "DRAW", params: { amount: 1 } }],
          },
        ],
      },
    });
    const event = f.put("synthetic-main-cost", 0, "HAND");
    const payment = f.state.players[0].hand[0];
    const hand = f.state.players[0].hand.length;
    const don = f.state.players[0].donCostArea.length;
    f.act({
      type: "ACTIVATE_EFFECT",
      cardInstanceId: sanji.instanceId,
      effectId: "OP12-041_activate",
    });
    f.select([event.instanceId]);
    const moved = f.state.players[0].trash.find(
      (c) => c.cardId === event.cardId
    )!;
    expect(moved.instanceId).not.toBe(event.instanceId);
    expect(f.state.effectStack.at(-1)?.sourceCardInstanceId).toBe(
      moved.instanceId
    );
    await f.reload();
    f.choose(accept ? "accept" : "skip");
    if (accept) {
      expect(f.state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
      expect(
        f.state.eventLog.filter((e) => e.type === "EVENT_ACTIVATED_FROM_HAND")
      ).toHaveLength(0);
      await f.reload();
      f.select([payment.instanceId]);
    }
    expect(f.state.players[0].hand.length).toBe(hand - 1);
    expect(f.state.players[0].donCostArea.length).toBe(don - 1);
    expect(
      f.state.eventLog.filter((e) => e.type === "CARD_DRAWN")
    ).toHaveLength(Number(accept));
    expect(
      f.state.eventLog.filter((e) => e.type === "EVENT_ACTIVATED_FROM_HAND")
    ).toHaveLength(1);
    expect(f.state.effectStack).toHaveLength(0);
  }
);
