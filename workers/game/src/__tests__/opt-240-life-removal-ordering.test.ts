/**
 * OPT-240 D2 — `CARD_REMOVED_FROM_LIFE` ordering vs opponent [Trigger].
 *
 * Per Bandai (OP08-105 Bonney ruling):
 *   1. Attack reaches defender's Life → Life card revealed.
 *   2. Defender may activate [Trigger]. Trigger fully resolves.
 *   3. AFTER Trigger resolution, `CARD_REMOVED_FROM_LIFE` fires.
 *   4. Auto-effects watching that event (Bonney) evaluate against the
 *      post-trigger board state. If the trigger KO'd the watcher, its
 *      effect does NOT fire (on-field check at match time).
 *
 * Prior engine aliased the CustomEventType `CARD_REMOVED_FROM_LIFE` to the
 * narrower `CARD_ADDED_TO_HAND_FROM_LIFE`, so Bonney missed banish + trigger-
 * activated paths. OPT-240 de-aliases and emits the real event at the right
 * point in every life-exit flow.
 */

import { describe, it, expect } from "vitest";
import type {
  CardData,
  CardInstance,
  GameEvent,
  GameEventType,
  GameState,
  LifeCard,
  PlayerState,
} from "../types.js";
import type { EffectSchema } from "../engine/effect-types.js";
import { runPipeline } from "../engine/pipeline.js";
import { registerTriggersForCard } from "../engine/triggers.js";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
  padChars,
} from "./helpers.js";

function findEvents<T extends GameEventType>(
  state: GameState,
  type: T,
): Extract<GameEvent, { type: T }>[] {
  return state.eventLog.filter(
    (e): e is Extract<GameEvent, { type: T }> => e.type === type,
  );
}

// ─── Bonney-style watcher ───────────────────────────────────────────────────

const BONNEY_WATCHER_SCHEMA: EffectSchema = {
  card_id: "TEST-BONNEY",
  card_name: "Test Bonney",
  card_type: "Character",
  effects: [
    {
      id: "bonney-life-watch",
      category: "auto",
      trigger: {
        event: "CARD_REMOVED_FROM_LIFE",
        filter: { controller: "OPPONENT" },
      },
      actions: [{ type: "DRAW", params: { amount: 1 } }],
    },
  ],
};

function makeBonneyWatcher(): CardData {
  return {
    id: "TEST-BONNEY",
    name: "Test Bonney",
    type: "Character",
    color: ["Red"],
    cost: 3,
    power: 4000,
    counter: null,
    life: null,
    attribute: [],
    types: [],
    effectText: "When opp's Life is removed, draw 1.",
    triggerText: null,
    keywords: {
      rush: false,
      rushCharacter: false,
      doubleAttack: false,
      banish: false,
      blocker: false,
      trigger: false,
      unblockable: false,
    },
    effectSchema: BONNEY_WATCHER_SCHEMA,
    imageUrl: null,
  };
}

function bonneyOnField(owner: 0 | 1, suffix: string): CardInstance {
  return {
    instanceId: `bonney-${owner}-${suffix}`,
    cardId: "TEST-BONNEY",
    zone: "CHARACTER",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: 1,
    controller: owner,
    owner,
  };
}

function setupBonneyWithOppLifeCard(
  lifeCard: LifeCard,
  lifeCardData?: CardData,
  extraOppCards: CardInstance[] = [],
): { state: GameState; cardDb: Map<string, CardData>; bonneyId: string } {
  const cardDb = createTestCardDb();
  const watcher = makeBonneyWatcher();
  cardDb.set(watcher.id, watcher);
  if (lifeCardData) cardDb.set(lifeCardData.id, lifeCardData);

  let state = createBattleReadyState(cardDb);
  const bonney = bonneyOnField(0, "w1");

  const newPlayers = [...state.players] as [PlayerState, PlayerState];
  newPlayers[0] = { ...newPlayers[0], characters: padChars([bonney, ...state.players[0].characters.filter(Boolean) as CardInstance[]]) };
  newPlayers[1] = {
    ...newPlayers[1],
    life: [lifeCard, ...newPlayers[1].life.slice(1)],
    characters: padChars([...extraOppCards, ...state.players[1].characters.filter(Boolean) as CardInstance[]]),
  };
  state = { ...state, players: newPlayers };

  state = registerTriggersForCard(state, bonney, watcher);
  for (const c of extraOppCards) {
    const data = cardDb.get(c.cardId);
    if (data) state = registerTriggersForCard(state, c, data);
  }

  return { state, cardDb, bonneyId: bonney.instanceId };
}

