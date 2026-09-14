import type { Cost } from "../engine/effect-types.js";
import { describe, expect, it } from "vitest";
import type { CardData, CardInstance, GameAction } from "../types.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { runPipeline } from "../engine/pipeline.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { filterEventForPlayer } from "../engine/visibility.js";
import { visibleStateForSpectator } from "../session/visibility.js";
import { hasValidEventPayload } from "../session/persisted-game-state.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
  padChars,
} from "./helpers.js";

// Printed clauses: docs/cards/OP-{07,08,09,10,13,16}.md; official
// qa_op16.md Buggy FAQ (Slave Arrow activation cost; no rule overflow).
// Authored watchers and removal cards use the generated production registry.
function fixture() {
  const db = createTestCardDb();
  let state = createBattleReadyState(db);
  state.players.forEach((p) => {
    p.characters = padChars([]);
    p.hand = [];
  });
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
      instanceId: `${id}-${owner}-${zone}`,
      cardId: id,
      controller: owner,
      owner,
      zone,
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 0,
    };
    if (zone === "HAND") state.players[owner].hand.push(c);
    else if (zone === "LEADER") state.players[owner].leader = c;
    else if (zone === "STAGE") state.players[owner].stage = c;
    else
      state.players[owner].characters[
        state.players[owner].characters.findIndex((c) => !c)
      ] = c;
    if (zone !== "HAND")
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

