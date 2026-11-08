/**
 * OPT-881 — "When a DON!! card on your field is returned to your DON!! deck"
 * watchers, through the real pipeline with registered authored schemas.
 *
 * Oracles:
 * - OP08-067 Charlotte Pudding: "[Your Turn] [Once Per Turn] When a DON!! card
 *   on your field is returned to your DON!! deck, add up to 1 DON!! card from
 *   your DON!! deck and rest it."
 * - OP08-074 Black Maria: "...Then, at the end of this turn, return DON!!
 *   cards from your field to your DON!! deck until you have the same number of
 *   DON!! cards on your field as your opponent." qa_op08.md:120-124: the
 *   end-of-turn return lets another card's "returned to your DON!! deck"
 *   effect activate.
 * - Rule 6-2-3: the Refresh Phase returns attached DON!! to the cost area, not
 *   to the DON!! deck, so it never fulfils these watchers.
 *
 * Return-path inventory (each emits DON_DETACHED with a positive `count`,
 * mapped from DON_RETURNED_TO_DON_DECK in triggers.ts):
 * - scheduled / until_count RETURN_DON_TO_DECK and field returns:
 *   `applyFieldDonReturn` (effect-resolver/actions/don.ts);
 * - FORCE_OPPONENT_DON_RETURN: the same helper, owned by the returning player;
 * - RETURN_DON_TO_DECK `amount` (unattached pool): `executeReturnDonToDeck`;
 * - DON!! −N cost: effect-resolver/cost/payment.ts.
 * The Refresh Phase DON_DETACHED (phases.ts) carries no `count` and matches none.
 */
import { describe, expect, it } from "vitest";
import type { CardData, CardInstance, DonInstance, GameAction, GameState } from "../types.js";
import type { EffectSchema } from "../engine/effect-types.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { runPipeline } from "../engine/pipeline.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";

const dons = (owner: 0 | 1, n: number, tag: string, state: "ACTIVE" | "RESTED" = "ACTIVE"): DonInstance[] =>
  Array.from({ length: n }, (_, i) => ({ instanceId: `don-${tag}-${owner}-${i}`, state, attachedTo: null }));

function synthetic(id: string, effects: EffectSchema["effects"]): CardData {
  return { ...CARDS.VANILLA, id, name: id, effectSchema: { card_id: id, card_name: id, card_type: "Character", effects } as EffectSchema };
}

/** Another end-of-turn effect to order against. */
const EOT_DRAW = synthetic("OPT881-EOT", [
  { id: "eot_draw", category: "auto", trigger: { keyword: "END_OF_YOUR_TURN" }, actions: [{ type: "DRAW", params: { amount: 1 } }] },
]);
/** A turn-unrestricted watcher used to inventory each return path. */
const WATCHER = synthetic("OPT881-WATCHER", [
  { id: "watch", category: "auto", trigger: { event: "DON_RETURNED_TO_DON_DECK", filter: { controller: "SELF" } }, actions: [{ type: "DRAW", params: { amount: 1 } }] },
]);
/** Each return path as an [Activate: Main]. */
const PATHS = synthetic("OPT881-PATHS", [
  { id: "force", category: "activate", trigger: { keyword: "ACTIVATE_MAIN" }, actions: [{ type: "FORCE_OPPONENT_DON_RETURN", params: { amount: 1 } }] },
  { id: "amount", category: "activate", trigger: { keyword: "ACTIVATE_MAIN" }, actions: [{ type: "RETURN_DON_TO_DECK", params: { amount: 1 } }] },
  { id: "cost", category: "activate", trigger: { keyword: "ACTIVATE_MAIN" }, costs: [{ type: "DON_MINUS", amount: 1 }], actions: [{ type: "DRAW", params: { amount: 1 } }] },
] as EffectSchema["effects"]);

