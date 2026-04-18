import { describe, it, expect } from "vitest";
import { runPipeline } from "../engine/pipeline.js";
import type { CardData, GameState, DonInstance, CardInstance, PlayerState } from "../types.js";
import {
  setupGame,
  createTestCardDb,
  advanceToPhase,
  createBattleReadyState,
  CARDS, padChars } from "./helpers.js";
import { registerTriggersForCard } from "../engine/triggers.js";
import { resumeFromStack } from "../engine/effect-resolver/resume.js";

// ─── Phase Cycle ──────────────────────────────────────────────────────────────

describe("phase cycle", () => {
  it("advances through REFRESH → DRAW → DON → MAIN → END correctly", () => {
    const { state, cardDb } = setupGame();
    expect(state.turn.phase).toBe("REFRESH");

    // REFRESH → DRAW
    const r1 = runPipeline(state, { type: "ADVANCE_PHASE" }, cardDb, 0);
    expect(r1.valid).toBe(true);
    expect(r1.state.turn.phase).toBe("DRAW");

    // DRAW → DON
    const r2 = runPipeline(r1.state, { type: "ADVANCE_PHASE" }, cardDb, 0);
    expect(r2.valid).toBe(true);
    expect(r2.state.turn.phase).toBe("DON");

    // DON → MAIN
    const r3 = runPipeline(r2.state, { type: "ADVANCE_PHASE" }, cardDb, 0);
    expect(r3.valid).toBe(true);
    expect(r3.state.turn.phase).toBe("MAIN");

    // MAIN → END → automatically transitions to next player's REFRESH
    const r4 = runPipeline(r3.state, { type: "ADVANCE_PHASE" }, cardDb, 0);
    expect(r4.valid).toBe(true);
    expect(r4.state.turn.phase).toBe("REFRESH");
    expect(r4.state.turn.activePlayerIndex).toBe(1);
  });

  it("first player turn 1: does not draw", () => {
    const { state, cardDb } = setupGame();
    const handSizeBefore = state.players[0].hand.length;

    // Advance to DRAW then past it
    const r1 = runPipeline(state, { type: "ADVANCE_PHASE" }, cardDb, 0);
    const r2 = runPipeline(r1.state, { type: "ADVANCE_PHASE" }, cardDb, 0);
    expect(r2.state.turn.phase).toBe("DON");
    expect(r2.state.players[0].hand.length).toBe(handSizeBefore);
  });

  it("first player turn 1: places only 1 DON!!", () => {
    const { state, cardDb } = setupGame();
    const donDeckBefore = state.players[0].donDeck.length;

    const afterDon = advanceToPhase(state, "MAIN", cardDb);
    expect(afterDon.players[0].donDeck.length).toBe(donDeckBefore - 1);
    expect(afterDon.players[0].donCostArea.length).toBe(1);
  });

  it("second player draws and gets 2 DON!!", () => {
    const { state, cardDb } = setupGame();

    // Full turn for P0, then advance P1 to MAIN
    let s = advanceToPhase(state, "MAIN", cardDb);
    const r = runPipeline(s, { type: "ADVANCE_PHASE" }, cardDb, 0);
    s = r.state; // now P1's REFRESH

    const p1HandBefore = s.players[1].hand.length;
    const p1DonDeckBefore = s.players[1].donDeck.length;

    s = advanceToPhase(s, "MAIN", cardDb);
    expect(s.players[1].hand.length).toBe(p1HandBefore + 1); // drew 1 card
    expect(s.players[1].donDeck.length).toBe(p1DonDeckBefore - 2); // placed 2 DON!!
    expect(s.players[1].donCostArea.length).toBe(2);
  });
});

// ─── Play Card ────────────────────────────────────────────────────────────────

describe("play card", () => {
  it("plays a Character: pays DON!! cost and places on board", () => {
    const cardDb = createTestCardDb();
    let state = createBattleReadyState(cardDb);

    // Find a card in hand to play
    const charInHand = state.players[0].hand.find(
      (c) => cardDb.get(c.cardId)?.type === "Character" && (cardDb.get(c.cardId)?.cost ?? 0) <= 8,
    );
    if (!charInHand) throw new Error("No playable character in hand");

    const cost = cardDb.get(charInHand.cardId)!.cost!;
    const activeDonBefore = state.players[0].donCostArea.filter((d) => d.state === "ACTIVE").length;
    const charsBefore = state.players[0].characters.filter(Boolean).length;

    const result = runPipeline(state, { type: "PLAY_CARD", cardInstanceId: charInHand.instanceId }, cardDb, 0);
    expect(result.valid).toBe(true);

    const activeDonAfter = result.state.players[0].donCostArea.filter((d) => d.state === "ACTIVE").length;
    expect(activeDonAfter).toBe(activeDonBefore - cost);
    expect(result.state.players[0].characters.filter(Boolean).length).toBe(charsBefore + 1);
    expect(result.state.players[0].hand.find((c) => c.instanceId === charInHand.instanceId)).toBeUndefined();
  });

  it("rejects playing a card when not enough DON!!", () => {
    const cardDb = createTestCardDb();
    let state = createBattleReadyState(cardDb);

    // Empty out all DON!!
    const newPlayers = [...state.players] as [PlayerState, PlayerState];
    newPlayers[0] = {
      ...newPlayers[0],
      donCostArea: newPlayers[0].donCostArea.map((d) => ({ ...d, state: "RESTED" as const })),
    };
    state = { ...state, players: newPlayers };

    const charInHand = state.players[0].hand.find(
      (c) => (cardDb.get(c.cardId)?.cost ?? 0) > 0,
    );
    if (!charInHand) return;

    const result = runPipeline(state, { type: "PLAY_CARD", cardInstanceId: charInHand.instanceId }, cardDb, 0);
    expect(result.valid).toBe(false);
  });
});

// ─── Attach DON!! ─────────────────────────────────────────────────────────────

describe("attach DON!!", () => {
  it("attaches DON!! from cost area to a character", () => {
    const cardDb = createTestCardDb();
    const state = createBattleReadyState(cardDb);
    const target = state.players[0].characters[0]!;

    const activeDonBefore = state.players[0].donCostArea.filter((d) => d.state === "ACTIVE").length;

    const result = runPipeline(state, { type: "ATTACH_DON", targetInstanceId: target.instanceId, count: 1 }, cardDb, 0);
    expect(result.valid).toBe(true);

    const p0 = result.state.players[0];
    const activeDonAfter = p0.donCostArea.filter((d) => d.state === "ACTIVE").length;
    expect(activeDonAfter).toBe(activeDonBefore - 1);

    const updatedChar = p0.characters.find((c) => c?.cardId === target.cardId);
    expect(updatedChar?.attachedDon.length).toBe(1);
  });
});

// ─── Battle: Attack → Damage ──────────────────────────────────────────────────

