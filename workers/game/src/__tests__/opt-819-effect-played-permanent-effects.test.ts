import { describe, expect, it } from "vitest";
import type {
  CardData,
  CardInstance,
  GameAction,
  GameState,
} from "../types.js";
import {
  OP13_079_IMU,
  OP13_080_ST_ETHANBARON_V_NUSJURO,
  OP13_082_FIVE_ELDERS,
  OP13_083_ST_JAYGARCIA_SATURN,
  OP13_084_ST_SHEPHERD_JU_PETER,
  OP13_089_ST_TOPMAN_WARCURY,
  OP13_091_ST_MARCUS_MARS,
} from "../engine/schemas/op13.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import { hasGrantedKeyword } from "../engine/modifiers.js";
import { runPipeline } from "../engine/pipeline.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
  padChars,
} from "./helpers.js";

const imu: CardData = {
  ...CARDS.LEADER,
  id: "OP13-079",
  name: "Imu",
  effectSchema: OP13_079_IMU,
};
const elders: CardData = {
  ...CARDS.VANILLA,
  id: "OP13-082",
  name: "Five Elders",
  power: 12000,
  types: ["Five Elders", "Celestial Dragons"],
  effectSchema: OP13_082_FIVE_ELDERS,
};
const nusjuro: CardData = {
  ...CARDS.VANILLA,
  id: "OP13-080",
  name: "St. Ethanbaron V. Nusjuro",
  power: 5000,
  types: ["Five Elders", "Celestial Dragons"],
  effectSchema: OP13_080_ST_ETHANBARON_V_NUSJURO,
};
function card(
  cardId: string,
  instanceId: string,
  zone: CardInstance["zone"] = "CHARACTER"
): CardInstance {
  return {
    cardId,
    instanceId,
    zone,
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: 1,
    owner: 0,
    controller: 0,
  };
}
function resume(
  state: GameState,
  action: GameAction,
  db: Map<string, CardData>
) {
  const result = resumePromptLifecycle(state, action, db, {
    drainPregame: (s) => s,
    advanceStartOfTurn: (s) => s,
  });
  expect(result.responseRejected).toBe(false);
  return result.state;
}
const elderCards: CardData[] = [nusjuro, ...[
  OP13_083_ST_JAYGARCIA_SATURN, OP13_084_ST_SHEPHERD_JU_PETER,
  OP13_089_ST_TOPMAN_WARCURY, OP13_091_ST_MARCUS_MARS,
].map(effectSchema => ({ ...nusjuro, id: effectSchema.card_id!, name: effectSchema.card_name!, effectSchema }))];

function drain(state: GameState, db: Map<string, CardData>) {
  for (let i = 0; state.pendingPrompt && i < 40; i++) {
    const options = state.pendingPrompt.options;
    if (options.promptType === "OPTIONAL_EFFECT")
      state = resume(state, { type: "PLAYER_CHOICE", choiceId: "accept" }, db);
    else if (options.promptType === "PLAYER_CHOICE")
      state = resume(state, { type: "PLAYER_CHOICE", choiceId: options.choices.find(c => !c.disabled)!.id }, db);
    else if (options.promptType === "SELECT_TARGET")
      state = resume(state, { type: "SELECT_TARGET", selectedInstanceIds: options.validTargets.slice(0, options.countMax) }, db);
    else if (options.promptType === "ARRANGE_TOP_CARDS") {
      const kept = options.validTargets[0];
      state = resume(state, { type: "ARRANGE_TOP_CARDS", keptCardInstanceId: kept, orderedInstanceIds: options.cards.map(c => c.instanceId).filter(id => id !== kept), destination: "bottom" }, db);
    } else throw new Error(`Unexpected prompt ${options.promptType}`);
  }
  expect(state.pendingPrompt).toBeNull();
  expect(state.effectStack).toHaveLength(0);
  return state;
}

function playElders(ids: string[]) {
  const db = createTestCardDb();
  for (const data of [imu, elders, ...elderCards]) db.set(data.id, data);
  let state = createBattleReadyState(db);
  state.players[0] = {
    ...state.players[0],
    leader: { ...state.players[0].leader, cardId: imu.id },
    characters: padChars([card(elders.id, "elders")]),
    trash: [
      ...ids.map(id => card(id, `trash-${id}`, "TRASH")),
      ...Array.from({ length: 8 }, (_, i) =>
        card(CARDS.VANILLA.id, `trash-${i}`, "TRASH")
      ),
    ],
  };
  state.players[1] = {
    ...state.players[1],
    characters: padChars([
      { ...card(CARDS.VANILLA.id, "opponent"), owner: 1, controller: 1 },
    ]),
  };
  const activation = runPipeline(
    state,
    {
      type: "ACTIVATE_EFFECT",
      cardInstanceId: "elders",
      effectId: "OP13-082_activate_main",
    },
    db,
    0
  );
  expect(activation.valid).toBe(true);
  state = activation.state;
  state = drain(state, db);
  const played = state.players[0].characters.find(
    (c) => c?.cardId === nusjuro.id
  )!;
  expect(played).toBeDefined();
  expect(played.instanceId).not.toBe(`trash-${nusjuro.id}`);
  return { state, db, played };
}


// OP-13.md and comprehensive rules v1.2.0 §8-6-1-1: simultaneous
// plays complete before their On Play effects, while permanent effects exist
// throughout the subsequent effect resolution and evaluate current trash.
describe("OPT-819 permanent effects during nested play continuations", () => {
  it.each([
    ["A: Nusjuro alone", ["OP13-080"]],
    ["B: Nusjuro then Saturn", ["OP13-080", "OP13-083"]],
    ["C: Saturn then Nusjuro", ["OP13-083", "OP13-080"]],
    ["D: all five Elders", elderCards.map(c => c.id)],
  ])("%s", (_, ids) => {
    const { state, db, played } = playElders(ids as string[]);
    for (const id of ids) {
      const instance = state.players[0].characters.find(c => c?.cardId === id)!;
      expect(instance).toBeDefined();
      const blocks = db.get(id)!.effectSchema!.effects.filter(e => e.category === "permanent");
      expect(blocks.length).toBeGreaterThan(0);
      const records = state.activeEffects.filter(e => e.sourceCardInstanceId === instance.instanceId && e.category === "permanent");
      expect(records).toHaveLength(blocks.length);
      expect(registerCardEnteredField(state, instance, db.get(id)!)).toBe(state);
    }
    expect(hasGrantedKeyword(played, "RUSH", state, db)).toBe(true);
    for (const id of ["OP13-089", "OP13-091"]) {
      const blocker = state.players[0].characters.find(c => c?.cardId === id);
      if (blocker) expect(hasGrantedKeyword(blocker, "BLOCKER", state, db)).toBe(true);
    }
    expect(runPipeline(state, { type: "DECLARE_ATTACK", attackerInstanceId: played.instanceId, targetInstanceId: state.players[1].leader.instanceId }, db, 0).valid).toBe(true);
    const belowThreshold = { ...state, players: [{ ...state.players[0], trash: state.players[0].trash.slice(0, 6) }, state.players[1]] as GameState["players"] };
    expect(hasGrantedKeyword(played, "RUSH", belowThreshold, db)).toBe(false);
    expect(runPipeline(belowThreshold, { type: "DECLARE_ATTACK", attackerInstanceId: played.instanceId, targetInstanceId: state.players[1].leader.instanceId }, db, 0).valid).toBe(false);
  });
});
