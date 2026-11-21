import { describe, expect, it } from "vitest";
import type { CardData, CardInstance, GameAction } from "../types.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import { runPipeline } from "../engine/pipeline.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { getEffectivePower } from "../engine/modifiers.js";
import { hasEffectiveKeyword } from "../engine/keywords.js";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
  padChars,
} from "./helpers.js";

// FAQ regressions for the 2026-11-20 OP-18 authoring (docs/FAQs/qa_op18.md).
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


describe("OP-18 FAQ rulings", () => {
  // FAQ OP18-004: at 7000 power or more the Character has all three keywords.
  it.each([
    [4000, [false, false, false]],
    [5000, [true, false, false]],
    [6000, [true, true, false]],
    [7000, [true, true, true]],
  ])("OP18-004 Karoo at %i power has Rush/Banish/Unblockable = %j", (base, expected) => {
    const f = fixture();
    const data = f.data("OP18-004", { power: base });
    const card = f.put("OP18-004", 0);
    const live = f.state.players[0].characters.find((c) => c?.instanceId === card.instanceId)!;
    expect((["RUSH", "BANISH", "UNBLOCKABLE"] as const).map((k) => hasEffectiveKeyword(live, data, k, f.state, f.db))).toEqual(expected);
  });

  // FAQ OP18-005: the only copy on the field still counts itself.
  it("OP18-005 Kung Fu Jugon counts itself during your turn", () => {
    const f = fixture();
    f.data("OP18-005", { power: 3000 });
    const card = f.put("OP18-005", 0);
    expect(power(f, card.instanceId, 0)).toBe(4000);
    f.put("OP18-005", 0);
    expect(power(f, card.instanceId, 0)).toBe(5000);
  });

  // FAQ OP18-041: the draw is mandatory and the opponent of the Leader's
  // controller chooses the trashed card. Player 1 owns the Leader; player 0
  // K.O.s the Baroque Works Character in battle.
  it("OP18-041 Ms. All Sunday draws and the opponent chooses the trashed card", () => {
    const f = fixture();
    f.data("OP18-041", { type: "Leader", power: 5000, life: 4, types: ["Baroque Works"] });
    f.put("OP18-041", 1, "LEADER");
    f.data("agent", { power: 3000, types: ["Baroque Works"] });
    const agent = f.put("agent", 1);
    f.state.players[1].characters.find((c) => c?.instanceId === agent.instanceId)!.state = "RESTED";
    f.data("ATTACKER", { power: 9000 });
    const attacker = f.put("ATTACKER", 0);
    const ownHand = f.state.players[1].hand.length;
    const oppHand = f.state.players[0].hand.length;
    f.act({ type: "DECLARE_ATTACK", attackerInstanceId: attacker.instanceId, targetInstanceId: agent.instanceId }, 0);
    let discardChooser: number | null = null;
    for (let guard = 0; guard < 20 && (f.state.turn.battle || f.state.pendingPrompt); guard++) {
      const prompt = f.state.pendingPrompt;
      if (prompt?.options.promptType === "SELECT_TARGET") {
        discardChooser = prompt.respondingPlayer;
        f.select(prompt.options.validTargets.slice(0, prompt.options.countMin ?? 1));
      } else if (prompt) {
        throw new Error(`unexpected prompt ${JSON.stringify(prompt.options)}`);
      } else {
        f.act({ type: "PASS" }, f.state.turn.battleSubPhase === "ATTACK_STEP" ? 0 : 1);
      }
    }
    expect(f.state.players[1].characters.some((c) => c?.instanceId === agent.instanceId)).toBe(false);
    expect(f.state.players[1].hand.length).toBe(ownHand + 1);
    expect(discardChooser).toBe(0);
    expect(f.state.players[0].hand.length).toBe(oppHand - 1);
  });

  it("OP18-099 Kaku adds a CP card from hand face-up to the chosen end of Life", () => {
    const f = fixture();
    f.data("agent-cp", { types: ["CP9"] });
    const cp = f.put("agent-cp", 0, "HAND");
    f.put(CARDS.VANILLA.id, 0, "HAND");
    f.data("OP18-099", { cost: 0, power: 5000, types: ["CP9"] });
    const kaku = f.put("OP18-099", 0, "HAND");
    const lifeBefore = f.state.players[0].life.length;
    f.act({ type: "PLAY_CARD", cardInstanceId: kaku.instanceId });
    expect(f.state.pendingPrompt?.options).toMatchObject({ promptType: "PLAYER_CHOICE" });
    f.choice({ type: "PLAYER_CHOICE", choiceId: "1" });
    expect(f.targets().validTargets).toEqual([cp.instanceId]);
    f.select([cp.instanceId]);
    const life = f.state.players[0].life;
    expect(life).toHaveLength(lifeBefore + 1);
    expect(life.at(-1)).toMatchObject({ cardId: "agent-cp", face: "UP" });
  });

  // FAQ OP18-046: each of the Leader and Characters may take 0 to 2 rested DON!!.
  it("OP18-046 distributes rested DON!! with at most 2 per target", () => {
    const f = fixture();
    f.state.players[0].donCostArea = Array.from({ length: 4 }, (_, i) => ({ instanceId: `don-${i}`, state: "RESTED" as const, attachedTo: null }));
    f.data("OP18-046", { cost: 0, power: 7000 });
    const card = f.put("OP18-046", 0, "HAND");
    f.act({ type: "PLAY_CARD", cardInstanceId: card.instanceId });
    const leader = f.state.players[0].leader.instanceId;
    for (let guard = 0; guard < 10 && f.state.pendingPrompt; guard++) {
      const options = f.state.pendingPrompt.options;
      if (options.promptType !== "SELECT_TARGET") throw new Error(JSON.stringify(options));
      if (!options.validTargets.includes(leader)) break;
      f.select([leader]);
    }
    expect(f.state.players[0].leader.attachedDon).toHaveLength(2);
  });
});
