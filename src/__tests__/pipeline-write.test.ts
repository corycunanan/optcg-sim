import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { writeToDatabase } from "../../pipeline/write";

describe("pipeline write ordering", () => {
  it("does not clear CardSet rows when an art-variant upsert fails", async () => {
    const deleteMany = vi.fn();
    const transaction = vi.fn();
    const prisma = {
      artVariant: {
        upsert: vi.fn().mockRejectedValue(new Error("P2024")),
      },
      cardSet: {
        createMany: vi.fn(),
        deleteMany,
      },
      $transaction: transaction,
    } as unknown as PrismaClient;

    await expect(
      writeToDatabase(
        prisma,
        [],
        [
          {
            cardId: "OP01-001",
            variantId: "OP01-001_p1",
            label: "Parallel",
            rarity: "Leader",
            imageUrl: "https://example.com/OP01-001_p1.png",
            set: "OP01",
          },
        ],
        []
      )
    ).rejects.toThrow("P2024");

    expect(deleteMany).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("replaces CardSet rows in one transaction", async () => {
    const deleteOperation = Promise.resolve({ count: 2 });
    const createOperation = Promise.resolve({ count: 1 });
    const transaction = vi.fn().mockResolvedValue([{ count: 2 }, { count: 1 }]);
    const prisma = {
      artVariant: {
        upsert: vi.fn(),
      },
      cardSet: {
        createMany: vi.fn().mockReturnValue(createOperation),
        deleteMany: vi.fn().mockReturnValue(deleteOperation),
      },
      $transaction: transaction,
    } as unknown as PrismaClient;

    const result = await writeToDatabase(
      prisma,
      [],
      [],
      [
        {
          cardId: "OP01-001",
          packId: "569101",
          setLabel: "OP-01",
          setName: "ROMANCE DAWN",
          isOrigin: true,
        },
      ]
    );

    expect(transaction).toHaveBeenCalledOnce();
    expect(transaction).toHaveBeenCalledWith([
      deleteOperation,
      createOperation,
    ]);
    expect(result.cardSetsCreated).toBe(1);
  });
});
