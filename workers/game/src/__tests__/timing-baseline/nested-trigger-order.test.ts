/**
 * Timing baseline F1 / F2 (OPT-939 fixtures, README §2).
 *
 * F1: Rule 8-6-1 (rule_comprehensive.md:858); FAQ qa_op07.md:206-210 (OP07-019).
 * F2: Rule 8-6-1-1 (rule_comprehensive.md:860); FAQ qa_op10.md:279-281 (OP10-042).
 */

import { describe, expect, it } from "vitest";
import type { CardData, CardInstance, GameAction, GameState } from "../../types.js";
import type { EffectSchema } from "../../engine/effect-types.js";
import { runPipeline } from "../../engine/pipeline.js";
import { registerCardEnteredField } from "../../engine/triggers.js";
import { resumePromptLifecycle } from "../../session/prompt-lifecycle.js";
import { SessionRepository, type SessionStorage } from "../../session/persistence.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "../helpers.js";

// ─── harness ─────────────────────────────────────────────────────────────────

class MemoryStorage implements SessionStorage {
  readonly data = new Map<string, unknown>();
  async get<T>(key: string): Promise<T | undefined> {
    return this.data.get(key) as T | undefined;
  }
  async put(key: string, value: unknown): Promise<void>;
  async put(entries: Record<string, unknown>): Promise<void>;
  async put(k: string | Record<string, unknown>, v?: unknown): Promise<void> {
    const entries = typeof k === "string" ? { [k]: v } : k;
    for (const [key, entry] of Object.entries(entries)) this.data.set(key, structuredClone(entry));
  }
  async setAlarm(): Promise<void> {}
  async deleteAlarm(): Promise<void> {}
}

function synCard(id: string, schema: EffectSchema | null, overrides: Partial<CardData> = {}): CardData {
  return { ...CARDS.VANILLA, id, name: id, effectSchema: schema, ...overrides };
}

function schema(id: string, type: "Character" | "Leader", effects: EffectSchema["effects"]): EffectSchema {
  return { card_id: id, card_name: id, card_type: type, effects };
}

let serial = 0;
function inst(cardId: string, controller: 0 | 1, zone: CardInstance["zone"]): CardInstance {
  return {
    instanceId: `${cardId}#${serial++}`,
    cardId,
    zone,
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: 1,
    controller,
    owner: controller,
  };
}

interface Built {
  state: GameState;
  cardDb: Map<string, CardData>;
}

/** Fresh MAIN-phase state with empty boards/hands; callers place cards. */
function base(cards: CardData[]): Built {
  const cardDb = new Map(createTestCardDb());
  for (const c of cards) cardDb.set(c.id, c);
  const state = createBattleReadyState(cardDb);
  const strip = (p: GameState["players"][0]): GameState["players"][0] => ({
    ...p,
    characters: padChars([]) as GameState["players"][0]["characters"],
    hand: [],
  });
  const players: GameState["players"] = [strip(state.players[0]), strip(state.players[1])];
  return { state: { ...state, players, eventLog: [] }, cardDb };
}

function place(b: Built, card: CardInstance): CardInstance {
  const p = b.state.players[card.controller];
  if (card.zone === "CHARACTER") {
    p.characters[p.characters.findIndex((c) => !c)] = card;
    b.state = registerCardEnteredField(b.state, card, b.cardDb.get(card.cardId)!);
  } else if (card.zone === "LEADER") {
    p.leader = card;
    b.state = registerCardEnteredField(b.state, card, b.cardDb.get(card.cardId)!);
  } else if (card.zone === "HAND") {
    p.hand.push(card);
  }
  return card;
}

function run(b: Built, action: GameAction, player: 0 | 1): void {
  const r = runPipeline(b.state, action, b.cardDb, player);
  expect(r.valid, r.error).toBe(true);
  b.state = r.state;
}

