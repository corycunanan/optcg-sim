import { chooseFirstObligation } from "../opt-981-test-ordering.js";
/**
 * OPT-962 (OPT-924) version 2 End Phase states, produced by the real engine.
 *
 * Every state is SYNTHETIC: the real End Phase parked at each stage it can
 * park in, never a captured Durable Object session. The JSON fixture the
 * PR 4a reader tests load (`opt-962-v2-states.json` in that PR) was written
 * from these builders at the PR 4b prototype; `opt-962-v2-shapes.test.ts`
 * (PR 4b) asserts the engine still produces exactly those persisted shapes,
 * so a drift between the deployed reader and this writer fails loudly.
 *
 * Deterministic: no Date.now, no Math.random; the engine RNG is state-owned.
 * No vitest import, so a script can run it under tsx.
 */

import type { CardData, CardInstance, EffectStackFrame, GameAction, GameState, LifeCard } from "../../types.js";
import type { EffectSchema, RuntimeScheduledAction } from "../../engine/effect-types.js";
import { getEffectSchema } from "../../engine/schema-registry.js";
import { runPipeline } from "../../engine/pipeline.js";
import { resumePromptLifecycle } from "../../session/prompt-lifecycle.js";
import { registerCardEnteredField } from "../../engine/triggers.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "../helpers.js";

export interface V2EndPhaseState {
  name: string;
  /** Which stage the End Phase frame is parked in, and what holds it there. */
  shape: string;
  state: GameState;
}

class Table {
  readonly db = createTestCardDb();
  state: GameState;
  private serial = 0;

  constructor() {
    let state = createBattleReadyState(this.db);
    state.players.forEach((p, owner) => {
      p.characters = padChars([]);
      p.hand = Array.from({ length: 2 }, (_, i) => this.vanilla(`hand-${owner}-${i}`, owner as 0 | 1, "HAND"));
      p.deck = Array.from({ length: 6 }, (_, i) => this.vanilla(`deck-${owner}-${i}`, owner as 0 | 1, "DECK"));
      p.life = Array.from({ length: 4 }, (_, i): LifeCard => ({ instanceId: `life-${owner}-${i}`, cardId: CARDS.VANILLA.id, face: "DOWN" }));
    });
    state = { ...state, eventLog: [] };
    this.state = state;
  }

  private vanilla(instanceId: string, owner: 0 | 1, zone: CardInstance["zone"]): CardInstance {
    return { instanceId, cardId: CARDS.VANILLA.id, controller: owner, owner, zone, state: "ACTIVE", attachedDon: [], turnPlayed: 0 };
  }

  private place(id: string, data: CardData, owner: 0 | 1, zone: CardInstance["zone"], cardState: "ACTIVE" | "RESTED" = "ACTIVE"): CardInstance {
    this.db.set(id, data);
    const card: CardInstance = {
      instanceId: `${id}-${owner}-${this.serial++}`,
      cardId: id,
      controller: owner,
      owner,
      zone,
      state: cardState,
      attachedDon: [],
      turnPlayed: 0,
    };
    if (zone === "HAND") this.state.players[owner].hand.push(card);
    else {
      const slot = this.state.players[owner].characters.findIndex((x) => !x);
      this.state.players[owner].characters[slot] = card;
      this.state = registerCardEnteredField(this.state, card, data);
    }
    return card;
  }

  authored(id: string, owner: 0 | 1, data: Partial<CardData> = {}, cardState: "ACTIVE" | "RESTED" = "ACTIVE"): CardInstance {
    const schema = getEffectSchema(id);
    if (!schema) throw new Error(`${id} is not authored`);
    return this.place(id, { ...CARDS.VANILLA, id, name: schema.card_name ?? id, effectText: "", ...data, effectSchema: schema }, owner, "CHARACTER", cardState);
  }

  synthetic(id: string, effects: EffectSchema["effects"], owner: 0 | 1): CardInstance {
    const schema: EffectSchema = { card_id: id, card_name: id, card_type: "Character", effects };
    return this.place(id, { ...CARDS.VANILLA, id, name: id, effectText: "", effectSchema: schema }, owner, "CHARACTER");
  }

  act(action: GameAction, player: 0 | 1 = this.state.turn.activePlayerIndex): void {
    if (this.state.pendingPrompt) {
      const result = resumePromptLifecycle(this.state, action, this.db, {
        drainPregame: (s) => s,
        advanceStartOfTurn: (s) => s,
      });
      if (result.responseRejected) throw new Error(`v2 states: reply rejected ${JSON.stringify(action)}`);
      this.state = result.state;
      return;
    }
    const result = runPipeline(this.state, action, this.db, player);
    if (!result.valid) throw new Error(`v2 states: ${action.type} rejected: ${result.error}`);
    this.state = chooseFirstObligation(result.state, this.db);
  }

  parked(): EffectStackFrame {
    const frame = this.state.effectStack.find((f) => f.phaseBoundaryContinuation);
    if (!frame || !this.state.pendingPrompt) throw new Error("v2 states: expected a prompt above a parked End Phase");
    return frame;
  }
}

const DRAW_1 = { type: "DRAW" as const, params: { amount: 1 } };

function eoytDraw(id: string, keyword: "END_OF_YOUR_TURN" | "END_OF_OPPONENT_TURN", optional = false): EffectSchema["effects"] {
  return [{
    id: `${id}-block`,
    category: "auto",
    trigger: { keyword },
    ...(optional ? { flags: { optional: true } } : {}),
    actions: [DRAW_1],
  }];
}

function scheduled(id: string, controller: 0 | 1, action: RuntimeScheduledAction["action"]): RuntimeScheduledAction {
  return { id, timing: "END_OF_THIS_TURN", action, boundToInstanceId: null, sourceEffectId: `src-${id}`, controller };
}

