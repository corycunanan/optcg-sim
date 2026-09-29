import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  findUndocumentedCards,
  type ManifestFacts,
} from "../../scripts/check-card-doc-coverage.js";

const manifest = JSON.parse(
  readFileSync(resolve(__dirname, "../engine/card-text-manifest.generated.json"), "utf8"),
) as Record<string, ManifestFacts>;
const docsDir = resolve(__dirname, "../../../../docs/cards");
const docs = readdirSync(docsDir)
  .filter((file) => file.endsWith(".md"))
  .map((file) => readFileSync(resolve(docsDir, file), "utf8"));

describe("card doc coverage gate (OPT-830)", () => {
  it("green: every effect-bearing manifest card has a doc heading", () => {
    expect(findUndocumentedCards(manifest, docs)).toEqual([]);
  });

  it("red: removing a Trigger-only heading names the card", () => {
    // OP09-105 Sanji is Trigger-only (no effect text, Trigger text present).
    expect(manifest["OP09-105"]).toMatchObject({ hasRealEffectText: false, hasTriggerText: true });
    const mutated = docs.map((doc) =>
      doc.replace(/## Sanji\n\*\*OP09-105\*\*[\s\S]*?\n---\n/, ""),
    );
    expect(mutated.join("")).not.toContain("**OP09-105**");
    expect(findUndocumentedCards(manifest, mutated)).toEqual(["OP09-105"]);
  });

  it("ignores manifest cards with no effect or trigger text", () => {
    const facts = { hasRealEffectText: false, hasTriggerText: false };
    expect(findUndocumentedCards({ "XX01-001": facts }, [])).toEqual([]);
  });
});
