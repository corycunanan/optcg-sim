/**
 * OPT-894 — Counter Events authored as `category: "activate"` never resolved.
 *
 * `executeUseCounterEvent` (battle.ts) runs only a block with
 * `category === "auto"` and `trigger.keyword === "COUNTER_EVENT"`; 40 Counter
 * Events were authored `activate`, so DON!! was paid and the card trashed but
 * the [Counter] effect never resolved. Convention (this ticket): every
 * COUNTER_EVENT block is `category: "auto"`. 39 are re-authored `auto`; P-059
 * is deliberately kept `activate` (non-executing) until OPT-912, because as
 * `auto` it would return every own Character for +0 power.
 *
 * Every card here is played from hand through `runPipeline` during a real
 * battle (declare attack -> USE_COUNTER_EVENT with real DON!! payment) and every
 * prompt is answered through the real prompt response. Expected values are
 * literals hand-derived from the card text in docs/cards/, never from what the
 * engine currently does. This file reads docs/cards only to install the card's
 * display text and for a few structural checks ([Main]/[Trigger] presence).
 */

import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { CardData, CardInstance, GameAction } from "../types.js";
import { getAllAuthoredSchemas, getEffectSchema } from "../engine/schema-registry.js";
import { runPipeline } from "../engine/pipeline.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { getEffectivePower } from "../engine/modifiers.js";
import { findCounterEventCategoryIntentViolations } from "../engine/schema-counter-event-lint.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";

// ─── Canonical text (docs/cards) ─────────────────────────────────────────────

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

// ─── Fixture ─────────────────────────────────────────────────────────────────

type Answer =
  | "accept"
  | "skip"
  | { choice: string }
  | { select: (f: Fixture) => string[] }
  | { raw: (f: Fixture) => GameAction };

function fixture() {
  const db = createTestCardDb();
  let state = createBattleReadyState(db);
  let serial = 0;
  const p0 = state.players[0];
  const p1 = state.players[1];
  p1.hand = [];
  p1.trash = [];

  function data(id: string, overrides: Partial<CardData> = {}) {
    db.set(id, {
      ...CARDS.VANILLA,
      id,
      name: getEffectSchema(id)?.card_name ?? id,
      effectSchema: getEffectSchema(id) ?? null,
      ...overrides,
    });
  }

  function put(
    id: string,
    controller: 0 | 1,
    zone: CardInstance["zone"],
    overrides: Partial<CardData> = {},
  ) {
    data(id, overrides);
    const card = {
      cardId: id,
      instanceId: `${id}-${controller}-${serial++}`,
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
    else if (zone === "CHARACTER") p.characters[p.characters.findIndex((c) => !c)] = card;
    else if (zone === "STAGE") p.stage = card;
    return card;
  }

  /** Rename / retype the shared test Leader card (both players' Leaders use it). */
  function leaderData(overrides: Partial<CardData>) {
    const leader = state.players[1].leader;
    db.set(leader.cardId, { ...db.get(leader.cardId)!, ...overrides });
  }

  function act(action: GameAction, player: 0 | 1) {
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

  /** Answer every pending prompt with the scripted answers, in order. */
  function drive(answers: Answer[]) {
    const queue = [...answers];
    let guard = 0;
    while (state.pendingPrompt) {
      const prompt = state.pendingPrompt;
      const next = queue.shift();
      expect(
        next,
        `unscripted prompt ${prompt.options.promptType}: ${JSON.stringify(prompt.options).slice(0, 500)}`,
      ).toBeDefined();
      if (next === "accept") respond({ type: "PLAYER_CHOICE", choiceId: "accept" });
      else if (next === "skip") respond({ type: "PLAYER_CHOICE", choiceId: "skip" });
      else if (typeof next === "object" && "choice" in next)
        respond({ type: "PLAYER_CHOICE", choiceId: next.choice });
      else if (typeof next === "object" && "select" in next)
        respond({ type: "SELECT_TARGET", selectedInstanceIds: next.select(api) });
      else if (typeof next === "object" && "raw" in next) respond(next.raw(api));
      if (++guard > 20) throw new Error("prompt loop");
    }
    expect(queue, "scripted answers left unused").toEqual([]);
  }

  /**
   * Player 0's Leader attacks player 1's Leader; player 1 plays the Counter
   * Event `id` (canonical text installed) with the scripted prompt answers.
   */
  function counter(id: string, answers: Answer[] = [], overrides: Partial<CardData> = {}) {
    const event = put(id, 1, "HAND", {
      type: "Event",
      cost: 1,
      power: null,
      counter: null,
      effectText: canonicalText(id),
      ...overrides,
    });
    state.turn.activePlayerIndex = 0;
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
        cardInstanceId: event.instanceId,
        counterTargetInstanceId: state.players[1].leader.instanceId,
      },
      1,
    );
    drive(answers);
    return event;
  }

  const power = (card: CardInstance) => {
    const live = findLive(card);
    return getEffectivePower(live, db.get(live.cardId)!, state, db);
  };
  function findLive(card: CardInstance): CardInstance {
    const p = state.players[card.controller];
    const all = [p.leader, ...p.characters.filter(Boolean), p.stage].filter(Boolean) as CardInstance[];
    return all.find((c) => c.instanceId === card.instanceId)!;
  }

  /** Player 1 stops countering; the battle resolves and ends. */
  function endBattle() {
    let guard = 0;
    while (state.turn.battle && !state.pendingPrompt && guard++ < 8) act({ type: "PASS" }, 1);
  }

  const trashCount = (id: string) => state.players[1].trash.filter((c) => c.cardId === id).length;
  const activeDon = () => state.players[1].donCostArea.filter((d) => d.state === "ACTIVE").length;

  const api = {
    db,
    data,
    put,
    leaderData,
    act,
    drive,
    counter,
    power,
    endBattle,
    trashCount,
    activeDon,
    p1Leader: () => state.players[1].leader,
    get state() {
      return state;
    },
  };
  return api;
}
type Fixture = ReturnType<typeof fixture>;

