/**
 * OPT-955 — batch and distribution semantics (docs/game-engine/BATCH-CONTRACT.md).
 *
 * Rules v1.2.0, `docs/rules/rule_comprehensive.md`:
 * - 3-1-7 (line 291): cards placed in an area at once are ordered by their owner.
 * - 3-2-3 (line 301): multiple cards moved from a deck move one by one.
 * - 8-6-1-1 (line 860): effects whose timing is met at once resolve one after another.
 * - 9-1-2 (line 876) / 9-2-1-2 (line 884): rule processing runs as soon as a
 *   deck reaches 0, even mid-resolution.
 *
 * | Clause | Condition / evaluation time | Cost/payer | Target/chooser | Timing/continuation | Observable result | Test |
 * |---|---|---|---|---|---|---|
 * | OP18-046 clause A "give up to 2 rested DON!! to your Leader and all of your Characters" (DISTRIBUTE_DON max_per_target 2) | 2 rested DON!!, Leader + 3 Characters | none | controller picks the split, round by round | rounds end when the pool is spent | 2 on the Leader; active DON!! untouched; one DON_GIVEN_TO_CARD | "OP18-046 shape: …" |
 * | same, pool larger than the cap | 5 rested DON!!, 2 recipients | none | controller | round 3 is never asked | 2 each, 1 rested left | "caps each target …" |
 * | same, empty reply | 3 rested | none | controller | the split ends early | only round-1 picks receive | "an empty reply …" |
 * | same, bad reply | — | none | controller | prompt stays | not offered / above the pool rejected | "rejects …" |
 * | same, reload between rounds | — | none | controller | round 2 resumes after reload | same result as without reload | "survives reload …" |
 * | max_total 1 | 4 rested | none | controller | one round, count 1 | exactly 1 given | "max_total …" |
 * | "up to 2" recipients, then the split | 3 rested | none | controller picks recipients, then the split | split offers only the chosen recipients | 2 on one Character | "an \"up to\" recipient choice …" |
 * | batch K.O. of 3 [On K.O.] draw 1, owner deck 1 | after the batch | none | none | first trigger empties the deck → defeat, remaining triggers never run | all 3 in trash, owner drew 1, FINISHED | "batch K.O. of 3 …" |
 */
import { describe, expect, it } from "vitest";
import type { Action, EffectSchema } from "../engine/effect-types.js";
import { getAllAuthoredSchemas } from "../engine/schema-registry.js";
import { findDonSplitParamViolations } from "../engine/schema-don-split-lint.js";
import type { CardInstance, DonInstance, GameState } from "../types.js";
import { expectTerminal, rig, synSchema, type Rig } from "./opt-960-rig.js";
import { CARDS } from "./helpers.js";

function split(maxPerTarget: number, extra: Record<string, unknown> = {}): Action {
  return {
    type: "DISTRIBUTE_DON",
    target: { type: "LEADER_OR_CHARACTER", controller: "SELF", count: { all: true } },
    params: { max_per_target: maxPerTarget, don_state: "RESTED", ...extra },
  } as Action;
}

function setDon(r: Rig, rested: number, active: number) {
  const don: DonInstance[] = [];
  for (let i = 0; i < rested; i++) don.push({ instanceId: `don-r${i}`, state: "RESTED", attachedTo: null });
  for (let i = 0; i < active; i++) don.push({ instanceId: `don-a${i}`, state: "ACTIVE", attachedTo: null });
  r.state.players[0].donCostArea = don;
  r.state.players[0].leader = { ...r.state.players[0].leader, attachedDon: [] };
}

/** Play a cost-0 Character whose [On Play] draws 2 then runs `action`. */
function playSplitter(r: Rig, action: Action): CardInstance {
  const card = r.put("SPLIT-0955", 0, "HAND", {
    data: { cost: 0 },
    schema: synSchema("SPLIT-0955", [
      {
        id: "on_play",
        category: "auto",
        trigger: { keyword: "ON_PLAY" },
        actions: [{ type: "DRAW", params: { amount: 2 } }, { ...action, chain: "THEN" } as Action],
      } as never,
    ]),
  });
  r.act({ type: "PLAY_CARD", cardInstanceId: card.instanceId });
  return card;
}

