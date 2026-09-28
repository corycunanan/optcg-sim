/**
 * OPT-793 — "until you have N" semantics through the real action pipeline.
 *
 * Card text (docs/cards/):
 * - OP14-054 Fisher Tiger: "[End of Your Turn] Trash cards from your hand until
 *   you have 5 cards in your hand." OP14 FAQ: with 5 or fewer cards nothing is
 *   trashed; only 6+ trims to 5.
 * - OP05-058 It's a Waste of Human Life!!: "…Then, you and your opponent trash
 *   cards from your hands until you each have 5 cards in your hands." OP05 FAQ:
 *   the turn player (activator) chooses and trashes first, then the opponent
 *   chooses from their own hand (also Comprehensive Rules 1-3-4 / 1-3-10).
 * - OP08-074 Black Maria: "…Then, at the end of this turn, return DON!! cards
 *   from your field to your DON!! deck until you have the same number of DON!!
 *   cards on your field as your opponent." Field = cost area + DON!! attached
 *   to Leader/Characters (Rules 3-1-2 / 8-3-1-6); OP08 FAQ: the return still
 *   happens if Black Maria left the field, and it counts as "a DON!! card on
 *   your field is returned to your DON!! deck".
 */
import { describe, expect, it } from "vitest";
import type {
  CardData,
  CardInstance,
  DonInstance,
  GameAction,
  GameState,
} from "../types.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { runPipeline } from "../engine/pipeline.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
  padChars,
} from "./helpers.js";

function dons(owner: 0 | 1, count: number, state: "ACTIVE" | "RESTED", tag: string): DonInstance[] {
  return Array.from({ length: count }, (_, i) => ({
    instanceId: `don-${tag}-${owner}-${i}`,
    state,
    attachedTo: null,
  }));
}

function fixture() {
  const db = createTestCardDb();
  let state: GameState = createBattleReadyState(db);
  state.players.forEach((p) => {
    p.characters = padChars([]);
    p.hand = [];
  });
  let serial = 0;
  function put(
    id: string,
    owner: 0 | 1 = 0,
    zone: CardInstance["zone"] = "CHARACTER",
    data: Partial<CardData> = {}
  ) {
    const schema = getEffectSchema(id);
    db.set(id, {
      ...(zone === "LEADER" ? CARDS.LEADER : CARDS.VANILLA),
      id,
      name: schema?.card_name ?? id,
      cost: 3,
      power: 4000,
      ...data,
      ...(schema ? { effectSchema: schema } : {}),
    });
    const c: CardInstance = {
      instanceId: `${id}-${owner}-${zone}-${serial++}`,
      cardId: id,
      controller: owner,
      owner,
      zone,
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 1,
    };
    if (zone === "HAND") state.players[owner].hand.push(c);
    else if (zone === "LEADER") state.players[owner].leader = c;
    else
      state.players[owner].characters[
        state.players[owner].characters.findIndex((slot) => !slot)
      ] = c;
    if (zone === "LEADER" || zone === "CHARACTER")
      state = registerCardEnteredField(state, c, db.get(id)!);
    return c;
  }
  function fillHand(owner: 0 | 1, count: number) {
    return Array.from({ length: count }, () => put("OPT793-FILLER", owner, "HAND"));
  }
  function run(action: GameAction, player: 0 | 1 = state.turn.activePlayerIndex) {
    const r = runPipeline(state, action, db, player);
    expect(r.valid, r.error).toBe(true);
    state = r.state;
  }
  /** Respond to the pending prompt; returns whether the response was rejected. */
  function respond(action: GameAction): boolean {
    const r = resumePromptLifecycle(state, action, db, {
      drainPregame: (s) => s,
      advanceStartOfTurn: (s) => s,
    });
    state = r.state;
    return r.responseRejected;
  }
  function selectHand(owner: 0 | 1, count: number): boolean {
    const ids = state.players[owner].hand.slice(0, count).map((c) => c.instanceId);
    return respond({ type: "SELECT_TARGET", selectedInstanceIds: ids });
  }
  function handTrashEvents(owner: 0 | 1) {
    return state.eventLog.filter(
      (e) =>
        e.type === "CARD_TRASHED" &&
        e.playerIndex === owner &&
        (e.payload as { from?: string } | undefined)?.from === "HAND"
    );
  }
  function fieldDon(owner: 0 | 1): number {
    const p = state.players[owner];
    return (
      p.donCostArea.length +
      p.leader.attachedDon.length +
      p.characters.reduce((sum, c) => sum + (c?.attachedDon.length ?? 0), 0)
    );
  }
  return {
    db,
    put,
    fillHand,
    run,
    respond,
    selectHand,
    handTrashEvents,
    fieldDon,
    get state() {
      return state;
    },
    set state(next: GameState) {
      state = next;
    },
  };
}

