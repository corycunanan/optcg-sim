/**
 * Timing baseline F11 (README §2). Oracle = README, never the engine.
 *
 * F11a  Rule 7-1-1-4 (line 640): end of the Attack Step, a combatant moved -> End of Battle, no Block Step.
 * F11b  Rule 7-1-2-3 (line 648): end of the Block Step (leave happens inside a prompt, OPT-951) -> End of Battle, no Counter Step.
 * FAQ   qa_rules.md Basic Rules (leg-7 R20): "Yes. The battle ends without the next step."
 */
import { describe, it, expect } from "vitest";
import type { CardData, CardInstance, GameEvent, GameState, PlayerState } from "../../types.js";
import type { EffectBlock } from "../../engine/effect-types.js";
import { runPipeline } from "../../engine/pipeline.js";
import { registerTriggersForCard } from "../../engine/triggers.js";
import { resumePromptLifecycle } from "../../session/prompt-lifecycle.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "../helpers.js";

function synChar(id: string, block: EffectBlock, blocker = false): CardData {
  return {
    ...CARDS.VANILLA,
    id,
    name: id,
    keywords: { ...CARDS.VANILLA.keywords, blocker },
    effectSchema: { card_id: id, card_name: id, card_type: "Character", effects: [block] },
  };
}

function putChar(state: GameState, owner: 0 | 1, data: CardData, instanceId: string): GameState {
  const card: CardInstance = {
    instanceId,
    cardId: data.id,
    zone: "CHARACTER",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: 1,
    controller: owner,
    owner,
  };
  const players = [...state.players] as [PlayerState, PlayerState];
  players[owner] = {
    ...players[owner],
    characters: padChars([...(players[owner].characters.filter(Boolean) as CardInstance[]), card]),
  };
  return registerTriggersForCard({ ...state, players }, card, data);
}

const log = (s: GameState, from: number): readonly GameEvent[] => s.eventLog.slice(from);
const count = (events: readonly GameEvent[], type: string) => events.filter((e) => e.type === type).length;

describe("F11a [Rule 7-1-1-4 line 640; FAQ qa_rules.md Basic Rules leg-7 R20] attacker K.O.'d in the Attack Step: no Block Step", () => {
  // OPT-967 corrects the historical next-step notification before the zone checkpoint.
  // Rule 7-1-1-4 (line 640): a moved combatant sends the battle to End of Battle, not the Block Step.
  it("F11a battle ends at the end of the Attack Step (corrected OPT-967)", () => {
    const db = new Map(createTestCardDb());
    // Stands in for a p1 Character with [On Your Opponent's Attack]: K.O. the attacker by name.
    const watcher = synChar("SYN-ON-OPP-ATTACK-KO", {
      id: "syn_on_opp_attack_ko",
      category: "auto",
      trigger: { keyword: "ON_OPPONENT_ATTACK" },
      actions: [
        {
          type: "KO",
          target: { type: "CHARACTER", controller: "OPPONENT", filter: { name: CARDS.VANILLA.name } },
        },
      ],
    });
    db.set(watcher.id, watcher);
    let state = putChar(createBattleReadyState(db), 1, watcher, "syn-watcher");
    const attacker = state.players[0].characters[0]!;
    expect(attacker.cardId).toBe(CARDS.VANILLA.id);
    const start = state.eventLog.length;

    const r = runPipeline(
      state,
      { type: "DECLARE_ATTACK", attackerInstanceId: attacker.instanceId, targetInstanceId: state.players[1].leader.instanceId },
      db,
      0,
    );
    expect(r.valid).toBe(true);
    state = r.state;
    const events = log(state, start);

    // The K.O. really happened (setup check).
    expect(events.some((e) => e.type === "CARD_KO")).toBe(true);
    expect(state.turn.battleSubPhase).toBeNull();
    expect(state.turn.battle).toBeNull();
    expect(state.pendingPrompt).toBeNull();
    expect(
      events.some(
        (e) =>
          e.type === "PHASE_CHANGED" &&
          e.payload?.from === "ATTACK_STEP" &&
          e.payload?.to === "BLOCK_STEP"
      )
    ).toBe(false);
    expect(count(events, "DAMAGE_DEALT")).toBe(0);
    const end = events.filter((e) => e.type === "END_OF_BATTLE");
    expect(end.length).toBe(1);
    expect((end[0].payload as { aborted?: boolean }).aborted).toBe(true);
  });
});

describe("F11b [Rule 7-1-2-3 line 648; FAQ qa_rules.md Basic Rules leg-7 R20] attacker K.O.'d inside a Block Step prompt: no Counter Step", () => {
  // OPT-967 holds the next-step notification until the prompted window finishes.
  // Rule 7-1-2-3 (line 648): a moved combatant sends the battle to End of Battle, not the Counter Step.
  it("F11b battle ends at the end of the Block Step (corrected OPT-967)", () => {
    const db = new Map(createTestCardDb());
    // Stands in for a p1 [Blocker] Character with [On Block]: K.O. up to 1 opponent Character (prompt).
    const blocker = synChar(
      "SYN-BLOCKER-ONBLOCK",
      {
        id: "syn_blocker_onblock",
        category: "auto",
        trigger: { keyword: "ON_BLOCK" },
        actions: [{ type: "KO", target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 } } }],
      },
      true,
    );
    db.set(blocker.id, blocker);
    let state = putChar(createBattleReadyState(db), 1, blocker, "syn-blocker");
    // Drop the stock p1 blocker so the synthetic one is the only legal block.
    const p1 = state.players[1];
    const players = [...state.players] as [PlayerState, PlayerState];
    players[1] = { ...p1, characters: padChars((p1.characters.filter(Boolean) as CardInstance[]).filter((c) => c.cardId !== CARDS.BLOCKER.id)) };
    state = { ...state, players };
    const attacker = state.players[0].characters[0]!;
    const start = state.eventLog.length;

    let r = runPipeline(
      state,
      { type: "DECLARE_ATTACK", attackerInstanceId: attacker.instanceId, targetInstanceId: state.players[1].leader.instanceId },
      db,
      0,
    );
    expect(r.valid).toBe(true);
    r = runPipeline(r.state, { type: "DECLARE_BLOCKER", blockerInstanceId: "syn-blocker" }, db, 1);
    expect(r.valid, r.error).toBe(true);
    state = r.state;
    expect(state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");

    const reply = resumePromptLifecycle(
      structuredClone(state),
      { type: "SELECT_TARGET", selectedInstanceIds: [attacker.instanceId], promptId: state.pendingPrompt?.promptId } as never,
      db,
      { drainPregame: (s) => s, advanceStartOfTurn: (s) => s },
    );
    expect(reply.responseRejected).toBe(false);
    state = reply.state;
    const events = log(state, start);

    expect(events.some((e) => e.type === "CARD_KO")).toBe(true);
    expect(state.turn.battleSubPhase).toBeNull();
    expect(state.turn.battle).toBeNull();
    // No Counter Step reached.
    const phases = events.filter((e) => e.type === "PHASE_CHANGED").map((e) => JSON.stringify(e.payload));
    expect(phases.some((p) => p.includes("COUNTER_STEP"))).toBe(false);
    expect(count(events, "DAMAGE_DEALT")).toBe(0);
  });
});
