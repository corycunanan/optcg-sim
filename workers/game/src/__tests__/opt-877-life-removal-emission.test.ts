/**
 * OPT-877 — the four effect-driven Life exits that bypassed
 * `CARD_REMOVED_FROM_LIFE`, through the real action pipeline with the
 * authored production registry.
 *
 *   PLAY_FROM_LIFE           (OP10-022 Trafalgar Law)
 *   LIFE_CARD_TO_DECK        (OP01-063 Arlong, ST13-004, ST13-016)
 *   TRASH_FACE_UP_LIFE       (ST13-002 Portgas.D.Ace)
 *   DRAIN_LIFE_TO_THRESHOLD  (EB01-059 Kingdom Come, EB01-060)
 *
 * Watchers (docs/cards):
 *   OP11-041 Nami — "[Your Turn] [Once Per Turn] This effect can be activated
 *     when a card is removed from your or your opponent's Life cards. If you
 *     have 7 or less cards in your hand, draw 1 card."
 *   OP12-099 Kalgara — "[Your Turn] When a card is removed from your or your
 *     opponent's Life cards, draw 1 card. Then, you cannot draw cards using
 *     your own effects during this turn."
 *   OP08-105 Jewelry Bonney — "[DON!! x1] [Your Turn] [Once Per Turn] When a
 *     card is removed from your opponent's Life cards, draw 2 cards and trash
 *     1 card from your hand."
 *
 * FAQ: qa_op11.md (Nami: own or opponent's Life; effect-driven Life→hand
 * qualifies; a reorder does not), qa_op08.md (Bonney: the opponent's Life
 * moved to hand or trash by the opponent's own effect qualifies; only a move
 * from the Life area to another area qualifies), qa_op12.md (Kalgara: either
 * player's Life; a second draw the same turn does nothing).
 *
 * Emission contract (existing emitters: executeTrashFromLife,
 * executeLifeToHand, cost/payment.ts): one CARD_REMOVED_FROM_LIFE per card
 * that actually left Life, playerIndex = Life owner, pushed after the
 * handler's own domain event into the same batch, so watchers resolve after
 * the effect's continuation.
 */

import { describe, expect, it } from "vitest";
import type {
  CardData,
  CardInstance,
  GameAction,
  GameEvent,
  GameState,
  LifeCard,
} from "../types.js";
import type { EffectSchema } from "../engine/effect-types.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { runPipeline } from "../engine/pipeline.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";

const NAMI = "OP11-041";
const KALGARA = "OP12-099";
const BONNEY = "OP08-105";

type LifeAction =
  | { type: "PLAY_FROM_LIFE"; params: { position: "TOP" } }
  | { type: "LIFE_CARD_TO_DECK"; params: { amount: number; position: "BOTTOM" }; target?: { controller: "OPPONENT" } }
  | { type: "TRASH_FACE_UP_LIFE" }
  | { type: "DRAIN_LIFE_TO_THRESHOLD"; params: { threshold: number } };

/**
 * Every path, with its expected number of removed cards from a 4-card Life
 * whose top two cards are face-up.
 */
const PATHS: Array<{ name: string; action: LifeAction; removed: number; domainEvent: GameEvent["type"] | null }> = [
  { name: "PLAY_FROM_LIFE", action: { type: "PLAY_FROM_LIFE", params: { position: "TOP" } }, removed: 1, domainEvent: "CARD_PLAYED" },
  { name: "LIFE_CARD_TO_DECK", action: { type: "LIFE_CARD_TO_DECK", params: { amount: 2, position: "BOTTOM" } }, removed: 2, domainEvent: "LIFE_CARD_TO_DECK" },
  { name: "TRASH_FACE_UP_LIFE", action: { type: "TRASH_FACE_UP_LIFE" }, removed: 2, domainEvent: "CARD_TRASHED" },
  { name: "DRAIN_LIFE_TO_THRESHOLD", action: { type: "DRAIN_LIFE_TO_THRESHOLD", params: { threshold: 2 } }, removed: 2, domainEvent: null },
];

