/**
 * OPT-871 — replacement proxies with an unprinted `exclude_self`, through the
 * real action pipeline with the authored production registry.
 *
 * The printed text of these cards has no "other than this Character" clause,
 * so the source itself is an eligible protected Character:
 *
 * - OP13-008 Emporio.Ivankov / OP13-047 Fossa / OP13-060 Amatsuki Toki: "If
 *   your <type> Character would be K.O.'d by your opponent's effect, you may
 *   trash this Character instead." Official FAQ (qa_op13.md:31, :110, :138):
 *   it can trash itself; it is trashed, not K.O.'d, so [On K.O.] does not
 *   activate.
 * - OP13-017 Monkey.D.Dragon: "[Once Per Turn] If your {Revolutionary Army}
 *   type Character would be removed from the field by your opponent's effect,
 *   you may give this Character -2000 power during this turn instead."
 *   FAQ qa_op13.md:45: usable even at 2000 power or less.
 * - OP12-048 Donquixote Rosinante: "[Opponent's Turn] If your blue {Navy} type
 *   Character would be removed from the field by your opponent's effect, you
 *   may rest this Character and trash 1 card from your hand instead." FAQ
 *   qa_op12.md:215-227: usable on itself; not when already rested; not with
 *   an empty hand.
 * - OP12-027 Koushirou prints "other than this Character": its self-exclusion
 *   must be preserved.
 *
 * "On K.O. did not fire" is proven with a test-only [On K.O.] draw appended to
 * the source's real effects; declining the replacement is the positive control
 * (the watcher does fire when the K.O. really happens).
 */

import { describe, expect, it } from "vitest";
import type { CardData, CardInstance, GameAction } from "../types.js";
import type { EffectSchema } from "../engine/effect-types.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { runPipeline } from "../engine/pipeline.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import { getEffectivePower } from "../engine/modifiers.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";

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
        actions: [
          { type, target: { type: "CHARACTER", controller: "EITHER", count: { exact: 1 } } },
        ],
      },
    ],
  };
}

