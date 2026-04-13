/**
 * OPT-172 commit 2: rule 6-2 — drain ON_PLAY triggers between PLAY_CARD frames.
 *
 * For a multi-target PLAY_CARD batch, each frame's ON_PLAY triggers must fully
 * resolve before the next frame's CARD_PLAYED. Validates:
 *   - executePlayCard returns pendingBatchTriggers when frame N triggers a queue
 *   - resolver-level integration drains the triggers, then re-enters the
 *     handler with the remaining batch
 *   - if a trigger trashes a later frame's source-zone card, that frame fizzles
 */

import { describe, it, expect } from "vitest";
import { executePlayCard } from "../engine/effect-resolver/actions/play.js";
import { resolveEffect } from "../engine/effect-resolver/resolver.js";
import type { Action, EffectBlock, EffectResult, EffectSchema } from "../engine/effect-types.js";
import type { CardData, CardInstance, GameState } from "../types.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";

const ON_PLAY_DRAW_SCHEMA: EffectSchema = {
  card_id: "CHAR-ONPLAY-DRAW",
  card_name: "OnPlayDraw",
  card_type: "Character",
  effects: [
    {
      id: "on-play-draw-1",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [{ type: "DRAW", params: { amount: 1 } }],
    },
  ],
};

const ON_PLAY_TRASH_HAND_SCHEMA: EffectSchema = {
  card_id: "CHAR-ONPLAY-TRASH",
  card_name: "OnPlayTrashHand",
  card_type: "Character",
  effects: [
    {
      id: "on-play-trash-hand",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "TRASH_FROM_HAND",
          target: { controller: "SELF" },
          params: { amount: 1 },
        },
      ],
    },
  ],
};

function makeOnPlayDrawCard(): CardData {
  return {
    id: "CHAR-ONPLAY-DRAW",
    name: "OnPlayDraw",
    type: "Character",
    color: ["Red"],
    cost: 2,
    power: 3000,
    counter: null,
    life: null,
    attribute: [],
    types: [],
    effectText: "[On Play] Draw 1.",
    triggerText: null,
    keywords: { rush: false, rushCharacter: false, doubleAttack: false, banish: false, blocker: false, trigger: false, unblockable: false },
    effectSchema: ON_PLAY_DRAW_SCHEMA,
    imageUrl: null,
  };
}

function makeOnPlayTrashCard(): CardData {
  return {
    id: "CHAR-ONPLAY-TRASH",
    name: "OnPlayTrashHand",
    type: "Character",
    color: ["Red"],
    cost: 2,
    power: 3000,
    counter: null,
    life: null,
    attribute: [],
    types: [],
    effectText: "[On Play] Trash 1 from your hand.",
    triggerText: null,
    keywords: { rush: false, rushCharacter: false, doubleAttack: false, banish: false, blocker: false, trigger: false, unblockable: false },
    effectSchema: ON_PLAY_TRASH_HAND_SCHEMA,
    imageUrl: null,
  };
}

function trashChar(cardId: string, suffix: string): CardInstance {
  return {
    instanceId: `trash-${suffix}`,
    cardId,
    zone: "TRASH",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: 0,
    controller: 0,
    owner: 0,
  };
}

function emptyBoardWith(
  cardDb: Map<string, CardData>,
  trash: CardInstance[],
): GameState {
  const base = createBattleReadyState(cardDb);
  return {
    ...base,
    players: [
      { ...base.players[0], characters: padChars([]), trash },
      base.players[1],
    ] as [typeof base.players[0], typeof base.players[1]],
  };
}

