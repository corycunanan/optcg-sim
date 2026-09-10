import { describe, expect, it } from "vitest";
import type { CardData, CardInstance, GameAction } from "../types.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import { runPipeline } from "../engine/pipeline.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { isCardNegated } from "../engine/modifiers.js";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
  padChars,
} from "./helpers.js";

// Canonical OP09/OP10 text and official corresponding FAQ.
// All effect behavior comes from the production registry, never a test-authored effect.
function fixture() {
  const db = createTestCardDb();
  let state = createBattleReadyState(db);
  state.players.forEach((p) => {
    p.characters = padChars([]);
  });
  let serial = 0;
  function data(id: string, overrides: Partial<CardData> = {}) {
    const schema = getEffectSchema(id);
    const value: CardData = {
      ...CARDS.VANILLA,
      id,
      name: schema?.card_name ?? id,
      effectSchema: schema ?? null,
      ...overrides,
    };
    db.set(id, value);
    return value;
  }
  function put(
    id: string,
    controller: 0 | 1,
    zone: CardInstance["zone"] = "CHARACTER"
  ) {
    const card: CardInstance = {
      cardId: id,
      instanceId: `${id}-${serial++}`,
      owner: controller,
      controller,
      zone,
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 1,
    };
    const p = state.players[controller];
    if (zone === "LEADER") p.leader = card;
    else if (zone === "STAGE") p.stage = card;
    else if (zone === "CHARACTER")
      p.characters[p.characters.findIndex((c) => !c)] = card;
    else if (zone === "HAND") p.hand.push(card);
    else if (zone === "TRASH") p.trash.push(card);
    else if (zone === "DECK") p.deck.push(card);
    if (["LEADER", "STAGE", "CHARACTER"].includes(zone))
      state = registerCardEnteredField(state, card, db.get(id)!);
    return card;
  }
  function act(
    action: GameAction,
    player = state.turn.activePlayerIndex,
    rejected = false
  ) {
    const result = runPipeline(state, action, db, player);
    expect(result.valid, result.error).toBe(!rejected);
    state = result.state;
  }
  function choice(action: GameAction, rejected = false) {
    const result = resumePromptLifecycle(state, action, db, {
      drainPregame: (s) => s,
      advanceStartOfTurn: (s) => s,
    });
    expect(
      result.responseRejected,
      JSON.stringify({ action, prompt: state.pendingPrompt })
    ).toBe(rejected);
    state = result.state;
  }
  function select(ids: string[], rejected = false) {
    choice({ type: "SELECT_TARGET", selectedInstanceIds: ids }, rejected);
  }
  function accept() {
    choice({ type: "PLAYER_CHOICE", choiceId: "accept" });
  }
  function targets() {
    const options = state.pendingPrompt?.options;
    expect(options?.promptType).toBe("SELECT_TARGET");
    if (options?.promptType !== "SELECT_TARGET")
      throw new Error(JSON.stringify(options));
    return options;
  }
  return {
    db,
    data,
    put,
    act,
    choice,
    select,
    accept,
    targets,
    get state() {
      return state;
    },
  };
}

