/**
 * OPT-911 — the 11 `[Main]/[Counter]` Events authored as one block with
 * `trigger: { any_of: [MAIN_EVENT, COUNTER_EVENT] }` resolve their effect both
 * when played as a [Main] (PLAY_CARD) and as a [Counter] (USE_COUNTER_EVENT).
 *
 * OPT-913 — REUSE_EFFECT `target_effect` names one block by id or by trigger
 * keyword (any_of included); every authored use resolves to exactly one block,
 * and validation rejects anything else. One real Life [Trigger] per family:
 * block id (OP05-116), compound any_of target (ST12-016), and the former
 * `COUNTER` alias, now `COUNTER_EVENT` (OP13-039).
 *
 * Everything runs through `runPipeline` / `resumePromptLifecycle` with the
 * registered authored schemas. Expected values are literals derived from the
 * canonical text in docs/cards/ (quoted above each test).
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { CardData, CardInstance, GameAction } from "../types.js";
import type { EffectBlock, EffectSchema } from "../engine/effect-types.js";
import {
  getAllAuthoredSchemas,
  getEffectSchema,
  validateEffectSchema,
} from "../engine/schema-registry.js";
import { findReuseTargetBlocks, triggerHasKeyword } from "../engine/trigger-keywords.js";
import { runPipeline } from "../engine/pipeline.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { getEffectivePower } from "../engine/modifiers.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";

const CARDS_DIR = resolve(__dirname, "../../../../docs/cards");
function canonicalText(id: string): string {
  for (const file of readdirSync(CARDS_DIR).filter((f) => f.endsWith(".md"))) {
    const md = readFileSync(resolve(CARDS_DIR, file), "utf8");
    const at = md.indexOf(`**${id}**`);
    if (at < 0) continue;
    const end = md.indexOf("\n---", at);
    return md.slice(at, end < 0 ? undefined : end).split("\n").slice(1).join("\n").trim();
  }
  throw new Error(`no canonical text for ${id}`);
}
function printedEffect(id: string): string {
  const text = canonicalText(id);
  const trigger = text.indexOf("**Trigger:**");
  return (trigger < 0 ? text : text.slice(0, trigger)).trim();
}
function printedTrigger(id: string): string | undefined {
  const text = canonicalText(id);
  const at = text.indexOf("**Trigger:**");
  return at < 0 ? undefined : text.slice(at + "**Trigger:**".length).trim();
}

// ─── Fixture ─────────────────────────────────────────────────────────────────

type Mode = "main" | "counter";
type Answer = "accept" | "skip" | ((f: Fixture) => GameAction);

function fixture() {
  const db = createTestCardDb();
  let state = createBattleReadyState(db);
  state.players.forEach((p) => {
    p.characters = padChars([]);
    p.hand = [];
    p.trash = [];
  });
  let serial = 0;

  function put(
    id: string,
    controller: 0 | 1,
    zone: CardInstance["zone"],
    overrides: Partial<CardData> = {},
  ): CardInstance {
    const schema = getEffectSchema(id);
    db.set(id, {
      ...CARDS.VANILLA,
      id,
      name: schema?.card_name ?? id,
      effectSchema: schema ?? null,
      ...overrides,
    });
    const card = {
      cardId: id,
      instanceId: `${id}-${controller}-${zone}-${serial++}`,
      owner: controller,
      controller,
      zone,
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 1,
    } as CardInstance;
    const p = state.players[controller];
    if (zone === "HAND") p.hand.push(card);
    else if (zone === "TRASH") p.trash.push(card);
    else if (zone === "DECK") p.deck.unshift(card);
    else if (zone === "LIFE") p.life.unshift({ ...card, face: "DOWN" });
    else if (zone === "CHARACTER") {
      p.characters[p.characters.findIndex((c) => !c)] = card;
      state = registerCardEnteredField(state, card, db.get(id)!);
    }
    return card;
  }

  function act(action: GameAction, player: 0 | 1) {
    if (state.pendingPrompt) {
      const r = resumePromptLifecycle(state, action, db, {
        drainPregame: (s) => s,
        advanceStartOfTurn: (s) => s,
      });
      expect(r.responseRejected, JSON.stringify({ action, prompt: state.pendingPrompt?.options })).toBe(false);
      state = r.state;
      return;
    }
    const r = runPipeline(state, action, db, player);
    expect(r.valid, r.error).toBe(true);
    state = r.state;
  }

  /** Answer pending prompts in order; asserts each one goes to `responder`. */
  function drive(answers: Answer[], responder: 0 | 1, fallback?: Answer) {
    const queue = [...answers];
    let guard = 0;
    while (state.pendingPrompt) {
      const prompt = state.pendingPrompt;
      const next = queue.shift() ?? fallback;
      expect(next, `unscripted prompt: ${JSON.stringify(prompt.options).slice(0, 400)}`).toBeDefined();
      expect(prompt.respondingPlayer, `prompt ${prompt.options.promptType} responder`).toBe(responder);
      if (next === "accept") act({ type: "PLAYER_CHOICE", choiceId: "accept" }, responder);
      else if (next === "skip") act({ type: "PLAYER_CHOICE", choiceId: "skip" }, responder);
      else act(next!(api), responder);
      if (++guard > 20) throw new Error("prompt loop");
    }
    expect(queue, "scripted answers left unused").toEqual([]);
  }

  /**
   * Resolve the Event `id` as a [Main] (player 0 plays it in their Main Phase)
   * or as a [Counter] (player 0's Leader attacks; player 1 counters with it).
   * Returns the acting player; the other player is "the opponent".
   */
  function resolveAs(mode: Mode, id: string, answers: Answer[], fallback?: Answer): 0 | 1 {
    const self: 0 | 1 = mode === "main" ? 0 : 1;
    const ev = put(id, self, "HAND", {
      type: "Event",
      cost: 1,
      power: null,
      counter: null,
      effectText: printedEffect(id),
      ...(printedTrigger(id) ? { triggerText: printedTrigger(id) } : {}),
    });
    state.turn.activePlayerIndex = 0;
    if (mode === "main") {
      act({ type: "PLAY_CARD", cardInstanceId: ev.instanceId }, 0);
    } else {
      act(
        {
          type: "DECLARE_ATTACK",
          attackerInstanceId: state.players[0].leader.instanceId,
          targetInstanceId: state.players[1].leader.instanceId,
        },
        0,
      );
      act({ type: "PASS" }, 0);
      act(
        {
          type: "USE_COUNTER_EVENT",
          cardInstanceId: ev.instanceId,
          counterTargetInstanceId: state.players[1].leader.instanceId,
        },
        1,
      );
    }
    drive(answers, self, fallback);
    expect(state.players[self].trash.map((c) => c.cardId)).toContain(id);
    return self;
  }

  function live(card: CardInstance): CardInstance | undefined {
    const p = state.players[card.controller];
    return [p.leader, ...p.characters.filter(Boolean)].find(
      (c) => c?.instanceId === card.instanceId,
    ) as CardInstance | undefined;
  }
  const power = (card: CardInstance) => {
    const c = live(card)!;
    return getEffectivePower(c, db.get(c.cardId)!, state, db);
  };

  const api = {
    db,
    put,
    act,
    drive,
    resolveAs,
    live,
    power,
    get state() {
      return state;
    },
  };
  return api;
}
type Fixture = ReturnType<typeof fixture>;

