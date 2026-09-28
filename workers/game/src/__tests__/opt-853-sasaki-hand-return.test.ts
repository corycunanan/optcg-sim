import { describe, expect, it } from "vitest";
import { AUTHORED_SCHEMAS } from "../engine/authored-schemas.generated.js";
import { shuffleWithContext } from "../engine/execution-context.js";
import { hasEffectiveKeyword } from "../engine/keywords.js";
import { isCardNegated } from "../engine/modifiers.js";
import { runPipeline } from "../engine/pipeline.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import type { CardData, CardInstance, GameState } from "../types.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";

// OP04-048 Sasaki (docs/cards/OP-04.md:341): "[On Play] Return all cards in
// your hand to your deck and shuffle your deck. Then, draw cards equal to the
// number you returned to your deck." Same printed text and encoding as P-002.

// Printed metadata from the official OP-04 card list (vegapull 569104).
const SASAKI_PRINTED: Partial<CardData> = {
  id: "OP04-048",
  name: "Sasaki",
  type: "Character",
  color: ["Blue"],
  cost: 3,
  power: 4000,
  counter: 2000,
  attribute: ["Strike"],
  types: ["Animal Kingdom Pirates"],
  effectText:
    "[On Play] Return all cards in your hand to your deck and shuffle your deck. Then, draw cards equal to the number you returned to your deck.",
  triggerText: null,
};

// OPT-795 watchers: "When a card is trashed from your hand by an effect, ...".
const WATCHERS = ["OP14-045", "OP14-049", "OP14-056"] as const;

function card(id: string, cardId: string, owner: 0 | 1, zone: CardInstance["zone"]): CardInstance {
  return {
    instanceId: id,
    cardId,
    controller: owner,
    owner,
    zone,
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: 0,
  };
}

function fixture(handSize: number, deckSize?: number) {
  const db = createTestCardDb();
  const schema = getEffectSchema("OP04-048");
  expect(schema).toBeTruthy();
  db.set("OP04-048", { ...CARDS.VANILLA, ...SASAKI_PRINTED, effectSchema: schema! } as CardData);
  let state = createBattleReadyState(db);
  state.players.forEach((p) => (p.characters = padChars([])));
  // setupGame seeds a deterministic execution context from the game id.
  expect(state.executionContext).toBeTruthy();

  const watchers = WATCHERS.map((id, i) => {
    const watcherSchema = getEffectSchema(id);
    expect(watcherSchema).toBeTruthy();
    db.set(id, { ...CARDS.VANILLA, id, name: watcherSchema!.card_name ?? id, effectSchema: watcherSchema! });
    const w = card(`watcher-${id}`, id, 0, "CHARACTER");
    state.players[0].characters[i] = w;
    state = registerCardEnteredField(state, w, db.get(id)!);
    return w;
  });

  // Distinct card ids so every returned hand card is traceable through the deck.
  const hand = Array.from({ length: handSize }, (_, i) => {
    const cardId = `HAND-${i}`;
    db.set(cardId, { ...CARDS.VANILLA, id: cardId, name: cardId });
    return card(`hand-${i}`, cardId, 0, "HAND");
  });
  const sasaki = card("sasaki-hand", "OP04-048", 0, "HAND");
  state.players[0].hand = [...hand, sasaki];
  if (deckSize !== undefined) state.players[0].deck = state.players[0].deck.slice(0, deckSize);

  return { db, state, watchers, hand };
}

function playSasaki(db: Map<string, CardData>, state: GameState): GameState {
  const r = runPipeline(state, { type: "PLAY_CARD", cardInstanceId: "sasaki-hand" }, db, 0);
  expect(r.valid, r.error).toBe(true);
  return r.state;
}

const multiset = (cards: CardInstance[]) => cards.map((c) => c.cardId).sort();

