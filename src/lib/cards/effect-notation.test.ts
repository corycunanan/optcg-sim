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
  type EffectSegment,
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
    ["Your Turn", "timing"],
    ["Opponent's Turn", "timing"],
    ["Rush", "keyword"],
    ["Rush: Character", "keyword"],
    ["Blocker", "keyword"],
    ["Double Attack", "keyword"],
    ["Banish", "keyword"],
    ["Unblockable", "keyword"],
    ["Once Per Turn", "modifier"],
    ["DON!! x1", "don"],
    ["DON!! x2", "don"],
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
    expect(classifyNotationToken("DON!! x9")).toBe("don");
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

  it("trims each line's edges and keeps its interior spacing byte for byte", () => {
    const [paragraph] = parseEffectText("   Draw  1   card.  \n");
    expect(paragraph).toEqual([{ kind: "text", text: "Draw  1   card." }]);
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
      ["don", "DON!! x2"],
    ]);
  });

  it("leaves an unclosed bracket or brace as printed", () => {
    expect(parseEffectLine("gains [Rush and {Sky Island")).toEqual([
      { kind: "text", text: "gains [Rush and {Sky Island" },
    ]);
  });

  it("still reads a well-formed token after an opener nothing closes", () => {
    expect(parseEffectLine("[ your {Sky Island} type")).toEqual([
      { kind: "text", text: "[ your " },
      { kind: "trait", label: "Sky Island" },
      { kind: "text", text: " type" },
    ]);
  });

  it("prints an interleaved span whole rather than badging its tail", () => {
    expect(parseEffectLine("[Sabo [Rush]")).toEqual([
      { kind: "text", text: "[Sabo [Rush]" },
    ]);
  });

  it("prints a nested span whole rather than badging its inner token", () => {
    expect(parseEffectLine("[[Rush]]")).toEqual([
      { kind: "text", text: "[[Rush]]" },
    ]);
  });

  it("prints a trait span containing a bracket whole", () => {
    expect(parseEffectLine("{Sky [Rush] Island}")).toEqual([
      { kind: "text", text: "{Sky [Rush] Island}" },
    ]);
  });

  it("does not emit an empty trait chip for an empty brace pair", () => {
    expect(parseEffectLine("a {  } b")).toEqual([
      { kind: "text", text: "a {  } b" },
    ]);
  });
});

/** Printed text of a segment tree, delimiters restored. */
function printed(segments: EffectSegment[]): string {
  return segments
    .map((segment) => {
      switch (segment.kind) {
        case "text":
          return segment.text;
        case "notation":
          return `[${segment.label}]`;
        case "trait":
          return `{${segment.label}}`;
        case "cost":
          return printed(segment.segments);
      }
    })
    .join("");
}

/** Every cost this line prices, as printed. */
function costsOf(line: string): string[] {
  return parseEffectLine(line).flatMap((segment) =>
    segment.kind === "cost" ? [printed(segment.segments)] : []
  );
}

