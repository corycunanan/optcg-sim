import { describe, expect, it } from "vitest";
import type { CardData, CardInstance, GameAction } from "../types.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import { runPipeline } from "../engine/pipeline.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { getEffectivePower } from "../engine/modifiers.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";

// Official FAQ regressions for ST-31..ST-36 (docs/FAQs/qa_st-31.md .. qa_st-36.md),
// tracked by OPT-831 and OPT-841..844. ST31-004, ST32-002 (opt-829-st31-st32),
// ST34-002 (opt-970-if-then-chain), ST34-004 (opt-614, opt-832) and ST36-005
// (eb05-st-faq-regressions) are covered elsewhere.
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
  function put(id: string, controller: 0 | 1, zone: CardInstance["zone"] = "CHARACTER") {
    const card: CardInstance = {
      cardId: id,
      instanceId: `${id}-${controller}-${serial++}`,
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
    else if (zone === "CHARACTER") p.characters[p.characters.findIndex((c) => !c)] = card;
    else if (zone === "HAND") p.hand.push(card);
    else if (zone === "TRASH") p.trash.push(card);
    else if (zone === "DECK") p.deck.push(card);
    else if (zone === "LIFE") p.life.unshift({ instanceId: card.instanceId, cardId: id, face: "DOWN" });
    if (["LEADER", "STAGE", "CHARACTER"].includes(zone))
      state = registerCardEnteredField(state, card, db.get(id)!);
    return card;
  }
  function act(action: GameAction, player = state.turn.activePlayerIndex, rejected = false) {
    const result = runPipeline(state, action, db, player);
    expect(result.valid, result.error).toBe(!rejected);
    if (result.valid) state = result.state;
    return result;
  }
  function choice(action: GameAction, rejected = false) {
    const result = resumePromptLifecycle(state, action, db, {
      drainPregame: (s) => s,
      advanceStartOfTurn: (s) => s,
    });
    expect(result.responseRejected, JSON.stringify({ action, prompt: state.pendingPrompt })).toBe(rejected);
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
    expect(options?.promptType, JSON.stringify(state.pendingPrompt)).toBe("SELECT_TARGET");
    if (options?.promptType !== "SELECT_TARGET") throw new Error(JSON.stringify(options));
    return options;
  }
  /** Empties a player's hand so a test controls exactly what it holds. */
  function clearHand(player: 0 | 1) {
    state.players[player].hand = [];
  }
  function fillHand(player: 0 | 1, count: number) {
    while (state.players[player].hand.length < count) put(CARDS.VANILLA.id, player, "HAND");
  }
  function find(instanceId: string): CardInstance | undefined {
    for (const p of state.players) {
      const hit = p.characters.find((c) => c?.instanceId === instanceId);
      if (hit) return hit;
    }
    return undefined;
  }
  /** Seeds already-given DON!! (e.g. the non-turn player's, which cannot ATTACH_DON now). */
  function seed(card: CardInstance, count: number) {
    const live = find(card.instanceId) ?? state.players[card.controller].leader;
    for (let i = 0; i < count; i++) {
      live.attachedDon.push({ instanceId: `seed-${card.instanceId}-${i}`, state: "ACTIVE", attachedTo: live.instanceId });
    }
  }
  function donArea(player: 0 | 1, count: number) {
    state.players[player].donCostArea = Array.from({ length: count }, (_, i) => ({
      instanceId: `don-${player}-${i}`,
      state: "ACTIVE" as const,
      attachedTo: null,
    }));
  }
  function leader(player: 0 | 1, overrides: Partial<CardData>) {
    const id = `leader-${player}-${serial++}`;
    data(id, { ...CARDS.LEADER, id, name: id, effectSchema: null, ...overrides });
    put(id, player, "LEADER");
  }
  function power(instanceId: string) {
    const card = find(instanceId) ?? [state.players[0].leader, state.players[1].leader].find((l) => l.instanceId === instanceId)!;
    return getEffectivePower(card, db.get(card.cardId)!, state, db);
  }
  return {
    db, data, put, act, choice, select, accept, targets, clearHand, fillHand, find, seed, donArea, leader, power,
    setState(next: typeof state) { state = next; },
    get state() { return state; },
  };
}

