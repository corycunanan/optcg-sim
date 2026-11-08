import { describe, expect, it } from "vitest";
import type { CardData, CardInstance, GameAction } from "../types.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import { runPipeline } from "../engine/pipeline.js";
import { executeGiveDon } from "../engine/effect-resolver/actions/don.js";
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

// FAQ regressions for the 2026-11-08 EB-05 and ST-31..36 authoring (docs/FAQs/).
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


function kid(f: ReturnType<typeof fixture>, faces: ("UP" | "DOWN")[]) {
  f.data("ST36-005", { cost: 5, power: 6000, types: ["Kid Pirates", "Supernovas"] });
  const card = f.put("ST36-005", 0);
  const p = f.state.players[0];
  p.life = p.life.slice(0, faces.length).map((l, i) => ({ ...l, face: faces[i] }));
  return card;
}

function donArea(f: ReturnType<typeof fixture>, count: number) {
  f.state.players[0].donCostArea = Array.from({ length: count }, (_, i) => ({ instanceId: `don-${i}`, state: "ACTIVE" as const, attachedTo: null }));
}

describe("ST36-005 top-or-bottom Life face cost", () => {
  it("offers both ends when both can pay, and turns the chosen bottom card", () => {
    const f = fixture();
    const card = kid(f, ["DOWN", "UP", "DOWN"]);
    f.state.players[0].donCostArea[0].state = "RESTED";
    f.act({ type: "ACTIVATE_EFFECT", cardInstanceId: card.instanceId, effectId: "activate_give_don_leader" });
    f.accept();
    expect(f.state.pendingPrompt?.options).toMatchObject({ promptType: "PLAYER_CHOICE", choices: [{ id: "0" }, { id: "1" }] });
    f.choice({ type: "PLAYER_CHOICE", choiceId: "1" });
    expect(f.state.players[0].life.map((l) => l.face)).toEqual(["DOWN", "UP", "UP"]);
    expect(f.state.players[0].leader.attachedDon).toHaveLength(1);
  });

  it("pays from the top alone when only the top card can turn", () => {
    const f = fixture();
    const card = kid(f, ["DOWN", "DOWN", "UP"]);
    f.act({ type: "ACTIVATE_EFFECT", cardInstanceId: card.instanceId, effectId: "activate_give_don_leader" });
    f.accept();
    expect(f.state.players[0].life.map((l) => l.face)).toEqual(["UP", "DOWN", "UP"]);
  });

  // FAQ: unusable when both the top and bottom Life cards are already face-up,
  // even if a middle card is face-down.
  it("cannot activate when top and bottom are both face-up", () => {
    const f = fixture();
    const card = kid(f, ["UP", "DOWN", "UP"]);
    const result = runPipeline(f.state, { type: "ACTIVATE_EFFECT", cardInstanceId: card.instanceId, effectId: "activate_give_don_leader" }, f.db, 0);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Cost cannot be paid");
  });
});

describe("EB-05 FAQ rulings", () => {
  it("EB05-028: the opponent chooses the 4 cards to trash", () => {
    const f = fixture();
    const opp = f.state.players[1];
    while (opp.hand.length < 9) f.put(CARDS.VANILLA.id, 1, "HAND");
    f.data("EB05-028", { cost: 0, power: 6000 });
    const card = f.put("EB05-028", 0, "HAND");
    f.act({ type: "PLAY_CARD", cardInstanceId: card.instanceId });
    expect(f.state.pendingPrompt?.respondingPlayer).toBe(1);
    const prompt = f.targets();
    expect(prompt).toMatchObject({ countMin: 4, countMax: 4 });
    f.select(prompt.validTargets.slice(0, 4));
    expect(f.state.players[1].hand).toHaveLength(5);
  });

  it.each([[8, false], [10, true]])("EB05-034: %i DON!! before the DON!! −2 cost debuffs=%s", (don, debuffs) => {
    const f = fixture();
    donArea(f, don);
    f.data("victim", { power: 6000 });
    const victim = f.put("victim", 1);
    f.data("EB05-034", { cost: 0, power: 2000 });
    const card = f.put("EB05-034", 0, "HAND");
    f.act({ type: "PLAY_CARD", cardInstanceId: card.instanceId });
    f.accept();
    expect(f.state.players[0].donCostArea).toHaveLength(don - 2);
    if (debuffs) f.select([victim.instanceId]);
    expect(f.state.pendingPrompt).toBeNull();
    expect(power(f, victim.instanceId, 1)).toBe(debuffs ? 2000 : 6000);
  });

  it("EB05-021: the play lock stops a further Character play after the Cross Guild play", () => {
    const f = fixture();
    donArea(f, 10);
    f.data("guild", { cost: 3, power: 5000, types: ["Cross Guild"] });
    const guild = f.put("guild", 0, "HAND");
    const other = f.put(CARDS.VANILLA.id, 0, "HAND");
    f.data("EB05-021", { cost: 0, power: 4000 });
    const card = f.put("EB05-021", 0, "HAND");
    f.act({ type: "PLAY_CARD", cardInstanceId: card.instanceId });
    f.select([guild.instanceId]);
    expect(f.state.players[0].characters.some((c) => c?.cardId === "guild")).toBe(true);
    const result = runPipeline(f.state, { type: "PLAY_CARD", cardInstanceId: other.instanceId }, f.db, 0);
    expect(result.valid).toBe(false);
    expect(f.state.players[0].hand.some((c) => c.instanceId === other.instanceId)).toBe(true);
  });
});

describe("GIVE_DON event", () => {
  it.each([[false, 0], [true, 1]])("emits DON_GIVEN_TO_CARD only when a DON!! moves (rested available=%s)", (rested, count) => {
    const f = fixture();
    if (rested) f.state.players[0].donCostArea[0].state = "RESTED";
    const leader = f.state.players[0].leader.instanceId;
    const result = executeGiveDon(f.state, { type: "GIVE_DON", target: { type: "YOUR_LEADER" }, params: { amount: 1, don_state: "RESTED" } }, leader, 0, f.db, new Map(), [leader]);
    const events = result.events.filter((e) => e.type === "DON_GIVEN_TO_CARD");
    expect(events).toHaveLength(count);
    expect(result.state.players[0].leader.attachedDon).toHaveLength(count);
  });
});
