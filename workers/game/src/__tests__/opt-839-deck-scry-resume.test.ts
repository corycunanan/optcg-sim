/**
 * OPT-839 — apply the DECK_SCRY arrangement on resume.
 *
 * Card (docs/cards/OP-17.md, OP17-050 Streusen): "[On Play] Look at 2 cards
 * from the top of your deck, reorganize them in any order and place them at
 * the top or bottom of your deck. Then, draw 1 card."
 * FAQ (docs/FAQs/qa_op17.md, OP17-050): "Of the 2 cards … can I place 1 card
 * on top of the deck and 1 card at the bottom? — No, you cannot."
 *
 * Audit F8 (docs/audit/2026-09-09-faq-engine-gap-audit.md): the ARRANGE_TOP_CARDS
 * response to a DECK_SCRY prompt was discarded, so "Then, draw 1 card" drew
 * the original top card instead of the card beneath the bottomed pair.
 *
 * Every scenario drives the real pipeline (runPipeline → resumePromptLifecycle)
 * with the registered authored schemas.
 */

import { describe, expect, it } from "vitest";
import type {
  CardData,
  CardInstance,
  GameAction,
  GameState,
} from "../types.js";
import type { Action } from "../engine/effect-types.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { runPipeline } from "../engine/pipeline.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { resumeFromStack } from "../engine/effect-resolver/resume.js";
import { handleArrangeDeckScry } from "../engine/effect-resolver/resume/deck.js";
import { validatePersistedGameStateCore } from "../session/persisted-game-state.js";
import { GameActionSchema } from "../../../../shared/validators/client-message.js";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
  padChars,
} from "./helpers.js";

const HAND_EXTRA = "opt839-hand-extra";

function deckId(i: number): string {
  return `opt839-deck-${i}`;
}
function deckCardId(i: number): string {
  return `OPT839-D${i}`;
}

function card(cardId: string, instanceId: string, zone: CardInstance["zone"], owner: 0 | 1 = 0): CardInstance {
  return {
    instanceId,
    cardId,
    zone,
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: null,
    controller: owner,
    owner,
  };
}

interface Setup {
  db: Map<string, CardData>;
  state: GameState;
  scryer: CardInstance;
}

function setup(scryerId: string, deckSize: number, scryerData: Partial<CardData> = {}): Setup {
  const db = createTestCardDb();
  const schema = getEffectSchema(scryerId);
  if (!schema) throw new Error(`${scryerId} schema not registered`);
  db.set(scryerId, {
    ...CARDS.VANILLA,
    id: scryerId,
    name: schema.card_name ?? scryerId,
    cost: 1,
    ...scryerData,
    effectSchema: schema,
  });
  for (let i = 0; i < deckSize; i++) {
    db.set(deckCardId(i), { ...CARDS.VANILLA, id: deckCardId(i), name: deckCardId(i) });
  }

  const state = createBattleReadyState(db);
  for (const p of state.players) {
    p.characters = padChars([]);
    p.hand = [];
  }
  const scryer = card(scryerId, `${scryerId}-hand`, "HAND");
  state.players[0].hand = [scryer, card(CARDS.VANILLA.id, HAND_EXTRA, "HAND")];
  state.players[0].deck = Array.from({ length: deckSize }, (_, i) => card(deckCardId(i), deckId(i), "DECK"));
  state.eventLog = [];
  return { db, state, scryer };
}

function play({ db, state, scryer }: Setup): GameState {
  const r = runPipeline(state, { type: "PLAY_CARD", cardInstanceId: scryer.instanceId }, db, 0);
  expect(r.valid, r.error).toBe(true);
  return r.state;
}

function respond(state: GameState, db: Map<string, CardData>, action: GameAction) {
  return resumePromptLifecycle(state, action, db, {
    drainPregame: (s) => s,
    advanceStartOfTurn: (s) => s,
  });
}

function accept(state: GameState, db: Map<string, CardData>, action: GameAction): GameState {
  const r = respond(state, db, action);
  expect(r.responseRejected).toBe(false);
  return r.state;
}

