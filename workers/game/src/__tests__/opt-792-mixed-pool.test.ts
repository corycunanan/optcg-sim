/**
 * OPT-792 — Target.mixed_pool: one selection pool spanning Characters,
 * Leaders, Stages and cost-area DON!! with a shared total count.
 *
 * Expected values come from the printed text (docs/cards) and FAQs:
 * - OP06-035 "Rest up to a total of 2 of your opponent's Characters or DON!!
 *   cards." (OP-06.md:238)
 * - OP09-036 "If you have 2 or more rested Characters, rest up to 1 of your
 *   opponent's DON!! cards or Characters with a cost of 6 or less."
 *   (OP-09.md:251) — the cost cap binds Characters only; DON!! has no cost.
 * - EB03-012 "Rest up to 1 of your opponent's DON!! cards or {Animal} or
 *   {SMILE} type Characters with a cost of 3 or less." (EB-03.md:84)
 * - OP07-026 "Up to 1 of your opponent's rested Character or DON!! cards will
 *   not become active in your opponent's next Refresh Phase." (OP-07.md:190;
 *   qa_op07.md: active or given DON!! cannot be chosen)
 * - OP14-024 "[On K.O.] Rest up to 1 of your opponent's cards." (OP-14.md:166;
 *   qa_op14_eb04.md: 1 active Leader, Character, Stage or DON!! card)
 * - ST02-008 FAQ (qa_st-01-st-04.md:132): an already rested DON!! cannot be
 *   chosen to rest — the DON!! pool of a rest is active DON!! only.
 */

import { describe, expect, it } from "vitest";
import type {
  CardData,
  CardInstance,
  GameAction,
  GameState,
} from "../types.js";
import type { Action, Target } from "../engine/effect-types.js";
import { runPipeline } from "../engine/pipeline.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { getEffectSchema, validateEffectSchema } from "../engine/schema-registry.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import {
  computeAllValidTargets,
  validateTargetConstraints,
} from "../engine/effect-resolver/target-resolver.js";
import { executeEffectAction } from "../engine/effect-resolver/resolver.js";
import { payCosts } from "../engine/effect-resolver/cost/payment.js";
import { applyCostSelection } from "../engine/effect-resolver/cost/resume.js";
import { handleRedistributeDon } from "../engine/effect-resolver/resume/target.js";
import { movedDonIds, releaseDonEffects } from "../engine/don-area-effects.js";
import { resolveEffect } from "../engine/effect-resolver/index.js";
import {
  SessionRepository,
  type SessionStorage,
} from "../session/persistence.js";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
  padChars,
} from "./helpers.js";

const SCOPE_CARDS = [
  ["OP06-020", null],
  ["OP06-035", 7],
  ["OP09-036", 6],
  ["OP12-037", 3],
  ["EB03-012", 2],
  ["EB03-061", 6],
  ["OP07-026", 3],
  ["ST26-002", 3],
  ["OP15-023", 5],
  ["OP15-032", 4],
  // Fixture cost 2 so EB01-049 T-Bone ("K.O. up to 1 of your opponent's
  // Characters with a cost of 2 or less") can K.O. it through the pipeline.
  ["OP14-024", 2],
  ["EB01-049", 2],
  ["OP15-026", 2],
  ["OP02-085", 3],
  ["OP15-023", 2],
] as const;

function fixture() {
  const db = createTestCardDb();
  for (const [id, cost] of SCOPE_CARDS) {
    const schema = getEffectSchema(id)!;
    db.set(id, {
      ...CARDS.VANILLA,
      id,
      name: schema.card_name!,
      cost,
      type: schema.card_type as CardData["type"],
      effectSchema: schema,
    });
  }
  // Character pool fixtures with explicit costs and traits.
  db.set("COST-7", { ...CARDS.VANILLA, id: "COST-7", name: "Seven", cost: 7 });
  db.set("COST-3", { ...CARDS.VANILLA, id: "COST-3", name: "Three", cost: 3 });
  db.set("ANIMAL-3", {
    ...CARDS.VANILLA,
    id: "ANIMAL-3",
    name: "Animal Three",
    cost: 3,
    types: ["Animal"],
  });

  let state = createBattleReadyState(db);
  state.players[0].characters = padChars([]);
  state.players[1].characters = padChars([]);
  let seq = 0;

  function put(
    id: string,
    controller: 0 | 1,
    zone: CardInstance["zone"] = "CHARACTER",
    cardState: CardInstance["state"] = "ACTIVE"
  ) {
    const c: CardInstance = {
      ...state.players[controller].leader,
      cardId: id,
      instanceId: `${id}-${controller}-${zone}-${seq++}`,
      controller,
      owner: controller,
      zone,
      state: cardState,
      attachedDon: [],
      turnPlayed: 0,
    };
    if (zone === "HAND") state.players[controller].hand.push(c);
    else if (zone === "STAGE") {
      state.players[controller].stage = c;
    } else {
      state.players[controller].characters[
        state.players[controller].characters.indexOf(null)
      ] = c;
      state = registerCardEnteredField(state, c, db.get(id)!);
    }
    return c;
  }

  function resume(action: GameAction) {
    return resumePromptLifecycle(state, action, db, {
      drainPregame: (s) => s,
      advanceStartOfTurn: (s) => s,
    });
  }

  function act(
    action: GameAction,
    player: 0 | 1 = state.turn.activePlayerIndex
  ) {
    if (state.pendingPrompt) {
      const r = resume(action);
      expect(r.responseRejected).not.toBe(true);
      state = { ...r.state, pendingPrompt: r.state.pendingPrompt ?? null };
    } else {
      const r = runPipeline(state, action, db, player);
      expect(r.valid, r.error).toBe(true);
      state = { ...r.state, pendingPrompt: r.pendingPrompt ?? null };
    }
  }

  function play(id: string) {
    const c = put(id, state.turn.activePlayerIndex, "HAND");
    act({ type: "PLAY_CARD", cardInstanceId: c.instanceId });
    return c;
  }

  function donOf(player: 0 | 1, state_: "ACTIVE" | "RESTED", n: number) {
    const area = state.players[player].donCostArea;
    for (let i = 0; i < n && i < area.length; i++) area[i].state = state_;
  }

  return {
    db,
    put,
    act,
    play,
    donOf,
    resume,
    select: (ids: string[]) =>
      act({ type: "SELECT_TARGET", selectedInstanceIds: ids }),
    get state() {
      return state;
    },
    set state(next: GameState) {
      state = next;
    },
  };
}

type Fixture = ReturnType<typeof fixture>;

function actionOf(cardId: string, effectIndex = 0, actionIndex = 0): Action {
  const schema = getEffectSchema(cardId)!;
  const effect = schema.effects.filter((e) => "actions" in e && e.actions)[
    effectIndex
  ] as { actions: Action[] };
  return effect.actions[actionIndex];
}