function reply(state: GameState, cardDb: Map<string, CardData>, action: GameAction): GameState {
  const r = resumePromptLifecycle(state, action, cardDb, {
    drainPregame: (s) => s,
    advanceStartOfTurn: (s) => s,
  });
  expect(r.responseRejected, JSON.stringify({ action, prompt: state.pendingPrompt })).toBeFalsy();
  return r.state;
}

async function reload(b: Built): Promise<Built> {
  const repo = new SessionRepository(new MemoryStorage(), { nextJsUrl: "https://app.example.test", workerSecret: "secret" });
  await repo.save({ state: b.state, cardDb: b.cardDb, mode: "PVP", pregameMode: "PRIORITY_ROLL", testPriorityRolls: null, undoHistory: [] });
  const loaded = await repo.load();
  expect(loaded).not.toBeNull();
  return { state: loaded!.state, cardDb: loaded!.cardDb as Map<string, CardData> };
}

/**
 * Event order by first occurrence of each type+player. First occurrence keeps the
 * assertion on ordering only: the engine currently logs F1a's CARD_PLAYED and
 * POWER_MODIFIED twice, which is a separate defect.
 */
function order(state: GameState, types: string[]): string[] {
  const seen: string[] = [];
  for (const e of state.eventLog) {
    if (!types.includes(e.type)) continue;
    const key = `${e.type}:p${e.playerIndex}`;
    if (!seen.includes(key)) seen.push(key);
  }
  return seen;
}

function promptOptions(state: GameState): { promptType: string; choices?: { id: string; label?: string }[] } {
  return state.pendingPrompt!.options as never;
}

// ─── F1 ──────────────────────────────────────────────────────────────────────

const C_ID = "SYN-C-ONPLAY"; // stands in for OP07-019's Jinbe
const A_ID = "SYN-A-ATTACKER"; // stands in for Doflamingo
const X_ID = "SYN-X-WATCHER"; // stands in for Jewelry Bonney

