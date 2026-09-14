import { describe, expect, it } from "vitest";
import type { CardData, GameState, LifeCard } from "../types.js";
import { runPipeline } from "../engine/pipeline.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { CARDS, createBattleReadyState, createTestCardDb } from "./helpers.js";

// ST13 FAQ: face-up Life goes to deck bottom and cannot activate Trigger.
// Rules 7-1-4-1-1-2/3: process each damage separately, preserving face-down choices.
function setup(faces: LifeCard["face"][], owner: 0 | 1 = 1, luffy = true) {
  const db = createTestCardDb();
  db.set("ST13-003", {
    ...CARDS.LEADER,
    id: "ST13-003",
    effectSchema: getEffectSchema("ST13-003")!,
  });
  db.set(CARDS.TRIGGER.id, {
    ...CARDS.TRIGGER,
    effectSchema: {
      effects: [
        {
          id: "draw",
          category: "auto",
          trigger: { keyword: "TRIGGER" },
          actions: [{ type: "DRAW", params: { amount: 1 } }],
        },
      ],
    },
  });
  const state = createBattleReadyState(db);
  if (luffy) state.players[owner].leader.cardId = "ST13-003";
  state.players[owner].life = faces.map((face, i) => ({
    instanceId: `life-${i}`,
    cardId: CARDS.TRIGGER.id,
    face,
  }));
  return { state, db };
}

function battle(state: GameState, db: Map<string, CardData>) {
  let r = runPipeline(
    state,
    {
      type: "DECLARE_ATTACK",
      attackerInstanceId: state.players[0].leader.instanceId,
      targetInstanceId: state.players[1].leader.instanceId,
    },
    db,
    0
  );
  expect(r.valid).toBe(true);
  r = runPipeline(r.state, { type: "PASS" }, db, 0);
  expect(r.valid).toBe(true);
  r = runPipeline(r.state, { type: "PASS" }, db, 0);
  expect(r.valid).toBe(true);
  return r;
}

function damage(
  state: GameState,
  db: Map<string, CardData>,
  type: "DEAL_DAMAGE" | "SELF_TAKE_DAMAGE",
  amount: number
) {
  const source = state.players[0].leader;
  const data = db.get(source.cardId)!;
  db.set(source.cardId, {
    ...data,
    effectSchema: {
      ...data.effectSchema,
      effects: [
        ...(data.effectSchema?.effects ?? []),
        {
          id: "damage",
          category: "activate",
          trigger: { keyword: "ACTIVATE_MAIN" },
          actions: [{ type, params: { amount } }],
        },
      ],
    },
  });
  const r = runPipeline(
    state,
    {
      type: "ACTIVATE_EFFECT",
      cardInstanceId: source.instanceId,
      effectId: "damage",
    },
    db,
    0
  );
  expect(r.valid).toBe(true);
  return r;
}

function assertRedirect(
  state: GameState,
  before: GameState,
  owner: 0 | 1,
  count = 1
) {
  const player = state.players[owner];
  expect(player.hand).toEqual(before.players[owner].hand);
  expect(player.deck.slice(0, -count)).toEqual(before.players[owner].deck);
  for (const card of player.deck.slice(-count)) {
    expect(card).toMatchObject({
      cardId: CARDS.TRIGGER.id,
      zone: "DECK",
      owner,
      controller: owner,
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: null,
    });
    expect(card.instanceId).not.toMatch(/^life-/);
  }
  const removals = state.eventLog.filter(
    (event) => event.type === "CARD_REMOVED_FROM_LIFE"
  );
  expect(removals.map((event) => event.payload.cardInstanceId)).toEqual(
    before.players[owner].life.slice(0, count).map((card) => card.instanceId)
  );
  expect(removals.map((event) => event.payload.newCardInstanceId)).toEqual(
    player.deck.slice(-count).map((card) => card.instanceId)
  );
  expect(state.turn.pendingTriggerFromEffect ?? null).toBeNull();
  expect(state.turn.battle?.pendingTriggerLifeCard ?? null).toBeNull();
}