const select = (...cards: CardInstance[]) => () =>
  ({ type: "SELECT_TARGET", selectedInstanceIds: cards.map((c) => c.instanceId) }) as GameAction;
const opp = (self: 0 | 1): 0 | 1 => (self === 0 ? 1 : 0);
const MODES: Mode[] = ["main", "counter"];

/** Own and opposing Characters for the player who will resolve the Event. */
function board(f: Fixture, mode: Mode, foe: Partial<CardData> = {}, foeState: "ACTIVE" | "RESTED" = "ACTIVE") {
  const self: 0 | 1 = mode === "main" ? 0 : 1;
  const ally = f.put("ALLY-A", self, "CHARACTER", { cost: 3, power: 4000, name: "Ally A" });
  const enemy = f.put("FOE-A", opp(self), "CHARACTER", { cost: 3, power: 4000, name: "Foe A", ...foe });
  enemy.state = foeState;
  return { self, ally, foe: enemy };
}

// ─── OPT-911: the 11 compound [Main]/[Counter] Events ───────────────────────

const COMPOUND = [
  "OP03-017", "OP04-038", "OP06-017", "OP06-095", "OP07-116", "OP08-019",
  "OP08-094", "OP10-040", "OP10-078", "OP15-021", "ST12-016",
];

describe("OPT-911 — compound [Main]/[Counter] blocks", () => {
  it("the registry's compound [Main]/[Counter] Events are exactly the 11, each one auto block", () => {
    const compound = Object.entries(getAllAuthoredSchemas())
      .filter(([, s]) =>
        s.effects.some(
          (b) => b.trigger && "any_of" in b.trigger && triggerHasKeyword(b.trigger, "COUNTER_EVENT"),
        ),
      )
      .map(([id]) => id)
      .sort();
    expect(compound).toEqual([...COMPOUND].sort());
    for (const id of COMPOUND) {
      expect(printedEffect(id), id).toContain("[Main]/[Counter]");
      const blocks = getEffectSchema(id)!.effects.filter(
        (b) => triggerHasKeyword(b.trigger, "MAIN_EVENT") || triggerHasKeyword(b.trigger, "COUNTER_EVENT"),
      );
      expect(blocks.map((b) => b.category), id).toEqual(["auto"]);
    }
  });

  describe.each(MODES)("as a [%s]", (mode) => {
    // OP03-017: "If your Leader's type includes "Whitebeard Pirates", give up to
    // 1 of your opponent's Characters −4000 power during this turn."
    it("OP03-017: −4000 to an opposing Character with a Whitebeard Pirates Leader", () => {
      const f = fixture();
      const { self, foe } = board(f, mode);
      const leader = f.state.players[self].leader;
      f.db.set(leader.cardId, { ...f.db.get(leader.cardId)!, types: ["Whitebeard Pirates"] });
      f.resolveAs(mode, "OP03-017", [select(foe)]);
      expect(f.power(foe)).toBe(0);
    });

    it("OP03-017: nothing without a Whitebeard Pirates Leader", () => {
      const f = fixture();
      const { self, foe } = board(f, mode);
      const leader = f.state.players[self].leader;
      f.db.set(leader.cardId, { ...f.db.get(leader.cardId)!, types: ["Straw Hat Crew"] });
      f.resolveAs(mode, "OP03-017", []);
      expect(f.power(foe)).toBe(4000);
    });

    // OP04-038: "Rest up to 1 of your opponent's Leader or Character cards.
    // Then, K.O. up to 1 of your opponent's rested Characters with a cost of 6 or less."
    it("OP04-038: rests an opposing Character, then K.O.s it", () => {
      const f = fixture();
      const { self, foe } = board(f, mode, { cost: 6 });
      f.resolveAs(mode, "OP04-038", [select(foe), select(foe)]);
      expect(f.live(foe)).toBeUndefined();
      expect(f.state.players[opp(self)].trash.map((c) => c.cardId)).toContain("FOE-A");
    });

    // OP06-017: "You may add 1 card from the top of your Life cards to your hand:
    // Up to 1 of your Leader or Character cards gains +3000 power during this turn."
    it("OP06-017: pays 1 Life to hand, then +3000 to your Character", () => {
      const f = fixture();
      const { self, ally } = board(f, mode);
      const life = f.state.players[self].life.length;
      const hand = f.state.players[self].hand.length;
      f.resolveAs(mode, "OP06-017", ["accept", select(ally)]);
      expect(f.state.players[self].life.length).toBe(life - 1);
      expect(f.state.players[self].hand.length).toBe(hand + 1);
      expect(f.power(ally)).toBe(7000);
    });

    // OP06-095: "Your Leader gains +1000 power during this turn. Then, you may
    // K.O. any number of your {Thriller Bark Pirates} type Characters with a
    // cost of 2 or less. Your Leader gains an additional +1000 power during this
    // turn for every Character K.O.'d."
    it("OP06-095: Leader +1000, K.O. 2 own Thriller Bark Pirates (cost 2), +2000 more", () => {
      const f = fixture();
      const self: 0 | 1 = mode === "main" ? 0 : 1;
      const tb1 = f.put("TB-1", self, "CHARACTER", { cost: 2, power: 2000, types: ["Thriller Bark Pirates"] });
      const tb2 = f.put("TB-2", self, "CHARACTER", { cost: 2, power: 2000, types: ["Thriller Bark Pirates"] });
      const leader = f.state.players[self].leader;
      const base = f.power(leader);
      f.resolveAs(mode, "OP06-095", [select(tb1, tb2)]);
      expect(f.live(tb1)).toBeUndefined();
      expect(f.live(tb2)).toBeUndefined();
      expect(f.power(leader)).toBe(base + 3000);
    });

    // OP07-116: "Up to 1 of your Leader or Character cards gains +1000 power
    // during this turn. Then, if your opponent has 2 or less Life cards, rest up
    // to 1 of your opponent's Characters with a cost of 4 or less."
    it("OP07-116: +1000, then rests an opposing cost-4 Character when they have 2 Life", () => {
      const f = fixture();
      const { self, ally, foe } = board(f, mode, { cost: 4 });
      f.state.players[opp(self)].life = f.state.players[opp(self)].life.slice(0, 2);
      f.resolveAs(mode, "OP07-116", [select(ally), select(foe)]);
      expect(f.power(ally)).toBe(5000);
      expect(f.live(foe)!.state).toBe("RESTED");
    });

    // OP08-019: "Give up to 1 of your opponent's Characters −3000 power during
    // this turn. Then, up to 1 of your Characters gains +3000 power during this turn."
    it("OP08-019: −3000 to an opposing Character, then +3000 to your Character", () => {
      const f = fixture();
      const { ally, foe } = board(f, mode);
      f.resolveAs(mode, "OP08-019", [
        (g) => {
          // The prompt names the combined [Main]/[Counter] section, not "[Main]/".
          const o = g.state.pendingPrompt!.options as { effectDescription?: string };
          expect(o.effectDescription).toBe(
            "[Main]/[Counter] Give up to 1 of your opponent's Characters −3000 power during this turn. Then, up to 1 of your Characters gains +3000 power during this turn.",
          );
          return select(foe)();
        },
        select(ally),
      ]);
      expect(f.power(foe)).toBe(1000);
      expect(f.power(ally)).toBe(7000);
    });

    // OP08-094: "You may place 3 cards from your trash at the bottom of your deck
    // in any order: K.O. up to 1 of your opponent's Characters with a cost of 2 or less."
    it("OP08-094: places 3 trash cards at the deck bottom, then K.O.s a cost-2 Character", () => {
      const f = fixture();
      const { self, foe } = board(f, mode, { cost: 2 });
      const t = [1, 2, 3].map((n) => f.put(`TRASH-${n}`, self, "TRASH"));
      const deck = f.state.players[self].deck.length;
      // Optional cost: accept, choose the 3 cards, order them, then the K.O. target.
      const answer: Answer = (g) => {
        const o = g.state.pendingPrompt!.options;
        if (o.promptType === "SELECT_TARGET" && o.validTargets.includes(foe.instanceId))
          return { type: "SELECT_TARGET", selectedInstanceIds: [foe.instanceId] };
        if (o.promptType === "SELECT_TARGET")
          return { type: "SELECT_TARGET", selectedInstanceIds: t.map((c) => c.instanceId) };
        if (o.promptType === "ARRANGE_TOP_CARDS")
          return { type: "ARRANGE_TOP_CARDS", keptCardInstanceId: "", orderedInstanceIds: o.cards.map((c) => c.instanceId), destination: "bottom" };
        throw new Error(`unexpected prompt ${o.promptType}`);
      };
      f.resolveAs(mode, "OP08-094", ["accept"], answer);
      expect(f.state.players[self].deck.length).toBe(deck + 3);
      expect(f.state.players[self].deck.slice(-3).map((c) => c.cardId).sort()).toEqual(["TRASH-1", "TRASH-2", "TRASH-3"]);
      expect(f.live(foe)).toBeUndefined();
    });

    // OP10-040: "K.O. up to 1 of your opponent's rested Characters with a cost of 7 or less."
    it("OP10-040: K.O.s a rested opposing cost-7 Character", () => {
      const f = fixture();
      const { foe } = board(f, mode, { cost: 7 }, "RESTED");
      f.resolveAs(mode, "OP10-040", [select(foe)]);
      expect(f.live(foe)).toBeUndefined();
    });

    // OP10-078: "Look at 3 cards from the top of your deck; reveal up to 1
    // {Donquixote Pirates} type card other than [I Do Not Forgive Those Who Laugh
    // at My Family!!!] and add it to your hand. Then, place the rest at the
    // bottom of your deck in any order."
    it("OP10-078: adds a Donquixote Pirates card from the top 3 to hand", () => {
      const f = fixture();
      const self: 0 | 1 = mode === "main" ? 0 : 1;
      f.put("FILLER-B", self, "DECK", { types: ["Navy"] });
      const doffy = f.put("DOFFY", self, "DECK", { types: ["Donquixote Pirates"] });
      f.put("FILLER-A", self, "DECK", { types: ["Navy"] });
      f.resolveAs(mode, "OP10-078", [
        (g) => {
          const o = g.state.pendingPrompt!.options;
          expect(o.promptType).toBe("ARRANGE_TOP_CARDS");
          const rest = o.promptType === "ARRANGE_TOP_CARDS"
            ? o.cards.map((c) => c.instanceId).filter((cid) => cid !== doffy.instanceId)
            : [];
          return { type: "ARRANGE_TOP_CARDS", keptCardInstanceId: doffy.instanceId, orderedInstanceIds: rest, destination: "bottom" };
        },
      ]);
      expect(f.state.players[self].deck.slice(-2).map((c) => c.cardId).sort()).toEqual(["FILLER-A", "FILLER-B"]);
      expect(f.state.players[self].hand.map((c) => c.cardId)).toContain("DOFFY");
    });

    // OP15-021: "Give up to 1 of your opponent's Characters −3000 power during this turn."
    it("OP15-021: −3000 to an opposing Character", () => {
      const f = fixture();
      const { foe } = board(f, mode);
      f.resolveAs(mode, "OP15-021", [select(foe)]);
      expect(f.power(foe)).toBe(1000);
    });

    // ST12-016: "Rest up to 1 of your opponent's Leader or Character cards with a cost of 4 or less."
    it("ST12-016: rests an opposing cost-4 Character", () => {
      const f = fixture();
      const { foe } = board(f, mode, { cost: 4 });
      f.resolveAs(mode, "ST12-016", [select(foe)]);
      expect(f.live(foe)!.state).toBe("RESTED");
    });
  });
});

