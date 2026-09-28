/**
 * OPT-854 — "When you activate an Event" is card activation (rule 8-5-4), and
 * resolving an Event's [Main] from trash via EB03-031 Reiju is not card
 * activation (EB03 FAQ, EB03-031: "Activating the [Main] effect of an Event
 * card with this [On Play] effect differs from activating the Event card
 * itself."). Every registered pipeline scenario here uses authored schemas.
 */
import { describe, expect, it } from "vitest";
import type {
  CardData,
  CardInstance,
  GameAction,
  GameEvent,
  GameState,
} from "../types.js";
import type {
  Action,
  EffectBlock,
  EffectResult,
  Trigger,
} from "../engine/effect-types.js";
import {
  executeActivateEventFromHand,
  executeActivateEventFromTrash,
} from "../engine/effect-resolver/actions/play.js";
import { resolverExecutionServices } from "../engine/effect-resolver/resolver.js";
import {
  SessionRepository,
  type SessionStorage,
} from "../session/persistence.js";
import { runPipeline } from "../engine/pipeline.js";
import { SessionCoordinator } from "../session/coordinator.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import {
  getAllAuthoredSchemas,
  getEffectSchema,
} from "../engine/schema-registry.js";
import {
  matchTriggersForEvent,
  registerCardEnteredField,
} from "../engine/triggers.js";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
  padChars,
} from "./helpers.js";

