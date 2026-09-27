import { describe, expect, it } from "vitest";
import type { CardData, CardInstance, GameAction } from "../types.js";
import type { Cost, EffectBlock } from "../engine/effect-types.js";
import { EFFECT_SOURCE_SNAPSHOT_REF } from "../engine/effect-types.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { runPipeline } from "../engine/pipeline.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import { hasEffectiveKeyword } from "../engine/keywords.js";
import { handTrashEvent } from "../engine/hand-trash.js";
import { finishReplacedLifeCost } from "../engine/effect-resolver/cost/replaced.js";
import { resolverExecutionServices } from "../engine/effect-resolver/index.js";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
  padChars,
} from "./helpers.js";

// OPT-857: the ST13-003 replaced-Life-cost terminal path must admit canonical
// hand-trash cost events like its committed-cost siblings (OPT-795): complete
// causal attribution, then scan them so OP14-045 Kuroobi's watcher queues in
// the same batch as the effect's waiting auto effects (rule 8-6), not after.
// No authored card combines these costs today; the block below is synthetic.
const COSTS: Cost[] = [
  { type: "TRASH_FROM_HAND", amount: 1 },
  { type: "LIFE_TO_HAND", amount: 1 },
];
const KUROOBI_TRIGGER = "OP14-045_hand_trash_rush";

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
    zone: "LEADER" | "CHARACTER" | "HAND",
    data: Partial<CardData> = {}
  ) {
    const schema = getEffectSchema(id);
    db.set(id, {
      ...(zone === "LEADER" ? CARDS.LEADER : CARDS.VANILLA),
      id,
      name: schema?.card_name ?? id,
      cost: 0,
      ...data,
      ...(schema ? { effectSchema: schema } : {}),
    });
    const card: CardInstance = {
      instanceId: `${id}-${serial++}`,
      cardId: id,
      controller: 0,
      owner: 0,
      zone,
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 0,
    };
    if (zone === "HAND") state.players[0].hand.push(card);
    else if (zone === "LEADER") state.players[0].leader = card;
    else
      state.players[0].characters[
        state.players[0].characters.findIndex((c) => !c)
      ] = card;
    if (zone !== "HAND")
      state = registerCardEnteredField(state, card, db.get(id)!);
    return card;
  }
  function act(action: GameAction) {
    if (state.pendingPrompt) {
      // Durable Object storage clones the prompt/frame graph between requests.
      state = structuredClone(state);
      const r = resumePromptLifecycle(state, action, db, {
        drainPregame: (s) => s,
        advanceStartOfTurn: (s) => s,
      });
      expect(r.responseRejected, JSON.stringify(state.pendingPrompt)).toBe(
        false
      );
      state = r.state;
    } else {
      const r = runPipeline(state, action, db, 0);
      expect(r.valid, r.error).toBe(true);
      state = r.state;
    }
  }
  function choices() {
    const options = state.pendingPrompt?.options;
    expect(options?.promptType).toBe("PLAYER_CHOICE");
    if (options?.promptType !== "PLAYER_CHOICE") throw new Error("no choice");
    return options.choices.map((c) => c.id);
  }
  function choose(fragment: string) {
    const id = choices().find((c) => c.includes(fragment));
    expect(id, `${fragment} in ${choices().join(", ")}`).toBeDefined();
    act({ type: "PLAYER_CHOICE", choiceId: id! });
  }
  function selectHandCost(instanceId: string) {
    const options = state.pendingPrompt?.options;
    expect(options?.promptType).toBe("SELECT_TARGET");
    if (options?.promptType === "SELECT_TARGET")
      expect(options.validTargets).toContain(instanceId);
    act({ type: "SELECT_TARGET", selectedInstanceIds: [instanceId] });
  }

  // ST13-003 replaces the Life-to-hand cost: face-up Life goes to deck bottom.
  put("ST13-003", "LEADER");
  state.players[0].life = [
    { cardId: CARDS.TRIGGER.id, instanceId: "life-0", face: "UP" },
  ];
  const kuroobi = put("OP14-045", "CHARACTER");
  const fodder = put("fodder", "HAND");
  put("spare", "HAND");

  return {
    db,
    put,
    act,
    choices,
    choose,
    selectHandCost,
    fodder,
    rush: () =>
      hasEffectiveKeyword(kuroobi, db.get("OP14-045")!, "RUSH", state, db),
    handTrash: () =>
      state.eventLog.filter(
        (e) => e.type === "CARD_TRASHED" && e.payload?.from === "HAND"
      ),
    get state() {
      return state;
    },
  };
}