function arrange(ordered: string[], destination: "top" | "bottom", kept: string[] = []): GameAction {
  return {
    type: "ARRANGE_TOP_CARDS",
    keptCardInstanceId: kept[0] ?? "",
    keptCardInstanceIds: kept,
    orderedInstanceIds: ordered,
    destination,
  };
}

function arrangePrompt(state: GameState) {
  const options = state.pendingPrompt?.options;
  if (options?.promptType !== "ARRANGE_TOP_CARDS") {
    throw new Error(`expected ARRANGE_TOP_CARDS, got ${options?.promptType}`);
  }
  return options;
}

/** Every card identity player 0 owns, across all zones (instance-agnostic). */
function inventory(state: GameState): string[] {
  const p = state.players[0];
  return [
    ...p.deck,
    ...p.hand,
    ...p.trash,
    ...p.life,
    ...p.characters.filter((c): c is CardInstance => c !== null),
    ...(p.stage ? [p.stage] : []),
    p.leader,
  ]
    .map((c) => c.cardId)
    .sort();
}

describe("OPT-839: OP17-050 Streusen scry-then-draw", () => {
  it("prompts with the exact looked-at pair as a pure top-or-bottom arrangement", () => {
    const afterPlay = play(setup("OP17-050", 5));
    const prompt = arrangePrompt(afterPlay);
    expect(prompt.cards.map((c) => c.instanceId)).toEqual([deckId(0), deckId(1)]);
    expect(prompt.restDestination).toBe("TOP_OR_BOTTOM");
    expect(prompt.maxKeep).toBe(0);
    expect(prompt.validTargets).toEqual([]);
  });

  it("bottoms both cards in the chosen (reversed) order, then draws the original third card", () => {
    const s = setup("OP17-050", 5);
    const afterPlay = play(s);
    const resolved = accept(afterPlay, s.db, arrange([deckId(1), deckId(0)], "bottom"));
    expect(resolved.pendingPrompt).toBeNull();
    const p0 = resolved.players[0];
    expect(p0.hand.map((c) => c.cardId)).toEqual([CARDS.VANILLA.id, deckCardId(2)]);
    expect(p0.deck.map((c) => c.instanceId)).toEqual([deckId(3), deckId(4), deckId(1), deckId(0)]);
  });

  it("bottoms both cards in printed order", () => {
    const s = setup("OP17-050", 5);
    const resolved = accept(play(s), s.db, arrange([deckId(0), deckId(1)], "bottom"));
    const p0 = resolved.players[0];
    expect(p0.hand.at(-1)?.cardId).toBe(deckCardId(2));
    expect(p0.deck.map((c) => c.instanceId)).toEqual([deckId(3), deckId(4), deckId(0), deckId(1)]);
  });

  it("returns both cards to the top in the chosen order, so the draw takes the new top card", () => {
    const s = setup("OP17-050", 5);
    const resolved = accept(play(s), s.db, arrange([deckId(1), deckId(0)], "top"));
    const p0 = resolved.players[0];
    expect(p0.hand.at(-1)?.cardId).toBe(deckCardId(1));
    expect(p0.deck.map((c) => c.instanceId)).toEqual([deckId(0), deckId(2), deckId(3), deckId(4)]);
  });

  it("conserves the inventory and keeps deck instance identities (a reorder is not a zone transition)", () => {
    const s = setup("OP17-050", 5);
    const before = inventory(s.state);
    const resolved = accept(play(s), s.db, arrange([deckId(1), deckId(0)], "bottom"));
    expect(inventory(resolved)).toEqual(before);
    const p0 = resolved.players[0];
    expect(p0.deck).toHaveLength(4);
    expect(p0.hand).toHaveLength(2);
    // The four cards still in the deck keep their original instances.
    for (const c of p0.deck) expect(c.zone).toBe("DECK");
    expect(new Set(p0.deck.map((c) => c.instanceId)).size).toBe(4);
  });

  it("with a 1-card deck, prompts for that card alone and then draws it", () => {
    const s = setup("OP17-050", 1);
    const afterPlay = play(s);
    expect(arrangePrompt(afterPlay).cards.map((c) => c.instanceId)).toEqual([deckId(0)]);
    const resolved = accept(afterPlay, s.db, arrange([deckId(0)], "bottom"));
    expect(resolved.players[0].hand.at(-1)?.cardId).toBe(deckCardId(0));
    expect(resolved.players[0].deck).toHaveLength(0);
  });

  it("with an empty deck, does not prompt and resolves without an arrangement", () => {
    const s = setup("OP17-050", 0);
    const afterPlay = play(s);
    expect(afterPlay.pendingPrompt).toBeNull();
    expect(afterPlay.effectStack).toHaveLength(0);
    expect(afterPlay.players[0].deck).toHaveLength(0);
    expect(afterPlay.players[0].hand.map((c) => c.instanceId)).toEqual([HAND_EXTRA]);
  });

  it("resolves identically after a persisted JSON round-trip of the pending prompt", () => {
    const s = setup("OP17-050", 5);
    const afterPlay = play(s);
    const persisted = JSON.parse(JSON.stringify(afterPlay)) as GameState;
    expect(validatePersistedGameStateCore(persisted)).toBeNull();
    const fromPersisted = accept(persisted, s.db, arrange([deckId(1), deckId(0)], "bottom"));
    const live = accept(afterPlay, s.db, arrange([deckId(1), deckId(0)], "bottom"));
    expect(fromPersisted.players[0].deck).toEqual(live.players[0].deck);
    expect(fromPersisted.players[0].hand).toEqual(live.players[0].hand);
    expect(fromPersisted.players[0].hand.at(-1)?.cardId).toBe(deckCardId(2));
  });

  it("resolves a frame persisted before OPT-839 (no looked-at group recorded) from the schema's look count", () => {
    const s = setup("OP17-050", 5);
    const afterPlay = play(s);
    const legacy = JSON.parse(JSON.stringify(afterPlay)) as GameState;
    const frame = legacy.effectStack.at(-1)!;
    frame.validTargets = [];
    const resolved = accept(legacy, s.db, arrange([deckId(1), deckId(0)], "bottom"));
    expect(resolved.players[0].hand.at(-1)?.cardId).toBe(deckCardId(2));
    expect(resolved.players[0].deck.map((c) => c.instanceId)).toEqual([deckId(3), deckId(4), deckId(1), deckId(0)]);
    // The legacy group is still exact: a partial response is rejected.
    expect(respond(legacy, s.db, arrange([deckId(0)], "bottom")).responseRejected).toBe(true);
  });

  describe("rejects responses that are not exactly the looked-at group, without mutating state", () => {
    const cases: [string, (opp: string) => GameAction][] = [
      ["partial (one card omitted)", () => arrange([deckId(0)], "bottom")],
      ["empty", () => arrange([], "top")],
      ["duplicate", () => arrange([deckId(0), deckId(0)], "bottom")],
      ["duplicate with extra", () => arrange([deckId(0), deckId(1), deckId(0)], "bottom")],
      ["extra non-top deck card", () => arrange([deckId(0), deckId(1), deckId(2)], "bottom")],
      ["non-top deck card swapped in", () => arrange([deckId(0), deckId(2)], "bottom")],
      ["hand card", () => arrange([deckId(0), HAND_EXTRA], "top")],
      ["opponent card", (opp) => arrange([deckId(0), opp], "top")],
      ["kept pick on a pure arrangement", () => arrange([deckId(1)], "bottom", [deckId(0)])],
    ];

    for (const [label, build] of cases) {
      it(label, () => {
        const s = setup("OP17-050", 5);
        const afterPlay = play(s);
        const opp = afterPlay.players[1].deck[0].instanceId;
        const r = respond(afterPlay, s.db, build(opp));
        expect(r.responseRejected).toBe(true);
        expect(r.state).toEqual(afterPlay);
        // The prompt stays answerable.
        const resolved = accept(r.state, s.db, arrange([deckId(1), deckId(0)], "bottom"));
        expect(resolved.players[0].hand.at(-1)?.cardId).toBe(deckCardId(2));
      });
    }

    it("reports the rejection from the resolver and keeps the paused frame", () => {
      const s = setup("OP17-050", 5);
      const afterPlay = play(s);
      const r = resumeFromStack(afterPlay, arrange([deckId(0)], "bottom"), s.db);
      expect(r.rejected).toBe(true);
      expect(r.resolved).toBe(false);
      expect(r.state.effectStack).toEqual(afterPlay.effectStack);
      expect(r.state.players[0].deck).toEqual(afterPlay.players[0].deck);
    });

    it("cannot express a split: the wire action carries one destination for the whole group", () => {
      const base = arrange([deckId(0), deckId(1)], "bottom");
      expect(GameActionSchema.safeParse(base).success).toBe(true);
      expect(GameActionSchema.safeParse({ ...base, destination: ["top", "bottom"] }).success).toBe(false);
      expect(
        GameActionSchema.safeParse({ ...base, destinations: { [deckId(0)]: "top", [deckId(1)]: "bottom" } }).success,
      ).toBe(false);
    });
  });
});

