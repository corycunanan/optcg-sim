/**
 * OPT-902 — COMBAT_VICTORY / CHARACTER_BATTLES watchers are bound to their
 * host card's own battle, through the real pipeline with the registered
 * authored schemas.
 *
 * Oracles (printed text, docs/cards):
 * - OP02-094 Isuka: "[DON!! x1] [Once Per Turn] When this Character battles
 *   and K.O.'s your opponent's Character, set this Character as active."
 * - OP04-086 Chinjao: "[DON!! x1] When this Character battles and K.O.'s your
 *   opponent's Character, draw 2 cards and trash 2 cards from your hand."
 * - ST02-010 Basil Hawkins: "[DON!! x1] [Once Per Turn] [Your Turn] If this
 *   Character battles your opponent's Character, set this card as active."
 *   qa_st-01-st-04.md: an attack on the Leader redirected by [Blocker] counts;
 *   an aborted battle does not.
 * - ST05-010 Zephyr: "When this Character battles Strike attribute
 *   Characters, this Character gains +3000 power during this turn."
 *   qa_st-05.md: attacked twice by Strike Characters, it gains +6000.
 * A bystander's battle never fulfils any of them.
 */
import { describe, expect, it } from "vitest";
import type { CardData, CardInstance, GameAction, GameState } from "../types.js";
import type { EffectSchema } from "../engine/effect-types.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { runPipeline } from "../engine/pipeline.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import { getEffectivePower } from "../engine/modifiers.js";
import { executeGrantAttribute } from "../engine/effect-resolver/actions/modifiers.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";

interface PutOptions {
  zone?: CardInstance["zone"];
  state?: "ACTIVE" | "RESTED";
  don?: number;
}

function fixture() {
  const db = createTestCardDb();
  let state = createBattleReadyState(db);
  state.players.forEach((p) => {
    p.characters = padChars([]);
    p.hand = [];
  });
  let serial = 0;
  const promptTypes: string[] = [];

  function def(id: string, data: Partial<CardData> = {}, schema?: EffectSchema) {
    const authored = schema ?? getEffectSchema(id);
    db.set(id, {
      ...CARDS.VANILLA,
      id,
      name: authored?.card_name ?? id,
      effectText: "",
      counter: null,
      ...data,
      effectSchema: authored ?? null,
    });
  }

  function put(id: string, owner: 0 | 1, options: PutOptions = {}) {
    if (!db.has(id)) def(id);
    const zone = options.zone ?? "CHARACTER";
    const instanceId = `${id}-${owner}-${serial++}`;
    const card: CardInstance = {
      instanceId,
      cardId: id,
      controller: owner,
      owner,
      zone,
      state: options.state ?? "ACTIVE",
      attachedDon: Array.from({ length: options.don ?? 0 }, (_, i) => ({
        instanceId: `don-${instanceId}-${i}`,
        state: "ACTIVE" as const,
        attachedTo: instanceId,
      })),
      turnPlayed: 1,
    };
    const p = state.players[owner];
    if (zone === "LEADER") p.leader = card;
    else p.characters[p.characters.findIndex((c) => !c)] = card;
    state = registerCardEnteredField(state, card, db.get(id)!);
    return card;
  }

  function act(player: 0 | 1, action: GameAction) {
    if (state.pendingPrompt) {
      const r = resumePromptLifecycle(state, action, db, {
        drainPregame: (s) => s,
        advanceStartOfTurn: (s) => s,
      });
      expect(r.responseRejected, `${action.type} rejected`).toBe(false);
      state = r.state;
    } else {
      const r = runPipeline(state, action, db, player);
      expect(r.valid, `${action.type}: ${r.error}`).toBe(true);
      state = r.state;
    }
    if (state.pendingPrompt) promptTypes.push(state.pendingPrompt.options.promptType);
  }

  /**
   * `attacker` attacks `target`; both sides pass (or `blocker` blocks) until
   * the battle ends or a prompt opens. `stopAt` hands control back at that
   * sub-phase instead.
   */
  function attack(
    attacker: CardInstance,
    target: CardInstance,
    options: { blocker?: CardInstance; stopAt?: "COUNTER_STEP" } = {},
  ) {
    const player = attacker.controller;
    const defender: 0 | 1 = player === 0 ? 1 : 0;
    state.turn.activePlayerIndex = player;
    const slot = state.players[target.controller].characters.find((c) => c?.instanceId === target.instanceId);
    if (slot) slot.state = "RESTED";
    act(player, {
      type: "DECLARE_ATTACK",
      attackerInstanceId: attacker.instanceId,
      targetInstanceId: target.instanceId,
    });
    let blocker = options.blocker;
    for (let guard = 0; guard < 10 && state.turn.battle && !state.pendingPrompt; guard++) {
      const sub = state.turn.battleSubPhase;
      if (sub === options.stopAt) return;
      if (sub === "ATTACK_STEP") act(player, { type: "PASS" });
      else if (sub === "BLOCK_STEP" && blocker) {
        act(defender, { type: "DECLARE_BLOCKER", blockerInstanceId: blocker.instanceId });
        blocker = undefined;
      } else act(defender, { type: "PASS" });
    }
  }

  const prompt = () => state.pendingPrompt?.options.promptType;
  const accept = () => act(state.pendingPrompt!.respondingPlayer, { type: "PLAYER_CHOICE", choiceId: "accept" });
  const decline = () => act(state.pendingPrompt!.respondingPlayer, { type: "PLAYER_CHOICE", choiceId: "skip" });
  const onField = (card: CardInstance) =>
    state.players[card.controller].characters.some((c) => c?.instanceId === card.instanceId);
  const trashIds = (player: 0 | 1) => state.players[player].trash.map((c) => c.cardId);

  return {
    db,
    def,
    put,
    act,
    attack,
    prompt,
    promptTypes,
    accept,
    decline,
    onField,
    trashIds,
    get state() {
      return state;
    },
    set state(next: GameState) {
      state = next;
    },
  };
}