/** Fresh Characters for player 1 (own board) and player 0 (opponent board). */
function board(f: Fixture) {
  f.state.players.forEach((p) => (p.characters = padChars([])));
  const ally = f.put("ALLY-A", 1, "CHARACTER", { cost: 3, power: 4000, name: "Ally A" });
  const foe = f.put("FOE-A", 0, "CHARACTER", { cost: 3, power: 4000, name: "Foe A" });
  return { ally, foe };
}
const ids = (...cards: CardInstance[]) => ({ select: () => cards.map((c) => c.instanceId) });
const none = { select: () => [] as string[] };

/** Effects that resolve with no player input beyond the cost payment. */
function expectPaidAndTrashed(f: Fixture, id: string, donBefore: number) {
  expect(f.trashCount(id)).toBe(1);
  expect(f.activeDon()).toBe(donBefore - 1);
}

// ─── Shape 1: "Your Leader gains +3000 power during this battle" ─────────────

describe("OPT-894 — [Counter] Your Leader gains +3000 (no cost, no prompt)", () => {
  it.each(["OP16-038", "OP16-040", "OP16-059", "OP16-099", "OP16-100", "OP17-097", "OP17-098"])(
    "%s",
    (id) => {
      expect(canonicalText(id)).toContain("[Counter] Your Leader gains +3000 power during this battle.");
      const f = fixture();
      const { ally } = board(f);
      const base = f.power(f.p1Leader());
      const allyBase = f.power(ally);
      const don = f.activeDon();
      const lifeBefore = f.state.players[1].life.length;

      f.counter(id);

      expect(f.power(f.p1Leader())).toBe(base + 3000);
      expect(f.power(ally)).toBe(allyBase);
      expectPaidAndTrashed(f, id, don);
      expect(f.state.pendingPrompt).toBeNull();

      f.endBattle();
      expect(f.state.players[1].life).toHaveLength(lifeBefore); // 5000 attacker < 8000 defender
      expect(f.power(f.p1Leader())).toBe(base); // "during this battle" only
      expect(f.trashCount(id)).toBe(1);
    },
  );
});

// ─── Shape 2: "Up to 1 of your Leader or Character cards gains +N" ──────────

describe("OPT-894 — [Counter] up to 1 Leader or Character gains +N (no cost)", () => {
  it.each([
    ["ST01-014", 3000],
    ["ST06-016", 2000],
    ["OP17-078", 4000],
  ] as const)("%s: +%i on the chosen Character only, and it expires", (id, amount) => {
    const f = fixture();
    const { ally } = board(f);
    const leaderBase = f.power(f.p1Leader());
    const allyBase = f.power(ally);
    const don = f.activeDon();

    f.counter(id, [ids(ally)]);

    expect(f.power(ally)).toBe(allyBase + amount);
    expect(f.power(f.p1Leader())).toBe(leaderBase);
    expectPaidAndTrashed(f, id, don);
    f.endBattle();
    expect(f.power(ally)).toBe(allyBase);
  });

  it("ST01-014: the Leader can be chosen", () => {
    const f = fixture();
    const { ally } = board(f);
    const base = f.power(f.p1Leader());
    f.counter("ST01-014", [ids(f.p1Leader())]);
    expect(f.power(f.p1Leader())).toBe(base + 3000);
    expect(f.power(ally)).toBe(4000);
  });

  it("ST01-014: 'up to 1' allows choosing nobody; the Event is still spent", () => {
    const f = fixture();
    const { ally } = board(f);
    const base = f.power(f.p1Leader());
    const don = f.activeDon();
    f.counter("ST01-014", [none]);
    expect(f.power(f.p1Leader())).toBe(base);
    expect(f.power(ally)).toBe(4000);
    expectPaidAndTrashed(f, "ST01-014", don);
  });
});

