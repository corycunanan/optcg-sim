/**
 * Shared fixture rig for the OPT-960 rule-processing tests (OPT-949, OPT-925,
 * OPT-862). A plain module, not a test file: importing a `*.test.ts` file
 * re-registers its suites in every importer.
 *
 * Every helper drives the real pipeline (`runPipeline`) for actions and the
 * real session boundary (`resumePromptLifecycle`) for prompt replies. Reload
 * goes through the real writer and reader (`SessionRepository.save` /
 * `.load` on an in-memory storage).
 */
import { expect } from "vitest";
import type { CardData, CardInstance, GameAction, GameState, LifeCard } from "../types.js";
import type { EffectSchema } from "../engine/effect-types.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { runPipeline } from "../engine/pipeline.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { SessionRepository, type SessionStorage } from "../session/persistence.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";

class MemoryStorage implements SessionStorage {
  readonly data = new Map<string, unknown>();
  async get<T>(key: string): Promise<T | undefined> {
    return this.data.get(key) as T | undefined;
  }
  async put(keyOrEntries: string | Record<string, unknown>, value?: unknown): Promise<void> {
    const entries = typeof keyOrEntries === "string" ? { [keyOrEntries]: value } : keyOrEntries;
    for (const [k, v] of Object.entries(entries)) this.data.set(k, structuredClone(v));
  }
  async setAlarm(): Promise<void> {}
  async deleteAlarm(): Promise<void> {}
}

export function synSchema(id: string, effects: EffectSchema["effects"], cardType = "Character"): EffectSchema {
  return { card_id: id, card_name: id, card_type: cardType, effects } as EffectSchema;
}

export interface Rig {
  db: Map<string, CardData>;
  state: GameState;
  /** Register a card (authored schema when one exists, else `schema`) and place an instance. */
  put(
    id: string,
    owner: 0 | 1,
    zone: CardInstance["zone"],
    opts?: { data?: Partial<CardData>; schema?: EffectSchema; state?: CardInstance["state"] },
  ): CardInstance;
  /** Replace a player's deck with `size` vanilla cards (index 0 = top). */
  deck(owner: 0 | 1, size: number): void;
  /** Replace a player's Life with `size` face-down vanilla cards. */
  life(owner: 0 | 1, size: number): void;
  /** Make `leaderId` (authored schema) the player's Leader. */
  leader(owner: 0 | 1, leaderId: string): void;
  act(action: GameAction, player?: 0 | 1): void;
  respond(action: GameAction): { rejected: boolean; before: GameState };
  accept(): void;
  decline(): void;
  select(ids: string[]): void;
  promptType(): string | undefined;
  reload(): Promise<void>;
  gameOvers(): GameState["eventLog"];
}

