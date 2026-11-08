import { describe, expect, it } from "vitest";
import type { CardData, CardInstance, GameAction, GameState } from "../types.js";
import type { EffectResult } from "../engine/effect-types.js";
import { getEffectSchema, validateEffectSchema } from "../engine/schema-registry.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import { runPipeline } from "../engine/pipeline.js";
import { executeApplyProhibition } from "../engine/effect-resolver/actions/effects.js";
import { toPersistedGameState } from "../session/game-state-schema.js";
import { parseStoredSession } from "../session/persistence.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";

// OPT-1021 (Engine PR 7): prohibition target binding.
//
// OPT-935 — an APPLY_PROHIBITION bound only through `target_ref` binds the
// ref's cards. Printed text:
// - ST24-004 (docs/cards/ST-24.md:29): "[On Play] Rest up to 1 of your
//   opponent's Characters and that Character will not become active in your
//   opponent's next Refresh Phase. ..."
// - EB02-021 (docs/cards/EB-02.md:144): "[Main] Up to 1 of your {Straw Hat
//   Crew} type Characters gains +6000 power during this turn. Then, the
//   selected Character will not become active in your next Refresh Phase."
// These are the only authored APPLY_PROHIBITION actions with a `target_ref`
// and no `target` (inventory test below).
//
// OPT-934 — a YOUR_LEADER attacker binding is rejected on CANNOT_BLOCK and
// CANNOT_USE_BLOCKER, which would ignore it.

type P = 0 | 1;

function fixture() {
  const db = createTestCardDb();
  let state: GameState = createBattleReadyState(db);
  state.players.forEach((p) => {
    p.characters = padChars([]);
    p.hand = [];
  });
  let serial = 0;
  function data(id: string, overrides: Partial<CardData> = {}) {
    const schema = getEffectSchema(id);
    const value: CardData = {
      ...CARDS.VANILLA,
      id,
      name: schema?.card_name ?? id,
      effectSchema: schema ?? null,
      ...overrides,
    };
    db.set(id, value);
    return value;
  }
  function put(id: string, controller: P, zone: CardInstance["zone"] = "CHARACTER", cardState: CardInstance["state"] = "ACTIVE") {
    const card: CardInstance = {
      cardId: id,
      instanceId: `opt1021-${controller}-${serial++}`,
      owner: controller,
      controller,
      zone,
      state: cardState,
      attachedDon: [],
      turnPlayed: 1,
    };
    const p = state.players[controller];
    if (zone === "CHARACTER") p.characters[p.characters.findIndex((c) => !c)] = card;
    else if (zone === "HAND") p.hand.push(card);
    if (zone === "CHARACTER") state = registerCardEnteredField(state, card, db.get(id)!);
    return card;
  }
  function act(action: GameAction, player: P = state.turn.activePlayerIndex) {
    const result = runPipeline(state, action, db, player);
    expect(result.valid, result.error).toBe(true);
    state = result.state;
  }
  function respond(action: GameAction) {
    const result = resumePromptLifecycle(state, action, db, {
      drainPregame: (s) => s,
      advanceStartOfTurn: (s) => s,
    });
    expect(result.responseRejected, JSON.stringify(state.pendingPrompt?.options)).toBe(false);
    state = result.state;
  }
  return {
    db,
    data,
    put,
    act,
    select: (ids: string[]) => respond({ type: "SELECT_TARGET", selectedInstanceIds: ids }),
    persist() {
      state = parseStoredSession(
        JSON.parse(JSON.stringify({ state: toPersistedGameState(state), cardDb: Object.fromEntries(db), mode: "PVP" })),
      ).state;
    },
    get state() {
      return state;
    },
  };
}

type Fixture = ReturnType<typeof fixture>;

function refreshProhibitions(f: Fixture) {
  return f.state.prohibitions.filter((p) => p.prohibitionType === "CANNOT_REFRESH");
}

function fieldCard(f: Fixture, instanceId: string) {
  const card = f.state.players.flatMap((p) => p.characters).find((c) => c?.instanceId === instanceId);
  expect(card, instanceId).toBeDefined();
  return card!;
}

function advance(f: Fixture) {
  f.act({ type: "ADVANCE_PHASE" });
}