// ─── Shape 3: "[Counter] You may <cost>: up to 1 ... gains +3000" ────────────

describe("OPT-894 — [Counter] with an optional hand-trash cost", () => {
  it.each(["OP16-020", "OP17-038", "OP17-076"])("%s: accept trashes 1 card and grants +3000", (id) => {
    expect(canonicalText(id)).toContain("You may trash 1 card from your hand: Up to 1 of your Leader or Char");
    const f = fixture();
    const { ally } = board(f);
    const filler = f.put("FILLER-1", 1, "HAND");
    const leaderBase = f.power(f.p1Leader());
    const allyBase = f.power(ally);
    const don = f.activeDon();

    f.counter(id, ["accept", ids(filler), ids(ally)]);

    expect(f.power(ally)).toBe(allyBase + 3000);
    expect(f.power(f.p1Leader())).toBe(leaderBase);
    expect(f.state.players[1].trash.some((c) => c.cardId === "FILLER-1")).toBe(true);
    expect(f.state.players[1].hand).toHaveLength(0);
    expectPaidAndTrashed(f, id, don);
    f.endBattle();
    expect(f.power(ally)).toBe(allyBase);
  });

  it.each(["OP16-020", "OP17-038", "OP17-076"])("%s: declining the cost gives no power and trashes nothing", (id) => {
    const f = fixture();
    const { ally } = board(f);
    f.put("FILLER-1", 1, "HAND");
    const leaderBase = f.power(f.p1Leader());
    const don = f.activeDon();

    f.counter(id, ["skip"]);

    expect(f.power(ally)).toBe(4000);
    expect(f.power(f.p1Leader())).toBe(leaderBase);
    expect(f.state.players[1].hand.map((c) => c.cardId)).toEqual(["FILLER-1"]);
    expectPaidAndTrashed(f, id, don);
  });
});

describe("OPT-894 — [Counter] with a rest / DON!! −1 cost", () => {
  it("OP17-037: You may rest 1 of your cards -> +3000", () => {
    const f = fixture();
    const { ally } = board(f);
    const leaderBase = f.power(f.p1Leader());
    // Cost: rest 1 field card (the Character); target: the Leader.
    f.counter("OP17-037", ["accept", { choice: "0" }, ids(ally), ids(f.p1Leader())]);
    expect(f.state.players[1].characters.find((c) => c?.instanceId === ally.instanceId)?.state).toBe("RESTED");
    expect(f.power(f.p1Leader())).toBe(leaderBase + 3000);
    expect(f.power(ally)).toBe(4000);
    expect(f.trashCount("OP17-037")).toBe(1);
  });

  it("OP17-037: declining gives nothing", () => {
    const f = fixture();
    const { ally } = board(f);
    f.counter("OP17-037", ["skip"]);
    expect(f.power(ally)).toBe(4000);
    expect(f.trashCount("OP17-037")).toBe(1);
  });

  it("ST04-016: DON!! −1 returns a DON!! to the deck, then +4000", () => {
    const f = fixture();
    const { ally } = board(f);
    const donArea = f.state.players[1].donCostArea.length;
    const deck = f.state.players[1].donDeck.length;
    f.counter("ST04-016", [ids(ally)]);
    expect(f.power(ally)).toBe(4000 + 4000);
    // Event cost (1 rest) + DON!! −1 (1 returned)
    expect(f.state.players[1].donCostArea).toHaveLength(donArea - 1);
    expect(f.state.players[1].donDeck).toHaveLength(deck + 1);
    expect(f.trashCount("ST04-016")).toBe(1);
  });

  it("OP17-077: DON!! −1 then Leader +4000", () => {
    const f = fixture();
    const base = f.power(f.p1Leader());
    const donArea = f.state.players[1].donCostArea.length;
    f.counter("OP17-077");
    expect(f.power(f.p1Leader())).toBe(base + 4000);
    expect(f.state.players[1].donCostArea).toHaveLength(donArea - 1);
    expect(f.trashCount("OP17-077")).toBe(1);
  });
});

// ─── Shape 4: type / name filtered targets ───────────────────────────────────

