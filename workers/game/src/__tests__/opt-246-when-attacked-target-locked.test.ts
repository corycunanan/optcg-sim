/**
 * OPT-246 — D8: WHEN_ATTACKED is target-locked, fires after Block Step.
 *
 * Bandai rulings (qa_op03.md:6-28, OP03-001 Portgas.D.Ace) we encode here:
 *   • Substep B (opp [When Attacking]) resolves before substep D
 *     (this Leader's [When Attacked]). Modeled as separate game events —
 *     ATTACK_DECLARED then ATTACK_TARGET_FINAL.
 *   • Substep D fires only when the source IS the final attack target.
 *     If a friendly Character is attacked instead, the Leader's WHEN_ATTACKED
 *     does NOT fire.
 *   • If [Blocker] redirects the attack, ATTACK_TARGET_FINAL carries the
 *     blocker's instanceId — the original target's WHEN_ATTACKED does NOT
 *     fire; the blocker's would (if it had one).
 *   • Substep D fires before Counter Step opens — emitted at the
 *     BLOCK_STEP → COUNTER_STEP boundary by both executeDeclareBlocker and
 *     executePass-from-block.
 */

import { describe, it, expect } from "vitest";
import { OP03_001_PORTGAS_D_ACE } from "../engine/schemas/op03.js";
import { matchTriggersForEvent, registerTriggersForCard } from "../engine/triggers.js";
import { executeDeclareBlocker, executePass } from "../engine/battle.js";
import type { CardData, CardInstance, GameEvent, GameState, PlayerState } from "../types.js";
import { createBattleReadyState, createTestCardDb, padChars, CARDS } from "./helpers.js";

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeAceLeaderCard(): CardData {
  return {
    id: "OP03-001",
    name: "Portgas.D.Ace",
    type: "Leader",
    color: ["Red"],
    cost: null,
    power: 5000,
    counter: null,
    life: 5,
    attribute: ["Special"],
    types: ["Whitebeard Pirates"],
    effectText:
      "When this Leader attacks or is attacked, you may trash any number of Event or Stage cards from your hand. This Leader gains +1000 power during this battle for every card trashed.",
    triggerText: null,
    keywords: { rush: false, rushCharacter: false, doubleAttack: false, banish: false, blocker: false, trigger: false, unblockable: false },
    effectSchema: OP03_001_PORTGAS_D_ACE,
    imageUrl: null,
  };
}

/**
 * Install Ace as player 1's Leader (attacker = player 0). Register Ace's
 * triggers so matchTriggersForEvent will see them.
 */
function installAceAsDefenderLeader(
  cardDb: Map<string, CardData>,
): { state: GameState; ace: CardInstance } {
  const aceCard = makeAceLeaderCard();
  cardDb.set(aceCard.id, aceCard);

  const base = createBattleReadyState(cardDb);

  const ace: CardInstance = {
    instanceId: "ace-leader-p1",
    cardId: aceCard.id,
    zone: "LEADER",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: null,
    controller: 1,
    owner: 1,
  };

  const newPlayers = [...base.players] as [PlayerState, PlayerState];
  newPlayers[1] = { ...newPlayers[1], leader: ace };

  let state: GameState = { ...base, players: newPlayers };
  state = registerTriggersForCard(state, ace, aceCard);
  return { state, ace };
}

function attackDeclaredEvent(targetInstanceId: string): GameEvent {
  return {
    type: "ATTACK_DECLARED",
    playerIndex: 0,
    payload: {
      attackerInstanceId: "char-0-v1",
      targetInstanceId,
      attackerPower: 5000,
    },
    timestamp: Date.now(),
  };
}

