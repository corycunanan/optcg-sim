/**
 * OPT-797 — "the Character you battled with" (BATTLE_TARGET) and the card a
 * replacement protects (REPLACED_CARD), through the real action pipeline and
 * prompt lifecycle with the authored production registry.
 *
 * Card text (docs/cards/):
 * - OP04-047 Ice Oni: "[Your Turn] At the end of a battle in which this
 *   Character battles your opponent's Character with a cost of 5 or less,
 *   place the opponent's Character you battled with at the bottom of the
 *   owner's deck."
 * - ST08-013 Mr.2.Bon.Kurei(Bentham): "[DON!! x1] At the end of a battle in
 *   which this Character battles your opponent's Character, you may K.O. the
 *   opponent's Character you battled with. If you do, K.O. this Character."
 * - OP11-101 Capone"Gang"Bege: "[Once Per Turn] If your {Supernovas} type
 *   Character other than [Capone"Gang"Bege] would be removed from the field by
 *   your opponent's effect, you may add it to the top of your Life cards
 *   face-down instead."
 * - OP10-032 Tashigi / OP13-008 Emporio.Ivankov: "... you may rest / trash
 *   this Character instead" (SELF stays correct).
 *
 * Rulings:
 * - qa_st-08.md ST08-013: attacked, lost and K.O.'d → no activation. The
 *   defending seat is otherwise valid ("battles" covers being attacked).
 * - qa_st-01-st-04.md ST02-010: attacking the Leader and being blocked battles
 *   the Blocker; a battle whose target left before the Damage Step does not
 *   satisfy "this Character battles your opponent's Character".
 * - qa_op04.md OP04-047: the Character K.O.'d in the battle is trashed, not
 *   placed at the bottom of the deck (Rule 3-1-6: it is a new card).
 * - Rules §7-1-5-2: "at the end of the battle" effects activate at End of the
 *   Battle; §8-1-3-4-1: a declined replacement is not resolved.
 */

import { describe, expect, it } from "vitest";
import type { CardData, CardInstance, GameAction, GameState } from "../types.js";
import {
  BATTLE_TARGET_REF,
  type EffectSchema,
} from "../engine/effect-types.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { runPipeline } from "../engine/pipeline.js";
import { moveCard } from "../engine/state.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import { battleTargetRefFor, resolverExecutionServices } from "../engine/effect-resolver/resolver.js";
import { checkReplacementForKO } from "../engine/replacements.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { SessionRepository, type SessionStorage } from "../session/persistence.js";
import { findContextTargetViolations } from "../engine/schema-context-target-lint.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";

class MemoryStorage implements SessionStorage {
  readonly data = new Map<string, unknown>();
  async get<T>(key: string): Promise<T | undefined> {
    return structuredClone(this.data.get(key)) as T | undefined;
  }
  async put(key: string, value: unknown): Promise<void>;
  async put(entries: Record<string, unknown>): Promise<void>;
  async put(keyOrEntries: string | Record<string, unknown>, value?: unknown): Promise<void> {
    const entries = typeof keyOrEntries === "string" ? { [keyOrEntries]: value } : keyOrEntries;
    for (const [key, entry] of Object.entries(entries)) this.data.set(key, structuredClone(entry));
  }
  async setAlarm(): Promise<void> {}
  async deleteAlarm(): Promise<void> {}
}

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

/** Opponent (player 1) Characters with distinct card ids so each is traceable. */
function opponents(f: Fixture) {
  f.def("OPP-C5", { cost: 5, power: 7000 });
  f.def("OPP-C6", { cost: 6, power: 7000 });
  f.def("OPP-C3", { cost: 3, power: 4000 });
  f.def("OPP-WEAK", { cost: 2, power: 2000 });
  f.def("OPP-BLOCKER", {
    cost: 4,
    power: 9000,
    keywords: { ...CARDS.BLOCKER.keywords },
  });
}

function mr2(f: Fixture, don = 1, options: PutOptions = {}) {
  f.def("ST08-013", { cost: 4, power: 5000 });
  return f.put("ST08-013", 0, { don, ...options });
}

function iceOni(f: Fixture) {
  f.def("OP04-047", { cost: 5, power: 5000 });
  return f.put("OP04-047", 0);
}

// ─── ST08-013 Mr.2.Bon.Kurei(Bentham) ─────────────────────────────────────────