describe("OPT-894 — [Counter] with a type or name filter on the target", () => {
  function filtered(id: string, opts: { type?: string; name?: string; amount: number }) {
    const f = fixture();
    f.state.players.forEach((p) => (p.characters = padChars([])));
    const match = f.put("MATCH-A", 1, "CHARACTER", {
      cost: 3,
      power: 4000,
      name: opts.name ?? "Matching Name",
      types: opts.type ? [opts.type, "Other"] : [],
    });
    const other = f.put("OTHER-A", 1, "CHARACTER", { cost: 3, power: 4000, name: "Someone Else", types: ["Navy"] });
    let offered: string[] = [];
    f.counter(id, [
      {
        select: (x) => {
          offered = (x.state.pendingPrompt!.options as { validTargets: string[] }).validTargets;
          return [match.instanceId];
        },
      },
    ]);
    return { f, match, other, offered };
  }

  it.each([
    ["OP17-055", "Rocks Pirates", 2000],
    ["OP17-056", "Rocks Pirates", 2000],
  ] as const)("%s: only a %s-type Leader/Character is offered, +%i", (id, type, amount) => {
    const { f, match, other, offered } = filtered(id, { type, amount });
    expect(offered).toContain(match.instanceId);
    expect(offered).not.toContain(other.instanceId);
    expect(f.power(match)).toBe(4000 + amount);
    expect(f.power(other)).toBe(4000);
    expect(f.trashCount(id)).toBe(1);
  });

  it("OP17-036: only [Shanks] is offered, +4000", () => {
    const { f, match, other, offered } = filtered("OP17-036", { name: "Shanks", amount: 4000 });
    expect(offered).toEqual([match.instanceId]);
    expect(f.power(match)).toBe(8000);
    expect(f.power(other)).toBe(4000);
  });

  it.each([
    ["OP17-115", 4000],
    ["OP17-117", 3000],
  ] as const)("%s: only [Charlotte Linlin] is offered, +%i", (id, amount) => {
    const { f, match, other, offered } = filtered(id, { name: "Charlotte Linlin", amount });
    expect(offered).toEqual([match.instanceId]);
    expect(f.power(match)).toBe(4000 + amount);
    expect(f.power(other)).toBe(4000);
  });

  it("OP17-017: +2000 to a Whitebeard Pirates card, then -2000 to an opposing Leader/Character this turn", () => {
    const f = fixture();
    const { foe } = board(f);
    const wb = f.put("WB-A", 1, "CHARACTER", { cost: 3, power: 4000, types: ["Whitebeard Pirates"] });
    const other = f.put("OTHER-A", 1, "CHARACTER", { cost: 3, power: 4000, types: ["Navy"] });
    let offered: string[] = [];
    f.counter("OP17-017", [
      {
        select: (x) => {
          offered = (x.state.pendingPrompt!.options as { validTargets: string[] }).validTargets;
          return [wb.instanceId];
        },
      },
      ids(foe),
    ]);
    expect(offered).toContain(wb.instanceId);
    expect(offered).not.toContain(other.instanceId);
    expect(f.power(wb)).toBe(6000);
    expect(f.power(other)).toBe(4000);
    expect(f.power(foe)).toBe(2000);
    expect(f.trashCount("OP17-017")).toBe(1);
    f.endBattle();
    expect(f.power(wb)).toBe(4000); // this battle
    expect(f.power(foe)).toBe(2000); // this turn
  });
});

// ─── Shape 5: conditional "If ..., up to 1 ... gains +N" (met and unmet) ────

describe("OPT-894 — conditional [Counter] power boosts", () => {
  type Row = {
    id: string;
    amount: number;
    met: (f: Fixture) => void;
    unmet: (f: Fixture) => void;
  };
  const chars = (f: Fixture, n: number, overrides: Partial<CardData>) =>
    Array.from({ length: n }, (_, i) => f.put(`COND-${i}-${overrides.name ?? "X"}`, 1, "CHARACTER", { cost: 3, power: 4000, ...overrides }));

  const rows: Row[] = [
    {
      id: "OP16-057",
      amount: 4000,
      met: (f) => {
        f.put("PRISONER-A", 1, "CHARACTER", { name: "Prisoner of Impel Down" });
        f.put("PRISONER-B", 1, "CHARACTER", { name: "Prisoner of Impel Down" });
      },
      unmet: (f) => {
        f.put("PRISONER-A", 1, "CHARACTER", { name: "Prisoner of Impel Down" });
        f.put("NOT-A-PRISONER", 1, "CHARACTER", { name: "Somebody" });
      },
    },
    {
      id: "OP16-076",
      amount: 4000,
      met: (f) => void f.put("ADMIRAL-A", 1, "CHARACTER", { types: ["Admiral"] }),
      unmet: (f) => void f.put("NAVY-A", 1, "CHARACTER", { types: ["Navy"] }),
    },
    {
      id: "OP17-018",
      amount: 4000,
      met: (f) => void chars(f, 2, { name: "Big", power: 8000 }),
      unmet: (f) => {
        chars(f, 1, { name: "Big", power: 8000 });
        chars(f, 1, { name: "Small", power: 7000 });
      },
    },
    {
      id: "OP17-096",
      amount: 4000,
      met: (f) => void f.put("HUGE-A", 0, "CHARACTER", { cost: 12, power: 9000 }),
      unmet: (f) => void f.put("BIG-A", 0, "CHARACTER", { cost: 11, power: 9000 }),
    },
    {
      id: "OP17-116",
      amount: 4000,
      met: (f) => void chars(f, 2, { name: "Trig", triggerText: "[Trigger] Draw 1 card.", keywords: { ...CARDS.TRIGGER.keywords } }),
      unmet: (f) => {
        chars(f, 1, { name: "Trig", triggerText: "[Trigger] Draw 1 card.", keywords: { ...CARDS.TRIGGER.keywords } });
        chars(f, 1, { name: "Plain" });
      },
    },
    {
      id: "ST14-014",
      amount: 3000,
      met: (f) => void f.put("EIGHT-A", 1, "CHARACTER", { cost: 8 }),
      unmet: (f) => void f.put("SEVEN-A", 1, "CHARACTER", { cost: 7 }),
    },
  ];

  it.each(rows)("$id: condition met -> +$amount to the chosen card", ({ id, amount, met }) => {
    const f = fixture();
    f.state.players.forEach((p) => (p.characters = padChars([])));
    const ally = f.put("ALLY-A", 1, "CHARACTER", { cost: 3, power: 4000 });
    met(f);
    const don = f.activeDon();
    f.counter(id, [ids(ally)]);
    expect(f.power(ally)).toBe(4000 + amount);
    expectPaidAndTrashed(f, id, don);
    f.endBattle();
    expect(f.power(ally)).toBe(4000);
  });

  it.each(rows)("$id: condition unmet -> no power, no prompt, Event still spent", ({ id, unmet }) => {
    const f = fixture();
    f.state.players.forEach((p) => (p.characters = padChars([])));
    const ally = f.put("ALLY-A", 1, "CHARACTER", { cost: 3, power: 4000 });
    unmet(f);
    const leaderBase = f.power(f.p1Leader());
    const don = f.activeDon();
    f.counter(id, []);
    expect(f.power(ally)).toBe(4000);
    expect(f.power(f.p1Leader())).toBe(leaderBase);
    expect(f.state.pendingPrompt).toBeNull();
    expectPaidAndTrashed(f, id, don);
  });
});