function targetOf(cardId: string, effectIndex = 0, actionIndex = 0): Target {
  return actionOf(cardId, effectIndex, actionIndex).target!;
}

function valid(f: Fixture, target: Target, controller: 0 | 1 = 0): string[] {
  return computeAllValidTargets(
    f.state,
    target,
    controller,
    f.db,
    "source",
    new Map()
  );
}

function char(f: Fixture, c: CardInstance) {
  return f.state.players[c.controller].characters.find(
    (x) => x?.instanceId === c.instanceId
  );
}

function promptValidTargets(f: Fixture): string[] {
  const options = f.state.pendingPrompt?.options;
  expect(options?.promptType).toBe("SELECT_TARGET");
  return options?.promptType === "SELECT_TARGET" ? options.validTargets : [];
}

const oppDonIds = (f: Fixture) =>
  f.state.players[1].donCostArea.map((d) => d.instanceId);

// ─── Resolver union and per-type scoping ─────────────────────────────────────

describe("OPT-792 resolver union", () => {
  it("OP09-036 unions active opponent DON!! with cost ≤6 Characters only", () => {
    const f = fixture();
    const cheap = f.put("COST-3", 1);
    const pricey = f.put("COST-7", 1);
    const ownChar = f.put("COST-3", 0);
    f.donOf(1, "RESTED", 1);
    const ids = valid(f, targetOf("OP09-036"));
    const activeOppDon = f.state.players[1].donCostArea
      .filter((d) => d.state === "ACTIVE")
      .map((d) => d.instanceId);
    expect(new Set(ids)).toEqual(new Set([...activeOppDon, cheap.instanceId]));
    expect(ids).not.toContain(pricey.instanceId);
    expect(ids).not.toContain(ownChar.instanceId);
    expect(ids).not.toContain(f.state.players[1].leader.instanceId);
    expect(ids).not.toContain(f.state.players[1].donCostArea[0].instanceId);
    for (const d of f.state.players[0].donCostArea)
      expect(ids).not.toContain(d.instanceId);
  });

  it("a Character cost cap does not drop DON!! (OP09-036, every Character costs 7)", () => {
    const f = fixture();
    f.put("COST-7", 1);
    f.put("COST-7", 1);
    expect(new Set(valid(f, targetOf("OP09-036")))).toEqual(
      new Set(oppDonIds(f))
    );
  });

  it("EB03-012 excludes non-{Animal}/{SMILE} Characters but offers DON!!", () => {
    const f = fixture();
    const animal = f.put("ANIMAL-3", 1);
    const plain = f.put("COST-3", 1);
    const ids = valid(f, targetOf("EB03-012"));
    expect(ids).toContain(animal.instanceId);
    expect(ids).not.toContain(plain.instanceId);
    for (const id of oppDonIds(f)) expect(ids).toContain(id);
  });

  it("a DON!!-only state filter does not drop Characters (OP06-035, all DON!! rested)", () => {
    const f = fixture();
    const active = f.put("COST-7", 1);
    const rested = f.put("COST-3", 1, "CHARACTER", "RESTED");
    f.donOf(1, "RESTED", 6);
    expect(new Set(valid(f, targetOf("OP06-035")))).toEqual(
      new Set([active.instanceId, rested.instanceId])
    );
  });

  it("OP07-026 offers rested Characters and rested DON!! — no Leader, no active or given DON!!", () => {
    const f = fixture();
    const restedChar = f.put("COST-3", 1, "CHARACTER", "RESTED");
    const activeChar = f.put("COST-3", 1);
    f.state.players[1].leader.state = "RESTED";
    f.donOf(1, "RESTED", 2);
    restedChar.attachedDon = [
      { instanceId: "given-don", state: "RESTED", attachedTo: restedChar.instanceId },
    ];
    const ids = valid(f, targetOf("OP07-026"));
    expect(new Set(ids)).toEqual(
      new Set([
        restedChar.instanceId,
        f.state.players[1].donCostArea[0].instanceId,
        f.state.players[1].donCostArea[1].instanceId,
      ])
    );
    expect(ids).not.toContain(activeChar.instanceId);
    expect(ids).not.toContain("given-don");
  });

  describe("OP14-024 'your opponent's cards' (Leader, Character, Stage or DON!!)", () => {
    const target = () => targetOf("OP14-024", 1);
    function emptyOpponent(f: Fixture) {
      f.state.players[0].leader.state = "RESTED";
      f.donOf(0, "RESTED", 8);
    }

    it("Stage-only field offers the Stage", () => {
      const f = fixture();
      emptyOpponent(f);
      const stage = f.put(CARDS.STAGE.id, 0, "STAGE");
      expect(valid(f, target(), 1)).toEqual([stage.instanceId]);
    });

    it("DON!!-only field offers the active DON!!", () => {
      const f = fixture();
      emptyOpponent(f);
      f.state.players[0].donCostArea[3].state = "ACTIVE";
      expect(valid(f, target(), 1)).toEqual([
        f.state.players[0].donCostArea[3].instanceId,
      ]);
    });

    it("offers all four types together, active only", () => {
      const f = fixture();
      const stage = f.put(CARDS.STAGE.id, 0, "STAGE");
      const active = f.put("COST-3", 0);
      const rested = f.put("COST-3", 0, "CHARACTER", "RESTED");
      f.donOf(0, "RESTED", 5);
      const ids = valid(f, target(), 1);
      const activeDon = f.state.players[0].donCostArea
        .filter((d) => d.state === "ACTIVE")
        .map((d) => d.instanceId);
      expect(new Set(ids)).toEqual(
        new Set([
          f.state.players[0].leader.instanceId,
          active.instanceId,
          stage.instanceId,
          ...activeDon,
        ])
      );
      expect(ids).not.toContain(rested.instanceId);
      expect(activeDon).toHaveLength(3);
    });

    it("validates zero selection and one shared maximum across the union", () => {
      const f = fixture();
      const stage = f.put(CARDS.STAGE.id, 0, "STAGE");
      const don = f.state.players[0].donCostArea[0].instanceId;
      const check = (ids: string[]) =>
        validateTargetConstraints(ids, target(), f.state, f.db, new Map(), {
          controller: 1,
          sourceCardInstanceId: "source",
        });
      expect(check([])).toBe(true);
      expect(check([stage.instanceId])).toBe(true);
      expect(check([don])).toBe(true);
      expect(check([stage.instanceId, don])).toBe(false);
    });
  });

  it("total_count is enforced even when the parent count is absent", () => {
    const f = fixture();
    const noParentCount: Target = { ...targetOf("OP06-035"), count: undefined };
    const [a, b, c] = oppDonIds(f);
    const check = (ids: string[]) =>
      validateTargetConstraints(ids, noParentCount, f.state, f.db, new Map());
    expect(check([a, b])).toBe(true);
    expect(check([a, b, c])).toBe(false);
  });

  it("stays fast with large zones (10 DON!! + 5 Characters, count 2)", () => {
    const f = fixture();
    for (let i = 0; i < 5; i++) f.put("COST-3", 1);
    f.state.players[1].donCostArea = Array.from({ length: 10 }, (_, i) => ({
      instanceId: `big-don-${i}`,
      state: "ACTIVE" as const,
      attachedTo: null,
    }));
    const target = targetOf("OP06-035");
    const started = performance.now();
    let ids: string[] = [];
    for (let i = 0; i < 200; i++) ids = valid(f, target);
    const elapsed = performance.now() - started;
    expect(ids).toHaveLength(15);
    // 200 resolutions; generous CI bound (typical: a few ms total).
    expect(elapsed).toBeLessThan(500);
  });
});

