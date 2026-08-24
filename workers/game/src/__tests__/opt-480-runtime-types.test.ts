import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { GameEvent } from "../../../../shared/game-types.js";
import type { Action, ActionType, EffectResult } from "../engine/effect-types.js";
import { executeDealDamage } from "../engine/effect-resolver/actions/battle-actions.js";
import { executeReturnDonToDeck } from "../engine/effect-resolver/actions/don.js";
import { parseStoredSession } from "../session/persistence.js";
import { parseCardData } from "../util/validate.js";
import { CARDS, createBattleReadyState, createTestCardDb } from "./helpers.js";

const actionUnionIsExhaustive: Exclude<ActionType, Action["type"]> extends never
  ? true
  : false = true;

const validAction: Action = { type: "DRAW", params: { amount: 1 } };
const validEvent: GameEvent = {
  type: "CARD_DRAWN",
  playerIndex: 0,
  payload: { cardId: CARDS.VANILLA.id },
  timestamp: 1,
};

// These compile-time failures lock the discriminants against catch-all members.
// @ts-expect-error unknown action variants must not enter the engine core
const invalidAction: Action = { type: "UNKNOWN_ACTION", params: {} };
const invalidEvent: GameEvent = {
  // @ts-expect-error unknown event variants must not enter the engine core
  type: "UNKNOWN_EVENT",
  playerIndex: 0,
  payload: {},
  timestamp: 1,
};

void validAction;
void validEvent;
void invalidAction;
void invalidEvent;
void actionUnionIsExhaustive;

function storedFixture() {
  const cardDb = createTestCardDb();
  return {
    state: createBattleReadyState(cardDb),
    cardDb: Object.fromEntries(cardDb),
    mode: "PVP",
    testPriorityRolls: null,
    undoHistory: [],
  };
}

