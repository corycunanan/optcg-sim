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

  it("keeps every authored source_text contiguous with current card text", () => {
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
        if (
          !source.effectText.includes(block.source_text) &&
          !source.triggerText?.includes(block.source_text)
        ) {
          failures.push(
            `${cardId} :: ${block.id} — source_text is stale: ${JSON.stringify(block.source_text)}`
          );
        }
      }
    }

    expect(failures).toEqual([]);
    expect(sourceTextCount).toBeGreaterThanOrEqual(28);
  });
});
