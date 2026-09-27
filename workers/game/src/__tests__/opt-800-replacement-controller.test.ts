/**
 * OPT-800 — replacement target_filter controller scoping, through the real
 * action pipeline with the authored production registry.
 *
 * `triggers.ts` registers a replacement with a `target_filter` as a wildcard
 * (`appliesTo = []`) and relies on the filter at check time; a filter without
 * `controller` matches both players' cards. Printed text decides the scope:
 *
 * - ST29-008 Nami: "If your {Egghead} type Character would be K.O.'d by your
 *   opponent's effect, you may turn 1 card from the top of your Life cards
 *   face-up instead."
 * - OP15-105 Jewelry Bonney: "If your Character with 7000 base power or less
 *   would be removed from the field by your opponent's effect, you may add 1
 *   card from the top of your Life cards to your hand instead."
 * - EB03-001 Nefeltari Vivi (Leader): "[Once Per Turn] If your Character with
 *   a base cost of 4 or more would be K.O.'d, you may trash 1 card from your
 *   hand instead." (no cause filter — battle and effect both count)
 * - OP04-082 Kyros: "If this Character would be K.O.'d, you may rest your
 *   Leader or 1 [Corrida Coliseum] instead." (self-only)
 * - OP14-029 Tashigi: "[Opponent's Turn] If this Character would be removed
 *   from the field by your opponent's effect, you may rest 1 of your cards
 *   instead." (self-only)
 */

import { describe, expect, it } from "vitest";
import type { CardData, CardInstance, GameAction } from "../types.js";
import type { EffectSchema } from "../engine/effect-types.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { runPipeline } from "../engine/pipeline.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";