function fixture() {
  const db = createTestCardDb();
  for (const card of [EOT_DRAW, WATCHER, PATHS]) db.set(card.id, card);
  let state: GameState = createBattleReadyState(db);
  state.players.forEach((p) => {
    p.characters = padChars([]);
    p.hand = [];
  });
  let serial = 0;
  function put(id: string, owner: 0 | 1 = 0) {
    if (!db.has(id)) db.set(id, { ...CARDS.VANILLA, id, name: getEffectSchema(id)!.card_name ?? id, effectSchema: getEffectSchema(id)! });
    const card: CardInstance = { instanceId: `${id}-${owner}-${serial++}`, cardId: id, controller: owner, owner, zone: "CHARACTER", state: "ACTIVE", attachedDon: [], turnPlayed: 1 };
    state.players[owner].characters[state.players[owner].characters.findIndex((c) => !c)] = card;
    state = registerCardEnteredField(state, card, db.get(id)!);
    return card;
  }
  function act(action: GameAction) {
    if (state.pendingPrompt) {
      const r = resumePromptLifecycle(state, action, db, { drainPregame: (s) => s, advanceStartOfTurn: (s) => s });
      expect(r.responseRejected, action.type).toBe(false);
      state = r.state;
    } else {
      const r = runPipeline(state, action, db, state.turn.activePlayerIndex);
      expect(r.valid, r.error).toBe(true);
      state = r.state;
    }
  }
  const prompt = () => state.pendingPrompt?.options;
  const fieldDon = (p: 0 | 1) => {
    const pl = state.players[p];
    return pl.donCostArea.length + pl.leader.attachedDon.length + pl.characters.reduce((n, c) => n + (c?.attachedDon.length ?? 0), 0);
  };
  return { db, put, act, prompt, fieldDon, get state() { return state; }, set state(s: GameState) { state = s; } };
}
type Fixture = ReturnType<typeof fixture>;

/** Black Maria adds 5 to an own field of 3 against the opponent's 5; its End Phase return is 3. */
function blackMaria(f: Fixture) {
  const maria = f.put("OP08-074");
  f.state.players[0].donCostArea = dons(0, 3, "own");
  f.state.players[0].donDeck = dons(0, 7, "deck");
  f.state.players[1].donCostArea = dons(1, 5, "opp");
  f.act({ type: "ACTIVATE_EFFECT", cardInstanceId: maria.instanceId, effectId: "activate_add_don" });
  if (f.prompt()?.promptType === "PLAYER_CHOICE") f.act({ type: "PLAYER_CHOICE", choiceId: "choose-value:5" });
  expect(f.fieldDon(0)).toBe(8);
  return maria;
}

/** Pudding's "add up to 1": accept with 1. */
function acceptPudding(f: Fixture) {
  const options = f.prompt();
  expect(options?.promptType).toBe("PLAYER_CHOICE");
  if (options?.promptType !== "PLAYER_CHOICE") throw new Error("expected Pudding's up-to choice");
  if (!options.choices.some((c) => c.id === "choose-value:1")) throw new Error(`not Pudding: ${options.choices.map((c) => c.id).join(",")}`);
  f.act({ type: "PLAYER_CHOICE", choiceId: "choose-value:1" });
}

function endPhaseReturn(f: Fixture) {
  f.act({ type: "ADVANCE_PHASE" });
  const options = f.prompt();
  expect(options?.promptType).toBe("PLAYER_CHOICE");
  if (options?.promptType !== "PLAYER_CHOICE") throw new Error("expected the DON!! return plan");
  expect(options.donReturn?.count).toBe(3);
  f.act({ type: "PLAYER_CHOICE", choiceId: options.choices[0].id });
}

/** Pick the first offered DON!! −N payment plan, if the cost asks which DON!! to return. */
function payDonCost(f: Fixture) {
  const options = f.prompt();
  if (options?.promptType === "PLAYER_CHOICE" && options.choices[0]?.id.startsWith("don-return")) {
    f.act({ type: "PLAYER_CHOICE", choiceId: options.choices[0].id });
  }
}

const types = (f: Fixture, from: number) => f.state.eventLog.slice(from).map((e) => `${e.type}:${e.playerIndex}`);

describe("OPT-881 OP08-074 Black Maria → OP08-067 Pudding in the same End Phase", () => {
  it("offers Pudding once after the scheduled return, ordered after the other end-of-turn effect and before TURN_ENDED", () => {
    const f = fixture();
    f.put("OP08-067");
    f.put(EOT_DRAW.id);
    blackMaria(f);
    const start = f.state.eventLog.length;
    endPhaseReturn(f);
    expect(f.state.turn.activePlayerIndex).toBe(0);
    expect(f.fieldDon(0)).toBe(5);
    acceptPudding(f);
    expect(f.prompt()).toBeUndefined();
    expect(f.fieldDon(0)).toBe(6);
    const log = types(f, start);
    const draw = log.indexOf("CARD_DRAWN:0");
    const returned = log.indexOf("DON_DETACHED:0");
    const added = log.indexOf("DON_PLACED_ON_FIELD:0");
    const ended = log.indexOf("TURN_ENDED:0");
    expect(draw).toBeGreaterThanOrEqual(0);
    expect(returned).toBeGreaterThan(draw);
    expect(added).toBeGreaterThan(returned);
    expect(ended).toBeGreaterThan(added);
    expect(log.filter((e) => e === "DON_PLACED_ON_FIELD:0")).toHaveLength(1);
    expect(f.state.turn.activePlayerIndex).toBe(1);
  });

  it("is once per turn: a Main Phase DON!! −1 return uses it, so the End Phase return offers nothing", () => {
    const f = fixture();
    f.put("OP08-067");
    const paths = f.put(PATHS.id);
    blackMaria(f);
    f.act({ type: "ACTIVATE_EFFECT", cardInstanceId: paths.instanceId, effectId: "cost" });
    payDonCost(f);
    acceptPudding(f);
    expect(f.prompt()).toBeUndefined();
    const start = f.state.eventLog.length;
    endPhaseReturn(f);
    expect(f.prompt()).toBeUndefined();
    expect(types(f, start)).not.toContain("DON_PLACED_ON_FIELD:0");
    expect(f.state.turn.activePlayerIndex).toBe(1);
  });
});