type F = ReturnType<typeof fixture>;

/** A 6000-power player-0 attacker beats player 1's 5000 Leader; block and counter pass. */
function attackLeaderToTrigger(f: F) {
  f.data("attacker-6000", { power: 6000 });
  const attacker = f.put("attacker-6000", 0);
  f.act({ type: "DECLARE_ATTACK", attackerInstanceId: attacker.instanceId, targetInstanceId: f.state.players[1].leader.instanceId }, 0);
  f.act({ type: "PASS" }, 1);
  f.act({ type: "PASS" }, 1);
  expect(f.state.pendingPrompt?.options.promptType).toBe("REVEAL_TRIGGER");
}

// ─── ST-31 ────────────────────────────────────────────────────────────────────

describe("ST31-002 Jinbe", () => {
  // FAQ: the [On Play] can play "ST31-005 Thousand Sunny".
  it("plays ST31-005 Thousand Sunny (a cost-1 Straw Hat Crew Stage) from hand", () => {
    const f = fixture();
    f.data("ST31-005", { type: "Stage", cost: 1, power: null, counter: null, types: ["Straw Hat Crew"] });
    f.data("ST31-002", { cost: 4, power: 5000, types: ["Fish-Man", "Straw Hat Crew"] });
    f.data("crew-two", { cost: 2, types: ["Straw Hat Crew"] });
    f.clearHand(0);
    const sunny = f.put("ST31-005", 0, "HAND");
    const costTwo = f.put("crew-two", 0, "HAND");
    const jinbe = f.put("ST31-002", 0, "HAND");
    f.act({ type: "PLAY_CARD", cardInstanceId: jinbe.instanceId });
    const prompt = f.targets();
    expect(prompt.validTargets).toContain(sunny.instanceId);
    expect(prompt.validTargets).not.toContain(costTwo.instanceId);
    f.select([sunny.instanceId]);
    expect(f.state.players[0].stage?.cardId).toBe("ST31-005");
    expect(f.state.players[0].hand.some((c) => c.instanceId === sunny.instanceId)).toBe(false);
  });
});

describe("ST31-003 Brook", () => {
  // Player 1 owns Brook (the defender). Player 0 attacks with ST34-005, whose
  // [When Attacking] K.O.s a base-2000 Character.
  function scene() {
    const f = fixture();
    f.data("ST31-003", { cost: 4, power: 4000, types: ["Straw Hat Crew"] });
    f.data("ST34-005", { cost: 4, power: 6000, types: ["Big Mom Pirates"] });
    f.data("small", { cost: 1, power: 2000 });
    const brook = f.put("ST31-003", 1);
    const holder = f.put("small", 1);
    const attacker = f.put("ST34-005", 0);
    return { f, brook, holder, attacker };
  }

  // FAQ: the total counts DON!! given to Brook, other Characters and the Leader.
  it("counts DON!! given to itself, other Characters and the Leader toward 3", () => {
    const { f, brook, holder } = scene();
    f.seed(brook, 1);
    f.seed(holder, 1);
    expect(f.power(brook.instanceId)).toBe(4000); // opponent's turn; DON!! +1000 only on the owner's turn
    f.seed(f.state.players[1].leader, 1);
    expect(f.power(brook.instanceId)).toBe(7000);
  });

  // FAQ: a [When Attacking] that drops the total to 2 or less removes [Blocker]
  // before the Block Step.
  it.each([false, true])("cannot block after a [When Attacking] K.O. drops the total below 3 (K.O.=%s)", (ko) => {
    const { f, brook, holder, attacker } = scene();
    f.seed(f.state.players[1].leader, 1);
    f.seed(holder, 2);
    expect(f.power(brook.instanceId)).toBe(7000);
    f.act({ type: "DECLARE_ATTACK", attackerInstanceId: attacker.instanceId, targetInstanceId: f.state.players[1].leader.instanceId }, 0);
    if (ko) {
      f.accept();
      f.select([holder.instanceId]);
      expect(f.find(holder.instanceId)).toBeUndefined();
    } else {
      f.choice({ type: "PASS" });
    }
    expect(f.state.pendingPrompt).toBeNull();
    const result = runPipeline(f.state, { type: "DECLARE_BLOCKER", blockerInstanceId: brook.instanceId }, f.db, 1);
    expect(result.valid, result.error).toBe(!ko);
    expect(f.power(brook.instanceId)).toBe(ko ? 4000 : 7000);
  });
});

