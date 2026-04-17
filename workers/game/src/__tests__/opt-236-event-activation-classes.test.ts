/**
 * OPT-236 — C1: Split EVENT_ACTIVATED into three distinct event classes.
 *
 * Per Bandai FAQ rulings, "activating an Event" actually covers three distinct
 * game contexts that different trigger wordings listen for individually:
 *
 *   1. `EVENT_ACTIVATED_FROM_HAND`      — Event [Main] played from hand.
 *   2. `EVENT_MAIN_RESOLVED_FROM_TRASH` — Character activates an Event [Main]
 *                                        sitting in the trash.
 *   3. `EVENT_TRIGGER_RESOLVED`         — Event card's [Trigger] block resolves
 *                                        when revealed from Life.
 *
 * Usopp-style watchers ("when an opponent activates an Event") subscribe to
 * classes 1+2 via a compound `any_of` trigger but MUST NOT fire on class 3,
 * which is a different rules context (trigger reveal, not activation).
 */

import { describe, it, expect } from "vitest";
import { runPipeline } from "../engine/pipeline.js";
import { executeActivateEventFromTrash } from "../engine/effect-resolver/actions/play.js";
import { executeRevealTrigger } from "../engine/battle.js";
import { matchTriggersForEvent, registerTriggersForCard } from "../engine/triggers.js";
import type { EffectResult, EffectSchema } from "../engine/effect-types.js";
import type {
  CardData,
  CardInstance,
  GameEvent,
  GameState,
  LifeCard,
  PlayerState,
} from "../types.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";

// ─── Card / state helpers ───────────────────────────────────────────────────