describe("ST08-013 — K.O. exactly the opponent's Character it battled", () => {
  it("as attacker: K.O.s the battled Character, not the bystander, then itself", () => {
    const f = fixture();
    opponents(f);
    const me = mr2(f);
    const battled = f.put("OPP-C5", 1);
    const bystander = f.put("OPP-C3", 1);

    f.attack(me, battled); // 6000 vs 7000: Mr.2 loses, both survive
    expect(f.prompt()).toBe("OPTIONAL_EFFECT");
    f.accept();

    expect(f.state.pendingPrompt).toBeNull();
    expect(f.promptTypes).not.toContain("SELECT_TARGET");
    expect(f.onField(battled)).toBe(false);
    expect(f.trashIds(1)).toContain("OPP-C5");
    expect(f.onField(bystander)).toBe(true);
    expect(f.onField(me)).toBe(false);
    expect(f.trashIds(0)).toContain("ST08-013");
  });

  it("as defender: K.O.s the attacker it battled (qa_st-08.md: the defending seat battles)", () => {
    const f = fixture();
    opponents(f);
    const me = mr2(f);
    const bystander = f.put("OPP-C3", 1);
    const attacker = f.put("OPP-WEAK", 1);

    f.attack(attacker, me); // 2000 vs 5000: attacker loses
    expect(f.prompt()).toBe("OPTIONAL_EFFECT");
    expect(f.state.pendingPrompt!.respondingPlayer).toBe(0);
    f.accept();

    expect(f.state.pendingPrompt).toBeNull();
    expect(f.onField(attacker)).toBe(false);
    expect(f.trashIds(1)).toContain("OPP-WEAK");
    expect(f.onField(bystander)).toBe(true);
    expect(f.onField(me)).toBe(false);
  });

  it("Blocker redirect: the battled Character is the Blocker (qa_st-01-st-04.md ST02-010)", () => {
    const f = fixture();
    opponents(f);
    const me = mr2(f);
    const bystander = f.put("OPP-C3", 1);
    const blocker = f.put("OPP-BLOCKER", 1);

    f.attack(me, f.state.players[1].leader, { blocker }); // 6000 vs 9000
    expect(f.prompt()).toBe("OPTIONAL_EFFECT");
    f.accept();

    expect(f.state.pendingPrompt).toBeNull();
    expect(f.onField(blocker)).toBe(false);
    expect(f.trashIds(1)).toContain("OPP-BLOCKER");
    expect(f.onField(bystander)).toBe(true);
    expect(f.onField(me)).toBe(false);
  });

  it("battled Character K.O.'d in the battle: nothing to K.O., so 'If you do' keeps Mr.2 on the field", () => {
    const f = fixture();
    opponents(f);
    const me = mr2(f);
    const battled = f.put("OPP-WEAK", 1);
    const bystander = f.put("OPP-C3", 1);

    f.attack(me, battled); // 6000 vs 2000: the battled Character is K.O.'d
    expect(f.onField(battled)).toBe(false);
    if (f.prompt() === "OPTIONAL_EFFECT") f.accept();

    expect(f.state.pendingPrompt).toBeNull();
    expect(f.onField(bystander)).toBe(true);
    expect(f.onField(me)).toBe(true);
  });

  it("decline: nothing is K.O.'d", () => {
    const f = fixture();
    opponents(f);
    const me = mr2(f);
    const battled = f.put("OPP-C5", 1);

    f.attack(me, battled);
    expect(f.prompt()).toBe("OPTIONAL_EFFECT");
    f.decline();

    expect(f.onField(battled)).toBe(true);
    expect(f.onField(me)).toBe(true);
  });

  it("a Leader battle does not activate it", () => {
    const f = fixture();
    opponents(f);
    const me = mr2(f);
    const bystander = f.put("OPP-C3", 1);

    f.attack(me, f.state.players[1].leader);

    expect(f.promptTypes).not.toContain("OPTIONAL_EFFECT");
    expect(f.onField(bystander)).toBe(true);
    expect(f.onField(me)).toBe(true);
  });

  it("a battle this Character was not in does not activate it", () => {
    const f = fixture();
    opponents(f);
    const me = mr2(f);
    const ally = f.put(CARDS.VANILLA.id, 0);
    const battled = f.put("OPP-C5", 1);

    f.attack(ally, battled); // 4000 vs 7000

    expect(f.promptTypes).not.toContain("OPTIONAL_EFFECT");
    expect(f.onField(battled)).toBe(true);
    expect(f.onField(me)).toBe(true);
  });

  it("an aborted battle does not activate it (qa_st-01-st-04.md ST02-010)", () => {
    const f = fixture();
    opponents(f);
    const me = mr2(f);
    const battled = f.put("OPP-C5", 1);
    const bystander = f.put("OPP-C3", 1);

    f.attack(me, battled, { stopAt: "COUNTER_STEP" });
    expect(f.state.turn.battleSubPhase).toBe("COUNTER_STEP");
    f.state = moveCard(f.state, battled.instanceId, "TRASH");
    f.act(1, { type: "PASS" });

    const ends = f.state.eventLog.filter((e) => e.type === "END_OF_BATTLE");
    expect(ends.at(-1)?.payload).toMatchObject({ aborted: true });
    expect(f.promptTypes).not.toContain("OPTIONAL_EFFECT");
    expect(f.onField(bystander)).toBe(true);
    expect(f.onField(me)).toBe(true);
  });

  it("[DON!! x1] still gates it", () => {
    const f = fixture();
    opponents(f);
    const me = mr2(f, 0);
    const battled = f.put("OPP-C5", 1);

    f.attack(me, battled);

    expect(f.promptTypes).not.toContain("OPTIONAL_EFFECT");
    expect(f.onField(battled)).toBe(true);
  });
});

