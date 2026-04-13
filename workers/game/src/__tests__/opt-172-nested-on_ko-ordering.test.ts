/**
 * OPT-172 commit 3: rule 6-2 — drain ON_KO triggers between KO frames.
 *
 * For a multi-target KO batch, each frame's ON_KO triggers must fully resolve
 * before the next frame's CARD_KO. Validates:
 *   - executeKO returns pendingBatchTriggers when frame N's CARD_KO queues
 *     an ON_KO trigger and more targets remain
 *   - resolver-level integration drains the triggers, then re-enters the
 *     handler with the remaining batch (CARD_KO[1] → DRAW → CARD_KO[2])
 *
 * TRASH_CARD intentionally has no analogue: per rule 10-2-1-3, TRASH on a
 * field character emits CARD_TRASHED (not CARD_KO), and no trigger keyword
 * listens for CARD_TRASHED.
 */

import { describe, it, expect } from "vitest";
import { executeKO } from "../engine/effect-resolver/actions/removal.js";
import { resolveEffect } from "../engine/effect-resolver/resolver.js";
import { registerTriggersForCard } from "../engine/triggers.js";
import type { Action, EffectBlock, EffectResult, EffectSchema } from "../engine/effect-types.js";
import type { CardData, CardInstance, GameState, PlayerState } from "../types.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";

const ON_KO_DRAW_SCHEMA: EffectSchema = {
  card_id: "CHAR-ONKO-DRAW",
  card_name: "OnKoDraw",
  card_type: "Character",
  effects: [
    {
      id: "on-ko-draw-1",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [{ type: "DRAW", params: { amount: 1 } }],
    },
  ],
};

function makeOnKoDrawCard(): CardData {
  return {
    id: "CHAR-ONKO-DRAW",
    name: "OnKoDraw",
    type: "Character",
    color: ["Red"],
    cost: 2,
    power: 3000,
    counter: null,
    life: null,
    attribute: [],
    types: [],
    effectText: "[On K.O.] Draw 1.",
    triggerText: null,
    keywords: { rush: false, rushCharacter: false, doubleAttack: false, banish: false, blocker: false, trigger: false, unblockable: false },
    effectSchema: ON_KO_DRAW_SCHEMA,
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
  // Register on-field triggers (test setup places characters directly, so
  // CARD_PLAYED-driven registration in scanEventsForTriggers never ran).
  for (const inst of p0Chars) {
    const data = cardDb.get(inst.cardId);
    if (data) state = registerTriggersForCard(state, inst, data);
  }
  return state;
}

describe("OPT-172: rule 6-2 ON_KO drain between KO frames", () => {
  it("executeKO returns pendingBatchTriggers when frame 1's CARD_KO queues an ON_KO trigger", () => {
    const cardDb = createTestCardDb();
    const drawCard = makeOnKoDrawCard();
    cardDb.set(drawCard.id, drawCard);

    // Two SELF characters: the first has ON_KO Draw, the second is vanilla.
    const c1 = fieldChar(drawCard.id, 0, "ko-1");
    const c2 = fieldChar(CARDS.VANILLA.id, 0, "ko-2");
    const state = boardWith(cardDb, [c1, c2]);

    const action: Action = {
      type: "KO",
      target: { type: "CHARACTER", controller: "SELF", count: { exact: 2 } },
    };

    const result = executeKO(
      state,
      action,
      "any-source",
      0,
      cardDb,
      new Map<string, EffectResult>(),
      [c1.instanceId, c2.instanceId],
    );

    // Frame 1 KO'd; batch paused for trigger drain before frame 2.
    expect(result.pendingBatchTriggers).toBeDefined();
    expect(result.pendingBatchTriggers!.triggers).toHaveLength(1);
    expect(result.pendingBatchTriggers!.marker.kind).toBe("KO");
    if (result.pendingBatchTriggers!.marker.kind !== "KO") throw new Error("kind");
    expect(result.pendingBatchTriggers!.marker.remainingTargetIds).toEqual([c2.instanceId]);
    expect(result.pendingBatchTriggers!.marker.koedSoFar).toEqual([c1.instanceId]);

    // Only frame 1's CARD_KO has been emitted so far.
    const koEvents = result.events.filter((e) => e.type === "CARD_KO");
    expect(koEvents).toHaveLength(1);
    expect((koEvents[0].payload as { cardInstanceId: string }).cardInstanceId).toBe(c1.instanceId);

    // Frame 1's character is in trash; frame 2 is still on the field.
    const survivors = result.state.players[0].characters.filter(Boolean);
    expect(survivors).toHaveLength(1);
    expect(survivors[0]!.instanceId).toBe(c2.instanceId);
  });

  it("integrated: drains ON_KO between frames so events fire CARD_KO → CARD_DRAWN → CARD_KO", () => {
    const cardDb = createTestCardDb();
    const drawCard = makeOnKoDrawCard();
    cardDb.set(drawCard.id, drawCard);

    const c1 = fieldChar(drawCard.id, 0, "ko-1");
    const c2 = fieldChar(CARDS.VANILLA.id, 0, "ko-2");
    const state = boardWith(cardDb, [c1, c2]);

    const block: EffectBlock = {
      id: "test-block",
      category: "activate",
      actions: [
        {
          type: "KO",
          target: { type: "CHARACTER", controller: "SELF", count: { exact: 2 } },
        },
      ],
    };

    const result = resolveEffect(state, block, "any-source", 0, cardDb);
    expect(result.pendingPrompt).toBeUndefined();

    // Both characters KO'd; frame 1's ON_KO drew a card.
    const koEvents = result.events.filter((e) => e.type === "CARD_KO");
    expect(koEvents).toHaveLength(2);
    const drawEvents = result.events.filter((e) => e.type === "CARD_DRAWN");
    expect(drawEvents.length).toBeGreaterThanOrEqual(1);

    // Strict ordering: frame 1's CARD_KO, then DRAW (rule 6-2 drain), then
    // frame 2's CARD_KO — never the reverse.
    const types = result.events.map((e) => e.type);
    const firstKoIdx = types.indexOf("CARD_KO");
    const lastKoIdx = types.lastIndexOf("CARD_KO");
    const drawIdx = types.indexOf("CARD_DRAWN");
    expect(firstKoIdx).toBeLessThan(drawIdx);
    expect(drawIdx).toBeLessThan(lastKoIdx);

    // Field cleared.
    expect(result.state.players[0].characters.filter(Boolean)).toHaveLength(0);
  });
});