function attached(state: GameState, id: string): DonInstance[] {
  const p = state.players[0];
  const card = p.leader.instanceId === id ? p.leader : p.characters.find((c) => c?.instanceId === id);
  return card?.attachedDon ?? [];
}

function prompt(r: Rig) {
  const options = r.state.pendingPrompt?.options;
  if (options?.promptType !== "SELECT_TARGET") throw new Error(`expected SELECT_TARGET, got ${options?.promptType}`);
  return options;
}

function playedId(r: Rig): string {
  return r.state.players[0].characters.find((c) => c?.cardId === "SPLIT-0955")!.instanceId;
}

function donGivenEvents(state: GameState) {
  return state.eventLog.filter((e) => e.type === "DON_GIVEN_TO_CARD");
}

describe("OPT-955 DISTRIBUTE_DON max_per_target (one pool, per-target cap, player split)", () => {
  it("OP18-046 shape: 2 rested DON!! over Leader + 3 Characters prompts the split, caps each at 2, and uses the rested pool only", () => {
    const r = rig();
    r.deck(0, 10);
    setDon(r, 2, 3);
    const c1 = r.put(CARDS.VANILLA.id, 0, "CHARACTER");
    const c2 = r.put(CARDS.VANILLA.id, 0, "CHARACTER");
    const leaderId = r.state.players[0].leader.instanceId;
    const logBefore = donGivenEvents(r.state).length;
    playSplitter(r, split(2));
    expect(r.state.players[0].hand).toHaveLength(2);

    const round1 = prompt(r);
    expect([...round1.validTargets].sort()).toEqual([leaderId, c1.instanceId, c2.instanceId, playedId(r)].sort());
    expect(round1.countMin).toBe(0);
    expect(round1.countMax).toBe(2);
    expect(round1.instruction).toBe("Choose up to 2 cards to give 1 rested DON!! each");
    r.select([leaderId]);

    const round2 = prompt(r);
    expect(round2.validTargets).toEqual([leaderId]);
    expect(round2.countMax).toBe(1);
    expect(round2.instruction).toBe("Choose up to 1 card to give 1 more rested DON!! each");
    // Nothing is attached until the split ends.
    expect(attached(r.state, leaderId)).toHaveLength(0);
    r.select([leaderId]);

    expect(r.state.pendingPrompt ?? null).toBeNull();
    expect(attached(r.state, leaderId).map((d) => d.state)).toEqual(["RESTED", "RESTED"]);
    const cost = r.state.players[0].donCostArea;
    expect(cost.filter((d) => !d.attachedTo).map((d) => d.state)).toEqual(["ACTIVE", "ACTIVE", "ACTIVE"]);
    const given = donGivenEvents(r.state).slice(logBefore);
    expect(given).toHaveLength(1);
    expect(given[0].payload).toMatchObject({ count: 2 });
  });

  it("caps each target at max_per_target when the pool is larger: round 3 is never asked", () => {
    const r = rig();
    r.deck(0, 10);
    setDon(r, 5, 0);
    const leaderId = r.state.players[0].leader.instanceId;
    playSplitter(r, split(2));
    const both = [leaderId, playedId(r)];
    expect(prompt(r).countMax).toBe(2);
    r.select(both);
    expect([...prompt(r).validTargets].sort()).toEqual([...both].sort());
    r.select(both);
    expect(r.state.pendingPrompt ?? null).toBeNull();
    expect(attached(r.state, leaderId)).toHaveLength(2);
    expect(attached(r.state, playedId(r))).toHaveLength(2);
    expect(r.state.players[0].donCostArea.filter((d) => !d.attachedTo)).toHaveLength(1);
  });

  it("an empty reply ends the split; only the earlier picks receive", () => {
    const r = rig();
    r.deck(0, 10);
    setDon(r, 3, 0);
    const leaderId = r.state.players[0].leader.instanceId;
    playSplitter(r, split(2));
    r.select([playedId(r)]);
    r.select([]);
    expect(r.state.pendingPrompt ?? null).toBeNull();
    expect(attached(r.state, playedId(r))).toHaveLength(1);
    expect(attached(r.state, leaderId)).toHaveLength(0);
  });

  it("rejects a reply naming a card the round did not offer, or more than the pool allows", () => {
    const r = rig();
    r.deck(0, 10);
    setDon(r, 1, 0);
    const c1 = r.put(CARDS.VANILLA.id, 0, "CHARACTER");
    const leaderId = r.state.players[0].leader.instanceId;
    playSplitter(r, split(2));
    expect(prompt(r).countMax).toBe(1);
    expect(r.respond({ type: "SELECT_TARGET", selectedInstanceIds: [leaderId, c1.instanceId] }).rejected).toBe(true);
    expect(r.respond({ type: "SELECT_TARGET", selectedInstanceIds: ["not-a-card"] }).rejected).toBe(true);
    expect(prompt(r).countMax).toBe(1);
    r.select([c1.instanceId]);
    expect(attached(r.state, c1.instanceId)).toHaveLength(1);
  });

  it("survives reload between rounds", async () => {
    const r = rig();
    r.deck(0, 10);
    setDon(r, 3, 0);
    const leaderId = r.state.players[0].leader.instanceId;
    playSplitter(r, split(2));
    r.select([leaderId, playedId(r)]);
    await r.reload();
    const round2 = prompt(r);
    expect(round2.countMax).toBe(1);
    r.select([leaderId]);
    expect(r.state.pendingPrompt ?? null).toBeNull();
    expect(attached(r.state, leaderId)).toHaveLength(2);
    expect(attached(r.state, playedId(r))).toHaveLength(1);
  });

  it("max_total caps the whole split", () => {
    const r = rig();
    r.deck(0, 10);
    setDon(r, 4, 0);
    const leaderId = r.state.players[0].leader.instanceId;
    playSplitter(r, split(2, { max_total: 1 }));
    expect(prompt(r).countMax).toBe(1);
    r.select([leaderId]);
    expect(r.state.pendingPrompt ?? null).toBeNull();
    expect(attached(r.state, leaderId)).toHaveLength(1);
  });

  it("an \"up to\" recipient choice comes first, then the split over the chosen recipients only", () => {
    const r = rig();
    r.deck(0, 10);
    setDon(r, 3, 0);
    const c1 = r.put(CARDS.VANILLA.id, 0, "CHARACTER");
    const leaderId = r.state.players[0].leader.instanceId;
    playSplitter(r, {
      ...split(2),
      target: { type: "LEADER_OR_CHARACTER", controller: "SELF", count: { up_to: 2 } },
    } as Action);
    expect(prompt(r).countMax).toBe(2);
    r.select([leaderId, c1.instanceId]);
    const round1 = prompt(r);
    expect([...round1.validTargets].sort()).toEqual([leaderId, c1.instanceId].sort());
    expect(round1.instruction).toBe("Choose up to 2 cards to give 1 rested DON!! each");
    r.select([c1.instanceId]);
    r.select([c1.instanceId]);
    expect(r.state.pendingPrompt ?? null).toBeNull();
    expect(attached(r.state, c1.instanceId)).toHaveLength(2);
    expect(attached(r.state, leaderId)).toHaveLength(0);
  });

  it("no rested DON!! means no prompt and nothing given", () => {
    const r = rig();
    r.deck(0, 10);
    setDon(r, 0, 2);
    const logBefore = donGivenEvents(r.state).length;
    playSplitter(r, split(2));
    expect(r.state.pendingPrompt ?? null).toBeNull();
    expect(donGivenEvents(r.state).slice(logBefore)).toHaveLength(0);
  });
});

