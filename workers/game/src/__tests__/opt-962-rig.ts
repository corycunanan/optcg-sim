/**
 * Shared fixture for the OPT-962 End Phase tests (OPT-924). Not a test file:
 * vitest re-registers suites in every importer of a `*.test.ts`, so helpers
 * shared across files live here.
 *
 * No vitest import: scripts run it under tsx (PR body proofs).
 * Drives the real pipeline (`runPipeline`) for actions and the real prompt
 * lifecycle (`resumePromptLifecycle`) for prompt replies, as the timing
 * baseline README §1 requires.
 */

import type { CardData, CardInstance, GameAction, GameState, LifeCard } from "../types.js";
import type { EffectSchema, RuntimeScheduledAction } from "../engine/effect-types.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { runPipeline } from "../engine/pipeline.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";

export interface EndPhaseRig {
  db: Map<string, CardData>;
  state: GameState;
  /** Put an authored card (production schema registry). */
  put(id: string, owner: 0 | 1, zone: CardInstance["zone"], data?: Partial<CardData>, don?: number): CardInstance;
  /** Put a synthetic card with an inline schema. */
  putSyn(id: string, schema: EffectSchema | null, owner: 0 | 1, zone: CardInstance["zone"], data?: Partial<CardData>): CardInstance;
  /** Run an action through the pipeline, or answer the pending prompt. */
  act(action: GameAction, player?: 0 | 1): void;
  /** Answer every trigger-order prompt with its first enabled choice. */
  orderTriggers(): number;
  /** `TYPE:pN` for every logged event. */
  log(): string[];
}

export function endPhaseRig(opts: { handSize?: number; deckSize?: number } = {}): EndPhaseRig {
  // Per rig, so two rigs built the same way have identical instance ids.
  let serial = 0;
  const db = createTestCardDb();
  let state = createBattleReadyState(db);
  const handSize = opts.handSize ?? 2;
  state.players.forEach((p, owner) => {
    p.characters = padChars([]);
    p.hand = Array.from({ length: handSize }, (_, i) => vanilla(`hand-${owner}-${i}`, owner as 0 | 1, "HAND"));
    p.deck = Array.from({ length: opts.deckSize ?? 6 }, (_, i) => vanilla(`deck-${owner}-${i}`, owner as 0 | 1, "DECK"));
    p.life = Array.from({ length: 4 }, (_, i): LifeCard => ({
      instanceId: `life-${owner}-${i}`,
      cardId: CARDS.VANILLA.id,
      face: "DOWN",
    }));
  });
  state = { ...state, eventLog: [] };

  function vanilla(instanceId: string, owner: 0 | 1, zone: CardInstance["zone"]): CardInstance {
    return { instanceId, cardId: CARDS.VANILLA.id, controller: owner, owner, zone, state: "ACTIVE", attachedDon: [], turnPlayed: 0 };
  }

  function place(c: CardInstance, data: CardData): CardInstance {
    if (c.zone === "HAND") state.players[c.owner].hand.push(c);
    else if (c.zone === "LEADER") state.players[c.owner].leader = c;
    else {
      const slot = state.players[c.owner].characters.findIndex((x) => !x);
      state.players[c.owner].characters[slot] = c;
    }
    if (c.zone !== "HAND") state = registerCardEnteredField(state, c, data);
    return c;
  }

  function instance(id: string, owner: 0 | 1, zone: CardInstance["zone"], don = 0): CardInstance {
    const instanceId = `${id}-${owner}-${zone}-${serial++}`;
    return {
      instanceId,
      cardId: id,
      controller: owner,
      owner,
      zone,
      state: "ACTIVE",
      attachedDon: Array.from({ length: don }, (_, i) => ({
        instanceId: `don-attached-${instanceId}-${i}`,
        state: "ACTIVE" as const,
        attachedTo: instanceId,
      })),
      turnPlayed: 0,
    };
  }

  const rig: EndPhaseRig = {
    db,
    get state() {
      return state;
    },
    set state(next: GameState) {
      state = next;
    },
    put(id, owner, zone, data = {}, don = 0) {
      const schema = getEffectSchema(id);
      if (!schema) throw new Error(`${id} is not authored`);
      const cardData: CardData = {
        ...(zone === "LEADER" ? CARDS.LEADER : CARDS.VANILLA),
        id,
        name: schema!.card_name ?? id,
        effectText: "",
        ...data,
        effectSchema: schema!,
      };
      db.set(id, cardData);
      return place(instance(id, owner, zone, don), cardData);
    },
    putSyn(id, schema, owner, zone, data = {}) {
      const cardData: CardData = {
        ...(zone === "LEADER" ? CARDS.LEADER : CARDS.VANILLA),
        id,
        name: id,
        effectText: "",
        ...data,
        effectSchema: schema,
      };
      db.set(id, cardData);
      return place(instance(id, owner, zone), cardData);
    },
    act(action, player = state.turn.activePlayerIndex) {
      if (state.pendingPrompt) {
        const r = resumePromptLifecycle(state, action, db, {
          drainPregame: (s) => s,
          advanceStartOfTurn: (s) => s,
        });
        if (r.responseRejected) throw new Error(`reply rejected: ${JSON.stringify({ action, prompt: state.pendingPrompt?.options })}`);
        state = r.state;
      } else {
        const r = runPipeline(state, action, db, player);
        if (!r.valid) throw new Error(`${action.type} rejected: ${r.error}`);
        state = r.state;
      }
    },
    orderTriggers() {
      let answered = 0;
      for (let i = 0; i < 10; i++) {
        const prompt = state.pendingPrompt;
        if (prompt?.options.promptType !== "PLAYER_CHOICE") break;
        if (prompt.options.effectDescription !== "Choose which effect to activate first") break;
        const next = prompt.options.choices!.find((c) => !c.disabled && c.id !== "done");
        if (!next) break;
        rig.act({ type: "PLAYER_CHOICE", choiceId: next.id });
        answered++;
      }
      return answered;
    },
    log() {
      return state.eventLog.map((e) => `${e.type}:p${e.playerIndex}`);
    },
  };
  return rig;
}

