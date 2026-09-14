import { expect, it } from "vitest";
import type {
  CardData,
  GameState,
  CardInstance,
  GameAction,
} from "../types.js";
import { runPipeline } from "../engine/pipeline.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import {
  SessionRepository,
  type SessionStorage,
} from "../session/persistence.js";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
  padChars,
} from "./helpers.js";

// Expectations: docs/cards/{EB-03,EB-04,PRB-02,UNKNOWN}.md and PRB02-004/006 FAQ.
function fixture() {
  const db = createTestCardDb();
  for (const [id, cost] of [
    ["OP17-033", 2],
    ["OP07-036", 2],
    ["OP06-021", 0],
    ["OP06-041", 6],
    ["OP14-033", 3],
    ["OP14-021", 2],
    ["OP14-027", 6],
    ["OP14-028", 2],
    ["OP14-032", 2],
    ["OP14-035", 2],
    ["OP14-119", 9],
    ["OP14-070", 3],
    ["OP10-023", 4],
    ["OP05-027", 1],
    ["EB01-048", 2],
    ["OP07-031", 3],
    ["OP01-020", 1],
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
      type: schema.card_type as CardData["type"],
      effectSchema: schema,
    });
  }
  let state = createBattleReadyState(db);
  state.players[0].characters = padChars([]);
  state.players[1].characters = padChars([]);
  let seq = 0;
  function put(
    id: string,
    controller: 0 | 1,
    zone: CardInstance["zone"] = "CHARACTER"
  ) {
    const c: CardInstance = {
      ...state.players[controller].leader,
      cardId: id,
      instanceId: `${id}-${controller}-${zone}-${seq++}`,
      controller,
      owner: controller,
      zone,
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 0,
    };
    if (zone === "HAND") state.players[controller].hand.push(c);
    else if (zone === "LEADER") {
      state.players[controller].leader = c;
      state = registerCardEnteredField(state, c, db.get(id)!);
    } else {
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
    async persist() {
      const loaded = await roundTripRest(state, db);
      state = loaded.state;
    },
    select,
    choose,
    play,
    leaderTypes,
    get state() {
      return state;
    },
  };
}

it("documented PRB02-006 source-kind gap: Sheep's Horn Event must not offer Zoro replacement", () => {
  const f = fixture();
  const zoro = f.put("PRB02-006", 1);
  f.put(CARDS.VANILLA.id, 1);
  f.play("OP01-117");
  f.choose("accept");
  f.select([zoro.instanceId]);
  expect(f.state.pendingPrompt).toBeNull();
  expect(
    f.state.players[1].characters.find((c) => c?.instanceId === zoro.instanceId)
      ?.state
  ).toBe("RESTED");
});

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
  const repository = new SessionRepository(new RestMemory(), {
    nextJsUrl: "https://example.test",
    workerSecret: "test",
  });
  await repository.save({
    state,
    cardDb,
    undoHistory: [],
    mode: "PVP",
    pregameMode: "PRIORITY_ROLL",
    testPriorityRolls: null,
  });
  const loaded = await repository.load();
  expect(loaded).not.toBeNull();
  return loaded!;
}
function current(f: ReturnType<typeof fixture>, c: CardInstance) {
  return f.state.players[c.controller].characters.find(
    (x) => x?.instanceId === c.instanceId
  );
}

