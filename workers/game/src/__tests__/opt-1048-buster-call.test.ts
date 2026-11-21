/**
 * OPT-1048 — OP18-117 Buster Call "[Main] You may trash all of your Life cards:
 * If your Leader is [Spandam], trash all Characters and play up to a total of
 * 5 {Vice Admiral} type Character cards with different card names from your
 * deck or trash. Then, shuffle your deck."
 *
 * qa_op18: at 0 Life nothing happens and this card is trashed.
 */
import { describe, expect, it } from "vitest";
import type { CardInstance, GameState } from "../types.js";
import { validateEffectSchema } from "../engine/schema-registry.js";
import { OP18_117_BUSTER_CALL } from "../engine/schemas/op18.js";
import { CARDS } from "./helpers.js";
import { rig } from "./opt-960-rig.js";

const P0 = 0 as const;
const P1 = 1 as const;

function fixture(leaderName = "Spandam", lifeCount = 2) {
  const r = rig();
  r.db.set("SPANDAM-LEADER", { ...CARDS.LEADER, id: "SPANDAM-LEADER", name: leaderName });
  r.state.players[P0].leader = { ...r.state.players[P0].leader, cardId: "SPANDAM-LEADER" };
  r.deck(P0, 3);
  r.life(P0, lifeCount);
  const vice = (id: string, name: string, zone: CardInstance["zone"]) =>
    r.put(id, P0, zone, { data: { name, types: ["Vice Admiral"], cost: 5 } });
  const busterCall = r.put("OP18-117", P0, "HAND", { data: { type: "Event", cost: 0, power: null, counter: null, effectText: "[Main] You may trash all of your Life cards: ..." } });
  const mine = r.put("my-char", P0, "CHARACTER");
  const theirs = r.put("their-char", P1, "CHARACTER");
  return { r, vice, busterCall, mine, theirs };
}

// Zone changes mint new instance ids, so cards are found by card id.
const zoneOf = (s: GameState, card: CardInstance) => {
  const p = s.players[card.owner];
  const id = card.cardId;
  if (p.characters.some((c) => c?.cardId === id)) return "CHARACTER";
  if (p.trash.some((c) => c.cardId === id)) return "TRASH";
  if (p.deck.some((c) => c.cardId === id)) return "DECK";
  if (p.hand.some((c) => c.cardId === id)) return "HAND";
  return undefined;
};
const fieldCardIds = (s: GameState, owner: 0 | 1) =>
  s.players[owner].characters.filter((c): c is CardInstance => !!c).map((c) => c.cardId);

function activate(f: ReturnType<typeof fixture>) {
  f.r.act({ type: "PLAY_CARD", cardInstanceId: f.busterCall.instanceId });
  if (f.r.promptType() === "OPTIONAL_EFFECT") f.r.accept();
}

describe("OPT-1048 — OP18-117 Buster Call", () => {
  it("validates against the schema registry", () => {
    expect(validateEffectSchema(OP18_117_BUSTER_CALL)).toEqual([]);
  });

  it("trashes all Life and all Characters, then plays a mixed deck-and-trash pick", () => {
    const f = fixture();
    const fromDeck = f.vice("VA-STROBERRY", "Strawberry", "DECK");
    const fromTrash = f.vice("VA-ONIGUMO", "Onigumo", "TRASH");
    const notVice = f.r.put("NOT-VICE", P0, "TRASH", { data: { name: "Not Vice", types: ["Navy"] } });
    activate(f);

    expect(f.r.state.players[P0].life).toHaveLength(0);
    expect(zoneOf(f.r.state, f.mine)).toBe("TRASH");
    expect(zoneOf(f.r.state, f.theirs)).toBe("TRASH");

    expect(f.r.promptType()).toBe("SELECT_TARGET");
    const options = f.r.state.pendingPrompt?.options;
    const valid = options?.promptType === "SELECT_TARGET" ? options.validTargets : [];
    expect(valid).toEqual(expect.arrayContaining([fromDeck.instanceId, fromTrash.instanceId]));
    expect(valid).not.toContain(notVice.instanceId);
    f.r.select([fromDeck.instanceId, fromTrash.instanceId]);

    expect(f.r.state.pendingPrompt).toBeNull();
    expect(fieldCardIds(f.r.state, P0).sort()).toEqual(["VA-ONIGUMO", "VA-STROBERRY"]);
    expect(f.r.state.eventLog.filter((e) => e.type === "CARD_PLAYED" && "zone" in e.payload && e.payload.zone === "CHARACTER")).toHaveLength(2);
    expect(zoneOf(f.r.state, f.busterCall)).toBe("TRASH");
  });

  it("rejects a selection with a duplicate card name across the deck and the trash", () => {
    const f = fixture();
    const deckGarp = f.vice("VA-GARP-A", "Monkey.D.Garp", "DECK");
    const trashGarp = f.vice("VA-GARP-B", "Monkey.D.Garp", "TRASH");
    activate(f);
    expect(f.r.promptType()).toBe("SELECT_TARGET");
    const { rejected } = f.r.respond({ type: "SELECT_TARGET", selectedInstanceIds: [deckGarp.instanceId, trashGarp.instanceId] });
    expect(rejected).toBe(true);
    expect(fieldCardIds(f.r.state, P0)).toEqual([]);
  });

  it("caps the shared total at 5", () => {
    const f = fixture();
    const picks = ["A", "B", "C", "D", "E", "F"].map((n, i) =>
      f.vice(`VA-${n}`, `Vice ${n}`, i % 2 === 0 ? "DECK" : "TRASH"));
    activate(f);
    const { rejected } = f.r.respond({ type: "SELECT_TARGET", selectedInstanceIds: picks.map((c) => c.instanceId) });
    expect(rejected).toBe(true);
  });

  it("at 0 Life nothing happens and the Event is trashed", () => {
    const f = fixture("Spandam", 0);
    f.vice("VA-STROBERRY", "Strawberry", "DECK");
    f.r.act({ type: "PLAY_CARD", cardInstanceId: f.busterCall.instanceId });
    expect(f.r.promptType()).toBeUndefined();
    expect(zoneOf(f.r.state, f.mine)).toBe("CHARACTER");
    expect(zoneOf(f.r.state, f.theirs)).toBe("CHARACTER");
    expect(fieldCardIds(f.r.state, P0)).toEqual(["my-char"]);
    expect(zoneOf(f.r.state, f.busterCall)).toBe("TRASH");
  });

  it("with a non-Spandam Leader the Life is still trashed but nothing else happens", () => {
    const f = fixture("Rob Lucci");
    f.vice("VA-STROBERRY", "Strawberry", "DECK");
    activate(f);
    expect(f.r.state.players[P0].life).toHaveLength(0);
    expect(f.r.state.pendingPrompt).toBeNull();
    expect(zoneOf(f.r.state, f.mine)).toBe("CHARACTER");
    expect(zoneOf(f.r.state, f.theirs)).toBe("CHARACTER");
  });
});
