import { describe, expect, it } from "vitest";
import type { CardData, CardInstance, GameAction } from "../types.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { runPipeline } from "../engine/pipeline.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import {
  matchTriggersForEvent,
  registerCardEnteredField,
} from "../engine/triggers.js";
import { isCardNegated } from "../engine/modifiers.js";
import { hasValidEventPayload } from "../session/persisted-game-state.js";
import { hasEffectiveKeyword } from "../engine/keywords.js";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
  padChars,
} from "./helpers.js";

// Canonical docs/cards/OP-{12,14}.md; OP12 FAQ pp5–7, OP14 FAQ pp4–5.
// OP12's Garp FAQ misnumbers Leader Kuzan as OP12-043 (correct OP12-040).
// OP14 activation-cost inclusion is a user-authorized inference from that FAQ;
// retain COST provenance, do not claim a direct OP14 activation-cost ruling.
function fixture() {
  const db = createTestCardDb();
  let state = createBattleReadyState(db);
  state.players.forEach((p) => {
    p.characters = padChars([]);
    p.hand = [];
  });
  let serial = 0;
  function put(
    id: string,
    owner: 0 | 1 = 0,
    zone: CardInstance["zone"] = "CHARACTER",
    data: Partial<CardData> = {}
  ) {
    const schema = getEffectSchema(id);
    db.set(id, {
      ...(zone === "LEADER" ? CARDS.LEADER : CARDS.VANILLA),
      id,
      name: schema?.card_name ?? id,
      cost: 3,
      power: 4000,
      effectText:
        data.type === "Event"
          ? "[Main] Rest up to 1 of your opponent’s Characters."
          : "",
      ...data,
      ...(schema ? { effectSchema: schema } : {}),
    });
    const c: CardInstance = {
      instanceId: `${id}-${owner}-${zone}-${serial++}`,
      cardId: id,
      controller: owner,
      owner,
      zone,
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 0,
    };
    if (zone === "DECK") state.players[owner].deck.unshift(c);
    else if (zone === "LIFE")
      state.players[owner].life.unshift({ ...c, face: "DOWN" });
    else if (zone === "HAND") state.players[owner].hand.push(c);
    else if (zone === "LEADER") state.players[owner].leader = c;
    else if (zone === "STAGE") state.players[owner].stage = c;
    else
      state.players[owner].characters[
        state.players[owner].characters.findIndex((c) => !c)
      ] = c;
    if (["LEADER", "CHARACTER", "STAGE"].includes(zone))
      state = registerCardEnteredField(state, c, db.get(id)!);
    return c;
  }
  function act(
    action: GameAction,
    player: 0 | 1 = state.turn.activePlayerIndex
  ) {
    if (state.pendingPrompt) {
      const r = resumePromptLifecycle(state, action, db, {
        drainPregame: (s) => s,
        advanceStartOfTurn: (s) => s,
      });
      expect(r.responseRejected).toBe(false);
      state = r.state;
    } else {
      const r = runPipeline(state, action, db, player);
      expect(r.valid, r.error).toBe(true);
      state = r.state;
    }
  }
  function select(ids: string[]) {
    act({ type: "SELECT_TARGET", selectedInstanceIds: ids });
  }
  function accept() {
    if (state.pendingPrompt?.options.promptType === "OPTIONAL_EFFECT")
      act({ type: "PLAYER_CHOICE", choiceId: "accept" });
  }
  function play(c: CardInstance) {
    act({ type: "PLAY_CARD", cardInstanceId: c.instanceId });
  }
  function activate(c: CardInstance, effectId: string) {
    act({ type: "ACTIVATE_EFFECT", cardInstanceId: c.instanceId, effectId });
    accept();
  }
  function done() {
    expect(state.pendingPrompt).toBeNull();
    expect(state.effectStack).toHaveLength(0);
  }
  return {
    db,
    put,
    act,
    select,
    accept,
    play,
    activate,
    done,
    roundTrip() {
      state = JSON.parse(JSON.stringify(state));
    },
    get state() {
      return state;
    },
  };
}

