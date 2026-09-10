import { describe, expect, it } from "vitest";
import type { CardData, CardInstance, GameAction } from "../types.js";
import { runPipeline } from "../engine/pipeline.js";
import {
  SessionRepository,
  type SessionStorage,
} from "../session/persistence.js";
import { visibleStateForPlayer } from "../session/visibility.js";
import { SessionCoordinator } from "../session/coordinator.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import {
  getEffectivePower,
  getEffectiveCost,
  getEffectiveFieldCost,
  hasGrantedKeyword,
} from "../engine/modifiers.js";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
  padChars,
} from "./helpers.js";

class MemoryStorage implements SessionStorage {
  readonly data = new Map<string, unknown>();
  async get<T>(key: string): Promise<T | undefined> {
    return structuredClone(this.data.get(key)) as T | undefined;
  }
  async put(key: string, value: unknown): Promise<void>;
  async put(entries: Record<string, unknown>): Promise<void>;
  async put(
    key: string | Record<string, unknown>,
    value?: unknown
  ): Promise<void> {
    for (const [name, entry] of Object.entries(
      typeof key === "string" ? { [key]: value } : key
    ))
      this.data.set(name, JSON.parse(JSON.stringify(entry)));
  }
  async setAlarm(): Promise<void> {}
  async deleteAlarm(): Promise<void> {}
}
function fixture() {
  const db = createTestCardDb();
  for (const [id, cost] of [
    ["OP11-031", 6],
    ["OP11-112", 3],
    ["OP12-087", 6],
    ["OP12-061", 0],
    ["OP02-025", 0],
    ["OP01-033", 3],
  ] as const) {
    const schema = getEffectSchema(id)!;
    const type = schema.card_type as CardData["type"];
    db.set(id, {
      ...CARDS.VANILLA,
      id,
      name: schema.card_name!,
      type,
      cost: type === "Leader" ? null : cost,
      power:
        type === "Leader"
          ? 5000
          : id === "OP11-031"
            ? 8000
            : id === "OP11-112"
              ? 2000
              : id === "OP12-087"
                ? 7000
                : 4000,
      effectText: "",
      effectSchema: schema,
    });
  }
  db.set("LAW", {
    ...CARDS.VANILLA,
    id: "LAW",
    name: "Trafalgar Law",
    cost: 4,
  });
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
        ).kind,
        JSON.stringify(state.pendingPrompt)
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
    async persist() {
      const storage = new MemoryStorage();
      const options = {
        nextJsUrl: "https://app.example.test",
        workerSecret: "test",
      };
      await new SessionRepository(storage, options).save({
        state,
        cardDb: db,
        mode: "PVP",
        pregameMode: "HOST_FIRST",
        testPriorityRolls: null,
        undoHistory: [],
      });
      const loaded = await new SessionRepository(storage, options).load();
      expect(loaded).not.toBeNull();
      state = loaded!.state;
      db.clear();
      for (const [id, card] of loaded!.cardDb) db.set(id, card);
    },
    put,
    act,
    choose,
    select,
    play,
    restore(nextState: typeof state) {
      state = nextState;
    },
    get state() {
      return state;
    },
  };
}

function leader(
  f: ReturnType<typeof fixture>,
  name: string,
  types: string[] = []
) {
  f.db.set(CARDS.LEADER.id, { ...CARDS.LEADER, name, types });
}
function field(f: ReturnType<typeof fixture>, id: string) {
  return f.state.players
    .flatMap((p) => p.characters)
    .find((c) => c?.cardId === id)!;
}
function readyDon(f: ReturnType<typeof fixture>) {
  return f.state.players[0].donCostArea.filter((d) => d.state === "ACTIVE")
    .length;
}
function activateRosinante(f: ReturnType<typeof fixture>) {
  const source = f.put("OP12-061", 0, "LEADER");
  f.act({
    type: "ACTIVATE_EFFECT",
    cardInstanceId: source.instanceId,
    effectId: "OP12-061_activate_cost_reduction",
  });
  if (f.state.pendingPrompt?.options.promptType === "SELECT_TARGET")
    f.select([f.state.players[0].donCostArea[0].instanceId]);
  expect(f.state.pendingPrompt).toBeFalsy();
  expect(f.state.oneTimeModifiers).toHaveLength(1);
  return source;
}

