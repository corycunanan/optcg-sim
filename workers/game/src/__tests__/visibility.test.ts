/**
 * Tests for secret zone filtering (§8-4-5).
 *
 * Ensures filterStateForPlayer() strips opponent's hand/deck card identities
 * and face-down life cards, while leaving the player's own zones and all
 * public zones intact.
 */

import { describe, it, expect } from "vitest";
import {
  filterStateForPlayer,
  obfuscatePlayersDecksAndFaceDownLife,
} from "../engine/state.js";
import { hasRuntimeKeyword } from "../../../../shared/effective-keyword.js";
import { hasGrantedKeyword } from "../engine/modifiers.js";
import { OP13_099_THE_EMPTY_THRONE } from "../engine/schemas/op13.js";
import { OP11_046_VINSMOKE_YONJI } from "../engine/schemas/op11.js";
import type {
  EffectSchema,
  RuntimeActiveEffect,
} from "../engine/effect-types.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { registerPermanentEffectsForCard } from "../engine/triggers.js";
import {
  visibleStateForPlayer,
  visibleStateForSpectator,
} from "../session/visibility.js";
import type { CardData, CardInstance, PlayerState } from "../types.js";
import {
  CARDS,
  setupGame,
  advanceToPhase,
  createBattleReadyState,
  createTestCardDb,
} from "./factories.js";

function fieldPowerState() {
  const cardDb = createTestCardDb();
  const throneData: CardData = {
    ...CARDS.STAGE,
    id: "OP13-099",
    name: "The Empty Throne",
    effectSchema: OP13_099_THE_EMPTY_THRONE,
  };
  cardDb.set(throneData.id, throneData);

  let state = createBattleReadyState(cardDb);
  const throne: CardInstance = {
    instanceId: "opt744-empty-throne",
    cardId: throneData.id,
    zone: "STAGE",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: 1,
    controller: 0,
    owner: 0,
  };
  const character = state.players[0].characters[0]!;
  const attachedDon = (card: CardInstance, prefix: string) =>
    [0, 1].map((index) => ({
      instanceId: `opt744-${prefix}-don-${index}`,
      state: "RESTED" as const,
      attachedTo: card.instanceId,
    }));
  const attachedCharacter: CardInstance = {
    ...character,
    attachedDon: attachedDon(character, "character"),
  };
  const trash = Array.from(
    { length: 22 },
    (_, index): CardInstance => ({
      instanceId: `opt744-trash-${index}`,
      cardId: CARDS.VANILLA.id,
      zone: "TRASH",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 1,
      controller: 0,
      owner: 0,
    })
  );
  const players = [...state.players] as [PlayerState, PlayerState];
  players[0] = {
    ...players[0],
    leader: {
      ...players[0].leader,
      attachedDon: attachedDon(players[0].leader, "leader"),
    },
    stage: throne,
    trash,
    characters: [attachedCharacter, ...players[0].characters.slice(1)],
  };
  state = {
    ...state,
    players,
    turn: { ...state.turn, activePlayerIndex: 0 },
  };
  state = registerPermanentEffectsForCard(state, throne, throneData);

  return { state, cardDb };
}

