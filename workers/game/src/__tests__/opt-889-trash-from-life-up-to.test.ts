import { describe, expect, it } from "vitest";
import { AUTHORED_SCHEMAS } from "../engine/authored-schemas.generated.js";
import type { Action, EffectSchema } from "../engine/effect-types.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import { runPipeline } from "../engine/pipeline.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import type { CardData, CardInstance, GameAction, GameState } from "../types.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";

// OPT-889. Printed text (docs/cards/*.md):
// - EB03-057 / OP10-109 "[On K.O.] Trash up to 1 card from the top of your
//   opponent's Life cards."
// - OP03-114 "[On Play] If your Leader has the {Big Mom Pirates} type, add up
//   to 1 card from the top of your deck to the top of your Life cards. Then,
//   trash up to 1 card from the top of your opponent's Life cards."
// - OP03-120 "[Main] If your opponent has 4 or more Life cards, trash up to 1
//   card from the top of your opponent's Life cards."
// - OP08-119 "[When Attacking] DON!! -10: K.O. all Characters other than this
//   Character. Then, add up to 1 card from the top of your deck to the top of
//   your Life cards and trash up to 1 card from the top of your opponent's
//   Life cards."
// - OP09-107 "[On Play] If your opponent has 3 or more Life cards, trash up to
//   1 card from the top of your opponent's Life cards."
// - OP10-112 "[On Play] You may rest this Character: Trash up to 1 card from
//   the top of your opponent's Life cards."
// - ST04-001 "[Activate: Main] [Once Per Turn] DON!! -7: Trash up to 1 of your
//   opponent's Life cards."
// - ST09-010 "[Once Per Turn] If this Character would be K.O.'d, you may trash
//   1 card from the top or bottom of your Life cards instead."

function inst(id: string, cardId: string, owner: 0 | 1, zone: CardInstance["zone"]): CardInstance {
  return {
    instanceId: id,
    cardId,
    controller: owner,
    owner,
    zone,
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: 0,
  };
}

function fixture(opts: { oppLife?: number; donCount?: number } = {}) {
  const db = createTestCardDb();
  let state = createBattleReadyState(db);
  state.players.forEach((p) => {
    p.characters = padChars([]);
    p.hand = [];
  });
  if (opts.donCount) {
    state.players[0].donCostArea = Array.from({ length: opts.donCount }, (_, i) => ({
      instanceId: `don-x-${i}`,
      state: "ACTIVE" as const,
      attachedTo: null,
    }));
  }
  // Opponent top Life is a [Trigger] card: trashing Life must never reveal it,
  // and each Life card is distinguishable by instance id.
  state.players[1].life = state.players[1].life
    .slice(0, opts.oppLife ?? 5)
    .map((c, i) => (i === 0 ? { ...c, cardId: CARDS.TRIGGER.id } : c));

  function register(id: string, extra: Partial<CardData> = {}) {
    const schema = getEffectSchema(id);
    expect(schema, id).toBeTruthy();
    db.set(id, {
      ...CARDS.VANILLA,
      id,
      name: schema!.card_name,
      cost: 0,
      effectSchema: schema!,
      ...extra,
    } as CardData);
  }

  function act(action: GameAction, player: 0 | 1 = 0) {
    if (state.pendingPrompt) {
      const r = resumePromptLifecycle(state, action, db, {
        drainPregame: (s) => s,
        advanceStartOfTurn: (s) => s,
      });
      expect(r.responseRejected, JSON.stringify(action)).toBe(false);
      state = r.state;
    } else {
      const r = runPipeline(state, action, db, player);
      expect(r.valid, r.error).toBe(true);
      state = r.state;
    }
    state = JSON.parse(JSON.stringify(state)) as GameState;
  }

  /** Test-only "[Activate: Main] K.O. 1 of your Characters" source. */
  function koSource(): CardInstance {
    const schema: EffectSchema = {
      card_id: "OPT889-KO",
      card_name: "OPT889-KO",
      card_type: "Character",
      effects: [
        {
          id: "ko",
          category: "activate",
          trigger: { keyword: "ACTIVATE_MAIN" },
          actions: [
            { type: "KO", target: { type: "CHARACTER", controller: "SELF", count: { exact: 1 } } },
          ],
        },
      ],
    };
    db.set("OPT889-KO", { ...CARDS.VANILLA, id: "OPT889-KO", effectSchema: schema });
    const c = inst("ko-src", "OPT889-KO", 0, "CHARACTER");
    state.players[0].characters[1] = c;
    state = registerCardEnteredField(state, c, db.get("OPT889-KO")!);
    return c;
  }

  function putChar(id: string, slot = 0): CardInstance {
    const c = inst(`${id}-field`, id, 0, "CHARACTER");
    state.players[0].characters[slot] = c;
    state = registerCardEnteredField(state, c, db.get(id)!);
    return c;
  }

  return {
    db,
    register,
    act,
    koSource,
    putChar,
    get state() {
      return state;
    },
  };
}