function fixture() {
  const db = createTestCardDb();
  let state = createBattleReadyState(db);
  state.players.forEach((p) => {
    p.characters = padChars([]);
    p.hand = [];
  });

  /** `watch` appends a test-only [On K.O.] "draw 1" to the card's real schema. */
  function put(
    id: string,
    owner: 0 | 1 = 0,
    data: Partial<CardData> = {},
    opts: { suffix?: string; watch?: boolean; zone?: CardInstance["zone"] } = {},
  ) {
    const zone = opts.zone ?? "CHARACTER";
    const real = getEffectSchema(id);
    if (!db.has(id)) {
      const schema: EffectSchema | undefined =
        real && opts.watch
          ? {
              ...real,
              effects: [
                ...real.effects,
                {
                  id: "test_on_ko_watch",
                  category: "auto",
                  trigger: { keyword: "ON_KO" },
                  actions: [{ type: "DRAW", params: { amount: 1 } }],
                },
              ],
            }
          : real;
      db.set(id, {
        ...CARDS.VANILLA,
        id,
        name: real?.card_name ?? id,
        cost: 3,
        power: 4000,
        effectText: "",
        ...data,
        ...(schema ? { effectSchema: schema } : {}),
      });
    }
    const c: CardInstance = {
      instanceId: `${id}-${owner}-${zone}${opts.suffix ?? ""}`,
      cardId: id,
      controller: owner,
      owner,
      zone,
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 0,
    };
    if (zone === "HAND") state.players[owner].hand.push(c);
    else {
      const slot = state.players[owner].characters.findIndex((x) => !x);
      state.players[owner].characters[slot] = c;
      state = registerCardEnteredField(state, c, db.get(id)!);
    }
    return c;
  }

  function act(action: GameAction, player: 0 | 1 = state.turn.activePlayerIndex) {
    if (state.pendingPrompt) {
      const r = resumePromptLifecycle(state, action, db, {
        drainPregame: (s) => s,
        advanceStartOfTurn: (s) => s,
      });
      expect(r.responseRejected).toBe(false);
      state = r.state;
    } else {
      const r = runPipeline(state, action, db, player);
      expect(r.valid, r.error).toBe(true);
      state = r.state;
    }
  }

  /** `player` activates a test removal source and aims it at `target`. */
  function removeWith(player: 0 | 1, type: "KO" | "RETURN_TO_HAND", target: CardInstance) {
    state.turn.activePlayerIndex = player;
    const sourceId = `OPT871-${type}`;
    if (!db.has(sourceId)) {
      db.set(sourceId, {
        ...CARDS.VANILLA,
        id: sourceId,
        name: sourceId,
        effectSchema: removalSource(sourceId, type),
      });
    }
    const source = put(sourceId, player, {}, { suffix: `-src-${type}` });
    act({ type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId: "remove" });
    expect(state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    act({ type: "SELECT_TARGET", selectedInstanceIds: [target.instanceId] });
  }

  const find = (player: 0 | 1, card: CardInstance) =>
    state.players[player].characters.find((c) => c?.instanceId === card.instanceId);

  return {
    db,
    put,
    act,
    removeWith,
    get state() {
      return state;
    },
    onField: (player: 0 | 1, card: CardInstance) => !!find(player, card),
    trashCount: (player: 0 | 1, card: CardInstance) =>
      state.players[player].trash.filter((c) => c.cardId === card.cardId).length,
    inHand: (player: 0 | 1, card: CardInstance) =>
      state.players[player].hand.some((c) => c.cardId === card.cardId),
    power: (player: 0 | 1, card: CardInstance) =>
      getEffectivePower(find(player, card)!, db.get(card.cardId)!, state, db),
    acceptOffer() {
      expect(state.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
      expect(state.pendingPrompt?.respondingPlayer).toBe(0);
      act({ type: "PLAYER_CHOICE", choiceId: "accept" });
    },
  };
}

type Fixture = ReturnType<typeof fixture>;

function expectNoOffer(f: Fixture) {
  expect(f.state.pendingPrompt).toBeNull();
}

// ─── OP13-008 / OP13-047 / OP13-060 — "trash this Character instead" ───────

const TRASH_SELF_CARDS = [
  { id: "OP13-008", protectedTypes: ["Revolutionary Army"], otherTypes: ["Straw Hat Crew"] },
  { id: "OP13-047", protectedTypes: ["Whitebeard Pirates"], otherTypes: ["Straw Hat Crew"] },
  { id: "OP13-060", protectedTypes: ["Roger Pirates"], otherTypes: ["Straw Hat Crew"] },
] as const;

describe.each(TRASH_SELF_CARDS)("$id may trash itself instead of being K.O.'d", ({ id, protectedTypes, otherTypes }) => {
  const types = [...protectedTypes];

  it("offers the replacement when the source itself would be K.O.'d; accept trashes it without a K.O.", () => {
    const f = fixture();
    const self = f.put(id, 0, { types }, { watch: true });
    const handBefore = f.state.players[0].hand.length;

    f.removeWith(1, "KO", self);
    f.acceptOffer();

    expect(f.state.pendingPrompt).toBeNull();
    expect(f.onField(0, self)).toBe(false);
    expect(f.trashCount(0, self)).toBe(1); // trashed exactly once, no double move
    expect(f.state.players[0].hand).toHaveLength(handBefore); // [On K.O.] draw did not fire
  });

  it("positive control: declining the replacement K.O.s the source and its [On K.O.] fires", () => {
    const f = fixture();
    const self = f.put(id, 0, { types }, { watch: true });
    const handBefore = f.state.players[0].hand.length;

    f.removeWith(1, "KO", self);
    expect(f.state.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
    f.act({ type: "PLAYER_CHOICE", choiceId: "skip" });

    expect(f.onField(0, self)).toBe(false);
    expect(f.trashCount(0, self)).toBe(1);
    expect(f.state.players[0].hand).toHaveLength(handBefore + 1);
  });

  it("still protects a different eligible Character: the source is trashed, the ally stays", () => {
    const f = fixture();
    const self = f.put(id, 0, { types });
    const ally = f.put("ALLY-ELIGIBLE", 0, { types });

    f.removeWith(1, "KO", ally);
    f.acceptOffer();

    expect(f.onField(0, ally)).toBe(true);
    expect(f.onField(0, self)).toBe(false);
    expect(f.trashCount(0, self)).toBe(1);
  });

  it("does not offer it for an ineligible type of your own", () => {
    const f = fixture();
    f.put(id, 0, { types });
    const ally = f.put("ALLY-OTHER", 0, { types: [...otherTypes] });

    f.removeWith(1, "KO", ally);

    expectNoOffer(f);
    expect(f.trashCount(0, ally)).toBe(1);
  });

  it("does not offer it for the opponent's matching Character", () => {
    const f = fixture();
    const self = f.put(id, 0, { types });
    const theirs = f.put("THEIRS-ELIGIBLE", 1, { types });

    f.removeWith(1, "KO", theirs);

    expectNoOffer(f);
    expect(f.trashCount(1, theirs)).toBe(1);
    expect(f.onField(0, self)).toBe(true);
  });
});

// ─── OP13-017 Monkey.D.Dragon — "give this Character -2000 power instead" ───

describe("OP13-017 may protect itself from removal by giving itself -2000 power", () => {
  const types = ["Revolutionary Army"];

  it("offers the replacement when the source itself would be returned to hand; accept keeps it on the field at -2000", () => {
    const f = fixture();
    const self = f.put("OP13-017", 0, { types, power: 6000 });

    f.removeWith(1, "RETURN_TO_HAND", self);
    f.acceptOffer();

    expect(f.onField(0, self)).toBe(true);
    expect(f.inHand(0, self)).toBe(false);
    expect(f.power(0, self)).toBe(4000);
  });

  it("offers the replacement when the source itself would be K.O.'d (removal includes K.O.)", () => {
    const f = fixture();
    const self = f.put("OP13-017", 0, { types, power: 6000 });

    f.removeWith(1, "KO", self);
    f.acceptOffer();

    expect(f.onField(0, self)).toBe(true);
    expect(f.trashCount(0, self)).toBe(0);
    expect(f.power(0, self)).toBe(4000);
  });

  it("is usable even at 2000 power or less (FAQ qa_op13.md:45)", () => {
    const f = fixture();
    const self = f.put("OP13-017", 0, { types, power: 2000 });

    f.removeWith(1, "RETURN_TO_HAND", self);
    f.acceptOffer();

    expect(f.onField(0, self)).toBe(true);
    expect(f.power(0, self)).toBe(0);
  });

  it("still protects a different Revolutionary Army Character: the source takes -2000, the ally stays", () => {
    const f = fixture();
    const self = f.put("OP13-017", 0, { types, power: 6000 });
    const ally = f.put("ALLY-REV", 0, { types, power: 5000 });

    f.removeWith(1, "RETURN_TO_HAND", ally);
    f.acceptOffer();

    expect(f.onField(0, ally)).toBe(true);
    expect(f.power(0, self)).toBe(4000);
    expect(f.power(0, ally)).toBe(5000);
  });

  it("does not offer it for an ineligible type or the opponent's matching Character", () => {
    const f = fixture();
    f.put("OP13-017", 0, { types });
    const other = f.put("ALLY-OTHER", 0, { types: ["Straw Hat Crew"] });
    const theirs = f.put("THEIRS-REV", 1, { types });

    f.removeWith(1, "RETURN_TO_HAND", other);
    expectNoOffer(f);
    expect(f.inHand(0, other)).toBe(true);

    f.removeWith(1, "RETURN_TO_HAND", theirs);
    expectNoOffer(f);
    expect(f.inHand(1, theirs)).toBe(true);
  });
});

// ─── OP12-048 Donquixote Rosinante — "rest this Character and trash 1 card" ─

describe("OP12-048 may rest itself and trash a card instead of being removed", () => {
  const types = ["Navy"];
  const navy = { types, color: ["Blue"] } as Partial<CardData>;

  function withHand(f: Fixture, n: number) {
    return Array.from({ length: n }, (_, i) => f.put("HAND-FODDER", 0, {}, { zone: "HAND", suffix: `-${i}` }));
  }

  function finishSubstitute(f: Fixture, fodder: CardInstance) {
    if (f.state.pendingPrompt) {
      f.act({ type: "SELECT_TARGET", selectedInstanceIds: [fodder.instanceId] });
    }
  }

  it("offers the replacement when the source itself would be returned to hand (FAQ: Yes); accept rests it and trashes a card", () => {
    const f = fixture();
    const self = f.put("OP12-048", 0, navy);
    const [fodder] = withHand(f, 1);

    f.removeWith(1, "RETURN_TO_HAND", self);
    f.acceptOffer();
    finishSubstitute(f, fodder);

    expect(f.state.pendingPrompt).toBeNull();
    expect(f.onField(0, self)).toBe(true);
    expect(f.inHand(0, self)).toBe(false);
    expect(f.state.players[0].characters.find((c) => c?.instanceId === self.instanceId)?.state).toBe("RESTED");
    expect(f.trashCount(0, fodder)).toBe(1);
  });

  it("offers the replacement when the source itself would be K.O.'d", () => {
    const f = fixture();
    const self = f.put("OP12-048", 0, navy);
    const [fodder] = withHand(f, 1);

    f.removeWith(1, "KO", self);
    f.acceptOffer();
    finishSubstitute(f, fodder);

    expect(f.onField(0, self)).toBe(true);
    expect(f.trashCount(0, self)).toBe(0);
    expect(f.trashCount(0, fodder)).toBe(1);
  });

  it("still protects a different Navy Character", () => {
    const f = fixture();
    const self = f.put("OP12-048", 0, navy);
    const ally = f.put("ALLY-NAVY", 0, navy);
    const [fodder] = withHand(f, 1);

    f.removeWith(1, "RETURN_TO_HAND", ally);
    f.acceptOffer();
    finishSubstitute(f, fodder);

    expect(f.onField(0, ally)).toBe(true);
    expect(f.state.players[0].characters.find((c) => c?.instanceId === self.instanceId)?.state).toBe("RESTED");
    expect(f.trashCount(0, fodder)).toBe(1);
  });

  it("does not offer it for a non-blue or non-Navy Character, or the opponent's Navy Character", () => {
    const f = fixture();
    f.put("OP12-048", 0, navy);
    withHand(f, 1);
    const red = f.put("ALLY-RED-NAVY", 0, { types, color: ["Red"] });
    const notNavy = f.put("ALLY-BLUE-OTHER", 0, { types: ["Straw Hat Crew"], color: ["Blue"] });
    const theirs = f.put("THEIRS-NAVY", 1, navy);

    for (const [owner, card] of [[0, red], [0, notNavy], [1, theirs]] as const) {
      f.removeWith(1, "RETURN_TO_HAND", card);
      expectNoOffer(f);
      expect(f.inHand(owner, card)).toBe(true);
    }
  });

  // FAQ qa_op12.md:215-227 negatives. The engine's substitute-feasibility gate
  // (OPT-232) already declines both, so no it.fails ratchet is needed.
  it("does not offer it when the source is already rested (FAQ: No)", () => {
    const f = fixture();
    const self = f.put("OP12-048", 0, navy);
    f.state.players[0].characters.find((c) => c?.instanceId === self.instanceId)!.state = "RESTED";
    withHand(f, 1);

    f.removeWith(1, "RETURN_TO_HAND", self);

    expectNoOffer(f);
    expect(f.inHand(0, self)).toBe(true);
  });

  it("does not offer it when your hand is empty (FAQ: No)", () => {
    const f = fixture();
    const self = f.put("OP12-048", 0, navy);

    f.removeWith(1, "RETURN_TO_HAND", self);

    expectNoOffer(f);
    expect(f.inHand(0, self)).toBe(true);
  });
});

// ─── OP12-027 Koushirou — printed "other than this Character" ───────────────

describe("OP12-027 keeps its printed self-exclusion", () => {
  const slash = { attribute: ["Slash"], cost: 4 } as Partial<CardData>;

  it("does not offer the replacement when the source itself would be K.O.'d", () => {
    const f = fixture();
    const self = f.put("OP12-027", 0, slash);

    f.removeWith(1, "KO", self);

    expectNoOffer(f);
    expect(f.onField(0, self)).toBe(false);
    expect(f.trashCount(0, self)).toBe(1);
  });

  it("offers the replacement for a different Slash Character of cost 5 or less", () => {
    const f = fixture();
    const self = f.put("OP12-027", 0, slash);
    const ally = f.put("ALLY-SLASH", 0, slash);

    f.removeWith(1, "KO", ally);
    f.acceptOffer();

    expect(f.onField(0, ally)).toBe(true);
    expect(f.state.players[0].characters.find((c) => c?.instanceId === self.instanceId)?.state).toBe("RESTED");
  });
});
