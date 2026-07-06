import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const rateLimitMock = vi.fn(async () => ({ limited: false, remaining: 99 }));
const cardFindUniqueMock = vi.fn();
const deckCreateMock = vi.fn();

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/db", () => ({
  prisma: {
    card: { findUnique: (...args: unknown[]) => cardFindUniqueMock(...args) },
    deck: { create: (...args: unknown[]) => deckCreateMock(...args) },
  },
}));
vi.mock("@/lib/rate-limit", () => ({
  apiLimiter: { check: rateLimitMock },
}));

const { POST } = await import("./route");

function buildRequest(body: unknown) {
  return new NextRequest("http://localhost/api/decks", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  authMock.mockReset();
  rateLimitMock.mockReset();
  cardFindUniqueMock.mockReset();
  deckCreateMock.mockReset();

  authMock.mockResolvedValue({ user: { id: "user-1" } });
  rateLimitMock.mockResolvedValue({ limited: false, remaining: 99 });
  cardFindUniqueMock.mockResolvedValue({ id: "LEADER-1", type: "Leader" });
  deckCreateMock.mockResolvedValue({ id: "deck-1", name: "Draft Deck" });
});

describe("POST /api/decks", () => {
  it("still saves draft decks that are not yet playable", async () => {
    const cards = Array.from({ length: 49 }, (_, index) => ({
      cardId: `CARD-${index + 1}`,
      quantity: 1,
    }));

    const res = await POST(
      buildRequest({
        name: "Draft Deck",
        leaderId: "LEADER-1",
        cards,
      })
    );

    expect(res.status).toBe(201);
    expect(deckCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user-1",
          cards: expect.objectContaining({
            createMany: expect.objectContaining({
              data: expect.arrayContaining([
                expect.objectContaining({ cardId: "CARD-1", quantity: 1 }),
              ]),
            }),
          }),
        }),
      })
    );
  });

  it("allows draft payloads with over-four card quantities", async () => {
    const res = await POST(
      buildRequest({
        name: "Pacifista Draft",
        leaderId: "LEADER-1",
        cards: [{ cardId: "OP01-075", quantity: 8 }],
      })
    );

    expect(res.status).toBe(201);
    expect(deckCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          cards: expect.objectContaining({
            createMany: expect.objectContaining({
              data: [
                expect.objectContaining({ cardId: "OP01-075", quantity: 8 }),
              ],
            }),
          }),
        }),
      })
    );
  });
});