type Fixture = ReturnType<typeof fixture>;

function setup() {
  const f = fixture();
  f.def("OP02-094", { cost: 4, power: 5000 });
  f.def("OP04-086", { cost: 5, power: 5000 });
  f.def("ST02-010", { cost: 4, power: 5000 });
  f.def("ST05-010", { cost: 6, power: 5000 });
  f.def("ALLY", { cost: 3, power: 6000 });
  f.def("STRIKE-ATK", { cost: 3, power: 4000, attribute: ["Strike"] });
  f.def("OPP-WEAK", { cost: 2, power: 2000 });
  f.def("OPP-STRIKE", { cost: 2, power: 2000, attribute: ["Strike"] });
  f.def("OPP-BLOCKER", { cost: 2, power: 2000, keywords: { ...CARDS.BLOCKER.keywords } });
  return f;
}

const slotOf = (f: Fixture, card: CardInstance) =>
  f.state.players[card.controller].characters.find((c) => c?.instanceId === card.instanceId);
const power = (f: Fixture, card: CardInstance) => getEffectivePower(slotOf(f, card)!, f.db.get(card.cardId)!, f.state, f.db);

describe("OPT-902 OP02-094 Isuka (COMBAT_VICTORY)", () => {
  it("does not set itself active when another Character K.O.s", () => {
    const f = setup();
    const isuka = f.put("OP02-094", 0, { don: 1, state: "RESTED" });
    const ally = f.put("ALLY", 0);
    const weak = f.put("OPP-WEAK", 1);
    f.attack(ally, weak);
    expect(f.onField(weak)).toBe(false);
    expect(f.prompt()).toBeUndefined();
    expect(slotOf(f, isuka)?.state).toBe("RESTED");
  });

  it("sets itself active after its own attack K.O.s", () => {
    const f = setup();
    const isuka = f.put("OP02-094", 0, { don: 1 });
    const weak = f.put("OPP-WEAK", 1);
    f.attack(isuka, weak);
    expect(f.onField(weak)).toBe(false);
    expect(slotOf(f, isuka)?.state).toBe("ACTIVE");
  });
});

