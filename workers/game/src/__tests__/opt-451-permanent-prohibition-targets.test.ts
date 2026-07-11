/**
 * OPT-451 — Permanent prohibition population targets resolve at match time.
 *
 * The registrar used to discard a permanent prohibition's `target`
 * (type/controller/filter) and register only the source card in `appliesTo`,
 * so population prohibitions like P-084 Buggy's "all Characters with a cost
 * of 3 or 4 cannot attack" never applied to anyone but Buggy himself.
 *
 * Now non-SELF targets are carried on the RuntimeProhibition and re-resolved
 * against the live board at every check (like modifier auras), and carried
 * block conditions ("If your Leader is [Buggy]") are re-evaluated at match
 * time. Covers all four authored population prohibitions:
 *   - P-084 Buggy        → CANNOT_ATTACK        (checkProhibitions / pipeline)
 *   - OP05-040 Birdcage  → CANNOT_REFRESH       (applyRefreshProhibitions)
 *   - OP14-079 Crocodile → CANNOT_BE_REMOVED    (isRemovalProhibited)
 *   - EB04-057 Vegapunk  → CANNOT_BE_REMOVED    (isRemovalProhibited + condition)
 */

import { describe, it, expect } from "vitest";
import type { CardData, CardInstance, GameState, PlayerState } from "../types.js";
import type { EffectSchema, RuntimeActiveEffect, RuntimeProhibition } from "../engine/effect-types.js";
import { runPipeline } from "../engine/pipeline.js";
import { registerPermanentEffectsForCard } from "../engine/triggers.js";
import { isRemovalProhibited } from "../engine/prohibitions.js";
import { executeAddToLifeFromField } from "../engine/effect-resolver/actions/life.js";
import { expireSourceLeftZone } from "../engine/duration-tracker.js";
import { P_084_BUGGY } from "../engine/schemas/p.js";
import { OP05_040_BIRDCAGE } from "../engine/schemas/op05.js";
import { OP14_079_CROCODILE } from "../engine/schemas/op14.js";
import { EB04_057_VEGAPUNK } from "../engine/schemas/eb04.js";
import { OP04_119_DONQUIXOTE_ROSINANTE } from "../engine/schemas/op04.js";
import { OP08_029_PEKOMS } from "../engine/schemas/op08.js";
import { createTestCardDb, createBattleReadyState, CARDS } from "./helpers.js";

function noKeywords() {
  return { rush: false, rushCharacter: false, doubleAttack: false, banish: false, blocker: false, trigger: false, unblockable: false };
}

function makeCard(id: string, overrides: Partial<CardData> = {}): CardData {
  return {
    id,
    name: id,
    type: "Character",
    color: ["Red"],
    cost: 3,
    power: 4000,
    counter: null,
    life: null,
    attribute: [],
    types: [],
    effectText: "",
    triggerText: null,
    keywords: noKeywords(),
    effectSchema: null,
    imageUrl: null,
    ...overrides,
  };
}

const BUGGY_LEADER = makeCard("LEADER-BUGGY", { name: "Buggy", type: "Leader", cost: null, power: 5000, life: 5 });
const DOFLA_LEADER = makeCard("LEADER-DOFLA", { name: "Donquixote Doflamingo", type: "Leader", cost: null, power: 5000, life: 5 });
const P084 = makeCard("P-084", { name: "Buggy", cost: 4, power: 6000, types: ["Buggy's Delivery"], effectSchema: P_084_BUGGY });
const BIRDCAGE = makeCard("OP05-040", { name: "Birdcage", type: "Stage", cost: 2, power: null, effectSchema: OP05_040_BIRDCAGE });
const CROCODILE_LEADER = makeCard("OP14-079", { name: "Crocodile", type: "Leader", cost: null, power: 5000, life: 5, effectSchema: OP14_079_CROCODILE });
const VEGAPUNK = makeCard("EB04-057", { name: "Vegapunk", cost: 4, power: 5000, color: ["Yellow"], types: ["Scientist"], effectSchema: EB04_057_VEGAPUNK });
const YELLOW_SCIENTIST = makeCard("Y-SCI", { cost: 2, power: 3000, color: ["Yellow"], types: ["Scientist"] });
const COST5 = makeCard("CHAR-COST5", { cost: 5, power: 6000 });
const COST6 = makeCard("CHAR-COST6", { cost: 6, power: 7000 });
const ROSINANTE = makeCard("OP04-119", { name: "Donquixote Rosinante", cost: 5, power: 5000, effectSchema: OP04_119_DONQUIXOTE_ROSINANTE });
const PEKOMS = makeCard("OP08-029", { name: "Pekoms", cost: 3, power: 4000, types: ["Minks"], effectSchema: OP08_029_PEKOMS });
const MINKS_CHAR = makeCard("MINKS-C", { cost: 2, power: 3000, types: ["Minks"] });

