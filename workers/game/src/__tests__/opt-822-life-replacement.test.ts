import { describe, expect, it } from "vitest";
import type { CardData, GameAction, LifeCard, CardInstance } from "../types.js";
import type { Cost, EffectBlock } from "../engine/effect-types.js";
import { registerTriggersForCard } from "../engine/triggers.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { runPipeline } from "../engine/pipeline.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
  padChars,
} from "./helpers.js";

// ST13 FAQ (2026-09-13): Reject redirects face-up Life after damage;
// Makino redirects its cost but never resolves the post-colon reorder.
// Comprehensive rules 8-3-1-7 and 10-2-13-5 govern committed cost failure.
function fixture(faces: LifeCard["face"][]) {
  const db = createTestCardDb();
  for (const id of ["ST13-003", "ST13-012", "OP06-116"]) {
    const schema = getEffectSchema(id)!;
    db.set(id, {
      ...CARDS.VANILLA,
      id,
      name: schema.card_name!,
      type:
        id === "ST13-003"
          ? "Leader"
          : id === "OP06-116"
            ? "Event"
            : "Character",
      effectText: id === "OP06-116" ? "[Main] Choose one:" : "",
      cost: id === "OP06-116" ? 4 : 1,
      color: ["Yellow"],
      effectSchema: schema,
    } as CardData);
  }
  let state = createBattleReadyState(db);
  state.players[0].leader.cardId = "ST13-003";
  state.players[0].characters = padChars([]);
  state.players[0].life = faces.map((face, i) => ({
    cardId: CARDS.TRIGGER.id,
    instanceId: `life-${i}`,
    face,
  }));
  function act(action: GameAction) {
    const r = runPipeline(state, action, db, 0);
    expect(r.valid, r.error).toBe(true);
    state = r.state;
    return r;
  }
  function respond(action: GameAction) {
    // Durable Object storage clones the prompt/frame graph between requests.
    state = structuredClone(state);
    const r = resumePromptLifecycle(state, action, db, {
      drainPregame: (s) => s,
      advanceStartOfTurn: (s) => s,
    });
    expect(r.responseRejected, JSON.stringify(state.pendingPrompt)).toBe(false);
    state = r.state;
  }
  function choice(choiceId: string) {
    respond({ type: "PLAYER_CHOICE", choiceId });
  }
  function field(cardId: string, block?: EffectBlock, owner: 0 | 1 = 0) {
    const schema = block ? { effects: [block] } : getEffectSchema(cardId)!;
    const data: CardData = {
      ...CARDS.VANILLA,
      id: cardId,
      effectSchema: schema,
    };
    db.set(cardId, data);
    const card: CardInstance = {
      instanceId: cardId,
      cardId,
      zone: "CHARACTER",
      state: "ACTIVE",
      owner,
      controller: owner,
      turnPlayed: 1,
      attachedDon: [],
    };
    state.players[owner].characters[
      state.players[owner].characters.findIndex((c) => !c)
    ] = card;
    state = registerTriggersForCard(state, card, data);
    return card;
  }
  function activate(costs: Cost[], optional = false) {
    const block: EffectBlock = {
      id: "life-cost",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true, optional },
      costs,
      actions: [{ type: "DRAW", params: { amount: 2 } }],
    };
    field("TEST-COST", block);
    act({
      type: "ACTIVATE_EFFECT",
      cardInstanceId: "TEST-COST",
      effectId: block.id,
    });
  }
  function play(cardId: string) {
    state.players[0].hand.push({
      ...state.players[0].hand[0],
      cardId,
      instanceId: "played",
      zone: "HAND",
      owner: 0,
      controller: 0,
    });
    return act({ type: "PLAY_CARD", cardInstanceId: "played" });
  }
  function arrange() {
    const ids = state.players[0].life.map((c) => c.instanceId).reverse();
    const r = resumePromptLifecycle(
      state,
      {
        type: "ARRANGE_TOP_CARDS",
        orderedInstanceIds: ids,
        keptCardInstanceId: "",
        destination: "top",
      },
      db,
      {
        drainPregame: (s) => s,
        advanceStartOfTurn: (s) => s,
      }
    );
    expect(r.responseRejected).toBe(false);
    state = r.state;
    expect(state.players[0].life.map((c) => c.instanceId)).toEqual(ids);
  }
  return {
    db,
    act,
    choice,
    respond,
    field,
    activate,
    play,
    arrange,
    get state() {
      return state;
    },
  };
}

