/**
 * OPT-961 — compound self costs keep their OPT-431 source checks in the
 * sequential evaluator.
 *
 * Canonical text: OP10-026 Kin'emon (docs/cards/OP-10.md) "place this
 * Character and 1 [Kin'emon] with 0 power from your trash at the bottom of
 * your deck in any order"; EB01-030 Loguetown (docs/cards/EB-01.md) "place
 * this Stage and 1 card from your hand at the bottom of your deck". Rule
 * 8-3-1-3: a cost that cannot be paid in full cannot be paid at all; "this
 * Character" / "this Stage" can be placed only while the source is there.
 *
 * Clause table
 * | Card / rule clause | Condition, evaluation time | Cost / payer | Target / chooser | Timing / continuation | Observable result | Test |
 * |---|---|---|---|---|---|---|
 * | OP10-026, 8-3-1-3 | source still in hand at validation | PLACE_SELF_AND_TRASH_TO_DECK 1 / P0 | n/a | not activated | "Card must be on the field to activate this effect" | "OP10-026 in hand" |
 * | same, control | source on the field, a 0-power Kin'emon in trash | same | P0 | activatable | null | "OP10-026 on the field" |
 * | EB01-030, 8-3-1-3 | source still in hand at validation | PLACE_SELF_AND_HAND_TO_DECK / P0 | n/a | not activated | "Card must be on the field to activate this effect" | "EB01-030 in hand" |
 * | same, control | source is the Stage, 1 other hand card | same | P0 | activatable | null | "EB01-030 as the Stage" |
 *
 * The validation call is direct: a crafted or stale ACTIVATE_EFFECT naming a
 * card in hand is rejected by the OPT-985 zone check before cost feasibility.
 */
import { describe, expect, it } from "vitest";
import type { CardInstance } from "../types.js";
import { validate } from "../engine/validation.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import { rig, type Rig } from "./opt-960-rig.js";

const P0 = 0 as const;

function check(r: Rig, card: CardInstance, effectId: string) {
  return validate(r.state, { type: "ACTIVATE_EFFECT", cardInstanceId: card.instanceId, effectId }, r.db, P0);
}

describe("OPT-961 compound self costs need the source in place", () => {
  function kinemon(zone: "HAND" | "CHARACTER") {
    const r = rig();
    r.deck(P0, 5);
    r.put("OPT961-KINEMON-0", P0, "TRASH", { data: { name: "Kin'emon", power: 0 } });
    const source = r.put("OP10-026", P0, zone, { data: { cost: 6, power: 8000 } });
    return { r, source };
  }

  it("OP10-026 in hand: validation rejects", () => {
    const { r, source } = kinemon("HAND");
    expect(check(r, source, "activate_place_and_play")).toBe("Card must be on the field to activate this effect");
  });

  it("OP10-026 on the field: validation accepts", () => {
    const { r, source } = kinemon("CHARACTER");
    expect(check(r, source, "activate_place_and_play")).toBeNull();
  });

  function loguetown(asStage: boolean) {
    const r = rig();
    r.deck(P0, 5);
    r.put("OPT961-HAND", P0, "HAND");
    const source = r.put("EB01-030", P0, "HAND", { data: { type: "Stage", cost: 1, power: null } });
    if (asStage) {
      const p = r.state.players[P0];
      p.hand = p.hand.filter((c) => c.instanceId !== source.instanceId);
      const stage: CardInstance = { ...source, zone: "STAGE" };
      p.stage = stage;
      r.state = registerCardEnteredField(r.state, stage, r.db.get("EB01-030")!);
      return { r, source: stage };
    }
    return { r, source };
  }

  it("EB01-030 in hand: validation rejects", () => {
    const { r, source } = loguetown(false);
    expect(check(r, source, "activate_draw")).toBe("Card must be on the field to activate this effect");
  });

  it("EB01-030 as the Stage: validation accepts", () => {
    const { r, source } = loguetown(true);
    expect(check(r, source, "activate_draw")).toBeNull();
  });
});
