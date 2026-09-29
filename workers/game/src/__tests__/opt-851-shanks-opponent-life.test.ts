import { describe, expect, it } from "vitest";
import type { Action } from "../engine/effect-types.js";
import { AUTHORED_SCHEMAS } from "../engine/authored-schemas.generated.js";
import { executeTrashFromLife } from "../engine/effect-resolver/actions/life.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { runPipeline } from "../engine/pipeline.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import type { CardData, CardInstance, GameAction, GameState } from "../types.js";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
  padChars,
} from "./helpers.js";

// ST13-009 Shanks (docs/cards/ST-13.md, docs/FAQs/qa_st-13.md):
// "[On Play] You may turn 1 of your face-up Life cards face-down: If your
// opponent has 7 or more cards in their hand, trash up to 1 card from the top
// of your opponent's Life cards." FAQ: any face-up Life card may be turned.

// Printed metadata from the official ST-13 card list (vegapull 569013).
const SHANKS_PRINTED: Partial<CardData> = {
  id: "ST13-009",
  name: "Shanks",
  type: "Character",
  color: ["Yellow"],
  cost: 7,
  power: 7000,
  counter: null,
  attribute: ["Slash"],
  types: ["The Four Emperors", "Red-Haired Pirates"],
  effectText:
    "[On Play] You may turn 1 of your face-up Life cards face-down: If your opponent has 7 or more cards in their hand, trash up to 1 card from the top of your opponent's Life cards.",
  triggerText: null,
};

