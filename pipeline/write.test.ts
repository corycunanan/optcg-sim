import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import type { BaseCard } from "./classify";
import { writeToDatabase } from "./write";

function makeBaseCard(overrides: Partial<BaseCard> = {}): BaseCard {
  return {
    id: "ST31-004",
    originSet: "ST-31",
    name: "Test Card",
    type: "Character",
    color: ["Red"],
    cost: 4,
    life: null,
    power: 5000,
    counter: 1000,
    attribute: ["Strike"],
    traits: ["Test"],
    rarity: "Common",
    effectText: "",
    triggerText: null,
    imageUrl: "https://example.com/cards/ST31-004.png",
    imageIsVariantFallback: false,
    blockNumber: 4,
    isReprint: false,
    ...overrides,
  };
}

function makePrisma(existingCards: object[]) {
  const upsert = vi.fn().mockResolvedValue(undefined);
  const tx = {
    card: {
      findMany: vi.fn().mockResolvedValue(existingCards),
      upsert,
    },
  };
  const prisma = {
    $transaction: vi.fn(async (operation: unknown) => {
      if (typeof operation === "function") {
        return operation(tx);
      }
      return Promise.all(operation as Promise<unknown>[]);
    }),
    artVariant: { upsert: vi.fn() },
    cardSet: {
      createMany: vi.fn(),
      deleteMany: vi.fn().mockResolvedValue(undefined),
    },
  };

  return { prisma: prisma as unknown as PrismaClient, upsert };
}

describe("writeToDatabase", () => {
  it("carries the variant-fallback flag when creating a card", async () => {
    const { prisma, upsert } = makePrisma([]);

    await writeToDatabase(
      prisma,
      [makeBaseCard({ imageIsVariantFallback: true })],
      [],
      []
    );

    expect(upsert.mock.calls[0][0].create).toMatchObject({
      imageIsVariantFallback: true,
    });
  });

  it("replaces and clears a flagged ST31-004 image when the base arrives", async () => {
    const { prisma, upsert } = makePrisma([
      {
        id: "ST31-004",
        imageUrl: "https://cdn.example.com/cards/ST31-004.webp",
        imageIsVariantFallback: true,
      },
    ]);

    await writeToDatabase(prisma, [makeBaseCard()], [], []);

    expect(upsert.mock.calls[0][0].update).toMatchObject({
      imageUrl: "https://example.com/cards/ST31-004.png",
      imageIsVariantFallback: false,
    });
  });

  it("leaves a flagged stub and flag untouched when another stub arrives", async () => {
    const { prisma, upsert } = makePrisma([
      {
        id: "ST31-004",
        imageUrl: "https://cdn.example.com/cards/ST31-004.webp",
        imageIsVariantFallback: true,
      },
    ]);

    await writeToDatabase(
      prisma,
      [
        makeBaseCard({
          imageUrl: "https://example.com/cards/ST31-004_p2.png",
          imageIsVariantFallback: true,
        }),
      ],
      [],
      []
    );

    expect(upsert.mock.calls[0][0].update).not.toHaveProperty("imageUrl");
    expect(upsert.mock.calls[0][0].update).not.toHaveProperty(
      "imageIsVariantFallback"
    );
  });

  it("leaves an unflagged base image and flag untouched when a stub arrives", async () => {
    const { prisma, upsert } = makePrisma([
      {
        id: "ST31-004",
        imageUrl: "https://cdn.example.com/cards/ST31-004.webp",
        imageIsVariantFallback: false,
      },
    ]);

    await writeToDatabase(
      prisma,
      [
        makeBaseCard({
          imageUrl: "https://example.com/cards/ST31-004_p1.png",
          imageIsVariantFallback: true,
        }),
      ],
      [],
      []
    );

    expect(upsert.mock.calls[0][0].update).not.toHaveProperty("imageUrl");
    expect(upsert.mock.calls[0][0].update).not.toHaveProperty(
      "imageIsVariantFallback"
    );
  });
});