describe("OPT-881 the Refresh Phase is not a return to the DON!! deck (rule 6-2-3)", () => {
  it("Pudding with attached DON!! offers nothing at the start of its controller's turn", () => {
    const f = fixture();
    const pudding = f.put("OP08-067");
    pudding.attachedDon = [{ instanceId: "attached-0", state: "ACTIVE", attachedTo: pudding.instanceId }];
    const watcher = f.put(WATCHER.id);
    f.state.players[0].donDeck = dons(0, 5, "deck");
    f.state = { ...f.state, turn: { ...f.state.turn, activePlayerIndex: 1, phase: "MAIN" } };
    // Hand the turn to p0: p1's End Phase, then p0's Refresh Phase.
    for (let guard = 0; guard < 6 && !(f.state.turn.activePlayerIndex === 0 && f.state.turn.phase === "MAIN"); guard++) {
      expect(f.prompt()).toBeUndefined();
      f.act({ type: "ADVANCE_PHASE" });
    }
    expect(f.state.turn.activePlayerIndex).toBe(0);
    expect(f.prompt()).toBeUndefined();
    // The DON!! went to the cost area, not the DON!! deck, and no watcher drew.
    expect(f.state.players[0].donDeck.length).toBeLessThanOrEqual(5);
    expect(f.state.players[0].hand.filter((c) => c.instanceId.includes(watcher.instanceId))).toHaveLength(0);
    expect(f.state.eventLog.filter((e) => e.type === "CARD_DRAWN" && e.playerIndex === 0)).toHaveLength(1); // Draw Phase only
  });
});

describe("OPT-881 return-path inventory: each DON!!-deck return fulfils the watcher once", () => {
  function setup() {
    const f = fixture();
    const paths = f.put(PATHS.id);
    f.put(WATCHER.id, 0);
    f.put(WATCHER.id, 1);
    f.state.players[0].donCostArea = dons(0, 3, "own");
    f.state.players[1].donCostArea = dons(1, 3, "opp");
    return { f, paths };
  }
  const drawsBy = (f: Fixture, from: number, p: 0 | 1) => f.state.eventLog.slice(from).filter((e) => e.type === "CARD_DRAWN" && e.playerIndex === p).length;

  it("FORCE_OPPONENT_DON_RETURN fulfils the returning player's watcher", () => {
    const { f, paths } = setup();
    const start = f.state.eventLog.length;
    f.act({ type: "ACTIVATE_EFFECT", cardInstanceId: paths.instanceId, effectId: "force" });
    expect(f.prompt()).toBeUndefined();
    expect(f.fieldDon(1)).toBe(2);
    expect(drawsBy(f, start, 1)).toBe(1);
    expect(drawsBy(f, start, 0)).toBe(0);
  });

  it("RETURN_DON_TO_DECK with amount fulfils its controller's watcher", () => {
    const { f, paths } = setup();
    const start = f.state.eventLog.length;
    f.act({ type: "ACTIVATE_EFFECT", cardInstanceId: paths.instanceId, effectId: "amount" });
    expect(f.prompt()).toBeUndefined();
    expect(f.fieldDon(0)).toBe(2);
    expect(drawsBy(f, start, 0)).toBe(1);
    expect(drawsBy(f, start, 1)).toBe(0);
  });

  it("a DON!! −1 cost fulfils its controller's watcher", () => {
    const { f, paths } = setup();
    const start = f.state.eventLog.length;
    f.act({ type: "ACTIVATE_EFFECT", cardInstanceId: paths.instanceId, effectId: "cost" });
    payDonCost(f);
    expect(f.prompt()).toBeUndefined();
    expect(f.fieldDon(0)).toBe(2);
    // The effect's own draw plus the watcher's.
    expect(drawsBy(f, start, 0)).toBe(2);
    expect(drawsBy(f, start, 1)).toBe(0);
  });
});