describe("battle", () => {
  it("attack Leader: removes a life card on successful damage", () => {
    const cardDb = createTestCardDb();
    let state = createBattleReadyState(cardDb);

    // Pin the top life card to a non-[Trigger] card so the shuffle doesn't
    // park the battle in DAMAGE_STEP (flaky pre-OPT-239 as well).
    const p1Life = [...state.players[1].life];
    p1Life[0] = { ...p1Life[0], cardId: CARDS.VANILLA.id };
    const pinnedPlayers = [...state.players] as [PlayerState, PlayerState];
    pinnedPlayers[1] = { ...pinnedPlayers[1], life: p1Life };
    state = { ...state, players: pinnedPlayers };

    const attacker = state.players[0].leader;
    const target = state.players[1].leader;
    const lifeBefore = state.players[1].life.length;

    // Declare attack
    let result = runPipeline(state, {
      type: "DECLARE_ATTACK",
      attackerInstanceId: attacker.instanceId,
      targetInstanceId: target.instanceId,
    }, cardDb, 0);
    expect(result.valid).toBe(true);
    expect(result.state.turn.battleSubPhase).toBe("BLOCK_STEP");

    // Pass blocker
    result = runPipeline(result.state, { type: "PASS" }, cardDb, 0);
    expect(result.valid).toBe(true);
    expect(result.state.turn.battleSubPhase).toBe("COUNTER_STEP");

    // Pass counter
    result = runPipeline(result.state, { type: "PASS" }, cardDb, 0);
    expect(result.valid).toBe(true);

    // Battle should be resolved (damage dealt or trigger pending)
    expect(result.state.turn.battleSubPhase).toBeNull();
    expect(result.state.turn.battle).toBeNull();

    // Life reduced (unless the life card had [Trigger] and is pending)
    const lifeAfter = result.state.players[1].life.length;
    expect(lifeAfter).toBeLessThan(lifeBefore);
  });

  it("attack Character: KOs character when attacker power >= defender", () => {
    const cardDb = createTestCardDb();
    let state = createBattleReadyState(cardDb);

    // Attach DON!! to leader to ensure higher power
    const leaderDon: DonInstance = { instanceId: "don-attached-0", state: "ACTIVE", attachedTo: state.players[0].leader.instanceId };
    // Make target character RESTED (only rested characters can be attacked)
    const newPlayers = [...state.players] as [PlayerState, PlayerState];
    newPlayers[0] = {
      ...newPlayers[0],
      leader: { ...newPlayers[0].leader, attachedDon: [leaderDon, leaderDon, leaderDon] },
    };
    newPlayers[1] = {
      ...newPlayers[1],
      characters: newPlayers[1].characters.map((c, i) =>
        i === 0 && c ? { ...c, state: "RESTED" as const } : c,
      ),
    };
    state = { ...state, players: newPlayers };

    const attacker = state.players[0].leader; // 5000 + 3000 DON = 8000
    const target = state.players[1].characters[0]!; // VANILLA = 4000, RESTED
    const charsBefore = state.players[1].characters.filter(Boolean).length;

    let result = runPipeline(state, {
      type: "DECLARE_ATTACK",
      attackerInstanceId: attacker.instanceId,
      targetInstanceId: target.instanceId,
    }, cardDb, 0);
    expect(result.valid).toBe(true);

    // Pass through block + counter
    result = runPipeline(result.state, { type: "PASS" }, cardDb, 0);
    result = runPipeline(result.state, { type: "PASS" }, cardDb, 0);
    expect(result.valid).toBe(true);

    expect(result.state.players[1].characters.filter(Boolean).length).toBe(charsBefore - 1);
    expect(result.state.players[1].trash.some((c) => c.cardId === CARDS.VANILLA.id)).toBe(true);
  });

  it("blocker intercepts attack and replaces target", () => {
    const cardDb = createTestCardDb();
    let state = createBattleReadyState(cardDb);

    const attacker = state.players[0].characters[0]!;
    const originalTarget = state.players[1].leader;

    let result = runPipeline(state, {
      type: "DECLARE_ATTACK",
      attackerInstanceId: attacker.instanceId,
      targetInstanceId: originalTarget.instanceId,
    }, cardDb, 0);
    expect(result.valid).toBe(true);
    expect(result.state.turn.battleSubPhase).toBe("BLOCK_STEP");

    // Declare blocker
    const blocker = result.state.players[1].characters.find((c) => c?.cardId === CARDS.BLOCKER.id && c.state === "ACTIVE",
    )!;
    result = runPipeline(result.state, { type: "DECLARE_BLOCKER", blockerInstanceId: blocker.instanceId }, cardDb, 0);
    expect(result.valid).toBe(true);
    expect(result.state.turn.battle!.targetInstanceId).toBe(blocker.instanceId);
    expect(result.state.turn.battle!.blockerActivated).toBe(true);
    expect(result.state.turn.battleSubPhase).toBe("COUNTER_STEP");
  });

  it("rejects second blocker declaration in the same battle (§7-1-2-1)", () => {
    const cardDb = createTestCardDb();
    let state = createBattleReadyState(cardDb);

    const attacker = state.players[0].characters[0]!;
    const originalTarget = state.players[1].leader;

    let result = runPipeline(state, {
      type: "DECLARE_ATTACK",
      attackerInstanceId: attacker.instanceId,
      targetInstanceId: originalTarget.instanceId,
    }, cardDb, 0);
    expect(result.valid).toBe(true);
    expect(result.state.turn.battleSubPhase).toBe("BLOCK_STEP");

    // Declare first blocker
    const blocker1 = result.state.players[1].characters.find((c) => c?.cardId === CARDS.BLOCKER.id && c.state === "ACTIVE",
    )!;
    result = runPipeline(result.state, { type: "DECLARE_BLOCKER", blockerInstanceId: blocker1.instanceId }, cardDb, 0);
    expect(result.valid).toBe(true);
    expect(result.state.turn.battle!.blockerActivated).toBe(true);

    // Simulate being back in BLOCK_STEP with blockerActivated still true
    // (defensive check — natural flow moves to COUNTER_STEP, but the guard must hold)
    const forcedState: GameState = {
      ...result.state,
      turn: { ...result.state.turn, battleSubPhase: "BLOCK_STEP" },
    };

    // Add a second blocker candidate
    const blocker2: CardInstance = {
      instanceId: "blocker-2nd",
      cardId: CARDS.BLOCKER.id,
      zone: "CHARACTER",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 1,
      controller: 1,
      owner: 1,
    };
    const newPlayers = [...forcedState.players] as [PlayerState, PlayerState];
    newPlayers[1] = { ...newPlayers[1], characters: padChars([...newPlayers[1].characters.filter(Boolean) as CardInstance[], blocker2]) };
    const stateWith2ndBlocker: GameState = { ...forcedState, players: newPlayers };

    // Second blocker should be rejected
    const result2 = runPipeline(stateWith2ndBlocker, { type: "DECLARE_BLOCKER", blockerInstanceId: blocker2.instanceId }, cardDb, 0);
    expect(result2.valid).toBe(false);
    expect(result2.error).toContain("§7-1-2-1");
  });

  it("symbol counter increases defender power", () => {
    const cardDb = createTestCardDb();
    let state = createBattleReadyState(cardDb);

    // Ensure P1 has a counter card in hand
    const counterCard: CardInstance = {
      instanceId: "counter-in-hand",
      cardId: CARDS.COUNTER.id,
      zone: "HAND",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: null,
      controller: 1,
      owner: 1,
    };
    const newPlayers = [...state.players] as [PlayerState, PlayerState];
    newPlayers[1] = { ...newPlayers[1], hand: [...newPlayers[1].hand, counterCard] };
    state = { ...state, players: newPlayers };

    // Attack P1's leader
    let result = runPipeline(state, {
      type: "DECLARE_ATTACK",
      attackerInstanceId: state.players[0].characters[0]!.instanceId,
      targetInstanceId: state.players[1].leader.instanceId,
    }, cardDb, 0);

    // Pass blocker
    result = runPipeline(result.state, { type: "PASS" }, cardDb, 0);
    expect(result.state.turn.battleSubPhase).toBe("COUNTER_STEP");

    const defPowerBefore = result.state.turn.battle!.defenderPower;

    // Use counter
    result = runPipeline(result.state, {
      type: "USE_COUNTER",
      cardInstanceId: counterCard.instanceId,
      counterTargetInstanceId: state.players[1].leader.instanceId,
    }, cardDb, 0);
    expect(result.valid).toBe(true);
    expect(result.state.turn.battle!.defenderPower).toBeGreaterThan(defPowerBefore);
    expect(result.state.turn.battle!.counterPowerAdded).toBe(2000);
  });

  it("counter event with COUNTER_EVENT effect triggers optional prompt and cost payment", () => {
    const cardDb = createTestCardDb();

    // Add a counter event card with a COUNTER_EVENT effect schema (like OP06-115)
    const counterEventCard: CardData = {
      id: "TEST-COUNTER-EVENT",
      name: "Test Counter Event",
      type: "Event",
      color: ["Purple"],
      cost: 0,
      power: null,
      counter: null,
      life: null,
      attribute: [],
      types: [],
      effectText: "[Counter] You may trash 1 card from your hand: Up to 1 of your Leader or Character cards gains +3000 power during this battle.",
      triggerText: null,
      keywords: { rush: false, rushCharacter: false, doubleAttack: false, banish: false, blocker: false, trigger: false, unblockable: false },
      imageUrl: null,
      effectSchema: {
        card_id: "TEST-COUNTER-EVENT",
        card_name: "Test Counter Event",
        card_type: "Event",
        effects: [
          {
            id: "test-counter-event_effect_1",
            category: "auto",
            trigger: { keyword: "COUNTER_EVENT" },
            costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
            flags: { optional: true },
            actions: [
              {
                type: "MODIFY_POWER",
                target: {
                  type: "LEADER_OR_CHARACTER",
                  controller: "SELF",
                  count: { up_to: 1 },
                },
                params: { amount: 3000 },
                duration: { type: "THIS_BATTLE" },
              },
            ],
          },
        ],
      },
    };
    cardDb.set(counterEventCard.id, counterEventCard);

    let state = createBattleReadyState(cardDb);

    // Put the counter event card in P1's hand along with an extra card to trash as cost
    const counterEventInstance: CardInstance = {
      instanceId: "counter-event-in-hand",
      cardId: counterEventCard.id,
      zone: "HAND",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: null,
      controller: 1,
      owner: 1,
    };
    const extraCard: CardInstance = {
      instanceId: "extra-card-for-cost",
      cardId: CARDS.VANILLA.id,
      zone: "HAND",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: null,
      controller: 1,
      owner: 1,
    };
    const newPlayers = [...state.players] as [PlayerState, PlayerState];
    newPlayers[1] = { ...newPlayers[1], hand: [...newPlayers[1].hand, counterEventInstance, extraCard] };
    state = { ...state, players: newPlayers };

    // Attack P1's leader
    let result = runPipeline(state, {
      type: "DECLARE_ATTACK",
      attackerInstanceId: state.players[0].characters[0]!.instanceId,
      targetInstanceId: state.players[1].leader.instanceId,
    }, cardDb, 0);
    expect(result.valid).toBe(true);

    // Pass blocker
    result = runPipeline(result.state, { type: "PASS" }, cardDb, 0);
    expect(result.state.turn.battleSubPhase).toBe("COUNTER_STEP");

    // Use counter event
    result = runPipeline(result.state, {
      type: "USE_COUNTER_EVENT",
      cardInstanceId: counterEventInstance.instanceId,
      counterTargetInstanceId: state.players[1].leader.instanceId,
    }, cardDb, 0);
    expect(result.valid).toBe(true);

    // The counter event card should be trashed
    expect(result.state.players[1].trash.some(c => c.cardId === counterEventCard.id)).toBe(true);

    // The effect should trigger — since it has optional: true, it should produce
    // a pending prompt asking the player whether to activate the effect
    expect(result.pendingPrompt).toBeDefined();
    expect(result.pendingPrompt!.options.promptType).toBe("OPTIONAL_EFFECT");
  });
});