describe("OPT-822 Life replacement", () => {
  for (const selected of [false, true]) {
    it(`nested Event replacement completes once before parent and queued siblings (selected=${selected})`, () => {
      // Synthetic producer/siblings isolate OPT-850's continuation contract;
      // the real Reject/Makino regressions below establish the FAQ behavior.
      const f = fixture(["UP", "DOWN"]);
      f.db.set("NESTED", {
        ...CARDS.VANILLA,
        id: "NESTED",
        type: "Event",
        cost: 0,
        effectText: "[Main] You may add 1 Life card to hand: Draw 5 cards.",
        effectSchema: {
          effects: [
            {
              id: "nested-main",
              category: "auto",
              trigger: { keyword: "MAIN_EVENT" },
              flags: { optional: true },
              costs: [
                { type: "LIFE_TO_HAND", amount: 1, position: "TOP_OR_BOTTOM" },
              ],
              actions: [{ type: "DRAW", params: { amount: 5 } }],
            },
          ],
        },
      });
      f.state.players[0].hand.push({
        ...f.state.players[0].hand[0],
        cardId: "NESTED",
        instanceId: "nested-event",
      });
      const siblings: EffectBlock[] = [2, 3].map((amount) => ({
        id: `sibling-${amount}`,
        category: "auto",
        trigger: { keyword: "ON_PLAY" },
        actions: [{ type: "DRAW", params: { amount } }],
      }));
      f.db.set("PARENT", {
        ...CARDS.VANILLA,
        id: "PARENT",
        cost: 1,
        color: ["Yellow"],
        effectSchema: {
          effects: [
            {
              id: "parent",
              category: "auto",
              trigger: { keyword: "ON_PLAY" },
              actions: [
                {
                  type: "ACTIVATE_EVENT_FROM_HAND",
                  target: {
                    type: "EVENT_CARD",
                    source_zone: "HAND",
                    count: selected ? { up_to: 1 } : { exact: 1 },
                  },
                },
                { type: "DRAW", params: { amount: 1 }, chain: "THEN" },
              ],
            },
            ...siblings,
          ],
        },
      });
      const hand = f.state.players[0].hand.length;
      f.play("PARENT");
      const orderingId = f.state.effectStack
        .at(-1)!
        .simultaneousTriggers.find(
          (t) => t.effectBlock.id === "parent"
        )!.orderingId!;
      f.choice(orderingId);
      if (selected)
        f.respond({
          type: "SELECT_TARGET",
          selectedInstanceIds: ["nested-event"],
        });
      expect(
        f.state.effectStack.some((frame) => frame.eventActivationCompletion)
      ).toBe(true);
      f.choice("accept");
      expect(
        f.state.eventLog.filter((e) => e.type === "EVENT_ACTIVATED_FROM_HAND")
      ).toHaveLength(0);
      f.choice("0");
      expect(f.state.players[0].life.map((c) => c.instanceId)).toEqual([
        "life-1",
      ]);
      expect(f.state.players[0].hand).toHaveLength(hand);
      expect(
        f.state.eventLog.filter((e) => e.type === "EVENT_ACTIVATED_FROM_HAND")
      ).toHaveLength(1);
      expect(
        f.state.eventLog
          .filter((e) =>
            [
              "CARD_REMOVED_FROM_LIFE",
              "EVENT_ACTIVATED_FROM_HAND",
              "CARD_DRAWN",
            ].includes(e.type)
          )
          .map((e) => e.type)
      ).toEqual([
        "CARD_REMOVED_FROM_LIFE",
        "EVENT_ACTIVATED_FROM_HAND",
        "CARD_DRAWN",
      ]);
      const remaining = f.state.effectStack.at(-1)!;
      expect(remaining.triggerOrderingGroup?.resolvedTriggerIds).toEqual([
        orderingId,
      ]);
      f.choice(
        remaining.simultaneousTriggers.find(
          (t) => t.effectBlock.id === "sibling-3"
        )!.orderingId!
      );
      expect(f.state.players[0].hand).toHaveLength(hand + 5);
      expect(
        f.state.eventLog.filter((e) => e.type === "EVENT_ACTIVATED_FROM_HAND")
      ).toHaveLength(1);
      expect(f.state.effectStack).toHaveLength(0);
      expect(f.state.pendingPrompt).toBeNull();
    });
  }
  for (const optional of [false, true]) {
    for (const position of ["TOP", "BOTTOM"] as const) {
      it(`fixed ${position} cost commits replacement and consumes once-per-turn (optional=${optional})`, () => {
        const f = fixture(["UP", "UP"]);
        const hand = f.state.players[0].hand.length;
        f.activate([{ type: "LIFE_TO_HAND", amount: 1, position }], optional);
        if (optional) f.choice("accept");
        expect(f.state.players[0].hand).toHaveLength(hand);
        expect(f.state.players[0].life).toHaveLength(1);
        expect(f.state.turn.oncePerTurnUsed["life-cost"]).toContain(
          "TEST-COST"
        );
        const again = runPipeline(
          f.state,
          {
            type: "ACTIVATE_EFFECT",
            cardInstanceId: "TEST-COST",
            effectId: "life-cost",
          },
          f.db,
          0
        );
        // The pipeline accepts the packet but the used effect cannot activate again.
        expect(again.state.pendingPrompt).toBeNull();
        expect(again.state.players[0].hand).toHaveLength(hand);
        expect(again.state.players[0].life).toHaveLength(1);
        expect(f.state.pendingPrompt).toBeNull();
        expect(f.state.effectStack).toHaveLength(0);
      });
    }
  }
  it("authored Kin'emon preserves earlier DON payment and consumes usage after replaced selectable Life cost", () => {
    const f = fixture(["UP", "UP"]);
    const kinemon = f.field("OP04-102");
    kinemon.state = "RESTED";
    const active = f.state.players[0].donCostArea.filter(
      (d) => d.state === "ACTIVE"
    ).length;
    f.act({
      type: "ACTIVATE_EFFECT",
      cardInstanceId: kinemon.instanceId,
      effectId: "activate_don_life_untap",
    });
    f.choice("accept");
    f.choice("1");
    expect(
      f.state.players[0].donCostArea.filter((d) => d.state === "ACTIVE")
    ).toHaveLength(active - 1);
    expect(
      f.state.players[0].characters.find(
        (c) => c?.instanceId === kinemon.instanceId
      )?.state
    ).toBe("RESTED");
    expect(f.state.players[0].life).toHaveLength(1);
    expect(f.state.turn.oncePerTurnUsed.activate_don_life_untap).toContain(
      kinemon.instanceId
    );
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.state.effectStack).toHaveLength(0);
  });
  it("keeps a selected hand payment before an automatically replaced remaining cost", () => {
    const f = fixture(["UP"]);
    const hand = f.state.players[0].hand.length;
    const selected = f.state.players[0].hand[0].instanceId;
    f.activate([
      { type: "TRASH_FROM_HAND", amount: 1 },
      { type: "LIFE_TO_HAND", amount: 1 },
    ]);
    f.respond({ type: "SELECT_TARGET", selectedInstanceIds: [selected] });
    expect(f.state.players[0].hand).toHaveLength(hand - 1);
    expect(f.state.players[0].trash).toHaveLength(1);
    expect(f.state.players[0].life).toHaveLength(0);
    expect(f.state.turn.oncePerTurnUsed["life-cost"]).toContain("TEST-COST");
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.state.effectStack).toHaveLength(0);
  });
  for (const type of ["CHOICE", "CHOOSE_ONE_COST"] as const) {
    it(`${type} branch can commit replacement without resolving post-colon actions`, () => {
      const f = fixture(["UP"]);
      const cost: Cost =
        type === "CHOICE"
          ? {
              type,
              options: [
                [{ type: "LIFE_TO_HAND", amount: 1 }],
                [{ type: "REST_SELF" }],
              ],
            }
          : {
              type,
              options: [
                { type: "LIFE_TO_HAND", amount: 1 },
                { type: "REST_SELF" },
              ],
            };
      const hand = f.state.players[0].hand.length;
      f.activate([cost]);
      const options = f.state.pendingPrompt?.options;
      expect(options?.promptType).toBe("PLAYER_CHOICE");
      if (options?.promptType !== "PLAYER_CHOICE")
        throw new Error("missing cost choice");
      f.choice(options.choices[0].id);
      expect(f.state.players[0].life).toHaveLength(0);
      expect(f.state.players[0].hand).toHaveLength(hand);
      expect(f.state.turn.oncePerTurnUsed["life-cost"]).toContain("TEST-COST");
      expect(f.state.effectStack).toHaveLength(0);
    });
  }
  it("a replaced cost publishes one removal and wakes its watcher exactly once after persistence", () => {
    const f = fixture(["UP", "DOWN", "DOWN"]);
    f.field("WATCHER", {
      id: "watch",
      category: "auto",
      trigger: {
        event: "CARD_REMOVED_FROM_LIFE",
        filter: { controller: "SELF" },
      },
      actions: [
        { type: "DRAW", params: { amount: 1 } },
        { type: "TRASH_FROM_HAND", params: { amount: 1 }, chain: "THEN" },
      ],
    });
    const hand = f.state.players[0].hand.length;
    f.play("ST13-012");
    f.choice("accept");
    f.choice("0");
    expect(f.state.players[0].hand).toHaveLength(hand + 1);
    const removals = f.state.eventLog.filter(
      (e) => e.type === "CARD_REMOVED_FROM_LIFE"
    );
    expect(removals).toHaveLength(1);
    expect(removals[0].payload).toMatchObject({
      cardInstanceId: "life-0",
      newCardInstanceId: f.state.players[0].deck.at(-1)?.instanceId,
    });
    expect(
      f.state.eventLog.filter((e) => e.type === "CARD_ADDED_TO_HAND_FROM_LIFE")
    ).toHaveLength(0);
    expect(f.state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    f.respond({
      type: "SELECT_TARGET",
      selectedInstanceIds: [f.state.players[0].hand[0].instanceId],
    });
    expect(f.state.players[0].hand).toHaveLength(hand);
    expect(
      f.state.eventLog.filter((e) => e.type === "CARD_REMOVED_FROM_LIFE")
    ).toHaveLength(1);
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.state.effectStack).toHaveLength(0);
  });
  for (const position of ["TOP", "BOTTOM"] as const) {
    it(`effect ${position} mixed Life movement consults the actual opponent owner`, () => {
      const f = fixture(["UP"]);
      f.state.players[1].leader.cardId = "ST13-003";
      f.state.players[1].life = [
        { cardId: CARDS.VANILLA.id, instanceId: "opp-up", face: "UP" },
        { cardId: CARDS.TRIGGER.id, instanceId: "opp-down", face: "DOWN" },
      ];
      f.field("MOVE", {
        id: "move",
        category: "activate",
        trigger: { keyword: "ACTIVATE_MAIN" },
        actions: [
          {
            type: "LIFE_TO_HAND",
            target: { type: "OPPONENT_LIFE" },
            params: { amount: 2, position },
          },
        ],
      });
      const hand = f.state.players[1].hand.length;
      const deck = f.state.players[1].deck.length;
      f.act({
        type: "ACTIVATE_EFFECT",
        cardInstanceId: "MOVE",
        effectId: "move",
      });
      expect(f.state.players[1].life).toHaveLength(0);
      expect(f.state.players[1].hand).toHaveLength(hand + 1);
      expect(f.state.players[1].deck).toHaveLength(deck + 1);
      expect(f.state.players[1].deck.at(-1)?.cardId).toBe(CARDS.VANILLA.id);
      expect(f.state.players[0].life).toHaveLength(1);
      expect(
        f.state.eventLog.filter((e) => e.type === "CARD_REMOVED_FROM_LIFE")
      ).toHaveLength(2);
      expect(
        f.state.eventLog.filter(
          (e) => e.type === "CARD_ADDED_TO_HAND_FROM_LIFE"
        )
      ).toHaveLength(1);
      expect(f.state.pendingPrompt).toBeNull();
    });
  }
  it("face-up Makino cost under a normal Leader pays and reorders", () => {
    const f = fixture(["UP", "DOWN", "DOWN"]);
    f.state.players[0].leader.cardId = CARDS.LEADER.id;
    const hand = f.state.players[0].hand.length;
    f.play("ST13-012");
    f.choice("accept");
    f.choice("0");
    expect(f.state.players[0].hand).toHaveLength(hand + 1);
    f.arrange();
    expect(f.state.pendingPrompt).toBeNull();
  });
  it("empty Life cannot perform a replacement payment", () => {
    const f = fixture([]);
    f.play("ST13-012");
    f.choice("accept");
    expect(f.state.pendingPrompt).toBeNull();
    expect(
      f.state.eventLog.filter((e) => e.type === "CARD_REMOVED_FROM_LIFE")
    ).toHaveLength(0);
  });
  it("declining Makino performs no replacement", () => {
    const f = fixture(["UP", "DOWN"]);
    f.play("ST13-012");
    f.choice("skip");
    expect(f.state.players[0].life).toHaveLength(2);
    expect(f.state.pendingPrompt).toBeNull();
  });
  for (const face of ["UP", "DOWN"] as const) {
    it(`Reject completes damage then moves ${face} Life without offering its Trigger`, () => {
      const f = fixture([face]);
      f.state.players[1].life = [
        { instanceId: "opponent-life", cardId: CARDS.VANILLA.id, face: "DOWN" },
      ];
      const hand = f.state.players[0].hand.length;
      const deck = f.state.players[0].deck.length;
      f.play("OP06-116");
      f.choice("1");
      expect(f.state.players[1].life).toHaveLength(0);
      expect(
        f.state.players[1].hand.some((c) => c.cardId === CARDS.VANILLA.id)
      ).toBe(true);
      expect(f.state.players[0].life).toHaveLength(0);
      expect(f.state.players[0].hand).toHaveLength(
        hand + (face === "DOWN" ? 1 : 0)
      );
      expect(f.state.players[0].deck).toHaveLength(
        deck + (face === "UP" ? 1 : 0)
      );
      expect(f.state.pendingPrompt).toBeNull();
      expect(f.state.effectStack).toHaveLength(0);
      const removals = f.state.eventLog.filter(
        (e) => e.type === "CARD_REMOVED_FROM_LIFE"
      );
      expect(removals.map((e) => e.playerIndex)).toEqual([1, 0]);
      expect(removals[1].payload.cardInstanceId).toBe("life-0");
      const ownHandAdds = f.state.eventLog.filter(
        (e) => e.type === "CARD_ADDED_TO_HAND_FROM_LIFE" && e.playerIndex === 0
      );
      expect(ownHandAdds).toHaveLength(face === "DOWN" ? 1 : 0);
    });
    for (const position of ["TOP", "BOTTOM"] as const) {
      it(`Makino ${position} ${face}: replacement stands and only paid cost reorders`, () => {
        const f = fixture([face, "DOWN", face]);
        const hand = f.state.players[0].hand.length;
        const deck = f.state.players[0].deck.length;
        f.play("ST13-012");
        f.choice("accept");
        f.choice(position === "TOP" ? "0" : "1");
        expect(f.state.players[0].life.map((c) => c.instanceId)).toEqual(
          position === "TOP" ? ["life-1", "life-2"] : ["life-0", "life-1"]
        );
        expect(f.state.players[0].hand).toHaveLength(
          hand + (face === "DOWN" ? 1 : 0)
        );
        expect(f.state.players[0].deck).toHaveLength(
          deck + (face === "UP" ? 1 : 0)
        );
        if (face === "UP") {
          expect(f.state.players[0].deck.at(-1)?.cardId).toBe(CARDS.TRIGGER.id);
          expect(f.state.players[0].deck.at(-1)?.instanceId).not.toBe(
            position === "TOP" ? "life-0" : "life-2"
          );
          expect(f.state.pendingPrompt).toBeNull();
        } else {
          expect(f.state.pendingPrompt?.options.promptType).toBe(
            "ARRANGE_TOP_CARDS"
          );
          f.arrange();
        }
        expect(f.state.effectStack).toHaveLength(0);
      });
    }
  }
});