describe("OPT-955 batch K.O. with a mid-batch deck-out (rules 3-2-3, 8-6-1-1, 9-1-2)", () => {
  it("batch K.O. of 3: every K.O. happens, then the first [On K.O.] draw empties the deck and the game ends before the rest", () => {
    const r = rig();
    r.deck(1, 1);
    const onKoDraw = synSchema("ONKO-0955", [
      {
        id: "on_ko_draw",
        category: "auto",
        trigger: { keyword: "ON_KO" },
        actions: [{ type: "DRAW", params: { amount: 1 } }],
      } as never,
    ]);
    const victims = [0, 1, 2].map(() => r.put("ONKO-0955", 1, "CHARACTER", { schema: onKoDraw }));
    const sweep = r.put("SWEEP-0955", 0, "HAND", {
      data: { type: "Event", cost: 0, power: null, effectText: "[Main] K.O. all of your opponent's Characters." },
      schema: synSchema(
        "SWEEP-0955",
        [
          {
            id: "main",
            category: "auto",
            trigger: { keyword: "MAIN_EVENT" },
            actions: [{ type: "KO", target: { type: "CHARACTER", controller: "OPPONENT", count: { all: true } } }],
          } as never,
        ],
        "Event",
      ),
    });
    r.act({ type: "PLAY_CARD", cardInstanceId: sweep.instanceId });
    // Three simultaneous [On K.O.] of one player resolve one after another
    // (8-6-1-1). Identical triggers need no order prompt; answer one if asked.
    for (let guard = 0; guard < 3 && r.state.status !== "FINISHED"; guard++) {
      const options = r.state.pendingPrompt?.options;
      if (!options) break;
      if (options.promptType === "PLAYER_CHOICE") {
        r.act({ type: "PLAYER_CHOICE", choiceId: options.choices[0].id }, 1);
      } else if (options.promptType === "SELECT_TARGET") {
        r.act({ type: "SELECT_TARGET", selectedInstanceIds: options.validTargets.slice(0, 1) }, 1);
      } else {
        throw new Error(`unexpected prompt ${options.promptType}`);
      }
    }
    const p1 = r.state.players[1];
    expect(p1.characters.filter(Boolean)).toHaveLength(0);
    expect(p1.trash.filter((c) => c.cardId === "ONKO-0955")).toHaveLength(victims.length);
    expect(p1.deck).toHaveLength(0);
    expect(p1.hand).toHaveLength(1);
    expectTerminal(r.state, { winner: 0, reason: "Player 2 decked out" });
  });
});