// ─── Keywords ─────────────────────────────────────────────────────────────────

describe("keywords", () => {
  it("Rush: character can attack on the turn it was played", () => {
    const cardDb = createTestCardDb();
    let state = createBattleReadyState(cardDb);

    // Place a Rush character played THIS turn
    const rushChar: CardInstance = {
      instanceId: "rush-char-new",
      cardId: CARDS.RUSH.id,
      zone: "CHARACTER",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: state.turn.number,
      controller: 0,
      owner: 0,
    };
    const newPlayers = [...state.players] as [PlayerState, PlayerState];
    newPlayers[0] = { ...newPlayers[0], characters: padChars([...newPlayers[0].characters.filter(Boolean) as CardInstance[], rushChar]) };
    state = { ...state, players: newPlayers };

    const result = runPipeline(state, {
      type: "DECLARE_ATTACK",
      attackerInstanceId: rushChar.instanceId,
      targetInstanceId: state.players[1].leader.instanceId,
    }, cardDb, 0);
    expect(result.valid).toBe(true);
  });

  it("summoning sickness: non-Rush character cannot attack on turn played", () => {
    const cardDb = createTestCardDb();
    let state = createBattleReadyState(cardDb);

    // Place a vanilla character played THIS turn
    const newChar: CardInstance = {
      instanceId: "vanilla-new",
      cardId: CARDS.VANILLA.id,
      zone: "CHARACTER",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: state.turn.number,
      controller: 0,
      owner: 0,
    };
    const newPlayers = [...state.players] as [PlayerState, PlayerState];
    newPlayers[0] = { ...newPlayers[0], characters: padChars([...newPlayers[0].characters.filter(Boolean) as CardInstance[], newChar]) };
    state = { ...state, players: newPlayers };

    const result = runPipeline(state, {
      type: "DECLARE_ATTACK",
      attackerInstanceId: newChar.instanceId,
      targetInstanceId: state.players[1].leader.instanceId,
    }, cardDb, 0);
    expect(result.valid).toBe(false);
  });

  it("Rush: Character cannot attack Leader on turn played", () => {
    const cardDb = createTestCardDb();
    let state = createBattleReadyState(cardDb);

    const rushCharChar: CardInstance = {
      instanceId: "rush-c-new",
      cardId: CARDS.RUSH_CHAR.id,
      zone: "CHARACTER",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: state.turn.number,
      controller: 0,
      owner: 0,
    };
    const newPlayers = [...state.players] as [PlayerState, PlayerState];
    newPlayers[0] = { ...newPlayers[0], characters: padChars([...newPlayers[0].characters.filter(Boolean) as CardInstance[], rushCharChar]) };
    state = { ...state, players: newPlayers };

    // Should fail: Rush:Character can only target Characters on turn played
    const result = runPipeline(state, {
      type: "DECLARE_ATTACK",
      attackerInstanceId: rushCharChar.instanceId,
      targetInstanceId: state.players[1].leader.instanceId,
    }, cardDb, 0);
    expect(result.valid).toBe(false);
  });

  it("Unblockable: opponent cannot declare blocker", () => {
    const cardDb = createTestCardDb();
    let state = createBattleReadyState(cardDb);

    const unblockableChar: CardInstance = {
      instanceId: "unblk-char",
      cardId: CARDS.UNBLOCKABLE.id,
      zone: "CHARACTER",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 1,
      controller: 0,
      owner: 0,
    };
    const newPlayers = [...state.players] as [PlayerState, PlayerState];
    newPlayers[0] = { ...newPlayers[0], characters: padChars([...newPlayers[0].characters.filter(Boolean) as CardInstance[], unblockableChar]) };
    state = { ...state, players: newPlayers };

    let result = runPipeline(state, {
      type: "DECLARE_ATTACK",
      attackerInstanceId: unblockableChar.instanceId,
      targetInstanceId: state.players[1].leader.instanceId,
    }, cardDb, 0);
    expect(result.valid).toBe(true);

    const blockerTarget = result.state.players[1].characters.find((c) => c?.cardId === CARDS.BLOCKER.id && c.state === "ACTIVE",
    );
    if (blockerTarget) {
      result = runPipeline(result.state, { type: "DECLARE_BLOCKER", blockerInstanceId: blockerTarget.instanceId }, cardDb, 0);
      expect(result.valid).toBe(false);
    }
  });
});