describe("OPT-902 OP04-086 Chinjao (COMBAT_VICTORY)", () => {
  it("does not draw when another Character K.O.s", () => {
    const f = setup();
    f.put("OP04-086", 0, { don: 1 });
    const ally = f.put("ALLY", 0);
    const weak = f.put("OPP-WEAK", 1);
    const hand = f.state.players[0].hand.length;
    f.attack(ally, weak);
    expect(f.onField(weak)).toBe(false);
    expect(f.prompt()).toBeUndefined();
    expect(f.state.players[0].hand).toHaveLength(hand);
  });

  it("draws 2 after its own attack K.O.s (then asks for the 2-card trash)", () => {
    const f = setup();
    const chinjao = f.put("OP04-086", 0, { don: 1 });
    const weak = f.put("OPP-WEAK", 1);
    const deck = f.state.players[0].deck.length;
    f.attack(chinjao, weak);
    expect(f.onField(weak)).toBe(false);
    expect(f.state.players[0].deck).toHaveLength(deck - 2);
  });
});

describe("OPT-902 ST02-010 Basil Hawkins (CHARACTER_BATTLES)", () => {
  it("stays rested when another Character battles the opponent's Character", () => {
    const f = setup();
    const basil = f.put("ST02-010", 0, { don: 1, state: "RESTED" });
    const ally = f.put("ALLY", 0);
    const weak = f.put("OPP-WEAK", 1);
    f.attack(ally, weak);
    expect(f.prompt()).toBeUndefined();
    expect(slotOf(f, basil)?.state).toBe("RESTED");
  });

  it("sets itself active after battling the opponent's Character", () => {
    const f = setup();
    const basil = f.put("ST02-010", 0, { don: 1 });
    const weak = f.put("OPP-WEAK", 1);
    f.attack(basil, weak);
    expect(slotOf(f, basil)?.state).toBe("ACTIVE");
  });

  it("an attack on the Leader redirected to a [Blocker] counts (qa_st-01-st-04.md)", () => {
    const f = setup();
    const basil = f.put("ST02-010", 0, { don: 1 });
    const blocker = f.put("OPP-BLOCKER", 1);
    f.attack(basil, f.state.players[1].leader, { blocker });
    expect(slotOf(f, basil)?.state).toBe("ACTIVE");
  });

  it("an unblocked attack on the Leader does not count", () => {
    const f = setup();
    const basil = f.put("ST02-010", 0, { don: 1 });
    f.attack(basil, f.state.players[1].leader);
    expect(slotOf(f, basil)?.state).toBe("RESTED");
  });
});

describe("OPT-902 ST05-010 Zephyr (CHARACTER_BATTLES)", () => {
  it("gains nothing when a Strike Character battles a different Character", () => {
    const f = setup();
    const zephyr = f.put("ST05-010", 1);
    const other = f.put("OPP-WEAK", 1);
    const striker = f.put("STRIKE-ATK", 0);
    f.attack(striker, other);
    expect(power(f, zephyr)).toBe(5000);
  });

  it("gains +3000 each time a Strike Character attacks it (qa_st-05.md: twice is +6000)", () => {
    const f = setup();
    const zephyr = f.put("ST05-010", 1);
    const a = f.put("STRIKE-ATK", 0);
    const b = f.put("STRIKE-ATK", 0);
    // Both 4000 attacks lose, so Zephyr survives.
    f.attack(a, zephyr);
    expect(f.onField(zephyr)).toBe(true);
    expect(power(f, zephyr)).toBe(8000);
    f.attack(b, zephyr);
    expect(power(f, zephyr)).toBe(11000);
  });

  it("gains +3000 when it attacks a Strike Character, not when it attacks a non-Strike one", () => {
    const f = setup();
    const zephyr = f.put("ST05-010", 0);
    const plain = f.put("OPP-WEAK", 1);
    f.attack(zephyr, plain);
    expect(power(f, zephyr)).toBe(5000);
    slotOf(f, zephyr)!.state = "ACTIVE";
    const strike = f.put("OPP-STRIKE", 1);
    f.attack(zephyr, strike);
    expect(power(f, zephyr)).toBe(8000);
  });
  function grantStrike(f: Fixture, card: CardInstance) {
    const granted = executeGrantAttribute(
      f.state,
      { type: "GRANT_ATTRIBUTE", target: { type: "CHARACTER", controller: "SELF" }, params: { attribute: "STRIKE" }, duration: { type: "THIS_TURN" } },
      card.instanceId,
      card.controller,
      f.db,
      new Map(),
      [card.instanceId],
    );
    expect(granted.succeeded).toBe(true);
    f.state = granted.state;
  }

  it("gains +3000 when a Character granted Strike by an effect attacks it", () => {
    const f = setup();
    const zephyr = f.put("ST05-010", 1);
    f.def("GRANTED-ATK", { cost: 3, power: 4000 });
    const granted = f.put("GRANTED-ATK", 0);
    grantStrike(f, granted);
    f.attack(granted, zephyr);
    expect(f.onField(zephyr)).toBe(true);
    expect(power(f, zephyr)).toBe(8000);
  });

  it("gains +3000 when it K.O.s a Character granted Strike by an effect", () => {
    const f = setup();
    const zephyr = f.put("ST05-010", 0);
    const plain = f.put("OPP-WEAK", 1);
    grantStrike(f, plain);
    f.attack(zephyr, plain);
    expect(f.onField(plain)).toBe(false);
    const battles = f.state.eventLog.filter((e) => e.type === "CHARACTER_BATTLES");
    expect(battles.at(-1)?.payload).toMatchObject({ grantedAttributes: { [plain.instanceId]: ["STRIKE"] } });
    expect(power(f, zephyr)).toBe(8000);
  });
});