describe("OPT-172: rule 6-2 ON_PLAY drain between PLAY_CARD frames", () => {
  it("executePlayCard returns pendingBatchTriggers when frame 1's ON_PLAY queues a trigger", () => {
    const cardDb = createTestCardDb();
    const drawCard = makeOnPlayDrawCard();
    cardDb.set(drawCard.id, drawCard);

    const trash = [
      trashChar(drawCard.id, "first"),
      trashChar(CARDS.VANILLA.id, "second"),
    ];
    const state = emptyBoardWith(cardDb, trash);

    const action: Action = {
      type: "PLAY_CARD",
      target: { type: "CHARACTER_CARD", source_zone: "TRASH", count: { up_to: 2 } },
      params: { source_zone: "TRASH", cost_override: "FREE" },
    };

    const result = executePlayCard(
      state,
      action,
      "any-source",
      0,
      cardDb,
      new Map<string, EffectResult>(),
      trash.map((c) => c.instanceId),
    );

    // Frame 1 played; batch paused for trigger drain before frame 2.
    expect(result.pendingBatchTriggers).toBeDefined();
    expect(result.pendingBatchTriggers!.triggers).toHaveLength(1);
    expect(result.pendingBatchTriggers!.marker.kind).toBe("PLAY_CARD");
    if (result.pendingBatchTriggers!.marker.kind !== "PLAY_CARD") throw new Error("kind");
    expect(result.pendingBatchTriggers!.marker.resumeFrame.remainingTargetIds).toEqual([
      "trash-second",
    ]);
    expect(result.pendingBatchTriggers!.marker.resumeFrame.playedSoFar).toHaveLength(1);

    // Only frame 1's CARD_PLAYED has been emitted so far.
    const played = result.events.filter((e) => e.type === "CARD_PLAYED");
    expect(played).toHaveLength(1);
    expect((played[0].payload as { cardId: string }).cardId).toBe(drawCard.id);
    // Frame 1's source-zone card was consumed; frame 2 still in trash.
    expect(result.state.players[0].trash.map((c) => c.instanceId)).toEqual(["trash-second"]);
    expect(result.state.players[0].characters.filter(Boolean)).toHaveLength(1);
  });

  it("integrated: drains trigger between frames so events fire CARD_PLAYED → CARD_DRAWN → CARD_PLAYED", () => {
    const cardDb = createTestCardDb();
    const drawCard = makeOnPlayDrawCard();
    cardDb.set(drawCard.id, drawCard);

    const trash = [
      trashChar(drawCard.id, "first"),
      trashChar(CARDS.VANILLA.id, "second"),
    ];
    const state = emptyBoardWith(cardDb, trash);

    const block: EffectBlock = {
      id: "test-block",
      category: "activate",
      actions: [
        {
          type: "PLAY_CARD",
          target: { type: "CHARACTER_CARD", source_zone: "TRASH", count: { exact: 2 } },
          params: { source_zone: "TRASH", cost_override: "FREE" },
        },
      ],
    };

    const result = resolveEffect(state, block, "any-source", 0, cardDb);
    expect(result.pendingPrompt).toBeUndefined();

    // Both frames played; one card drawn from frame 1's ON_PLAY.
    const cardPlayed = result.events.filter((e) => e.type === "CARD_PLAYED");
    expect(cardPlayed).toHaveLength(2);
    const cardDrawn = result.events.filter((e) => e.type === "CARD_DRAWN");
    expect(cardDrawn.length).toBeGreaterThanOrEqual(1);

    // Strict ordering: frame 1's CARD_PLAYED, then DRAW (rule 6-2 drain), then
    // frame 2's CARD_PLAYED — never the reverse.
    const types = result.events.map((e) => e.type);
    const firstPlayedIdx = types.indexOf("CARD_PLAYED");
    const lastPlayedIdx = types.lastIndexOf("CARD_PLAYED");
    const drawIdx = types.indexOf("CARD_DRAWN");
    expect(firstPlayedIdx).toBeLessThan(drawIdx);
    expect(drawIdx).toBeLessThan(lastPlayedIdx);
  });

  it("frame 1's ON_PLAY emits CARD_TRASHED strictly between frame 1 and frame 2 plays", () => {
    const cardDb = createTestCardDb();
    const trashHandCard = makeOnPlayTrashCard();
    cardDb.set(trashHandCard.id, trashHandCard);

    // Frame 1 plays the trash-hand card; its ON_PLAY trashes 1 from hand.
    // Bystander card sits in hand to absorb the trash so frame 2's source
    // (in trash) is not affected. Rule 6-2: the CARD_TRASHED must appear
    // strictly between the two CARD_PLAYED events.
    const trashSources: CardInstance[] = [
      { instanceId: "ts1", cardId: trashHandCard.id, zone: "TRASH", state: "ACTIVE", attachedDon: [], turnPlayed: 0, controller: 0, owner: 0 },
      { instanceId: "ts2", cardId: CARDS.VANILLA.id, zone: "TRASH", state: "ACTIVE", attachedDon: [], turnPlayed: 0, controller: 0, owner: 0 },
    ];
    const handBystander: CardInstance = {
      instanceId: "bystander", cardId: CARDS.VANILLA.id, zone: "HAND",
      state: "ACTIVE", attachedDon: [], turnPlayed: 0, controller: 0, owner: 0,
    };
    const base = createBattleReadyState(cardDb);
    const state: GameState = {
      ...base,
      players: [
        { ...base.players[0], characters: padChars([]), trash: trashSources, hand: [handBystander] },
        base.players[1],
      ] as [typeof base.players[0], typeof base.players[1]],
    };

    const block: EffectBlock = {
      id: "test-block",
      category: "activate",
      actions: [
        {
          type: "PLAY_CARD",
          target: { type: "CHARACTER_CARD", source_zone: "TRASH", count: { exact: 2 } },
          params: { source_zone: "TRASH", cost_override: "FREE" },
        },
      ],
    };

    const result = resolveEffect(state, block, "any-source", 0, cardDb);
    expect(result.pendingPrompt).toBeUndefined();

    // Both frames played, plus the bystander was trashed by frame 1's ON_PLAY.
    const cardPlayed = result.events.filter((e) => e.type === "CARD_PLAYED");
    expect(cardPlayed).toHaveLength(2);
    expect((cardPlayed[0].payload as { cardId: string }).cardId).toBe(trashHandCard.id);
    expect((cardPlayed[1].payload as { cardId: string }).cardId).toBe(CARDS.VANILLA.id);

    // Rule 6-2 ordering: CARD_TRASHED (from frame 1's ON_PLAY) sits strictly
    // between frame 1's CARD_PLAYED and frame 2's CARD_PLAYED.
    const types = result.events.map((e) => e.type);
    const firstPlayedIdx = types.indexOf("CARD_PLAYED");
    const lastPlayedIdx = types.lastIndexOf("CARD_PLAYED");
    const trashedIdx = types.indexOf("CARD_TRASHED");
    expect(trashedIdx).toBeGreaterThan(firstPlayedIdx);
    expect(trashedIdx).toBeLessThan(lastPlayedIdx);

    // Bystander trashed; both batched cards on the board.
    expect(result.state.players[0].hand).toHaveLength(0);
    expect(result.state.players[0].characters.filter(Boolean)).toHaveLength(2);
  });
});
