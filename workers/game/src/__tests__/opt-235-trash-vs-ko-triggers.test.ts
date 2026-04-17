/**
 * OPT-235 — B5: downstream-trigger suppression for "trash instead of K.O."
 *
 * Per rule 10-2-1-3, TRASH is NOT a K.O. — different event class:
 *   - koCharacter() emits CARD_KO
 *   - trashCharacter() emits CARD_TRASHED
 *
 * When a WOULD_BE_KO replacement redirects into a TRASH_CARD substitute:
 *   1. The replaced target is removed via trash, producing CARD_TRASHED.
 *   2. ON_KO keyword watchers (e.g. Rob Lucci-style) MUST NOT fire — they key
 *      off CARD_KO which is never emitted for the replaced target.
 *   3. "When a Character is trashed" watchers (Basil Hawkins-style) MUST fire,
 *      matching CARD_TRASHED through the new ANY_CHARACTER_TRASHED /
 *      OPPONENT_CHARACTER_TRASHED custom events.
 *
 * B3 full-prevention (empty replacement_actions, e.g. Thatch-style):
 *   Neither CARD_KO nor CARD_TRASHED is emitted; no downstream watcher fires.
 */

import { describe, it, expect } from "vitest";
import { executeKO } from "../engine/effect-resolver/actions/removal.js";
import { matchTriggersForEvent, registerTriggersForCard } from "../engine/triggers.js";
import "../engine/effect-resolver/resolver.js"; // installs replacement dispatcher
import type {
  Action,
  EffectResult,
  EffectSchema,
  RuntimeActiveEffect,
} from "../engine/effect-types.js";
import type {
  CardData,
  CardInstance,
  GameEvent,
  GameState,
  PlayerState,
} from "../types.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";

// ─── Card helpers ────────────────────────────────────────────────────────────

function makeCharCard(id: string, name: string, overrides: Partial<CardData> = {}): CardData {
  return {
    id,
    name,
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
    keywords: { rush: false, rushCharacter: false, doubleAttack: false, banish: false, blocker: false, trigger: false, unblockable: false },
    effectSchema: null,
    imageUrl: null,
    ...overrides,
  };
}

function fieldInstance(cardId: string, owner: 0 | 1, suffix: string): CardInstance {
  return {
    instanceId: `char-${owner}-${suffix}`,
    cardId,
    zone: "CHARACTER",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: 1,
    controller: owner,
    owner,
  };
}

function schemaWith(blockId: string, trigger: EffectSchema["effects"][number]["trigger"]): EffectSchema {
  return {
    effects: [
      {
        id: blockId,
        category: "auto",
        trigger,
        actions: [{ type: "DRAW", params: { amount: 1 } }],
      },
    ],
  };
}

// ─── Direct trigger-matching tests ───────────────────────────────────────────