type F = ReturnType<typeof fixture>;

function answerUpTo(f: F, value: number, expectedMax: number) {
  const prompt = f.state.pendingPrompt;
  expect(prompt?.options.promptType).toBe("PLAYER_CHOICE");
  expect(prompt?.respondingPlayer).toBe(0);
  if (prompt?.options.promptType !== "PLAYER_CHOICE") throw new Error("no up-to prompt");
  expect(prompt.options.choices.map((c) => c.id)).toEqual(
    Array.from({ length: expectedMax + 1 }, (_, v) => `choose-value:${v}`),
  );
  f.act({ type: "PLAYER_CHOICE", choiceId: `choose-value:${value}` });
}

/** Opponent Life after the effect: untouched for 0, top card to their trash for 1. */
function expectOppLife(f: F, before: GameState["players"][0]["life"], trashedCount: 0 | 1) {
  const opp = f.state.players[1];
  expect(opp.life).toEqual(before.slice(trashedCount));
  expect(opp.trash).toHaveLength(trashedCount);
  if (trashedCount === 1) {
    expect(opp.trash[0].cardId).toBe(CARDS.TRIGGER.id);
    expect(opp.trash[0].owner).toBe(1);
  }
  // Trashing Life is not damage: no [Trigger] activation, nothing left pending.
  expect(f.state.eventLog.some((e) => e.type === "TRIGGER_ACTIVATED")).toBe(false);
  expect(f.state.pendingPrompt).toBeNull();
  expect(f.state.effectStack).toHaveLength(0);
}