function runBattleThroughCounter(
  state: GameState,
  attackerId: string,
  targetId: string,
  cardDb: Map<string, CardData>,
): GameState {
  let result = runPipeline(
    state,
    { type: "DECLARE_ATTACK", attackerInstanceId: attackerId, targetInstanceId: targetId },
    cardDb,
    state.turn.activePlayerIndex,
  );
  expect(result.valid).toBe(true);
  result = runPipeline(result.state, { type: "PASS" }, cardDb, state.turn.activePlayerIndex); // block
  expect(result.valid).toBe(true);
  result = runPipeline(result.state, { type: "PASS" }, cardDb, state.turn.activePlayerIndex); // counter
  expect(result.valid).toBe(true);
  return result.state;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("OPT-240 D2: CARD_REMOVED_FROM_LIFE ordering vs [Trigger]", () => {
  const vanillaLifeCard: LifeCard = {
    instanceId: "life-vanilla-top",
    cardId: CARDS.VANILLA.id,
    faceUp: false,
  };

  it("normal damage path: Bonney fires after life card is removed", () => {
    const { state, cardDb } = setupBonneyWithOppLifeCard(vanillaLifeCard);
    const attacker = state.players[0].leader;
    const target = state.players[1].leader;

    const handBefore = state.players[0].hand.length;
    const finalState = runBattleThroughCounter(state, attacker.instanceId, target.instanceId, cardDb);

    // CARD_REMOVED_FROM_LIFE emitted exactly once
    expect(findEvents(finalState, "CARD_REMOVED_FROM_LIFE").length).toBe(1);
    // Bonney's effect drew a card
    expect(finalState.players[0].hand.length).toBe(handBefore + 1);
  });

  it("normal path: CARD_REMOVED_FROM_LIFE follows CARD_ADDED_TO_HAND_FROM_LIFE in event order", () => {
    const { state, cardDb } = setupBonneyWithOppLifeCard(vanillaLifeCard);
    const attacker = state.players[0].leader;
    const target = state.players[1].leader;

    const finalState = runBattleThroughCounter(state, attacker.instanceId, target.instanceId, cardDb);

    const types = finalState.eventLog.map((e) => e.type);
    const addIdx = types.lastIndexOf("CARD_ADDED_TO_HAND_FROM_LIFE");
    const removeIdx = types.lastIndexOf("CARD_REMOVED_FROM_LIFE");
    expect(addIdx).toBeGreaterThanOrEqual(0);
    expect(removeIdx).toBeGreaterThan(addIdx);
  });

  it("trigger declined: Bonney fires AFTER the decline, not before", () => {
    const triggerLifeCard: LifeCard = {
      instanceId: "life-trigger-decline",
      cardId: CARDS.TRIGGER.id, // keyword: trigger true
      faceUp: false,
    };
    const { state, cardDb } = setupBonneyWithOppLifeCard(triggerLifeCard);
    const attacker = state.players[0].leader;
    const target = state.players[1].leader;

    // Declare attack through Counter — damage step will pause at trigger window
    let result = runPipeline(
      state,
      { type: "DECLARE_ATTACK", attackerInstanceId: attacker.instanceId, targetInstanceId: target.instanceId },
      cardDb,
      0,
    );
    expect(result.valid).toBe(true);
    result = runPipeline(result.state, { type: "PASS" }, cardDb, 0);
    result = runPipeline(result.state, { type: "PASS" }, cardDb, 0);
    expect(result.valid).toBe(true);

    // Trigger window open at damage step
    expect(findEvents(result.state, "TRIGGER_ACTIVATED").length).toBe(1);
    // Before resolving the trigger decision, CARD_REMOVED_FROM_LIFE has NOT fired
    expect(findEvents(result.state, "CARD_REMOVED_FROM_LIFE").length).toBe(0);

    // Decline the trigger through the pipeline so trigger scanning runs.
    const handBefore = result.state.players[0].hand.length;
    const afterDecline = runPipeline(
      result.state,
      { type: "REVEAL_TRIGGER", reveal: false },
      cardDb,
      1, // defender sends the REVEAL_TRIGGER action
    );
    expect(afterDecline.valid).toBe(true);

    // CARD_REMOVED_FROM_LIFE was emitted AFTER CARD_ADDED_TO_HAND_FROM_LIFE.
    const types = afterDecline.state.eventLog.map((e) => e.type);
    const addIdx = types.lastIndexOf("CARD_ADDED_TO_HAND_FROM_LIFE");
    const removeIdx = types.lastIndexOf("CARD_REMOVED_FROM_LIFE");
    expect(addIdx).toBeGreaterThanOrEqual(0);
    expect(removeIdx).toBeGreaterThan(addIdx);

    // Bonney's auto-effect drew a card after the trigger window resolved.
    expect(afterDecline.state.players[0].hand.length).toBe(handBefore + 1);
  });

  it("banish path: Bonney fires — previously missed because CARD_REMOVED_FROM_LIFE wasn't emitted", () => {
    const { state: base, cardDb } = setupBonneyWithOppLifeCard(vanillaLifeCard);

    // Attach banish keyword via an inline attacker card (use CHAR-BANISH).
    // CARDS.BANISH has banish: true. Swap it in as P0's attacker.
    const banisher: CardInstance = {
      instanceId: "char-0-banisher",
      cardId: CARDS.BANISH.id,
      zone: "CHARACTER",
      state: "RESTED", // rested after attack (not required, just realistic)
      attachedDon: [],
      turnPlayed: 1,
      controller: 0,
      owner: 0,
    };
    // Add banisher alongside Bonney. Active state so the attacker can attack.
    const activeBanisher: CardInstance = { ...banisher, state: "ACTIVE" };
    const newChars = padChars([
      ...base.players[0].characters.filter(Boolean) as CardInstance[],
      activeBanisher,
    ]);
    const newPlayers = [...base.players] as [PlayerState, PlayerState];
    newPlayers[0] = { ...newPlayers[0], characters: newChars };
    let state = { ...base, players: newPlayers };

    // Attach 2 DON to banisher (+2000 power) so 3000 + 2000 = 5000 matches leader
    // power. Engine uses attackerPower >= defenderPower, so ties go to attacker.
    const freeDons = state.players[0].donCostArea.filter(d => !d.attachedTo).slice(0, 2);
    const attachedDons = freeDons.map(d => ({
      ...d,
      state: "ACTIVE" as const,
      attachedTo: activeBanisher.instanceId,
    }));
    const freeDonIds = new Set(freeDons.map(d => d.instanceId));
    newPlayers[0] = {
      ...newPlayers[0],
      donCostArea: newPlayers[0].donCostArea.filter(d => !freeDonIds.has(d.instanceId)),
      characters: padChars([
        ...newPlayers[0].characters.filter(c => c && c.instanceId !== activeBanisher.instanceId) as CardInstance[],
        { ...activeBanisher, attachedDon: attachedDons },
      ]),
    };
    state = { ...state, players: newPlayers };

    // Attack the opp leader directly so life removal triggers
    const handBefore = state.players[0].hand.length;
    const attacker = state.players[0].characters.find(c => c?.instanceId === activeBanisher.instanceId)!;
    const finalState = runBattleThroughCounter(state, attacker.instanceId, state.players[1].leader.instanceId, cardDb);

    // Life card was banished (sent to trash, not hand)
    const oppTrash = finalState.players[1].trash;
    expect(oppTrash.some((c) => c.instanceId === vanillaLifeCard.instanceId)).toBe(true);
    // CARD_REMOVED_FROM_LIFE fired
    expect(findEvents(finalState, "CARD_REMOVED_FROM_LIFE").length).toBe(1);
    // Bonney fired
    expect(finalState.players[0].hand.length).toBe(handBefore + 1);
  });

  it("on-field check: Bonney off the field at fire time does not draw", () => {
    const { state: base, cardDb, bonneyId } = setupBonneyWithOppLifeCard(vanillaLifeCard);

    // Pre-trash Bonney so she's not on the field when life is removed.
    const p0 = base.players[0];
    const bonneyCard = p0.characters.find(c => c?.instanceId === bonneyId)!;
    const newPlayers = [...base.players] as [PlayerState, PlayerState];
    newPlayers[0] = {
      ...newPlayers[0],
      characters: padChars(
        (newPlayers[0].characters as (CardInstance | null)[]).filter(
          (c) => c && c.instanceId !== bonneyId,
        ) as CardInstance[],
      ),
      trash: [{ ...bonneyCard, zone: "TRASH" as const }, ...newPlayers[0].trash],
    };
    const state = { ...base, players: newPlayers };

    const handBefore = state.players[0].hand.length;
    const finalState = runBattleThroughCounter(
      state,
      state.players[0].leader.instanceId,
      state.players[1].leader.instanceId,
      cardDb,
    );

    // Life removed event fired
    expect(findEvents(finalState, "CARD_REMOVED_FROM_LIFE").length).toBe(1);
    // Bonney in trash — did NOT draw
    expect(finalState.players[0].hand.length).toBe(handBefore);
  });

});