// ─── OP04-047 Ice Oni ─────────────────────────────────────────────────────────

describe("OP04-047 — bottom-deck exactly the opponent's cost ≤5 Character it battled", () => {
  const bottomOfDeck = (f: Fixture) => f.state.players[1].deck.at(-1)?.cardId;

  it("places the battled cost-5 Character at the bottom of its owner's deck; the bystander stays", () => {
    const f = fixture();
    opponents(f);
    const me = iceOni(f);
    const battled = f.put("OPP-C5", 1);
    const bystander = f.put("OPP-C3", 1);
    const deckSize = f.state.players[1].deck.length;

    f.attack(me, battled); // 5000 vs 7000

    expect(f.state.pendingPrompt).toBeNull();
    expect(f.onField(battled)).toBe(false);
    expect(bottomOfDeck(f)).toBe("OPP-C5");
    expect(f.state.players[1].deck).toHaveLength(deckSize + 1);
    expect(f.onField(bystander)).toBe(true);
    expect(f.onField(me)).toBe(true);
  });

  it("a cost-6 battled Character does not activate it", () => {
    const f = fixture();
    opponents(f);
    const me = iceOni(f);
    const battled = f.put("OPP-C6", 1);
    const bystander = f.put("OPP-C3", 1);

    f.attack(me, battled);

    expect(f.onField(battled)).toBe(true);
    expect(f.onField(bystander)).toBe(true);
  });

  it("a Leader battle does not activate it", () => {
    const f = fixture();
    opponents(f);
    const me = iceOni(f);
    const bystander = f.put("OPP-C3", 1);

    f.attack(me, f.state.players[1].leader);

    expect(f.onField(bystander)).toBe(true);
  });

  it("another Character's battle does not activate it", () => {
    const f = fixture();
    opponents(f);
    iceOni(f);
    const ally = f.put(CARDS.VANILLA.id, 0);
    const battled = f.put("OPP-C5", 1);

    f.attack(ally, battled);

    expect(f.onField(battled)).toBe(true);
  });

  it("the Character K.O.'d in the battle stays in the trash (qa_op04.md OP04-047)", () => {
    const f = fixture();
    opponents(f);
    const me = iceOni(f);
    const battled = f.put("OPP-WEAK", 1);
    const bystander = f.put("OPP-C3", 1);
    const deckSize = f.state.players[1].deck.length;

    f.attack(me, battled); // 5000 vs 2000

    expect(f.trashIds(1)).toContain("OPP-WEAK");
    expect(f.state.players[1].deck).toHaveLength(deckSize);
    expect(f.onField(bystander)).toBe(true);
  });

  it("[Your Turn]: defending on the opponent's turn does not activate it", () => {
    const f = fixture();
    opponents(f);
    const me = iceOni(f);
    const attacker = f.put("OPP-WEAK", 1);

    f.attack(attacker, me); // 2000 vs 5000

    expect(f.onField(attacker)).toBe(true);
  });
});

// ─── BATTLE_TARGET side selection ─────────────────────────────────────────────