describe("OPT-839: other DECK_SCRY consumers", () => {
  it("ST17-003 (top only) offers only the top and rejects a bottom placement", () => {
    const s = setup("ST17-003", 5);
    const afterPlay = play(s);
    const prompt = arrangePrompt(afterPlay);
    expect(prompt.cards.map((c) => c.instanceId)).toEqual([deckId(0), deckId(1), deckId(2)]);
    expect(prompt.restDestination).toBe("TOP");
    expect(prompt.canSendToBottom).toBe(false);

    const bottom = respond(afterPlay, s.db, arrange([deckId(0), deckId(1), deckId(2)], "bottom"));
    expect(bottom.responseRejected).toBe(true);
    expect(bottom.state).toEqual(afterPlay);

    const resolved = accept(afterPlay, s.db, arrange([deckId(2), deckId(0), deckId(1)], "top"));
    expect(resolved.pendingPrompt).toBeNull();
    expect(resolved.players[0].deck.map((c) => c.instanceId)).toEqual([
      deckId(2), deckId(0), deckId(1), deckId(3), deckId(4),
    ]);
  });

  it("ST17-004 (top or bottom, then give DON) applies the arrangement before continuing its chain", () => {
    const s = setup("ST17-004", 5, { types: ["The Seven Warlords of the Sea"] });
    const afterPlay = play(s);
    expect(arrangePrompt(afterPlay).restDestination).toBe("TOP_OR_BOTTOM");
    const r = respond(afterPlay, s.db, arrange([deckId(2), deckId(0), deckId(1)], "bottom"));
    expect(r.responseRejected).toBe(false);
    expect(r.state.players[0].deck.map((c) => c.instanceId)).toEqual([
      deckId(3), deckId(4), deckId(2), deckId(0), deckId(1),
    ]);
    // The trailing GIVE_DON still runs: it prompts for its Warlords target.
    expect(r.state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
  });

  it("OP01-073 (look at 5) arranges all five cards", () => {
    const s = setup("OP01-073", 6);
    const afterPlay = play(s);
    const ids = [0, 1, 2, 3, 4].map(deckId);
    expect(arrangePrompt(afterPlay).cards.map((c) => c.instanceId)).toEqual(ids);
    const resolved = accept(afterPlay, s.db, arrange([...ids].reverse(), "top"));
    expect(resolved.players[0].deck.map((c) => c.instanceId)).toEqual([...[...ids].reverse(), deckId(5)]);
  });

  it("OP02-056 (authored with count: 3) looks at exactly 3 cards", () => {
    const s = setup("OP02-056", 6);
    const afterPlay = play(s);
    expect(arrangePrompt(afterPlay).cards.map((c) => c.instanceId)).toEqual([deckId(0), deckId(1), deckId(2)]);
    const resolved = accept(afterPlay, s.db, arrange([deckId(1), deckId(2), deckId(0)], "bottom"));
    expect(resolved.players[0].deck.map((c) => c.instanceId)).toEqual([
      deckId(3), deckId(4), deckId(5), deckId(1), deckId(2), deckId(0),
    ]);
  });

  it("the DECK_SCRY handler ignores frames paused on any other action", () => {
    const s = setup("OP17-050", 5);
    const other: Action = { type: "SEARCH_DECK", params: { look_at: 2 } } as Action;
    expect(
      handleArrangeDeckScry(s.state, arrange([deckId(0)], "top"), other, 0, [deckId(0)]),
    ).toBeNull();
  });
});
