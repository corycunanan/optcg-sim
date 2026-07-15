import { describe, expect, it } from "vitest";

import {
  cardIdToOriginSet,
  decodeHtmlEntities,
  detectVariantType,
  stripVariantSuffix,
} from "@shared/card-parsing";

describe("card parsing", () => {
  it("decodes the HTML entities used in card data", () => {
    expect(
      decodeHtmlEntities("&amp;&lt;&gt;&quot;&#39;&#x27;&#x2F;&apos;")
    ).toBe("&<>\"''/'");
  });

  it("parses variant IDs", () => {
    expect(stripVariantSuffix("OP01-001_p1")).toBe("OP01-001");
    expect(stripVariantSuffix("OP01-001_r2")).toBe("OP01-001");
    expect(stripVariantSuffix("OP01-001")).toBe("OP01-001");
    expect(detectVariantType("OP01-001_p1")).toBe("parallel");
    expect(detectVariantType("OP01-001_r2")).toBe("reprint");
    expect(detectVariantType("OP01-001")).toBe("base");
  });

  it("derives origin sets from standard card IDs", () => {
    expect(cardIdToOriginSet("OP01-001")).toBe("OP-01");
    expect(cardIdToOriginSet("ST01-001")).toBe("ST-01");
    expect(cardIdToOriginSet("not-a-card-id")).toBe("UNKNOWN");
  });
});
