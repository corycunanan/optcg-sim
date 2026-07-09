/**
 * OPT-426 — FORCE_OPPONENT_DON_RETURN draws from the whole field.
 *
 * `executeForceOpponentDonReturn` previously only ever counted / returned DON!!
 * in the opponent's cost area, so DON!! attached to their Leader or Characters
 * was invisible. OP16-074 Magellan's [On K.O.] "Your opponent returns 4 DON!!
 * cards from their field to their DON!! deck" silently no-op'd whenever the
 * opponent's cost area was empty but they had attached DON!!.
 *
 * The pool is now cost area + Leader-attached + Character-attached
 * (Comprehensive Rules 3-1-2 / 8-3-1-6). The DON!! owner chooses which to
 * return (their choice per the rules); attached DON!! detaches on return.
 */

import { describe, it, expect } from "vitest";
import type { CardData, GameState, PlayerState, CardInstance, DonInstance } from "../types.js";
import { createTestCardDb, createBattleReadyState, CARDS } from "./helpers.js";
import { resumeEffectChain } from "../engine/effect-resolver/index.js";
import { executeForceOpponentDonReturn } from "../engine/effect-resolver/actions/don.js";

function withPlayer(state: GameState, idx: 0 | 1, patch: Partial<PlayerState>): GameState {
  const newPlayers = [...state.players] as [PlayerState, PlayerState];
  newPlayers[idx] = { ...newPlayers[idx], ...patch };
  return { ...state, players: newPlayers };
}

const donAction = (amount: number) =>
  ({ type: "FORCE_OPPONENT_DON_RETURN", params: { amount } }) as never;

/** DON!! attached to a card carry `attachedTo` = the card's instanceId. */
function attachedDon(cardInstanceId: string, n: number, prefix: string): DonInstance[] {
  return Array.from({ length: n }, (_, i) => ({
    instanceId: `${prefix}-${i}`,
    state: "ACTIVE" as const,
    attachedTo: cardInstanceId,
  }));
}

function costAreaDon(active: number, rested: number): DonInstance[] {
  return [
    ...Array.from({ length: active }, (_, i) => ({ instanceId: `don-a-${i}`, state: "ACTIVE" as const, attachedTo: null })),
    ...Array.from({ length: rested }, (_, i) => ({ instanceId: `don-r-${i}`, state: "RESTED" as const, attachedTo: null })),
  ];
}

function makeChar(instanceId: string, attached: DonInstance[]): CardInstance {
  return {
    instanceId,
    cardId: CARDS.VANILLA.id,
    zone: "CHARACTER",
    state: "ACTIVE",
    attachedDon: attached,
    turnPlayed: 1,
    controller: 1,
    owner: 1,
  };
}

/** Build a P1 (the DON!! owner / opponent) field with cost-area + attached DON!!. */
function withOppField(
  state: GameState,
  opts: { costActive?: number; costRested?: number; leaderDon?: number; charDon?: number[] },
): GameState {
  const p1 = state.players[1];
  const leaderInstanceId = p1.leader.instanceId;
  const leader = {
    ...p1.leader,
    attachedDon: attachedDon(leaderInstanceId, opts.leaderDon ?? 0, "don-lead"),
  };
  const chars = (opts.charDon ?? []).map((n, i) =>
    makeChar(`char-1-c${i}`, attachedDon(`char-1-c${i}`, n, `don-c${i}`)),
  );
  // Pad to a stable 5-slot character row.
  const padded = [...chars, ...Array.from({ length: Math.max(0, 5 - chars.length) }, () => null)];
  return withPlayer(state, 1, {
    leader,
    characters: padded as PlayerState["characters"],
    donCostArea: costAreaDon(opts.costActive ?? 0, opts.costRested ?? 0),
    donDeck: [],
  });
}

const emptyRefs = () => new Map();

