import { describe, it, expect } from "vitest";
import type { CardData, CardInstance, DonInstance, GameState, PlayerState } from "../types.js";
import { getEffectivePower, getEffectiveCost, getBattleDefenderPower } from "../engine/modifiers.js";
import { checkDefeat } from "../engine/defeat.js";
import {
  moveCard, findCardInState, removeTopLifeCard,
  returnDonToDeck, drawCards,
  isOnField, isOpenArea, isSecretArea,
} from "../engine/state.js";
import { canAttackThisTurn, canAttackLeader } from "../engine/keywords.js";
import { setupGame, createTestCardDb, CARDS } from "./helpers.js";

// ─── Modifiers ────────────────────────────────────────────────────────────────

describe("getEffectivePower", () => {
  it("returns base power when no DON!! attached", () => {
    const { state } = setupGame();
    const leader = state.players[0].leader;
    const leaderData = CARDS.LEADER;
    const power = getEffectivePower(leader, leaderData, state);
    expect(power).toBe(5000);
  });

  it("adds +1000 per DON!! on owner's turn", () => {
    const { state } = setupGame();
    const don1: DonInstance = { instanceId: "d1", state: "ACTIVE", attachedTo: "x" };
    const don2: DonInstance = { instanceId: "d2", state: "ACTIVE", attachedTo: "x" };
    const leader: CardInstance = { ...state.players[0].leader, attachedDon: [don1, don2] };

    // Player 0's turn (activePlayerIndex = 0, owner = 0) → DON bonus applies
    const power = getEffectivePower(leader, CARDS.LEADER, state);
    expect(power).toBe(5000 + 2000);
  });

  it("does NOT add DON!! bonus on opponent's turn", () => {
    let { state } = setupGame();
    state = { ...state, turn: { ...state.turn, activePlayerIndex: 1 } };

    const don1: DonInstance = { instanceId: "d1", state: "ACTIVE", attachedTo: "x" };
    const leader: CardInstance = { ...state.players[0].leader, attachedDon: [don1] };

    // Player 1's turn, but leader belongs to player 0 → no bonus
    const power = getEffectivePower(leader, CARDS.LEADER, state);
    expect(power).toBe(5000);
  });
});

describe("getEffectiveCost", () => {
  it("returns base cost", () => {
    expect(getEffectiveCost(CARDS.VANILLA)).toBe(3);
  });

  it("clamps to 0", () => {
    const zeroCostCard = { ...CARDS.VANILLA, cost: 0 };
    expect(getEffectiveCost(zeroCostCard)).toBe(0);
  });
});

describe("getBattleDefenderPower", () => {
  it("adds counter power to effective power", () => {
    const { state } = setupGame();
    const leader = state.players[0].leader;
    const power = getBattleDefenderPower(leader, CARDS.LEADER, 2000, state);
    expect(power).toBe(5000 + 2000);
  });
});

// ─── State helpers ────────────────────────────────────────────────────────────

describe("moveCard", () => {
  it("assigns new instanceId on zone transition", () => {
    const { state } = setupGame();
    const card = state.players[0].hand[0];
    const oldId = card.instanceId;

    const newState = moveCard(state, oldId, "CHARACTER");
    const movedCard = newState.players[0].characters.find(
      (c) => c.cardId === card.cardId,
    );
    expect(movedCard).toBeTruthy();
    expect(movedCard!.instanceId).not.toBe(oldId);
  });

  it("strips attached DON!! and returns them to cost area", () => {
    const { state } = setupGame();

    // Manually create a character with attached DON!!
    const don: DonInstance = { instanceId: "attached-don", state: "ACTIVE", attachedTo: "char-with-don" };
    const charWithDon: CardInstance = {
      instanceId: "char-with-don",
      cardId: CARDS.VANILLA.id,
      zone: "CHARACTER",
      state: "ACTIVE",
      attachedDon: [don],
      turnPlayed: 1,
      controller: 0,
      owner: 0,
    };

    const newPlayers = [...state.players] as [PlayerState, PlayerState];
    newPlayers[0] = { ...newPlayers[0], characters: [charWithDon] };
    const modifiedState = { ...state, players: newPlayers };

    const afterMove = moveCard(modifiedState, "char-with-don", "TRASH");

    // DON!! should be returned to cost area
    const returnedDon = afterMove.players[0].donCostArea.find(
      (d) => d.instanceId === "attached-don",
    );
    expect(returnedDon).toBeTruthy();
    expect(returnedDon!.state).toBe("RESTED");
    expect(returnedDon!.attachedTo).toBeNull();
  });

  it("removes card from source zone", () => {
    const { state } = setupGame();
    const card = state.players[0].hand[0];

    const newState = moveCard(state, card.instanceId, "TRASH");
    expect(newState.players[0].hand.find((c) => c.instanceId === card.instanceId)).toBeUndefined();
  });
});