// ─── ST-32 ────────────────────────────────────────────────────────────────────

describe("ST32-003 Dracule Mihawk", () => {
  // FAQ: cost 5 or less applies to both the [Perona] and the <Slash> alternative.
  it("offers only cost ≤5 [Perona] or <Slash> Characters", () => {
    const f = fixture();
    f.leader(0, { attribute: ["Slash"] });
    f.data("perona-5", { name: "Perona", cost: 5, attribute: ["Special"] });
    f.data("perona-6", { name: "Perona", cost: 6, attribute: ["Special"] });
    f.data("slash-5", { cost: 5, attribute: ["Slash"] });
    f.data("slash-6", { cost: 6, attribute: ["Slash"] });
    f.data("strike-3", { cost: 3, attribute: ["Strike"] });
    f.data("ST32-003", { cost: 2, power: 4000, attribute: ["Slash"] });
    f.clearHand(0);
    const [p5, , s5] = ["perona-5", "perona-6", "slash-5", "slash-6", "strike-3"].map((id) => f.put(id, 0, "HAND"));
    const mihawk = f.put("ST32-003", 0, "HAND");
    f.act({ type: "PLAY_CARD", cardInstanceId: mihawk.instanceId });
    expect(f.targets().validTargets.sort()).toEqual([p5.instanceId, s5.instanceId].sort());
    f.select([s5.instanceId]);
    expect(f.state.players[0].characters.some((c) => c?.cardId === "slash-5")).toBe(true);
  });
});

describe("ST32-005 Roronoa Zoro", () => {
  // FAQ: [Rush: Character] does not allow attacking Characters on the controller's first turn.
  it.each([[1, false], [3, true]])("turn %i: can attack a rested Character=%s", (turn, allowed) => {
    const f = fixture();
    // Printed keywords come from imported card data, as in production.
    f.data("ST32-005", { cost: 3, power: 5000, attribute: ["Slash"], keywords: { ...CARDS.VANILLA.keywords, rushCharacter: true } });
    const target = f.put(CARDS.VANILLA.id, 1);
    f.find(target.instanceId)!.state = "RESTED";
    const zoro = f.put("ST32-005", 0, "HAND");
    f.state.turn.number = turn;
    f.act({ type: "PLAY_CARD", cardInstanceId: zoro.instanceId });
    const played = f.state.players[0].characters.find((c) => c?.cardId === "ST32-005")!;
    const result = runPipeline(f.state, { type: "DECLARE_ATTACK", attackerInstanceId: played.instanceId, targetInstanceId: target.instanceId }, f.db, 0);
    expect(result.valid, result.error).toBe(allowed);
    if (!allowed) expect(result.error).toContain("first turn");
  });
});

// ─── ST-33 ────────────────────────────────────────────────────────────────────