describe("OPT-235 — CARD_TRASHED trigger matching (direct)", () => {
  it("ANY_CHARACTER_TRASHED custom trigger matches CARD_TRASHED events", () => {
    const cardDb = createTestCardDb();
    const watcher = makeCharCard("ANY-TRASH-WATCHER", "AnyTrashWatcher", {
      effectSchema: schemaWith("any-trash-block", { event: "ANY_CHARACTER_TRASHED" }),
    });
    cardDb.set(watcher.id, watcher);

    const base = createBattleReadyState(cardDb);
    const watcherInst = fieldInstance(watcher.id, 0, "watcher");
    const newPlayers = [...base.players] as [PlayerState, PlayerState];
    newPlayers[0] = { ...newPlayers[0], characters: padChars([watcherInst]) };
    let state: GameState = { ...base, players: newPlayers };
    state = registerTriggersForCard(state, watcherInst, watcher);

    const event: GameEvent = {
      type: "CARD_TRASHED",
      playerIndex: 0,
      payload: { cardInstanceId: "victim", cardId: CARDS.VANILLA.id, reason: "effect" },
    };

    const matched = matchTriggersForEvent(state, event, cardDb);
    expect(matched).toHaveLength(1);
    expect(matched[0].trigger.sourceCardInstanceId).toBe(watcherInst.instanceId);
  });

  it("ON_KO keyword trigger does NOT match CARD_TRASHED events (event-class separation)", () => {
    const cardDb = createTestCardDb();
    const luccer = makeCharCard("LUCCI-WATCHER", "LucciStyle", {
      effectSchema: {
        effects: [
          {
            id: "on-ko-block",
            category: "auto",
            trigger: { keyword: "ON_KO" },
            actions: [{ type: "DRAW", params: { amount: 1 } }],
          },
        ],
      },
    });
    cardDb.set(luccer.id, luccer);

    const base = createBattleReadyState(cardDb);
    // An ON_KO keyword trigger is self-referencing — give the watcher an
    // instance AND a separate "victim" so we can emit CARD_TRASHED for a
    // different card and assert the watcher doesn't fire spuriously.
    const luccerInst = fieldInstance(luccer.id, 0, "lucci");
    const newPlayers = [...base.players] as [PlayerState, PlayerState];
    newPlayers[0] = { ...newPlayers[0], characters: padChars([luccerInst]) };
    let state: GameState = { ...base, players: newPlayers };
    state = registerTriggersForCard(state, luccerInst, luccer);

    // CARD_TRASHED for the watcher itself — still must not wake ON_KO.
    const trashEvent: GameEvent = {
      type: "CARD_TRASHED",
      playerIndex: 0,
      payload: { cardInstanceId: luccerInst.instanceId, cardId: luccer.id, reason: "effect" },
    };
    expect(matchTriggersForEvent(state, trashEvent, cardDb)).toHaveLength(0);
  });

  it("OPPONENT_CHARACTER_TRASHED with controller filter matches only opponent trashes", () => {
    const cardDb = createTestCardDb();
    const watcher = makeCharCard("OPP-TRASH-WATCHER", "OppTrashWatcher", {
      effectSchema: schemaWith("opp-trash-block", {
        event: "OPPONENT_CHARACTER_TRASHED",
        filter: { controller: "OPPONENT" },
      }),
    });
    cardDb.set(watcher.id, watcher);

    const base = createBattleReadyState(cardDb);
    const p0Watcher = fieldInstance(watcher.id, 0, "w0");
    const newPlayers = [...base.players] as [PlayerState, PlayerState];
    newPlayers[0] = { ...newPlayers[0], characters: padChars([p0Watcher]) };
    let state: GameState = { ...base, players: newPlayers };
    state = registerTriggersForCard(state, p0Watcher, watcher);

    // A p1 character trashed — event.playerIndex=1, watcher controller=0 →
    // "OPPONENT" (event ≠ source) matches.
    const oppTrash: GameEvent = {
      type: "CARD_TRASHED",
      playerIndex: 1,
      payload: { cardInstanceId: "opp-victim", cardId: CARDS.VANILLA.id, reason: "effect" },
    };
    expect(matchTriggersForEvent(state, oppTrash, cardDb)).toHaveLength(1);

    // A p0 character trashed — same controller as the watcher → filter rejects.
    const selfTrash: GameEvent = {
      type: "CARD_TRASHED",
      playerIndex: 0,
      payload: { cardInstanceId: "self-victim", cardId: CARDS.VANILLA.id, reason: "effect" },
    };
    expect(matchTriggersForEvent(state, selfTrash, cardDb)).toHaveLength(0);
  });
});

// ─── End-to-end: KO replaced by TRASH (B5 Basil-vs-Lucci) ────────────────────

