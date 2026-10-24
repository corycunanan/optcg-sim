import { describe, expect, it } from "vitest";
import { endPhaseRig, synSchema, type EndPhaseRig } from "./opt-962-rig.js";
import {
  toPersistedGameState,
  GAME_STATE_SCHEMA_VERSION,
  LATEST_READABLE_GAME_STATE_SCHEMA_VERSION,
} from "../session/game-state-schema.js";
import { parseStoredSession } from "../session/persistence.js";
import { computeExpiry } from "../engine/effect-resolver/action-utils.js";
import { expireBattleEffects } from "../engine/duration-tracker.js";
import { continuationBoundary } from "../engine/effect-stack.js";
import { MAX_EFFECT_STACK_DEPTH } from "../engine/engine-limits.js";
import {
  completeBattleBoundary,
  parkBattleCompletion,
} from "../engine/battle-completion.js";
import type { BattleCompletionContinuation } from "../types.js";

function restore(r: EndPhaseRig, location: string) {
  if (location === "memory") return;
  const wire = JSON.parse(
    JSON.stringify({
      state: toPersistedGameState(r.state),
      undoHistory: [toPersistedGameState(r.state)],
      cardDb: Object.fromEntries(r.db),
    })
  );
  const loaded = parseStoredSession(wire);
  r.state = location === "live" ? loaded.state : loaded.undoHistory[0];
}
function reply(
  r: EndPhaseRig,
  location: string,
  action: Parameters<EndPhaseRig["act"]>[0]
) {
  restore(r, location);
  r.act(action, r.state.pendingPrompt?.respondingPlayer);
}
function protectedBattle(version: 6 | 7 | 8 = 8) {
  const r = endPhaseRig({ handSize: 1 });
  r.state = {
    ...r.state,
    schemaVersion: version,
    ...(version === 8 ? { costSemanticsVersion: 6 as const } : {}),
  };
  if (version !== 8) delete r.state.costSemanticsVersion;
  const attacker = r.put("ST08-013", 0, "CHARACTER", { power: 4000 }, 1);
  const target = r.putSyn("TARGET-1007", null, 1, "CHARACTER", { power: 1000 });
  r.state.players[1].characters[0]!.state = "RESTED";
  const payment = r.state.players[1].hand[0];
  const counter = r.put("OP02-118", 1, "HAND", {
    type: "Event",
    cost: 0,
    power: null,
    counter: null,
    effectText:
      "[Counter] You may trash 1 card from your hand: Select up to 1 of your Characters. The selected Character cannot be K.O.'d during this battle.",
  });
  r.act({
    type: "DECLARE_ATTACK",
    attackerInstanceId: attacker.instanceId,
    targetInstanceId: target.instanceId,
  });
  r.act({ type: "PASS" }, 1);
  r.act(
    {
      type: "USE_COUNTER_EVENT",
      cardInstanceId: counter.instanceId,
      counterTargetInstanceId: target.instanceId,
    },
    1
  );
  return { r, attacker, target, payment };
}