describe("OPT-791 ST13-003 damage Life destination", () => {
  it("redirects face-up battle damage before offering Trigger, with a fresh identity and removal event", () => {
    const { state, db } = setup(["UP"]);
    const r = battle(state, db);
    assertRedirect(r.state, state, 1);
    expect(r.state.players[1].life).toHaveLength(0);
    expect(
      r.state.eventLog.some((e) => e.type === "CARD_REMOVED_FROM_LIFE")
    ).toBe(true);
    expect(
      r.state.eventLog.some(
        (e) =>
          e.type === "CARD_ADDED_TO_HAND_FROM_LIFE" ||
          e.type === "TRIGGER_ACTIVATED"
      )
    ).toBe(false);
  });

  it.each([true, false])(
    "preserves ordinary Trigger windows when face or Leader does not match (Luffy=%s)",
    (luffy) => {
      const { state, db } = setup([luffy ? "DOWN" : "UP"], 1, luffy);
      let r = battle(state, db);
      expect(r.state.turn.battle?.pendingTriggerLifeCard?.instanceId).toBe(
        "life-0"
      );
      r = runPipeline(
        r.state,
        { type: "REVEAL_TRIGGER", activate: false },
        db,
        1
      );
      expect(r.valid).toBe(true);
      expect(r.state.players[1].hand).toHaveLength(
        state.players[1].hand.length + 1
      );
      expect(r.state.players[1].deck).toEqual(state.players[1].deck);
    }
  );

  it.each(["DEAL_DAMAGE", "SELF_TAKE_DAMAGE"] as const)(
    "redirects multiple face-up Life through %s",
    (type) => {
      const owner = type === "SELF_TAKE_DAMAGE" ? 0 : 1;
      const { state, db } = setup(["UP", "UP"], owner);
      const r = damage(state, db, type, 2);
      assertRedirect(r.state, state, owner, 2);
      expect(r.state.players[owner].life).toHaveLength(0);
      expect(
        r.state.eventLog.filter((e) => e.type === "CARD_REMOVED_FROM_LIFE")
      ).toHaveLength(2);
    }
  );

  it("rechecks the next Life face after a declined effect-damage Trigger", () => {
    const { state, db } = setup(["DOWN", "UP"]);
    let r = damage(state, db, "DEAL_DAMAGE", 2);
    expect(r.state.turn.pendingTriggerFromEffect?.lifeCard.instanceId).toBe(
      "life-0"
    );
    r = runPipeline(
      r.state,
      { type: "REVEAL_TRIGGER", activate: false },
      db,
      1
    );
    expect(r.valid).toBe(true);
    expect(r.state.players[1].hand).toHaveLength(
      state.players[1].hand.length + 1
    );
    expect(r.state.players[1].deck).toHaveLength(
      state.players[1].deck.length + 1
    );
    expect(r.state.turn.pendingTriggerFromEffect ?? null).toBeNull();
    expect(r.state.players[1].life).toHaveLength(0);
  });
  it.each([false, true])(
    "continues Double Attack after a face-down Trigger (activate=%s)",
    (activate) => {
      const { state, db } = setup(["DOWN", "UP"]);
      const attacker = db.get(state.players[0].leader.cardId)!;
      db.set(attacker.id, {
        ...attacker,
        keywords: { ...attacker.keywords, doubleAttack: true },
      });
      let r = battle(state, db);
      expect(r.state.turn.battle?.pendingTriggerLifeCard?.instanceId).toBe(
        "life-0"
      );
      r = runPipeline(r.state, { type: "REVEAL_TRIGGER", activate }, db, 1);
      expect(r.valid).toBe(true);
      expect(r.state.players[1].life).toHaveLength(0);
      expect(r.state.players[1].deck.at(-1)?.cardId).toBe(CARDS.TRIGGER.id);
      expect(r.state.turn.battle).toBeNull();
      expect(
        r.state.eventLog.filter((e) => e.type === "CARD_REMOVED_FROM_LIFE")
      ).toHaveLength(2);
      expect(
        r.state.eventLog.filter((e) => e.type === "TRIGGER_ACTIVATED")
      ).toHaveLength(1);
    }
  );

  it("preserves Banish's trash destination for face-up Life", () => {
    const { state, db } = setup(["UP"]);
    const attacker = db.get(state.players[0].leader.cardId)!;
    db.set(attacker.id, {
      ...attacker,
      keywords: { ...attacker.keywords, banish: true },
    });
    const r = battle(state, db);
    expect(r.state.players[1].deck).toEqual(state.players[1].deck);
    expect(r.state.players[1].trash.at(0)?.cardId).toBe(CARDS.TRIGGER.id);
    expect(r.state.players[1].hand).toEqual(state.players[1].hand);
    expect(r.state.turn.battle).toBeNull();
  });

  it("preserves face-down self-damage's hand destination and no-Trigger behavior", () => {
    const { state, db } = setup(["DOWN"], 0);
    const r = damage(state, db, "SELF_TAKE_DAMAGE", 1);
    expect(r.state.players[0].hand).toHaveLength(
      state.players[0].hand.length + 1
    );
    expect(r.state.players[0].deck).toEqual(state.players[0].deck);
    expect(r.state.turn.pendingTriggerFromEffect ?? null).toBeNull();
  });
});