function buildCardDb(): Map<string, CardData> {
  const db = createTestCardDb();
  for (const c of [BUGGY_LEADER, DOFLA_LEADER, P084, BIRDCAGE, CROCODILE_LEADER, VEGAPUNK, YELLOW_SCIENTIST, COST5, COST6, ROSINANTE, PEKOMS, MINKS_CHAR]) {
    db.set(c.id, c);
  }
  return db;
}

function makeChar(cardId: string, owner: 0 | 1, suffix: string, cardState: "ACTIVE" | "RESTED" = "ACTIVE"): CardInstance {
  return {
    instanceId: `char-${owner}-${suffix}`,
    cardId,
    zone: "CHARACTER",
    state: cardState,
    attachedDon: [],
    turnPlayed: 1,
    controller: owner,
    owner,
  };
}

function setChars(state: GameState, playerIndex: 0 | 1, chars: CardInstance[]): GameState {
  const players = [...state.players] as [PlayerState, PlayerState];
  const slots: (CardInstance | null)[] = [null, null, null, null, null];
  chars.forEach((c, i) => { slots[i] = c; });
  players[playerIndex] = { ...players[playerIndex], characters: slots };
  return { ...state, players };
}

function setLeader(state: GameState, playerIndex: 0 | 1, cardId: string): GameState {
  const players = [...state.players] as [PlayerState, PlayerState];
  players[playerIndex] = {
    ...players[playerIndex],
    leader: { ...players[playerIndex].leader, cardId },
  };
  return { ...state, players };
}

function registerFieldCard(state: GameState, instance: CardInstance, cardDb: Map<string, CardData>): GameState {
  const data = cardDb.get(instance.cardId);
  expect(data).toBeDefined();
  return registerPermanentEffectsForCard(state, instance, data!);
}

describe("OPT-451 — P-084 population CANNOT_ATTACK (production attack path)", () => {
  const cardDb = buildCardDb();

  /** P1 controls P-084 with a Buggy leader; P0 (active) has attackers. */
  function buggyBoard(p0LeaderCardId = CARDS.LEADER.id): GameState {
    let state = createBattleReadyState(cardDb);
    state = setLeader(state, 0, p0LeaderCardId);
    state = setLeader(state, 1, BUGGY_LEADER.id);
    const buggy = makeChar(P084.id, 1, "buggy");
    state = setChars(state, 1, [buggy, makeChar(CARDS.VANILLA.id, 1, "v1", "RESTED")]);
    state = setChars(state, 0, [
      makeChar(CARDS.VANILLA.id, 0, "cost3"),   // cost 3 → prohibited
      makeChar(CARDS.DOUBLE_ATK.id, 0, "cost4"), // cost 4 → prohibited
      makeChar(COST5.id, 0, "cost5"),            // cost 5 → allowed
    ]);
    state = registerFieldCard(state, buggy, cardDb);
    return state;
  }

  function declareAttack(state: GameState, attackerInstanceId: string) {
    return runPipeline(state, {
      type: "DECLARE_ATTACK",
      attackerInstanceId,
      targetInstanceId: state.players[1].leader.instanceId,
    }, cardDb, 0);
  }

  it("vetoes a cost-3 opposing attacker through the pipeline", () => {
    const result = declareAttack(buggyBoard(), "char-0-cost3");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/cannot attack/i);
  });

  it("vetoes a cost-4 opposing attacker", () => {
    const result = declareAttack(buggyBoard(), "char-0-cost4");
    expect(result.valid).toBe(false);
  });

  it("allows a cost-5 attacker (outside the population)", () => {
    const result = declareAttack(buggyBoard(), "char-0-cost5");
    expect(result.valid).toBe(true);
  });

  it("covers characters that enter play after registration (live population)", () => {
    let state = buggyBoard();
    // A cost-3 character added to the board well after P-084 registered.
    const late = makeChar(CARDS.BLOCKER.id, 0, "late");
    state = setChars(state, 0, [late]);
    const result = declareAttack(state, "char-0-late");
    expect(result.valid).toBe(false);
  });

  it("does not apply while the carried block condition is false (leader not Buggy)", () => {
    let state = buggyBoard();
    state = setLeader(state, 1, CARDS.LEADER.id); // P-084's controller no longer has a Buggy leader
    const result = declareAttack(state, "char-0-cost3");
    expect(result.valid).toBe(true);
  });

  it("still blocks P-084 itself via the static SELF prohibition", () => {
    const cardDbLocal = buildCardDb();
    let state = createBattleReadyState(cardDbLocal);
    state = setLeader(state, 0, BUGGY_LEADER.id);
    const buggy = makeChar(P084.id, 0, "buggy");
    state = setChars(state, 0, [buggy]);
    state = registerFieldCard(state, buggy, cardDbLocal);
    const result = runPipeline(state, {
      type: "DECLARE_ATTACK",
      attackerInstanceId: buggy.instanceId,
      targetInstanceId: state.players[1].leader.instanceId,
    }, cardDbLocal, 0);
    expect(result.valid).toBe(false);
  });

  it("expires when the source leaves the field", () => {
    let state = buggyBoard();
    expect(state.prohibitions.length).toBeGreaterThan(0);
    state = expireSourceLeftZone(state, "char-1-buggy");
    expect(state.prohibitions).toHaveLength(0);
    const result = declareAttack(state, "char-0-cost3");
    expect(result.valid).toBe(true);
  });
});