describe("OPT-894 — OP17-018 counts base power, not buffed power", () => {
  // "If you have 2 or more Characters with a base power of 8000 or more":
  // a 7000-base Character buffed to 8000 does not count.
  it("a 7000-base Character buffed to 8000 does not satisfy the condition", () => {
    const f = fixture();
    f.state.players.forEach((p) => (p.characters = padChars([])));
    const ally = f.put("ALLY-A", 1, "CHARACTER", { cost: 3, power: 4000 });
    f.put("BIG-0", 1, "CHARACTER", { cost: 3, power: 8000 });
    const buffed = f.put("SMALL-0", 1, "CHARACTER", { cost: 3, power: 7000 });
    f.state.activeEffects.push({
      id: "test-buff",
      sourceCardInstanceId: buffed.instanceId,
      sourceEffectBlockId: "test",
      category: "auto",
      modifiers: [{ type: "MODIFY_POWER", target: { type: "SELF" }, params: { amount: 1000 } }],
      duration: { type: "THIS_TURN" },
      expiresAt: { wave: "END_OF_TURN", turn: f.state.turn.number },
      controller: 1,
      appliesTo: [buffed.instanceId],
      timestamp: 1,
    } as never);
    expect(f.power(buffed)).toBe(8000);
    const don = f.activeDon();
    f.counter("OP17-018", []);
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.power(ally)).toBe(4000);
    expectPaidAndTrashed(f, "OP17-018", don);
  });
});

// ─── Shape 6: multi-step Counters ────────────────────────────────────────────

