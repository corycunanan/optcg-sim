/**
 * OPT-873 — a replacement whose substitute cannot be carried out is not
 * offered, and the original K.O. / removal proceeds.
 *
 * Rules §8-1-3-4-5: "If it is not possible to carry out the replacement effect
 * specified by 'instead', that replacement effect cannot be applied."
 *
 * Official FAQ rulings for the substitutes covered here:
 * - ST09-010 Ace / ST20-002 Cracker: with no Life cards, the Life-trash
 *   replacement cannot be used (docs/FAQs/qa_st-09.md, qa_st-15-20.md).
 * - OP11-001 Koby: with 2 or fewer cards in trash, the replacement cannot be
 *   used (docs/FAQs/qa_op11.md).
 * - OP07-042 Gecko Moria: if Moria is the only Character, the replacement
 *   cannot be used (docs/FAQs/qa_op07.md).
 *
 * Two runtime paths check substitutes: the battle K.O. (battle.ts →
 * checkReplacementForKO) and the effect K.O. / removal batch
 * (removal.ts → processBatchReplacements → scanReplacementsForBatch). Every
 * substitute type is exercised through the real pipeline with the production
 * authored schemas; the fixture only supplies card stats.
 */

import { describe, expect, it } from "vitest";
import type { CardData, CardInstance, GameAction } from "../types.js";
import { getEffectSchema, validateEffectSchema } from "../engine/schema-registry.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import { runPipeline } from "../engine/pipeline.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";

