import { describe, expect, it } from "vitest";
import type { CardData, CardInstance, GameAction } from "../types.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import { runPipeline } from "../engine/pipeline.js";
import { parseStoredSession } from "../session/persistence.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { getEffectivePower } from "../engine/modifiers.js";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
  padChars,
} from "./helpers.js";

// Canonical OP04/ST05/ST06 card text and corresponding official FAQ.
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
  function act(action: GameAction, player = state.turn.activePlayerIndex) {
    const result = runPipeline(state, action, db, player);
    expect(result.valid, result.error).toBe(true);
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
    persist() {
      state = parseStoredSession(JSON.parse(JSON.stringify({ state, cardDb: Object.fromEntries(db), mode: "PVP" }))).state;
    },
    get state() {
      return state;
    },
  };
}

describe("OPT-806 authored card pipeline", () => {
  it.each([
    ["Character", 6000, true],
    ["Character", 7000, true],
    ["Character", 5000, false],
    ["Event", 6000, false],
  ] as const)("Nami reveals %s power %i", (type, power, boosts) => {
    const f = fixture();
    f.data("OP04-011", { power: 5000 });
    const nami = f.put("OP04-011", 0);
    f.data("large", { power: 7000 });
    if (!boosts) f.put("large", 0);
    f.data("revealed", { type, power });
    f.state.players[0].deck[0].cardId = "revealed";
    const top = f.state.players[0].deck[0];
    const remaining = f.state.players[0].deck.slice(1).map((c) => c.instanceId);
    f.act({
      type: "DECLARE_ATTACK",
      attackerInstanceId: nami.instanceId,
      targetInstanceId: f.state.players[1].leader.instanceId,
    });
    expect(getEffectivePower(nami, f.db.get(nami.cardId)!, f.state, f.db)).toBe(
      boosts ? 8000 : 5000
    );
    expect(f.state.players[0].deck.at(-1)?.cardId).toBe(top.cardId);
    expect(
      f.state.players[0].deck.slice(0, -1).map((c) => c.instanceId)
    ).toEqual(remaining);
    expect(f.state.pendingPrompt).toBeNull();
  });
  it("Trueno selects one branch before Laboon's K.O. trigger raises trash to15", () => {
    const f = fixture();
    f.data("OP04-094", {
      type: "Event",
      cost: 4,
      power: null,
      effectText: "[Main]",
    });
    const event = f.put("OP04-094", 0, "HAND");
    for (let i = 0; i < 13; i++) f.put(CARDS.VANILLA.id, 0, "TRASH");
    f.data("EB01-047", { cost: 2 });
    f.put("EB01-047", 0);
    const first = f.put(CARDS.VANILLA.id, 1);
    f.data("cost6", { cost: 6 });
    const second = f.put("cost6", 1);
    const discard = f.put(CARDS.VANILLA.id, 0, "HAND");
    f.act({ type: "PLAY_CARD", cardInstanceId: event.instanceId });
    f.persist();
    f.select([first.instanceId]);
    f.persist();
    f.select([discard.instanceId]);
    f.persist();
    expect(f.state.players[0].trash).toHaveLength(15);
    expect(f.state.pendingPrompt).toBeNull();
    expect(
      f.state.players[1].characters.some(
        (c) => c?.instanceId === second.instanceId
      )
    ).toBe(true);
    expect(f.state.players[1].trash).toHaveLength(1);
  });
  it.each([13, 14, 15])("Trueno starts with %i trash cards", (count) => {
    const f = fixture();
    f.data("OP04-094", {
      type: "Event",
      power: null,
      cost: 4,
      effectText: "[Main]",
    });
    const event = f.put("OP04-094", 0, "HAND");
    for (let i = 0; i < count; i++) f.put(CARDS.VANILLA.id, 0, "TRASH");
    const targets = [4, 5, 6, 7].map((cost) => {
      f.data(`cost${cost}`, { cost });
      return f.put(`cost${cost}`, 1);
    });
    f.act({ type: "PLAY_CARD", cardInstanceId: event.instanceId });
    expect(f.targets().validTargets).toEqual(
      targets.slice(0, count >= 14 ? 3 : 1).map((c) => c.instanceId)
    );
    f.select([targets[3].instanceId], true);
    f.select([targets[count >= 14 ? 2 : 0].instanceId]);
    expect(f.state.players[1].trash.map((c) => c.cardId)).toContain(
      count >= 14 ? "cost6" : "cost4"
    );
    expect(f.state.players[0].trash).toHaveLength(count + 1);
    expect(f.state.pendingPrompt).toBeNull();
  });
  it.each([13, 14])("Trueno permits zero with %i trash", (count) => {
    const f = fixture();
    f.data("OP04-094", {
      type: "Event",
      cost: 4,
      power: null,
      effectText: "[Main]",
    });
    const event = f.put("OP04-094", 0, "HAND");
    for (let i = 0; i < count; i++) f.put(CARDS.VANILLA.id, 0, "TRASH");
    const target = f.put(CARDS.VANILLA.id, 1);
    f.act({ type: "PLAY_CARD", cardInstanceId: event.instanceId });
    f.select([]);
    expect(
      f.state.players[1].characters.some(
        (c) => c?.instanceId === target.instanceId
      )
    ).toBe(true);
    expect(f.state.players[1].trash).toHaveLength(0);
    expect(f.state.pendingPrompt).toBeNull();
  });
  it.each([13, 14])(
    "Trueno finishes without eligible targets at %i trash",
    (count) => {
      const f = fixture();
      f.data("OP04-094", {
        type: "Event",
        cost: 4,
        power: null,
        effectText: "[Main]",
      });
      const event = f.put("OP04-094", 0, "HAND");
      for (let i = 0; i < count; i++) f.put(CARDS.VANILLA.id, 0, "TRASH");
      f.data("cost7", { cost: 7 });
      const target = f.put("cost7", 1);
      f.act({ type: "PLAY_CARD", cardInstanceId: event.instanceId });
      expect(f.state.pendingPrompt).toBeNull();
      expect(
        f.state.players[1].characters.some(
          (c) => c?.instanceId === target.instanceId
        )
      ).toBe(true);
    }
  );
  it.each(["character", "leader", "zero"])(
    "Union Armada chooses %s",
    (kind) => {
      const f = fixture();
      f.data("ST05-017", {
        type: "Event",
        power: null,
        cost: 2,
        effectText: "[Counter]",
      });
      const event = f.put("ST05-017", 1, "HAND");
      f.data("film", { types: ["FILM"], power: 5000 });
      const film = f.put("film", 1);
      film.state = "RESTED";
      const other = f.put("film", 1);
      f.db.set(CARDS.LEADER.id, { ...CARDS.LEADER, types: ["FILM"] });
      f.data("attacker", { power: 12000 });
      const attacker = f.put("attacker", 0);
      f.act({
        type: "DECLARE_ATTACK",
        attackerInstanceId: attacker.instanceId,
        targetInstanceId: film.instanceId,
      });
      f.act({ type: "PASS" }, 1);
      f.act(
        {
          type: "USE_COUNTER_EVENT",
          cardInstanceId: event.instanceId,
          counterTargetInstanceId: film.instanceId,
        },
        1
      );
      const id =
        kind === "leader"
          ? f.state.players[1].leader.instanceId
          : film.instanceId;
      f.select(kind === "zero" ? [] : [id]);
      expect(
        f.state.prohibitions.some((p) =>
          p.appliesTo?.includes(other.instanceId)
        )
      ).toBe(false);
      expect(
        f.state.prohibitions.some(
          (p) =>
            p.prohibitionType === "CANNOT_BE_KO" && p.appliesTo?.includes(id)
        )
      ).toBe(kind === "character");
      if (kind !== "zero") {
        const card = kind === "leader" ? f.state.players[1].leader : film;
        expect(
          getEffectivePower(card, f.db.get(card.cardId)!, f.state, f.db)
        ).toBe(9000);
      }
      f.act({ type: "PASS" }, 1);
      expect(
        f.state.players[1].characters.some(
          (c) => c?.instanceId === film.instanceId
        )
      ).toBe(kind === "character");
      if (kind === "character") {
        expect(
          getEffectivePower(film, f.db.get(film.cardId)!, f.state, f.db)
        ).toBe(5000);
        f.act({ type: "ADVANCE_PHASE" });
        expect(
          f.state.prohibitions.some((p) =>
            p.appliesTo?.includes(film.instanceId)
          )
        ).toBe(false);
      }
      expect(f.state.pendingPrompt).toBeNull();
    }
  );
  it.each([0, 1] as const)(
    "Smoker survives player %i Kaido effect",
    (owner) => {
      const f = fixture();
      f.data("ST06-004", { power: 5000 });
      const smoker = f.put("ST06-004", owner);
      f.data("OP01-094", { cost: 1 });
      const kaido = f.put("OP01-094", 0, "HAND");
      f.db.set(CARDS.LEADER.id, {
        ...CARDS.LEADER,
        types: ["Animal Kingdom Pirates"],
      });
      const bystander = f.put(CARDS.VANILLA.id, owner);
      f.act({ type: "PLAY_CARD", cardInstanceId: kaido.instanceId });
      f.choice({ type: "PLAYER_CHOICE", choiceId: "activate" });
      if (f.state.pendingPrompt?.options.promptType === "SELECT_TARGET")
        f.select(
          f.state.players[0].donCostArea.slice(0, 6).map((d) => d.instanceId)
        );
      expect(f.state.pendingPrompt).toBeNull();
      expect(
        f.state.players[owner].characters.some(
          (c) => c?.instanceId === smoker.instanceId
        )
      ).toBe(true);
      expect(
        f.state.players[owner].trash.some((c) => c.cardId === bystander.cardId)
      ).toBe(true);
    }
  );
  it("Smoker can still be K.O.'d in battle", () => {
    const f = fixture();
    f.data("ST06-004", { power: 5000 });
    const smoker = f.put("ST06-004", 1);
    smoker.state = "RESTED";
    f.data("attacker", { power: 6000 });
    const attacker = f.put("attacker", 0);
    f.act({
      type: "DECLARE_ATTACK",
      attackerInstanceId: attacker.instanceId,
      targetInstanceId: smoker.instanceId,
    });
    f.act({ type: "PASS" }, 1);
    f.act({ type: "PASS" }, 1);
    expect(
      f.state.players[1].trash.some((c) => c.cardId === smoker.cardId)
    ).toBe(true);
  });
});