describe("OPT-894 — multi-step [Counter] effects", () => {
  const restDon = (f: Fixture, n: number) =>
    f.state.players[1].donCostArea.slice(0, n).forEach((d) => (d.state = "RESTED"));

  it.each([
    ["ST02-015", 2000],
    ["ST02-016", 4000],
  ] as const)("%s: +%i then set up to 1 DON!! active", (id, amount) => {
    const f = fixture();
    const { ally } = board(f);
    restDon(f, 3); // 3 rested, 3 active
    f.counter(id, [ids(ally), { choice: "choose-value:1" }]);
    expect(f.power(ally)).toBe(4000 + amount);
    // 3 active - 1 for the Event's cost + 1 set active by the effect
    expect(f.activeDon()).toBe(3);
    expect(f.trashCount(id)).toBe(1);
  });

  it("ST03-016: return up to 1 Character with cost 3 or less to its owner's hand", () => {
    const f = fixture();
    const { foe } = board(f);
    const big = f.put("FOE-BIG", 0, "CHARACTER", { cost: 4, power: 6000 });
    let offered: string[] = [];
    f.counter("ST03-016", [
      {
        select: (x) => {
          offered = (x.state.pendingPrompt!.options as { validTargets: string[] }).validTargets;
          return [foe.instanceId];
        },
      },
    ]);
    expect(offered).toContain(foe.instanceId);
    expect(offered).not.toContain(big.instanceId);
    expect(f.state.players[0].characters.some((c) => c?.cardId === foe.cardId)).toBe(false);
    expect(f.state.players[0].hand.some((c) => c.cardId === foe.cardId)).toBe(true);
    expect(f.trashCount("ST03-016")).toBe(1);
  });

  it("ST03-017: +4000, then draws 1 only with 3 or fewer cards in hand", () => {
    const met = fixture();
    const a = board(met).ally;
    const deck = met.state.players[1].deck.length;
    met.counter("ST03-017", [ids(a)]);
    expect(met.power(a)).toBe(8000);
    expect(met.state.players[1].hand).toHaveLength(1);
    expect(met.state.players[1].deck).toHaveLength(deck - 1);

    const unmet = fixture();
    const b = board(unmet).ally;
    for (let i = 0; i < 4; i++) unmet.put(`HAND-${i}`, 1, "HAND"); // 4 remain after the Event leaves
    unmet.counter("ST03-017", [ids(b)]);
    expect(unmet.power(b)).toBe(8000);
    expect(unmet.state.players[1].hand).toHaveLength(4);
  });

  it("ST06-014: +4000 then K.O. up to 1 active opposing Character with cost 3 or less", () => {
    const f = fixture();
    const { ally } = board(f);
    f.state.players[0].characters = padChars([]);
    const active = f.put("FOE-ACTIVE", 0, "CHARACTER", { cost: 3, power: 3000 });
    const rested = f.put("FOE-RESTED", 0, "CHARACTER", { cost: 2, power: 3000 });
    f.state.players[0].characters.find((c) => c?.instanceId === rested.instanceId)!.state = "RESTED";
    const pricey = f.put("FOE-PRICEY", 0, "CHARACTER", { cost: 4, power: 3000 });
    let offered: string[] = [];
    f.counter("ST06-014", [
      ids(ally),
      {
        select: (x) => {
          offered = (x.state.pendingPrompt!.options as { validTargets: string[] }).validTargets;
          return [active.instanceId];
        },
      },
    ]);
    expect(f.power(ally)).toBe(8000);
    expect(offered).toEqual([active.instanceId]);
    const onBoard = f.state.players[0].characters.filter(Boolean).map((c) => c!.cardId);
    expect(onBoard).not.toContain("FOE-ACTIVE");
    expect(onBoard).toEqual(expect.arrayContaining(["FOE-RESTED", "FOE-PRICEY"]));
    expect(f.state.players[0].trash.some((c) => c.cardId === "FOE-ACTIVE")).toBe(true);
    void pricey;
  });

  it("ST10-015: +2000 then K.O. up to 1 opposing Character with 2000 power or less", () => {
    const f = fixture();
    const { ally } = board(f);
    f.state.players[0].characters = padChars([]);
    const weak = f.put("FOE-WEAK", 0, "CHARACTER", { cost: 5, power: 2000 });
    const strong = f.put("FOE-STRONG", 0, "CHARACTER", { cost: 1, power: 3000 });
    let offered: string[] = [];
    f.counter("ST10-015", [
      ids(ally),
      {
        select: (x) => {
          offered = (x.state.pendingPrompt!.options as { validTargets: string[] }).validTargets;
          return [weak.instanceId];
        },
      },
    ]);
    expect(f.power(ally)).toBe(6000);
    expect(offered).toEqual([weak.instanceId]);
    expect(f.state.players[0].trash.some((c) => c.cardId === "FOE-WEAK")).toBe(true);
    expect(f.state.players[0].characters.some((c) => c?.instanceId === strong.instanceId)).toBe(true);
  });
});