describe("OPT-235 — B5 replacement: ON_KO stays silent, ANY_CHARACTER_TRASHED fires", () => {
  /**
   * Shared fixture:
   *   - p0 "victim" is targeted with KO by p1.
   *   - p0 "ivankov" hosts a WOULD_BE_KO replacement → TRASH_CARD on SELF,
   *     redirecting the removal of victim into Ivankov-trashes-itself.
   *   - p0 "watcher" holds the trigger schema under test.
   */
  function buildState(
    cardDb: Map<string, CardData>,
    watcherCard: CardData,
  ) {
    const victim = makeCharCard("VICTIM", "Victim");
    const ivankov = makeCharCard("IVANKOV-235", "Ivankov", { color: ["Green"] });
    cardDb.set(victim.id, victim);
    cardDb.set(ivankov.id, ivankov);
    cardDb.set(watcherCard.id, watcherCard);

    const base = createBattleReadyState(cardDb);
    const victimInst = fieldInstance(victim.id, 0, "victim");
    const ivankovInst = fieldInstance(ivankov.id, 0, "ivan");
    const watcherInst = fieldInstance(watcherCard.id, 0, "watcher");

    const effect: RuntimeActiveEffect = {
      id: "repl-ivan-235",
      sourceCardInstanceId: ivankovInst.instanceId,
      sourceEffectBlockId: "ivan-235",
      category: "replacement",
      modifiers: [{
        type: "REPLACEMENT_EFFECT",
        params: {
          trigger: "WOULD_BE_KO",
          cause_filter: { by: "OPPONENT_EFFECT" },
          target_filter: { card_type: "CHARACTER", exclude_self: true },
          replacement_actions: [{ type: "TRASH_CARD", target: { type: "SELF" } }],
          optional: false,
          once_per_turn: false,
        },
      }],
      duration: { type: "PERMANENT" },
      expiresAt: { wave: "SOURCE_LEAVES_ZONE" },
      controller: 0,
      appliesTo: [],
      timestamp: Date.now(),
    };

    const newPlayers = [...base.players] as [PlayerState, PlayerState];
    newPlayers[0] = {
      ...newPlayers[0],
      characters: padChars([victimInst, ivankovInst, watcherInst]),
    };
    let state: GameState = {
      ...base,
      players: newPlayers,
      activeEffects: [effect as never],
    };
    state = registerTriggersForCard(state, watcherInst, watcherCard);
    return {
      state,
      ids: {
        victim: victimInst.instanceId,
        ivankov: ivankovInst.instanceId,
        watcher: watcherInst.instanceId,
      },
    };
  }

  it("redirected KO emits CARD_TRASHED (not CARD_KO) for the replacement source", () => {
    const cardDb = createTestCardDb();
    const inertWatcher = makeCharCard("INERT", "Inert"); // no schema
    const { state, ids } = buildState(cardDb, inertWatcher);

    const action: Action = {
      type: "KO",
      target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 1 } },
    };
    const result = executeKO(state, action, "opp-source", 1, cardDb, new Map<string, EffectResult>(), [ids.victim]);

    const koEvents = result.events.filter((e) => e.type === "CARD_KO");
    const trashEvents = result.events.filter((e) => e.type === "CARD_TRASHED");

    // Victim spared (no KO for it); Ivankov trashed (not KO'd).
    for (const e of koEvents) {
      const cid = (e.payload as { cardInstanceId?: string }).cardInstanceId;
      expect(cid).not.toBe(ids.victim);
      expect(cid).not.toBe(ids.ivankov);
    }
    const trashed = trashEvents.find(
      (e) => (e.payload as { cardInstanceId?: string }).cardInstanceId === ids.ivankov,
    );
    expect(trashed).toBeDefined();

    // And Ivankov is now in the trash, victim still on field.
    expect(result.state.players[0].trash.some((c) => c.instanceId === ids.ivankov)).toBe(true);
    expect(
      result.state.players[0].characters.find((c) => c?.instanceId === ids.victim)?.zone,
    ).toBe("CHARACTER");
  });

  it("ANY_CHARACTER_TRASHED watcher matches the substitute's CARD_TRASHED event", () => {
    const cardDb = createTestCardDb();
    const basilCard = makeCharCard("BASIL-235", "BasilStyle", {
      effectSchema: schemaWith("basil-block", { event: "ANY_CHARACTER_TRASHED" }),
    });
    const { state, ids } = buildState(cardDb, basilCard);

    const action: Action = {
      type: "KO",
      target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 1 } },
    };
    const result = executeKO(state, action, "opp-source", 1, cardDb, new Map<string, EffectResult>(), [ids.victim]);

    // The redirect produced a CARD_TRASHED for Ivankov. Hand it to the matcher
    // with current state — the watcher should fire.
    const trashEvent = result.events.find(
      (e) => e.type === "CARD_TRASHED" && (e.payload as { cardInstanceId?: string }).cardInstanceId === ids.ivankov,
    );
    expect(trashEvent).toBeDefined();

    const matched = matchTriggersForEvent(result.state, trashEvent as GameEvent, cardDb);
    const watcherFired = matched.some((m) => m.trigger.sourceCardInstanceId === ids.watcher);
    expect(watcherFired).toBe(true);
  });

  it("ON_KO watcher (Lucci-style) stays silent for the trash-redirected removal", () => {
    const cardDb = createTestCardDb();
    const lucciCard = makeCharCard("LUCCI-235", "LucciStyle", {
      effectSchema: {
        effects: [
          {
            id: "lucci-block",
            category: "auto",
            trigger: { keyword: "ON_KO" },
            actions: [{ type: "DRAW", params: { amount: 1 } }],
          },
        ],
      },
    });
    const { state, ids } = buildState(cardDb, lucciCard);

    const action: Action = {
      type: "KO",
      target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 1 } },
    };
    const result = executeKO(state, action, "opp-source", 1, cardDb, new Map<string, EffectResult>(), [ids.victim]);

    // Sweep every event the KO path produced and confirm no ON_KO match.
    for (const e of result.events) {
      const matched = matchTriggersForEvent(result.state, e as GameEvent, cardDb);
      const watcherFired = matched.some((m) => m.trigger.sourceCardInstanceId === ids.watcher);
      expect(watcherFired).toBe(false);
    }

    // No CARD_KO for either the spared victim or the replacement source.
    const koEvents = result.events.filter((e) => e.type === "CARD_KO");
    for (const e of koEvents) {
      const cid = (e.payload as { cardInstanceId?: string }).cardInstanceId;
      expect(cid).not.toBe(ids.victim);
      expect(cid).not.toBe(ids.ivankov);
    }
  });
});