// ─── Schema lint (primary type decision) ─────────────────────────────────────

describe("OPT-792 schema lint", () => {
  function lint(target: Target): string[] {
    return validateEffectSchema({
      card_id: "TEST-792",
      card_name: "Test",
      card_type: "Character",
      effects: [
        {
          id: "e",
          category: "auto",
          trigger: { keyword: "ON_PLAY" },
          actions: [{ type: "SET_REST", target }],
        },
      ],
    });
  }
  const pool = {
    types: ["CHARACTER", "DON_IN_COST_AREA"],
    total_count: { up_to: 1 },
  } satisfies Target["mixed_pool"];

  it("rejects a mixed_pool target without a primary type (pre-fix OP09-036 shape)", () => {
    expect(
      lint({ controller: "OPPONENT", count: { up_to: 1 }, mixed_pool: pool })
    ).toEqual([
      expect.stringContaining("[C10] A mixed_pool target must declare a primary 'type'"),
    ]);
  });

  it("rejects a primary type outside the pool and a parent filter", () => {
    const errors = lint({
      type: "LEADER_OR_CHARACTER",
      controller: "OPPONENT",
      count: { up_to: 1 },
      filter: { cost_max: 6 },
      mixed_pool: pool,
    });
    expect(errors.join("\n")).toContain("must be one of mixed_pool.types");
    expect(errors.join("\n")).toContain("not target.filter");
  });

  it("rejects mismatched counts, unsupported types, and non-state DON!! filters", () => {
    const errors = lint({
      type: "CHARACTER",
      controller: "OPPONENT",
      count: { up_to: 2 },
      mixed_pool: {
        types: ["CHARACTER", "DON_IN_COST_AREA", "CARD_IN_HAND"],
        total_count: { up_to: 1 },
        filters: { DON_IN_COST_AREA: { cost_max: 3 } },
      },
    }).join("\n");
    expect(errors).toContain("Parent count must equal mixed_pool.total_count");
    expect(errors).toContain("'CARD_IN_HAND' is not supported in a mixed pool");
    expect(errors).toContain("DON_IN_COST_AREA.cost_max");
  });

  it("accepts every authored mixed pool", () => {
    for (const [id] of SCOPE_CARDS) {
      expect(validateEffectSchema(getEffectSchema(id)!), id).toEqual([]);
    }
  });
});

// ─── Real pipeline ───────────────────────────────────────────────────────────