describe("OPT-894 — Life / deck / bounce Counters", () => {
  it("ST09-014: with 2 or less Life, an opposing Leader/Character gets -3000 this turn", () => {
    const f = fixture();
    const { foe } = board(f);
    f.state.players[1].life = f.state.players[1].life.slice(0, 2);
    const foeLeaderBase = f.power(f.state.players[0].leader);
    f.counter("ST09-014", [ids(foe)]);
    expect(f.power(foe)).toBe(1000);
    expect(f.power(f.state.players[0].leader)).toBe(foeLeaderBase);
    f.endBattle();
    expect(f.power(foe)).toBe(1000); // this turn, not this battle
  });

  it("ST09-014: with 3 or more Life nothing happens", () => {
    const f = fixture();
    const { foe } = board(f);
    expect(f.state.players[1].life.length).toBeGreaterThanOrEqual(3);
    f.counter("ST09-014", []);
    expect(f.power(foe)).toBe(4000);
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.trashCount("ST09-014")).toBe(1);
  });

  it("ST13-018: +2000, then draws 1 only with 0 Life cards", () => {
    const zero = fixture();
    const a = board(zero).ally;
    zero.state.players[1].life = [];
    const handBefore = zero.state.players[1].hand.length; // 0; the Event leaves, one card is drawn
    zero.counter("ST13-018", [ids(a)]);
    expect(zero.power(a)).toBe(6000);
    expect(zero.state.players[1].hand).toHaveLength(handBefore + 1);

    const some = fixture();
    const b = board(some).ally;
    const before = some.state.players[1].hand.length;
    some.counter("ST13-018", [ids(b)]);
    expect(some.power(b)).toBe(6000);
    expect(some.state.players[1].hand).toHaveLength(before);
    expect(some.state.players[1].deck.length).toBe(zero.state.players[1].deck.length + 1);
  });

  it("ST13-017: +4000, then reorders all Life cards", () => {
    const f = fixture();
    const { ally } = board(f);
    const life = f.state.players[1].life.map((c) => c.instanceId);
    const reversed = [...life].reverse();
    f.counter("ST13-017", [
      ids(ally),
      {
        raw: () => ({
          type: "ARRANGE_TOP_CARDS",
          keptCardInstanceId: "",
          orderedInstanceIds: reversed,
          destination: "top",
        }),
      },
    ]);
    expect(f.power(ally)).toBe(8000);
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.state.players[1].life.map((c) => c.instanceId)).toEqual(reversed);
    expect(f.trashCount("ST13-017")).toBe(1);
  });

  it("ST07-016: looks at a Life card, then +2000", () => {
    const f = fixture();
    const { ally } = board(f);
    const life = f.state.players[1].life.map((c) => c.instanceId);
    f.counter("ST07-016", [
      ids(f.state.players[1].life[0] as unknown as CardInstance),
      { choice: "top" },
      ids(ally),
    ]);
    expect(f.power(ally)).toBe(6000);
    expect(f.state.players[1].life.map((c) => c.instanceId)).toEqual(life);
  });

  it("ST12-017: +2000, then reveals the top card and plays it if it is a cost-2 Character", () => {
    const f = fixture();
    const { ally } = board(f);
    f.put("TOP-TWO", 1, "HAND", { cost: 2, power: 3000 });
    const top = f.state.players[1].hand.pop()!;
    f.state.players[1].deck.unshift({ ...top, zone: "DECK" });
    const chars = f.state.players[1].characters.filter(Boolean).length;
    f.counter("ST12-017", [
      ids(ally),
      {
        raw: () => ({
          type: "ARRANGE_TOP_CARDS",
          keptCardInstanceId: top.instanceId,
          keptCardInstanceIds: [top.instanceId],
          orderedInstanceIds: [],
          destination: "bottom",
        }),
      },
    ]);
    expect(f.power(ally)).toBe(6000);
    expect(f.state.players[1].characters.filter(Boolean)).toHaveLength(chars + 1);
    expect(f.state.players[1].characters.some((c) => c?.cardId === "TOP-TWO")).toBe(true);
  });

  it("P-059: without [Uta] as Leader the Counter does nothing", () => {
    const f = fixture();
    f.state.players.forEach((p) => (p.characters = padChars([])));
    const a = f.put("RET-A", 1, "CHARACTER", { cost: 2, power: 3000 });
    const leaderBase = f.power(f.p1Leader());
    f.counter("P-059", []);
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.power(f.p1Leader())).toBe(leaderBase);
    expect(f.state.players[1].characters.some((c) => c?.instanceId === a.instanceId)).toBe(true);
    expect(f.trashCount("P-059")).toBe(1);
  });

  it("P-059 (deferred, OPT-912): with [Uta], the Counter stays non-executing: no Character returns, no power", () => {
    const f = fixture();
    f.state.players.forEach((p) => (p.characters = padChars([])));
    f.leaderData({ name: "Uta" });
    const a = f.put("RET-A", 1, "CHARACTER", { cost: 2, power: 3000 });
    const b = f.put("RET-B", 1, "CHARACTER", { cost: 2, power: 3000 });
    const c = f.put("STAY-C", 1, "CHARACTER", { cost: 2, power: 3000 });
    const leaderBase = f.power(f.p1Leader());
    const don = f.activeDon();
    f.counter("P-059", []);
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.state.players[1].characters.filter(Boolean).map((x) => x!.instanceId)).toEqual(
      [a, b, c].map((x) => x.instanceId),
    );
    expect(f.state.players[1].hand.some((x) => x.cardId.startsWith("RET-") || x.cardId === "STAY-C")).toBe(false);
    expect(f.power(f.p1Leader())).toBe(leaderBase);
    expectPaidAndTrashed(f, "P-059", don);
  });

  // GAP (OPT-912): P-059 "you may return ANY NUMBER of Characters ... +2000 for
  // every returned Character". Its Counter block is kept `activate` (see
  // KNOWN_DEFERRED_COUNTER_EVENT) because flipping it to `auto` today is
  // harmful: (1) a `count: { any_number }` target auto-selects EVERY valid card
  // instead of letting the player choose how many (target-resolver.ts
  // resolveTargets / needsPlayerTargetSelection); (2) PER_COUNT
  // CHARACTERS_RETURNED_THIS_WAY reads only the `__cost_cards_returned` ref,
  // which a costs[] entry fills, so the action-based return yields +0
  // (dynamic-values.ts THIS_WAY_TO_COST_REF). Ratchet: when OPT-912 lands, flip
  // P-059 to `auto`, drop it from KNOWN_DEFERRED_COUNTER_EVENT, drop `.fails`,
  // and delete the deferred test above.
  it.fails("P-059 (GAP, OPT-912): with [Uta], returning 2 of 3 Characters gives the Leader +4000 and keeps the third", () => {
    const f = fixture();
    f.state.players.forEach((p) => (p.characters = padChars([])));
    f.leaderData({ name: "Uta" });
    const a = f.put("RET-A", 1, "CHARACTER", { cost: 2, power: 3000 });
    const b = f.put("RET-B", 1, "CHARACTER", { cost: 2, power: 3000 });
    f.put("STAY-C", 1, "CHARACTER", { cost: 2, power: 3000 });
    const leaderBase = f.power(f.p1Leader());
    f.counter("P-059", ["accept", ids(a, b), ids(f.p1Leader())]);
    expect(f.power(f.p1Leader())).toBe(leaderBase + 4000);
    expect(f.state.players[1].characters.filter(Boolean).map((c) => c!.cardId)).toEqual(["STAY-C"]);
    expect(f.state.players[1].hand.map((c) => c.cardId).sort()).toEqual(["RET-A", "RET-B"]);
  });
});

