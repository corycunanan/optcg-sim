import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const rateLimitMock = vi.fn(async () => ({ limited: false, remaining: 99 }));
const cardFindUniqueMock = vi.fn();
const cardFindManyMock = vi.fn();
const deckCreateMock = vi.fn();
const deckFindManyMock = vi.fn();

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/db", () => ({
  prisma: {
    card: {
      findUnique: (...args: unknown[]) => cardFindUniqueMock(...args),
      findMany: (...args: unknown[]) => cardFindManyMock(...args),
    },
    deck: {
      create: (...args: unknown[]) => deckCreateMock(...args),
      findMany: (...args: unknown[]) => deckFindManyMock(...args),
    },
  },
}));
vi.mock("@/lib/rate-limit", () => ({
  apiLimiter: { check: rateLimitMock },
}));

const { GET, POST } = await import("./route");

function buildRequest(body: unknown) {
  return new NextRequest("http://localhost/api/decks", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const copyLimitOverrideSchema = {
  rule_modifications: [
    { rule_type: "COPY_LIMIT_OVERRIDE", limit: "UNLIMITED" },
  ],
};

beforeEach(() => {
  authMock.mockReset();
  rateLimitMock.mockReset();
  cardFindUniqueMock.mockReset();
  cardFindManyMock.mockReset();
  deckCreateMock.mockReset();
  deckFindManyMock.mockReset();

  authMock.mockResolvedValue({ user: { id: "user-1" } });
  rateLimitMock.mockResolvedValue({ limited: false, remaining: 99 });
  cardFindUniqueMock.mockResolvedValue({ id: "LEADER-1", type: "Leader" });
  cardFindManyMock.mockResolvedValue([]);
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

  it("allows over-four quantities for COPY_LIMIT_OVERRIDE cards", async () => {
    cardFindManyMock.mockResolvedValue([
      { id: "OP01-075", effectSchema: copyLimitOverrideSchema },
    ]);

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

  it("rejects over-four quantities for cards without a copy limit override", async () => {
    cardFindManyMock.mockResolvedValue([
      { id: "OP01-001", effectSchema: null },
    ]);

    const res = await POST(
      buildRequest({
        name: "Illegal Draft",
        leaderId: "LEADER-1",
        cards: [{ cardId: "OP01-001", quantity: 8 }],
      })
    );

    expect(res.status).toBe(400);
    expect(deckCreateMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/decks", () => {
  function deckRecord(overrides: Record<string, unknown> = {}) {
    return {
      id: "deck-1",
      name: "Straw Hat Aggro",
      leaderId: "OP01-001",
      leaderArtUrl: null,
      format: "Standard",
      createdAt: new Date("2026-04-01T00:00:00.000Z"),
      updatedAt: new Date("2026-04-29T00:00:00.000Z"),
      cards: [{ quantity: 4, card: { id: "OP01-016", color: ["Green"] } }],
      leader: {
        id: "OP01-001",
        name: "Roronoa Zoro",
        color: ["Red"],
        imageUrl: "https://cdn.example/base/OP01-001.png",
      },
      ...overrides,
    };
  }

  async function listColors(): Promise<string[]> {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { colors: string[] }[] };
    return body.data[0].colors;
  }

  it("reports a leader-inclusive color identity, matching /decks (OPT-617)", async () => {
    deckFindManyMock.mockResolvedValue([deckRecord()]);

    expect(await listColors()).toEqual(["Red", "Green"]);
  });

  it("still reports a color for a leader-only draft deck", async () => {
    deckFindManyMock.mockResolvedValue([deckRecord({ cards: [] })]);

    expect(await listColors()).toEqual(["Red"]);
  });

  it("selects the leader color so the union can be computed", async () => {
    deckFindManyMock.mockResolvedValue([]);

    await GET();

    expect(deckFindManyMock.mock.calls[0][0].include.leader.select.color).toBe(
      true
    );
  });

  it("requires authentication", async () => {
    authMock.mockResolvedValue(null);

    const res = await GET();

    expect(res.status).toBe(401);
    expect(deckFindManyMock).not.toHaveBeenCalled();
  });
});