describe("OPT-955 schema lint: DISTRIBUTE_DON split params", () => {
  const schemaWith = (params: Record<string, unknown>): Record<string, EffectSchema> => ({
    "TEST-955": synSchema("TEST-955", [
      { id: "a", category: "auto", trigger: { keyword: "ON_PLAY" }, actions: [{ ...split(2), params } as Action] } as never,
    ]),
  });

  it("accepts the split form and the fixed form", () => {
    expect(findDonSplitParamViolations(schemaWith({ max_per_target: 2, don_state: "RESTED" }))).toEqual([]);
    expect(findDonSplitParamViolations(schemaWith({ max_per_target: 2, max_total: 2 }))).toEqual([]);
    expect(findDonSplitParamViolations(schemaWith({ amount_per_target: 1, don_state: "RESTED" }))).toEqual([]);
  });

  it("rejects mixed forms, a stray max_total, and non-positive caps", () => {
    expect(findDonSplitParamViolations(schemaWith({ max_per_target: 2, amount_per_target: 1 }))).toHaveLength(1);
    expect(findDonSplitParamViolations(schemaWith({ amount_per_target: 1, max_total: 2 }))).toHaveLength(1);
    expect(findDonSplitParamViolations(schemaWith({ max_per_target: 0 }))).toHaveLength(1);
    expect(findDonSplitParamViolations(schemaWith({ max_per_target: 2, max_total: 1.5 }))).toHaveLength(1);
  });

  it("the authored registry is clean", () => {
    expect(findDonSplitParamViolations(getAllAuthoredSchemas())).toEqual([]);
  });
});