describe("OPT-451 — OP05-040 Birdcage population CANNOT_REFRESH", () => {
  const cardDb = buildCardDb();

  function birdcageBoard(): GameState {
    let state = createBattleReadyState(cardDb);
    state = setLeader(state, 0, DOFLA_LEADER.id);
    // Player 0 controls Birdcage (stage).
    const stage: CardInstance = {
      instanceId: "stage-0-birdcage",
      cardId: BIRDCAGE.id,
      zone: "STAGE",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 1,
      controller: 0,
      owner: 0,
    };
    const players = [...state.players] as [PlayerState, PlayerState];
    players[0] = { ...players[0], stage };
    state = { ...state, players };
    // Player 1's rested characters: cost 3 and cost 5 are covered by the
    // "cost 5 or less" population; cost 6 sits outside it.
    state = setChars(state, 1, [
      makeChar(CARDS.VANILLA.id, 1, "cost3", "RESTED"),
      makeChar(COST5.id, 1, "cost5", "RESTED"),
      makeChar(COST6.id, 1, "cost6", "RESTED"),
    ]);
    state = registerFieldCard(state, stage, cardDb);
    return state;
  }

  function advancePhase(state: GameState): GameState {
    const result = runPipeline(state, { type: "ADVANCE_PHASE" }, cardDb, state.turn.activePlayerIndex);
    expect(result.valid).toBe(true);
    return result.state;
  }

  it("holds covered characters rested through refresh without being consumed", () => {
    let state = birdcageBoard();
    expect(state.prohibitions).toHaveLength(1);

    // P0 ends turn → P1 at REFRESH; run P1's refresh.
    state = advancePhase(state);
    expect(state.turn.phase).toBe("REFRESH");
    state = advancePhase(state);
    expect(state.turn.phase).toBe("DRAW");

    const cost3 = state.players[1].characters.find((c) => c?.instanceId === "char-1-cost3");
    const cost5 = state.players[1].characters.find((c) => c?.instanceId === "char-1-cost5");
    const cost6 = state.players[1].characters.find((c) => c?.instanceId === "char-1-cost6");
    expect(cost3?.state).toBe("RESTED");   // covered (cost ≤ 5)
    expect(cost5?.state).toBe("RESTED");   // covered (cost ≤ 5, boundary)
    expect(cost6?.state).toBe("ACTIVE");   // outside the population → refreshes
    // DON!! refresh normally — the aura only covers characters.
    expect(state.players[1].donCostArea.every((d) => d.state === "ACTIVE")).toBe(true);
    // The permanent aura is NOT consumed.
    expect(state.prohibitions).toHaveLength(1);
  });

  it("does not apply when the leader condition is false", () => {
    let state = birdcageBoard();
    state = setLeader(state, 0, CARDS.LEADER.id); // not Doflamingo
    state = advancePhase(state);
    state = advancePhase(state);
    const cost3 = state.players[1].characters.find((c) => c?.instanceId === "char-1-cost3");
    expect(cost3?.state).toBe("ACTIVE");
    expect(state.prohibitions).toHaveLength(1); // aura persists, merely inert
  });
});