function testCard(id: string, type: CardData["type"], schema: EffectSchema, data: Partial<CardData> = {}): CardData {
  return {
    ...CARDS.VANILLA,
    id,
    name: id,
    type,
    cost: 1,
    power: type === "Event" ? null : CARDS.VANILLA.power,
    effectText: "",
    ...data,
    effectSchema: schema,
  };
}

/** A Character whose [Activate: Main] runs `action`, then (continuation) draws 1. */
function activateSource(action: LifeAction): EffectSchema {
  return {
    card_id: "TEST-877-SRC",
    card_name: "OPT-877 activate source",
    card_type: "Character",
    effects: [{
      id: "src",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      actions: [
        action as never,
        { type: "DRAW", params: { amount: 1 }, chain: "THEN" },
      ],
    }],
  };
}

/** A [Counter] Event whose effect runs `action` on its controller's Life. */
function counterSource(action: LifeAction): EffectSchema {
  return {
    card_id: "TEST-877-CTR",
    card_name: "OPT-877 counter source",
    card_type: "Event",
    effects: [{
      id: "ctr",
      category: "auto",
      trigger: { keyword: "COUNTER_EVENT" },
      actions: [action as never],
    }],
  };
}

function fixture(opts: { handSize?: number; lifeCardId?: string } = {}) {
  const handSize = opts.handSize ?? 3;
  const db = createTestCardDb();
  let state = createBattleReadyState(db);
  state.players.forEach((p, owner) => {
    p.characters = padChars([]);
    p.hand = Array.from({ length: owner === 0 ? handSize : 0 }, (_, i) => ({
      instanceId: `hand-${owner}-${i}`,
      cardId: CARDS.VANILLA.id,
      controller: owner as 0 | 1,
      owner: owner as 0 | 1,
      zone: "HAND" as const,
      state: "ACTIVE" as const,
      attachedDon: [],
      turnPlayed: 0,
    }));
    // Vanilla (no [Trigger]) Characters, top two face-up.
    p.life = Array.from({ length: 4 }, (_, i): LifeCard => ({
      instanceId: `life-${owner}-${i}`,
      cardId: opts.lifeCardId ?? CARDS.VANILLA.id,
      face: i < 2 ? "UP" : "DOWN",
    }));
  });

  function place(c: CardInstance, data: CardData) {
    if (c.zone === "HAND") state.players[c.owner].hand.push(c);
    else if (c.zone === "LEADER") state.players[c.owner].leader = c;
    else {
      const slot = state.players[c.owner].characters.findIndex((x) => !x);
      state.players[c.owner].characters[slot] = c;
    }
    if (c.zone !== "HAND") state = registerCardEnteredField(state, c, data);
    return c;
  }

  function instance(id: string, owner: 0 | 1, zone: CardInstance["zone"], don = 0): CardInstance {
    return {
      instanceId: `${id}-${owner}-${zone}`,
      cardId: id,
      controller: owner,
      owner,
      zone,
      state: "ACTIVE",
      attachedDon: Array.from({ length: don }, (_, i) => ({
        instanceId: `don-attached-${id}-${i}`,
        state: "ACTIVE" as const,
        attachedTo: `${id}-${owner}-${zone}`,
      })),
      turnPlayed: 0,
    };
  }

  /** Put an authored card. */
  function put(
    id: string,
    owner: 0 | 1,
    zone: CardInstance["zone"],
    data: Partial<CardData> = {},
    don = 0,
  ): CardInstance {
    const schema = getEffectSchema(id);
    expect(schema, `${id} authored`).toBeDefined();
    const cardData: CardData = {
      ...(zone === "LEADER" ? CARDS.LEADER : CARDS.VANILLA),
      id,
      name: schema!.card_name ?? id,
      effectText: "",
      ...data,
      effectSchema: schema!,
    };
    db.set(id, cardData);
    return place(instance(id, owner, zone, don), cardData);
  }

  /** Put a synthetic test card. */
  function putTest(data: CardData, owner: 0 | 1, zone: CardInstance["zone"]): CardInstance {
    db.set(data.id, data);
    return place(instance(data.id, owner, zone), data);
  }

  function act(action: GameAction, player: 0 | 1 = state.turn.activePlayerIndex) {
    if (state.pendingPrompt) {
      const r = resumePromptLifecycle(state, action, db, {
        drainPregame: (s) => s,
        advanceStartOfTurn: (s) => s,
      });
      expect(r.responseRejected, JSON.stringify({ action, prompt: state.pendingPrompt?.options })).toBe(false);
      state = r.state;
    } else {
      const r = runPipeline(state, action, db, player);
      expect(r.valid, r.error).toBe(true);
      state = r.state;
    }
  }

  /** The pending prompt, if any, is the named card's optional watcher. */
  function offered(sourceInstanceId: string, blockId: string): boolean {
    const prompt = state.pendingPrompt;
    if (!prompt || prompt.options.promptType !== "OPTIONAL_EFFECT") return false;
    const frame = state.effectStack.at(-1);
    return frame?.sourceCardInstanceId === sourceInstanceId && frame.effectBlock.id === blockId;
  }

  /**
   * One trigger per removed card (the OPT-240 count semantics) puts several
   * simultaneous watcher triggers in the turn player's ordering prompt; take
   * them first-listed. Returns how many ordering prompts were answered.
   */
  function orderTriggers(): number {
    let answered = 0;
    for (let i = 0; i < 10; i++) {
      const prompt = state.pendingPrompt;
      if (prompt?.options.promptType !== "PLAYER_CHOICE") break;
      if (prompt.options.effectDescription !== "Choose which effect to activate first") break;
      const next = prompt.options.choices!.find((c) => !c.disabled && c.id !== "done");
      if (!next) break;
      act({ type: "PLAYER_CHOICE", choiceId: next.id });
      answered++;
    }
    return answered;
  }

  return {
    db,
    put,
    putTest,
    act,
    offered,
    orderTriggers,
    accept: () => act({ type: "PLAYER_CHOICE", choiceId: "accept" }),
    done() {
      expect(state.pendingPrompt).toBeNull();
      expect(state.effectStack).toHaveLength(0);
    },
    get state(): GameState {
      return state;
    },
  };
}