function saldeathAuraState({
  fieldTargetName = "Blugori",
  includeHiddenBlugori = false,
}: {
  fieldTargetName?: string;
  includeHiddenBlugori?: boolean;
} = {}) {
  const cardDb = createTestCardDb();
  const saldeathSchema = getEffectSchema("OP02-074");
  if (!saldeathSchema) throw new Error("Missing generated OP02-074 schema");

  const saldeathData: CardData = {
    ...CARDS.VANILLA,
    id: "OP02-074",
    name: "Saldeath",
    effectSchema: saldeathSchema,
  };
  const fieldTargetData: CardData = {
    ...CARDS.VANILLA,
    id: "TEST-FIELD-AURA-TARGET",
    name: fieldTargetName,
  };
  const hiddenTargetData: CardData = {
    ...CARDS.VANILLA,
    id: "TEST-HIDDEN-BLUGORI",
    name: "Blugori",
  };
  for (const data of [saldeathData, fieldTargetData, hiddenTargetData]) {
    cardDb.set(data.id, data);
  }

  let state = createBattleReadyState(cardDb);
  const saldeath: CardInstance = {
    ...state.players[0].characters[0]!,
    instanceId: "saldeath-source",
    cardId: saldeathData.id,
  };
  const fieldTarget: CardInstance = {
    ...state.players[0].characters[1]!,
    instanceId: "field-aura-target",
    cardId: fieldTargetData.id,
  };
  const hiddenTarget: CardInstance = {
    ...state.players[0].hand[0],
    instanceId: "hidden-blugori-target",
    cardId: hiddenTargetData.id,
  };
  const players = [...state.players] as [PlayerState, PlayerState];
  players[0] = {
    ...players[0],
    characters: [saldeath, fieldTarget, null, null, null],
    hand: includeHiddenBlugori ? [hiddenTarget] : players[0].hand,
  };
  state = registerPermanentEffectsForCard(
    { ...state, players },
    saldeath,
    saldeathData
  );

  return { state, cardDb, fieldTarget, hiddenTarget };
}

