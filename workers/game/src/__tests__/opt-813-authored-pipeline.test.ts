import { describe, expect, it } from "vitest";
import type { CardData, CardInstance, GameAction } from "../types.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import { runPipeline } from "../engine/pipeline.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { getEffectivePower } from "../engine/modifiers.js";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
  padChars,
} from "./helpers.js";

// Canonical EB01/EB02 text; official card list confirms cost2/base3000 for both cards.
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
function nextMain(f: ReturnType<typeof fixture>) {
  f.act({ type: "ADVANCE_PHASE" });
  for (let i = 0; i < 5 && f.state.turn.phase !== "MAIN"; i++)
    f.act({ type: "ADVANCE_PHASE" });
  expect(f.state.turn.phase).toBe("MAIN");
}
describe("OPT813 Fake Straw Hat Crew continuous power", () => {
  it.each([0, 1] as const)(
    "player%i plays mid-turn and sees both turn modifiers without accumulation",
    (owner) => {
      const f = fixture();
      f.state.turn.activePlayerIndex = owner;
      f.data("EB02-005", { cost: 2, power: 3000, color: ["Red"] });
      const hand = f.put("EB02-005", owner, "HAND");
      f.act({ type: "PLAY_CARD", cardInstanceId: hand.instanceId }, owner);
      const card = f.state.players[owner].characters.find(
        (c) => c?.cardId === "EB02-005"
      )!;
      expect(power(f, card.instanceId, owner)).toBe(5000);
      for (let i = 0; i < 4; i++) {
        nextMain(f);
        expect(power(f, card.instanceId, owner)).toBe(
          i % 2 === 0 ? 1000 : 5000
        );
        expect(f.state.pendingPrompt).toBeNull();
      }
    }
  );
  it.each([0, 1] as const)(
    "player%i receives a mid-opponent-turn play through authored Jinbe On Block",
    (owner) => {
      const f = fixture();
      const opponent = owner === 0 ? 1 : 0;
      f.state.turn.activePlayerIndex = opponent;
      f.data("EB02-005", { cost: 2, power: 3000, color: ["Red"] });
      const hand = f.put("EB02-005", owner, "HAND");
      f.data("OP01-014", {
        cost: 2,
        power: 2000,
        keywords: { ...CARDS.BLOCKER.keywords },
        effectText: "[Blocker]",
      });
      const jinbe = f.put("OP01-014", owner);
      const don = f.state.players[owner].donCostArea.shift()!;
      don.attachedTo = jinbe.instanceId;
      jinbe.attachedDon = [don];
      f.act(
        {
          type: "DECLARE_ATTACK",
          attackerInstanceId: f.state.players[opponent].leader.instanceId,
          targetInstanceId: f.state.players[owner].leader.instanceId,
        },
        opponent
      );
      f.act(
        { type: "DECLARE_BLOCKER", blockerInstanceId: jinbe.instanceId },
        owner
      );
      f.select([hand.instanceId]);
      const card = f.state.players[owner].characters.find(
        (c) => c?.cardId === "EB02-005"
      )!;
      expect(power(f, card.instanceId, owner)).toBe(1000);
      expect(f.state.pendingPrompt).toBeNull();
      f.act({ type: "PASS" }, owner);
      nextMain(f);
      expect(power(f, card.instanceId, owner)).toBe(5000);
    }
  );
});
describe("OPT813 Cricket printed gates", () => {
  it.each([0, 1, 2, 3])(
    "Life%i with one given DON and no active cost-area DON",
    (life) => {
      const f = fixture();
      f.state.players[0].life = f.state.players[0].life.slice(0, life);
      f.state.players[0].donCostArea = f.state.players[0].donCostArea.slice(
        0,
        3
      );
      f.data("EB01-058", { cost: 2, power: 3000, color: ["Yellow"] });
      const hand = f.put("EB01-058", 0, "HAND");
      f.act({ type: "PLAY_CARD", cardInstanceId: hand.instanceId });
      const card = f.state.players[0].characters.find(
        (c) => c?.cardId === "EB01-058"
      )!;
      expect(power(f, card.instanceId, 0)).toBe(3000);
      f.act({
        type: "ATTACH_DON",
        targetInstanceId: card.instanceId,
        count: 1,
      });
      expect(
        f.state.players[0].donCostArea.filter((d) => d.state === "ACTIVE")
      ).toHaveLength(0);
      expect(power(f, card.instanceId, 0)).toBe(life <= 2 ? 6000 : 4000);
      nextMain(f);
      expect(power(f, card.instanceId, 0)).toBe(3000);
    }
  );
  it("active cost-area DON without source-attached DON does not grant power", () => {
    const f = fixture();
    f.state.players[0].life = f.state.players[0].life.slice(0, 2);
    f.data("EB01-058", { cost: 2, power: 3000 });
    const hand = f.put("EB01-058", 0, "HAND");
    f.act({ type: "PLAY_CARD", cardInstanceId: hand.instanceId });
    const card = f.state.players[0].characters.find(
      (c) => c?.cardId === "EB01-058"
    )!;
    expect(
      f.state.players[0].donCostArea.some((d) => d.state === "ACTIVE")
    ).toBe(true);
    expect(power(f, card.instanceId, 0)).toBe(3000);
  });
  it("a rested Cricket retains the printed boost while attacking", () => {
    const f = fixture();
    f.state.players[0].life = f.state.players[0].life.slice(0, 2);
    f.state.players[0].donCostArea = f.state.players[0].donCostArea.slice(0, 1);
    f.data("EB01-058", { cost: 2, power: 3000 });
    const card = f.put("EB01-058", 0);
    f.act({ type: "ATTACH_DON", targetInstanceId: card.instanceId, count: 1 });
    f.act({
      type: "DECLARE_ATTACK",
      attackerInstanceId: card.instanceId,
      targetInstanceId: f.state.players[1].leader.instanceId,
    });
    const current = f.state.players[0].characters.find(
      (c) => c?.instanceId === card.instanceId
    )!;
    expect(current.state).toBe("RESTED");
    expect(power(f, card.instanceId, 0)).toBe(6000);
    f.act({ type: "PASS" }, 1);
    f.act({ type: "PASS" }, 1);
    expect(f.state.pendingPrompt).toBeNull();
  });
  it("authored Luffy gives Cricket one rested DON even when cost area has none active", () => {
    const f = fixture();
    f.state.players[0].life = f.state.players[0].life.slice(0, 2);
    f.state.players[0].donCostArea = f.state.players[0].donCostArea.slice(0, 2);
    f.data("ST01-001", { type: "Leader", cost: null });
    const leader = f.put("ST01-001", 0, "LEADER");
    f.data("EB01-058", { cost: 2, power: 3000 });
    const hand = f.put("EB01-058", 0, "HAND");
    f.act({ type: "PLAY_CARD", cardInstanceId: hand.instanceId });
    const card = f.state.players[0].characters.find(
      (c) => c?.cardId === "EB01-058"
    )!;
    f.act({
      type: "ACTIVATE_EFFECT",
      cardInstanceId: leader.instanceId,
      effectId: "activate_give_don",
    });
    f.select([card.instanceId]);
    const current = f.state.players[0].characters.find(
      (c) => c?.instanceId === card.instanceId
    )!;
    expect(current.attachedDon).toHaveLength(1);
    expect(current.attachedDon[0].state).toBe("RESTED");
    expect(power(f, card.instanceId, 0)).toBe(6000);
    expect(f.state.pendingPrompt).toBeNull();
  });
});
