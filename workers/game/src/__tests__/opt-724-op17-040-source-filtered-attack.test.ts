/**
 * OPT-724 — OP17-040 observes a friendly Rocks Pirates Leader's battle events.
 *
 * These tests drive the printed effect through runPipeline so trigger windows,
 * optional cost payment, and battle-duration power changes follow live play.
 */

import { describe, expect, it } from "vitest";
import type {
  CardData,
  CardInstance,
  GameState,
  PlayerState,
} from "../types.js";
import { runPipeline } from "../engine/pipeline.js";
import { resumeFromStack } from "../engine/effect-resolver/index.js";
import { getEffectivePower } from "../engine/modifiers.js";
import { registerTriggersForCard } from "../engine/triggers.js";
import { OP17_040_EDWARD_NEWGATE } from "../engine/schemas/op17.js";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
  padChars,
} from "./helpers.js";

function withPlayer(
  state: GameState,
  playerIndex: 0 | 1,
  patch: Partial<PlayerState>
): GameState {
  const players = [...state.players] as [PlayerState, PlayerState];
  players[playerIndex] = { ...players[playerIndex], ...patch };
  return { ...state, players };
}

function makeCardData(
  id: string,
  name: string,
  type: CardData["type"],
  overrides: Partial<CardData> = {}
): CardData {
  return {
    ...CARDS.VANILLA,
    id,
    name,
    type,
    cost: type === "Leader" ? null : 4,
    power: 5000,
    life: type === "Leader" ? 5 : null,
    ...overrides,
  };
}

function installEdward(controller: 0 | 1): {
  state: GameState;
  cardDb: Map<string, CardData>;
  edward: CardInstance;
} {
  const cardDb = createTestCardDb();
  const edwardData = makeCardData("OP17-040", "Edward.Newgate", "Character", {
    effectSchema: OP17_040_EDWARD_NEWGATE,
  });
  cardDb.set(edwardData.id, edwardData);

  let state = createBattleReadyState(cardDb);
  const edward: CardInstance = {
    instanceId: `op17-040-p${controller}`,
    cardId: edwardData.id,
    zone: "CHARACTER",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: 1,
    controller,
    owner: controller,
  };
  state = withPlayer(state, controller, {
    characters: padChars([edward]),
  });
  state = registerTriggersForCard(state, edward, edwardData);
  return { state, cardDb, edward };
}

function installRocksLeader(
  state: GameState,
  cardDb: Map<string, CardData>,
  controller: 0 | 1,
  types: string[] = ["Rocks Pirates"]
): { state: GameState; leader: CardInstance } {
  const leaderData = makeCardData(
    `ROCKS-LEADER-P${controller}`,
    "Rocks Leader",
    "Leader",
    { types }
  );
  cardDb.set(leaderData.id, leaderData);
  const leader: CardInstance = {
    ...state.players[controller].leader,
    cardId: leaderData.id,
  };
  return {
    state: withPlayer(state, controller, { leader }),
    leader,
  };
}

