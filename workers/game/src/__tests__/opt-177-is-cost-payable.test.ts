/**
 * OPT-177 — isCostPayable unit tests
 *
 * Positive (payable) and negative (unpayable) cases for every cost type.
 */

import { describe, it, expect } from "vitest";
import type { CardData, CardInstance, PlayerState, DonInstance, LifeCard } from "../types.js";
import type { Cost, SimpleCost, ChoiceCost } from "../engine/effect-types.js";
import { isCostPayable } from "../engine/effect-resolver/cost-handler.js";
import { createTestCardDb, createBattleReadyState, CARDS, padChars } from "./helpers.js";

function makeState(cardDb: Map<string, CardData>) {
  return createBattleReadyState(cardDb);
}

function withPlayer(
  state: ReturnType<typeof makeState>,
  playerIdx: 0 | 1,
  patch: Partial<PlayerState>,
): ReturnType<typeof makeState> {
  const newPlayers = [...state.players] as [PlayerState, PlayerState];
  newPlayers[playerIdx] = { ...newPlayers[playerIdx], ...patch };
  return { ...state, players: newPlayers };
}

const SOURCE_CHAR_ID = "char-0-v1";

describe("OPT-177: isCostPayable", () => {
  // ─── DON_MINUS ──────────────────────────────────────────────────────────────

  describe("DON_MINUS", () => {
    it("payable when field DON >= amount", () => {
      const cardDb = createTestCardDb();
      const state = makeState(cardDb);
      const cost: Cost = { type: "DON_MINUS", amount: 2 };
      expect(isCostPayable(state, cost, 0, cardDb)).toBe(true);
    });

    it("unpayable when field DON < amount", () => {
      const cardDb = createTestCardDb();
      const state = withPlayer(makeState(cardDb), 0, { donCostArea: [] });
      const cost: Cost = { type: "DON_MINUS", amount: 1 };
      expect(isCostPayable(state, cost, 0, cardDb)).toBe(false);
    });
  });

  // ─── DON_REST ───────────────────────────────────────────────────────────────

  describe("DON_REST", () => {
    it("payable when active DON >= amount", () => {
      const cardDb = createTestCardDb();
      const state = makeState(cardDb);
      const cost: Cost = { type: "DON_REST", amount: 3 };
      expect(isCostPayable(state, cost, 0, cardDb)).toBe(true);
    });

    it("unpayable when active DON < amount", () => {
      const cardDb = createTestCardDb();
      const state = withPlayer(makeState(cardDb), 0, {
        donCostArea: [{ instanceId: "don-0", state: "RESTED" as const, attachedTo: null }],
      });
      const cost: Cost = { type: "DON_REST", amount: 1 };
      expect(isCostPayable(state, cost, 0, cardDb)).toBe(false);
    });

    it("ANY_NUMBER is always payable", () => {
      const cardDb = createTestCardDb();
      const state = withPlayer(makeState(cardDb), 0, { donCostArea: [] });
      const cost: Cost = { type: "DON_REST", amount: "ANY_NUMBER" };
      expect(isCostPayable(state, cost, 0, cardDb)).toBe(true);
    });
  });

  // ─── REST_DON ───────────────────────────────────────────────────────────────

  describe("REST_DON", () => {
    it("payable when active DON >= amount", () => {
      const cardDb = createTestCardDb();
      const state = makeState(cardDb);
      const cost: Cost = { type: "REST_DON", amount: 2 };
      expect(isCostPayable(state, cost, 0, cardDb)).toBe(true);
    });

    it("unpayable when active DON < amount", () => {
      const cardDb = createTestCardDb();
      const state = withPlayer(makeState(cardDb), 0, { donCostArea: [] });
      const cost: Cost = { type: "REST_DON", amount: 1 };
      expect(isCostPayable(state, cost, 0, cardDb)).toBe(false);
    });
  });

  // ─── VARIABLE_DON_RETURN ────────────────────────────────────────────────────

  describe("VARIABLE_DON_RETURN", () => {
    it("payable when unattached DON >= amount", () => {
      const cardDb = createTestCardDb();
      const state = makeState(cardDb);
      const cost: Cost = { type: "VARIABLE_DON_RETURN", amount: 2 };
      expect(isCostPayable(state, cost, 0, cardDb)).toBe(true);
    });

    it("unpayable when unattached DON < amount", () => {
      const cardDb = createTestCardDb();
      const state = withPlayer(makeState(cardDb), 0, { donCostArea: [] });
      const cost: Cost = { type: "VARIABLE_DON_RETURN", amount: 1 };
      expect(isCostPayable(state, cost, 0, cardDb)).toBe(false);
    });

    it("amount 0 is always payable", () => {
      const cardDb = createTestCardDb();
      const state = withPlayer(makeState(cardDb), 0, { donCostArea: [] });
      const cost: Cost = { type: "VARIABLE_DON_RETURN", amount: 0 };
      expect(isCostPayable(state, cost, 0, cardDb)).toBe(true);
    });
  });

  // ─── REST_SELF ──────────────────────────────────────────────────────────────

  describe("REST_SELF", () => {
    it("payable when sourceCardInstanceId provided", () => {
      const cardDb = createTestCardDb();
      const state = makeState(cardDb);
      const cost: Cost = { type: "REST_SELF" };
      expect(isCostPayable(state, cost, 0, cardDb, SOURCE_CHAR_ID)).toBe(true);
    });

    it("unpayable without sourceCardInstanceId", () => {
      const cardDb = createTestCardDb();
      const state = makeState(cardDb);
      const cost: Cost = { type: "REST_SELF" };
      expect(isCostPayable(state, cost, 0, cardDb)).toBe(false);
    });
  });

  // ─── TRASH_SELF ─────────────────────────────────────────────────────────────

  describe("TRASH_SELF", () => {
    it("payable when source card is on the field", () => {
      const cardDb = createTestCardDb();
      const state = makeState(cardDb);
      const cost: Cost = { type: "TRASH_SELF" };
      expect(isCostPayable(state, cost, 0, cardDb, SOURCE_CHAR_ID)).toBe(true);
    });

    it("unpayable when source card not on field", () => {
      const cardDb = createTestCardDb();
      const state = makeState(cardDb);
      const cost: Cost = { type: "TRASH_SELF" };
      expect(isCostPayable(state, cost, 0, cardDb, "nonexistent-card")).toBe(false);
    });

    it("unpayable without sourceCardInstanceId", () => {
      const cardDb = createTestCardDb();
      const state = makeState(cardDb);
      const cost: Cost = { type: "TRASH_SELF" };
      expect(isCostPayable(state, cost, 0, cardDb)).toBe(false);
    });
  });

  // ─── TRASH_FROM_HAND (selection cost) ───────────────────────────────────────

  describe("TRASH_FROM_HAND", () => {
    it("payable when hand has enough cards", () => {
      const cardDb = createTestCardDb();
      const state = makeState(cardDb);
      const cost: Cost = { type: "TRASH_FROM_HAND", amount: 1 };
      expect(state.players[0].hand.length).toBeGreaterThanOrEqual(1);
      expect(isCostPayable(state, cost, 0, cardDb)).toBe(true);
    });

    it("unpayable when hand is empty", () => {
      const cardDb = createTestCardDb();
      const state = withPlayer(makeState(cardDb), 0, { hand: [] });
      const cost: Cost = { type: "TRASH_FROM_HAND", amount: 1 };
      expect(isCostPayable(state, cost, 0, cardDb)).toBe(false);
    });
  });

  // ─── TRASH_FROM_LIFE (selection cost) ───────────────────────────────────────

  describe("TRASH_FROM_LIFE", () => {
    it("payable when life cards exist", () => {
      const cardDb = createTestCardDb();
      const state = makeState(cardDb);
      const cost: Cost = { type: "TRASH_FROM_LIFE", amount: 1 };
      expect(state.players[0].life.length).toBeGreaterThanOrEqual(1);
      expect(isCostPayable(state, cost, 0, cardDb)).toBe(true);
    });

    it("unpayable when no life cards", () => {
      const cardDb = createTestCardDb();
      const state = withPlayer(makeState(cardDb), 0, { life: [] });
      const cost: Cost = { type: "TRASH_FROM_LIFE", amount: 1 };
      expect(isCostPayable(state, cost, 0, cardDb)).toBe(false);
    });
  });

  // ─── PLACE_HAND_TO_DECK (selection cost) ────────────────────────────────────

  describe("PLACE_HAND_TO_DECK", () => {
    it("payable when hand has enough cards", () => {
      const cardDb = createTestCardDb();
      const state = makeState(cardDb);
      const cost: Cost = { type: "PLACE_HAND_TO_DECK", amount: 1 };
      expect(isCostPayable(state, cost, 0, cardDb)).toBe(true);
    });

    it("unpayable when hand is empty", () => {
      const cardDb = createTestCardDb();
      const state = withPlayer(makeState(cardDb), 0, { hand: [] });
      const cost: Cost = { type: "PLACE_HAND_TO_DECK", amount: 1 };
      expect(isCostPayable(state, cost, 0, cardDb)).toBe(false);
    });
  });

  // ─── REVEAL_FROM_HAND (selection cost) ──────────────────────────────────────

  describe("REVEAL_FROM_HAND", () => {
    it("payable when hand has enough cards", () => {
      const cardDb = createTestCardDb();
      const state = makeState(cardDb);
      const cost: Cost = { type: "REVEAL_FROM_HAND", amount: 1 };
      expect(isCostPayable(state, cost, 0, cardDb)).toBe(true);
    });

    it("unpayable when hand is empty", () => {
      const cardDb = createTestCardDb();
      const state = withPlayer(makeState(cardDb), 0, { hand: [] });
      const cost: Cost = { type: "REVEAL_FROM_HAND", amount: 1 };
      expect(isCostPayable(state, cost, 0, cardDb)).toBe(false);
    });
  });

  // ─── KO_OWN_CHARACTER (selection cost) ──────────────────────────────────────

  describe("KO_OWN_CHARACTER", () => {
    it("payable when characters on field", () => {
      const cardDb = createTestCardDb();
      const state = makeState(cardDb);
      const cost: Cost = { type: "KO_OWN_CHARACTER", amount: 1 };
      expect(isCostPayable(state, cost, 0, cardDb)).toBe(true);
    });

    it("unpayable when no characters on field", () => {
      const cardDb = createTestCardDb();
      const state = withPlayer(makeState(cardDb), 0, {
        characters: padChars([]),
      });
      const cost: Cost = { type: "KO_OWN_CHARACTER", amount: 1 };
      expect(isCostPayable(state, cost, 0, cardDb)).toBe(false);
    });
  });

  // ─── TRASH_OWN_CHARACTER (selection cost) ───────────────────────────────────

  describe("TRASH_OWN_CHARACTER", () => {
    it("payable when matching characters exist", () => {
      const cardDb = createTestCardDb();
      const state = makeState(cardDb);
      const cost: Cost = { type: "TRASH_OWN_CHARACTER", amount: 1 };
      expect(isCostPayable(state, cost, 0, cardDb)).toBe(true);
    });

    it("unpayable with filter that matches nothing", () => {
      const cardDb = createTestCardDb();
      const state = makeState(cardDb);
      const cost: Cost = { type: "TRASH_OWN_CHARACTER", amount: 1, filter: { traits: ["Nonexistent Trait"] } };
      expect(isCostPayable(state, cost, 0, cardDb)).toBe(false);
    });
  });

  // ─── RETURN_OWN_CHARACTER_TO_HAND (selection cost) ──────────────────────────

  describe("RETURN_OWN_CHARACTER_TO_HAND", () => {
    it("payable when characters on field", () => {
      const cardDb = createTestCardDb();
      const state = makeState(cardDb);
      const cost: Cost = { type: "RETURN_OWN_CHARACTER_TO_HAND", amount: 1 };
      expect(isCostPayable(state, cost, 0, cardDb)).toBe(true);
    });

    it("unpayable when no characters", () => {
      const cardDb = createTestCardDb();
      const state = withPlayer(makeState(cardDb), 0, { characters: padChars([]) });
      const cost: Cost = { type: "RETURN_OWN_CHARACTER_TO_HAND", amount: 1 };
      expect(isCostPayable(state, cost, 0, cardDb)).toBe(false);
    });
  });

  // ─── PLACE_OWN_CHARACTER_TO_DECK (selection cost) ───────────────────────────

  describe("PLACE_OWN_CHARACTER_TO_DECK", () => {
    it("payable when characters on field", () => {
      const cardDb = createTestCardDb();
      const state = makeState(cardDb);
      const cost: Cost = { type: "PLACE_OWN_CHARACTER_TO_DECK", amount: 1 };
      expect(isCostPayable(state, cost, 0, cardDb)).toBe(true);
    });

    it("unpayable when no characters", () => {
      const cardDb = createTestCardDb();
      const state = withPlayer(makeState(cardDb), 0, { characters: padChars([]) });
      const cost: Cost = { type: "PLACE_OWN_CHARACTER_TO_DECK", amount: 1 };
      expect(isCostPayable(state, cost, 0, cardDb)).toBe(false);
    });
  });

  // ─── REST_CARDS (selection cost) ────────────────────────────────────────────

  describe("REST_CARDS", () => {
    it("payable when active characters exist", () => {
      const cardDb = createTestCardDb();
      const state = makeState(cardDb);
      const cost: Cost = { type: "REST_CARDS", amount: 1 };
      expect(isCostPayable(state, cost, 0, cardDb)).toBe(true);
    });

    it("unpayable when no active characters", () => {
      const cardDb = createTestCardDb();
      const state = withPlayer(makeState(cardDb), 0, { characters: padChars([]) });
      const cost: Cost = { type: "REST_CARDS", amount: 1 };
      expect(isCostPayable(state, cost, 0, cardDb)).toBe(false);
    });
  });

  // ─── REST_NAMED_CARD (selection cost) ───────────────────────────────────────

  describe("REST_NAMED_CARD", () => {
    it("payable when matching active card exists", () => {
      const cardDb = createTestCardDb();
      const state = makeState(cardDb);
      const cost: Cost = { type: "REST_NAMED_CARD", amount: 1, filter: { name: CARDS.VANILLA.name } };
      expect(isCostPayable(state, cost, 0, cardDb)).toBe(true);
    });

    it("unpayable when no matching card", () => {
      const cardDb = createTestCardDb();
      const state = makeState(cardDb);
      const cost: Cost = { type: "REST_NAMED_CARD", amount: 1, filter: { name: "Nonexistent Card" } };
      expect(isCostPayable(state, cost, 0, cardDb)).toBe(false);
    });
  });

  // ─── LIFE_TO_HAND ──────────────────────────────────────────────────────────

  describe("LIFE_TO_HAND", () => {
    it("payable when life cards exist", () => {
      const cardDb = createTestCardDb();
      const state = makeState(cardDb);
      const cost: Cost = { type: "LIFE_TO_HAND", amount: 1 };
      expect(isCostPayable(state, cost, 0, cardDb)).toBe(true);
    });

    it("unpayable when no life cards", () => {
      const cardDb = createTestCardDb();
      const state = withPlayer(makeState(cardDb), 0, { life: [] });
      const cost: Cost = { type: "LIFE_TO_HAND", amount: 1 };
      expect(isCostPayable(state, cost, 0, cardDb)).toBe(false);
    });
  });

  // ─── TURN_LIFE_FACE_UP ─────────────────────────────────────────────────────

  describe("TURN_LIFE_FACE_UP", () => {
    it("payable when face-down life cards exist", () => {
      const cardDb = createTestCardDb();
      const state = makeState(cardDb);
      const cost: Cost = { type: "TURN_LIFE_FACE_UP", amount: 1 };
      expect(state.players[0].life.some((l) => l.face === "DOWN")).toBe(true);
      expect(isCostPayable(state, cost, 0, cardDb)).toBe(true);
    });

    it("unpayable when all life cards face-up", () => {
      const cardDb = createTestCardDb();
      const base = makeState(cardDb);
      const allUp = base.players[0].life.map((l) => ({ ...l, face: "UP" as const }));
      const state = withPlayer(base, 0, { life: allUp });
      const cost: Cost = { type: "TURN_LIFE_FACE_UP", amount: 1 };
      expect(isCostPayable(state, cost, 0, cardDb)).toBe(false);
    });
  });

  // ─── TURN_LIFE_FACE_DOWN ────────────────────────────────────────────────────

  describe("TURN_LIFE_FACE_DOWN", () => {
    it("payable when face-up life cards exist", () => {
      const cardDb = createTestCardDb();
      const base = makeState(cardDb);
      const withFaceUp = base.players[0].life.map((l, i) =>
        i === 0 ? { ...l, face: "UP" as const } : l,
      );
      const state = withPlayer(base, 0, { life: withFaceUp });
      const cost: Cost = { type: "TURN_LIFE_FACE_DOWN", amount: 1 };
      expect(isCostPayable(state, cost, 0, cardDb)).toBe(true);
    });

    it("unpayable when all life cards face-down", () => {
      const cardDb = createTestCardDb();
      const base = makeState(cardDb);
      const allDown = base.players[0].life.map((l) => ({ ...l, face: "DOWN" as const }));
      const state = withPlayer(base, 0, { life: allDown });
      const cost: Cost = { type: "TURN_LIFE_FACE_DOWN", amount: 1 };
      expect(isCostPayable(state, cost, 0, cardDb)).toBe(false);
    });
  });

  // ─── PLACE_FROM_TRASH_TO_DECK ───────────────────────────────────────────────

  describe("PLACE_FROM_TRASH_TO_DECK", () => {
    it("payable when trash has enough cards", () => {
      const cardDb = createTestCardDb();
      const base = makeState(cardDb);
      const trashCard: CardInstance = {
        instanceId: "trash-card-1",
        cardId: CARDS.VANILLA.id,
        zone: "TRASH",
        state: "ACTIVE",
        attachedDon: [],
        turnPlayed: null,
        controller: 0,
        owner: 0,
      };
      const state = withPlayer(base, 0, { trash: [trashCard] });
      const cost: Cost = { type: "PLACE_FROM_TRASH_TO_DECK", amount: 1 };
      expect(isCostPayable(state, cost, 0, cardDb)).toBe(true);
    });

    it("unpayable when trash is empty", () => {
      const cardDb = createTestCardDb();
      const state = withPlayer(makeState(cardDb), 0, { trash: [] });
      const cost: Cost = { type: "PLACE_FROM_TRASH_TO_DECK", amount: 1 };
      expect(isCostPayable(state, cost, 0, cardDb)).toBe(false);
    });
  });

  // ─── LEADER_POWER_REDUCTION ─────────────────────────────────────────────────

  describe("LEADER_POWER_REDUCTION", () => {
    it("payable when leader exists", () => {
      const cardDb = createTestCardDb();
      const state = makeState(cardDb);
      const cost: Cost = { type: "LEADER_POWER_REDUCTION" };
      expect(isCostPayable(state, cost, 0, cardDb)).toBe(true);
    });
  });

  // ─── GIVE_OPPONENT_DON ──────────────────────────────────────────────────────

  describe("GIVE_OPPONENT_DON", () => {
    it("payable when enough unattached DON", () => {
      const cardDb = createTestCardDb();
      const state = makeState(cardDb);
      const cost: Cost = { type: "GIVE_OPPONENT_DON", amount: 1 };
      expect(isCostPayable(state, cost, 0, cardDb)).toBe(true);
    });

    it("unpayable when no unattached DON", () => {
      const cardDb = createTestCardDb();
      const allAttached: DonInstance[] = [
        { instanceId: "don-att-0", state: "ACTIVE" as const, attachedTo: "char-0-v1" },
      ];
      const state = withPlayer(makeState(cardDb), 0, { donCostArea: allAttached });
      const cost: Cost = { type: "GIVE_OPPONENT_DON", amount: 1 };
      expect(isCostPayable(state, cost, 0, cardDb)).toBe(false);
    });
  });

  // ─── PLACE_STAGE_TO_DECK ───────────────────────────────────────────────────

  describe("PLACE_STAGE_TO_DECK", () => {
    it("payable when stage exists", () => {
      const cardDb = createTestCardDb();
      const base = makeState(cardDb);
      const stageCard: CardInstance = {
        instanceId: "stage-0",
        cardId: CARDS.STAGE.id,
        zone: "STAGE",
        state: "ACTIVE",
        attachedDon: [],
        turnPlayed: 1,
        controller: 0,
        owner: 0,
      };
      const state = withPlayer(base, 0, { stage: stageCard });
      const cost: Cost = { type: "PLACE_STAGE_TO_DECK" };
      expect(isCostPayable(state, cost, 0, cardDb)).toBe(true);
    });

    it("unpayable when no stage", () => {
      const cardDb = createTestCardDb();
      const state = withPlayer(makeState(cardDb), 0, { stage: null });
      const cost: Cost = { type: "PLACE_STAGE_TO_DECK" };
      expect(isCostPayable(state, cost, 0, cardDb)).toBe(false);
    });
  });

  // ─── RETURN_ATTACHED_DON_TO_COST ────────────────────────────────────────────

  describe("RETURN_ATTACHED_DON_TO_COST", () => {
    it("payable when source card has enough attached DON", () => {
      const cardDb = createTestCardDb();
      const base = makeState(cardDb);
      const charWithDon: CardInstance = {
        instanceId: "char-don-test",
        cardId: CARDS.VANILLA.id,
        zone: "CHARACTER",
        state: "ACTIVE",
        attachedDon: [{ instanceId: "don-att-1", state: "ACTIVE" as const, attachedTo: "char-don-test" }],
        turnPlayed: 1,
        controller: 0,
        owner: 0,
      };
      const state = withPlayer(base, 0, { characters: padChars([charWithDon]) });
      const cost: Cost = { type: "RETURN_ATTACHED_DON_TO_COST", amount: 1 };
      expect(isCostPayable(state, cost, 0, cardDb, "char-don-test")).toBe(true);
    });

    it("unpayable when source card has no attached DON", () => {
      const cardDb = createTestCardDb();
      const state = makeState(cardDb);
      const cost: Cost = { type: "RETURN_ATTACHED_DON_TO_COST", amount: 1 };
      expect(isCostPayable(state, cost, 0, cardDb, SOURCE_CHAR_ID)).toBe(false);
    });

    it("unpayable without sourceCardInstanceId", () => {
      const cardDb = createTestCardDb();
      const state = makeState(cardDb);
      const cost: Cost = { type: "RETURN_ATTACHED_DON_TO_COST", amount: 1 };
      expect(isCostPayable(state, cost, 0, cardDb)).toBe(false);
    });
  });

  // ─── PLACE_SELF_AND_HAND_TO_DECK ────────────────────────────────────────────

  describe("PLACE_SELF_AND_HAND_TO_DECK", () => {
    it("payable when source character is on field", () => {
      const cardDb = createTestCardDb();
      const state = makeState(cardDb);
      const cost: Cost = { type: "PLACE_SELF_AND_HAND_TO_DECK" };
      expect(isCostPayable(state, cost, 0, cardDb, SOURCE_CHAR_ID)).toBe(true);
    });

    it("unpayable without sourceCardInstanceId", () => {
      const cardDb = createTestCardDb();
      const state = makeState(cardDb);
      const cost: Cost = { type: "PLACE_SELF_AND_HAND_TO_DECK" };
      expect(isCostPayable(state, cost, 0, cardDb)).toBe(false);
    });
  });

  // ─── PLAY_NAMED_CARD_FROM_HAND ──────────────────────────────────────────────

  describe("PLAY_NAMED_CARD_FROM_HAND", () => {
    it("payable when named card is in hand", () => {
      const cardDb = createTestCardDb();
      const state = makeState(cardDb);
      const handCardId = state.players[0].hand[0]?.cardId;
      const handCardData = cardDb.get(handCardId);
      const cost = { type: "PLAY_NAMED_CARD_FROM_HAND", card_name: handCardData!.name } as Cost;
      expect(isCostPayable(state, cost, 0, cardDb)).toBe(true);
    });

    it("unpayable when named card not in hand", () => {
      const cardDb = createTestCardDb();
      const state = makeState(cardDb);
      const cost = { type: "PLAY_NAMED_CARD_FROM_HAND", card_name: "Nonexistent Card" } as Cost;
      expect(isCostPayable(state, cost, 0, cardDb)).toBe(false);
    });
  });

  // ─── CHOOSE_ONE_COST (recursive) ───────────────────────────────────────────

  describe("CHOOSE_ONE_COST", () => {
    it("payable when at least one option is payable", () => {
      const cardDb = createTestCardDb();
      const state = makeState(cardDb);
      const cost: Cost = {
        type: "CHOOSE_ONE_COST",
        options: [
          { type: "DON_REST", amount: 100 },
          { type: "DON_REST", amount: 1 },
        ],
      };
      expect(isCostPayable(state, cost, 0, cardDb)).toBe(true);
    });

    it("unpayable when no option is payable", () => {
      const cardDb = createTestCardDb();
      const state = withPlayer(makeState(cardDb), 0, { donCostArea: [], hand: [] });
      const cost: Cost = {
        type: "CHOOSE_ONE_COST",
        options: [
          { type: "DON_REST", amount: 1 },
          { type: "TRASH_FROM_HAND", amount: 1 },
        ],
      };
      expect(isCostPayable(state, cost, 0, cardDb)).toBe(false);
    });
  });

  // ─── CHOICE (branch-level, recursive) ──────────────────────────────────────

  describe("CHOICE", () => {
    it("payable when at least one branch is fully payable", () => {
      const cardDb = createTestCardDb();
      const state = makeState(cardDb);
      const cost: ChoiceCost = {
        type: "CHOICE",
        options: [
          [{ type: "DON_REST", amount: 100 }],
          [{ type: "DON_REST", amount: 1 }],
        ],
      };
      expect(isCostPayable(state, cost, 0, cardDb)).toBe(true);
    });

    it("unpayable when every branch has at least one unpayable cost", () => {
      const cardDb = createTestCardDb();
      const state = withPlayer(makeState(cardDb), 0, { donCostArea: [], hand: [] });
      const cost: ChoiceCost = {
        type: "CHOICE",
        options: [
          [{ type: "DON_REST", amount: 1 }],
          [{ type: "TRASH_FROM_HAND", amount: 1 }],
        ],
      };
      expect(isCostPayable(state, cost, 0, cardDb)).toBe(false);
    });

    it("unpayable when branch has one payable + one unpayable cost", () => {
      const cardDb = createTestCardDb();
      const state = makeState(cardDb);
      const cost: ChoiceCost = {
        type: "CHOICE",
        options: [
          [{ type: "DON_REST", amount: 1 }, { type: "PLACE_STAGE_TO_DECK" }],
        ],
      };
      expect(state.players[0].stage).toBeNull();
      expect(isCostPayable(state, cost, 0, cardDb)).toBe(false);
    });

    it("payable when multi-cost branch is fully satisfiable", () => {
      const cardDb = createTestCardDb();
      const base = makeState(cardDb);
      const stageCard: CardInstance = {
        instanceId: "stage-0",
        cardId: CARDS.STAGE.id,
        zone: "STAGE",
        state: "ACTIVE",
        attachedDon: [],
        turnPlayed: 1,
        controller: 0,
        owner: 0,
      };
      const state = withPlayer(base, 0, { stage: stageCard });
      const cost: ChoiceCost = {
        type: "CHOICE",
        options: [
          [{ type: "DON_REST", amount: 1 }, { type: "PLACE_STAGE_TO_DECK" }],
        ],
      };
      expect(isCostPayable(state, cost, 0, cardDb)).toBe(true);
    });
  });
});