function card(id: string, cardId: string, owner: 0 | 1, zone: CardInstance["zone"]): CardInstance {
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

function fixture(opponentHand: number, opponentLife = 5) {
  const db = createTestCardDb();
  const schema = getEffectSchema("ST13-009");
  expect(schema).toBeTruthy();
  db.set("ST13-009", {
    ...CARDS.VANILLA,
    ...SHANKS_PRINTED,
    effectSchema: schema!,
  } as CardData);
  let state = createBattleReadyState(db);
  state.players.forEach((p) => (p.characters = padChars([])));
  const shanks = card("shanks-hand", "ST13-009", 0, "HAND");
  state.players[0].hand = [shanks];
  // Own Life: only a non-top card is face-up (FAQ: any position is payable).
  state.players[0].life = state.players[0].life.map((c, i) => ({
    ...c,
    face: i === 3 ? "UP" : "DOWN",
  }));
  state.players[1].hand = Array.from({ length: opponentHand }, (_, i) =>
    card(`opp-hand-${i}`, CARDS.VANILLA.id, 1, "HAND"));
  // Opponent top Life is a [Trigger] card: trashing Life must never reveal it.
  state.players[1].life = state.players[1].life
    .slice(0, opponentLife)
    .map((c, i) => (i === 0 ? { ...c, cardId: CARDS.TRIGGER.id } : c));

  function act(action: GameAction) {
    if (state.pendingPrompt) {
      const r = resumePromptLifecycle(state, action, db, {
        drainPregame: (s) => s,
        advanceStartOfTurn: (s) => s,
      });
      expect(r.responseRejected).toBe(false);
      state = r.state;
    } else {
      const r = runPipeline(state, action, db, 0);
      expect(r.valid, r.error).toBe(true);
      state = r.state;
    }
    // Every prompt boundary survives the Durable Object persistence round trip.
    state = JSON.parse(JSON.stringify(state)) as GameState;
  }
  return {
    act,
    get state() {
      return state;
    },
  };
}

type Scenario = {
  name: string;
  hand: number;
  life?: number;
  accept: boolean;
  choose?: 0 | 1;
};

const scenarios: Scenario[] = [
  { name: "hand 6 (below seven) still pays the flip, trashes nothing", hand: 6, accept: true },
  { name: "hand exactly 7, choose 1", hand: 7, accept: true, choose: 1 },
  { name: "hand 8 (above seven), choose 1", hand: 8, accept: true, choose: 1 },
  { name: "hand 7, choose 0 (up to)", hand: 7, accept: true, choose: 0 },
  { name: "hand 7, empty opponent Life", hand: 7, life: 0, accept: true, choose: 0 },
  { name: "decline the optional cost", hand: 7, accept: false },
];

describe("OPT-851 ST13-009 Shanks trashes the opponent's Life", () => {
  it.each(scenarios)("$name", ({ hand, life, accept, choose }) => {
    const f = fixture(hand, life);
    const ownBefore = structuredClone(f.state.players[0].life);
    const oppLifeBefore = structuredClone(f.state.players[1].life);
    const oppHandBefore = f.state.players[1].hand.map((c) => c.instanceId);
    const oppTrashBefore = f.state.players[1].trash.length;
    const ownTrashBefore = f.state.players[0].trash.length;
    const logStart = f.state.eventLog.length;

    f.act({ type: "PLAY_CARD", cardInstanceId: "shanks-hand" });
    // Legal play: the printed cost of 7 rests 7 of the 8 active DON!!.
    expect(f.state.players[0].donCostArea.filter((d) => d.state === "RESTED")).toHaveLength(7);
    expect(f.state.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
    expect(f.state.pendingPrompt?.respondingPlayer).toBe(0);
    f.act({ type: "PLAYER_CHOICE", choiceId: accept ? "accept" : "skip" });

    const condition = accept && hand >= 7;
    if (condition) {
      const prompt = f.state.pendingPrompt;
      expect(prompt?.options.promptType).toBe("PLAYER_CHOICE");
      expect(prompt?.respondingPlayer).toBe(0);
      if (prompt?.options.promptType !== "PLAYER_CHOICE") throw new Error("no up-to prompt");
      const max = Math.min(1, oppLifeBefore.length);
      expect(prompt.options.choices.map((c) => c.id)).toEqual(
        Array.from({ length: max + 1 }, (_, v) => `choose-value:${v}`),
      );
      f.act({ type: "PLAYER_CHOICE", choiceId: `choose-value:${choose}` });
    }
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.state.effectStack).toHaveLength(0);

    // Own Life: identity, count and order unchanged; only the paid flip.
    expect(f.state.players[0].life).toEqual(
      ownBefore.map((c, i) => (accept && i === 3 ? { ...c, face: "DOWN" } : c)),
    );
    expect(f.state.players[0].trash).toHaveLength(ownTrashBefore);

    const trashed = condition && choose === 1 && oppLifeBefore.length > 0;
    expect(f.state.players[1].life).toEqual(trashed ? oppLifeBefore.slice(1) : oppLifeBefore);
    expect(f.state.players[1].trash).toHaveLength(oppTrashBefore + (trashed ? 1 : 0));
    // No Life [Trigger]: the opponent's hand is untouched and nothing is pending.
    expect(f.state.players[1].hand.map((c) => c.instanceId)).toEqual(oppHandBefore);

    const log = f.state.eventLog.slice(logStart);
    const removals = log.filter((e) => e.type === "CARD_REMOVED_FROM_LIFE");
    const lifeTrashes = log.filter(
      (e) => e.type === "CARD_TRASHED" && (e.payload as { from?: string }).from === "LIFE",
    );
    expect(log.some((e) => e.type === "TRIGGER_ACTIVATED")).toBe(false);
    if (trashed) {
      const oldTop = oppLifeBefore[0];
      const moved = f.state.players[1].trash[0];
      expect(moved.cardId).toBe(CARDS.TRIGGER.id);
      expect(moved.owner).toBe(1);
      expect(moved.zone).toBe("TRASH");
      expect(moved.instanceId).not.toBe(oldTop.instanceId);
      expect(removals).toHaveLength(1);
      expect(removals[0]).toMatchObject({
        playerIndex: 1,
        payload: { cardInstanceId: oldTop.instanceId, newCardInstanceId: moved.instanceId },
      });
      expect(lifeTrashes).toHaveLength(1);
      expect(lifeTrashes[0]).toMatchObject({ playerIndex: 1, payload: { count: 1 } });
    } else {
      expect(removals).toHaveLength(0);
      expect(lifeTrashes).toHaveLength(0);
    }
  });
});

// ─── Authored TRASH_FROM_LIFE consumer inventory ──────────────────────────────
// Every action-position TRASH_FROM_LIFE in the generated registry, walked
// recursively (choice options, replacement actions, THEN chains), with the
// Life owner its printed text names relative to the effect controller.
// Cost-position TRASH_FROM_LIFE entries are paid by the cost orchestrator and
// are out of this contract.
const EXPECTED_OWNER: Record<string, "SELF" | "OPPONENT"> = {
  "EB03-057 .effects[1].actions[0]": "OPPONENT",
  "OP03-114 .effects[0].actions[1]": "OPPONENT",
  "OP03-120 .effects[0].actions[0]": "OPPONENT",
  "OP05-099 .effects[0].actions[0].params.options[0][0]": "OPPONENT",
  "OP05-100 .effects[1].replacement_actions[0]": "SELF",
  "OP08-119 .effects[0].actions[2]": "OPPONENT",
  "OP09-107 .effects[0].actions[0]": "OPPONENT",
  "OP10-109 .effects[0].actions[0]": "OPPONENT",
  "OP10-112 .effects[0].actions[0]": "OPPONENT",
  "OP11-102 .effects[0].actions[0]": "SELF",
  "OP11-102 .effects[0].actions[1]": "OPPONENT",
  "OP15-116 .effects[0].actions[0]": "SELF",
  "ST04-001 .effects[0].actions[0]": "OPPONENT",
  "ST07-010 .effects[0].actions[0].params.options[0][0]": "OPPONENT",
  "ST07-015 .effects[0].actions[0].params.options[0][0]": "OPPONENT",
  "ST09-010 .effects[0].replacement_actions[0].params.options[0][0]": "SELF",
  "ST09-010 .effects[0].replacement_actions[0].params.options[1][0]": "SELF",
  "ST13-009 .effects[0].actions[0]": "OPPONENT",
  "ST13-015 .effects[0].actions[2]": "SELF",
  "ST20-002 .effects[0].replacement_actions[0]": "SELF",
  "ST20-005 .effects[0].actions[0].params.options[1][0]": "OPPONENT",
};

function authoredTrashFromLifeActions(): Map<string, Action> {
  const found = new Map<string, Action>();
  const walk = (node: unknown, path: string, cardId: string) => {
    if (Array.isArray(node)) {
      node.forEach((n, i) => walk(n, `${path}[${i}]`, cardId));
      return;
    }
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    if (record.type === "TRASH_FROM_LIFE" && !/\.costs\[\d+\]$/.test(path)) {
      found.set(`${cardId} ${path}`, record as unknown as Action);
    }
    for (const [key, value] of Object.entries(record)) walk(value, `${path}.${key}`, cardId);
  };
  for (const [cardId, schema] of Object.entries(AUTHORED_SCHEMAS)) walk(schema, "", cardId);
  return found;
}

describe("OPT-851 TRASH_FROM_LIFE controller contract", () => {
  const consumers = authoredTrashFromLifeActions();

  it("inventories every authored action consumer", () => {
    expect([...consumers.keys()].sort()).toEqual(Object.keys(EXPECTED_OWNER).sort());
  });

  it.each(Object.entries(EXPECTED_OWNER))("%s trashes %s Life", (key, owner) => {
    const action = consumers.get(key)!;
    const db = createTestCardDb();
    const state = createBattleReadyState(db);
    const before = [state.players[0].life.length, state.players[1].life.length];
    const result = executeTrashFromLife(
      state,
      { ...action, params: { ...action.params, up_to: false } } as never,
      state.players[0].leader.instanceId,
      0,
      db,
      new Map(),
    );
    const lifeOwner = owner === "SELF" ? 0 : 1;
    expect(result.succeeded).toBe(true);
    expect(result.state.players[lifeOwner].life).toHaveLength(before[lifeOwner] - 1);
    expect(result.state.players[1 - lifeOwner].life).toHaveLength(before[1 - lifeOwner]);
    expect(result.events.every((e) => e.playerIndex === lifeOwner)).toBe(true);
  });
});
