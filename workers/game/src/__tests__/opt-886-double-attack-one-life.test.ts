/**
 * OPT-886 — a [Double Attack] against 1 Life cannot win through its second
 * damage, and its second damage is always dealt.
 *
 * Expected values come from the rules sources, not from the implementation:
 * - qa_rules.md:156-158 — "If my opponent has 1 Life card, can I win the game
 *   by using a [Double Attack] to deal 2 damage? No, you cannot."
 * - qa_rules.md:152-154 — the remaining damage is fixed at 2 and is still dealt
 *   even if the attacker leaves the field or loses [Double Attack] because of
 *   the first damage's [Trigger] "or for any other reason".
 * - qa_op03.md:283-285 (OP03-118) — a first-Life [Trigger] that adds a Life
 *   card resolves before the second damage, which then takes that card.
 * - Comprehensive rules 7-1-4-1-1-1 (the win check is made "at the point when
 *   it is determined that damage will be dealt"), 7-1-4-1-1-3 (a 2-damage
 *   attack repeats 7-1-4-1-1-2, the Life-to-hand step, not the win check),
 *   9-1-2 (rule processing is immediate, "even if other actions are in the
 *   process of being carried out") and 9-2-1-1 (a Leader taking damage at 0
 *   Life is defeated).
 *
 * Everything is driven through the real action pipeline with registered
 * authored schemas; prompts are answered through `resumePromptLifecycle`
 * (the GameSession prompt path), optionally after a JSON round-trip of the
 * persisted session (`parseStoredSession`, what SessionRepository loads).
 */
import { describe, expect, it } from "vitest";
import type { CardData, CardInstance, GameAction, GameState, LifeCard } from "../types.js";
import type { EffectSchema } from "../engine/effect-types.js";
import { runPipeline } from "../engine/pipeline.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { parseStoredSession } from "../session/persistence.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";

const SERVICES = { drainPregame: (s: GameState) => s, advanceStartOfTurn: (s: GameState) => s };

// OP03-043 Gaimon: "When you deal damage to your opponent's Life, you may trash
// 3 cards from the top of your deck. If you do, trash this Character."
const GAIMON: CardData = {
  ...CARDS.VANILLA,
  id: "OP03-043",
  name: "Gaimon",
  power: 5000,
  color: ["Blue"],
  types: ["East Blue"],
  effectSchema: getEffectSchema("OP03-043")!,
};
// Same printed effect with [Double Attack] granted by the fixture, so Gaimon's
// own effect removes the attacker between the two damages.
const GAIMON_DA: CardData = {
  ...GAIMON,
  keywords: { ...GAIMON.keywords, doubleAttack: true },
};
// OP03-118 Ikoku Sovereignty: "[Trigger] You may trash 2 cards from your hand:
// Add up to 1 card from the top of your deck to the top of your Life cards."
const IKOKU: CardData = {
  ...CARDS.TRIGGER,
  id: "OP03-118",
  name: "Ikoku Sovereignty",
  type: "Event",
  power: null,
  effectSchema: getEffectSchema("OP03-118")!,
};
// Fixture watcher: an optional auto effect on "When you take damage", so a
// prompt opens inside the same Damage Step as a damage at 0 Life.
const DAMAGE_WATCHER: CardData = {
  ...CARDS.VANILLA,
  id: "OPT886-DAMAGE-WATCHER",
  name: "Damage watcher",
  effectSchema: {
    effects: [{
      id: "on_damage_optional_draw",
      category: "auto",
      trigger: { event: "DAMAGE_TAKEN" },
      flags: { optional: true },
      actions: [{ type: "DRAW", params: { amount: 1 } }],
    }],
  } as EffectSchema,
};
// Fixture [Trigger] that K.O.s up to 1 opponent Character — the "attacker
// leaves the field because of the first damage's [Trigger]" case.
const KO_TRIGGER: CardData = {
  ...CARDS.TRIGGER,
  id: "OPT886-KO-TRIGGER",
  name: "K.O. trigger",
  effectSchema: {
    effects: [{
      id: "trigger_ko",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [{
        type: "KO",
        target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 } },
      }],
    }],
  } as EffectSchema,
};

