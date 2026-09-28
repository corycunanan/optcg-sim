/**
 * OPT-801 — OP11-041 Nami (Leader), through the real action pipeline with the
 * authored production registry.
 *
 * Printed (docs/cards/OP-11.md): "[Your Turn] [Once Per Turn] This effect can
 * be activated when a card is removed from your or your opponent's Life cards.
 * If you have 7 or less cards in your hand, draw 1 card."
 *
 * FAQ (docs/FAQs/qa_op11.md): removal from your own or your opponent's Life
 * both qualify; OP06-106 Kouzuki Hiyori moving a Life card to hand during your
 * turn qualifies; EB01-052 Viola reordering Life does not (nothing removed).
 *
 * The schema was authored on `LIFE_CARD_REMOVED`, which had no matcher, so the
 * draw never fired. It now listens on `CARD_REMOVED_FROM_LIFE`.
 */

import { describe, expect, it } from "vitest";
import type { CardData, CardInstance, GameAction, GameState, LifeCard } from "../types.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { runPipeline } from "../engine/pipeline.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";

const NAMI = "OP11-041";

function fixture(handSize: number) {
  const db = createTestCardDb();
  let state = createBattleReadyState(db);
  state.players.forEach((p, owner) => {
    p.characters = padChars([]);
    p.hand = Array.from({ length: owner === 0 ? handSize : 0 }, (_, i) => ({
      instanceId: `hand-${owner}-${i}`,
      cardId: CARDS.VANILLA.id,
      controller: owner as 0 | 1,
      owner: owner as 0 | 1,
      zone: "HAND" as const,
      state: "ACTIVE" as const,
      attachedDon: [],
      turnPlayed: 0,
    }));
    // Vanilla (no [Trigger]) Life so no Trigger window intervenes.
    p.life = Array.from({ length: 4 }, (_, i): LifeCard => ({
      instanceId: `life-${owner}-${i}`,
      cardId: CARDS.VANILLA.id,
      face: "DOWN",
    }));
  });

  function put(
    id: string,
    owner: 0 | 1,
    zone: CardInstance["zone"],
    data: Partial<CardData> = {},
  ): CardInstance {
    const schema = getEffectSchema(id);
    expect(schema, `${id} authored`).toBeDefined();
    db.set(id, {
      ...(zone === "LEADER" ? CARDS.LEADER : CARDS.VANILLA),
      id,
      name: schema!.card_name ?? id,
      effectText: "",
      ...data,
      effectSchema: schema!,
    });
    const c: CardInstance = {
      instanceId: `${id}-${owner}-${zone}`,
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

  const nami = put(NAMI, 0, "LEADER");

  /** A 5000-power second attacker for player 0 (beats the 5000 Leader). */
  function putAttacker(): CardInstance {
    const c: CardInstance = {
      instanceId: "attacker-0",
      cardId: CARDS.UNBLOCKABLE.id,
      controller: 0,
      owner: 0,
      zone: "CHARACTER",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 0,
    };
    state.players[0].characters[state.players[0].characters.findIndex((x) => !x)] = c;
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

  /** The prompt, if any, is OP11-041's optional draw. */
  function namiOffered(): boolean {
    const prompt = state.pendingPrompt;
    if (!prompt || prompt.options.promptType !== "OPTIONAL_EFFECT") return false;
    const frame = state.effectStack.at(-1);
    return frame?.sourceCardInstanceId === nami.instanceId &&
      frame.effectBlock.id === "life_removed_draw";
  }

  /** `attacker` (active player's) attacks the opposing Leader; defender passes block + counter. */
  function attackLeader(attacker: CardInstance) {
    const defender = attacker.owner === 0 ? 1 : 0;
    act({
      type: "DECLARE_ATTACK",
      attackerInstanceId: attacker.instanceId,
      targetInstanceId: state.players[defender].leader.instanceId,
    });
    act({ type: "PASS" });
    act({ type: "PASS" });
  }

  /** ADVANCE_PHASE until `player`'s Main Phase. */
  function advanceToMainOf(player: 0 | 1) {
    for (let i = 0; i < 12; i++) {
      if (state.turn.activePlayerIndex === player && state.turn.phase === "MAIN" && !state.pendingPrompt) return;
      act({ type: "ADVANCE_PHASE" });
    }
    throw new Error(`did not reach player ${player} MAIN`);
  }

  return {
    db,
    nami,
    put,
    putAttacker,
    act,
    namiOffered,
    attackLeader,
    advanceToMainOf,
    accept: () => act({ type: "PLAYER_CHOICE", choiceId: "accept" }),
    decline: () => act({ type: "PASS" }),
    done() {
      expect(state.pendingPrompt).toBeNull();
      expect(state.effectStack).toHaveLength(0);
    },
    get state(): GameState {
      return state;
    },
  };
}

function lifeRemovals(state: GameState, owner: 0 | 1): number {
  return state.eventLog.filter((e) => e.type === "CARD_REMOVED_FROM_LIFE" && e.playerIndex === owner).length;
}

describe("OPT-801 — OP11-041 Nami draws when a Life card is removed", () => {
  it("battle damage to the opponent's Life on your turn offers the draw; accepting draws 1", () => {
    const f = fixture(3);
    f.attackLeader(f.nami);
    expect(lifeRemovals(f.state, 1)).toBe(1);
    expect(f.namiOffered()).toBe(true);
    f.accept();
    f.done();
    expect(f.state.players[0].hand).toHaveLength(4);
  });

  it("your own Life trashed by your effect's cost on your turn offers the draw", () => {
    // OP08-101 Charlotte Angel: "[Activate: Main] [Once Per Turn] You may
    // trash 1 card from the top of your Life cards: …" — own Life → trash.
    const f = fixture(3);
    const angel = f.put("OP08-101", 0, "CHARACTER");
    f.act({ type: "ACTIVATE_EFFECT", cardInstanceId: angel.instanceId, effectId: "activate_life_swap" });
    if (f.state.pendingPrompt?.options.promptType === "OPTIONAL_EFFECT" && !f.namiOffered()) f.accept();
    expect(lifeRemovals(f.state, 0)).toBe(1);
    expect(f.state.players[0].life).toHaveLength(3);
    expect(f.namiOffered()).toBe(true);
    f.accept();
    f.done();
    expect(f.state.players[0].hand).toHaveLength(4);
  });

  it("OP06-106 Hiyori moving your own Life card to hand on your turn qualifies (FAQ)", () => {
    const f = fixture(3);
    const hiyori = f.put("OP06-106", 0, "HAND", { cost: 1 });
    f.act({ type: "PLAY_CARD", cardInstanceId: hiyori.instanceId });
    // Hiyori's optional cost: accept, then choose top (choice "0").
    expect(f.state.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
    f.accept();
    f.act({ type: "PLAYER_CHOICE", choiceId: "0" });
    expect(lifeRemovals(f.state, 0)).toBe(1);
    // Hiyori's "Add up to 1 card from your hand to the top of your Life
    // cards" auto-resolves; Nami is offered only after both Life→hand (4→3
    // Life, 3→4 hand) and hand→Life (back to 4 Life, 3 hand) complete.
    expect(f.state.players[0].life).toHaveLength(4);
    expect(f.state.players[0].hand).toHaveLength(3);
    expect(f.namiOffered()).toBe(true);
    f.accept();
    f.done();
    expect(f.state.players[0].hand).toHaveLength(4);
  });

  it("removal during the opponent's turn does not fire", () => {
    const f = fixture(3);
    f.advanceToMainOf(1);
    const handBefore = f.state.players[0].hand.length;
    f.attackLeader(f.state.players[1].leader);
    expect(lifeRemovals(f.state, 0)).toBe(1);
    expect(f.namiOffered()).toBe(false);
    f.done();
    // Only the damaged Life card itself reaches hand — no Nami draw.
    expect(f.state.players[0].hand).toHaveLength(handBefore + 1);
  });

  it("once per turn: a second removal the same turn does not offer again; the next turn does", () => {
    const f = fixture(3);
    const attacker = f.putAttacker();
    f.attackLeader(f.nami);
    f.accept();
    f.done();
    expect(f.state.players[0].hand).toHaveLength(4);

    f.attackLeader(attacker);
    expect(lifeRemovals(f.state, 1)).toBe(2);
    expect(f.namiOffered()).toBe(false);
    f.done();
    expect(f.state.players[0].hand).toHaveLength(4);

    f.advanceToMainOf(1);
    f.advanceToMainOf(0);
    const handBefore = f.state.players[0].hand.length;
    f.attackLeader(f.nami);
    expect(f.namiOffered()).toBe(true);
    f.accept();
    f.done();
    expect(f.state.players[0].hand).toHaveLength(handBefore + 1);
  });

  it("declining is not a use: a later removal the same turn offers again", () => {
    const f = fixture(3);
    const attacker = f.putAttacker();
    f.attackLeader(f.nami);
    expect(f.namiOffered()).toBe(true);
    f.decline();
    f.done();
    expect(f.state.players[0].hand).toHaveLength(3);

    f.attackLeader(attacker);
    expect(f.namiOffered()).toBe(true);
    f.accept();
    f.done();
    expect(f.state.players[0].hand).toHaveLength(4);
  });

  it("7 cards in hand draws; 8 cards does not", () => {
    const seven = fixture(7);
    seven.attackLeader(seven.nami);
    expect(seven.namiOffered()).toBe(true);
    seven.accept();
    seven.done();
    expect(seven.state.players[0].hand).toHaveLength(8);

    const eight = fixture(8);
    eight.attackLeader(eight.nami);
    expect(lifeRemovals(eight.state, 1)).toBe(1);
    expect(eight.namiOffered()).toBe(false);
    eight.done();
    expect(eight.state.players[0].hand).toHaveLength(8);
  });
});