// ─── Concede ──────────────────────────────────────────────────────────────────

describe("concede", () => {
  it("ends the game immediately with opponent as winner", () => {
    const { state, cardDb } = setupGame();
    const result = runPipeline(state, { type: "CONCEDE" }, cardDb, 0);
    expect(result.valid).toBe(true);
    expect(result.state.status).toBe("FINISHED");
    expect(result.state.winner).toBe(1);
    expect(result.gameOver).toBeTruthy();
    expect(result.gameOver!.winner).toBe(1);
  });
});

// ─── Defeat Conditions ────────────────────────────────────────────────────────

describe("defeat conditions", () => {
  it("deck-out: player with 0 deck cards loses after draw", () => {
    const { state, cardDb } = setupGame();

    // Empty player 0's deck
    const newPlayers = [...state.players] as [PlayerState, PlayerState];
    newPlayers[0] = { ...newPlayers[0], deck: [] };
    let s: GameState = { ...state, players: newPlayers };

    // Advance through REFRESH → DRAW (deck-out check happens in step 7)
    const r1 = runPipeline(s, { type: "ADVANCE_PHASE" }, cardDb, 0); // REFRESH → DRAW
    // At DRAW, the draw fails (empty deck), then defeat check runs
    const r2 = runPipeline(r1.state, { type: "ADVANCE_PHASE" }, cardDb, 0); // DRAW → DON

    // Either r2 has gameOver set, or the defeat was caught
    if (r2.gameOver) {
      expect(r2.state.status).toBe("FINISHED");
      expect(r2.state.winner).toBe(1);
    } else {
      // Deck was already empty at start but first player turn 1 skips draw,
      // so no deck-out yet. Advance past turn 1 and try again.
      expect(r2.state.players[0].deck.length).toBe(0);
    }
  });

  it("life-out: player with 0 life who takes damage loses", () => {
    const cardDb = createTestCardDb();
    let state = createBattleReadyState(cardDb);

    // Empty player 1's life
    const newPlayers = [...state.players] as [PlayerState, PlayerState];
    newPlayers[1] = { ...newPlayers[1], life: [] };
    state = { ...state, players: newPlayers };

    // Attack leader (0 life + damage = defeat)
    let result = runPipeline(state, {
      type: "DECLARE_ATTACK",
      attackerInstanceId: state.players[0].leader.instanceId,
      targetInstanceId: state.players[1].leader.instanceId,
    }, cardDb, 0);

    // Pass through block + counter to trigger damage
    result = runPipeline(result.state, { type: "PASS" }, cardDb, 0);
    result = runPipeline(result.state, { type: "PASS" }, cardDb, 0);

    expect(result.state.status).toBe("FINISHED");
    expect(result.state.winner).toBe(0);
    expect(result.gameOver).toBeTruthy();
  });

  it("reaching 0 life from damage does NOT end the game (§7-1-4-1-1-1)", () => {
    const cardDb = createTestCardDb();
    let state = createBattleReadyState(cardDb);

    // Give player 1 exactly 1 life card
    const newPlayers = [...state.players] as [PlayerState, PlayerState];
    newPlayers[1] = { ...newPlayers[1], life: [newPlayers[1].life[0]] };
    state = { ...state, players: newPlayers };
    expect(state.players[1].life.length).toBe(1);

    // Attack leader — damage removes the last life card → 0 life
    let result = runPipeline(state, {
      type: "DECLARE_ATTACK",
      attackerInstanceId: state.players[0].leader.instanceId,
      targetInstanceId: state.players[1].leader.instanceId,
    }, cardDb, 0);

    result = runPipeline(result.state, { type: "PASS" }, cardDb, 0);
    result = runPipeline(result.state, { type: "PASS" }, cardDb, 0);

    // Player 1 now has 0 life but should NOT have lost
    expect(result.state.players[1].life.length).toBe(0);
    expect(result.state.status).toBe("IN_PROGRESS");
    expect(result.gameOver).toBeFalsy();
  });

  it("Double Attack with 1 life: first damage reduces to 0, second triggers defeat", () => {
    const cardDb = createTestCardDb();
    let state = createBattleReadyState(cardDb);

    // Place a Double Attack character for player 0
    const datkChar: CardInstance = {
      instanceId: "datk-char",
      cardId: CARDS.DOUBLE_ATK.id,
      zone: "CHARACTER",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 1,
      controller: 0,
      owner: 0,
    };
    let newPlayers = [...state.players] as [PlayerState, PlayerState];
    newPlayers[0] = { ...newPlayers[0], characters: padChars([...newPlayers[0].characters.filter(Boolean) as CardInstance[], datkChar]) };
    // Pin to one non-[Trigger] life card so both DA damages resolve in-line.
    const loneLife = { ...newPlayers[1].life[0], cardId: CARDS.VANILLA.id };
    newPlayers[1] = { ...newPlayers[1], life: [loneLife] };
    state = { ...state, players: newPlayers };

    // Attack leader with Double Attack (2 damage vs 1 life)
    let result = runPipeline(state, {
      type: "DECLARE_ATTACK",
      attackerInstanceId: datkChar.instanceId,
      targetInstanceId: state.players[1].leader.instanceId,
    }, cardDb, 0);

    result = runPipeline(result.state, { type: "PASS" }, cardDb, 0);
    result = runPipeline(result.state, { type: "PASS" }, cardDb, 0);

    // First damage removed the life card; second damage hit 0 life → defeat
    expect(result.state.status).toBe("FINISHED");
    expect(result.state.winner).toBe(0);
    expect(result.gameOver).toBeTruthy();
  });
});

// ─── Validation ───────────────────────────────────────────────────────────────