describe("OPT-795 authored hand-trash watchers", () => {
  it.each(["OP14-045", "OP14-049"])(
    "%s gains Rush from actual effect hand trash",
    (id) => {
      const f = fixture();
      const watcher = f.put(id);
      f.put("discard-a", 0, "HAND");
      f.put("discard-b", 0, "HAND");
      f.play(f.put("OP12-046", 0, "HAND", { types: ["Navy"] }));
      f.done();
      expect(
        hasEffectiveKeyword(watcher, f.db.get(id)!, "RUSH", f.state, f.db)
      ).toBe(true);
    }
  );

  it("Kuzan draws the actual effect discard count and can trigger again", () => {
    const f = fixture();
    f.put("OP12-040", 0, "LEADER", { types: ["Navy"] });
    f.put("discard-a", 0, "HAND", { types: ["Straw Hat Crew"] });
    f.put("discard-b", 0, "HAND", { types: ["Straw Hat Crew"] });
    f.play(f.put("OP12-046", 0, "HAND", { types: ["Navy"] }));
    f.done();
    expect(f.state.players[0].hand).toHaveLength(2);
    // A second Navy effect in the same turn is legal: Kuzan has no OPT clause.
    f.play(f.put("OP12-046", 0, "HAND", { types: ["Navy"], cost: 0 }));
    f.done();
    expect(f.state.players[0].hand).toHaveLength(2);
    expect(
      f.state.eventLog.filter((e) => e.type === "CARD_DRAWN")
    ).toHaveLength(4);
  });
});