class Memory implements SessionStorage {
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

async function roundTrip(state: GameState, cardDb: Map<string, CardData>) {
  const storage = new Memory();
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

/** The nine authored watchers whose printed text reads "activate(s) an Event". */
const WATCHERS = [
  "OP01-004",
  "OP01-062",
  "OP04-053",
  "OP06-044",
  "OP06-048",
  "OP10-003",
  "OP11-012",
  "OP11-102",
  "OP15-119",
] as const;

// Printed cost/color/types from the official card lists.
const PRINTED: [string, number, string[], string[]][] = [
  ["OP12-041", 0, ["Blue", "Purple"], ["Straw Hat Crew"]],
  ["OP12-059", 1, ["Blue"], ["Straw Hat Crew"]],
  ["OP04-053", 4, ["Blue"], ["Animal Kingdom Pirates"]],
  ["EB03-031", 4, ["Purple"], ["Vinsmoke Family"]],
  ["EB04-028", 2, ["Blue"], ["Navy"]],
  ["OP09-077", 1, ["Purple"], ["Straw Hat Crew"]],
  ["OP15-119", 10, ["Yellow"], ["Straw Hat Crew"]],
];

const TEXT: Record<string, string> = {
  "OP12-059":
    "[Main] If your Leader is [Sanji], draw 1 card.\n[Counter] If you have 4 or more Events in your trash, up to 1 of your Leader gains +4000 power during this battle.",
};

function fixture() {
  const db = createTestCardDb();
  for (const [id, cost, color, traits] of PRINTED) {
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
      effectText: TEXT[id] ?? "",
      effectSchema: schema,
    });
  }
  let state = createBattleReadyState(db);
  state.players[0].characters = padChars([]);
  state.players[1].characters = padChars([]);
  let serial = 0;
  function put(
    id: string,
    controller: 0 | 1,
    zone: CardInstance["zone"] = "CHARACTER"
  ) {
    const c: CardInstance = {
      ...state.players[controller].leader,
      instanceId: `${id}-${controller}-${zone}-${serial++}`,
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
  function attachDon(card: CardInstance) {
    const don = state.players[card.controller].donCostArea.pop()!;
    card.attachedDon = [...card.attachedDon, { ...don, attachedTo: card.instanceId }];
  }
  function act(action: GameAction) {
    if (state.pendingPrompt) {
      action = { ...action, promptId: state.pendingPrompt.promptId } as GameAction;
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
      const r = runPipeline(state, action, db, state.turn.activePlayerIndex);
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
  /** Legally play a card from hand, paying its printed cost. */
  const play = (id: string) => {
    const c = put(id, state.turn.activePlayerIndex, "HAND");
    act({ type: "PLAY_CARD", cardInstanceId: c.instanceId });
    return c;
  };
  /** Reiju's DON!! −1 may ask where to return the DON from; keep attached DON. */
  const payDonMinusFromCostArea = () => {
    if (state.pendingPrompt?.options.promptType === "PLAYER_CHOICE")
      choose("cost_area");
  };
  return {
    db,
    put,
    attachDon,
    act,
    choose,
    select,
    play,
    payDonMinusFromCostArea,
    async reload() {
      const loaded = await roundTrip(state, db);
      state = loaded.state;
      for (const [id, data] of loaded.cardDb) db.set(id, data);
    },
    get state() {
      return state;
    },
  };
}

const count = (state: GameState, type: string, player?: 0 | 1) =>
  state.eventLog.filter(
    (e) => e.type === type && (player === undefined || e.playerIndex === player)
  ).length;

describe("OPT-854 reported repro: Reiju → Concasser with Page One", () => {
  it.each([0, 1] as const)(
    "controller %i: Concasser draws once; Page One and opponent Luffy stay silent until a real Event activation",
    async (owner) => {
      const opponent = (1 - owner) as 0 | 1;
      const f = fixture();
      f.state.turn.activePlayerIndex = owner;
      f.put("OP12-041", owner, "LEADER");
      const page = f.put("OP04-053", owner);
      f.attachDon(page);
      const luffy = f.put("OP15-119", opponent);
      const concasser = f.put("OP12-059", owner, "TRASH");
      const hand = f.state.players[owner].hand.length;
      const deck = f.state.players[owner].deck.length;
      const oppLifeFace = f.state.players[opponent].life[0].face;

      const reiju = f.play("EB03-031");
      f.payDonMinusFromCostArea();
      const prompt = f.state.pendingPrompt!;
      expect(prompt.options.promptType).toBe("SELECT_TARGET");
      if (prompt.options.promptType === "SELECT_TARGET")
        expect(prompt.options.validTargets).toContain(concasser.instanceId);
      await f.reload();
      f.select([concasser.instanceId]);

      // Exactly one draw (Concasser), no Page One draw and no bottom-deck prompt.
      expect(f.state.pendingPrompt).toBeNull();
      expect(f.state.effectStack).toHaveLength(0);
      expect(f.state.players[owner].hand.length).toBe(hand + 1);
      expect(f.state.players[owner].deck.length).toBe(deck - 1);
      expect(count(f.state, "CARD_DRAWN", owner)).toBe(1);
      expect(count(f.state, "EVENT_ACTIVATED_FROM_HAND")).toBe(0);
      // Concasser stays in trash; Reiju resolved its [On Play] from the field.
      expect(
        f.state.players[owner].trash.some(
          (c) => c.instanceId === concasser.instanceId
        )
      ).toBe(true);
      expect(
        f.state.players[owner].characters.some(
          (c) => c?.cardId === reiju.cardId
        )
      ).toBe(true);
      // Page One's [Once Per Turn] is not consumed; Luffy did not reveal Life.
      expect(
        f.state.turn.oncePerTurnUsed["event_activated_draw_cycle"]
      ).toBeUndefined();
      expect(f.state.players[opponent].life[0].face).toBe(oppLifeFace);
      expect(page.attachedDon).toHaveLength(1);

      await f.reload();
      // True card activation from hand still fires both watchers.
      f.play("OP12-059");
      expect(count(f.state, "EVENT_ACTIVATED_FROM_HAND", owner)).toBe(1);
      expect(f.state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
      expect(f.state.players[owner].hand.length).toBe(hand + 3);
      f.select([f.state.players[owner].hand[0].instanceId]);
      if (f.state.pendingPrompt?.options.promptType === "OPTIONAL_EFFECT")
        f.choose("accept");
      if (f.state.pendingPrompt?.options.promptType === "SELECT_TARGET")
        f.select([]);
      expect(f.state.pendingPrompt).toBeNull();
      expect(f.state.players[owner].hand.length).toBe(hand + 2);
      expect(
        f.state.turn.oncePerTurnUsed["event_activated_draw_cycle"]
      ).toContain(page.instanceId);
      expect(f.state.players[opponent].life[0].face).toBe("UP");
      expect(luffy.zone).toBe("CHARACTER");
    }
  );
});

describe("OPT-854 Main-from-trash completion notification", () => {
  it.each([true, false])(
    "Reiju → Ice Time: publishes EVENT_MAIN_RESOLVED_FROM_TRASH only when the optional cost is paid (accept %s)",
    async (accept) => {
      const f = fixture();
      f.put("OP12-041", 0, "LEADER");
      const event = f.put("EB04-028", 0, "TRASH");
      f.play("EB03-031");
      f.payDonMinusFromCostArea();
      f.select([event.instanceId]);
      expect(f.state.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
      await f.reload();
      f.choose(accept ? "accept" : "skip");
      if (accept) f.select([f.state.players[0].hand[0].instanceId]);
      expect(f.state.pendingPrompt).toBeNull();
      expect(f.state.effectStack).toHaveLength(0);
      expect(count(f.state, "EVENT_MAIN_RESOLVED_FROM_TRASH")).toBe(
        Number(accept)
      );
    }
  );
});

describe("OPT-854 unrelated declines keep an activated Main's completion", () => {
  it.each(["KO", "DRAW"] as const)(
    "declining a %s watcher triggered inside a Reiju-resolved Main keeps EVENT_MAIN_RESOLVED_FROM_TRASH",
    async (kind) => {
      const f = fixture();
      f.put("OP12-041", 0, "LEADER");
      // Synthetic optional watcher that resolves while the trash Main's
      // completion boundary is still on the stack.
      f.db.set("SYN-WATCH", {
        ...CARDS.VANILLA,
        id: "SYN-WATCH",
        effectSchema: {
          effects: [
            {
              id: "syn_watch",
              category: "auto",
              trigger: {
                event: kind === "KO" ? "OPPONENT_CHARACTER_KO" : "DRAW_OUTSIDE_DRAW_PHASE",
              },
              flags: { optional: true },
              actions: [{ type: "DRAW", params: { amount: 1 } }],
            },
          ],
        },
      });
      // Synthetic Main: a target prompt, then a draw on the resume path.
      f.db.set("SYN-EVT", {
        ...CARDS.VANILLA,
        id: "SYN-EVT",
        type: "Event",
        cost: 1,
        power: null,
        effectSchema: {
          effects: [
            {
              id: "syn_main",
              category: "auto",
              trigger: { keyword: "MAIN_EVENT" },
              actions: [
                {
                  type: "MODIFY_POWER",
                  target: {
                    type: "LEADER_OR_CHARACTER",
                    controller: "SELF",
                    count: { up_to: 1 },
                  },
                  params: { amount: 1000 },
                  duration: { type: "THIS_TURN" },
                },
                { type: "DRAW", params: { amount: 1 } },
              ],
            },
          ],
        },
      });
      f.put("SYN-WATCH", 0);
      const event = f.put(kind === "KO" ? "OP09-077" : "SYN-EVT", 0, "TRASH");
      const target = f.put(CARDS.VANILLA.id, 1);
      const hand = f.state.players[0].hand.length;
      f.play("EB03-031");
      f.payDonMinusFromCostArea();
      f.select([event.instanceId]);
      f.payDonMinusFromCostArea();
      expect(f.state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
      await f.reload();
      f.select(kind === "KO" ? [target.instanceId] : [f.state.players[0].leader.instanceId]);
      expect(f.state.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
      expect(count(f.state, "EVENT_MAIN_RESOLVED_FROM_TRASH")).toBe(0);
      await f.reload();
      f.choose("skip");
      expect(f.state.pendingPrompt).toBeNull();
      expect(f.state.effectStack).toHaveLength(0);
      expect(f.state.players[0].hand.length).toBe(hand + Number(kind === "DRAW"));
      expect(count(f.state, "EVENT_MAIN_RESOLVED_FROM_TRASH", 0)).toBe(1);
    }
  );
});

describe("OPT-854 inline Main completion: activated vs never activated", () => {
  const main = (extra: Partial<EffectBlock>): EffectBlock => ({
    id: "main",
    category: "auto",
    trigger: { keyword: "MAIN_EVENT" },
    actions: [{ type: "DRAW", params: { amount: 1 } }],
    ...extra,
  });
  // [label, block overrides, completion published, Main draws]
  const cases: [string, Partial<EffectBlock>, boolean, boolean][] = [
    // 8-3-1-3: an unpayable activation cost means the effect is not activated.
    ["unpayable DON!! −99 cost", { costs: [{ type: "DON_MINUS", amount: 99 }] }, false, false],
    // 8-3-3: an unmet "if" clause still activates; only its result is skipped.
    [
      "unmet 'if' condition",
      {
        conditions: {
          type: "LEADER_PROPERTY",
          controller: "SELF",
          property: { name: "Nobody" },
        },
      },
      true,
      false,
    ],
    ["ordinary Main", {}, true, true],
  ];

  function setup(block: EffectBlock, zone: "HAND" | "TRASH") {
    const db = createTestCardDb();
    db.set("EVT-854", {
      ...CARDS.VANILLA,
      id: "EVT-854",
      type: "Event",
      cost: 1,
      power: null,
      effectText: "[Main] Draw 1 card.",
      effectSchema: { effects: [block] },
    });
    const state = createBattleReadyState(db);
    const card: CardInstance = {
      ...state.players[0].leader,
      instanceId: "evt-854",
      cardId: "EVT-854",
      zone,
      attachedDon: [],
      turnPlayed: null,
    };
    if (zone === "HAND") state.players[0].hand.push(card);
    else state.players[0].trash.push(card);
    return { db, state };
  }
  const target = (zone: "HAND" | "TRASH"): Action => ({
    type: zone === "HAND" ? "ACTIVATE_EVENT_FROM_HAND" : "ACTIVATE_EVENT_FROM_TRASH",
    target: {
      type: "EVENT_CARD",
      controller: "SELF",
      count: { up_to: 1 },
      source_zone: zone,
    },
  }) as Action;

  it.each(cases)("trash: %s", (_, extra, published, draws) => {
    const { db, state } = setup(main(extra), "TRASH");
    const hand = state.players[0].hand.length;
    const result = executeActivateEventFromTrash(
      state,
      target("TRASH") as Extract<Action, { type: "ACTIVATE_EVENT_FROM_TRASH" }>,
      "reiju",
      0,
      db,
      new Map<string, EffectResult>(),
      ["evt-854"],
      resolverExecutionServices
    );
    expect(result.pendingPrompt).toBeUndefined();
    expect(result.state.effectStack).toHaveLength(0);
    expect(
      result.events.filter((e) => e.type === "EVENT_MAIN_RESOLVED_FROM_TRASH")
    ).toHaveLength(Number(published));
    expect(result.state.players[0].hand.length).toBe(hand + Number(draws));
  });

  it.each(cases)("hand: %s still publishes card activation", (_, extra) => {
    const { db, state } = setup(main(extra), "HAND");
    const result = executeActivateEventFromHand(
      state,
      target("HAND") as Extract<Action, { type: "ACTIVATE_EVENT_FROM_HAND" }>,
      "sanji",
      0,
      db,
      new Map<string, EffectResult>(),
      ["evt-854"],
      resolverExecutionServices
    );
    expect(result.state.effectStack).toHaveLength(0);
    expect(
      result.events.filter((e) => e.type === "EVENT_ACTIVATED_FROM_HAND")
    ).toHaveLength(1);
  });
});

// ─── Registry walk (not grep): every authored trigger, recursively ─────────

function leafEvents(trigger: Trigger | undefined): string[] {
  if (!trigger) return [];
  if ("any_of" in trigger) return trigger.any_of.flatMap(leafEvents);
  return "event" in trigger ? [trigger.event] : [];
}

function authoredSubscribers(event: string): string[] {
  const ids = new Set<string>();
  for (const schema of Object.values(getAllAuthoredSchemas())) {
    for (const block of schema.effects ?? []) {
      if (leafEvents(block.trigger).includes(event)) ids.add(schema.card_id!);
    }
  }
  return [...ids].sort();
}

describe("OPT-854 authored Event-activation watcher inventory", () => {
  it("no authored card subscribes to EVENT_MAIN_RESOLVED_FROM_TRASH", () => {
    expect(authoredSubscribers("EVENT_MAIN_RESOLVED_FROM_TRASH")).toEqual([]);
  });

  it("the nine 'activate(s) an Event' watchers keep hand (card) activation", () => {
    expect(authoredSubscribers("EVENT_ACTIVATED_FROM_HAND")).toEqual([
      ...WATCHERS,
    ]);
  });

  // Each watcher is placed so every printed gate (DON!!, turn, controller)
  // is satisfied; only the event class differs.
  it.each(
    WATCHERS.flatMap((id) => [0, 1].map((w) => [id, w as 0 | 1] as const))
  )("%s (watcher controller %i) matches card activation, never Main-from-trash", (id, watcher) => {
    const schema = getEffectSchema(id)!;
    const db = createTestCardDb();
    const data: CardData = {
      ...CARDS.VANILLA,
      id,
      name: schema.card_name!,
      type: schema.card_type as CardData["type"],
      effectSchema: schema,
    };
    db.set(id, data);
    let state = createBattleReadyState(db);
    const block = schema.effects!.find((b) =>
      leafEvents(b.trigger).includes("EVENT_ACTIVATED_FROM_HAND")
    )!;
    const leaf = (
      "any_of" in block.trigger! ? block.trigger.any_of : [block.trigger!]
    ).find(
      (t) => "event" in t && t.event === "EVENT_ACTIVATED_FROM_HAND"
    ) as Extract<Trigger, { event: string }>;
    const actor = (
      leaf.filter?.controller === "OPPONENT" ? 1 - watcher : watcher
    ) as 0 | 1;
    state.turn.activePlayerIndex = (
      leaf.turn_restriction === "OPPONENT_TURN" ? 1 - watcher : watcher
    ) as 0 | 1;
    const zone = data.type === "Leader" ? "LEADER" : "CHARACTER";
    const don = state.players[watcher].donCostArea.pop()!;
    const card: CardInstance = {
      ...state.players[watcher].leader,
      instanceId: `${id}-watcher`,
      cardId: id,
      controller: watcher,
      owner: watcher,
      zone,
      state: "ACTIVE",
      attachedDon: [{ ...don, attachedTo: `${id}-watcher` }],
      turnPlayed: 0,
    };
    if (zone === "LEADER") state.players[watcher].leader = card;
    else state.players[watcher].characters = padChars([card]);
    state = registerCardEnteredField(state, card, data);

    const eventOf = (type: GameEvent["type"]) =>
      ({
        type,
        playerIndex: actor,
        timestamp: 1,
        payload: { cardId: "OP12-059", cardInstanceId: "evt" },
      }) as GameEvent;
    const fires = (type: GameEvent["type"]) =>
      matchTriggersForEvent(state, eventOf(type), db).some(
        (m) => m.trigger.sourceCardInstanceId === card.instanceId
      );
    expect(fires("EVENT_ACTIVATED_FROM_HAND")).toBe(true);
    expect(fires("EVENT_MAIN_RESOLVED_FROM_TRASH")).toBe(false);
    expect(fires("EVENT_TRIGGER_RESOLVED")).toBe(false);
  });
});
