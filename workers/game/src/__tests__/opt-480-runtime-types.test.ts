import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { GameEvent } from "../../../../shared/game-types.js";
import type { Action, ActionType } from "../engine/effect-types.js";
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

  it("keeps unsafe assertions confined to the two infrastructure boundaries", () => {
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
      "GameSession.ts:as unknown as",
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