// ─── OPT-913: REUSE_EFFECT target contract ──────────────────────────────────

describe("OPT-913 — REUSE_EFFECT target_effect resolves to exactly one block", () => {
  function reuses(schema: EffectSchema): { block: EffectBlock; target: string }[] {
    const found: { block: EffectBlock; target: string }[] = [];
    const visit = (node: unknown, block: EffectBlock): void => {
      if (Array.isArray(node)) return node.forEach((n) => visit(n, block));
      if (!node || typeof node !== "object") return;
      const r = node as Record<string, unknown>;
      if (r.type === "REUSE_EFFECT") {
        found.push({ block, target: (r.params as { target_effect: string }).target_effect });
      }
      Object.values(r).forEach((v) => visit(v, block));
    };
    schema.effects.forEach((b) => visit(b, b));
    return found;
  }

  it("registry sweep: every authored REUSE_EFFECT resolves to exactly one other block", () => {
    let total = 0;
    for (const [id, schema] of Object.entries(getAllAuthoredSchemas())) {
      for (const { block, target } of reuses(schema)) {
        total += 1;
        const matches = findReuseTargetBlocks(schema.effects, target);
        expect(matches.map((b) => b.id), `${id} target_effect ${target}`).toHaveLength(1);
        expect(matches[0], `${id} reuses its own block`).not.toBe(block);
      }
    }
    expect(total).toBeGreaterThanOrEqual(77);
  });

  it("validation rejects an unresolvable, ambiguous, or self-referencing target_effect", () => {
    const reuse = (target: string) => ({
      id: "trig",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [{ type: "REUSE_EFFECT", params: { target_effect: target } }],
    });
    const main = { id: "main", category: "auto", trigger: { keyword: "MAIN_EVENT" }, actions: [{ type: "DRAW", params: { amount: 1 } }] };
    const schema = (effects: unknown[]) => ({ card_id: "TEST-913", card_name: "Fixture", card_type: "Event", effects });

    expect(validateEffectSchema(schema([main, reuse("MAIN_EVENT")]), "TEST-913")).toEqual([]);
    expect(validateEffectSchema(schema([main, reuse("main")]), "TEST-913")).toEqual([]);
    expect(validateEffectSchema(schema([main, reuse("COUNTER")]), "TEST-913")).toContain(
      "[TEST-913] effects[1].actions[0].params.target_effect 'COUNTER': must name exactly one block of this card by id or trigger keyword, found 0 (OPT-913)",
    );
    const counter = { ...main, id: "counter", trigger: { keyword: "COUNTER_EVENT" } };
    const both = { ...main, id: "MAIN_EVENT" };
    expect(validateEffectSchema(schema([main, both, counter, reuse("MAIN_EVENT")]), "TEST-913")).toContain(
      "[TEST-913] effects[3].actions[0].params.target_effect 'MAIN_EVENT': must name exactly one block of this card by id or trigger keyword, found 2 (OPT-913)",
    );
    expect(validateEffectSchema(schema([main, reuse("trig")]), "TEST-913")).toContain(
      "[TEST-913] effects[1].actions[0].params.target_effect 'trig': resolves to the block that contains it (OPT-913)",
    );
  });
});