function fixture(lifeTop: string[]) {
  const cardDb = createTestCardDb();
  for (const card of [GAIMON, IKOKU, DAMAGE_WATCHER, KO_TRIGGER]) cardDb.set(card.id, card);
  cardDb.set("OPT886-GAIMON-DA", { ...GAIMON_DA, id: "OPT886-GAIMON-DA" });
  let state = createBattleReadyState(cardDb);
  state.players[0].characters = padChars([]);
  state.players[1].characters = padChars([]);
  const life = (owner: 0 | 1, ids: string[]): LifeCard[] =>
    ids.map((cardId, i) => ({ instanceId: `life-${owner}-${i}`, cardId, face: "DOWN" }));
  state.players[0].life = life(0, [CARDS.VANILLA.id, CARDS.VANILLA.id, CARDS.VANILLA.id]);
  state.players[1].life = life(1, lifeTop);
  const put = (cardId: string, controller: 0 | 1, tag = "") => {
    const instanceId = `${cardId}-${controller}${tag}`;
    const card: CardInstance = {
      instanceId,
      cardId,
      zone: "CHARACTER",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 0,
      controller,
      owner: controller,
    };
    const index = state.players[controller].characters.findIndex((c) => !c);
    state.players[controller].characters[index] = card;
    state = registerCardEnteredField(state, card, cardDb.get(cardId)!);
    return card;
  };
  return { cardDb, put, get state() { return state; } };
}

const roundTrip = (state: GameState, cardDb: Map<string, CardData>) => {
  const stored = parseStoredSession(JSON.parse(JSON.stringify({ state, cardDb: Object.fromEntries(cardDb), mode: "PVP" })));
  return { state: stored.state, cardDb: new Map(Object.entries(stored.cardDb)) };
};

interface DriveOptions {
  optional?: "accept" | "skip";
  reveal?: boolean;
  persistAtPrompts?: boolean;
}

/**
 * Declare `attackerId` on the defending Leader and drive the battle to its end:
 * every optional prompt is answered with `optional`, every selection with the
 * minimum legal set, every value choice with its largest option, and every defender Life [Trigger] with `reveal`. With
 * `persistAtPrompts`, the session is JSON round-tripped at every prompt and
 * [Trigger] pause before it is answered.
 */
function attack(f: { state: GameState; cardDb: Map<string, CardData> }, attackerId: string, opts: DriveOptions = {}) {
  let cardDb = f.cardDb;
  let result = runPipeline(
    f.state,
    { type: "DECLARE_ATTACK", attackerInstanceId: attackerId, targetInstanceId: f.state.players[1].leader.instanceId },
    cardDb,
    0,
  );
  expect(result.valid).toBe(true);
  let state = result.state;
  let gameOver = result.gameOver;
  for (let i = 0; i < 2 && !gameOver; i++) {
    result = runPipeline(state, { type: "PASS" }, cardDb, 0);
    expect(result.valid).toBe(true);
    state = result.state;
    gameOver = result.gameOver ?? gameOver;
  }
  const prompts: string[] = [];
  let persisted = 0;
  for (let guard = 0; guard < 30 && !gameOver && state.status === "IN_PROGRESS"; guard++) {
    const prompt = state.pendingPrompt;
    const triggerPending = !!state.turn.battle?.pendingTriggerLifeCard;
    if ((prompt || triggerPending) && opts.persistAtPrompts) {
      ({ state, cardDb } = roundTrip(state, cardDb));
      persisted++;
    }
    if (prompt) {
      const options = prompt.options;
      prompts.push(options.promptType);
      let reply: GameAction;
      if (options.promptType === "OPTIONAL_EFFECT") {
        reply = { type: "PLAYER_CHOICE", choiceId: opts.optional ?? "accept" };
      } else if (options.promptType === "SELECT_TARGET") {
        reply = { type: "SELECT_TARGET", selectedInstanceIds: options.validTargets.slice(0, Math.max(1, options.countMin)) };
      } else if (options.promptType === "PLAYER_CHOICE") {
        // "Up to N" value choices: take the largest (e.g. OP03-118 adds 1).
        reply = { type: "PLAYER_CHOICE", choiceId: options.choices.filter((c) => !c.disabled).at(-1)!.id };
      } else {
        throw new Error(`unexpected prompt ${options.promptType}`);
      }
      const resumed = resumePromptLifecycle(state, reply, cardDb, SERVICES);
      expect(resumed.responseRejected).toBe(false);
      state = resumed.state;
      gameOver = resumed.gameOver;
      continue;
    }
    if (triggerPending) {
      prompts.push("REVEAL_TRIGGER");
      const revealed = runPipeline(state, { type: "REVEAL_TRIGGER", reveal: opts.reveal ?? false }, cardDb, 1);
      expect(revealed.valid).toBe(true);
      state = revealed.state;
      gameOver = revealed.gameOver;
      continue;
    }
    break;
  }
  return { state, gameOver, prompts, persisted, cardDb };
}