function acceptAndTrashFirst(
  result: ReturnType<typeof runPipeline>,
  cardDb: Map<string, CardData>
) {
  expect(result.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
  let resumed = resumeFromStack(
    result.state,
    { type: "PLAYER_CHOICE", choiceId: "accept" },
    cardDb
  );
  expect(resumed.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
  if (resumed.pendingPrompt?.options.promptType !== "SELECT_TARGET") {
    throw new Error("Expected trash-from-hand selection");
  }
  resumed = resumeFromStack(
    resumed.state,
    {
      type: "SELECT_TARGET",
      selectedInstanceIds: [resumed.pendingPrompt.options.validTargets[0]],
    },
    cardDb
  );
  return resumed;
}

describe("OPT-724 — OP17-040 source-filtered battle triggers", () => {
  it("fires when another friendly Rocks Pirates Leader attacks", () => {
    const installed = installEdward(0);
    const withLeader = installRocksLeader(installed.state, installed.cardDb, 0);
    const handBefore = withLeader.state.players[0].hand.length;

    const attack = runPipeline(
      withLeader.state,
      {
        type: "DECLARE_ATTACK",
        attackerInstanceId: withLeader.leader.instanceId,
        targetInstanceId: withLeader.state.players[1].leader.instanceId,
      },
      installed.cardDb,
      0
    );
    expect(attack.valid).toBe(true);
    const resolved = acceptAndTrashFirst(attack, installed.cardDb);

    expect(resolved.pendingPrompt).toBeUndefined();
    expect(resolved.state.players[0].hand).toHaveLength(handBefore - 1);
    expect(
      getEffectivePower(
        resolved.state.players[0].leader,
        installed.cardDb.get(withLeader.leader.cardId)!,
        resolved.state,
        installed.cardDb
      )
    ).toBe(8000);
  });

  it("fires when another friendly Rocks Pirates Leader is the final attack target", () => {
    const installed = installEdward(1);
    const withLeader = installRocksLeader(installed.state, installed.cardDb, 1);
    const handBefore = withLeader.state.players[1].hand.length;

    const attack = runPipeline(
      withLeader.state,
      {
        type: "DECLARE_ATTACK",
        attackerInstanceId: withLeader.state.players[0].leader.instanceId,
        targetInstanceId: withLeader.leader.instanceId,
      },
      installed.cardDb,
      0
    );
    expect(attack.valid).toBe(true);
    expect(attack.pendingPrompt).toBeUndefined();

    const finalTarget = runPipeline(
      attack.state,
      { type: "PASS" },
      installed.cardDb,
      0
    );
    expect(finalTarget.valid).toBe(true);
    const resolved = acceptAndTrashFirst(finalTarget, installed.cardDb);

    expect(resolved.pendingPrompt).toBeUndefined();
    expect(resolved.state.players[1].hand).toHaveLength(handBefore - 1);
    expect(
      getEffectivePower(
        resolved.state.players[1].leader,
        installed.cardDb.get(withLeader.leader.cardId)!,
        resolved.state,
        installed.cardDb
      )
    ).toBe(8000);
  });

  it("does not fire when the attacking Leader lacks the Rocks Pirates type", () => {
    const installed = installEdward(0);
    const withLeader = installRocksLeader(
      installed.state,
      installed.cardDb,
      0,
      ["Whitebeard Pirates"]
    );

    const attack = runPipeline(
      withLeader.state,
      {
        type: "DECLARE_ATTACK",
        attackerInstanceId: withLeader.leader.instanceId,
        targetInstanceId: withLeader.state.players[1].leader.instanceId,
      },
      installed.cardDb,
      0
    );

    expect(attack.valid).toBe(true);
    expect(attack.pendingPrompt).toBeUndefined();
  });

  it("does not fire after a Blocker becomes the final attack target", () => {
    const installed = installEdward(1);
    const blocker: CardInstance = {
      instanceId: "op17-040-blocker-p1",
      cardId: CARDS.BLOCKER.id,
      zone: "CHARACTER",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 1,
      controller: 1,
      owner: 1,
    };
    const stateWithBlocker = withPlayer(installed.state, 1, {
      characters: padChars([installed.edward, blocker]),
    });
    const withLeader = installRocksLeader(
      stateWithBlocker,
      installed.cardDb,
      1
    );

    const attack = runPipeline(
      withLeader.state,
      {
        type: "DECLARE_ATTACK",
        attackerInstanceId: withLeader.state.players[0].leader.instanceId,
        targetInstanceId: withLeader.leader.instanceId,
      },
      installed.cardDb,
      0
    );
    expect(attack.valid).toBe(true);
    const blocked = runPipeline(
      attack.state,
      { type: "DECLARE_BLOCKER", blockerInstanceId: blocker.instanceId },
      installed.cardDb,
      1
    );

    expect(blocked.valid).toBe(true);
    expect(blocked.state.turn.battle?.targetInstanceId).toBe(
      blocker.instanceId
    );
    expect(blocked.pendingPrompt).toBeUndefined();
  });
});
