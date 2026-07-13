import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { Action, EffectSchema } from "../engine/effect-types.js";
import { executeEffectAction } from "../engine/effect-resolver/resolver.js";
import {
  findLowConfidenceFindings,
  parseCardTextMarkdown,
} from "../engine/schema-audit.js";
import { validateSchemaSourceParity } from "../engine/schema-source-parity.js";
import {
  getAllAuthoredSchemas,
  injectSchemasIntoCardDb,
  SchemaBootValidationError,
  validateEffectSchema,
} from "../engine/schema-registry.js";
import { advanceToPhase, setupGame } from "./factories.js";

const repoRoot = resolve(import.meta.dirname, "../../../..");

function schema(actions: unknown): unknown {
  return {
    card_id: "TEST-471",
    effects: [
      {
        id: "contract",
        category: "auto",
        trigger: { keyword: "ON_PLAY" },
        actions,
      },
    ],
  };
}

describe("OPT-471 authoritative authored-schema gate", () => {
  it("accepts the complete runtime-authored registry", () => {
    const schemas = getAllAuthoredSchemas();
    const diagnostics = Object.entries(schemas).flatMap(
      ([cardId, authored]) => {
        expect(authored.card_id, cardId).toBe(cardId);
        return validateEffectSchema(authored, cardId);
      }
    );
    expect(diagnostics).toEqual([]);
  });

  it("rejects a schema source export omitted from the runtime registry", () => {
    const unregistered = {
      card_id: "TEST-UNREGISTERED",
      effects: [],
    } satisfies EffectSchema;

    expect(
      validateSchemaSourceParity(
        [{ path: "new-set.ts", schemas: { "TEST-UNREGISTERED": unregistered } }],
        {},
      ),
    ).toContain(
      "[schema-source] new-set.ts exports TEST-UNREGISTERED, but schema-registry.ts does not register it",
    );
  });

  it.each([
    [
      "invalid target",
      schema([{ type: "KO", target: { type: "NOT_A_TARGET" } }]),
      "Unknown target type",
    ],
    [
      "missing result ref",
      schema([{ type: "KO", target_ref: "missing" }]),
      "no matching result_ref",
    ],
    [
      "leading chain",
      schema([{ type: "DRAW", params: { amount: 1 }, chain: "AND" }]),
      "First action has chain",
    ],
    [
      "unknown action",
      schema([{ type: "NOT_AN_ACTION" }]),
      "Unknown action type",
    ],
    [
      "missing handler",
      schema([{ type: "GRANT_COUNTER" }]),
      "has no resolver handler",
    ],
    ["malformed schema", { effects: "not-an-array" }, "Missing or non-array"],
  ])("rejects %s with a path-rich diagnostic", (_name, fixture, expected) => {
    const diagnostics = validateEffectSchema(fixture, "TEST-471");
    expect(
      diagnostics.some(
        (line) => line.includes("[TEST-471]") && line.includes(expected)
      )
    ).toBe(true);
  });

  it("models implicit cost result references without an allowlist exception", () => {
    const fixture = {
      card_id: "TEST-471",
      effects: [
        {
          id: "implicit-cost-ref",
          category: "activate",
          trigger: { keyword: "ACTIVATE_MAIN" },
          costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
          actions: [{ type: "PLAY_CARD", target_ref: "__cost_cards_trashed" }],
        },
      ],
    } satisfies EffectSchema;
    expect(validateEffectSchema(fixture, "TEST-471")).toEqual([]);
  });

  it("rejects a DB-only invalid schema before installing any authored schema", () => {
    const setup = setupGame();
    const cardDb = new Map(setup.cardDb);
    const [firstId, firstCard] = cardDb.entries().next().value!;
    const sentinel = { ...firstCard, effectSchema: null };
    cardDb.set(firstId, sentinel);
    cardDb.set("INVALID-DB-SCHEMA", {
      ...firstCard,
      id: "INVALID-DB-SCHEMA",
      effectSchema: {
        effects: [{ id: "bad", category: "auto", actions: [{ type: "NOPE" }] }],
      } as never,
    });

    expect(() => injectSchemasIntoCardDb(cardDb)).toThrow(
      SchemaBootValidationError
    );
    expect(cardDb.get(firstId)).toBe(sentinel);
  });

  it("terminates rather than no-oping an unknown runtime action", () => {
    const setup = setupGame();
    const state = advanceToPhase(setup.state, "MAIN", setup.cardDb);
    const result = executeEffectAction(
      state,
      { type: "RUNTIME_DRIFT" } as unknown as Action,
      state.players[0].leader.instanceId,
      0,
      setup.cardDb,
      new Map()
    );

    expect(result.state).toMatchObject({
      status: "FINISHED",
      winner: null,
      engineOutcome: {
        type: "ENGINE_ERROR_DRAW",
        diagnostic: { kind: "ENGINE_CONTRACT", contract: "ACTION_HANDLER" },
      },
    });
  });
});

describe("OPT-471 schema source and disposition gates", () => {
  it("has local card-source text for every authored schema", () => {
    const cardsDir = resolve(repoRoot, "docs/cards");
    const cardIds = new Set(
      readdirSync(cardsDir)
        .filter((file) => file.endsWith(".md"))
        .flatMap((file) =>
          parseCardTextMarkdown(
            readFileSync(resolve(cardsDir, file), "utf8")
          ).map((card) => card.id)
        )
    );
    const dispositions = readFileSync(
      resolve(repoRoot, "docs/game-engine/SCHEMA-QA-DISPOSITIONS.md"),
      "utf8"
    );
    const missing = Object.keys(getAllAuthoredSchemas()).filter(
      (cardId) => !cardIds.has(cardId) && !dispositions.includes(cardId)
    );
    expect(missing).toEqual([]);
  });

  it("requires every low-confidence finding to have a checked-in disposition", () => {
    const cardsDir = resolve(repoRoot, "docs/cards");
    const cardTexts = new Map<string, string>();
    for (const file of readdirSync(cardsDir).filter((entry) =>
      entry.endsWith(".md")
    )) {
      for (const card of parseCardTextMarkdown(
        readFileSync(resolve(cardsDir, file), "utf8")
      )) {
        cardTexts.set(card.id, card.text);
      }
    }
    const dispositions = [
      readFileSync(
        resolve(repoRoot, "docs/game-engine/DEFERRED-CARD-EFFECTS.md"),
        "utf8"
      ),
      readFileSync(
        resolve(repoRoot, "docs/game-engine/SCHEMA-QA-DISPOSITIONS.md"),
        "utf8"
      ),
    ].join("\n");
    const missing = findLowConfidenceFindings(
      cardTexts,
      getAllAuthoredSchemas()
    ).filter(({ cardId }) => !dispositions.includes(cardId));
    expect(missing).toEqual([]);
  });
});