function trashPrompt(state: GameState) {
  const prompt = state.pendingPrompt;
  expect(prompt?.options.promptType).toBe("SELECT_TARGET");
  if (prompt?.options.promptType !== "SELECT_TARGET") throw new Error("expected SELECT_TARGET");
  return { options: prompt.options, respondingPlayer: prompt.respondingPlayer };
}

// ─── Slice 1: hand primitive + OP14-054 ──────────────────────────────────────

describe("OPT-793 OP14-054 Fisher Tiger — [End of Your Turn] trash until 5", () => {
  function atEndOfTurn(handSize: number) {
    const f = fixture();
    f.put("OP14-054", 0);
    f.fillHand(0, handSize);
    f.run({ type: "ADVANCE_PHASE" });
    return f;
  }

  it("with 7 cards prompts the owner to trash exactly 2, leaving 5", () => {
    const f = atEndOfTurn(7);
    const { options, respondingPlayer } = trashPrompt(f.state);
    expect(respondingPlayer).toBe(0);
    expect(options.countMin).toBe(2);
    expect(options.countMax).toBe(2);
    expect(options.blindSelection).toBeUndefined();
    expect(f.selectHand(0, 2)).toBe(false);
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.state.players[0].hand).toHaveLength(5);
    const events = f.handTrashEvents(0);
    expect(events).toHaveLength(1);
    expect((events[0].payload as { count: number }).count).toBe(2);
  });

  it("with 6 cards trashes exactly 1", () => {
    const f = atEndOfTurn(6);
    expect(trashPrompt(f.state).options.countMin).toBe(1);
    expect(f.selectHand(0, 1)).toBe(false);
    expect(f.state.players[0].hand).toHaveLength(5);
  });

  it.each([5, 4, 0])("with %i cards trashes nothing and never prompts", (size) => {
    const f = atEndOfTurn(size);
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.state.players[0].hand).toHaveLength(size);
    expect(f.handTrashEvents(0)).toHaveLength(0);
    expect(f.state.turn.activePlayerIndex).toBe(1);
  });

  it.each([1, 3, 0])("rejects a %i-card response to a trash-2 prompt", (count) => {
    const f = atEndOfTurn(7);
    trashPrompt(f.state);
    const before = f.state;
    expect(f.selectHand(0, count)).toBe(true);
    expect(f.state.players[0].hand).toHaveLength(7);
    expect(f.state.pendingPrompt).toEqual(before.pendingPrompt);
    // The original prompt still resolves correctly afterwards.
    expect(f.selectHand(0, 2)).toBe(false);
    expect(f.state.players[0].hand).toHaveLength(5);
  });

  it("counts at resolution: On Play draw 3 takes 4 → 7, end of turn trims 2", () => {
    const f = fixture();
    f.db.set(CARDS.LEADER.id, { ...CARDS.LEADER, types: ["Fish-Man"] });
    const tiger = f.put("OP14-054", 0, "HAND", { cost: 1 });
    f.fillHand(0, 4);
    f.run({ type: "PLAY_CARD", cardInstanceId: tiger.instanceId });
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.state.players[0].hand).toHaveLength(7);
    f.run({ type: "ADVANCE_PHASE" });
    expect(trashPrompt(f.state).options.countMin).toBe(2);
    expect(f.selectHand(0, 2)).toBe(false);
    expect(f.state.players[0].hand).toHaveLength(5);
  });

  it("survives a JSON round-trip of the pending end-of-turn prompt", () => {
    const f = atEndOfTurn(8);
    f.state = JSON.parse(JSON.stringify(f.state));
    expect(trashPrompt(f.state).options.countMin).toBe(3);
    expect(f.selectHand(0, 3)).toBe(false);
    expect(f.state.players[0].hand).toHaveLength(5);
    expect(f.state.turn.activePlayerIndex).toBe(1);
  });
});