// Test-only effect sources: "[Activate: Main] K.O. / return 1 Character".
// EITHER lets each test aim the effect at its own or the opposing side.
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
          {
            type,
            target: { type: "CHARACTER", controller: "EITHER", count: { exact: 1 } },
          },
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

  function put(
    id: string,
    owner: 0 | 1 = 0,
    zone: CardInstance["zone"] = "CHARACTER",
    data: Partial<CardData> = {},
    suffix = "",
  ) {
    const schema = getEffectSchema(id);
    if (!db.has(id)) {
      db.set(id, {
        ...(zone === "LEADER" ? CARDS.LEADER : CARDS.VANILLA),
        id,
        name: schema?.card_name ?? id,
        cost: 3,
        power: 4000,
        effectText: "",
        ...data,
        ...(schema ? { effectSchema: schema } : {}),
      });
    }
    const c: CardInstance = {
      instanceId: `${id}-${owner}-${zone}${suffix}`,
      cardId: id,
      controller: owner,
      owner,
      zone,
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 0,
    };
    if (zone === "HAND") state.players[owner].hand.push(c);
    else if (zone === "LEADER") state.players[owner].leader = c;
    else {
      const slot = state.players[owner].characters.findIndex((x) => !x);
      state.players[owner].characters[slot] = c;
    }
    if (zone !== "HAND") state = registerCardEnteredField(state, c, db.get(id)!);
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

  /** `player` activates its removal source and aims it at `target`. */
  function removeWith(player: 0 | 1, type: "KO" | "RETURN_TO_HAND", target: CardInstance) {
    state.turn.activePlayerIndex = player;
    const sourceId = `OPT800-${type}`;
    if (!db.has(sourceId)) {
      db.set(sourceId, {
        ...CARDS.VANILLA,
        id: sourceId,
        name: sourceId,
        effectSchema: removalSource(sourceId, type),
      });
    }
    const source = put(sourceId, player, "CHARACTER", {}, `-src`);
    act({ type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId: "remove" });
    expect(state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    act({ type: "SELECT_TARGET", selectedInstanceIds: [target.instanceId] });
  }

  /** Battle: `player`'s Leader attacks a rested `target`; both sides pass. */
  function battle(player: 0 | 1, target: CardInstance) {
    state.turn.activePlayerIndex = player;
    const onBoard = state.players[target.controller].characters.find(
      (c) => c?.instanceId === target.instanceId,
    )!;
    onBoard.state = "RESTED";
    act({
      type: "DECLARE_ATTACK",
      attackerInstanceId: state.players[player].leader.instanceId,
      targetInstanceId: target.instanceId,
    });
    while (!state.pendingPrompt && state.turn.battle) act({ type: "PASS" });
  }

  function onField(player: 0 | 1, card: CardInstance) {
    return state.players[player].characters.some((c) => c?.instanceId === card.instanceId);
  }
  function inTrash(player: 0 | 1, card: CardInstance) {
    return state.players[player].trash.some((c) => c.cardId === card.cardId);
  }
  function inHand(player: 0 | 1, card: CardInstance) {
    return state.players[player].hand.some((c) => c.cardId === card.cardId);
  }
  function faceUpLife(player: 0 | 1) {
    return state.players[player].life.filter((l) => l.face === "UP").length;
  }

  return {
    db,
    put,
    act,
    removeWith,
    battle,
    onField,
    inTrash,
    inHand,
    faceUpLife,
    get state() {
      return state;
    },
  };
}

function expectNoReplacementPrompt(f: ReturnType<typeof fixture>) {
  expect(f.state.pendingPrompt).toBeNull();
}

// ─── ST29-008 Nami — WOULD_BE_KO, "your {Egghead} type Character" ────────────

describe("ST29-008 protects only its controller's Egghead Characters", () => {
  it("offers the replacement when the opponent's effect K.O.s a different Egghead of yours", () => {
    const f = fixture();
    f.put("ST29-008", 0);
    const ally = f.put("EGG-ALLY", 0, "CHARACTER", { types: ["Egghead"] });
    const lifeBefore = f.state.players[0].life.length;

    f.removeWith(1, "KO", ally);

    expect(f.state.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
    expect(f.state.pendingPrompt?.respondingPlayer).toBe(0);
    f.act({ type: "PLAYER_CHOICE", choiceId: "accept" });

    expect(f.onField(0, ally)).toBe(true);
    expect(f.inTrash(0, ally)).toBe(false);
    expect(f.state.players[0].life).toHaveLength(lifeBefore);
    expect(f.state.players[0].life[0].face).toBe("UP");
    expect(f.faceUpLife(0)).toBe(1);
  });

  it("does not offer it when the opponent K.O.s their own Egghead Character with their effect", () => {
    const f = fixture();
    f.put("ST29-008", 0);
    const theirs = f.put("EGG-THEIRS", 1, "CHARACTER", { types: ["Egghead"] });

    f.removeWith(1, "KO", theirs);

    expectNoReplacementPrompt(f);
    expect(f.onField(1, theirs)).toBe(false);
    expect(f.inTrash(1, theirs)).toBe(true);
    expect(f.faceUpLife(0)).toBe(0);
  });

  it("does not offer it when your effect K.O.s the opponent's Egghead Character", () => {
    const f = fixture();
    f.put("ST29-008", 0);
    const theirs = f.put("EGG-THEIRS", 1, "CHARACTER", { types: ["Egghead"] });

    f.removeWith(0, "KO", theirs);

    expectNoReplacementPrompt(f);
    expect(f.inTrash(1, theirs)).toBe(true);
    expect(f.faceUpLife(0)).toBe(0);
  });
});

// ─── OP15-105 Jewelry Bonney — WOULD_BE_REMOVED_FROM_FIELD ────────────────────

describe("OP15-105 protects only its controller's Characters from removal", () => {
  it("offers the replacement when the opponent's effect returns a different Character of yours", () => {
    const f = fixture();
    f.put("OP15-105", 0);
    const ally = f.put("ALLY-7000", 0, "CHARACTER", { power: 7000 });
    const lifeBefore = f.state.players[0].life.length;
    const handBefore = f.state.players[0].hand.length;

    f.removeWith(1, "RETURN_TO_HAND", ally);

    expect(f.state.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
    expect(f.state.pendingPrompt?.respondingPlayer).toBe(0);
    f.act({ type: "PLAYER_CHOICE", choiceId: "accept" });

    expect(f.onField(0, ally)).toBe(true);
    expect(f.state.players[0].life).toHaveLength(lifeBefore - 1);
    expect(f.state.players[0].hand).toHaveLength(handBefore + 1);
  });

  it("does not offer it when the opponent returns their own matching Character", () => {
    const f = fixture();
    f.put("OP15-105", 0);
    const theirs = f.put("THEIRS-7000", 1, "CHARACTER", { power: 7000 });
    const lifeBefore = f.state.players[0].life.length;

    f.removeWith(1, "RETURN_TO_HAND", theirs);

    expectNoReplacementPrompt(f);
    expect(f.onField(1, theirs)).toBe(false);
    expect(f.inHand(1, theirs)).toBe(true);
    expect(f.state.players[0].life).toHaveLength(lifeBefore);
  });

  it("does not offer it when your effect returns the opponent's matching Character", () => {
    const f = fixture();
    f.put("OP15-105", 0);
    const theirs = f.put("THEIRS-7000", 1, "CHARACTER", { power: 7000 });
    const lifeBefore = f.state.players[0].life.length;

    f.removeWith(0, "RETURN_TO_HAND", theirs);

    expectNoReplacementPrompt(f);
    expect(f.inHand(1, theirs)).toBe(true);
    expect(f.state.players[0].life).toHaveLength(lifeBefore);
  });
});

// ─── EB03-001 Nefeltari Vivi — WOULD_BE_KO with no cause filter ──────────────

describe("EB03-001 protects only its controller's Characters (no cause filter)", () => {
  it("offers the replacement when your cost-4 Character would be K.O.'d in battle", () => {
    const f = fixture();
    f.put("EB03-001", 0, "LEADER");
    const fodder = f.put("FODDER", 0, "HAND");
    const ally = f.put("COST4-ALLY", 0, "CHARACTER", { cost: 4, power: 4000 });

    f.battle(1, ally);

    expect(f.state.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
    expect(f.state.pendingPrompt?.respondingPlayer).toBe(0);
    f.act({ type: "PLAYER_CHOICE", choiceId: "accept" });
    if (f.state.pendingPrompt?.options.promptType === "SELECT_TARGET") {
      f.act({ type: "SELECT_TARGET", selectedInstanceIds: [fodder.instanceId] });
    }

    expect(f.onField(0, ally)).toBe(true);
    expect(f.inTrash(0, fodder)).toBe(true);
  });

  it("does not offer it when your Leader K.O.s the opponent's cost-4 Character in battle", () => {
    const f = fixture();
    f.put("EB03-001", 0, "LEADER");
    const fodder = f.put("FODDER", 0, "HAND");
    const theirs = f.put("COST4-THEIRS", 1, "CHARACTER", { cost: 4, power: 4000 });

    f.battle(0, theirs);

    expectNoReplacementPrompt(f);
    expect(f.inTrash(1, theirs)).toBe(true);
    expect(f.inHand(0, fodder)).toBe(true);
  });

  it("does not offer it when the opponent K.O.s their own cost-4 Character with their effect", () => {
    const f = fixture();
    f.put("EB03-001", 0, "LEADER");
    const fodder = f.put("FODDER", 0, "HAND");
    const theirs = f.put("COST4-THEIRS", 1, "CHARACTER", { cost: 4, power: 4000 });

    f.removeWith(1, "KO", theirs);

    expectNoReplacementPrompt(f);
    expect(f.inTrash(1, theirs)).toBe(true);
    expect(f.inHand(0, fodder)).toBe(true);
  });
});

// ─── OP04-082 Kyros — self-only WOULD_BE_KO ──────────────────────────────────

describe("OP04-082 protects only itself", () => {
  it("offers the replacement when this Character would be K.O.'d", () => {
    const f = fixture();
    const kyros = f.put("OP04-082", 0);

    f.removeWith(1, "KO", kyros);

    expect(f.state.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
    expect(f.state.pendingPrompt?.respondingPlayer).toBe(0);
    f.act({ type: "PLAYER_CHOICE", choiceId: "accept" });
    if (f.state.pendingPrompt?.options.promptType === "PLAYER_CHOICE") {
      const first = f.state.pendingPrompt.options.choices[0].id;
      f.act({ type: "PLAYER_CHOICE", choiceId: first });
    }

    expect(f.onField(0, kyros)).toBe(true);
    expect(f.state.players[0].leader.state).toBe("RESTED");
  });

  it("does not offer it when another of your Characters would be K.O.'d", () => {
    const f = fixture();
    f.put("OP04-082", 0);
    const ally = f.put("ALLY", 0);

    f.removeWith(1, "KO", ally);

    expectNoReplacementPrompt(f);
    expect(f.inTrash(0, ally)).toBe(true);
    expect(f.state.players[0].leader.state).toBe("ACTIVE");
  });

  it("does not offer it when an opponent's Character would be K.O.'d", () => {
    const f = fixture();
    f.put("OP04-082", 0);
    const theirs = f.put("THEIRS", 1);

    f.removeWith(1, "KO", theirs);

    expectNoReplacementPrompt(f);
    expect(f.inTrash(1, theirs)).toBe(true);
    expect(f.state.players[0].leader.state).toBe("ACTIVE");
  });
});

// ─── OP14-029 Tashigi — self-only WOULD_BE_REMOVED_FROM_FIELD ────────────────

describe("OP14-029 protects only itself", () => {
  it("offers the replacement on the opponent's turn when the opponent's effect would remove this Character", () => {
    const f = fixture();
    const tashigi = f.put("OP14-029", 0);

    f.removeWith(1, "RETURN_TO_HAND", tashigi);

    expect(f.state.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
    expect(f.state.pendingPrompt?.respondingPlayer).toBe(0);
    f.act({ type: "PLAYER_CHOICE", choiceId: "accept" });
    if (f.state.pendingPrompt?.options.promptType === "SELECT_TARGET") {
      f.act({
        type: "SELECT_TARGET",
        selectedInstanceIds: [f.state.players[0].leader.instanceId],
      });
    }

    expect(f.onField(0, tashigi)).toBe(true);
    expect(f.inHand(0, tashigi)).toBe(false);
  });

  it("does not offer it when the opponent's effect would remove another of your Characters", () => {
    const f = fixture();
    f.put("OP14-029", 0);
    const ally = f.put("ALLY", 0);

    f.removeWith(1, "RETURN_TO_HAND", ally);

    expectNoReplacementPrompt(f);
    expect(f.inHand(0, ally)).toBe(true);
  });

  it("does not offer it when the opponent removes their own Character", () => {
    const f = fixture();
    f.put("OP14-029", 0);
    const theirs = f.put("THEIRS", 1);

    f.removeWith(1, "RETURN_TO_HAND", theirs);

    expectNoReplacementPrompt(f);
    expect(f.inHand(1, theirs)).toBe(true);
  });
});
