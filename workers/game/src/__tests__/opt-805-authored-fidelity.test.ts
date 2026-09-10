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
import { filterStateForPlayer } from "../engine/state.js";
import { visibleStateForSpectator } from "../session/visibility.js";
import { runPipeline } from "../engine/pipeline.js";
import { SessionCoordinator } from "../session/coordinator.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import {
  registerCardEnteredField,
  matchTriggersForEvent,
} from "../engine/triggers.js";
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

const text: Record<string, string> = {
  "OP01-062":
    "[DON!! x1] When you activate an Event, you may draw 1 card if you have 4 or less cards in your hand and haven't drawn a card using this Leader's effect during this turn.",
  "OP02-071":
    "[Your Turn] [Once Per Turn] When a DON!! card on the field is returned to your DON!! deck, this Leader gains +1000 power during this turn.",
  "OP01-116":
    "[Main] Look at 5 cards from the top of your deck; play up to 1 {SMILE} type Character card with a cost of 3 or less. Then, place the rest at the bottom of your deck in any order.",
  "OP01-117":
    "[Main] DON!! −1: Rest up to 1 of your opponent's Characters with a cost of 6 or less.",
  "OP01-118":
    "[Counter] DON!! −2: Up to 1 of your Leader or Character cards gains +2000 power during this battle. Then, draw 1 card.",
  "ST04-014":
    "[Main] Draw 1 card. Then, add up to 1 DON!! card from your DON!! deck and rest it.",
};
function fixture() {
  const db = createTestCardDb();
  for (const [id, cost] of [
    ["OP01-004", 2],
    ["OP11-012", 4],
    ["OP01-062", 0],
    ["OP02-071", 0],
    ["OP01-069", 4],
    ["OP01-116", 2],
    ["OP02-030", 8],
    ["ST03-007", 3],
    ["OP01-094", 10],
    ["OP01-117", 2],
    ["OP01-118", 1],
    ["ST04-014", 3],
    ["EB03-031", 4],
  ] as const) {
    const schema = getEffectSchema(id)!;
    const type = schema.card_type as CardData["type"];
    db.set(id, {
      ...CARDS.VANILLA,
      id,
      name: schema.card_name!,
      type,
      cost: type === "Leader" ? null : cost,
      power: type === "Leader" ? 5000 : 4000,
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
function attach(f: ReturnType<typeof fixture>, c: CardInstance) {
  const don = f.state.players[c.controller].donCostArea.pop()!;
  c.attachedDon = [{ ...don, attachedTo: c.instanceId }];
}

function searchFixture(id: string, matches = true) {
  const f = fixture();
  const owner: 0 | 1 = id === "OP01-069" || id === "OP02-030" ? 1 : 0;
  const targetData: CardData = {
    ...CARDS.VANILLA,
    id: "search-hit",
    name:
      id === "OP01-069" ? "Smiley" : id === "ST03-007" ? "Pacifista" : "test",
    color: ["Green"],
    types: ["SMILE", "Land of Wano"],
    cost: 3,
    effectSchema: null,
  };
  f.db.set(targetData.id, targetData);
  f.db.set("search-decoy", {
    ...targetData,
    id: "search-decoy",
    name: id === "OP01-069" ? "Smiler" : targetData.name,
    cost: id === "ST03-007" ? 5 : id === "OP02-030" ? 2 : 4,
  });
  const old = f.state.players[owner].deck[0];
  f.state.players[owner].deck = Array.from({ length: 8 }, (_, i) => ({
    ...old,
    instanceId: `deck-${i}`,
    cardId:
      matches && i < 2
        ? targetData.id
        : matches && i === 2
          ? "search-decoy"
          : CARDS.VANILLA.id,
  }));
  const before = f.state.players[owner].deck.map((c) => c.instanceId);
  const beforeRng = f.state.executionContext.rngState;
  let host: CardInstance;
  if (owner === 1) {
    host = f.put(id, 1);
    f.db.set(CARDS.LEADER.id, {
      ...CARDS.LEADER,
      types: ["Animal Kingdom Pirates"],
    });
    f.state.players[0].donCostArea.push(
      ...f.state.players[0].donDeck
        .splice(0)
        .map((d) => ({ ...d, state: "ACTIVE" as const }))
    );
    f.play("OP01-094");
    f.choose("accept");
    expect(f.state.players[1].trash.some((c) => c.cardId === id)).toBe(true);
  } else if (id === "ST03-007") {
    host = f.put(id, 0);
    attach(f, host);
    f.act({
      type: "ACTIVATE_EFFECT",
      cardInstanceId: host.instanceId,
      effectId: "activate_search_play",
    });
    expect(
      f.state.players[0].donCostArea.filter((d) => d.state === "RESTED")
    ).toHaveLength(2);
  } else {
    host = f.play(id);
  }
  if (matches)
    expect(f.state.pendingPrompt?.options.promptType).toBe("ARRANGE_TOP_CARDS");
  return {
    ...f,
    owner,
    before,
    beforeRng,
    host,
    get state() {
      return f.state;
    },
  };
}
const searches = ["OP01-069", "OP01-116", "OP02-030", "ST03-007"] as const;
describe("OPT805 registered authored searches", () => {
  for (const id of searches) {
    it(`${id} can resolve with no eligible cards`, () => {
      const f = searchFixture(id, false);
      expect(f.state.pendingPrompt).toBeNull();
      if (id !== "OP01-116")
        expect(f.state.executionContext.rngState).not.toBe(f.beforeRng);
      expect(f.state.players[f.owner].deck).toHaveLength(8);
      expect(
        f.state.players[f.owner].characters.some(
          (c) => c?.cardId === "search-hit"
        )
      ).toBe(false);
    });
    it.each([0, 1])(
      `${id} plays %i after its real trigger/cost and preserves remaining deck`,
      (count) => {
        const f = searchFixture(id);
        const o = f.state.pendingPrompt!.options;
        if (o.promptType !== "ARRANGE_TOP_CARDS") throw new Error("search");
        const chosen = o.validTargets![0];
        const keep = count ? [chosen] : [];
        const ordered = o.cards
          .filter((c) => !keep.includes(c.instanceId))
          .map((c) => c.instanceId)
          .reverse();
        f.act({
          type: "ARRANGE_TOP_CARDS",
          keptCardInstanceId: keep[0] ?? "",
          keptCardInstanceIds: keep,
          orderedInstanceIds: ordered,
          destination: "bottom",
        });
        expect(f.state.pendingPrompt).toBeNull();
        expect(
          f.state.players[f.owner].characters.filter(
            (c) => c?.cardId === "search-hit"
          )
        ).toHaveLength(count);
        if (id !== "OP01-116")
          expect(f.state.executionContext.rngState).not.toBe(f.beforeRng);
        expect(f.state.players[f.owner].deck).toHaveLength(8 - count);
        expect(
          f.state.players[f.owner].deck.map((c) => c.instanceId).sort()
        ).toEqual(f.before.filter((x) => !keep.includes(x)).sort());
        if (count) {
          const played = f.state.players[f.owner].characters.find(
            (c) => c?.cardId === "search-hit"
          )!;
          expect(played.instanceId).not.toBe(chosen);
          expect(played).toMatchObject({
            zone: "CHARACTER",
            state: "ACTIVE",
            owner: f.owner,
            controller: f.owner,
          });
        }
        if (id === "OP01-116")
          expect(
            f.state.players[f.owner].deck
              .slice(-ordered.length)
              .map((c) => c.instanceId)
          ).toEqual(ordered);
      }
    );
    it(`${id} rejects keeping two and permits a later valid zero response`, () => {
      const f = searchFixture(id);
      const p = f.state.pendingPrompt!;
      const o = p.options;
      if (o.promptType !== "ARRANGE_TOP_CARDS") throw new Error("search");
      const before = JSON.stringify(f.state);
      const chosen = o.validTargets!.slice(0, 2);
      const invalid: GameAction = {
        type: "ARRANGE_TOP_CARDS",
        keptCardInstanceId: chosen[0],
        keptCardInstanceIds: chosen,
        orderedInstanceIds: o.cards
          .filter((c) => !chosen.includes(c.instanceId))
          .map((c) => c.instanceId),
        destination: "bottom",
      };
      const r = new SessionCoordinator().routePromptResponse(
        f.state,
        p.respondingPlayer,
        invalid
      );
      expect(r.kind).toBe("reject");
      expect(JSON.stringify(f.state)).toBe(before);
      const wrong = {
        ...invalid,
        keptCardInstanceId: "deck-2",
        keptCardInstanceIds: ["deck-2"],
        orderedInstanceIds: o.cards
          .filter((c) => c.instanceId !== "deck-2")
          .map((c) => c.instanceId),
      };
      expect(
        new SessionCoordinator().routePromptResponse(
          f.state,
          p.respondingPlayer,
          wrong
        ).kind
      ).toBe("reject");
      expect(JSON.stringify(f.state)).toBe(before);
      f.act({
        type: "ARRANGE_TOP_CARDS",
        keptCardInstanceId: "",
        keptCardInstanceIds: [],
        orderedInstanceIds: o.cards.map((c) => c.instanceId),
        destination: "bottom",
      });
      expect(f.state.pendingPrompt).toBeNull();
    });
  }
});

describe("OPT805 Crocodile authored Event pipeline", () => {
  it.each([
    [3, true, true],
    [4, true, true],
    [5, true, false],
    [3, false, false],
  ] as const)(
    "post-Event hand%i attachedDON%s draws%s",
    (remaining, don, draw) => {
      const f = fixture();
      const croc = f.put("OP01-062", 0, "LEADER");
      if (don) attach(f, croc);
      f.state.players[0].hand = f.state.players[0].hand.slice(0, remaining);
      const oldDeck = f.state.players[0].deck.length;
      f.play("OP01-116");
      if (draw) {
        expect(f.state.pendingPrompt?.options.promptType).toBe(
          "OPTIONAL_EFFECT"
        );
        f.choose("accept");
      }
      expect(f.state.pendingPrompt).toBeNull();
      expect(f.state.players[0].hand).toHaveLength(remaining + (draw ? 1 : 0));
      expect(f.state.players[0].deck).toHaveLength(oldDeck - (draw ? 1 : 0));
    }
  );
  it("Crocodile checks hand after Event draw resolves (FAQ ST04-014)", () => {
    const f = fixture();
    const croc = f.put("OP01-062", 0, "LEADER");
    attach(f, croc);
    f.state.players[0].hand = f.state.players[0].hand.slice(0, 4);
    f.play("ST04-014");
    if (f.state.pendingPrompt?.options.promptType === "PLAYER_CHOICE")
      f.choose("0");
    expect(f.state.players[0].hand).toHaveLength(5);
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.state.turn.oncePerTurnUsed["OP01-062_event_draw"]).toBeUndefined();
  });
  it("declining Crocodile preserves its draw slot; accepting consumes it", () => {
    const f = fixture();
    const croc = f.put("OP01-062", 0, "LEADER");
    attach(f, croc);
    f.state.players[0].hand = f.state.players[0].hand.slice(0, 2);
    f.play("OP01-116");
    expect(f.state.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
    f.choose("skip");
    f.play("OP01-116");
    expect(f.state.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
    f.choose("accept");
    f.play("OP01-116");
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.state.players[0].hand).toHaveLength(3);
  });
  it("Crocodile trash-event matching is SELF and requires attached DON (supplemental unreachable Reiju combo)", () => {
    const f = fixture();
    const croc = f.put("OP01-062", 0, "LEADER");
    attach(f, croc);
    const event = {
      type: "EVENT_MAIN_RESOLVED_FROM_TRASH" as const,
      playerIndex: 0 as const,
      timestamp: 1,
      payload: { cardInstanceId: "event-in-trash", cardId: "OP01-116" },
    };
    expect(matchTriggersForEvent(f.state, event, f.db)).toHaveLength(1);
    expect(
      matchTriggersForEvent(
        f.state,
        { ...event, type: "EVENT_TRIGGER_RESOLVED" },
        f.db
      )
    ).toHaveLength(0);
    expect(
      matchTriggersForEvent(f.state, { ...event, playerIndex: 1 }, f.db)
    ).toHaveLength(0);
    croc.attachedDon = [];
    expect(matchTriggersForEvent(f.state, event, f.db)).toHaveLength(0);
  });
});

describe("OPT805 Magellan verified broad FAQ behavior", () => {
  it("own DON return adds1000 only once across two Sheep's Horn activations", () => {
    const f = fixture();
    const magellan = f.put("OP02-071", 0, "LEADER");
    for (let i = 0; i < 2; i++) {
      f.play("OP01-117");
      f.choose("accept");
      if (f.state.pendingPrompt?.options.promptType === "SELECT_TARGET")
        f.select([]);
      expect(f.state.pendingPrompt).toBeNull();
    }
    expect(f.state.players[0].donCostArea).toHaveLength(6);
    expect(
      getEffectivePower(
        f.state.players[0].leader,
        f.db.get(magellan.cardId)!,
        f.state,
        f.db
      )
    ).toBe(6000);
  });
  it.each([0, 1] as const)(
    "opponent Ulti-Mortar two-DON return with Magellan player%i",
    (owner) => {
      const f = fixture();
      const magellan = f.put("OP02-071", owner, "LEADER");
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
      expect(f.state.players[1].donCostArea).toHaveLength(4);
      expect(
        getEffectivePower(
          f.state.players[owner].leader,
          f.db.get(magellan.cardId)!,
          f.state,
          f.db
        )
      ).toBe(owner === 0 ? 6000 : 5000);
    }
  );
});

describe("OPT805 authored trash-Event publication", () => {
  it("Reiju with Sanji publishes EVENT_MAIN_RESOLVED_FROM_TRASH after SMILE resolves", () => {
    const f = fixture();
    const sanji = getEffectSchema("OP12-001")!;
    f.db.set("OP12-001", {
      ...CARDS.LEADER,
      id: "OP12-001",
      name: "Sanji",
      effectSchema: sanji,
    });
    f.put("OP12-001", 0, "LEADER");
    const event = f.put("OP01-116", 0, "TRASH");
    f.play("EB03-031");
    if (f.state.pendingPrompt?.options.promptType === "OPTIONAL_EFFECT")
      f.choose("accept");
    expect(f.state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    f.select([event.instanceId]);
    expect(f.state.pendingPrompt).toBeNull();
    expect(
      f.state.eventLog.some(
        (e) =>
          e.type === "EVENT_MAIN_RESOLVED_FROM_TRASH" && e.playerIndex === 0
      )
    ).toBe(true);
    expect(f.state.players[0].trash.some((c) => c.cardId === "OP01-116")).toBe(
      true
    );
  });
});

describe("OPT805 Event activation lifecycle regressions", () => {
  it("Counter Event Ulti-Mortar must offer Crocodile after its draw", () => {
    const f = fixture();
    const croc = f.put("OP01-062", 1, "LEADER");
    attach(f, croc);
    f.state.players[1].hand = f.state.players[1].hand.slice(0, 2);
    const attacker = f.put(CARDS.VANILLA.id, 0);
    const event = f.put("OP01-118", 1, "HAND");
    f.act({
      type: "DECLARE_ATTACK",
      attackerInstanceId: attacker.instanceId,
      targetInstanceId: croc.instanceId,
    });
    f.act({ type: "PASS" }, 1);
    f.act(
      {
        type: "USE_COUNTER_EVENT",
        cardInstanceId: event.instanceId,
        counterTargetInstanceId: croc.instanceId,
      },
      1
    );
    expect(f.state.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
    f.choose("accept"); // Event DON -2 cost, not Crocodile
    if (f.state.pendingPrompt?.options.promptType === "SELECT_TARGET")
      f.select([]);
    expect(f.state.players[1].hand).toHaveLength(3); // Event draw resolved
    expect(f.state.players[1].leader.attachedDon).toHaveLength(1);
    expect(f.state.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
    f.choose("accept");
    expect(f.state.players[1].hand).toHaveLength(4);
  });
  it.each([0, 1])(
    "SMILE real search pause selecting %i must retain Crocodile activation",
    async (count) => {
      const f = fixture();
      const croc = f.put("OP01-062", 0, "LEADER");
      attach(f, croc);
      f.state.players[0].hand = f.state.players[0].hand.slice(0, 2);
      f.db.set("review-smile", {
        ...CARDS.VANILLA,
        id: "review-smile",
        name: "review SMILE",
        types: ["SMILE"],
        cost: 3,
        effectSchema: null,
      });
      f.state.players[0].deck[0] = {
        ...f.state.players[0].deck[0],
        cardId: "review-smile",
      };
      f.play("OP01-116");
      expect(
        f.state.pendingEventActivationEvents?.some(
          (e) => e.type === "EVENT_ACTIVATED_FROM_HAND"
        )
      ).toBe(true);
      expect(
        f.state.eventLog.findIndex(
          (e) => e.type === "CARD_PLAYED" && e.payload.cardId === "OP01-116"
        )
      ).toBeLessThan(
        f.state.eventLog.findIndex(
          (e) => e.type === "EVENT_ACTIVATED_FROM_HAND"
        )
      );
      expect(filterStateForPlayer(f.state, 0)).not.toHaveProperty(
        "pendingEventActivationEvents"
      );
      expect(filterStateForPlayer(f.state, 1)).not.toHaveProperty(
        "pendingEventActivationEvents"
      );
      expect(visibleStateForSpectator(f.state, f.db)).not.toHaveProperty(
        "pendingEventActivationEvents"
      );
      await f.reload();
      const o = f.state.pendingPrompt!.options;
      expect(o.promptType).toBe("ARRANGE_TOP_CARDS");
      if (o.promptType !== "ARRANGE_TOP_CARDS") throw Error("search");
      const keep = count ? [o.validTargets![0]] : [];
      f.act({
        type: "ARRANGE_TOP_CARDS",
        keptCardInstanceId: keep[0] ?? "",
        keptCardInstanceIds: keep,
        orderedInstanceIds: o.cards
          .filter((c) => !keep.includes(c.instanceId))
          .map((c) => c.instanceId),
        destination: "bottom",
      });
      expect(
        f.state.players[0].characters.filter(
          (c) => c?.cardId === "review-smile"
        )
      ).toHaveLength(count);
      if (count)
        expect(
          f.state.eventLog.findIndex(
            (e) => e.type === "EVENT_ACTIVATED_FROM_HAND"
          )
        ).toBeLessThan(
          f.state.eventLog.findIndex(
            (e) =>
              e.type === "CARD_PLAYED" && e.payload.cardId === "review-smile"
          )
        );
      expect(f.state.players[0].hand).toHaveLength(2);
      expect(f.state.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
      expect(f.state.pendingEventActivationEvents).toBeUndefined();
      await f.reload();
      f.choose("accept");
      expect(f.state.players[0].hand).toHaveLength(3);
      expect(f.state.pendingPrompt).toBeNull();
      expect(
        f.state.eventLog.filter((e) => e.type === "EVENT_ACTIVATED_FROM_HAND")
      ).toHaveLength(1);
      expect(
        f.state.eventLog.filter(
          (e) => e.type === "CARD_PLAYED" && e.payload.cardId === "OP01-116"
        )
      ).toHaveLength(1);
      expect(
        f.state.turn.actionsPerformedThisTurn.filter(
          (a) => a.actionType === "PLAY_CARD"
        )
      ).toHaveLength(1);
      await f.reload();
      expect(f.state.pendingEventActivationEvents).toBeUndefined();
    }
  );
});

function counterFixture(hand: number, usopp = false) {
  const f = fixture();
  const croc = f.put("OP01-062", 1, "LEADER");
  attach(f, croc);
  if (usopp) attach(f, f.put("OP01-004", 0));
  f.state.players[1].hand = f.state.players[1].hand.slice(0, hand);
  const attacker = f.put(CARDS.VANILLA.id, 0);
  const event = f.put("OP01-118", 1, "HAND");
  f.act({
    type: "DECLARE_ATTACK",
    attackerInstanceId: attacker.instanceId,
    targetInstanceId: croc.instanceId,
  });
  f.act({ type: "PASS" }, 1);
  return { f, event, croc };
}
describe("OPT805 persisted Counter Event ordering", () => {
  it.each([2, 4])(
    "resumes all Event prompts before checking Crocodile with initial hand %i",
    async (hand) => {
      const { f, event, croc } = counterFixture(hand, true);
      const attackerHand = f.state.players[0].hand.length;
      f.act(
        {
          type: "USE_COUNTER_EVENT",
          cardInstanceId: event.instanceId,
          counterTargetInstanceId: croc.instanceId,
        },
        1
      );
      expect(f.state.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
      expect(f.state.players[0].hand).toHaveLength(attackerHand); // Usopp waits for the Counter.
      await f.reload();
      f.choose("accept");
      expect(f.state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
      expect(f.state.players[0].hand).toHaveLength(attackerHand);
      await f.reload();
      f.select([]); // Event then draws one; active-player Usopp must precede Crocodile.
      expect(f.state.players[1].hand).toHaveLength(hand + 1);
      expect(f.state.players[0].hand).toHaveLength(attackerHand + 1);
      if (hand === 2) {
        expect(f.state.pendingPrompt?.options.promptType).toBe(
          "OPTIONAL_EFFECT"
        );
        expect(f.state.pendingEventActivationEvents).toBeUndefined();
        await f.reload();
        f.choose("accept");
        expect(f.state.players[1].hand).toHaveLength(4);
      }
      expect(f.state.pendingPrompt).toBeNull();
      expect(
        f.state.eventLog.filter((e) => e.type === "COUNTER_USED")
      ).toHaveLength(1);
      expect(
        f.state.eventLog.findIndex((e) => e.type === "COUNTER_USED")
      ).toBeLessThan(
        f.state.eventLog.findIndex(
          (e) => e.type === "EVENT_ACTIVATED_FROM_HAND"
        )
      );
      expect(
        f.state.eventLog.findIndex(
          (e) => e.type === "EVENT_ACTIVATED_FROM_HAND"
        )
      ).toBeLessThan(
        f.state.eventLog.findIndex((e) => e.type === "CARD_DRAWN")
      );
      expect(
        f.state.eventLog.filter((e) => e.type === "EVENT_ACTIVATED_FROM_HAND")
      ).toHaveLength(1);
      expect(
        f.state.turn.actionsPerformedThisTurn.filter(
          (a) => a.actionType === "USE_COUNTER_EVENT"
        )
      ).toHaveLength(1);
      await f.reload();
      expect(f.state.pendingEventActivationEvents).toBeUndefined();
    }
  );
  it("declining the Event's optional cost still completes activation without its draw", async () => {
    const { f, event, croc } = counterFixture(2);
    f.act(
      {
        type: "USE_COUNTER_EVENT",
        cardInstanceId: event.instanceId,
        counterTargetInstanceId: croc.instanceId,
      },
      1
    );
    await f.reload();
    f.choose("skip");
    expect(f.state.players[1].hand).toHaveLength(2);
    expect(f.state.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
    f.choose("skip");
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.state.players[1].hand).toHaveLength(2);
    expect(f.state.pendingEventActivationEvents).toBeUndefined();
  });
  it("Character counters do not create an Event activation", () => {
    const { f } = counterFixture(2);
    const card = f.put(CARDS.COUNTER.id, 1, "HAND");
    f.act(
      {
        type: "USE_COUNTER",
        cardInstanceId: card.instanceId,
        counterTargetInstanceId: f.state.players[1].leader.instanceId,
      },
      1
    );
    expect(f.state.pendingPrompt).toBeNull();
    expect(
      f.state.eventLog.some((e) => e.type === "EVENT_ACTIVATED_FROM_HAND")
    ).toBe(false);
    expect(f.state.pendingEventActivationEvents).toBeUndefined();
  });
});

describe("OPT805 activation barrier edge cases", () => {
  it("ends a pending Counter activation on concede without firing its watchers", async () => {
    const { f, event, croc } = counterFixture(2);
    f.act(
      {
        type: "USE_COUNTER_EVENT",
        cardInstanceId: event.instanceId,
        counterTargetInstanceId: croc.instanceId,
      },
      1
    );
    await f.reload();
    const r = runPipeline(f.state, { type: "CONCEDE" }, f.db, 1);
    expect(r.valid).toBe(true);
    expect(r.gameOver).toBeDefined();
    expect(r.state.pendingEventActivationEvents).toBeUndefined();
    expect(
      r.state.eventLog.filter((e) => e.type === "EVENT_ACTIVATED_FROM_HAND")
    ).toHaveLength(1);
    expect(r.state.players[1].hand).toHaveLength(2);
    await activationRoundTrip(r.state, f.db);
  });
  it("treats an Event without an authored Counter block as an activation", () => {
    const { f, event, croc } = counterFixture(2);
    f.db.set(event.cardId, { ...f.db.get(event.cardId)!, effectSchema: null });
    f.act(
      {
        type: "USE_COUNTER_EVENT",
        cardInstanceId: event.instanceId,
        counterTargetInstanceId: croc.instanceId,
      },
      1
    );
    expect(f.state.players[1].hand).toHaveLength(2);
    expect(f.state.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
    f.choose("accept");
    expect(f.state.players[1].hand).toHaveLength(3);
    expect(f.state.pendingPrompt).toBeNull();
  });
  it("retains same-player watcher ordering across reload after the Counter finishes", async () => {
    const { f, event, croc } = counterFixture(2, true);
    f.put("OP11-012", 0);
    const hand = f.state.players[0].hand.length;
    f.act(
      {
        type: "USE_COUNTER_EVENT",
        cardInstanceId: event.instanceId,
        counterTargetInstanceId: croc.instanceId,
      },
      1
    );
    f.choose("accept");
    f.select([]);
    expect(f.state.players[1].hand).toHaveLength(3);
    expect(f.state.pendingEventActivationEvents).toBeUndefined();
    expect(f.state.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");
    let selections = 0;
    while (f.state.pendingPrompt?.options.promptType === "PLAYER_CHOICE") {
      await f.reload();
      const opts = f.state.pendingPrompt!.options;
      if (opts.promptType !== "PLAYER_CHOICE") throw Error("ordering");
      f.choose(opts.choices.find((c) => !c.disabled)!.id);
      expect(++selections).toBeLessThan(4);
    }
    expect(f.state.players[0].hand).toHaveLength(hand + 1);
    expect(f.state.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
    await f.reload();
    f.choose("accept");
    expect(f.state.players[1].hand).toHaveLength(4);
    expect(
      f.state.eventLog.filter((e) => e.type === "EVENT_ACTIVATED_FROM_HAND")
    ).toHaveLength(1);
  });
  it("accepts old snapshots and rejects malformed new activation queues/payloads", () => {
    const f = fixture();
    const base = {
      formatVersion: 1,
      state: f.state,
      cardDb: Object.fromEntries(f.db),
      undoHistory: [],
    };
    expect(
      parseStoredSession(JSON.parse(JSON.stringify(base))).state
        .pendingEventActivationEvents
    ).toBeUndefined();
    for (const queue of [
      "invalid",
      [{ type: "NOT_AN_EVENT" }],
      [
        {
          type: "EVENT_ACTIVATED_FROM_HAND",
          playerIndex: 2,
          payload: { cardInstanceId: "x" },
        },
      ],
      [
        {
          type: "EVENT_ACTIVATED_FROM_HAND",
          payload: { cardInstanceId: "x", ignored: true },
        },
      ],
      [
        {
          type: "EVENT_ACTIVATED_FROM_HAND",
          payload: { cardInstanceId: "x" },
          ignored: true,
        },
      ],
      [
        {
          type: "EVENT_ACTIVATED_FROM_HAND",
          payload: { cardInstanceId: "x" },
          propagation: { triggerScanned: false },
        },
      ],
    ])
      expect(() =>
        parseStoredSession(
          JSON.parse(
            JSON.stringify({
              ...base,
              state: { ...f.state, pendingEventActivationEvents: queue },
            })
          )
        )
      ).toThrow();
  });
});

it("Crocodile can decline a Counter activation, accept the next, then draws only once", async () => {
  const { f, event, croc } = counterFixture(2);
  for (let index = 0; index < 3; index++) {
    const current =
      index === 0 ? event : f.put("OP01-118", 1, "HAND", String(index));
    f.act(
      {
        type: "USE_COUNTER_EVENT",
        cardInstanceId: current.instanceId,
        counterTargetInstanceId: croc.instanceId,
      },
      1
    );
    f.choose("skip"); // Decline the Counter effect's DON-minus cost.
    if (index < 2) {
      expect(f.state.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
      await f.reload();
      f.choose(index === 0 ? "skip" : "accept");
    }
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.state.pendingEventActivationEvents).toBeUndefined();
  }
  expect(f.state.players[1].hand).toHaveLength(3);
  expect(
    f.state.eventLog.filter((e) => e.type === "EVENT_ACTIVATED_FROM_HAND")
  ).toHaveLength(3);
  expect(
    f.state.turn.actionsPerformedThisTurn.filter(
      (a) => a.actionType === "USE_COUNTER_EVENT"
    )
  ).toHaveLength(3);
});

it("persists authored Punk Gibson Counter rest and Mr.3's trigger across the integrated activation boundary", async () => {
  const f = fixture();
  // Printed metadata: docs/cards/{OP-01,PRB-02,ST-02,ST-03}.md;
  // Official PRB02-009 metadata (cost 2, power/counter 1000):
  // https://en.onepiece-cardgame.com/cardlist/?series=569302
  // The blue Mr.3 belongs to the blue Leader; the green Counter belongs to Kid.
  for (const [id, color] of [
    ["ST03-001", "Blue"],
    ["ST02-001", "Green"],
  ] as const) {
    const schema = getEffectSchema(id)!;
    f.db.set(id, {
      ...CARDS.LEADER,
      id,
      name: schema.card_name!,
      color: [color],
      effectSchema: schema,
    });
  }
  const punk = getEffectSchema("OP01-058")!;
  f.db.set("OP01-058", {
    ...CARDS.VANILLA,
    id: "OP01-058",
    name: "Punk Gibson",
    type: "Event",
    color: ["Green"],
    cost: 2,
    power: null,
    counter: null,
    types: ["Supernovas", "Kid Pirates"],
    effectText:
      "[Counter] Up to 1 of your Leader or Character cards gains +4000 power during this battle. Then, rest up to 1 of your opponent's Characters with a cost of 4 or less.",
    effectSchema: punk,
  });
  const mr3 = getEffectSchema("PRB02-009")!;
  f.db.set("PRB02-009", {
    ...CARDS.VANILLA,
    id: "PRB02-009",
    name: mr3.card_name!,
    color: ["Blue"],
    cost: 2,
    power: 1000,
    counter: 1000,
    attribute: ["Special"],
    types: ["Former Baroque Works", "Cross Guild"],
    effectText:
      "This effect can be activated when this Character is rested by your opponent's effect. You may trash this Character and draw 2 cards.\n[Blocker]",
    effectSchema: mr3,
  });
  const attacker = f.put("ST03-001", 0, "LEADER");
  const defender = f.put("ST02-001", 1, "LEADER");
  const host = f.put("PRB02-009", 0);
  const event = f.put("OP01-058", 1, "HAND");
  const handBefore = f.state.players[0].hand.length;
  f.act({
    type: "DECLARE_ATTACK",
    attackerInstanceId: attacker.instanceId,
    targetInstanceId: defender.instanceId,
  });
  f.act({ type: "PASS" }, 1);
  f.act(
    {
      type: "USE_COUNTER_EVENT",
      cardInstanceId: event.instanceId,
      counterTargetInstanceId: defender.instanceId,
    },
    1
  );
  expect(f.state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
  await f.reload();
  f.select([defender.instanceId]);
  await f.reload();
  f.select([host.instanceId]);
  expect(f.state.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
  expect(f.state.pendingPrompt?.respondingPlayer).toBe(0);
  expect(
    f.state.players[0].characters.some(
      (c) => c?.instanceId === host.instanceId && c.state === "RESTED"
    )
  ).toBe(true);
  expect(f.state.players[0].hand).toHaveLength(handBefore);
  await f.reload();
  f.choose("accept");
  expect(
    f.state.players[0].characters.some((c) => c?.cardId === "PRB02-009")
  ).toBe(false);
  expect(
    f.state.players[0].trash.filter((c) => c.cardId === "PRB02-009")
  ).toHaveLength(1);
  expect(f.state.players[0].hand).toHaveLength(handBefore + 2);
  expect(f.state.pendingPrompt).toBeNull();
  expect(f.state.effectStack).toHaveLength(0);
  expect(f.state.pendingEventActivationEvents).toBeUndefined();
  const restEvents = f.state.eventLog.filter(
    (e) =>
      e.type === "CARD_STATE_CHANGED" &&
      e.payload.targetInstanceId === host.instanceId
  );
  expect(restEvents).toHaveLength(1);
  expect(restEvents[0].payload).toMatchObject({
    newState: "RESTED",
    cause: "EFFECT",
    causingController: 1,
  });
  expect(
    f.state.eventLog.filter((e) => e.type === "COUNTER_USED")
  ).toHaveLength(1);
  expect(
    f.state.eventLog.filter((e) => e.type === "EVENT_ACTIVATED_FROM_HAND")
  ).toHaveLength(1);
  expect(
    f.state.eventLog.findIndex((e) => e.type === "EVENT_ACTIVATED_FROM_HAND")
  ).toBeLessThan(f.state.eventLog.indexOf(restEvents[0]));
  expect(
    f.state.turn.actionsPerformedThisTurn.filter(
      (a) => a.actionType === "USE_COUNTER_EVENT"
    )
  ).toHaveLength(1);
  await f.reload();
  expect(f.state.players[0].hand).toHaveLength(handBefore + 2);
  expect(f.state.pendingPrompt).toBeNull();
  expect(f.state.pendingEventActivationEvents).toBeUndefined();
});