describe("ST33 hand-trash costs", () => {
  // FAQ ST33-001: with only Koby in hand, the trash cost cannot be paid, so no draw.
  it.each([false, true])("ST33-001 Koby draws only when a card can be trashed (extra card=%s)", (extra) => {
    const f = fixture();
    f.data("ST33-001", { cost: 2, power: 2000, types: ["Navy"] });
    f.clearHand(0);
    const spare = extra ? f.put(CARDS.VANILLA.id, 0, "HAND") : null;
    const koby = f.put("ST33-001", 0, "HAND");
    const deck = f.state.players[0].deck.length;
    f.act({ type: "PLAY_CARD", cardInstanceId: koby.instanceId });
    if (spare) {
      f.accept();
      f.select([spare.instanceId]);
    }
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.state.players[0].deck).toHaveLength(extra ? deck - 1 : deck);
    expect(f.state.players[0].hand).toHaveLength(extra ? 1 : 0);
  });

  // FAQ ST33-003: with only Smoker in hand, nothing goes to the bottom of the deck.
  it.each([false, true])("ST33-003 Smoker removes cost ≤2 Characters only after trashing (extra card=%s)", (extra) => {
    const f = fixture();
    f.data("ST33-003", { cost: 4, power: 5000, types: ["Navy"] });
    f.data("cheap", { cost: 2 });
    const victim = f.put("cheap", 1);
    f.clearHand(0);
    const spare = extra ? f.put(CARDS.VANILLA.id, 0, "HAND") : null;
    const smoker = f.put("ST33-003", 0, "HAND");
    f.act({ type: "PLAY_CARD", cardInstanceId: smoker.instanceId });
    if (spare) {
      f.accept();
      f.select([spare.instanceId]);
      f.select([victim.instanceId]);
    }
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.find(victim.instanceId) === undefined).toBe(extra);
  });
});

describe("ST33-002 Sakazuki", () => {
  function scene(ownHand: number, oppHand: number) {
    const f = fixture();
    f.data("ST33-002", { cost: 7, power: 8000, types: ["Navy"] });
    const sakazuki = f.put("ST33-002", 0);
    f.clearHand(0);
    f.clearHand(1);
    f.fillHand(0, ownHand);
    f.fillHand(1, oppHand);
    f.act({ type: "DECLARE_ATTACK", attackerInstanceId: sakazuki.instanceId, targetInstanceId: f.state.players[1].leader.instanceId }, 0);
    return f;
  }

  // FAQ: no hand card means no cost, so the opponent trashes nothing.
  it("with an empty hand the opponent trashes nothing", () => {
    const f = scene(0, 7);
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.state.players[1].hand).toHaveLength(7);
  });

  // FAQ: the cost may be paid when the opponent has 5 or fewer cards; they trash nothing.
  it("pays the cost against a 5-card hand, and the opponent trashes nothing", () => {
    const f = scene(1, 5);
    const trash = f.state.players[0].trash.length;
    f.accept();
    f.select([f.state.players[0].hand[0].instanceId]);
    expect(f.state.players[0].hand).toHaveLength(0);
    expect(f.state.players[0].trash).toHaveLength(trash + 1);
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.state.players[1].hand).toHaveLength(5);
  });

  it("against a 6-card hand the opponent chooses 1 card to trash", () => {
    const f = scene(1, 6);
    f.accept();
    f.select([f.state.players[0].hand[0].instanceId]);
    expect(f.state.pendingPrompt?.respondingPlayer).toBe(1);
    const prompt = f.targets();
    expect(prompt).toMatchObject({ countMin: 1, countMax: 1 });
    f.select(prompt.validTargets.slice(0, 1));
    expect(f.state.players[1].hand).toHaveLength(5);
  });
});

// ─── ST-34 ────────────────────────────────────────────────────────────────────

