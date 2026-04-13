/**
 * OPT-172 commit 4: rule 6-2 — drain ON_REST (CHARACTER_BECOMES_RESTED)
 * triggers between SET_REST frames.
 *
 * For a multi-target SET_REST batch, each frame's rest-triggered effects must
 * fully resolve before the next frame's CARD_STATE_CHANGED. Validates:
 *   - executeSetRest returns pendingBatchTriggers when frame N's
 *     CARD_STATE_CHANGED queues a CHARACTER_BECOMES_RESTED auto trigger
 *     and more targets remain
 *   - resolver-level integration drains the triggers, then re-enters the
 *     handler with the remaining batch
 *     (CARD_STATE_CHANGED[1] → CARD_DRAWN → CARD_STATE_CHANGED[2])
 */

import { describe, it, expect } from "vitest";
import { executeSetRest } from "../engine/effect-resolver/actions/play.js";
import { resolveEffect } from "../engine/effect-resolver/resolver.js";
import { registerTriggersForCard } from "../engine/triggers.js";
import type { Action, EffectBlock, EffectResult, EffectSchema } from "../engine/effect-types.js";
import type { CardData, CardInstance, GameState, PlayerState } from "../types.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";

const ON_REST_DRAW_SCHEMA: EffectSchema = {
  card_id: "CHAR-ONREST-DRAW",
  card_name: "OnRestDraw",
  card_type: "Character",
  effects: [
    {
      id: "on-rest-draw-1",
      category: "auto",
      trigger: { event: "CHARACTER_BECOMES_RESTED" },
      actions: [{ type: "DRAW", params: { amount: 1 } }],
    },
  ],
};

function makeOnRestDrawCard(): CardData {
  return {
    id: "CHAR-ONREST-DRAW",
    name: "OnRestDraw",
    type: "Character",
    color: ["Red"],
    cost: 2,
    power: 3000,
    counter: null,
    life: null,
    attribute: [],
    types: [],
    effectText: "[When this Character becomes rested] Draw 1.",
    triggerText: null,
    keywords: { rush: false, rushCharacter: false, doubleAttack: false, banish: false, blocker: false, trigger: false, unblockable: false },
    effectSchema: ON_REST_DRAW_SCHEMA,
    imageUrl: null,
  };
}

function fieldChar(cardId: string, owner: 0 | 1, suffix: string): CardInstance {
  return {
    instanceId: `char-${owner}-${suffix}`,
    cardId,
    zone: "CHARACTER",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: 1,
    controller: owner,
    owner,
  };
}

function boardWith(cardDb: Map<string, CardData>, p0Chars: CardInstance[]): GameState {
  const base = createBattleReadyState(cardDb);
  const newPlayers = [...base.players] as [PlayerState, PlayerState];
  newPlayers[0] = { ...newPlayers[0], characters: padChars(p0Chars) };
  let state: GameState = { ...base, players: newPlayers };
  // Test setup places characters directly; CARD_PLAYED-driven registration
  // never ran, so register on-field triggers manually.
  for (const inst of p0Chars) {
    const data = cardDb.get(inst.cardId);
    if (data) state = registerTriggersForCard(state, inst, data);
  }
  return state;
}

