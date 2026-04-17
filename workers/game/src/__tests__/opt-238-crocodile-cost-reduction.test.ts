/**
 * OPT-238 — C3: Event cost-reduction once-per-turn semantics (OP01-062 Crocodile).
 *
 * Bandai ruling: OP01-062 Crocodile Leader's "when you play an Event" draw
 * trigger only fires when that Event's cost was reduced by an effect. It is
 * once per turn, and the slot re-arms only when the cost-reduction condition
 * is re-met — a full-cost play does NOT consume the trigger.
 *
 * Wiring verified here:
 *   • `EVENT_ACTIVATED_FROM_HAND` event payload now carries `costReducedAmount`
 *   • `EventFilter.cost_reduced` gates the trigger on that payload
 *   • Crocodile's trigger narrowly matches class 1 only (not class 2 from trash)
 *   • `don_requirement: 1` still gates registration activation
 *   • `flags.once_per_turn` blocks re-fire until the turn resets
 */

import { describe, it, expect } from "vitest";
import { OP01_062_CROCODILE } from "../engine/schemas/op01.js";
import { matchTriggersForEvent, registerTriggersForCard } from "../engine/triggers.js";
import type { CardData, CardInstance, DonInstance, GameEvent, GameState, PlayerState } from "../types.js";
import { createBattleReadyState, createTestCardDb } from "./helpers.js";

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeCrocodileLeaderCard(): CardData {
  return {
    id: "OP01-062",
    name: "Crocodile",
    type: "Leader",
    color: ["Blue"],
    cost: null,
    power: 5000,
    counter: null,
    life: 5,
    attribute: ["Special"],
    types: ["Baroque Works"],
    effectText: "[DON!! x1] Once per turn, when you play an Event whose cost was reduced by an effect, you may draw 1 card if you have 4 or less cards in your hand.",
    triggerText: null,
    keywords: { rush: false, rushCharacter: false, doubleAttack: false, banish: false, blocker: false, trigger: false, unblockable: false },
    effectSchema: OP01_062_CROCODILE,
    imageUrl: null,
  };
}

/**
 * Install Crocodile as player 0's Leader and register its trigger. Attaches one
 * DON to satisfy the block's `don_requirement: 1` by default.
 */
