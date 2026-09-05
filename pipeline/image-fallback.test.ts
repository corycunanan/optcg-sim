import { describe, expect, it } from "vitest";

import { shouldReplaceStubImage } from "./image-fallback";

describe("shouldReplaceStubImage", () => {
  it("replaces a flagged existing image when a true base card arrives", () => {
    expect(
      shouldReplaceStubImage(
        {
          imageUrl: "https://cdn.example.com/cards/ST31-004.webp",
          imageIsVariantFallback: true,
        },
        {
          imageUrl: "https://example.com/cards/ST31-004.png",
          imageIsVariantFallback: false,
        }
      )
    ).toBe(true);
  });

  it("preserves a flagged existing image when another fallback arrives", () => {
    expect(
      shouldReplaceStubImage(
        {
          imageUrl: "https://cdn.example.com/cards/ST31-004.webp",
          imageIsVariantFallback: true,
        },
        {
          imageUrl: "https://example.com/cards/ST31-004_p2.png",
          imageIsVariantFallback: true,
        }
      )
    ).toBe(false);
  });

  it("preserves an unflagged migrated R2 base-card key", () => {
    expect(
      shouldReplaceStubImage(
        {
          imageUrl: "https://cdn.example.com/cards/ST31-004.webp",
          imageIsVariantFallback: false,
        },
        {
          imageUrl: "https://example.com/cards/ST31-004.png",
          imageIsVariantFallback: false,
        }
      )
    ).toBe(false);
  });

  it("replaces an unflagged parallel URL through the legacy path", () => {
    expect(
      shouldReplaceStubImage(
        {
          imageUrl: "https://example.com/cards/ST31-004_p1.png",
          imageIsVariantFallback: false,
        },
        {
          imageUrl: "https://example.com/cards/ST31-004.png",
          imageIsVariantFallback: false,
        }
      )
    ).toBe(true);
  });

  it("replaces an uppercase parallel marker with a query string", () => {
    expect(
      shouldReplaceStubImage(
        {
          imageUrl: "https://example.com/cards/ST31-004_P1.webp?version=260810",
          imageIsVariantFallback: false,
        },
        {
          imageUrl: "https://example.com/cards/ST31-004.png",
          imageIsVariantFallback: false,
        }
      )
    ).toBe(true);
  });
});