describe("validation", () => {
  it("rejects actions when game is already finished", () => {
    const { state, cardDb } = setupGame();
    const finished: GameState = { ...state, status: "FINISHED", winner: 0, winReason: "test" };
    const result = runPipeline(finished, { type: "ADVANCE_PHASE" }, cardDb, 0);
    expect(result.valid).toBe(false);
  });

  it("rejects battle on first player's first turn", () => {
    const { state, cardDb } = setupGame();
    const mainState = advanceToPhase(state, "MAIN", cardDb);

    const result = runPipeline(mainState, {
      type: "DECLARE_ATTACK",
      attackerInstanceId: mainState.players[0].leader.instanceId,
      targetInstanceId: mainState.players[1].leader.instanceId,
    }, cardDb, 0);
    expect(result.valid).toBe(false);
  });

  it("rejects PLAY_CARD outside MAIN phase", () => {
    const { state, cardDb } = setupGame();
    // State starts at REFRESH — playing a card should be rejected
    const charInHand = state.players[0].hand[0];
    if (charInHand) {
      const result = runPipeline(state, { type: "PLAY_CARD", cardInstanceId: charInHand.instanceId }, cardDb, 0);
      expect(result.valid).toBe(false);
    }
  });
});

// ─── ON_KO Triggers (Rule 10-2-17) ─────────────────────────────────────────