describe("filterStateForPlayer", () => {
  function getMainPhaseState() {
    const { state, cardDb } = setupGame();
    return advanceToPhase(state, "MAIN", cardDb);
  }

  it("preserves the receiving player's own hand card identities", () => {
    const state = getMainPhaseState();
    const filtered = filterStateForPlayer(state, 0);

    // Player 0's hand should be untouched
    for (const card of filtered.players[0].hand) {
      expect(card.cardId).not.toBe("hidden");
    }
  });

  it("derives unique deck and face-down Life placeholders for both players", () => {
    const state = getMainPhaseState();
    const players = obfuscatePlayersDecksAndFaceDownLife(state.players);
    const hiddenInstanceIds = players.flatMap((player) => [
      ...player.deck.map((card) => card.instanceId),
      ...player.life
        .filter((card) => card.face === "DOWN")
        .map((card) => card.instanceId),
    ]);

    expect(new Set(hiddenInstanceIds).size).toBe(hiddenInstanceIds.length);
    expect(players[0].deck[0]?.instanceId).toMatch(/^hidden-0-deck-/);
    expect(players[1].deck[0]?.instanceId).toMatch(/^hidden-1-deck-/);
  });

  it("redacts deterministic execution secrets from both player views", () => {
    const state = getMainPhaseState();
    const original = state.executionContext;

    for (const receivingPlayer of [0, 1] as const) {
      const filtered = filterStateForPlayer(state, receivingPlayer);
      expect(filtered.executionContext).toEqual({
        version: 1,
        seed: "redacted",
        rngState: 0,
        idCounter: 0,
        clockEpochMs: 0,
        clockCounter: 0,
        actionBudget: { limit: 0, consumed: 0 },
        trace: { gameId: state.id, traceId: "redacted" },
      });
      expect(filtered.executionContext.seed).not.toBe(original.seed);
      expect(filtered.executionContext.rngState).not.toBe(original.rngState);
    }
  });

  it("obfuscates opponent hand card identities", () => {
    const state = getMainPhaseState();
    const filtered = filterStateForPlayer(state, 0);

    // Player 1's hand cards should be hidden
    expect(filtered.players[1].hand.length).toBe(state.players[1].hand.length);
    for (const card of filtered.players[1].hand) {
      expect(card.cardId).toBe("hidden");
    }
  });

  it("obfuscates opponent deck card identities", () => {
    const state = getMainPhaseState();
    const filtered = filterStateForPlayer(state, 0);

    expect(filtered.players[1].deck.length).toBe(state.players[1].deck.length);
    for (const card of filtered.players[1].deck) {
      expect(card.cardId).toBe("hidden");
    }
  });

  it("preserves the receiving player's own deck", () => {
    const state = getMainPhaseState();
    const filtered = filterStateForPlayer(state, 0);

    for (let i = 0; i < state.players[0].deck.length; i++) {
      expect(filtered.players[0].deck[i].cardId).toBe(
        state.players[0].deck[i].cardId
      );
    }
  });

  it("obfuscates opponent face-down life cards", () => {
    const state = getMainPhaseState();
    const filtered = filterStateForPlayer(state, 0);

    for (const lc of filtered.players[1].life) {
      if (lc.face === "DOWN") {
        expect(lc.cardId).toBe("hidden");
      }
    }
  });

  it("preserves opponent face-up life cards", () => {
    // Manually set a life card face-up
    const state = getMainPhaseState();
    if (state.players[1].life.length > 0) {
      const modified = {
        ...state,
        players: [...state.players] as [
          (typeof state.players)[0],
          (typeof state.players)[1],
        ],
      };
      modified.players[1] = {
        ...modified.players[1],
        life: modified.players[1].life.map((lc, i) =>
          i === 0 ? { ...lc, face: "UP" as const } : lc
        ),
      };

      const filtered = filterStateForPlayer(modified, 0);
      const faceUpCards = filtered.players[1].life.filter(
        (lc) => lc.face === "UP"
      );
      expect(faceUpCards.length).toBeGreaterThan(0);
      for (const lc of faceUpCards) {
        expect(lc.cardId).not.toBe("hidden");
      }
    }
  });

  it("leaves public zones untouched (leader, characters, trash, stage)", () => {
    const state = getMainPhaseState();
    const filtered = filterStateForPlayer(state, 0);

    // Opponent's leader should be fully visible
    expect(filtered.players[1].leader.cardId).toBe(
      state.players[1].leader.cardId
    );

    // Opponent's trash should be fully visible
    expect(filtered.players[1].trash).toEqual(state.players[1].trash);

    // Characters
    expect(filtered.players[1].characters).toEqual(state.players[1].characters);
  });

  it("preserves hand card count (for UI placeholder rendering)", () => {
    const state = getMainPhaseState();
    const filtered0 = filterStateForPlayer(state, 0);
    const filtered1 = filterStateForPlayer(state, 1);

    expect(filtered0.players[1].hand.length).toBe(state.players[1].hand.length);
    expect(filtered1.players[0].hand.length).toBe(state.players[0].hand.length);
  });

  it("is symmetric — each player sees their own data and hides the opponent's", () => {
    const state = getMainPhaseState();
    const view0 = filterStateForPlayer(state, 0);
    const view1 = filterStateForPlayer(state, 1);

    // Player 0's view: own hand visible, opponent hidden
    expect(view0.players[0].hand[0]?.cardId).not.toBe("hidden");
    expect(view0.players[1].hand[0]?.cardId).toBe("hidden");

    // Player 1's view: own hand visible, opponent hidden
    expect(view1.players[1].hand[0]?.cardId).not.toBe("hidden");
    expect(view1.players[0].hand[0]?.cardId).toBe("hidden");
  });

  it("strips cardId from opponent CARD_DRAWN events in eventLog", () => {
    const state = getMainPhaseState();

    // The DRAW phase auto-advances, so eventLog should have CARD_DRAWN events.
    // Add a synthetic one to be sure.
    const stateWithDrawEvent = {
      ...state,
      eventLog: [
        ...state.eventLog,
        {
          type: "CARD_DRAWN" as const,
          playerIndex: 1 as const,
          payload: { cardId: "SECRET-CARD", cardInstanceId: "inst-123" },
          timestamp: Date.now(),
        },
      ],
    };

    const filtered = filterStateForPlayer(stateWithDrawEvent, 0);
    const opponentDrawEvents = filtered.eventLog.filter(
      (e) => e.type === "CARD_DRAWN" && e.playerIndex === 1
    );

    for (const event of opponentDrawEvents) {
      if (event.type === "CARD_DRAWN") {
        expect(event.payload.cardId).toBe("hidden");
        expect(event.payload.cardInstanceId).toBe("hidden");
      }
    }
  });

  it("preserves cardId in the player's own CARD_DRAWN events", () => {
    const state = getMainPhaseState();
    const stateWithDrawEvent = {
      ...state,
      eventLog: [
        ...state.eventLog,
        {
          type: "CARD_DRAWN" as const,
          playerIndex: 0 as const,
          payload: { cardId: "MY-CARD", cardInstanceId: "inst-456" },
          timestamp: Date.now(),
        },
      ],
    };

    const filtered = filterStateForPlayer(stateWithDrawEvent, 0);
    const myDrawEvents = filtered.eventLog.filter(
      (e) => e.type === "CARD_DRAWN" && e.playerIndex === 0
    );

    // Own events should keep cardId
    const lastDraw = myDrawEvents[myDrawEvents.length - 1];
    if (lastDraw.type === "CARD_DRAWN") {
      expect(lastDraw.payload.cardId).toBe("MY-CARD");
    }
  });

  it("strips pendingPrompt for the non-responding player", () => {
    const state = getMainPhaseState();

    // Simulate a prompt directed at player 1 (e.g., opponent must trash from hand)
    const stateWithPrompt = {
      ...state,
      pendingPrompt: {
        options: {
          promptType: "SELECT_TARGET" as const,
          validTargets: ["inst-a", "inst-b"],
          countMin: 1,
          countMax: 1,
          effectDescription: "Choose 1 card(s) to trash from hand",
          ctaLabel: "Trash",
          cards: state.players[1].hand.slice(0, 2), // opponent hand cards with real cardIds
        },
        respondingPlayer: 1 as const,
        resumeContext: "test-frame",
      },
    };

    // Player 0 (non-responding) should NOT see the prompt
    const view0 = filterStateForPlayer(stateWithPrompt, 0);
    expect(view0.pendingPrompt).toBeNull();

    // Player 1 (responding) SHOULD see the prompt with their own cards
    const view1 = filterStateForPlayer(stateWithPrompt, 1);
    expect(view1.pendingPrompt).not.toBeNull();
    expect(view1.pendingPrompt!.options.promptType).toBe("SELECT_TARGET");
    if (view1.pendingPrompt!.options.promptType === "SELECT_TARGET") {
      // Cards should have real cardIds since it's the responding player's own hand
      for (const card of view1.pendingPrompt!.options.cards) {
        expect(card.cardId).not.toBe("hidden");
      }
    }
  });
});