const damageEvents = (state: GameState) =>
  state.eventLog.filter((e) => e.type === "DAMAGE_DEALT").map((e) => e.payload);

/** The game is still running and the attack has fully ended. */
function expectGameContinues(state: GameState, gameOver: unknown) {
  expect(gameOver).toBeFalsy();
  expect(state.status).toBe("IN_PROGRESS");
  expect(state.winner ?? null).toBeNull();
  expect(state.pendingPrompt ?? null).toBeNull();
  expect(state.turn.battle).toBeNull();
  expect(state.turn.pendingBattleDamageContinuation ?? null).toBeNull();
  expect(state.eventLog.some((e) => e.type === "GAME_OVER")).toBe(false);
}

function expectAttackerWins(state: GameState, gameOver: unknown) {
  expect(gameOver).toEqual({ winner: 0, reason: "Player 2's life reached 0" });
  expect(state.status).toBe("FINISHED");
  expect(state.winner).toBe(0);
  expect(state.eventLog.filter((e) => e.type === "GAME_OVER")).toHaveLength(1);
}

describe("OPT-886 [Double Attack] against 1 Life cannot win (qa_rules.md:156-158)", () => {
  it("no watcher: both damages are dealt, the Life area empties, the game continues", () => {
    const f = fixture([CARDS.VANILLA.id]);
    const da = f.put(CARDS.DOUBLE_ATK.id, 0);
    const handBefore = f.state.players[1].hand.length;
    const { state, gameOver, prompts } = attack(f, da.instanceId);
    expect(prompts).toEqual([]);
    expectGameContinues(state, gameOver);
    expect(state.players[1].life).toHaveLength(0);
    expect(state.players[1].hand).toHaveLength(handBefore + 1);
    // Two damages, the second finds 0 Life (fixed at 2, qa_rules.md:154).
    expect(damageEvents(state).map((p) => [p.firstDamageOfAttack, p.lethal ?? false])).toEqual([
      [true, false],
      [false, true],
    ]);
  });

  it.each([false, true])("first-Life [Trigger] declined/activated (reveal=%s): the game continues", (reveal) => {
    const f = fixture([CARDS.TRIGGER.id]);
    const da = f.put(CARDS.DOUBLE_ATK.id, 0);
    const { state, gameOver, prompts } = attack(f, da.instanceId, { reveal });
    expect(prompts).toEqual(["REVEAL_TRIGGER"]);
    expectGameContinues(state, gameOver);
    expect(state.players[1].life).toHaveLength(0);
  });

  it.each([false, true])(
    "OP03-118 [Trigger] adds a Life card; the second damage takes it and the game continues (persist=%s)",
    (persistAtPrompts) => {
      const f = fixture([IKOKU.id]);
      const da = f.put(CARDS.DOUBLE_ATK.id, 0);
      const handBefore = f.state.players[1].hand.length;
      const deckBefore = f.state.players[1].deck.length;
      expect(handBefore).toBeGreaterThanOrEqual(2);
      const { state, gameOver, prompts, persisted } = attack(f, da.instanceId, { reveal: true, persistAtPrompts });
      expect(prompts[0]).toBe("REVEAL_TRIGGER");
      expect(prompts).toContain("OPTIONAL_EFFECT");
      if (persistAtPrompts) expect(persisted).toBe(prompts.length);
      expectGameContinues(state, gameOver);
      // qa_op03.md:283-285: the added card went to Life before the second
      // damage, which took it into the defender's hand.
      expect(state.players[1].life).toHaveLength(0);
      expect(state.players[1].trash.some((c) => c.cardId === IKOKU.id)).toBe(true);
      // Hand: −2 (the [Trigger] cost) +1 (the added Life card, taken by the
      // second damage). Deck: −1 (the card added to Life).
      expect(state.players[1].hand).toHaveLength(handBefore - 1);
      expect(state.players[1].deck).toHaveLength(deckBefore - 1);
      expect(state.eventLog.filter((e) => e.type === "CARD_ADDED_TO_HAND_FROM_LIFE")).toHaveLength(1);
      expect(damageEvents(state).map((p) => p.lethal ?? false)).toEqual([false, false]);
    },
  );

  it.each([
    ["accept", false],
    ["skip", false],
    ["accept", true],
    ["skip", true],
  ] as const)("Gaimon's first-damage prompt answered %s (persist=%s): the game continues", (optional, persistAtPrompts) => {
    const f = fixture([CARDS.VANILLA.id]);
    const gaimon = f.put(GAIMON.id, 0);
    const da = f.put(CARDS.DOUBLE_ATK.id, 0);
    const { state, gameOver, prompts, persisted } = attack(f, da.instanceId, { optional, persistAtPrompts });
    expect(prompts).toEqual(["OPTIONAL_EFFECT"]);
    if (persistAtPrompts) expect(persisted).toBe(1);
    expectGameContinues(state, gameOver);
    expect(state.players[1].life).toHaveLength(0);
    expect(state.players[0].characters.some((c) => c?.instanceId === gaimon.instanceId)).toBe(optional === "skip");
  });

  it("an optional [Trigger] effect paused at its prompt, persisted, then answered: the game continues", () => {
    // IKOKU with an empty hand cannot pay → the reveal is not offered; use the
    // K.O. trigger with a target prompt instead so the Life-removal
    // continuation (pendingBattleDamageContinuation) is persisted.
    const f = fixture([KO_TRIGGER.id]);
    const da = f.put(CARDS.DOUBLE_ATK.id, 0);
    f.put(CARDS.VANILLA.id, 0, "-bystander");
    const { state, gameOver, prompts, persisted } = attack(f, da.instanceId, { reveal: true, persistAtPrompts: true });
    expect(prompts).toEqual(["REVEAL_TRIGGER", "SELECT_TARGET"]);
    expect(persisted).toBe(2);
    expectGameContinues(state, gameOver);
    expect(state.players[1].life).toHaveLength(0);
  });
});

