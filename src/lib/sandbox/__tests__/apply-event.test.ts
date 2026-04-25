import { describe, expect, it } from "vitest";
import type { GameEvent, TurnState } from "@shared/game-types";
import { applyEvent } from "../apply-event";
import { makeCard, makeDonStack, makeLifeStack, playerSlot } from "../scenarios/helpers";
import type { PartialGameState } from "../scenarios/types";

const TURN: TurnState = {
  number: 1,
  activePlayerIndex: 0,
  phase: "MAIN",
  battleSubPhase: null,
  battle: null,
  oncePerTurnUsed: {},
  actionsPerformedThisTurn: [],
  deckHitZeroThisTurn: [false, false],
};

function event<T extends GameEvent["type"]>(
  type: T,
  playerIndex: 0 | 1,
  payload: Extract<GameEvent, { type: T }>["payload"],
  timestamp = 0,
): GameEvent {
  return { type, playerIndex, payload, timestamp } as GameEvent;
}

function baseState(): PartialGameState {
  return {
    myIndex: 0,
    turn: TURN,
    players: [
      playerSlot({
        playerId: "p0",
        leader: makeCard({
          instanceId: "p0-leader",
          cardId: "OP01-001",
          zone: "LEADER",
          controller: 0,
        }),
        characters: [
          makeCard({
            instanceId: "p0-char-a",
            cardId: "OP01-010",
            zone: "CHARACTER",
            controller: 0,
            attachedDon: [
              { instanceId: "don-attached-1", state: "ACTIVE", attachedTo: "p0-char-a" },
            ],
          }),
          null,
          null,
          null,
          null,
        ],
        hand: [
          makeCard({
            instanceId: "p0-hand-a",
            cardId: "OP01-020",
            zone: "HAND",
            controller: 0,
          }),
          makeCard({
            instanceId: "p0-hand-stage",
            cardId: "OP01-STAGE",
            zone: "HAND",
            controller: 0,
          }),
        ],
        deck: [
          makeCard({
            instanceId: "p0-deck-top",
            cardId: "OP01-030",
            zone: "DECK",
            controller: 0,
          }),
          makeCard({
            instanceId: "p0-deck-2",
            cardId: "OP01-031",
            zone: "DECK",
            controller: 0,
          }),
        ],
        trash: [],
        life: makeLifeStack({ count: 3, cardId: "OP01-040", prefix: "p0-life" }),
        donCostArea: makeDonStack({ count: 2, prefix: "p0-don" }),
        donDeck: makeDonStack({ count: 8, prefix: "p0-don-deck" }),
      }),
      playerSlot({
        playerId: "p1",
        leader: makeCard({
          instanceId: "p1-leader",
          cardId: "OP01-002",
          zone: "LEADER",
          controller: 1,
        }),
        deck: [
          makeCard({
            instanceId: "p1-deck-top",
            cardId: "OP01-130",
            zone: "DECK",
            controller: 1,
          }),
        ],
        life: makeLifeStack({ count: 3, cardId: "OP01-140", prefix: "p1-life" }),
        donCostArea: makeDonStack({ count: 1, prefix: "p1-don" }),
      }),
    ],
  };
}