describe("OPT-792 pipeline", () => {
  function playLuffy(f: Fixture) {
    f.put("COST-3", 0, "CHARACTER", "RESTED");
    f.put("COST-3", 0, "CHARACTER", "RESTED");
    return f.play("OP09-036");
  }

  it("OP09-036 offers opponent DON!! and cost ≤6 Characters, and rests the chosen DON!!", () => {
    const f = fixture();
    const cheap = f.put("COST-3", 1);
    const pricey = f.put("COST-7", 1);
    cheap.attachedDon = [
      { instanceId: "given-don", state: "ACTIVE", attachedTo: cheap.instanceId },
    ];
    playLuffy(f);
    const ids = promptValidTargets(f);
    expect(new Set(ids)).toEqual(new Set([...oppDonIds(f), cheap.instanceId]));
    expect(ids).not.toContain(pricey.instanceId);
    const options = f.state.pendingPrompt!.options;
    expect(options.promptType === "SELECT_TARGET" && options.countMax).toBe(1);

    const chosen = f.state.players[1].donCostArea[2].instanceId;
    const logBefore = f.state.eventLog.length;
    f.select([chosen]);
    expect(f.state.pendingPrompt).toBeNull();
    for (const d of f.state.players[1].donCostArea)
      expect(d.state).toBe(d.instanceId === chosen ? "RESTED" : "ACTIVE");
    expect(char(f, cheap)?.state).toBe("ACTIVE");
    expect(char(f, cheap)?.attachedDon[0].state).toBe("ACTIVE");
    const events = f.state.eventLog.slice(logBefore);
    expect(events).toContainEqual(
      expect.objectContaining({ type: "DON_STATE_CHANGED", playerIndex: 1 })
    );
  });

  it("OP09-036 rests a chosen Character", () => {
    const f = fixture();
    const cheap = f.put("COST-3", 1);
    playLuffy(f);
    f.select([cheap.instanceId]);
    expect(char(f, cheap)?.state).toBe("RESTED");
    expect(f.state.players[1].donCostArea.every((d) => d.state === "ACTIVE")).toBe(true);
  });

  it.each([
    ["1 Character + 1 DON!!", (c: CardInstance[], d: string[]) => [c[0].instanceId, d[0]]],
    ["2 DON!!", (_c: CardInstance[], d: string[]) => [d[0], d[1]]],
    ["2 Characters", (c: CardInstance[]) => [c[0].instanceId, c[1].instanceId]],
  ])("OP06-035 rests %s from one shared count", (_label, pick) => {
    const f = fixture();
    const chars = [f.put("COST-3", 1), f.put("COST-7", 1)];
    const lifeBefore = f.state.players[0].life.length;
    f.play("OP06-035");
    const dons = oppDonIds(f);
    expect(new Set(promptValidTargets(f))).toEqual(
      new Set([...chars.map((c) => c.instanceId), ...dons])
    );
    const chosen = pick(chars, dons);
    f.select(chosen);
    expect(f.state.pendingPrompt).toBeNull();
    for (const c of chars)
      expect(char(f, c)?.state).toBe(chosen.includes(c.instanceId) ? "RESTED" : "ACTIVE");
    for (const d of f.state.players[1].donCostArea)
      expect(d.state).toBe(chosen.includes(d.instanceId) ? "RESTED" : "ACTIVE");
    expect(f.state.players[0].life.length).toBe(lifeBefore - 1);
  });

  it("OP06-035 accepts zero selection and still adds 1 Life card to hand", () => {
    const f = fixture();
    f.put("COST-3", 1);
    const lifeBefore = f.state.players[0].life.length;
    f.play("OP06-035");
    f.select([]);
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.state.players[1].donCostArea.every((d) => d.state === "ACTIVE")).toBe(true);
    expect(f.state.players[0].life.length).toBe(lifeBefore - 1);
  });

  it("OP06-035 rejects 3 selections across the union without mutating state", () => {
    const f = fixture();
    const c = f.put("COST-3", 1);
    f.play("OP06-035");
    const [d0, d1] = oppDonIds(f);
    const rejected = f.resume({
      type: "SELECT_TARGET",
      selectedInstanceIds: [c.instanceId, d0, d1],
    });
    expect(rejected.responseRejected).toBe(true);
    expect(rejected.state).toEqual(f.state);
  });

  it.each([
    ["your own DON!!", (f: Fixture) => f.state.players[0].donCostArea[0].instanceId],
    ["the opponent Leader", (f: Fixture) => f.state.players[1].leader.instanceId],
    ["an opponent DON!! given to a Character", () => "given-don"],
  ])("OP06-035 rejects %s (outside the union) through the resume path", (_l, id) => {
    const f = fixture();
    const c = f.put("COST-3", 1);
    c.attachedDon = [
      { instanceId: "given-don", state: "ACTIVE", attachedTo: c.instanceId },
    ];
    f.play("OP06-035");
    const bad = id(f);
    expect(promptValidTargets(f)).not.toContain(bad);
    const rejected = f.resume({ type: "SELECT_TARGET", selectedInstanceIds: [bad] });
    expect(rejected.responseRejected).toBe(true);
    expect(rejected.state).toEqual(f.state);
    // The same prompt still resolves normally afterwards.
    f.select([oppDonIds(f)[0]]);
    expect(f.state.players[1].donCostArea[0].state).toBe("RESTED");
  });

  it("the mixed prompt survives a JSON save/load round trip and resolves exactly once", async () => {
    const f = fixture();
    const c = f.put("COST-3", 1);
    f.play("OP06-035");
    const before = promptValidTargets(f);
    f.state = await roundTrip(f.state, f.db);
    expect(promptValidTargets(f)).toEqual(before);
    const d = oppDonIds(f)[4];
    const lifeBefore = f.state.players[0].life.length;
    f.select([c.instanceId, d]);
    expect(f.state.pendingPrompt).toBeNull();
    expect(char(f, c)?.state).toBe("RESTED");
    expect(f.state.players[1].donCostArea[4].state).toBe("RESTED");
    expect(f.state.players[0].life.length).toBe(lifeBefore - 1);
    const replay = f.resume({
      type: "SELECT_TARGET",
      selectedInstanceIds: [c.instanceId, d],
    });
    expect(replay.responseRejected).toBe(true);
    expect(f.state.players[0].life.length).toBe(lifeBefore - 1);
  });

  it("OP07-026 keeps the chosen rested DON!! rested through the opponent's next Refresh Phase only", () => {
    const f = fixture();
    f.donOf(1, "RESTED", 3);
    const restedChar = f.put("COST-3", 1, "CHARACTER", "RESTED");
    f.play("OP07-026");
    const held = f.state.players[1].donCostArea[1].instanceId;
    expect(promptValidTargets(f)).toContain(held);
    f.select([held]);
    expect(f.state.prohibitions).toContainEqual(
      expect.objectContaining({ prohibitionType: "CANNOT_REFRESH", appliesTo: [held] })
    );

    f.state = advanceThroughRefreshOf(f, 1);
    for (const d of f.state.players[1].donCostArea)
      expect(d.state, d.instanceId).toBe(d.instanceId === held ? "RESTED" : "ACTIVE");
    expect(char(f, restedChar)?.state).toBe("ACTIVE");

    f.state = advanceThroughRefreshOf(f, 0);
    f.state = advanceThroughRefreshOf(f, 1);
    const heldAfter = f.state.players[1].donCostArea.find((d) => d.instanceId === held);
    expect(heldAfter?.state).toBe("ACTIVE");
  });

  it("OP14-024 On K.O. rests one active opponent Stage from the four-type pool", () => {
    const f = fixture();
    const kinemon = f.put("OP14-024", 1);
    const stage = f.put(CARDS.STAGE.id, 0, "STAGE");
    const ownChar = f.put("COST-3", 0);
    f.play("EB01-049");
    f.select([kinemon.instanceId]);
    const ids = promptValidTargets(f);
    expect(f.state.pendingPrompt?.respondingPlayer).toBe(1);
    expect(ids).toContain(f.state.players[0].leader.instanceId);
    expect(ids).toContain(stage.instanceId);
    expect(ids).toContain(ownChar.instanceId);
    for (const d of f.state.players[0].donCostArea.filter((x) => x.state === "ACTIVE"))
      expect(ids).toContain(d.instanceId);
    const rejected = f.resume({
      type: "SELECT_TARGET",
      selectedInstanceIds: [stage.instanceId, ownChar.instanceId],
    });
    expect(rejected.responseRejected).toBe(true);
    f.select([stage.instanceId]);
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.state.players[0].stage?.state).toBe("RESTED");
    expect(char(f, ownChar)?.state).toBe("ACTIVE");
  });
});

// ─── Rule 3-1-6-1: DON!! area moves shed id-keyed effects ────────────────────
// "When a DON!! card moves from one area to another, all effects that were
// previously applied to that DON!! card are removed." (rule_comprehensive.md:289)

