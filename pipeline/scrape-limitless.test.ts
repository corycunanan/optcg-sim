import { readFile } from "fs/promises";
import { join } from "path";

import { describe, expect, it } from "vitest";

import type { RawVegapullCard } from "./load";
import {
  inheritVariantRarities,
  parseCardPage,
  parseSetList,
  validateCards,
} from "./scrape-limitless";

const FIXTURES = join(process.cwd(), "pipeline", "fixtures");
const PACK_ID = "569117";

describe("Limitless scraper", () => {
  it("enumerates base and variant pages for the selected set only", async () => {
    const html = await readFile(
      join(FIXTURES, "limitless-set-list.html"),
      "utf8"
    );

    expect(parseSetList(html)).toEqual([
      { baseId: "OP17-001", path: "OP17-001", variantNumber: null },
      { baseId: "OP17-002", path: "OP17-002", variantNumber: null },
      { baseId: "OP17-002", path: "OP17-002?v=9", variantNumber: 9 },
    ]);
  });

  it("keeps links and reminders while separating a character trigger", async () => {
    const html = await readFile(
      join(FIXTURES, "limitless-character-with-trigger.html"),
      "utf8"
    );

    expect(parseCardPage(html, "OP17-002", PACK_ID)).toEqual({
      id: "OP17-002",
      pack_id: PACK_ID,
      name: "Test & Ally",
      rarity: "SuperRare",
      category: "Character",
      img_url:
        "https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/one-piece/OP17/OP17-002_EN.webp",
      img_full_url:
        "https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/one-piece/OP17/OP17-002_EN.webp",
      cost: 3,
      attributes: ["Slash", "Special"],
      power: 4000,
      counter: 1000,
      colors: ["Red", "Blue"],
      block_number: 5,
      types: ["Land of Wano", "Whitebeard Pirates"],
      effect:
        "[On Play] Choose 1 of your {Land of Wano} cards.<br>(Keep reminder & linked text.)",
      trigger: "[Trigger] Play this card.",
    });
  });

  it("stores leader life in cost and leaves counter null", async () => {
    const html = await readFile(
      join(FIXTURES, "limitless-leader.html"),
      "utf8"
    );
    const leader = parseCardPage(html, "OP17-001", PACK_ID);

    expect(leader).toMatchObject({
      id: "OP17-001",
      rarity: "Leader",
      category: "Leader",
      cost: 5,
      power: 5000,
      counter: null,
      attributes: ["Special"],
      colors: ["Red"],
      block_number: 5,
    });
  });

  it("keeps an inline trigger reference inside the flowing effect", async () => {
    const html = await readFile(
      join(FIXTURES, "limitless-inline-trigger-reference.html"),
      "utf8"
    );
    const card = parseCardPage(html, "OP17-112", PACK_ID);

    expect(card.effect).toBe(
      "[Your Turn] The base power of all of your Characters with a [Trigger] and 4000 base power becomes 8000.<br>[On Play] Draw 1 card, then choose one:<br>• Add up to 1 card from the top of your deck to the top of your Life cards.<br>• Add up to 1 card from the top of your opponent's Life cards to the owner's hand."
    );
    expect(card.trigger).toBeNull();
  });

  it("recognizes a single-block trigger-only card", async () => {
    const html = await readFile(
      join(FIXTURES, "limitless-trigger-only.html"),
      "utf8"
    );
    const card = parseCardPage(html, "OP17-107", PACK_ID);

    expect(card.effect).toBe("-");
    expect(card.trigger).toBe("[Trigger] Play this card.");
  });

  it("uses the image filename for variant IDs and inherits base rarity", async () => {
    const html = await readFile(
      join(FIXTURES, "limitless-character-with-trigger.html"),
      "utf8"
    );
    const base = parseCardPage(html, "OP17-002", PACK_ID);
    const variantPage = html
      .replaceAll("OP17-002_EN.webp", "OP17-002_p3_EN.webp")
      .replace("<span>Super Rare</span>", "<span>Alternate Art</span>");
    const variant = parseCardPage(variantPage, "OP17-002?v=9", PACK_ID);

    expect(variant.id).toBe("OP17-002_p3");
    expect(inheritVariantRarities([base, variant])[1].rarity).toBe("SuperRare");
  });

  it("validates contiguous base cards and variant parity", async () => {
    const [leaderHtml, characterHtml] = await Promise.all([
      readFile(join(FIXTURES, "limitless-leader.html"), "utf8"),
      readFile(join(FIXTURES, "limitless-character-with-trigger.html"), "utf8"),
    ]);
    const leader = parseCardPage(leaderHtml, "OP17-001", PACK_ID);
    const character = parseCardPage(characterHtml, "OP17-002", PACK_ID);
    const variant: RawVegapullCard = {
      ...character,
      id: "OP17-002_p3",
      img_url: character.img_url.replace("_EN.webp", "_p3_EN.webp"),
      img_full_url: character.img_full_url.replace("_EN.webp", "_p3_EN.webp"),
    };

    expect(() => validateCards([leader, character, variant])).not.toThrow();
  });
});
