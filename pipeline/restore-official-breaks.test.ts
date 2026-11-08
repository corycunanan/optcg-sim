import { readFile } from "fs/promises";
import { join } from "path";

import { beforeAll, describe, expect, it } from "vitest";

import type { RawVegapullCard } from "./load";
import {
  formattingLossWarning,
  parseArguments,
  parseOfficialCardlist,
  restoreOfficialFormatting,
} from "./restore-official-breaks";

const FIXTURES = join(process.cwd(), "pipeline", "fixtures");
const PACK_ID = "569199";

describe("official cardlist formatting restoration", () => {
  let cards: RawVegapullCard[];
  let officialHtml: string;

  beforeAll(async () => {
    [cards, officialHtml] = await Promise.all([
      readFile(join(FIXTURES, "vegapull-collapsed-breaks.json"), "utf8").then(
        (contents) => JSON.parse(contents)
      ),
      readFile(join(FIXTURES, "official-cardlist-br.html"), "utf8"),
    ]);
  });

  it("accepts one leading pnpm argument separator", () => {
    expect(
      parseArguments(["--", "--pack-id", PACK_ID, "--data-dir", "/tmp/cards"])
    ).toEqual({ packId: PACK_ID, dataDir: "/tmp/cards" });
  });

  it("restores official effect and trigger separators", () => {
    const officialCards = parseOfficialCardlist(officialHtml);

    const result = restoreOfficialFormatting(cards, officialCards);

    expect(result).toMatchObject({ restoredCards: 1, restoredFields: 2 });
    expect(result.cards[0].effect).toBe(
      "[On Play] Draw 1 card.<br>Then, discard 1 card."
    );
    expect(result.cards[0].trigger).toBe(
      "[Trigger] Draw 1 card.<br>Then, discard 1 card."
    );
    expect(result.cards[1]).toEqual(cards[1]);
    expect(cards[0].effect).not.toContain("<br>");
  });

  it("warns when a pulled pack has no separators but the official page does", () => {
    const officialCards = parseOfficialCardlist(officialHtml);

    expect(formattingLossWarning(cards, officialCards, PACK_ID)).toBe(
      "  ⚠ Pack 569199 may have lost effect formatting: pulled JSON has 0 <br> separators; official HTML has 1. Run the restoration before import."
    );
  });

  it("aborts on a per-card wording difference", () => {
    const officialCards = parseOfficialCardlist(officialHtml);
    const changedCards = cards.map((card) => ({ ...card }));
    changedCards[0].effect = "[On Play] Draw 2 cards. Then, discard 1 card.";

    expect(() =>
      restoreOfficialFormatting(changedCards, officialCards)
    ).toThrowError(
      'OP99-001 effect wording differs: pulled "[On Play] Draw 2 cards. Then, discard 1 card."; official "[On Play] Draw 1 card. Then, discard 1 card."'
    );
  });

  describe("attribute tokens", () => {
    const modal = (body: string) =>
      `<dl class="modalCol" id="OP99-003"><dd><div class="text"><h3>Effect</h3>${body}</div></dd></dl>`;
    const pulled: RawVegapullCard = {
      ...({} as RawVegapullCard),
      id: "OP99-003",
      effect: "If your <Slash> Character would be K.O.'d, rest this instead. [Blocker]",
      trigger: null,
    };

    it.each([
      ["raw", "If your <Slash> Character would be K.O.'d, rest this instead.<br>[Blocker]"],
      ["entity-encoded", "If your &lt;Slash&gt; Character would be K.O.&#39;d, rest this instead.<br>[Blocker]"],
    ])("treats %s attribute tokens as text", (_form, body) => {
      const result = restoreOfficialFormatting(
        [pulled],
        parseOfficialCardlist(modal(body))
      );

      expect(result.cards[0].effect).toBe(
        "If your <Slash> Character would be K.O.'d, rest this instead.<br>[Blocker]"
      );
    });

    it("still rejects other official markup", () => {
      expect(() =>
        parseOfficialCardlist(modal("Draw <span>1</span> card."))
      ).toThrowError("OP99-003 text: unsupported official markup <span>");
    });
  });
});