describe("ST34-001 Charlotte Katakuri", () => {
  // FAQ: with two Katakuri and 10 DON!!, the first return triggers both copies;
  // the second resolves with an empty DON!! deck and still spends its
  // [Once Per Turn], so a later return adds nothing.
  it("two copies refill only one DON!! across two returns at 10 DON!!", () => {
    const f = fixture();
    f.leader(0, { types: ["Big Mom Pirates"] });
    f.data("ST34-001", { cost: 8, power: 9000, types: ["Big Mom Pirates"] });
    f.data("ST34-005", { cost: 4, power: 6000, types: ["Big Mom Pirates"] });
    const katakuri = [f.put("ST34-001", 0), f.put("ST34-001", 0)];
    const first = f.put("ST34-005", 0);
    const second = f.put("ST34-005", 0);
    f.donArea(0, 10);
    f.state.players[0].donDeck = [];
    const field = () => f.state.players[0].donCostArea.length;
    const resolve = (attacker: CardInstance) => {
      f.act({ type: "DECLARE_ATTACK", attackerInstanceId: attacker.instanceId, targetInstanceId: f.state.players[1].leader.instanceId }, 0);
      f.accept();
      for (let i = 0; i < 6 && f.state.pendingPrompt; i++) {
        const options = f.state.pendingPrompt.options;
        if (options.promptType === "SELECT_TARGET") f.select([]);
        else if (options.promptType === "OPTIONAL_EFFECT") f.accept();
        else if (options.promptType === "PLAYER_CHOICE") f.choice({ type: "PLAYER_CHOICE", choiceId: options.choices[options.choices.length - 1].id });
        else break;
      }
    };
    resolve(first);
    expect(field()).toBe(10);
    expect(f.state.players[0].donDeck).toHaveLength(0);
    // Both copies triggered on the first return; the second added nothing.
    expect(f.state.turn.oncePerTurnUsed.your_turn_don_returned_add_don?.sort()).toEqual(katakuri.map((k) => k.instanceId).sort());
    // Finish the first battle: no block, no counter, take the damage.
    f.act({ type: "PASS" }, 1);
    f.act({ type: "PASS" }, 1);
    if (f.state.pendingPrompt?.options.promptType === "REVEAL_TRIGGER")
      f.choice({ type: "REVEAL_TRIGGER", reveal: false });
    expect(f.state.turn.battle).toBeNull();
    resolve(second);
    expect(field()).toBe(9);
    expect(f.state.players[0].donDeck).toHaveLength(1);
  });
});

// ─── ST-35 ────────────────────────────────────────────────────────────────────

describe("ST35-003 Karasu", () => {
  function scene(oppHand: number) {
    const f = fixture();
    f.data("ST35-003", { cost: 5, power: 6000, types: ["Revolutionary Army"] });
    const karasu = f.put("ST35-003", 0);
    f.clearHand(1);
    f.fillHand(1, oppHand);
    f.act({ type: "DECLARE_ATTACK", attackerInstanceId: karasu.instanceId, targetInstanceId: f.state.players[1].leader.instanceId }, 0);
    const deck = f.state.players[0].deck.length;
    const trash = f.state.players[0].trash.length;
    f.accept();
    return { f, deck, trash };
  }

  // FAQ: the opponent of Karasu's controller chooses the card to trash.
  it("the opponent chooses 1 card to trash at 7 cards", () => {
    const { f, deck, trash } = scene(7);
    expect(f.state.players[0].deck).toHaveLength(deck - 2);
    expect(f.state.players[0].trash).toHaveLength(trash + 2);
    expect(f.state.pendingPrompt?.respondingPlayer).toBe(1);
    const prompt = f.targets();
    expect(prompt).toMatchObject({ countMin: 1, countMax: 1 });
    f.select(prompt.validTargets.slice(0, 1));
    expect(f.state.players[1].hand).toHaveLength(6);
  });

  // FAQ: the mill cost can be paid at 6 or fewer, and the opponent trashes nothing.
  it("mills 2 against a 6-card hand, and the opponent trashes nothing", () => {
    const { f, deck, trash } = scene(6);
    expect(f.state.players[0].deck).toHaveLength(deck - 2);
    expect(f.state.players[0].trash).toHaveLength(trash + 2);
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.state.players[1].hand).toHaveLength(6);
  });
});

// ─── ST-36 ────────────────────────────────────────────────────────────────────