function f1Cards(upTo: boolean): CardData[] {
  const playC: EffectSchema["effects"] = [
    {
      id: "a-when-attacking",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            source_zone: "HAND",
            controller: "SELF",
            count: upTo ? { up_to: 1 } : { exact: 1 },
            filter: { name: C_ID },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
  ];
  return [
    synCard(A_ID, schema(A_ID, "Character", playC)),
    synCard(X_ID, schema(X_ID, "Character", [
      {
        id: "x-opp-attack",
        category: "auto",
        trigger: { keyword: "ON_OPPONENT_ATTACK" },
        actions: [{ type: "DRAW", params: { amount: 1 } }],
      },
    ])),
    synCard(C_ID, schema(C_ID, "Character", [
      {
        id: "c-on-play",
        category: "auto",
        trigger: { keyword: "ON_PLAY" },
        actions: [{ type: "MODIFY_POWER", target: { type: "SELF" }, params: { amount: 1000 }, duration: { type: "THIS_TURN" } }],
      },
    ])),
  ];
}

function f1Setup(upTo: boolean): { b: Built; attacker: CardInstance } {
  const b = base(f1Cards(upTo));
  const attacker = place(b, inst(A_ID, 0, "CHARACTER"));
  place(b, inst(C_ID, 0, "HAND"));
  place(b, inst(X_ID, 1, "CHARACTER"));
  const deckCard = (owner: 0 | 1) => inst(CARDS.VANILLA.id, owner, "DECK");
  b.state.players[1].deck.push(deckCard(1), deckCard(1));
  b.state.players[0].deck.push(deckCard(0), deckCard(0));
  return { b, attacker };
}

const F1_TYPES = ["CARD_PLAYED", "CARD_DRAWN", "POWER_MODIFIED"];
const F1_EXPECTED = [`CARD_PLAYED:p0`, `CARD_DRAWN:p1`, `POWER_MODIFIED:p0`];

function attack(b: Built, attacker: CardInstance): void {
  run(b, { type: "DECLARE_ATTACK", attackerInstanceId: attacker.instanceId, targetInstanceId: b.state.players[1].leader.instanceId }, 0);
}

function pickC(state: GameState): GameAction {
  const c = state.players[0].hand.find((x) => x.cardId === C_ID)!;
  return { type: "SELECT_TARGET", selectedInstanceIds: [c.instanceId], promptId: state.pendingPrompt?.promptId };
}

describe("F1 nested trigger order A -> X -> C (rule 8-6-1 line 858; FAQ qa_op07.md:206-210)", () => {
  // Engine: C's CARD_PLAYED and POWER_MODIFIED land before X's CARD_DRAWN (A -> C -> X).
  // Rule 8-6-1 (line 858): the non-turn player's X resolves before the turn player's C.
  it("F1a continuous: A's play of C resolves, then X, then C's On Play (ratchet OPT-966)", () => {
    const { b, attacker } = f1Setup(false);
    attack(b, attacker);
    expect(order(b.state, F1_TYPES)).toEqual(F1_EXPECTED);
    expect(b.state.eventLog.filter((event) => F1_TYPES.includes(event.type)).map((event) => `${event.type}:p${event.playerIndex}`)).toEqual(F1_EXPECTED);
  });

  it("F1b prompt inside A answered immediately (ratchet OPT-966)", () => {
    const { b, attacker } = f1Setup(true);
    attack(b, attacker);
    expect(b.state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    b.state = reply(b.state, b.cardDb, pickC(b.state));
    expect(order(b.state, F1_TYPES)).toEqual(F1_EXPECTED);
    expect(b.state.eventLog.filter((event) => F1_TYPES.includes(event.type)).map((event) => `${event.type}:p${event.playerIndex}`)).toEqual(F1_EXPECTED);
  });

  it("F1c prompt inside A answered after a reload (ratchet OPT-966)", async () => {
    const { b, attacker } = f1Setup(true);
    attack(b, attacker);
    expect(b.state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    const loaded = await reload(b);
    expect(loaded.state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    loaded.state = reply(loaded.state, loaded.cardDb, pickC(loaded.state));
    expect(order(loaded.state, F1_TYPES)).toEqual(F1_EXPECTED);
    expect(loaded.state.eventLog.filter((event) => F1_TYPES.includes(event.type)).map((event) => `${event.type}:p${event.playerIndex}`)).toEqual(F1_EXPECTED);
  });
});

// ─── F2 ──────────────────────────────────────────────────────────────────────

const FRANKY = "SYN-FRANKY"; // OP10-042 FAQ: Franky
const REBECCA = "SYN-REBECCA"; // Rebecca
const USOPP = "SYN-USOPP-LEADER"; // OP10-042 Usopp
const KILLER = "SYN-P0-KILLER"; // p0 [Activate: Main] KO of Franky

function f2Cards(upTo: boolean): CardData[] {
  return [
    synCard(FRANKY, schema(FRANKY, "Character", [
      {
        id: "franky-on-ko",
        category: "auto",
        trigger: { keyword: "ON_KO" },
        actions: [
          {
            type: "PLAY_CARD",
            target: {
              type: "CHARACTER_CARD",
              source_zone: "HAND",
              controller: "SELF",
              count: upTo ? { up_to: 1 } : { exact: 1 },
              filter: { name: REBECCA },
            },
            params: { source_zone: "HAND", cost_override: "FREE" },
          },
        ],
      },
    ])),
    synCard(REBECCA, schema(REBECCA, "Character", [
      {
        id: "rebecca-on-play",
        category: "auto",
        trigger: { keyword: "ON_PLAY" },
        actions: [{ type: "MODIFY_POWER", target: { type: "SELF" }, params: { amount: 1000 }, duration: { type: "THIS_TURN" } }],
      },
    ])),
    synCard(USOPP, schema(USOPP, "Leader", [
      {
        id: "usopp-opp-turn",
        category: "auto",
        trigger: { event: "ANY_CHARACTER_KO", filter: { controller: "SELF" }, turn_restriction: "OPPONENT_TURN" },
        actions: [{ type: "DRAW", params: { amount: 1 } }],
      },
    ]), { type: "Leader", cost: null, power: 5000, life: 5 }),
    synCard(KILLER, schema(KILLER, "Character", [
      {
        id: "killer-activate",
        category: "activate",
        trigger: { keyword: "ACTIVATE_MAIN" },
        actions: [
          { type: "KO", target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 1 }, filter: { name: FRANKY } } },
        ],
      },
    ])),
  ];
}

function f2Setup(upTo: boolean): { b: Built; killer: CardInstance } {
  const b = base(f2Cards(upTo));
  const killer = place(b, inst(KILLER, 0, "CHARACTER"));
  // Swap p1's Leader for the Usopp stand-in.
  const leader = inst(USOPP, 1, "LEADER");
  place(b, leader);
  place(b, inst(FRANKY, 1, "CHARACTER"));
  place(b, inst(REBECCA, 1, "HAND"));
  b.state.players[1].deck.push(inst(CARDS.VANILLA.id, 1, "DECK"), inst(CARDS.VANILLA.id, 1, "DECK"));
  return { b, killer };
}

const F2_TYPES = ["CARD_PLAYED", "CARD_DRAWN", "POWER_MODIFIED"];
const F2_EXPECTED = [`CARD_PLAYED:p1`, `CARD_DRAWN:p1`, `POWER_MODIFIED:p1`];

function activate(b: Built, killer: CardInstance): void {
  run(b, { type: "ACTIVATE_EFFECT", cardInstanceId: killer.instanceId, effectId: "killer-activate" }, 0);
}

/** Answer the ordering PLAYER_CHOICE on p1 by choosing the Franky entry. */
function chooseFranky(state: GameState, cardDb: Map<string, CardData>): GameState {
  expect(state.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");
  const opts = promptOptions(state).choices ?? [];
  const pick = opts.find((o) => JSON.stringify(o).includes(FRANKY) || JSON.stringify(o).includes("franky"));
  expect(pick, JSON.stringify(state.pendingPrompt?.options)).toBeDefined();
  return reply(state, cardDb, { type: "PLAYER_CHOICE", choiceId: pick!.id, promptId: state.pendingPrompt?.promptId });
}

function pickRebecca(state: GameState): GameAction {
  const r = state.players[1].hand.find((x) => x.cardId === REBECCA)!;
  return { type: "SELECT_TARGET", selectedInstanceIds: [r.instanceId], promptId: state.pendingPrompt?.promptId };
}

describe("F2 same-player A, B, then A's C: A -> B -> C (rule 8-6-1-1 line 860; FAQ qa_op10.md:279-281)", () => {
  // Engine: Rebecca's POWER_MODIFIED lands before the Leader's CARD_DRAWN (A -> C -> B).
  // Rule 8-6-1-1 (line 860): A, then B, then C.
  it.fails("F2a continuous (ratchet OPT-966)", () => {
    const { b, killer } = f2Setup(false);
    activate(b, killer);
    b.state = chooseFranky(b.state, b.cardDb);
    expect(order(b.state, F2_TYPES)).toEqual(F2_EXPECTED);
  });

  it.fails("F2b prompt inside A answered immediately (ratchet OPT-966)", () => {
    const { b, killer } = f2Setup(true);
    activate(b, killer);
    b.state = chooseFranky(b.state, b.cardDb);
    expect(b.state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    b.state = reply(b.state, b.cardDb, pickRebecca(b.state));
    expect(order(b.state, F2_TYPES)).toEqual(F2_EXPECTED);
  });

  it.fails("F2c prompt inside A answered after a reload (ratchet OPT-966)", async () => {
    const { b, killer } = f2Setup(true);
    activate(b, killer);
    b.state = chooseFranky(b.state, b.cardDb);
    expect(b.state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    const loaded = await reload(b);
    loaded.state = reply(loaded.state, loaded.cardDb, pickRebecca(loaded.state));
    expect(order(loaded.state, F2_TYPES)).toEqual(F2_EXPECTED);
  });
});