describe("OPT-451 — removal-family population prohibitions", () => {
  const cardDb = buildCardDb();

  it("OP14-079: opponent characters protected from the owner's effects only", () => {
    let state = createBattleReadyState(cardDb);
    state = setLeader(state, 0, CROCODILE_LEADER.id);
    const oppChar = makeChar(CARDS.VANILLA.id, 1, "v-op14");
    const ownChar = makeChar(CARDS.VANILLA.id, 0, "v-own");
    state = setChars(state, 1, [oppChar]);
    state = setChars(state, 0, [ownChar]);
    state = registerFieldCard(state, state.players[0].leader, cardDb);
    expect(state.prohibitions).toHaveLength(1);

    // P0's effect K.O.'ing P1's character → prohibited.
    expect(isRemovalProhibited(state, oppChar.instanceId, {
      action: "KO", cause: "EFFECT", causingController: 0,
    }, cardDb)).toBe(true);

    // P1's own effect on their own character → allowed.
    expect(isRemovalProhibited(state, oppChar.instanceId, {
      action: "KO", cause: "EFFECT", causingController: 1,
    }, cardDb)).toBe(false);

    // Battle K.O. → allowed (text prohibits removal by effects).
    expect(isRemovalProhibited(state, oppChar.instanceId, {
      action: "KO", cause: "BATTLE", causingController: 0,
    }, cardDb)).toBe(false);

    // The owner's own characters are not covered.
    expect(isRemovalProhibited(state, ownChar.instanceId, {
      action: "KO", cause: "EFFECT", causingController: 1,
    }, cardDb)).toBe(false);

    const result = executeAddToLifeFromField(
      state,
      { type: "ADD_TO_LIFE_FROM_FIELD", target: { type: "CHARACTER", controller: "OPPONENT" } } as any,
      state.players[0].leader.instanceId,
      0,
      cardDb,
      new Map(),
      [oppChar.instanceId],
    );
    expect(result.state.players[1].characters.find((c) => c?.instanceId === oppChar.instanceId)).toBeTruthy();
    expect(result.state.players[1].life).toHaveLength(state.players[1].life.length);
  });

  it("EB04-057: yellow Scientist characters protected while life ≤ 2", () => {
    let state = createBattleReadyState(cardDb);
    const vegapunk = makeChar(VEGAPUNK.id, 0, "vega");
    const scientist = makeChar(YELLOW_SCIENTIST.id, 0, "sci");
    const vanilla = makeChar(CARDS.VANILLA.id, 0, "van");
    state = setChars(state, 0, [vegapunk, scientist, vanilla]);

    // Life ≤ 2 for player 0.
    const players = [...state.players] as [PlayerState, PlayerState];
    players[0] = { ...players[0], life: players[0].life.slice(0, 2) };
    state = { ...state, players };

    state = registerFieldCard(state, vegapunk, cardDb);
    expect(state.prohibitions).toHaveLength(1);

    const oppEffect = { action: "KO" as const, cause: "EFFECT" as const, causingController: 1 as const };
    expect(isRemovalProhibited(state, scientist.instanceId, oppEffect, cardDb)).toBe(true);
    // Vegapunk himself matches his own population (yellow Scientist).
    expect(isRemovalProhibited(state, vegapunk.instanceId, oppEffect, cardDb)).toBe(true);
    // A non-Scientist character is not covered.
    expect(isRemovalProhibited(state, vanilla.instanceId, oppEffect, cardDb)).toBe(false);

    // With 3 life the carried condition fails → no protection.
    const players3 = [...state.players] as [PlayerState, PlayerState];
    players3[0] = { ...players3[0], life: [...players3[0].life, ...state.players[0].life.slice(0, 1)] };
    const state3 = { ...state, players: players3 };
    expect(isRemovalProhibited(state3, scientist.instanceId, oppEffect, cardDb)).toBe(false);

    const result = executeAddToLifeFromField(
      state,
      { type: "ADD_TO_LIFE_FROM_FIELD", target: { type: "CHARACTER", controller: "OPPONENT" } } as any,
      state.players[1].leader.instanceId,
      1,
      cardDb,
      new Map(),
      [scientist.instanceId],
    );
    expect(result.state.players[0].characters.find((c) => c?.instanceId === scientist.instanceId)).toBeTruthy();
    expect(result.state.players[0].life).toHaveLength(state.players[0].life.length);
  });

  it("OP04-119: protection gated on the printed [Opponent's Turn] + rested conditions", () => {
    const cardDb = buildCardDb();
    let state = createBattleReadyState(cardDb); // player 0 active
    const rosinante = makeChar(ROSINANTE.id, 1, "rosi", "RESTED");
    const protectedChar = makeChar(COST5.id, 1, "c5"); // ACTIVE, base cost 5
    state = setChars(state, 1, [rosinante, protectedChar]);
    state = registerFieldCard(state, rosinante, cardDb);

    const p0Effect = { action: "KO" as const, cause: "EFFECT" as const, causingController: 0 as const };

    // Player 0's turn = Rosinante's controller's opponent's turn → protected.
    expect(isRemovalProhibited(state, protectedChar.instanceId, p0Effect, cardDb)).toBe(true);

    // On the controller's own turn the printed [Opponent's Turn] gate fails.
    const ownTurn = { ...state, turn: { ...state.turn, activePlayerIndex: 1 as const } };
    expect(isRemovalProhibited(ownTurn, protectedChar.instanceId, p0Effect, cardDb)).toBe(false);

    // An active (non-rested) Rosinante does not protect either.
    const players = [...state.players] as [PlayerState, PlayerState];
    players[1] = {
      ...players[1],
      characters: players[1].characters.map((c) =>
        c?.instanceId === rosinante.instanceId ? { ...c, state: "ACTIVE" as const } : c,
      ),
    };
    const activeRosi = { ...state, players };
    expect(isRemovalProhibited(activeRosi, protectedChar.instanceId, p0Effect, cardDb)).toBe(false);
  });

  it("OP08-029: Minks protected from ANY effect K.O., including the controller's own", () => {
    const cardDb = buildCardDb();
    let state = createBattleReadyState(cardDb);
    const pekoms = makeChar(PEKOMS.id, 0, "pekoms");
    const minks = makeChar(MINKS_CHAR.id, 0, "minks");
    state = setChars(state, 0, [pekoms, minks]);
    state = registerFieldCard(state, pekoms, cardDb);

    // Printed text says "cannot be K.O.'d by effects" — no opponent qualifier.
    expect(isRemovalProhibited(state, minks.instanceId, {
      action: "KO", cause: "EFFECT", causingController: 0,
    }, cardDb)).toBe(true);
    expect(isRemovalProhibited(state, minks.instanceId, {
      action: "KO", cause: "EFFECT", causingController: 1,
    }, cardDb)).toBe(true);
    // Battle K.O. is still allowed.
    expect(isRemovalProhibited(state, minks.instanceId, {
      action: "KO", cause: "BATTLE", causingController: 1,
    }, cardDb)).toBe(false);
  });
});