it.each(["accept", "skip"])(
  "Zoro survives durable optional replacement %s",
  async (choice) => {
    const f = fixture(),
      zoro = f.put("PRB02-006", 1),
      alternate = f.put(CARDS.VANILLA.id, 1);
    f.play("OP01-033");
    f.select([zoro.instanceId]);
    expect(f.state.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
    await f.persist();
    f.choose(choice);
    if (f.state.pendingPrompt?.options.promptType === "SELECT_TARGET")
      f.select([alternate.instanceId]);
    expect(f.state.pendingPrompt).toBeNull();
    expect(current(f, zoro)?.state).toBe(
      choice === "accept" ? "ACTIVE" : "RESTED"
    );
    expect(current(f, alternate)?.state).toBe(
      choice === "accept" ? "RESTED" : "ACTIVE"
    );
    await f.persist();
  }
);
it("Zoro cannot substitute an already rested alternate", () => {
  const f = fixture(),
    zoro = f.put("PRB02-006", 1),
    alternate = f.put(CARDS.VANILLA.id, 1);
  alternate.state = "RESTED";
  f.play("OP01-033");
  f.select([zoro.instanceId]);
  expect(f.state.pendingPrompt).toBeNull();
  expect(current(f, zoro)?.state).toBe("RESTED");
});
it.each([false, true])(
  "Buffalo pays DON minus and reactivates; source departed %s",
  async (departed) => {
    const f = fixture(),
      buffalo = f.put("OP14-070", 1);
    const n = f.state.players[1].donCostArea.length,
      deck = f.state.players[1].donDeck.length;
    if (departed) {
      const source = f.put("OP05-027", 0);
      f.act({
        type: "ACTIVATE_EFFECT",
        cardInstanceId: source.instanceId,
        effectId: "activate_rest_opponent",
      });
      f.choose("accept");
      expect(
        f.state.players[0].trash.some((c) => c.cardId === source.cardId)
      ).toBe(true);
    } else f.play("OP01-033");
    f.select([buffalo.instanceId]);
    expect(current(f, buffalo)?.state).toBe("RESTED");
    expect(f.state.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
    await f.persist();
    f.choose("accept");
    if (f.state.pendingPrompt?.options.promptType === "SELECT_TARGET")
      f.select([f.state.players[1].donCostArea[0].instanceId]);
    expect(f.state.pendingPrompt).toBeNull();
    expect(current(f, buffalo)?.state).toBe("ACTIVE");
    expect(f.state.players[1].donCostArea.length).toBe(n - 1);
    expect(f.state.players[1].donDeck.length).toBe(deck + 1);
    const event = f.state.eventLog.find(
      (e) =>
        e.type === "CARD_STATE_CHANGED" &&
        e.payload.targetInstanceId === buffalo.instanceId
    );
    expect(event?.payload).toMatchObject({
      causingSource: {
        cardId: departed ? "OP05-027" : "OP01-033",
        cardType: "Character",
      },
    });
  }
);
it("Buffalo ignores a Sheep's Horn Event", () => {
  const f = fixture(),
    b = f.put("OP14-070", 1),
    n = f.state.players[1].donCostArea.length;
  f.play("OP01-117");
  f.choose("accept");
  f.select([b.instanceId]);
  expect(f.state.pendingPrompt).toBeNull();
  expect(current(f, b)?.state).toBe("RESTED");
  expect(f.state.players[1].donCostArea.length).toBe(n);
});
it("declined batch Zoro replacement preserves source for Buffalo after save/load", async () => {
  const f = fixture();
  f.leaderTypes(["Navy"]);
  const z = f.put("PRB02-006", 1),
    b = f.put("OP14-070", 1);
  f.put(CARDS.VANILLA.id, 1);
  f.play("OP10-023");
  f.select([z.instanceId, b.instanceId]);
  expect(f.state.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
  await f.persist();
  f.choose("skip");
  expect(f.state.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
  await f.persist();
  f.choose("accept");
  if (f.state.pendingPrompt?.options.promptType === "SELECT_TARGET")
    f.select([f.state.players[1].donCostArea[0].instanceId]);
  expect(f.state.pendingPrompt).toBeNull();
  expect(current(f, z)?.state).toBe("RESTED");
  expect(current(f, b)?.state).toBe("ACTIVE");
});
it("Perona watches another Character rested by your effect", () => {
  const f = fixture();
  f.put("OP10-036", 0);
  const target = f.put(CARDS.VANILLA.id, 1);
  f.play("OP01-033");
  const rested = f.state.players[0].donCostArea.filter(
    (d) => d.state === "RESTED"
  ).length;
  f.select([target.instanceId]);
  f.choose("1");
  expect(f.state.pendingPrompt).toBeNull();
  expect(
    f.state.players[0].donCostArea.filter((d) => d.state === "RESTED").length
  ).toBe(rested - 1);
});
it("Bartolomeo watches REST_SELF activation costs per official FAQ", () => {
  const f = fixture();
  f.put("OP07-031", 0);
  const booster = f.put("OP01-020", 0),
    n = f.state.players[0].hand.length,
    deck = f.state.players[0].deck.length;
  f.act({
    type: "ACTIVATE_EFFECT",
    cardInstanceId: booster.instanceId,
    effectId: "activate_power_boost",
  });
  f.choose("accept");
  if (f.state.pendingPrompt?.options.promptType === "SELECT_TARGET")
    f.select([]);
  expect(f.state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
  f.select([f.state.players[0].hand[0].instanceId]);
  expect(f.state.pendingPrompt).toBeNull();
  expect(f.state.players[0].hand.length).toBe(n);
  expect(f.state.players[0].deck.length).toBe(deck - 1);
});

it.each(["PRB02-006", "OP14-070"])(
  "%s ignores an opponent Leader effect",
  (id) => {
    const f = fixture(),
      target = f.put(id, 1);
    f.put(CARDS.VANILLA.id, 1);
    const leader = f.put("OP06-021", 0, "LEADER");
    f.act({
      type: "ACTIVATE_EFFECT",
      cardInstanceId: leader.instanceId,
      effectId: "OP06-021_effect_1",
    });
    f.choose("Rest up to 1 opponent Character with cost 4 or less");
    f.select([target.instanceId]);
    expect(f.state.pendingPrompt).toBeNull();
    expect(current(f, target)?.state).toBe("RESTED");
  }
);
it.each(["PRB02-006", "OP14-070"])(
  "%s ignores an opponent Stage effect",
  (id) => {
    const f = fixture(),
      target = f.put(id, 1);
    f.put(CARDS.VANILLA.id, 1);
    f.play("OP06-041");
    expect(f.state.pendingPrompt).toBeNull();
    expect(current(f, target)?.state).toBe("RESTED");
  }
);
it("Zoro cannot offer a prohibited alternate per PRB02 FAQ", () => {
  const f = fixture(),
    z = f.put("PRB02-006", 1),
    alternate = f.put(CARDS.VANILLA.id, 1);
  f.play("OP14-033");
  f.select([alternate.instanceId]);
  f.play("OP01-033");
  f.select([z.instanceId]);
  expect(f.state.pendingPrompt).toBeNull();
  expect(current(f, z)?.state).toBe("RESTED");
  expect(current(f, alternate)?.state).toBe("ACTIVE");
});
it("departed Character source still offers Zoro replacement after a real cost reduction", async () => {
  const f = fixture(),
    z = f.put("PRB02-006", 1),
    alternate = f.put(CARDS.VANILLA.id, 1),
    reducer = f.put("EB01-048", 0);
  f.act({
    type: "ACTIVATE_EFFECT",
    cardInstanceId: reducer.instanceId,
    effectId: "activate_cost_reduce",
  });
  f.choose("accept");
  f.select([z.instanceId]);
  const source = f.put("OP05-027", 0);
  f.act({
    type: "ACTIVATE_EFFECT",
    cardInstanceId: source.instanceId,
    effectId: "activate_rest_opponent",
  });
  f.choose("accept");
  expect(f.state.players[0].trash.some((c) => c.cardId === source.cardId)).toBe(
    true
  );
  await f.persist();
  f.select([z.instanceId]);
  expect(f.state.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
  await f.persist();
  f.choose("skip");
  expect(f.state.pendingPrompt).toBeNull();
  expect(current(f, z)?.state).toBe("RESTED");
  expect(current(f, alternate)?.state).toBe("ACTIVE");
  expect(
    f.state.eventLog.find(
      (e) =>
        e.type === "CARD_STATE_CHANGED" &&
        e.payload.targetInstanceId === z.instanceId
    )?.payload
  ).toMatchObject({
    causingSource: {
      instanceId: source.instanceId,
      cardId: source.cardId,
      cardType: "Character",
    },
  });
});
it.each([
  "OP14-021",
  "OP14-027",
  "OP14-028",
  "OP14-032",
  "OP14-035",
  "OP14-119",
])("%s ignores sibling attack rest", (id) => {
  const f = fixture();
  f.put(id, 0);
  const attacker = f.put(CARDS.VANILLA.id, 0);
  f.act({
    type: "DECLARE_ATTACK",
    attackerInstanceId: attacker.instanceId,
    targetInstanceId: f.state.players[1].leader.instanceId,
  });
  expect(f.state.pendingPrompt).toBeNull();
  expect(current(f, attacker)?.state).toBe("RESTED");
});
it.each([
  "OP14-021",
  "OP14-027",
  "OP14-028",
  "OP14-032",
  "OP14-035",
  "OP14-119",
])("%s resolves its own attack rest", (id) => {
  const f = fixture(),
    host = f.put(id, 0),
    enemy = f.put(CARDS.VANILLA.id, 1);
  f.db.set(CARDS.VANILLA.id, {
    ...f.db.get(CARDS.VANILLA.id)!,
    cost: 2,
    power: 3000,
  });
  if (["OP14-021", "OP14-028", "OP14-035"].includes(id)) enemy.state = "RESTED";
  const life = f.state.players[0].life.length;
  f.act({
    type: "DECLARE_ATTACK",
    attackerInstanceId: host.instanceId,
    targetInstanceId: f.state.players[1].leader.instanceId,
  });
  if (id === "OP14-021") f.choose("accept");
  expect(f.state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
  f.select([enemy.instanceId]);
  expect(f.state.pendingPrompt).toBeNull();
  if (id === "OP14-028")
    expect(
      f.state.players[1].trash.some((c) => c.cardId === enemy.cardId)
    ).toBe(true);
  else if (["OP14-027", "OP14-032"].includes(id))
    expect(current(f, enemy)?.state).toBe("RESTED");
  else
    expect(
      f.state.prohibitions.some((p) => p.appliesTo.includes(enemy.instanceId))
    ).toBe(true);
  if (id === "OP14-021") expect(f.state.players[0].life.length).toBe(life - 1);
});
it.each(["PRB02-006", "OP14-070"])("%s ignores a no-op rest", (id) => {
  const f = fixture(),
    target = f.put(id, 1);
  target.state = "RESTED";
  f.put(CARDS.VANILLA.id, 1);
  f.play("OP01-033");
  f.select([target.instanceId]);
  expect(f.state.pendingPrompt).toBeNull();
  expect(
    f.state.eventLog.filter(
      (e) =>
        e.type === "CARD_STATE_CHANGED" &&
        e.payload.targetInstanceId === target.instanceId
    )
  ).toHaveLength(0);
});

it.each(["PRB02-006", "OP14-070"])(
  "%s ignores rest by your own effect",
  (id) => {
    const f = fixture(),
      host = f.put(id, 0);
    f.put(CARDS.VANILLA.id, 1);
    f.db.set("OP07-036", {
      ...f.db.get("OP07-036")!,
      effectText:
        "[Main] Up to 1 of your Leader or Character cards gains +3000 power during this turn. Then, you may rest 1 of your Characters with a cost of 3 or more. If you do, rest up to 1 of your opponent's Characters with a cost of 5 or less.",
    });
    f.play("OP07-036");
    f.choose("accept");
    f.select([]);
    if (
      f.state.pendingPrompt?.options.promptType === "SELECT_TARGET" &&
      f.state.pendingPrompt.options.validTargets.includes(host.instanceId)
    )
      f.select([host.instanceId]);
    if (f.state.pendingPrompt?.options.promptType === "SELECT_TARGET")
      f.select([]);
    expect(f.state.pendingPrompt).toBeNull();
    expect(current(f, host)?.state).toBe("RESTED");
  }
);
it.each(["OP07-031", "OP10-036"])("%s ignores attack rest", (id) => {
  const f = fixture();
  f.put(id, 0);
  const attacker = f.put(CARDS.VANILLA.id, 0),
    deck = f.state.players[0].deck.length;
  f.act({
    type: "DECLARE_ATTACK",
    attackerInstanceId: attacker.instanceId,
    targetInstanceId: f.state.players[1].leader.instanceId,
  });
  expect(f.state.pendingPrompt).toBeNull();
  expect(f.state.players[0].deck.length).toBe(deck);
});
it.each(["OP07-031", "OP10-036"])(
  "%s ignores another player's effect on opponent turn",
  (id) => {
    const f = fixture();
    f.put(id, 1);
    const target = f.put(CARDS.VANILLA.id, 1);
    f.play("OP01-033");
    f.select([target.instanceId]);
    expect(f.state.pendingPrompt).toBeNull();
  }
);
it("Buffalo cannot activate without DON to return", () => {
  const f = fixture(),
    b = f.put("OP14-070", 1);
  f.state.players[1].donCostArea = [];
  f.play("OP01-033");
  f.select([b.instanceId]);
  if (f.state.pendingPrompt?.options.promptType === "OPTIONAL_EFFECT")
    f.choose("accept");
  expect(f.state.pendingPrompt).toBeNull();
  expect(current(f, b)?.state).toBe("RESTED");
});
it.each([
  "OP14-021",
  "OP14-027",
  "OP14-028",
  "OP14-032",
  "OP14-035",
  "OP14-119",
])("%s ignores own rest on opponent turn", (id) => {
  const f = fixture(),
    host = f.put(id, 1);
  f.play("OP06-041");
  expect(f.state.pendingPrompt).toBeNull();
  expect(current(f, host)?.state).toBe("RESTED");
});

it("Zoro ignores an opponent Character effect during its own turn", () => {
  const f = fixture(),
    z = f.put("PRB02-006", 0),
    attacker = f.put(CARDS.VANILLA.id, 0);
  f.put("OP17-033", 1);
  f.act({
    type: "DECLARE_ATTACK",
    attackerInstanceId: attacker.instanceId,
    targetInstanceId: f.state.players[1].leader.instanceId,
  });
  f.choose("accept");
  f.select([z.instanceId]);
  expect(f.state.pendingPrompt).toBeNull();
  expect(current(f, z)?.state).toBe("RESTED");
});
it.each(["OP07-031", "OP10-036"])(
  "%s ignores an opponent effect during your turn",
  (id) => {
    const f = fixture();
    f.put(id, 0);
    const attacker = f.put(CARDS.VANILLA.id, 0),
      subject = f.put(CARDS.VANILLA.id, 0);
    f.put("OP17-033", 1);
    f.act({
      type: "DECLARE_ATTACK",
      attackerInstanceId: attacker.instanceId,
      targetInstanceId: f.state.players[1].leader.instanceId,
    });
    f.choose("accept");
    f.select([subject.instanceId]);
    expect(f.state.pendingPrompt).toBeNull();
    expect(current(f, subject)?.state).toBe("RESTED");
  }
);

it("recursively inventories every authored rest watcher against canonical host scope", async () => {
  const { AUTHORED_SCHEMAS } =
    await import("../engine/authored-schemas.generated.js");
  const found: string[] = [];
  function visit(value: unknown, cardId: string) {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach((v) => visit(v, cardId));
      return;
    }
    const record = value as Record<string, unknown>;
    if (record.event === "CHARACTER_BECOMES_RESTED") {
      found.push(cardId);
      const filter = record.filter as Record<string, unknown> | undefined;
      expect(filter?.target, cardId).toBe(
        ["OP07-031", "OP10-036"].includes(cardId) ? undefined : "SELF"
      );
    }
    Object.values(record).forEach((v) => visit(v, cardId));
  }
  for (const [id, schema] of Object.entries(AUTHORED_SCHEMAS))
    visit(schema, id);
  expect(found.sort()).toEqual([
    "OP07-031",
    "OP10-036",
    "OP14-021",
    "OP14-027",
    "OP14-028",
    "OP14-032",
    "OP14-035",
    "OP14-070",
    "OP14-119",
    "PRB02-009",
  ]);
});
it.each([{ cardType: "UNKNOWN" }, { instanceId: 42 }])(
  "rejects malformed persisted rest source %j",
  async (invalid) => {
    const f = fixture(),
      b = f.put("OP14-070", 1);
    f.play("OP01-033");
    f.select([b.instanceId]);
    const event = f.state.eventLog.find(
      (e) =>
        e.type === "CARD_STATE_CHANGED" &&
        e.payload.targetInstanceId === b.instanceId
    )!;
    if (event.type !== "CARD_STATE_CHANGED")
      throw new Error("Missing rest event");
    Object.assign(event.payload.causingSource!, invalid);
    await expect(f.persist()).rejects.toThrow();
  }
);

it("orders broad watchers once, completes both effects, and does not retrigger this turn", () => {
  const f = fixture();
  f.put("OP07-031", 0);
  f.put("OP10-036", 0);
  const first = f.put(CARDS.VANILLA.id, 1),
    second = f.put(CARDS.VANILLA.id, 1);
  const deck = f.state.players[0].deck.length;
  f.play("OP01-033");
  f.select([first.instanceId]);
  expect(f.state.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");
  const options = f.state.pendingPrompt!.options;
  if (options.promptType !== "PLAYER_CHOICE")
    throw new Error("Expected ordering");
  const barto = options.choices.find((c) => c.label.includes("Bartolomeo"));
  expect(barto).toBeDefined();
  f.choose(barto!.id);
  f.select([f.state.players[0].hand[0].instanceId]);
  f.choose("1");
  expect(f.state.pendingPrompt).toBeNull();
  expect(f.state.players[0].deck.length).toBe(deck - 1);
  f.play("OP01-033");
  f.select([second.instanceId]);
  expect(f.state.pendingPrompt).toBeNull();
  expect(f.state.players[0].deck.length).toBe(deck - 1);
});