// ─── Known gap: compound [Main]/[Counter] blocks (follow-up) ────────────────

describe("OPT-894 — compound [Main]/[Counter] triggers (known gap, follow-up)", () => {
  // GAP: 11 cards author `[Main]/[Counter]` as ONE block with
  // trigger { any_of: [MAIN_EVENT, COUNTER_EVENT] }. battle.ts
  // (executeUseCounterEvent) and execute.ts (PLAY_CARD) both select with
  // `"keyword" in trigger`, so the compound block is never selected and the
  // card resolves neither effect. Ratchet: drop `.fails` (and the id from
  // KNOWN_COMPOUND_COUNTER_EVENT_GAP) when fixed.
  it.fails("OP08-019 (GAP): [Counter] -3000 to an opposing Character, then +3000 to your Character", () => {
    const f = fixture();
    const { ally, foe } = board(f);
    f.counter("OP08-019", [ids(foe), ids(ally)]);
    expect(f.power(foe)).toBe(1000);
    expect(f.power(ally)).toBe(7000);
  });

  it.fails("OP08-019 (GAP): [Main] resolves from PLAY_CARD", () => {
    const f = fixture();
    const { foe } = board(f);
    const ev = f.put("OP08-019", 0, "HAND", { type: "Event", cost: 1, power: null, counter: null, effectText: canonicalText("OP08-019") });
    f.act({ type: "PLAY_CARD", cardInstanceId: ev.instanceId }, 0);
    expect(f.state.pendingPrompt).not.toBeNull();
    void foe;
  });
});

// ─── The 39 re-authored cards: block inventory (P-059 deferred, OPT-912) ───────────────────────────────

// 39 cards; P-059 is deferred (OPT-912) and ratcheted in opt-894-counter-event-lint.test.ts.
const REAUTHORED = [
  "OP16-020", "OP16-038", "OP16-040", "OP16-057", "OP16-059", "OP16-076", "OP16-099", "OP16-100",
  "OP17-017", "OP17-018", "OP17-036", "OP17-037", "OP17-038", "OP17-055", "OP17-056", "OP17-076",
  "OP17-077", "OP17-078", "OP17-096", "OP17-097", "OP17-098", "OP17-115", "OP17-116", "OP17-117",
  "ST01-014", "ST02-015", "ST02-016", "ST03-016", "ST03-017", "ST04-016", "ST06-014",
  "ST06-016", "ST07-016", "ST09-014", "ST10-015", "ST12-017", "ST13-017", "ST13-018", "ST14-014",
];

describe("OPT-894 — the 39 re-authored Counter Events", () => {
  it.each(REAUTHORED)("%s: exactly one auto COUNTER_EVENT block; [Main]/[Trigger] blocks untouched", (id) => {
    const schema = getAllAuthoredSchemas()[id];
    const text = canonicalText(id);
    const counter = schema.effects.filter((b) => b.trigger && "keyword" in b.trigger && b.trigger.keyword === "COUNTER_EVENT");
    expect(counter.map((b) => b.category)).toEqual(["auto"]);
    const main = schema.effects.filter((b) => b.trigger && "keyword" in b.trigger && b.trigger.keyword === "MAIN_EVENT");
    expect(main).toHaveLength(text.includes("[Main]") ? 1 : 0);
    for (const b of main) expect(b.category).toBe("activate"); // consumer selects MAIN_EVENT by keyword only
    const trig = schema.effects.filter((b) => b.trigger && "keyword" in b.trigger && b.trigger.keyword === "TRIGGER");
    expect(trig).toHaveLength(text.includes("**Trigger:**") ? 1 : 0);
    for (const b of trig) expect(b.category).toBe("auto");
  });
});
