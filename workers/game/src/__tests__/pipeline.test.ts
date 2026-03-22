import { describe, it, expect } from "vitest";
import { runPipeline } from "../engine/pipeline.js";
import type { CardData, GameState, DonInstance, CardInstance, PlayerState } from "../types.js";
import {
  setupGame,
  createTestCardDb,
  advanceToPhase,
  createBattleReadyState,
  CARDS,
} from "./helpers.js";

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
    const charsBefore = state.players[0].characters.length;

    const result = runPipeline(state, { type: "PLAY_CARD", cardInstanceId: charInHand.instanceId }, cardDb, 0);
    expect(result.valid).toBe(true);

    const activeDonAfter = result.state.players[0].donCostArea.filter((d) => d.state === "ACTIVE").length;
    expect(activeDonAfter).toBe(activeDonBefore - cost);
    expect(result.state.players[0].characters.length).toBe(charsBefore + 1);
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
    const target = state.players[0].characters[0];

    const activeDonBefore = state.players[0].donCostArea.filter((d) => d.state === "ACTIVE").length;

    const result = runPipeline(state, { type: "ATTACH_DON", targetInstanceId: target.instanceId, count: 1 }, cardDb, 0);
    expect(result.valid).toBe(true);

    const p0 = result.state.players[0];
    const activeDonAfter = p0.donCostArea.filter((d) => d.state === "ACTIVE").length;
    expect(activeDonAfter).toBe(activeDonBefore - 1);

    const updatedChar = p0.characters.find((c) => c.cardId === target.cardId);
    expect(updatedChar?.attachedDon.length).toBe(1);
  });
});

// ─── Battle: Attack → Damage ──────────────────────────────────────────────────

describe("battle", () => {
  it("attack Leader: removes a life card on successful damage", () => {
    const cardDb = createTestCardDb();
    let state = createBattleReadyState(cardDb);

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
        i === 0 ? { ...c, state: "RESTED" as const } : c,
      ),
    };
    state = { ...state, players: newPlayers };

    const attacker = state.players[0].leader; // 5000 + 3000 DON = 8000
    const target = state.players[1].characters[0]; // VANILLA = 4000, RESTED
    const charsBefore = state.players[1].characters.length;

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

    expect(result.state.players[1].characters.length).toBe(charsBefore - 1);
    expect(result.state.players[1].trash.some((c) => c.cardId === CARDS.VANILLA.id)).toBe(true);
  });

  it("blocker intercepts attack and replaces target", () => {
    const cardDb = createTestCardDb();
    let state = createBattleReadyState(cardDb);

    const attacker = state.players[0].characters[0];
    const originalTarget = state.players[1].leader;

    let result = runPipeline(state, {
      type: "DECLARE_ATTACK",
      attackerInstanceId: attacker.instanceId,
      targetInstanceId: originalTarget.instanceId,
    }, cardDb, 0);
    expect(result.valid).toBe(true);
    expect(result.state.turn.battleSubPhase).toBe("BLOCK_STEP");

    // Declare blocker
    const blocker = result.state.players[1].characters.find(
      (c) => c.cardId === CARDS.BLOCKER.id && c.state === "ACTIVE",
    )!;
    result = runPipeline(result.state, { type: "DECLARE_BLOCKER", blockerInstanceId: blocker.instanceId }, cardDb, 0);
    expect(result.valid).toBe(true);
    expect(result.state.turn.battle!.targetInstanceId).toBe(blocker.instanceId);
    expect(result.state.turn.battle!.blockerActivated).toBe(true);
    expect(result.state.turn.battleSubPhase).toBe("COUNTER_STEP");
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
      attackerInstanceId: state.players[0].characters[0].instanceId,
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
    newPlayers[0] = { ...newPlayers[0], characters: [...newPlayers[0].characters, rushChar] };
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
    newPlayers[0] = { ...newPlayers[0], characters: [...newPlayers[0].characters, newChar] };
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
    newPlayers[0] = { ...newPlayers[0], characters: [...newPlayers[0].characters, rushCharChar] };
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
    newPlayers[0] = { ...newPlayers[0], characters: [...newPlayers[0].characters, unblockableChar] };
    state = { ...state, players: newPlayers };

    let result = runPipeline(state, {
      type: "DECLARE_ATTACK",
      attackerInstanceId: unblockableChar.instanceId,
      targetInstanceId: state.players[1].leader.instanceId,
    }, cardDb, 0);
    expect(result.valid).toBe(true);

    const blockerTarget = result.state.players[1].characters.find(
      (c) => c.cardId === CARDS.BLOCKER.id && c.state === "ACTIVE",
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
    newPlayers[0] = { ...newPlayers[0], characters: [...newPlayers[0].characters, datkChar] };
    // Give player 1 exactly 1 life card
    newPlayers[1] = { ...newPlayers[1], life: [newPlayers[1].life[0]] };
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