export function rig(): Rig {
  const db = createTestCardDb();
  let state = createBattleReadyState(db);
  state.players.forEach((p) => {
    p.characters = padChars([]);
    p.hand = [];
    p.trash = [];
  });
  state = { ...state, eventLog: [] };
  let serial = 0;

  const self: Rig = {
    db,
    get state() {
      return state;
    },
    set state(value: GameState) {
      state = value;
    },
    put(id, owner, zone, opts = {}) {
      const authored = getEffectSchema(id);
      const schema = opts.schema ?? authored ?? undefined;
      if (!db.has(id) || opts.data || schema) {
        db.set(id, {
          ...(zone === "LEADER" ? CARDS.LEADER : CARDS.VANILLA),
          id,
          name: schema?.card_name ?? id,
          effectText: "",
          ...(db.get(id) ?? {}),
          ...(opts.data ?? {}),
          ...(schema ? { effectSchema: schema } : {}),
        });
      }
      const card: CardInstance = {
        instanceId: `${id}#${owner}#${serial++}`,
        cardId: id,
        controller: owner,
        owner,
        zone,
        state: opts.state ?? "ACTIVE",
        attachedDon: [],
        turnPlayed: 0,
      };
      const p = state.players[owner];
      if (zone === "DECK") p.deck.unshift(card);
      else if (zone === "LIFE") p.life.unshift({ instanceId: card.instanceId, cardId: id, face: "DOWN" } as LifeCard);
      else if (zone === "HAND") p.hand.push(card);
      else if (zone === "TRASH") p.trash.unshift(card);
      else if (zone === "LEADER") p.leader = card;
      else p.characters[p.characters.findIndex((slot) => !slot)] = card;
      if (zone === "LEADER" || zone === "CHARACTER") {
        state = registerCardEnteredField(state, card, db.get(id)!);
      }
      return card;
    },
    deck(owner, size) {
      state.players[owner].deck = [];
      for (let i = 0; i < size; i++) self.put(CARDS.VANILLA.id, owner, "DECK");
    },
    life(owner, size) {
      state.players[owner].life = [];
      for (let i = 0; i < size; i++) self.put(CARDS.VANILLA.id, owner, "LIFE");
    },
    leader(owner, leaderId) {
      const schema = getEffectSchema(leaderId);
      expect(schema, leaderId).toBeDefined();
      db.set(leaderId, { ...CARDS.LEADER, id: leaderId, name: schema!.card_name ?? leaderId, effectSchema: schema! });
      const current = state.players[owner].leader;
      const leader: CardInstance = { ...current, cardId: leaderId };
      state.players[owner].leader = leader;
      state = registerCardEnteredField(state, leader, db.get(leaderId)!);
    },
    act(action, player = state.turn.activePlayerIndex) {
      if (state.pendingPrompt) {
        const r = resumePromptLifecycle(state, action, db, {
          drainPregame: (s) => s,
          advanceStartOfTurn: (s) => s,
        });
        expect(r.responseRejected).toBe(false);
        state = r.state;
      } else {
        const r = runPipeline(state, action, db, player);
        expect(r.valid, r.error).toBe(true);
        state = r.state;
      }
    },
    respond(action) {
      const before = state;
      const r = resumePromptLifecycle(state, action, db, {
        drainPregame: (s) => s,
        advanceStartOfTurn: (s) => s,
      });
      state = r.state;
      return { rejected: r.responseRejected, before };
    },
    accept() {
      expect(self.promptType()).toBe("OPTIONAL_EFFECT");
      self.act({ type: "PLAYER_CHOICE", choiceId: "accept" });
    },
    decline() {
      expect(self.promptType()).toBe("OPTIONAL_EFFECT");
      self.act({ type: "PLAYER_CHOICE", choiceId: "skip" });
    },
    select(ids) {
      self.act({ type: "SELECT_TARGET", selectedInstanceIds: ids });
    },
    promptType() {
      return state.pendingPrompt?.options.promptType;
    },
    async reload() {
      const repo = new SessionRepository(new MemoryStorage(), {
        nextJsUrl: "https://app.example.test",
        workerSecret: "secret",
      });
      await repo.save({
        state,
        cardDb: db,
        mode: "PVP",
        pregameMode: "PRIORITY_ROLL",
        testPriorityRolls: null,
        undoHistory: [],
      });
      const loaded = await repo.load();
      expect(loaded).not.toBeNull();
      state = loaded!.state;
    },
    gameOvers() {
      return state.eventLog.filter((e) => e.type === "GAME_OVER");
    },
  };
  return self;
}

/**
 * The terminal contract every terminal writer must satisfy (OPT-949 /
 * OPT-925): status and result written, no prompt, no stack, no event barrier,
 * no battle, no damage Trigger window, no paused damage, exactly one
 * GAME_OVER carrying the same winner and reason.
 */
export function expectTerminal(
  state: GameState,
  expected: { status?: "FINISHED" | "ABANDONED"; winner: 0 | 1 | null; reason: string | RegExp },
): void {
  expect(state.status).toBe(expected.status ?? "FINISHED");
  expect(state.winner).toBe(expected.winner);
  if (typeof expected.reason === "string") expect(state.winReason).toBe(expected.reason);
  else expect(state.winReason ?? "").toMatch(expected.reason);
  expect(state.pendingPrompt ?? null).toBeNull();
  expect(state.effectStack).toEqual([]);
  expect(state.pendingEventActivationEvents ?? null).toBeNull();
  expect(state.turn.battle ?? null).toBeNull();
  expect(state.turn.pendingTriggerFromEffect ?? null).toBeNull();
  expect(state.turn.pendingBattleDamageContinuation ?? null).toBeNull();
  const overs = state.eventLog.filter((e) => e.type === "GAME_OVER");
  expect(overs).toHaveLength(1);
  expect(overs[0].payload).toMatchObject({ winner: expected.winner, reason: state.winReason });
}