// ─── End-to-end: B3 full prevention (empty replacement_actions) ──────────────

describe("OPT-235 — B3 full prevention: empty replacement_actions suppresses both events", () => {
  function buildState(cardDb: Map<string, CardData>, watcherCard: CardData) {
    const victim = makeCharCard("VICTIM-B3", "VictimB3");
    const shield = makeCharCard("THATCH-B3", "ThatchShield", { color: ["Red"] });
    cardDb.set(victim.id, victim);
    cardDb.set(shield.id, shield);
    cardDb.set(watcherCard.id, watcherCard);

    const base = createBattleReadyState(cardDb);
    const victimInst = fieldInstance(victim.id, 0, "victim-b3");
    const shieldInst = fieldInstance(shield.id, 0, "shield-b3");
    const watcherInst = fieldInstance(watcherCard.id, 0, "watcher-b3");

    // Mandatory replacement (optional=false) with zero substitute actions —
    // target is preserved and no events are published.
    const effect: RuntimeActiveEffect = {
      id: "repl-thatch-b3",
      sourceCardInstanceId: shieldInst.instanceId,
      sourceEffectBlockId: "thatch-b3",
      category: "replacement",
      modifiers: [{
        type: "REPLACEMENT_EFFECT",
        params: {
          trigger: "WOULD_BE_KO",
          cause_filter: { by: "OPPONENT_EFFECT" },
          target_filter: { card_type: "CHARACTER" },
          replacement_actions: [],
          optional: false,
          once_per_turn: false,
        },
      }],
      duration: { type: "PERMANENT" },
      expiresAt: { wave: "SOURCE_LEAVES_ZONE" },
      controller: 0,
      appliesTo: [],
      timestamp: Date.now(),
    };

    const newPlayers = [...base.players] as [PlayerState, PlayerState];
    newPlayers[0] = {
      ...newPlayers[0],
      characters: padChars([victimInst, shieldInst, watcherInst]),
    };
    let state: GameState = {
      ...base,
      players: newPlayers,
      activeEffects: [effect as never],
    };
    state = registerTriggersForCard(state, watcherInst, watcherCard);
    return {
      state,
      ids: {
        victim: victimInst.instanceId,
        shield: shieldInst.instanceId,
        watcher: watcherInst.instanceId,
      },
    };
  }

  it("no CARD_KO and no CARD_TRASHED are emitted; ON_KO and ANY_CHARACTER_TRASHED both stay silent", () => {
    const cardDb = createTestCardDb();
    const composite = makeCharCard("COMPOSITE-B3", "CompositeWatcher", {
      effectSchema: {
        effects: [
          {
            id: "ko-block",
            category: "auto",
            trigger: { keyword: "ON_KO" },
            actions: [{ type: "DRAW", params: { amount: 1 } }],
          },
          {
            id: "trash-block",
            category: "auto",
            trigger: { event: "ANY_CHARACTER_TRASHED" },
            actions: [{ type: "DRAW", params: { amount: 1 } }],
          },
        ],
      },
    });
    const { state, ids } = buildState(cardDb, composite);

    const action: Action = {
      type: "KO",
      target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 1 } },
    };
    const result = executeKO(state, action, "opp-source", 1, cardDb, new Map<string, EffectResult>(), [ids.victim]);

    // Neither removal event class is published for any field character.
    const removalEvents = result.events.filter(
      (e) => e.type === "CARD_KO" || e.type === "CARD_TRASHED",
    );
    expect(removalEvents).toHaveLength(0);

    // Victim still on field; shield still on field.
    expect(
      result.state.players[0].characters.find((c) => c?.instanceId === ids.victim)?.zone,
    ).toBe("CHARACTER");
    expect(
      result.state.players[0].characters.find((c) => c?.instanceId === ids.shield)?.zone,
    ).toBe("CHARACTER");

    // No watcher fires when we replay every pipeline event through the matcher.
    for (const e of result.events) {
      const matched = matchTriggersForEvent(result.state, e as GameEvent, cardDb);
      const watcherFired = matched.some((m) => m.trigger.sourceCardInstanceId === ids.watcher);
      expect(watcherFired).toBe(false);
    }
  });
});