describe("findCardInState", () => {
  it("finds a card in hand", () => {
    const { state } = setupGame();
    const card = state.players[0].hand[0];
    const found = findCardInState(state, card.instanceId);
    expect(found).toBeTruthy();
    expect(found!.playerIndex).toBe(0);
    expect(found!.card.zone).toBe("HAND");
  });

  it("finds the leader", () => {
    const { state } = setupGame();
    const found = findCardInState(state, state.players[0].leader.instanceId);
    expect(found).toBeTruthy();
    expect(found!.card.zone).toBe("LEADER");
  });

  it("returns null for nonexistent instanceId", () => {
    const { state } = setupGame();
    expect(findCardInState(state, "nonexistent")).toBeNull();
  });
});

describe("removeTopLifeCard", () => {
  it("removes the first life card", () => {
    const { state } = setupGame();
    const lifeBefore = state.players[0].life.length;

    const result = removeTopLifeCard(state, 0);
    expect(result).toBeTruthy();
    expect(result!.state.players[0].life.length).toBe(lifeBefore - 1);
    expect(result!.lifeCard).toBeTruthy();
  });

  it("life area ordering: top-of-deck card is last removed (§5-2-1-7, §2-9-2-1)", () => {
    // After the §5-2-1-7 fix, buildInitialState reverses life cards so that
    // the first card drawn from the deck (top of deck) ends up at life[last].
    // removeTopLifeCard takes life[0], so the top-of-deck card is removed LAST.
    const { state } = setupGame();
    expect(state.players[0].life.length).toBe(5);

    // All life cards should have unique instanceIds and be face-down
    const lifeIds = state.players[0].life.map((lc) => lc.instanceId);
    expect(new Set(lifeIds).size).toBe(5);
    for (const lc of state.players[0].life) {
      expect(lc.face).toBe("DOWN");
    }

    // Verify removeTopLifeCard drains from front (life[0] first, life[4] last)
    let s = state;
    for (let i = 0; i < 5; i++) {
      const result = removeTopLifeCard(s, 0);
      expect(result).not.toBeNull();
      expect(result!.lifeCard.instanceId).toBe(lifeIds[i]);
      s = result!.state;
    }
    expect(removeTopLifeCard(s, 0)).toBeNull();
  });

  it("returns null when life is empty", () => {
    let { state } = setupGame();
    const newPlayers = [...state.players] as [PlayerState, PlayerState];
    newPlayers[0] = { ...newPlayers[0], life: [] };
    state = { ...state, players: newPlayers };

    expect(removeTopLifeCard(state, 0)).toBeNull();
  });
});

// ─── Defeat checks ────────────────────────────────────────────────────────────

describe("checkDefeat", () => {
  it("returns null when game is not over", () => {
    const { state } = setupGame();
    expect(checkDefeat(state)).toBeNull();
  });

  it("detects deck-out for player 0", () => {
    let { state } = setupGame();
    const newPlayers = [...state.players] as [PlayerState, PlayerState];
    newPlayers[0] = { ...newPlayers[0], deck: [] };
    state = { ...state, players: newPlayers };

    const result = checkDefeat(state);
    expect(result).toBeTruthy();
    expect(result!.winner).toBe(1);
  });

  it("detects life-out when damaged", () => {
    let { state } = setupGame();
    const newPlayers = [...state.players] as [PlayerState, PlayerState];
    newPlayers[1] = { ...newPlayers[1], life: [] };
    state = { ...state, players: newPlayers };

    const result = checkDefeat(state, { damagedPlayerIndex: 1 });
    expect(result).toBeTruthy();
    expect(result!.winner).toBe(0);
  });

  it("does NOT trigger life-out without damage context", () => {
    let { state } = setupGame();
    const newPlayers = [...state.players] as [PlayerState, PlayerState];
    newPlayers[1] = { ...newPlayers[1], life: [] };
    state = { ...state, players: newPlayers };

    // No damage context → 0 life alone is not defeat
    const result = checkDefeat(state);
    expect(result).toBeNull();
  });

  it("simultaneous defeat → draw", () => {
    let { state } = setupGame();
    const newPlayers = [...state.players] as [PlayerState, PlayerState];
    newPlayers[0] = { ...newPlayers[0], deck: [] };
    newPlayers[1] = { ...newPlayers[1], deck: [] };
    state = { ...state, players: newPlayers };

    const result = checkDefeat(state);
    expect(result).toBeTruthy();
    expect(result!.winner).toBeNull();
  });
});