describe("visible field power", () => {
  it("publishes canonical power to both players and spectators without decorating hidden zones", () => {
    const { state, cardDb } = fieldPowerState();
    const ownLeaderBase = cardDb.get(state.players[0].leader.cardId)!.power!;
    const opponentLeaderBase = cardDb.get(
      state.players[1].leader.cardId
    )!.power!;
    const characterBase = cardDb.get(
      state.players[0].characters[0]!.cardId
    )!.power!;

    for (const visible of [
      visibleStateForPlayer(state, cardDb, 0),
      visibleStateForPlayer(state, cardDb, 1),
      visibleStateForSpectator(state, cardDb),
    ]) {
      const ownLeader = visible.players[0].leader;
      const opponentLeader = visible.players[1].leader;
      const character = visible.players[0].characters[0]!;

      expect(ownLeader.basePower).toBe(ownLeaderBase);
      expect(ownLeader.effectivePower).toBe(ownLeaderBase + 3000);
      expect(ownLeader.powerDelta).toBe(1000);
      expect(opponentLeader.basePower).toBe(opponentLeaderBase);
      expect(opponentLeader.effectivePower).toBe(opponentLeaderBase);
      expect(opponentLeader.powerDelta).toBe(0);
      expect(character.basePower).toBe(characterBase);
      expect(character.effectivePower).toBe(characterBase + 2000);
      expect(character.powerDelta).toBe(0);

      for (const hiddenZoneCard of [
        ...visible.players[0].hand,
        ...visible.players[0].deck,
        ...visible.players[0].trash,
        ...visible.players[0].removedFromGame,
      ]) {
        expect(hiddenZoneCard.basePower).toBeUndefined();
        expect(hiddenZoneCard.effectivePower).toBeUndefined();
        expect(hiddenZoneCard.powerDelta).toBeUndefined();
      }
      expect(visible.players[0].stage?.basePower).toBeUndefined();
      expect(visible.players[0].stage?.effectivePower).toBeUndefined();
      expect(visible.players[0].stage?.powerDelta).toBeUndefined();
      for (const lifeCard of visible.players[0].life) {
        expect("basePower" in lifeCard).toBe(false);
        expect("effectivePower" in lifeCard).toBe(false);
      }
    }

    const opponentTurn = {
      ...state,
      turn: { ...state.turn, activePlayerIndex: 1 as const },
    };
    const opponentTurnView = visibleStateForPlayer(opponentTurn, cardDb, 0);
    const opponentTurnLeader = opponentTurnView.players[0].leader;
    const opponentTurnCharacter = opponentTurnView.players[0].characters[0]!;

    expect(opponentTurnLeader.effectivePower).toBe(ownLeaderBase);
    expect(opponentTurnLeader.powerDelta).toBe(0);
    expect(opponentTurnCharacter.effectivePower).toBe(characterBase);
    expect(opponentTurnCharacter.powerDelta).toBe(0);
  });

  it("evaluates hidden-zone modifier conditions against authoritative state", () => {
    const cardDb = createTestCardDb();
    const state = createBattleReadyState(cardDb);
    const hiddenHandCharacter: CardInstance = {
      instanceId: "opt744-hidden-hand-character",
      cardId: CARDS.VANILLA.id,
      zone: "HAND",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: null,
      controller: 0,
      owner: 0,
    };
    const hiddenHandEffect: RuntimeActiveEffect = {
      id: "opt744-hidden-hand-power",
      sourceCardInstanceId: state.players[0].leader.instanceId,
      sourceEffectBlockId: "opt744-hidden-hand-power",
      category: "permanent",
      modifiers: [
        {
          type: "MODIFY_POWER",
          target: { type: "YOUR_LEADER" },
          params: { amount: 1000 },
        },
      ],
      conditions: {
        type: "CARD_TYPE_IN_ZONE",
        controller: "SELF",
        card_type: "CHARACTER",
        zone: "HAND",
        operator: ">=",
        value: 1,
      },
      duration: { type: "PERMANENT" },
      expiresAt: { wave: "SOURCE_LEAVES_ZONE" },
      controller: 0,
      appliesTo: [],
      timestamp: 1,
    };
    const players = [...state.players] as [PlayerState, PlayerState];
    players[0] = { ...players[0], hand: [hiddenHandCharacter] };
    const authoritative = {
      ...state,
      players,
      activeEffects: [...state.activeEffects, hiddenHandEffect],
    };
    const basePower = cardDb.get(
      authoritative.players[0].leader.cardId
    )!.power!;
    const opponentView = visibleStateForPlayer(authoritative, cardDb, 1);
    const spectatorView = visibleStateForSpectator(authoritative, cardDb);

    expect(opponentView.players[0].hand[0].cardId).toBe("hidden");
    expect(opponentView.players[0].leader.effectivePower).toBe(
      basePower + 1000
    );
    expect(opponentView.players[0].leader.powerDelta).toBe(1000);
    expect(spectatorView.players[0].leader.effectivePower).toBe(
      basePower + 1000
    );
    expect(spectatorView.players[0].leader.powerDelta).toBe(1000);
  });
});

