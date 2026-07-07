import { beforeEach, describe, expect, it, vi } from "vitest";

const cardFindManyMock = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    card: { findMany: (...args: unknown[]) => cardFindManyMock(...args) },
  },
}));

const { findCopyLimitViolations } = await import("./copy-limits");

const copyLimitOverrideSchema = {
  rule_modifications: [
    { rule_type: "COPY_LIMIT_OVERRIDE", limit: "UNLIMITED" },
  ],
};

beforeEach(() => {
  cardFindManyMock.mockReset();
  cardFindManyMock.mockResolvedValue([]);
});

describe("findCopyLimitViolations", () => {
  it("skips the DB entirely when no card exceeds the default limit", async () => {
    const violations = await findCopyLimitViolations([
      { cardId: "OP01-001", quantity: 4 },
      { cardId: "OP01-002", quantity: 1 },
    ]);

    expect(violations).toEqual([]);
    expect(cardFindManyMock).not.toHaveBeenCalled();
  });

  it("flags over-limit quantities for cards without an override", async () => {
    cardFindManyMock.mockResolvedValue([
      { id: "OP01-001", effectSchema: null },
    ]);

    const violations = await findCopyLimitViolations([
      { cardId: "OP01-001", quantity: 5 },
    ]);

    expect(violations).toEqual(["OP01-001"]);
  });

  it("allows over-limit quantities for COPY_LIMIT_OVERRIDE cards", async () => {
    cardFindManyMock.mockResolvedValue([
      { id: "OP01-075", effectSchema: copyLimitOverrideSchema },
    ]);

    const violations = await findCopyLimitViolations([
      { cardId: "OP01-075", quantity: 12 },
    ]);

    expect(violations).toEqual([]);
  });

  it("treats unknown card IDs as default-limit cards", async () => {
    cardFindManyMock.mockResolvedValue([]);

    const violations = await findCopyLimitViolations([
      { cardId: "FAKE-999", quantity: 9 },
    ]);

    expect(violations).toEqual(["FAKE-999"]);
  });
});