// ─── returnDonToDeck ──────────────────────────────────────────────────────────

describe("returnDonToDeck", () => {
  it("returns DON!! from cost area to DON!! deck (§8-3-1-6)", () => {
    let { state } = setupGame();

    // Give player 0 DON!! in cost area
    const newPlayers = [...state.players] as [PlayerState, PlayerState];
    newPlayers[0] = {
      ...newPlayers[0],
      donCostArea: [
        { instanceId: "don-a", state: "ACTIVE", attachedTo: null },
        { instanceId: "don-b", state: "ACTIVE", attachedTo: null },
      ],
      donDeck: [],
    };
    state = { ...state, players: newPlayers };

    const result = returnDonToDeck(state, 0, 1);
    expect(result.players[0].donCostArea.length).toBe(1);
    expect(result.players[0].donDeck.length).toBe(1);
  });

  it("prefers rested DON!! over active", () => {
    let { state } = setupGame();

    const newPlayers = [...state.players] as [PlayerState, PlayerState];
    newPlayers[0] = {
      ...newPlayers[0],
      donCostArea: [
        { instanceId: "don-active", state: "ACTIVE", attachedTo: null },
        { instanceId: "don-rested", state: "RESTED", attachedTo: null },
      ],
      donDeck: [],
    };
    state = { ...state, players: newPlayers };

    const result = returnDonToDeck(state, 0, 1);
    expect(result.players[0].donCostArea[0].instanceId).toBe("don-active");
    expect(result.players[0].donDeck[0].instanceId).toBe("don-rested");
  });

  it("handles count > available gracefully", () => {
    let { state } = setupGame();

    const newPlayers = [...state.players] as [PlayerState, PlayerState];
    newPlayers[0] = {
      ...newPlayers[0],
      donCostArea: [{ instanceId: "don-only", state: "ACTIVE", attachedTo: null }],
      donDeck: [],
    };
    state = { ...state, players: newPlayers };

    const result = returnDonToDeck(state, 0, 5);
    expect(result.players[0].donCostArea.length).toBe(0);
    expect(result.players[0].donDeck.length).toBe(1);
  });

  it("skips DON!! attached to cards", () => {
    let { state } = setupGame();

    const newPlayers = [...state.players] as [PlayerState, PlayerState];
    newPlayers[0] = {
      ...newPlayers[0],
      donCostArea: [
        { instanceId: "don-free", state: "ACTIVE", attachedTo: null },
        { instanceId: "don-attached", state: "ACTIVE", attachedTo: "some-card" },
      ],
      donDeck: [],
    };
    state = { ...state, players: newPlayers };

    const result = returnDonToDeck(state, 0, 2);
    expect(result.players[0].donCostArea.length).toBe(1);
    expect(result.players[0].donCostArea[0].instanceId).toBe("don-attached");
    expect(result.players[0].donDeck.length).toBe(1);
  });
});

// ─── drawCards ────────────────────────────────────────────────────────────────

describe("drawCards", () => {
  it("draws N cards from deck to hand with CARD_DRAWN events (§4-5-3)", () => {
    const { state } = setupGame();
    const deckBefore = state.players[0].deck.length;
    const handBefore = state.players[0].hand.length;

    const { state: after, events } = drawCards(state, 0, 2);
    expect(after.players[0].deck.length).toBe(deckBefore - 2);
    expect(after.players[0].hand.length).toBe(handBefore + 2);
    expect(events.length).toBe(2);
    expect(events[0].type).toBe("CARD_DRAWN");
    expect(events[1].type).toBe("CARD_DRAWN");
  });

  it("stops early if deck runs out (§4-5-3-1)", () => {
    let { state } = setupGame();

    // Leave only 1 card in deck
    const newPlayers = [...state.players] as [PlayerState, PlayerState];
    newPlayers[0] = { ...newPlayers[0], deck: [newPlayers[0].deck[0]] };
    state = { ...state, players: newPlayers };

    const { state: after, events } = drawCards(state, 0, 3);
    expect(after.players[0].deck.length).toBe(0);
    expect(events.length).toBe(1);
  });

  it("returns unchanged state when deck is empty", () => {
    let { state } = setupGame();

    const newPlayers = [...state.players] as [PlayerState, PlayerState];
    newPlayers[0] = { ...newPlayers[0], deck: [] };
    state = { ...state, players: newPlayers };

    const { state: after, events } = drawCards(state, 0, 1);
    expect(after.players[0].hand.length).toBe(state.players[0].hand.length);
    expect(events.length).toBe(0);
  });
});

// ─── Zone classification helpers ──────────────────────────────────────────────