describe("OPT-451 — negation contract and condition composition", () => {
  const cardDb = buildCardDb();

  /** NEGATE_EFFECTS_FLAG active effect, mirroring executeNegateEffects. */
  function negationEffect(targetInstanceId: string): RuntimeActiveEffect {
    return {
      id: `neg-${targetInstanceId}`,
      sourceCardInstanceId: "negator",
      sourceEffectBlockId: "",
      category: "auto",
      modifiers: [{
        type: "NEGATE_EFFECTS_FLAG",
        params: {},
        duration: { type: "THIS_TURN" },
      }],
      duration: { type: "THIS_TURN" },
      expiresAt: { wave: "END_OF_TURN", turn: 3 } as any,
      controller: 0,
      appliesTo: [targetInstanceId],
      timestamp: 0,
    } as RuntimeActiveEffect;
  }

  it("a negated source's population prohibition pauses (OPT-253 contract)", () => {
    let state = createBattleReadyState(cardDb);
    state = setLeader(state, 1, BUGGY_LEADER.id);
    const buggy = makeChar(P084.id, 1, "buggy");
    state = setChars(state, 1, [buggy]);
    state = setChars(state, 0, [makeChar(CARDS.VANILLA.id, 0, "cost3")]);
    state = registerFieldCard(state, buggy, cardDb);

    const attack = () => runPipeline(state, {
      type: "DECLARE_ATTACK",
      attackerInstanceId: "char-0-cost3",
      targetInstanceId: state.players[1].leader.instanceId,
    }, cardDb, 0);

    // Active aura vetoes the cost-3 attacker...
    expect(attack().valid).toBe(false);

    // ...but pauses while P-084 itself is effect-negated.
    state = { ...state, activeEffects: [...state.activeEffects, negationEffect(buggy.instanceId) as any] };
    expect(attack().valid).toBe(true);
  });

  it("block-level and prohibition-level conditions compose as all_of", () => {
    // Synthetic schema: block gate (life ≤ 2) AND prohibition gate (DON ≥ 5),
    // population CANNOT_ATTACK over cost ≤ 3 characters of either player.
    const COMPOSED: EffectSchema = {
      card_id: "COMPOSED-WARD",
      card_name: "Composed Ward",
      card_type: "Character",
      effects: [
        {
          id: "composed_aura",
          category: "permanent",
          conditions: { type: "LIFE_COUNT", controller: "SELF", operator: "<=", value: 2 },
          prohibitions: [
            {
              type: "CANNOT_ATTACK",
              target: {
                type: "CHARACTER",
                controller: "EITHER",
                count: { all: true },
                filter: { cost_max: 3 },
              },
              conditions: { type: "DON_FIELD_COUNT", controller: "SELF", operator: ">=", value: 5 },
            },
          ],
        },
      ],
    };
    const WARD_CARD = makeCard("COMPOSED-WARD", { cost: 4, power: 5000, effectSchema: COMPOSED });
    const db = buildCardDb();
    db.set(WARD_CARD.id, WARD_CARD);

    let state = createBattleReadyState(db);
    const ward = makeChar(WARD_CARD.id, 1, "ward");
    state = setChars(state, 1, [ward]);
    state = setChars(state, 0, [makeChar(CARDS.VANILLA.id, 0, "cost3")]);
    // Both gates true: P1 life → 2, P1 DON stays at 6 (≥ 5).
    const basePlayers = [...state.players] as [PlayerState, PlayerState];
    basePlayers[1] = { ...basePlayers[1], life: basePlayers[1].life.slice(0, 2) };
    state = { ...state, players: basePlayers };
    state = registerFieldCard(state, ward, db);

    const prohibition = (state.prohibitions as RuntimeProhibition[])[0];
    expect(prohibition.conditions).toEqual({
      all_of: [
        { type: "LIFE_COUNT", controller: "SELF", operator: "<=", value: 2 },
        { type: "DON_FIELD_COUNT", controller: "SELF", operator: ">=", value: 5 },
      ],
    });

    const attack = (s: GameState) => runPipeline(s, {
      type: "DECLARE_ATTACK",
      attackerInstanceId: "char-0-cost3",
      targetInstanceId: s.players[1].leader.instanceId,
    }, db, 0);

    // Both conditions hold → vetoed.
    expect(attack(state).valid).toBe(false);

    // Life gate fails (3 life) → allowed.
    const lifeFail = [...state.players] as [PlayerState, PlayerState];
    lifeFail[1] = { ...lifeFail[1], life: [...lifeFail[1].life, { instanceId: "xlife", cardId: CARDS.VANILLA.id } as any] };
    expect(attack({ ...state, players: lifeFail }).valid).toBe(true);

    // DON gate fails (4 DON) → allowed.
    const donFail = [...state.players] as [PlayerState, PlayerState];
    donFail[1] = { ...donFail[1], donCostArea: donFail[1].donCostArea.slice(0, 4) };
    expect(attack({ ...state, players: donFail }).valid).toBe(true);
  });

  it("CANNOT_ATTACH_DON honors a dynamic population target", () => {
    const NO_DON: EffectSchema = {
      card_id: "DON-WARD",
      card_name: "Don Ward",
      card_type: "Character",
      effects: [
        {
          id: "no_don_aura",
          category: "permanent",
          prohibitions: [
            {
              type: "CANNOT_ATTACH_DON",
              target: {
                type: "CHARACTER",
                controller: "SELF",
                count: { all: true },
                filter: { cost_max: 3 },
              },
            },
          ],
        },
      ],
    };
    const WARD_CARD = makeCard("DON-WARD", { cost: 4, power: 5000, effectSchema: NO_DON });
    const db = buildCardDb();
    db.set(WARD_CARD.id, WARD_CARD);

    let state = createBattleReadyState(db);
    const ward = makeChar(WARD_CARD.id, 0, "donward");
    state = setChars(state, 0, [
      ward,
      makeChar(CARDS.VANILLA.id, 0, "cost3"),
      makeChar(COST5.id, 0, "cost5"),
    ]);
    state = registerFieldCard(state, ward, db);

    const attach = (targetInstanceId: string) => runPipeline(state, {
      type: "ATTACH_DON",
      targetInstanceId,
      count: 1,
    }, db, 0);

    expect(attach("char-0-cost3").valid).toBe(false);  // covered by population
    expect(attach("char-0-cost5").valid).toBe(true);   // outside the filter
  });
});