describe("visible dynamic aura targets", () => {
  it("publishes Saldeath's granted Blugori in appliesTo", () => {
    const { state, cardDb, fieldTarget } = saldeathAuraState();

    for (const visible of [
      visibleStateForPlayer(state, cardDb, 0),
      visibleStateForSpectator(state, cardDb),
    ]) {
      expect(visible.activeEffects).toHaveLength(1);
      expect(visible.activeEffects[0]?.id).toBe(state.activeEffects[0]?.id);
      expect(visible.activeEffects[0]?.appliesTo).toContain(
        fieldTarget.instanceId
      );
    }
    expect(state.activeEffects[0]?.appliesTo).toEqual([]);
  });

  it("removes a renamed field character from Saldeath's appliesTo", () => {
    const { state, cardDb, fieldTarget } = saldeathAuraState({
      fieldTargetName: "Not Blugori",
    });

    const visible = visibleStateForPlayer(state, cardDb, 0);

    expect(visible.activeEffects[0]?.appliesTo).not.toContain(
      fieldTarget.instanceId
    );
  });

  it("keeps a matching hidden-hand card out of Saldeath's appliesTo", () => {
    const { state, cardDb, hiddenTarget } = saldeathAuraState({
      includeHiddenBlugori: true,
    });

    for (const visible of [
      visibleStateForPlayer(state, cardDb, 0),
      visibleStateForSpectator(state, cardDb),
    ]) {
      expect(visible.activeEffects[0]?.appliesTo).not.toContain(
        hiddenTarget.instanceId
      );
    }
  });

  it("preserves SELF while adding a separately targeted dynamic character", () => {
    const cardDb = createTestCardDb();
    const mixedKeywordSchema: EffectSchema = {
      effects: [
        {
          id: "mixed_keyword_aura",
          category: "permanent",
          modifiers: [
            {
              type: "GRANT_KEYWORD",
              target: { type: "SELF" },
              params: { keyword: "BLOCKER" },
            },
            {
              type: "GRANT_KEYWORD",
              target: {
                type: "CHARACTER",
                controller: "SELF",
                filter: { name: "Dynamic Double Attacker" },
              },
              params: { keyword: "DOUBLE_ATTACK" },
            },
          ],
        },
      ],
    };
    const sourceData: CardData = {
      ...CARDS.VANILLA,
      id: "TEST-MIXED-KEYWORD-SOURCE",
      name: "Mixed Keyword Source",
      effectSchema: mixedKeywordSchema,
    };
    const dynamicTargetData: CardData = {
      ...CARDS.VANILLA,
      id: "TEST-DYNAMIC-DOUBLE-ATTACKER",
      name: "Dynamic Double Attacker",
    };
    cardDb.set(sourceData.id, sourceData);
    cardDb.set(dynamicTargetData.id, dynamicTargetData);

    let state = createBattleReadyState(cardDb);
    const source: CardInstance = {
      ...state.players[0].characters[0]!,
      instanceId: "mixed-keyword-source",
      cardId: sourceData.id,
    };
    const dynamicTarget: CardInstance = {
      ...state.players[0].characters[1]!,
      instanceId: "dynamic-double-attacker",
      cardId: dynamicTargetData.id,
    };
    const players = [...state.players] as [PlayerState, PlayerState];
    players[0] = {
      ...players[0],
      characters: [source, dynamicTarget, null, null, null],
    };
    state = registerPermanentEffectsForCard(
      { ...state, players },
      source,
      sourceData
    );

    expect(hasGrantedKeyword(source, "BLOCKER", state, cardDb)).toBe(true);
    expect(hasGrantedKeyword(source, "DOUBLE_ATTACK", state, cardDb)).toBe(
      false
    );
    expect(
      hasGrantedKeyword(dynamicTarget, "DOUBLE_ATTACK", state, cardDb)
    ).toBe(true);

    const visible = visibleStateForPlayer(state, cardDb, 0);

    expect(
      hasRuntimeKeyword(
        source.instanceId,
        sourceData.keywords,
        visible.activeEffects,
        "BLOCKER"
      )
    ).toBe(true);
    expect(
      hasRuntimeKeyword(
        source.instanceId,
        sourceData.keywords,
        visible.activeEffects,
        "DOUBLE_ATTACK"
      )
    ).toBe(false);
    expect(
      hasRuntimeKeyword(
        dynamicTarget.instanceId,
        dynamicTargetData.keywords,
        visible.activeEffects,
        "DOUBLE_ATTACK"
      )
    ).toBe(true);
    expect(
      hasRuntimeKeyword(
        dynamicTarget.instanceId,
        dynamicTargetData.keywords,
        visible.activeEffects,
        "BLOCKER"
      )
    ).toBe(false);
    expect(visible.activeEffects.map((effect) => effect.id)).toEqual([
      `${state.activeEffects[0].id}#0`,
      `${state.activeEffects[0].id}#1`,
    ]);
  });

  it("omits a dynamic modifier whose own duration gate is false", () => {
    const cardDb = createTestCardDb();
    const targetData: CardData = {
      ...CARDS.VANILLA,
      id: "TEST-DURATION-TARGET",
      name: "Duration Target",
      cost: 3,
    };
    cardDb.set(targetData.id, targetData);

    const state = createBattleReadyState(cardDb);
    const target: CardInstance = {
      ...state.players[1].characters[0]!,
      instanceId: "duration-target",
      cardId: targetData.id,
    };
    const players = [...state.players] as [PlayerState, PlayerState];
    players[1] = {
      ...players[1],
      characters: [target, ...players[1].characters.slice(1)],
    };
    const effect: RuntimeActiveEffect = {
      id: "duration-gated-aura",
      sourceCardInstanceId: players[0].leader.instanceId,
      sourceEffectBlockId: "duration_gated_aura",
      category: "permanent",
      modifiers: [
        {
          type: "MODIFY_COST",
          target: { type: "CHARACTER", controller: "OPPONENT" },
          params: { amount: -3 },
          duration: {
            type: "WHILE_CONDITION",
            condition: { type: "IS_MY_TURN", controller: "SELF" },
          },
        },
      ],
      duration: { type: "PERMANENT" },
      expiresAt: { wave: "SOURCE_LEAVES_ZONE" },
      controller: 0,
      appliesTo: [],
      timestamp: 1,
    };
    const opponentTurnState = {
      ...state,
      players,
      turn: { ...state.turn, activePlayerIndex: 1 as const },
      activeEffects: [effect],
    };

    const visible = visibleStateForPlayer(opponentTurnState, cardDb, 1);

    expect(visible.activeEffects).toEqual([]);
  });
});