describe("battleTargetRefFor — the card on the other side of the battle from the source", () => {
  const ids = (ref: ReturnType<typeof battleTargetRefFor>) => ref?.[1].targetInstanceIds;

  it("END_OF_BATTLE: attacker → final target, target → attacker, bystander → none", () => {
    const event = {
      type: "END_OF_BATTLE" as const,
      playerIndex: 0 as const,
      payload: { attackerInstanceId: "A", targetInstanceId: "T", aborted: false },
    };
    expect(battleTargetRefFor(event, "A")?.[0]).toBe(BATTLE_TARGET_REF);
    expect(ids(battleTargetRefFor(event, "A"))).toEqual(["T"]);
    expect(ids(battleTargetRefFor(event, "T"))).toEqual(["A"]);
    expect(battleTargetRefFor(event, "X")).toBeNull();
  });

  it("COMBAT_VICTORY / CHARACTER_BATTLES carry the attacker as cardInstanceId", () => {
    for (const type of ["COMBAT_VICTORY", "CHARACTER_BATTLES"] as const) {
      const event = { type, playerIndex: 0 as const, payload: { cardInstanceId: "A", targetInstanceId: "T" } };
      expect(ids(battleTargetRefFor(event, "A"))).toEqual(["T"]);
      expect(ids(battleTargetRefFor(event, "T"))).toEqual(["A"]);
    }
  });

  it("non-battle events seed nothing", () => {
    const event = { type: "CARD_KO" as const, playerIndex: 0 as const, payload: { cardInstanceId: "A" } };
    expect(battleTargetRefFor(event as never, "A")).toBeNull();
    expect(battleTargetRefFor(undefined, "A")).toBeNull();
  });
});

// ─── OP11-101 Capone"Gang"Bege ────────────────────────────────────────────────

/** Test-only "[Activate: Main] K.O. / return 1 Character" (either side). */
function removalSource(id: string, type: "KO" | "RETURN_TO_HAND"): EffectSchema {
  return {
    card_id: id,
    card_name: id,
    card_type: "Character",
    effects: [
      {
        id: "remove",
        category: "activate",
        trigger: { keyword: "ACTIVATE_MAIN" },
        actions: [{ type, target: { type: "CHARACTER", controller: "EITHER", count: { exact: 1 } } }],
      },
    ],
  };
}

function removeWith(f: Fixture, player: 0 | 1, type: "KO" | "RETURN_TO_HAND", target: CardInstance) {
  f.state.turn.activePlayerIndex = player;
  const sourceId = `OPT797-${type}`;
  if (!f.db.has(sourceId)) f.def(sourceId, {}, removalSource(sourceId, type));
  const source = f.put(sourceId, player);
  f.act(player, { type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId: "remove" });
  expect(f.prompt()).toBe("SELECT_TARGET");
  f.act(player, { type: "SELECT_TARGET", selectedInstanceIds: [target.instanceId] });
}

/** Test-only "[Activate: Main] K.O. all of your opponent's Characters other than [name]" for player 1. */
function koAllOpponentCharactersExcept(f: Fixture, name: string) {
  const id = "OPT797-WIPE";
  if (!f.db.has(id)) {
    f.def(id, {}, {
      card_id: id,
      card_name: id,
      card_type: "Character",
      effects: [
        {
          id: "wipe",
          category: "activate",
          trigger: { keyword: "ACTIVATE_MAIN" },
          actions: [{ type: "KO", target: { type: "ALL_OPPONENT_CHARACTERS", filter: { exclude_name: name } } }],
        },
      ],
    });
  }
  f.state.turn.activePlayerIndex = 1;
  const source = f.put(id, 1);
  f.act(1, { type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId: "wipe" });
}

function bege(f: Fixture) {
  f.def("OP11-101", { cost: 4, power: 5000, types: ["Supernovas", "Fire Tank Pirates"] });
  f.def("OPT797-SUPERNOVA", { types: ["Supernovas"] });
  f.def("OPT797-SUPERNOVA-2", { types: ["Supernovas"] });
  f.def("OPT797-OTHER", { types: ["Navy"] });
  return f.put("OP11-101", 0);
}

