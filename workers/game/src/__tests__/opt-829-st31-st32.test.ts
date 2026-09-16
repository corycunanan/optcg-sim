import { describe, expect, it } from "vitest";
import type { CardData, CardInstance, GameAction } from "../types.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import { runPipeline } from "../engine/pipeline.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { executeSetRest } from "../engine/effect-resolver/actions/play.js";
import { executeModifyCost } from "../engine/effect-resolver/actions/modifiers.js";
import { executeKO } from "../engine/effect-resolver/actions/removal.js";
import { resolverExecutionServices } from "../engine/effect-resolver/resolver.js";
import { AUTHORED_SCHEMAS } from "../engine/authored-schemas.generated.js";
import { getEffectivePower } from "../engine/modifiers.js";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
  padChars,
} from "./helpers.js";

// Expectations use the preview text and ST31-004 FAQ supplied in OPT-829.
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
  function put(
    id: string,
    controller: 0 | 1,
    zone: CardInstance["zone"] = "CHARACTER"
  ) {
    const card: CardInstance = {
      cardId: id,
      instanceId: `${id}-${serial++}`,
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
    else if (zone === "CHARACTER")
      p.characters[p.characters.findIndex((c) => !c)] = card;
    else if (zone === "HAND") p.hand.push(card);
    else if (zone === "TRASH") p.trash.push(card);
    else if (zone === "DECK") p.deck.push(card);
    if (["LEADER", "STAGE", "CHARACTER"].includes(zone))
      state = registerCardEnteredField(state, card, db.get(id)!);
    return card;
  }
  function act(
    action: GameAction,
    player = state.turn.activePlayerIndex,
    rejected = false
  ) {
    const result = runPipeline(state, action, db, player);
    expect(result.valid, result.error).toBe(!rejected);
    state = result.state;
  }
  function choice(action: GameAction, rejected = false) {
    const result = resumePromptLifecycle(state, action, db, {
      drainPregame: (s) => s,
      advanceStartOfTurn: (s) => s,
    });
    expect(
      result.responseRejected,
      JSON.stringify({ action, prompt: state.pendingPrompt })
    ).toBe(rejected);
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
    expect(options?.promptType).toBe("SELECT_TARGET");
    if (options?.promptType !== "SELECT_TARGET")
      throw new Error(JSON.stringify(options));
    return options;
  }
  return {
    db,
    data,
    put,
    act,
    choice,
    select,
    accept,
    targets,
    setState(next: typeof state) { state = next; },
    get state() {
      return state;
    },
  };
}

function power(f: ReturnType<typeof fixture>, id: string, owner: 0 | 1) {
  const card = f.state.players[owner].characters.find(
    (c) => c?.instanceId === id
  )!;
  return getEffectivePower(card, f.db.get(card.cardId)!, f.state, f.db);
}

// Printed ST32-002: drawing is unconditional, even with no opponent Characters.
describe("OPT-829 preview cards", () => {
  it("ST32-002 draws through PLAY_CARD with no eligible target", () => {
    const f = fixture();
    f.data("ST32-002", { cost: 5, power: 6000 });
    const card = f.put("ST32-002", 0, "HAND");
    const before = f.state.players[0].hand.length;
    const top = f.state.players[0].deck[0];
    f.act({ type: "PLAY_CARD", cardInstanceId: card.instanceId });
    expect(f.state.players[0].hand).toHaveLength(before);
    expect(f.state.players[0].hand.some(c => c.cardId === top.cardId)).toBe(true);
    expect(f.state.pendingPrompt).toBeNull();
  });
});

function luffyFixture() {
  const f = fixture();
  f.data("ST31-004", { cost: 7, power: 9000, types: ["The Four Emperors", "Straw Hat Crew"] });
  f.state.players[0].donCostArea = Array.from({length: 10}, (_, i) => ({instanceId: `resource-${i}`, state: "ACTIVE", attachedTo: null}));
  const card = f.put("ST31-004", 0, "HAND");
  f.act({type: "PLAY_CARD", cardInstanceId: card.instanceId});
  return {f, card: f.state.players[0].characters.find(c => c?.cardId === "ST31-004")!};
}
it("ST31-004 gains same-turn Rush from three DON on its Leader", () => {
  const {f, card} = luffyFixture();
  f.act({type: "ATTACH_DON", targetInstanceId: f.state.players[0].leader.instanceId, count: 3});
  f.act({type: "DECLARE_ATTACK", attackerInstanceId: card.instanceId, targetInstanceId: f.state.players[1].leader.instanceId});
});