function attackTargetFinalEvent(targetInstanceId: string, redirected = false): GameEvent {
  return {
    type: "ATTACK_TARGET_FINAL",
    playerIndex: 1,
    payload: {
      attackerInstanceId: "char-0-v1",
      targetInstanceId,
      redirected,
    },
    timestamp: Date.now(),
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("OPT-246 — WHEN_ATTACKED target-locked dispatch", () => {
  it("OP03-001 schema uses [WHEN_ATTACKING, WHEN_ATTACKED] compound — not ON_OPPONENT_ATTACK", () => {
    const block = OP03_001_PORTGAS_D_ACE.effects.find(
      (e) => e.id === "attack_or_attacked_trash_buff",
    );
    expect(block).toBeDefined();
    const trigger = block!.trigger as { any_of: Array<{ keyword: string }> };
    expect(trigger.any_of).toBeDefined();
    const keywords = trigger.any_of.map((t) => t.keyword);
    expect(keywords).toContain("WHEN_ATTACKING");
    expect(keywords).toContain("WHEN_ATTACKED");
    expect(keywords).not.toContain("ON_OPPONENT_ATTACK");
  });

  it("Ace's WHEN_ATTACKED fires when Ace is the final attack target", () => {
    const cardDb = createTestCardDb();
    const { state, ace } = installAceAsDefenderLeader(cardDb);

    const matched = matchTriggersForEvent(state, attackTargetFinalEvent(ace.instanceId), cardDb);
    expect(
      matched.some((m) => m.trigger.sourceCardInstanceId === ace.instanceId),
    ).toBe(true);
  });

  it("Ace's WHEN_ATTACKED does NOT fire when a friendly Character is attacked instead", () => {
    // qa_op03.md:26-28 — "If my Character is attacked, can I activate this
    // Leader's [When Attacked] effect?" Answer: No.
    const cardDb = createTestCardDb();
    const { state, ace } = installAceAsDefenderLeader(cardDb);

    const friendlyCharId = state.players[1].characters.find((c) => c !== null)!.instanceId;
    const matched = matchTriggersForEvent(state, attackTargetFinalEvent(friendlyCharId), cardDb);

    expect(
      matched.some((m) => m.trigger.sourceCardInstanceId === ace.instanceId),
    ).toBe(false);
  });

  it("Ace's WHEN_ATTACKED does NOT fire on the ATTACK_DECLARED event (only on ATTACK_TARGET_FINAL)", () => {
    // Substep B (ATTACK_DECLARED) is the WHEN_ATTACKING / ON_OPPONENT_ATTACK
    // window. WHEN_ATTACKED must wait for ATTACK_TARGET_FINAL after Block Step
    // — this enforces the FAQ ordering "opp's [When Attacking] activates first".
    const cardDb = createTestCardDb();
    const { state, ace } = installAceAsDefenderLeader(cardDb);

    const matched = matchTriggersForEvent(state, attackDeclaredEvent(ace.instanceId), cardDb);
    expect(
      matched.some((m) => m.trigger.sourceCardInstanceId === ace.instanceId),
    ).toBe(false);
  });

  it("Ace's WHEN_ATTACKING DOES fire on ATTACK_DECLARED when Ace is the attacker", () => {
    // Compound any_of leg: when Ace attacks, the WHEN_ATTACKING leg matches.
    const cardDb = createTestCardDb();
    const aceCard = makeAceLeaderCard();
    cardDb.set(aceCard.id, aceCard);

    const base = createBattleReadyState(cardDb);
    const aceAttacker: CardInstance = {
      instanceId: "ace-leader-p0",
      cardId: aceCard.id,
      zone: "LEADER",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: null,
      controller: 0,
      owner: 0,
    };
    const newPlayers = [...base.players] as [PlayerState, PlayerState];
    newPlayers[0] = { ...newPlayers[0], leader: aceAttacker };
    let state: GameState = { ...base, players: newPlayers };
    state = registerTriggersForCard(state, aceAttacker, aceCard);

    const event: GameEvent = {
      type: "ATTACK_DECLARED",
      playerIndex: 0,
      payload: {
        attackerInstanceId: aceAttacker.instanceId,
        targetInstanceId: state.players[1].leader.instanceId,
        attackerPower: 5000,
      },
      timestamp: Date.now(),
    };
    const matched = matchTriggersForEvent(state, event, cardDb);
    expect(
      matched.some((m) => m.trigger.sourceCardInstanceId === aceAttacker.instanceId),
    ).toBe(true);
  });
});

// ─── Battle wiring: ATTACK_TARGET_FINAL emission ─────────────────────────────

describe("OPT-246 — ATTACK_TARGET_FINAL emitted at Block→Counter boundary", () => {
  /**
   * Build a state with a live battle in BLOCK_STEP so we can drive
   * executeDeclareBlocker / executePass directly.
   */
  function withLiveBattle(target: "leader" | "char"): {
    state: GameState;
    cardDb: Map<string, CardData>;
    attackerInstanceId: string;
    targetInstanceId: string;
  } {
    const cardDb = createTestCardDb();
    const base = createBattleReadyState(cardDb);
    const attackerInstanceId = base.players[0].characters[0]!.instanceId;
    const targetInstanceId =
      target === "leader" ? base.players[1].leader.instanceId : base.players[1].characters[0]!.instanceId;

    const state: GameState = {
      ...base,
      turn: {
        ...base.turn,
        battleSubPhase: "BLOCK_STEP",
        battle: {
          battleId: "battle-opt246",
          attackerInstanceId,
          targetInstanceId,
          attackerPower: 5000,
          defenderPower: 5000,
          counterPowerAdded: 0,
          blockerActivated: false,
        },
      },
    };
    return { state, cardDb, attackerInstanceId, targetInstanceId };
  }

  it("executePass(BLOCK_STEP) emits ATTACK_TARGET_FINAL with redirected=false on the original target", () => {
    const { state, cardDb, attackerInstanceId, targetInstanceId } = withLiveBattle("leader");

    const result = executePass(state, cardDb);

    const finals = result.events.filter((e) => e.type === "ATTACK_TARGET_FINAL");
    expect(finals.length).toBe(1);
    expect(finals[0].payload).toMatchObject({
      attackerInstanceId,
      targetInstanceId,
      redirected: false,
    });

    // Sequence: ATTACK_TARGET_FINAL must come BEFORE the PHASE_CHANGED to
    // COUNTER_STEP — otherwise WHEN_ATTACKED would race with Counter actions.
    const finalIdx = result.events.findIndex((e) => e.type === "ATTACK_TARGET_FINAL");
    const counterPhaseIdx = result.events.findIndex(
      (e) =>
        e.type === "PHASE_CHANGED" &&
        e.payload &&
        (e.payload as { to?: string }).to === "COUNTER_STEP",
    );
    expect(finalIdx).toBeGreaterThanOrEqual(0);
    expect(counterPhaseIdx).toBeGreaterThan(finalIdx);
  });

  it("executeDeclareBlocker emits ATTACK_TARGET_FINAL with redirected=true on the blocker", () => {
    // qa_op03.md:18-20 — if [Blocker] redirects, the new target is the
    // blocker. Original Leader's WHEN_ATTACKED must NOT fire.
    const { state, cardDb, attackerInstanceId } = withLiveBattle("leader");
    const blockerInstanceId = state.players[1].characters[1]!.instanceId; // CHAR-BLOCKER

    const result = executeDeclareBlocker(state, blockerInstanceId, cardDb);

    const finals = result.events.filter((e) => e.type === "ATTACK_TARGET_FINAL");
    expect(finals.length).toBe(1);
    expect(finals[0].payload).toMatchObject({
      attackerInstanceId,
      targetInstanceId: blockerInstanceId,
      redirected: true,
    });
  });

  it("blocker redirect: Ace as original target → Ace's WHEN_ATTACKED does NOT match the redirected event", () => {
    // End-to-end target-lock: dispatch on the ATTACK_TARGET_FINAL emitted
    // after the blocker grabs the attack. Ace is no longer the final
    // target, so its WHEN_ATTACKED leg does not match.
    const cardDb = createTestCardDb();
    const aceCard = makeAceLeaderCard();
    cardDb.set(aceCard.id, aceCard);

    const base = createBattleReadyState(cardDb);
    const ace: CardInstance = {
      instanceId: "ace-leader-p1",
      cardId: aceCard.id,
      zone: "LEADER",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: null,
      controller: 1,
      owner: 1,
    };
    const blocker: CardInstance = {
      instanceId: "blocker-p1",
      cardId: CARDS.BLOCKER.id,
      zone: "CHARACTER",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 1,
      controller: 1,
      owner: 1,
    };
    const newPlayers = [...base.players] as [PlayerState, PlayerState];
    newPlayers[1] = { ...newPlayers[1], leader: ace, characters: padChars([blocker]) };

    let state: GameState = {
      ...base,
      players: newPlayers,
      turn: {
        ...base.turn,
        battleSubPhase: "BLOCK_STEP",
        battle: {
          battleId: "battle-opt246-redirect",
          attackerInstanceId: "char-0-v1",
          targetInstanceId: ace.instanceId,
          attackerPower: 5000,
          defenderPower: 5000,
          counterPowerAdded: 0,
          blockerActivated: false,
        },
      },
    };
    state = registerTriggersForCard(state, ace, aceCard);

    const blockResult = executeDeclareBlocker(state, blocker.instanceId, cardDb);
    const final = blockResult.events.find((e) => e.type === "ATTACK_TARGET_FINAL")!;
    const finalEvent: GameEvent = {
      type: "ATTACK_TARGET_FINAL",
      playerIndex: final.playerIndex ?? 1,
      payload: final.payload,
      timestamp: Date.now(),
    } as GameEvent;

    const matched = matchTriggersForEvent(blockResult.state, finalEvent, cardDb);
    expect(
      matched.some((m) => m.trigger.sourceCardInstanceId === ace.instanceId),
    ).toBe(false);
  });
});