function makeCharCard(id: string, overrides: Partial<CardData> = {}): CardData {
  return {
    id,
    name: id,
    type: "Character",
    color: ["Red"],
    cost: 3,
    power: 4000,
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

function makeEventCard(id: string, overrides: Partial<CardData> = {}): CardData {
  return {
    id,
    name: id,
    type: "Event",
    color: ["Red"],
    cost: 1,
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

function fieldInstance(cardId: string, owner: 0 | 1, suffix: string): CardInstance {
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

/** Usopp-style schema: draw 1 when opponent activates an Event from hand or trash. */
const USOPP_STYLE_SCHEMA: EffectSchema = {
  effects: [
    {
      id: "draw_on_opp_event_activation",
      category: "auto",
      trigger: {
        any_of: [
          {
            event: "EVENT_ACTIVATED_FROM_HAND",
            filter: { controller: "OPPONENT" },
          },
          {
            event: "EVENT_MAIN_RESOLVED_FROM_TRASH",
            filter: { controller: "OPPONENT" },
          },
        ],
      },
      actions: [{ type: "DRAW", params: { amount: 1 } }],
    },
  ],
};

/** Class-3 watcher: draw 1 when opponent resolves an Event [Trigger] from life. */
const TRIGGER_WATCHER_SCHEMA: EffectSchema = {
  effects: [
    {
      id: "draw_on_opp_trigger_resolved",
      category: "auto",
      trigger: {
        event: "EVENT_TRIGGER_RESOLVED",
        filter: { controller: "OPPONENT" },
      },
      actions: [{ type: "DRAW", params: { amount: 1 } }],
    },
  ],
};

// ─── 1. Emission tests ──────────────────────────────────────────────────────

describe("OPT-236 — event class emission", () => {
  it("class 1: playing an Event from hand emits EVENT_ACTIVATED_FROM_HAND (alongside CARD_PLAYED)", () => {
    const cardDb = createTestCardDb();
    const eventCard = makeEventCard("EVT-CLASS1", {
      cost: 1,
      effectText: "[Main] Draw 1 card.",
      effectSchema: {
        effects: [
          {
            id: "main-event",
            category: "auto",
            trigger: { keyword: "MAIN_EVENT" },
            actions: [{ type: "DRAW", params: { amount: 1 } }],
          },
        ],
      },
    });
    cardDb.set(eventCard.id, eventCard);

    let state = createBattleReadyState(cardDb);
    // Inject the Event card directly into player 0's hand.
    const eventInstance: CardInstance = {
      instanceId: "evt-hand-1",
      cardId: eventCard.id,
      zone: "HAND",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: null,
      controller: 0,
      owner: 0,
    };
    const newPlayers = [...state.players] as [PlayerState, PlayerState];
    newPlayers[0] = { ...newPlayers[0], hand: [eventInstance, ...newPlayers[0].hand] };
    state = { ...state, players: newPlayers };

    const result = runPipeline(state, { type: "PLAY_CARD", cardInstanceId: eventInstance.instanceId }, cardDb, 0);
    expect(result.valid).toBe(true);

    const emitted = result.state.eventLog.map((e) => e.type);
    expect(emitted).toContain("EVENT_ACTIVATED_FROM_HAND");
    expect(emitted).toContain("CARD_PLAYED"); // still emitted for compat with ON_PLAY-style paths
    expect(emitted).not.toContain("EVENT_MAIN_RESOLVED_FROM_TRASH");
    expect(emitted).not.toContain("EVENT_TRIGGER_RESOLVED");
  });

  it("class 2: executeActivateEventFromTrash emits EVENT_MAIN_RESOLVED_FROM_TRASH", () => {
    const cardDb = createTestCardDb();
    const eventCard = makeEventCard("EVT-CLASS2");
    cardDb.set(eventCard.id, eventCard);

    const state = createBattleReadyState(cardDb);

    // Pre-place an Event in player 0's trash.
    const evtInstance: CardInstance = {
      instanceId: "evt-trash-2",
      cardId: eventCard.id,
      zone: "TRASH",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: null,
      controller: 0,
      owner: 0,
    };
    const newPlayers = [...state.players] as [PlayerState, PlayerState];
    newPlayers[0] = { ...newPlayers[0], trash: [evtInstance, ...newPlayers[0].trash] };
    const seeded: GameState = { ...state, players: newPlayers };

    const action = {
      type: "ACTIVATE_EVENT_FROM_TRASH" as const,
      target: {
        type: "CARD_IN_TRASH" as const,
        controller: "SELF" as const,
        count: { exact: 1 },
        filter: { card_type: "EVENT" as const },
      },
    };

    const result = executeActivateEventFromTrash(
      seeded,
      action,
      "dummy-source",
      0,
      cardDb,
      new Map<string, EffectResult>(),
      [evtInstance.instanceId],
    );

    const emitted = result.events.map((e) => e.type);
    expect(emitted).toContain("EVENT_MAIN_RESOLVED_FROM_TRASH");
    expect(emitted).not.toContain("EVENT_ACTIVATED_FROM_HAND");
    expect(emitted).not.toContain("EVENT_TRIGGER_RESOLVED");
  });

  it("class 3: Event [Trigger] revealed from life emits EVENT_TRIGGER_RESOLVED", () => {
    const cardDb = createTestCardDb();
    const triggerEventCard = makeEventCard("EVT-CLASS3", {
      keywords: { rush: false, rushCharacter: false, doubleAttack: false, banish: false, blocker: false, trigger: true, unblockable: false },
    });
    cardDb.set(triggerEventCard.id, triggerEventCard);

    const state = createBattleReadyState(cardDb);

    // Seed the inactive player's battle with a pending trigger life card.
    const lifeCard: LifeCard = {
      instanceId: "life-trigger-3",
      cardId: triggerEventCard.id,
      faceUp: true,
    };
    const newPlayers = [...state.players] as [PlayerState, PlayerState];
    // player 1 is the inactive player when player 0 is active — push life card there.
    newPlayers[1] = { ...newPlayers[1], life: [lifeCard, ...newPlayers[1].life] };
    const withLife: GameState = {
      ...state,
      players: newPlayers,
      turn: {
        ...state.turn,
        battle: {
          attackerInstanceId: state.players[0].leader.instanceId,
          targetInstanceId: state.players[1].leader.instanceId,
          initialPower: 5000,
          currentPower: 5000,
          counters: [],
          blockerActivated: false,
          pendingTriggerLifeCard: lifeCard,
        } as NonNullable<GameState["turn"]["battle"]>,
      },
    };

    const result = executeRevealTrigger(withLife, true, cardDb);

    const emitted = result.events.map((e) => e.type);
    expect(emitted).toContain("TRIGGER_ACTIVATED");
    expect(emitted).toContain("EVENT_TRIGGER_RESOLVED");
    expect(emitted).not.toContain("EVENT_ACTIVATED_FROM_HAND");
    expect(emitted).not.toContain("EVENT_MAIN_RESOLVED_FROM_TRASH");
  });

  it("class 3 does NOT emit when the trigger card is a Character (not an Event)", () => {
    const cardDb = createTestCardDb();
    // VANILLA is a Character; trigger-activated reveal shouldn't publish class 3.
    const lifeCard: LifeCard = {
      instanceId: "life-char",
      cardId: CARDS.VANILLA.id,
      faceUp: true,
    };

    const state = createBattleReadyState(cardDb);
    const newPlayers = [...state.players] as [PlayerState, PlayerState];
    newPlayers[1] = { ...newPlayers[1], life: [lifeCard, ...newPlayers[1].life] };
    const withLife: GameState = {
      ...state,
      players: newPlayers,
      turn: {
        ...state.turn,
        battle: {
          attackerInstanceId: state.players[0].leader.instanceId,
          targetInstanceId: state.players[1].leader.instanceId,
          initialPower: 5000,
          currentPower: 5000,
          counters: [],
          blockerActivated: false,
          pendingTriggerLifeCard: lifeCard,
        } as NonNullable<GameState["turn"]["battle"]>,
      },
    };

    const result = executeRevealTrigger(withLife, true, cardDb);
    const emitted = result.events.map((e) => e.type);
    expect(emitted).toContain("TRIGGER_ACTIVATED");
    expect(emitted).not.toContain("EVENT_TRIGGER_RESOLVED");
  });
});

// ─── 2. Trigger-matching isolation tests ────────────────────────────────────

describe("OPT-236 — Usopp-style watcher fires on classes 1+2 but NOT class 3", () => {
  function installUsoppWatcher(cardDb: Map<string, CardData>) {
    const watcherCard = makeCharCard("USOPP-STYLE", { effectSchema: USOPP_STYLE_SCHEMA });
    cardDb.set(watcherCard.id, watcherCard);

    const base = createBattleReadyState(cardDb);
    const watcherInst = fieldInstance(watcherCard.id, 0, "usopp");
    const newPlayers = [...base.players] as [PlayerState, PlayerState];
    newPlayers[0] = { ...newPlayers[0], characters: padChars([watcherInst]) };
    let state: GameState = { ...base, players: newPlayers };
    state = registerTriggersForCard(state, watcherInst, watcherCard);
    return { state, watcherInst };
  }

  it("fires on class 1 (EVENT_ACTIVATED_FROM_HAND) from opponent", () => {
    const cardDb = createTestCardDb();
    const { state, watcherInst } = installUsoppWatcher(cardDb);

    const event: GameEvent = {
      type: "EVENT_ACTIVATED_FROM_HAND",
      playerIndex: 1, // opponent
      payload: { cardId: "evt", cardInstanceId: "evt-hand" },
    };
    const matched = matchTriggersForEvent(state, event, cardDb);
    expect(matched.some((m) => m.trigger.sourceCardInstanceId === watcherInst.instanceId)).toBe(true);
  });

  it("fires on class 2 (EVENT_MAIN_RESOLVED_FROM_TRASH) from opponent", () => {
    const cardDb = createTestCardDb();
    const { state, watcherInst } = installUsoppWatcher(cardDb);

    const event: GameEvent = {
      type: "EVENT_MAIN_RESOLVED_FROM_TRASH",
      playerIndex: 1,
      payload: { cardId: "evt", cardInstanceId: "evt-trash" },
    };
    const matched = matchTriggersForEvent(state, event, cardDb);
    expect(matched.some((m) => m.trigger.sourceCardInstanceId === watcherInst.instanceId)).toBe(true);
  });

  it("does NOT fire on class 3 (EVENT_TRIGGER_RESOLVED) from opponent", () => {
    const cardDb = createTestCardDb();
    const { state, watcherInst } = installUsoppWatcher(cardDb);

    const event: GameEvent = {
      type: "EVENT_TRIGGER_RESOLVED",
      playerIndex: 1,
      payload: { cardId: "evt", cardInstanceId: "evt-life" },
    };
    const matched = matchTriggersForEvent(state, event, cardDb);
    expect(matched.some((m) => m.trigger.sourceCardInstanceId === watcherInst.instanceId)).toBe(false);
  });

  it("does NOT fire on class 1 from self (controller: OPPONENT filter)", () => {
    const cardDb = createTestCardDb();
    const { state, watcherInst } = installUsoppWatcher(cardDb);

    const event: GameEvent = {
      type: "EVENT_ACTIVATED_FROM_HAND",
      playerIndex: 0, // same as watcher's controller
      payload: { cardId: "evt", cardInstanceId: "evt-hand" },
    };
    const matched = matchTriggersForEvent(state, event, cardDb);
    expect(matched.some((m) => m.trigger.sourceCardInstanceId === watcherInst.instanceId)).toBe(false);
  });

  it("does NOT fire on CARD_PLAYED for a Character (distinct event type)", () => {
    const cardDb = createTestCardDb();
    const { state, watcherInst } = installUsoppWatcher(cardDb);

    // Plain Character play emits CARD_PLAYED only — class-1 watchers should ignore it.
    const event: GameEvent = {
      type: "CARD_PLAYED",
      playerIndex: 1,
      payload: { cardId: "char", cardInstanceId: "char-x", zone: "CHARACTER", source: "FROM_HAND" },
    };
    const matched = matchTriggersForEvent(state, event, cardDb);
    expect(matched.some((m) => m.trigger.sourceCardInstanceId === watcherInst.instanceId)).toBe(false);
  });
});

describe("OPT-236 — class-3 watcher fires only on EVENT_TRIGGER_RESOLVED", () => {
  function installTriggerWatcher(cardDb: Map<string, CardData>) {
    const watcherCard = makeCharCard("TRIG-WATCHER", { effectSchema: TRIGGER_WATCHER_SCHEMA });
    cardDb.set(watcherCard.id, watcherCard);

    const base = createBattleReadyState(cardDb);
    const watcherInst = fieldInstance(watcherCard.id, 0, "tw");
    const newPlayers = [...base.players] as [PlayerState, PlayerState];
    newPlayers[0] = { ...newPlayers[0], characters: padChars([watcherInst]) };
    let state: GameState = { ...base, players: newPlayers };
    state = registerTriggersForCard(state, watcherInst, watcherCard);
    return { state, watcherInst };
  }

  it("fires on class 3", () => {
    const cardDb = createTestCardDb();
    const { state, watcherInst } = installTriggerWatcher(cardDb);

    const event: GameEvent = {
      type: "EVENT_TRIGGER_RESOLVED",
      playerIndex: 1,
      payload: { cardId: "evt", cardInstanceId: "evt-life" },
    };
    const matched = matchTriggersForEvent(state, event, cardDb);
    expect(matched.some((m) => m.trigger.sourceCardInstanceId === watcherInst.instanceId)).toBe(true);
  });

  it("does NOT fire on class 1 or class 2", () => {
    const cardDb = createTestCardDb();
    const { state, watcherInst } = installTriggerWatcher(cardDb);

    for (const type of ["EVENT_ACTIVATED_FROM_HAND", "EVENT_MAIN_RESOLVED_FROM_TRASH"] as const) {
      const event = {
        type,
        playerIndex: 1 as 0 | 1,
        payload: { cardId: "evt", cardInstanceId: "x" },
      } as GameEvent;
      const matched = matchTriggersForEvent(state, event, cardDb);
      expect(matched.some((m) => m.trigger.sourceCardInstanceId === watcherInst.instanceId)).toBe(false);
    }
  });
});