function nextMain(f: ReturnType<typeof fixture>) {
  f.act({type: "ADVANCE_PHASE"});
  for (let i = 0; i < 8 && f.state.turn.phase !== "MAIN"; i++) f.act({type: "ADVANCE_PHASE"});
  expect(f.state.turn.phase).toBe("MAIN");
}

it.each([0, 2, 3, 4])("Rush threshold at %i total given DON (cost-area DON excluded)", (total) => {
  const {f, card} = luffyFixture();
  const other = f.put(CARDS.VANILLA.id, 0);
  // Four attached DON requires one attachment already on the field before play.
  if (total === 4) other.attachedDon.push({instanceId: "earlier-don", state: "ACTIVE", attachedTo: other.instanceId});
  if (total >= 2) {
    f.act({type: "ATTACH_DON", targetInstanceId: card.instanceId, count: 1});
    f.act({type: "ATTACH_DON", targetInstanceId: f.state.players[0].leader.instanceId, count: 1});
  }
  if (total >= 3) f.act({type: "ATTACH_DON", targetInstanceId: other.instanceId, count: 1});
  const result = runPipeline(f.state, {type: "DECLARE_ATTACK", attackerInstanceId: card.instanceId, targetInstanceId: f.state.players[1].leader.instanceId}, f.db, 0);
  expect(result.valid, result.error).toBe(total >= 3);
  if (total < 3) expect(result.error).toContain("cannot attack this turn");
});

it("Rush is lost when another attached Character leaves the field", () => {
  const {f, card} = luffyFixture();
  const other = f.put(CARDS.VANILLA.id, 0);
  f.act({type: "ATTACH_DON", targetInstanceId: other.instanceId, count: 2});
  f.act({type: "ATTACH_DON", targetInstanceId: f.state.players[0].leader.instanceId, count: 1});
  const attack = {type: "DECLARE_ATTACK" as const, attackerInstanceId: card.instanceId, targetInstanceId: f.state.players[1].leader.instanceId};
  expect(runPipeline(f.state, attack, f.db, 0).valid).toBe(true);
  const removed = executeKO(f.state, {type: "KO", target: {type: "CHARACTER", controller: "OPPONENT", count: {exact: 1}}}, f.state.players[1].leader.instanceId, 1, f.db, new Map(), [other.instanceId], resolverExecutionServices);
  f.setState(removed.state);
  expect(f.state.players[0].characters.some(c => c?.instanceId === other.instanceId)).toBe(false);
  const result = runPipeline(f.state, attack, f.db, 0);
  expect(result.valid).toBe(false);
  expect(result.error).toContain("cannot attack this turn");
});

it.each([false, true])("ST31 debuff counts Leader, Characters, Stage and itself; choose none=%s", (skip) => {
  const f = fixture();
  f.data("crew-leader", {type: "Leader", types: ["Straw Hat Crew"]});
  f.data("crew-stage", {type: "Stage", types: ["Straw Hat Crew"]});
  f.data("crew-character", {types: ["Straw Hat Crew"]});
  f.data("non-crew", {types: ["Land of Wano"]});
  f.data("victim", {power: 9000, types: ["Straw Hat Crew"]});
  f.put("crew-leader", 0, "LEADER");
  f.put("crew-stage", 0, "STAGE");
  f.put("crew-character", 0);
  f.put("non-crew", 0);
  const victim = f.put("victim", 1);
  f.data("ST31-004", {cost: 7, power: 9000, types: ["The Four Emperors", "Straw Hat Crew"]});
  const hand = f.put("ST31-004", 0, "HAND");
  f.act({type: "PLAY_CARD", cardInstanceId: hand.instanceId});
  expect(f.targets()).toMatchObject({countMin: 0, countMax: 1, validTargets: [victim.instanceId]});
  f.select(skip ? [] : [victim.instanceId]);
  expect(power(f, victim.instanceId, 1)).toBe(skip ? 9000 : 5000);
  nextMain(f);
  expect(power(f, victim.instanceId, 1)).toBe(9000);
});