describe("OPT-792 DON!! refresh hold across area moves (rule 3-1-6-1)", () => {
  function holdRestedOpponentDon(f: Fixture) {
    f.donOf(1, "RESTED", 1);
    const held = oppDonIds(f)[0];
    f.play("OP07-026");
    f.select([held]);
    expect(f.state.prohibitions.some((p) => p.appliesTo.includes(held))).toBe(true);
    return held;
  }
  function answerPrompts(f: Fixture) {
    for (let guard = 0; guard < 6 && f.state.pendingPrompt; guard++) {
      const options = f.state.pendingPrompt.options;
      if (options.promptType === "OPTIONAL_EFFECT") f.act({ type: "PLAYER_CHOICE", choiceId: "accept" });
      else if (options.promptType === "PLAYER_CHOICE")
        f.act({ type: "PLAYER_CHOICE", choiceId: options.choices[0].id });
      else if (options.promptType === "SELECT_TARGET")
        f.select(options.validTargets.slice(0, Math.max(1, options.countMin)));
      else throw new Error(`unexpected prompt ${options.promptType}`);
    }
    expect(f.state.pendingPrompt).toBeNull();
  }

  it("Jango giving the held DON!! to a Character ends the hold; it refreshes active", () => {
    const f = fixture();
    const jango = f.put("OP15-026", 0);
    const c = f.put("COST-3", 1);
    const held = holdRestedOpponentDon(f);
    f.act({
      type: "ACTIVATE_EFFECT",
      cardInstanceId: jango.instanceId,
      effectId: "OP15-026_activate_trash",
    });
    answerPrompts(f);
    expect(char(f, c)?.attachedDon.map((d) => d.instanceId)).toContain(held);
    expect(f.state.prohibitions.some((p) => p.appliesTo.includes(held))).toBe(false);

    f.state = advanceThroughRefreshOf(f, 1);
    expect(f.state.players[1].donCostArea.find((d) => d.instanceId === held)?.state).toBe(
      "ACTIVE"
    );
  });

  it("Magellan returning the held DON!! to the deck ends the hold even after it is re-added", () => {
    const f = fixture();
    // Only the held DON!! is on the opponent's field and their DON!! deck is
    // empty, so the DON!! phase re-adds that same instance.
    const held = holdRestedOpponentDon(f);
    f.state.players[1].donCostArea = f.state.players[1].donCostArea.filter(
      (d) => d.instanceId === held
    );
    f.state.players[1].donDeck = [];
    f.play("OP02-085");
    answerPrompts(f);
    expect(f.state.players[1].donDeck.map((d) => d.instanceId)).toEqual([held]);
    expect(f.state.prohibitions.some((p) => p.appliesTo.includes(held))).toBe(false);

    f.state = advanceThroughRefreshOf(f, 1); // refresh, draw
    for (let i = 0; i < 2 && f.state.turn.phase !== "MAIN"; i++) {
      const r = runPipeline(f.state, { type: "ADVANCE_PHASE" }, f.db, 1);
      expect(r.valid, r.error).toBe(true);
      f.state = r.state;
    }
    const back = f.state.players[1].donCostArea.find((d) => d.instanceId === held);
    expect(back).toBeDefined();
    back!.state = "RESTED"; // spent on B's turn

    f.state = advanceThroughRefreshOf(f, 0);
    f.state = advanceThroughRefreshOf(f, 1);
    expect(f.state.players[1].donCostArea.find((d) => d.instanceId === held)?.state).toBe(
      "ACTIVE"
    );
  });

  it("Magellan: the opponent chooses to return the held DON!! (choice resume path)", () => {
    const f = fixture();
    const held = holdRestedOpponentDon(f);
    // One held rested + one active DON!!: a real choice, so the DON!! owner
    // is prompted (OP16-074 FAQ) and the return resolves on resume.
    const active = f.state.players[1].donCostArea.find((d) => d.state === "ACTIVE")!;
    f.state.players[1].donCostArea = f.state.players[1].donCostArea.filter(
      (d) => d.instanceId === held || d.instanceId === active.instanceId
    );
    f.play("OP02-085");
    for (let guard = 0; guard < 4; guard++) {
      const options = f.state.pendingPrompt?.options;
      if (options?.promptType === "OPTIONAL_EFFECT") {
        f.act({ type: "PLAYER_CHOICE", choiceId: "accept" });
      } else break;
    }
    const options = f.state.pendingPrompt?.options;
    expect(options?.promptType).toBe("PLAYER_CHOICE");
    const rested =
      options?.promptType === "PLAYER_CHOICE"
        ? options.choices.find((c) => c.label === "Return 1 rested DON!!")
        : undefined;
    expect(rested).toBeDefined();
    f.act({ type: "PLAYER_CHOICE", choiceId: rested!.id }, 1);
    expect(f.state.players[1].donDeck.map((d) => d.instanceId)).toContain(held);
    expect(f.state.prohibitions.some((p) => p.appliesTo.includes(held))).toBe(false);
  });

  it("releases at the cost-selection step (GIVE_DON cost) — defensive, seeded effect", () => {
    const f = fixture();
    const don = f.state.players[0].donCostArea.find((d) => d.state === "ACTIVE")!;
    f.state = {
      ...f.state,
      prohibitions: [
        {
          id: "seeded-don-hold",
          sourceCardInstanceId: "seed",
          sourceEffectBlockId: "",
          prohibitionType: "CANNOT_REFRESH",
          scope: {},
          duration: { type: "SKIP_NEXT_REFRESH" },
          controller: 1,
          appliesTo: [don.instanceId],
          usesRemaining: null,
        } as GameState["prohibitions"][number],
      ],
    };
    const leader = f.state.players[0].leader.instanceId;
    const applied = applyCostSelection(
      f.state,
      {
        type: "GIVE_DON",
        amount: 1,
        target: { type: "LEADER_OR_CHARACTER", controller: "SELF", count: { exact: 1 } },
      },
      [leader],
      0,
      f.db,
      "source"
    );
    expect(applied.state.players[0].leader.attachedDon.map((d) => d.instanceId)).toContain(
      don.instanceId
    );
    expect(applied.state.prohibitions.some((p) => p.appliesTo.includes(don.instanceId))).toBe(
      false
    );
  });

  it("releases on a REDISTRIBUTE_DON resume transfer — defensive, seeded effect", () => {
    const f = fixture();
    const c = f.put("COST-3", 0);
    const moving = { instanceId: "moving-don", state: "ACTIVE" as const, attachedTo: f.state.players[0].leader.instanceId };
    f.state.players[0].leader.attachedDon = [moving];
    f.state = {
      ...f.state,
      prohibitions: [
        {
          id: "seeded-don-hold",
          sourceCardInstanceId: "seed",
          sourceEffectBlockId: "",
          prohibitionType: "CANNOT_REFRESH",
          scope: {},
          duration: { type: "SKIP_NEXT_REFRESH" },
          controller: 1,
          appliesTo: [moving.instanceId],
          usesRemaining: null,
        } as GameState["prohibitions"][number],
      ],
    };
    const result = handleRedistributeDon(
      f.state,
      {
        type: "REDISTRIBUTE_DON",
        transfers: [
          {
            fromCardInstanceId: f.state.players[0].leader.instanceId,
            donInstanceId: moving.instanceId,
            toCardInstanceId: c.instanceId,
          },
        ],
      },
      {
        effectSourceInstanceId: "source",
        controller: 0,
        pausedAction: { type: "REDISTRIBUTE_DON", params: { amount: 1 } },
        remainingActions: [],
        resultRefs: [],
        validTargets: [c.instanceId],
      },
      new Map(),
      []
    );
    expect(result?.kind).toBe("fallthrough");
    const next = result?.kind === "fallthrough" ? result.state : f.state;
    expect(char({ ...f, state: next } as Fixture, c)?.attachedDon.map((d) => d.instanceId)).toContain(
      moving.instanceId
    );
    expect(next.prohibitions.some((p) => p.appliesTo.includes(moving.instanceId))).toBe(false);
  });

  it("releases at the effect-action step (return to deck) without the pipeline backstop", () => {
    const f = fixture();
    const held = holdRestedOpponentDon(f);
    f.state.players[1].donCostArea = f.state.players[1].donCostArea.filter(
      (d) => d.instanceId === held
    );
    const result = executeEffectAction(
      f.state,
      { type: "RETURN_DON_TO_DECK", params: { amount: 1 } },
      f.state.players[1].leader.instanceId,
      1,
      f.db,
      new Map()
    );
    expect(result.state.players[1].donDeck.map((d) => d.instanceId)).toContain(held);
    expect(result.state.prohibitions.some((p) => p.appliesTo.includes(held))).toBe(false);
  });

  it("releases at the cost-payment step (DON!! −1) without the pipeline backstop", () => {
    const f = fixture();
    const held = holdRestedOpponentDon(f);
    f.state.players[1].donCostArea = f.state.players[1].donCostArea.filter(
      (d) => d.instanceId === held
    );
    const paid = payCosts(f.state, [{ type: "DON_MINUS", amount: 1 }], 1, f.db);
    expect(paid?.state.players[1].donDeck.map((d) => d.instanceId)).toContain(held);
    expect(paid?.state.prohibitions.some((p) => p.appliesTo.includes(held))).toBe(false);
  });

  it("releases at the pipeline execute step (player attaches the DON!!)", () => {
    // Defensive backstop: no printed hold targets a DON!! its controller can
    // attach, so seed an id-keyed effect on player 0's next attachable DON!!.
    const f = fixture();
    const don = f.state.players[0].donCostArea.find((d) => d.state === "ACTIVE")!;
    f.state = {
      ...f.state,
      prohibitions: [
        {
          id: "seeded-don-hold",
          sourceCardInstanceId: "seed",
          sourceEffectBlockId: "",
          prohibitionType: "CANNOT_REFRESH",
          scope: {},
          duration: { type: "SKIP_NEXT_REFRESH" },
          controller: 1,
          appliesTo: [don.instanceId],
          usesRemaining: null,
        } as GameState["prohibitions"][number],
      ],
    };
    f.act({
      type: "ATTACH_DON",
      targetInstanceId: f.state.players[0].leader.instanceId,
      count: 1,
    });
    expect(f.state.players[0].leader.attachedDon.map((d) => d.instanceId)).toContain(
      don.instanceId
    );
    expect(f.state.prohibitions.some((p) => p.appliesTo.includes(don.instanceId))).toBe(false);
  });

  it("keeps the hold while the DON!! stays in the cost area (rest/active changes are not moves)", () => {
    const f = fixture();
    const held = holdRestedOpponentDon(f);
    f.state = advanceThroughRefreshOf(f, 1);
    expect(f.state.players[1].donCostArea.find((d) => d.instanceId === held)?.state).toBe(
      "RESTED"
    );
  });
});

