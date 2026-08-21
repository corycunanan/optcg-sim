import { describe, expect, it } from "vitest";

import { shouldReplaceStubImage } from "./image-fallback";

describe("shouldReplaceStubImage", () => {
  it("replaces an official-host parallel PNG when a true base card arrives", () => {
    expect(
      shouldReplaceStubImage(
        "https://example.com/cards/ST31-004_p1.png?260810",
        {
          imageUrl: "https://example.com/cards/ST31-004.png",
          imageIsVariantFallback: false,
        }
      )
    ).toBe(true);
  });

  it("preserves an official-host parallel PNG when another fallback arrives", () => {
    expect(
      shouldReplaceStubImage(
        "https://example.com/cards/ST31-004_p1.png",
        {
          imageUrl: "https://example.com/cards/ST31-004_p2.png",
          imageIsVariantFallback: true,
        }
      )
    ).toBe(false);
  });

  it("preserves a migrated R2 base-card key", () => {
    expect(
      shouldReplaceStubImage("https://cdn.example.com/cards/ST31-004.webp", {
        imageUrl: "https://example.com/cards/ST31-004.png",
        imageIsVariantFallback: false,
      })
    ).toBe(false);
  });

  it("preserves an R2 variant UUID key without a parallel suffix", () => {
    expect(
      shouldReplaceStubImage(
        "https://cdn.example.com/variants/550e8400-e29b-41d4-a716-446655440000.webp",
        {
          imageUrl: "https://example.com/cards/ST31-004.png",
          imageIsVariantFallback: false,
        }
      )
    ).toBe(false);
  });

  it("replaces a parallel WebP with a query string", () => {
    expect(
      shouldReplaceStubImage(
        "https://example.com/cards/ST32-002_p12.webp?version=260810",
        {
          imageUrl: "https://example.com/cards/ST32-002.webp",
          imageIsVariantFallback: false,
        }
      )
    ).toBe(true);
  });

  it("replaces an uppercase parallel marker", () => {
    expect(
      shouldReplaceStubImage("https://example.com/cards/ST31-004_P1.png", {
        imageUrl: "https://example.com/cards/ST31-004.png",
        imageIsVariantFallback: false,
      })
    ).toBe(true);
  });
});
