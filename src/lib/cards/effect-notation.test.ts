import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  classifyNotationToken,
  parseEffectLine,
  parseEffectText,
  PRINTED_NOTATION_TOKENS,
  type EffectNotationFamily,
} from "./effect-notation";

/** EB02-052 — two effects, a mid-sentence keyword, and a trait reference. */
const EB02_052 = [
  "If your Leader has the {Sky Island} type, this Character gains [Rush].",
  "[When Attacking] You may trash 1 card from your hand: If you have 1 or less Life cards, add up to 1 card from the top of your deck to the top of your Life cards. Then, this Character gains +1000 power during this turn.",
].join("\n");

describe("classifyNotationToken", () => {
  it.each([
    ["On Play", "timing"],
    ["Activate: Main", "timing"],
    ["Main", "timing"],
    ["When Attacking", "timing"],
    ["On K.O.", "timing"],
    ["On Block", "timing"],
    ["On Your Opponent's Attack", "timing"],
    ["End of Your Turn", "timing"],
    ["Rush", "keyword"],
    ["Rush: Character", "keyword"],
    ["Blocker", "keyword"],
    ["Double Attack", "keyword"],
    ["Banish", "keyword"],
    ["Unblockable", "keyword"],
    ["Once Per Turn", "modifier"],
    ["Your Turn", "modifier"],
    ["Opponent's Turn", "modifier"],
    ["DON!! x1", "modifier"],
    ["DON!! x2", "modifier"],
    ["Trigger", "trigger"],
    ["Counter", "counter"],
  ] satisfies [string, EffectNotationFamily][])(
    "maps [%s] to the %s family",
    (token, family) => {
      expect(classifyNotationToken(token)).toBe(family);
    }
  );

  it("tolerates casing and stray whitespace inside the brackets", () => {
    expect(classifyNotationToken("  on   PLAY ")).toBe("timing");
  });

  it("badges DON!! costs beyond those printed today", () => {
    expect(classifyNotationToken("DON!! x9")).toBe("modifier");
  });

  it.each(["Monkey.D.Luffy", "Sanji", "Enel", "Onigashima Island", "Monster"])(
    "leaves the referenced card name [%s] unclassified",
    (token) => {
      expect(classifyNotationToken(token)).toBeNull();
    }
  );
});

describe("parseEffectText paragraphs", () => {
  it("gives each printed effect its own paragraph", () => {
    const paragraphs = parseEffectText(EB02_052);

    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0]).toContainEqual({
      kind: "notation",
      family: "keyword",
      label: "Rush",
    });
    expect(paragraphs[1][0]).toEqual({
      kind: "notation",
      family: "timing",
      label: "When Attacking",
    });
  });

  it("drops blank lines rather than emitting empty paragraphs", () => {
    expect(parseEffectText("[On Play] Draw 1 card.\n\n\n[Trigger] Draw 1 card."))
      .toHaveLength(2);
  });

  it("returns no paragraphs for empty or whitespace-only text", () => {
    expect(parseEffectText("")).toEqual([]);
    expect(parseEffectText("   \n  \n")).toEqual([]);
  });

  it("renders effect text with no notation at all as a single text run", () => {
    const [paragraph] = parseEffectText("Draw 1 card.");
    expect(paragraph).toEqual([{ kind: "text", text: "Draw 1 card." }]);
  });
});

describe("parseEffectLine segments", () => {
  it("keeps the surrounding prose verbatim around a notation chip", () => {
    expect(
      parseEffectLine("this Character gains [Rush] during this turn.")
    ).toEqual([
      { kind: "text", text: "this Character gains " },
      { kind: "notation", family: "keyword", label: "Rush" },
      { kind: "text", text: " during this turn." },
    ]);
  });

  it("strips the braces from a trait", () => {
    expect(parseEffectLine("your {Sky Island} type Characters")).toEqual([
      { kind: "text", text: "your " },
      { kind: "trait", label: "Sky Island" },
      { kind: "text", text: " type Characters" },
    ]);
  });

  it("passes a referenced card name through with its brackets intact", () => {
    expect(
      parseEffectLine("Characters other than [Sabo] gain +2000 power.")
    ).toEqual([
      {
        kind: "text",
        text: "Characters other than [Sabo] gain +2000 power.",
      },
    ]);
  });

  it("handles several notation tokens stacked on one effect", () => {
    const segments = parseEffectLine(
      "[Activate: Main] [Once Per Turn] [DON!! x2] Draw 1 card."
    );

    expect(
      segments.flatMap((segment) =>
        segment.kind === "notation" ? [[segment.family, segment.label]] : []
      )
    ).toEqual([
      ["timing", "Activate: Main"],
      ["modifier", "Once Per Turn"],
      ["modifier", "DON!! x2"],
    ]);
  });

  it("leaves an unclosed bracket or brace as printed", () => {
    expect(parseEffectLine("gains [Rush and {Sky Island")).toEqual([
      { kind: "text", text: "gains [Rush and {Sky Island" },
    ]);
  });

  it("does not emit an empty trait chip for an empty brace pair", () => {
    expect(parseEffectLine("a {  } b")).toEqual([
      { kind: "text", text: "a {  } b" },
    ]);
  });
});

/**
 * The notation vocabulary is only correct if it matches the cards. These read
 * the committed card corpus (`docs/cards/`, generated by
 * `scripts/generate-card-docs.ts`) so a set that prints a token we do not know
 * fails here rather than rendering a raw bracket in the UI.
 */
describe("printed corpus coverage", () => {
  const corpusDir = fileURLToPath(
    new URL("../../../docs/cards", import.meta.url)
  );

  const corpusTokens = new Set<string>();
  for (const entry of readdirSync(corpusDir)) {
    if (!entry.endsWith(".md")) continue;
    const source = readFileSync(join(corpusDir, entry), "utf8");
    for (const [, token] of source.matchAll(/\[([^[\]]+)\]/g)) {
      corpusTokens.add(token.trim().replace(/\s+/g, " ").toLowerCase());
    }
  }

  it("reads a non-trivial corpus", () => {
    expect(corpusTokens.size).toBeGreaterThan(100);
  });

  it("classifies exactly the notation tokens the corpus prints", () => {
    const classified = [...corpusTokens]
      .filter((token) => classifyNotationToken(token) !== null)
      .sort();

    expect(classified).toEqual(Object.keys(PRINTED_NOTATION_TOKENS).sort());
  });

  /**
   * The equality above cannot catch a *new* notation token, because an
   * unrecognized token simply classifies as `null`. Timing markers are the
   * family that grows, and they are shaped unlike any card name — they open
   * with one of these words. Anything matching must be classified.
   */
  it("classifies every token shaped like a timing marker", () => {
    const timingShaped =
      /^(?:on|when|activate|end of|start of|main|counter|trigger|don!!|once per)\b/;
    const unclassified = [...corpusTokens].filter(
      (token) => timingShaped.test(token) && classifyNotationToken(token) === null
    );

    expect(unclassified).toEqual([]);
  });
});
