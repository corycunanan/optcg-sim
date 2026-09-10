import { expect, it } from "vitest";
import { eventToSpotlight } from "./spotlight";
import { runPipeline } from "../../../workers/game/src/engine/pipeline";
import { getEffectSchema } from "../../../workers/game/src/engine/schema-registry";
import { resumePromptLifecycle } from "../../../workers/game/src/session/prompt-lifecycle";
import { parseStoredSession } from "../../../workers/game/src/session/persistence";
import { visibleStateForPlayer } from "../../../workers/game/src/session/visibility";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
  padChars,
} from "../../../workers/game/src/__tests__/helpers";
import type { GameAction } from "../../../workers/game/src/types";

it("renders Law's real public Life reveal as a spotlight while the play decision is pending", () => {
  const db = createTestCardDb();
  let state = createBattleReadyState(db);
  db.set("OP10-022", {
    ...CARDS.LEADER,
    id: "OP10-022",
    effectSchema: getEffectSchema("OP10-022"),
  });
  db.set("law-cost", { ...CARDS.VANILLA, id: "law-cost", cost: 5 });
  db.set("law-life", {
    ...CARDS.VANILLA,
    id: "law-life",
    cost: 5,
    types: ["Supernovas"],
  });
  const leader = state.players[0].leader;
  leader.cardId = "OP10-022";
  const don = state.players[0].donCostArea.shift()!;
  don.attachedTo = leader.instanceId;
  leader.attachedDon = [don];
  const returned = state.players[0].characters[0]!;
  returned.cardId = "law-cost";
  state.players[0].characters = padChars([returned]);
  state.players[0].life[0].cardId = "law-life";
  const revealed = structuredClone(state.players[0].life[0]);
  const activated = runPipeline(
    state,
    {
      type: "ACTIVATE_EFFECT",
      cardInstanceId: leader.instanceId,
      effectId: "activate_reveal_life_play",
    },
    db,
    0
  );
  expect(activated.valid).toBe(true);
  state = activated.state;
  function respond(action: GameAction) {
    const result = resumePromptLifecycle(state, action, db, {
      drainPregame: (s) => s,
      advanceStartOfTurn: (s) => s,
    });
    expect(result.responseRejected).toBe(false);
    state = result.state;
  }
  if (state.pendingPrompt?.options.promptType === "OPTIONAL_EFFECT")
    respond({ type: "PLAYER_CHOICE", choiceId: "activate" });
  respond({
    type: "SELECT_TARGET",
    selectedInstanceIds: [returned.instanceId],
  });
  state = parseStoredSession(
    JSON.parse(
      JSON.stringify({ state, cardDb: Object.fromEntries(db), mode: "PVP" })
    )
  ).state;
  expect(state.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");
  for (const player of [0, 1] as const) {
    const view = visibleStateForPlayer(state, db, player);
    const events = view.eventLog.filter((e) => e.type === "CARDS_REVEALED");
    expect(events).toHaveLength(1);
    expect(eventToSpotlight(events[0])).toMatchObject({
      kind: "REVEAL",
      cards: [{ cardId: revealed.cardId, instanceId: revealed.instanceId }],
    });
  }
});
