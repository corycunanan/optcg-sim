import type { Card } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const deckFindFirstMock = vi.fn();
const cardFindManyMock = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    deck: { findFirst: (...args: unknown[]) => deckFindFirstMock(...args) },
    card: { findMany: (...args: unknown[]) => cardFindManyMock(...args) },
  },
}));

const { DeckInvalidError, DeckNotFoundError, requirePlayableDeck } =
  await import("./playable");

const copyLimitOverrideSchema = {
  rule_modifications: [
    { rule_type: "COPY_LIMIT_OVERRIDE", limit: "UNLIMITED" },
  ],
  effects: [],
};

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: "OP01-001",
    name: "Test Card",
    originSet: "OP01",
    color: ["Red"],
    type: "Character",
    cost: 1,
    power: 1000,
    counter: 1000,
    attribute: [],
    life: null,
    traits: ["Test"],
    rarity: "C",
    effectText: "",
    triggerText: null,
    effectSchema: null,
    imageUrl: "https://example.test/card.png",
    blockNumber: 1,
    banStatus: "LEGAL",
    isReprint: false,
    ...overrides,
  } as Card;
}

const leader = makeCard({
  id: "LEADER-1",
  name: "Red Leader",
  type: "Leader",
  life: 5,
});

function mainDeckRows(total = 50) {
  const rows: Array<{
    cardId: string;
    quantity: number;
    selectedArtUrl: null;
  }> = [];
  let remaining = total;
  let index = 1;
  while (remaining > 0) {
    const quantity = Math.min(4, remaining);
    rows.push({ cardId: `CARD-${index}`, quantity, selectedArtUrl: null });
    remaining -= quantity;
    index += 1;
  }
  return rows;
}

function mainDeckCards(rows = mainDeckRows()) {
  return rows.map((row) =>
    makeCard({
      id: row.cardId,
      name: row.cardId,
      color: ["Red"],
    })
  );
}

function mockDeck(rows = mainDeckRows(), options: { leaderId?: string } = {}) {
  deckFindFirstMock.mockResolvedValue({
    id: "deck-1",
    userId: "user-1",
    name: "Playable",
    leaderId: options.leaderId ?? leader.id,
    leaderArtUrl: null,
    sleeveUrl: null,
    donArtUrl: null,
    testOrder: null,
    format: "Standard",
    cards: rows,
  });
}

function mockCards(cards: Card[]) {
  cardFindManyMock.mockResolvedValue(cards);
}

async function expectInvalidDetail(id: string) {
  await expect(requirePlayableDeck("deck-1", "user-1")).rejects.toMatchObject({
    details: expect.arrayContaining([expect.objectContaining({ id })]),
  });
}

beforeEach(() => {
  deckFindFirstMock.mockReset();
  cardFindManyMock.mockReset();
});

describe("requirePlayableDeck", () => {
  it("returns the deck, leader, and validation for a playable 50-card deck", async () => {
    const rows = mainDeckRows(50);
    mockDeck(rows);
    mockCards([leader, ...mainDeckCards(rows)]);

    const result = await requirePlayableDeck("deck-1", "user-1");

    expect(result.validation.isValid).toBe(true);
    expect(result.deck.cards).toHaveLength(rows.length);
    expect(result.leader.id).toBe(leader.id);
    expect(deckFindFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "deck-1", userId: "user-1" } })
    );
  });

  it("throws DeckNotFoundError when the user does not own the deck", async () => {
    deckFindFirstMock.mockResolvedValue(null);

    await expect(
      requirePlayableDeck("deck-1", "user-1")
    ).rejects.toBeInstanceOf(DeckNotFoundError);
    expect(cardFindManyMock).not.toHaveBeenCalled();
  });

  it("rejects a 49-card deck", async () => {
    const rows = mainDeckRows(49);
    mockDeck(rows);
    mockCards([leader, ...mainDeckCards(rows)]);

    await expectInvalidDetail("deck-size");
  });

  it("rejects a 51-card deck", async () => {
    const rows = mainDeckRows(51);
    mockDeck(rows);
    mockCards([leader, ...mainDeckCards(rows)]);

    await expectInvalidDetail("deck-size");
  });

  it("allows game start for over-4 COPY_LIMIT_OVERRIDE cards", async () => {
    const rows = [
      { cardId: "OP01-075", quantity: 8, selectedArtUrl: null },
      ...mainDeckRows(42),
    ];
    mockDeck(rows);
    mockCards([
      leader,
      makeCard({
        id: "OP01-075",
        name: "Pacifista",
        color: ["Red"],
        effectSchema: copyLimitOverrideSchema,
      }),
      ...mainDeckCards(rows.slice(1)),
    ]);

    const result = await requirePlayableDeck("deck-1", "user-1");

    expect(result.validation.isValid).toBe(true);
  });

  it("rejects a missing leader card", async () => {
    const rows = mainDeckRows(50);
    mockDeck(rows, { leaderId: "MISSING-LEADER" });
    mockCards(mainDeckCards(rows));

    await expectInvalidDetail("leader");
  });

  it("rejects a leader card in the main deck", async () => {
    const rows = mainDeckRows(50);
    rows[0] = { ...rows[0], cardId: "LEADER-2" };
    mockDeck(rows);
    mockCards([
      leader,
      makeCard({ id: "LEADER-2", name: "Second Leader", type: "Leader" }),
      ...mainDeckCards(rows.slice(1)),
    ]);

    await expectInvalidDetail("no-leaders-in-deck");
  });

  it("rejects a banned card", async () => {
    const rows = mainDeckRows(50);
    mockDeck(rows);
    const cards = mainDeckCards(rows);
    cards[0] = makeCard({
      id: rows[0].cardId,
      name: "Banned Card",
      banStatus: "BANNED",
    });
    mockCards([leader, ...cards]);

    await expectInvalidDetail("ban-status");
  });

  it("rejects a color affinity violation", async () => {
    const rows = mainDeckRows(50);
    mockDeck(rows);
    const cards = mainDeckCards(rows);
    cards[0] = makeCard({
      id: rows[0].cardId,
      name: "Blue Card",
      color: ["Blue"],
    });
    mockCards([leader, ...cards]);

    await expectInvalidDetail("color-affinity");
  });

  it("rejects a non-existent card ID", async () => {
    const rows = mainDeckRows(50);
    rows[0] = { ...rows[0], cardId: "MISSING-CARD" };
    mockDeck(rows);
    mockCards([leader, ...mainDeckCards(rows.slice(1))]);

    await expectInvalidDetail("missing-card");
  });

  it("throws DeckInvalidError with structured details", async () => {
    const rows = mainDeckRows(49);
    mockDeck(rows);
    mockCards([leader, ...mainDeckCards(rows)]);

    await expect(
      requirePlayableDeck("deck-1", "user-1")
    ).rejects.toBeInstanceOf(DeckInvalidError);
  });
});