describe("OPT-794 removal watchers through authored pipeline", () => {
  it.each(["ST03-015", "OP04-056", "ST01-015"])(
    "Hancock draws for own removal by %s",
    (id) => {
      const f = fixture();
      f.put("OP07-038", 0, "LEADER");
      const target = f.put("victim", 1, "CHARACTER", { cost: 1, power: 1000 });
      f.play(
        f.put(id, 0, "HAND", {
          type: "Event",
          cost: 0,
          effectText: "[Main] Remove a Character.",
        })
      );
      f.select([target.instanceId]);
      f.accept();
      f.done();
      expect(f.state.players[0].hand).toHaveLength(1);
    }
  );

  it("Hancock accepts later removal after declining and then respects once per turn", () => {
    const f = fixture();
    f.put("OP07-038", 0, "LEADER");
    for (let i = 0; i < 3; i++) {
      const target = f.put(`victim${i}`, 1);
      f.play(
        f.put("ST03-015", 0, "HAND", {
          type: "Event",
          cost: 0,
          effectText: "[Main] Return a Character.",
        })
      );
      f.select([target.instanceId]);
      if (i === 0) f.act({ type: "PLAYER_CHOICE", choiceId: "skip" });
      else if (i === 1) f.accept();
      f.done();
      expect(f.state.players[0].hand).toHaveLength(i === 0 ? 0 : 1);
    }
  });

  it.each(["ST03-015", "OP04-056", "ST01-015", "OP03-123"])(
    "Oro Jackson observes opponent %s with Roger substring",
    (id) => {
      const f = fixture();
      f.put("OP13-078", 1, "STAGE", { type: "Stage" });
      const target = f.put("victim", 1, "CHARACTER", {
        types: ["Former Roger Pirates"],
        cost: 1,
        power: 1000,
      });
      const before = f.state.players[1].donCostArea.length;
      f.play(
        f.put(id, 0, "HAND", {
          type: id === "OP03-123" ? "Character" : "Event",
          cost: 0,
          effectText: "[Main] Remove a Character.",
        })
      );
      f.select([target.instanceId]);
      if (id === "OP03-123")
        f.act({
          type: "PLAYER_CHOICE",
          choiceId: `field-life:${JSON.stringify([target.instanceId])}:BOTTOM`,
        });
      f.accept();
      // ADD_DON up to one is an explicit quantity choice.
      if (f.state.pendingPrompt?.options.promptType === "PLAYER_CHOICE") {
        f.act({ type: "PLAYER_CHOICE", choiceId: "choose-value:1" });
      }
      f.done();
      expect(f.state.players[1].donCostArea).toHaveLength(before + 1);
      expect(f.state.players[1].donCostArea.at(-1)?.state).toBe("RESTED");
    }
  );

  it.each([0, 1])("Buggy own bounce with DON %i", (don) => {
    const f = fixture();
    const buggy = f.put("OP16-041", 0, "LEADER");
    if (don)
      f.act({
        type: "ATTACH_DON",
        targetInstanceId: buggy.instanceId,
        count: 1,
      });
    const target = f.put("prisoner", 0, "CHARACTER", { types: ["Impel Down"] });
    const prisoner = f.put("OP16-042", 0, "HAND");
    f.play(
      f.put("ST03-015", 0, "HAND", {
        type: "Event",
        cost: 0,
        effectText: "[Main] Return a Character.",
      })
    );
    f.select([target.instanceId]);
    f.roundTrip();
    if (don) {
      f.accept();
      f.select([prisoner.instanceId]);
    }
    f.done();
    expect(
      f.state.players[0].characters.some((c) => c?.cardId === "OP16-042")
    ).toBe(Boolean(don));
  });

  it("Shakuyaku forces opponent choice after bounce and rests after continuation", () => {
    const f = fixture();
    const watcher = f.put("OP08-046");
    for (let i = 0; i < 4; i++) f.put(`hand${i}`, 1, "HAND");
    const target = f.put("victim", 1);
    f.play(
      f.put("ST03-015", 0, "HAND", {
        type: "Event",
        cost: 0,
        effectText: "[Main] Return a Character.",
      })
    );
    f.select([target.instanceId]);
    f.roundTrip();
    expect(f.state.pendingPrompt?.respondingPlayer).toBe(1);
    f.select([f.state.players[1].hand[0].instanceId]);
    f.done();
    expect(f.state.players[1].hand).toHaveLength(4);
    expect(
      f.state.players[0].characters.find(
        (c) => c?.instanceId === watcher.instanceId
      )?.state
    ).toBe("RESTED");
  });

  it.each([0, 1])("Moby Dick draws then places at destination %i", (choice) => {
    const f = fixture();
    f.put("OP08-056", 0, "STAGE", { type: "Stage" });
    const target = f.put("victim", 0, "CHARACTER", {
      types: ["Former Whitebeard Pirates"],
    });
    f.play(
      f.put("OP04-056", 0, "HAND", {
        type: "Event",
        cost: 0,
        effectText: "[Main] Remove a Character.",
      })
    );
    f.select([target.instanceId]);
    f.roundTrip();
    expect(f.state.players[0].hand).toHaveLength(1);
    const drawn = f.state.players[0].hand[0].cardId;
    f.act({ type: "PLAYER_CHOICE", choiceId: String(choice) });
    f.done();
    expect(f.state.players[0].hand).toHaveLength(0);
    expect(
      choice === 0
        ? f.state.players[0].deck[0].cardId
        : f.state.players[0].deck.at(-1)?.cardId
    ).toBe(drawn);
  });

  it("Sunny pays its rest cost on opponent bottomdeck", () => {
    const f = fixture();
    f.put("OP09-080", 1, "STAGE", { type: "Stage" });
    const target = f.put("victim", 1, "CHARACTER", {
      types: ["Straw Hat Crew"],
    });
    const before = f.state.players[1].donCostArea.length;
    f.play(
      f.put("OP04-056", 0, "HAND", {
        type: "Event",
        cost: 0,
        effectText: "[Main] Remove a Character.",
      })
    );
    f.select([target.instanceId]);
    f.accept();
    if (f.state.pendingPrompt?.options.promptType === "PLAYER_CHOICE")
      f.act({ type: "PLAYER_CHOICE", choiceId: "choose-value:1" });
    f.done();
    expect(f.state.players[1].stage?.state).toBe("RESTED");
    expect(f.state.players[1].donCostArea).toHaveLength(before + 1);
  });

  it.each(["OP04-056", "ST01-015"])(
    "Usopp draws once for opponent %s",
    (id) => {
      const f = fixture();
      f.put("OP10-042", 1, "LEADER");
      const target = f.put("victim", 1, "CHARACTER", {
        types: ["Dressrosa"],
        power: 1000,
      });
      f.play(
        f.put(id, 0, "HAND", {
          type: "Event",
          cost: 0,
          effectText: "[Main] Remove a Character.",
        })
      );
      f.select([target.instanceId]);
      f.accept();
      f.done();
      expect(f.state.players[1].hand).toHaveLength(1);
    }
  );

  it.each([
    ["OP07-038", "LEADER", 0, 1, [], 6],
    ["OP07-038", "LEADER", 1, 1, [], 0],
    ["OP08-046", "CHARACTER", 0, 1, [], 0],
    ["OP08-056", "STAGE", 0, 1, ["Whitebeard Pirates"], 0],
    ["OP08-056", "STAGE", 0, 0, ["Other"], 0],
    ["OP09-080", "STAGE", 1, 1, ["Other"], 0],
    ["OP09-080", "STAGE", 0, 0, ["Straw Hat Crew"], 0],
    ["OP10-042", "LEADER", 1, 1, ["Other"], 0],
    ["OP10-042", "LEADER", 1, 1, ["Dressrosa"], 6],
    ["OP13-078", "STAGE", 1, 1, ["Other"], 0],
    ["OP13-078", "STAGE", 0, 0, ["Roger Pirates"], 0],
    ["OP16-041", "LEADER", 0, 0, ["Other"], 0],
  ] as const)(
    "%s rejects ineligible removal: owner %i target %i trait %j hand %i",
    (id, zone, owner, targetOwner, traits, hand) => {
      const f = fixture();
      const watcher = f.put(id, owner, zone, {
        type:
          zone === "STAGE"
            ? "Stage"
            : zone === "LEADER"
              ? "Leader"
              : "Character",
      });
      if (id === "OP16-041")
        f.act({
          type: "ATTACH_DON",
          targetInstanceId: watcher.instanceId,
          count: 1,
        });
      for (let i = 0; i < hand; i++) f.put(`hand${i}`, owner, "HAND");
      const target = f.put("victim", targetOwner, "CHARACTER", {
        types: [...traits],
      });
      const before = f.state.players[owner].hand.length;
      f.play(
        f.put("OP04-056", 0, "HAND", {
          type: "Event",
          cost: 0,
          effectText: "[Main] Remove a Character.",
        })
      );
      f.select([target.instanceId]);
      f.done();
      expect(f.state.players[owner].hand).toHaveLength(before);
    }
  );

  it("Shakuyaku cannot activate its own hidden-zone departure", () => {
    const f = fixture();
    const target = f.put("OP08-046");
    for (let i = 0; i < 5; i++) f.put(`hand${i}`, 1, "HAND");
    f.play(
      f.put("ST03-015", 0, "HAND", {
        type: "Event",
        cost: 0,
        effectText: "[Main] Return a Character.",
      })
    );
    f.select([target.instanceId]);
    f.done();
    expect(f.state.players[1].hand).toHaveLength(5);
  });

  it("field to Life persists provenance while player and spectator events hide identities", () => {
    const f = fixture();
    const target = f.put("secret-victim", 1);
    f.play(f.put("OP03-123", 0, "HAND", { type: "Character", cost: 0 }));
    f.select([target.instanceId]);
    f.roundTrip();
    f.act({
      type: "PLAYER_CHOICE",
      choiceId: `field-life:${JSON.stringify([target.instanceId])}:TOP`,
    });
    f.done();
    const event = f.state.eventLog.find(
      (e) => e.type === "CARD_ADDED_TO_LIFE"
    )!;
    expect(event).toBeDefined();
    expect(hasValidEventPayload(event.type, event.payload)).toBe(true);
    expect(event.payload).toMatchObject({
      sourceZone: "CHARACTER",
      sourceController: 1,
      causingController: 0,
      movementCause: "EFFECT",
    });
    const projected = filterEventForPlayer(event, 0);
    const spectator = visibleStateForSpectator(f.state, f.db).eventLog.find(
      (e) => e.type === "CARD_ADDED_TO_LIFE"
    );
    for (const view of [projected, spectator]) {
      expect(view).toBeDefined();
      expect(JSON.stringify(view)).not.toContain("secret-victim");
      expect(view?.payload).toHaveProperty("newCardInstanceId", "hidden");
    }
  });

  it("Buggy ignores sixth-Character rule overflow", () => {
    const f = fixture();
    const buggy = f.put("OP16-041", 0, "LEADER");
    f.act({ type: "ATTACH_DON", targetInstanceId: buggy.instanceId, count: 1 });
    const victim = f.put("victim", 0, "CHARACTER", { types: ["Impel Down"] });
    for (let i = 0; i < 4; i++) f.put(`filler${i}`);
    f.put("OP16-042", 0, "HAND");
    const replacement = f.put("new-character", 0, "HAND", { cost: 0 });
    f.act({
      type: "PLAY_CARD",
      cardInstanceId: replacement.instanceId,
      position: 0,
    });
    f.done();
    expect(
      f.state.players[0].trash.some((c) => c.cardId === victim.cardId)
    ).toBe(true);
    expect(f.state.players[0].hand.some((c) => c.cardId === "OP16-042")).toBe(
      true
    );
  });

  // Supplemental source isolates effect trash, which is not K.O.; the watcher
  // remains the authored production schema, and execution enters runPipeline.
  it("Hancock draws once after effect trash without a KO event", () => {
    const f = fixture();
    f.put("OP07-038", 0, "LEADER");
    const target = f.put("victim", 1);
    const source = f.put("trash-source", 0, "CHARACTER", {
      effectSchema: {
        effects: [
          {
            id: "trash",
            category: "activate",
            trigger: { keyword: "ACTIVATE_MAIN" },
            actions: [
              {
                type: "TRASH_CARD",
                target: {
                  type: "CHARACTER",
                  controller: "OPPONENT",
                  count: { exact: 1 },
                },
              },
            ],
          },
        ],
      },
    });
    f.activate(source, "trash");
    f.select([target.instanceId]);
    f.accept();
    f.done();
    expect(f.state.players[0].hand).toHaveLength(1);
    expect(
      f.state.eventLog.filter(
        (e) => e.type === "CARD_TRASHED" && e.payload.cardId === "victim"
      )
    ).toHaveLength(1);
    expect(f.state.eventLog.filter((e) => e.type === "CARD_KO")).toHaveLength(
      0
    );
  });

  it("Usopp draws for battle KO independently of opponent effect branch", () => {
    const f = fixture();
    f.put("OP10-042", 1, "LEADER");
    const victim = f.put("victim", 1, "CHARACTER", {
      types: ["Dressrosa"],
      power: 1000,
    });
    victim.state = "RESTED";
    f.act({
      type: "DECLARE_ATTACK",
      attackerInstanceId: f.state.players[0].leader.instanceId,
      targetInstanceId: victim.instanceId,
    });
    f.act({ type: "PASS" }, 1);
    f.act({ type: "PASS" }, 1);
    f.accept();
    f.done();
    expect(f.state.players[1].hand).toHaveLength(1);
  });

  it("Buggy follows the official Slave Arrow FAQ through the activation-cost prompt", () => {
    const f = fixture();
    const buggy = f.put("OP16-041", 1, "LEADER");
    const victim = f.put("impel", 1, "CHARACTER", {
      types: ["Impel Down"],
      cost: 2,
    });
    const prisoner = f.put("OP16-042", 1, "HAND");
    const counter = f.put("OP07-056", 1, "HAND", {
      type: "Event",
      cost: 0,
      effectText: "[Counter] Return your Character: Give +4000 power.",
    });
    buggy.attachedDon = [
      {
        instanceId: "buggy-don",
        state: "RESTED",
        attachedTo: buggy.instanceId,
      },
    ];
    f.act({
      type: "DECLARE_ATTACK",
      attackerInstanceId: f.state.players[0].leader.instanceId,
      targetInstanceId: buggy.instanceId,
    });
    f.act({ type: "PASS" }, 1);
    f.act(
      {
        type: "USE_COUNTER_EVENT",
        cardInstanceId: counter.instanceId,
        counterTargetInstanceId: buggy.instanceId,
      },
      1
    );
    f.accept();
    f.select([victim.instanceId]);
    f.roundTrip();
    f.select([buggy.instanceId]);
    f.accept();
    f.select([prisoner.instanceId]);
    f.done();
    expect(
      f.state.players[1].characters.some((c) => c?.cardId === "OP16-042")
    ).toBe(true);
  });

  it.each([
    "RETURN_OWN_CHARACTER_TO_HAND",
    "PLACE_OWN_CHARACTER_TO_DECK",
    "TRASH_OWN_CHARACTER",
    "KO_OWN_CHARACTER",
    "ADD_OWN_CHARACTER_TO_LIFE",
  ] as const)("Hancock observes activation cost %s", (type) => {
    const f = fixture();
    f.put("OP07-038", 0, "LEADER");
    const target = f.put("victim", 0, "CHARACTER", {
      name: "victim",
      power: 6000,
    });
    const source = f.put("cost-source", 0, "CHARACTER", {
      effectSchema: {
        effects: [
          {
            id: "pay",
            category: "activate",
            trigger: { keyword: "ACTIVATE_MAIN" },
            costs: [{ type, amount: 1, filter: { name: "victim" } } as Cost],
            actions: [],
            flags: { optional: true },
          },
        ],
      },
    });
    f.activate(source, "pay");
    f.select([target.instanceId]);
    f.accept();
    f.done();
    // Bounce itself adds the victim as well as Hancock's draw.
    expect(f.state.players[0].hand).toHaveLength(
      type === "RETURN_OWN_CHARACTER_TO_HAND" ? 2 : 1
    );
    const event = f.state.eventLog.find(
      (e) => "movementCause" in e.payload && e.payload.movementCause === "COST"
    );
    expect(event).toBeDefined();
    expect(hasValidEventPayload(event!.type, event!.payload)).toBe(true);
    if (type === "KO_OWN_CHARACTER")
      expect(event?.payload).toMatchObject({
        preKO_basePower: 6000,
        preKO_donCount: 0,
      });
  });
});