function installCrocodile(
  cardDb: Map<string, CardData>,
  opts: { attachDon?: boolean; oncePerTurnUsed?: boolean } = {},
) {
  const { attachDon = true, oncePerTurnUsed = false } = opts;

  const crocCard = makeCrocodileLeaderCard();
  cardDb.set(crocCard.id, crocCard);

  const base = createBattleReadyState(cardDb);

  const donInstance: DonInstance | null = attachDon
    ? { instanceId: "don-croc-1", state: "ACTIVE", attachedTo: null }
    : null;

  const crocLeader: CardInstance = {
    ...base.players[0].leader,
    cardId: crocCard.id,
    attachedDon: donInstance ? [donInstance] : [],
  };

  const newPlayers = [...base.players] as [PlayerState, PlayerState];
  newPlayers[0] = {
    ...newPlayers[0],
    leader: crocLeader,
    // Keep hand ≤ 4 so HAND_COUNT condition would pass if this got to resolve.
    hand: newPlayers[0].hand.slice(0, 3),
  };

  let state: GameState = { ...base, players: newPlayers };
  state = registerTriggersForCard(state, crocLeader, crocCard);

  if (oncePerTurnUsed) {
    state = {
      ...state,
      turn: {
        ...state.turn,
        oncePerTurnUsed: {
          ...state.turn.oncePerTurnUsed,
          "OP01-062_event_draw": [crocLeader.instanceId],
        },
      },
    };
  }

  return { state, crocLeader };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("OPT-238 — Crocodile fires only on cost-reduced Event activations", () => {
  it("fires when a SELF Event is activated from hand with costReducedAmount > 0", () => {
    const cardDb = createTestCardDb();
    const { state, crocLeader } = installCrocodile(cardDb);

    const event: GameEvent = {
      type: "EVENT_ACTIVATED_FROM_HAND",
      playerIndex: 0,
      payload: { cardId: "EVT-X", cardInstanceId: "evt-hand-1", costReducedAmount: 1 },
    };

    const matched = matchTriggersForEvent(state, event, cardDb);
    expect(matched.some((m) => m.trigger.sourceCardInstanceId === crocLeader.instanceId)).toBe(true);
  });

  it("does NOT fire when the Event was played at full printed cost (costReducedAmount = 0)", () => {
    const cardDb = createTestCardDb();
    const { state, crocLeader } = installCrocodile(cardDb);

    const event: GameEvent = {
      type: "EVENT_ACTIVATED_FROM_HAND",
      playerIndex: 0,
      payload: { cardId: "EVT-X", cardInstanceId: "evt-hand-1", costReducedAmount: 0 },
    };

    const matched = matchTriggersForEvent(state, event, cardDb);
    expect(matched.some((m) => m.trigger.sourceCardInstanceId === crocLeader.instanceId)).toBe(false);
  });

  it("does NOT fire when costReducedAmount is missing from the payload", () => {
    const cardDb = createTestCardDb();
    const { state, crocLeader } = installCrocodile(cardDb);

    // Simulates a legacy emission that never populated the field; filter must
    // fail-closed (treat undefined as no reduction).
    const event: GameEvent = {
      type: "EVENT_ACTIVATED_FROM_HAND",
      playerIndex: 0,
      payload: { cardId: "EVT-X", cardInstanceId: "evt-hand-1" },
    };

    const matched = matchTriggersForEvent(state, event, cardDb);
    expect(matched.some((m) => m.trigger.sourceCardInstanceId === crocLeader.instanceId)).toBe(false);
  });

  it("does NOT fire on opponent-activated Events (controller: SELF)", () => {
    const cardDb = createTestCardDb();
    const { state, crocLeader } = installCrocodile(cardDb);

    const event: GameEvent = {
      type: "EVENT_ACTIVATED_FROM_HAND",
      playerIndex: 1,
      payload: { cardId: "EVT-X", cardInstanceId: "evt-hand-1", costReducedAmount: 2 },
    };

    const matched = matchTriggersForEvent(state, event, cardDb);
    expect(matched.some((m) => m.trigger.sourceCardInstanceId === crocLeader.instanceId)).toBe(false);
  });

  it("does NOT fire on class-2 activations (EVENT_MAIN_RESOLVED_FROM_TRASH) — no cost paid", () => {
    const cardDb = createTestCardDb();
    const { state, crocLeader } = installCrocodile(cardDb);

    const event: GameEvent = {
      type: "EVENT_MAIN_RESOLVED_FROM_TRASH",
      playerIndex: 0,
      payload: { cardId: "EVT-X", cardInstanceId: "evt-trash-1" },
    };

    const matched = matchTriggersForEvent(state, event, cardDb);
    expect(matched.some((m) => m.trigger.sourceCardInstanceId === crocLeader.instanceId)).toBe(false);
  });

  it("does NOT fire when DON!!×1 is not attached to the Leader", () => {
    const cardDb = createTestCardDb();
    const { state, crocLeader } = installCrocodile(cardDb, { attachDon: false });

    const event: GameEvent = {
      type: "EVENT_ACTIVATED_FROM_HAND",
      playerIndex: 0,
      payload: { cardId: "EVT-X", cardInstanceId: "evt-hand-1", costReducedAmount: 3 },
    };

    const matched = matchTriggersForEvent(state, event, cardDb);
    expect(matched.some((m) => m.trigger.sourceCardInstanceId === crocLeader.instanceId)).toBe(false);
  });

  it("does NOT fire again once the block's once-per-turn slot is used this turn", () => {
    const cardDb = createTestCardDb();
    const { state, crocLeader } = installCrocodile(cardDb, { oncePerTurnUsed: true });

    const event: GameEvent = {
      type: "EVENT_ACTIVATED_FROM_HAND",
      playerIndex: 0,
      payload: { cardId: "EVT-X", cardInstanceId: "evt-hand-2", costReducedAmount: 2 },
    };

    const matched = matchTriggersForEvent(state, event, cardDb);
    expect(matched.some((m) => m.trigger.sourceCardInstanceId === crocLeader.instanceId)).toBe(false);
  });

  it("re-arms for next turn after oncePerTurnUsed is cleared", () => {
    // Phases.ts resets oncePerTurnUsed to {} at turn start, so emulating that
    // reset should return the trigger to the matching state.
    const cardDb = createTestCardDb();
    const { state: used, crocLeader } = installCrocodile(cardDb, { oncePerTurnUsed: true });

    const reset: GameState = {
      ...used,
      turn: {
        ...used.turn,
        number: used.turn.number + 2,
        oncePerTurnUsed: {},
      },
    };

    const event: GameEvent = {
      type: "EVENT_ACTIVATED_FROM_HAND",
      playerIndex: 0,
      payload: { cardId: "EVT-X", cardInstanceId: "evt-hand-3", costReducedAmount: 1 },
    };

    const matched = matchTriggersForEvent(reset, event, cardDb);
    expect(matched.some((m) => m.trigger.sourceCardInstanceId === crocLeader.instanceId)).toBe(true);
  });
});