describe("OPT-480 runtime type boundaries", () => {
  it("accepts a valid durable snapshot after boundary parsing", () => {
    const stored = storedFixture();
    const parsed = parseStoredSession(stored);

    expect(parsed.state.id).toBe(stored.state.id);
    expect(parsed.cardDb[CARDS.LEADER.id]?.id).toBe(CARDS.LEADER.id);
    expect(parsed.pregameMode).toBe("PRIORITY_ROLL");
  });

  it("round-trips ordering prompt disabled rows and parent description", () => {
    const stored = storedFixture();
    const orderingIds = ["elder:first:0", "elder:second:0", "elder:third:0", "elder:fourth:0"];
    const triggers = orderingIds.map((orderingId, index) => ({
      sourceCardInstanceId: `elder-${index}`,
      orderingId,
      controller: 0 as const,
      effectBlock: {
        id: `elder-effect-${index}`,
        category: "auto" as const,
        actions: [],
      },
      triggeringEvent: {
        type: "CARD_PLAYED" as const,
        playerIndex: 0 as const,
        payload: {
          cardId: CARDS.VANILLA.id,
          cardInstanceId: `elder-${index}`,
          zone: "CHARACTER" as const,
          source: "EFFECT",
        },
      },
    }));
    stored.state.effectStack = [{
      id: "ordering-frame",
      sourceCardInstanceId: "elder-1",
      controller: 0,
      effectBlock: triggers[1].effectBlock,
      phase: "AWAITING_TRIGGER_ORDER_SELECTION",
      pausedAction: null,
      remainingActions: [],
      resultRefs: [],
      validTargets: [],
      costs: [],
      currentCostIndex: 0,
      costsPaid: true,
      oncePerTurnMarked: false,
      costResultRefs: [],
      pendingTriggers: [],
      simultaneousTriggers: [triggers[1], triggers[3]],
      triggerOrderingGroup: {
        triggers,
        resolvedTriggerIds: [orderingIds[0], orderingIds[2]],
      },
      accumulatedEvents: [],
    }];
    stored.state.pendingPrompt = {
      options: {
        promptType: "PLAYER_CHOICE",
        effectDescription: "Choose which effect to activate first",
        sourceEffectDescription: "Five Elders",
        confirmOrSkip: true,
        choices: [
          { id: orderingIds[0], label: "First Elder", disabled: true },
          { id: orderingIds[1], label: "Second Elder" },
          { id: orderingIds[2], label: "Third Elder", disabled: true },
          { id: orderingIds[3], label: "Fourth Elder" },
        ],
      },
      respondingPlayer: 0,
      resumeContext: "ordering-frame",
    };

    const parsed = parseStoredSession(structuredClone(stored));

    expect(parsed.state.pendingPrompt?.options).toEqual(
      stored.state.pendingPrompt.options
    );
    expect(parsed.state.effectStack[0].triggerOrderingGroup).toEqual(
      stored.state.effectStack[0].triggerOrderingGroup
    );
  });

  it.each([
    ["disabled", 1],
    ["sourceEffectDescription", 1],
  ] as const)("rejects wrong-type ordering prompt %s", (field, value) => {
    const stored = storedFixture();
    stored.state.pendingPrompt = {
      options: {
        promptType: "PLAYER_CHOICE",
        effectDescription: "Choose which effect to activate first",
        sourceEffectDescription: "Five Elders",
        choices: [{ id: "elder:first:0", label: "First Elder" }],
      },
      respondingPlayer: 0,
      resumeContext: "ordering-frame",
    };
    if (field === "disabled") {
      const options = stored.state.pendingPrompt.options;
      if (options.promptType !== "PLAYER_CHOICE") throw new Error("narrow");
      Reflect.set(options.choices[0], field, value);
    } else {
      Reflect.set(stored.state.pendingPrompt.options, field, value);
    }

    expect(() => parseStoredSession(stored)).toThrow(
      "Stored session state has an invalid core shape"
    );
  });

  it("rejects unknown persisted pregame modes", () => {
    const malformed = {
      ...storedFixture(),
      pregameMode: "FUTURE_MODE",
    };

    expect(() => parseStoredSession(malformed)).toThrow(
      "Stored session pregameMode is invalid"
    );
  });

  it.each([
    ["missing hand zone", (stored: ReturnType<typeof storedFixture>) => {
      Reflect.deleteProperty(stored.state.players[0], "hand");
    }, "players.0.hand"],
    ["incorrect deck zone", (stored: ReturnType<typeof storedFixture>) => {
      Reflect.set(stored.state.players[0], "deck", "not-an-array");
    }, "players.0.deck"],
    ["missing turn phase", (stored: ReturnType<typeof storedFixture>) => {
      Reflect.deleteProperty(stored.state.turn, "phase");
    }, "turn.phase"],
    ["incorrect turn ledger", (stored: ReturnType<typeof storedFixture>) => {
      Reflect.set(stored.state.turn, "oncePerTurnUsed", []);
    }, "turn.oncePerTurnUsed"],
  ] as const)("rejects a snapshot with %s", (_label, mutate, path) => {
    const stored = structuredClone(storedFixture());
    mutate(stored);

    expect(() => parseStoredSession(stored)).toThrow(path);
  });

  it("rejects unknown persisted action variants", () => {
    const stored = storedFixture();
    const malformed = {
      ...stored,
      state: {
        ...stored.state,
        scheduledActions: [
          {
            id: "scheduled-unknown",
            timing: "END_OF_TURN",
            action: { type: "UNKNOWN_ACTION", params: {} },
          },
        ],
      },
    };

    expect(() => parseStoredSession(malformed)).toThrow(
      "unknown scheduled action variant"
    );
  });

  it("rejects unknown persisted event variants", () => {
    const stored = storedFixture();
    const malformed = {
      ...stored,
      state: {
        ...stored.state,
        eventLog: [
          {
            type: "UNKNOWN_EVENT",
            playerIndex: 0,
            payload: {},
            timestamp: 1,
          },
        ],
      },
    };

    expect(() => parseStoredSession(malformed)).toThrow(
      "unknown event variant"
    );
  });

  it("rejects unknown actions nested in persisted runtime effects", () => {
    const stored = storedFixture();
    const malformed = {
      ...stored,
      state: {
        ...stored.state,
        activeEffects: [
          {
            modifiers: [
              {
                type: "REPLACEMENT_EFFECT",
                params: {
                  replacement_actions: [{ type: "UNKNOWN_ACTION" }],
                },
              },
            ],
          },
        ],
      },
    };

    expect(() => parseStoredSession(malformed)).toThrow(
      "invalid runtime effect variant"
    );
  });

  it("rejects malformed card data and invalid schemas at the JSON edge", () => {
    expect(() => parseCardData({ ...CARDS.VANILLA, power: "4000" })).toThrow(
      "numeric fields are invalid"
    );
    expect(() =>
      parseCardData({
        ...CARDS.VANILLA,
        effectSchema: {
          effects: [
            {
              id: "invalid-action",
              category: "auto",
              actions: [{ type: "UNKNOWN_ACTION" }],
            },
          ],
        },
      })
    ).toThrow("effectSchema is invalid");
  });

  it("keeps the sole unsafe assertion at validated snapshot deserialization", () => {
    const sources = [
      ...readTypeScriptTree(new URL("../engine/", import.meta.url), "engine"),
      ...readTypeScriptTree(new URL("../session/", import.meta.url), "session"),
      {
        path: "GameSession.ts",
        source: readFileSync(
          new URL("../GameSession.ts", import.meta.url),
          "utf8"
        ),
      },
      {
        path: "util/validate.ts",
        source: readFileSync(
          new URL("../util/validate.ts", import.meta.url),
          "utf8"
        ),
      },
    ];

    const untypedAssertions = sources.flatMap(({ path, source }) =>
      [
        ...stripTypeScriptComments(source).matchAll(
          /\bas\s+any\b|:\s*any\b|<any>|\bas\s+unknown\s+as\b/g
        ),
      ].map((match) => `${path}:${match[0]}`)
    );

    expect(untypedAssertions).toEqual([
      "session/persistence.ts:as unknown as",
    ]);
  });

  it("keeps the removed duplicate target resolver out of the public API", () => {
    const targetResolver = readFileSync(
      new URL("../engine/effect-resolver/target-resolver.ts", import.meta.url),
      "utf8"
    );
    const publicApi = readFileSync(
      new URL("../engine/effect-resolver/index.ts", import.meta.url),
      "utf8"
    );

    expect(targetResolver).not.toContain("resolveTargetInstances");
    expect(publicApi).not.toContain("resolveTargetInstances");
  });

  it("preserves zero dynamic amounts for damage and DON!! returns", () => {
    const cardDb = createTestCardDb();
    const initial = createBattleReadyState(cardDb);
    const players = [...initial.players] as typeof initial.players;
    players[1] = {
      ...players[1],
      life: [
        {
          instanceId: "zero-amount-life",
          cardId: CARDS.VANILLA.id,
          face: "DOWN",
        },
      ],
    };
    const state = { ...initial, players };
    const resultRefs = new Map<string, EffectResult>([
      ["zero", { targetInstanceIds: [], count: 0 }],
    ]);
    const amount = { type: "ACTION_RESULT" as const, ref: "zero" };

    const damage = executeDealDamage(
      state,
      { type: "DEAL_DAMAGE", params: { amount } },
      state.players[0].leader.instanceId,
      0,
      cardDb,
      resultRefs,
    );
    const returnedDon = executeReturnDonToDeck(
      state,
      { type: "RETURN_DON_TO_DECK", params: { amount } },
      state.players[0].leader.instanceId,
      0,
      cardDb,
      resultRefs,
    );

    expect(damage.state.players[1].life).toEqual(state.players[1].life);
    expect(damage.events).toEqual([]);
    expect(damage.succeeded).toBe(false);
    expect(damage.result?.count).toBe(0);
    expect(returnedDon.state.players[0].donCostArea).toEqual(
      state.players[0].donCostArea,
    );
    expect(returnedDon.state.players[0].donDeck).toEqual(
      state.players[0].donDeck,
    );
    expect(returnedDon.events).toEqual([]);
    expect(returnedDon.succeeded).toBe(false);
  });

  it("does not truthiness-default resolved action amounts", () => {
    const sources = readTypeScriptTree(
      new URL("../engine/effect-resolver/actions/", import.meta.url),
      "actions",
    );
    const offenders = sources.flatMap(({ path, source }) =>
      [
        ...stripTypeScriptComments(source).matchAll(
          /resolveAmount\([^;]*?\)\s*\|\|/g,
        ),
      ].map(() => path),
    );

    expect(offenders).toEqual([]);
  });
});

function readTypeScriptTree(
  directory: URL,
  root: string,
  prefix = ""
): Array<{
  path: string;
  source: string;
}> {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = `${prefix}${entry.name}`;
    const url = new URL(
      entry.isDirectory() ? `${entry.name}/` : entry.name,
      directory
    );
    if (entry.isDirectory()) return readTypeScriptTree(url, root, `${path}/`);
    return entry.name.endsWith(".ts")
      ? [{ path: `${root}/${path}`, source: readFileSync(url, "utf8") }]
      : [];
  });
}

function stripTypeScriptComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}