describe("OPT-913 — Life [Trigger] reuse, one card per lookup family", () => {
  const ATTACKER = 0;
  const OWNER = 1;

  function triggerFixture(id: string) {
    const f = fixture();
    f.state.players[OWNER].life = [];
    f.put("LIFE-FILLER", OWNER, "LIFE");
    f.put(id, OWNER, "LIFE", {
      type: "Event",
      cost: 1,
      power: null,
      counter: null,
      effectText: printedEffect(id),
      triggerText: printedTrigger(id),
      keywords: { ...CARDS.VANILLA.keywords, trigger: true },
    });
    f.act(
      {
        type: "DECLARE_ATTACK",
        attackerInstanceId: f.state.players[ATTACKER].leader.instanceId,
        targetInstanceId: f.state.players[OWNER].leader.instanceId,
      },
      ATTACKER,
    );
    f.act({ type: "PASS" }, ATTACKER);
    f.act({ type: "PASS" }, OWNER);
    return f;
  }
  function reveal(f: Fixture) {
    f.act({ type: "REVEAL_TRIGGER", reveal: true }, OWNER);
  }

  // OP05-116 (block id "main_ko_by_life_count"): [Trigger] Activate this card's
  // [Main] effect. [Main] K.O. up to 1 of your opponent's Characters with a
  // cost equal to or less than the number of your opponent's Life cards.
  it("block id: OP05-116 K.O.s a cost-3 Character when the opponent has 3 Life", () => {
    expect(printedTrigger("OP05-116")).toBe("[Trigger] Activate this card's [Main] effect.");
    const f = triggerFixture("OP05-116");
    f.state.players[ATTACKER].life = f.state.players[ATTACKER].life.slice(0, 3);
    const foe = f.put("FOE-A", ATTACKER, "CHARACTER", { cost: 3, power: 4000 });
    reveal(f);
    f.drive([select(foe)], OWNER);
    expect(f.live(foe)).toBeUndefined();
  });

  // ST12-016 (target "MAIN_EVENT" on an any_of [Main]/[Counter] block):
  // [Trigger] Activate this card's [Main] effect. [Main]/[Counter] Rest up to 1
  // of your opponent's Leader or Character cards with a cost of 4 or less.
  it("any_of target: ST12-016 rests an opposing cost-4 Character", () => {
    expect(printedTrigger("ST12-016")).toBe("[Trigger] Activate this card's [Main] effect.");
    const f = triggerFixture("ST12-016");
    const foe = f.put("FOE-A", ATTACKER, "CHARACTER", { cost: 4, power: 4000 });
    reveal(f);
    f.drive([select(foe)], OWNER);
    expect(f.live(foe)!.state).toBe("RESTED");
  });

  // OP13-039 (target "COUNTER_EVENT", formerly "COUNTER"): [Trigger] Activate
  // this card's [Counter] effect. [Counter] K.O. up to 1 of your opponent's
  // rested Characters with a cost of 4 or less.
  it("COUNTER_EVENT target: OP13-039 K.O.s a rested opposing cost-4 Character", () => {
    expect(printedTrigger("OP13-039")).toBe("[Trigger] Activate this card's [Counter] effect.");
    const f = triggerFixture("OP13-039");
    const foe = f.put("FOE-A", ATTACKER, "CHARACTER", { cost: 4, power: 4000 });
    f.live(foe)!.state = "RESTED";
    reveal(f);
    f.drive([select(foe)], OWNER);
    expect(f.live(foe)).toBeUndefined();
  });
});