describe("OPT-902 target_filter on the defeated combatant (last known card)", () => {
  function victoryWatcher(f: Fixture, maxCost: number) {
    f.def("OPT902-VICTOR", { cost: 4, power: 5000 }, {
      card_id: "OPT902-VICTOR",
      card_name: "Victor",
      card_type: "Character",
      effects: [{
        id: "victory_draw",
        category: "auto",
        trigger: { event: "COMBAT_VICTORY", filter: { target_filter: { cost_max: maxCost } } },
        actions: [{ type: "DRAW", params: { amount: 1 } }],
      }],
    } as EffectSchema);
    return f.put("OPT902-VICTOR", 0);
  }

  it.each([[2, 1], [1, 0]] as const)("K.O. of a cost-2 Character with cost_max %i draws %i", (maxCost, drawn) => {
    const f = setup();
    const victor = victoryWatcher(f, maxCost);
    const weak = f.put("OPP-WEAK", 1);
    const hand = f.state.players[0].hand.length;
    f.attack(victor, weak);
    expect(f.onField(weak)).toBe(false);
    expect(f.state.players[0].hand).toHaveLength(hand + drawn);
  });

  it.each([
    ["attribute", true, 1],
    ["attribute", false, 0],
    ["target_filter", true, 1],
    ["target_filter", false, 0],
  ] as const)("COMBAT_VICTORY %s Strike filter on a K.O.'d Character (granted: %s) draws %i", (where, grant, drawn) => {
    const f = setup();
    f.def("OPT902-STRIKE-VICTOR", { cost: 4, power: 5000 }, {
      card_id: "OPT902-STRIKE-VICTOR",
      card_name: "Strike victor",
      card_type: "Character",
      effects: [{
        id: "victory_draw",
        category: "auto",
        trigger: {
          event: "COMBAT_VICTORY",
          filter: where === "attribute" ? { attribute: "STRIKE" } : { target_filter: { attribute: "STRIKE" } },
        },
        actions: [{ type: "DRAW", params: { amount: 1 } }],
      }],
    } as EffectSchema);
    const victor = f.put("OPT902-STRIKE-VICTOR", 0);
    const weak = f.put("OPP-WEAK", 1);
    if (grant) {
      const granted = executeGrantAttribute(
        f.state,
        { type: "GRANT_ATTRIBUTE", target: { type: "CHARACTER", controller: "SELF" }, params: { attribute: "STRIKE" }, duration: { type: "THIS_TURN" } },
        weak.instanceId,
        1,
        f.db,
        new Map(),
        [weak.instanceId],
      );
      f.state = granted.state;
    }
    const hand = f.state.players[0].hand.length;
    f.attack(victor, weak);
    expect(f.onField(weak)).toBe(false);
    expect(f.state.players[0].hand).toHaveLength(hand + drawn);
  });
});
