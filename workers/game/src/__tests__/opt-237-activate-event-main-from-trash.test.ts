/**
 * OPT-237 — C2: Character activates Event [Main] from trash.
 *
 * When a character effect (e.g. EB03-031 Vinsmoke Reiju) resolves an Event's
 * [Main] effect straight out of the trash, the FAQ spells out the non-obvious
 * mechanics the engine must honor:
 *
 *   - The character pays an inline DON!! cost as part of its own effect; the
 *     Event's printed main cost is SKIPPED.
 *   - The Event stays in the trash — it does not move to field or hand.
 *   - The Event's [Main] block is resolved (e.g. DRAW 1) with the character's
 *     controller as the effect controller.
 *   - Counter-only Events (no [Main] block) are not valid targets.
 *   - Any prompt the nested [Main] block surfaces must bubble up through the
 *     action handler so the outer resolver can pause for input.
 *
 * These tests lock in the ACTIVATE_EVENT_FROM_TRASH handler's end-to-end
 * contract: filtering, emission, and nested resolution.
 */

import { describe, it, expect } from "vitest";
import { executeActivateEventFromTrash } from "../engine/effect-resolver/actions/play.js";
import type { Action, EffectResult, EffectSchema } from "../engine/effect-types.js";
import type { CardData, CardInstance, GameState, PlayerState } from "../types.js";
import { createBattleReadyState, createTestCardDb } from "./helpers.js";

// ─── Card builders ──────────────────────────────────────────────────────────

function makeEventCard(id: string, overrides: Partial<CardData> = {}): CardData {
  return {
    id,
    name: id,
    type: "Event",
    color: ["Red"],
    cost: 2,
    power: null,
    counter: null,
    life: null,
    attribute: [],
    types: [],
    effectText: "",
    triggerText: null,
    keywords: { rush: false, rushCharacter: false, doubleAttack: false, banish: false, blocker: false, trigger: false, unblockable: false },
    effectSchema: null,
    imageUrl: null,
    ...overrides,
  };
}

/** Main-only event: resolving it draws `amount` cards. */
function drawEventSchema(amount: number): EffectSchema {
  return {
    effects: [
      {
        id: "main-draw",
        category: "auto",
        trigger: { keyword: "MAIN_EVENT" },
        actions: [{ type: "DRAW", params: { amount } }],
      },
    ],
  };
}

/** Counter-only event: no MAIN_EVENT block. Should be excluded from valid targets. */
function counterOnlyEventSchema(): EffectSchema {
  return {
    effects: [
      {
        id: "counter-only",
        category: "counter",
        trigger: { keyword: "COUNTER_EVENT" },
        actions: [
          {
            type: "MODIFY_POWER",
            target: { type: "LEADER_OR_CHARACTER", controller: "SELF", count: { exact: 1 } },
            params: { amount: 2000 },
            duration: { type: "THIS_BATTLE" },
          },
        ],
      },
    ],
  };
}

function seedEventInTrash(
  state: GameState,
  playerIndex: 0 | 1,
  instanceId: string,
  cardId: string,
): GameState {
  const evt: CardInstance = {
    instanceId,
    cardId,
    zone: "TRASH",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: null,
    controller: playerIndex,
    owner: playerIndex,
  };
  const newPlayers = [...state.players] as [PlayerState, PlayerState];
  newPlayers[playerIndex] = {
    ...newPlayers[playerIndex],
    trash: [evt, ...newPlayers[playerIndex].trash],
  };
  return { ...state, players: newPlayers };
}