describe("parseEffectLine costs", () => {
  it("prices the phrase before the colon and leaves the colon out of it", () => {
    expect(
      parseEffectLine("[On Play] You may rest this Character: Draw 1 card.")
    ).toEqual([
      { kind: "notation", family: "timing", label: "On Play" },
      { kind: "text", text: " " },
      {
        kind: "cost",
        segments: [{ kind: "text", text: "You may rest this Character" }],
      },
      { kind: "text", text: ": Draw 1 card." },
    ]);
  });

  it.each([
    ["[On Play] DON!! −1: Draw 1 card.", "DON!! −1"],
    [
      "[Activate: Main] ➁ (You may rest the specified number of DON!! cards in your cost area.): Draw 1 card.",
      "➁",
    ],
    [
      "[Main] DON!! −1, You may rest this Character: Draw 1 card.",
      "DON!! −1, You may rest this Character",
    ],
    [
      "[On Play] You can trash 1 card from your hand: Draw 1 card.",
      "You can trash 1 card from your hand",
    ],
  ])("prices %s", (line, cost) => {
    expect(costsOf(line)).toEqual([cost]);
  });

  it("keeps a trait chip inside the cost it is part of", () => {
    const [cost] = parseEffectLine(
      "[On Play] You may trash 1 {Navy} type card from your hand: Draw 1 card."
    ).filter((segment) => segment.kind === "cost");

    expect(cost).toEqual({
      kind: "cost",
      segments: [
        { kind: "text", text: "You may trash 1 " },
        { kind: "trait", label: "Navy" },
        { kind: "text", text: " type card from your hand" },
      ],
    });
  });

  it("prices a cost that refers to [Trigger] rather than reading it as a heading", () => {
    expect(
      costsOf(
        "[On Play] You may trash 1 card with a [Trigger] from your hand: Draw 1 card."
      )
    ).toEqual(["You may trash 1 card with a [Trigger] from your hand"]);
  });

  it("reads past every stacked and slash-separated heading", () => {
    expect(
      costsOf(
        "[DON!! x1] [On Play]/[When Attacking] [Once Per Turn] You may rest this Character: Draw 1 card."
      )
    ).toEqual(["You may rest this Character"]);
  });

  it("leaves a reminder parenthetical at the paragraph's own weight", () => {
    const line =
      "[On Play] DON!! −1 (You may return the specified number of DON!! cards from your field to your DON!! deck.) You may trash this Character: Draw 1 card.";

    expect(costsOf(line)).toEqual(["DON!! −1", "You may trash this Character"]);
    expect(printed(parseEffectLine(line))).toBe(line);
  });

  it("starts the cost after an `If …,` gate rather than pricing the condition", () => {
    expect(
      costsOf(
        "[On Play] If your Leader is [Shirahoshi], you may turn 1 card from the top of your Life cards face-down: Draw 1 card."
      )
    ).toEqual(["you may turn 1 card from the top of your Life cards face-down"]);
  });

  it("prices at most the first colon, so a nested option header stays prose", () => {
    expect(
      costsOf("[On Play] You may trash 1 card from your hand: Choose one:")
    ).toEqual(["You may trash 1 card from your hand"]);
  });

  it.each([
    "[On Play] Choose one:",
    "[Main] Your opponent chooses one:",
    "[Main] If your Leader is multicolored, choose one:",
    "Apply each of the following effects based on the number of cards in your trash:",
  ])("leaves the option header %s unpriced", (line) => {
    expect(costsOf(line)).toEqual([]);
  });

  it("does not price across a sentence that has already ended", () => {
    expect(
      costsOf(
        "[On Play] Give up to 1 rested DON!! card to your Leader.[Once Per Turn] You may trash 1 card from your hand: Draw 1 card."
      )
    ).toEqual([]);
  });

  it("does not price a payment opener that runs on into a second sentence", () => {
    expect(
      costsOf("[On Play] You may trash 1 card. Then, choose one: Draw 1 card.")
    ).toEqual([]);
  });

  it.each([
    "[On Play] You may play [Monkey.D.Luffy]. Then, choose one: Draw 1 card.",
    "[On Play] You may trash 1 card that is a {Navy}. Then, choose one: Draw 1 card.",
    "[Main] You may reveal 1 card with a type including \"CP\". Then, choose one: Draw 1 card.",
  ])(
    "ends the clause at a full stop that closes a bracket, brace, or quote: %s",
    (line) => {
      expect(costsOf(line)).toEqual([]);
    }
  );

  it("does not price across a semicolon", () => {
    expect(
      costsOf(
        "[On Play] You may look at 3 cards; reveal 1 of them: Draw 1 card."
      )
    ).toEqual([]);
  });

  it("keeps an abbreviation's periods from ending the cost's clause", () => {
    expect(
      costsOf("[Main] You may K.O. 1 of your Characters: Draw 1 card.")
    ).toEqual(["You may K.O. 1 of your Characters"]);
  });

  it("ignores the colons inside [Activate: Main] and a reminder", () => {
    expect(costsOf("[Activate: Main] Draw 1 card. (Not: a cost.)")).toEqual([]);
  });

  it("prices nothing on a line that asks for nothing", () => {
    expect(costsOf("[On Play] Draw 1 card.")).toEqual([]);
    expect(costsOf("Draw 1 card.")).toEqual([]);
  });

  it("emphasizes no whitespace at a cost's edges", () => {
    for (const segment of parseEffectLine(
      "[On Play]   You may rest this Character   : Draw 1 card."
    )) {
      if (segment.kind !== "cost") continue;
      expect(printed(segment.segments)).toBe(printed(segment.segments).trim());
    }
  });

  it("reproduces the source line exactly, whatever it prices", () => {
    const lines = [
      "[On Play] You may trash 1 {Navy} type card from your hand: Draw 1 card.",
      "[On Play] Choose one:",
      "[Main] DON!! −2 (You may return the specified number of DON!! cards from your field to your DON!! deck.): Draw 1 card.",
      "Characters other than [Sabo] gain +2000 power.",
    ];

    for (const line of lines) expect(printed(parseEffectLine(line))).toBe(line);
  });
});