describe("OP11-101 — the protected Supernovas Character goes to Life, Bege stays", () => {
  for (const removal of ["KO", "RETURN_TO_HAND"] as const) {
    it(`accept (${removal} by the opponent): it goes face-down on top of Life; Bege stays`, () => {
      const f = fixture();
      const me = bege(f);
      const protectedCard = f.put("OPT797-SUPERNOVA", 0);
      const life = f.state.players[0].life.length;

      removeWith(f, 1, removal, protectedCard);
      expect(f.prompt()).toBe("OPTIONAL_EFFECT");
      expect(f.state.pendingPrompt!.respondingPlayer).toBe(0);
      f.accept();

      expect(f.state.pendingPrompt).toBeNull();
      expect(f.onField(protectedCard)).toBe(false);
      expect(f.onField(me)).toBe(true);
      expect(f.state.players[0].life).toHaveLength(life + 1);
      expect(f.state.players[0].life[0]).toMatchObject({ cardId: "OPT797-SUPERNOVA", face: "DOWN" });
      expect(f.trashIds(0)).not.toContain("OPT797-SUPERNOVA");
      expect(f.state.players[0].hand.map((c) => c.cardId)).not.toContain("OPT797-SUPERNOVA");
    });
  }

  it("decline: the Supernovas Character is K.O.'d and Life is unchanged (§8-1-3-4-1)", () => {
    const f = fixture();
    const me = bege(f);
    const protectedCard = f.put("OPT797-SUPERNOVA", 0);
    const life = f.state.players[0].life.length;

    removeWith(f, 1, "KO", protectedCard);
    expect(f.prompt()).toBe("OPTIONAL_EFFECT");
    f.decline();

    expect(f.onField(protectedCard)).toBe(false);
    expect(f.trashIds(0)).toContain("OPT797-SUPERNOVA");
    expect(f.state.players[0].life).toHaveLength(life);
    expect(f.onField(me)).toBe(true);
  });

  it("does not protect Bege himself", () => {
    const f = fixture();
    const me = bege(f);
    removeWith(f, 1, "KO", me);
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.trashIds(0)).toContain("OP11-101");
  });

  it("does not protect a non-Supernovas Character", () => {
    const f = fixture();
    bege(f);
    const other = f.put("OPT797-OTHER", 0);
    removeWith(f, 1, "KO", other);
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.trashIds(0)).toContain("OPT797-OTHER");
  });

  it("does not replace your own effect's removal", () => {
    const f = fixture();
    bege(f);
    const protectedCard = f.put("OPT797-SUPERNOVA", 0);
    removeWith(f, 0, "KO", protectedCard);
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.trashIds(0)).toContain("OPT797-SUPERNOVA");
  });

  it("[Once Per Turn]: a second removal the same turn is not replaced", () => {
    const f = fixture();
    const me = bege(f);
    const first = f.put("OPT797-SUPERNOVA", 0);
    const second = f.put("OPT797-SUPERNOVA-2", 0);

    removeWith(f, 1, "KO", first);
    f.accept();
    expect(f.state.players[0].life[0].cardId).toBe("OPT797-SUPERNOVA");

    removeWith(f, 1, "KO", second);
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.trashIds(0)).toContain("OPT797-SUPERNOVA-2");
    expect(f.onField(me)).toBe(true);
  });

  it("the optional prompt survives a persisted save/load before it is answered", async () => {
    const f = fixture();
    const me = bege(f);
    const protectedCard = f.put("OPT797-SUPERNOVA", 0);
    removeWith(f, 1, "KO", protectedCard);
    expect(f.prompt()).toBe("OPTIONAL_EFFECT");

    const storage = new MemoryStorage();
    const config = { nextJsUrl: "https://x.test", workerSecret: "s" };
    const saved = await new SessionRepository(storage, config)
      .save({ state: f.state, cardDb: f.db, undoHistory: [], mode: "PVP" } as never);
    f.state = saved.state;
    const loaded = await new SessionRepository(storage, config).load();
    expect(loaded).not.toBeNull();
    f.state = loaded!.state;

    f.accept();
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.onField(protectedCard)).toBe(false);
    expect(f.state.players[0].life[0]).toMatchObject({ cardId: "OPT797-SUPERNOVA", face: "DOWN" });
    expect(f.onField(me)).toBe(true);
  });
});

// ─── REPLACED_CARD across a substitute prompt ─────────────────────────────────