describe("OPT-853 OP04-048 Sasaki returns the hand to deck, shuffles and redraws", () => {
  it.each([
    { name: "nonempty hand, full deck", hand: 4 },
    { name: "one card in hand", hand: 1 },
    { name: "empty deck: redraw is exactly the returned cards", hand: 3, deck: 0 },
    { name: "empty hand after playing Sasaki", hand: 0 },
  ])("$name", ({ hand: handSize, deck }) => {
    const f = fixture(handSize, deck);
    const before = f.state.players[0];
    const deckBefore = [...before.deck];
    const handBefore = [...f.hand];
    const trashBefore = [...before.trash];
    const oppBefore = structuredClone(f.state.players[1]);
    const contextBefore = f.state.executionContext!;
    const logStart = f.state.eventLog.length;

    const state = playSasaki(f.db, f.state);
    expect(state.pendingPrompt).toBeNull();
    expect(state.effectStack).toHaveLength(0);
    // Legal payment: printed cost 3 rests 3 of the 8 active DON!!.
    expect(state.players[0].donCostArea.filter((d) => d.state === "RESTED")).toHaveLength(3);
    expect(state.players[0].characters.some((c) => c?.cardId === "OP04-048")).toBe(true);

    const p = state.players[0];
    // Draw count equals the number returned; the deck ends at its prior size.
    expect(p.hand).toHaveLength(handSize);
    expect(p.deck).toHaveLength(deckBefore.length);
    // Hand ∪ deck is exactly the prior hand (minus Sasaki) ∪ prior deck.
    expect(multiset([...p.hand, ...p.deck])).toEqual(multiset([...handBefore, ...deckBefore]));
    if (deck === 0) expect(multiset(p.hand)).toEqual(multiset(handBefore));

    // Fresh identities: no returned hand card keeps its instance id anywhere.
    const oldHandIds = new Set(handBefore.map((c) => c.instanceId));
    for (const c of [...p.hand, ...p.deck]) {
      expect(oldHandIds.has(c.instanceId)).toBe(false);
      expect(c.zone).toBe(p.hand.includes(c) ? "HAND" : "DECK");
    }

    // The deck was shuffled through the engine execution context: exactly one
    // Fisher-Yates pass over (prior deck + returned) cards consumed the RNG.
    const expectedRng = shuffleWithContext(
      contextBefore,
      Array.from({ length: deckBefore.length + handSize }),
    ).context.rngState;
    expect(state.executionContext!.rngState).toBe(expectedRng);

    // Returning to deck is not trashing: trash, hand-trash events and the
    // OPT-795 watchers are untouched.
    expect(p.trash).toEqual(trashBefore);
    const log = state.eventLog.slice(logStart);
    expect(log.some((e) => e.type === "CARD_TRASHED")).toBe(false);
    const drawn = log.filter((e) => e.type === "CARD_DRAWN");
    expect(drawn).toHaveLength(handSize);
    for (const w of f.watchers) {
      const live = p.characters.find((c) => c?.instanceId === w.instanceId)!;
      expect(isCardNegated(live, state, f.db)).toBe(false);
      if (w.cardId !== "OP14-056") {
        expect(hasEffectiveKeyword(live, f.db.get(w.cardId)!, "RUSH", state, f.db)).toBe(false);
      }
    }

    // The opponent is untouched.
    expect(state.players[1].hand).toEqual(oppBefore.hand);
    expect(state.players[1].deck).toEqual(oppBefore.deck);
    expect(state.players[1].trash).toEqual(oppBefore.trash);
  });

  it("is deterministic for a fixed execution-context seed", () => {
    const a = fixture(4);
    const b = fixture(4);
    const sa = playSasaki(a.db, a.state).players[0];
    const sb = playSasaki(b.db, b.state).players[0];
    expect(sa.hand.map((c) => c.cardId)).toEqual(sb.hand.map((c) => c.cardId));
    expect(sa.deck.map((c) => c.cardId)).toEqual(sb.deck.map((c) => c.cardId));
  });
});

// ─── Authored HAND_WHEEL / return-hand consumer inventory ─────────────────────
// Walks every generated schema recursively (nested OPPONENT_ACTION, choices,
// replacements) for the hand-return primitives.
function findActions(value: unknown, type: string, path: string, out: string[]) {
  if (Array.isArray(value)) {
    value.forEach((v, i) => findActions(v, type, `${path}[${i}]`, out));
  } else if (value && typeof value === "object") {
    if ((value as { type?: unknown }).type === type) out.push(path);
    for (const [k, v] of Object.entries(value)) findActions(v, type, `${path}.${k}`, out);
  }
}

describe("OPT-853 hand-return consumer inventory", () => {
  const inventory = (type: string) => {
    const out: string[] = [];
    for (const [id, schema] of Object.entries(AUTHORED_SCHEMAS)) {
      findActions(schema.effects, type, `${id} .effects`, out);
    }
    return out.sort();
  };

  it("HAND_WHEEL has no authored consumers", () => {
    expect(inventory("HAND_WHEEL")).toEqual([]);
  });

  it("RETURN_HAND_TO_DECK consumers", () => {
    expect(inventory("RETURN_HAND_TO_DECK")).toEqual([
      "OP04-048 .effects[0].actions[0]",
      "OP06-047 .effects[0].actions[0].params.action",
      "P-002 .effects[0].actions[0]",
      "P-046 .effects[0].actions[0]",
    ]);
  });

  it("Sasaki encodes return → shuffle → draw returned count like P-002", () => {
    const actions = AUTHORED_SCHEMAS["OP04-048"].effects[0].actions;
    expect(actions).toEqual(AUTHORED_SCHEMAS["P-002"].effects[0].actions);
  });
});