/** OP04-034 asks p0 to choose the K.O. target: wave 1, one effect activated. */
function waveOneSelectTarget(): Table {
  const t = new Table();
  t.authored("OP04-034", 0);
  t.authored("OP03-015", 1, { cost: 3 }, "RESTED");
  t.act({ type: "ADVANCE_PHASE" });
  t.parked();
  return t;
}

function scheduledKo(): RuntimeScheduledAction["action"] {
  return { type: "KO", target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 } } };
}

export function buildV2EndPhaseStates(): V2EndPhaseState[] {
  const out: V2EndPhaseState[] = [];

  const w1 = waveOneSelectTarget();
  out.push({ name: "wave1-select-target", shape: "END_OF_YOUR_TURN_WAVE; OP04-034's SELECT_TARGET (p0) above the End Phase frame", state: w1.state });

  const nested = waveOneSelectTarget();
  const lim = nested.state.players[1].characters.find((c) => c?.cardId === "OP03-015")!;
  nested.act({ type: "SELECT_TARGET", selectedInstanceIds: [lim.instanceId] });
  nested.parked();
  out.push({ name: "wave1-nested-opponent-prompt", shape: "END_OF_YOUR_TURN_WAVE; Lim's [Opponent's Turn] On K.O. SELECT_TARGET (p1) nested inside p0's wave", state: nested.state });

  const order = new Table();
  order.synthetic("SYN-EOYT-A", eoytDraw("SYN-EOYT-A", "END_OF_YOUR_TURN"), 0);
  order.synthetic("SYN-EOYT-B", eoytDraw("SYN-EOYT-B", "END_OF_YOUR_TURN"), 0);
  order.act({ type: "ADVANCE_PHASE" });
  order.parked();
  out.push({ name: "wave1-trigger-order", shape: "END_OF_YOUR_TURN_WAVE; p0's trigger-order PLAYER_CHOICE for two [End of Your Turn] effects", state: order.state });

  const w2 = new Table();
  w2.synthetic("SYN-EOYT-C", eoytDraw("SYN-EOYT-C", "END_OF_YOUR_TURN"), 0);
  w2.synthetic("SYN-EOOT-D", eoytDraw("SYN-EOOT-D", "END_OF_OPPONENT_TURN", true), 1);
  w2.act({ type: "ADVANCE_PHASE" });
  w2.parked();
  out.push({ name: "wave2-optional", shape: "END_OF_OPPONENT_TURN_WAVE; p1's OPTIONAL_EFFECT, both waves' effects in activatedWaveEffects", state: w2.state });

  const s1 = new Table();
  s1.authored("OP03-015", 1, { cost: 3 });
  s1.state = { ...s1.state, scheduledActions: [scheduled("s1-ko", 0, scheduledKo()), scheduled("s1-draw", 0, DRAW_1)] };
  s1.act({ type: "ADVANCE_PHASE" });
  s1.parked();
  out.push({ name: "step1-scheduled-prompt", shape: "TURN_PLAYER_END_OF_TURN; p0's scheduled K.O. SELECT_TARGET, one TURN_PLAYER entry remaining", state: s1.state });

  const s2 = new Table();
  s2.authored("OP03-015", 0, { cost: 3 });
  s2.state = { ...s2.state, scheduledActions: [scheduled("s2-ko", 1, scheduledKo()), scheduled("s2-draw", 1, DRAW_1)] };
  s2.act({ type: "ADVANCE_PHASE" });
  s2.parked();
  out.push({ name: "step2-scheduled-prompt", shape: "NON_TURN_PLAYER_END_OF_TURN; p1's scheduled K.O. SELECT_TARGET, one NON_TURN_PLAYER entry remaining", state: s2.state });

  // A version 1 frame (converted to LEGACY_SCHEDULED_ACTIONS) re-parks with
  // its legacy meaning: the v1 resume path drains the list in v1 order.
  const legacy = new Table();
  legacy.authored("OP03-015", 1, { cost: 3 });
  legacy.authored("OP03-015", 1, { cost: 3 });
  legacy.state = { ...legacy.state, scheduledActions: [scheduled("lg-ko", 0, scheduledKo())] };
  legacy.act({ type: "ADVANCE_PHASE" });
  const frame = legacy.parked();
  legacy.state = {
    ...legacy.state,
    effectStack: legacy.state.effectStack.map((f) => f === frame
      ? {
          ...f,
          phaseBoundaryContinuation: {
            kind: "END_PHASE",
            endingPlayerIndex: 0,
            stage: "LEGACY_SCHEDULED_ACTIONS",
            remainingScheduledActions: [
              { action: scheduledKo(), controller: 0, sourceEffectId: "src-lg-ko-2" },
              { action: DRAW_1, controller: 0, sourceEffectId: "src-lg-draw" },
            ],
          },
        }
      : f),
  };
  legacy.act({ type: "SELECT_TARGET", selectedInstanceIds: [] });
  legacy.parked();
  out.push({ name: "legacy-reparked", shape: "LEGACY_SCHEDULED_ACTIONS re-parked by the legacy resume path; entries carry no step, no activatedWaveEffects", state: legacy.state });

  // A version 2 state with nothing parked: the turn completed.
  const done = new Table();
  done.synthetic("SYN-EOYT-E", eoytDraw("SYN-EOYT-E", "END_OF_YOUR_TURN"), 0);
  done.act({ type: "ADVANCE_PHASE" });
  if (done.state.pendingPrompt || done.state.effectStack.length > 0) throw new Error("v2 states: expected a completed End Phase");
  out.push({ name: "turn-completed", shape: "no parked frame; p1's Refresh Phase after a full End Phase", state: done.state });

  return out;
}