describe("REPLACED_CARD survives a substitute's own prompt and a persisted round trip", () => {
  // Test-only: "If your Character would be K.O.'d by your opponent's effect,
  // you may rest up to 1 of your Characters, then add it to the top of your
  // Life cards instead." The first substitute prompts; REPLACED_CARD resolves
  // after that prompt from the frame's persisted result refs.
  const schema: EffectSchema = {
    card_id: "OPT797-PROXY",
    card_name: "Proxy",
    card_type: "Character",
    effects: [
      {
        id: "proxy",
        category: "replacement",
        flags: { optional: true },
        replaces: {
          event: "WOULD_BE_KO",
          target_filter: { controller: "SELF", card_type: "CHARACTER", exclude_self: true },
          cause_filter: { by: "OPPONENT_EFFECT" },
        },
        replacement_actions: [
          { type: "SET_REST", target: { type: "CHARACTER", controller: "SELF", count: { up_to: 1 } } },
          { type: "ADD_TO_LIFE_FROM_FIELD", target: { type: "REPLACED_CARD" }, params: { face: "DOWN", position: "TOP" }, chain: "THEN" },
        ],
      },
    ],
  };

  it("adds the protected Character to Life after the rest prompt resolves", async () => {
    const f = fixture();
    f.def("OPT797-PROXY", {}, schema);
    const proxy = f.put("OPT797-PROXY", 0);
    const protectedCard = f.put(CARDS.VANILLA.id, 0);

    removeWith(f, 1, "KO", protectedCard);
    expect(f.prompt()).toBe("OPTIONAL_EFFECT");
    f.accept();
    expect(f.prompt()).toBe("SELECT_TARGET");

    const storage = new MemoryStorage();
    const config = { nextJsUrl: "https://x.test", workerSecret: "s" };
    await new SessionRepository(storage, config)
      .save({ state: f.state, cardDb: f.db, undoHistory: [], mode: "PVP" } as never);
    f.state = (await new SessionRepository(storage, config).load())!.state;

    f.act(0, { type: "SELECT_TARGET", selectedInstanceIds: [proxy.instanceId] });

    expect(f.state.pendingPrompt).toBeNull();
    expect(f.onField(protectedCard)).toBe(false);
    expect(f.state.players[0].life[0]).toMatchObject({ cardId: CARDS.VANILLA.id, face: "DOWN" });
    expect(f.trashIds(0)).not.toContain(CARDS.VANILLA.id);
    expect(f.onField(proxy)).toBe(true);
  });
});

describe("REPLACED_CARD on every replacement execution path", () => {
  // Test-only: "If your other Character would be K.O.'d, [you may] add it to
  // the top of your Life cards face-down instead." No cause filter, so both
  // effect K.O.s (batch scan) and battle K.O.s (single check) reach it.
  const schema = (optional: boolean): EffectSchema => ({
    card_id: optional ? "OPT797-LIFE-MAY" : "OPT797-LIFE-MUST",
    card_name: "Life proxy",
    card_type: "Character",
    effects: [
      {
        id: "life_it",
        category: "replacement",
        ...(optional ? { flags: { optional: true } } : {}),
        replaces: {
          event: "WOULD_BE_KO",
          target_filter: { controller: "SELF", card_type: "CHARACTER", exclude_self: true },
        },
        replacement_actions: [
          { type: "ADD_TO_LIFE_FROM_FIELD", target: { type: "REPLACED_CARD" }, params: { face: "DOWN", position: "TOP" } },
        ],
      },
    ],
  });

  function setup(optional: boolean) {
    const f = fixture();
    const id = optional ? "OPT797-LIFE-MAY" : "OPT797-LIFE-MUST";
    f.def(id, {}, schema(optional));
    f.def("OPT797-PROTECTED", { power: 3000 });
    f.def("OPP-C5", { cost: 5, power: 7000 });
    const host = f.put(id, 0);
    const protectedCard = f.put("OPT797-PROTECTED", 0);
    return { f, host, protectedCard };
  }

  function expectInLife(f: Fixture, host: CardInstance, protectedCard: CardInstance) {
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.onField(protectedCard)).toBe(false);
    expect(f.state.players[0].life[0]).toMatchObject({ cardId: "OPT797-PROTECTED", face: "DOWN" });
    expect(f.trashIds(0)).not.toContain("OPT797-PROTECTED");
    expect(f.onField(host)).toBe(true);
  }

  it("non-optional, effect K.O. (batch scan applies it without a prompt)", () => {
    const { f, host, protectedCard } = setup(false);
    removeWith(f, 1, "KO", protectedCard);
    expectInLife(f, host, protectedCard);
  });

  it("non-optional, battle K.O. (single-target check)", () => {
    const { f, host, protectedCard } = setup(false);
    f.attack(f.put("OPP-C5", 1), protectedCard); // 7000 vs 3000
    expectInLife(f, host, protectedCard);
  });

  it("optional, battle K.O. (single-target prompt, then resume)", () => {
    const { f, host, protectedCard } = setup(true);
    f.attack(f.put("OPP-C5", 1), protectedCard);
    expect(f.prompt()).toBe("OPTIONAL_EFFECT");
    f.accept();
    expectInLife(f, host, protectedCard);
  });
});