/** Advance until `player` has finished their Refresh Phase. */
function throughRefreshOf(f: Fixture, player: P) {
  for (let i = 0; i < 12; i++) {
    advance(f);
    if (f.state.turn.activePlayerIndex === player && f.state.turn.phase === "DRAW") return;
  }
  throw new Error("throughRefreshOf: safety limit reached");
}

function selectTargetIds(f: Fixture): string[] {
  const options = f.state.pendingPrompt?.options;
  expect(options?.promptType).toBe("SELECT_TARGET");
  if (options?.promptType !== "SELECT_TARGET") throw new Error(JSON.stringify(options));
  return options.validTargets;
}

describe("OPT-935 ST24-004 Law & Bepo: the rested Character skips the opponent's next refresh", () => {
  function setup() {
    const f = fixture();
    f.data("ST24-004", { cost: 1, power: 3000 });
    const law = f.put("ST24-004", 0, "HAND");
    const chosen = f.put(CARDS.VANILLA.id, 1);
    const bystander = f.put(CARDS.VANILLA.id, 1, "CHARACTER", "RESTED");
    return { f, law, chosen, bystander };
  }

  function playAndChoose(persist: boolean, choose = true) {
    const s = setup();
    s.f.act({ type: "PLAY_CARD", cardInstanceId: s.law.instanceId });
    expect(selectTargetIds(s.f)).toContain(s.chosen.instanceId);
    if (persist) s.f.persist();
    s.f.select(choose ? [s.chosen.instanceId] : []);
    if (persist) s.f.persist();
    return s;
  }

  it.each([false, true])("binds exactly the rested Character after the selection pause (persisted: %s)", (persist) => {
    const { f, chosen, bystander } = playAndChoose(persist);
    expect(f.state.pendingPrompt).toBeNull();
    expect(fieldCard(f, chosen.instanceId).state).toBe("RESTED");
    const bound = refreshProhibitions(f);
    expect(bound).toHaveLength(1);
    expect(bound[0].appliesTo).toEqual([chosen.instanceId]);

    // Player 0's own refresh leaves the prohibition alone.
    // Player 1's next Refresh Phase holds the chosen Character rested and
    // refreshes the bystander, then the prohibition is spent.
    throughRefreshOf(f, 1);
    expect(fieldCard(f, chosen.instanceId).state).toBe("RESTED");
    expect(fieldCard(f, bystander.instanceId).state).toBe("ACTIVE");
    expect(refreshProhibitions(f)).toEqual([]);

    // The following refresh activates it normally.
    throughRefreshOf(f, 0);
    throughRefreshOf(f, 1);
    expect(fieldCard(f, chosen.instanceId).state).toBe("ACTIVE");
  });

  it("choosing no Character registers no prohibition and refreshes the whole board", () => {
    const { f, bystander } = playAndChoose(true, false);
    expect(refreshProhibitions(f)).toEqual([]);
    throughRefreshOf(f, 1);
    expect(fieldCard(f, bystander.instanceId).state).toBe("ACTIVE");
  });
});

describe("OPT-935 EB02-021 Gum-Gum Giant Pistol: the selected Character skips your next refresh", () => {
  it.each([false, true])("binds the buffed Character only (persisted: %s)", (persist) => {
    const f = fixture();
    f.data("EB02-021", { type: "Event", cost: 1, power: null, counter: null, effectText: "[Main] Up to 1 of your {Straw Hat Crew} type Characters gains +6000 power during this turn. Then, the selected Character will not become active in your next Refresh Phase." });
    f.data("TEST-SHC", { types: ["Straw Hat Crew"] });
    const event = f.put("EB02-021", 0, "HAND");
    const strawHat = f.put("TEST-SHC", 0);
    const other = f.put("TEST-SHC", 0);
    f.act({ type: "PLAY_CARD", cardInstanceId: event.instanceId });
    expect(selectTargetIds(f)).toEqual(expect.arrayContaining([strawHat.instanceId, other.instanceId]));
    if (persist) f.persist();
    f.select([strawHat.instanceId]);
    if (persist) f.persist();
    expect(f.state.pendingPrompt).toBeNull();

    const bound = refreshProhibitions(f);
    expect(bound).toHaveLength(1);
    expect(bound[0].appliesTo).toEqual([strawHat.instanceId]);

    // Rest both, as if they attacked; player 0's next refresh keeps only the
    // selected one rested.
    f.state.players[0].characters.forEach((c) => {
      if (c) c.state = "RESTED";
    });
    throughRefreshOf(f, 1);
    expect(refreshProhibitions(f)).toHaveLength(1);
    throughRefreshOf(f, 0);
    expect(fieldCard(f, strawHat.instanceId).state).toBe("RESTED");
    expect(fieldCard(f, other.instanceId).state).toBe("ACTIVE");
    expect(refreshProhibitions(f)).toEqual([]);
  });
});