describe.each(["memory", "live", "undo"])(
  "native8 completion (%s)",
  (location) => {
    it("retains OP02-118 through prompted ST08-013, skips IF_DO, then completes exactly once", () => {
      const { r, attacker, target, payment } = protectedBattle();
      reply(r, location, { type: "PLAYER_CHOICE", choiceId: "accept" });
      reply(r, location, {
        type: "SELECT_TARGET",
        selectedInstanceIds: [payment.instanceId],
      });
      reply(r, location, {
        type: "SELECT_TARGET",
        selectedInstanceIds: [target.instanceId],
      });
      expect(r.state.prohibitions).toHaveLength(1);
      r.act({ type: "PASS" }, 1);
      expect(r.state.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
      expect(r.state.turn.battle).toBeNull();
      expect(r.state.effectStack[0].battleCompletion?.battleId).toBeTruthy();
      expect(r.state.prohibitions).toHaveLength(1);
      expect(
        r.state.eventLog.filter((e) => e.type === "END_OF_BATTLE")
      ).toHaveLength(1);
      expect(
        r.state.eventLog.filter((e) => e.type === "BATTLE_RESOLVED")
      ).toHaveLength(0);
      reply(r, location, { type: "PLAYER_CHOICE", choiceId: "accept" });
      expect(
        r.state.players[1].characters.some(
          (c) => c?.instanceId === target.instanceId
        )
      ).toBe(true);
      expect(
        r.state.players[0].characters.some(
          (c) => c?.instanceId === attacker.instanceId
        )
      ).toBe(true);
      expect(r.state.eventLog.filter((e) => e.type === "CARD_KO")).toHaveLength(
        0
      );
      expect(r.state.prohibitions).toHaveLength(0);
      expect(r.state.effectStack).toHaveLength(0);
      expect(
        r.state.eventLog.filter((e) => e.type === "BATTLE_RESOLVED")
      ).toHaveLength(1);
      restore(r, location);
      expect(toPersistedGameState(r.state).schemaVersion).toBe(8);
    });
  }
);

it.each([6, 7] as const)(
  "ordinary/native%d remains on its deployed EOB expiry behavior",
  (version) => {
    const { r, attacker, target, payment } = protectedBattle(version);
    r.act({ type: "PLAYER_CHOICE", choiceId: "accept" });
    r.act({ type: "SELECT_TARGET", selectedInstanceIds: [payment.instanceId] });
    r.act({ type: "SELECT_TARGET", selectedInstanceIds: [target.instanceId] });
    r.act({ type: "PASS" }, 1);
    expect(r.state.prohibitions).toHaveLength(0);
    expect(r.state.effectStack.some((f) => f.battleCompletion)).toBe(false);
    r.act({ type: "PLAYER_CHOICE", choiceId: "accept" });
    expect(
      r.state.players[1].characters.some(
        (c) => c?.instanceId === target.instanceId
      )
    ).toBe(false);
    expect(
      r.state.players[0].characters.some(
        (c) => c?.instanceId === attacker.instanceId
      )
    ).toBe(false);
    expect(toPersistedGameState(r.state).schemaVersion).toBe(version);
  }
);

it("activates default writer8 after the reader deployment", () => {
  expect(GAME_STATE_SCHEMA_VERSION).toBe(8);
  expect(LATEST_READABLE_GAME_STATE_SCHEMA_VERSION).toBe(8);
  expect(toPersistedGameState(endPhaseRig().state)).toMatchObject({ schemaVersion: 8, costSemanticsVersion: 6 });
});

function nativeRig(mode: 6 | 7 = 6) {
  const r = endPhaseRig({ handSize: 0 });
  r.state = { ...r.state, schemaVersion: 8, costSemanticsVersion: mode };
  return r;
}
function begin(
  r: EndPhaseRig,
  attacker = r.state.players[0].leader.instanceId,
  target = r.state.players[1].leader.instanceId
) {
  r.act({
    type: "DECLARE_ATTACK",
    attackerInstanceId: attacker,
    targetInstanceId: target,
  });
  r.act({ type: "PASS" }, 1);
  r.act({ type: "PASS" }, 1);
}

it.each([6, 7] as const)(
  "retains explicit cost provenance%d after completion and future battle",
  (mode) => {
    const r = nativeRig(mode);
    begin(r);
    expect(r.state.effectStack).toHaveLength(0);
    expect(r.state.turn.battle).toBeNull();
    expect(
      r.state.eventLog.filter((e) => e.type === "END_OF_BATTLE")
    ).toHaveLength(1);
    expect(
      r.state.eventLog.filter((e) => e.type === "BATTLE_RESOLVED")
    ).toHaveLength(1);
    restore(r, "live");
    expect(r.state.schemaVersion).toBe(8);
    expect(r.state.costSemanticsVersion).toBe(mode);
    const second = r.putSyn("SECOND-1007", null, 0, "CHARACTER");
    begin(r, second.instanceId);
    expect(
      r.state.eventLog.filter((e) => e.type === "BATTLE_RESOLVED")
    ).toHaveLength(2);
  }
);

it.each(["live", "undo"])(
  "nested EOB target and On KO optional prompt retains power/keyword expiry (%s)",
  (location) => {
    const r = nativeRig();
    const id = "EOB-NESTED-1007";
    const source = r.putSyn(
      id,
      synSchema(id, "Character", [
        {
          id: "end-child",
          category: "auto",
          trigger: { event: "END_OF_BATTLE" },
          actions: [
            {
              type: "MODIFY_POWER",
              target: { type: "SELF" },
              params: { amount: 1000 },
              duration: { type: "THIS_BATTLE" },
            },
            {
              type: "GRANT_KEYWORD",
              target: { type: "SELF" },
              params: { keyword: "BLOCKER" },
              duration: { type: "THIS_BATTLE" },
            },
            {
              type: "KO",
              target: {
                type: "CHARACTER",
                controller: "OPPONENT",
                count: { up_to: 1 },
              },
            },
          ],
        },
      ]),
      0,
      "CHARACTER",
      { power: 1000 }
    );
    const victim = r.putSyn(
      "KO-NESTED-1007",
      synSchema("KO-NESTED-1007", "Character", [
        {
          id: "ko-draw",
          category: "auto",
          trigger: { keyword: "ON_KO" },
          flags: { optional: true },
          actions: [{ type: "DRAW", params: { amount: 1 } }],
        },
      ]),
      1,
      "CHARACTER",
      { power: 10000 }
    );
    r.state.players[1].characters[0]!.state = "RESTED";
    begin(r, source.instanceId, victim.instanceId);
    expect(r.state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    const completion = r.state.effectStack[0].battleCompletion!;
    expect(
      r.state.activeEffects.filter((e) =>
        e.appliesTo.includes(source.instanceId)
      )
    ).toHaveLength(2);
    expect(computeExpiry({ type: "THIS_BATTLE" }, r.state, 0)).toEqual({
      wave: "END_OF_BATTLE",
      battleId: completion.battleId,
    });
    reply(r, location, {
      type: "SELECT_TARGET",
      selectedInstanceIds: [victim.instanceId],
    });
    expect(r.state.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
    expect(r.state.effectStack[0].battleCompletion).toEqual(completion);
    expect(
      r.state.activeEffects.filter((e) =>
        e.appliesTo.includes(source.instanceId)
      )
    ).toHaveLength(2);
    reply(r, location, { type: "PLAYER_CHOICE", choiceId: "accept" });
    expect(r.state.players[1].hand).toHaveLength(1);
    expect(
      r.state.activeEffects.filter((e) =>
        e.appliesTo.includes(source.instanceId)
      )
    ).toHaveLength(0);
    expect(r.state.effectStack).toHaveLength(0);
    const ko = r.state.eventLog.findIndex((e) => e.type === "CARD_KO");
    const draw = r.state.eventLog.findIndex((e) => e.type === "CARD_DRAWN");
    const resolved = r.state.eventLog.findIndex(
      (e) => e.type === "BATTLE_RESOLVED"
    );
    expect(ko).toBeLessThan(draw);
    expect(draw).toBeLessThan(resolved);
  }
);

it("terminal EOB child cancels uncommitted completion notifications", () => {
  const r = nativeRig();
  const id = "EOB-TERMINAL-1007";
  r.putSyn(
    id,
    synSchema(id, "Character", [
      {
        id: "win",
        category: "auto",
        trigger: { event: "END_OF_BATTLE" },
        actions: [
          { type: "DRAW", params: { amount: 1 } },
          { type: "WIN_GAME", params: {} },
        ],
      },
    ]),
    0,
    "CHARACTER"
  );
  begin(r);
  expect(r.state.status).toBe("FINISHED");
  expect(r.state.winner).toBe(0);
  expect(r.state.effectStack).toHaveLength(0);
  const types = r.state.eventLog.map((e) => e.type);
  expect(types.filter((e) => e === "END_OF_BATTLE")).toHaveLength(1);
  expect(types).not.toContain("BATTLE_RESOLVED");
  expect(types.indexOf("CARD_DRAWN")).toBeLessThan(types.indexOf("GAME_OVER"));
  expect(types.at(-1)).toBe("GAME_OVER");
});

it("aborted attack reaches EOB once, then completes without combat damage", () => {
  const r = nativeRig();
  const id = "ATTACK-ABORT-1007";
  const attacker = r.putSyn(
    id,
    synSchema(id, "Character", [
      {
        id: "leave",
        category: "auto",
        trigger: { keyword: "WHEN_ATTACKING" },
        actions: [{ type: "RETURN_TO_HAND", target: { type: "SELF" } }],
      },
    ]),
    0,
    "CHARACTER"
  );
  r.act({
    type: "DECLARE_ATTACK",
    attackerInstanceId: attacker.instanceId,
    targetInstanceId: r.state.players[1].leader.instanceId,
  });
  expect(r.state.turn.battle).toBeNull();
  expect(r.state.effectStack).toHaveLength(0);
  expect(
    r.state.eventLog.filter((e) => e.type === "BATTLE_ABORTED")
  ).toHaveLength(1);
  expect(
    r.state.eventLog.find((e) => e.type === "END_OF_BATTLE")?.payload.aborted
  ).toBe(true);
  expect(
    r.state.eventLog.filter((e) => e.type === "BATTLE_RESOLVED")
  ).toHaveLength(1);
  expect(
    r.state.eventLog.filter((e) => e.type === "DAMAGE_DEALT")
  ).toHaveLength(0);
});

it("rejects missing provenance and misplaced/duplicate completion owners atomically", () => {
  const r = nativeRig();
  const completion: BattleCompletionContinuation = {
    battleId: "test-battle",
    attackerInstanceId: r.state.players[0].leader.instanceId,
    targetInstanceId: r.state.players[1].leader.instanceId,
    turnPlayerIndex: 0,
    turnNumber: r.state.turn.number,
    aborted: false,
  };
  r.state = parkBattleCompletion(r.state, completion);
  const state = toPersistedGameState(r.state);
  const load = (value: unknown) =>
    parseStoredSession({
      state: value,
      undoHistory: [],
      cardDb: Object.fromEntries(r.db),
    });
  expect(() => load({ ...state, costSemanticsVersion: undefined })).toThrow(
    /costSemanticsVersion/
  );
  expect(() => load({ ...state, schemaVersion: 7 })).toThrow(
    /costSemanticsVersion/
  );
  expect(() =>
    load({
      ...state,
      effectStack: [
        ...state.effectStack,
        { ...state.effectStack[0], id: "duplicate" },
      ],
    })
  ).toThrow(/unique root/);
  expect(() =>
    load({ ...state, turn: { ...state.turn, number: state.turn.number + 1 } })
  ).toThrow(/identity/);
  expect(() =>
    parseStoredSession({
      state,
      undoHistory: [{ ...state, costSemanticsVersion: 9 }],
      cardDb: Object.fromEntries(r.db),
    })
  ).toThrow(/undoHistory\[0\].*costSemanticsVersion/);
  expect(state).toEqual(toPersistedGameState(r.state));
});

it("stack exhaustion cannot leave a partial completion owner or replay Damage", () => {
  const r = nativeRig();
  const boundary = continuationBoundary(
    r.state,
    r.state.players[0].leader.instanceId,
    0
  );
  r.state = {
    ...boundary.state,
    effectStack: Array.from({ length: MAX_EFFECT_STACK_DEPTH }, (_, i) => ({
      ...boundary.frame,
      id: `full-${i}`,
    })),
  };
  r.state = parkBattleCompletion(r.state, {
    battleId: "exhausted",
    attackerInstanceId: r.state.players[0].leader.instanceId,
    targetInstanceId: r.state.players[1].leader.instanceId,
    turnPlayerIndex: 0,
    turnNumber: r.state.turn.number,
    aborted: false,
  });
  expect(r.state.status).toBe("FINISHED");
  expect(r.state.effectStack).toHaveLength(0);
  expect(r.state.eventLog.at(-1)?.type).toBe("GAME_OVER");
  expect(r.state.eventLog.some((e) => e.type === "BATTLE_RESOLVED")).toBe(
    false
  );
});

it("invalidates turn-player effects before the non-turn player's exact-battle effects", () => {
  const r = nativeRig();
  const duration = { type: "THIS_BATTLE" } as const;
  r.state.activeEffects = ([0, 1] as const).map((controller) => ({
    id: `seat-${controller}`,
    sourceCardInstanceId: r.state.players[controller].leader.instanceId,
    sourceEffectBlockId: "seat",
    category: "auto",
    modifiers: [{ type: "MODIFY_POWER", params: { amount: 1000 }, duration }],
    duration,
    expiresAt: { wave: "END_OF_BATTLE", battleId: "ordered" },
    controller,
    appliesTo: [r.state.players[controller].leader.instanceId],
    timestamp: 1,
  }));
  r.state.activeEffects.push({
    ...r.state.activeEffects[0],
    id: "other-battle",
    expiresAt: { wave: "END_OF_BATTLE", battleId: "other" },
  });
  const turnPlayerExpired = expireBattleEffects(
    r.state,
    "ordered",
    "TURN_PLAYER"
  );
  expect(turnPlayerExpired.activeEffects.map((e) => e.id)).toEqual([
    "seat-1",
    "other-battle",
  ]);
  const bothExpired = expireBattleEffects(
    turnPlayerExpired,
    "ordered",
    "NON_TURN_PLAYER"
  );
  expect(bothExpired.activeEffects.map((e) => e.id)).toEqual(["other-battle"]);
});

it("a stale runtime completion boundary terminates without publishing Main", () => {
  const r = nativeRig();
  const result = completeBattleBoundary(r.state);
  expect(result.state.status).toBe("FINISHED");
  expect(result.events).toEqual([]);
  expect(result.state.eventLog.at(-1)?.type).toBe("GAME_OVER");
});

it("expires a legacy THIS_BATTLE prohibition after detaching its completion owner", () => {
  const r = nativeRig();
  const source = r.state.players[0].leader.instanceId;
  r.state.prohibitions.push({
    id: "legacy",
    sourceCardInstanceId: source,
    sourceEffectBlockId: "legacy",
    controller: 0,
    prohibitionType: "CANNOT_BE_KO",
    scope: {},
    duration: { type: "THIS_BATTLE" },
    appliesTo: [source],
    usesRemaining: null,
  });
  r.state = parkBattleCompletion(r.state, {
    battleId: "legacy-battle",
    attackerInstanceId: source,
    targetInstanceId: r.state.players[1].leader.instanceId,
    turnPlayerIndex: 0,
    turnNumber: r.state.turn.number,
    aborted: false,
  });
  const result = completeBattleBoundary(r.state);
  expect(result.state.prohibitions).toHaveLength(0);
  expect(result.state.effectStack).toHaveLength(0);
});
