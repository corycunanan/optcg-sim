import { describe, expect, it } from "vitest";
import {
  exitCodeFor,
  findOffCdnImages,
  normalizeCdnUrl,
  summarizeOffCdn,
} from "./image-hosting";

describe("image hosting checks", () => {
  it("normalizes a CDN URL by trimming whitespace and trailing slashes", () => {
    expect(normalizeCdnUrl("  https://cdn.example.com///  ")).toBe(
      "https://cdn.example.com"
    );
  });

  it("returns null for an empty CDN URL", () => {
    expect(normalizeCdnUrl(undefined)).toBeNull();
    expect(normalizeCdnUrl("")).toBeNull();
    expect(normalizeCdnUrl("   ")).toBeNull();
  });

  it("finds image rows that are not hosted on the configured CDN", () => {
    const rows = [
      {
        id: "OP01-001",
        imageUrl: "https://cdn.example.com/cards/OP01-001.webp",
      },
      { id: "OP17-001", imageUrl: "https://images.example.com/OP17-001.png" },
    ];

    expect(findOffCdnImages(rows, "https://cdn.example.com")).toEqual([
      rows[1],
    ]);
  });

  it("summarizes off-CDN cards and variants, including official-host URLs", () => {
    const cards = [
      {
        id: "OP17-001",
        imageUrl:
          "https://en.onepiece-cardgame.com/images/cardlist/card/OP17-001.png",
      },
      {
        id: "OP01-001",
        imageUrl: "https://cdn.example.com/cards/OP01-001.webp",
      },
    ];
    const variants = [
      {
        id: "OP17-001_p1",
        imageUrl:
          "https://en.onepiece-cardgame.com/images/cardlist/card/OP17-001_p1.png",
      },
      {
        id: "OP01-001_p1",
        imageUrl: "https://cdn.example.com/variants/uuid.webp",
      },
    ];

    expect(summarizeOffCdn(cards, variants, "https://cdn.example.com")).toEqual(
      {
        cards: [cards[0]],
        variants: [variants[0]],
        total: 2,
      }
    );
  });

  it("returns a failing exit code for missing CDN configuration or off-CDN images", () => {
    expect(exitCodeFor(null)).toBe(1);
    expect(exitCodeFor({ cards: [], variants: [], total: 1 })).toBe(1);
    expect(exitCodeFor({ cards: [], variants: [], total: 0 })).toBe(0);
  });
});