describe("REPLACED_CARD substitute feasibility is checked against the replaced card", () => {
  // Test-only: "If your Character would be K.O.'d by your opponent's effect,
  // you may rest it instead." Infeasible (§8-1-3-4-5) when it is already rested.
  const schema: EffectSchema = {
    card_id: "OPT797-REST-IT",
    card_name: "Rest it",
    card_type: "Character",
    effects: [
      {
        id: "rest_it",
        category: "replacement",
        flags: { optional: true },
        replaces: {
          event: "WOULD_BE_KO",
          target_filter: { controller: "SELF", card_type: "CHARACTER", exclude_self: true },
          cause_filter: { by: "OPPONENT_EFFECT" },
        },
        replacement_actions: [{ type: "SET_REST", target: { type: "REPLACED_CARD" } }],
      },
    ],
  };

  it("active: rests the protected Character, which stays on the field", () => {
    const f = fixture();
    f.def("OPT797-REST-IT", {}, schema);
    const host = f.put("OPT797-REST-IT", 0);
    const protectedCard = f.put(CARDS.VANILLA.id, 0);

    removeWith(f, 1, "KO", protectedCard);
    expect(f.prompt()).toBe("OPTIONAL_EFFECT");
    f.accept();

    const card = f.state.players[0].characters.find((c) => c?.instanceId === protectedCard.instanceId);
    expect(card?.state).toBe("RESTED");
    expect(f.state.players[0].characters.find((c) => c?.instanceId === host.instanceId)?.state).toBe("ACTIVE");
  });

  it("already rested: the replacement is not offered and the K.O. proceeds", () => {
    const f = fixture();
    f.def("OPT797-REST-IT", {}, schema);
    f.put("OPT797-REST-IT", 0);
    const protectedCard = f.put(CARDS.VANILLA.id, 0, { state: "RESTED" });

    removeWith(f, 1, "KO", protectedCard);

    expect(f.state.pendingPrompt).toBeNull();
    expect(f.onField(protectedCard)).toBe(false);
  });

  it("batch: protects only the members it can rest; the already-rested member is K.O.'d (§8-1-3-4-5)", () => {
    const f = fixture();
    f.def("OPT797-REST-IT", {}, schema);
    const host = f.put("OPT797-REST-IT", 0);
    const active = f.put(CARDS.VANILLA.id, 0);
    const rested = f.put(CARDS.VANILLA.id, 0, { state: "RESTED" });

    koAllOpponentCharactersExcept(f, "Rest it");
    expect(f.prompt()).toBe("OPTIONAL_EFFECT");
    f.accept();

    expect(f.state.pendingPrompt).toBeNull();
    expect(f.state.players[0].characters.find((c) => c?.instanceId === active.instanceId)?.state).toBe("RESTED");
    expect(f.onField(rested)).toBe(false);
    expect(f.onField(host)).toBe(true);
  });

  it("single-target check (battle / cost paths): offered only while the replaced card is active", () => {
    for (const cardState of ["ACTIVE", "RESTED"] as const) {
      const f = fixture();
      f.def("OPT797-REST-IT", {}, schema);
      f.put("OPT797-REST-IT", 0);
      const protectedCard = f.put(CARDS.VANILLA.id, 0, { state: cardState });
      const result = checkReplacementForKO(f.state, protectedCard.instanceId, "effect", 1, f.db, resolverExecutionServices);
      expect(result.pendingPrompt !== undefined, cardState).toBe(cardState === "ACTIVE");
    }
  });
});

// ─── SELF-correct replacements are unchanged ──────────────────────────────────

