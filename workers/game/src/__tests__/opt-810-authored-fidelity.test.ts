import { describe, expect, it } from "vitest";
import type { CardData, CardInstance, GameAction } from "../types.js";
import { runPipeline } from "../engine/pipeline.js";
import { SessionCoordinator } from "../session/coordinator.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import {
  registerCardEnteredField,
} from "../engine/triggers.js";
import { getEffectivePower, getEffectiveCost, getEffectiveFieldCost, hasGrantedKeyword } from "../engine/modifiers.js";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
  padChars,
} from "./helpers.js";

function fixture() {
  const db = createTestCardDb();
  for (const [id, cost] of [
    ["OP11-031", 4], ["OP11-112", 3], ["OP12-087", 3],
    ["OP12-061", 0], ["OP02-025", 0], ["OP01-033", 3],
  ] as const) {
    const schema = getEffectSchema(id)!;
    const type = schema.card_type as CardData["type"];
    db.set(id, {
      ...CARDS.VANILLA,
      id,
      name: schema.card_name!,
      type,
      cost: type === "Leader" ? null : cost,
      power: type === "Leader" ? 5000 : 4000,
      effectText: "",
      effectSchema: schema,
    });
  }
  db.set("LAW", { ...CARDS.VANILLA, id: "LAW", name: "Trafalgar Law", cost: 4 });
  let state = createBattleReadyState(db);
  state.players[0].characters = padChars([]);
  state.players[1].characters = padChars([]);
  function put(
    id: string,
    controller: 0 | 1,
    zone: CardInstance["zone"] = "CHARACTER",
    suffix = ""
  ) {
    const c: CardInstance = {
      ...state.players[controller].leader,
      instanceId: `${id}-${controller}-${zone}-${suffix}`,
      cardId: id,
      controller,
      owner: controller,
      zone,
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 0,
    };
    if (zone === "LEADER") state.players[controller].leader = c;
    else if (zone === "CHARACTER")
      state.players[controller].characters[
        state.players[controller].characters.indexOf(null)
      ] = c;
    else if (zone === "HAND") state.players[controller].hand.push(c);
    else if (zone === "TRASH") state.players[controller].trash.push(c);
    if (zone === "LEADER" || zone === "CHARACTER")
      state = registerCardEnteredField(state, c, db.get(id)!);
    return c;
  }
  function act(
    action: GameAction,
    player: 0 | 1 = state.turn.activePlayerIndex
  ) {
    if (state.pendingPrompt) {
      expect(
        new SessionCoordinator().routePromptResponse(
          state,
          state.pendingPrompt.respondingPlayer,
          action
        ).kind
      ).toBe("resume");
      const r = resumePromptLifecycle(state, action, db, {
        drainPregame: (s) => s,
        advanceStartOfTurn: (s) => s,
      });
      expect(r.responseRejected).toBe(false);
      state = r.state;
    } else {
      const r = runPipeline(state, action, db, player);
      expect(r.valid, r.error).toBe(true);
      state = { ...r.state, pendingPrompt: r.pendingPrompt ?? null };
    }
  }
  const choose = (choiceId: string) => {
    const o = state.pendingPrompt?.options;
    act({
      type: "PLAYER_CHOICE",
      choiceId:
        o?.promptType === "PLAYER_CHOICE"
          ? (o.choices.find((c) => c.label === choiceId)?.id ?? choiceId)
          : choiceId,
    });
  };
  const select = (selectedInstanceIds: string[]) =>
    act({ type: "SELECT_TARGET", selectedInstanceIds });
  const play = (id: string) => {
    const c = put(
      id,
      state.turn.activePlayerIndex,
      "HAND",
      String(state.turn.actionsPerformedThisTurn.length)
    );
    act({ type: "PLAY_CARD", cardInstanceId: c.instanceId });
    return c;
  };
  return {
    db,
    put,
    act,
    choose,
    select,
    play,
    get state() {
      return state;
    },
  };
}

function leader(f: ReturnType<typeof fixture>, name: string, types: string[] = []) {
  f.db.set(CARDS.LEADER.id, { ...CARDS.LEADER, name, types });
}
function field(f: ReturnType<typeof fixture>, id: string) {
  return f.state.players.flatMap(p => p.characters).find(c => c?.cardId === id)!;
}
function readyDon(f: ReturnType<typeof fixture>) {
  return f.state.players[0].donCostArea.filter(d => d.state === "ACTIVE").length;
}
function activateRosinante(f: ReturnType<typeof fixture>) {
  const source = f.put("OP12-061", 0, "LEADER");
  f.act({ type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId: "OP12-061_activate_cost_reduction" });
  if (f.state.pendingPrompt?.options.promptType === "SELECT_TARGET")
    f.select([f.state.players[0].donCostArea[0].instanceId]);
  expect(f.state.pendingPrompt).toBeFalsy();
  expect(f.state.oneTimeModifiers).toHaveLength(1);
}

describe("OPT-810 registered authored-card pipeline", () => {
  it.each(["Fish-Man", "Merfolk", "Pirate"])("Jinbe accepts the printed Leader alternatives: %s", trait => {
    const f = fixture();
    leader(f, "Leader", [trait]);
    const target = f.put(CARDS.VANILLA.id, 1);
    f.play("OP11-031");
    if (trait !== "Pirate") {
      expect(f.state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
      f.select([target.instanceId]);
    }
    expect(f.state.pendingPrompt).toBeFalsy();
    expect(field(f, CARDS.VANILLA.id).state).toBe(trait === "Pirate" ? "ACTIVE" : "RESTED");
  });
  it.each(["Koala", "Monkey.D.Luffy", "Other"])("Robin grants both bonuses under %s", name => {
    const f = fixture();
    leader(f, name);
    f.play("OP12-087");
    if (f.state.pendingPrompt) f.choose("skip");
    const robin = field(f, "OP12-087");
    expect(hasGrantedKeyword(robin, "BLOCKER", f.state, f.db)).toBe(name !== "Other");
    expect(getEffectiveFieldCost(f.db.get(robin.cardId)!, f.state, robin.instanceId, f.db)).toBe(name === "Other" ? 3 : 6);
  });
  it.each(["ACTIVE", "RESTED"] as const)("Megalo retains opponent-turn power when %s", state => {
    const f = fixture();
    leader(f, "Shirahoshi");
    const megalo = f.put("OP11-112", 0);
    megalo.state = state;
    f.state.turn.activePlayerIndex = 1;
    f.play(CARDS.VANILLA.id);
    expect(getEffectivePower(field(f, "OP11-112"), f.db.get("OP11-112")!, f.state, f.db)).toBe(8000);
  });
  it("Rosinante discounts the first hand Law and consumes before the second", () => {
    const f = fixture();
    activateRosinante(f);
    const don = readyDon(f);
    f.play("LAW");
    expect(readyDon(f)).toBe(don - 2);
    f.play("LAW");
    expect(readyDon(f)).toBe(don - 6);
    expect(f.state.oneTimeModifiers.every(m => m.consumed)).toBe(true);
  });
  it("Rosinante does not quote a discount for a Law outside hand", () => {
    const f = fixture();
    activateRosinante(f);
    const law = f.put("LAW", 0, "TRASH");
    expect(getEffectiveCost(f.db.get("LAW")!, f.state, law.instanceId, f.db)).toBe(4);
    const r = runPipeline(f.state, { type: "PLAY_CARD", cardInstanceId: law.instanceId }, f.db, 0);
    expect(r.valid).toBe(false);
    expect(f.state.oneTimeModifiers[0].consumed).toBe(false);
  });
});
