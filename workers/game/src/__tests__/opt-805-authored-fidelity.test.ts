import { describe, expect, it } from "vitest";
import type { CardData, CardInstance, GameAction } from "../types.js";
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