describe("SELF replacements still act on their own source", () => {
  it("OP10-032 Tashigi rests herself; the protected green Character stays", () => {
    const f = fixture();
    f.def("OP10-032", { color: ["Green"], name: "Tashigi" });
    f.def("OPT797-GREEN", { color: ["Green"] });
    const tashigi = f.put("OP10-032", 0);
    const green = f.put("OPT797-GREEN", 0);

    removeWith(f, 1, "RETURN_TO_HAND", green);
    expect(f.prompt()).toBe("OPTIONAL_EFFECT");
    f.accept();

    expect(f.onField(green)).toBe(true);
    const onField = f.state.players[0].characters.find((c) => c?.instanceId === tashigi.instanceId);
    expect(onField?.state).toBe("RESTED");
  });

  it("OP13-008 Emporio.Ivankov trashes himself; the protected Revolutionary Army Character stays", () => {
    const f = fixture();
    f.def("OP13-008", { types: ["Revolutionary Army"] });
    f.def("OPT797-RA", { types: ["Revolutionary Army"] });
    const ivankov = f.put("OP13-008", 0);
    const ally = f.put("OPT797-RA", 0);

    removeWith(f, 1, "KO", ally);
    expect(f.prompt()).toBe("OPTIONAL_EFFECT");
    f.accept();

    expect(f.onField(ally)).toBe(true);
    expect(f.onField(ivankov)).toBe(false);
    expect(f.trashIds(0)).toContain("OP13-008");
  });
});

// ─── Schema lint ──────────────────────────────────────────────────────────────

describe("schema lint — context-seeded targets only where they are seeded", () => {
  const schemaWith = (effects: unknown[]) =>
    ({ card_id: "TEST-797", card_name: "t", card_type: "Character", effects }) as EffectSchema;
  const ko = (type: string) => [{ type: "KO", target: { type } }];

  it("accepts the authored OP04-047, ST08-013 and OP11-101", () => {
    for (const id of ["OP04-047", "ST08-013", "OP11-101"]) {
      expect(findContextTargetViolations(getEffectSchema(id)!)).toEqual([]);
    }
  });

  it("accepts BATTLE_TARGET under END_OF_BATTLE / COMBAT_VICTORY / CHARACTER_BATTLES", () => {
    for (const event of ["END_OF_BATTLE", "COMBAT_VICTORY", "CHARACTER_BATTLES"]) {
      expect(findContextTargetViolations(schemaWith([
        { id: "a", category: "auto", trigger: { event }, actions: ko("BATTLE_TARGET") },
      ]))).toEqual([]);
    }
  });

  it("rejects BATTLE_TARGET under a non-battle trigger, a mixed any_of, or in replacement_actions", () => {
    const violations = findContextTargetViolations(schemaWith([
      { id: "a", category: "auto", trigger: { keyword: "ON_PLAY" }, actions: ko("BATTLE_TARGET") },
      { id: "b", category: "auto", trigger: { any_of: [{ event: "END_OF_BATTLE" }, { keyword: "ON_PLAY" }] }, actions: ko("BATTLE_TARGET") },
      { id: "c", category: "replacement", replaces: { event: "WOULD_BE_KO" }, replacement_actions: ko("BATTLE_TARGET") },
    ]));
    expect(violations).toHaveLength(3);
    expect(violations[0]).toContain("TEST-797 effects[0].actions[0].target: BATTLE_TARGET");
  });

  it("rejects REPLACED_CARD outside replacement_actions, including a granted block", () => {
    const violations = findContextTargetViolations(schemaWith([
      { id: "a", category: "auto", trigger: { event: "END_OF_BATTLE" }, actions: ko("REPLACED_CARD") },
      {
        id: "b",
        category: "replacement",
        replaces: { event: "WOULD_BE_KO" },
        replacement_actions: [{
          type: "GRANT_EFFECT",
          params: { effect: { id: "g", category: "auto", trigger: { keyword: "ON_PLAY" }, actions: ko("REPLACED_CARD") } },
        }],
      },
    ]));
    expect(violations).toHaveLength(2);
    expect(violations[1]).toContain("params.effect.actions[0].target: REPLACED_CARD");
  });

  it("rejects REPLACED_CARD in replacement_actions of a non-replacement block", () => {
    expect(findContextTargetViolations(schemaWith([
      { id: "a", category: "auto", trigger: { keyword: "ON_PLAY" }, actions: ko("SELF"), replacement_actions: ko("REPLACED_CARD") },
    ]))).toHaveLength(1);
  });
});
