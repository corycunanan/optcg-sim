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
} from "../engine/schemas/op13.js";
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
  types: ["Five Elders"],
  effectSchema: OP13_082_FIVE_ELDERS,
};
const nusjuro: CardData = {
  ...CARDS.VANILLA,
  id: "OP13-080",
  name: "St. Ethanbaron V. Nusjuro",
  power: 5000,
  types: ["Five Elders"],
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
function playNusjuro() {
  const db = createTestCardDb();
  for (const data of [imu, elders, nusjuro]) db.set(data.id, data);
  let state = createBattleReadyState(db);
  state.players[0] = {
    ...state.players[0],
    leader: { ...state.players[0].leader, cardId: imu.id },
    characters: padChars([card(elders.id, "elders"), card(CARDS.VANILLA.id, "ally")]),
    trash: [
      card(nusjuro.id, "nusjuro-trash", "TRASH"),
      ...Array.from({ length: 9 }, (_, i) =>
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
  const costId = state.players[0].hand[0].instanceId;
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
  for (let i = 0; state.pendingPrompt && i < 10; i++) {
    const options = state.pendingPrompt.options;
    if (options.promptType === "OPTIONAL_EFFECT")
      state = resume(state, { type: "PLAYER_CHOICE", choiceId: "accept" }, db);
    else if (options.promptType === "SELECT_TARGET")
      state = resume(
        state,
        {
          type: "SELECT_TARGET",
          selectedInstanceIds: options.validTargets.slice(0, options.countMax),
        },
        db
      );
    else throw new Error(`Unexpected prompt ${options.promptType}`);
  }
  expect(state.pendingPrompt).toBeNull();
  const played = state.players[0].characters.find(
    (c) => c?.cardId === nusjuro.id
  )!;
  expect(played).toBeDefined();
  expect(played.instanceId).not.toBe("nusjuro-trash");
  return { state, db, played, costId };
}

// Canonical OP13-082: pay hand trash first, trash all Characters, then play.
describe("OPT-820 accumulated events replay", () => {
  it("publishes the paid hand card, every trashed Character, and played Elder once in order", () => {
    const { state, played, costId } = playNusjuro();
    expect(state.effectStack).toEqual([]);
    const movements = state.eventLog.filter(e => e.type === "CARD_TRASHED" || e.type === "CARD_PLAYED");
    expect(movements.map(e => [e.type, "cardInstanceId" in e.payload ? e.payload.cardInstanceId : null])).toEqual([
      ["CARD_TRASHED", costId],
      ["CARD_TRASHED", "elders"],
      ["CARD_TRASHED", "ally"],
      ["CARD_PLAYED", played.instanceId],
    ]);
    expect(state.eventLog.filter(e => e.type === "CARD_KO")).toEqual([]);
    expect(state.triggerRegistry.filter(t => t.sourceCardInstanceId === played.instanceId)).toHaveLength(1);
    expect(state.activeEffects.filter(e => e.sourceCardInstanceId === played.instanceId)).toHaveLength(1);
  });
});