// ─── Review round 2: area keys, refresh ordering, resume catch-all ──────────

function seedDonHold(state: GameState, donId: string): GameState {
  return {
    ...state,
    prohibitions: [
      ...state.prohibitions,
      {
        id: `seeded-hold-${donId}`,
        sourceCardInstanceId: "seed",
        sourceEffectBlockId: "",
        prohibitionType: "CANNOT_REFRESH",
        scope: {},
        duration: { type: "SKIP_NEXT_REFRESH" },
        controller: 0,
        appliesTo: [donId],
        usesRemaining: null,
      } as GameState["prohibitions"][number],
    ],
  };
}
const holds = (state: GameState, donId: string) =>
  state.prohibitions.some((p) => p.appliesTo.includes(donId));

describe("OPT-792 DON!! areas follow the rules areas (review C)", () => {
  function moved(mutate: (next: GameState) => void) {
    const f = fixture();
    const a = f.put("COST-3", 0);
    f.put("COST-3", 0);
    a.attachedDon = [{ instanceId: "moving", state: "ACTIVE", attachedTo: a.instanceId }];
    const next = structuredClone(f.state);
    mutate(next);
    return movedDonIds(f.state, next).has("moving");
  }
  const chars = (s: GameState, pi: 0 | 1) => s.players[pi].characters.filter(isChar);
  const isChar = (c: CardInstance | null): c is CardInstance => c !== null;

  it("Character → Character on one field is the same area (not a move)", () => {
    expect(
      moved((next) => {
        const [a, b] = chars(next, 0);
        b.attachedDon = a.attachedDon.map((d) => ({ ...d, attachedTo: b.instanceId }));
        a.attachedDon = [];
      })
    ).toBe(false);
  });

  it("Character → Leader, attached → cost area, and cross-player are moves", () => {
    expect(
      moved((next) => {
        const [a] = chars(next, 0);
        next.players[0].leader.attachedDon = a.attachedDon;
        a.attachedDon = [];
      })
    ).toBe(true);
    expect(
      moved((next) => {
        const [a] = chars(next, 0);
        next.players[0].donCostArea.push({ ...a.attachedDon[0], attachedTo: null });
        a.attachedDon = [];
      })
    ).toBe(true);
    expect(
      moved((next) => {
        const [a] = chars(next, 0);
        next.players[1].leader.attachedDon = a.attachedDon;
        a.attachedDon = [];
      })
    ).toBe(true);
  });

  it("a Character on the other player's field is a different Character area", () => {
    expect(
      moved((next) => {
        const [a] = chars(next, 0);
        const theirs: CardInstance = {
          ...a,
          instanceId: "their-char",
          controller: 1,
          owner: 1,
          attachedDon: a.attachedDon.map((d) => ({ ...d, attachedTo: "their-char" })),
        };
        next.players[1].characters[0] = theirs;
        a.attachedDon = [];
      })
    ).toBe(true);
  });

  it("REDISTRIBUTE_DON between two of a player's Characters keeps the DON!!'s effects", () => {
    const f = fixture();
    const a = f.put("COST-3", 0);
    const b = f.put("COST-3", 0);
    a.attachedDon = [{ instanceId: "moving-don", state: "ACTIVE", attachedTo: a.instanceId }];
    f.state = seedDonHold(f.state, "moving-don");
    const result = handleRedistributeDon(
      f.state,
      {
        type: "REDISTRIBUTE_DON",
        transfers: [
          { fromCardInstanceId: a.instanceId, donInstanceId: "moving-don", toCardInstanceId: b.instanceId },
        ],
      },
      {
        effectSourceInstanceId: "source",
        controller: 0,
        pausedAction: { type: "REDISTRIBUTE_DON", params: { amount: 1 } },
        remainingActions: [],
        resultRefs: [],
        validTargets: [b.instanceId],
      },
      new Map(),
      []
    );
    const next = result?.kind === "fallthrough" ? result.state : f.state;
    expect(char({ ...f, state: next } as Fixture, b)?.attachedDon.map((d) => d.instanceId)).toEqual([
      "moving-don",
    ]);
    expect(holds(next, "moving-don")).toBe(true);
  });
});