describe("OPT-889 opponent-Life trashes are 'up to 1'", () => {
  describe.each([0, 1] as const)("OP09-107 (On Play, 3+ Life), choose %i", (choose) => {
    it("offers 0 or 1 and trashes only what was chosen", () => {
      const f = fixture({ oppLife: 4 });
      f.register("OP09-107", { types: ["Big Mom Pirates"] });
      f.state.players[0].hand = [inst("h", "OP09-107", 0, "HAND")];
      const before = structuredClone(f.state.players[1].life);
      f.act({ type: "PLAY_CARD", cardInstanceId: "h" });
      answerUpTo(f, choose, 1);
      expectOppLife(f, before, choose);
      expect(f.state.players[0].trash).toHaveLength(0);
    });
  });

  it("OP09-107 with 2 opponent Life fails its condition and never prompts", () => {
    const f = fixture({ oppLife: 2 });
    f.register("OP09-107");
    f.state.players[0].hand = [inst("h", "OP09-107", 0, "HAND")];
    const before = structuredClone(f.state.players[1].life);
    f.act({ type: "PLAY_CARD", cardInstanceId: "h" });
    expectOppLife(f, before, 0);
  });

  describe.each([0, 1] as const)("OP10-112 (rest this Character), choose %i", (choose) => {
    it("pays the optional cost, then trashes 0 or 1", () => {
      const f = fixture();
      f.register("OP10-112");
      f.state.players[0].hand = [inst("h", "OP10-112", 0, "HAND")];
      const before = structuredClone(f.state.players[1].life);
      f.act({ type: "PLAY_CARD", cardInstanceId: "h" });
      expect(f.state.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
      f.act({ type: "PLAYER_CHOICE", choiceId: "accept" });
      answerUpTo(f, choose, 1);
      expectOppLife(f, before, choose);
    });
  });

  it("OP10-112 with an empty opponent Life offers only 0 and trashes nothing", () => {
    const f = fixture({ oppLife: 0 });
    f.register("OP10-112");
    f.state.players[0].hand = [inst("h", "OP10-112", 0, "HAND")];
    f.act({ type: "PLAY_CARD", cardInstanceId: "h" });
    expect(f.state.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
    f.act({ type: "PLAYER_CHOICE", choiceId: "accept" });
    // Pins current behavior: CHOOSE_VALUE with max 0 still raises a
    // single-choice "0" PLAYER_CHOICE. OPT-918 makes it auto-resolve; when
    // that lands, replace this answer with `expect(pendingPrompt).toBeNull()`.
    answerUpTo(f, 0, 0);
    expect(f.state.players[1].life).toHaveLength(0);
    expect(f.state.players[1].trash).toHaveLength(0);
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.state.effectStack).toHaveLength(0);
  });

  describe.each(["EB03-057", "OP10-109"])("%s (On K.O.)", (id) => {
    it.each([0, 1] as const)("K.O. then choose %i", (choose) => {
      const f = fixture();
      f.register(id);
      const c = f.putChar(id);
      const src = f.koSource();
      const before = structuredClone(f.state.players[1].life);
      f.act({ type: "ACTIVATE_EFFECT", cardInstanceId: src.instanceId, effectId: "ko" });
      if (f.state.pendingPrompt?.options.promptType === "SELECT_TARGET") {
        f.act({ type: "SELECT_TARGET", selectedInstanceIds: [c.instanceId] });
      }
      if (f.state.pendingPrompt?.options.promptType === "OPTIONAL_EFFECT") {
        f.act({ type: "PLAYER_CHOICE", choiceId: "accept" });
      }
      expect(f.state.players[0].trash.some((t) => t.cardId === id)).toBe(true);
      answerUpTo(f, choose, 1);
      expectOppLife(f, before, choose);
    });
  });

  describe.each([0, 1] as const)("OP03-114 (add Life, then trash), trash-choice %i", (choose) => {
    it("the add clause is independent of the trash choice", () => {
      const f = fixture();
      f.register("OP03-114", { types: ["Big Mom Pirates"] });
      f.db.set("LEADER-T", { ...f.db.get("LEADER-T")!, types: ["Big Mom Pirates"] });
      f.state.players[0].hand = [inst("h", "OP03-114", 0, "HAND")];
      const before = structuredClone(f.state.players[1].life);
      const ownLife = f.state.players[0].life.length;
      f.act({ type: "PLAY_CARD", cardInstanceId: "h" });
      answerUpTo(f, 1, 1); // add up to 1 from deck
      expect(f.state.players[0].life).toHaveLength(ownLife + 1);
      answerUpTo(f, choose, 1); // trash up to 1 of the opponent's Life
      expectOppLife(f, before, choose);
      expect(f.state.players[0].life).toHaveLength(ownLife + 1);
    });
  });

  it("OP03-114: declining the add still leaves the trash choice (choose 1)", () => {
    const f = fixture();
    f.register("OP03-114", { types: ["Big Mom Pirates"] });
    f.db.set("LEADER-T", { ...f.db.get("LEADER-T")!, types: ["Big Mom Pirates"] });
    f.state.players[0].hand = [inst("h", "OP03-114", 0, "HAND")];
    const before = structuredClone(f.state.players[1].life);
    const ownLife = f.state.players[0].life.length;
    f.act({ type: "PLAY_CARD", cardInstanceId: "h" });
    answerUpTo(f, 0, 1); // decline "add up to 1 card ... to the top of your Life"
    expect(f.state.players[0].life).toHaveLength(ownLife);
    // "Then, trash up to 1 card" is still offered after the add is declined.
    answerUpTo(f, 1, 1);
    // Printed "up to 1" and the player chose 1: exactly one card, the top.
    expectOppLife(f, before, 1);
    expect(f.state.players[1].life).toHaveLength(before.length - 1);
    expect(f.state.players[0].life).toHaveLength(ownLife);
  });

  describe.each([0, 1] as const)("OP03-120 (Main event, 4+ Life), choose %i", (choose) => {
    it("offers 0 or 1", () => {
      const f = fixture({ oppLife: 4 });
      f.register("OP03-120", {
        type: "Event",
        effectText: "[Main] If your opponent has 4 or more Life cards, trash up to 1 card from the top of your opponent's Life cards.",
      });
      f.state.players[0].hand = [inst("h", "OP03-120", 0, "HAND")];
      const before = structuredClone(f.state.players[1].life);
      f.act({ type: "PLAY_CARD", cardInstanceId: "h" });
      answerUpTo(f, choose, 1);
      expectOppLife(f, before, choose);
    });
  });

  describe.each([0, 1] as const)("ST04-001 (Leader, DON!! -7), choose %i", (choose) => {
    it("pays DON!! -7, then trashes 0 or 1", () => {
      const f = fixture({ donCount: 8 });
      f.register("ST04-001", { type: "Leader", cost: null });
      f.state.players[0].leader = inst("ldr", "ST04-001", 0, "LEADER");
      const before = structuredClone(f.state.players[1].life);
      f.act({ type: "ACTIVATE_EFFECT", cardInstanceId: "ldr", effectId: "activate_trash_life" });
      if (f.state.pendingPrompt?.options.promptType === "OPTIONAL_EFFECT") {
        f.act({ type: "PLAYER_CHOICE", choiceId: "accept" });
      }
      answerUpTo(f, choose, 1);
      expectOppLife(f, before, choose);
    });
  });

  describe.each([0, 1] as const)("OP08-119 (When Attacking, DON!! -10), trash-choice %i", (choose) => {
    it("K.O. and add-Life still resolve; the trash is optional", () => {
      const f = fixture({ donCount: 10 });
      f.register("OP08-119", { power: 12000 });
      const me = f.putChar("OP08-119");
      me.turnPlayed = 0;
      const before = structuredClone(f.state.players[1].life);
      const ownLife = f.state.players[0].life.length;
      f.act({
        type: "DECLARE_ATTACK",
        attackerInstanceId: me.instanceId,
        targetInstanceId: f.state.players[1].leader.instanceId,
      });
      if (f.state.pendingPrompt?.options.promptType === "OPTIONAL_EFFECT") {
        f.act({ type: "PLAYER_CHOICE", choiceId: "accept" });
      }
      answerUpTo(f, 1, 1); // add up to 1
      expect(f.state.players[0].life).toHaveLength(ownLife + 1);
      answerUpTo(f, choose, 1);
      expect(f.state.players[1].life).toEqual(before.slice(choose));
      expect(f.state.players[1].trash).toHaveLength(choose);
    });
  });
});

describe("OPT-889 ST09-010 trashes the top or bottom of its own Life", () => {
  function setup() {
    const f = fixture();
    f.register("ST09-010");
    const ace = f.putChar("ST09-010");
    const src = f.koSource();
    // Mark own Life so the top and bottom cards are distinguishable.
    f.state.players[0].life = f.state.players[0].life.map((c, i) => ({ ...c, instanceId: `own-life-${i}` }));
    const ownBefore = structuredClone(f.state.players[0].life);
    const oppBefore = structuredClone(f.state.players[1].life);
    f.act({ type: "ACTIVATE_EFFECT", cardInstanceId: src.instanceId, effectId: "ko" });
    if (f.state.pendingPrompt?.options.promptType === "SELECT_TARGET") {
      f.act({ type: "SELECT_TARGET", selectedInstanceIds: [ace.instanceId] });
    }
    expect(f.state.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
    expect(f.state.pendingPrompt?.respondingPlayer).toBe(0);
    return { f, ace, ownBefore, oppBefore };
  }

  function choose(f: F, end: "top" | "bottom") {
    const prompt = f.state.pendingPrompt;
    expect(prompt?.options.promptType).toBe("PLAYER_CHOICE");
    if (prompt?.options.promptType !== "PLAYER_CHOICE") throw new Error("no position prompt");
    expect(prompt.respondingPlayer).toBe(0);
    expect(prompt.options.choices).toHaveLength(2);
    const pick = prompt.options.choices.find((c) => c.label.toLowerCase().includes(end));
    expect(pick).toBeTruthy();
    // The position prompt carries no Life identities.
    expect(JSON.stringify(prompt.options)).not.toContain("own-life-");
    f.act({ type: "PLAYER_CHOICE", choiceId: pick!.id });
  }

  it("top: the top Life card is trashed and Ace stays", () => {
    const { f, ace, ownBefore, oppBefore } = setup();
    f.act({ type: "PLAYER_CHOICE", choiceId: "accept" });
    choose(f, "top");
    expect(f.state.players[0].life.map((c) => c.instanceId)).toEqual(
      ownBefore.slice(1).map((c) => c.instanceId),
    );
    expect(f.state.players[0].trash).toHaveLength(1);
    expect(f.state.players[0].characters.some((c) => c?.instanceId === ace.instanceId)).toBe(true);
    expect(f.state.players[1].life).toEqual(oppBefore);
    expect(f.state.pendingPrompt).toBeNull();
  });

  it("bottom: the bottom Life card is trashed and Ace stays", () => {
    const { f, ace, ownBefore, oppBefore } = setup();
    f.act({ type: "PLAYER_CHOICE", choiceId: "accept" });
    choose(f, "bottom");
    expect(f.state.players[0].life.map((c) => c.instanceId)).toEqual(
      ownBefore.slice(0, -1).map((c) => c.instanceId),
    );
    expect(f.state.players[0].trash).toHaveLength(1);
    expect(f.state.players[0].characters.some((c) => c?.instanceId === ace.instanceId)).toBe(true);
    expect(f.state.players[1].life).toEqual(oppBefore);
    expect(f.state.pendingPrompt).toBeNull();
  });

  it("declining the 'you may' lets Ace be K.O.'d and keeps Life", () => {
    const { f, ace, ownBefore } = setup();
    f.act({ type: "PLAYER_CHOICE", choiceId: "skip" });
    expect(f.state.players[0].characters.some((c) => c?.instanceId === ace.instanceId)).toBe(false);
    expect(f.state.players[0].life).toEqual(ownBefore);
  });
});

describe("OPT-889 authored shape", () => {
  const UP_TO = [
    "EB03-057", "OP03-114", "OP03-120", "OP08-119",
    "OP09-107", "OP10-109", "OP10-112", "ST04-001",
  ];
  function lifeTrashes(cardId: string): Action[] {
    const out: Action[] = [];
    const walk = (n: unknown, inCost: boolean) => {
      if (Array.isArray(n)) return n.forEach((x) => walk(x, inCost));
      if (!n || typeof n !== "object") return;
      const r = n as Record<string, unknown>;
      if (r.type === "TRASH_FROM_LIFE" && !inCost) out.push(r as unknown as Action);
      for (const [k, v] of Object.entries(r)) walk(v, k === "costs");
    };
    walk(AUTHORED_SCHEMAS[cardId], false);
    return out;
  }
  it.each(UP_TO)("%s opponent-Life trash is up_to", (id) => {
    const actions = lifeTrashes(id).filter((a) => {
      const p = (a as { params?: { controller?: string } }).params;
      const t = (a as { target?: { type?: string } }).target;
      return p?.controller === "OPPONENT" || t?.type === "OPPONENT_LIFE";
    });
    expect(actions).toHaveLength(1);
    expect((actions[0] as { params: { up_to?: boolean } }).params.up_to).toBe(true);
  });

  // ST04-001 prints "Trash up to 1 of your opponent's Life cards" (any
  // position). Choosing among Life cards needs a target prompt over Life that
  // does not exist yet; the leader is authored top-only. Tracked by OPT-917.
  // This pins the intended end state and must pass once OPT-917 lands.
  it.fails("ST04-001 lets the activating player trash a non-top Life card (OPT-917)", () => {
    const f = fixture({ donCount: 8 });
    f.register("ST04-001", { type: "Leader", cost: null });
    f.state.players[0].leader = inst("ldr", "ST04-001", 0, "LEADER");
    // Zone transitions mint a new instance id, so the face-up card gets a
    // unique cardId to identify it after it reaches the trash.
    const FACE_UP_ID = "OPT889-FACEUP";
    f.db.set(FACE_UP_ID, { ...CARDS.VANILLA, id: FACE_UP_ID });
    f.state.players[1].life = f.state.players[1].life.map((c, i) => ({
      ...c,
      ...(i === 2 ? { cardId: FACE_UP_ID } : {}),
      face: i === 2 ? "UP" : "DOWN",
    }));
    const lifeBefore = structuredClone(f.state.players[1].life);
    const top = lifeBefore[0];
    const faceUp = lifeBefore[2];
    expect(lifeBefore.filter((c) => c.cardId === FACE_UP_ID)).toHaveLength(1);
    expect(top.cardId).toBe(CARDS.TRIGGER.id);
    f.act({ type: "ACTIVATE_EFFECT", cardInstanceId: "ldr", effectId: "activate_trash_life" });
    // Drive whatever prompts the effect raises: accept the optional, choose 1
    // for an up-to count, and pick the face-up card when targets are offered.
    // Assumes OPT-917 offers a SELECT_TARGET over current Life instance ids;
    // if it uses another prompt shape (e.g. a position PLAYER_CHOICE), adapt
    // this loop, not the end-state assertions below.
    let picked = false;
    for (let guard = 0; f.state.pendingPrompt && guard < 5; guard++) {
      const opts = f.state.pendingPrompt.options;
      if (opts.promptType === "OPTIONAL_EFFECT") {
        f.act({ type: "PLAYER_CHOICE", choiceId: "accept" });
      } else if (opts.promptType === "PLAYER_CHOICE" && opts.choices.some((c) => c.id === "choose-value:1")) {
        f.act({ type: "PLAYER_CHOICE", choiceId: "choose-value:1" });
      } else if (opts.promptType === "SELECT_TARGET") {
        expect(opts.validTargets).toContain(faceUp.instanceId);
        f.act({ type: "SELECT_TARGET", selectedInstanceIds: [faceUp.instanceId] });
        picked = true;
      } else {
        throw new Error(`unexpected prompt ${opts.promptType}`);
      }
    }
    expect(picked).toBe(true);
    const opp = f.state.players[1];
    expect(opp.trash.map((c) => c.cardId)).toEqual([FACE_UP_ID]);
    // The other Life cards never moved, so their instance ids are unchanged.
    expect(opp.life.map((c) => c.instanceId)).toEqual(
      lifeBefore.filter((c) => c.instanceId !== faceUp.instanceId).map((c) => c.instanceId),
    );
    expect(opp.life[0].instanceId).toBe(top.instanceId);
    expect(opp.life.some((c) => c.cardId === FACE_UP_ID)).toBe(false);
    expect(f.state.pendingPrompt).toBeNull();
  });
});