function removals(state: GameState, owner: 0 | 1) {
  return state.eventLog.filter((e) => e.type === "CARD_REMOVED_FROM_LIFE" && e.playerIndex === owner);
}

function namiFixture() {
  const f = fixture();
  const nami = f.put(NAMI, 0, "LEADER");
  return { f, nami, namiOffered: () => f.offered(nami.instanceId, "life_removed_draw") };
}

describe("OPT-877 — effect-driven Life exits emit CARD_REMOVED_FROM_LIFE", () => {
  describe.each(PATHS)("$name", ({ action, removed, domainEvent }) => {
    it("your own Life, your effect: one event per removed card, owner = you; Nami offered after the continuation", () => {
      const { f, namiOffered } = namiFixture();
      const lifeBefore = f.state.players[0].life.map((l) => l.instanceId);
      const src = f.putTest(testCard("TEST-877-SRC", "Character", activateSource(action)), 0, "CHARACTER");
      f.act({ type: "ACTIVATE_EFFECT", cardInstanceId: src.instanceId, effectId: "src" });

      const events = removals(f.state, 0);
      expect(events).toHaveLength(removed);
      expect(removals(f.state, 1)).toHaveLength(0);
      expect(f.state.players[0].life).toHaveLength(4 - removed);
      // Each event names a card that was in Life and is no longer there.
      const removedIds = events.map((e) => (e.payload as { cardInstanceId: string }).cardInstanceId);
      expect(new Set(removedIds).size).toBe(removed);
      for (const id of removedIds) {
        expect(lifeBefore).toContain(id);
        expect(f.state.players[0].life.some((l) => l.instanceId === id)).toBe(false);
      }

      // Ordering: the handler's own domain event precedes the removal events.
      const log = f.state.eventLog;
      const firstRemoval = log.findIndex((e) => e.type === "CARD_REMOVED_FROM_LIFE");
      if (domainEvent) {
        const domainIdx = log.findIndex((e) => e.type === domainEvent);
        expect(domainIdx).toBeGreaterThanOrEqual(0);
        expect(domainIdx).toBeLessThan(firstRemoval);
      }

      // The watcher waits for the source's continuation (its THEN draw: 3 → 4).
      expect(f.state.players[0].hand).toHaveLength(4);
      // One trigger per removed card: 2+ removals ask the turn player to order them.
      expect(f.orderTriggers()).toBe(removed > 1 ? 1 : 0);
      expect(namiOffered()).toBe(true);
      f.accept();
      // Once per turn: the remaining same-batch trigger is not offered again.
      expect(namiOffered()).toBe(false);
      f.done();
      expect(f.state.players[0].hand).toHaveLength(5);
    });

    it("your opponent's Life, their [Counter] on your turn: owner = opponent; Nami offered", () => {
      const { f, nami, namiOffered } = namiFixture();
      const counter = f.putTest(testCard("TEST-877-CTR", "Event", counterSource(action), { effectText: "[Counter] (OPT-877 test source)" }), 1, "HAND");
      f.act({
        type: "DECLARE_ATTACK",
        attackerInstanceId: nami.instanceId,
        targetInstanceId: f.state.players[1].leader.instanceId,
      });
      f.act({ type: "PASS" }, 1);
      f.act({
        type: "USE_COUNTER_EVENT",
        cardInstanceId: counter.instanceId,
        counterTargetInstanceId: f.state.players[1].leader.instanceId,
      }, 1);

      expect(removals(f.state, 1)).toHaveLength(removed);
      expect(removals(f.state, 0)).toHaveLength(0);
      expect(f.state.players[1].life).toHaveLength(4 - removed);
      expect(f.orderTriggers()).toBe(removed > 1 ? 1 : 0);
      expect(namiOffered()).toBe(true);
      f.accept();
      expect(namiOffered()).toBe(false);
      expect(f.state.players[0].hand).toHaveLength(4);
    });
  });

  it("LIFE_CARD_TO_DECK on the opponent's Life from your effect: owner = opponent", () => {
    const { f, namiOffered } = namiFixture();
    const src = f.putTest(
      testCard("TEST-877-SRC", "Character", activateSource({
        type: "LIFE_CARD_TO_DECK",
        target: { controller: "OPPONENT" },
        params: { amount: 1, position: "BOTTOM" },
      })),
      0,
      "CHARACTER",
    );
    f.act({ type: "ACTIVATE_EFFECT", cardInstanceId: src.instanceId, effectId: "src" });
    expect(removals(f.state, 1)).toHaveLength(1);
    expect(removals(f.state, 0)).toHaveLength(0);
    expect(f.state.players[1].life).toHaveLength(3);
    expect(namiOffered()).toBe(true);
  });

  it("once per turn: a second path the same turn is not offered again after the draw was used", () => {
    const { f, namiOffered } = namiFixture();
    const drain = f.putTest(
      testCard("TEST-877-SRC", "Character", activateSource({ type: "DRAIN_LIFE_TO_THRESHOLD", params: { threshold: 3 } })),
      0,
      "CHARACTER",
    );
    f.act({ type: "ACTIVATE_EFFECT", cardInstanceId: drain.instanceId, effectId: "src" });
    expect(namiOffered()).toBe(true);
    f.accept();
    f.done();
    const trash = f.putTest(
      testCard("TEST-877-SRC2", "Character", { ...activateSource({ type: "TRASH_FACE_UP_LIFE" }), card_id: "TEST-877-SRC2" }),
      0,
      "CHARACTER",
    );
    f.state.players[0].life[0].face = "UP";
    f.act({ type: "ACTIVATE_EFFECT", cardInstanceId: trash.instanceId, effectId: "src" });
    expect(removals(f.state, 0)).toHaveLength(2);
    expect(namiOffered()).toBe(false);
    f.done();
  });

  describe("no removal, no event", () => {
    it("PLAY_FROM_LIFE whose top Life card is not a Character plays nothing and emits nothing", () => {
      const f = fixture({ lifeCardId: CARDS.EVENT_COUNTER.id });
      f.put(NAMI, 0, "LEADER");
      const src = f.putTest(
        testCard("TEST-877-SRC", "Character", activateSource({ type: "PLAY_FROM_LIFE", params: { position: "TOP" } })),
        0,
        "CHARACTER",
      );
      f.act({ type: "ACTIVATE_EFFECT", cardInstanceId: src.instanceId, effectId: "src" });
      expect(f.state.players[0].life).toHaveLength(4);
      expect(removals(f.state, 0)).toHaveLength(0);
      expect(f.state.eventLog.some((e) => e.type === "CARD_PLAYED" && (e.payload as { source?: string }).source === "LIFE")).toBe(false);
    });

    it("TRASH_FACE_UP_LIFE with no face-up Life and DRAIN at or below the threshold emit nothing", () => {
      const f = fixture();
      f.put(NAMI, 0, "LEADER");
      f.state.players[0].life.forEach((l) => (l.face = "DOWN"));
      const trash = f.putTest(
        testCard("TEST-877-SRC", "Character", activateSource({ type: "TRASH_FACE_UP_LIFE" })),
        0,
        "CHARACTER",
      );
      f.act({ type: "ACTIVATE_EFFECT", cardInstanceId: trash.instanceId, effectId: "src" });
      const drain = f.putTest(
        testCard("TEST-877-SRC2", "Character", { ...activateSource({ type: "DRAIN_LIFE_TO_THRESHOLD", params: { threshold: 4 } }), card_id: "TEST-877-SRC2" }),
        0,
        "CHARACTER",
      );
      f.act({ type: "ACTIVATE_EFFECT", cardInstanceId: drain.instanceId, effectId: "src" });
      expect(f.state.players[0].life).toHaveLength(4);
      expect(removals(f.state, 0)).toHaveLength(0);
    });
  });
});

