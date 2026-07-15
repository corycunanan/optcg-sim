import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const rateLimitMock = vi.fn(async () => ({ limited: false, remaining: 99 }));
const deckFindFirstMock = vi.fn();
const deckUpdateMock = vi.fn();
const deckCardDeleteManyMock = vi.fn();
const deckCardCreateManyMock = vi.fn();
const cardFindUniqueMock = vi.fn();
const cardFindManyMock = vi.fn();
const transactionMock = vi.fn();

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/db", () => ({
  prisma: {
    deck: {
      findFirst: (...args: unknown[]) => deckFindFirstMock(...args),
    },
    card: {
      findUnique: (...args: unknown[]) => cardFindUniqueMock(...args),
      findMany: (...args: unknown[]) => cardFindManyMock(...args),
    },
    $transaction: (...args: unknown[]) => transactionMock(...args),
  },
}));
vi.mock("@/lib/rate-limit", () => ({
  apiLimiter: { check: rateLimitMock },
}));

const { PATCH } = await import("./route");

function buildRequest(body: unknown) {
  return new NextRequest("http://localhost/api/decks/deck-1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const params = { params: Promise.resolve({ id: "deck-1" }) };

beforeEach(() => {
  authMock.mockReset();
  rateLimitMock.mockReset();
  deckFindFirstMock.mockReset();
  deckUpdateMock.mockReset();
  deckCardDeleteManyMock.mockReset();
  deckCardCreateManyMock.mockReset();
  cardFindUniqueMock.mockReset();
  cardFindManyMock.mockReset();
  transactionMock.mockReset();

  authMock.mockResolvedValue({ user: { id: "user-1" } });
  rateLimitMock.mockResolvedValue({ limited: false, remaining: 99 });
  deckFindFirstMock.mockResolvedValue({
    id: "deck-1",
    userId: "user-1",
    name: "Old name",
    leaderId: "LEADER-1",
  });
  deckUpdateMock.mockResolvedValue({
    id: "deck-1",
    userId: "user-1",
    name: "New name",
    leaderId: "LEADER-1",
    cards: [],
  });
  deckCardDeleteManyMock.mockResolvedValue({ count: 0 });
  deckCardCreateManyMock.mockResolvedValue({ count: 0 });
  cardFindUniqueMock.mockResolvedValue({ id: "LEADER-1", type: "Leader" });
  cardFindManyMock.mockResolvedValue([]);
  transactionMock.mockImplementation(
    async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        deck: { update: deckUpdateMock },
        deckCard: {
          deleteMany: deckCardDeleteManyMock,
          createMany: deckCardCreateManyMock,
        },
      })
  );
});

describe("PATCH /api/decks/[id]", () => {
  it("returns 401 before reading or updating a deck when unauthenticated", async () => {
    authMock.mockResolvedValueOnce(null);

    const res = await PATCH(buildRequest({ name: "New name" }), params);

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(rateLimitMock).not.toHaveBeenCalled();
    expect(deckFindFirstMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid partial update", async () => {
    const res = await PATCH(buildRequest({ name: "" }), params);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "name: Too small: expected string to have >=1 characters",
    });
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("updates only supplied fields and preserves cards when omitted", async () => {
    const res = await PATCH(buildRequest({ name: "New name" }), params);

    expect(res.status).toBe(200);
    expect(deckFindFirstMock).toHaveBeenCalledWith({
      where: { id: "deck-1", userId: "user-1" },
    });
    expect(deckCardDeleteManyMock).not.toHaveBeenCalled();
    expect(deckCardCreateManyMock).not.toHaveBeenCalled();
    expect(deckUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "deck-1" },
        data: { name: "New name" },
      })
    );
    expect(await res.json()).toEqual({
      data: expect.objectContaining({
        id: "deck-1",
        name: "New name",
      }),
    });
  });
});