describe("OPT-886 the second damage is always dealt (qa_rules.md:152-154)", () => {
  it("Gaimon with [Double Attack] trashes itself after the first damage: 2 damage is still dealt", () => {
    const f = fixture([CARDS.TRIGGER.id, CARDS.VANILLA.id, CARDS.VANILLA.id]);
    const gaimon = f.put("OPT886-GAIMON-DA", 0);
    const { state, gameOver, prompts } = attack(f, gaimon.instanceId, { optional: "accept" });
    // Gaimon fires after the first Life check, before the [Trigger] choice.
    expect(prompts).toEqual(["OPTIONAL_EFFECT", "REVEAL_TRIGGER"]);
    expect(state.players[0].characters.some((c) => c?.instanceId === gaimon.instanceId)).toBe(false);
    expectGameContinues(state, gameOver);
    expect(state.players[1].life).toHaveLength(1);
    expect(damageEvents(state)).toHaveLength(2);
  });

  it("a first-Life [Trigger] K.O.s the attacker: 2 damage is still dealt", () => {
    const f = fixture([KO_TRIGGER.id, CARDS.VANILLA.id, CARDS.VANILLA.id]);
    const da = f.put(CARDS.DOUBLE_ATK.id, 0);
    const { state, gameOver, prompts } = attack(f, da.instanceId, { reveal: true });
    expect(prompts).toEqual(["REVEAL_TRIGGER", "SELECT_TARGET"]);
    expect(state.players[0].characters.some((c) => c?.instanceId === da.instanceId)).toBe(false);
    expectGameContinues(state, gameOver);
    expect(state.players[1].life).toHaveLength(1);
    expect(damageEvents(state).map((p) => p.attackerType)).toEqual(["CHARACTER", "CHARACTER"]);
  });

  it("the attacker loses [Double Attack] after the first damage: 2 damage is still dealt", () => {
    const f = fixture([CARDS.TRIGGER.id, CARDS.VANILLA.id, CARDS.VANILLA.id]);
    const da = f.put(CARDS.DOUBLE_ATK.id, 0);
    let result = runPipeline(
      f.state,
      { type: "DECLARE_ATTACK", attackerInstanceId: da.instanceId, targetInstanceId: f.state.players[1].leader.instanceId },
      f.cardDb,
      0,
    );
    result = runPipeline(result.state, { type: "PASS" }, f.cardDb, 0);
    result = runPipeline(result.state, { type: "PASS" }, f.cardDb, 0);
    expect(result.state.turn.battle?.pendingTriggerLifeCard).toBeTruthy();
    // Strip the keyword while the first damage's [Trigger] window is open.
    f.cardDb.set(CARDS.DOUBLE_ATK.id, { ...CARDS.DOUBLE_ATK, keywords: { ...CARDS.DOUBLE_ATK.keywords, doubleAttack: false } });
    const after = runPipeline(result.state, { type: "REVEAL_TRIGGER", reveal: false }, f.cardDb, 1);
    expect(after.valid).toBe(true);
    expectGameContinues(after.state, after.gameOver);
    expect(after.state.players[1].life).toHaveLength(1);
    expect(damageEvents(after.state)).toHaveLength(2);
  });

  it("a first-Life [Trigger] K.O.s the attacker at 1 Life: the second damage finds 0 Life and does not win", () => {
    const f = fixture([KO_TRIGGER.id]);
    const da = f.put(CARDS.DOUBLE_ATK.id, 0);
    const { state, gameOver } = attack(f, da.instanceId, { reveal: true });
    expectGameContinues(state, gameOver);
    expect(damageEvents(state)).toHaveLength(2);
  });
});