/**
 * The notation vocabulary is only correct if it matches the cards, so these
 * read the committed card corpus (`docs/cards/`, generated by
 * `scripts/generate-card-docs.ts`).
 *
 * The load-bearing test is "accounts for every bracket token" below. A card
 * prints brackets for exactly two things: this notation, and a reference to
 * another card by name. The corpus names every card it contains in an `## `
 * heading, so every bracket token in it must be either a token we classify or
 * a card name — and a token that is neither is, by elimination, notation we do
 * not know about. That makes an unclassified token a failure rather than a
 * silent fall-through to plain text, which is the whole point of the gate.
 */
describe("printed corpus coverage", () => {
  const corpusDir = fileURLToPath(
    new URL("../../../docs/cards", import.meta.url)
  );

  const normalize = (value: string) =>
    value.trim().replace(/\s+/g, " ").toLowerCase();

  const corpusTokens = new Set<string>();
  const cardNames = new Set<string>();
  for (const entry of readdirSync(corpusDir)) {
    if (!entry.endsWith(".md")) continue;
    const source = readFileSync(join(corpusDir, entry), "utf8");
    for (const [, token] of source.matchAll(/\[([^[\]]+)\]/g)) {
      corpusTokens.add(normalize(token));
    }
    for (const [, name] of source.matchAll(/^## (.+)$/gm)) {
      cardNames.add(normalize(name));
    }
  }

  /**
   * Cards referenced by name whose own card is not in the corpus — the referent
   * has not been imported (or is printed under a different name). Each entry is
   * a deliberate, reviewable exemption: adding a token here to quiet the gate
   * asserts "this is a card name, not notation", so it has to be checked
   * against the card it names.
   */
  const REFERENCED_CARDS_OUTSIDE_CORPUS = ["blugori"];

  it("reads a non-trivial corpus", () => {
    expect(corpusTokens.size).toBeGreaterThan(100);
    expect(cardNames.size).toBeGreaterThan(500);
  });

  it("classifies exactly the notation tokens the corpus prints", () => {
    const classified = [...corpusTokens]
      .filter((token) => classifyNotationToken(token) !== null)
      .sort();

    expect(classified).toEqual(Object.keys(PRINTED_NOTATION_TOKENS).sort());
  });

  it("accounts for every bracket token as notation or a card name", () => {
    const unaccounted = [...corpusTokens]
      .filter(
        (token) =>
          classifyNotationToken(token) === null &&
          !cardNames.has(token) &&
          !REFERENCED_CARDS_OUTSIDE_CORPUS.includes(token)
      )
      .sort();

    expect(unaccounted).toEqual([]);
  });

  it("keeps no stale entries in the outside-corpus exemption list", () => {
    for (const token of REFERENCED_CARDS_OUTSIDE_CORPUS) {
      expect(corpusTokens.has(token)).toBe(true);
      expect(cardNames.has(token)).toBe(false);
    }
  });
});