describe("ST36-001 Cavendish", () => {
  // FAQ: with no hand card, the [On K.O.] cannot add a Life card.
  it.each([false, true])("adds a Life card on K.O. only when a card can be trashed (hand card=%s)", (hasCard) => {
    const f = fixture();
    f.data("ST36-001", { cost: 5, power: 6000, types: ["Supernovas"] });
    const cavendish = f.put("ST36-001", 1);
    f.clearHand(1);
    const spare = hasCard ? f.put(CARDS.VANILLA.id, 1, "HAND") : null;
    const life = f.state.players[1].life.length;
    // Player 0 K.O.s the rested Cavendish in battle.
    f.find(cavendish.instanceId)!.state = "RESTED";
    f.data("attacker-7000", { power: 7000 });
    const attacker = f.put("attacker-7000", 0);
    f.act({ type: "DECLARE_ATTACK", attackerInstanceId: attacker.instanceId, targetInstanceId: cavendish.instanceId }, 0);
    f.act({ type: "PASS" }, 1);
    f.act({ type: "PASS" }, 1);
    expect(f.find(cavendish.instanceId)).toBeUndefined();
    if (spare) {
      f.accept();
      f.select([spare.instanceId]);
      // "Up to 1": choose 1.
      f.choice({ type: "PLAYER_CHOICE", choiceId: "choose-value:1" });
    }
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.state.players[1].life).toHaveLength(hasCard ? life + 1 : life);
  });
});

describe("ST36-002 Killer", () => {
  // FAQ: the [Your Turn] [On Play] does not activate when its [Trigger] plays
  // it during the opponent's turn.
  it("played by its [Trigger] on the opponent's turn adds no Life card", () => {
    const f = fixture();
    f.leader(1, { types: ["Kid Pirates", "Supernovas"] });
    f.data("ST36-002", { cost: 4, power: 5000, types: ["Kid Pirates", "Supernovas"], keywords: { ...CARDS.VANILLA.keywords, trigger: true } });
    f.state.players[0].life = f.state.players[0].life.slice(0, 3);
    f.put("ST36-002", 1, "LIFE");
    const lifeBefore = f.state.players[1].life.length;
    attackLeaderToTrigger(f);
    f.choice({ type: "REVEAL_TRIGGER", reveal: true });
    expect(f.state.players[1].characters.some((c) => c?.cardId === "ST36-002")).toBe(true);
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.state.players[1].life).toHaveLength(lifeBefore - 1);
  });
});

describe("ST36-003 Scratchmen Apoo", () => {
  // FAQ: the [Trigger] draws even when the Leader is not {Supernovas}; only the
  // base-power change is skipped.
  it.each([false, true])("draws 1 via [Trigger]; Leader base power 7000 only if {Supernovas}=%s", (supernovas) => {
    const f = fixture();
    f.leader(1, { types: supernovas ? ["Supernovas"] : ["Navy"] });
    f.data("ST36-003", { cost: 3, power: 4000, types: ["Supernovas"], keywords: { ...CARDS.VANILLA.keywords, trigger: true } });
    f.put("ST36-003", 1, "LIFE");
    attackLeaderToTrigger(f);
    const hand = f.state.players[1].hand.length;
    const deck = f.state.players[1].deck.length;
    f.choice({ type: "REVEAL_TRIGGER", reveal: true });
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.state.players[1].deck).toHaveLength(deck - 1);
    expect(f.state.players[1].hand).toHaveLength(hand + 1);
    expect(f.power(f.state.players[1].leader.instanceId)).toBe(supernovas ? 7000 : 5000);
  });
});

describe("ST36-004 Bartolomeo", () => {
  // FAQ: without a {Supernovas} card in hand, the [On Play] cannot draw 2.
  it.each([false, true])("draws 2 only after trashing a {Supernovas} card (has one=%s)", (has) => {
    const f = fixture();
    f.data("ST36-004", { cost: 3, power: 4000, types: ["Barto Club", "Supernovas"] });
    f.data("supernova", { types: ["Supernovas"] });
    f.clearHand(0);
    f.put(CARDS.VANILLA.id, 0, "HAND");
    const nova = has ? f.put("supernova", 0, "HAND") : null;
    const barto = f.put("ST36-004", 0, "HAND");
    const deck = f.state.players[0].deck.length;
    f.act({ type: "PLAY_CARD", cardInstanceId: barto.instanceId });
    if (nova) {
      f.accept();
      expect(f.targets().validTargets).toEqual([nova.instanceId]);
      f.select([nova.instanceId]);
    }
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.state.players[0].deck).toHaveLength(has ? deck - 2 : deck);
  });
});