describe("OPT-810 registered authored-card pipeline", () => {
  it.each(["Fish-Man", "Merfolk", "Pirate"])(
    "Jinbe accepts the printed Leader alternatives: %s",
    (trait) => {
      const f = fixture();
      leader(f, "Leader", [trait]);
      const target = f.put(CARDS.VANILLA.id, 1);
      f.play("OP11-031");
      if (trait !== "Pirate") {
        expect(f.state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
        f.select([target.instanceId]);
      }
      expect(f.state.pendingPrompt).toBeFalsy();
      expect(field(f, CARDS.VANILLA.id).state).toBe(
        trait === "Pirate" ? "ACTIVE" : "RESTED"
      );
    }
  );
  it.each(["Koala", "Monkey.D.Luffy", "Other"])(
    "Robin grants both bonuses under %s",
    (name) => {
      const f = fixture();
      leader(f, name);
      f.play("OP12-087");
      if (f.state.pendingPrompt) f.choose("skip");
      const robin = field(f, "OP12-087");
      expect(hasGrantedKeyword(robin, "BLOCKER", f.state, f.db)).toBe(
        name !== "Other"
      );
      expect(
        getEffectiveFieldCost(
          f.db.get(robin.cardId)!,
          f.state,
          robin.instanceId,
          f.db
        )
      ).toBe(name === "Other" ? 6 : 9);
    }
  );
  it.each(["ACTIVE", "RESTED"] as const)(
    "Megalo retains opponent-turn power when %s",
    (state) => {
      const f = fixture();
      leader(f, "Shirahoshi");
      const megalo = f.put("OP11-112", 0);
      megalo.state = state;
      f.state.turn.activePlayerIndex = 1;
      f.play(CARDS.VANILLA.id);
      expect(
        getEffectivePower(
          field(f, "OP11-112"),
          f.db.get("OP11-112")!,
          f.state,
          f.db
        )
      ).toBe(6000);
    }
  );
  it("Rosinante discounts the first hand Law and consumes before the second", () => {
    const f = fixture();
    activateRosinante(f);
    const don = readyDon(f);
    f.play("LAW");
    expect(readyDon(f)).toBe(don - 2);
    f.play("LAW");
    expect(readyDon(f)).toBe(don - 6);
    expect(f.state.oneTimeModifiers.every((m) => m.consumed)).toBe(true);
  });
  it("Rosinante does not quote a discount for a Law outside hand", () => {
    const f = fixture();
    activateRosinante(f);
    const law = f.put("LAW", 0, "TRASH");
    expect(
      getEffectiveCost(f.db.get("LAW")!, f.state, law.instanceId, f.db)
    ).toBe(4);
    const r = runPipeline(
      f.state,
      { type: "PLAY_CARD", cardInstanceId: law.instanceId },
      f.db,
      0
    );
    expect(r.valid).toBe(false);
    expect(f.state.oneTimeModifiers[0].consumed).toBe(false);
  });
});

function nextMain(f: ReturnType<typeof fixture>) {
  f.act({ type: "ADVANCE_PHASE" });
  for (let i = 0; i < 5 && f.state.turn.phase !== "MAIN"; i++)
    f.act({ type: "ADVANCE_PHASE" });
  expect(f.state.turn.phase).toBe("MAIN");
}
describe("OPT810 remaining authored boundaries", () => {
  it.each([false, true])(
    "Jinbe cost5/6 boundary and zero selection=%s",
    (zero) => {
      const f = fixture();
      leader(f, "Leader", ["Merfolk"]);
      f.db.set("five", { ...CARDS.VANILLA, id: "five", cost: 5 });
      f.db.set("six", { ...CARDS.VANILLA, id: "six", cost: 6 });
      const five = f.put("five", 1);
      const six = f.put("six", 1);
      const before = readyDon(f);
      f.play("OP11-031");
      expect(readyDon(f)).toBe(before - 6);
      const options = f.state.pendingPrompt!.options;
      expect(options.promptType).toBe("SELECT_TARGET");
      if (options.promptType !== "SELECT_TARGET")
        throw new Error("target prompt required");
      expect(options.validTargets).toContain(five.instanceId);
      expect(options.validTargets).not.toContain(six.instanceId);
      f.select(zero ? [] : [five.instanceId]);
      expect(field(f, "five").state).toBe(zero ? "ACTIVE" : "RESTED");
      expect(field(f, "six").state).toBe("ACTIVE");
    }
  );
  it.each(["Shirahoshi", "Other"])(
    "Megalo actual attack rests it; turn power under %s",
    (name) => {
      const f = fixture();
      leader(f, name);
      const megalo = f.put("OP11-112", 0);
      expect(
        getEffectivePower(megalo, f.db.get(megalo.cardId)!, f.state, f.db)
      ).toBe(2000);
      f.act({
        type: "DECLARE_ATTACK",
        attackerInstanceId: megalo.instanceId,
        targetInstanceId: f.state.players[1].leader.instanceId,
      });
      while (f.state.turn.battle) f.act({ type: "PASS" });
      expect(field(f, megalo.cardId).state).toBe("RESTED");
      nextMain(f);
      expect(f.state.turn.activePlayerIndex).toBe(1);
      expect(
        getEffectivePower(
          field(f, megalo.cardId),
          f.db.get(megalo.cardId)!,
          f.state,
          f.db
        )
      ).toBe(name === "Shirahoshi" ? 6000 : 2000);
    }
  );
  it.each(["unrelated", "low Law"])(
    "Rosinante retains discount after %s and a second activation has no effect",
    (kind) => {
      const f = fixture();
      const source = activateRosinante(f);
      const second = runPipeline(
        f.state,
        {
          type: "ACTIVATE_EFFECT",
          cardInstanceId: source.instanceId,
          effectId: "OP12-061_activate_cost_reduction",
        },
        f.db,
        0
      );
      expect(second.state.oneTimeModifiers).toEqual(f.state.oneTimeModifiers);
      expect(second.state.players[0].donCostArea).toEqual(
        f.state.players[0].donCostArea
      );
      expect(second.pendingPrompt).toBeUndefined();
      f.db.set("first", {
        ...CARDS.VANILLA,
        id: "first",
        name: kind === "low Law" ? "Trafalgar Law" : "Other",
        cost: 3,
      });
      const before = readyDon(f);
      f.play("first");
      expect(readyDon(f)).toBe(before - 3);
      expect(f.state.oneTimeModifiers[0].consumed).toBe(false);
      f.play("LAW");
      expect(readyDon(f)).toBe(before - 5);
      expect(f.state.oneTimeModifiers[0].consumed).toBe(true);
    }
  );
  it("Rosinante active discount survives SessionRepository save/fresh load and expires at turn end", async () => {
    const f = fixture();
    activateRosinante(f);
    const law = f.put("LAW", 0, "HAND", "quoted");
    const opponentLaw = f.put("LAW", 1, "HAND", "opponent");
    await f.persist();
    expect(
      getEffectiveCost(f.db.get("LAW")!, f.state, law.instanceId, f.db)
    ).toBe(2);
    expect(
      getEffectiveCost(f.db.get("LAW")!, f.state, opponentLaw.instanceId, f.db)
    ).toBe(4);
    expect(
      getEffectiveCost(
        f.db.get("LAW")!,
        f.state,
        law.instanceId,
        f.db,
        true,
        undefined,
        "USE_COUNTER_EVENT"
      )
    ).toBe(4);
    const hand = visibleStateForPlayer(f.state, f.db, 0).players[0].hand;
    expect(
      hand.find((c) => c.instanceId === law.instanceId)?.effectiveCost
    ).toBe(2);
    nextMain(f);
    await f.persist();
    expect(
      getEffectiveCost(f.db.get("LAW")!, f.state, law.instanceId, f.db)
    ).toBe(4);
    expect(f.state.oneTimeModifiers.filter((m) => !m.consumed)).toHaveLength(0);
  });
  it("legacy Kinemon MODIFY_COST still discounts exactly the first Wano Character", async () => {
    const f = fixture();
    const kinemon = f.put("OP02-025", 0, "LEADER");
    f.db.set("wano", {
      ...CARDS.VANILLA,
      id: "wano",
      cost: 3,
      types: ["Land of Wano"],
    });
    f.act({
      type: "ACTIVATE_EFFECT",
      cardInstanceId: kinemon.instanceId,
      effectId: "OP02-025_activate_cost_reduction",
    });
    await f.persist();
    const before = readyDon(f);
    f.play("wano");
    expect(readyDon(f)).toBe(before - 2);
    f.play("wano");
    expect(readyDon(f)).toBe(before - 5);
  });
});

it("Rosinante survives a persisted authored Bepo free-hand play and still discounts the next paid Law", async () => {
  const f = fixture();
  f.db.set("OP01-049", {
    ...CARDS.VANILLA,
    id: "OP01-049",
    name: "Bepo",
    cost: 4,
    power: 4000,
    color: ["Green"],
    types: ["Minks", "Heart Pirates"],
    effectSchema: getEffectSchema("OP01-049"),
  });
  f.db.set("LAW", { ...f.db.get("LAW")!, types: ["Heart Pirates"] });
  const bepo = f.put("OP01-049", 0);
  f.act({ type: "ATTACH_DON", targetInstanceId: bepo.instanceId, count: 1 });
  activateRosinante(f);
  const freeLaw = f.put("LAW", 0, "HAND", "free");
  const paidLaw = f.put("LAW", 0, "HAND", "paid");
  const before = readyDon(f);
  f.act({
    type: "DECLARE_ATTACK",
    attackerInstanceId: bepo.instanceId,
    targetInstanceId: f.state.players[1].leader.instanceId,
  });
  expect(f.state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
  await f.persist();
  expect(
    getEffectiveCost(f.db.get("LAW")!, f.state, paidLaw.instanceId, f.db)
  ).toBe(2);
  f.select([freeLaw.instanceId]);
  expect(readyDon(f)).toBe(before);
  expect(f.state.oneTimeModifiers[0].consumed).toBe(false);
  expect(field(f, "LAW").instanceId).not.toBe(freeLaw.instanceId);
  while (f.state.turn.battle) f.act({ type: "PASS" });
  f.act({ type: "PLAY_CARD", cardInstanceId: paidLaw.instanceId });
  expect(readyDon(f)).toBe(before - 2);
  expect(f.state.oneTimeModifiers[0].consumed).toBe(true);
});

it("authored Moria plays Law from trash for free without consuming Rosinante's next hand play", async () => {
  const f = fixture();
  f.db.set("OP06-086", {
    ...CARDS.VANILLA,
    id: "OP06-086",
    name: "Gecko Moria",
    cost: 8,
    power: 9000,
    color: ["Black"],
    effectSchema: getEffectSchema("OP06-086"),
  });
  const extra = f.state.players[0].donDeck.splice(0);
  f.state.players[0].donCostArea.push(
    ...extra.map((d) => ({ ...d, state: "ACTIVE" as const }))
  );
  activateRosinante(f);
  const freeLaw = f.put("LAW", 0, "TRASH", "free");
  const handLaw = f.put("LAW", 0, "HAND", "later");
  const before = readyDon(f);
  f.play("OP06-086");
  expect(readyDon(f)).toBe(before - 8);
  await f.persist();
  f.select([freeLaw.instanceId]);
  if (f.state.pendingPrompt?.options.promptType === "SELECT_TARGET")
    f.select([]);
  if (f.state.pendingPrompt?.options.promptType === "PLAYER_CHOICE")
    f.choose("Active");
  expect(f.state.pendingPrompt).toBeFalsy();
  expect(field(f, "LAW").instanceId).not.toBe(freeLaw.instanceId);
  expect(
    f.state.players[0].trash.some((c) => c.instanceId === freeLaw.instanceId)
  ).toBe(false);
  expect(readyDon(f)).toBe(before - 8);
  expect(f.state.oneTimeModifiers[0].consumed).toBe(false);
  expect(
    getEffectiveCost(f.db.get("LAW")!, f.state, handLaw.instanceId, f.db)
  ).toBe(2);
});

it.each([{ action: "UNKNOWN_ACTION" }, { source_zone: "UNKNOWN_ZONE" }])(
  "persisted unknown cost scope fails closed: %j",
  async (unknownScope) => {
    const f = fixture();
    activateRosinante(f);
    // Persistence deliberately treats appliesTo as opaque. Exercise runtime
    // compatibility defensively using an authored modifier with a future scope.
    Object.assign(f.state.oneTimeModifiers[0].appliesTo, unknownScope);
    const law = f.put("LAW", 0, "HAND", "unknown");
    await f.persist();
    const before = readyDon(f);
    expect(
      getEffectiveCost(f.db.get("LAW")!, f.state, law.instanceId, f.db)
    ).toBe(4);
    f.act({ type: "PLAY_CARD", cardInstanceId: law.instanceId });
    expect(readyDon(f)).toBe(before - 4);
    expect(f.state.oneTimeModifiers[0].consumed).toBe(false);
  }
);