type Fixture = ReturnType<typeof fixture>;

function expectReplacedOnce(f: Fixture, sourceCardId: string) {
  expect(f.state.players[0].life).toHaveLength(0);
  expect(
    f.state.eventLog.filter((e) => e.type === "CARD_REMOVED_FROM_LIFE")
  ).toHaveLength(1);
  const trash = f.handTrash();
  expect(trash).toHaveLength(1);
  expect(trash[0].payload).toMatchObject({
    count: 1,
    movementCause: "COST",
    effectSourceCardId: sourceCardId,
    effectSourceController: 0,
  });
}

function expectSameBatch(f: Fixture) {
  // The watcher waits beside the sibling and the turn player orders both
  // (rule 8-6), instead of the sibling resolving alone first.
  const ids = f.choices();
  expect(ids).toHaveLength(2);
  expect(ids.some((c) => c.includes(":sibling:"))).toBe(true);
  expect(ids.some((c) => c.includes(KUROOBI_TRIGGER))).toBe(true);
  expect(f.rush()).toBe(false);
}

describe("OPT-857 replaced Life cost admits hand-trash cost watchers", () => {
  for (const source of ["on-field", "departed"] as const) {
    it(`Character source (${source}): Kuroobi joins the waiting sibling's batch with source attribution`, () => {
      const f = fixture();
      const keyword = source === "departed" ? "ON_KO" : "ON_PLAY";
      const effects: EffectBlock[] = [
        {
          id: "paid",
          category: "auto",
          trigger: { keyword },
          costs: COSTS,
          actions: [{ type: "DRAW", params: { amount: 5 } }],
        },
        {
          id: "sibling",
          category: "auto",
          trigger: { keyword },
          actions: [{ type: "DRAW", params: { amount: 1 } }],
        },
      ];
      if (source === "departed") {
        f.put("PARENT", "CHARACTER", { effectSchema: { effects } });
        const killer = f.put("KILLER", "CHARACTER", {
          effectSchema: {
            effects: [
              {
                id: "kill",
                category: "activate",
                trigger: { keyword: "ACTIVATE_MAIN" },
                actions: [
                  {
                    type: "KO",
                    target: {
                      type: "CHARACTER",
                      controller: "SELF",
                      count: { exact: 1 },
                      filter: { name: "PARENT" },
                    },
                  },
                ],
              },
            ],
          },
        });
        f.act({
          type: "ACTIVATE_EFFECT",
          cardInstanceId: killer.instanceId,
          effectId: "kill",
        });
        expect(
          f.state.players[0].trash.some((c) => c.cardId === "PARENT")
        ).toBe(true);
      } else {
        const parent = f.put("PARENT", "HAND", { effectSchema: { effects } });
        f.act({ type: "PLAY_CARD", cardInstanceId: parent.instanceId });
      }
      const hand = f.state.players[0].hand.length;
      f.choose(":paid:");
      f.selectHandCost(f.fodder.instanceId);

      expectSameBatch(f);
      expectReplacedOnce(f, "PARENT");

      f.choose(KUROOBI_TRIGGER);
      expect(f.rush()).toBe(true);
      // Paid 1 hand card; the post-colon Draw 5 never resolved; sibling drew 1.
      expect(f.state.players[0].hand).toHaveLength(hand);
      expect(f.state.pendingPrompt).toBeNull();
      expect(f.state.effectStack).toHaveLength(0);
      expectReplacedOnce(f, "PARENT");
    });
  }

  it("Event source (in trash): Kuroobi joins the Life-removal watcher's batch with source attribution", () => {
    // The replaced cost's own CARD_REMOVED_FROM_LIFE watcher is scanned by the
    // terminal path; before OPT-857 it resolved alone and Kuroobi's hand-trash
    // watcher only fired in a later batch.
    const f = fixture();
    f.put("LIFEWATCH", "CHARACTER", {
      effectSchema: {
        effects: [
          {
            id: "life_watch",
            category: "auto",
            trigger: {
              event: "CARD_REMOVED_FROM_LIFE",
              filter: { controller: "SELF" },
            },
            actions: [{ type: "DRAW", params: { amount: 1 } }],
          },
        ],
      },
    });
    const event = f.put("EVENT", "HAND", {
      type: "Event",
      effectText: "[Main] You may trash 1 card and add 1 Life to hand: Draw 5.",
      effectSchema: {
        effects: [
          {
            id: "event-main",
            category: "auto",
            trigger: { keyword: "MAIN_EVENT" },
            flags: { optional: true },
            costs: COSTS,
            actions: [{ type: "DRAW", params: { amount: 5 } }],
          },
        ],
      },
    });
    f.act({ type: "PLAY_CARD", cardInstanceId: event.instanceId });
    const hand = f.state.players[0].hand.length;
    expect(f.state.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
    f.act({ type: "PLAYER_CHOICE", choiceId: "accept" });
    f.selectHandCost(f.fodder.instanceId);

    const ids = f.choices();
    expect(ids).toHaveLength(2);
    expect(ids.some((c) => c.includes(KUROOBI_TRIGGER))).toBe(true);
    expect(ids.some((c) => c.includes(":life_watch:"))).toBe(true);
    expect(f.rush()).toBe(false);
    expectReplacedOnce(f, "EVENT");

    f.choose(KUROOBI_TRIGGER);
    expect(f.rush()).toBe(true);
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.state.effectStack).toHaveLength(0);
    expect(f.state.players[0].trash.some((c) => c.cardId === "EVENT")).toBe(
      true
    );
    // Paid 1 hand card; Draw 5 never resolved; the Life watcher drew exactly once.
    expect(f.state.players[0].hand).toHaveLength(hand);
    expectReplacedOnce(f, "EVENT");
  });

  it("completes an unattributed hand-trash cost from the frame snapshot after the source departed", () => {
    // Every current TRASH_FROM_HAND payment is a selection that already carries
    // the frame snapshot; this pins the terminal path's own completion step.
    const f = fixture();
    const departed: CardInstance = {
      instanceId: "departed-source",
      cardId: "PARENT",
      controller: 0,
      owner: 0,
      zone: "CHARACTER",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 0,
    };
    f.db.set("PARENT", { ...CARDS.VANILLA, id: "PARENT", name: "PARENT" });
    const unattributed = handTrashEvent(f.state, 0, 1, "COST", undefined, 0);
    expect(unattributed.payload?.effectSourceCardId).toBeUndefined();
    const block: EffectBlock = {
      id: "paid",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      costs: COSTS,
      actions: [{ type: "DRAW", params: { amount: 5 } }],
    };
    const result = finishReplacedLifeCost(
      f.state,
      [unattributed],
      block,
      departed.instanceId,
      0,
      [],
      f.db,
      resolverExecutionServices,
      new Map([
        [
          EFFECT_SOURCE_SNAPSHOT_REF,
          { targetInstanceIds: [], count: 0, sourceCardSnapshot: departed },
        ],
      ])
    );
    const published = result.events.find(
      (e) => e.type === "CARD_TRASHED" && e.payload?.from === "HAND"
    );
    expect(published?.payload).toMatchObject({
      movementCause: "COST",
      effectSourceCardId: "PARENT",
      effectSourceController: 0,
    });
    expect(published?.propagation?.triggerScanned).toBe(true);
    const kuroobi = result.state.players[0].characters.find(
      (c) => c?.cardId === "OP14-045"
    )!;
    expect(
      hasEffectiveKeyword(
        kuroobi,
        f.db.get("OP14-045")!,
        "RUSH",
        result.state,
        f.db
      )
    ).toBe(true);
  });
});