const REIJU_LIKE_ACTION: Action = {
  type: "ACTIVATE_EVENT_FROM_TRASH",
  target: {
    type: "EVENT_CARD",
    controller: "SELF",
    count: { up_to: 1 },
    source_zone: "TRASH",
    filter: { cost_max: 7 },
  },
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("OPT-237 — ACTIVATE_EVENT_FROM_TRASH resolves the Event's [Main] block", () => {
  it("resolves the selected Event's MAIN_EVENT effect (draws 1 card)", () => {
    const cardDb = createTestCardDb();
    const evtCard = makeEventCard("EVT-MAIN-DRAW", {
      cost: 1,
      effectText: "[Main] Draw 1 card.",
      effectSchema: drawEventSchema(1),
    });
    cardDb.set(evtCard.id, evtCard);

    let state = createBattleReadyState(cardDb);
    state = seedEventInTrash(state, 0, "evt-trash-1", evtCard.id);

    const handBefore = state.players[0].hand.length;
    const trashBefore = state.players[0].trash.length;

    const result = executeActivateEventFromTrash(
      state,
      REIJU_LIKE_ACTION,
      "dummy-source",
      0,
      cardDb,
      new Map<string, EffectResult>(),
      ["evt-trash-1"],
    );

    expect(result.succeeded).toBe(true);
    expect(result.state.players[0].hand.length).toBe(handBefore + 1);
    // Event stays in trash — no state change on zones for the Event itself.
    expect(result.state.players[0].trash.length).toBe(trashBefore);
    expect(result.state.players[0].trash.some((c) => c.instanceId === "evt-trash-1")).toBe(true);
  });

  it("emits EVENT_MAIN_RESOLVED_FROM_TRASH before the nested effect's events", () => {
    const cardDb = createTestCardDb();
    const evtCard = makeEventCard("EVT-CLASS2-ORDER", {
      effectText: "[Main] Draw 1 card.",
      effectSchema: drawEventSchema(1),
    });
    cardDb.set(evtCard.id, evtCard);

    let state = createBattleReadyState(cardDb);
    state = seedEventInTrash(state, 0, "evt-trash-2", evtCard.id);

    const result = executeActivateEventFromTrash(
      state,
      REIJU_LIKE_ACTION,
      "dummy-source",
      0,
      cardDb,
      new Map<string, EffectResult>(),
      ["evt-trash-2"],
    );

    const types = result.events.map((e) => e.type);
    const classIdx = types.indexOf("EVENT_MAIN_RESOLVED_FROM_TRASH");
    const drawIdx = types.indexOf("CARD_DRAWN");
    expect(classIdx).toBeGreaterThanOrEqual(0);
    expect(drawIdx).toBeGreaterThan(classIdx);
  });

  it("class 2 payload carries cardId and cardInstanceId of the trashed Event", () => {
    const cardDb = createTestCardDb();
    const evtCard = makeEventCard("EVT-PAYLOAD", { effectSchema: drawEventSchema(1) });
    cardDb.set(evtCard.id, evtCard);

    let state = createBattleReadyState(cardDb);
    state = seedEventInTrash(state, 0, "evt-trash-3", evtCard.id);

    const result = executeActivateEventFromTrash(
      state,
      REIJU_LIKE_ACTION,
      "dummy-source",
      0,
      cardDb,
      new Map<string, EffectResult>(),
      ["evt-trash-3"],
    );

    const classEvt = result.events.find((e) => e.type === "EVENT_MAIN_RESOLVED_FROM_TRASH");
    expect(classEvt).toBeDefined();
    expect(classEvt!.payload).toMatchObject({
      cardId: evtCard.id,
      cardInstanceId: "evt-trash-3",
    });
  });

  it("excludes Counter-only Events (no MAIN_EVENT block) from valid targets", () => {
    const cardDb = createTestCardDb();
    const counterEvt = makeEventCard("EVT-COUNTER-ONLY", {
      effectText: "[Counter] +2000.",
      effectSchema: counterOnlyEventSchema(),
    });
    cardDb.set(counterEvt.id, counterEvt);

    let state = createBattleReadyState(cardDb);
    state = seedEventInTrash(state, 0, "evt-counter-1", counterEvt.id);

    const result = executeActivateEventFromTrash(
      state,
      REIJU_LIKE_ACTION,
      "dummy-source",
      0,
      cardDb,
      new Map<string, EffectResult>(),
      // Deliberately preselect the counter-only event — the handler must still
      // refuse it because the filter is enforced against the raw list.
      ["evt-counter-1"],
    );

    expect(result.succeeded).toBe(false);
    expect(result.events.some((e) => e.type === "EVENT_MAIN_RESOLVED_FROM_TRASH")).toBe(false);
  });

  it("filters Counter-only Events out of the select-target prompt's validTargets", () => {
    const cardDb = createTestCardDb();
    const evtMain = makeEventCard("EVT-AUTO", { effectSchema: drawEventSchema(1) });
    const evtCounter = makeEventCard("EVT-AUTO-CTR", { effectSchema: counterOnlyEventSchema() });
    cardDb.set(evtMain.id, evtMain);
    cardDb.set(evtCounter.id, evtCounter);

    let state = createBattleReadyState(cardDb);
    state = seedEventInTrash(state, 0, "evt-auto-main", evtMain.id);
    state = seedEventInTrash(state, 0, "evt-auto-ctr", evtCounter.id);

    const result = executeActivateEventFromTrash(
      state,
      REIJU_LIKE_ACTION,
      "dummy-source",
      0,
      cardDb,
      new Map<string, EffectResult>(),
    );

    // Reiju uses `count: { up_to: 1 }`, which always prompts (player can pick 0).
    // The prompt must offer only the [Main]-bearing Event, not the counter-only one.
    expect(result.pendingPrompt).toBeDefined();
    const validTargets = (result.pendingPrompt!.options as { validTargets?: string[] }).validTargets ?? [];
    expect(validTargets).toContain("evt-auto-main");
    expect(validTargets).not.toContain("evt-auto-ctr");
  });

  it("prompts for selection when multiple valid Events sit in trash", () => {
    const cardDb = createTestCardDb();
    const evtA = makeEventCard("EVT-A", { effectSchema: drawEventSchema(1) });
    const evtB = makeEventCard("EVT-B", { effectSchema: drawEventSchema(2) });
    cardDb.set(evtA.id, evtA);
    cardDb.set(evtB.id, evtB);

    let state = createBattleReadyState(cardDb);
    state = seedEventInTrash(state, 0, "evt-opt-a", evtA.id);
    state = seedEventInTrash(state, 0, "evt-opt-b", evtB.id);

    const result = executeActivateEventFromTrash(
      state,
      REIJU_LIKE_ACTION,
      "dummy-source",
      0,
      cardDb,
      new Map<string, EffectResult>(),
    );

    expect(result.succeeded).toBe(false);
    expect(result.pendingPrompt).toBeDefined();
    expect(result.pendingPrompt!.options.promptType).toBe("SELECT_TARGET");
    const validTargets = (result.pendingPrompt!.options as { validTargets?: string[] }).validTargets ?? [];
    expect(validTargets).toContain("evt-opt-a");
    expect(validTargets).toContain("evt-opt-b");
  });

  it("does NOT pay the Event's printed main cost (no DON rest for the Event itself)", () => {
    const cardDb = createTestCardDb();
    // Event costs 7 — if its printed cost were being paid, we'd see donCostArea
    // drop by 7 entries. It must not.
    const evtCard = makeEventCard("EVT-COSTLY", {
      cost: 7,
      effectText: "[Main] Draw 1 card.",
      effectSchema: drawEventSchema(1),
    });
    cardDb.set(evtCard.id, evtCard);

    let state = createBattleReadyState(cardDb);
    state = seedEventInTrash(state, 0, "evt-costly-1", evtCard.id);

    const activeDonBefore = state.players[0].donCostArea.filter((d) => d.state === "ACTIVE").length;

    const result = executeActivateEventFromTrash(
      state,
      REIJU_LIKE_ACTION,
      "dummy-source",
      0,
      cardDb,
      new Map<string, EffectResult>(),
      ["evt-costly-1"],
    );

    expect(result.succeeded).toBe(true);
    const activeDonAfter = result.state.players[0].donCostArea.filter((d) => d.state === "ACTIVE").length;
    expect(activeDonAfter).toBe(activeDonBefore);
  });

  it("returns no event and succeeded=false when no valid Event exists in trash", () => {
    const cardDb = createTestCardDb();
    const state = createBattleReadyState(cardDb);

    const result = executeActivateEventFromTrash(
      state,
      REIJU_LIKE_ACTION,
      "dummy-source",
      0,
      cardDb,
      new Map<string, EffectResult>(),
    );

    expect(result.succeeded).toBe(false);
    expect(result.events.some((e) => e.type === "EVENT_MAIN_RESOLVED_FROM_TRASH")).toBe(false);
  });
});
