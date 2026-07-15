import { describe, expect, it } from "vitest";
import { buildCardWhereClause } from "./search";

describe("buildCardWhereClause", () => {
  it("does not add a name filter for an empty query", () => {
    expect(buildCardWhereClause({ q: "  " })).toEqual({});
  });

  it("rejects a 1-2 character substring query", () => {
    expect(() => buildCardWhereClause({ q: "lu" })).toThrow(RangeError);
  });

  it("trims and preserves supported case-insensitive substring search", () => {
    expect(buildCardWhereClause({ q: "  luf  " })).toEqual({
      name: { contains: "luf", mode: "insensitive" },
    });
  });
});