describe("OPT-795 cost, source, and continuation boundaries", () => {
  it.each([false, true])(
    "Garp activation-cost discard draws after Garp resolves (choice=%s)",
    (choice) => {
      const f = fixture();
      f.put("OP12-040", 0, "LEADER", { types: ["Navy"] });
      const discard = f.put("fodder", 0, "HAND");
      const playable = choice
        ? f.put("navy-play", 0, "HAND", { types: ["Navy"], color: ["Blue"] })
        : null;
      const drawn = f.put("navy-draw", 0, "DECK", {
        types: ["Navy"],
        color: ["Blue"],
      });
      f.play(f.put("OP12-056", 0, "HAND", { types: ["Navy"], cost: 0 }));
      f.accept();
      if (
        f.state.pendingPrompt?.options.promptType === "SELECT_TARGET" &&
        f.state.pendingPrompt.options.validTargets.includes(discard.instanceId)
      )
        f.select([discard.instanceId]);
      if (playable) {
        expect(
          f.state.players[0].hand.some((c) => c.cardId === drawn.cardId)
        ).toBe(false);
        expect(f.state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
        if (f.state.pendingPrompt?.options.promptType === "SELECT_TARGET")
          expect(f.state.pendingPrompt.options.validTargets).not.toContain(
            drawn.instanceId
          );
        f.roundTrip();
        f.select([playable.instanceId]);
      }
      f.done();
      expect(f.state.players[0].hand.map((c) => c.cardId)).toEqual([
        drawn.cardId,
      ]);
      const event = f.state.eventLog.find(
        (e) => e.type === "CARD_TRASHED" && e.payload.from === "HAND"
      );
      expect(event?.payload).toMatchObject({
        count: 1,
        movementCause: "COST",
        effectSourceCardId: "OP12-056",
        effectSourceController: 0,
      });
      expect(event && hasValidEventPayload(event.type, event.payload)).toBe(
        true
      );
      const drawIndex = f.state.eventLog.findIndex(
        (e) => e.type === "CARD_DRAWN"
      );
      if (playable)
        expect(drawIndex).toBeGreaterThan(
          f.state.eventLog.findIndex(
            (e) =>
              e.type === "CARD_PLAYED" && e.payload.cardId === playable.cardId
          )
        );
    }
  );

  it.each(["OP14-045", "OP14-049"])(
    "%s includes activation-cost hand trash (flagged OP14 inference)",
    (id) => {
      const f = fixture();
      const watcher = f.put(id);
      const discard = f.put("fodder", 0, "HAND");
      f.play(f.put("OP12-056", 0, "HAND", { types: ["Navy"] }));
      f.accept();
      if (f.state.pendingPrompt?.options.promptType === "SELECT_TARGET")
        f.select([discard.instanceId]);
      f.done();
      expect(
        hasEffectiveKeyword(watcher, f.db.get(id)!, "RUSH", f.state, f.db)
      ).toBe(true);
      expect(
        f.state.eventLog.find(
          (e) => e.type === "CARD_TRASHED" && e.payload.from === "HAND"
        )?.payload
      ).toMatchObject({ movementCause: "COST" });
    }
  );

  it("Kuzan rejects Navy discarded cards when the causal card is not Navy", () => {
    const f = fixture();
    f.put("OP12-040", 0, "LEADER", { types: ["Navy"] });
    f.put("navy-fodder-a", 0, "HAND", { types: ["Navy"] });
    f.put("navy-fodder-b", 0, "HAND", { types: ["Navy"] });
    f.play(f.put("EB01-027", 0, "HAND", { types: ["Baroque Works"] }));
    const navyDiscard = f.state.players[0].hand.find(
      (c) => c.cardId === "navy-fodder-a"
    )!;
    f.select([navyDiscard.instanceId]);
    f.done();
    expect(f.state.players[0].hand).toHaveLength(3);
    expect(
      f.state.eventLog.filter((e) => e.type === "CARD_DRAWN")
    ).toHaveLength(2);
  });

  it("Wadatsumi negates its printed restriction but preserves externally granted Rush", () => {
    const f = fixture();
    const leader = f.put("OP04-001", 0, "LEADER");
    const wadatsumi = f.put("OP14-056");
    f.activate(leader, "activate_draw_rush");
    f.select([wadatsumi.instanceId]);
    f.done();
    expect(
      hasEffectiveKeyword(
        wadatsumi,
        f.db.get(wadatsumi.cardId)!,
        "RUSH",
        f.state,
        f.db
      )
    ).toBe(true);
    f.put("fodder", 0, "HAND");
    f.play(f.put("OP12-046", 0, "HAND", { types: ["Navy"], cost: 0 }));
    f.done();
    expect(isCardNegated(wadatsumi, f.state, f.db)).toBe(true);
    expect(
      hasEffectiveKeyword(
        wadatsumi,
        f.db.get(wadatsumi.cardId)!,
        "RUSH",
        f.state,
        f.db
      )
    ).toBe(true);
  });

  it("Borsalino replacement discard belongs to your Navy effect, not the opposing removal", () => {
    const f = fixture();
    f.put("OP12-040", 1, "LEADER", { types: ["Navy"] });
    const borsalino = f.put("OP12-053", 1, "CHARACTER", {
      types: ["Navy"],
      cost: 1,
    });
    const discard = f.put("fodder", 1, "HAND");
    f.play(
      f.put("ST03-015", 0, "HAND", {
        type: "Event",
        cost: 0,
        effectText: "[Main] Return a Character.",
      })
    );
    f.select([borsalino.instanceId]);
    // Replacement prompts use a separate accept choice from optional autos.
    expect(f.state.pendingPrompt).not.toBeNull();
    f.act({ type: "PLAYER_CHOICE", choiceId: "accept" });
    if (f.state.pendingPrompt?.options.promptType === "SELECT_TARGET")
      f.select([discard.instanceId]);
    f.done();
    expect(
      f.state.players[1].characters.some(
        (c) => c?.instanceId === borsalino.instanceId
      )
    ).toBe(true);
    expect(f.state.players[1].hand).toHaveLength(1);
    expect(
      f.state.eventLog.find(
        (e) => e.type === "CARD_TRASHED" && e.payload.from === "HAND"
      )?.payload
    ).toMatchObject({
      movementCause: "EFFECT",
      effectSourceCardId: "OP12-053",
      effectSourceController: 1,
    });
  });
});

describe("OPT-795 opponent effects and illegal causes", () => {
  it.each(["OP14-045", "OP14-049"])(
    "%s gains Rush during the opponent's turn",
    (id) => {
      const f = fixture();
      const watcher = f.put(id, 1);
      const discard = f.put("fodder", 1, "HAND");
      f.play(f.put("OP01-114", 0, "HAND", { cost: 0 }));
      f.accept();
      if (f.state.pendingPrompt?.options.promptType === "SELECT_TARGET")
        f.select([discard.instanceId]);
      f.done();
      expect(
        hasEffectiveKeyword(watcher, f.db.get(id)!, "RUSH", f.state, f.db)
      ).toBe(true);
      expect(
        f.state.eventLog.find(
          (e) => e.type === "CARD_TRASHED" && e.payload.from === "HAND"
        )?.payload
      ).toMatchObject({ effectSourceController: 0, sourceController: 1 });
    }
  );

  it.each(["OP14-045", "OP14-049", "OP12-040"])(
    "%s observes Brook's opponent Trigger with correct causal controller",
    (id) => {
      const f = fixture();
      const watcher = f.put(id, 0, id === "OP12-040" ? "LEADER" : "CHARACTER", {
        power: 5000,
      });
      f.put("egghead-leader", 1, "LEADER", {
        type: "Leader",
        power: 5000,
        types: ["Egghead"],
      });
      f.state.players[1].life = [];
      f.put("OP09-111", 1, "LIFE", {
        types: ["Navy"],
        keywords: { ...CARDS.VANILLA.keywords, trigger: true },
        triggerText: "[Trigger] Your opponent trashes 2 cards from their hand.",
      });
      const hand = Array.from({ length: 6 }, (_, i) =>
        f.put(`fodder-${i}`, 0, "HAND")
      );
      const attacker = f.state.players[0].leader;
      f.act({
        type: "DECLARE_ATTACK",
        attackerInstanceId: attacker.instanceId,
        targetInstanceId: f.state.players[1].leader.instanceId,
      });
      f.act({ type: "PASS" });
      f.act({ type: "PASS" });
      f.act({ type: "REVEAL_TRIGGER", reveal: true }, 1);
      expect(f.state.pendingPrompt?.respondingPlayer).toBe(0);
      f.roundTrip();
      f.select(hand.slice(0, 2).map((c) => c.instanceId));
      f.done();
      expect(f.state.players[0].hand).toHaveLength(4);
      if (id !== "OP12-040")
        expect(
          hasEffectiveKeyword(watcher, f.db.get(id)!, "RUSH", f.state, f.db)
        ).toBe(true);
      else
        expect(
          f.state.eventLog.filter((e) => e.type === "CARD_DRAWN")
        ).toHaveLength(0);
      expect(
        f.state.eventLog.find(
          (e) => e.type === "CARD_TRASHED" && e.payload.from === "HAND"
        )?.payload
      ).toMatchObject({
        count: 2,
        movementCause: "EFFECT",
        effectSourceCardId: "OP09-111",
        effectSourceController: 1,
        sourceController: 0,
      });
    }
  );

  it("Life-to-hand damage does not grant Rush", () => {
    const f = fixture();
    const watcher = f.put("OP14-045", 1);
    f.state.players[1].life = [];
    f.put("life-card", 1, "LIFE");
    const attacker = f.state.players[0].leader;
    f.act({
      type: "DECLARE_ATTACK",
      attackerInstanceId: attacker.instanceId,
      targetInstanceId: f.state.players[1].leader.instanceId,
    });
    f.act({ type: "PASS" });
    f.act({ type: "PASS" });
    f.done();
    expect(f.state.players[1].hand).toHaveLength(1);
    expect(
      hasEffectiveKeyword(
        watcher,
        f.db.get(watcher.cardId)!,
        "RUSH",
        f.state,
        f.db
      )
    ).toBe(false);
  });

  it("symbol Counter discard does not activate hand-trash watchers", () => {
    const f = fixture();
    const watcher = f.put("OP14-045", 1);
    const counter = f.put("counter", 1, "HAND", {
      counter: 2000,
      types: ["Navy"],
    });
    const attacker = f.state.players[0].leader;
    f.act({
      type: "DECLARE_ATTACK",
      attackerInstanceId: attacker.instanceId,
      targetInstanceId: f.state.players[1].leader.instanceId,
    });
    f.act({ type: "PASS" });
    f.act(
      {
        type: "USE_COUNTER",
        cardInstanceId: counter.instanceId,
        counterTargetInstanceId: f.state.players[1].leader.instanceId,
      },
      1
    );
    expect(
      f.state.players[1].trash.some((c) => c.cardId === counter.cardId)
    ).toBe(true);
    expect(
      hasEffectiveKeyword(
        watcher,
        f.db.get(watcher.cardId)!,
        "RUSH",
        f.state,
        f.db
      )
    ).toBe(false);
  });

  it("routine Event disposal does not grant Rush", () => {
    const f = fixture();
    const watcher = f.put("OP14-045");
    f.play(
      f.put("ST03-015", 0, "HAND", {
        type: "Event",
        cost: 0,
        effectText: "[Main] Return a Character.",
      })
    );
    if (f.state.pendingPrompt?.options.promptType === "SELECT_TARGET")
      f.select([]);
    f.done();
    expect(f.state.players[0].trash.some((c) => c.cardId === "ST03-015")).toBe(
      true
    );
    expect(
      hasEffectiveKeyword(
        watcher,
        f.db.get(watcher.cardId)!,
        "RUSH",
        f.state,
        f.db
      )
    ).toBe(false);
  });
});

it("hand-trash matching rejects rule, field, zero-count, and unknown-provenance events", () => {
  const f = fixture();
  f.put("OP14-045");
  const payload = {
    from: "HAND",
    count: 1,
    reason: "effect",
    movementCause: "EFFECT" as const,
    effectSourceCardId: "source",
    effectSourceController: 0 as const,
  };
  for (const changed of [
    { movementCause: "RULE" as const },
    { from: "CHARACTER" },
    { count: 0 },
    { movementCause: undefined },
    { effectSourceCardId: undefined },
  ]) {
    expect(
      matchTriggersForEvent(
        f.state,
        {
          type: "CARD_TRASHED",
          playerIndex: 0,
          timestamp: 0,
          payload: { ...payload, ...changed },
        },
        f.db
      )
    ).toHaveLength(0);
  }
  expect(
    matchTriggersForEvent(
      f.state,
      { type: "CARD_TRASHED", playerIndex: 0, timestamp: 0, payload },
      f.db
    )
  ).toHaveLength(1);
});

it("generic TRASH_CARD hand movement triggers the authored Rush watcher once", () => {
  const f = fixture();
  const watcher = f.put("OP14-045");
  f.play(
    f.put("OP04-083", 0, "HAND", { cost: 0, types: ["Revolutionary Army"] })
  );
  if (f.state.pendingPrompt?.options.promptType === "SELECT_TARGET")
    f.select(f.state.players[0].hand.map((c) => c.instanceId));
  f.done();
  expect(f.state.players[0].hand).toHaveLength(0);
  expect(
    hasEffectiveKeyword(
      watcher,
      f.db.get(watcher.cardId)!,
      "RUSH",
      f.state,
      f.db
    )
  ).toBe(true);
  expect(
    f.state.eventLog.filter(
      (e) => e.type === "CARD_TRASHED" && e.payload.from === "HAND"
    )
  ).toHaveLength(1);
});

it("a multi-step activation cost retains the Navy source after that source leaves", () => {
  const f = fixture();
  f.put("OP12-040", 0, "LEADER", { types: ["Navy"] });
  const discard = f.put("fodder", 0, "HAND");
  const source = f.put("navy-cost-source", 0, "CHARACTER", {
    types: ["Navy"],
    effectSchema: {
      card_id: "navy-cost-source",
      card_name: "Navy cost source",
      card_type: "Character",
      effects: [
        {
          id: "costs",
          category: "activate",
          trigger: { keyword: "ACTIVATE_MAIN" },
          flags: { optional: true },
          costs: [
            { type: "TRASH_SELF" },
            { type: "TRASH_FROM_HAND", amount: 1 },
          ],
          actions: [{ type: "DRAW", params: { amount: 1 } }],
        },
      ],
    },
  });
  f.activate(source, "costs");
  f.roundTrip();
  f.select([discard.instanceId]);
  f.done();
  expect(
    f.state.players[0].characters.some((c) => c?.cardId === source.cardId)
  ).toBe(false);
  expect(f.state.players[0].hand).toHaveLength(2);
  expect(
    f.state.eventLog.find(
      (e) => e.type === "CARD_TRASHED" && e.payload.from === "HAND"
    )?.payload
  ).toMatchObject({
    effectSourceCardId: source.cardId,
    effectSourceController: 0,
    movementCause: "COST",
  });
});

it.each(["Kuzan", "Kuroobi"])(
  "Kuzan preserves the event count when %s resolves first through ordering and reconnect",
  (first) => {
    const f = fixture();
    f.put("OP12-040", 0, "LEADER", { types: ["Navy"] });
    const watcher = f.put("OP14-045");
    const hand = Array.from({ length: 3 }, (_, i) =>
      f.put(`fodder-${i}`, 0, "HAND")
    );
    f.play(f.put("OP12-046", 0, "HAND", { types: ["Navy"] }));
    f.select(hand.slice(0, 2).map((c) => c.instanceId));
    expect(f.state.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");
    if (f.state.pendingPrompt?.options.promptType !== "PLAYER_CHOICE")
      throw new Error("Expected trigger order prompt");
    const choice = f.state.pendingPrompt.options.choices.find((c) =>
      c.label.startsWith(`${first}:`)
    )!;
    f.roundTrip();
    f.act({ type: "PLAYER_CHOICE", choiceId: choice.id });
    f.done();
    expect(f.state.players[0].hand).toHaveLength(3);
    expect(
      hasEffectiveKeyword(
        watcher,
        f.db.get(watcher.cardId)!,
        "RUSH",
        f.state,
        f.db
      )
    ).toBe(true);
  }
);

it("two hand-cost steps preserve both actual counts after source departure and reconnect", () => {
  const f = fixture();
  f.put("OP12-040", 0, "LEADER", { types: ["Navy"] });
  for (let i = 0; i < 10; i++) f.put(`deck-${i}`, 0, "DECK");
  const hand = Array.from({ length: 4 }, (_, i) =>
    f.put(`discard-${i}`, 0, "HAND")
  );
  const source = f.put("navy-sequential-cost", 0, "CHARACTER", {
    types: ["Navy"],
    effectSchema: {
      card_id: "navy-sequential-cost",
      card_name: "source",
      card_type: "Character",
      effects: [
        {
          id: "costs",
          category: "activate",
          trigger: { keyword: "ACTIVATE_MAIN" },
          flags: { optional: true },
          costs: [
            { type: "TRASH_SELF" },
            { type: "TRASH_FROM_HAND", amount: 1 },
            { type: "TRASH_FROM_HAND", amount: 2 },
          ],
          actions: [{ type: "DRAW", params: { amount: 1 } }],
        },
      ],
    },
  });
  f.activate(source, "costs");
  f.roundTrip();
  f.select([hand[0].instanceId]);
  expect(f.state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
  f.roundTrip();
  f.select(hand.slice(1, 3).map((c) => c.instanceId));
  while (f.state.pendingPrompt?.options.promptType === "PLAYER_CHOICE") {
    const p = f.state.pendingPrompt.options;
    f.roundTrip();
    f.act({ type: "PLAYER_CHOICE", choiceId: p.choices[0].id });
  }
  f.done();
  expect(f.state.players[0].hand).toHaveLength(5);
  const events = f.state.eventLog.filter(
    (e) => e.type === "CARD_TRASHED" && e.payload.from === "HAND"
  );
  expect(events.map((e) => e.payload.count)).toEqual([1, 2]);
  expect(
    events.every((e) => e.payload.effectSourceCardId === source.cardId)
  ).toBe(true);
  expect(f.state.eventLog.filter((e) => e.type === "CARD_DRAWN")).toHaveLength(
    4
  );
});