describe("OPT-792 Refresh returns attached DON!! before step 4 (review B)", () => {
  it("a hold on a DON!! attached when Refresh begins ends before refresh activation", () => {
    const f = fixture();
    f.donOf(1, "RESTED", 1);
    const held = oppDonIds(f)[0];
    f.play("OP07-026");
    f.select([held]);
    expect(holds(f.state, held)).toBe(true);
    // Seeded: the held DON!! is given to the opponent's Leader before their
    // Refresh Phase without passing any step-level release.
    const don = f.state.players[1].donCostArea.find((d) => d.instanceId === held)!;
    f.state.players[1].donCostArea = f.state.players[1].donCostArea.filter(
      (d) => d.instanceId !== held
    );
    f.state.players[1].leader.attachedDon = [
      { ...don, attachedTo: f.state.players[1].leader.instanceId },
    ];
    f.state = advanceThroughRefreshOf(f, 1);
    expect(f.state.players[1].donCostArea.find((d) => d.instanceId === held)?.state).toBe(
      "ACTIVE"
    );
  });
});

describe("OPT-792 prompt-resume catch-all (review D)", () => {
  it("rule-trash for play (rule 3-7-6-1) releases the victim's attached DON!! through the real resume path", () => {
    const f = fixture();
    const board = Array.from({ length: 5 }, () => f.put("COST-3", 0));
    const victim = board[0];
    victim.attachedDon = [{ instanceId: "victim-don", state: "ACTIVE", attachedTo: victim.instanceId }];
    f.state.players[0].trash = [
      { ...board[1], instanceId: "trash-candidate", cardId: CARDS.RUSH.id, zone: "TRASH", attachedDon: [] },
    ];
    f.state = seedDonHold(f.state, "victim-don");
    const paused = resolveEffect(
      f.state,
      {
        id: "opt792-rule-trash",
        category: "auto",
        trigger: { keyword: "ON_PLAY" },
        actions: [
          {
            type: "PLAY_CARD",
            target: { type: "CHARACTER_CARD", source_zone: "TRASH", count: { exact: 1 } },
            params: { source_zone: "TRASH", cost_override: "FREE" },
          },
        ],
      },
      board[1].instanceId,
      0,
      f.db
    );
    expect(paused.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    f.state = { ...paused.state, pendingPrompt: paused.pendingPrompt! };

    f.select([victim.instanceId]);
    expect(f.state.players[0].donCostArea.map((d) => d.instanceId)).toContain("victim-don");
    expect(holds(f.state, "victim-don")).toBe(false);
  });
});

// ─── Review round 3: only previously applied effects; no empty leftovers ────

describe("OPT-792 release scope and cleanup (review round 3)", () => {
  // "ADD_DON_FROM_DECK (rested), then hold all your rested DON!!": the hold is
  // applied AFTER the DON!! arrives, so it is not "previously applied".
  const addThenHold: Action[] = [
    { type: "ADD_DON_FROM_DECK", params: { amount: 1, target_state: "RESTED" } },
    {
      type: "APPLY_PROHIBITION",
      target: {
        type: "DON_IN_COST_AREA",
        controller: "SELF",
        count: { all: true },
        filter: { is_rested: true },
      },
      params: { prohibition_type: "CANNOT_REFRESH" },
      duration: { type: "SKIP_NEXT_REFRESH" },
    },
  ] as Action[];
  function freshDonFixture() {
    const f = fixture();
    f.state.players[0].donCostArea = [];
    f.state.players[0].donDeck = [{ instanceId: "new-don", state: "ACTIVE", attachedTo: null }];
    // An unrelated pre-existing hold, so the release's scoping (not its
    // "nothing held before" fast path) decides the outcome.
    f.state = seedDonHold(f.state, "unrelated-don");
    return f;
  }
  const holdsNewDon = (state: GameState) =>
    state.prohibitions.some(
      (p) => p.prohibitionType === "CANNOT_REFRESH" && p.appliesTo.includes("new-don")
    );

  it("keeps a hold applied after the move — effect steps", () => {
    const f = freshDonFixture();
    const r = resolveEffect(
      f.state,
      { id: "temporal", category: "auto", trigger: { keyword: "ON_PLAY" }, actions: addThenHold },
      f.state.players[0].leader.instanceId,
      0,
      f.db
    );
    expect(holdsNewDon(r.state)).toBe(true);
  });

  it("keeps a hold applied after the move — prompt resume", () => {
    const f = freshDonFixture();
    const r = resolveEffect(
      f.state,
      {
        id: "temporal",
        category: "auto",
        trigger: { keyword: "ON_PLAY" },
        flags: { optional: true },
        actions: addThenHold,
      },
      f.state.players[0].leader.instanceId,
      0,
      f.db
    );
    expect(r.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
    f.state = { ...r.state, pendingPrompt: r.pendingPrompt! };
    f.act({ type: "PLAYER_CHOICE", choiceId: "accept" });
    expect(f.state.players[0].donCostArea.map((d) => d.instanceId)).toEqual(["new-don"]);
    expect(holdsNewDon(f.state)).toBe(true);
  });

  it("keeps a hold applied after the move — pipeline execute", () => {
    const f = freshDonFixture();
    const leader = f.state.players[0].leader;
    f.db.set(leader.cardId, {
      ...f.db.get(leader.cardId)!,
      effectSchema: {
        card_id: leader.cardId,
        card_type: "Leader",
        effects: [
          {
            id: "temporal",
            category: "activate",
            trigger: { keyword: "ACTIVATE_MAIN" },
            actions: addThenHold,
          },
        ],
      },
    });
    f.act({ type: "ACTIVATE_EFFECT", cardInstanceId: leader.instanceId, effectId: "temporal" });
    expect(f.state.pendingPrompt).toBeNull();
    expect(holdsNewDon(f.state)).toBe(true);
  });

  it("drops emptied entries except population prohibitions and dynamic effects; skips out-of-scope ids", () => {
    const f = fixture();
    const base = {
      sourceCardInstanceId: "seed",
      sourceEffectBlockId: "",
      scope: {},
      duration: { type: "SKIP_NEXT_REFRESH" },
      controller: 0,
      usesRemaining: null,
      prohibitionType: "CANNOT_REFRESH",
    };
    const effect = (id: string, targetType?: string) =>
      ({
        id,
        sourceCardInstanceId: "seed",
        sourceEffectBlockId: "",
        category: "auto",
        modifiers: [{ type: "MODIFY_POWER", ...(targetType ? { target: { type: targetType } } : {}), params: { amount: 1000 } }],
        duration: { type: "THIS_TURN" },
        expiresAt: { wave: "END_OF_TURN" },
        controller: 0,
        appliesTo: ["d"],
        timestamp: 0,
      }) as unknown as GameState["activeEffects"][number];
    const state: GameState = {
      ...f.state,
      prohibitions: [
        { ...base, id: "plain", appliesTo: ["d"] },
        { ...base, id: "population", appliesTo: ["d"], target: { type: "CHARACTER" } },
        { ...base, id: "partial", appliesTo: ["d", "other"] },
        { ...base, id: "created-later", appliesTo: ["d"] },
      ] as GameState["prohibitions"],
      activeEffects: [effect("e-plain"), effect("e-dynamic", "CHARACTER"), effect("e-self", "SELF")],
    };
    const next = releaseDonEffects(state, new Set(["d"]), {
      prohibitionIds: new Set(["plain", "population", "partial"]),
      effectIds: new Set(["e-plain", "e-dynamic", "e-self"]),
    });
    expect(next.prohibitions.map((p) => [p.id, p.appliesTo])).toEqual([
      ["population", []],
      ["partial", ["other"]],
      ["created-later", ["d"]],
    ]);
    expect(next.activeEffects.map((e) => [e.id, e.appliesTo])).toEqual([["e-dynamic", []]]);
  });

  it("a held DON!! that moves leaves no empty-appliesTo prohibition behind", () => {
    const f = fixture();
    const jango = f.put("OP15-026", 0);
    f.put("COST-3", 1);
    f.donOf(1, "RESTED", 1);
    const held = oppDonIds(f)[0];
    f.play("OP07-026");
    f.select([held]);
    const hold = f.state.prohibitions.find((p) => p.appliesTo.includes(held))!;
    f.act({
      type: "ACTIVATE_EFFECT",
      cardInstanceId: jango.instanceId,
      effectId: "OP15-026_activate_trash",
    });
    if (f.state.pendingPrompt?.options.promptType === "OPTIONAL_EFFECT")
      f.act({ type: "PLAYER_CHOICE", choiceId: "accept" });
    expect(f.state.prohibitions.find((p) => p.id === hold.id)).toBeUndefined();
    expect(
      f.state.prohibitions.some(
        (p) => p.prohibitionType === "CANNOT_REFRESH" && p.appliesTo.length === 0 && !p.target
      )
    ).toBe(false);
  });

  it("OP15-023: a held DON!! that leaves via DON!! −1 and returns from the deck is not held later", () => {
    const f = fixture();
    const arlong = f.put("OP15-023", 1);
    f.state.players[0].donCostArea = [
      { instanceId: "held-don", state: "RESTED", attachedTo: null },
      ...f.state.players[0].donCostArea.slice(0, 7),
    ];
    f.state.players[0].donDeck = [];
    f.play("EB01-049"); // K.O. Arlong → its On K.O. holds up to 2 rested cards
    f.select([arlong.instanceId]);
    expect(promptValidTargets(f)).toContain("held-don");
    f.select(["held-don"]);
    expect(holds(f.state, "held-don")).toBe(true);

    // Player 0 pays DON!! −1: rested DON!! return first, so the held one goes.
    f.play("OP02-085");
    for (let i = 0; i < 4 && f.state.pendingPrompt; i++) {
      const o = f.state.pendingPrompt.options;
      if (o.promptType === "OPTIONAL_EFFECT") f.act({ type: "PLAYER_CHOICE", choiceId: "accept" });
      else if (o.promptType === "PLAYER_CHOICE") f.act({ type: "PLAYER_CHOICE", choiceId: o.choices[0].id }, 1);
      else break;
    }
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.state.players[0].donDeck.map((d) => d.instanceId)).toContain("held-don");
    expect(holds(f.state, "held-don")).toBe(false);
    expect(
      f.state.prohibitions.some((p) => p.appliesTo.length === 0 && !p.target && p.prohibitionType === "CANNOT_REFRESH")
    ).toBe(false);

    // Through player 0's next Refresh + DON!! phase: the same instance returns.
    f.state = advanceThroughRefreshOf(f, 1);
    f.state = advanceThroughRefreshOf(f, 0);
    for (let i = 0; i < 2 && f.state.turn.phase !== "MAIN"; i++) {
      const r = runPipeline(f.state, { type: "ADVANCE_PHASE" }, f.db, 0);
      expect(r.valid, r.error).toBe(true);
      f.state = r.state;
    }
    const back = f.state.players[0].donCostArea.find((d) => d.instanceId === "held-don");
    expect(back).toBeDefined();
    back!.state = "RESTED";
    f.state = advanceThroughRefreshOf(f, 1);
    f.state = advanceThroughRefreshOf(f, 0);
    expect(f.state.players[0].donCostArea.find((d) => d.instanceId === "held-don")?.state).toBe(
      "ACTIVE"
    );
  });
});

function advanceThroughRefreshOf(f: Fixture, playerIndex: 0 | 1): GameState {
  let current = f.state;
  for (let safety = 12; safety > 0; safety--) {
    const result = runPipeline(
      current,
      { type: "ADVANCE_PHASE" },
      f.db,
      current.turn.activePlayerIndex
    );
    expect(result.valid, result.error).toBe(true);
    current = result.state;
    if (
      current.turn.activePlayerIndex === playerIndex &&
      current.turn.phase === "DRAW"
    ) {
      return current;
    }
  }
  throw new Error("advanceThroughRefreshOf: safety limit reached");
}

class Memory implements SessionStorage {
  data = new Map<string, unknown>();
  async get<T>(key: string) {
    return this.data.get(key) as T | undefined;
  }
  async put(key: string | Record<string, unknown>, value?: unknown) {
    for (const [k, v] of Object.entries(
      typeof key === "string" ? { [key]: value } : key
    ))
      this.data.set(k, JSON.parse(JSON.stringify(v)));
  }
  async setAlarm() {}
  async deleteAlarm() {}
}

async function roundTrip(state: GameState, cardDb: Map<string, CardData>) {
  const repository = new SessionRepository(new Memory(), {
    nextJsUrl: "https://example.test",
    workerSecret: "test",
  });
  await repository.save({
    state,
    cardDb,
    undoHistory: [],
    mode: "PVP",
    pregameMode: "PRIORITY_ROLL",
    testPriorityRolls: null,
  });
  const loaded = await repository.load();
  expect(loaded).not.toBeNull();
  return { ...loaded!.state, pendingPrompt: loaded!.state.pendingPrompt ?? null };
}