describe("OPT-877 — authored users against printed watcher text", () => {
  function playKingdomCome() {
    const f = fixture();
    f.put(KALGARA, 0, "CHARACTER");
    const event = f.put("EB01-059", 0, "HAND", {
      type: "Event",
      cost: 1,
      power: null,
      effectText: "[Main] K.O. up to 1 of your opponent's Characters. Then, trash cards from the top of your Life cards until you have 1 Life card.",
    });
    f.act({ type: "PLAY_CARD", cardInstanceId: event.instanceId });
    return f;
  }

  const kalgaraDraws = (state: GameState) =>
    state.eventLog.filter((e) => e.type === "CARD_DRAWN" && e.playerIndex === 0).length;

  it("EB01-059 Kingdom Come drains your Life to 1: three removals, owner = you; Kalgara fires", () => {
    const f = playKingdomCome();
    expect(f.state.players[0].life).toHaveLength(1);
    const events = removals(f.state, 0);
    expect(events.map((e) => (e.payload as { cardInstanceId: string }).cardInstanceId))
      .toEqual(["life-0-0", "life-0-1", "life-0-2"]);
    expect(removals(f.state, 1)).toHaveLength(0);
    // One Kalgara trigger per removed card: the turn player orders three.
    expect(f.orderTriggers()).toBeGreaterThan(0);
    f.done();
    expect(kalgaraDraws(f.state)).toBeGreaterThanOrEqual(1);
  });

  // OPT-876 enforces CANNOT_DRAW (Kalgara's "Then, you cannot draw cards
  // using your own effects during this turn"): qa_op12, after the first draw
  // the remaining triggers draw nothing. Formerly an it.fails ratchet.
  it("EB01-059 + Kalgara draws exactly 1 across three removals (qa_op12; OPT-876)", () => {
    const f = playKingdomCome();
    f.orderTriggers();
    f.done();
    expect(kalgaraDraws(f.state)).toBe(1);
  });

  it("EB01-059 draining your own Life does not fire Bonney (opponent's Life only)", () => {
    const f = fixture();
    f.put(BONNEY, 0, "CHARACTER", {}, 1);
    const event = f.put("EB01-059", 0, "HAND", {
      type: "Event",
      cost: 1,
      power: null,
      effectText: "[Main] K.O. up to 1 of your opponent's Characters. Then, trash cards from the top of your Life cards until you have 1 Life card.",
    });
    f.act({ type: "PLAY_CARD", cardInstanceId: event.instanceId });
    expect(removals(f.state, 0)).toHaveLength(3);
    f.done();
    // 3 hand + Kingdom Come − Kingdom Come played; no Bonney draw.
    expect(f.state.players[0].hand).toHaveLength(3);
  });

  it("OP01-063 Arlong places the opponent's Life at the bottom of their deck: Bonney draws 2, trashes 1", () => {
    const f = fixture();
    f.put(BONNEY, 0, "CHARACTER", {}, 1);
    const arlong = f.put("OP01-063", 0, "CHARACTER", {}, 1);
    f.state.players[1].hand.push({
      instanceId: "opp-event",
      cardId: CARDS.EVENT_COUNTER.id,
      controller: 1,
      owner: 1,
      zone: "HAND",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 0,
    });
    const oppLifeTop = f.state.players[1].life[0].instanceId;
    f.act({ type: "ACTIVATE_EFFECT", cardInstanceId: arlong.instanceId, effectId: "OP01-063_activate_reveal_conditional" });
    // Arlong's optional rest cost; the opponent's only hand card (an Event) is
    // revealed, so the opponent's top Life goes to the bottom of their deck.
    expect(f.state.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
    f.accept();
    // Bonney fires on the opponent's Life removal: draw 2, then trash 1.
    expect(f.state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    expect(f.state.pendingPrompt?.respondingPlayer).toBe(0);
    f.act({ type: "SELECT_TARGET", selectedInstanceIds: ["hand-0-0"] });
    f.done();
    const events = removals(f.state, 1);
    expect(events).toHaveLength(1);
    expect((events[0].payload as { cardInstanceId: string }).cardInstanceId).toBe(oppLifeTop);
    expect(removals(f.state, 0)).toHaveLength(0);
    expect(f.state.players[1].life).toHaveLength(3);
    expect(f.state.players[1].deck.at(-1)?.cardId).toBe(CARDS.VANILLA.id);
    // Bonney: 3 + 2 − 1.
    expect(f.state.players[0].hand).toHaveLength(4);
  });

  it("OP10-022 Law plays a {Supernovas} Character from Life: one removal; Kalgara draws 1", () => {
    const f = fixture({ lifeCardId: "TEST-877-SUPERNOVA" });
    f.db.set("TEST-877-SUPERNOVA", {
      ...CARDS.VANILLA,
      id: "TEST-877-SUPERNOVA",
      name: "Supernova",
      cost: 4,
      types: ["Supernovas"],
    });
    const law = f.put("OP10-022", 0, "LEADER", {}, 1);
    f.put(KALGARA, 0, "CHARACTER", { cost: 5 });
    // Law's cost: return 1 of your Characters to hand.
    f.putTest(CARDS.VANILLA, 0, "CHARACTER");
    const lifeTop = f.state.players[0].life[0].instanceId;
    f.act({ type: "ACTIVATE_EFFECT", cardInstanceId: law.instanceId, effectId: "activate_reveal_life_play" });
    // Law's optional cost: return the vanilla Character; the revealed top Life
    // card is a cost-4 {Supernovas} Character, so choose to play it.
    expect(f.state.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
    f.accept();
    expect(f.state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    f.act({ type: "SELECT_TARGET", selectedInstanceIds: ["CHAR-VANILLA-0-CHARACTER"] });
    expect(f.state.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");
    f.act({ type: "PLAYER_CHOICE", choiceId: "0" });
    f.done();
    const events = removals(f.state, 0);
    expect(events).toHaveLength(1);
    expect((events[0].payload as { cardInstanceId: string }).cardInstanceId).toBe(lifeTop);
    expect(f.state.players[0].life).toHaveLength(3);
    expect(f.state.players[0].characters.some((c) => c?.cardId === "TEST-877-SUPERNOVA")).toBe(true);
    // Kalgara: 3 hand + the returned Character + 1 draw.
    expect(f.state.eventLog.filter((e) => e.type === "CARD_DRAWN" && e.playerIndex === 0)).toHaveLength(1);
    expect(f.state.players[0].hand).toHaveLength(5);
  });

  function endAceTurn() {
    const f = fixture();
    f.put("ST13-002", 0, "LEADER");
    f.put(KALGARA, 0, "CHARACTER");
    const handBefore = f.state.players[0].hand.length;
    for (let i = 0; i < 4 && removals(f.state, 0).length === 0; i++) {
      if (f.state.pendingPrompt) throw new Error(`unexpected prompt ${f.state.pendingPrompt.options.promptType}`);
      f.act({ type: "ADVANCE_PHASE" }, 0);
    }
    f.orderTriggers();
    return { f, handBefore };
  }

  it("ST13-002 Ace trashes all face-up Life at end of turn: one removal per trashed card, owner = you", () => {
    const { f } = endAceTurn();
    const events = removals(f.state, 0);
    expect(events).toHaveLength(2);
    expect(events.map((e) => (e.payload as { cardInstanceId: string }).cardInstanceId)).toEqual(["life-0-0", "life-0-1"]);
    expect(removals(f.state, 1)).toHaveLength(0);
    expect(f.state.players[0].life).toHaveLength(2);
    expect(f.state.players[0].life.every((l) => l.face === "DOWN")).toBe(true);
  });

  // Known gap, not OPT-877's: [End of Your Turn] effects fire off TURN_ENDED,
  // which completeTurnHandoff (phases.ts) emits after the turn has already
  // passed to the opponent. Ace's trash therefore resolves in the opponent's
  // Refresh Phase and Kalgara's [Your Turn] watcher correctly declines it.
  // Printed timing (rule 6-6-1-1) resolves it inside your End Phase, where
  // Kalgara should draw 1. Tracked as an OPT-877 PR follow-up.
  it.fails("ST13-002 Ace's end-of-turn trash resolves during your turn, so Kalgara draws 1 (end-of-turn timing gap)", () => {
    const { f, handBefore } = endAceTurn();
    expect(f.state.players[0].hand).toHaveLength(handBefore + 1);
  });

  it("ST13-004 Newgate places a Life card on top of your deck: one removal; Nami offered", () => {
    const { f, namiOffered } = namiFixture();
    const newgate = f.put("ST13-004", 0, "HAND", { cost: 1 });
    f.act({ type: "PLAY_CARD", cardInstanceId: newgate.instanceId });
    // Deck top → Life, then the (now) top Life card → top of deck; the
    // effect's continuation reorders Life before Nami is offered (the
    // removal is published with the effect's batch, after the reorder).
    expect(removals(f.state, 0)).toHaveLength(0);
    const prompt = f.state.pendingPrompt;
    expect(prompt?.options.promptType).toBe("ARRANGE_TOP_CARDS");
    expect(namiOffered()).toBe(false);
    f.act({
      type: "ARRANGE_TOP_CARDS",
      keptCardInstanceId: "",
      orderedInstanceIds: f.state.players[0].life.map((l) => l.instanceId),
      destination: "top",
    });
    expect(f.state.players[0].life).toHaveLength(4);
    expect(removals(f.state, 0)).toHaveLength(1);
    expect(namiOffered()).toBe(true);
  });
});