describe("visibleStateForSpectator", () => {
  function getMainPhaseState() {
    const { state, cardDb } = setupGame();
    return { state: advanceToPhase(state, "MAIN", cardDb), cardDb };
  }

  it("preserves both owners' real hand identities and attached DON!!", () => {
    const { state, cardDb } = getMainPhaseState();
    const expectedHands = state.players.map((player, playerIndex) =>
      player.hand.map((card, cardIndex) => ({
        ...card,
        attachedDon:
          cardIndex === 0
            ? [
                {
                  instanceId: `hand-don-${playerIndex}`,
                  state: "RESTED" as const,
                  attachedTo: card.instanceId,
                },
              ]
            : card.attachedDon,
      }))
    ) as [(typeof state.players)[0]["hand"], (typeof state.players)[1]["hand"]];
    const withAttachedDon = {
      ...state,
      players: [
        { ...state.players[0], hand: expectedHands[0] },
        { ...state.players[1], hand: expectedHands[1] },
      ] as typeof state.players,
    };

    const spectator = visibleStateForSpectator(withAttachedDon, cardDb);

    for (const playerIndex of [0, 1] as const) {
      expect(spectator.players[playerIndex].hand).toEqual(
        expectedHands[playerIndex]
      );
      for (const card of spectator.players[playerIndex].hand) {
        expect(card.cardId).not.toBe("hidden");
        expect(card.instanceId).not.toMatch(/^hidden-/);
      }
      expect(spectator.players[playerIndex].hand[0]?.attachedDon).toHaveLength(
        1
      );
    }
  });

  it("re-obfuscates both decks and both players' face-down Life", () => {
    const { state, cardDb } = getMainPhaseState();
    const spectator = visibleStateForSpectator(state, cardDb);

    for (const playerIndex of [0, 1] as const) {
      for (const card of spectator.players[playerIndex].deck) {
        expect(card.cardId).toBe("hidden");
        expect(card.instanceId).toMatch(
          new RegExp(`^hidden-${playerIndex}-deck-`)
        );
      }
      for (const lifeCard of spectator.players[playerIndex].life) {
        if (lifeCard.face === "DOWN") {
          expect(lifeCard.cardId).toBe("hidden");
          expect(lifeCard.instanceId).toMatch(
            new RegExp(`^hidden-${playerIndex}-life-`)
          );
        }
      }
    }
  });

  it("uses the shared redacted execution context and keeps effectStack empty", () => {
    const { state, cardDb } = getMainPhaseState();
    const playerZeroView = filterStateForPlayer(state, 0);
    const playerOneView = filterStateForPlayer(state, 1);
    const spectator = visibleStateForSpectator(state, cardDb);

    expect(playerZeroView.executionContext).toEqual(
      playerOneView.executionContext
    );
    expect(spectator.executionContext).toEqual(playerZeroView.executionContext);
    expect(spectator.effectStack).toEqual([]);
  });

  it("preserves public zones identically for both players", () => {
    const { state, cardDb } = getMainPhaseState();
    const spectator = visibleStateForSpectator(state, cardDb);

    for (const playerIndex of [0, 1] as const) {
      expect(spectator.players[playerIndex].leader).toMatchObject(
        state.players[playerIndex].leader
      );
      expect(spectator.players[playerIndex].characters).toMatchObject(
        state.players[playerIndex].characters
      );
      expect(spectator.players[playerIndex].stage).toEqual(
        state.players[playerIndex].stage
      );
      expect(spectator.players[playerIndex].trash).toEqual(
        state.players[playerIndex].trash
      );
    }
  });

  it("throws when player views disagree on the redacted execution context", () => {
    const { state, cardDb } = getMainPhaseState();
    let versionReads = 0;
    const divergentExecutionContext = { ...state.executionContext };
    Object.defineProperty(divergentExecutionContext, "version", {
      enumerable: true,
      get: () => (versionReads++ === 0 ? 1 : 2),
    });
    const divergentState = {
      ...state,
      executionContext: divergentExecutionContext,
    } as typeof state;

    expect(() => visibleStateForSpectator(divergentState, cardDb)).toThrow(
      "Spectator visibility invariant violated: executionContext differs between player views"
    );
  });

  it("throws when player views disagree on a public zone", () => {
    const { state, cardDb } = getMainPhaseState();
    const playerZero = { ...state.players[0] };
    const leader = playerZero.leader;
    let leaderReads = 0;
    Object.defineProperty(playerZero, "leader", {
      enumerable: true,
      get: () =>
        leaderReads++ === 0
          ? leader
          : { ...leader, cardId: "viewer-specific-leader" },
    });
    const divergentState = {
      ...state,
      players: [playerZero, state.players[1]],
    } as typeof state;

    expect(() => visibleStateForSpectator(divergentState, cardDb)).toThrow(
      "Spectator visibility invariant violated: players[0].leader differs between player views"
    );
  });
});