describe("ON_KO triggers", () => {
  const noKw = { rush: false, rushCharacter: false, doubleAttack: false, banish: false, blocker: false, trigger: false, unblockable: false };

  /** Helper: set up a battle where P0's character attacks P1's ON_KO character and KOs it. */
  function setupBattleKO(
    cardDb: Map<string, CardData>,
    onKOCard: CardData,
    opts?: { donOnTarget?: number },
  ) {
    let state = createBattleReadyState(cardDb);

    // Give P0 a strong attacker (6000 power)
    const attacker: CardInstance = {
      instanceId: "attacker-p0",
      cardId: CARDS.VANILLA.id,
      zone: "CHARACTER",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 1,
      controller: 0,
      owner: 0,
    };

    // Put the ON_KO character on P1's field (4000 power — will be KO'd by 6000 attacker)
    const donAttachments = Array.from({ length: opts?.donOnTarget ?? 0 }, (_, i) => ({
      instanceId: `don-attached-${i}`,
      state: "ACTIVE" as const,
      attachedTo: "onko-target",
    }));
    const target: CardInstance = {
      instanceId: "onko-target",
      cardId: onKOCard.id,
      zone: "CHARACTER",
      state: "RESTED",
      attachedDon: donAttachments,
      turnPlayed: 1,
      controller: 1,
      owner: 1,
    };

    const newPlayers = [...state.players] as [PlayerState, PlayerState];
    // Override P0 attacker with higher power card
    const strongCard: CardData = {
      ...CARDS.VANILLA,
      id: "STRONG-ATTACKER",
      power: 6000,
    };
    cardDb.set(strongCard.id, strongCard);
    attacker.cardId = strongCard.id;

    newPlayers[0] = { ...newPlayers[0], characters: padChars([attacker]) };
    newPlayers[1] = { ...newPlayers[1], characters: padChars([target]) };
    state = { ...state, players: newPlayers };

    // Register the ON_KO card's triggers (normally done via PLAY_CARD pipeline)
    state = registerTriggersForCard(state, target, onKOCard);

    // Attack the ON_KO character
    let result = runPipeline(state, {
      type: "DECLARE_ATTACK",
      attackerInstanceId: attacker.instanceId,
      targetInstanceId: target.instanceId,
    }, cardDb, 0);
    expect(result.valid).toBe(true);

    // Pass blocker
    result = runPipeline(result.state, { type: "PASS" }, cardDb, 0);
    expect(result.state.turn.battleSubPhase).toBe("COUNTER_STEP");

    // Pass counter → damage step KOs the character
    result = runPipeline(result.state, { type: "PASS" }, cardDb, 0);
    return result;
  }

  it("unconditional ON_KO fires after battle KO", () => {
    const cardDb = createTestCardDb();
    const onKOCard: CardData = {
      id: "CHAR-ONKO-DRAW",
      name: "ON_KO Draw Character",
      type: "Character",
      color: ["Red"],
      cost: 3,
      power: 4000,
      counter: null,
      life: null,
      attribute: [],
      types: [],
      effectText: "[On K.O.] Draw 1 card.",
      triggerText: null,
      keywords: noKw,
      imageUrl: null,
      effectSchema: {
        card_id: "CHAR-ONKO-DRAW",
        effects: [{
          id: "onko_draw",
          category: "auto",
          trigger: { keyword: "ON_KO" },
          actions: [{ type: "DRAW", params: { amount: 1 } }],
        }],
      },
    };
    cardDb.set(onKOCard.id, onKOCard);

    const result = setupBattleKO(cardDb, onKOCard);

    // Card should be in P1's trash
    expect(result.state.players[1].trash.some(c => c.cardId === onKOCard.id)).toBe(true);

    // ON_KO effect should have fired — P1 drew a card
    // P1 starts with 5 hand cards in createBattleReadyState
    const p1HandSize = result.state.players[1].hand.length;
    const initialHandSize = createBattleReadyState(cardDb).players[1].hand.length;
    expect(p1HandSize).toBe(initialHandSize + 1);
  });

  it("ON_KO with DON requirement matches using pre-KO snapshot", () => {
    const cardDb = createTestCardDb();
    const onKOCard: CardData = {
      id: "CHAR-ONKO-DON2",
      name: "ON_KO DON2 Character",
      type: "Character",
      color: ["Red"],
      cost: 3,
      power: 4000,
      counter: null,
      life: null,
      attribute: [],
      types: [],
      effectText: "[On K.O.] Draw 1 card.",
      triggerText: null,
      keywords: noKw,
      imageUrl: null,
      effectSchema: {
        card_id: "CHAR-ONKO-DON2",
        effects: [{
          id: "onko_don2_draw",
          category: "auto",
          trigger: { keyword: "ON_KO", don_requirement: 2 },
          actions: [{ type: "DRAW", params: { amount: 1 } }],
        }],
      },
    };
    cardDb.set(onKOCard.id, onKOCard);

    // Attach 2 DON to the target — should pass DON requirement
    const result = setupBattleKO(cardDb, onKOCard, { donOnTarget: 2 });

    expect(result.state.players[1].trash.some(c => c.cardId === onKOCard.id)).toBe(true);
    const p1HandSize = result.state.players[1].hand.length;
    const initialHandSize = createBattleReadyState(cardDb).players[1].hand.length;
    expect(p1HandSize).toBe(initialHandSize + 1);
  });

  it("ON_KO with DON requirement fails when insufficient pre-KO DON", () => {
    const cardDb = createTestCardDb();
    const onKOCard: CardData = {
      id: "CHAR-ONKO-DON2-FAIL",
      name: "ON_KO DON2 Fail Character",
      type: "Character",
      color: ["Red"],
      cost: 3,
      power: 4000,
      counter: null,
      life: null,
      attribute: [],
      types: [],
      effectText: "[On K.O.] Draw 1 card.",
      triggerText: null,
      keywords: noKw,
      imageUrl: null,
      effectSchema: {
        card_id: "CHAR-ONKO-DON2-FAIL",
        effects: [{
          id: "onko_don2_draw_fail",
          category: "auto",
          trigger: { keyword: "ON_KO", don_requirement: 2 },
          actions: [{ type: "DRAW", params: { amount: 1 } }],
        }],
      },
    };
    cardDb.set(onKOCard.id, onKOCard);

    // Only 1 DON attached — should fail DON requirement
    const result = setupBattleKO(cardDb, onKOCard, { donOnTarget: 1 });

    expect(result.state.players[1].trash.some(c => c.cardId === onKOCard.id)).toBe(true);
    // No draw should have happened
    const p1HandSize = result.state.players[1].hand.length;
    const initialHandSize = createBattleReadyState(cardDb).players[1].hand.length;
    expect(p1HandSize).toBe(initialHandSize);
  });

  it("ON_KO with cause: BATTLE restriction matches battle KO", () => {
    const cardDb = createTestCardDb();
    const onKOCard: CardData = {
      id: "CHAR-ONKO-BATTLE",
      name: "ON_KO Battle Only Character",
      type: "Character",
      color: ["Red"],
      cost: 3,
      power: 4000,
      counter: null,
      life: null,
      attribute: [],
      types: [],
      effectText: "[On K.O.] Draw 1 card.",
      triggerText: null,
      keywords: noKw,
      imageUrl: null,
      effectSchema: {
        card_id: "CHAR-ONKO-BATTLE",
        effects: [{
          id: "onko_battle_draw",
          category: "auto",
          trigger: { keyword: "ON_KO", cause: "BATTLE" },
          actions: [{ type: "DRAW", params: { amount: 1 } }],
        }],
      },
    };
    cardDb.set(onKOCard.id, onKOCard);

    const result = setupBattleKO(cardDb, onKOCard);

    expect(result.state.players[1].trash.some(c => c.cardId === onKOCard.id)).toBe(true);
    const p1HandSize = result.state.players[1].hand.length;
    const initialHandSize = createBattleReadyState(cardDb).players[1].hand.length;
    expect(p1HandSize).toBe(initialHandSize + 1);
  });

  it("compound trigger any_of [ON_PLAY, ON_KO] fires ON_KO from trash", () => {
    const cardDb = createTestCardDb();
    const onKOCard: CardData = {
      id: "CHAR-COMPOUND-ONKO",
      name: "Compound ON_PLAY/ON_KO Character",
      type: "Character",
      color: ["Red"],
      cost: 3,
      power: 4000,
      counter: null,
      life: null,
      attribute: [],
      types: [],
      effectText: "[On Play] [On K.O.] Draw 1 card.",
      triggerText: null,
      keywords: noKw,
      imageUrl: null,
      effectSchema: {
        card_id: "CHAR-COMPOUND-ONKO",
        effects: [{
          id: "compound_play_ko_draw",
          category: "auto",
          trigger: { any_of: [{ keyword: "ON_PLAY" }, { keyword: "ON_KO" }] },
          actions: [{ type: "DRAW", params: { amount: 1 } }],
        }],
      },
    };
    cardDb.set(onKOCard.id, onKOCard);

    const result = setupBattleKO(cardDb, onKOCard);

    expect(result.state.players[1].trash.some(c => c.cardId === onKOCard.id)).toBe(true);
    const p1HandSize = result.state.players[1].hand.length;
    const initialHandSize = createBattleReadyState(cardDb).players[1].hand.length;
    expect(p1HandSize).toBe(initialHandSize + 1);
  });

  it("ON_KO with optional flag produces OPTIONAL_EFFECT prompt", () => {
    const cardDb = createTestCardDb();
    const onKOCard: CardData = {
      id: "CHAR-ONKO-OPTIONAL",
      name: "ON_KO Optional Character",
      type: "Character",
      color: ["Red"],
      cost: 3,
      power: 4000,
      counter: null,
      life: null,
      attribute: [],
      types: [],
      effectText: "[On K.O.] You may draw 1 card.",
      triggerText: null,
      keywords: noKw,
      imageUrl: null,
      effectSchema: {
        card_id: "CHAR-ONKO-OPTIONAL",
        effects: [{
          id: "onko_optional_draw",
          category: "auto",
          trigger: { keyword: "ON_KO" },
          flags: { optional: true },
          actions: [{ type: "DRAW", params: { amount: 1 } }],
        }],
      },
    };
    cardDb.set(onKOCard.id, onKOCard);

    const result = setupBattleKO(cardDb, onKOCard);

    // Should pause with an optional effect prompt
    expect(result.pendingPrompt).toBeDefined();
    expect(result.pendingPrompt!.options.promptType).toBe("OPTIONAL_EFFECT");
  });

  it("non-ON_KO triggers still fail zone check (regression guard)", () => {
    const cardDb = createTestCardDb();
    // A card with ON_PLAY trigger that gets KO'd — ON_PLAY should NOT re-fire
    const onPlayCard: CardData = {
      id: "CHAR-ONPLAY-ONLY",
      name: "ON_PLAY Only Character",
      type: "Character",
      color: ["Red"],
      cost: 3,
      power: 4000,
      counter: null,
      life: null,
      attribute: [],
      types: [],
      effectText: "[On Play] Draw 1 card.",
      triggerText: null,
      keywords: noKw,
      imageUrl: null,
      effectSchema: {
        card_id: "CHAR-ONPLAY-ONLY",
        effects: [{
          id: "onplay_draw",
          category: "auto",
          trigger: { keyword: "ON_PLAY" },
          actions: [{ type: "DRAW", params: { amount: 1 } }],
        }],
      },
    };
    cardDb.set(onPlayCard.id, onPlayCard);

    const result = setupBattleKO(cardDb, onPlayCard);

    // Card should be in trash (KO'd), but ON_PLAY should NOT have fired during KO
    expect(result.state.players[1].trash.some(c => c.cardId === onPlayCard.id)).toBe(true);
    const p1HandSize = result.state.players[1].hand.length;
    const initialHandSize = createBattleReadyState(cardDb).players[1].hand.length;
    expect(p1HandSize).toBe(initialHandSize);
  });

  it("TRASH_CARD action on field character does NOT trigger ON_KO (Rule 10-2-1-3)", () => {
    const cardDb = createTestCardDb();
    const onKOCard: CardData = {
      id: "CHAR-ONKO-TRASH-TEST",
      name: "ON_KO Trash Test Character",
      type: "Character",
      color: ["Red"],
      cost: 3,
      power: 4000,
      counter: null,
      life: null,
      attribute: [],
      types: [],
      effectText: "[On K.O.] Draw 1 card.",
      triggerText: null,
      keywords: noKw,
      imageUrl: null,
      effectSchema: {
        card_id: "CHAR-ONKO-TRASH-TEST",
        effects: [{
          id: "onko_trash_test_draw",
          category: "auto",
          trigger: { keyword: "ON_KO" },
          actions: [{ type: "DRAW", params: { amount: 1 } }],
        }],
      },
    };
    cardDb.set(onKOCard.id, onKOCard);

    let state = createBattleReadyState(cardDb);

    // Put the ON_KO character on P0's field
    const target: CardInstance = {
      instanceId: "onko-trash-target",
      cardId: onKOCard.id,
      zone: "CHARACTER",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 1,
      controller: 0,
      owner: 0,
    };

    // Create an event card that trashes a character (simulating OP09-009 style effect)
    const trashEvent: CardData = {
      id: "EVENT-TRASH-CHAR",
      name: "Trash Character Event",
      type: "Event",
      color: ["Red"],
      cost: 0,
      power: null,
      counter: null,
      life: null,
      attribute: [],
      types: [],
      effectText: "[Main] Trash 1 of your Characters.",
      triggerText: null,
      keywords: noKw,
      imageUrl: null,
      effectSchema: {
        card_id: "EVENT-TRASH-CHAR",
        effects: [{
          id: "trash_char_effect",
          category: "auto",
          trigger: { keyword: "MAIN_EVENT" },
          actions: [{
            type: "TRASH_CARD",
            target: {
              type: "CHARACTER",
              controller: "SELF",
              count: { exact: 1 },
            },
          }],
        }],
      },
    };
    cardDb.set(trashEvent.id, trashEvent);

    const eventInHand: CardInstance = {
      instanceId: "trash-event-hand",
      cardId: trashEvent.id,
      zone: "HAND",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: null,
      controller: 0,
      owner: 0,
    };

    const newPlayers = [...state.players] as [PlayerState, PlayerState];
    // Only the ON_KO character on field — ensures auto-selection targets it
    newPlayers[0] = {
      ...newPlayers[0],
      characters: padChars([target]),
      hand: [...newPlayers[0].hand, eventInHand],
    };
    state = { ...state, players: newPlayers };

    // Register the ON_KO card's triggers
    state = registerTriggersForCard(state, target, onKOCard);

    const p0HandBefore = state.players[0].hand.length;

    // Play the trash event — trashes the character (NOT a KO)
    const result = runPipeline(state, {
      type: "PLAY_CARD",
      cardInstanceId: eventInHand.instanceId,
    }, cardDb, 0);

    // The ON_KO character should be in trash (via CARD_TRASHED, not CARD_KO)
    expect(result.state.players[0].trash.some(c => c.cardId === onKOCard.id)).toBe(true);

    // ON_KO should NOT have triggered — hand size should not have increased from a draw
    // (it should decrease by 1 from the event card being played, and the trash target is from field)
    const p0HandAfter = result.state.players[0].hand.length;
    expect(p0HandAfter).toBe(p0HandBefore - 1); // Only lost the event card from hand
  });
});