function blackbeard() {
  const f = fixture();
  f.db.set(CARDS.LEADER.id, { ...CARDS.LEADER, types: ["Blackbeard Pirates"] });
  return f;
}
describe("OPT809 Teach selected Character", () => {
  it.each([true, false])(
    "lock chosen Character iff selected=%s",
    (selected) => {
      const f = blackbeard();
      f.data("OP09-093");
      const teach = f.put("OP09-093", 0);
      teach.turnPlayed = f.state.turn.number;
      const first = f.put(CARDS.VANILLA.id, 1),
        other = f.put(CARDS.VANILLA.id, 1);
      f.act({
        type: "ACTIVATE_EFFECT",
        cardInstanceId: teach.instanceId,
        effectId: "activate_negate_and_lock",
      });
      f.select([f.state.players[1].leader.instanceId]);
      f.select(selected ? [first.instanceId] : []);
      expect(isCardNegated(first, f.state, f.db)).toBe(selected);
      expect(isCardNegated(other, f.state, f.db)).toBe(false);
      expect(f.state.pendingPrompt).toBeNull();
      f.act({ type: "ADVANCE_PHASE" });
      // Turn entry advances automatically through refresh/draw/DON in the action pipeline.
      while (f.state.turn.phase !== "MAIN") f.act({ type: "ADVANCE_PHASE" });
      f.act(
        {
          type: "DECLARE_ATTACK",
          attackerInstanceId: first.instanceId,
          targetInstanceId: f.state.players[0].leader.instanceId,
        },
        1,
        selected
      );
      if (!selected) {
        f.act({ type: "PASS" }, 0);
        f.act({ type: "PASS" }, 0);
      }
      f.act(
        {
          type: "DECLARE_ATTACK",
          attackerInstanceId: other.instanceId,
          targetInstanceId: f.state.players[0].leader.instanceId,
        },
        1
      );
      f.act({ type: "PASS" }, 0);
      f.act({ type: "PASS" }, 0);
      f.act({ type: "ADVANCE_PHASE" });
      expect(
        f.state.prohibitions.some((p) =>
          p.appliesTo?.includes(first.instanceId)
        )
      ).toBe(false);
    }
  );
});
describe("OPT809 Black Hole selected cost", () => {
  it.each([4, 5, 6])(
    "selected cost%i with unrelated weak Character",
    (cost) => {
      const f = blackbeard();
      f.data("OP09-098", {
        type: "Event",
        effectText: "[Main]",
        cost: 4,
        power: null,
      });
      const event = f.put("OP09-098", 0, "HAND");
      f.data("selected", { cost });
      const selected = f.put("selected", 1);
      const unrelated = f.put(CARDS.VANILLA.id, 1);
      f.act({ type: "PLAY_CARD", cardInstanceId: event.instanceId });
      f.select([selected.instanceId]);
      expect(
        f.state.players[1].characters.some(
          (c) => c?.instanceId === selected.instanceId
        )
      ).toBe(cost > 4);
      expect(
        f.state.players[1].characters.some(
          (c) => c?.instanceId === unrelated.instanceId
        )
      ).toBe(true);
      expect(f.state.pendingPrompt).toBeNull();
    }
  );
  it("zero selection does not K.O. an unrelated Character", () => {
    const f = blackbeard();
    f.data("OP09-098", {
      type: "Event",
      effectText: "[Main]",
      cost: 4,
      power: null,
    });
    const event = f.put("OP09-098", 0, "HAND");
    const other = f.put(CARDS.VANILLA.id, 1);
    f.act({ type: "PLAY_CARD", cardInstanceId: event.instanceId });
    f.select([]);
    expect(f.state.pendingPrompt).toBeNull();
    expect(
      f.state.players[1].characters.some(
        (c) => c?.instanceId === other.instanceId
      )
    ).toBe(true);
  });
});
function lawFixture(
  type: CardData["type"] = "Character",
  cost = 5,
  traits = ["Supernovas"]
) {
  const f = fixture();
  f.data("OP10-022", { type: "Leader", cost: null });
  const law = f.put("OP10-022", 0, "LEADER");
  const don = f.state.players[0].donCostArea.shift()!;
  don.attachedTo = law.instanceId;
  law.attachedDon = [don];
  f.data("return", { cost: 5 });
  const returned = f.put("return", 0);
  f.data("revealed", { type, cost, types: traits });
  f.state.players[0].life[0].cardId = "revealed";
  return { f, law, returned };
}
describe("OPT809 Law reveal and inner may", () => {
  it.each(["accept", "decline"])(
    "eligible Life %s after paying return cost",
    (decision) => {
      const { f, law, returned } = lawFixture();
      const life = structuredClone(f.state.players[0].life);
      const don = f.state.players[0].donCostArea.length;
      f.act({
        type: "ACTIVATE_EFFECT",
        cardInstanceId: law.instanceId,
        effectId: "activate_reveal_life_play",
      });
      if (f.state.pendingPrompt?.options.promptType === "OPTIONAL_EFFECT")
        f.choice({ type: "PLAYER_CHOICE", choiceId: "activate" });
      f.select([returned.instanceId]);
      expect(f.state.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");
      f.choice({
        type: "PLAYER_CHOICE",
        choiceId: decision === "accept" ? "0" : "1",
      });
      expect(f.state.pendingPrompt).toBeNull();
      expect(f.state.players[0].hand.some((c) => c.cardId === "return")).toBe(
        true
      );
      expect(f.state.players[0].donCostArea).toHaveLength(don);
      if (decision === "decline") expect(f.state.players[0].life).toEqual(life);
      else {
        expect(f.state.players[0].life).toEqual(life.slice(1));
        const played = f.state.players[0].characters.find(
          (c) => c?.cardId === "revealed"
        )!;
        expect(played.instanceId).not.toBe(life[0].instanceId);
        expect(played.state).toBe("ACTIVE");
      }
    }
  );
  it("plays authored Killer from Life into a full board's vacated slot and resolves On Play", () => {
    const { f, law, returned } = lawFixture();
    for (let i = 0; i < 4; i++) f.put(CARDS.VANILLA.id, 0);
    f.data("ST02-005", { cost: 3, types: ["Supernovas", "Kid Pirates"] });
    f.state.players[0].life[0].cardId = "ST02-005";
    const opponent = f.put(CARDS.VANILLA.id, 1);
    opponent.state = "RESTED";
    f.act({
      type: "ACTIVATE_EFFECT",
      cardInstanceId: law.instanceId,
      effectId: "activate_reveal_life_play",
    });
    if (f.state.pendingPrompt?.options.promptType === "OPTIONAL_EFFECT")
      f.choice({ type: "PLAYER_CHOICE", choiceId: "activate" });
    f.select([returned.instanceId]);
    f.choice({ type: "PLAYER_CHOICE", choiceId: "0" });
    f.select([opponent.instanceId]);
    expect(f.state.players[0].characters.filter(Boolean)).toHaveLength(5);
    expect(
      f.state.players[0].characters.some((c) => c?.cardId === "ST02-005")
    ).toBe(true);
    expect(
      f.state.players[1].trash.some((c) => c.cardId === opponent.cardId)
    ).toBe(true);
    expect(f.state.pendingPrompt).toBeNull();
  });
  it.each(["no-don", "total-cost4"])(
    "Law cannot activate with %s",
    (reason) => {
      const { f, law } = lawFixture();
      if (reason === "no-don") law.attachedDon = [];
      else f.db.set("return", { ...f.db.get("return")!, cost: 4 });
      const life = structuredClone(f.state.players[0].life);
      f.act(
        {
          type: "ACTIVATE_EFFECT",
          cardInstanceId: law.instanceId,
          effectId: "activate_reveal_life_play",
        },
        0,
        true
      );
      expect(f.state.players[0].life).toEqual(life);
      expect(f.state.pendingPrompt).toBeNull();
    }
  );
  it.each([
    { type: "Character" as const, cost: 6, traits: ["Supernovas"] },
    { type: "Character" as const, cost: 5, traits: ["Navy"] },
    { type: "Event" as const, cost: 5, traits: ["Supernovas"] },
  ])(
    "does not offer ineligible Life $type/$cost/$traits",
    ({ type, cost, traits }) => {
      const { f, law, returned } = lawFixture(type, cost, traits);
      const life = structuredClone(f.state.players[0].life);
      f.act({
        type: "ACTIVATE_EFFECT",
        cardInstanceId: law.instanceId,
        effectId: "activate_reveal_life_play",
      });
      if (f.state.pendingPrompt?.options.promptType === "OPTIONAL_EFFECT")
        f.choice({ type: "PLAYER_CHOICE", choiceId: "activate" });
      f.select([returned.instanceId]);
      expect(f.state.pendingPrompt).toBeNull();
      expect(f.state.players[0].life).toEqual(life);
    }
  );
});