describe("conditional prohibition visibility", () => {
  function yonjiState(includeNonGermaCharacter: boolean) {
    const cardDb = createTestCardDb();
    const yonjiData: CardData = {
      ...CARDS.BLOCKER,
      id: "OP11-046",
      name: "Vinsmoke Yonji",
      types: ["GERMA"],
      effectSchema: OP11_046_VINSMOKE_YONJI,
    };
    cardDb.set(yonjiData.id, yonjiData);

    let state = createBattleReadyState(cardDb);
    const yonji: CardInstance = {
      ...state.players[0].characters[1]!,
      instanceId: "opt752-yonji",
      cardId: yonjiData.id,
    };
    const players = [...state.players] as [PlayerState, PlayerState];
    players[0] = {
      ...players[0],
      characters: includeNonGermaCharacter
        ? [yonji, players[0].characters[0], null, null, null]
        : [yonji, null, null, null, null],
    };
    state = registerPermanentEffectsForCard(
      { ...state, players },
      yonji,
      yonjiData
    );

    return { state, cardDb };
  }

  it("broadcasts Yonji's protection only while FIELD_PURITY is true", () => {
    const inactive = yonjiState(true);
    const active = yonjiState(false);

    expect(inactive.state.prohibitions).toHaveLength(2);
    expect(
      visibleStateForPlayer(inactive.state, inactive.cardDb, 0).prohibitions
    ).toEqual([]);
    expect(
      visibleStateForSpectator(inactive.state, inactive.cardDb).prohibitions
    ).toEqual([]);

    expect(active.state.prohibitions).toHaveLength(2);
    expect(
      visibleStateForPlayer(active.state, active.cardDb, 0).prohibitions
    ).toHaveLength(2);
    expect(
      visibleStateForSpectator(active.state, active.cardDb).prohibitions
    ).toHaveLength(2);
  });
});
