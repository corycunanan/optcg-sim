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

  it("filters by one effect tag", () => {
    expect(buildCardWhereClause({ effectTags: "trigger:on_play" })).toEqual({
      AND: [{ effectTags: { hasSome: ["trigger:on_play"] } }],
    });
  });

  it("ORs effect tags within one facet group", () => {
    expect(
      buildCardWhereClause({ effectTags: "removal:ko,removal:bounce" })
    ).toEqual({
      AND: [
        {
          effectTags: {
            hasSome: ["removal:ko", "removal:bounce"],
          },
        },
      ],
    });
  });

  it("ANDs effect tags across facet groups", () => {
    expect(
      buildCardWhereClause({
        effectTags: "trigger:on_play,removal:ko,removal:bounce",
      })
    ).toEqual({
      AND: [
        { effectTags: { hasSome: ["trigger:on_play"] } },
        {
          effectTags: {
            hasSome: ["removal:ko", "removal:bounce"],
          },
        },
      ],
    });
  });

  it("drops effect tags outside the Tier 1 vocabulary", () => {
    expect(
      buildCardWhereClause({
        effectTags: "trigger:on_play,unknown:not_a_real_tag",
      })
    ).toEqual({
      AND: [{ effectTags: { hasSome: ["trigger:on_play"] } }],
    });
  });

  it("ignores an entirely unknown tag list, including unknown values in known groups", () => {
    expect(
      buildCardWhereClause({
        effectTags: "trigger:unknown,removal:unknown,unknown:ko",
      })
    ).toEqual({});
  });

  it("filters effect-referenced traits independently", () => {
    expect(
      buildCardWhereClause({ effectTraits: "Straw Hat Crew,Navy" })
    ).toEqual({
      effectTraits: { hasSome: ["Straw Hat Crew", "Navy"] },
    });
  });

  it("keeps printed traits and effect-referenced traits independent", () => {
    expect(
      buildCardWhereClause({
        traits: "Supernovas",
        effectTraits: "Straw Hat Crew",
      })
    ).toEqual({
      traits: { hasSome: ["Supernovas"] },
      effectTraits: { hasSome: ["Straw Hat Crew"] },
    });
  });

  it("filters by minimum printed counter", () => {
    expect(buildCardWhereClause({ counterMin: "1" })).toEqual({
      counter: { gte: 1 },
    });
  });

  it("accepts zero as the maximum printed counter", () => {
    expect(buildCardWhereClause({ counterMax: "0" })).toEqual({
      counter: { lte: 0 },
    });
  });

  it("uses range comparisons that exclude null printed counters", () => {
    expect(
      buildCardWhereClause({ counterMin: "0", counterMax: "2000" })
    ).toEqual({
      counter: { gte: 0, lte: 2000 },
    });
  });
});