describe("OPT-935 executeApplyProhibition with only a target_ref", () => {
  const action = {
    type: "APPLY_PROHIBITION",
    target_ref: "picked",
    params: { prohibition_type: "CANNOT_REFRESH" },
    duration: { type: "SKIP_NEXT_REFRESH" },
  } as const;

  function run(refIds: string[] | undefined, preselected?: string[]) {
    const db = createTestCardDb();
    const state = createBattleReadyState(db);
    const refs = new Map<string, EffectResult>();
    if (refIds) refs.set("picked", { targetInstanceIds: refIds, count: refIds.length } as EffectResult);
    return executeApplyProhibition(state, action as never, "char-0-v1", 0, db, refs, preselected);
  }

  it("binds the ref's cards on the direct path", () => {
    const result = run(["char-1-v1"]);
    expect(result.succeeded).toBe(true);
    expect(result.state.prohibitions.at(-1)?.appliesTo).toEqual(["char-1-v1"]);
  });

  it("binds preselected ref targets passed in by the chain", () => {
    const result = run(["char-1-v1"], ["char-1-v1"]);
    expect(result.state.prohibitions.at(-1)?.appliesTo).toEqual(["char-1-v1"]);
  });

  it.each([[[]], [undefined]])("registers nothing for an empty or missing ref (%s)", (refIds) => {
    const result = run(refIds as string[] | undefined);
    expect(result.succeeded).toBe(false);
    expect(result.state.prohibitions).toEqual([]);
  });
});

describe("OPT-935 inventory: target_ref-only APPLY_PROHIBITION blocks", () => {
  it("covers exactly ST24-004 and EB02-021", async () => {
    const { getAllAuthoredSchemas } = await import("../engine/schema-registry.js");
    const found = new Set<string>();
    const walk = (node: unknown, cardId: string) => {
      if (!node || typeof node !== "object") return;
      const record = node as Record<string, unknown>;
      if (record.type === "APPLY_PROHIBITION" && record.target_ref && !record.target) found.add(cardId);
      Object.values(record).forEach((value) => walk(value, cardId));
    };
    for (const [cardId, schema] of Object.entries(getAllAuthoredSchemas())) walk(schema, cardId);
    expect([...found].sort()).toEqual(["EB02-021", "ST24-004"]);
  });
});

describe("OPT-934 YOUR_LEADER attacker binding on other Blocker-family prohibitions", () => {
  const schema = (prohibitionType: string, extra: Record<string, unknown> = {}) => ({
    card_id: "TEST-934",
    card_name: "Test",
    card_type: "Event",
    effects: [{
      id: "main",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [{
        type: "APPLY_PROHIBITION",
        ...extra,
        params: { prohibition_type: prohibitionType, scope: { controller: "OPPONENT", when_attacking: { type: "YOUR_LEADER" } } },
      }],
    }],
  });
  const relevant = (errors: string[]) => errors.filter((e) => e.includes("when_attacking"));

  it.each(["CANNOT_BLOCK", "CANNOT_USE_BLOCKER"])("rejects it on %s", (type) => {
    expect(relevant(validateEffectSchema(schema(type)))).toEqual([
      expect.stringContaining(`only supported on CANNOT_ACTIVATE_BLOCKER (found ${type})`),
    ]);
  });

  it("still accepts it on CANNOT_ACTIVATE_BLOCKER", () => {
    expect(relevant(validateEffectSchema(schema("CANNOT_ACTIVATE_BLOCKER")))).toEqual([]);
  });

  it("still accepts it on CANNOT_ATTACK, where it gates the attack target", () => {
    const target = { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 } };
    expect(relevant(validateEffectSchema(schema("CANNOT_ATTACK", { target })))).toEqual([]);
  });
});