function fixture() {
  const db = createTestCardDb();
  let state = createBattleReadyState(db);
  state.players.forEach((p) => {
    p.characters = padChars([]);
    p.hand = [];
    p.trash = [];
  });
  let serial = 0;

  function data(id: string, overrides: Partial<CardData> = {}) {
    const schema = getEffectSchema(id);
    db.set(id, {
      ...CARDS.VANILLA,
      id,
      name: schema?.card_name ?? id,
      effectText: "",
      effectSchema: schema ?? null,
      ...overrides,
    });
  }

  function card(id: string, controller: 0 | 1, zone: CardInstance["zone"]): CardInstance {
    return {
      cardId: id,
      instanceId: `${id}-${controller}-${serial++}`,
      owner: controller,
      controller,
      zone,
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 1,
    };
  }

  function put(id: string, controller: 0 | 1, zone: CardInstance["zone"] = "CHARACTER") {
    if (!db.has(id)) data(id);
    const c = card(id, controller, zone);
    const p = state.players[controller];
    if (zone === "LEADER") p.leader = c;
    else if (zone === "CHARACTER") p.characters[p.characters.findIndex((x) => !x)] = c;
    else if (zone === "HAND") p.hand.push(c);
    else if (zone === "TRASH") p.trash.push(c);
    if (zone === "LEADER" || zone === "CHARACTER")
      state = registerCardEnteredField(state, c, db.get(id)!);
    return c;
  }

  function fill(controller: 0 | 1, zone: "HAND" | "TRASH", n: number) {
    return Array.from({ length: n }, () => put(CARDS.VANILLA.id, controller, zone));
  }

  function giveDon(player: 0 | 1, count: number) {
    state.players[player].donCostArea = Array.from({ length: count }, (_, i) => ({
      instanceId: `don-p${player}-x${i}`,
      state: "ACTIVE" as const,
      attachedTo: null,
    }));
  }

  function act(action: GameAction, player: 0 | 1 = state.turn.activePlayerIndex) {
    const r = runPipeline(state, action, db, player);
    expect(r.valid, r.error).toBe(true);
    state = r.state;
  }

  function respond(action: GameAction) {
    const r = resumePromptLifecycle(state, action, db, {
      drainPregame: (s) => s,
      advanceStartOfTurn: (s) => s,
    });
    expect(r.responseRejected, JSON.stringify({ action, prompt: state.pendingPrompt })).toBe(false);
    state = r.state;
  }
  const accept = () => respond({ type: "PLAYER_CHOICE", choiceId: "accept" });
  const select = (ids: string[]) => respond({ type: "SELECT_TARGET", selectedInstanceIds: ids });

  /** Player 1's Leader (5000) attacks the rested `target`; everyone passes. */
  function battle(target: CardInstance) {
    state.turn.activePlayerIndex = 1;
    state.players[0].characters.find((c) => c?.instanceId === target.instanceId)!.state = "RESTED";
    act({
      type: "DECLARE_ATTACK",
      attackerInstanceId: state.players[1].leader.instanceId,
      targetInstanceId: target.instanceId,
    });
    while (!state.pendingPrompt && state.turn.battle) act({ type: "PASS" });
  }

  /** Player 1 plays ST01-015 "[Main] K.O. up to 1 of your opponent's Characters with 6000 power or less." */
  function opponentEffectKO(target: CardInstance) {
    data("ST01-015", {
      type: "Event",
      cost: 4,
      power: null,
      counter: null,
      effectText: "[Main] K.O. up to 1 of your opponent's Characters with 6000 power or less.",
    });
    const event = put("ST01-015", 1, "HAND");
    state.turn.activePlayerIndex = 1;
    giveDon(1, 10);
    act({ type: "PLAY_CARD", cardInstanceId: event.instanceId });
    expect(state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    select([target.instanceId]);
  }

  const onField = (c: CardInstance) =>
    state.players[c.controller].characters.some((x) => x?.instanceId === c.instanceId);
  // Zone moves assign a fresh instanceId; each test card id is unique per player.
  const inTrash = (c: CardInstance) => state.players[c.owner].trash.some((x) => x.cardId === c.cardId);
  const promptType = () => state.pendingPrompt?.options.promptType;
  const replacementOffered = () => {
    const ctx = state.pendingPrompt?.resumeContext;
    return typeof ctx === "object" && ctx !== null && "type" in ctx && /^REPLACEMENT/.test(String(ctx.type));
  };

  return {
    db, data, put, fill, giveDon, act, respond, accept, select, battle, opponentEffectKO,
    onField, inTrash, promptType, replacementOffered,
    get state() {
      return state;
    },
  };
}

type Fixture = ReturnType<typeof fixture>;

function snapshotZones(f: Fixture, player: 0 | 1) {
  const p = f.state.players[player];
  return {
    life: p.life.map((c) => c.instanceId),
    hand: p.hand.map((c) => c.instanceId),
    trash: p.trash.map((c) => c.instanceId),
    deck: p.deck.length,
    donCostArea: p.donCostArea.map((d) => `${d.instanceId}:${d.state}`),
    donDeck: p.donDeck.length,
  };
}

/** The replaced card is K.O.'d and the replacement controller paid nothing. */
function expectKOProceededUnpaid(f: Fixture, replaced: CardInstance, before: ReturnType<typeof snapshotZones>) {
  expect(f.replacementOffered()).toBe(false);
  expect(f.state.pendingPrompt).toBeNull();
  expect(f.onField(replaced)).toBe(false);
  expect(f.inTrash(replaced)).toBe(true);
  const after = snapshotZones(f, 0);
  expect(after.life).toEqual(before.life);
  expect(after.hand).toEqual(before.hand);
  expect(after.deck).toBe(before.deck);
  expect(after.donCostArea).toEqual(before.donCostArea);
  expect(after.donDeck).toBe(before.donDeck);
  // Trash gains exactly the K.O.'d card.
  expect(after.trash.filter((id) => before.trash.includes(id))).toEqual(before.trash);
  expect(after.trash).toHaveLength(before.trash.length + 1);
}

// ─── LIFE_TO_HAND ────────────────────────────────────────────────────────────

describe("LIFE_TO_HAND substitute (OP15-105, effect-removal batch path)", () => {
  function setup() {
    const f = fixture();
    f.data("OP15-105", { cost: 4, power: 5000 });
    f.put("OP15-105", 0);
    f.data("P0-TARGET", { power: 5000 });
    const target = f.put("P0-TARGET", 0);
    return { f, target };
  }

  it("0 Life: not offered; the K.O. proceeds", () => {
    const { f, target } = setup();
    f.state.players[0].life = [];
    const before = snapshotZones(f, 0);

    f.opponentEffectKO(target);

    expectKOProceededUnpaid(f, target, before);
  });

  it("1 Life: offered; accepting moves that Life card to hand", () => {
    const { f, target } = setup();
    f.state.players[0].life = f.state.players[0].life.slice(0, 1);
    const lifeCard = f.state.players[0].life[0];

    f.opponentEffectKO(target);
    expect(f.replacementOffered()).toBe(true);
    f.accept();

    expect(f.onField(target)).toBe(true);
    expect(f.state.players[0].life).toHaveLength(0);
    expect(f.state.players[0].hand.map((c) => c.cardId)).toEqual([lifeCard.cardId]);
  });
});

// ─── TRASH_FROM_LIFE ─────────────────────────────────────────────────────────

describe("TRASH_FROM_LIFE substitute", () => {
  it("ST09-010 battle K.O. with 0 Life: not offered; the K.O. proceeds (FAQ)", () => {
    const f = fixture();
    f.data("ST09-010", { cost: 4, power: 5000 });
    const ace = f.put("ST09-010", 0);
    f.state.players[0].life = [];
    const before = snapshotZones(f, 0);

    f.battle(ace);

    expectKOProceededUnpaid(f, ace, before);
    expect(f.state.turn.battle).toBeNull();
  });

  // ST09-010 is authored as a PLAYER_CHOICE between trashing the top and the
  // bottom Life card (OPT-889). With 1 Life, either end is that one card.
  it.each(["top", "bottom"] as const)(
    "ST09-010 battle K.O. with 1 Life: offered; accepting and choosing %s trashes that Life card",
    (end) => {
      const f = fixture();
      f.data("ST09-010", { cost: 4, power: 5000 });
      const ace = f.put("ST09-010", 0);
      f.state.players[0].life = f.state.players[0].life.slice(0, 1);
      const lifeCard = f.state.players[0].life[0];

      f.battle(ace);
      expect(f.replacementOffered()).toBe(true);
      f.accept();

      const prompt = f.state.pendingPrompt;
      expect(prompt?.options.promptType).toBe("PLAYER_CHOICE");
      if (prompt?.options.promptType !== "PLAYER_CHOICE") throw new Error("no top/bottom prompt");
      expect(prompt.respondingPlayer).toBe(0);
      expect(prompt.options.choices).toHaveLength(2);
      const pick = prompt.options.choices.find((c) => c.label.toLowerCase().includes(end));
      expect(pick).toBeTruthy();
      f.respond({ type: "PLAYER_CHOICE", choiceId: pick!.id });

      expect(f.onField(ace)).toBe(true);
      expect(f.state.players[0].life).toHaveLength(0);
      expect(f.state.players[0].trash.map((c) => c.cardId)).toEqual([lifeCard.cardId]);
    },
  );

  it("ST20-002 effect K.O. with 0 Life: not offered; the K.O. proceeds (FAQ)", () => {
    const f = fixture();
    f.data("ST20-002", { cost: 4, power: 5000 });
    const cracker = f.put("ST20-002", 0);
    f.state.players[0].life = [];
    const before = snapshotZones(f, 0);

    f.opponentEffectKO(cracker);

    expectKOProceededUnpaid(f, cracker, before);
  });

  it("ST20-002 effect K.O. with 1 Life: offered", () => {
    const f = fixture();
    f.data("ST20-002", { cost: 4, power: 5000 });
    const cracker = f.put("ST20-002", 0);
    f.state.players[0].life = f.state.players[0].life.slice(0, 1);

    f.opponentEffectKO(cracker);

    expect(f.replacementOffered()).toBe(true);
  });
});

// ─── RETURN_DON_TO_DECK ──────────────────────────────────────────────────────

describe("RETURN_DON_TO_DECK substitute (EB04-030)", () => {
  function setup() {
    const f = fixture();
    f.data("EB04-030", { cost: 4, power: 5000 });
    const card = f.put("EB04-030", 0);
    return { f, card };
  }

  it("battle K.O. with no DON!! on the field: not offered; the K.O. proceeds", () => {
    const { f, card } = setup();
    f.giveDon(0, 0);
    const before = snapshotZones(f, 0);

    f.battle(card);

    expectKOProceededUnpaid(f, card, before);
  });

  it("effect K.O. with no DON!! on the field: not offered; the K.O. proceeds", () => {
    const { f, card } = setup();
    f.giveDon(0, 0);
    const before = snapshotZones(f, 0);

    f.opponentEffectKO(card);

    expectKOProceededUnpaid(f, card, before);
  });

  it("effect K.O. with 1 DON!!: offered; accepting returns it to the DON!! deck", () => {
    const { f, card } = setup();
    f.giveDon(0, 1);
    const donDeckBefore = f.state.players[0].donDeck.length;

    f.opponentEffectKO(card);
    expect(f.replacementOffered()).toBe(true);
    f.accept();

    expect(f.onField(card)).toBe(true);
    expect(f.state.players[0].donCostArea).toHaveLength(0);
    expect(f.state.players[0].donDeck).toHaveLength(donDeckBefore + 1);
  });

  // "Return 1 DON!! from your field": DON!! attached to the Leader is on the
  // field, so the printed cost can be paid with no cost-area DON!!.
  function allAttached() {
    const s = setup();
    s.f.giveDon(0, 0);
    s.f.state.players[0].leader.attachedDon = [
      { instanceId: "don-p0-attached", state: "ACTIVE", attachedTo: s.f.state.players[0].leader.instanceId },
    ];
    return s;
  }

  it("effect K.O. with every DON!! attached to the Leader: offered", () => {
    const { f, card } = allAttached();

    f.opponentEffectKO(card);

    expect(f.replacementOffered()).toBe(true);
  });

  it("battle K.O. with every DON!! attached to the Leader: offered", () => {
    const { f, card } = allAttached();

    f.battle(card);

    expect(f.replacementOffered()).toBe(true);
  });

  // OPT-921: executeReturnDonToDeck's `amount` path returns only unattached
  // cost-area DON!!, so accepting here saves the card without returning the
  // attached DON!!.
  it.fails("accepting with every DON!! attached returns the attached DON!! (OPT-921)", () => {
    const { f, card } = allAttached();
    const donDeckBefore = f.state.players[0].donDeck.length;

    f.opponentEffectKO(card);
    expect(f.replacementOffered()).toBe(true);
    f.accept();

    expect(f.onField(card)).toBe(true);
    expect(f.state.players[0].leader.attachedDon).toHaveLength(0);
    expect(f.state.players[0].donDeck).toHaveLength(donDeckBefore + 1);
  });
});

// ─── RETURN_TO_DECK (targeted substitute) ────────────────────────────────────

describe("RETURN_TO_DECK substitute", () => {
  function koby() {
    const f = fixture();
    f.data("OP11-001", { type: "Leader", cost: null, power: 5000, life: 5, counter: null });
    f.put("OP11-001", 0, "LEADER");
    f.data("NAVY-CHAR", { power: 5000, types: ["Navy"] });
    const navy = f.put("NAVY-CHAR", 0);
    return { f, navy };
  }

  it("OP11-001 Koby with 2 cards in trash: not offered; the K.O. proceeds (FAQ)", () => {
    const { f, navy } = koby();
    f.fill(0, "TRASH", 2);
    const before = snapshotZones(f, 0);

    f.opponentEffectKO(navy);

    expectKOProceededUnpaid(f, navy, before);
  });

  it("OP11-001 Koby with 3 cards in trash: offered; accepting places those 3 at the deck bottom", () => {
    const { f, navy } = koby();
    f.fill(0, "TRASH", 3);
    const deckBefore = f.state.players[0].deck.length;

    f.opponentEffectKO(navy);
    expect(f.replacementOffered()).toBe(true);
    f.accept();
    // "in any order": the controller orders the three trash cards.
    const trash = f.state.players[0].trash.map((c) => c.instanceId);
    expect(f.promptType()).toBe("ARRANGE_TOP_CARDS");
    f.respond({
      type: "ARRANGE_TOP_CARDS",
      keptCardInstanceId: "",
      orderedInstanceIds: [trash[2], trash[0], trash[1]],
      destination: "bottom",
    });

    expect(f.onField(navy)).toBe(true);
    expect(f.state.players[0].trash).toHaveLength(0);
    expect(f.state.players[0].deck).toHaveLength(deckBefore + 3);
  });

  function moria(withOther: boolean) {
    const f = fixture();
    f.db.set(CARDS.LEADER.id, { ...CARDS.LEADER, types: ["The Seven Warlords of the Sea"] });
    f.data("OP07-042", { cost: 5, power: 5000 });
    const gecko = f.put("OP07-042", 0);
    const other = withOther ? f.put(CARDS.VANILLA.id, 0) : undefined;
    return { f, gecko, other };
  }

  it("OP07-042 Gecko Moria as the only Character: not offered; the K.O. proceeds (FAQ)", () => {
    const { f, gecko } = moria(false);
    const before = snapshotZones(f, 0);

    f.opponentEffectKO(gecko);

    expectKOProceededUnpaid(f, gecko, before);
  });

  it("OP07-042 Gecko Moria with another Character: offered", () => {
    const { f, gecko } = moria(true);

    f.opponentEffectKO(gecko);

    expect(f.replacementOffered()).toBe(true);
  });
});

// ─── RETURN_TO_DECK from trash (EB04-043) ────────────────────────────────────

describe("RETURN_TO_DECK substitute from trash (EB04-043 Kaku)", () => {
  // Printed: "you may place 3 cards from your trash at the bottom of your deck
  // in any order instead." The hand is irrelevant.
  function setup() {
    const f = fixture();
    f.data("EB04-043", { cost: 5, power: 5000, color: ["Black"] });
    const card = f.put("EB04-043", 0);
    return { f, card };
  }

  it("3 cards in hand but only 2 in trash: not offered; the K.O. proceeds", () => {
    const { f, card } = setup();
    f.fill(0, "HAND", 3);
    f.fill(0, "TRASH", 2);
    const before = snapshotZones(f, 0);

    f.opponentEffectKO(card);

    expectKOProceededUnpaid(f, card, before);
  });

  it("empty hand and 3 cards in trash: offered; accepting places those 3 at the deck bottom", () => {
    const { f, card } = setup();
    const trashCards = f.fill(0, "TRASH", 3);
    const deckBefore = f.state.players[0].deck.map((c) => c.instanceId);

    f.opponentEffectKO(card);
    expect(f.replacementOffered()).toBe(true);
    f.accept();
    // "in any order": the controller orders the three trash cards.
    const trash = f.state.players[0].trash.map((c) => c.instanceId);
    expect(trash).toHaveLength(3);
    expect(f.promptType()).toBe("ARRANGE_TOP_CARDS");
    f.respond({
      type: "ARRANGE_TOP_CARDS",
      keptCardInstanceId: "",
      orderedInstanceIds: [trash[2], trash[0], trash[1]],
      destination: "bottom",
    });

    expect(f.onField(card)).toBe(true);
    expect(f.state.players[0].trash).toHaveLength(0);
    expect(f.state.players[0].hand).toHaveLength(0);
    const deck = f.state.players[0].deck;
    expect(deck).toHaveLength(deckBefore.length + 3);
    // The original deck is untouched on top; the three trash cards are at the bottom.
    expect(deck.slice(0, deckBefore.length).map((c) => c.instanceId)).toEqual(deckBefore);
    expect(deck.slice(-3).every((c) => c.cardId === trashCards[0].cardId)).toBe(true);
  });
});

// ─── Schema validation hardening ─────────────────────────────────────────────

describe("validateEffectSchema rejects an unknown replaces.cause_filter.by", () => {
  it("a mistyped cause filter is a schema error, not a silently disabled replacement", () => {
    const schema = {
      card_id: "TEST-001",
      card_name: "Test",
      card_type: "Character",
      effects: [{
        id: "r",
        category: "replacement",
        replaces: { event: "WOULD_BE_KO", cause_filter: { by: "OPPONENTS_EFFECT" } },
        replacement_actions: [{ type: "TRASH_CARD", target: { type: "SELF" } }],
        flags: { optional: true },
      }],
    };
    expect(validateEffectSchema(schema, "TEST-001").join("\n")).toMatch(/cause_filter\.by/);
  });

  it("every authored cause filter value validates", () => {
    const schema = {
      card_id: "TEST-002",
      card_name: "Test",
      card_type: "Character",
      effects: ["OPPONENT_EFFECT", "ANY_EFFECT", "BATTLE", "ANY"].map((by, i) => ({
        id: `r${i}`,
        category: "replacement",
        replaces: { event: "WOULD_BE_KO", cause_filter: { by } },
        replacement_actions: [{ type: "TRASH_CARD", target: { type: "SELF" } }],
        flags: { optional: true },
      })),
    };
    expect(validateEffectSchema(schema, "TEST-002").filter((e) => /cause_filter/.test(e))).toEqual([]);
  });
});