describe("isOnField", () => {
  it("returns true for field zones (§3-1-2)", () => {
    expect(isOnField("LEADER")).toBe(true);
    expect(isOnField("CHARACTER")).toBe(true);
    expect(isOnField("STAGE")).toBe(true);
    expect(isOnField("COST_AREA")).toBe(true);
  });

  it("returns false for non-field zones", () => {
    expect(isOnField("HAND")).toBe(false);
    expect(isOnField("DECK")).toBe(false);
    expect(isOnField("TRASH")).toBe(false);
    expect(isOnField("LIFE")).toBe(false);
    expect(isOnField("DON_DECK")).toBe(false);
    expect(isOnField("REMOVED_FROM_GAME")).toBe(false);
  });
});

describe("isOpenArea / isSecretArea", () => {
  it("open zones are visible to all players (§3-1-5)", () => {
    expect(isOpenArea("LEADER")).toBe(true);
    expect(isOpenArea("CHARACTER")).toBe(true);
    expect(isOpenArea("STAGE")).toBe(true);
    expect(isOpenArea("COST_AREA")).toBe(true);
    expect(isOpenArea("DON_DECK")).toBe(true);
    expect(isOpenArea("TRASH")).toBe(true);
  });

  it("secret zones are hidden from opponents (§8-4-5)", () => {
    expect(isSecretArea("HAND")).toBe(true);
    expect(isSecretArea("DECK")).toBe(true);
    expect(isSecretArea("LIFE")).toBe(true);
  });

  it("open and secret are mutually exclusive for standard zones", () => {
    const allZones: import("../types.js").Zone[] = [
      "LEADER", "CHARACTER", "STAGE", "COST_AREA", "HAND",
      "DECK", "TRASH", "LIFE", "DON_DECK", "REMOVED_FROM_GAME",
    ];
    for (const z of allZones) {
      if (z === "REMOVED_FROM_GAME") continue; // special zone, neither open nor secret
      expect(isOpenArea(z) !== isSecretArea(z)).toBe(true);
    }
  });
});

// ─── Keyword helpers ──────────────────────────────────────────────────────────

describe("canAttackThisTurn", () => {
  it("Leader can always attack", () => {
    const { state } = setupGame();
    const leader = state.players[0].leader;
    expect(canAttackThisTurn(leader, CARDS.LEADER, state)).toBe(true);
  });

  it("character played on a previous turn can attack", () => {
    const state = { turn: { number: 3 } } as GameState;
    const card: CardInstance = {
      instanceId: "c1", cardId: CARDS.VANILLA.id, zone: "CHARACTER",
      state: "ACTIVE", attachedDon: [], turnPlayed: 2, controller: 0, owner: 0,
    };
    expect(canAttackThisTurn(card, CARDS.VANILLA, state)).toBe(true);
  });

  it("vanilla character played this turn cannot attack", () => {
    const state = { turn: { number: 3 } } as GameState;
    const card: CardInstance = {
      instanceId: "c1", cardId: CARDS.VANILLA.id, zone: "CHARACTER",
      state: "ACTIVE", attachedDon: [], turnPlayed: 3, controller: 0, owner: 0,
    };
    expect(canAttackThisTurn(card, CARDS.VANILLA, state)).toBe(false);
  });

  it("Rush character played this turn CAN attack", () => {
    const state = { turn: { number: 3 } } as GameState;
    const card: CardInstance = {
      instanceId: "c1", cardId: CARDS.RUSH.id, zone: "CHARACTER",
      state: "ACTIVE", attachedDon: [], turnPlayed: 3, controller: 0, owner: 0,
    };
    expect(canAttackThisTurn(card, CARDS.RUSH, state)).toBe(true);
  });
});

describe("canAttackLeader", () => {
  it("Rush:Character cannot attack Leader on turn played", () => {
    const state = { turn: { number: 3 } } as GameState;
    const card: CardInstance = {
      instanceId: "c1", cardId: CARDS.RUSH_CHAR.id, zone: "CHARACTER",
      state: "ACTIVE", attachedDon: [], turnPlayed: 3, controller: 0, owner: 0,
    };
    expect(canAttackLeader(card, CARDS.RUSH_CHAR, state)).toBe(false);
  });

  it("Rush:Character CAN attack Leader on subsequent turns", () => {
    const state = { turn: { number: 4 } } as GameState;
    const card: CardInstance = {
      instanceId: "c1", cardId: CARDS.RUSH_CHAR.id, zone: "CHARACTER",
      state: "ACTIVE", attachedDon: [], turnPlayed: 3, controller: 0, owner: 0,
    };
    expect(canAttackLeader(card, CARDS.RUSH_CHAR, state)).toBe(true);
  });
});
