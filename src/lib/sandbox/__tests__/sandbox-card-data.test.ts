// Locks the OPT-287 coverage matrix: every entry is well-formed, the keyed
// id matches its row, and at least one card satisfies each animation case
// the sandbox scenarios will need. If a future edit drops a coverage slot,
// this test fails loudly — that's the point.

import { describe, expect, it } from "vitest";
import type { CardData } from "@shared/game-types";
import { SANDBOX_CARD_DB, SANDBOX_CARD_IDS } from "../sandbox-card-data";

describe("SANDBOX_CARD_DB", () => {
  it("keys match each entry's id", () => {
    for (const [key, card] of Object.entries(SANDBOX_CARD_DB)) {
      expect(card.id).toBe(key);
    }
  });

  it("every id appears in SANDBOX_CARD_IDS exactly once", () => {
    const seen = new Set(SANDBOX_CARD_IDS);
    expect(seen.size).toBe(SANDBOX_CARD_IDS.length);
    for (const id of SANDBOX_CARD_IDS) {
      expect(SANDBOX_CARD_DB[id]).toBeDefined();
    }
  });

  it("every entry conforms to the CardData shape", () => {
    // Type-checks at build time; this is the runtime field-presence guard.
    for (const card of Object.values(SANDBOX_CARD_DB)) {
      const required: Array<keyof CardData> = [
        "id",
        "name",
        "type",
        "color",
        "cost",
        "power",
        "counter",
        "life",
        "attribute",
        "types",
        "effectText",
        "triggerText",
        "keywords",
        "effectSchema",
        "imageUrl",
      ];
      for (const key of required) {
        expect(card, `${card.id} missing ${String(key)}`).toHaveProperty(key);
      }
    }
  });

  describe("coverage matrix (OPT-287 acceptance)", () => {
    const all = Object.values(SANDBOX_CARD_DB);
    const leaders = all.filter((c) => c.type === "Leader");
    const characters = all.filter((c) => c.type === "Character");
    const events = all.filter((c) => c.type === "Event");
    const stages = all.filter((c) => c.type === "Stage");

    it("has at least one Leader per v1 color (Red, Blue, Green)", () => {
      for (const color of ["Red", "Blue", "Green"]) {
        const match = leaders.find((c) => c.color.includes(color));
        expect(match, `missing ${color} Leader`).toBeDefined();
      }
    });

    it("has a vanilla Character (no effect text)", () => {
      const vanilla = characters.find((c) => c.effectText.trim() === "");
      expect(vanilla).toBeDefined();
    });

    it("has a Character with [Blocker]", () => {
      const match = characters.find((c) => c.keywords.blocker);
      expect(match).toBeDefined();
    });

    it("has a Character with a non-zero counter for counter-from-hand", () => {
      const match = characters.find(
        (c) => typeof c.counter === "number" && c.counter >= 2000,
      );
      expect(match).toBeDefined();
    });

    it("has a Character with [Double Attack]", () => {
      const match = characters.find((c) => c.keywords.doubleAttack);
      expect(match).toBeDefined();
    });

    it("has a Character with [Rush]", () => {
      const match = characters.find((c) => c.keywords.rush);
      expect(match).toBeDefined();
    });

    it("has a Character with an [On Play] prompt", () => {
      const match = characters.find((c) => c.effectText.includes("[On Play]"));
      expect(match).toBeDefined();
    });

    it("has a Character with an [On K.O.] effect", () => {
      const match = characters.find((c) => c.effectText.includes("[On K.O.]"));
      expect(match).toBeDefined();
    });

    it("has an Event with a [Trigger]", () => {
      const match = events.find((c) => c.keywords.trigger);
      expect(match).toBeDefined();
    });

    it("has at least one Stage card", () => {
      expect(stages.length).toBeGreaterThan(0);
    });

    it("has a high-cost Character (cost >= 9) for DON-attach demos", () => {
      const match = characters.find(
        (c) => typeof c.cost === "number" && c.cost >= 9,
      );
      expect(match).toBeDefined();
    });
  });
});