describe("applyEvent", () => {
  describe("CARD_DRAWN", () => {
    it("moves the top of deck to hand", () => {
      const next = applyEvent(
        baseState(),
        event("CARD_DRAWN", 0, { cardId: "OP01-030", cardInstanceId: "p0-deck-top" }),
      );
      const p = next.players[0];
      expect(p.deck.map((c) => c.instanceId)).toEqual(["p0-deck-2"]);
      expect(p.hand.map((c) => c.instanceId)).toContain("p0-deck-top");
      const drawn = p.hand.find((c) => c.instanceId === "p0-deck-top")!;
      expect(drawn.zone).toBe("HAND");
    });

    it("is a no-op when the deck is empty", () => {
      const start = baseState();
      start.players[0] = { ...start.players[0], deck: [] };
      const next = applyEvent(
        start,
        event("CARD_DRAWN", 0, { cardId: "OP01-030" }),
      );
      expect(next.players[0].hand.length).toBe(start.players[0].hand.length);
    });
  });

  describe("CARD_PLAYED", () => {
    it("moves the card from hand into the first empty Character slot", () => {
      const next = applyEvent(
        baseState(),
        event("CARD_PLAYED", 0, {
          cardId: "OP01-020",
          cardInstanceId: "p0-hand-a",
          zone: "CHARACTER",
          source: "HAND",
        }),
      );
      const p = next.players[0];
      expect(p.hand.find((c) => c.instanceId === "p0-hand-a")).toBeUndefined();
      expect(p.characters[1]?.instanceId).toBe("p0-hand-a");
      expect(p.characters[1]?.zone).toBe("CHARACTER");
      expect(p.characters[1]?.turnPlayed).toBe(TURN.number);
    });

    it("places onto Stage when zone is STAGE", () => {
      const next = applyEvent(
        baseState(),
        event("CARD_PLAYED", 0, {
          cardId: "OP01-STAGE",
          cardInstanceId: "p0-hand-stage",
          zone: "STAGE",
          source: "HAND",
        }),
      );
      expect(next.players[0].stage?.instanceId).toBe("p0-hand-stage");
    });

    it("respects playedRested flag", () => {
      const next = applyEvent(
        baseState(),
        event("CARD_PLAYED", 0, {
          cardId: "OP01-020",
          cardInstanceId: "p0-hand-a",
          zone: "CHARACTER",
          source: "HAND",
          playedRested: true,
        }),
      );
      const placed = next.players[0].characters.find(
        (c) => c?.instanceId === "p0-hand-a",
      );
      expect(placed?.state).toBe("RESTED");
    });
  });

  describe("CARD_TRASHED", () => {
    it("moves a hand card to trash", () => {
      const next = applyEvent(
        baseState(),
        event("CARD_TRASHED", 0, {
          cardInstanceId: "p0-hand-a",
          reason: "DISCARD",
          from: "HAND",
        }),
      );
      const p = next.players[0];
      expect(p.hand.find((c) => c.instanceId === "p0-hand-a")).toBeUndefined();
      expect(p.trash[0]?.instanceId).toBe("p0-hand-a");
      expect(p.trash[0]?.zone).toBe("TRASH");
    });

    it("returns attached DON to the cost area when a field card is trashed", () => {
      const next = applyEvent(
        baseState(),
        event("CARD_TRASHED", 0, {
          cardInstanceId: "p0-char-a",
          reason: "EFFECT",
          from: "CHARACTER",
        }),
      );
      const p = next.players[0];
      expect(p.characters[0]).toBeNull();
      expect(p.trash[0]?.instanceId).toBe("p0-char-a");
      expect(p.trash[0]?.attachedDon).toEqual([]);
      const returnedDon = p.donCostArea.find(
        (d) => d.instanceId === "don-attached-1",
      );
      expect(returnedDon?.attachedTo).toBeNull();
      expect(returnedDon?.state).toBe("ACTIVE");
    });

    it("trashes a face-up Life card when from === LIFE", () => {
      const next = applyEvent(
        baseState(),
        event("CARD_TRASHED", 0, {
          cardInstanceId: "p0-life-1",
          cardId: "OP01-040",
          reason: "TRIGGER_CONSUMED",
          from: "LIFE",
        }),
      );
      const p = next.players[0];
      expect(p.life.map((l) => l.instanceId)).not.toContain("p0-life-1");
      expect(p.trash[0]?.instanceId).toBe("p0-life-1");
    });
  });

  describe("DON_GIVEN_TO_CARD", () => {
    it("attaches active DON from the cost area to a target field card", () => {
      const next = applyEvent(
        baseState(),
        event("DON_GIVEN_TO_CARD", 0, {
          targetInstanceId: "p0-leader",
          count: 2,
        }),
      );
      const p = next.players[0];
      expect(p.donCostArea.length).toBe(0);
      expect(p.leader.attachedDon.length).toBe(2);
      expect(p.leader.attachedDon.every((d) => d.attachedTo === "p0-leader")).toBe(
        true,
      );
    });

    it("is a no-op when the target is not on the field", () => {
      const start = baseState();
      const next = applyEvent(
        start,
        event("DON_GIVEN_TO_CARD", 0, {
          targetInstanceId: "not-on-field",
          count: 1,
        }),
      );
      expect(next).toBe(start);
    });
  });

  describe("CARD_STATE_CHANGED", () => {
    it("rests an active field card", () => {
      const next = applyEvent(
        baseState(),
        event("CARD_STATE_CHANGED", 0, {
          targetInstanceId: "p0-leader",
          newState: "RESTED",
        }),
      );
      expect(next.players[0].leader.state).toBe("RESTED");
    });

    it("refreshes a rested character", () => {
      const start = baseState();
      const char = start.players[0].characters[0]!;
      start.players[0] = {
        ...start.players[0],
        characters: [{ ...char, state: "RESTED" }, null, null, null, null],
      };
      const next = applyEvent(
        start,
        event("CARD_STATE_CHANGED", 0, {
          cardInstanceId: "p0-char-a",
          newState: "ACTIVE",
        }),
      );
      expect(next.players[0].characters[0]?.state).toBe("ACTIVE");
    });
  });

  describe("CARD_KO", () => {
    it("moves the KO'd character to trash and returns its DON", () => {
      const next = applyEvent(
        baseState(),
        event("CARD_KO", 0, {
          cardInstanceId: "p0-char-a",
          cardId: "OP01-010",
          cause: "BATTLE",
          preKO_donCount: 1,
        }),
      );
      const p = next.players[0];
      expect(p.characters[0]).toBeNull();
      expect(p.trash[0]?.instanceId).toBe("p0-char-a");
      expect(p.donCostArea.some((d) => d.attachedTo === null && d.instanceId === "don-attached-1")).toBe(
        true,
      );
    });
  });

  describe("CARD_RETURNED_TO_HAND", () => {
    it("returns a field card to its controller's hand", () => {
      const next = applyEvent(
        baseState(),
        event("CARD_RETURNED_TO_HAND", 0, {
          cardInstanceId: "p0-char-a",
          cardId: "OP01-010",
        }),
      );
      const p = next.players[0];
      expect(p.characters[0]).toBeNull();
      const back = p.hand.find((c) => c.instanceId === "p0-char-a");
      expect(back?.zone).toBe("HAND");
      expect(back?.attachedDon).toEqual([]);
    });
  });

  describe("CARD_ADDED_TO_HAND_FROM_LIFE", () => {
    it("moves the specified Life card to hand", () => {
      const next = applyEvent(
        baseState(),
        event("CARD_ADDED_TO_HAND_FROM_LIFE", 0, {
          cardInstanceId: "p0-life-1",
          cardId: "OP01-040",
          count: 1,
        }),
      );
      const p = next.players[0];
      expect(p.life.map((l) => l.instanceId)).not.toContain("p0-life-1");
      const inHand = p.hand.find((c) => c.instanceId === "p0-life-1");
      expect(inHand?.controller).toBe(0);
      expect(inHand?.zone).toBe("HAND");
    });

    it("falls back to the top of life when no instance id is given", () => {
      const next = applyEvent(
        baseState(),
        event("CARD_ADDED_TO_HAND_FROM_LIFE", 1, { count: 1 }),
      );
      const p = next.players[1];
      expect(p.life.length).toBe(2);
      expect(p.hand[0]?.instanceId).toBe("p1-life-1");
    });
  });

  it("replays a 5-event sequence to the expected state", () => {
    const events: GameEvent[] = [
      event("CARD_DRAWN", 0, { cardId: "OP01-030", cardInstanceId: "p0-deck-top" }),
      event("DON_GIVEN_TO_CARD", 0, { targetInstanceId: "p0-leader", count: 2 }),
      event("CARD_PLAYED", 0, {
        cardId: "OP01-020",
        cardInstanceId: "p0-hand-a",
        zone: "CHARACTER",
        source: "HAND",
      }),
      event("CARD_STATE_CHANGED", 0, {
        targetInstanceId: "p0-leader",
        newState: "RESTED",
      }),
      event("CARD_ADDED_TO_HAND_FROM_LIFE", 1, {
        cardInstanceId: "p1-life-1",
        cardId: "OP01-140",
        count: 1,
      }),
    ];
    const final = events.reduce((s, e) => applyEvent(s, e), baseState());

    const p0 = final.players[0];
    const p1 = final.players[1];

    expect(p0.deck.map((c) => c.instanceId)).toEqual(["p0-deck-2"]);
    expect(p0.hand.map((c) => c.instanceId).sort()).toEqual(
      ["p0-deck-top", "p0-hand-stage"].sort(),
    );
    expect(p0.leader.attachedDon.length).toBe(2);
    expect(p0.donCostArea.length).toBe(0);
    expect(p0.leader.state).toBe("RESTED");
    expect(p0.characters[1]?.instanceId).toBe("p0-hand-a");

    expect(p1.life.length).toBe(2);
    expect(p1.hand[0]?.instanceId).toBe("p1-life-1");
  });

  it("returns the same state reference for unhandled events", () => {
    const start = baseState();
    const next = applyEvent(
      start,
      event("PHASE_CHANGED", 0, { from: "MAIN", to: "END" }),
    );
    expect(next).toBe(start);
  });
});
