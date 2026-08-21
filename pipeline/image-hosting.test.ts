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

  it("rejects a lookalike CDN host", () => {
    const row = {
      id: "OP17-002",
      imageUrl: "https://cdn.example.com.evil/cards/OP17-002.webp",
    };

    expect(findOffCdnImages([row], "https://cdn.example.com")).toEqual([row]);
  });

  it("requires a non-empty object path under the normalized CDN prefix", () => {
    const cdnUrl = normalizeCdnUrl("https://cdn.example.com/images/");
    expect(cdnUrl).toBe("https://cdn.example.com/images");

    const siblingPath = {
      id: "OP17-003",
      imageUrl: "https://cdn.example.com/images-other/OP17-003.webp",
    };
    const bareRoot = {
      id: "OP17-004",
      imageUrl: "https://cdn.example.com/images",
    };
    const emptyObjectPath = {
      id: "OP17-005",
      imageUrl: "https://cdn.example.com/images/",
    };
    const hostedObject = {
      id: "OP17-006",
      imageUrl: "https://cdn.example.com/images/OP17-006.webp",
    };

    expect(
      findOffCdnImages(
        [siblingPath, bareRoot, emptyObjectPath, hostedObject],
        cdnUrl!
      )
    ).toEqual([siblingPath, bareRoot, emptyObjectPath]);
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