describe("OPT-172: rule 6-2 ON_REST drain between SET_REST frames", () => {
  it("executeSetRest returns pendingBatchTriggers when frame 1's CARD_STATE_CHANGED queues a CHARACTER_BECOMES_RESTED auto", () => {
    const cardDb = createTestCardDb();
    const restCard = makeOnRestDrawCard();
    cardDb.set(restCard.id, restCard);

    // First character has CHARACTER_BECOMES_RESTED → DRAW 1; second is vanilla.
    const c1 = fieldChar(restCard.id, 0, "rest-1");
    const c2 = fieldChar(CARDS.VANILLA.id, 0, "rest-2");
    const state = boardWith(cardDb, [c1, c2]);

    const action: Action = {
      type: "SET_REST",
      target: { type: "CHARACTER", controller: "SELF", count: { exact: 2 } },
    };

    const result = executeSetRest(
      state,
      action,
      "any-source",
      0,
      cardDb,
      new Map<string, EffectResult>(),
      [c1.instanceId, c2.instanceId],
    );

    // Frame 1 rested; batch paused for trigger drain before frame 2.
    expect(result.pendingBatchTriggers).toBeDefined();
    expect(result.pendingBatchTriggers!.triggers).toHaveLength(1);
    expect(result.pendingBatchTriggers!.marker.kind).toBe("SET_REST");
    if (result.pendingBatchTriggers!.marker.kind !== "SET_REST") throw new Error("kind");
    expect(result.pendingBatchTriggers!.marker.remainingTargetIds).toEqual([c2.instanceId]);
    expect(result.pendingBatchTriggers!.marker.restedSoFar).toEqual([c1.instanceId]);

    // Only frame 1's CARD_STATE_CHANGED has been emitted so far.
    const stateChangeEvents = result.events.filter((e) => e.type === "CARD_STATE_CHANGED");
    expect(stateChangeEvents).toHaveLength(1);
    expect((stateChangeEvents[0].payload as { targetInstanceId: string }).targetInstanceId).toBe(c1.instanceId);

    // Frame 1's character is now RESTED; frame 2 is still ACTIVE.
    const chars = result.state.players[0].characters.filter(Boolean) as CardInstance[];
    const c1After = chars.find((c) => c.instanceId === c1.instanceId);
    const c2After = chars.find((c) => c.instanceId === c2.instanceId);
    expect(c1After?.state).toBe("RESTED");
    expect(c2After?.state).toBe("ACTIVE");
  });

  it("integrated: drains ON_REST between frames so events fire CARD_STATE_CHANGED → CARD_DRAWN → CARD_STATE_CHANGED", () => {
    const cardDb = createTestCardDb();
    const restCard = makeOnRestDrawCard();
    cardDb.set(restCard.id, restCard);

    const c1 = fieldChar(restCard.id, 0, "rest-1");
    const c2 = fieldChar(CARDS.VANILLA.id, 0, "rest-2");
    const state = boardWith(cardDb, [c1, c2]);

    const block: EffectBlock = {
      id: "test-block",
      category: "activate",
      actions: [
        {
          type: "SET_REST",
          target: { type: "CHARACTER", controller: "SELF", count: { exact: 2 } },
        },
      ],
    };

    const result = resolveEffect(state, block, "any-source", 0, cardDb);
    expect(result.pendingPrompt).toBeUndefined();

    // Both characters rested; frame 1's CHARACTER_BECOMES_RESTED drew a card.
    const stateChangeEvents = result.events.filter((e) => e.type === "CARD_STATE_CHANGED");
    expect(stateChangeEvents).toHaveLength(2);
    const drawEvents = result.events.filter((e) => e.type === "CARD_DRAWN");
    expect(drawEvents.length).toBeGreaterThanOrEqual(1);

    // Strict ordering: frame 1's CARD_STATE_CHANGED, then DRAW (rule 6-2 drain),
    // then frame 2's CARD_STATE_CHANGED — never the reverse.
    const types = result.events.map((e) => e.type);
    const firstStateIdx = types.indexOf("CARD_STATE_CHANGED");
    const lastStateIdx = types.lastIndexOf("CARD_STATE_CHANGED");
    const drawIdx = types.indexOf("CARD_DRAWN");
    expect(firstStateIdx).toBeLessThan(drawIdx);
    expect(drawIdx).toBeLessThan(lastStateIdx);

    // Both characters end RESTED.
    const chars = result.state.players[0].characters.filter(Boolean) as CardInstance[];
    expect(chars.every((c) => c.state === "RESTED")).toBe(true);
  });
});
