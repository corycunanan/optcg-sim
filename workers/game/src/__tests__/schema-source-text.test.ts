import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getAllAuthoredSchemas } from "../engine/schema-registry.js";

interface CardSourceText {
  effectText: string;
  triggerText: string | null;
}

const repoRoot = resolve(import.meta.dirname, "../../../..");
const cardsDir = resolve(repoRoot, "docs/cards");

function parseCardSourceText(markdown: string): Map<string, CardSourceText> {
  const cards = new Map<string, CardSourceText>();

  for (const section of markdown.split(/\n---\n/)) {
    const metadata = section.match(/^\*\*([A-Z0-9]+-\d+[A-Za-z]?)\*\*[^\n]*$/m);
    if (!metadata || metadata.index === undefined) continue;

    const body = section.slice(metadata.index + metadata[0].length).trim();
    const triggerMarker = "**Trigger:**";
    const triggerIndex = body.indexOf(triggerMarker);
    cards.set(metadata[1], {
      effectText: (triggerIndex === -1
        ? body
        : body.slice(0, triggerIndex)
      ).trim(),
      triggerText:
        triggerIndex === -1
          ? null
          : body.slice(triggerIndex + triggerMarker.length).trim(),
    });
  }

  return cards;
}

function sourceTextMatchesCardClause(
  sourceText: string,
  triggerKeyword: string | undefined,
  source: CardSourceText
): boolean {
  const sourceField =
    triggerKeyword === "TRIGGER" ? source.triggerText : source.effectText;
  const sourceClauses = (sourceField ?? "")
    .split(/\r?\n/)
    .map((clause) => clause.trim().replace(/\s+/g, " "))
    .filter((clause) => clause.length > 0);
  const normalizedSourceText = sourceText.trim().replace(/\s+/g, " ");

  return (
    sourceClauses.filter((clause) => clause === normalizedSourceText).length ===
    1
  );
}

describe("schema lint: effect-block source_text", () => {
  const cardText = new Map<string, CardSourceText>();
  for (const file of readdirSync(cardsDir).filter((entry) =>
    entry.endsWith(".md")
  )) {
    for (const [cardId, source] of parseCardSourceText(
      readFileSync(resolve(cardsDir, file), "utf8")
    )) {
      cardText.set(cardId, source);
    }
  }

  it("keeps every authored source_text equal to its current card clause", () => {
    const failures: string[] = [];
    let sourceTextCount = 0;

    for (const [cardId, schema] of Object.entries(getAllAuthoredSchemas())) {
      for (const block of schema.effects) {
        if (block.source_text === undefined) continue;
        sourceTextCount++;

        const source = cardText.get(cardId);
        if (!source) {
          failures.push(`${cardId} :: ${block.id} — card text is missing`);
          continue;
        }
        if (block.source_text.length === 0) {
          failures.push(`${cardId} :: ${block.id} — source_text is empty`);
          continue;
        }
        const triggerKeyword =
          block.trigger && "keyword" in block.trigger
            ? block.trigger.keyword
            : undefined;
        if (
          !sourceTextMatchesCardClause(
            block.source_text,
            triggerKeyword,
            source
          )
        ) {
          failures.push(
            `${cardId} :: ${block.id} — source_text is stale or ambiguous in ${triggerKeyword === "TRIGGER" ? "triggerText" : "effectText"}: ${JSON.stringify(block.source_text)}`
          );
        }
      }
    }

    expect(failures).toEqual([]);
    expect(sourceTextCount).toBeGreaterThanOrEqual(29);
  });

  it("validates trigger blocks only against triggerText", () => {
    const source = {
      effectText: "Shared clause.\nEffect-only clause.",
      triggerText: "Shared clause.\nTrigger-only clause.",
    };

    expect(
      sourceTextMatchesCardClause("Trigger-only clause.", "TRIGGER", source)
    ).toBe(true);
    expect(
      sourceTextMatchesCardClause("Effect-only clause.", "TRIGGER", source)
    ).toBe(false);
    expect(
      sourceTextMatchesCardClause("Effect-only clause.", "ON_PLAY", source)
    ).toBe(true);
    expect(
      sourceTextMatchesCardClause("Trigger-only clause.", "ON_PLAY", source)
    ).toBe(false);
  });
});