it.each([false, true])("ST32 filters base cost and preserves draw; choose none=%s", (skip) => {
  const f = fixture();
  f.data("base-seven", {cost: 7});
  f.data("base-six", {cost: 6});
  const seven = f.put("base-seven", 1);
  const six = f.put("base-six", 1);
  for (const [card, amount] of [[seven, -3], [six, 3]] as const) {
    f.setState(executeModifyCost(f.state, {type: "MODIFY_COST", target: {type: "CHARACTER", controller: "OPPONENT", count: {exact: 1}}, params: {amount}, duration: {type: "THIS_TURN"}}, f.state.players[0].leader.instanceId, 0, f.db, new Map(), [card.instanceId]).state);
  }
  f.data("ST32-002", {cost: 5, power: 6000});
  const oden = f.put("ST32-002", 0, "HAND");
  const handCount = f.state.players[0].hand.length;
  const deckCount = f.state.players[0].deck.length;
  f.act({type: "PLAY_CARD", cardInstanceId: oden.instanceId});
  expect(f.state.players[0].hand).toHaveLength(handCount);
  expect(f.state.players[0].deck).toHaveLength(deckCount - 1);
  expect(f.targets().validTargets).toEqual([six.instanceId]);
  f.select(skip ? [] : [six.instanceId]);
  function rest() {
    return executeSetRest(f.state, {type: "SET_REST", target: {type: "CHARACTER", controller: "OPPONENT", count: {exact: 1}}}, f.state.players[0].leader.instanceId, 0, f.db, new Map(), [six.instanceId], resolverExecutionServices);
  }
  expect(rest().state.players[1].characters.find(c => c?.instanceId === six.instanceId)?.state).toBe(skip ? "RESTED" : "ACTIVE");
  if (skip) return;
  nextMain(f);
  expect(f.state.turn.activePlayerIndex).toBe(1);
  expect(rest().succeeded).toBe(false);
  expect(f.state.prohibitions.find(p => p.prohibitionType === "CANNOT_BE_RESTED")?.expiresAt).toMatchObject({wave: "END_OF_END_PHASE", player: 1});
  // ADVANCE_PHASE drains the End Phase and hands off directly to REFRESH.
  f.act({type: "ADVANCE_PHASE"});
  expect(f.state.turn.phase).toBe("REFRESH");
  for (let i = 0; i < 8 && f.state.turn.phase !== "MAIN"; i++) f.act({type: "ADVANCE_PHASE"});
  expect(f.state.turn.activePlayerIndex).toBe(0);
  expect(rest().state.players[1].characters.find(c => c?.instanceId === six.instanceId)?.state).toBe("RESTED");
});

// Recursive structural traversal includes conditions nested in actions, costs,
// durations and combinators rather than searching source text.
it("inventories every authored DON_GIVEN consumer without migrating existing modes", () => {
  const inventory: string[] = [];
  function walk(value: unknown, id: string) {
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    if (record.type === "DON_GIVEN") inventory.push(`${id}: ${record.mode}`);
    for (const child of Object.values(record)) walk(child, id);
  }
  for (const [id, schema] of Object.entries(AUTHORED_SCHEMAS)) walk(schema, id);
  expect(inventory.filter(s => s.endsWith("TOTAL_GIVEN"))).toEqual(["ST31-004: TOTAL_GIVEN"]);
  expect(inventory.filter(s => !s.startsWith("ST31-004"))).toHaveLength(96);
  expect(inventory.every(s => /: (ANY_CARD_HAS_DON|SPECIFIC_CARD|TOTAL_GIVEN)$/.test(s))).toBe(true);
});