export function synSchema(id: string, type: "Character" | "Leader", effects: EffectSchema["effects"], extra: Partial<EffectSchema> = {}): EffectSchema {
  return { card_id: id, card_name: id, card_type: type, effects, ...extra };
}

/**
 * Every stage in one End Phase (opt-962-end-phase-persistence.test.ts table):
 * OP04-034 + Lim (wave 1, nested), an optional [End of Your Opponent's Turn]
 * draw (wave 2), and a scheduled K.O. then draw for each player (steps 1, 2).
 */
export function fullEndPhaseScenario(): EndPhaseRig {
  const r = endPhaseRig();
  r.put("OP04-034", 0, "CHARACTER");
  const lim = r.put("OP03-015", 1, "CHARACTER", { cost: 3 });
  r.state.players[1].characters = r.state.players[1].characters.map((c) =>
    c?.instanceId === lim.instanceId ? { ...c, state: "RESTED" } : c
  ) as GameState["players"][1]["characters"];
  r.putSyn("SYN-P1-TARGET", null, 1, "CHARACTER");
  r.putSyn("SYN-EOOT-OPT", synSchema("SYN-EOOT-OPT", "Character", [{
    id: "eoot-optional-draw",
    category: "auto",
    trigger: { keyword: "END_OF_OPPONENT_TURN" },
    flags: { optional: true },
    actions: [{ type: "DRAW", params: { amount: 1 } }],
  }]), 1, "CHARACTER");
  const ko = (id: string, controller: 0 | 1): RuntimeScheduledAction => ({
    id,
    timing: "END_OF_THIS_TURN",
    action: { type: "KO", target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 } } },
    boundToInstanceId: null,
    sourceEffectId: `src-${id}`,
    controller,
  });
  const draw = (id: string, controller: 0 | 1): RuntimeScheduledAction => ({
    id, timing: "END_OF_THIS_TURN", action: { type: "DRAW", params: { amount: 1 } }, boundToInstanceId: null, sourceEffectId: `src-${id}`, controller,
  });
  r.state = { ...r.state, scheduledActions: [ko("p0-ko", 0), draw("p0-draw", 0), ko("p1-ko", 1), draw("p1-draw", 1)] };
  return r;
}

export const EXPECTED_STAGES = [
  "END_OF_YOUR_TURN_WAVE",
  "END_OF_YOUR_TURN_WAVE",
  "END_OF_OPPONENT_TURN_WAVE",
  "TURN_PLAYER_END_OF_TURN",
  "NON_TURN_PLAYER_END_OF_TURN",
];

/** The fixed reply for the n-th prompt. */
export function fullEndPhaseReply(r: EndPhaseRig, n: number): { action: GameAction; player: 0 | 1 } {
  const lim = r.state.players[1].characters.find((c) => c?.cardId === "OP03-015");
  switch (n) {
    case 0: return { action: { type: "SELECT_TARGET", selectedInstanceIds: [lim!.instanceId] }, player: 0 };
    case 1: return { action: { type: "SELECT_TARGET", selectedInstanceIds: [r.state.players[0].leader.instanceId] }, player: 1 };
    case 2: return { action: { type: "PLAYER_CHOICE", choiceId: "accept" }, player: 1 };
    case 3: return { action: { type: "SELECT_TARGET", selectedInstanceIds: [] }, player: 0 };
    case 4: return { action: { type: "SELECT_TARGET", selectedInstanceIds: [] }, player: 1 };
    default: throw new Error(`unexpected prompt ${n}: ${r.state.pendingPrompt?.options.promptType}`);
  }
}

