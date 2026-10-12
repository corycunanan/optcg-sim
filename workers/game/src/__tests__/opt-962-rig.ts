/**
 * Shared fixture for the OPT-962 End Phase tests (OPT-924). Not a test file:
 * vitest re-registers suites in every importer of a `*.test.ts`, so helpers
 * shared across files live here.
 *
 * Drives the real pipeline (`runPipeline`) for actions and the real prompt
 * lifecycle (`resumePromptLifecycle`) for prompt replies, as the timing
 * baseline README §1 requires.
 */

import { expect } from "vitest";
import type { CardData, CardInstance, GameAction, GameState, LifeCard } from "../types.js";
import type { EffectSchema } from "../engine/effect-types.js";
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

let serial = 0;

export function endPhaseRig(opts: { handSize?: number; deckSize?: number } = {}): EndPhaseRig {
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
      expect(schema, `${id} authored`).toBeDefined();
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
        expect(r.responseRejected, JSON.stringify({ action, prompt: state.pendingPrompt?.options })).toBe(false);
        state = r.state;
      } else {
        const r = runPipeline(state, action, db, player);
        expect(r.valid, r.error).toBe(true);
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