// ─── Basil + Thatch interaction ──────────────────────────────────────────────

describe("OPT-235 — Basil + Thatch interaction", () => {
  /**
   * Two replacements compete for the same KO:
   *   - A B3 full-prevention effect on `shield` (empty replacement_actions),
   *     applied first because it's the earliest in activeEffects.
   *   - A B5 Ivankov-style redirect that would otherwise trash itself.
   *
   * Rule 6-6-3 prescribes "first applicable replacement wins", so the B3
   * effect protects the target and the B5 never fires. Neither CARD_KO nor
   * CARD_TRASHED is produced, and an ANY_CHARACTER_TRASHED watcher stays
   * silent even though a Basil card is on the board.
   */
  it("B3 full-prevention wins over B5 redirect; no CARD_TRASHED fires the Basil watcher", () => {
    const cardDb = createTestCardDb();
    const victim = makeCharCard("VICTIM-INTER", "VictimInter");
    const shield = makeCharCard("THATCH-INTER", "ThatchInter");
    const ivankov = makeCharCard("IVAN-INTER", "IvanInter");
    const basil = makeCharCard("BASIL-INTER", "BasilInter", {
      effectSchema: schemaWith("basil-inter", { event: "ANY_CHARACTER_TRASHED" }),
    });
    for (const c of [victim, shield, ivankov, basil]) cardDb.set(c.id, c);

    const base = createBattleReadyState(cardDb);
    const victimInst = fieldInstance(victim.id, 0, "v-inter");
    const shieldInst = fieldInstance(shield.id, 0, "s-inter");
    const ivankovInst = fieldInstance(ivankov.id, 0, "i-inter");
    const basilInst = fieldInstance(basil.id, 0, "b-inter");

    const thatchEffect: RuntimeActiveEffect = {
      id: "repl-thatch-inter",
      sourceCardInstanceId: shieldInst.instanceId,
      sourceEffectBlockId: "thatch-inter",
      category: "replacement",
      modifiers: [{
        type: "REPLACEMENT_EFFECT",
        params: {
          trigger: "WOULD_BE_KO",
          cause_filter: { by: "OPPONENT_EFFECT" },
          target_filter: { card_type: "CHARACTER" },
          replacement_actions: [], // B3
          optional: false,
          once_per_turn: false,
        },
      }],
      duration: { type: "PERMANENT" },
      expiresAt: { wave: "SOURCE_LEAVES_ZONE" },
      controller: 0,
      appliesTo: [],
      timestamp: Date.now(),
    };

    const ivanEffect: RuntimeActiveEffect = {
      id: "repl-ivan-inter",
      sourceCardInstanceId: ivankovInst.instanceId,
      sourceEffectBlockId: "ivan-inter",
      category: "replacement",
      modifiers: [{
        type: "REPLACEMENT_EFFECT",
        params: {
          trigger: "WOULD_BE_KO",
          cause_filter: { by: "OPPONENT_EFFECT" },
          target_filter: { card_type: "CHARACTER", exclude_self: true },
          replacement_actions: [{ type: "TRASH_CARD", target: { type: "SELF" } }],
          optional: false,
          once_per_turn: false,
        },
      }],
      duration: { type: "PERMANENT" },
      expiresAt: { wave: "SOURCE_LEAVES_ZONE" },
      controller: 0,
      appliesTo: [],
      timestamp: Date.now(),
    };

    const newPlayers = [...base.players] as [PlayerState, PlayerState];
    newPlayers[0] = {
      ...newPlayers[0],
      characters: padChars([victimInst, shieldInst, ivankovInst, basilInst]),
    };
    let state: GameState = {
      ...base,
      players: newPlayers,
      activeEffects: [thatchEffect as never, ivanEffect as never],
    };
    state = registerTriggersForCard(state, basilInst, basil);

    const action: Action = {
      type: "KO",
      target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 1 } },
    };
    const result = executeKO(state, action, "opp-source", 1, cardDb, new Map<string, EffectResult>(), [victimInst.instanceId]);

    // Nothing left the field: victim, shield, and ivankov all still there.
    const surviving = result.state.players[0].characters
      .filter(Boolean)
      .map((c) => c!.instanceId);
    expect(surviving).toContain(victimInst.instanceId);
    expect(surviving).toContain(shieldInst.instanceId);
    expect(surviving).toContain(ivankovInst.instanceId);

    // No removal events of either class.
    const removal = result.events.filter(
      (e) => e.type === "CARD_KO" || e.type === "CARD_TRASHED",
    );
    expect(removal).toHaveLength(0);

    // Basil watcher stays silent.
    for (const e of result.events) {
      const matched = matchTriggersForEvent(result.state, e as GameEvent, cardDb);
      const basilFired = matched.some((m) => m.trigger.sourceCardInstanceId === basilInst.instanceId);
      expect(basilFired).toBe(false);
    }
  });

  it("Basil fires when only the B5 redirect is active (sanity check for the inverse)", () => {
    const cardDb = createTestCardDb();
    const victim = makeCharCard("VICTIM-INV", "VictimInv");
    const ivankov = makeCharCard("IVAN-INV", "IvanInv");
    const basil = makeCharCard("BASIL-INV", "BasilInv", {
      effectSchema: schemaWith("basil-inv", { event: "ANY_CHARACTER_TRASHED" }),
    });
    for (const c of [victim, ivankov, basil]) cardDb.set(c.id, c);

    const base = createBattleReadyState(cardDb);
    const victimInst = fieldInstance(victim.id, 0, "v-inv");
    const ivankovInst = fieldInstance(ivankov.id, 0, "i-inv");
    const basilInst = fieldInstance(basil.id, 0, "b-inv");

    const ivanEffect: RuntimeActiveEffect = {
      id: "repl-ivan-inv",
      sourceCardInstanceId: ivankovInst.instanceId,
      sourceEffectBlockId: "ivan-inv",
      category: "replacement",
      modifiers: [{
        type: "REPLACEMENT_EFFECT",
        params: {
          trigger: "WOULD_BE_KO",
          cause_filter: { by: "OPPONENT_EFFECT" },
          target_filter: { card_type: "CHARACTER", exclude_self: true },
          replacement_actions: [{ type: "TRASH_CARD", target: { type: "SELF" } }],
          optional: false,
          once_per_turn: false,
        },
      }],
      duration: { type: "PERMANENT" },
      expiresAt: { wave: "SOURCE_LEAVES_ZONE" },
      controller: 0,
      appliesTo: [],
      timestamp: Date.now(),
    };

    const newPlayers = [...base.players] as [PlayerState, PlayerState];
    newPlayers[0] = {
      ...newPlayers[0],
      characters: padChars([victimInst, ivankovInst, basilInst]),
    };
    let state: GameState = {
      ...base,
      players: newPlayers,
      activeEffects: [ivanEffect as never],
    };
    state = registerTriggersForCard(state, basilInst, basil);

    const action: Action = {
      type: "KO",
      target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 1 } },
    };
    const result = executeKO(state, action, "opp-source", 1, cardDb, new Map<string, EffectResult>(), [victimInst.instanceId]);

    // Ivankov trashed, CARD_TRASHED fired for him.
    const trashEvent = result.events.find(
      (e) => e.type === "CARD_TRASHED" && (e.payload as { cardInstanceId?: string }).cardInstanceId === ivankovInst.instanceId,
    );
    expect(trashEvent).toBeDefined();

    // Basil watcher matches the CARD_TRASHED event under the updated mapping.
    const matched = matchTriggersForEvent(result.state, trashEvent as GameEvent, cardDb);
    expect(matched.some((m) => m.trigger.sourceCardInstanceId === basilInst.instanceId)).toBe(true);
  });
});