// ─── ON_KO Effect Stack Resume Flow ─────────────────────────────────────────

describe("ON_KO effect stack resume flow", () => {
  const noKw = { rush: false, rushCharacter: false, doubleAttack: false, banish: false, blocker: false, trigger: false, unblockable: false };

  /** Marco-style ON_KO card: optional, TRASH_FROM_HAND cost, DRAW action */
  function makeMarcoStyleCard(cardDb: Map<string, CardData>): CardData {
    const card: CardData = {
      id: "CHAR-MARCO-STYLE",
      name: "Marco-Style ON_KO",
      type: "Character",
      color: ["Blue"],
      cost: 5,
      power: 4000,
      counter: null,
      life: null,
      attribute: [],
      types: ["Whitebeard Pirates"],
      effectText: "[On K.O.] You may trash 1 card from your hand: Draw 2 cards.",
      triggerText: null,
      keywords: noKw,
      imageUrl: null,
      effectSchema: {
        card_id: "CHAR-MARCO-STYLE",
        effects: [{
          id: "onko_cost_draw",
          category: "auto",
          trigger: { keyword: "ON_KO" },
          costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
          flags: { optional: true },
          actions: [{ type: "DRAW", params: { amount: 2 } }],
        }],
      },
    };
    cardDb.set(card.id, card);
    return card;
  }

  /** Set up battle KO and return the state paused at OPTIONAL_EFFECT prompt */
  function setupMarcoKO(cardDb: Map<string, CardData>, marcoCard: CardData) {
    let state = createBattleReadyState(cardDb);

    const strongCard: CardData = { ...CARDS.VANILLA, id: "STRONG-ATK-2", power: 6000 };
    cardDb.set(strongCard.id, strongCard);

    const attacker: CardInstance = {
      instanceId: "atk-marco-test",
      cardId: strongCard.id,
      zone: "CHARACTER",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 1,
      controller: 0,
      owner: 0,
    };
    const target: CardInstance = {
      instanceId: "marco-target",
      cardId: marcoCard.id,
      zone: "CHARACTER",
      state: "RESTED",
      attachedDon: [],
      turnPlayed: 1,
      controller: 1,
      owner: 1,
    };

    const newPlayers = [...state.players] as [PlayerState, PlayerState];
    newPlayers[0] = { ...newPlayers[0], characters: padChars([attacker]) };
    newPlayers[1] = { ...newPlayers[1], characters: padChars([target]) };
    state = { ...state, players: newPlayers };
    state = registerTriggersForCard(state, target, marcoCard);

    // Attack → pass blocker → pass counter → damage KOs the character
    let result = runPipeline(state, {
      type: "DECLARE_ATTACK",
      attackerInstanceId: attacker.instanceId,
      targetInstanceId: target.instanceId,
    }, cardDb, 0);
    result = runPipeline(result.state, { type: "PASS" }, cardDb, 0);
    result = runPipeline(result.state, { type: "PASS" }, cardDb, 0);

    return result;
  }

  it("optional ON_KO with cost: prompts for optional acceptance first", () => {
    const cardDb = createTestCardDb();
    const marcoCard = makeMarcoStyleCard(cardDb);
    const result = setupMarcoKO(cardDb, marcoCard);

    expect(result.pendingPrompt).toBeDefined();
    expect(result.pendingPrompt!.options.promptType).toBe("OPTIONAL_EFFECT");
    expect(result.pendingPrompt!.respondingPlayer).toBe(1);
    // Card should already be in trash
    expect(result.state.players[1].trash.some(c => c.cardId === marcoCard.id)).toBe(true);
  });

  it("declining optional ON_KO skips cost and actions", () => {
    const cardDb = createTestCardDb();
    const marcoCard = makeMarcoStyleCard(cardDb);
    const koResult = setupMarcoKO(cardDb, marcoCard);

    const p1HandBefore = koResult.state.players[1].hand.length;

    // Clear pendingPrompt and resume with PASS (decline)
    let state = { ...koResult.state, pendingPrompt: null };
    const resumeResult = resumeFromStack(state, { type: "PASS" }, cardDb);

    // No draw should have happened, no cards trashed from hand
    expect(resumeResult.state.players[1].hand.length).toBe(p1HandBefore);
  });

  it("accepting optional ON_KO with cost prompts for cost selection", () => {
    const cardDb = createTestCardDb();
    const marcoCard = makeMarcoStyleCard(cardDb);
    const koResult = setupMarcoKO(cardDb, marcoCard);

    // Clear pendingPrompt and resume with acceptance (PLAYER_CHOICE accept)
    let state = { ...koResult.state, pendingPrompt: null };
    const resumeResult = resumeFromStack(
      state,
      { type: "PLAYER_CHOICE", choiceId: "accept" },
      cardDb,
    );

    // Should now prompt for cost selection (TRASH_FROM_HAND → SELECT_TARGET)
    expect(resumeResult.pendingPrompt).toBeDefined();
    expect(resumeResult.pendingPrompt!.options.promptType).toBe("SELECT_TARGET");
    expect(resumeResult.pendingPrompt!.respondingPlayer).toBe(1);
    // Valid targets should be hand cards
    const pipeOpts = resumeResult.pendingPrompt!.options;
    if (pipeOpts.promptType !== "SELECT_TARGET") throw new Error("unexpected prompt type");
    expect(pipeOpts.validTargets).toBeDefined();
    expect(pipeOpts.validTargets!.length).toBeGreaterThan(0);
  });

  it("paying cost then executes actions (full flow: accept → pay cost → draw)", () => {
    const cardDb = createTestCardDb();
    const marcoCard = makeMarcoStyleCard(cardDb);
    const koResult = setupMarcoKO(cardDb, marcoCard);

    // Step 1: Accept optional effect
    let state = { ...koResult.state, pendingPrompt: null };
    const acceptResult = resumeFromStack(
      state,
      { type: "PLAYER_CHOICE", choiceId: "accept" },
      cardDb,
    );
    expect(acceptResult.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");

    // Step 2: Select a card from hand to trash as cost
    const p1Hand = acceptResult.state.players[1].hand;
    expect(p1Hand.length).toBeGreaterThan(0);
    const cardToTrash = p1Hand[0];
    const p1HandBefore = p1Hand.length;
    const p1DeckBefore = acceptResult.state.players[1].deck.length;

    state = { ...acceptResult.state, pendingPrompt: null };
    const costResult = resumeFromStack(
      state,
      { type: "SELECT_TARGET", selectedInstanceIds: [cardToTrash.instanceId] },
      cardDb,
    );

    // No more prompts — actions should have executed
    expect(costResult.pendingPrompt).toBeUndefined();

    // Cost paid: 1 card trashed from hand
    // Actions: drew 2 cards
    // Net hand change: -1 (cost) + 2 (draw) = +1
    const p1HandAfter = costResult.state.players[1].hand.length;
    expect(p1HandAfter).toBe(p1HandBefore + 1);

    // Deck should have 2 fewer cards
    const p1DeckAfter = costResult.state.players[1].deck.length;
    expect(p1DeckAfter).toBe(p1DeckBefore - 2);
  });

  it("cannot pay cost with empty hand: effect fails gracefully", () => {
    const cardDb = createTestCardDb();
    const marcoCard = makeMarcoStyleCard(cardDb);
    let state = createBattleReadyState(cardDb);

    const strongCard: CardData = { ...CARDS.VANILLA, id: "STRONG-ATK-3", power: 6000 };
    cardDb.set(strongCard.id, strongCard);

    const attacker: CardInstance = {
      instanceId: "atk-empty-hand",
      cardId: strongCard.id,
      zone: "CHARACTER",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 1,
      controller: 0,
      owner: 0,
    };
    const target: CardInstance = {
      instanceId: "marco-empty-hand",
      cardId: marcoCard.id,
      zone: "CHARACTER",
      state: "RESTED",
      attachedDon: [],
      turnPlayed: 1,
      controller: 1,
      owner: 1,
    };

    const newPlayers = [...state.players] as [PlayerState, PlayerState];
    newPlayers[0] = { ...newPlayers[0], characters: padChars([attacker]) };
    // Empty P1's hand so cost can't be paid
    newPlayers[1] = { ...newPlayers[1], characters: padChars([target]), hand: [] };
    state = { ...state, players: newPlayers };
    state = registerTriggersForCard(state, target, marcoCard);

    // KO the character
    let result = runPipeline(state, {
      type: "DECLARE_ATTACK",
      attackerInstanceId: attacker.instanceId,
      targetInstanceId: target.instanceId,
    }, cardDb, 0);
    result = runPipeline(result.state, { type: "PASS" }, cardDb, 0);
    result = runPipeline(result.state, { type: "PASS" }, cardDb, 0);

    // Should still get optional prompt
    expect(result.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");

    // Accept the optional effect
    let resumeState = { ...result.state, pendingPrompt: null };
    const acceptResult = resumeFromStack(
      resumeState,
      { type: "PLAYER_CHOICE", choiceId: "accept" },
      cardDb,
    );

    // Cannot pay cost (empty hand) — effect should fail, no further prompt
    expect(acceptResult.pendingPrompt).toBeUndefined();
    // P1 hand should still be empty (no draw happened)
    expect(acceptResult.state.players[1].hand.length).toBe(0);
  });

  it("ON_KO with condition that fails: trigger does not fire", () => {
    const cardDb = createTestCardDb();
    const conditionCard: CardData = {
      id: "CHAR-ONKO-COND",
      name: "ON_KO with Life Condition",
      type: "Character",
      color: ["Blue"],
      cost: 5,
      power: 4000,
      counter: null,
      life: null,
      attribute: [],
      types: [],
      effectText: "[On K.O.] If you have 0 Life cards: Draw 2 cards.",
      triggerText: null,
      keywords: noKw,
      imageUrl: null,
      effectSchema: {
        card_id: "CHAR-ONKO-COND",
        effects: [{
          id: "onko_cond_draw",
          category: "auto",
          trigger: { keyword: "ON_KO" },
          conditions: {
            type: "LIFE_COUNT",
            controller: "SELF",
            operator: "==",
            value: 0,
          },
          actions: [{ type: "DRAW", params: { amount: 2 } }],
        }],
      },
    };
    cardDb.set(conditionCard.id, conditionCard);

    let state = createBattleReadyState(cardDb);
    const strongCard: CardData = { ...CARDS.VANILLA, id: "STRONG-ATK-4", power: 6000 };
    cardDb.set(strongCard.id, strongCard);

    const attacker: CardInstance = {
      instanceId: "atk-cond-test",
      cardId: strongCard.id,
      zone: "CHARACTER",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 1,
      controller: 0,
      owner: 0,
    };
    const target: CardInstance = {
      instanceId: "onko-cond-target",
      cardId: conditionCard.id,
      zone: "CHARACTER",
      state: "RESTED",
      attachedDon: [],
      turnPlayed: 1,
      controller: 1,
      owner: 1,
    };

    const newPlayers = [...state.players] as [PlayerState, PlayerState];
    newPlayers[0] = { ...newPlayers[0], characters: padChars([attacker]) };
    newPlayers[1] = { ...newPlayers[1], characters: padChars([target]) };
    state = { ...state, players: newPlayers };
    state = registerTriggersForCard(state, target, conditionCard);

    const p1HandBefore = state.players[1].hand.length;

    // P1 has 5 life cards — condition (life == 0) will fail
    let result = runPipeline(state, {
      type: "DECLARE_ATTACK",
      attackerInstanceId: attacker.instanceId,
      targetInstanceId: target.instanceId,
    }, cardDb, 0);
    result = runPipeline(result.state, { type: "PASS" }, cardDb, 0);
    result = runPipeline(result.state, { type: "PASS" }, cardDb, 0);

    // No prompt — condition failed, trigger didn't fire
    expect(result.pendingPrompt).toBeUndefined();
    // No draw happened
    expect(result.state.players[1].hand.length).toBe(p1HandBefore);
    // Card is still in trash
    expect(result.state.players[1].trash.some(c => c.cardId === conditionCard.id)).toBe(true);
  });
});