describe("OPT-886 damage at 0 Life before the attack still wins (9-2-1-1)", () => {
  it("single damage at 0 Life wins", () => {
    const f = fixture([]);
    const { state, gameOver } = attack(f, f.state.players[0].leader.instanceId);
    expectAttackerWins(state, gameOver);
    expect(damageEvents(state).map((p) => [p.firstDamageOfAttack, p.lethal])).toEqual([[true, true]]);
  });

  it("[Double Attack] at 0 Life wins on its first damage", () => {
    const f = fixture([]);
    const da = f.put(CARDS.DOUBLE_ATK.id, 0);
    const { state, gameOver } = attack(f, da.instanceId);
    expectAttackerWins(state, gameOver);
    expect(damageEvents(state).map((p) => [p.firstDamageOfAttack, p.lethal])).toEqual([[true, true]]);
  });

  it("control: the fixture watcher opens a prompt on an ordinary (non-0-Life) damage", () => {
    const f = fixture([CARDS.VANILLA.id]);
    f.put(DAMAGE_WATCHER.id, 1);
    const { state, gameOver, prompts } = attack(f, f.state.players[0].leader.instanceId, { optional: "skip" });
    expect(prompts).toEqual(["OPTIONAL_EFFECT"]);
    expectGameContinues(state, gameOver);
  });

  // 9-1-2: rule processing is immediate, so the game ends at the damage and
  // the watcher's prompt is discarded. The damage context never has to
  // survive a suspension: the only damage that can defeat is an attack's
  // first damage, dealt only by the Counter Step PASS (executePass →
  // executeDamageStep), never by a prompt resume.
  it.each([
    ["single damage", "leader"],
    ["[Double Attack]", "da"],
  ] as const)("%s at 0 Life wins even though a watcher prompt opens on it", (_label, who) => {
    const f = fixture([]);
    f.put(DAMAGE_WATCHER.id, 1);
    const attacker = who === "da" ? f.put(CARDS.DOUBLE_ATK.id, 0).instanceId : f.state.players[0].leader.instanceId;
    const { state, gameOver, prompts } = attack(f, attacker);
    expect(prompts).toEqual([]);
    expectAttackerWins(state, gameOver);
    expect(state.pendingPrompt ?? null).toBeNull();
    expect(state.effectStack).toEqual([]);
    expect(damageEvents(state)).toHaveLength(1);
  });
});