describe("OPT-426: FORCE_OPPONENT_DON_RETURN draws from the full field", () => {
  it("1 cost-area + 3 attached, amount 4 → all 4 returned (attached detached)", () => {
    const cardDb = createTestCardDb();
    const state = withOppField(createBattleReadyState(cardDb), { costActive: 1, charDon: [3] });

    const result = executeForceOpponentDonReturn(state, donAction(4), "char-0-v1", 0, cardDb, emptyRefs());
    expect(result.pendingPrompt).toBeUndefined(); // single distribution, no real choice
    expect(result.succeeded).toBe(true);

    const opp = result.state.players[1];
    expect(opp.donCostArea).toHaveLength(0);
    expect(opp.characters.find((c) => c?.instanceId === "char-1-c0")!.attachedDon).toHaveLength(0);
    expect(opp.donDeck).toHaveLength(4);
    // All returned DON!! are ACTIVE and unattached in the deck.
    expect(opp.donDeck.every((d) => d.state === "ACTIVE" && d.attachedTo === null)).toBe(true);
  });

  it("0 cost-area + 4 attached, amount 4 → succeeds, 4 detached and returned", () => {
    const cardDb = createTestCardDb();
    // 4 attached spread across the Leader and a Character.
    const state = withOppField(createBattleReadyState(cardDb), { leaderDon: 2, charDon: [2] });

    const result = executeForceOpponentDonReturn(state, donAction(4), "char-0-v1", 0, cardDb, emptyRefs());
    expect(result.pendingPrompt).toBeUndefined();
    expect(result.succeeded).toBe(true);

    const opp = result.state.players[1];
    expect(opp.leader.attachedDon).toHaveLength(0);
    expect(opp.characters.find((c) => c?.instanceId === "char-1-c0")!.attachedDon).toHaveLength(0);
    expect(opp.donCostArea).toHaveLength(0);
    expect(opp.donDeck).toHaveLength(4);
  });

  it("no field DON!! at all → mandatory effect fails softly", () => {
    const cardDb = createTestCardDb();
    const state = withOppField(createBattleReadyState(cardDb), {});
    const result = executeForceOpponentDonReturn(state, donAction(4), "char-0-v1", 0, cardDb, emptyRefs());
    expect(result.succeeded).toBe(false);
    expect(result.pendingPrompt).toBeUndefined();
  });

  it("more field DON!! than amount → owner is prompted and the chosen mix applies", () => {
    const cardDb = createTestCardDb();
    // 2 cost-area active + 2 attached on one Character; return 2.
    const state = withOppField(createBattleReadyState(cardDb), { costActive: 2, charDon: [2] });

    const result = executeForceOpponentDonReturn(state, donAction(2), "char-0-v1", 0, cardDb, emptyRefs());
    expect(result.pendingPrompt).toBeTruthy();
    const prompt = result.pendingPrompt!;
    expect(prompt.respondingPlayer).toBe(1); // the DON!! owner chooses
    expect(prompt.options.promptType).toBe("PLAYER_CHOICE");

    let ids: string[] = [];
    if (prompt.options.promptType === "PLAYER_CHOICE") {
      ids = prompt.options.choices.map((c) => c.id);
    }
    // Distributions of 2 across {cost-active(2), char(2)}: 2+0, 1+1, 0+2.
    expect(ids).toEqual([
      "don-return:0:2:char-1-c0=2",
      "don-return:1:2:char-1-c0=1",
      "don-return:2:2",
    ]);
    // Nothing moved yet.
    expect(result.state.players[1].donCostArea).toHaveLength(2);
    expect(result.state.players[1].characters.find((c) => c?.instanceId === "char-1-c0")!.attachedDon).toHaveLength(2);

    // Owner picks: 1 from cost area + 1 detached from the Character.
    const resumeCtx = prompt.resumeContext as never;
    const resumed = resumeEffectChain(
      result.state,
      resumeCtx,
      { type: "PLAYER_CHOICE", choiceId: "don-return:1:2:char-1-c0=1" },
      cardDb,
    );
    const opp = resumed.state.players[1];
    expect(opp.donCostArea).toHaveLength(1);
    expect(opp.characters.find((c) => c?.instanceId === "char-1-c0")!.attachedDon).toHaveLength(1);
    expect(opp.donDeck).toHaveLength(2);
    expect(opp.donDeck.every((d) => d.state === "ACTIVE" && d.attachedTo === null)).toBe(true);
  });

  it("rejects a choice id the prompt never offered (stale-modal defense)", () => {
    const cardDb = createTestCardDb();
    const state = withOppField(createBattleReadyState(cardDb), { costActive: 2, charDon: [2] });
    const result = executeForceOpponentDonReturn(state, donAction(2), "char-0-v1", 0, cardDb, emptyRefs());
    const resumeCtx = result.pendingPrompt!.resumeContext as never;

    const stale = resumeEffectChain(
      result.state,
      resumeCtx,
      { type: "PLAYER_CHOICE", choiceId: "don-return:0:2:char-1-c0=9" },
      cardDb,
    );
    expect(stale.resolved).toBe(false);
    // Field untouched.
    expect(stale.state.players[1].donCostArea).toHaveLength(2);
    expect(stale.state.players[1].characters.find((c) => c?.instanceId === "char-1-c0")!.attachedDon).toHaveLength(2);
  });

  it("caps the return at the total field DON!! when amount exceeds it", () => {
    const cardDb = createTestCardDb();
    // Only 3 field DON!! total (1 cost + 2 attached) but amount 4.
    const state = withOppField(createBattleReadyState(cardDb), { costActive: 1, charDon: [2] });
    const result = executeForceOpponentDonReturn(state, donAction(4), "char-0-v1", 0, cardDb, emptyRefs());
    expect(result.succeeded).toBe(true);
    const opp = result.state.players[1];
    expect(opp.donDeck).toHaveLength(3);
    expect(opp.donCostArea).toHaveLength(0);
    expect(opp.characters.find((c) => c?.instanceId === "char-1-c0")!.attachedDon).toHaveLength(0);
  });
});
